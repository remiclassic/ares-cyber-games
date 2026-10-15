"""Builds the Ares Cyber Games trailer: public/videos/ares-trailer.mp4 (1920×1080, ~70 s).

Needs: clean b-roll in trailer-work/broll (CLEAN=1 OUT_DIR=trailer-work/broll python
tools/record_videos.py ...), the core clips in public/videos/core, Python Playwright with the
installed Chrome, numpy, scipy and ffmpeg. Everything (cards, name tags, the soundtrack) is
generated here; there are no outside assets or licences.

Timeline (120 BPM, a bar is 2 s):
  0–8   cold open      8–12 logo      12–14 "22 games"
  14–16 Act I card     16–32 eight clips × 2 s
  32–34 Act II card    34–50 eight clips × 2 s
  50–52 Act III card   52–58 six clips × 1 s     58–62 eight flashes × 0.5 s
  62–70 finale
"""

import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
W = ROOT / "trailer-work"
GFX = W / "gfx"
SEG = W / "seg"
BROLL = W / "broll"
CORE = ROOT / "public" / "videos" / "core"
OUT = ROOT / "public" / "videos" / "ares-trailer.mp4"
FPS = 30
SR = 44100
TOTAL = 70.0

# (clip, start second, name, one-line skill, tag)
ACT1 = [
    ("broll/spot-the-phish", 17, "Spot the Phish", "Read the evidence. Report, verify or trust.", "NEW"),
    ("core/phishing", 6.5, "Phishing Speed Drill", "Every cue explained.", "CORE"),
    ("core/triage", 4, "Incident Triage Race", "Priority from evidence, not the label.", "CORE"),
    ("core/soc", 16, "SOC Dashboard Challenge", "Proportionate response under time.", "CORE"),
    ("broll/blast-radius", 26, "Blast Radius", "Scope before you contain.", "NEW"),
    ("broll/counterplay", 41, "Counterplay", "Read it. Name it. Counter it.", "NEW"),
    ("broll/pattern-patrol", 29, "Pattern Patrol", "Catch the attack, not the noise.", "REMIX"),
    ("core/queryhunt", 7.5, "Query Hunt", "SQL on real logs, in your browser.", "CORE"),
]
ACT2 = [
    ("core/network-defense", 16.5, "Network Defense", "Keep the business online.", "CORE"),
    ("broll/defense-in-depth", 42, "Defense in Depth", "Layer it. They will adapt.", "NEW"),
    ("broll/rule-order", 18.5, "Rule Order", "First match wins.", "NEW"),
    ("broll/port-authority", 11, "Port Authority", "Every port tells you who is knocking.", "REMIX"),
    ("core/privilege", 11.5, "Privilege Path Puzzle", "Who can really read payroll?", "CORE"),
    ("broll/bit-by-bit", 39, "Bit by Bit", "Binary, masks and subnets.", "NEW"),
    ("broll/blind-spots", 24, "Blind Spots", "You can't stop what you can't see.", "REMIX"),
    ("core/cloud", 10, "Cloud Command", "Capacity, cost, least privilege.", "CORE"),
]
ACT3 = [
    ("broll/secure-stack", 30, "Secure Stack", "Match every threat to its defence.", "NEW"),
    ("broll/tactic-orbit", 21, "Tactic Orbit", "Name the tactic. Raise the shield.", "REMIX"),
    ("broll/chain-breaker", 31, "Chain Breaker", "Break the kill chain early.", "REMIX"),
    ("broll/confidence-board", 30, "Confidence Board", "Know what you know.", "REMIX"),
    ("broll/spot-the-risks", 29, "Spot the Risks", "See it. Name it. Fix it.", "NEW"),
    ("core/dispatch", 7, "Cyber Dispatch", "First response, clean handoff.", "CORE"),
]
FLASH = [
    ("broll/secure-stack", 60.5), ("broll/defense-in-depth", 64), ("broll/blast-radius", 66), ("broll/counterplay", 72),
    ("broll/confidence-board", 26), ("core/network-defense", 5), ("broll/pattern-patrol", 41), ("broll/chain-breaker", 37.5),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def source(key: str) -> Path:
    folder, name = key.split("/")
    return (BROLL if folder == "broll" else CORE) / f"{name}.mp4"


# ---------------------------------------------------------------- graphics

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700;800;900&family=Inter:wght@500;700&display=swap');
* { margin: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; }
body { font-family: Inter, sans-serif; color: #e8f0fb; }
.card { width: 100%; height: 100%; display: grid; place-items: center; text-align: center;
  background: radial-gradient(1200px 600px at 50% 45%, #10306a 0%, #071531 45%, #02060f 100%); position: relative; }
.card::before { content: ""; position: absolute; inset: 0;
  background: linear-gradient(rgba(80,150,230,.07) 1px, transparent 1px) 0 0/100% 64px, linear-gradient(90deg, rgba(80,150,230,.07) 1px, transparent 1px) 0 0/64px 100%; }
.card::after { content: ""; position: absolute; inset: 0; background: radial-gradient(closest-side, transparent 60%, rgba(0,0,0,.65)); }
.inner { position: relative; z-index: 1; display: grid; justify-items: center; gap: 22px; }
.kicker { font: 800 30px "Exo 2"; letter-spacing: .5em; color: #38d6f5; text-transform: uppercase; }
.big { font: 900 150px/0.95 "Exo 2"; letter-spacing: .06em; text-transform: uppercase; color: #fff;
  text-shadow: 0 0 40px rgba(80,170,255,.75), 0 0 120px rgba(56,214,245,.35); }
.mid { font: 800 96px/1 "Exo 2"; letter-spacing: .08em; text-transform: uppercase; color: #fff; text-shadow: 0 0 40px rgba(80,170,255,.6); }
.sub { font: 600 34px Inter; color: #9fc4ee; letter-spacing: .04em; }
.line { width: 520px; height: 4px; background: linear-gradient(90deg, transparent, #38d6f5, transparent); }
.logo svg { width: 190px; height: 190px; filter: drop-shadow(0 0 30px rgba(56,214,245,.8)); }
.tags { display: flex; gap: 18px; }
.tags span { font: 800 26px "Exo 2"; letter-spacing: .14em; padding: 10px 22px; border-radius: 10px; border: 2px solid rgba(56,214,245,.6); color: #cfeeff; }
.url { font: 700 36px Inter; color: #fde047; letter-spacing: .02em; }
.lt { position: absolute; left: 70px; bottom: 70px; display: flex; align-items: stretch; gap: 0;
  filter: drop-shadow(0 10px 30px rgba(0,0,0,.6)); }
.lt .bar { width: 12px; background: #38d6f5; box-shadow: 0 0 24px #38d6f5; }
.lt .box { background: linear-gradient(90deg, rgba(4,12,28,.95), rgba(4,12,28,.82)); padding: 18px 34px 20px 26px; display: grid; gap: 4px; }
.lt .tag { font: 800 20px "Exo 2"; letter-spacing: .3em; color: #38d6f5; }
.lt .tag.REMIX { color: #fbbf24; } .lt .tag.CORE { color: #7df0b0; }
.lt .name { font: 900 64px/1 "Exo 2"; letter-spacing: .04em; text-transform: uppercase; color: #fff; }
.lt .skill { font: 600 28px Inter; color: #b9d3f2; }
.corner { position: absolute; right: 60px; top: 50px; font: 800 22px "Exo 2"; letter-spacing: .4em; color: rgba(232,240,251,.75); }
"""
LOGO = '<svg viewBox="0 0 48 48" fill="none"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

CARDS = {
    "cold1": '<div class="inner"><div class="mid">Attacks don\'t wait.</div></div>',
    "cold2": '<div class="inner"><div class="mid">Neither should<br>your team.</div></div>',
    "logo": f'<div class="inner"><div class="logo">{LOGO}</div><div class="kicker">Project Ares</div><div class="big">Ares Cyber<br>Games</div></div>',
    "count": '<div class="inner"><div class="big">22 games.</div><div class="line"></div><div class="mid" style="font-size:72px">One mission.</div></div>',
    "act1": '<div class="inner"><div class="kicker">Act I</div><div class="big">Read the<br>evidence</div><div class="sub">Phishing · triage · SOC · logs · SQL</div></div>',
    "act2": '<div class="inner"><div class="kicker">Act II</div><div class="big">Build the<br>defence</div><div class="sub">Networks · firewalls · ports · access · cloud</div></div>',
    "act3": '<div class="inner"><div class="kicker">Act III</div><div class="big">Play to<br>learn</div><div class="sub">Sticker piles · orbits · card tables · quiz boards</div></div>',
    "final": f'<div class="inner"><div class="logo">{LOGO}</div><div class="big">Ares Cyber<br>Games</div><div class="tags"><span>22 GAMES</span><span>NO INSTALL</span><span>EVERY MISTAKE EXPLAINED</span></div><div class="url">remiclassic.github.io/ares-cyber-games</div></div>',
}


def make_graphics() -> None:
    from playwright.sync_api import sync_playwright

    GFX.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        for name, body in CARDS.items():
            page.set_content(f"<style>{CSS}</style><div class='card'>{body}</div>")
            page.wait_for_timeout(700)
            page.screenshot(path=str(GFX / f"{name}.png"))
        for key, _, title, skill, tag in ACT1 + ACT2 + ACT3:
            page.set_content(
                f"<style>{CSS} html,body{{background:transparent}}</style>"
                f"<div class='lt'><div class='bar'></div><div class='box'><div class='tag {tag}'>{tag}</div><div class='name'>{title}</div><div class='skill'>{skill}</div></div></div>"
                            )
            page.wait_for_timeout(250)
            page.screenshot(path=str(GFX / f"lt-{key.split('/')[1]}.png"), omit_background=True)
        browser.close()


# ---------------------------------------------------------------- video segments

def card_segment(name: str, dur: float, out: Path, flash: bool = True) -> None:
    frames = int(dur * FPS)
    # Still card, no zoom: zoompan rounds to whole pixels and shakes.
    vf = (
        f"loop=loop={frames - 1}:size=1:start=0,setpts=N/{FPS}/TB,"
        f"fade=in:st=0:d={0.12 if flash else 0.5},fade=out:st={dur - 0.25}:d=0.25,format=yuv420p"
    )
    # One input frame: zoompan then emits exactly `frames` frames.
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(GFX / f"{name}.png"), "-vf", vf, "-frames:v", str(frames), "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", str(out)])


def clip_segment(key: str, start: float, dur: float, out: Path, tag: bool) -> None:
    base = (
        # No camera drift: whole-pixel crop steps made it judder.
        f"[0:v]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
        f"eq=contrast=1.08:saturation=1.18:brightness=0.01,vignette=PI/5,"
        f"rgbashift=rh=10:bh=-10:enable='lt(t,0.1)',"
        f"fade=in:st=0:d=0.06:color=white"
    )
    inputs = ["-ss", str(start), "-t", str(dur), "-i", str(source(key))]
    if tag:
        lt = GFX / f"lt-{key.split('/')[1]}.png"
        inputs += ["-loop", "1", "-t", str(dur), "-i", str(lt)]
        graph = f"{base}[v];[1:v]format=rgba,fade=in:st=0.12:d=0.22:alpha=1[l];[v][l]overlay=0:0,format=yuv420p[o]"
    else:
        graph = f"{base},format=yuv420p[o]"
    run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[o]", "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-t", str(dur), str(out)])


def make_segments() -> list[Path]:
    SEG.mkdir(parents=True, exist_ok=True)
    order: list[tuple[str, tuple]] = [
        ("black", (0.5,)), ("card", ("cold1", 3.5, False)), ("card", ("cold2", 4.0, False)),
        ("card", ("logo", 4.0, True)), ("card", ("count", 2.0, True)), ("card", ("act1", 2.0, True)),
        *[("clip", (k, s, 2.0, True)) for k, s, *_ in ACT1],
        ("card", ("act2", 2.0, True)),
        *[("clip", (k, s, 2.0, True)) for k, s, *_ in ACT2],
        ("card", ("act3", 2.0, True)),
        *[("clip", (k, s, 1.0, True)) for k, s, *_ in ACT3],
        *[("clip", (k, s, 0.5, False)) for k, s in FLASH],
        ("card", ("final", 8.0, True)),
    ]
    paths = []
    for i, (kind, args) in enumerate(order):
        out = SEG / f"{i:02d}.mp4"
        if kind == "black":
            run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=black:s=1920x1080:r={FPS}:d={args[0]}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
        elif kind == "card":
            card_segment(args[0], args[1], out, args[2])
        else:
            clip_segment(args[0], args[1], args[2], out, args[3])
        paths.append(out)
    return paths


# ---------------------------------------------------------------- soundtrack

def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def lowpass(x: np.ndarray, hz: float, order: int = 4) -> np.ndarray:
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, hz: float) -> np.ndarray:
    return sosfilt(butter(4, hz, "high", fs=SR, output="sos"), x)


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


rng = np.random.default_rng(7)


def saw(freq, t):
    return 2 * ((freq * t) % 1.0) - 1


def kick(gain=1.0):
    t = t_axis(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return gain * (np.sin(ph) * np.exp(-t * 7) + 0.3 * rng.standard_normal(len(t)) * np.exp(-t * 300))


def snare(gain=0.6):
    t = t_axis(0.3)
    n = bandpass(rng.standard_normal(len(t)), 900, 7000) * np.exp(-t * 18)
    return gain * (n + 0.5 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25))


def hat(gain=0.18, length=0.06):
    t = t_axis(length)
    return gain * highpass(rng.standard_normal(len(t)), 7000) * np.exp(-t * 70)


def tom(gain=0.8, base=70):
    t = t_axis(0.7)
    f = base + 50 * np.exp(-t * 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return gain * (np.sin(ph) * np.exp(-t * 5) + 0.15 * lowpass(rng.standard_normal(len(t)), 800) * np.exp(-t * 20))


def reverb(x, seconds=2.5, mix=0.35):
    t = t_axis(seconds)
    ir = rng.standard_normal(len(t)) * np.exp(-t * 3.2)
    ir = lowpass(ir, 5000)
    wet = np.convolve(x, ir)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    return x + mix * wet * np.max(np.abs(x))


def impact(gain=1.0):
    t = t_axis(3.5)
    f = 30 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    noise = lowpass(rng.standard_normal(len(t)), 1500) * np.exp(-t * 4)
    return reverb(gain * (boom + 0.45 * noise), 3.0, 0.5)


def braam(gain=0.7, seconds=4.0, root=36.71):
    t = t_axis(seconds)
    x = sum(saw(root * m * (1 + d), t) for m in (1, 2, 3, 4) for d in (-0.004, 0.0, 0.005))
    x = np.tanh(1.8 * x / 6)
    sweep = lowpass(x, 400)  # body
    bright = lowpass(x, 1800) * np.exp(-t * 1.5)
    env = np.minimum(1, t / 0.03) * np.exp(-t * 0.6)
    return gain * (sweep + 0.6 * bright) * env


def riser(seconds=2.0, gain=0.5):
    t = t_axis(seconds)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(n)
    chunks = 20
    for i in range(chunks):
        a, b = i * len(n) // chunks, (i + 1) * len(n) // chunks
        lo = 300 + 6000 * (i / chunks) ** 2
        out[a:b] = bandpass(n[a:b], lo, lo * 2.2)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / seconds) ** 2) / SR)
    env = (t / seconds) ** 2.2
    return gain * (out + 0.25 * sweep) * env


NOTES = {"D": 73.42, "F": 87.31, "A": 110.0, "Bb": 116.54, "C": 130.81, "E": 82.41, "G": 98.0}
CHORDS = [("D", ["D", "F", "A"]), ("Bb", ["Bb", "D", "F"]), ("F", ["F", "A", "C"]), ("C", ["C", "E", "G"])]


def pad_chord(names, seconds, gain=0.18):
    t = t_axis(seconds)
    x = sum(saw(NOTES[n] * 2 * (1 + d), t) for n in names for d in (-0.003, 0.003))
    x = lowpass(x, 1400)
    env = np.minimum(1, t / 0.4) * np.minimum(1, (seconds - t) / 0.3)
    return gain * x * env / len(names)


def bass_note(name, seconds, gain=0.35):
    t = t_axis(seconds)
    x = lowpass(saw(NOTES[name] / 2, t) + 0.5 * np.sign(np.sin(2 * np.pi * NOTES[name] / 2 * t)), 500)
    return gain * x * np.exp(-t * 6) * np.minimum(1, t / 0.005)


def lead_note(freq, seconds, gain=0.12):
    t = t_axis(seconds)
    x = lowpass(np.sign(np.sin(2 * np.pi * freq * t)) * 0.6 + saw(freq * 1.003, t) * 0.4, 3500)
    return gain * x * np.exp(-t * 5)


def make_music(path: Path) -> None:
    mix = np.zeros(int(TOTAL * SR) + SR * 4)

    def put(x, at, g=1.0):
        a = int(at * SR)
        b = min(len(mix), a + len(x))
        mix[a:b] += g * x[: b - a]

    # Cold open: drone + heartbeat.
    t = t_axis(14)
    drone = lowpass(sum(saw(36.71 * (1 + d), t) for d in (-0.004, 0, 0.004)), 220) * 0.18 * np.minimum(1, t / 3)
    put(drone, 0)
    for beat in np.arange(0.6, 7.5, 1.0):
        put(kick(0.55), beat)
        put(kick(0.35), beat + 0.22)
    put(riser(2.5, 0.45), 5.5)
    # Logo hit.
    put(impact(1.1), 8.0)
    put(braam(0.8, 4.0), 8.0)
    put(riser(2.0, 0.5), 12.0)
    # Main groove: 14–62, chords per bar (2 s) from 16.
    for at in (14.0, 32.0, 50.0):
        put(impact(0.9), at)
        put(braam(0.55, 2.0), at)
        put(riser(1.5, 0.45), at - 1.5)
    for bar_start in np.arange(16.0, 62.0, 2.0):
        if 32.0 <= bar_start < 34.0 or 50.0 <= bar_start < 52.0:
            continue
        root, notes = CHORDS[int((bar_start - 16) / 2) % 4]
        put(pad_chord(notes, 2.0, 0.2 if bar_start < 50 else 0.26), bar_start)
        intense = bar_start >= 52
        for i in range(16):  # 16th-note bass ostinato
            n = root if i % 4 != 2 else notes[2]
            put(bass_note(n, 0.125, 0.32 if i % 4 == 0 else 0.22), bar_start + i * 0.125)
        for b in range(4):  # beats
            at = bar_start + b * 0.5
            put(kick(0.9), at)
            if b % 2 == 1:
                put(snare(0.55 if not intense else 0.7), at)
            for h in range(4 if intense else 2):
                put(hat(0.16 if h % 2 == 0 else 0.1), at + h * (0.125 if intense else 0.25))
        if bar_start >= 34:
            put(tom(0.5, 75), bar_start + 1.75)
            put(tom(0.45, 60), bar_start + 1.875)
        if intense:  # arpeggio lead
            arp = [notes[0], notes[1], notes[2], notes[1]] * 2
            for i, n in enumerate(arp):
                put(lead_note(NOTES[n] * 4, 0.25), bar_start + i * 0.25)
    # Flash montage: snare roll into the final hit.
    for i, at in enumerate(np.arange(58.0, 62.0, 0.125 - 0.0)):
        put(snare(0.25 + 0.4 * i / 32), at)
    put(riser(3.0, 0.6), 59.0)
    # Finale.
    put(impact(1.3), 62.0)
    put(braam(1.0, 6.0), 62.0)
    tail = t_axis(8)
    put(lowpass(sum(saw(f * (1 + d), tail) for f in (73.42, 110.0, 146.83, 174.61) for d in (-0.003, 0.003)), 1200) * 0.06 * np.exp(-tail * 0.35), 62.0)
    put(tom(0.9, 55), 66.0)

    mix = mix[: int(TOTAL * SR)]
    mix = np.tanh(1.2 * mix / (np.max(np.abs(mix)) + 1e-9)) * 0.89
    fade = np.ones_like(mix)
    n = int(2.0 * SR)
    fade[-n:] = np.linspace(1, 0, n)
    mix *= fade
    stereo = np.stack([mix, np.roll(mix, 220) * 0.98], axis=1)
    wavfile.write(path, SR, (stereo * 32767).astype(np.int16))


# ---------------------------------------------------------------- assemble

def main() -> None:
    make_graphics()
    segments = make_segments()
    listing = W / "concat.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in segments))
    silent = W / "trailer-silent.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(silent)])
    music = W / "music.wav"
    make_music(music)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(music), "-map", "0:v", "-map", "1:a",
         "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
         "-af", "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1:LRA=9", "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", str(OUT)])
    run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "9.5", "-i", str(OUT), "-frames:v", "1", "-q:v", "3", str(OUT.with_suffix(".jpg"))])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
