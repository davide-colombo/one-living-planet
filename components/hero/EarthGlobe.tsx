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
const DRIFT_RAD_PER_S = 0.006; // full turn ≈ 17 min — barely perceptible
const TILT_LIMIT = 1.1; // rad — how far the planet can be tilted by hand
const RESUME_DRIFT_AFTER_MS = 2500;

/** Scroll journey, part one: close-up on the limb → the whole planet. */
const VIEW_START = { y: -1.55, scale: 1.5 };
const VIEW_END = { y: -0.15, scale: 0.72 };

/* ------------------------------------------------------------------ */
/* the solar system — stylized layout, deliberately not to scale       */
/* ------------------------------------------------------------------ */

/** Earth's slot in the system (system units). */
const EARTH_ORBIT = 1.0;
const EARTH_SYS_R = 0.05;
const EARTH_ANGLE = 1.15;

/** Zoom-out endpoint: whole system in frame, gently tilted. */
const SYSTEM_TILT_END = -0.5; // rad, around X
const SYSTEM_SCALE_END = 0.3;
const SYSTEM_CENTER = new THREE.Vector3(0, 0.08, 0);
const SUN_R = 0.16;

interface PlanetSpec {
  name: string;
  orbit: number;
  r: number;
  color: string;
  angle: number;
  ring?: boolean;
}

const PLANETS: PlanetSpec[] = [
  { name: "mercury", orbit: 0.5, r: 0.024, color: "#a59a8f", angle: 5.1 },
  { name: "venus", orbit: 0.72, r: 0.045, color: "#d9b98a", angle: 3.9 },
  { name: "mars", orbit: 1.32, r: 0.034, color: "#c96f4a", angle: 0.4 },
  { name: "jupiter", orbit: 1.9, r: 0.095, color: "#c9a87e", angle: 2.6 },
  { name: "saturn", orbit: 2.42, r: 0.08, color: "#d8c49a", angle: 4.4, ring: true },
  { name: "uranus", orbit: 2.88, r: 0.055, color: "#9fd3d8", angle: 1.8 },
  { name: "neptune", orbit: 3.3, r: 0.052, color: "#6f8fd8", angle: 5.8 },
];

const orbitPosition = (orbit: number, angle: number) =>
  new THREE.Vector3(Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit);

const EARTH_SYS_POS = orbitPosition(EARTH_ORBIT, EARTH_ANGLE);

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
  /** graticule/axis visibility target */
  reveal: boolean;
}

function configureTexture(t: THREE.Texture) {
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function useProgressiveTexture(lowUrl: string, highUrl: string): THREE.Texture {
  const low = useLoader(THREE.TextureLoader, lowUrl);
  const [texture, setTexture] = useState(() => configureTexture(low));
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(highUrl, (high) => {
      if (alive) setTexture(configureTexture(high));
    });
    return () => {
      alive = false;
    };
  }, [highUrl]);
  return texture;
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
}

const tmpQuat = new THREE.Quaternion();

function EarthSurface({ rimColor, drift, atMs, spinRef, interaction }: EarthSurfaceProps) {
  const dayMap = useProgressiveTexture(
    "/textures/earth-day-1k.webp",
    "/textures/earth-day-4k.webp",
  );
  const nightMap = useProgressiveTexture(
    "/textures/earth-night-1k.webp",
    "/textures/earth-night-2k.webp",
  );

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
        },
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
  });

  return (
    <mesh material={surfaceMaterial}>
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
    for (let lon = 0; lon < 360; lon += 15) pts.push(...meridianPoints(lon, R));
    return toLineGeometry(pts);
  }, []);
  const equatorGeom = useMemo(() => toLineGeometry(circlePoints(0, R, 192)), []);
  const axisGeom = useMemo(
    () => toLineGeometry([0, -1.45, 0, 0, -1.004, 0, 0, 1.004, 0, 0, 1.45, 0]),
    [],
  );

  const gridMat = useRef<THREE.LineBasicMaterial>(null);
  const equatorMat = useRef<THREE.LineBasicMaterial>(null);
  const axisMat = useRef<THREE.LineBasicMaterial>(null);
  useOpacityDriver(gridMat, () => (interaction.current.reveal ? 0.22 : 0));
  useOpacityDriver(equatorMat, () => (interaction.current.reveal ? 0.55 : 0));
  useOpacityDriver(axisMat, () => (interaction.current.reveal ? 0.7 : 0));

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
          color="#cfe0ff"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={axisGeom}>
        <lineBasicMaterial
          ref={axisMat}
          color="#e8f0ff"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* drag: spin (yaw) + tilt (pitch), with inertia                       */
/* ------------------------------------------------------------------ */

interface DragControlsProps {
  spinRef: RefObject<THREE.Group | null>;
  interaction: RefObject<InteractionState>;
  onInteractionChange?: (active: boolean) => void;
}

function DragControls({ spinRef, interaction, onInteractionChange }: DragControlsProps) {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    // vertical swipes keep scrolling the page on touch; horizontal drags spin
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";

    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let endTimer: ReturnType<typeof setTimeout> | undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; dragging works without it */
      }
      const it = interaction.current;
      it.dragging = true;
      it.vel = 0;
      it.reveal = true;
      it.lastActiveMs = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = performance.now();
      el.style.cursor = "grabbing";
      clearTimeout(endTimer);
      onInteractionChange?.(true);
    };

    const onMove = (e: PointerEvent) => {
      const it = interaction.current;
      if (!it.dragging) return;
      const group = spinRef.current;
      if (!group) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dYaw = dx * 0.005;
      group.rotation.y += dYaw;
      group.rotation.x = clamp(group.rotation.x + dy * 0.004, -TILT_LIMIT, TILT_LIMIT);
      const dt = Math.max(8, now - lastT) / 1000;
      it.vel = 0.75 * it.vel + 0.25 * (dYaw / dt);
      it.lastActiveMs = now;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
    };

    const onUp = () => {
      const it = interaction.current;
      if (!it.dragging) return;
      it.dragging = false;
      it.lastActiveMs = performance.now();
      el.style.cursor = "grab";
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        interaction.current.reveal = false;
        onInteractionChange?.(false);
      }, RESUME_DRIFT_AFTER_MS);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clearTimeout(endTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, spinRef, interaction, onInteractionChange]);

  // yaw inertia after release
  useFrame((_, delta) => {
    const it = interaction.current;
    const group = spinRef.current;
    if (!group || it.dragging || Math.abs(it.vel) < 0.001) return;
    group.rotation.y += it.vel * delta;
    it.vel *= Math.exp(-2.2 * delta);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* the sun cresting behind Earth (hero phase only)                     */
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
function EarthriseGlow({ journey }: { journey: RefObject<Journey> }) {
  const texture = useMemo(() => makeGlowTexture(SUN_GLOW_STOPS), []);
  const mat = useRef<THREE.SpriteMaterial>(null);
  useOpacityDriver(mat, () => 0.75 * (1 - smooth(clamp(journey.current.p2 * 2.5, 0, 1))));
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
/* solar system bodies (zoom-out phase)                                */
/* ------------------------------------------------------------------ */

function SunCore({ journey }: { journey: RefObject<Journey> }) {
  const texture = useMemo(() => makeGlowTexture(SUN_GLOW_STOPS), []);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const p2 = () => smooth(clamp(journey.current.p2, 0, 1));
  useOpacityDriver(glowMat, () => 0.9 * p2());
  useOpacityDriver(coreMat, () => p2());
  return (
    <group>
      <mesh>
        <sphereGeometry args={[SUN_R, 48, 48]} />
        <meshBasicMaterial ref={coreMat} color="#fff4dc" transparent opacity={0} />
      </mesh>
      <sprite scale={[SUN_R * 7, SUN_R * 7, 1]}>
        <spriteMaterial
          ref={glowMat}
          map={texture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
    </group>
  );
}

function Planet({ spec, journey }: { spec: PlanetSpec; journey: RefObject<Journey> }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Group>(null);
  const p2 = () => smooth(clamp(journey.current.p2, 0, 1));
  useOpacityDriver(mat, p2);
  useOpacityDriver(ringMat, () => 0.55 * p2());
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.1;
  });
  const pos = useMemo(() => orbitPosition(spec.orbit, spec.angle), [spec]);
  return (
    <group position={pos} ref={meshRef}>
      <mesh>
        <sphereGeometry args={[spec.r, 40, 40]} />
        <meshStandardMaterial
          ref={mat}
          color={spec.color}
          roughness={0.9}
          transparent
          opacity={0}
        />
      </mesh>
      {spec.ring ? (
        <mesh rotation={[1.25, 0, 0.3]}>
          <ringGeometry args={[spec.r * 1.35, spec.r * 2.1, 64]} />
          <meshBasicMaterial
            ref={ringMat}
            color="#d8c9a3"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}
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

function OrbitRings({ journey }: { journey: RefObject<Journey> }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    for (const orbit of [...PLANETS.map((p) => p.orbit), EARTH_ORBIT]) {
      pts.push(...orbitRingPoints(orbit));
    }
    return toLineGeometry(pts);
  }, []);
  const mat = useRef<THREE.LineBasicMaterial>(null);
  useOpacityDriver(mat, () => 0.18 * smooth(clamp(journey.current.p2, 0, 1)));
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial ref={mat} color="#9db4d8" transparent opacity={0} depthWrite={false} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* the rig: one transform carries the whole journey                    */
/* ------------------------------------------------------------------ */

const tmpEarthWorld = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpTiltQuat = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);

function SystemRig({
  journey,
  children,
}: {
  journey: RefObject<Journey>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const p1 = smooth(clamp(journey.current.p1, 0, 1));
    const p2 = smooth(clamp(journey.current.p2, 0, 1));

    // Phase 1: Earth framing (limb close-up → whole planet).
    const viewY = lerp(VIEW_START.y, VIEW_END.y, p1);
    const viewScale = lerp(VIEW_START.scale, VIEW_END.scale, p1);
    const earthPhaseScale = viewScale / EARTH_SYS_R;

    // Phase 2: zoom out — scale interpolates in log space (a zoom is
    // multiplicative), the system plane tilts into a 3/4 view.
    const scale = Math.exp(lerp(Math.log(earthPhaseScale), Math.log(SYSTEM_SCALE_END), p2));
    const tilt = SYSTEM_TILT_END * p2;
    tmpTiltQuat.setFromAxisAngle(X_AXIS, tilt);

    // Position: during phase 1 the rig is placed so Earth sits at the
    // hero framing spot; during phase 2 it eases to the system center.
    tmpEarthWorld.copy(EARTH_SYS_POS).applyQuaternion(tmpTiltQuat).multiplyScalar(scale);
    tmpPos.set(0, viewY, 0).sub(tmpEarthWorld); // earth-anchored rig position
    tmpPos.lerp(SYSTEM_CENTER, p2);

    // critically-damped-ish follow so jumpy scrolls stay smooth
    const k = 1 - Math.exp(-7 * delta);
    group.position.lerp(tmpPos, k);
    group.scale.setScalar(group.scale.x + (scale - group.scale.x) * k);
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
      const j = journey.current;
      materialRef.current.opacity = smooth(clamp(j.p1, 0, 1)) * 0.9;
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
  /** fires when the visitor picks up / releases the planet */
  onInteractionChange?: (active: boolean) => void;
  /** disable the idle drift (reduced motion) */
  drift?: boolean;
}

export default function EarthGlobe({
  rimColor,
  atMs,
  journeyRef,
  onInteractionChange,
  drift = true,
}: EarthGlobeProps) {
  const spinRef = useRef<THREE.Group>(null);
  const interaction = useRef<InteractionState>({
    dragging: false,
    vel: 0,
    lastActiveMs: 0,
    reveal: false,
  });

  // Start with the visitor's approximate longitude facing the camera.
  const initialYaw = useMemo(
    () => yawForLongitude(longitudeFromUtcOffset(new Date().getTimezoneOffset())),
    [],
  );

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.35, 3.1], fov: 42 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Stars journey={journeyRef} />
        <ambientLight intensity={0.25} />
        <SystemRig journey={journeyRef}>
          <pointLight position={[0, 0, 0]} intensity={3} decay={0.4} />
          <SunCore journey={journeyRef} />
          <OrbitRings journey={journeyRef} />
          {PLANETS.map((spec) => (
            <Planet key={spec.name} spec={spec} journey={journeyRef} />
          ))}
          {/* Earth, in its orbital slot — interactive throughout */}
          <group position={EARTH_SYS_POS} scale={EARTH_SYS_R}>
            <group ref={spinRef} rotation={[0, initialYaw, 0]}>
              <EarthSurface
                rimColor={rimColor}
                drift={drift}
                atMs={atMs}
                spinRef={spinRef}
                interaction={interaction}
              />
              <Graticule interaction={interaction} />
            </group>
            <EarthriseGlow journey={journeyRef} />
          </group>
        </SystemRig>
        <DragControls
          spinRef={spinRef}
          interaction={interaction}
          onInteractionChange={onInteractionChange}
        />
      </Suspense>
    </Canvas>
  );
}
