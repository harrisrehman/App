#!/usr/bin/env python3
"""Original heroic steppe theme. Not a copy of any recording."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

SR = 22050
DURATION = 32.0
RNG = random.Random(44)

# D pentatonic, horse-gallop kui mood. Original phrases.
D3, A3, D4, E4, FS4, A4, B4, D5, E5, FS5 = (
    146.83,
    220.00,
    293.66,
    329.63,
    369.99,
    440.00,
    493.88,
    587.33,
    659.25,
    739.99,
)

# 8th notes at 126 BPM in 6/8. One bar = 6 eighths.
BPM = 126.0
EIGHTH = 60.0 / BPM / 2.0

# Melody: 32 bars of original gallop figures.
MELODY = [
    (D4, 2), (A4, 1), (D5, 3), (A4, 2), (FS4, 1), (E4, 3),
    (D4, 2), (E4, 1), (FS4, 3), (A4, 2), (FS4, 1), (D4, 3),
    (A4, 2), (B4, 1), (D5, 3), (B4, 2), (A4, 1), (FS4, 3),
    (E4, 2), (FS4, 1), (A4, 2), (FS4, 1), (E4, 2), (D4, 1), (A3, 3),
    (D4, 2), (FS4, 1), (A4, 3), (B4, 2), (A4, 1), (FS4, 3),
    (D5, 2), (B4, 1), (A4, 3), (FS4, 2), (E4, 1), (D4, 3),
    (A3, 2), (D4, 1), (E4, 2), (FS4, 1), (A4, 3), (FS4, 3),
    (E4, 2), (D4, 1), (A3, 3), (D4, 6),
    (A4, 2), (D5, 1), (E5, 3), (D5, 2), (B4, 1), (A4, 3),
    (FS4, 2), (A4, 1), (B4, 3), (A4, 2), (FS4, 1), (E4, 3),
    (D4, 2), (A4, 1), (D5, 2), (A4, 1), (FS4, 3), (D4, 3),
    (E4, 2), (FS4, 1), (A4, 3), (FS4, 2), (E4, 1), (D4, 3),
    (D5, 3), (B4, 3), (A4, 2), (FS4, 1), (E4, 3), (D4, 3),
    (A4, 2), (FS4, 1), (D4, 3), (A3, 2), (D4, 1), (FS4, 3),
    (A4, 3), (D5, 3), (B4, 2), (A4, 1), (FS4, 3), (D4, 3),
    (E4, 2), (D4, 1), (A3, 3), (D4, 6),
]


def clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def env(i: int, n: int, a: float = 0.01, r: float = 0.18) -> float:
    t = i / n
    if t < a:
        return t / a
    if t > 1 - r:
        return max(0.0, (1 - t) / r)
    return 1.0


def karplus(freq: float, dur: float, bright: float = 0.996) -> list[float]:
    n = max(2, int(SR / freq))
    buf = [RNG.uniform(-1.0, 1.0) for _ in range(n)]
    out: list[float] = []
    total = int(dur * SR)
    for i in range(total):
        v = bright * 0.5 * (buf[0] + buf[1])
        buf.pop(0)
        buf.append(v)
        out.append(v * env(i, total, 0.004, 0.22))
    return out


def sine_hit(freq: float, dur: float, decay: float) -> list[float]:
    n = int(dur * SR)
    out = []
    for i in range(n):
        t = i / SR
        out.append(math.sin(2 * math.pi * freq * t) * math.exp(-t * decay))
    return out


def noise_hit(dur: float, decay: float, band: float) -> list[float]:
    n = int(dur * SR)
    out = []
    prev = 0.0
    for i in range(n):
        t = i / SR
        white = RNG.uniform(-1.0, 1.0)
        prev = prev + band * (white - prev)
        out.append(prev * math.exp(-t * decay))
    return out


def mix_at(buf: list[float], src: list[float], at: float, gain: float) -> None:
    start = int(at * SR)
    for i, s in enumerate(src):
        j = start + i
        if 0 <= j < len(buf):
            buf[j] += s * gain


def main() -> None:
    n = int(DURATION * SR)
    buf = [0.0] * n

    # Drone: low D and A
    for i in range(n):
        t = i / SR
        pulse = 0.55 + 0.45 * math.sin(2 * math.pi * t * (BPM / 60.0) / 3)
        buf[i] += 0.07 * pulse * math.sin(2 * math.pi * D3 * 0.5 * t)
        buf[i] += 0.04 * pulse * math.sin(2 * math.pi * A3 * t)

    t = 0.0
    for freq, eights in MELODY:
        dur = eights * EIGHTH
        if t + dur > DURATION:
            break
        mix_at(buf, karplus(freq, dur * 1.15, 0.992), t, 0.62)
        # Quiet octave echo, like a second string
        mix_at(buf, karplus(freq * 0.5, dur * 1.3, 0.997), t, 0.22)
        t += dur

    # Gallop drum: dum on 1, tek on 4 of each 6/8 bar
    bar = 6 * EIGHTH
    beat = 0.0
    while beat < DURATION - 0.05:
        mix_at(buf, sine_hit(72, 0.22, 14), beat, 0.55)
        mix_at(buf, noise_hit(0.08, 28, 0.35), beat, 0.18)
        mix_at(buf, noise_hit(0.05, 40, 0.55), beat + 3 * EIGHTH, 0.28)
        mix_at(buf, sine_hit(90, 0.12, 18), beat + 3 * EIGHTH, 0.18)
        beat += bar

    # Soft high shimmer on downbeats
    beat = 0.0
    while beat < DURATION - 0.05:
        mix_at(buf, sine_hit(D5 * 2, 0.4, 8), beat, 0.04)
        beat += bar * 2

    peak = max(0.001, max(abs(x) for x in buf))
    scale = 0.86 / peak
    samples = [int(clamp(x * scale) * 32767) for x in buf]

    wav_path = Path("/tmp/annex-theme.wav")
    with wave.open(str(wav_path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", s) for s in samples))
    print(f"wrote {wav_path} {wav_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
