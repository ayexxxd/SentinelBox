"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { applyGlassFresnel, makeWindowTexture } from "./glass";

/**
 * CEDES estilizado según la foto de referencia:
 * - Losa principal alta de vidrio azul reflejante
 * - Ala lateral izquierda más baja (silueta escalonada)
 * - Quina ochavada, bloque trasero, corona escalonada, podio con celosía
 * - Vidrio procedural: textura de ventanas + fresnel + envmap (RoomEnvironment)
 */

function useGlassMaterial(
  color: string,
  map: THREE.Texture | null,
  opts?: { metalness?: number; roughness?: number; fresnel?: number }
) {
  return useMemo(() => {
    const params: THREE.MeshPhysicalMaterialParameters = {
      color,
      metalness: opts?.metalness ?? 0.9,
      roughness: opts?.roughness ?? 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.15,
    };
    // OJO: pasar `map: undefined` explícito hace que three lance warning,
    // por eso solo se asigna cuando hay textura.
    if (map) params.map = map;
    const mat = new THREE.MeshPhysicalMaterial(params);
    applyGlassFresnel(mat, opts?.fresnel ?? 0.55);
    return mat;
  }, [color, map, opts?.metalness, opts?.roughness, opts?.fresnel]);
}

function FloorBands({
  width,
  depth,
  height,
  yBase,
  floors,
}: {
  width: number;
  depth: number;
  height: number;
  yBase: number;
  floors: number;
}) {
  const bands = useMemo(
    () =>
      Array.from(
        { length: floors },
        (_, i) => yBase + ((i + 1) / floors) * height
      ),
    [yBase, height, floors]
  );
  return (
    <group>
      {bands.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[width + 0.1, 0.09, depth + 0.1]} />
          <meshStandardMaterial
            color="#0d2b52"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

export const ROOF_Y = 29; // losa principal: podio 3 + 26

export default function CedesBuilding() {
  const towerTex = useMemo(
    () =>
      typeof document !== "undefined"
        ? makeWindowTexture(17, 9, 7)
        : null,
    []
  );
  const wingTex = useMemo(
    () =>
      typeof document !== "undefined"
        ? makeWindowTexture(13, 5, 19)
        : null,
    []
  );
  const towerGlass = useGlassMaterial("#2f74c9", towerTex);
  const wingGlass = useGlassMaterial("#2a68b4", wingTex, {
    roughness: 0.26,
  });
  const crownGlass = useGlassMaterial("#275d9e", null, {
    roughness: 0.3,
    fresnel: 0.4,
  });

  return (
    <group>
      {/* ---- Podio (base oscura con celosía, ~3 niveles) ---- */}
      <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[17, 3, 12.5]} />
        <meshStandardMaterial
          color="#22332c"
          roughness={0.8}
          metalness={0.25}
        />
      </mesh>
      {[0.7, 1.3, 1.9, 2.5].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 6.28]}>
            <boxGeometry args={[17.1, 0.14, 0.1]} />
            <meshStandardMaterial color="#101d17" roughness={0.9} />
          </mesh>
          <mesh position={[0, y, -6.28]}>
            <boxGeometry args={[17.1, 0.14, 0.1]} />
            <meshStandardMaterial color="#101d17" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* marquesina de acceso */}
      <mesh castShadow position={[1, 1.7, 7.4]}>
        <boxGeometry args={[6, 0.25, 2.4]} />
        <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.6} />
      </mesh>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[1 + x, 0.85, 8.3]}>
          <cylinderGeometry args={[0.09, 0.09, 1.7, 10]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
      {/* puertas vidriadas del acceso */}
      <mesh position={[1, 1.1, 6.27]}>
        <boxGeometry args={[5.2, 2.0, 0.08]} />
        <meshPhysicalMaterial
          color="#7fb2e5"
          metalness={0.9}
          roughness={0.08}
          clearcoat={1}
          envMapIntensity={1.4}
        />
      </mesh>

      {/* ---- Torre principal ---- */}
      <mesh
        castShadow
        receiveShadow
        position={[1, 3 + 13, 0]}
        material={towerGlass}
      >
        <boxGeometry args={[10.5, 26, 8.5]} />
      </mesh>
      <group position={[1, 0, 0]}>
        <FloorBands width={10.5} depth={8.5} height={26} yBase={3} floors={17} />
      </group>

      {/* ---- Ala lateral izquierda (más baja → silueta escalonada) ---- */}
      <mesh
        castShadow
        receiveShadow
        position={[-5.6, 3 + 10, -0.3]}
        material={wingGlass}
      >
        <boxGeometry args={[5.4, 20, 7.6]} />
      </mesh>
      <group position={[-5.6, 0, -0.3]}>
        <FloorBands width={5.4} depth={7.6} height={20} yBase={3} floors={13} />
      </group>

      {/* ---- Quina ochavada frontal (como en la foto) ---- */}
      <mesh
        castShadow
        position={[5.4, 16, 3.4]}
        rotation={[0, Math.PI / 4, 0]}
        material={towerGlass}
      >
        <boxGeometry args={[1.6, 26, 1.6]} />
      </mesh>

      {/* ---- Bloque trasero (profundidad desde atrás) ---- */}
      <mesh castShadow position={[-1.5, 3 + 8, -5.2]} material={wingGlass}>
        <boxGeometry args={[7, 16, 2.6]} />
      </mesh>

      {/* ---- Corona escalonada ---- */}
      <mesh castShadow position={[1, ROOF_Y + 0.8, 0]} material={crownGlass}>
        <boxGeometry args={[8.2, 1.6, 6.6]} />
      </mesh>
      <mesh castShadow position={[0.4, ROOF_Y + 2.2, -0.3]}>
        <boxGeometry args={[5.2, 1.3, 4.2]} />
        <meshStandardMaterial
          color="#143c6e"
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {[[-1.5, 0.5], [2.5, -1]].map(([x, z], i) => (
        <mesh key={i} position={[x, ROOF_Y + 3.6, z]}>
          <cylinderGeometry args={[0.05, 0.07, 2.2, 8]} />
          <meshStandardMaterial
            color="#475569"
            metalness={0.8}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* ---- Losa de azotea + pretil (zona mecánica) ---- */}
      <mesh receiveShadow position={[1, ROOF_Y + 0.06, 0]}>
        <boxGeometry args={[10.7, 0.18, 8.7]} />
        <meshStandardMaterial color="#757e88" roughness={0.95} />
      </mesh>
      {[
        { p: [1, ROOF_Y + 0.55, 4.3] as const, s: [10.7, 0.9, 0.18] as const },
        { p: [1, ROOF_Y + 0.55, -4.3] as const, s: [10.7, 0.9, 0.18] as const },
        { p: [6.25, ROOF_Y + 0.55, 0] as const, s: [0.18, 0.9, 8.7] as const },
        { p: [-4.25, ROOF_Y + 0.55, 0] as const, s: [0.18, 0.9, 8.7] as const },
      ].map((w, i) => (
        <mesh key={i} castShadow position={[w.p[0], w.p[1], w.p[2]]}>
          <boxGeometry args={[w.s[0], w.s[1], w.s[2]]} />
          <meshStandardMaterial color="#7d8894" roughness={0.85} />
        </mesh>
      ))}

      {/* ---- Clutter de azotea: caseta, ductos, ventilas ---- */}
      <group position={[1, ROOF_Y + 0.15, 0]}>
        {/* caseta de acceso */}
        <mesh castShadow position={[-2.6, 1.0, -2.9]}>
          <boxGeometry args={[2.0, 2.0, 1.8]} />
          <meshStandardMaterial color="#8b95a1" roughness={0.8} />
        </mesh>
        <mesh position={[-2.6, 1.0, -1.97]}>
          <boxGeometry args={[0.8, 1.5, 0.06]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </mesh>
        {/* ducto principal */}
        <mesh castShadow position={[0.4, 0.55, -2.4]}>
          <boxGeometry args={[6.5, 0.7, 0.9]} />
          <meshStandardMaterial
            color="#9aa4ae"
            roughness={0.5}
            metalness={0.6}
          />
        </mesh>
        {/* ventilas */}
        {[
          [4.3, -2.9],
          [-0.6, 2.9],
          [3.6, 3.0],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh castShadow position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.9, 12]} />
              <meshStandardMaterial
                color="#6b7684"
                roughness={0.5}
                metalness={0.6}
              />
            </mesh>
            <mesh castShadow position={[0, 0.95, 0]}>
              <cylinderGeometry args={[0.32, 0.26, 0.22, 12]} />
              <meshStandardMaterial
                color="#4b5563"
                roughness={0.5}
                metalness={0.6}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
