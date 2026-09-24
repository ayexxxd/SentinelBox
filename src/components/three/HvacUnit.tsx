"use client";

import { STATUS_META, type HvacStatus, type HvacUnit as HvacUnitData } from "@/data/sentinel";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Rooftop cooling tower (white EVAPCO-style cell):
 * steel skid, dark louvered air-intake band, ribbed white casing, two fan stacks,
 * side ladder and white condenser-water piping. A SentinelBox edge device with a
 * status LED is mounted on the front.
 */

/** Height of the floating marker anchor above the terrace (used by the projector). */
export const UNIT_ANCHOR_DY = 5.4;

export function unitAnchor(unit: HvacUnitData, rooftopY: number, out = new THREE.Vector3()) {
  return out.set(unit.position[0], rooftopY + UNIT_ANCHOR_DY, unit.position[2]);
}

const W = 5; // length (x)
const D = 3.2; // depth (z)
const SKID_H = 0.45;
const INTAKE_H = 1.35;
const CASING_H = 1.8;
const TOP_Y = SKID_H + INTAKE_H + CASING_H;

const WHITE = "#eef1f3";

function FanStack({ x }: { x: number }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.y += dt * 5;
  });
  return (
    <group position={[x, TOP_Y, 0]}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.05, 1.1, 0.8, 32, 1, true]} />
        <meshStandardMaterial color={WHITE} roughness={0.45} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.05, 8, 32]} />
        <meshStandardMaterial color="#d7dcdf" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.02, 32]} />
        <meshStandardMaterial color="#1a1f24" roughness={0.8} />
      </mesh>
      <group ref={blades} position={[0, 0.3, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation={[0.25, (i * Math.PI) / 3, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[1.8, 0.03, 0.22]} />
            <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.16, 0.16, 0.12, 16]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function Ladder() {
  const rungs = useMemo(() => Array.from({ length: 11 }, (_, i) => 0.3 + i * 0.35), []);
  return (
    <group position={[W / 2 + 0.12, 0, 0.7]}>
      {[-0.28, 0.28].map((z) => (
        <mesh key={z} position={[0, TOP_Y / 2 + 0.5, z]}>
          <boxGeometry args={[0.05, TOP_Y + 1, 0.05]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {rungs.map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.56]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export default function HvacUnit3D({
  unit,
  status,
  rooftopY,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  unit: HvacUnitData;
  status: HvacStatus;
  rooftopY: number;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const meta = STATUS_META[status];
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (beaconRef.current) beaconRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.14);
  });

  // Intake openings: 3 on each long face, 2 on each short face.
  const openings = useMemo(() => {
    const out: { p: [number, number, number]; r: number; w: number }[] = [];
    const y = SKID_H + INTAKE_H / 2;
    for (const x of [-1.6, 0, 1.6]) {
      out.push({ p: [x, y, D / 2 + 0.01], r: 0, w: 1.35 });
      out.push({ p: [x, y, -D / 2 - 0.01], r: Math.PI, w: 1.35 });
    }
    for (const z of [-0.75, 0.75]) {
      out.push({ p: [W / 2 + 0.01, y, z], r: Math.PI / 2, w: 1.25 });
      out.push({ p: [-W / 2 - 0.01, y, z], r: -Math.PI / 2, w: 1.25 });
    }
    return out;
  }, []);

  const ribs = useMemo(() => Array.from({ length: 9 }, (_, i) => -W / 2 + 0.5 + i * 0.5), []);

  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(unit.id);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover(unit.id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHover(null);
      document.body.style.cursor = "auto";
    },
  };

  return (
    <group position={[unit.position[0], rooftopY, unit.position[2]]}>
      {/* steel skid */}
      <mesh castShadow receiveShadow position={[0, SKID_H / 2, 0]}>
        <boxGeometry args={[W + 0.3, SKID_H, D + 0.3]} />
        <meshStandardMaterial color="#3f464e" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* body (click target): intake band + casing */}
      <mesh castShadow receiveShadow position={[0, SKID_H + (INTAKE_H + CASING_H) / 2, 0]} {...handlers}>
        <boxGeometry args={[W, INTAKE_H + CASING_H, D]} />
        <meshStandardMaterial
          color={WHITE}
          roughness={0.45}
          metalness={0.15}
          emissive={hovered || selected ? meta.hex : "#000000"}
          emissiveIntensity={selected ? 0.28 : hovered ? 0.18 : 0}
        />
      </mesh>
      {openings.map((o, i) => (
        <mesh key={i} position={o.p} rotation={[0, o.r, 0]}>
          <planeGeometry args={[o.w, INTAKE_H - 0.3]} />
          <meshStandardMaterial color="#14181c" roughness={0.9} />
        </mesh>
      ))}
      {/* vertical casing ribs */}
      {ribs.map((x) => (
        <group key={x}>
          <mesh position={[x, SKID_H + INTAKE_H + CASING_H / 2, D / 2 + 0.03]}>
            <boxGeometry args={[0.05, CASING_H - 0.1, 0.05]} />
            <meshStandardMaterial color="#d6dbdf" roughness={0.5} />
          </mesh>
          <mesh position={[x, SKID_H + INTAKE_H + CASING_H / 2, -D / 2 - 0.03]}>
            <boxGeometry args={[0.05, CASING_H - 0.1, 0.05]} />
            <meshStandardMaterial color="#d6dbdf" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* band between intake and casing */}
      <mesh position={[0, SKID_H + INTAKE_H, 0]}>
        <boxGeometry args={[W + 0.06, 0.08, D + 0.06]} />
        <meshStandardMaterial color="#cfd5da" roughness={0.5} />
      </mesh>
      {/* top deck */}
      <mesh castShadow position={[0, TOP_Y + 0.04, 0]}>
        <boxGeometry args={[W + 0.1, 0.08, D + 0.1]} />
        <meshStandardMaterial color="#dfe4e7" roughness={0.5} />
      </mesh>

      <FanStack x={-1.2} />
      <FanStack x={1.2} />
      <Ladder />

      {/* condenser-water piping running back toward the tower */}
      {[-0.9, -0.45].map((x, i) => (
        <group key={x}>
          <mesh castShadow position={[x, 0.75 + i * 0.25, -D / 2 - 1.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 3.2, 14]} />
            <meshStandardMaterial color="#f4f6f7" roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* SentinelBox edge device with status LED */}
      <group position={[1.9, SKID_H + INTAKE_H + 0.9, D / 2 + 0.16]}>
        <mesh castShadow>
          <boxGeometry args={[0.46, 0.6, 0.24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.14, 0.125]}>
          <boxGeometry args={[0.13, 0.13, 0.02]} />
          <meshStandardMaterial color={meta.hex} emissive={meta.hex} emissiveIntensity={2.4} />
        </mesh>
      </group>

      {/* beacon mast */}
      <mesh position={[-W / 2 + 0.3, TOP_Y + 0.6, -D / 2 + 0.3]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh ref={beaconRef} position={[-W / 2 + 0.3, TOP_Y + 1.3, -D / 2 + 0.3]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={meta.hex} emissive={meta.hex} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <pointLight position={[-W / 2 + 0.3, TOP_Y + 1.3, -D / 2 + 0.3]} color={meta.hex} intensity={3} distance={7} />
    </group>
  );
}
