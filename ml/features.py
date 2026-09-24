"""Feature extraction shared by training and (mirrored in C) by the ESP32 firmware.

Every reading is one 2 s window: 100 accelerometer samples at 50 Hz plus the mean
current and temperature over the window. The network never sees absolute values:
each feature is relative to the unit's own learned baseline, so a model trained on a
12 cm lab fan transfers to a different fan once that fan has learned its normal.

Keep this file and SentinelBox/sentinel_ann.h in sync.
"""

import numpy as np

SAMPLE_HZ = 50
WINDOW = 100  # samples per reading (2 s)

FEATURES = ["vib_rms", "vib_crest", "vib_kurt", "current", "temp"]
CLASSES = ["NORMAL", "WARNING", "MAINTENANCE"]
# health_pct = expected health over the class probabilities.
CLASS_HEALTH = np.array([100.0, 55.0, 10.0])

LOG2_CLAMP = (-4.0, 6.0)
TEMP_SCALE = 5.0  # °C per unit of the temperature input
# Vibration below this RMS (g) is sensor noise (MPU6500 ~0.004-0.008 g): ratios use
# max(rms, floor), and crest/kurtosis fade out near the floor (full weight at 2x floor).
# The UCI fan never goes below ~0.06 g, so training data is unaffected.
VIB_FLOOR_G = 0.02


def vibration_stats(acc: np.ndarray) -> tuple[float, float, float]:
    """acc: (WINDOW, 3) accelerations in g. Returns (rms, crest, kurtosis).

    The mean of each axis (gravity + mounting tilt) is removed first, so the stats
    do not depend on how the sensor is oriented.
    """
    ac = acc - acc.mean(axis=0)
    mag = np.sqrt((ac**2).sum(axis=1))
    rms = float(np.sqrt((mag**2).mean())) + 1e-9
    crest = float(mag.max() / rms)
    flat = ac.ravel()
    var = float((flat**2).mean()) + 1e-12
    kurt = float((flat**4).mean() / var**2)  # Pearson kurtosis (3 for Gaussian)
    return rms, crest, kurt


def model_inputs(vib_rms, vib_crest, vib_kurt, current, temp, base) -> np.ndarray:
    """Relative features for the network. `base` holds the same keys as baselines.

    Works on scalars or numpy arrays.
    """
    def lr(x, b):
        return np.clip(np.log2(np.maximum(x, 1e-6) / b), *LOG2_CLAMP)

    shape_w = np.clip(np.asarray(vib_rms) / VIB_FLOOR_G - 1, 0, 1)
    return np.stack(
        [
            lr(np.maximum(vib_rms, VIB_FLOOR_G), max(base["vib_rms"], VIB_FLOOR_G))
            if np.isscalar(base["vib_rms"])
            else lr(np.maximum(vib_rms, VIB_FLOOR_G), np.maximum(base["vib_rms"], VIB_FLOOR_G)),
            shape_w * lr(vib_crest, base["vib_crest"]),
            shape_w * lr(vib_kurt, base["vib_kurt"]),
            lr(current, base["current"]),
            (np.asarray(temp) - base["temp"]) / TEMP_SCALE,
        ],
        axis=-1,
    )
