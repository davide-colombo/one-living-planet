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

/** Scroll journey: close-up on the limb → the whole planet in space. */
const VIEW_START = { y: -1.55, scale: 1.5 };
const VIEW_END = { y: -0.15, scale: 0.72 };

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
  /** 0–1 target for graticule/axis visibility */
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

interface EarthSurfaceProps {
  rimColor: [number, number, number];
  drift: boolean;
  /** epoch ms for the sun position (dev time-travel passes a shifted clock) */
  atMs: number;
  spinRef: RefObject<THREE.Group | null>;
  interaction: RefObject<InteractionState>;
}

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
    // Keep lighting glued to geography however the globe is turned.
    const sunWorld = surfaceMaterial.uniforms.sunDir.value as THREE.Vector3;
    sunWorld.copy(sunEarthFixed).applyEuler(group.rotation).normalize();
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

/** Fades a line material toward `max` while the interaction is live. */
function useRevealOpacity(
  ref: RefObject<THREE.LineBasicMaterial | null>,
  interaction: RefObject<InteractionState>,
  max: number,
) {
  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    const target = interaction.current.reveal ? max : 0;
    const k = 1 - Math.exp(-6 * delta);
    m.opacity += (target - m.opacity) * k;
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
  useRevealOpacity(gridMat, interaction, 0.22);
  useRevealOpacity(equatorMat, interaction, 0.55);
  useRevealOpacity(axisMat, interaction, 0.7);

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

/**
 * The sun, cresting from behind the planet at the center of the limb —
 * a soft additive sprite whose core the Earth occludes, so only the
 * light spilling past the horizon is visible.
 */
function SunGlow() {
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255, 252, 244, 1)");
    g.addColorStop(0.06, "rgba(255, 246, 228, 0.9)");
    g.addColorStop(0.18, "rgba(255, 228, 196, 0.35)");
    g.addColorStop(0.42, "rgba(255, 214, 178, 0.1)");
    g.addColorStop(1, "rgba(255, 205, 170, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <sprite position={[0, 0.9, -2.4]} scale={[3.0, 3.0, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.75}
      />
    </sprite>
  );
}

/** Distant stars, fading in as the journey leaves the sky behind. */
function Stars({ progressRef }: { progressRef: RefObject<number> }) {
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
      materialRef.current.opacity = smooth(progressRef.current ?? 0) * 0.9;
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

/** Scroll-driven rig: eases the globe between the two framings. */
function SceneRig({
  progressRef,
  children,
}: {
  progressRef: RefObject<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const p = smooth(Math.min(1, Math.max(0, progressRef.current ?? 0)));
    const targetY = lerp(VIEW_START.y, VIEW_END.y, p);
    const targetS = lerp(VIEW_START.scale, VIEW_END.scale, p);
    // critically-damped-ish follow so jumpy scrolls stay smooth
    const k = 1 - Math.exp(-7 * delta);
    group.position.y += (targetY - group.position.y) * k;
    group.scale.setScalar(group.scale.x + (targetS - group.scale.x) * k);
  });

  return (
    <group ref={ref} position={[0, VIEW_START.y, 0]} scale={VIEW_START.scale}>
      {children}
    </group>
  );
}

export interface EarthGlobeProps {
  rimColor: [number, number, number];
  /** epoch ms for the sun position */
  atMs: number;
  /** scroll journey progress 0–1, written by the hero's scroll handler */
  progressRef: RefObject<number>;
  /** fires when the visitor picks up / releases the planet */
  onInteractionChange?: (active: boolean) => void;
  /** disable the idle drift (reduced motion) */
  drift?: boolean;
}

export default function EarthGlobe({
  rimColor,
  atMs,
  progressRef,
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
        <Stars progressRef={progressRef} />
        <SceneRig progressRef={progressRef}>
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
          <SunGlow />
        </SceneRig>
        <DragControls
          spinRef={spinRef}
          interaction={interaction}
          onInteractionChange={onInteractionChange}
        />
      </Suspense>
    </Canvas>
  );
}
