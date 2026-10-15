"""Builds public/videos/briefing.mp4: the briefing deck, narrated.

Each slide of briefing.html is screenshot in `?render=N` mode, gameplay b-roll is composited into
its video box, and slides last as long as their narration (voiced from each slide's `say` text by
trailer-work/brief/tts.py). Slides crossfade; a quiet synthesised pad sits under the voice.

    python tools/make_briefing_video.py http://localhost:5191
"""
import json
import pathlib
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from scipy.io import wavfile
from scipy.signal import butter, lfilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = ROOT / "trailer-work/brief"
SHOTS, VOICE, SEG = WORK / "shots", WORK / "voice", WORK / "seg"
BROLL = ROOT / "trailer-work/broll"
OUT = ROOT / "public/videos/briefing.mp4"
FPS, XF, LEAD, TAIL = 30, 0.5, 0.7, 1.1
for d in (SHOTS, SEG):
    d.mkdir(exist_ok=True)

src = (ROOT / "src/briefing/slides.ts").read_text(encoding="utf8")
# Per slide: (b-roll name, start second) or None, in deck order.
videos = []
for block in re.split(r"\n  \{\n", src)[1:]:
    m = re.search(r'broll: "([^"]+)", start: (\d+)', block)
    videos.append((m.group(1), int(m.group(2))) if m else None)
n = len(videos)
voice = json.loads((VOICE / "durs.json").read_text())
assert len(voice) == n, (len(voice), n)


def run(*args):
    subprocess.run(args, check=True)


def probe(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout)


# 1. Screenshots and video-box positions.
boxes = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")
    p = b.new_page(viewport={"width": 1920, "height": 1080})
    for i in range(1, n + 1):
        p.goto(f"{sys.argv[1]}/briefing.html?render={i}")
        p.wait_for_load_state("networkidle")
        p.evaluate("document.fonts.ready")
        p.wait_for_timeout(300)
        box = p.evaluate("(() => { const v = document.querySelector('#vbox'); if (!v) return null; const r = v.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
        if box:
            boxes[i] = [round(x) for x in box]
        p.screenshot(path=str(SHOTS / f"slide{i:02d}.png"))
    b.close()

# 2. One silent segment per slide, b-roll composited into a rounded box inside the 2px border.
durs = []
for i in range(1, n + 1):
    dur = LEAD + voice[i - 1] + TAIL + (XF if 1 < i < n else XF / 2) + (2.0 if i == n else 0)
    durs.append(dur)
    seg = SEG / f"seg{i:02d}.mp4"
    shot = SHOTS / f"slide{i:02d}.png"
    enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an", str(seg)]
    if i in boxes:
        x, y, w, h = boxes[i]
        x, y, w, h = x + 2, y + 2, w - 4, h - 4
        mask = SEG / f"mask{i:02d}.png"
        im = Image.new("L", (w, h), 0)
        ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], radius=16, fill=255)
        im.save(mask)
        name, start = videos[i - 1]
        clip = BROLL / f"{name}.mp4"
        start = max(0, min(start, probe(clip) - dur - 0.1))
        run("ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(shot),
            "-ss", str(start), "-t", f"{dur:.3f}", "-i", str(clip), "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(mask),
            "-filter_complex", f"[1:v]fps={FPS},scale={w}:{h}:flags=lanczos,format=rgba[v];[2:v]format=gray[m];[v][m]alphamerge[vm];[0:v][vm]overlay={x}:{y}:shortest=1,format=yuv420p",
            "-t", f"{dur:.3f}", *enc)
    else:
        run("ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(shot), "-vf", "format=yuv420p", *enc)

# 3. Crossfade the segments; voice i starts LEAD seconds after slide i begins.
starts, t = [], 0.0
for d in durs:
    starts.append(t)
    t += d - XF
total = starts[-1] + durs[-1]

# 4. A quiet pad: slow Am–F–C–G, soft sines, low-passed, with gentle swells.
sr = 44100
tt = np.arange(int(total * sr)) / sr
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 261.63, 329.63], [196.0, 246.94, 293.66]]
bar = 8.0
pad = np.zeros_like(tt)
for k, chord in enumerate(chords * int(total // (bar * 4) + 1)):
    a, z = k * bar, (k + 1) * bar + 2
    sel = (tt >= a) & (tt < z)
    if not sel.any():
        break
    local = tt[sel] - a
    env = np.clip(local / 2.5, 0, 1) * np.clip((z - a - local) / 2.5, 0, 1)
    for f in chord:
        pad[sel] += env * (np.sin(2 * np.pi * f / 2 * local) + 0.35 * np.sin(2 * np.pi * f * local))
bb, aa = butter(2, 900 / (sr / 2))
pad = lfilter(bb, aa, pad)
pad *= 0.5 + 0.5 * np.sin(2 * np.pi * tt / 23)
pad = pad / np.abs(pad).max() * 0.9
fade = np.clip(tt / 3, 0, 1) * np.clip((total - tt) / 4, 0, 1)
wavfile.write(SEG / "pad.wav", sr, (pad * fade * 32767).astype(np.int16))

inputs, vf = [], []
for i in range(1, n + 1):
    inputs += ["-i", str(SEG / f"seg{i:02d}.mp4")]
last = "[0:v]"
for i in range(1, n):
    off = starts[i]
    vf.append(f"{last}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
    last = f"[x{i}]"
for i in range(1, n + 1):
    inputs += ["-i", str(VOICE / f"s{i:02d}.mp3")]
inputs += ["-i", str(SEG / "pad.wav")]
af = []
for i in range(n):
    ms = int((starts[i] + LEAD) * 1000)
    af.append(f"[{n + i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{i}]")
af.append(f"[{2 * n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.07[pad]")
af.append("".join(f"[a{i}]" for i in range(n)) + f"[pad]amix=inputs={n + 1}:normalize=0:duration=longest,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
run("ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", last, "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(OUT))
Image.open(SHOTS / "slide01.png").convert("RGB").save(ROOT / "public/videos/briefing.jpg", quality=86)
print(f"{OUT}: {probe(OUT):.1f}s, {OUT.stat().st_size / 1e6:.1f} MB")
