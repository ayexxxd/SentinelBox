# SentinelBox

SentinelBox is a Carrier hackathon prototype for intelligent HVAC maintenance using Edge AI. Two ESP-based units simulate HVAC equipment with different normal operating behaviors, allowing the system to learn an independent baseline for each unit instead of relying on universal thresholds.

## Signals

- Temperature
- Current
- Vibration

The two fans intentionally operate with different normal current profiles. Each sensor is evaluated independently, so changes in one signal are not assumed to cause changes in another.

## Scoring model

```text
AnomalyScore = 0.40 * CurrentScore + 0.35 * TemperatureScore + 0.25 * VibrationScore
Health (%)   = 100 - AnomalyScore
```

Initial decision logic:

- `HealthScore >= 70`: `NORMAL`
- `HealthScore < 70`: `MAINTENANCE REQUIRED`
- Any individual sensor anomaly score above `80` also requests maintenance.
- A condition must occur in at least 3 of the last 5 readings to reduce false alarms.

## Physical indicators

- Green LED: `NORMAL`
- Orange LED: `MAINTENANCE REQUIRED`

## Dashboard

The dashboard will show:

- Health Score
- Current value vs. baseline
- Temperature value vs. baseline
- Vibration value vs. baseline
- Deviation percentage
- Status
- Historical trends

## Validation

Known test states:

- Normal operation
- Controlled perturbation

Temperature perturbations can be introduced with a hair dryer, while vibration changes (e.g. an unbalanced fan) can be introduced independently. All signals must be measured independently.

## KPIs

1. Maintenance Detection Rate: `TP / (TP + FN)`
2. False Alarm Rate: `FP / (FP + TN)`
3. Missed Anomaly Rate: `FN / (FN + TP)`
4. Average Detection Time
5. Baseline Learning Time
6. Normal Recognition by Equipment
7. Edge Performance: processing time, RAM, and Flash
8. Health Score

## Data schema

Each reading stores:

```text
id,            -- assigned by the database
unit_id,       -- e.g. HVAC-01
timestamp,     -- date/time, ISO 8601 UTC
temperature,   -- °C   (null = sensor offline)
current,       -- A
vibration,     -- mm/s
status,        -- "healthy" | "degraded" (null while learning)
health_pct     -- health condition, 0–100 %
```

Each unit's baseline (normal temperature/current/vibration) is the average of its first
45 readings; the API adds it to every reading it returns, so the dashboard can show the
deviation from normal.

## Planned implementation

- Sensor acquisition on two ESP devices
- Per-unit baseline learning
- Per-sensor anomaly scoring
- Weighted Health Score calculation
- Green/orange LED control
- 3-of-5 persistence logic
- Data transmission and dashboard visualization


## Receiving data (API)

The dashboard app exposes endpoints the SentinelBox devices can push to. Run the app
(`npm run dev`), then point the ESP units at `http://<computer-ip>:3000/api`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/readings` | Send one reading (JSON object) or a batch (array, max 500). Returns `201 { accepted }`. |
| `GET` | `/api/readings?since=<ISO or epoch ms>&unit_id=<id>&limit=<n>` | Readings, oldest first. The dashboard polls this. |
| `DELETE` | `/api/readings` | Clear stored readings and units (demo reset). |
| `GET` | `/api/readings/export?unit_id=<id>` | Download readings as CSV (all units if `unit_id` is left out). |
| `POST` | `/api/units` | Register device info: `{ unit_id, chip?, ram_used_kb?, ram_total_kb?, flash_used_kb?, flash_total_kb? }`. |
| `GET` | `/api/units` | Units seen so far, with `last_seen`. |
| `GET` | `/api/simulate` | Simulator status and database totals. |
| `POST` | `/api/simulate` | `{ "action": "seed", "minutes": 25 }` backfills history (clears first unless `"reset": false`); `{ "action": "start" }` / `{ "action": "stop" }` streams simulated readings every 2 s. |

Reading fields follow the data schema above. Only
`unit_id` is required; send `null` for a sensor that is disconnected (the dashboard shows
it as offline). `timestamp` defaults to the server time. `status` is `healthy` or `degraded` (if left out it
is derived from `sentinel_status`: NORMAL/MAINTENANCE REQUIRED). `health_score` is accepted
as an alias of `health_pct`. Other fields are ignored.

```bash
curl -X POST http://localhost:3000/api/readings \
  -H 'content-type: application/json' \
  -d '{"unit_id":"HVAC-01","temperature":24.6,"current":0.321,"vibration":1.12,
       "baseline_temperature":24.5,"baseline_current":0.32,"baseline_vibration":1.1,
       "health_pct":96.2,"sentinel_status":"NORMAL"}'
```

### Database

Readings and units are stored in SQLite at `data/sentinel.db` (created automatically,
git-ignored; override with `SENTINEL_DB_PATH`). It uses Node's built-in `node:sqlite`,
so there is nothing native to install (Node 22.13+).

The dashboard reads from the API when `.env.local` contains
`NEXT_PUBLIC_SENTINEL_API_URL=/api`; remove it to fall back to the in-browser simulator.
Set `SENTINEL_INGEST_KEY` to require an `x-api-key` header on writes.
Readings older than `SENTINEL_RETENTION_DAYS` (default 7; `0` keeps everything) are deleted
automatically. Export them first with `/api/readings/export` if you need them.

Timestamps: a device timestamp before 2024 (an ESP clock that never synced) or more than a
minute in the future is replaced by the server's time, and the response reports
`timestamps_replaced`. Simplest for the ESPs: leave `timestamp` out.

### Simulating data

With `npm run dev` running:

```bash
npm run sim:seed      # clear the DB and backfill 25 min of both units (npm run sim:seed 60 for an hour)
npm run sim:start     # stream new simulated readings every 2 s
npm run sim:status    # simulator state + row counts
npm run sim:stop      # stop — do this once real devices are posting
```

The simulator stops when the server restarts; run `npm run sim:start` again (it continues
from the last seed, or starts a fresh learning phase).
