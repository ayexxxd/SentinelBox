"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * Flagpoles with waving flags. Each flag is drawn once onto a canvas texture and
 * waved in the vertex shader (the wave grows toward the free end of the flag).
 */

type FlagId = "mexico" | "usa" | "estonia";

const W = 480;
const H = 300;

function drawFlag(id: FlagId): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  if (id === "mexico") {
    ["#006847", "#ffffff", "#ce1126"].forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect((i * W) / 3, 0, W / 3 + 1, H);
    });
    // simplified coat of arms: eagle on a cactus inside an olive/oak wreath
    const cx = W / 2;
    const cy = H / 2;
    g.strokeStyle = "#2f7a3a";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy + 6, 44, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    g.fillStyle = "#3c8a3f";
    g.fillRect(cx - 6, cy + 4, 12, 30);
    g.fillStyle = "#7a4a1d";
    g.beginPath();
    g.ellipse(cx, cy - 8, 22, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#b8862e";
    g.beginPath();
    g.ellipse(cx - 10, cy - 30, 9, 9, 0, 0, Math.PI * 2);
    g.fill();
  } else if (id === "usa") {
    const stripe = H / 13;
    for (let i = 0; i < 13; i++) {
      g.fillStyle = i % 2 === 0 ? "#b22234" : "#ffffff";
      g.fillRect(0, i * stripe, W, stripe + 1);
    }
    const cw = W * 0.4;
    const ch = stripe * 7;
    g.fillStyle = "#3c3b6e";
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = "#ffffff";
    for (let row = 0; row < 9; row++) {
      const cols = row % 2 === 0 ? 6 : 5;
      for (let col = 0; col < cols; col++) {
        const x = (cw / 12) * (col * 2 + (row % 2 === 0 ? 1 : 2));
        const y = (ch / 10) * (row + 1);
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    ["#0072ce", "#000000", "#ffffff"].forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, (i * H) / 3, W, H / 3 + 1);
    });
  }
  return c;
}

function useFlagMaterial(id: FlagId, time: { value: number }, phase: number) {
  return useMemo(() => {
    if (typeof document === "undefined") return new THREE.MeshStandardMaterial();
    const tex = new THREE.CanvasTexture(drawFlag(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float fx = uv.x; // 0 at the pole, 1 at the free end
          transformed.z += sin(uv.x * 7.0 - uTime * 4.0 + ${phase.toFixed(2)}) * 0.22 * fx
                         + sin(uv.y * 3.0 + uTime * 2.3) * 0.05 * fx;`
        );
    };
    mat.customProgramCacheKey = () => `flag-${id}`;
    return mat;
  }, [id, time, phase]);
}

function Flag({ id, x, phase, time }: { id: FlagId; x: number; phase: number; time: { value: number } }) {
  const mat = useFlagMaterial(id, time, phase);
  const size = { w: 2.6, h: 1.6 };
  return (
    <group position={[x, 0, 0]}>
      <mesh castShadow position={[0, 6, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 12, 8]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 12.08, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh material={mat} castShadow position={[size.w / 2 + 0.08, 11.1, 0]}>
        <planeGeometry args={[size.w, size.h, 24, 8]} />
      </mesh>
    </group>
  );
}

/** Mexico, USA and Estonia flags at the entrance plaza. */
export default function Flags({ position }: { position: [number, number, number] }) {
  const time = useMemo(() => ({ value: 0 }), []);
  useFrame((_, dt) => {
    time.value += dt;
  });
  return (
    <group position={position}>
      <Flag id="mexico" x={-4} phase={0} time={time} />
      <Flag id="usa" x={0} phase={1.3} time={time} />
      <Flag id="estonia" x={4} phase={2.6} time={time} />
    </group>
  );
}
