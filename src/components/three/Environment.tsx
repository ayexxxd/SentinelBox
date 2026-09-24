"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import Flags from "./Flags";
import { boxGeometry, groundPlane, makeConcreteMaterial, makeGlassMaterial, makeGrassMaterial } from "./materials";

/* ------------------------------------------------------------------ */
/* Site layout (meters). The CETEC slabs occupy x -16..24, z -35..19.   */
/* ------------------------------------------------------------------ */
const PLAZA = { x: 0, z: -12, w: 92, d: 80 }; // paved campus ground around the building
const PARKING = { x: 68, z: 2, w: 34, d: 40 };
const ROAD = { z: 40, w: 14 }; // four lanes
const SIDEWALK = 4;
const CAMPUS: { position: [number, number]; w: number; d: number; floors: number; rot?: number }[] = [
  { position: [-78, -14], w: 24, d: 40, floors: 3 },
  { position: [-70, -80], w: 46, d: 18, floors: 4, rot: 0.08 },
  { position: [72, -58], w: 38, d: 20, floors: 3, rot: -0.05 },
  { position: [20, -95], w: 30, d: 16, floors: 5 },
];
const PYRAMID: [number, number] = [-120, -40];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useSiteMaterials() {
  return useMemo(
    () => ({
      grass: makeGrassMaterial(),
      paving: makeConcreteMaterial({ color: "#c9ccce", panel: [2, 2], ribs: false }),
      sidewalk: makeConcreteMaterial({ color: "#d5d3cd", panel: [1.5, 1.5], ribs: false }),
      asphalt: makeConcreteMaterial({ color: "#3d4247", panel: [400, 400], ribs: false }),
      white: makeConcreteMaterial({ color: "#eeece7", panel: [3, 1.2], ribs: false }),
      window: makeGlassMaterial({ color: "#23404d", mullion: [1.5, 20] }),
    }),
    []
  );
}
type SiteMats = ReturnType<typeof useSiteMaterials>;

/* ----------------------------- Trees -------------------------------- */

type TreeKind = "oak" | "round" | "cypress";
interface TreeSpec {
  x: number;
  z: number;
  s: number;
  kind: TreeKind;
  tone: number;
}

const GREENS = ["#2f6b3a", "#3b7d45", "#2a5f33", "#4a8a4f", "#557f3c"].map((c) => new THREE.Color(c));

/** All trees drawn with a handful of instanced meshes (trunks + canopy blobs). */
function Trees({ trees }: { trees: TreeSpec[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const blobs = useRef<THREE.InstancedMesh>(null);
  const cones = useRef<THREE.InstancedMesh>(null);

  const layout = useMemo(() => {
    const trunk: THREE.Matrix4[] = [];
    const blob: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const cone: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const o = new THREE.Object3D();
    const rand = mulberry32(99);
    for (const t of trees) {
      const h = t.kind === "cypress" ? 2.5 : 2.2;
      o.position.set(t.x, (h * t.s) / 2, t.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(t.s, t.s * (h / 2), t.s);
      o.updateMatrix();
      trunk.push(o.matrix.clone());
      const col = GREENS[t.tone % GREENS.length];
      if (t.kind === "cypress") {
        o.position.set(t.x, t.s * 5.2, t.z);
        o.scale.set(t.s * 1.4, t.s * 7, t.s * 1.4);
        o.updateMatrix();
        cone.push({ m: o.matrix.clone(), c: col });
        continue;
      }
      const puffs = t.kind === "oak" ? 5 : 3;
      for (let i = 0; i < puffs; i++) {
        const a = (i / puffs) * Math.PI * 2 + rand();
        const r = i === 0 ? 0 : (t.kind === "oak" ? 1.6 : 0.9) * t.s;
        const size = (i === 0 ? (t.kind === "oak" ? 2.6 : 2.2) : 1.5 + rand() * 0.5) * t.s;
        o.position.set(t.x + Math.cos(a) * r, t.s * (t.kind === "oak" ? 3.6 : 3.8) + (i === 0 ? 0.6 * t.s : rand() * t.s), t.z + Math.sin(a) * r);
        o.rotation.set(rand() * 3, rand() * 3, 0);
        o.scale.setScalar(size);
        o.updateMatrix();
        blob.push({ m: o.matrix.clone(), c: col.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.06) });
      }
    }
    return { trunk, blob, cone };
  }, [trees]);

  useLayoutEffect(() => {
    layout.trunk.forEach((m, i) => trunks.current?.setMatrixAt(i, m));
    layout.blob.forEach((b, i) => {
      blobs.current?.setMatrixAt(i, b.m);
      blobs.current?.setColorAt(i, b.c);
    });
    layout.cone.forEach((b, i) => {
      cones.current?.setMatrixAt(i, b.m);
      cones.current?.setColorAt(i, b.c);
    });
    for (const r of [trunks, blobs, cones]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
    }
  }, [layout]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, layout.trunk.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 2, 7]} />
        <meshStandardMaterial color="#5b4232" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={blobs} args={[undefined, undefined, layout.blob.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={cones} args={[undefined, undefined, Math.max(1, layout.cone.length)]} castShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
    </group>
  );
}

/** Deterministic tree placement: street rows, plaza rows and clusters on the lawns. */
function useTreeLayout(): TreeSpec[] {
  return useMemo(() => {
    const rand = mulberry32(7);
    const out: TreeSpec[] = [];
    const kinds: TreeKind[] = ["oak", "oak", "round", "cypress"];
    const blocked = (x: number, z: number) =>
      (x > -22 && x < 30 && z > -40 && z < 28) || // building + entrance plaza
      (Math.abs(x - PARKING.x) < PARKING.w / 2 + 2 && Math.abs(z - PARKING.z) < PARKING.d / 2 + 2) ||
      Math.abs(z - ROAD.z) < ROAD.w / 2 + SIDEWALK + 1 ||
      CAMPUS.some((b) => Math.abs(x - b.position[0]) < b.w / 2 + 4 && Math.abs(z - b.position[1]) < b.d / 2 + 4) ||
      Math.hypot(x - PYRAMID[0], z - PYRAMID[1]) < 24;
    // street tree row on the campus side
    for (let x = -120; x <= 120; x += 11) {
      if (Math.abs(x - 4) < 14) continue; // keep the entrance view open
      out.push({ x, z: ROAD.z - ROAD.w / 2 - SIDEWALK - 3, s: 1 + rand() * 0.25, kind: "round", tone: 1 });
    }
    // row on the far side of the road
    for (let x = -115; x <= 125; x += 14) out.push({ x, z: ROAD.z + ROAD.w / 2 + SIDEWALK + 3, s: 1.1 + rand() * 0.3, kind: "oak", tone: 2 });
    // plaza rows flanking the building
    for (let z = -44; z <= 20; z += 9) {
      out.push({ x: -32, z, s: 1.05, kind: "round", tone: 3 });
      out.push({ x: 38, z, s: 1.05, kind: "round", tone: 3 });
    }
    // clusters on the lawns around the campus
    for (let i = 0; i < 70; i++) {
      const x = (rand() - 0.5) * 300;
      const z = -60 - rand() * 120;
      if (blocked(x, z)) continue;
      out.push({ x, z, s: 0.9 + rand() * 0.7, kind: kinds[Math.floor(rand() * kinds.length)], tone: Math.floor(rand() * 5) });
    }
    for (let i = 0; i < 40; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (55 + rand() * 90);
      const z = -60 + rand() * 90;
      if (blocked(x, z) || (side > 0 && Math.abs(x - PARKING.x) < 22)) continue;
      out.push({ x, z, s: 0.9 + rand() * 0.6, kind: kinds[Math.floor(rand() * kinds.length)], tone: Math.floor(rand() * 5) });
    }
    return out;
  }, []);
}

/* ----------------------------- Street ------------------------------- */

function Street({ m }: { m: SiteMats }) {
  const len = 600;
  const geoms = useMemo(
    () => ({
      road: groundPlane(len, ROAD.w),
      walk: groundPlane(len, SIDEWALK),
      curb: boxGeometry(len, 0.18, 0.3),
    }),
    []
  );
  const dashes = useMemo(() => Array.from({ length: 60 }, (_, i) => -300 + i * 10), []);
  const nearEdge = ROAD.z - ROAD.w / 2;
  const farEdge = ROAD.z + ROAD.w / 2;
  return (
    <group>
      <mesh geometry={geoms.road} material={m.asphalt} position={[0, 0.02, ROAD.z]} receiveShadow />
      {[nearEdge - SIDEWALK / 2, farEdge + SIDEWALK / 2].map((z) => (
        <mesh key={z} geometry={geoms.walk} material={m.sidewalk} position={[0, 0.12, z]} receiveShadow />
      ))}
      {[nearEdge, farEdge].map((z) => (
        <mesh key={z} geometry={geoms.curb} material={m.white} position={[0, 0.09, z]} receiveShadow />
      ))}
      {/* double yellow center line, dashed white lane lines */}
      {[-0.15, 0.15].map((dz) => (
        <mesh key={dz} position={[0, 0.03, ROAD.z + dz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[len, 0.12]} />
          <meshStandardMaterial color="#e2b93b" roughness={0.8} />
        </mesh>
      ))}
      {[-ROAD.w / 4, ROAD.w / 4].flatMap((dz) =>
        dashes.map((x) => (
          <mesh key={`${dz}${x}`} position={[x, 0.03, ROAD.z + dz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3, 0.12]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.8} />
          </mesh>
        ))
      )}
      {/* crosswalk at the entrance */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-4 + i * 1.1, 0.031, ROAD.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.55, ROAD.w - 1]} />
          <meshStandardMaterial color="#f1f1f1" roughness={0.8} />
        </mesh>
      ))}
      <StreetLamps xs={Array.from({ length: 17 }, (_, i) => -128 + i * 16)} z={nearEdge - SIDEWALK + 0.6} />
      <StreetLamps xs={Array.from({ length: 17 }, (_, i) => -120 + i * 16)} z={farEdge + SIDEWALK - 0.6} flip />
      <Traffic />
    </group>
  );
}

function StreetLamps({ xs, z, flip = false }: { xs: number[]; z: number; flip?: boolean }) {
  const dir = flip ? -1 : 1;
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, z]}>
          <mesh castShadow position={[0, 3.5, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 7, 8]} />
            <meshStandardMaterial color="#3a4047" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 7, dir * 0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.6, 6]} />
            <meshStandardMaterial color="#3a4047" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 6.9, dir * 1.6]}>
            <boxGeometry args={[0.35, 0.15, 0.8]} />
            <meshStandardMaterial color="#2b3036" emissive="#fff4d6" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------ Cars -------------------------------- */

const CAR_COLORS = ["#e5e7eb", "#1f2937", "#9ca3af", "#b91c1c", "#1d4ed8", "#f5f5f4", "#374151", "#ca8a04"];

function Car({ position, rotation = 0, color }: { position: [number, number, number]; rotation?: number; color: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1.8, 0.65, 4.3]} />
        <meshPhysicalMaterial color={color} metalness={0.5} roughness={0.3} clearcoat={1} />
      </mesh>
      <mesh castShadow position={[0, 1.15, -0.2]}>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshPhysicalMaterial color="#1c2530" metalness={0.8} roughness={0.08} />
      </mesh>
      {[-0.8, 0.8].flatMap((x) =>
        [-1.35, 1.35].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.33, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.33, 0.33, 0.25, 12]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
        ))
      )}
    </group>
  );
}

function Traffic() {
  const cars: [number, number, number][] = [
    [-60, ROAD.z - 5.2, 0],
    [-18, ROAD.z - 1.8, 1],
    [30, ROAD.z - 5.2, 2],
    [85, ROAD.z - 1.8, 3],
    [-90, ROAD.z + 1.8, 4],
    [10, ROAD.z + 5.2, 5],
    [58, ROAD.z + 1.8, 6],
  ];
  return (
    <group>
      {cars.map(([x, z, c]) => (
        <Car key={`${x}${z}`} position={[x, 0, z]} rotation={z < ROAD.z ? -Math.PI / 2 : Math.PI / 2} color={CAR_COLORS[c]} />
      ))}
    </group>
  );
}

function ParkingLot({ m }: { m: SiteMats }) {
  const geom = useMemo(() => groundPlane(PARKING.w, PARKING.d), []);
  const { rows, stalls, parked } = useMemo(() => {
    const rand = mulberry32(3);
    const rows = [-12, 12];
    const stalls = Array.from({ length: 13 }, (_, i) => -PARKING.d / 2 + 2 + i * 2.8);
    const parked = rows.flatMap((rx) =>
      stalls.slice(0, -1).flatMap((z) => (rand() < 0.62 ? [{ x: rx, z: z + 1.4, c: Math.floor(rand() * CAR_COLORS.length) }] : []))
    );
    return { rows, stalls, parked };
  }, []);
  return (
    <group position={[PARKING.x, 0, PARKING.z]}>
      <mesh geometry={geom} material={m.asphalt} position={[0, 0.02, 0]} receiveShadow />
      {rows.flatMap((rx) =>
        stalls.map((z) => (
          <mesh key={`${rx}${z}`} position={[rx, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[5.2, 0.12]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.8} />
          </mesh>
        ))
      )}
      {parked.map((p) => (
        <Car key={`${p.x}${p.z}`} position={[p.x, 0, p.z]} rotation={p.x < 0 ? Math.PI / 2 : -Math.PI / 2} color={CAR_COLORS[p.c]} />
      ))}
    </group>
  );
}

/* --------------------------- Campus blocks -------------------------- */

/** White modernist campus building: stacked floor slabs with recessed window bands. */
function CampusBlock({ m, position, w, d, floors, rot = 0 }: { m: SiteMats; position: [number, number]; w: number; d: number; floors: number; rot?: number }) {
  const fh = 4;
  const geoms = useMemo(() => ({ band: boxGeometry(w, 1.2, d), glass: boxGeometry(w - 0.8, fh - 1.2, d - 0.8) }), [w, d]);
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rot, 0]}>
      {Array.from({ length: floors }, (_, k) => (
        <group key={k}>
          <mesh geometry={geoms.glass} material={m.window} position={[0, k * fh + (fh - 1.2) / 2, 0]} castShadow receiveShadow />
          <mesh geometry={geoms.band} material={m.white} position={[0, k * fh + fh - 0.6, 0]} castShadow receiveShadow />
        </group>
      ))}
      {/* rooftop plant box */}
      <mesh position={[w * 0.2, floors * fh + 1, 0]} castShadow>
        <boxGeometry args={[w * 0.25, 2, d * 0.35]} />
        <meshStandardMaterial color="#d9d9d6" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** The Tec's pyramid-shaped building: stone faces with one glazed face. */
function Pyramid({ position }: { position: [number, number] }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, Math.PI / 4, 0]}>
      <mesh castShadow receiveShadow position={[0, 9, 0]}>
        <coneGeometry args={[18, 18, 4, 1]} />
        <meshStandardMaterial color="#c49a7a" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 9.05, 0]} scale={1.004}>
        <coneGeometry args={[18, 18, 4, 1, true, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#3f6f8f" metalness={0.85} roughness={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ------------------------ Entrance furniture ------------------------ */

function EntranceDetails({ m }: { m: SiteMats }) {
  const planter = useMemo(() => boxGeometry(4, 0.8, 1.6), []);
  return (
    <group>
      {/* flagpoles: Mexico, USA, Estonia */}
      <Flags position={[-7, 0, 30]} />
      {/* planters with shrubs and benches along the entrance plaza */}
      {[-14, 22].flatMap((x) =>
        [8, 16, 24].map((z) => (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <mesh geometry={planter} material={m.white} position={[0, 0.4, 0]} castShadow receiveShadow />
            {[-1.2, 0, 1.2].map((dx) => (
              <mesh key={dx} position={[dx, 1.1, 0]} castShadow>
                <icosahedronGeometry args={[0.6, 1]} />
                <meshStandardMaterial color="#3f7d45" roughness={0.9} flatShading />
              </mesh>
            ))}
            <mesh position={[x < 0 ? 2.2 : -2.2, 0.45, 0]} castShadow>
              <boxGeometry args={[0.5, 0.12, 2]} />
              <meshStandardMaterial color="#8b6b4a" roughness={0.8} />
            </mesh>
          </group>
        ))
      )}
      {/* bollards at the plaza edge */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-14 + i * 3.2, 0.5, 28.5]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 1, 8]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------- Mountains ----------------------------- */

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

const gauss = (x: number, c: number, w: number, h: number) => h * Math.exp(-(((x - c) / w) ** 2));
// Cerro de la Silla: broad massif with the two sharp "saddle" horns and a notch between.
const cerroDeLaSilla = (x: number) =>
  Math.max(gauss(x, 30, 70, 30), gauss(x, 52, 16, 44), gauss(x, 62, 7, 62), gauss(x, 80, 6.5, 57), gauss(x, 71, 14, 45), gauss(x, 102, 22, 34));
// Sierra Madre range to the west, lower and further back.
const sierraMadre = (x: number) => Math.max(gauss(x, -60, 45, 38), gauss(x, -130, 40, 44), gauss(x, -10, 30, 26), gauss(x, 150, 60, 30));
const silla = (x: number) => cerroDeLaSilla(x / 4) * 1.7;
const sierra = (x: number) => sierraMadre(x / 3.5) * 1.6;

/* ------------------------------ Scene ------------------------------- */

export default function Environment() {
  const m = useSiteMaterials();
  const trees = useTreeLayout();
  const geoms = useMemo(() => ({ ground: groundPlane(900, 900), plaza: groundPlane(PLAZA.w, PLAZA.d) }), []);

  return (
    <group>
      {/* Lights */}
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#c4d9f5", "#3f4a3a", 0.65]} />
      <directionalLight
        position={[60, 90, 70]}
        intensity={1.9}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={100}
        shadow-camera-bottom={-90}
        shadow-camera-far={360}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-30, 20, -30]} intensity={0.35} color="#9fc2ff" />

      <mesh geometry={geoms.ground} material={m.grass} position={[0, -0.02, 0]} receiveShadow />
      <mesh geometry={geoms.plaza} material={m.paving} position={[PLAZA.x, 0.01, PLAZA.z]} receiveShadow />

      <Street m={m} />
      <ParkingLot m={m} />
      <EntranceDetails m={m} />
      <Trees trees={trees} />

      {/* Campus context */}
      {CAMPUS.map((b) => (
        <CampusBlock key={b.position.join()} m={m} {...b} />
      ))}
      <Pyramid position={PYRAMID} />

      {/* Monterrey skyline: Cerro de la Silla in front, Sierra Madre behind */}
      <Ridge position={[-420, 0, -380]} width={1100} depth={200} profile={silla} low="#4f6a45" high="#7a8c9d" />
      <Ridge position={[160, 0, -420]} width={1100} depth={220} profile={sierra} low="#6f8196" high="#9aaabd" />
    </group>
  );
}
