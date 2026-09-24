"use client";

import * as THREE from "three";

/**
 * Custom shading for CETEC. Both materials extend three's PBR materials through
 * onBeforeCompile, so they keep lighting, shadows, fog and clipping, and add
 * procedural detail driven by UVs measured in meters (see slabGeometry).
 */

/** Everything below ground is clipped, so tilted volumes read as "planted" in the site. */
export const GROUND_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02);

const GLSL_HASH = /* glsl */ `
  float sbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sbNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sbHash(i), sbHash(i + vec2(1, 0)), u.x), mix(sbHash(i + vec2(0, 1)), sbHash(i + vec2(1, 1)), u.x), u.y);
  }
`;

function injectUv(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec2 muv;\nvarying vec2 vMuv;")
    .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMuv = muv;");
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>\nvarying vec2 vMuv;\n${GLSL_HASH}`
  );
}

/**
 * Precast concrete cladding: panel joints on a grid, per-panel tone variation,
 * fine ribbing running along the slab (the corrugated finish in close-ups) that
 * fades out with distance, and vertical weathering streaks.
 */
export function makeConcreteMaterial({
  color = "#d8d0c3",
  panel = [3.2, 1.6],
  ribs = true,
}: { color?: string; panel?: [number, number]; ribs?: boolean } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.02,
    clippingPlanes: [GROUND_CLIP],
    clipShadows: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPanel = { value: new THREE.Vector2(panel[0], panel[1]) };
    shader.uniforms.uRibs = { value: ribs ? 1 : 0 };
    injectUv(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uPanel;\nuniform float uRibs;")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vMuv / uPanel;
          vec2 cell = floor(p);
          vec2 f = fract(p);
          vec2 dEdge = min(f, 1.0 - f) * uPanel;           // meters to nearest joint
          float w = fwidth(vMuv.x) + fwidth(vMuv.y);
          float joint = 1.0 - smoothstep(0.015, 0.045 + w, min(dEdge.x, dEdge.y));
          float tone = 0.93 + 0.1 * sbHash(cell);
          float streak = sbNoise(vec2(vMuv.x * 1.3, vMuv.y * 0.08)) * 0.08;
          // ribs run along the slab's long edge (u); fade before they alias
          float ribFade = clamp(1.0 - fwidth(vMuv.y) * 6.0, 0.0, 1.0) * uRibs;
          float rib = 0.5 + 0.5 * sin(vMuv.y * 6.2831 / 0.22);
          diffuseColor.rgb *= tone * (1.0 - streak) * mix(1.0, 0.62, joint) * (1.0 - 0.1 * rib * ribFade);
        }`
      );
  };
  mat.customProgramCacheKey = () => `sb-concrete-${panel.join("x")}-${ribs}`;
  return mat;
}

/**
 * Curtain-wall glass: dark reflective panes with mullions aligned to the slab
 * (floor lines run parallel to the long, tilted edge, as on the real facade),
 * a spandrel band per floor, per-pane reflection variation and a sky fresnel rim.
 */
export function makeGlassMaterial({
  color = "#1d4e5c",
  mullion = [1.6, 3.9],
}: { color?: string; mullion?: [number, number] } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.9,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.6,
    clippingPlanes: [GROUND_CLIP],
    clipShadows: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: new THREE.Vector2(mullion[0], mullion[1]) };
    injectUv(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uGrid;\nfloat sbFrame;")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vMuv / uGrid;
          vec2 f = fract(p);
          vec2 d = min(f, 1.0 - f) * uGrid;
          float w = fwidth(vMuv.x) + fwidth(vMuv.y);
          float mull = 1.0 - smoothstep(0.035, 0.07 + w, d.x);
          float floorLine = 1.0 - smoothstep(0.06, 0.14 + w, d.y);
          sbFrame = max(mull, floorLine);
          float pane = sbHash(floor(p));
          diffuseColor.rgb *= 0.85 + 0.3 * pane;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.11, 0.12), sbFrame);
        }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, sbFrame);"
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.3, sbFrame);"
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        {
          float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);
          totalEmissiveRadiance += vec3(0.45, 0.66, 0.9) * fres * 0.35 * (1.0 - sbFrame);
        }`
      );
  };
  mat.customProgramCacheKey = () => `sb-glass-${mullion.join("x")}`;
  return mat;
}

/**
 * Box whose corner sits at the origin (x: long side, y: short side, z: thickness
 * centered), with an extra `muv` attribute holding face coordinates in meters.
 */
export function slabGeometry(long: number, short: number, thick: number) {
  const g = new THREE.BoxGeometry(long, short, thick);
  g.translate(long / 2, short / 2, 0);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const muv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i))];
    // u runs along the long edge wherever possible so ribs/floor lines follow it
    const uv = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
    muv[i * 2] = uv[0];
    muv[i * 2 + 1] = uv[1];
  }
  g.setAttribute("muv", new THREE.BufferAttribute(muv, 2));
  return g;
}

/** Plain box with meter UVs, for podium parts. */
export function boxGeometry(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const muv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i))];
    const uv = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
    muv[i * 2] = uv[0] + w;
    muv[i * 2 + 1] = uv[1] + h;
  }
  g.setAttribute("muv", new THREE.BufferAttribute(muv, 2));
  return g;
}

/** Sky dome for image-based lighting: zenith blue, bright horizon, warm sun, soft clouds. */
export function makeSkyScene() {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3(0.55, 0.45, 0.35).normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun;
      ${GLSL_HASH}
      void main() {
        float h = vDir.y;
        vec3 zenith = vec3(0.16, 0.42, 0.82);
        vec3 horizon = vec3(0.78, 0.87, 0.95);
        vec3 ground = vec3(0.36, 0.40, 0.33);
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4));
        vec2 cp = vDir.xz / max(h, 0.08) * 1.6;
        float cloud = smoothstep(0.55, 0.85, sbNoise(cp) * 0.65 + sbNoise(cp * 2.3) * 0.35);
        col = mix(col, vec3(0.97), cloud * smoothstep(0.02, 0.25, h) * 0.9);
        float sun = pow(max(dot(vDir, uSun), 0.0), 600.0) * 30.0 + pow(max(dot(vDir, uSun), 0.0), 12.0) * 0.4;
        gl_FragColor = vec4(col + vec3(1.0, 0.92, 0.8) * sun, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
  return scene;
}
