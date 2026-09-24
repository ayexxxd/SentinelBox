"use client";

import * as THREE from "three";

// PRNG determinista para que la textura sea estable entre renders
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Textura de fachada: celdas de ventana con brillo ligeramente variado
 * + líneas de losa por piso. Se multiplica por el color azul del material.
 */
export function makeWindowTexture(
  floors: number,
  cols: number,
  seed = 7
): THREE.CanvasTexture {
  const rand = mulberry32(seed);
  const w = 256;
  const h = 64 * floors;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // base vidrio
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#f4f8ff");
  grad.addColorStop(0.5, "#dbe7f7");
  grad.addColorStop(1, "#eef3fa");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const rowH = h / floors;
  const colW = w / cols;

  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      // variación sutil por ventana (reflejos distintos)
      const v = 208 + Math.floor(rand() * 47);
      const blue = 232 + Math.floor(rand() * 23);
      ctx.fillStyle = `rgb(${v - 12},${v},${Math.min(255, blue)})`;
      ctx.fillRect(
        c * colW + 1.5,
        f * rowH + 2,
        colW - 3,
        rowH - 5
      );
      // franja superior más clara = reflejo del cielo en cada vidrio
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(c * colW + 1.5, f * rowH + 2, colW - 3, 3);
      // sombra inferior = marco
      ctx.fillStyle = "rgba(20,40,80,0.35)";
      ctx.fillRect(c * colW + 1.5, (f + 1) * rowH - 5, colW - 3, 3);
    }
    // línea de losa
    ctx.fillStyle = "rgba(13,43,82,0.9)";
    ctx.fillRect(0, (f + 1) * rowH - 1.5, w, 2.5);
  }
  // parteluces verticales
  ctx.fillStyle = "rgba(13,43,82,0.55)";
  for (let c = 0; c <= cols; c++) {
    ctx.fillRect(c * colW - 1, 0, 2, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Ruido sutil para concreto/asfalto (se repite con repeat alto). */
export function makeNoiseTexture(seed = 21, size = 128): THREE.CanvasTexture {
  const rand = mulberry32(seed);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 225 + Math.floor(rand() * 30);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

/**
 * Fresnel tipo "vidrio al cielo": suma un rim azul en los bordes según el
 * ángulo de vista. Se inyecta al shader del material físico, sin uniforms.
 */
export function applyGlassFresnel(
  mat: THREE.MeshPhysicalMaterial,
  strength = 0.55
) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec3 Vv = normalize( vViewPosition );
        float fres = pow( 1.0 - abs( dot( normalize( normal ), Vv ) ), 3.0 );
        totalEmissiveRadiance += vec3( 0.42, 0.68, 1.0 ) * fres * ${strength.toFixed(2)};
      }`
    );
  };
  // Asegura programa propio (no colisiona con otros physical materials)
  mat.customProgramCacheKey = () => `glass-fresnel-${strength}`;
}
