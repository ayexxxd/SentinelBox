# SentinelBox API reference

Base URL when running the app: `http://<computer-ip>:3000/api`.
The dashboard polls these same endpoints. If `SENTINEL_INGEST_KEY` is set,
device writes (`POST`/`DELETE`) must send it as the `x-api-key` header.

## Readings

### POST /api/readings — send one reading or a batch

Body: a JSON object, or an array of up to 500. Returns `201 {"accepted": n}`,
or `400 {"error": "..."}` naming the bad field.

```bash
curl -X POST http://localhost:3000/api/readings \
  -H 'content-type: application/json' \
  -d '{"unit_id":"HVAC-01","temperature":24.6,"current":0.321,"vibration":1.12,
       "health_pct":96.2,"status":"healthy"}'
```

Field rules:

| Field | Required? | Notes |
|---|---|---|
| `unit_id` | **yes** | e.g. `HVAC-01` |
| `temperature`, `current`, `vibration` | no | `null` = sensor disconnected (dashboard shows it Offline) |
| `baseline_*`, `*_score` | no | Stored when sent; the server also computes per-unit baselines (avg of first 45 readings) and attaches them on read |
| `health_pct` | no | 0–100 (`health_score` accepted as alias) |
| `status` | no | `healthy` \| `warning` \| `degraded`; derived from `sentinel_status` when omitted (`NORMAL`→healthy, else degraded; null while learning) |
| `sentinel_status` | no | `NORMAL` \| `WARNING` \| `MAINTENANCE REQUIRED` \| `LEARNING` |
| `timestamp` | no | ISO 8601 or epoch ms; defaults to server time. Pre-2024 or >60 s future timestamps are replaced (response reports `timestamps_replaced`) — simplest for ESPs: leave it out |

### GET /api/readings — read data, oldest first

```
GET /api/readings?since=<ISO or epoch ms>&unit_id=HVAC-01&limit=100
```

All filters optional. `GET /api/readings/export?unit_id=` downloads the same data as CSV.

### DELETE /api/readings — reset the demo (`204`)

Clears all readings and units.

## Units (device info)

```bash
curl -X POST http://localhost:3000/api/units \
  -H 'content-type: application/json' \
  -d '{"unit_id":"HVAC-01","chip":"ESP32-WROOM-32","ram_used_kb":41.6,
       "ram_total_kb":320,"flash_used_kb":418,"flash_total_kb":4096}'

curl http://localhost:3000/api/units   # units seen so far, with last_seen
```

## Simulator

```bash
curl http://localhost:3000/api/simulate                                   # status + row counts
curl -X POST http://localhost:3000/api/simulate \
  -H 'content-type: application/json' -d '{"action":"seed","minutes":25}'  # backfill (clears first unless reset:false)
curl -X POST http://localhost:3000/api/simulate \
  -H 'content-type: application/json' -d '{"action":"start"}'              # stream every 2 s
curl -X POST http://localhost:3000/api/simulate \
  -H 'content-type: application/json' -d '{"action":"stop"}'
```

## Storage

SQLite at `data/sentinel.db` (auto-created, git-ignored; override with `SENTINEL_DB_PATH`,
Node 22.13+ for built-in `node:sqlite`). Readings older than `SENTINEL_RETENTION_DAYS`
(default 7, `0` keeps everything) are pruned — export CSV first if you need them.
