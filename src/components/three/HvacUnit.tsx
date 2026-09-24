"use client";

import { STATUS_META, type HvacUnit as HvacUnitData } from "@/data/sentinel";
import { useFrame } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import * as THREE from "three";

/** Altura del ancla del marcador flotante sobre la losa (la usa el proyector). */
export const UNIT_ANCHOR_DY = 3.9;

/** Offset X del grupo respecto al origen (la losa está centrada en x=1). */
export const ROOF_OFFSET_X = 1;

export function unitAnchor(
  unit: HvacUnitData,
  rooftopY: number,
  out = new THREE.Vector3()
) {
  return out.set(
    unit.position[0] + ROOF_OFFSET_X,
    rooftopY + UNIT_ANCHOR_DY,
    unit.position[2]
  );
}

function Fan({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 6;
  });
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.12, 20]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh ref={ref} position={[0, 0.13, 0]}>
        <boxGeometry args={[0.68, 0.03, 0.12]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.13, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.68, 0.03, 0.12]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* rejilla del ventilador */}
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.42, 0.03, 8, 24]} />
        <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

export default function HvacUnit3D({
  unit,
  rooftopY,
  hovered,
  onHover,
}: {
  unit: HvacUnitData;
  rooftopY: number;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const router = useRouter();
  const meta = STATUS_META[unit.status];
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.12;
      beaconRef.current.scale.setScalar(s);
    }
  });

  const go = () => router.push(unit.route);
  const y = rooftopY + 0.15;

  return (
    <group position={[unit.position[0] + ROOF_OFFSET_X, y, unit.position[2]]}>
      {/* patas */}
      {[[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.1, z]} castShadow>
          <boxGeometry args={[0.18, 0.2, 0.18]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
      ))}

      {/* cuerpo principal — clicable */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.85, 0]}
        onClick={(e) => {
          e.stopPropagation();
          go();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(unit.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={[2.4, 1.3, 1.7]} />
        <meshStandardMaterial
          color={hovered ? "#e8edf3" : "#c3ccd6"}
          roughness={0.42}
          metalness={0.35}
          emissive={hovered ? meta.hex : "#000000"}
          emissiveIntensity={hovered ? 0.22 : 0}
        />
      </mesh>

      {/* tapa superior */}
      <mesh castShadow position={[0, 1.53, 0]}>
        <boxGeometry args={[2.5, 0.08, 1.8]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* ventiladores */}
      <Fan position={[-0.6, 1.57, 0]} />
      <Fan position={[0.6, 1.57, 0]} />

      {/* rejilla frontal */}
      {[0.55, 0.75, 0.95, 1.15].map((gy) => (
        <mesh key={gy} position={[0, gy, 0.86]}>
          <boxGeometry args={[2.0, 0.07, 0.04]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </mesh>
      ))}

      {/* placa lateral */}
      <mesh position={[-1.21, 0.85, 0]}>
        <boxGeometry args={[0.02, 0.7, 1.0]} />
        <meshStandardMaterial color="#8fa0b3" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* SentinelBox edge device con LED de estado */}
      <mesh castShadow position={[1.32, 0.7, 0.4]}>
        <boxGeometry args={[0.28, 0.5, 0.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[1.32, 0.82, 0.62]}>
        <boxGeometry args={[0.1, 0.1, 0.03]} />
        <meshStandardMaterial
          color={meta.hex}
          emissive={meta.hex}
          emissiveIntensity={2.2}
        />
      </mesh>

      {/* mástil + baliza luminosa */}
      <mesh position={[-1.05, 1.9, -0.6]}>
        <cylinderGeometry args={[0.03, 0.03, 1.0, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh ref={beaconRef} position={[-1.05, 2.5, -0.6]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color={meta.hex}
          emissive={meta.hex}
          emissiveIntensity={2.5}
        />
      </mesh>
      <pointLight
        position={[-1.05, 2.5, -0.6]}
        color={meta.hex}
        intensity={2.2}
        distance={6}
      />
    </group>
  );
}
