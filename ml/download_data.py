"""Downloads the raw datasets into data/raw (git-ignored).

python download_data.py          # UCI fan accelerometer (3.6 MB), needed for training
python download_data.py --lbnl   # also LBNL fan-coil FDD (530 MB zip), only to redo
                                 # calibration/lbnl_fcu_fan_power.csv
"""

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

RAW = Path(__file__).parent / "data/raw"
UCI_URL = "https://archive.ics.uci.edu/static/public/846/accelerometer.zip"
LBNL_URL = "https://fdddata.lbl.gov/data/Simulated_LBNL_FDD_Data_Sets_FCU/LBNL_FDD_Data_Sets_FCU.zip"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    target = RAW / "uci_fan_accelerometer.csv"
    if not target.exists():
        with zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(UCI_URL).read())) as z:
            name = next(n for n in z.namelist() if n.endswith(".csv"))
            target.write_bytes(z.read(name))
    print("UCI ->", target)

    if "--lbnl" in sys.argv:
        zpath = RAW / "LBNL_FCU.zip"
        if not zpath.exists():
            urllib.request.urlretrieve(LBNL_URL, zpath)
        with zipfile.ZipFile(zpath) as z:
            z.extractall(RAW / "lbnl_fcu")
        print("LBNL ->", RAW / "lbnl_fcu")


if __name__ == "__main__":
    main()
