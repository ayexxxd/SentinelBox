"use client";

import "@/lib/three-warnings";
import { HVAC_UNITS, STATUS_META } from "@/data/sentinel";
import { ContactShadows, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Building2, Snowflake } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CedesBuilding, { ROOF_Y } from "./CedesBuilding";
import Environment from "./Environment";
import HvacUnit3D, { unitAnchor } from "./HvacUnit";

/* ------------------------------------------------------------------ */
/* Vistas de cámara. Por defecto ROOFTOP: el foco son los climas.      */
/* ------------------------------------------------------------------ */
const PRESETS = {
  roof: {
    label: "Rooftop",
    pos: [20, 37, 27] as const,
    tgt: [0.5, 25, 0] as const,
  },
  tower: {
    label: "Torre",
    pos: [28, 18, 35] as const,
    tgt: [0, 13, 0] as const,
  },
} as const;

type ViewKey = keyof typeof PRESETS;

/* Reflejos reales sin red: entorno procedural (PMREM + RoomEnvironment) */
function SceneEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.5;
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/* Transición suave de cámara entre presets */
function CameraRig({ view }: { view: ViewKey }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    | OrbitControlsImpl
    | null;
  const destPos = useMemo(
    () => new THREE.Vector3(...PRESETS[view].pos),
    [view]
  );
  const destTgt = useMemo(
    () => new THREE.Vector3(...PRESETS[view].tgt),
    [view]
  );
  const animating = useRef(true);
  useEffect(() => {
    animating.current = true;
  }, [view]);

  useFrame((_, rawDt) => {
    if (!animating.current || !controls) return;
    const dt = Math.min(rawDt, 0.05);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, destPos.x, 3.5, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, destPos.y, 3.5, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, destPos.z, 3.5, dt);
    controls.target.x = THREE.MathUtils.damp(controls.target.x, destTgt.x, 3.5, dt);
    controls.target.y = THREE.MathUtils.damp(controls.target.y, destTgt.y, 3.5, dt);
    controls.target.z = THREE.MathUtils.damp(controls.target.z, destTgt.z, 3.5, dt);
    controls.update();
    if (
      camera.position.distanceTo(destPos) < 0.08 &&
      controls.target.distanceTo(destTgt) < 0.08
    ) {
      animating.current = false;
    }
  });
  return null;
}

/*
 * Proyector de marcadores: convierte la posición 3D de cada clima a
 * coordenadas de pantalla y mueve los pills HTML (DOM normal, sin
 * portales de Drei → sin crashes de unmount). Corre por frame pero
 * solo toca el DOM, no dispara renders de React.
 */
function MarkerProjector({
  anchors,
}: {
  anchors: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
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
      const off =
        v.z > 1 || x < -80 || x > size.width + 80 || y < -80 || y > size.height + 80;
      if (off) {
        if (el.style.display !== "none") el.style.display = "none";
      } else {
        if (el.style.display !== "block") el.style.display = "block";
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        // zona para el tooltip: si el pill está pegado arriba, el tip va abajo
        el.dataset.zone = y < 210 ? "top" : "mid";
      }
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Componente principal: Canvas + overlay HTML                          */
/* ------------------------------------------------------------------ */
export default function BuildingScene() {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>("roof");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tipBelow, setTipBelow] = useState(false);
  const anchors = useRef<Record<string, HTMLDivElement | null>>({});

  const handlePillEnter = (id: string) => {
    setHovered(id);
    // si el pill está en la franja superior, el tooltip se abre hacia abajo
    setTipBelow(anchors.current[id]?.dataset.zone === "top");
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [...PRESETS.roof.pos], fov: 42 }}
        gl={{ antialias: true }}
        style={{ background: "linear-gradient(#9cc3e8, #cfdfee)" }}
        onCreated={({ gl }) => {
          // three r183+ eliminó PCFSoftShadowMap → usar PCF explícito
          gl.shadowMap.type = THREE.PCFShadowMap;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <Suspense fallback={null}>
          <fog attach="fog" args={["#b9cfe6", 95, 230]} />
          <Sky
            distance={450000}
            sunPosition={[60, 32, -40]}
            turbidity={5}
            rayleigh={2}
            mieCoefficient={0.004}
            mieDirectionalG={0.85}
          />
          <SceneEnvironment />
          <Environment />
          <CedesBuilding />
          {HVAC_UNITS.map((u) => (
            <HvacUnit3D
              key={u.id}
              unit={u}
              rooftopY={ROOF_Y}
              hovered={hovered === u.id}
              onHover={setHovered}
            />
          ))}
          <MarkerProjector anchors={anchors} />
          <ContactShadows
            position={[0, 0.03, 0]}
            opacity={0.42}
            scale={60}
            blur={2.4}
            far={8}
          />
          <CameraRig view={view} />
          <OrbitControls
            makeDefault
            target={[...PRESETS.roof.tgt]}
            minDistance={10}
            maxDistance={80}
            maxPolarAngle={Math.PI / 2 - 0.06}
            minPolarAngle={0.12}
            enableDamping
            dampingFactor={0.08}
            enablePan
            panSpeed={0.6}
            rotateSpeed={0.75}
            zoomSpeed={0.9}
          />
        </Suspense>
      </Canvas>

      {/* Pills flotantes (HTML normal, posicionados por el proyector) */}
      <div
        id="scene-pills"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {HVAC_UNITS.map((u) => {
          const meta = STATUS_META[u.status];
          const isHover = hovered === u.id;
          return (
            <div
              key={u.id}
              ref={(el) => {
                anchors.current[u.id] = el;
              }}
              className="absolute left-0 top-0 z-20"
              style={{ display: "none" }}
            >
              <div
                className="relative"
                style={{ transform: "translate(-50%, -100%)" }}
              >
                {isHover && (
                  <div
                    className={`pointer-events-none absolute left-1/2 w-52 -translate-x-1/2 rounded-xl border border-white/15 bg-[#0a1326]/95 p-3 text-left shadow-2xl backdrop-blur ${
                      tipBelow ? "top-full mt-2" : "bottom-full mb-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-white">{u.label}</p>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: meta.hex }}
                      />
                    </div>
                    <p
                      className={`mt-0.5 text-xs font-semibold ${meta.text}`}
                    >
                      {u.statusLabel}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-400">
                      {u.shortMessage}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold text-sky-300">
                      Click para abrir el dashboard →
                    </p>
                  </div>
                )}
                <button
                  onClick={() => router.push(u.route)}
                  onMouseEnter={() => handlePillEnter(u.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/20 bg-[#0a1326]/90 py-1.5 pl-2.5 pr-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur transition hover:border-sky-300/60 hover:bg-[#0e1a33]"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className="sentinel-ping absolute inline-flex h-full w-full rounded-full"
                      style={{ backgroundColor: meta.hex }}
                    />
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.hex }}
                    />
                  </span>
                  <span className="text-xs font-bold tracking-wide text-white">
                    {u.label}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle de vista */}
      <div className="absolute right-4 top-4 z-30 flex gap-1.5 rounded-full border border-white/15 bg-[#060b16]/80 p-1 backdrop-blur">
        {(
          [
            { key: "roof", label: "Rooftop", Icon: Snowflake },
            { key: "tower", label: "Torre", Icon: Building2 },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              view === key
                ? "bg-sky-500 text-white shadow-[0_0_16px_rgba(56,189,248,0.5)]"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
