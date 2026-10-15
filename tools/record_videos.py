"""Record "how to play" videos for the Party Plaza ports.

Usage (with an Ares dev server running, e.g. the `ares-counterplay` preview on port 5191):
    python tools/record_videos.py [base_url]
Writes public/videos/<game>.mp4 (served by Vite and copied into dist/). Needs Python Playwright (chromium) and ffmpeg on PATH.
Each run is scripted on a fixed seed so the captions match what is on screen.
"""

import shutil
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5191"
ROOT = Path(__file__).resolve().parent.parent
import os

# CLEAN=1 records b-roll without captions or title cards (used for the trailer), into OUT_DIR.
CLEAN = os.environ.get("CLEAN") == "1"
OUT = Path(os.environ["OUT_DIR"]) if os.environ.get("OUT_DIR") else ROOT / "public" / "videos"
RAW = OUT / "raw"
SIZE = {"width": 1366, "height": 854}

# A visible cursor, click ripples, captions and title cards, injected into every page.
OVERLAY = r"""
(() => {
  const css = `
    #__cur { position: fixed; left: -50px; top: -50px; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
      background: rgba(253, 224, 71, .9); border: 2px solid #111; box-shadow: 0 0 12px rgba(253,224,71,.8); pointer-events: none; z-index: 100000; }
    .__ripple { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; border: 3px solid #fde047;
      pointer-events: none; z-index: 99999; animation: __rip .6s ease-out forwards; }
    @keyframes __rip { to { transform: scale(3.2); opacity: 0; } }
    #__cap { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 980px; width: max-content; z-index: 99998;
      padding: 14px 22px; border-radius: 14px; background: rgba(4, 10, 24, .94); border: 1px solid #38d6f5; color: #e8f0fb;
      font: 600 21px/1.4 Inter, system-ui, sans-serif; box-shadow: 0 12px 40px rgba(0,0,0,.6); pointer-events: none; transition: opacity .25s; }
    #__cap b { color: #38d6f5; }
    #__cap:empty { opacity: 0; }
    #__title { position: fixed; inset: 0; z-index: 100001; display: grid; place-items: center; text-align: center; pointer-events: none;
      background: radial-gradient(900px 500px at 50% 40%, rgba(40,110,200,.35), transparent 70%), #050b18; color: #e8f0fb; transition: opacity .4s; }
    #__title h1 { font: 800 64px "Exo 2", sans-serif; letter-spacing: .1em; text-transform: uppercase; margin: 0; text-shadow: 0 0 30px rgba(80,170,255,.5); }
    #__title p { font: 600 24px Inter, sans-serif; color: #8fd0ff; margin: 14px 0 0; }
    #__title small { display: block; font: 700 15px "Exo 2", sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #38d6f5; margin-bottom: 18px; }
    #__title.hide { opacity: 0; }`;
  const boot = () => {
    if (document.getElementById('__cur')) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const cur = document.createElement('div'); cur.id = '__cur'; document.body.appendChild(cur);
    const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap);
    document.addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    }, true);
    window.__caption = (html) => { cap.innerHTML = html || ''; };
    window.__title = (kicker, title, sub) => {
      let t = document.getElementById('__title');
      if (!t) { t = document.createElement('div'); t.id = '__title'; document.body.appendChild(t); }
      t.innerHTML = `<div><small>${kicker}</small><h1>${title}</h1><p>${sub}</p></div>`; t.classList.remove('hide');
    };
    window.__untitle = () => { const t = document.getElementById('__title'); if (t) t.classList.add('hide'); };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
"""


class Director:
    def __init__(self, page: Page):
        self.page = page

    def wait(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * 1000))

    def say(self, html: str, hold: float = 0) -> None:
        if not CLEAN:
            self.page.evaluate("(h) => window.__caption(h)", html)
        if hold:
            self.wait(hold)

    def title(self, kicker: str, title: str, sub: str, hold: float = 3.2) -> None:
        if CLEAN:
            self.wait(1)
            return
        self.page.evaluate("([k, t, s]) => window.__title(k, t, s)", [kicker, title, sub])
        self.wait(hold)
        self.page.evaluate("() => window.__untitle()")
        self.wait(0.5)

    def point(self, selector: str, hold: float = 0.4) -> tuple[float, float]:
        loc = self.page.locator(selector).first
        loc.scroll_into_view_if_needed()
        self.wait(0.2)
        box = loc.bounding_box()
        assert box, f"not visible: {selector}"
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.page.mouse.move(x, y, steps=28)
        self.wait(hold)
        return x, y

    def click(self, selector: str, after: float = 0.9) -> None:
        x, y = self.point(selector)
        self.page.mouse.click(x, y)
        self.wait(after)

    def start_game(self, after: float = 1) -> None:
        # Every game opens on its "How to play" walkthrough: skip it (or press Start on its last page).
        self.page.wait_for_selector(".ftue-modal")
        skip = self.page.locator('.ftue-btn[data-do="skip"]')
        self.click('.ftue-btn[data-do="skip"]' if skip.count() else '.ftue-btn[data-do="start"]', after)

    def text(self, selector: str) -> str:
        return self.page.locator(selector).first.inner_text()


# ---------------------------------------------------------------------------

def blast_radius(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/blastradius.html?seed=demo")
    d.title("Project Ares · How to play", "Blast Radius", "Scope before you contain")
    d.say("The briefing: a stolen <b>service account</b> and a command-and-control domain. Your job is to find which hosts are compromised.", 4.5)
    d.start_game(1.2)
    d.say("The map: <b>hexagons are sensors</b>, <b>discs are hosts</b>. Every host starts as an unknown <b>?</b>", 3.5)
    d.click("[data-select=sensor][data-id=hb-dns]")
    d.say("Select a sensor to see which hosts sit behind it, and <b>why it can only count</b> them, not name them.", 3.5)
    d.click("[data-act=read]", 1)
    assert "1" in d.text(".reading strong")
    d.say("Reading a sensor costs <b>5 case minutes</b>. The DNS forwarder counted <b>1 of 3</b> hosts. But which one?", 4)
    d.click("[data-select=sensor][data-id=hb-proxy]", 0.6)
    d.click("[data-act=read]", 1)
    d.say("The proxy also counts <b>1</b>. Only <b>HB-WS-03</b> sits behind <b>both</b> sensors, so it is the best host to check.", 4.5)
    d.click("[data-select=host][data-id=hb-ws-03]")
    d.say("<b>Triage</b> confirms one host for certain, but costs <b>20 minutes</b>. You can't triage everything, so spend it where it settles the most.", 4.5)
    d.click("[data-act=triage]", 1.2)
    assert "Found" in d.text(".reading strong")
    d.say("Indicator found on HB-WS-03. <b>Isolate it.</b>", 2.5)
    d.click("[data-act=decide][data-value=isolate]", 1)
    d.say("Both sensors now read <b>✓ 1/1</b>: HB-WS-03 accounts for both counts. So every other host is <b>proven clean</b>.", 4)
    for host in ["hb-lt-01", "hb-lt-02", "hb-ws-04", "hb-ws-05"]:
        d.click(f"[data-select=host][data-id={host}]", 0.4)
        d.click("[data-act=decide][data-value=keep]", 0.5)
    d.say("Keep the clean hosts online. Taking clean machines offline has a real business cost.", 3)
    d.click("[data-act=submit]", 1.5)
    d.say("Close the case: the map reveals the truth (<b>red ring = compromised</b>) and every host gets a verdict.", 4.5)
    d.click("[data-select=host][data-id=hb-lt-01]", 0.5)
    d.say("Select any host to see <b>what your evidence proved</b>, and how.", 4)
    d.point("#casefile .score-grid", 0.4)
    d.say("Scored on <b>containment</b>, <b>continuity</b>, <b>evidence</b> and <b>efficiency</b>. A lucky guess scores less than a deduction. Speed never counts.", 5)
    d.click("[data-act=answer] >> text=counted", 1.2)
    d.say("A <b>reasoning check</b> after each case. The right answer is always the deduction, never a hunch.", 4.5)
    d.click("[data-act=next]", 1.2)
    d.say("Cases 2 and 3 add more sensors, laptops only the VPN can see, and <b>critical servers</b> that cost ×3 to take offline by mistake.", 5)
    d.title("Blast Radius", "Your turn", "3 cases · 4–6 minutes · open blastradius.html", 3.5)


def defense_in_depth(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/defense.html?seed=demo")
    d.title("Project Ares · How to play", "Defense in Depth", "Layer it. They will adapt.")
    d.say("Three crews, one week, a limited budget, and a business that only accepts so much disruption.", 4)
    d.start_game(1.2)
    d.point("#board .row:nth-child(2)", 0.3)
    d.say("The <b>attack chain board</b>: each campaign has to get through five stages, left to right, to reach the crown jewels.", 5)
    d.click("[data-act=deploy][data-id=macro]", 1)
    d.say("Each control <b>blocks</b>, <b>detects</b> or helps you <b>recover</b> from specific techniques. Blocking macros stops the invoice lure at initial access.", 5)
    d.point("#board .row:nth-child(2) .cell", 0.3)
    d.say("The board shows it straight away: that option is struck through, with the control named.", 3.5)
    d.click("[data-act=deploy][data-id=nordp]", 1)
    d.say("Removing public RDP stops the password spray. Both campaigns are now stopped. But each stop <b>hangs on a single control</b>.", 5)
    d.click("[data-act=deploy][data-id=credguard]", 0.8)
    d.click("[data-act=deploy][data-id=gmsa]", 1)
    d.say("Add a <b>second layer</b> deeper in each path: Credential Guard blocks the LSASS dump, managed passwords block Kerberoasting.", 5)
    d.point("#status .count", 0.3)
    d.say("Watch the <b>friction meter</b>: strong controls slow the business down, and this week it accepts 2.", 4)
    d.click("[data-act=launch]", 0.5)
    d.say("Run the wave: each campaign moves through the stages, one column at a time.", 4.5)
    d.point(".verdicts", 0.3)
    d.say("Both stopped at the front door, and both would <b>still be stopped if that control failed</b>. That is depth.", 5)
    d.click("[data-act=answer] >> text=Credential Guard", 1.2)
    d.say("Reasoning check: <b>if the macro block failed, what stops the lure?</b> The game re-runs it to find out.", 5)
    d.click("[data-act=next]", 1.2)
    d.say("Wednesday: the crews <b>adapt</b>. When their first choice is blocked, they switch to the next option on their list.", 5)
    d.point("#board .row:nth-child(3)", 0.3)
    d.say("Plan for their fallbacks: disk-image lures, relay sign-in pages, a fresh VPN exploit…", 4.5)
    d.title("Defense in Depth", "Your turn", "3 waves · 5–7 minutes · open defense.html", 3.5)


def counterplay(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/counterplay.html?seed=demo")
    d.title("Project Ares · How to play", "Counterplay", "Read it. Name it. Counter it.")
    d.say("You are on call. Three incidents, each played as a duel. <b>First to 3 wins.</b>", 4)
    d.start_game(1.2)
    d.point(".facedown", 0.3)
    d.say("The actor's card is <b>face down</b>.", 2.5)
    d.point("#telemetry", 0.3)
    d.say("All you see is the <b>telemetry</b> it left behind: here, a mail gateway log line.", 4.5)
    d.point(".id-options", 0.3)
    d.say("<b>Step 1: name the technique.</b> Two of the three options are look-alikes.", 3.5)
    d.click("[data-act=identify] >> text=Credential phishing link", 1)
    d.say("<b>Step 2: play a response card.</b> Each card works once per incident. Let's try blocking the sender domain…", 4)
    d.click("[data-act=play][data-value=block-sender]", 1.2)
    d.say("<b>Partial</b>: new mail is blocked, but messages already delivered stay in inboxes. The better card was <b>Purge the email</b>.", 5.5)
    d.click("[data-act=next]", 1)
    d.point("#telemetry", 0.3)
    d.say("A sign-in where MFA was <b>“satisfied by claim in token”</b> from an unregistered device: a stolen session.", 4.5)
    d.click("[data-act=identify] >> text=Session token replay", 0.6)
    d.click("[data-act=play][data-value=revoke]", 1.2)
    d.say("<b>Countered.</b> You score. Every reveal says which field gave it away.", 4)
    d.click("[data-act=next]", 1)
    d.say("Because you countered, the actor <b>switches tactics</b>: an OAuth app that keeps working after a password reset.", 4.5)
    d.click("[data-act=identify] >> text=Malicious OAuth app consent", 0.6)
    d.click("[data-act=play][data-value=oauth]", 1.2)
    d.click("[data-act=next]", 1)
    d.say("Now they try to cash in: a payment-change request from the real, compromised mailbox.", 4)
    d.click("[data-act=identify] >> text=Payment-change request", 0.6)
    d.click("[data-act=play][data-value=callback]", 1.5)
    d.point(".over .score-grid", 0.3)
    d.say("Three counters: <b>actor evicted</b>. Scored on naming the technique, playing the best card you had left, and the outcome.", 5.5)
    d.title("Counterplay", "Your turn", "3 incidents · 5–7 minutes · open counterplay.html", 3.5)


def bit_by_bit(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/bits.html")
    d.title("Project Ares · How to play", "Bit by Bit", "Binary, masks and subnets")
    d.say("The new depot gets <b>10.20.4.0/24</b>. You carve it up, one octet at a time.", 4)
    d.start_game(1)
    d.point(".gears", 0.3)
    d.say("Every answer is one octet: <b>eight gears worth 128 down to 1</b>. Turn gears on until they add up.", 4.5)
    d.say("Build <b>192</b>: 128 fits, then 64 fits. That's it.", 2.5)
    d.click('[data-bit="128"]', 0.5)
    d.click('[data-bit="64"]', 0.6)
    d.click("[data-act=check]", 1)
    d.say("<b>Correct</b>: 128 + 64 = 192. The panel on the left lights a port for every task.", 3.5)
    d.click("[data-act=next]", 0.8)
    d.say("Now <b>37</b>. Let's make a mistake on purpose…", 2.5)
    d.click('[data-bit="32"]', 0.4)
    d.click('[data-bit="8"]', 0.6)
    d.click("[data-act=check]", 1)
    d.say("Every wrong check <b>explains what's off</b>: 40 is 3 too many.", 4)
    d.click('[data-bit="8"]', 0.4)
    d.click('[data-bit="4"]', 0.4)
    d.click('[data-bit="1"]', 0.6)
    d.click("[data-act=check]", 1)
    d.say("32 + 4 + 1 = 37. A second-try answer still scores, just less.", 3.5)
    d.click("[data-act=next]", 0.6)
    d.click("[data-act=reveal]", 0.4)
    d.click("[data-act=next]", 0.8)
    d.say("<b>Masks</b>: the ones sit on the left with no gaps. The readout shows the prefix and usable hosts as you go.", 4.5)
    d.click('[data-bit="128"]', 0.5)
    d.click('[data-bit="64"]', 0.8)
    d.say("Two ones in the last octet: <b>/26, 62 usable hosts</b>.", 3)
    d.click("[data-act=check]", 1.5)
    d.say("Skipping ahead through the sizing tasks to the last stage…", 0.5)
    for _ in range(4):
        d.click("[data-act=next]", 0.3)
        d.click("[data-act=reveal]", 0.3)
    d.click("[data-act=next]", 0.8)
    d.say("Last stage: an alert names <b>10.20.4.77/26</b>. Which segment is it on? <b>AND</b> the address with the mask.", 5)
    d.point(".and", 0.3)
    d.say("Keep a bit only where both rows have a 1. Only the 64 bit survives.", 3.5)
    d.click('[data-bit="64"]', 0.6)
    d.click("[data-act=check]", 1)
    d.say("The network is <b>.64/26</b>: hosts .65 to .126. That's the segment to look at, or isolate.", 4.5)
    d.title("Bit by Bit", "Your turn", "10 tasks · about 5 minutes · open bits.html", 3.5)


def rule_order(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/rules.html")
    d.title("Project Ares · How to play", "Rule Order", "First match wins")
    d.say("Four change tickets for the core firewall. It reads rules <b>top to bottom</b> and stops at the <b>first match</b>.", 4.5)
    d.start_game(1)
    d.point("#packets .packet:nth-child(2)", 0.3)
    d.say("Each ticket has <b>test packets</b> with the verdict they should get. This guest laptop should be <b>denied</b>.", 4.5)
    d.click("[data-act=trace][data-id=p2]", 1)
    d.say("<b>Trace</b> it: rule 1, the broad staff allow, catches it first. The guest deny never gets a look. That's <b>shadowing</b>.", 5.5)
    d.click("[data-act=up][data-id=r2]", 1)
    d.say("Move the specific deny <b>above</b> the broad allow.", 3)
    d.click("[data-act=run]", 1.2)
    d.say("<b>Run all tests</b> as often as you like. All three pass.", 3)
    d.click("[data-act=commit]", 1.2)
    d.say("Pushed: 70 for every packet right, 30 for using the <b>fewest changes</b>, as in a real change window.", 5)
    d.click("[data-act=next]", 1)
    d.point(".default-line", 0.3)
    d.say("Ticket 2: this firewall's built-in default is <b>ALLOW</b>, and a deny-everything rule sits in rule 2.", 4.5)
    d.click("[data-act=toggle][data-id=r2]", 0.5)
    d.click("[data-act=run]", 1)
    d.say("Switching it off fixes browsing… and lets <b>internet RDP and guests through</b>. Two tests fail.", 5)
    d.say("Switch it back on and move it <b>down</b> instead…", 0.5)
    d.click("[data-act=toggle][data-id=r2]", 0.5)
    d.click("[data-act=down][data-id=r2]", 0.5)
    d.click("[data-act=down][data-id=r2]", 0.6)
    d.click("[data-act=run]", 1)
    d.say("The cleanup rule belongs <b>at the bottom</b>. Every test passes.", 3.5)
    d.click("[data-act=commit]", 1.5)
    d.title("Rule Order", "Your turn", "4 tickets · about 5 minutes · open rules.html", 3.5)


def spot_the_risks(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/risks.html")
    d.title("Project Ares · How to play", "Spot the Risks", "See it. Name it. Fix it.")
    d.say("A security walk-round: the office after hours, then a home office before a client call.", 4)
    d.start_game(1)
    d.say("Click anything that looks wrong. Some things only <b>look</b> risky.", 3.5)
    d.click("g.item[data-id=monitor] .hit", 0.8)
    d.say("The inspector asks two things: <b>what is the issue</b>, and <b>what is the best fix</b>.", 3.5)
    d.click("[data-act=issue] >> text=The session is unlocked", 0.8)
    d.click("[data-act=fix] >> text=Lock the screen", 1)
    d.click("g.item[data-id=sticky] .hit", 0.6)
    d.click("[data-act=issue] >> text=A password written", 0.6)
    d.click("[data-act=fix] >> text=Remove it", 1)
    d.say("A password on a sticky note: remove it, change it, and use the password manager.", 3.5)
    d.click("g.item[data-id=locked] .hit", 0.8)
    d.say("This one is a <b>locked</b> screen. That's what good looks like.", 3)
    d.click('[data-act=issue] >> text="Nothing wrong here"', 1)
    d.click("g.item[data-id=usb] .hit", 0.6)
    d.click("[data-act=issue] >> text=An unknown USB drive", 0.6)
    d.click("[data-act=fix] >> text=Hand it to IT", 1)
    d.say("A USB stick labelled ‘PAYROLL’: a classic lure. It goes to IT, unplugged.", 3.5)
    d.click("g.item[data-id=door] .hit", 0.6)
    d.click("[data-act=issue] >> text=A badge-only door", 0.6)
    d.click("[data-act=fix] >> text=Close the door", 1)
    d.point("#walk .flags", 0.3)
    d.say("Your flags build up on the left. Finish the scene when you're done.", 3)
    d.click("[data-act=finish]", 1.5)
    d.say("The review: <b>✓ found</b>, <b>red rings for missed risks</b>, and false alarms marked.", 4.5)
    d.click("g.item[data-id=whiteboard] .hit", 1)
    d.say("Every item explains itself: an admin password and the network map, on a wall visitors can see.", 5)
    d.click("[data-act=next]", 1)
    d.say("Scene 2: working from home. The camera is about to come on…", 4)
    d.title("Spot the Risks", "Your turn", "2 scenes · about 5 minutes · open risks.html", 3.5)


def secure_stack(d: Director) -> None:
    p = d.page
    p.goto(f"{BASE}/stack.html?debug&sound=off")
    d.start_game(0.5)
    # The game is a phone-shaped frame: put captions beside it instead of over the goal tray.
    p.add_style_tag(content="#__cap { left: 14px; bottom: auto; top: 34%; transform: none; max-width: 236px; width: 236px; font-size: 18px; }")
    d.title("Project Ares · How to play", "Secure Stack", "Match every threat with the defence that stops it")
    d.say("An island-hopping sticker game. Each island adds new threats and new defences.", 3.5)
    d.click('[data-level="0"]', 2.5)

    def find(sticker_id: str, exclude: tuple[float, float] | None = None) -> dict:
        items = [s for s in p.evaluate("window.__stack.stickers()") if s["id"] == sticker_id and not s["frozen"]]
        if exclude:
            items.sort(key=lambda s: -((s["x"] - exclude[0]) ** 2 + (s["y"] - exclude[1]) ** 2))
        return items[0]

    def drag(a: dict, b: dict, after: float = 1.2) -> None:
        p.mouse.move(a["x"], a["y"], steps=20)
        d.wait(0.2)
        p.mouse.down()
        p.mouse.move(b["x"], b["y"], steps=26)
        d.wait(0.15)
        p.mouse.up()
        d.wait(after)

    d.say("<b>Orange and pink blobs are threats.</b> <b>Blue badges are defences.</b> Tap any sticker to read what it is.", 4)
    s = find("phish")
    p.mouse.move(s["x"], s["y"], steps=20)
    p.mouse.down()
    p.mouse.up()
    d.wait(2.5)
    d.point("#field-guide .fg-item.lit", 0.3)
    d.say("The <b>field guide</b> lights up what you tapped. It explains every sticker on the island.", 4)
    # The pile is random: pick a wrong pairing that exists in it.
    ids = {x["id"] for x in p.evaluate("window.__stack.stickers()")}
    wrong = ("pwman", "phish") if {"pwman", "phish"} <= ids else ("report", "weakpw")
    d.say("Drag a defence onto the threat it <b>really</b> stops. Let's try a wrong one first…", 3)
    drag(find(wrong[0]), find(wrong[1]), 0.5)
    d.say("Wrong drops wobble, and the crab says <b>why</b>: which threats that defence stops, and what this threat needs.", 5)
    counters = {"phish": ["report", "mfa"], "weakpw": ["pwman", "mfa"]}

    def right_pair() -> tuple[dict, dict] | None:
        items = p.evaluate("window.__stack.stickers()")
        return next(((dd, t) for t in items for dd in items if dd["id"] in counters.get(t["id"], [])), None)

    pair = right_pair()
    if pair:
        drag(pair[0], pair[1], 0.4)
    d.say("A right match pops, and the crab gives the <b>reason</b> it works.", 4)
    for _ in range(2):
        pair = right_pair()
        if pair:
            drag(pair[0], pair[1], 0.4)
    p.evaluate("document.querySelector('#fg-body').scrollTo({ top: 99999, behavior: 'smooth' })")
    d.point(".fg-pairs", 0.3)
    d.say("Each match fills in the <b>match book</b> with the reason. Quick matches build a <b>streak</b>.", 4.5)
    for _ in range(20):
        if p.evaluate("window.__stack.progress()")["phase"] != "play":
            break
        pair = right_pair()
        if not pair:
            d.wait(1.2)  # the game drops in whatever is missing
            continue
        drag(pair[0], pair[1], 0.8)
    d.wait(1.5)
    d.say("Stars are for <b>understanding</b>, not speed: three stars means one mix-up or fewer. The field notes recap every pairing.", 6)
    d.point(".notes", 0.4)
    d.wait(1.5)
    d.click('[data-go="map"]', 1.2)
    d.say("Later islands add a <b>tide</b> of new threats, <b>unidentified</b> alerts to investigate, and a storm. Don't let the pile settle above the rope.", 5.5)
    d.title("Secure Stack", "Your turn", "5 islands · open stack.html", 3.5)


SPOT_THE_PHISH_URL = "https://ares-cyber-game-remi.remiclassic.chatgpt.site/"


def spot_the_phish(d: Director) -> None:
    # Hosted separately (not in this repo): records the live site.
    p = d.page
    p.goto(SPOT_THE_PHISH_URL)
    p.wait_for_timeout(1500)
    d.title("Project Ares · How to play", "Spot the Phish", "Ares Cyber Game · Mission 01")
    d.say("Ten messages land in your inbox. A robot coach explains the evidence; you choose a safe next step.", 4.5)
    d.click("text=Start mission", 1.5)
    d.point("text=Inspect this email", 0.3)
    d.say("Open an envelope and <b>read the evidence</b>: your context, the sender, the request, and where the link really goes.", 5)
    d.point("text=Simulated link destination", 0.4)
    d.say("Compare it with your context: <b>was this expected?</b> Does the link go to the service it claims? (The site shuffles its messages, so yours may differ.)", 5)
    d.point("text=Report phishing", 0.3)
    d.say("Three choices: <b>Report phishing</b>, <b>Verify another way</b>, or <b>Safe to continue</b> (only for the known, expected workflow).", 5)
    d.click("text=Report phishing", 1.5)
    d.say("Every decision is explained, with the <b>key evidence</b>. A right call restores a node of the network.", 4.5)
    d.click("text=Restore node", 1.2)
    d.click("button:has-text('List view') >> visible=true", 0.8)
    d.click("button:has-text('Message 2') >> visible=true", 1.2)
    d.say("Next message. Unsure? <b>Show a hint</b>, or verify through a known app or a saved contact.", 4.5)
    if p.locator("text=Show a hint").count():
        d.click("text=Show a hint", 2.5)
    d.point("text=Network restored", 0.3)
    d.say("Restore all ten nodes, then test your reasoning on four new messages. Accuracy earns the stars; there's no timer.", 5)
    d.title("Spot the Phish", "Your turn", "10 messages · untimed · opens the live site", 3.5)


# ---------- remixes ----------

def type_slow(d: Director, selector: str, text: str) -> None:
    d.point(selector, 0.2)
    d.page.locator(selector).first.click()
    d.page.keyboard.type(text, delay=110)
    d.wait(0.6)


def pattern_patrol(d: Director) -> None:
    d.page.goto(f"{BASE}/patterns.html")
    d.title("Remix of RegExile · How to play", "Pattern Patrol", "Catch the attack, not the noise")
    d.say("Each level is a log excerpt: real attack lines, and benign look-alikes. Write a regex that flags the attacks <b>and nothing else</b>.", 5)
    d.start_game(1)
    d.point(".logs", 0.3)
    d.say("Lines light up as you type: <b>caught</b>, <b>missed</b> or <b>false alarm</b>.", 3.5)
    type_slow(d, "#rx", "Failed password")
    d.say("Plain words are a pattern too. All failed logins caught, no false alarms: solved.", 4)
    d.click("[data-act=next]", 1)
    d.say("Now only <b>root</b> or <b>admin</b>, because ordinary users go to the help desk.", 3.5)
    type_slow(d, "#rx", "Failed password for (root|admin)")
    d.point(".logs .false", 0.3)
    d.say("<b>False alarm:</b> “admin” also matches a training account called administrator-training.", 4.5)
    d.page.keyboard.type("\\b", delay=150)
    d.wait(0.8)
    d.say("Add a word boundary <b>\\b</b> and the noise is gone. That's detection engineering.", 4.5)
    d.title("Pattern Patrol", "Your turn", "8 detections · open patterns.html", 3.5)


def port_authority(d: Director) -> None:
    d.page.goto(f"{BASE}/ports.html")
    d.title("Remix of Portflow · How to play", "Port Authority", "Every port tells you who is knocking")
    d.say("Connections arrive like ships, each flying a <b>port number</b>. The harbour rules are on the left.", 4.5)
    d.start_game(1.2)
    d.say("First: which service uses port 443?", 2.5)
    d.click("[data-service=https]", 1)
    d.say("HTTPS from the internet to the web server: the policy allows it.", 3)
    d.click("[data-action=allow]", 2)
    d.click("[data-next]", 1.5)
    d.say("Port 23 from the office to the core switch…", 2.5)
    d.click("[data-service=telnet]", 1)
    d.say("Telnet. Let's just allow it…", 2.5)
    d.click("[data-action=allow]", 1.5)
    d.say("No: Telnet sends the admin password in cleartext. The policy says <b>upgrade it to SSH</b>.", 5)
    d.say("Same port can be fine from the VPN and forbidden from the internet. Read where each ship comes from.", 4.5)
    d.title("Port Authority", "Your turn", "15 ships · open ports.html", 3.5)


def confidence_board(d: Director) -> None:
    d.page.goto(f"{BASE}/board.html")
    d.title("Remix of Trivialoot · How to play", "Confidence Board", "Know what you know")
    d.say("Six categories, 24 questions. The twist: every answer carries a <b>confidence wager</b>.", 4.5)
    d.start_game(1)
    d.click('[data-tile="1:2"]', 1.2)
    d.say("Which MFA resists a fake sign-in page that relays your codes?", 3.5)
    d.click('[data-choice="3"]', 0.8)
    d.point(".confs", 0.3)
    d.say("Now, how sure are you? “Certain” wins 2× but loses 6×. Only use it if you'd be right 9 times in 10.", 5)
    d.click('[data-conf="sure"]', 0.6)
    d.click("[data-lock]", 1.5)
    d.say("Right, at “Sure”: +450. Every answer explains itself.", 4)
    d.click("[data-back]", 1)
    d.point("#side .cal", 0.3)
    d.say("Your <b>calibration</b> builds up on the left: how often you're right at each confidence level.", 4.5)
    d.title("Confidence Board", "Your turn", "24 questions · open board.html", 3.5)


def chain_breaker(d: Director) -> None:
    d.page.goto(f"{BASE}/chain.html?debug")
    d.title("Remix of Cylitaire · How to play", "Chain Breaker", "Rebuild it. Then break it early.")
    d.say("Each incident is a shuffled deck: one card for each link of the cyber kill chain.", 4)
    d.start_game(1)
    d.point(".card.big", 0.3)
    d.say("Turn a card over and <b>lay it on its link</b>.", 3)
    top = d.page.evaluate("window.__chain.topStage()")
    d.click(f'[data-stage="{(top + 3) % 7}"]', 1.2)
    d.say("A wrong link wobbles, and tells you whether this step happens earlier or later.", 4)
    for _ in range(7):
        top = d.page.evaluate("window.__chain.topStage()")
        if top is None:
            break
        d.click(f'[data-stage="{top}"]', 0.5)
    d.say("The chain is rebuilt. Now choose the control that <b>breaks it earliest</b>.", 4)
    best = d.page.evaluate("window.__chain.bestBreak()")
    d.click(f'[data-break="{best}"]', 1.5)
    d.say("Broken at Delivery: every link after it never happens. Backups, by contrast, break nothing; they help you recover.", 5.5)
    d.title("Chain Breaker", "Your turn", "3 incidents · open chain.html", 3.5)


def tactic_orbit(d: Director) -> None:
    d.page.goto(f"{BASE}/orbit.html?debug")
    d.title("Remix of Astro-Defense · How to play", "Tactic Orbit", "Name the tactic. Raise the shield.")
    d.say("Ships carry ATT&CK <b>techniques</b> toward the station. It's ringed by eight <b>tactic</b> shields.", 4.5)
    d.start_game(3)
    d.point("#intel .case-title", 0.3)
    d.say("Select a ship to read its intel, then raise the shield for the tactic it serves.", 4)
    tactics = d.page.evaluate("window.__orbit.selectedTactics()") or ["initial"]
    d.click(f'.ring [data-tactic="{tactics[0]}"]', 1.5)
    d.say("Shield up. Calm mode makes ships wait, so it's about knowing, not reflexes.", 4)
    d.wait(3)
    tactics = d.page.evaluate("window.__orbit.selectedTactics()")
    if tactics:
        wrong = "exfil" if "exfil" not in tactics else "initial"
        d.click(f'.ring [data-tactic="{wrong}"]', 1.5)
        d.say("Wrong shield: the intel explains what this step achieves for the attacker.", 4)
        d.click(f'.ring [data-tactic="{tactics[0]}"]', 1.5)
    d.say("Some techniques serve several tactics, like a scheduled task, and any of them counts.", 4.5)
    d.title("Tactic Orbit", "Your turn", "3 waves · open orbit.html", 3.5)


def blind_spots(d: Director) -> None:
    d.page.goto(f"{BASE}/blindspots.html")
    d.title("Remix of Threat Modeler · How to play", "Blind Spots", "You can't stop what you can't see")
    d.say("Nine points of detection budget. Place sensors on the map, then a red team runs three attack paths.", 4.5)
    d.start_game(1)
    for sensor in ["egress", "dbaudit", "fsaudit"]:
        d.click(f'[data-sensor="{sensor}"]', 0.6)
    d.say("Let's watch the exits: egress, database and file auditing…", 3.5)
    d.click("[data-run]", 8.5)
    d.say("Every path was only seen once the attacker was already inside: the exits catch thieves on the way out, after the damage.", 5)
    d.point(".verdict", 0.3)
    d.say("The debrief shows the best plan for this budget: see attacks <b>early</b>, and <b>twice</b>.", 4.5)
    d.title("Blind Spots", "Your turn", "one plan, many tries · open blindspots.html", 3.5)


# ---------- the original Ares practices ----------

def dismiss_walkthrough(d: Director) -> None:
    """Games open a "How to play" walkthrough when play starts; tours skip past it."""
    d.wait(0.4)
    if d.page.locator(".ftue-modal").count():
        skip = d.page.locator('.ftue-btn[data-do="skip"]')
        d.click('.ftue-btn[data-do="skip"]' if skip.count() else '.ftue-btn[data-do="start"]', 0.8)


def opt(d: Director, selector: str, after: float = 1.0) -> bool:
    """Click if it shows up; tours keep going if a step is not there."""
    dismiss_walkthrough(d)
    loc = d.page.locator(f"{selector} >> visible=true").first
    try:
        loc.wait_for(timeout=3000)
        loc.scroll_into_view_if_needed(timeout=2000)
        d.wait(0.3)
    except Exception:
        return False
    box = loc.bounding_box()
    if not box:
        return False
    d.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=26)
    d.wait(0.35)
    d.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    d.wait(after)
    return True


def opt_point(d: Director, selector: str) -> None:
    dismiss_walkthrough(d)
    loc = d.page.locator(f"{selector} >> visible=true").first
    try:
        loc.wait_for(timeout=2000)
        loc.scroll_into_view_if_needed(timeout=2000)
        box = loc.bounding_box()
        if box:
            d.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=26)
            d.wait(0.3)
    except Exception:
        pass


def network_defense(d: Director) -> None:
    d.page.goto(f"{BASE}/network-defense.html?seed=demo")
    d.title("Project Ares · How to play", "Network Defense", "Keep Finance Online")
    d.say("It opens inside a mock course page, as it would in the Ares platform.", 3)
    opt(d, "text=Start practice", 1.5)
    d.say("Protect the network <b>and</b> keep services available. Every action has a visible consequence and a short explanation.", 5)
    opt(d, "button:has-text('Skip guide')", 1.2)
    opt_point(d, "button:has-text('Inspect 20')")
    d.say("Spend action points on <b>Inspect</b>, <b>Access rule</b>, <b>Add route</b> or <b>Revise</b>.", 4.5)
    opt(d, "button:has-text('Inspect 20')", 1.2)
    d.say("Traffic starts <b>amber</b>: needs review. Inspecting reveals evidence; your judgement turns it <b>cyan</b> (permitted) or <b>red</b> (violation).", 5.5)
    opt_point(d, "button:has-text('Launch wave')")
    d.say("Launch the wave and watch traffic flow. Blocking everything never wins: Finance still has to get its invoices.", 5)
    opt(d, "button:has-text('Launch wave')", 4)
    d.say("Three rounds: establish, review, recover. Then a debrief replays your key decisions.", 4.5)
    d.title("Network Defense", "Your turn", "3 rounds · about 5 minutes · open network-defense.html", 3.5)


def phishing_drill(d: Director) -> None:
    d.page.goto(f"{BASE}/phishing.html?seed=demo")
    d.title("Project Ares · How to play", "Phishing Speed Drill", "The Payroll Request")
    d.say("Eight messages in three batches. The first one is guided and untimed.", 4)
    opt(d, "button:has-text('Start the drill')", 1.2)
    opt_point(d, ".inspector, [class*=inspector]")
    d.say("<b>Inspect the cues</b>: sender, link, request and tone. Pick up to two as evidence.", 4.5)
    opt(d, "button:has-text('Sender')", 1.5)
    d.say("The sender is <b>acme-payrol1</b>, with a 1 for an l: a look-alike domain.", 4)
    opt(d, "button:has-text('Link')", 1.5)
    opt_point(d, "button:has-text('Report phishing')")
    d.say("Then decide: <b>Report phishing</b>, <b>Mark safe</b>, or <b>Verify first</b> through a trusted channel.", 4.5)
    opt(d, "button:has-text('Report phishing')", 2)
    d.say("Feedback covers every cue. Reporting, allowing or verifying <b>everything</b> stays below 60%.", 5)
    d.title("Phishing Speed Drill", "Your turn", "8 messages · 3–5 minutes · open phishing.html", 3.5)


def incident_triage(d: Director) -> None:
    d.page.goto(f"{BASE}/triage.html?seed=demo")
    d.title("Project Ares · How to play", "Incident Triage Race", "The Busy Morning")
    d.say("Six alerts are waiting and only <b>two analysts</b> are free. A loud alert may be routine; a quiet one may sit on a critical system.", 5.5)
    opt(d, "button:has-text('Start shift')", 1.2)
    opt_point(d, "#queue")
    d.say("Select an alert to see its <b>timeline</b>, the asset it affects, and how confident the evidence is.", 4.5)
    opt(d, "#queue .alert-card", 1.5)
    opt_point(d, "#details")
    d.say("Read the evidence, then rank it: <b>Immediate</b>, <b>Investigate</b> or <b>Monitor</b> (keys 1–3).", 4.5)
    opt(d, "button:has-text('Immediate')", 1.2)
    d.say("Pick the justification that best supports your call, and <b>link</b> alerts that are the same incident.", 4.5)
    opt_point(d, "button:has-text('Submit triage')")
    d.say("Two updates arrive during the shift. When the evidence changes, revise. Speed is shown, but never scored.", 5)
    d.title("Incident Triage Race", "Your turn", "3 rounds · 4–5 minutes · open triage.html", 3.5)


def privilege_path(d: Director) -> None:
    d.page.goto(f"{BASE}/privilege.html?seed=demo")
    d.title("Project Ares · How to play", "Privilege Path Puzzle", "Who can read payroll?")
    d.say("An access map of people, nested groups and grants. One question: <b>who can reach the payroll files?</b>", 5)
    opt(d, "button:has-text('Start')", 1.5)
    opt_point(d, ".react-flow, [class*=flow]")
    d.say("A user acts as every group they belong to, nested groups included. A grant gives a group Read or Write.", 5)
    opt(d, "button:has-text('Alex Chen · Read · Payroll')", 1)
    d.say("Pick an access check and <b>predict</b> whether it should be allowed…", 3.5)
    opt(d, "button:has-text('Test access')", 2)
    d.say("…then <b>test</b> it: the route lights up across the map, showing exactly why.", 4.5)
    opt_point(d, "button:has-text('Verify fix')")
    d.say("Make the <b>smallest</b> change that fixes it, then <b>verify</b> every check with a before-and-after table.", 5)
    d.title("Privilege Path Puzzle", "Your turn", "3 puzzles · about 5 minutes · open privilege.html", 3.5)


def soc_dashboard(d: Director) -> None:
    d.page.goto(f"{BASE}/soc.html?seed=demo")
    d.title("Project Ares · How to play", "SOC Dashboard Challenge", "A Strange Login")
    d.say("One incident, in depth. Same opening signals, but it could be a compromise or approved audit work.", 5)
    opt(d, "button:has-text('Open the case')", 1.5)
    d.say("Three evidence panels: <b>login</b>, <b>endpoint</b> and <b>network</b>.", 4)
    opt_point(d, "button:has-text('MFA record')")
    d.say("Requesting more evidence costs <b>case minutes</b>, and the transfer keeps running: 80 MB a minute.", 4.5)
    opt(d, "button:has-text('MFA record')", 2)
    opt_point(d, "button:has-text('Contain')")
    d.say("Then respond: <b>Monitor</b>, <b>Investigate</b>, <b>Contain</b>, <b>Escalate</b> or <b>Stand down</b>, citing your evidence.", 5)
    d.say("Decisions are graded on what you knew at the time, never on the hidden truth.", 4.5)
    d.title("SOC Dashboard Challenge", "Your turn", "up to 3 decisions · 4–6 minutes · open soc.html", 3.5)


def cyber_dispatch(d: Director) -> None:
    d.page.goto(f"{BASE}/dispatch.html?seed=demo")
    d.title("Project Ares · How to play", "Cyber Dispatch", "First Shift")
    d.say("Three colleagues will report something odd. You take each call.", 4)
    opt(d, "button:has-text('Start shift')", 1.5)
    d.say("A report comes in: an <b>unexpected MFA prompt</b>.", 3)
    opt(d, "button:has-text('Unexpected MFA prompt')", 1.5)
    d.say("<b>Ask questions</b> to record evidence. Useful ones reveal facts; irrelevant ones only cost shift minutes.", 5)
    d.say("Then set a <b>priority</b>, give an approved <b>next step</b>, and <b>hand off</b> to the right analyst.", 5)
    d.say("Urgent reports have a deadline for a safe next step. Harm is visible, and recoverable.", 4.5)
    d.title("Cyber Dispatch", "Your turn", "3 reports · about 5 minutes · open dispatch.html", 3.5)


def query_hunt(d: Director) -> None:
    d.page.goto(f"{BASE}/queryhunt.html?seed=demo")
    d.title("Project Ares · How to play", "Query Hunt", "Unusual Access")
    d.say("An alert fired overnight. Investigate it with SQL, running locally in your browser.", 4.5)
    opt(d, "button:has-text('Start the investigation')", 1.5)
    d.say("<b>Guided blocks</b> build the query for you, and you see the SQL they make. Or switch to <b>Write SQL</b>.", 5)
    opt(d, "button:has-text('Login events')", 0.7)
    opt(d, "button:has-text('Failed attempts')", 0.7)
    opt(d, "button:has-text('In the alert window')", 0.7)
    opt(d, "button:has-text('Oldest first')", 0.7)
    opt(d, "button:has-text('Run query')", 2)
    d.say("Running a query never grants evidence on its own: <b>pin</b> what the result shows, and <b>explain</b> the finding.", 5)
    d.say("Five challenges build to a conclusion you must support with evidence.", 4)
    d.title("Query Hunt", "Your turn", "5 challenges · about 10 minutes · open queryhunt.html", 3.5)


def cloud_command(d: Director) -> None:
    d.page.goto(f"{BASE}/cloud.html?seed=demo")
    d.title("Project Ares · How to play", "Cloud Command", "First Orbit")
    d.say("Fly to three orbital checkpoints: a traffic surge, a quiet period and an access review.", 4.5)
    opt(d, "button:has-text('Start mission')", 1.5)
    d.say("Diagnostic chips are your <b>evidence</b>. Steer with the arrow keys, or let <b>autopilot</b> fly the leg.", 4.5)
    opt(d, "button:has-text('Let autopilot fly this leg')", 7)
    d.say("At each checkpoint, inspect the service evidence, compare changes, then choose and justify one.", 5)
    d.say("Capacity only helps where it is the constraint, and narrowing access must keep the task working.", 5)
    d.title("Cloud Command", "Your turn", "3 checkpoints · about 5 minutes · open cloud.html", 3.5)


GAMES = {
    "pattern-patrol": pattern_patrol,
    "port-authority": port_authority,
    "confidence-board": confidence_board,
    "chain-breaker": chain_breaker,
    "tactic-orbit": tactic_orbit,
    "blind-spots": blind_spots,
    "network-defense": network_defense,
    "phishing-speed-drill": phishing_drill,
    "incident-triage": incident_triage,
    "privilege-path": privilege_path,
    "soc-dashboard": soc_dashboard,
    "cyber-dispatch": cyber_dispatch,
    "query-hunt": query_hunt,
    "cloud-command": cloud_command,
    "secure-stack": secure_stack,
    "spot-the-phish": spot_the_phish,
    "blast-radius": blast_radius,
    "defense-in-depth": defense_in_depth,
    "counterplay": counterplay,
    "bit-by-bit": bit_by_bit,
    "rule-order": rule_order,
    "spot-the-risks": spot_the_risks,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or list(GAMES)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")  # the installed Chrome; no browser download needed
        for name in only:
            shutil.rmtree(RAW, ignore_errors=True)
            context = browser.new_context(viewport=SIZE, record_video_dir=str(RAW), record_video_size=SIZE)
            context.add_init_script(OVERLAY)
            page = context.new_page()
            try:
                GAMES[name](Director(page))
            finally:
                video = page.video.path()
                context.close()
            target = OUT / f"{name}.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)],
                check=True,
            )
            print(f"wrote {target}")
        browser.close()
    shutil.rmtree(RAW, ignore_errors=True)


if __name__ == "__main__":
    main()
