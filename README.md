# SentinelBox

SentinelBox is a Carrier hackathon prototype for intelligent HVAC maintenance using Edge AI. Two ESP-based units simulate HVAC equipment with different normal operating behaviors, allowing the system to learn an independent baseline for each unit instead of relying on universal thresholds.

## Signals

- Temperature
- Current
- Pressure

The two fans intentionally operate with different normal current profiles. Each sensor is evaluated independently, so changes in one signal are not assumed to cause changes in another.

## Scoring model

```text
AnomalyScore = 0.40 * CurrentScore + 0.35 * TemperatureScore + 0.25 * PressureScore
HealthScore = 100 - AnomalyScore
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
- Pressure value vs. baseline
- Deviation percentage
- Status
- Historical trends

## Validation

Known test states:

- Normal operation
- Controlled perturbation

Temperature perturbations can be introduced with a hair dryer, while pressure or airflow changes can be introduced independently. All signals must be measured independently.

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

Each reading should store at least:

```text
timestamp,
unit_id,
temperature,
current,
pressure,
baseline_temperature,
baseline_current,
baseline_pressure,
temp_score,
current_score,
pressure_score,
health_score,
sentinel_status,
real_condition,
processing_ms
```

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
| `POST` | `/api/units` | Register device info: `{ unit_id, chip?, ram_used_kb?, ram_total_kb?, flash_used_kb?, flash_total_kb? }`. |
| `GET` | `/api/units` | Units seen so far, with `last_seen`. |

Reading fields follow the data schema above plus `vibration` / `baseline_vibration`. Only
`unit_id` is required; send `null` for a sensor that is disconnected (the dashboard shows
it as offline). `timestamp` defaults to the server time. `sentinel_status` is `NORMAL`,
`MAINTENANCE REQUIRED` or `LEARNING`.

```bash
curl -X POST http://localhost:3000/api/readings \
  -H 'content-type: application/json' \
  -d '{"unit_id":"HVAC-01","temperature":24.6,"current":0.321,"vibration":1.12,
       "baseline_temperature":24.5,"baseline_current":0.32,"baseline_vibration":1.1,
       "health_score":96.2,"sentinel_status":"NORMAL"}'
```

To show the live data instead of the simulator, copy `.env.example` to `.env.local`, set
`NEXT_PUBLIC_SENTINEL_API_URL=/api`, and restart `npm run dev`. Set `SENTINEL_INGEST_KEY`
to require an `x-api-key` header on writes. Readings are kept in memory, so they reset
when the server restarts.
