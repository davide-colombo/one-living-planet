"use client";

/* eslint-disable react-hooks/immutability -- three.js objects (uniforms,
   rotations, materials) are mutated imperatively by design; React never
   reads them. */

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
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

const DRIFT_RAD_PER_S = 0.006; // full turn ≈ 17 min — barely perceptible

/** Scroll journey: close-up on the limb → the whole planet in space. */
const VIEW_START = { y: -1.55, scale: 1.5 };
const VIEW_END = { y: -0.15, scale: 0.72 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

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

interface EarthProps {
  rimColor: [number, number, number];
  drift: boolean;
  /** epoch ms for the sun position (dev time-travel passes a shifted clock) */
  atMs: number;
}

function Earth({ rimColor, drift, atMs }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null);
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

  // Start with the visitor's approximate longitude facing the camera.
  const initialYaw = useMemo(
    () => yawForLongitude(longitudeFromUtcOffset(new Date().getTimezoneOffset())),
    [],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (drift) group.rotation.y += delta * DRIFT_RAD_PER_S;
    // Keep lighting glued to geography while the globe turns.
    const sunWorld = surfaceMaterial.uniforms.sunDir.value as THREE.Vector3;
    sunWorld.copy(sunEarthFixed).applyEuler(group.rotation).normalize();
  });

  return (
    <group ref={groupRef} rotation={[0, initialYaw, 0]}>
      <mesh material={surfaceMaterial}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
    </group>
  );
}

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
  /** disable the idle drift (reduced motion) */
  drift?: boolean;
}

export default function EarthGlobe({ rimColor, atMs, progressRef, drift = true }: EarthGlobeProps) {
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
          <Earth rimColor={rimColor} drift={drift} atMs={atMs} />
          <SunGlow />
        </SceneRig>
      </Suspense>
    </Canvas>
  );
}
