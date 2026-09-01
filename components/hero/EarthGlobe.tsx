"use client";

/* eslint-disable react-hooks/immutability -- three.js objects (uniforms,
   rotations) are mutated imperatively by design; React never reads them. */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { sunDirection, longitudeFromUtcOffset } from "@/lib/solar";
import {
  ATMOSPHERE_FRAGMENT,
  ATMOSPHERE_VERTEX,
  EARTH_FRAGMENT,
  EARTH_VERTEX,
} from "./earth-shaders";

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

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms: { rimColor: { value: new THREE.Color() } },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    surfaceMaterial.uniforms.dayMap.value = dayMap;
    surfaceMaterial.uniforms.nightMap.value = nightMap;
  }, [surfaceMaterial, dayMap, nightMap]);

  useEffect(() => {
    surfaceMaterial.uniforms.rimColor.value.setRGB(...rimColor);
    atmosphereMaterial.uniforms.rimColor.value.setRGB(...rimColor);
  }, [surfaceMaterial, atmosphereMaterial, rimColor]);

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
      <mesh material={atmosphereMaterial} scale={1.12}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
    </group>
  );
}

export interface EarthGlobeProps {
  rimColor: [number, number, number];
  /** epoch ms for the sun position */
  atMs: number;
  /** disable the idle drift (reduced motion) */
  drift?: boolean;
}

export default function EarthGlobe({ rimColor, atMs, drift = true }: EarthGlobeProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.35, 3.1], fov: 42 }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <group position={[0, -1.4, 0]} scale={1.5}>
          <Earth rimColor={rimColor} drift={drift} atMs={atMs} />
        </group>
      </Suspense>
    </Canvas>
  );
}
