"""Live view of what a SentinelBox board prints over USB serial. Nothing is recorded.

Works with the gateway (`TX {...}` lines: what it POSTs every 2 s; `RX UART: {...}`: what
arrives from the HVAC; a bare `{...}` line: the older gateway firmware) and with the HVAC
nodes (`LINK> {...}` lines: what they send over UART). Every line is echoed to the
terminal, and the JSON readings are plotted per unit_id. Anything typed in the terminal
is sent to the board: `r` relearns the baseline and `v` echoes the UART on the gateway;
on an HVAC node, a number 0-100 sets the fan speed.

python monitor.py                      # first /dev/ttyUSB* or /dev/ttyACM*
python monitor.py --port /dev/ttyUSB0 --window 300

Close the Arduino serial monitor first: only one program can hold the port.
"""

import argparse
import glob
import json
import re
import sys
import threading
import time
from collections import defaultdict, deque

import matplotlib.pyplot as plt
import serial
from matplotlib.animation import FuncAnimation

FIELDS = [("health_pct", "Salud (%)"), ("current", "Corriente (A)"), ("temperature", "Temperatura (°C)"),
          ("vibration", "Vibración (mm/s)")]
JSON_RE = re.compile(r"\{.*\}")


def find_port():
    ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
    if not ports:
        sys.exit("No serial port found. Is the board plugged in? (Ubuntu: see ml/README.md, brltty)")
    return ports[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--window", type=float, default=180, help="seconds shown on the plot")
    args = ap.parse_args()

    port = serial.Serial(args.port or find_port(), args.baud, timeout=1)
    print(f"Listening on {port.port} @ {args.baud}. Type r / v / 0-100 + Enter to send to the board.")
    t0 = time.time()
    data = defaultdict(lambda: {f: deque() for f, _ in FIELDS} | {"t": deque(), "status": deque()})
    lock = threading.Lock()

    def reader():
        while True:
            line = port.readline().decode(errors="replace").rstrip()
            if not line:
                continue
            print(line)
            m = JSON_RE.search(line)
            if not m or not line.startswith(("TX ", "LINK>", "RX UART:", "{")):
                continue
            try:
                r = json.loads(m.group(0))
            except json.JSONDecodeError:
                continue
            if "unit_id" not in r:
                continue
            with lock:
                d = data[r["unit_id"]]
                d["t"].append(time.time() - t0)
                d["status"].append(r.get("status"))
                for f, _ in FIELDS:
                    d[f].append(r.get(f))

    def writer():
        for line in sys.stdin:
            port.write((line.strip() + "\n").encode())

    threading.Thread(target=reader, daemon=True).start()
    threading.Thread(target=writer, daemon=True).start()

    fig, axes = plt.subplots(len(FIELDS), 1, sharex=True, figsize=(9, 8))
    fig.canvas.manager.set_window_title("SentinelBox — live")

    def draw(_):
        now = time.time() - t0
        with lock:
            for ax, (f, label) in zip(axes, FIELDS):
                ax.clear()
                ax.set_ylabel(label, fontsize=9)
                ax.grid(alpha=0.3)
                for i, (unit, d) in enumerate(data.items()):
                    pts = [(t, v) for t, v in zip(d["t"], d[f]) if v is not None and t > now - args.window]
                    if pts:
                        ax.plot(*zip(*pts), marker=".", label=unit, color=f"C{i}")
                    if f == "health_pct":
                        for t, s in zip(d["t"], d["status"]):
                            if s == "degraded" and t > now - args.window:
                                ax.axvspan(t - 1, t + 1, color="red", alpha=0.12, lw=0)
                if f == "health_pct":
                    ax.set_ylim(-5, 105)
                    ax.axhline(70, color="orange", ls="--", lw=0.8)
                if ax.lines and ax.get_legend_handles_labels()[1]:
                    ax.legend(loc="upper left", fontsize=8)
            axes[-1].set_xlabel("segundos")
            axes[-1].set_xlim(max(0, now - args.window), max(now, 10))

    _anim = FuncAnimation(fig, draw, interval=1000, cache_frame_data=False)
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()
