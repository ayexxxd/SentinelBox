"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { makeNoiseTexture } from "./glass";

function Tree({ position, scale = 1, tone = 0 }: { position: [number, number, number]; scale?: number; tone?: number }) {
  const greens = ["#2f6b3a", "#3a7d44", "#285c33", "#43804a"];
  const c1 = greens[tone % greens.length];
  const c2 = greens[(tone + 1) % greens.length];
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.14, 0.2, 1.8, 7]} />
        <meshStandardMaterial color="#5b4232" roughness={0.9} />
      </mesh>
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

function ParkingLot({ z }: { z: number }) {
  const cars: [number, number, string][] = [
    [-13.5, 0.5, "#cbd5e1"],
    [-7.5, -0.6, "#f5c518"],
    [-4.5, 0.4, "#94a3b8"],
    [4.5, -0.4, "#e2e8f0"],
    [10.5, 0.5, "#64748b"],
    [13.5, -0.3, "#b91c1c"],
  ];
  return (
    <group position={[0, 0.02, z]}>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} position={[-15 + i * 3, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 5]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </mesh>
      ))}
      {cars.map(([cx, cz, color], i) => (
        <group key={i} position={[cx, 0, cz]}>
          <mesh castShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[1.1, 0.75, 2.2]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 1.05, 0.1]}>
            <boxGeometry args={[1, 0.5, 1.2]} />
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Mountain ridge as a displaced height field. `profile(x)` gives the crest height;
 * the ridge falls off with distance from its spine (z) and gets a little noise.
 */
function Ridge({
  position,
  width,
  depth,
  profile,
  low,
  high,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  profile: (x: number) => number;
  low: string;
  high: string;
}) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, depth, 220, 30);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const cLow = new THREE.Color(low);
    const cHigh = new THREE.Color(high);
    let maxH = 1;
    const hs: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const fall = Math.exp(-((z / (depth * 0.28)) ** 2));
      const noise = Math.sin(x * 0.21 + z * 0.13) * 1.4 + Math.sin(x * 0.53 - z * 0.37) * 0.8;
      const h = Math.max(0, profile(x) * fall + noise * fall);
      hs.push(h);
      maxH = Math.max(maxH, h);
    }
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, hs[i]);
      const c = cLow.clone().lerp(cHigh, Math.min(1, hs[i] / maxH + 0.1));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [width, depth, profile, low, high]);
  return (
    <mesh geometry={geom} position={position}>
      <meshStandardMaterial vertexColors roughness={1} flatShading />
    </mesh>
  );
}

const g = (x: number, c: number, w: number, h: number) => h * Math.exp(-(((x - c) / w) ** 2));

// Cerro de la Silla: broad massif with the two sharp "saddle" horns and a notch between.
const cerroDeLaSilla = (x: number) =>
  Math.max(g(x, 30, 70, 30), g(x, 52, 16, 44), g(x, 62, 7, 62), g(x, 80, 6.5, 57), g(x, 71, 14, 45), g(x, 102, 22, 34));
// Sierra Madre range to the west, lower and further back.
const sierraMadre = (x: number) => Math.max(g(x, -60, 45, 38), g(x, -130, 40, 44), g(x, -10, 30, 26), g(x, 150, 60, 30));
// Scaled up for the meter-based scene.
const silla = (x: number) => cerroDeLaSilla(x / 4) * 1.7;
const sierra = (x: number) => sierraMadre(x / 3.5) * 1.6;

export default function Environment() {
  const concreteTex = useMemo(() => (typeof document !== "undefined" ? makeNoiseTexture(21) : null), []);
  const trees = useMemo(
    () => [
      { p: [-48, 0, 12], s: 1.2, t: 0 },
      { p: [-50, 0, -2], s: 1.35, t: 1 },
      { p: [-39, 0, -16], s: 1.05, t: 2 },
      { p: [40, 0, 14], s: 1.25, t: 1 },
      { p: [52, 0, 16], s: 1.4, t: 3 },
      { p: [60, 0, -24], s: 1.0, t: 0 },
      { p: [-32, 0, 32], s: 1.0, t: 2 },
      { p: [34, 0, 24], s: 1.1, t: 3 },
      { p: [-36, 0, 14], s: 1.45, t: 0 },
      { p: [46, 0, 22], s: 1.15, t: 2 },
      { p: [-38, 0, -30], s: 1.05, t: 1 },
      { p: [4, 0, -40], s: 1.2, t: 3 },
      { p: [-40, 0, -46], s: 1.3, t: 0 },
      { p: [40, 0, -40], s: 1.1, t: 2 },
    ] as { p: [number, number, number]; s: number; t: number }[],
    []
  );

  return (
    <group>
      {/* Lights */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#c4d9f5", "#3f4a3a", 0.65]} />
      <directionalLight
        position={[60, 90, 70]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-60}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-30, 20, -30]} intensity={0.35} color="#9fc2ff" />

      {/* Ground */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#74936a" roughness={1} />
      </mesh>

      {/* Plaza around the building */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[10, 0.01, -14]}>
        <planeGeometry args={[130, 76]} />
        <meshStandardMaterial color="#a7b0b8" roughness={0.95} map={concreteTex ?? undefined} />
      </mesh>

      {/* Parking + street in front */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[8, 0.015, 38]}>
        <planeGeometry args={[40, 10]} />
        <meshStandardMaterial color="#43494f" roughness={0.95} map={concreteTex ?? undefined} />
      </mesh>
      <group position={[8, 0, 0]}>
        <ParkingLot z={38} />
      </group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 47]}>
        <planeGeometry args={[140, 6]} />
        <meshStandardMaterial color="#31363d" roughness={0.95} />
      </mesh>
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={i} position={[-48 + i * 5, 0.025, 47]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 0.16]} />
          <meshStandardMaterial color="#facc15" roughness={0.9} />
        </mesh>
      ))}

      {trees.map((t, i) => (
        <Tree key={i} position={t.p} scale={t.s} tone={t.t} />
      ))}

      {/* Campus context: Tec's pyramid-shaped building + low blocks */}
      <mesh castShadow position={[-62, 5, -40]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[11, 10, 4, 1]} />
        <meshStandardMaterial color="#b98c6c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-62, 5.02, -40]} rotation={[0, Math.PI / 4, 0]} scale={[0.72, 0.72, 0.72]}>
        <coneGeometry args={[11.1, 10, 4, 1, true, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial color="#4f7fa8" metalness={0.8} roughness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {[
        { p: [48, 3, -48], s: [14, 6, 9] },
        { p: [74, 1.8, -12], s: [9, 3.6, 10] },
        { p: [-66, 2, 6], s: [10, 4, 12] },
      ].map((b, i) => (
        <mesh key={i} castShadow position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial color="#c3c7c9" roughness={0.9} />
        </mesh>
      ))}

      {/* Monterrey skyline: Cerro de la Silla in front, Sierra Madre behind */}
      <Ridge position={[-420, 0, -380]} width={1100} depth={200} profile={silla} low="#4f6a45" high="#7a8c9d" />
      <Ridge position={[160, 0, -420]} width={1100} depth={220} profile={sierra} low="#6f8196" high="#9aaabd" />
    </group>
  );
}
