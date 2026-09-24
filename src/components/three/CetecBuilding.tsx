"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { boxGeometry, hexahedron, makeConcreteMaterial, makeGlassMaterial, slabGeometry } from "./materials";

/**
 * CETEC, Tec de Monterrey ("El Servilletero", Óscar Bulnes, 1989). Units are meters.
 *
 *  - WEST volume, all ribbed concrete: a leaning frustum ~45 m tall. Its street face is a
 *    trapezoid narrowing upward and leaning back 30° from vertical; the sides taper too.
 *    A diagonal slot splits it into two pieces — the "napkins" in the holder.
 *  - EAST volume: a parallelepiped slab tipped 25° in its own plane, planted in the
 *    ground (everything below y=0 is clipped). Glass curtain wall on the street face,
 *    concrete roof, back and ends. Its high end rests on three stepped office floors
 *    whose ground level is the open entrance with red columns.
 */

const WEST_TILT = 30 * THREE.MathUtils.DEG2RAD;
const WEST_H = 45;
const WEST_BASE = { x0: -54, x1: -10, zFront: 16, zBack: -16 };
const WEST_TOP = { x0: -38, x1: -27, depth: 11 };
const SLOT = { bottom: 0.62, top: 0.38, gap: 0.7 }; // slot position as a fraction of the width

const EAST_TILT = 25 * THREE.MathUtils.DEG2RAD;
const LONG = 52;
const SHORT = 34;
const THICK = 18;
// East volume: its high-end lower corner, next to the west volume.
const EAST = { x: -6, y: 13.5, zFront: -4 };

const FLOOR_H = 4.5;
const FLOORS = 3;
/** Mechanical terrace (roof of the first floor, in front of the glass) for the HVAC units. */
export const TERRACE = { x0: 6, x1: 30, z0: EAST.zFront, z1: 10, y: FLOOR_H };
export const ROOF_Y = TERRACE.y + 0.12;

function useMaterials() {
  return useMemo(
    () => ({
      concrete: makeConcreteMaterial({ color: "#dccfbb", panel: [3.2, 1.6] }),
      concreteSmooth: makeConcreteMaterial({ color: "#d6ccbc", panel: [4.5, 1.5], ribs: false }),
      glass: makeGlassMaterial({ color: "#1f5d5a", mullion: [1.6, 3.9] }),
      ribbon: makeGlassMaterial({ color: "#182a33", mullion: [1.8, 10] }),
    }),
    []
  );
}

function WestVolume({ m }: { m: ReturnType<typeof useMaterials> }) {
  const geoms = useMemo(() => {
    const { x0, x1, zFront, zBack } = WEST_BASE;
    const topFront = zFront - WEST_H * Math.tan(WEST_TILT);
    const topBack = topFront - WEST_TOP.depth;
    const xb = x0 + (x1 - x0) * SLOT.bottom;
    const xt = WEST_TOP.x0 + (WEST_TOP.x1 - WEST_TOP.x0) * SLOT.top;
    const g = SLOT.gap / 2;
    const H = WEST_H;
    // [bottom-left, bottom-right, top-left, top-right] x-extents of each piece
    const pieces: [number, number, number, number][] = [
      [x0, xb - g, WEST_TOP.x0, xt - g],
      [xb + g, x1, xt + g, WEST_TOP.x1],
    ];
    return pieces.map(([bl, br, tl, tr]) =>
      hexahedron([
        [bl, 0, zFront],
        [br, 0, zFront],
        [br, 0, zBack],
        [bl, 0, zBack],
        [tl, H, topFront],
        [tr, H, topFront],
        [tr, H, topBack],
        [tl, H, topBack],
      ])
    );
  }, []);
  // groups: front, right, back, left, top, bottom
  const mats = useMemo(() => [m.concrete, m.concrete, m.concrete, m.concrete, m.concreteSmooth, m.concreteSmooth], [m]);
  return (
    <group>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} material={mats} castShadow receiveShadow />
      ))}
    </group>
  );
}

function EastVolume({ m }: { m: ReturnType<typeof useMaterials> }) {
  const geom = useMemo(() => slabGeometry(LONG, SHORT, THICK), []);
  // Box groups: 0 +x, 1 -x, 2 +y (roof), 3 -y (underside), 4 +z (street face), 5 -z.
  const mats = useMemo(() => [m.concreteSmooth, m.concreteSmooth, m.concreteSmooth, m.concreteSmooth, m.glass, m.concreteSmooth], [m]);
  return (
    <mesh
      geometry={geom}
      material={mats}
      position={[EAST.x, EAST.y, EAST.zFront - THICK / 2]}
      rotation={[0, 0, -EAST_TILT]}
      castShadow
      receiveShadow
    />
  );
}

/** Office floors stepping up under the tilted east slab, plus the entrance colonnade. */
function Podium({ m }: { m: ReturnType<typeof useMaterials> }) {
  const zBack = EAST.zFront - THICK;
  const zFront = EAST.zFront + 3;
  const depth = zFront - zBack;
  const x0 = EAST.x - 3;

  const floors = useMemo(
    () =>
      Array.from({ length: FLOORS }, (_, k) => {
        const top = (k + 1) * FLOOR_H;
        // each floor runs until it meets the slab's underside
        const x1 = EAST.x + (EAST.y - top) / Math.tan(EAST_TILT);
        return { k, top, x1, w: x1 - x0 };
      }).filter((f) => f.w > 2),
    [x0]
  );

  const geoms = useMemo(
    () =>
      floors.map((f) => ({
        band: boxGeometry(f.w, 1.3, depth),
        ribbon: boxGeometry(f.w - 0.6, FLOOR_H - 1.3, depth - 1.2),
      })),
    [floors, depth]
  );

  const terrace = useMemo(
    () => boxGeometry(TERRACE.x1 - TERRACE.x0, FLOOR_H, TERRACE.z1 - zFront),
    [zFront]
  );
  const lobby = useMemo(() => boxGeometry(floors[0].w - 4, FLOOR_H - 1.3, depth - 6), [floors, depth]);

  return (
    <group>
      {floors.map((f, i) => (
        <group key={f.k} position={[x0 + f.w / 2, 0, zBack + depth / 2]}>
          {/* recessed dark ribbon window; the ground floor is left open for the entrance */}
          {f.k > 0 && (
            <mesh geometry={geoms[i].ribbon} material={m.ribbon} position={[0, f.top - 1.3 - (FLOOR_H - 1.3) / 2, 0]} castShadow receiveShadow />
          )}
          {/* concrete spandrel band at the floor slab */}
          <mesh geometry={geoms[i].band} material={m.concreteSmooth} position={[0, f.top - 0.65, 0]} castShadow receiveShadow />
        </group>
      ))}

      {/* ground floor: glazed lobby set back behind the colonnade */}
      <mesh
        geometry={lobby}
        material={m.ribbon}
        position={[x0 + (floors[0].w - 4) / 2 + 2, (FLOOR_H - 1.3) / 2, zBack + (depth - 6) / 2]}
        castShadow
        receiveShadow
      />
      {/* red columns at the entrance */}
      {[x0 + 3, x0 + 9, x0 + 15].map((x) => (
        <mesh key={x} position={[x, (FLOOR_H - 1.3) / 2, zFront - 1]} castShadow>
          <boxGeometry args={[0.9, FLOOR_H - 1.3, 0.9]} />
          <meshStandardMaterial color="#b3252c" roughness={0.6} />
        </mesh>
      ))}

      {/* mechanical terrace in front of the glass, where the cooling towers stand */}
      <mesh geometry={terrace} material={m.concreteSmooth} position={[(TERRACE.x0 + TERRACE.x1) / 2, FLOOR_H / 2, (zFront + TERRACE.z1) / 2]} castShadow receiveShadow />
      <mesh position={[(TERRACE.x0 + TERRACE.x1) / 2, ROOF_Y - 0.05, (TERRACE.z0 + TERRACE.z1) / 2]} receiveShadow>
        <boxGeometry args={[TERRACE.x1 - TERRACE.x0 - 0.4, 0.1, TERRACE.z1 - TERRACE.z0 - 0.4]} />
        <meshStandardMaterial color="#b9bbb6" roughness={0.9} />
      </mesh>
      <Railing />
    </group>
  );
}

function Railing() {
  const { x0, x1, z0, z1 } = TERRACE;
  const y = ROOF_Y + 1;
  const rails: [number, number, number, number][] = [
    [(x0 + x1) / 2, z1, x1 - x0, 0.06],
    [x0, (z0 + z1) / 2, 0.06, z1 - z0],
    [x1, (z0 + z1) / 2, 0.06, z1 - z0],
  ];
  const posts = useMemo(() => {
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1 + 0.01; x += 1.5) pts.push([x, z1]);
    for (let z = z0 + 1.5; z < z1; z += 1.5) pts.push([x0, z], [x1, z]);
    return pts;
  }, [x0, x1, z0, z1]);
  return (
    <group>
      {rails.map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sx, 0.06, sz]} />
          <meshStandardMaterial color="#30363d" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, ROOF_Y + 0.5, z]}>
          <boxGeometry args={[0.06, 1, 0.06]} />
          <meshStandardMaterial color="#30363d" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Entrance plaza pavers between the two volumes. */
function Plaza() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0.03, 12]}>
      <planeGeometry args={[30, 24]} />
      <meshStandardMaterial color="#c7a79b" roughness={0.95} />
    </mesh>
  );
}

export default function CetecBuilding() {
  const m = useMaterials();
  return (
    <group>
      <Plaza />
      <WestVolume m={m} />
      <EastVolume m={m} />
      <Podium m={m} />
    </group>
  );
}
