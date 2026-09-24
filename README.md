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

