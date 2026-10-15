import type { Scenario } from "./engine";

// Two illustrated scenes at Meridian Freight (fictional). Drawings are inline SVG in a
// 1000 × 600 scene. Each item: the right issue and fix are listed first (shuffled on screen).
// Pending SME review (docs/design/SPOT_THE_RISKS.md).

const OFFICE_BACKDROP = `
  <rect width="1000" height="600" fill="#12264a"/>
  <rect y="400" width="1000" height="200" fill="#0b1730"/>
  <rect y="396" width="1000" height="6" fill="#1d3a66"/>
  <g opacity=".35" stroke="#2c4b7d" stroke-width="2"><path d="M0 470h1000M0 540h1000M120 400l-60 200M320 400l-30 200M540 400v200M760 400l30 200M940 400l60 200"/></g>
  <rect x="40" y="40" width="300" height="130" rx="6" fill="#1b3a66" stroke="#2c5590"/>
  <path d="M40 105h300M190 40v130" stroke="#2c5590" stroke-width="3"/>
  <circle cx="300" cy="70" r="16" fill="#f6b93b" opacity=".8"/>
  <rect x="30" y="300" width="380" height="18" rx="4" fill="#4a6491"/>
  <rect x="50" y="318" width="12" height="90" fill="#33496f"/><rect x="380" y="318" width="12" height="90" fill="#33496f"/>
  <rect x="440" y="300" width="270" height="18" rx="4" fill="#4a6491"/>
  <rect x="460" y="318" width="12" height="90" fill="#33496f"/><rect x="680" y="318" width="12" height="90" fill="#33496f"/>
  <rect x="80" y="330" width="90" height="16" rx="6" fill="#26406a"/><rect x="118" y="346" width="12" height="60" fill="#26406a"/>
  <rect x="845" y="140" width="130" height="262" fill="#0a1426" stroke="#2c5590" stroke-width="4"/>
  <text x="908" y="128" fill="#9db2cf" font-family="Inter, sans-serif" font-size="11" text-anchor="middle">SERVER ROOM · BADGE ONLY</text>`;

const HOME_BACKDROP = `
  <rect width="1000" height="600" fill="#2a2238"/>
  <rect y="420" width="1000" height="180" fill="#3a2a22"/>
  <rect y="416" width="1000" height="6" fill="#5a4033"/>
  <rect x="330" y="40" width="300" height="170" rx="6" fill="#7fb6ff" opacity=".35" stroke="#a69bc0" stroke-width="6"/>
  <path d="M480 40v170M330 125h300" stroke="#a69bc0" stroke-width="5"/>
  <rect x="200" y="360" width="600" height="20" rx="4" fill="#8a6a52"/>
  <rect x="220" y="380" width="14" height="110" fill="#6e5240"/><rect x="766" y="380" width="14" height="110" fill="#6e5240"/>
  <rect x="740" y="190" width="200" height="12" fill="#8a6a52"/>
  <ellipse cx="500" cy="530" rx="260" ry="40" fill="#4a3550" opacity=".7"/>
  <rect x="742" y="150" width="24" height="40" rx="4" fill="#b07a4a"/><path d="M754 150c-14-30-20-34-26-50M754 150c4-30 10-40 18-52M754 150c-2-24 2-40 0-56" stroke="#4a8b4a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <rect x="60" y="440" width="110" height="120" rx="6" fill="#5a6a8a"/><rect x="74" y="430" width="82" height="14" rx="3" fill="#3a4a6a"/><text x="115" y="505" font-size="11" font-family="Inter" text-anchor="middle" fill="#e8f0fb">SHREDDER</text>`;

export const SCENARIO: Scenario = {
  id: "walkround",
  title: "The Walk-round",
  org: "Meridian Freight",
  scenes: [
    {
      id: "office",
      title: "Head office, Friday 5:40 pm",
      brief: "Most people have left for the weekend. Walk the floor and flag anything that puts the company at risk. Careful: some things only look risky.",
      backdrop: OFFICE_BACKDROP,
      items: [
        {
          id: "monitor",
          label: "Monitor on the left desk",
          x: 110, y: 150, w: 210, h: 152, risk: true,
          svg: `<rect x="110" y="150" width="200" height="130" rx="8" fill="#0d1b33" stroke="#4a6491" stroke-width="5"/><rect x="122" y="162" width="176" height="106" fill="#e8f0fb"/><rect x="122" y="162" width="176" height="16" fill="#2f7df6"/><rect x="130" y="186" width="60" height="74" fill="#cfd9e8"/><path d="M198 190h90M198 202h80M198 214h90M198 226h60M198 238h85" stroke="#8a9bb5" stroke-width="5"/><rect x="200" y="280" width="20" height="20" fill="#33496f"/><rect x="175" y="296" width="70" height="6" rx="3" fill="#33496f"/>`,
          issue: ["The session is unlocked and nobody is at the desk", "The monitor is too bright for an office", "Email should not be open after 5 pm"],
          fix: ["Lock the screen every time you step away (Windows key + L), and set a short auto-lock", "Turn the monitor off at the wall", "Close the email client before leaving"],
          explain: "An unlocked session lets anyone walking past act as that user: read mail, send mail, open files.",
        },
        {
          id: "sticky",
          label: "Yellow note on the left monitor",
          x: 282, y: 140, w: 46, h: 44, risk: true,
          svg: `<g transform="rotate(8 305 162)"><rect x="286" y="144" width="40" height="38" fill="#ffe066"/><text x="306" y="158" font-size="7" font-family="Inter" text-anchor="middle" fill="#3a3000" font-weight="700">VPN:</text><text x="306" y="168" font-size="6" font-family="Inter" text-anchor="middle" fill="#3a3000">Harbour</text><text x="306" y="176" font-size="6" font-family="Inter" text-anchor="middle" fill="#3a3000">2026!</text></g>`,
          issue: ["A password written on a note anyone can read", "Notes on screens block part of the display", "Paper notes are against the clean-desk rule only on Mondays"],
          fix: ["Remove it, change that password, and keep passwords in the company password manager", "Move the note under the keyboard", "Write the password in a notebook in the drawer instead"],
          explain: "The note reads ‘VPN: Harbour2026!’. Anyone walking the floor, including cleaners and visitors, now has a working password.",
        },
        {
          id: "usb",
          label: "Small object on the floor",
          x: 300, y: 450, w: 70, h: 40, risk: true,
          svg: `<g transform="rotate(-18 330 470)"><rect x="310" y="462" width="40" height="16" rx="4" fill="#2f7df6"/><rect x="350" y="465" width="12" height="10" fill="#c0c8d6"/><rect x="300" y="458" width="22" height="12" rx="2" fill="#ffffff"/><text x="311" y="467" font-size="6" font-family="Inter" text-anchor="middle" fill="#111">PAYROLL</text></g>`,
          issue: ["An unknown USB drive could be a lure carrying malware", "Someone has lost their payroll data and needs it back quickly", "USB drives on the floor are a trip hazard"],
          fix: ["Hand it to IT or security without plugging it in anywhere", "Plug it in to see whose it is, then return it", "Put it in the lost-property box at reception"],
          explain: "Dropped USB drives with tempting labels are a long-standing attack. Plugging one in, even ‘just to check’, can run code.",
        },
        {
          id: "whiteboard",
          label: "Whiteboard on the back wall",
          x: 440, y: 30, w: 290, h: 140, risk: true,
          svg: `<rect x="440" y="30" width="290" height="140" rx="6" fill="#f4f7fb" stroke="#8a9bb5" stroke-width="4"/><rect x="460" y="55" width="50" height="30" fill="none" stroke="#2f7df6" stroke-width="3"/><rect x="560" y="55" width="50" height="30" fill="none" stroke="#2f7df6" stroke-width="3"/><path d="M510 70h50M585 85v25" stroke="#2f7df6" stroke-width="3"/><rect x="560" y="110" width="50" height="22" fill="none" stroke="#d64545" stroke-width="3"/><text x="458" y="152" font-size="14" font-family="Inter" fill="#d64545" font-weight="700">Wi-Fi admin: Meridian!2026</text><text x="640" y="72" font-size="11" font-family="Inter" fill="#334">FW-CORE</text><text x="640" y="88" font-size="11" font-family="Inter" fill="#334">10.20.2.0/24</text>`,
          issue: ["Network layout and an admin password are visible to anyone in the room", "The diagram is out of date", "Whiteboards should only use one colour"],
          fix: ["Wipe it, change the Wi-Fi admin password, and keep diagrams in the access-controlled wiki", "Photograph it for the record, then leave it up", "Turn the board to face the wall"],
          explain: "Visitors, cleaners and video calls all see this wall. It hands an attacker both a map and a key.",
        },
        {
          id: "printer",
          label: "Printer by the meeting area",
          x: 740, y: 270, w: 100, h: 130, risk: true,
          svg: `<rect x="745" y="300" width="90" height="100" rx="6" fill="#d7dde8"/><rect x="745" y="300" width="90" height="22" rx="6" fill="#aab4c5"/><rect x="760" y="272" width="60" height="36" fill="#fff"/><text x="790" y="288" font-size="8.5" font-family="Inter" text-anchor="middle" fill="#c22" font-weight="800">CONFIDENTIAL</text><path d="M768 296h44M768 302h36" stroke="#99a" stroke-width="2"/><rect x="760" y="340" width="60" height="10" rx="2" fill="#555"/>`,
          issue: ["A confidential printout left uncollected in the tray", "The printer is low on toner", "Printers should not be near meeting areas"],
          fix: ["Collect it now, and use secure print release so jobs only print at the device after you badge in", "Leave it for the owner to collect on Monday", "Turn the printer off for the weekend"],
          explain: "The page is a salary review. Anything left in a shared tray is readable by whoever passes next.",
        },
        {
          id: "door",
          label: "Server room door",
          x: 840, y: 136, w: 150, h: 300, risk: true,
          svg: `<path d="M849 144 L900 160 L900 398 L849 398 Z" fill="#2c5590"/><circle cx="890" cy="280" r="5" fill="#c0c8d6"/><rect x="880" y="372" width="50" height="30" fill="#b07a4a"/><path d="M880 380h50M905 372v30" stroke="#8a5a32" stroke-width="2"/><rect x="935" y="250" width="22" height="30" rx="3" fill="#1d2b44" stroke="#4a6491"/><circle cx="946" cy="262" r="4" fill="#ff5d6c"/>`,
          issue: ["A badge-only door is propped open with a box", "The box is blocking a fire exit", "The badge reader light is red"],
          fix: ["Close the door, and report it so whoever propped it is reminded that badge-only doors stay shut", "Move the box somewhere tidier and leave the door open for airflow", "Badge in and out to reset the reader"],
          explain: "A propped door defeats the badge reader entirely. Anyone can walk into the room that holds the servers.",
        },
        {
          id: "visitor",
          label: "Person standing by the middle desk",
          x: 590, y: 220, w: 70, h: 190, risk: true,
          svg: `<circle cx="625" cy="245" r="20" fill="#e0b18f"/><path d="M600 230c5-18 45-18 50 0" fill="#3a2a22"/><rect x="598" y="268" width="54" height="80" rx="16" fill="#6b7a99"/><rect x="604" y="345" width="18" height="60" fill="#2b3550"/><rect x="628" y="345" width="18" height="60" fill="#2b3550"/><rect x="610" y="280" width="30" height="6" rx="3" fill="#5a6a8a"/>`,
          issue: ["Someone with no visible badge or escort, after hours", "They are standing too close to the desk", "Visitors should wear a jacket"],
          fix: ["Ask politely whether you can help them, and walk them to reception or security", "Ignore it: they are probably a contractor", "Take a photo and post it in the team chat"],
          explain: "Tailgaters rely on people not wanting to make a fuss. A friendly ‘can I help you find someone?’ is the right challenge.",
        },
        {
          id: "locked",
          label: "Monitor on the middle desk",
          x: 455, y: 180, w: 130, h: 122, risk: false,
          svg: `<rect x="460" y="185" width="120" height="95" rx="6" fill="#0d1b33" stroke="#4a6491" stroke-width="4"/><rect x="470" y="195" width="100" height="75" fill="#16305a"/><rect x="507" y="222" width="26" height="22" rx="3" fill="#9db2cf"/><path d="M512 222v-6a8 8 0 0 1 16 0v6" stroke="#9db2cf" stroke-width="3" fill="none"/><text x="520" y="262" font-size="9" font-family="Inter" text-anchor="middle" fill="#9db2cf">Locked</text><rect x="512" y="280" width="16" height="20" fill="#33496f"/>`,
          issue: ["The screen is left on overnight", "Someone might guess the password"],
          fix: [],
          explain: "A locked screen is exactly what good looks like. Flagging it costs time and trust.",
        },
        {
          id: "bin",
          label: "Grey bin near the printer",
          x: 690, y: 420, w: 80, h: 110, risk: false,
          svg: `<rect x="700" y="440" width="62" height="85" rx="6" fill="#5a6a8a"/><rect x="696" y="430" width="70" height="14" rx="4" fill="#4a5a7a"/><rect x="716" y="432" width="30" height="5" fill="#222"/><circle cx="731" cy="470" r="7" fill="none" stroke="#d7dde8" stroke-width="2"/><text x="731" y="500" font-size="7" font-family="Inter" text-anchor="middle" fill="#e8f0fb">CONFIDENTIAL</text><text x="731" y="509" font-size="7" font-family="Inter" text-anchor="middle" fill="#e8f0fb">WASTE · LOCKED</text>`,
          issue: ["Confidential papers are in a bin anyone can reach", "The bin is full"],
          fix: [],
          explain: "A locked confidential-waste console is the right place for sensitive paper; it is collected and shredded.",
        },
      ],
    },
    {
      id: "home",
      title: "Working from home, Monday 8:55 am",
      brief: "A colleague is about to join a client call from home. Spot what could go wrong before the camera comes on, but don't flag the things that are set up well.",
      backdrop: HOME_BACKDROP,
      items: [
        {
          id: "whiteboard-home",
          label: "Board on the wall behind the chair",
          x: 60, y: 60, w: 230, h: 150, risk: true,
          svg: `<rect x="60" y="60" width="220" height="140" rx="6" fill="#f4f7fb" stroke="#a69bc0" stroke-width="4"/><text x="76" y="92" font-size="14" font-family="Inter" fill="#334" font-weight="700">Harbor Fuel renewal</text><text x="76" y="118" font-size="12" font-family="Inter" fill="#c22">Rate: 3.1% → 2.4%</text><text x="76" y="140" font-size="12" font-family="Inter" fill="#334">Walk-away: 2.2%</text><text x="76" y="162" font-size="12" font-family="Inter" fill="#334">Contact: d.okafor</text><rect x="210" y="176" width="58" height="16" rx="4" fill="#ff5d6c"/><text x="239" y="188" font-size="9" font-family="Inter" text-anchor="middle" fill="#fff">ON CAMERA</text>`,
          issue: ["Confidential deal terms will be visible on camera", "The board needs cleaning", "The handwriting is hard to read"],
          fix: ["Wipe or cover it before the call, or use a background blur", "Turn the camera off for the whole call", "Write smaller so it is harder to read"],
          explain: "The walk-away rate is exactly what the other side of a negotiation wants, and calls are often recorded.",
        },
        {
          id: "router",
          label: "Router on the shelf",
          x: 770, y: 140, w: 140, h: 56, risk: true,
          svg: `<rect x="780" y="160" width="120" height="30" rx="6" fill="#1d2b44"/><path d="M800 160l-10-22M880 160l10-22" stroke="#1d2b44" stroke-width="4"/><circle cx="800" cy="175" r="3" fill="#3ddc84"/><circle cx="812" cy="175" r="3" fill="#3ddc84"/><rect x="840" y="166" width="54" height="18" fill="#fff"/><text x="867" y="174" font-size="6" font-family="Inter" text-anchor="middle" fill="#111">admin / admin</text><text x="867" y="181" font-size="5" font-family="Inter" text-anchor="middle" fill="#111">fw 2019.2</text>`,
          issue: ["The router still uses its default admin password and old firmware", "Routers should be kept on the floor", "Green lights mean it is overheating"],
          fix: ["Change the admin password, update the firmware, and turn on automatic updates", "Unplug it when not working", "Hide the sticker with tape"],
          explain: "Default credentials and unpatched home routers are routinely taken over. Everything on the network passes through them.",
        },
        {
          id: "phone",
          label: "Phone on the desk",
          x: 236, y: 290, w: 80, h: 72, risk: true,
          svg: `<rect x="246" y="300" width="60" height="58" rx="8" fill="#111827" transform="rotate(-8 276 329)"/><g transform="rotate(-8 276 329)"><rect x="251" y="306" width="50" height="46" rx="4" fill="#e8f0fb"/><text x="276" y="318" font-size="5.5" font-family="Inter" text-anchor="middle" fill="#111" font-weight="700">Parcel on hold</text><text x="276" y="327" font-size="4.6" font-family="Inter" text-anchor="middle" fill="#111">Pay £1.99 redelivery:</text><text x="276" y="335" font-size="4.6" font-family="Inter" text-anchor="middle" fill="#2f7df6">parcel-redeliver.example</text></g>`,
          issue: ["A smishing text that wants card details through a look-alike link", "The phone is on silent", "Delivery companies only email, never text"],
          fix: ["Don't tap the link. Report it as spam and delete it; check deliveries on the courier's own app or site", "Pay the £1.99: it is cheaper than a missed parcel", "Reply STOP to unsubscribe"],
          explain: "A tiny fee and urgency are the classic lure; the real goal is the card number and a foothold on the phone.",
        },
        {
          id: "speaker",
          label: "Small speaker next to the laptop",
          x: 650, y: 280, w: 60, h: 84, risk: true,
          svg: `<rect x="660" y="292" width="40" height="66" rx="18" fill="#3a3f55"/><ellipse cx="680" cy="294" rx="20" ry="6" fill="#4a5070"/><ellipse cx="680" cy="294" rx="14" ry="3" fill="#38d6f5" opacity=".9"/>`,
          issue: ["An always-listening smart speaker sits next to confidential calls", "The speaker volume is too low", "Speakers interfere with Wi-Fi"],
          fix: ["Mute its microphone (or move it out of the room) during confidential calls", "Ask it to stop recording when the call starts", "Turn the volume up so you hear notifications"],
          explain: "Voice assistants can wake by mistake and send audio to the cloud. Confidential calls should not have an extra listener.",
        },
        {
          id: "update",
          label: "Pop-up on the laptop screen",
          x: 530, y: 296, w: 92, h: 48, risk: true,
          svg: `<rect x="532" y="298" width="88" height="42" rx="4" fill="#1d2b44" stroke="#f6b93b" stroke-width="2"/><text x="576" y="312" font-size="6.5" font-family="Inter" text-anchor="middle" fill="#ffe0a3" font-weight="700">Security update ready</text><text x="576" y="322" font-size="5.6" font-family="Inter" text-anchor="middle" fill="#e8f0fb">Restart to install</text><text x="576" y="332" font-size="5.6" font-family="Inter" text-anchor="middle" fill="#ff9aa4">Postponed 14 times</text>`,
          issue: ["Security updates have been postponed for weeks", "The pop-up will appear during the call", "Restarting deletes open files"],
          fix: ["Save work and install the update today, outside the call; let IT enforce a deadline", "Postpone it again until the weekend", "Turn notifications off"],
          explain: "Most real-world compromises use vulnerabilities that already had a patch. Fourteen postponements is weeks of exposure.",
        },
        {
          id: "recycling",
          label: "Recycling box by the desk",
          x: 840, y: 440, w: 120, h: 130, risk: true,
          svg: `<rect x="850" y="470" width="100" height="95" rx="6" fill="#2f7df6"/><path d="M880 505l20-12 20 12M885 520l15 9 15-9" stroke="#fff" stroke-width="3" fill="none"/><rect x="866" y="446" width="56" height="34" fill="#fff" transform="rotate(-10 894 463)"/><text x="892" y="466" font-size="8" font-family="Inter" text-anchor="middle" fill="#c22" font-weight="800" transform="rotate(-10 894 463)">CONTRACT</text>`,
          issue: ["A signed client contract is going out in household recycling", "Paper should go in general waste", "The box is overflowing"],
          fix: ["Shred it at home, or bring it back for the office's confidential waste", "Tear it in half first", "Put it at the bottom of the box"],
          explain: "Household recycling is collected and sorted by strangers. A contract has names, prices and signatures.",
        },
        {
          id: "laptop",
          label: "Laptop camera",
          x: 456, y: 210, w: 52, h: 26, risk: false,
          svg: `<rect x="460" y="216" width="44" height="14" rx="7" fill="#1d2b44" stroke="#9db2cf"/><rect x="474" y="218" width="26" height="10" rx="5" fill="#9db2cf"/>`,
          issue: ["A covered camera means the user cannot join calls", "Camera covers damage laptops"],
          fix: [],
          explain: "A sliding webcam cover is a sensible habit; it opens for the call.",
        },
        {
          id: "vpn",
          label: "Icon in the corner of the laptop screen",
          x: 386, y: 314, w: 70, h: 30, risk: false,
          svg: `<rect x="390" y="320" width="62" height="18" rx="9" fill="#123d2a" stroke="#3ddc84"/><circle cx="401" cy="329" r="4" fill="#3ddc84"/><text x="430" y="332" font-size="8" font-family="Inter" text-anchor="middle" fill="#b4f5d0">VPN on</text>`,
          issue: ["The VPN slows the call down, so it should be off", "VPNs are only for travelling"],
          fix: [],
          explain: "The company VPN is connected, which is exactly what policy asks for when working remotely.",
        },
      ],
    },
  ],
};

// The laptop itself, drawn under the items on the home scene.
export const HOME_LAPTOP = `<rect x="380" y="206" width="250" height="148" rx="8" fill="#0d1b33" stroke="#4a6491" stroke-width="5"/><rect x="392" y="236" width="226" height="108" fill="#16305a"/><rect x="398" y="242" width="106" height="66" rx="4" fill="#2a3f66"/><rect x="508" y="242" width="104" height="66" rx="4" fill="#2a3f66"/><circle cx="451" cy="268" r="12" fill="#e0b18f"/><circle cx="560" cy="268" r="12" fill="#c69477"/><rect x="350" y="350" width="310" height="12" rx="4" fill="#4a6491"/>`;
