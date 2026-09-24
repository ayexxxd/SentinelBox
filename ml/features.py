"""Feature extraction shared by training and (mirrored in C) by the ESP32 firmware.

Every reading is one 2 s window: 100 accelerometer samples at 50 Hz plus the mean
current and temperature over the window. The network never sees absolute values:
each feature is relative to the unit's own learned baseline, so a model trained on a
12 cm lab fan transfers to a different fan once that fan has learned its normal.

Keep this file and firmware/SentinelBoxANN/sentinel_features.h in sync.
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

    return np.stack(
        [
            lr(vib_rms, base["vib_rms"]),
            lr(vib_crest, base["vib_crest"]),
            lr(vib_kurt, base["vib_kurt"]),
            lr(current, base["current"]),
            (np.asarray(temp) - base["temp"]) / TEMP_SCALE,
        ],
        axis=-1,
    )
