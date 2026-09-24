"use client";

import "@/lib/three-warnings";
import { sensorLiveness, toUiStatus, useSentinel } from "@/components/SentinelProvider";
import { HVAC_UNITS, STATUS_META } from "@/data/sentinel";
import { OrbitControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Building2, Plane, Snowflake } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CetecBuilding, { ROOF_Y } from "./CetecBuilding";
import Environment from "./Environment";
import HvacUnit3D, { unitAnchor } from "./HvacUnit";
import { makeSkyScene } from "./materials";

/* Camera views, matched to the reference photos (street view, drone view) plus the terrace. */
const PRESETS = {
  street: { label: "Street", Icon: Building2, pos: [-40, 4, 150], tgt: [-4, 21, -4] },
  aerial: { label: "Aerial", Icon: Plane, pos: [85, 85, 110], tgt: [-6, 12, -4] },
  terrace: { label: "HVAC", Icon: Snowflake, pos: [44, 17, 38], tgt: [18, 5, 1] },
} as const;
type ViewKey = keyof typeof PRESETS;

/** Image-based lighting from a procedural sky, so glass reflects blue sky and clouds. */
function SkyEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(makeSkyScene(), 0.02).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Smooth camera move between presets (or to a focus point when a unit is selected). */
function CameraRig({ pos, tgt }: { pos: readonly number[]; tgt: readonly number[] }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const destPos = useMemo(() => new THREE.Vector3(pos[0], pos[1], pos[2]), [pos]);
  const destTgt = useMemo(() => new THREE.Vector3(tgt[0], tgt[1], tgt[2]), [tgt]);
  const animating = useRef(true);
  useEffect(() => {
    animating.current = true;
  }, [destPos, destTgt]);

  useFrame((_, rawDt) => {
    if (!animating.current || !controls) return;
    const dt = Math.min(rawDt, 0.05);
    camera.position.lerp(destPos, 1 - Math.exp(-3.2 * dt));
    controls.target.lerp(destTgt, 1 - Math.exp(-3.2 * dt));
    controls.update();
    if (camera.position.distanceTo(destPos) < 0.1 && controls.target.distanceTo(destTgt) < 0.1) {
      animating.current = false;
    }
  });
  return null;
}

/** Moves the HTML status pills to each unit's projected screen position every frame. */
function MarkerProjector({ anchors }: { anchors: MutableRefObject<Record<string, HTMLDivElement | null>> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const u of HVAC_UNITS) {
      const el = anchors.current[u.id];
      if (!el) continue;
      unitAnchor(u, ROOF_Y, v);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const off = v.z > 1 || x < -80 || x > size.width + 80 || y < -80 || y > size.height + 80;
      if (off) {
        if (el.style.display !== "none") el.style.display = "none";
      } else {
        if (el.style.display !== "block") el.style.display = "block";
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      }
    }
  });
  return null;
}

export default function BuildingScene({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [view, setView] = useState<ViewKey>("street");
  const [hovered, setHovered] = useState<string | null>(null);
  const anchors = useRef<Record<string, HTMLDivElement | null>>({});
  const { byUnit, lastUpdate } = useSentinel();
  const live = Object.fromEntries(
    HVAC_UNITS.map((u) => {
      const rs = byUnit.get(u.label) ?? [];
      const sensors = sensorLiveness(rs, lastUpdate ?? 0);
      return [u.id, { status: toUiStatus(rs.at(-1)), alive: sensors.filter((s) => s.alive).length, total: sensors.length }];
    })
  );

  // Selecting a unit flies the camera to it; otherwise follow the chosen preset.
  const focus = useMemo(() => {
    const u = HVAC_UNITS.find((h) => h.id === selected);
    if (!u) return PRESETS[view];
    const [x, , z] = u.position;
    // aim right of the unit so it sits left of the side panel
    return { pos: [x + 20, ROOF_Y + 10, z + 20], tgt: [x + 6, ROOF_Y + 2, z] } as const;
  }, [selected, view]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [...PRESETS.street.pos], fov: 38, near: 0.5, far: 3000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <Suspense fallback={null}>
          <fog attach="fog" args={["#c6d9ec", 220, 700]} />
          <Sky distance={450000} sunPosition={[60, 45, 40]} turbidity={4} rayleigh={1.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
          <SkyEnvironment />
          <Environment />
          <CetecBuilding />
          {HVAC_UNITS.map((u) => (
            <HvacUnit3D
              key={u.id}
              unit={u}
              status={live[u.id].status}
              rooftopY={ROOF_Y}
              hovered={hovered === u.id}
              selected={selected === u.id}
              onHover={setHovered}
              onSelect={onSelect}
            />
          ))}
          <MarkerProjector anchors={anchors} />
          <CameraRig pos={focus.pos} tgt={focus.tgt} />
          <OrbitControls
            makeDefault
            target={[...PRESETS.street.tgt]}
            minDistance={8}
            maxDistance={320}
            maxPolarAngle={Math.PI / 2 - 0.04}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.7}
          />
        </Suspense>
      </Canvas>

      {/* Status pills over each unit */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {HVAC_UNITS.map((u) => {
          const meta = STATUS_META[live[u.id].status];
          const { alive, total } = live[u.id];
          const active = hovered === u.id || selected === u.id;
          return (
            <div
              key={u.id}
              ref={(el) => {
                anchors.current[u.id] = el;
              }}
              className="absolute left-0 top-0 z-20"
              style={{ display: "none" }}
            >
              <button
                onClick={() => onSelect(u.id)}
                onMouseEnter={() => setHovered(u.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ transform: "translate(-50%, -100%)" }}
                className={`pointer-events-auto flex items-center gap-2 rounded-full border bg-[#0a1326]/90 py-1.5 pl-2.5 pr-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur transition ${
                  active ? "border-sky-300/70" : "border-white/20"
                }`}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="sentinel-ping absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: meta.hex }} />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.hex }} />
                </span>
                <span className="text-xs font-bold tracking-wide text-white">{u.label}</span>
                {alive < total && <span className="text-[10px] font-semibold text-red-300">{alive}/{total}</span>}
              </button>
            </div>
          );
        })}
      </div>

      {/* View switcher */}
      <div className="absolute left-4 top-4 z-30 flex gap-1.5 rounded-full border border-white/15 bg-[#060b16]/80 p-1 backdrop-blur">
        {(Object.keys(PRESETS) as ViewKey[]).map((key) => {
          const { label, Icon } = PRESETS[key];
          const on = view === key && !selected;
          return (
            <button
              key={key}
              onClick={() => {
                onSelect(null);
                setView(key);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                on ? "bg-sky-500 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
