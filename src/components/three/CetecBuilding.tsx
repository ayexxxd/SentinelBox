"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { boxGeometry, makeConcreteMaterial, makeGlassMaterial, slabGeometry } from "./materials";

/**
 * CETEC, Tec de Monterrey ("El Servilletero", Óscar Bulnes, 1989). Units are meters.
 *
 * Two identical slabs standing in parallel vertical planes that FACE EACH OTHER across a
 * gap — napkins in a holder. Each face is a rectangle (SLAB.shear can slant it toward a
 * rhombus), tilted 20° in its own plane, mirrored: the west one rises
 * toward the front, the east one toward the back. Each is planted on its lowest corner
 * (everything below y=0 is clipped by the materials):
 *  - WEST, glass curtain wall on every face.
 *  - EAST, the same slab, also glass on every face.
 * An elevated bridge spans the gap from one inner face to the other, touching nothing
 * but the two slabs; its roof carries the HVAC units.
 *
 * Planes are perpendicular to x; each slab's long edge lies along z before tilting.
 */

const THICK = 10;
const deg = THREE.MathUtils.DEG2RAD;

// Same slab for both. `shear` slants the short edges (x += shear·y) toward a rhombus.
const SLAB = { long: 46, short: 30, tilt: 45 * deg, shear: 0, zCenter: -8, buried: 20 };

/** Height of the slab center so the lowest corner sits `buried` m below ground. */
const CENTER_Y = (() => {
  const { long: L, short: H, tilt, shear } = SLAB;
  const cx = L / 2 + (shear * H) / 2;
  const ys = [0, H].flatMap((y) => [0, L].map((x) => (x + shear * y - cx) * Math.sin(tilt) + (y - H / 2) * Math.cos(tilt)));
  return -Math.min(...ys) - SLAB.buried;
})();

/** Slab geometry (corner at origin) sheared into a parallelogram; `sign` mirrors the shear. */
function shearedSlab(long: number, short: number, sign: number, yOffset = 0) {
  const g = slabGeometry(long, short, THICK);
  g.translate(0, yOffset, 0);
  g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, sign * SLAB.shear, 0, 0, 0));
  return g;
}
const WEST = { xInner: -6, lean: -1 }; // high end toward the front (+z)
const EAST = { xInner: 14, lean: 1 }; // high end toward the back (-z)

/** Elevated bridge between the inner faces; its roof carries the HVAC units. */
export const BRIDGE = { x0: WEST.xInner, x1: EAST.xInner, z0: SLAB.zCenter - 5, z1: SLAB.zCenter + 5, y0: 10, y1: 15 };
export const ROOF_Y = BRIDGE.y1 + 0.12;

function useMaterials() {
  return useMemo(
    () => ({
      smooth: makeConcreteMaterial({ color: "#d6ccbc", panel: [4.5, 1.5], ribs: false }),
      glass: makeGlassMaterial({ color: "#1f5d5a", mullion: [1.6, 3.9] }),
      ribbon: makeGlassMaterial({ color: "#182a33", mullion: [1.8, 10] }),
    }),
    []
  );
}
type Mats = ReturnType<typeof useMaterials>;

/**
 * Frame for a slab centered at (x, CENTER_Y, zCenter) in a plane perpendicular to x:
 * local x (long edge) points to -z, local y up, local z (thickness) along +x, and the
 * whole frame is tilted by `lean` × the slab tilt in that plane. Children are centered.
 */
function SlabFrame({ x, lean, children }: { x: number; lean: number; children: React.ReactNode }) {
  return (
    <group position={[x, CENTER_Y, SLAB.zCenter]} rotation={[0, Math.PI / 2, 0]}>
      <group rotation={[0, 0, lean * SLAB.tilt]}>
        <group position={[-SLAB.long / 2 - (lean * SLAB.shear * SLAB.short) / 2, -SLAB.short / 2, 0]}>{children}</group>
      </group>
    </group>
  );
}

function WestSlab({ m }: { m: Mats }) {
  const geom = useMemo(() => shearedSlab(SLAB.long, SLAB.short, WEST.lean), []);
  return (
    <SlabFrame x={WEST.xInner - THICK / 2} lean={WEST.lean}>
      <mesh geometry={geom} material={m.glass} castShadow receiveShadow />
    </SlabFrame>
  );
}

function EastSlab({ m }: { m: Mats }) {
  const geom = useMemo(() => shearedSlab(SLAB.long, SLAB.short, EAST.lean), []);
  return (
    <SlabFrame x={EAST.xInner + THICK / 2} lean={EAST.lean}>
      <mesh geometry={geom} material={m.glass} castShadow receiveShadow />
    </SlabFrame>
  );
}

/** Enclosed skybridge: concrete deck and roof bands with a glass ribbon between. */
function Bridge({ m }: { m: Mats }) {
  const w = BRIDGE.x1 - BRIDGE.x0 + 2; // runs 1 m into each slab
  const d = BRIDGE.z1 - BRIDGE.z0;
  const h = BRIDGE.y1 - BRIDGE.y0;
  const band = 1.3;
  const geoms = useMemo(
    () => ({
      band: boxGeometry(w, band, d),
      glass: boxGeometry(w, h - 2 * band, d - 1),
    }),
    [w, d, h]
  );
  return (
    <group position={[(BRIDGE.x0 + BRIDGE.x1) / 2, 0, (BRIDGE.z0 + BRIDGE.z1) / 2]}>
      <mesh geometry={geoms.band} material={m.smooth} position={[0, BRIDGE.y0 + band / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geoms.glass} material={m.ribbon} position={[0, BRIDGE.y0 + h / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geoms.band} material={m.smooth} position={[0, BRIDGE.y1 - band / 2, 0]} castShadow receiveShadow />
      <mesh position={[0, ROOF_Y - 0.05, 0]} receiveShadow>
        <boxGeometry args={[w - 2, 0.1, d]} />
        <meshStandardMaterial color="#b9bbb6" roughness={0.9} />
      </mesh>
      <Railing w={w - 2} d={d} />
    </group>
  );
}

function Railing({ w, d }: { w: number; d: number }) {
  const posts = useMemo(() => {
    const pts: [number, number][] = [];
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.5) pts.push([x, -d / 2], [x, d / 2]);
    return pts;
  }, [w, d]);
  return (
    <group>
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[0, ROOF_Y + 1, (sz * d) / 2]}>
          <boxGeometry args={[w, 0.06, 0.06]} />
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

/** Entrance plaza pavers at the open front of the gap. */
function Plaza() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[4, 0.03, 14]}>
      <planeGeometry args={[34, 26]} />
      <meshStandardMaterial color="#c7a79b" roughness={0.95} />
    </mesh>
  );
}

export default function CetecBuilding() {
  const m = useMaterials();
  return (
    <group>
      <Plaza />
      <WestSlab m={m} />
      <EastSlab m={m} />
      <Bridge m={m} />
    </group>
  );
}
