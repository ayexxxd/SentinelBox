"use client";

import { useMemo } from "react";
import { makeNoiseTexture } from "./glass";

function Tree({
  position,
  scale = 1,
  tone = 0,
}: {
  position: [number, number, number];
  scale?: number;
  tone?: number;
}) {
  const greens = ["#2f6b3a", "#3a7d44", "#285c33", "#43804a"];
  const c1 = greens[tone % greens.length];
  const c2 = greens[(tone + 1) % greens.length];
  return (
    <group position={position} scale={scale}>
      {/* trunk */}
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.14, 0.2, 1.8, 7]} />
        <meshStandardMaterial color="#5b4232" roughness={0.9} />
      </mesh>
      {/* canopy */}
      <mesh castShadow position={[0, 2.3, 0]}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshStandardMaterial color={c1} roughness={0.85} flatShading />
      </mesh>
      <mesh castShadow position={[0.55, 1.8, 0.3]}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshStandardMaterial color={c2} roughness={0.85} flatShading />
      </mesh>
      <mesh castShadow position={[-0.5, 1.9, -0.25]}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color={c1} roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function ParkingStallLines({ x = 0, z = 0 }: { x?: number; z?: number }) {
  const stalls = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);
  return (
    <group position={[x, 0.02, z]}>
      {stalls.map((i) => (
        <mesh key={i} position={[-12 + i * 3, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 5]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </mesh>
      ))}
      {/* parked car placeholders — simple stylized volumes */}
      {[
        [-10.5, 0.5, "#cbd5e1"],
        [-7.5, -0.6, "#f5c518"],
        [-4.5, 0.4, "#94a3b8"],
        [4.5, -0.4, "#e2e8f0"],
        [7.5, 0.5, "#64748b"],
      ].map(([cx, cz, color], i) => (
        <group key={i} position={[cx as number, 0, cz as number]}>
          <mesh castShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[2.2, 0.75, 1.1]} />
            <meshStandardMaterial color={color as string} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 1.05, 0]}>
            <boxGeometry args={[1.2, 0.5, 1]} />
            <meshStandardMaterial color={color as string} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Environment() {
  const concreteTex = useMemo(
    () => (typeof document !== "undefined" ? makeNoiseTexture(21) : null),
    []
  );
  const trees = useMemo(
    () =>
      [
        { p: [-14, 0, 6] as [number, number, number], s: 1.15, t: 0 },
        { p: [-17, 0, -2] as [number, number, number], s: 1.3, t: 1 },
        { p: [-12, 0, -8] as [number, number, number], s: 1.0, t: 2 },
        { p: [13, 0, 7] as [number, number, number], s: 1.2, t: 1 },
        { p: [16, 0, 0] as [number, number, number], s: 1.35, t: 3 },
        { p: [12, 0, -8] as [number, number, number], s: 1.0, t: 0 },
        { p: [-8, 0, 12] as [number, number, number], s: 0.95, t: 2 },
        { p: [8, 0, 12.5] as [number, number, number], s: 1.05, t: 3 },
        { p: [-20, 0, 10] as [number, number, number], s: 1.4, t: 0 },
        { p: [20, 0, 10] as [number, number, number], s: 1.1, t: 2 },
        { p: [-6, 0, -13] as [number, number, number], s: 1.0, t: 1 },
        { p: [6, 0, -13.5] as [number, number, number], s: 1.15, t: 3 },
      ],
    []
  );

  return (
    <group>
      {/* Lights */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#c4d9f5", "#3f4a3a", 0.65]} />
      <directionalLight
        position={[26, 34, 18]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={45}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-20, 14, -24]} intensity={0.35} color="#9fc2ff" />

      {/* Ground: grass base */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color="#74936a" roughness={1} />
      </mesh>

      {/* Concrete plaza under building */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[42, 34]} />
        <meshStandardMaterial
          color="#a7b0b8"
          roughness={0.95}
          map={concreteTex ?? undefined}
        />
      </mesh>
      {/* Plaza joint lines */}
      {[-15, -9, -3, 3, 9, 15].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, 34]} />
          <meshStandardMaterial color="#8b949d" roughness={1} />
        </mesh>
      ))}

      {/* Parking lot (front, like the reference photo) */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 20]}>
        <planeGeometry args={[38, 12]} />
        <meshStandardMaterial
          color="#43494f"
          roughness={0.95}
          map={concreteTex ?? undefined}
        />
      </mesh>
      <ParkingStallLines x={0} z={20} />

      {/* Street */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 29]}>
        <planeGeometry args={[90, 5]} />
        <meshStandardMaterial color="#31363d" roughness={0.95} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-26 + i * 4.8, 0.025, 29]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 0.16]} />
          <meshStandardMaterial color="#facc15" roughness={0.9} />
        </mesh>
      ))}

      {/* Trees */}
      {trees.map((t, i) => (
        <Tree key={i} position={t.p} scale={t.s} tone={t.t} />
      ))}

      {/* Monterrey mountains backdrop */}
      <group position={[0, 0, -78]}>
        {[
          { x: -45, s: [46, 20, 10] as const, c: "#7d90a8" },
          { x: -8, s: [60, 26, 12] as const, c: "#6d8299" },
          { x: 34, s: [48, 18, 10] as const, c: "#7d90a8" },
          { x: 68, s: [40, 14, 10] as const, c: "#8b9cad" },
        ].map((m, i) => (
          <mesh key={i} position={[m.x, 0, 0]}>
            <coneGeometry args={[m.s[0] / 2, m.s[1], 4, 1]} />
            <meshStandardMaterial color={m.c} roughness={1} flatShading />
          </mesh>
        ))}
      </group>

      {/* Distant campus blocks for context */}
      {[
        { p: [-34, 2, -28] as const, s: [10, 4, 8] as const },
        { p: [32, 3, -30] as const, s: [12, 6, 8] as const },
        { p: [44, 1.5, -12] as const, s: [8, 3, 8] as const },
      ].map((b, i) => (
        <mesh key={i} castShadow position={[b.p[0], b.p[1], b.p[2]]}>
          <boxGeometry args={[b.s[0], b.s[1], b.s[2]]} />
          <meshStandardMaterial color="#9aa7b5" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
