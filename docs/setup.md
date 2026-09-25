# Technical setup

How to go from a fresh clone to live data on the dashboard: hardware, firmware, network, app.

## 1. Hardware

Three ESP32 boards:

| Board | Role | Sensors | Link |
|---|---|---|---|
| `HVAC01/` — ESP32-C3 Super Mini | Fan node, fixed 10% PWM | INA219 (current) + MAX6675 (temp) | UART1, 115200 |
| `HVAC02/` — ESP32 classic DevKit | Fan node, fixed 100% fan | INA219 (current) + MAX6675 (temp) | UART1, 115200 |
| `SentinelBox/` — ESP32 classic DevKit | Gateway + vibration | MPU6500 on board | WiFi STA + 1× UART |

Only one HVAC connects to the gateway at a time (single UART, retrofit plug-and-play story).

### Pin tables

**HVAC-01 (ESP32-C3 Super Mini)** — use the labels printed on the board:

| Signal | C3 GPIO | Board label |
|---|---|---|
| INA219 SDA / SCL | 8 / 9 | SDA / SCL |
| MAX6675 SCK / SO / CS | 6 / 5 / 7 | matching SPI labels |
| Fan PWM (fixed 10%) | 3 | A3 |
| UART TX → gateway RX | 21 | TX |
| UART RX ← gateway TX | 20 | RX |

> The C3 has no GPIO 22/23/26/27 — never use those pin numbers on this board.
> GPIO 8/9 are boot strapping pins: if the board boot-loops (`RTCWDT_RTC_RESET`), power it alone first, then connect the INA219 module.

**HVAC-02 (ESP32 classic)**:

| Signal | GPIO |
|---|---|
| INA219 SDA / SCL | 21 / 22 |
| MAX6675 SCK / SO / CS | 18 / 19 / 23 |
| UART TX / RX | 27 / 26 |

**SentinelBox gateway (ESP32 classic)**:

| Signal | GPIO |
|---|---|
| HVAC UART RX / TX | 26 / 27 |
| MPU6500 SDA / SCL | 21 / 22 (addr 0x68) |

UART wiring (either HVAC): `TX→RX`, `RX→TX`, `GND→GND`. Any GND pin works — all GNDs are the same net — but run a dedicated signal ground wire, not the fan's power ground.

### Arduino IDE setup

- HVAC-01: board **ESP32C3 Dev Module**, **USB CDC On Boot: Enabled**, monitor at 115200.
- HVAC-02 / gateway: board **ESP32 Dev Module**, monitor at 115200.
- Libraries: **Adafruit INA219** + **max6675**. The gateway needs nothing extra.
- Linux: close the Serial Monitor before uploading (the IDE can't share the port); `sudo usermod -aG dialout $USER` if the port is denied.

Flash order: HVAC node(s) first (confirm `LINK>` lines on their USB), then the gateway.

## 2. Network (offline-friendly)

No internet required — everything is link-local:

1. iPhone hotspot ON with **Maximize Compatibility** (forces 2.4 GHz; the ESP32 can't see 5 GHz).
2. Join the **laptop first**, then the gateway. The iPhone hands out `172.20.10.x`.
3. Get the laptop's IP (`ipconfig` / `ipconfig getifaddr en0`) and set it in `SentinelBox/SentinelBox.ino`:
   `SERVER_BASE = "http://<laptop-ip>:3000/api"`, then re-flash the gateway.
4. Allow Node.js through the OS firewall (port 3000 inbound) or the ESP's POSTs never arrive.

Verify from the laptop itself (proves the LAN path, not just localhost):

```bash
curl http://<laptop-ip>:3000/api/units
```

## 3. Dashboard + API

```bash
npm install
npm run dev        # http://localhost:3000
```

| Env var | Effect |
|---|---|
| `NEXT_PUBLIC_SENTINEL_API_URL` | Empty = in-browser mock simulator. Set to `/api` for live SQLite-backed data. |
| `NEXT_PUBLIC_SENTINEL_POLL_MS` | Dashboard poll interval (default 2000). |
| `SENTINEL_INGEST_KEY` | If set, device writes must send it as `x-api-key` header. |
| `SENTINEL_DB_PATH` | SQLite location (default `data/sentinel.db`). |

Simulator (no hardware needed):

```bash
npm run sim:seed      # backfill 25 min for both units (append minutes: npm run sim:seed 60)
npm run sim:start     # stream live readings every 2 s
npm run sim:status
npm run sim:stop      # stop once real devices are posting
```

`npm run build` for a production build. First build needs internet once (Next.js font + dependency fetch); afterwards it runs offline.

## 4. Neural network → ESP32

Model card: MLP **5→16→8→3**, ReLU, softmax T=3.0 — **259 float32 params ≈ 1 KB**,
plain C inference (`SentinelBox/sentinel_ann.h`), weights generated into
`SentinelBox/sentinel_model.h`. Inputs are log-ratios against the unit's own
baseline (45 windows / 90 s, stored in NVS); health is EMA-smoothed (α=0.35)
with 3-of-5 persistence. Held-out metrics (`ml/artifacts/metrics.json`):
accuracy 0.9936, detection 1.000, false alarms 0.003, C/Python parity ~1e-6.

Retrain with real data:

```bash
cd ml
pip install -r requirements.txt
python download_data.py     # reference vibration dataset
python build_dataset.py     # + your recordings -> data/processed/*.npz
python train.py             # writes ../SentinelBox/sentinel_model.h
```

Record labelled sessions from the gateway with `python collect_serial.py`
(see `ml/README.md` for the 9-scenario protocol), then re-flash the gateway.
`train.py` also verifies C/Python inference parity with gcc.
