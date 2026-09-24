"""Records labelled readings from the SentinelBox serial port into data/real/.

The firmware prints one `CSV,...` line per 2 s window, with the raw features and the
learned baseline. This script keeps those lines, adds the label you give it, and
appends them to one CSV per session. Run it once per condition (see ml/README.md,
"Building the real dataset").

python collect_serial.py --port /dev/ttyUSB0 --label 0 --scenario normal --seconds 300
python collect_serial.py --port COM5 --label 2 --scenario dryer_close --seconds 120 --skip 20

Requires `pip install pyserial`. Close the Arduino serial monitor first: only one
program can hold the port.
"""

import argparse
import csv
import time
from datetime import datetime
from pathlib import Path

import serial

from features import CLASSES

REAL = Path(__file__).parent / "data/real"
FIELDS = [
    "millis", "unit_id", "vib_ok", "cur_real", "temp_real",
    "vib_rms", "vib_crest", "vib_kurt", "current", "temp",
    "base_vib_rms", "base_vib_crest", "base_vib_kurt", "base_current", "base_temp",
    "pred_cls", "pred_health",
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--label", type=int, choices=range(len(CLASSES)), required=True,
                    help="0 NORMAL, 1 WARNING, 2 MAINTENANCE")
    ap.add_argument("--scenario", required=True, help="short name, e.g. normal, dryer_far, blade_mass_small")
    ap.add_argument("--seconds", type=float, default=180)
    ap.add_argument("--skip", type=float, default=0, help="seconds to discard at the start (transition)")
    args = ap.parse_args()

    REAL.mkdir(parents=True, exist_ok=True)
    session = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = REAL / f"{session}_{args.scenario}_L{args.label}.csv"
    t_start = time.time()
    n = 0
    with serial.Serial(args.port, args.baud, timeout=3) as port, path.open("w", newline="") as f:
        out = csv.writer(f)
        out.writerow(["session", "scenario", "label", *FIELDS])
        print(f"Recording {CLASSES[args.label]} / {args.scenario} -> {path}")
        while (elapsed := time.time() - t_start) < args.seconds:
            line = port.readline().decode(errors="replace").strip()
            if not line.startswith("CSV,"):
                continue
            row = line.split(",")[1:]
            if len(row) != len(FIELDS) or elapsed < args.skip:
                continue
            out.writerow([session, args.scenario, args.label, *row])
            f.flush()
            n += 1
            rec = dict(zip(FIELDS, row))
            print(f"\r{elapsed:5.0f}s  windows={n:4d}  model says {CLASSES[int(rec['pred_cls'])]:<11s} "
                  f"health={float(rec['pred_health']):5.1f}", end="", flush=True)
    print(f"\nSaved {n} windows. No rows? Check the baseline is learned (firmware stops printing LEARNING).")


if __name__ == "__main__":
    main()
