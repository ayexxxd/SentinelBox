"""Builds the training set for the SentinelBox health network.

Vibration comes from real measurements: UCI "Accelerometer" (a 12 cm cooling fan with
weights on its blades, 3-axis MEMS accelerometer at 50 Hz). Current and temperature
are synthesised per window, with fault bands calibrated from the LBNL fan-coil FDD
dataset (calibration/lbnl_fcu_fan_power.csv) and the demo perturbations (hair dryer).

Each channel is faulted independently (README: "changes in one signal are not assumed
to cause changes in another"). Labels: 0 NORMAL, 1 WARNING, 2 MAINTENANCE.

Usage: python build_dataset.py  ->  data/processed/{train,test}.npz
"""

from pathlib import Path

import numpy as np
import pandas as pd

from features import WINDOW, model_inputs, vibration_stats

ROOT = Path(__file__).parent
UCI_CSV = ROOT / "data/raw/uci_fan_accelerometer.csv"
OUT = ROOT / "data/processed"

STRIDE = 25  # overlapping windows for more vibration samples
BASELINE_WINDOWS = 10  # first 20 s of the healthy run = the "learning" phase
TEST_SPEEDS = {45, 65, 85}  # whole speeds held out, so test windows never overlap train
MIN_FAULT_SPEED = 40  # below this the imbalance is not measurable (ratio ~1)

# UCI weight configurations. Imbalance force ~ m_eff * w^2; two weights adjacent
# (red) add up to 2m, perpendicular (blue) to sqrt(2)m, opposite (green) cancel.
CONFIG_IMBALANCE = {1: 2.0, 2: np.sqrt(2.0), 3: 0.0}
HEALTHY_CONFIG = 3
IMBALANCE_MAINT = 0.5  # m_eff * (speed/100)^2 at or above this -> MAINTENANCE

# Current ratio bands (I / I_baseline). LBNL fan power: minor faults x1.02-1.05,
# moderate x1.08-1.10, severe x1.24-1.29 (constant supply voltage -> I ~ P).
CUR_NORMAL_SD = 0.015
CUR_WARN = [(1.06, 1.18), (0.84, 0.92)]
CUR_MAINT = [(1.18, 1.60), (0.50, 0.84)]
# Temperature delta vs baseline (°C). Demo hair dryer: +8..10 °C.
TEMP_NORMAL_SD = 0.8
TEMP_WARN = (3.0, 6.0)
TEMP_MAINT = (6.0, 15.0)

# Scenario mix: healthy / vibration / current / temperature / multi-channel fault.
SCENARIOS = {"healthy": 0.40, "vib": 0.20, "cur": 0.15, "temp": 0.15, "multi": 0.10}
N_TRAIN, N_TEST = 30000, 8000


def uci_windows() -> pd.DataFrame:
    raw = pd.read_csv(UCI_CSV)
    rows = []
    for (conf, pct), g in raw.groupby(["wconfid", "pctid"], sort=False):
        acc = g[["x", "y", "z"]].to_numpy()
        for start in range(0, len(acc) - WINDOW + 1, STRIDE):
            rms, crest, kurt = vibration_stats(acc[start : start + WINDOW])
            rows.append((conf, pct, start, rms, crest, kurt))
    w = pd.DataFrame(rows, columns=["conf", "pct", "start", "vib_rms", "vib_crest", "vib_kurt"])

    # Baseline per speed = what the device learns during its first 20 s while healthy.
    learn = (w.conf == HEALTHY_CONFIG) & (w.start < BASELINE_WINDOWS * WINDOW) & (w.start % WINDOW == 0)
    base = w[learn].groupby("pct")[["vib_rms", "vib_crest", "vib_kurt"]].mean()
    for k in base.columns:
        w["base_" + k] = w.pct.map(base[k])
    # Drop windows that overlap the learning phase of the healthy run.
    w = w[~((w.conf == HEALTHY_CONFIG) & (w.start < BASELINE_WINDOWS * WINDOW))]

    severity = w.conf.map(CONFIG_IMBALANCE) * (w.pct / 100) ** 2
    w["vib_label"] = np.where(w.conf == HEALTHY_CONFIG, 0, np.where(severity >= IMBALANCE_MAINT, 2, 1))
    # Faulty configs at low speed look exactly like healthy ones: unusable as faults.
    return w[(w.conf == HEALTHY_CONFIG) | (w.pct >= MIN_FAULT_SPEED)].reset_index(drop=True)


def draw_current(rng, level):
    if level == 0:
        return 1.0 + rng.normal(0, CUR_NORMAL_SD)
    bands = CUR_WARN if level == 1 else CUR_MAINT
    lo, hi = bands[0] if rng.random() < 0.75 else bands[1]  # overload more common than underload
    return rng.uniform(lo, hi)


def draw_temp(rng, level):
    if level == 0:
        return rng.normal(0, TEMP_NORMAL_SD)
    return rng.uniform(*(TEMP_WARN if level == 1 else TEMP_MAINT))


def generate(windows: pd.DataFrame, n: int, rng) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    healthy = windows[windows.vib_label == 0]
    faulty = windows[windows.vib_label > 0]
    names = list(SCENARIOS)
    picks = rng.choice(names, size=n, p=list(SCENARIOS.values()))

    X, y, channel = [], [], []
    for s in picks:
        faults = {"healthy": [], "vib": ["vib"], "cur": ["cur"], "temp": ["temp"]}.get(s)
        if faults is None:  # multi
            faults = list(rng.choice(["vib", "cur", "temp"], size=rng.integers(2, 4), replace=False))
        pool = faulty if "vib" in faults else healthy
        v = pool.iloc[rng.integers(len(pool))]
        lc = rng.integers(1, 3) if "cur" in faults else 0
        lt = rng.integers(1, 3) if "temp" in faults else 0
        base = {
            "vib_rms": v.base_vib_rms, "vib_crest": v.base_vib_crest, "vib_kurt": v.base_vib_kurt,
            "current": 1.0, "temp": 0.0,
        }
        X.append(model_inputs(v.vib_rms, v.vib_crest, v.vib_kurt, draw_current(rng, lc), draw_temp(rng, lt), base))
        y.append(int(max(v.vib_label, lc, lt)))
        channel.append(s)
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64), np.array(channel)


def main():
    rng = np.random.default_rng(7)
    w = uci_windows()
    test_mask = w.pct.isin(TEST_SPEEDS)
    print(f"UCI windows: {len(w)} ({(~test_mask).sum()} train speeds, {test_mask.sum()} test speeds)")
    print(w.groupby(["vib_label"]).size().rename("windows").to_string())

    OUT.mkdir(parents=True, exist_ok=True)
    for name, mask, n in [("train", ~test_mask, N_TRAIN), ("test", test_mask, N_TEST)]:
        X, y, ch = generate(w[mask], n, rng)
        np.savez(OUT / f"{name}.npz", X=X, y=y, scenario=ch)
        print(f"{name}: {len(y)} samples, class counts {np.bincount(y, minlength=3).tolist()}")


if __name__ == "__main__":
    main()
