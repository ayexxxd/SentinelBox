# Day-of-demo checklist

Print this. Everything here has bitten us at least once.

## Night before (with internet)

- [ ] `npm install` + `npm run build` once (caches Next.js fonts/deps for offline use)
- [ ] All 3 boards flash clean: HVAC-01 (C3), HVAC-02 (classic), SentinelBox gateway
- [ ] Confirm `LINK>` lines on each HVAC's USB monitor
- [ ] Confirm gateway prints `PLUG & PLAY: HVAC-0X conectado` + `HTTP 201`
- [ ] `npm run sim:seed` tested as fallback if hardware fails on stage
- [ ] Charge the laptop. Bring 3 USB cables (data-capable, not charge-only) + a spare

## On site (no internet needed)

- [ ] iPhone hotspot ON, **Maximize Compatibility** (2.4 GHz or the ESP32s never see it)
- [ ] Join order: **laptop first**, then gateway (predictable IPs)
- [ ] Laptop IP via `ipconfig` / `ipconfig getifaddr en0` → must match `SERVER_BASE` in the gateway firmware (re-flash if it changed)
- [ ] Firewall: allow Node.js inbound on port 3000 (Windows: private networks; macOS: accept the prompt)
- [ ] Sanity: `curl http://<laptop-ip>:3000/api/units` from the laptop itself
- [ ] `npm run dev`, open `http://localhost:3000`, set `NEXT_PUBLIC_SENTINEL_API_URL=/api` if using live data

## Live plug-and-play sequence

1. HVAC-01 wired (TX→RX, RX→TX, GND). Gateway announces it, dashboard goes live.
2. Unplug the 3 UART wires, plug HVAC-02. Gateway announces the new unit — nothing restarts.
3. Perturbations for the judges: hair dryer (temperature), pinch/slow the fan (current), tap the rig (vibration).

## When something breaks (in order)

1. **Gateway silent (`UART EN SILENCIO`)** → TX/RX crossed? GND common? Same 115200? Wrong physical pins (don't trust silkscreen — verify continuity end to end).
2. **HVAC boot-loop (`RTCWDT_RTC_RESET`)** → boot the board alone first (strapping pins vs sensor modules), short thick USB cable, separate fan power (brownout), correct board selected (C3 vs classic).
3. **`HTTP` not 201 in gateway log** → wrong laptop IP in `SERVER_BASE`, firewall, or `npm run dev` not running.
4. **Upload fails `port busy`** → close every Serial Monitor before flashing.
5. **Upload fails at `Hard resetting`** (C3) → benign if the code runs; press RST once, or hold BOOT + tap RST before uploading.
6. **Nuclear option** → `npm run sim:seed && npm run sim:start`: full dashboard demo without hardware.
