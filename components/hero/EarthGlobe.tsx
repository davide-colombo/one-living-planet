"use client";

/* eslint-disable react-hooks/immutability -- three.js objects (uniforms,
   rotations, materials) are mutated imperatively by design; React never
   reads them. */

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sunDirection, longitudeFromUtcOffset } from "@/lib/solar";
import { EARTH_FRAGMENT, EARTH_VERTEX } from "./earth-shaders";

/**
 * Solar convention (lon 0° = +Z, 90°E = +X) → three.js SphereGeometry
 * texture convention (lon 0° = +X, 90°E = −Z).
 */
function sunToThreeFrame([x, y, z]: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(z, y, -x);
}

/** Mesh yaw that turns the given longitude toward the camera (+Z). */
function yawForLongitude(lonDeg: number): number {
  return (-(lonDeg + 90) * Math.PI) / 180;
}

const DEG = Math.PI / 180;
const EARTH_OBLIQUITY = 23.4 * DEG;
const DRIFT_RAD_PER_S = 0.006; // full turn ≈ 17 min — barely perceptible
const TILT_LIMIT = 1.1; // rad — how far a body can be tilted by hand
const RESUME_DRIFT_AFTER_MS = 2500;
const REVEAL_LINGER_MS = 1000;

/** Scroll journey, part one: close-up on the limb → the whole planet. */
const VIEW_START = { y: -1.55, scale: 1.5 };
const VIEW_END = { y: -0.15, scale: 0.72 };

/* ------------------------------------------------------------------ */
/* the solar system — stylized layout, deliberately not to scale       */
/* ------------------------------------------------------------------ */

/** Earth's slot in the system (system units). */
const EARTH_ORBIT = 1.0;
const EARTH_SYS_R = 0.068;
const EARTH_ANGLE = 1.15;

/** Zoom-out endpoint: whole system in frame, gently tilted.
    The end scale is derived from the viewport in SystemRig. */
const SYSTEM_TILT_END = -0.5; // rad, around X
const SYSTEM_CENTER = new THREE.Vector3(0, 0.08, 0);
const SUN_R = 0.2;

/** Focused-body framing; the body size is derived from the viewport. */
const FOCUS_POINT = new THREE.Vector3(0, 0.02, 0.8);

/** Bodies fade in from a third of the way into the zoom. */
const systemReveal = (p2: number) => smooth(clamp((p2 - 0.33) / 0.55, 0, 1));

/** The full-Earth resting zone (anchor + hold): where Earth is draggable. */
const inEarthZone = (j: Journey) => j.p1 > 0.9 && j.p2 < 0.05;

interface PlanetSpec {
  name: string;
  orbit: number;
  r: number;
  color: string;
  angle: number;
  ring?: boolean;
  /** color cast multiplied over the texture */
  tint?: string;
  /** banding contrast for the procedural texture */
  banding: number;
}

const PLANETS: PlanetSpec[] = [
  {
    name: "mercury",
    orbit: 0.5,
    r: 0.032,
    color: "#a59a8f",
    angle: 5.1,
    banding: 0.1,
    tint: "#d9c2a8",
  },
  { name: "venus", orbit: 0.72, r: 0.062, color: "#d9b98a", angle: 3.9, banding: 0.14 },
  { name: "mars", orbit: 1.32, r: 0.046, color: "#c96f4a", angle: 0.4, banding: 0.12 },
  { name: "jupiter", orbit: 1.9, r: 0.13, color: "#c9a87e", angle: 2.6, banding: 0.42 },
  { name: "saturn", orbit: 2.42, r: 0.11, color: "#d8c49a", angle: 4.4, ring: true, banding: 0.3 },
  { name: "uranus", orbit: 2.88, r: 0.075, color: "#9fd3d8", angle: 1.8, banding: 0.12 },
  { name: "neptune", orbit: 3.3, r: 0.07, color: "#6f8fd8", angle: 5.8, banding: 0.18 },
];

const SUN_SPEC: PlanetSpec = {
  name: "sun",
  orbit: 0,
  r: SUN_R,
  color: "#f5c66a",
  angle: 0,
  banding: 0.12,
};

const orbitPosition = (orbit: number, angle: number) =>
  new THREE.Vector3(Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit);

const EARTH_SYS_POS = orbitPosition(EARTH_ORBIT, EARTH_ANGLE);

const EARTH_SPEC: PlanetSpec = {
  name: "earth",
  orbit: EARTH_ORBIT,
  r: EARTH_SYS_R,
  color: "#4a7fb5",
  angle: EARTH_ANGLE,
  banding: 0,
};

function specByName(name: string): PlanetSpec | undefined {
  if (name === "sun") return SUN_SPEC;
  if (name === "earth") return EARTH_SPEC;
  return PLANETS.find((p) => p.name === name);
}

/** Scroll journey progress, written by the hero's scroll handler. */
export interface Journey {
  /** limb close-up → whole Earth */
  p1: number;
  /** Earth → the whole solar system */
  p2: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shared mutable interaction state — written by DragControls, read everywhere. */
interface InteractionState {
  dragging: boolean;
  /** yaw inertia, rad/s */
  vel: number;
  /** ms timestamp of the last pointer activity */
  lastActiveMs: number;
  /** body whose axis/graticule shows (the one being handled) */
  revealFor: string | null;
  /** orbit-ring visibility target (system handling) */
  revealOrbits: boolean;
  /** pixels moved during the current/last pointer gesture */
  dragDist: number;
}

function configureTexture(t: THREE.Texture) {
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Blue Marble is a monthly series; pick the season nearest the current
 * month so the hemispheres carry the right snow and vegetation.
 */
export function seasonKey(date: Date): "mar" | "jun" | "sep" | "dec" {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return "mar";
  if (m >= 5 && m <= 7) return "jun";
  if (m >= 8 && m <= 10) return "sep";
  return "dec";
}

/** Loads each level in order; the sharpest arrives last. */
function useProgressiveTexture(urls: readonly string[]): THREE.Texture {
  const first = useLoader(THREE.TextureLoader, urls[0]);
  const [texture, setTexture] = useState(() => configureTexture(first));
  useEffect(() => {
    let alive = true;
    (async () => {
      const loader = new THREE.TextureLoader();
      for (const url of urls.slice(1)) {
        const t = await loader.loadAsync(url).catch(() => null);
        if (!alive) return;
        if (t) setTexture(configureTexture(t));
      }
    })();
    return () => {
      alive = false;
    };
  }, [urls]);
  return texture;
}

/**
 * Real surface texture (Solar System Scope, CC BY 4.0), loaded lazily;
 * the procedural bands below fill in while it arrives.
 */
function useBodyTexture(spec: PlanetSpec): THREE.Texture {
  const fallback = useMemo(() => makeBandTexture(spec), [spec]);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(`/textures/planets/${spec.name}-2k.webp`, (t) => {
      if (alive) setTexture(configureTexture(t));
    });
    return () => {
      alive = false;
    };
  }, [spec]);
  return texture ?? fallback;
}

/** Seeded procedural band texture so planet rotation is visible. */
function makeBandTexture(spec: PlanetSpec): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  let seed = 0;
  for (const ch of spec.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);

  // low-frequency random walk over latitude → band brightness
  const rows = new Float32Array(h);
  let v = 0;
  for (let y = 0; y < h; y++) {
    v = clamp(v + (rand() - 0.5) * 0.35, -1, 1);
    rows[y] = v;
  }
  // smooth the walk a little
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < h - 1; y++) rows[y] = (rows[y - 1] + rows[y] * 2 + rows[y + 1]) / 4;
  }

  const base = new THREE.Color(spec.color);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const band = 1 + rows[y] * spec.banding;
    for (let x = 0; x < w; x++) {
      const speckle = 1 + (rand() - 0.5) * spec.banding * 0.35;
      const i = (y * w + x) * 4;
      img.data[i] = clamp(base.r * band * speckle, 0, 1) * 255;
      img.data[i + 1] = clamp(base.g * band * speckle, 0, 1) * 255;
      img.data[i + 2] = clamp(base.b * band * speckle, 0, 1) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Earth                                                               */
/* ------------------------------------------------------------------ */

interface EarthSurfaceProps {
  rimColor: [number, number, number];
  drift: boolean;
  /** epoch ms for the sun position (dev time-travel passes a shifted clock) */
  atMs: number;
  spinRef: RefObject<THREE.Group | null>;
  interaction: RefObject<InteractionState>;
  focusedRef: RefObject<string | null>;
  onEarthClick?: () => void;
}

const tmpQuat = new THREE.Quaternion();

function EarthSurface({
  rimColor,
  drift,
  atMs,
  spinRef,
  interaction,
  focusedRef,
  onEarthClick,
}: EarthSurfaceProps) {
  const { gl } = useThree();
  const [dayUrls, nightUrls] = useMemo(() => {
    const season = seasonKey(new Date(atMs));
    // 8k day / 4k night only where the GPU and the screen can use them
    const big =
      gl.capabilities.maxTextureSize >= 8192 && window.innerWidth * window.devicePixelRatio >= 2000;
    return [
      [
        `/textures/earth-day-${season}-1k.webp`,
        `/textures/earth-day-${season}-4k.webp`,
        ...(big ? [`/textures/earth-day-${season}-8k.webp`] : []),
      ],
      [
        "/textures/earth-night-1k.webp",
        "/textures/earth-night-2k.webp",
        ...(big ? ["/textures/earth-night-4k.webp"] : []),
      ],
    ];
  }, [atMs, gl]);
  const dayMap = useProgressiveTexture(dayUrls);
  const nightMap = useProgressiveTexture(nightUrls);

  // Sun direction in the earth-fixed frame — real, from the solar engine.
  const sunEarthFixed = useMemo(() => sunToThreeFrame(sunDirection(new Date(atMs))), [atMs]);

  const surfaceMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: {
          dayMap: { value: null },
          nightMap: { value: null },
          sunDir: { value: new THREE.Vector3(1, 0, 0) },
          rimColor: { value: new THREE.Color() },
          uOpacity: { value: 1 },
        },
        transparent: true,
      }),
    [],
  );

  useEffect(() => {
    surfaceMaterial.uniforms.dayMap.value = dayMap;
    surfaceMaterial.uniforms.nightMap.value = nightMap;
  }, [surfaceMaterial, dayMap, nightMap]);

  useEffect(() => {
    surfaceMaterial.uniforms.rimColor.value.setRGB(...rimColor);
  }, [surfaceMaterial, rimColor]);

  useFrame((_, delta) => {
    const group = spinRef.current;
    if (!group) return;
    const it = interaction.current;
    const settled =
      !it.dragging &&
      Math.abs(it.vel) < 0.01 &&
      performance.now() - it.lastActiveMs > RESUME_DRIFT_AFTER_MS;
    if (drift && settled) group.rotation.y += delta * DRIFT_RAD_PER_S;
    // Keep lighting glued to geography through every parent transform.
    const sunWorld = surfaceMaterial.uniforms.sunDir.value as THREE.Vector3;
    group.getWorldQuaternion(tmpQuat);
    sunWorld.copy(sunEarthFixed).applyQuaternion(tmpQuat).normalize();
    // While another body is focused, Earth steps out of the picture.
    const f = focusedRef.current;
    const target = f !== null && f !== "earth" ? 0 : 1;
    const u = surfaceMaterial.uniforms.uOpacity;
    u.value += (target - u.value) * (1 - Math.exp(-6 * delta));
  });

  return (
    <mesh
      material={surfaceMaterial}
      onClick={() => {
        if (interaction.current.dragDist < 6) onEarthClick?.();
      }}
    >
      <sphereGeometry args={[1, 96, 96]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* graticule + axis — revealed while the visitor handles the planet   */
/* ------------------------------------------------------------------ */

function circlePoints(lat: number, radius: number, segments = 128): number[] {
  const pts: number[] = [];
  const r = Math.cos(lat * DEG) * radius;
  const y = Math.sin(lat * DEG) * radius;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    pts.push(r * Math.cos(a), y, r * Math.sin(a), r * Math.cos(b), y, r * Math.sin(b));
  }
  return pts;
}

function meridianPoints(lonDeg: number, radius: number, segments = 96): number[] {
  const pts: number[] = [];
  const lon = lonDeg * DEG;
  for (let i = 0; i < segments; i++) {
    const a = -85 * DEG + (i / segments) * 170 * DEG;
    const b = -85 * DEG + ((i + 1) / segments) * 170 * DEG;
    pts.push(
      Math.cos(a) * Math.sin(lon) * radius,
      Math.sin(a) * radius,
      Math.cos(a) * Math.cos(lon) * radius,
      Math.cos(b) * Math.sin(lon) * radius,
      Math.sin(b) * radius,
      Math.cos(b) * Math.cos(lon) * radius,
    );
  }
  return pts;
}

function toLineGeometry(pts: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  return g;
}

/** Fades a material's opacity toward a frame-computed target. */
function useOpacityDriver(ref: RefObject<THREE.Material | null>, target: () => number, rate = 6) {
  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    const k = 1 - Math.exp(-rate * delta);
    m.opacity += (target() - m.opacity) * k;
    m.visible = m.opacity > 0.004;
  });
}

function Graticule({ interaction }: { interaction: RefObject<InteractionState> }) {
  const R = 1.004;
  const gridGeom = useMemo(() => {
    const pts: number[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      if (lat !== 0) pts.push(...circlePoints(lat, R));
    }
    for (let lon = 15; lon < 360; lon += 15) pts.push(...meridianPoints(lon, R));
    return toLineGeometry(pts);
  }, []);
  // equator and the Greenwich meridian, drawn apart and in red
  const equatorGeom = useMemo(
    () => toLineGeometry([...circlePoints(0, R, 192), ...meridianPoints(0, R, 128)]),
    [],
  );
  const gridMat = useRef<THREE.LineBasicMaterial>(null);
  const equatorMat = useRef<THREE.LineBasicMaterial>(null);
  useOpacityDriver(gridMat, () => (interaction.current.revealFor === "earth" ? 0.22 : 0));
  useOpacityDriver(equatorMat, () => (interaction.current.revealFor === "earth" ? 0.85 : 0));

  return (
    <group>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial
          ref={gridMat}
          color="#a9c2e8"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={equatorGeom}>
        <lineBasicMaterial
          ref={equatorMat}
          color="#ff6b5e"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
      <BodyAxis interaction={interaction} name="earth" />
      <GraticuleLabels interaction={interaction} />
    </group>
  );
}

/**
 * The rotation axis of a body, revealed while it is being handled:
 * a line through the poles, a red arrow for north (as on a compass)
 * and a small filled sphere for south.
 */
function BodyAxis({
  interaction,
  name,
}: {
  interaction: RefObject<InteractionState>;
  name: string;
}) {
  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  const northMat = useRef<THREE.MeshBasicMaterial>(null);
  const southMat = useRef<THREE.MeshBasicMaterial>(null);
  const geom = useMemo(() => toLineGeometry([0, -1.45, 0, 0, 1.45, 0]), []);
  const active = () => (interaction.current.revealFor === name ? 1 : 0);
  useOpacityDriver(lineMat, () => 0.7 * active());
  useOpacityDriver(northMat, active);
  useOpacityDriver(southMat, active);
  return (
    <group>
      <lineSegments geometry={geom}>
        <lineBasicMaterial
          ref={lineMat}
          color="#e8f0ff"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
      <mesh position={[0, 1.5, 0]}>
        <coneGeometry args={[0.055, 0.16, 16]} />
        <meshBasicMaterial ref={northMat} color="#ff5a4e" transparent opacity={0} />
      </mesh>
      <mesh position={[0, -1.47, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial ref={southMat} color="#e8f0ff" transparent opacity={0} />
      </mesh>
    </group>
  );
}

/** Small degree labels along the equator and the Greenwich meridian. */
function GraticuleLabels({ interaction }: { interaction: RefObject<InteractionState> }) {
  const materials = useRef<THREE.SpriteMaterial[]>([]);
  const labels = useMemo(() => {
    const out: Array<{ text: string; position: THREE.Vector3 }> = [];
    const R = 1.06;
    const place = (lat: number, lon: number, text: string) => {
      const la = lat * DEG;
      const lo = lon * DEG;
      out.push({
        text,
        position: new THREE.Vector3(
          Math.cos(la) * Math.sin(lo) * R,
          Math.sin(la) * R,
          Math.cos(la) * Math.cos(lo) * R,
        ),
      });
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat !== 0) place(lat, 4, `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`);
    }
    for (let lon = 30; lon < 360; lon += 30) {
      const east = lon <= 180;
      place(3, lon, `${east ? lon : 360 - lon}°${east ? "E" : "W"}`);
    }
    place(3, 4, "0°");
    return out;
  }, []);

  const textures = useMemo(
    () =>
      labels.map(({ text }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 80;
        const ctx = canvas.getContext("2d")!;
        ctx.font = "600 44px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, 80, 40);
        return new THREE.CanvasTexture(canvas);
      }),
    [labels],
  );

  useFrame((_, delta) => {
    const target = interaction.current.revealFor === "earth" ? 0.9 : 0;
    const k = 1 - Math.exp(-6 * delta);
    for (const m of materials.current) {
      m.opacity += (target - m.opacity) * k;
      m.visible = m.opacity > 0.004;
    }
  });

  return (
    <group>
      {labels.map(({ text, position }, i) => (
        <sprite key={text + i} position={position} scale={[0.11, 0.055, 1]}>
          <spriteMaterial
            ref={(m) => {
              if (m) materials.current[i] = m;
            }}
            map={textures[i]}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/** The Moon, on a slow stylized orbit in the ecliptic plane. */
function Moon({ focusedRef }: { focusedRef: RefObject<string | null> }) {
  const orbitRef = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load("/textures/planets/moon-2k.webp", (t) => {
      if (alive) setTexture(configureTexture(t));
    });
    return () => {
      alive = false;
    };
  }, []);
  useOpacityDriver(mat, () => {
    const f = focusedRef.current;
    return f !== null && f !== "earth" ? 0 : 1;
  });
  useFrame((_, delta) => {
    if (orbitRef.current) orbitRef.current.rotation.y += delta * 0.04;
  });
  return (
    <group ref={orbitRef} rotation={[0, 2.4, 0]}>
      <mesh position={[4.6, 0, 0]}>
        <sphereGeometry args={[0.27, 32, 32]} />
        <meshStandardMaterial
          ref={mat}
          map={texture ?? undefined}
          emissiveMap={texture ?? undefined}
          emissive="#ffffff"
          emissiveIntensity={0.1}
          roughness={1}
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}

/** Any leftover hand-spin on the system unwinds outside its view, so
    the Earth zone always faces the way the solar clock expects. */
function SystemSpinReset({
  journey,
  systemSpin,
  interaction,
}: {
  journey: RefObject<Journey>;
  systemSpin: RefObject<THREE.Group | null>;
  interaction: RefObject<InteractionState>;
}) {
  useFrame((_, delta) => {
    const g = systemSpin.current;
    if (!g || interaction.current.dragging) return;
    if (journey.current.p2 < 0.5) {
      const k = Math.exp(-1.5 * delta);
      g.rotation.y *= k;
      g.rotation.x *= k;
    }
  });
  return null;
}

/** Earth shares the perspective compensation through its tilt wrapper. */
function EarthSlotCompensation({
  tiltRef,
  journey,
  focusedRef,
}: {
  tiltRef: RefObject<THREE.Group | null>;
  journey: RefObject<Journey>;
  focusedRef: RefObject<string | null>;
}) {
  usePerspectiveCompensation(tiltRef, journey, focusedRef);
  return null;
}

/* ------------------------------------------------------------------ */
/* drag: spin (yaw) + tilt (pitch), with inertia                       */
/* Target resolution: focused body → that body; deep in the system     */
/* view → the whole system; otherwise → Earth.                         */
/* ------------------------------------------------------------------ */

interface DragTargets {
  earthSpin: RefObject<THREE.Group | null>;
  systemSpin: RefObject<THREE.Group | null>;
  bodySpins: RefObject<Map<string, THREE.Group>>;
}

interface DragControlsProps {
  targets: DragTargets;
  journey: RefObject<Journey>;
  focusedRef: RefObject<string | null>;
  interaction: RefObject<InteractionState>;
  onInteractionChange?: (active: boolean) => void;
  /** a click (not a drag) while a body is focused: the exit gesture */
  onTapWhileFocused?: () => void;
}

function DragControls({
  targets,
  journey,
  focusedRef,
  interaction,
  onInteractionChange,
  onTapWhileFocused,
}: DragControlsProps) {
  const { gl } = useThree();
  // which group the current inertia applies to
  const activeGroup = useRef<THREE.Group | null>(null);
  const activeIsSystem = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    // vertical swipes keep scrolling the page on touch; horizontal drags spin
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";

    let lastX = 0;
    let lastY = 0;
    let samples: Array<{ t: number; x: number }> = [];
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    const resolveTarget = (): { group: THREE.Group | null; isSystem: boolean } | null => {
      const focused = focusedRef.current;
      if (focused) {
        const group =
          focused === "earth"
            ? targets.earthSpin.current
            : (targets.bodySpins.current.get(focused) ?? null);
        return { group, isSystem: false };
      }
      if (journey.current.p2 > 0.6) {
        return { group: targets.systemSpin.current, isSystem: true };
      }
      // Earth is draggable only in its resting zone — from the limb
      // view (or mid-transition) a click travels there instead.
      if (inEarthZone(journey.current)) {
        return { group: targets.earthSpin.current, isSystem: false };
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      interaction.current.dragDist = 0;
      const resolved = resolveTarget();
      if (!resolved) return; // outside interactive zones: clicks may travel, drags do nothing
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; dragging works without it */
      }
      const { group, isSystem } = resolved;
      activeGroup.current = group;
      activeIsSystem.current = isSystem;
      const it = interaction.current;
      it.dragging = true;
      it.vel = 0;
      it.dragDist = 0;
      it.revealFor = isSystem ? null : (focusedRef.current ?? "earth");
      it.revealOrbits = isSystem;
      it.lastActiveMs = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      samples = [{ t: performance.now(), x: e.clientX }];
      el.style.cursor = "grabbing";
      clearTimeout(endTimer);
      clearTimeout(revealTimer);
      onInteractionChange?.(true);
    };

    const onMove = (e: PointerEvent) => {
      const it = interaction.current;
      if (!it.dragging) return;
      const group = activeGroup.current;
      if (!group) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      it.dragDist += Math.abs(dx) + Math.abs(dy);
      group.rotation.y += dx * 0.005;
      const tiltMax = activeIsSystem.current ? 0.35 : TILT_LIMIT;
      group.rotation.x = clamp(group.rotation.x + dy * 0.004, -tiltMax, tiltMax);
      it.lastActiveMs = now;
      lastX = e.clientX;
      lastY = e.clientY;
      samples.push({ t: now, x: e.clientX });
      if (samples.length > 24) samples.shift();
    };

    const onUp = () => {
      const it = interaction.current;
      if (!it.dragging) return;
      it.dragging = false;
      // In the planet view a plain click, wherever it lands, is the
      // way out. (The raycast-based pointer-missed event never fires
      // there because the planet fills most of the screen.)
      if (focusedRef.current !== null && it.dragDist < 6) onTapWhileFocused?.();
      // Inertia only for a genuine throw: velocity measured over the
      // final ~100ms of the gesture. A pointer held steady (or barely
      // creeping) at release gives exactly zero spin.
      const now = performance.now();
      const recent = samples.filter((s) => s.t >= now - 100);
      const last = recent[recent.length - 1];
      it.vel = 0;
      if (last && recent.length >= 2 && now - last.t < 90) {
        const first = recent[0];
        const dtS = Math.max(0.016, (last.t - first.t) / 1000);
        const v = ((last.x - first.x) * 0.005) / dtS; // rad/s
        if (Math.abs(v) > 0.5) it.vel = clamp(v, -5, 5);
      }
      it.lastActiveMs = performance.now();
      el.style.cursor = "grab";
      clearTimeout(endTimer);
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        interaction.current.revealFor = null;
        interaction.current.revealOrbits = false;
      }, REVEAL_LINGER_MS);
      endTimer = setTimeout(() => onInteractionChange?.(false), RESUME_DRIFT_AFTER_MS);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clearTimeout(endTimer);
      clearTimeout(revealTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, targets, journey, focusedRef, interaction, onInteractionChange, onTapWhileFocused]);

  // cursor: grab in interactive zones, plain elsewhere (bodies set
  // their own pointer cursor on hover)
  useFrame(() => {
    const it = interaction.current;
    if (it.dragging) return;
    const deepView = focusedRef.current !== null || journey.current.p2 > 0.6;
    const interactive = deepView || inEarthZone(journey.current);
    const want = interactive ? "grab" : "";
    if (gl.domElement.style.cursor !== "pointer" && gl.domElement.style.cursor !== want) {
      gl.domElement.style.cursor = want;
    }
    // in the deep views every touch drives rotation, never page scroll
    const ta = deepView ? "none" : "pan-y";
    if (gl.domElement.style.touchAction !== ta) gl.domElement.style.touchAction = ta;
  });

  // yaw inertia after release; the system's pitch eases back level
  useFrame((_, delta) => {
    const it = interaction.current;
    const group = activeGroup.current;
    if (!group) return;
    if (!it.dragging && Math.abs(it.vel) > 0.001) {
      group.rotation.y += it.vel * delta;
      it.vel *= Math.exp(-2.2 * delta);
    }
    if (!it.dragging && activeIsSystem.current) {
      group.rotation.x *= Math.exp(-1.5 * delta);
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* glows                                                               */
/* ------------------------------------------------------------------ */

function makeGlowTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const SUN_GLOW_STOPS: Array<[number, string]> = [
  [0, "rgba(255, 252, 244, 1)"],
  [0.06, "rgba(255, 246, 228, 0.9)"],
  [0.18, "rgba(255, 228, 196, 0.35)"],
  [0.42, "rgba(255, 214, 178, 0.1)"],
  [1, "rgba(255, 205, 170, 0)"],
];

/** Earth-local sunrise glow; fades away as the system zoom begins. */
function EarthriseGlow({
  journey,
  focusedRef,
}: {
  journey: RefObject<Journey>;
  focusedRef: RefObject<string | null>;
}) {
  const texture = useMemo(() => makeGlowTexture(SUN_GLOW_STOPS), []);
  const mat = useRef<THREE.SpriteMaterial>(null);
  useOpacityDriver(mat, () =>
    focusedRef.current !== null ? 0 : 0.75 * (1 - smooth(clamp(journey.current.p2 * 2.5, 0, 1))),
  );
  return (
    <sprite position={[0, 0.9, -2.4]} scale={[3.0, 3.0, 1]}>
      <spriteMaterial
        ref={mat}
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.75}
      />
    </sprite>
  );
}

/* ------------------------------------------------------------------ */
/* solar system bodies                                                 */
/* ------------------------------------------------------------------ */

interface BodyCommonProps {
  journey: RefObject<Journey>;
  interaction: RefObject<InteractionState>;
  focusedRef: RefObject<string | null>;
  registerSpin: (name: string, group: THREE.Group | null) => void;
  onBodyClick: (name: string) => void;
}

const CAMERA_POS = new THREE.Vector3(0, 0.35, 3.1);
const REF_DIST = CAMERA_POS.distanceTo(SYSTEM_CENTER);
const tmpWorld = new THREE.Vector3();

/**
 * In the system view the layout is deep compared to the camera, so a
 * near planet would loom over a far one and lie about their sizes.
 * Counter-scaling by camera distance keeps apparent sizes truthful.
 */
function usePerspectiveCompensation(
  groupRef: RefObject<THREE.Group | null>,
  journey: RefObject<Journey>,
  focusedRef: RefObject<string | null>,
  base = 1,
) {
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const p2 = smooth(clamp(journey.current.p2, 0, 1));
    let factor = 1;
    if (p2 > 0.01 && focusedRef.current === null) {
      g.getWorldPosition(tmpWorld);
      factor = lerp(1, CAMERA_POS.distanceTo(tmpWorld) / REF_DIST, p2);
    }
    g.scale.setScalar(base * factor);
  });
}

/** Visibility of a body: hidden while any other body holds the focus. */
function bodyReveal(journey: Journey, focused: string | null, name: string): number {
  if (focused !== null && focused !== name) return 0;
  return systemReveal(journey.p2);
}

function SunCore({ journey, interaction, focusedRef, registerSpin, onBodyClick }: BodyCommonProps) {
  const glowTexture = useMemo(() => makeGlowTexture(SUN_GLOW_STOPS), []);
  const surface = useBodyTexture(SUN_SPEC);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const reveal = () => bodyReveal(journey.current, focusedRef.current, "sun");
  useOpacityDriver(glowMat, () => 0.5 * reveal());
  useOpacityDriver(coreMat, reveal);
  return (
    <group>
      <group ref={(g) => registerSpin("sun", g)}>
        <mesh
          onClick={() => {
            if (interaction.current.dragDist < 6) onBodyClick("sun");
          }}
        >
          <sphereGeometry args={[SUN_R, 48, 48]} />
          <meshBasicMaterial ref={coreMat} map={surface} color="#ffe9b8" transparent opacity={0} />
        </mesh>
        <group scale={SUN_R}>
          <BodyAxis interaction={interaction} name="sun" />
        </group>
      </group>
      <sprite scale={[SUN_R * 4.5, SUN_R * 4.5, 1]}>
        <spriteMaterial
          ref={glowMat}
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
    </group>
  );
}

/** Saturn's rings: the texture is a radial strip, so the ring
    geometry gets UVs that run inner edge → outer edge. */
function SaturnRing({
  spec,
  journey,
  focusedRef,
}: {
  spec: PlanetSpec;
  journey: RefObject<Journey>;
  focusedRef: RefObject<string | null>;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const inner = spec.r * 1.24;
  const outer = spec.r * 2.27;
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(inner, outer, 128);
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [inner, outer]);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load("/textures/planets/saturn-ring.webp", (t) => {
      if (alive) setTexture(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  useOpacityDriver(mat, () => 0.9 * bodyReveal(journey.current, focusedRef.current, spec.name));
  return (
    <mesh geometry={geometry} rotation={[1.25, 0, 0.3]}>
      <meshBasicMaterial
        key={texture ? "textured" : "flat"}
        ref={mat}
        map={texture ?? undefined}
        color={texture ? "#ffffff" : "#d8c9a3"}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function Planet({
  spec,
  journey,
  interaction,
  focusedRef,
  registerSpin,
  onBodyClick,
}: BodyCommonProps & { spec: PlanetSpec }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const spinRef = useRef<THREE.Group>(null);
  const surface = useBodyTexture(spec);
  useOpacityDriver(mat, () => bodyReveal(journey.current, focusedRef.current, spec.name));
  usePerspectiveCompensation(spinRef, journey, focusedRef);
  const pos = useMemo(() => orbitPosition(spec.orbit, spec.angle), [spec]);
  return (
    <group position={pos}>
      <group
        ref={(g) => {
          spinRef.current = g;
          registerSpin(spec.name, g);
        }}
      >
        {/* generous invisible hit target: small planets stay clickable */}
        <mesh
          onClick={() => {
            if (interaction.current.dragDist < 6) onBodyClick(spec.name);
          }}
          onPointerOver={(e) => {
            const el = e.nativeEvent.target as HTMLElement | null;
            if (el && !interaction.current.dragging && journey.current.p2 > 0.33) {
              el.style.cursor = "pointer";
            }
          }}
          onPointerOut={(e) => {
            const el = e.nativeEvent.target as HTMLElement | null;
            if (el && el.style.cursor === "pointer") el.style.cursor = "grab";
          }}
        >
          <sphereGeometry args={[Math.max(spec.r * 2.2, 0.14), 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[spec.r, 48, 48]} />
          <meshStandardMaterial
            ref={mat}
            map={surface}
            emissiveMap={surface}
            emissive={spec.tint ?? "#ffffff"}
            emissiveIntensity={0.35}
            color={spec.tint ?? "#ffffff"}
            roughness={0.9}
            transparent
            opacity={0}
          />
        </mesh>
        <group scale={spec.r}>
          <BodyAxis interaction={interaction} name={spec.name} />
        </group>
        {spec.ring ? <SaturnRing spec={spec} journey={journey} focusedRef={focusedRef} /> : null}
      </group>
    </group>
  );
}

function orbitRingPoints(radius: number, segments = 160): number[] {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    pts.push(
      Math.cos(a) * radius,
      0,
      Math.sin(a) * radius,
      Math.cos(b) * radius,
      0,
      Math.sin(b) * radius,
    );
  }
  return pts;
}

/** Orbit rings appear only while the visitor is handling the system. */
function OrbitRings({
  journey,
  interaction,
  focusedRef,
}: {
  journey: RefObject<Journey>;
  interaction: RefObject<InteractionState>;
  focusedRef: RefObject<string | null>;
}) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    for (const orbit of [...PLANETS.map((p) => p.orbit), EARTH_ORBIT]) {
      pts.push(...orbitRingPoints(orbit));
    }
    return toLineGeometry(pts);
  }, []);
  const mat = useRef<THREE.LineBasicMaterial>(null);
  useOpacityDriver(mat, () =>
    interaction.current.revealOrbits && focusedRef.current === null
      ? 0.3 * systemReveal(journey.current.p2)
      : 0,
  );
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial ref={mat} color="#9db4d8" transparent opacity={0} depthWrite={false} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* the rig: one transform carries the whole journey + focus            */
/* ------------------------------------------------------------------ */

const tmpBodyWorld = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpTiltQuat = new THREE.Quaternion();
const tmpSpinQuat = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);

function SystemRig({
  journey,
  focusedRef,
  systemSpin,
  children,
}: {
  journey: RefObject<Journey>;
  focusedRef: RefObject<string | null>;
  systemSpin: RefObject<THREE.Group | null>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const { size } = useThree();

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const p1 = smooth(clamp(journey.current.p1, 0, 1));
    const p2 = smooth(clamp(journey.current.p2, 0, 1));
    const focused = focusedRef.current;
    const focusSpec = focused ? specByName(focused) : undefined;
    const aspect = size.width / Math.max(1, size.height);

    let scaleTarget: number;
    let tilt: number;

    if (focusSpec) {
      // the body fills most of the viewport's smaller dimension
      const halfH = 0.88; // world units at the focus plane
      const focusR = 0.62 * Math.min(halfH, halfH * aspect);
      scaleTarget = focusR / focusSpec.r;
      tilt = SYSTEM_TILT_END;
      tmpTiltQuat.setFromAxisAngle(X_AXIS, tilt);
      // body position in system space, spun by the system's own yaw
      tmpBodyWorld.copy(orbitPosition(focusSpec.orbit, focusSpec.angle));
      if (systemSpin.current) {
        tmpSpinQuat.setFromEuler(systemSpin.current.rotation);
        tmpBodyWorld.applyQuaternion(tmpSpinQuat);
      }
      tmpBodyWorld.applyQuaternion(tmpTiltQuat).multiplyScalar(scaleTarget);
      tmpPos.copy(FOCUS_POINT).sub(tmpBodyWorld);
    } else {
      // Phase 1: Earth framing (limb close-up → whole planet).
      const viewY = lerp(VIEW_START.y, VIEW_END.y, p1);
      const viewScale = lerp(VIEW_START.scale, VIEW_END.scale, p1);
      const earthPhaseScale = viewScale / EARTH_SYS_R;

      // Phase 2: zoom out — scale interpolates in log space (a zoom is
      // multiplicative), the system plane tilts into a 3/4 view. The
      // end scale fills the actual viewport: ultrawide screens get a
      // big system, phones get one that fits.
      const halfH = 1.19; // world units at the system plane
      const halfW = halfH * aspect;
      const outer = 3.45; // outermost orbit + planet radius, system units
      const scaleEnd = clamp(
        Math.min((0.95 * halfW) / outer, (0.95 * halfH) / (outer * Math.sin(-SYSTEM_TILT_END))),
        0.18,
        0.85,
      );
      scaleTarget = Math.exp(lerp(Math.log(earthPhaseScale), Math.log(scaleEnd), p2));
      tilt = SYSTEM_TILT_END * p2;
      tmpTiltQuat.setFromAxisAngle(X_AXIS, tilt);

      tmpBodyWorld.copy(EARTH_SYS_POS);
      if (systemSpin.current) {
        tmpSpinQuat.setFromEuler(systemSpin.current.rotation);
        tmpBodyWorld.applyQuaternion(tmpSpinQuat);
      }
      tmpBodyWorld.applyQuaternion(tmpTiltQuat).multiplyScalar(scaleTarget);
      tmpPos.set(0, viewY, 0).sub(tmpBodyWorld); // earth-anchored rig position
      tmpPos.lerp(SYSTEM_CENTER, p2);
    }

    // critically-damped-ish follow; scale eases in log space
    const k = 1 - Math.exp(-7 * delta);
    group.position.lerp(tmpPos, k);
    const logNow = Math.log(group.scale.x);
    group.scale.setScalar(Math.exp(logNow + (Math.log(scaleTarget) - logNow) * k));
    group.quaternion.slerp(tmpTiltQuat, k);
  });

  return (
    <group
      ref={ref}
      position={[
        -EARTH_SYS_POS.x * (VIEW_START.scale / EARTH_SYS_R),
        VIEW_START.y,
        -EARTH_SYS_POS.z * (VIEW_START.scale / EARTH_SYS_R),
      ]}
      scale={VIEW_START.scale / EARTH_SYS_R}
    >
      {children}
    </group>
  );
}

/** Mounts its children the first time the zoom-out begins, so the
    system's geometry and textures cost nothing at page load. */
function MountOnJourney({
  journey,
  children,
}: {
  journey: RefObject<Journey>;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useFrame(() => {
    if (!mounted && journey.current.p2 > 0.001) setMounted(true);
  });
  return mounted ? <>{children}</> : null;
}

/** Distant stars, fading in as the journey leaves the sky behind. */
function Stars({ journey }: { journey: RefObject<Journey> }) {
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const geometry = useMemo(() => {
    const count = 800;
    const positions = new Float32Array(count * 3);
    // deterministic LCG so the sky is stable across remounts
    let seed = 421;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    for (let i = 0; i < count; i++) {
      // uniform directions on a far shell
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 30;
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.opacity = smooth(clamp(journey.current.p1, 0, 1)) * 0.9;
    }
  });

  return (
    <points geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        size={0.06}
        color="#dbe4ff"
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */

export interface EarthGlobeProps {
  rimColor: [number, number, number];
  /** epoch ms for the sun position */
  atMs: number;
  /** scroll journey progress, written by the hero's scroll handler */
  journeyRef: RefObject<Journey>;
  /** focused body name (null = scroll-driven framing) */
  focused: string | null;
  /** clicks on bodies / empty space request focus changes */
  onFocusRequest: (name: string | null) => void;
  /** click on empty space while nothing is focused (the unlock gesture) */
  onBackgroundClick?: () => void;
  /** fires when the visitor picks up / releases a body */
  onInteractionChange?: (active: boolean) => void;
  /** disable the idle drift (reduced motion) */
  drift?: boolean;
}

export default function EarthGlobe({
  rimColor,
  atMs,
  journeyRef,
  focused,
  onFocusRequest,
  onBackgroundClick,
  onInteractionChange,
  drift = true,
}: EarthGlobeProps) {
  const earthSpinRef = useRef<THREE.Group>(null);
  const earthTiltRef = useRef<THREE.Group>(null);
  const systemSpinRef = useRef<THREE.Group>(null);
  const bodySpinsRef = useRef(new Map<string, THREE.Group>());
  const focusedRef = useRef<string | null>(focused);
  useEffect(() => {
    focusedRef.current = focused;
    // no lingering axis from a view that was just exited
    interaction.current.revealFor = null;
  }, [focused]);

  const interaction = useRef<InteractionState>({
    dragging: false,
    vel: 0,
    lastActiveMs: 0,
    revealFor: null,
    revealOrbits: false,
    dragDist: 0,
  });

  // Dev-only introspection for headless debugging.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__earthDebug = {
        earthSpin: earthSpinRef,
        systemSpin: systemSpinRef,
        bodySpins: bodySpinsRef,
        journey: journeyRef,
        interaction,
      };
    }
  }, [journeyRef]);

  const targets = useMemo<DragTargets>(
    () => ({ earthSpin: earthSpinRef, systemSpin: systemSpinRef, bodySpins: bodySpinsRef }),
    [],
  );

  const registerSpin = useMemo(
    () => (name: string, group: THREE.Group | null) => {
      if (group) bodySpinsRef.current.set(name, group);
      else bodySpinsRef.current.delete(name);
    },
    [],
  );

  // Start with the visitor's approximate longitude facing the camera.
  const initialYaw = useMemo(
    () => yawForLongitude(longitudeFromUtcOffset(new Date().getTimezoneOffset())),
    [],
  );

  const handleTapWhileFocused = useMemo(() => () => onFocusRequest(null), [onFocusRequest]);

  const handleBodyClick = useMemo(
    () => (name: string) => {
      if (focusedRef.current !== null) return; // a tap in the planet view exits instead
      if (journeyRef.current.p2 < 0.33) return; // bodies are clickable once revealed
      onFocusRequest(name);
    },
    [journeyRef, onFocusRequest],
  );

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.35, 3.1], fov: 42 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
      onPointerMissed={() => {
        if (interaction.current.dragDist >= 6) return;
        if (!focusedRef.current) onBackgroundClick?.();
      }}
    >
      <Suspense fallback={null}>
        <Stars journey={journeyRef} />
        <ambientLight intensity={0.35} />
        <SystemRig journey={journeyRef} focusedRef={focusedRef} systemSpin={systemSpinRef}>
          <group ref={systemSpinRef}>
            <pointLight position={[0, 0, 0]} intensity={3} decay={0.4} />
            <MountOnJourney journey={journeyRef}>
              <SunCore
                journey={journeyRef}
                interaction={interaction}
                focusedRef={focusedRef}
                registerSpin={registerSpin}
                onBodyClick={handleBodyClick}
              />
              <OrbitRings journey={journeyRef} interaction={interaction} focusedRef={focusedRef} />
              {PLANETS.map((spec) => (
                <Planet
                  key={spec.name}
                  spec={spec}
                  journey={journeyRef}
                  interaction={interaction}
                  focusedRef={focusedRef}
                  registerSpin={registerSpin}
                  onBodyClick={handleBodyClick}
                />
              ))}
            </MountOnJourney>
            {/* Earth, in its orbital slot — interactive throughout */}
            <group position={EARTH_SYS_POS} scale={EARTH_SYS_R}>
              {/* real axial tilt; the axis line renders visibly leaning */}
              <group ref={earthTiltRef} rotation={[0, 0, -EARTH_OBLIQUITY]}>
                <group ref={earthSpinRef} rotation={[0, initialYaw, 0]}>
                  <EarthSurface
                    rimColor={rimColor}
                    drift={drift}
                    atMs={atMs}
                    spinRef={earthSpinRef}
                    interaction={interaction}
                    focusedRef={focusedRef}
                    onEarthClick={() => {
                      if (focusedRef.current !== null) return; // the tap exit handles it
                      if (!inEarthZone(journeyRef.current)) onFocusRequest("earth");
                    }}
                  />
                  <Graticule interaction={interaction} />
                </group>
              </group>
              <Moon focusedRef={focusedRef} />
              <EarthriseGlow journey={journeyRef} focusedRef={focusedRef} />
            </group>
          </group>
        </SystemRig>
        <EarthSlotCompensation
          tiltRef={earthTiltRef}
          journey={journeyRef}
          focusedRef={focusedRef}
        />
        <SystemSpinReset
          journey={journeyRef}
          systemSpin={systemSpinRef}
          interaction={interaction}
        />
        <DragControls
          targets={targets}
          journey={journeyRef}
          focusedRef={focusedRef}
          interaction={interaction}
          onInteractionChange={onInteractionChange}
          onTapWhileFocused={handleTapWhileFocused}
        />
      </Suspense>
    </Canvas>
  );
}
