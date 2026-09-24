// R3F v9.8 construye `new THREE.Clock()` internamente al crear el store,
// y three r183+ deprecó Clock en favor de THREE.Timer ("latest" = misma versión,
// no hay upgrade que lo evite). Es ruido interno sin impacto: se filtra solo
// ese mensaje exacto. Quitar este archivo cuando fiber migre a Timer.
if (typeof window !== "undefined") {
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Please use THREE.Timer instead")
    ) {
      return;
    }
    origWarn(...args);
  };
}

export {};
