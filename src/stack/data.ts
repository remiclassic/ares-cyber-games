// Secure Stack content. Threats are stopped by specific defences; every pairing carries the
// one-line reason shown when it is made. Draft, pending SME review (docs/design/SECURE_STACK.md).

export type Kind = "threat" | "defence";

export type StickerDef = Readonly<{
  id: string;
  kind: Kind;
  name: string;
  blurb: string; // shown when the sticker is tapped
  hue: "red" | "orange" | "purple" | "pink" | "amber" | "rose" | "plum" | "coral" | "blue" | "teal" | "green" | "sky" | "indigo" | "mint" | "cyan" | "navy" | "lime";
  icon: string; // key into stickers.ts
}>;

export const STICKERS: readonly StickerDef[] = [
  { id: "phish", kind: "threat", name: "Phishing email", blurb: "A message that tricks people into clicking a link or giving away a password.", hue: "orange", icon: "hook" },
  { id: "ransom", kind: "threat", name: "Ransomware", blurb: "Malware that encrypts files and demands payment to unlock them.", hue: "red", icon: "lockfile" },
  { id: "bug", kind: "threat", name: "Malware", blurb: "Malicious software that runs on a device to spy, steal or damage.", hue: "purple", icon: "bug" },
  { id: "weakpw", kind: "threat", name: "Weak password", blurb: "A short, common or reused password that is easy to guess or already leaked.", hue: "pink", icon: "weakkey" },
  { id: "unpatched", kind: "threat", name: "Unpatched app", blurb: "Software with a known, published flaw that has not been fixed yet.", hue: "amber", icon: "crack" },
  { id: "usb", kind: "threat", name: "Rogue USB", blurb: "An unknown USB stick that can carry malware or pose as a keyboard.", hue: "rose", icon: "usb" },
  { id: "brute", kind: "threat", name: "Brute force", blurb: "Trying thousands of passwords against a login until one works.", hue: "plum", icon: "hammer" },
  { id: "leak", kind: "threat", name: "Data leak", blurb: "Sensitive data copied out to somewhere it should never go.", hue: "coral", icon: "leak" },
  { id: "unknown", kind: "threat", name: "Unidentified alert", blurb: "Something is wrong, but nobody knows what yet. Secure a threat next to it to investigate.", hue: "red", icon: "question" },

  { id: "mfa", kind: "defence", name: "MFA", blurb: "A second proof of identity, like an app prompt or a key, on top of the password.", hue: "blue", icon: "phonecheck" },
  { id: "report", kind: "defence", name: "Report button", blurb: "One click sends a suspicious email to the security team and pulls it from other inboxes.", hue: "teal", icon: "flag" },
  { id: "pwman", kind: "defence", name: "Password manager", blurb: "Creates and stores a long, unique password for every account.", hue: "indigo", icon: "vault" },
  { id: "backup", kind: "defence", name: "Offline backup", blurb: "A copy of your data that malware cannot reach or delete.", hue: "green", icon: "backup" },
  { id: "edr", kind: "defence", name: "EDR", blurb: "Endpoint detection and response: spots and stops malicious behaviour on devices.", hue: "sky", icon: "shield" },
  { id: "patch", kind: "defence", name: "Patch", blurb: "The vendor's fix for a known flaw, installed promptly.", hue: "mint", icon: "bandage" },
  { id: "usblock", kind: "defence", name: "USB control", blurb: "Device policy that blocks unknown USB storage and keyboards.", hue: "cyan", icon: "plug" },
  { id: "lockout", kind: "defence", name: "Lockout & rate limit", blurb: "Slows and locks logins after repeated failures.", hue: "navy", icon: "timer" },
  { id: "encrypt", kind: "defence", name: "Encryption & DLP", blurb: "Keeps data unreadable without the key, and stops sensitive files leaving.", hue: "lime", icon: "lockdoc" },
];

// threat → defence → reason shown when they are matched.
export const COUNTERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  phish: {
    report: "Reported fast, the email is pulled from every inbox before more people click.",
    mfa: "Even if the password is phished, it can't sign in without the second factor.",
  },
  ransom: {
    backup: "With an offline backup you restore your files instead of paying.",
    edr: "EDR spots mass encryption starting and kills it before it spreads.",
  },
  bug: {
    edr: "EDR catches the malicious behaviour and isolates the device.",
    patch: "Most malware gets in through flaws that already had a patch.",
  },
  weakpw: {
    pwman: "A password manager gives every account a long, unique password.",
    mfa: "With MFA, a guessed password alone is not enough.",
  },
  unpatched: {
    patch: "Installing the fix closes the published hole attackers scan for.",
  },
  usb: {
    usblock: "USB control blocks unknown drives before they mount or type.",
    edr: "EDR stops what the drive tries to run.",
  },
  brute: {
    lockout: "After a few failures, logins slow down and lock: thousands of guesses become a handful.",
    mfa: "Even a correct guess still needs the second factor.",
  },
  leak: {
    encrypt: "Encrypted data is useless without the key, and DLP stops the file leaving.",
  },
};

export function counters(threat: string, defence: string): boolean {
  return !!COUNTERS[threat]?.[defence];
}

export function sticker(id: string): StickerDef {
  const found = STICKERS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown sticker ${id}`);
  return found;
}

// Why a drop did not work, built from the table so it always matches the rules.
export function mismatch(a: string, b: string): string {
  const one = sticker(a);
  const two = sticker(b);
  if (one.kind === two.kind) {
    return one.kind === "threat"
      ? `Two threats don't cancel out. Drop a defence on ${one.name.toLowerCase()} instead.`
      : `Two defences don't make a match. Drop ${one.name} on a threat it stops.`;
  }
  const threat = one.kind === "threat" ? one : two;
  const defence = one.kind === "defence" ? one : two;
  if (threat.id === "unknown") return "Nobody knows what this alert is yet. Secure a threat right next to it to investigate it.";
  const stops = Object.entries(COUNTERS)
    .filter(([, list]) => list[defence.id])
    .map(([id]) => sticker(id).name.toLowerCase());
  const right = Object.keys(COUNTERS[threat.id] ?? {}).map((id) => sticker(id).name);
  return `${defence.name} stops ${list(stops)}, not ${threat.name.toLowerCase()}. ${threat.name} needs ${list(right, "or")}.`;
}

function list(items: readonly string[], joiner = "and"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`;
}

export type Goal = Readonly<{ threat: string; count: number }>;

export type Level = Readonly<{
  id: number;
  title: string;
  island: string;
  tip: string;
  threats: readonly string[];
  defences: readonly string[];
  goals: readonly Goal[];
  start: number; // stickers in the starting pile
  tideSeconds: number; // 0 = no tide
  unknowns: number; // iced "unidentified" stickers in the starting pile
}>;

export const LEVELS: readonly Level[] = [
  { id: 1, title: "First Shift", island: "Inbox Inlet", tip: "Drag a blue defence onto the orange threat it stops. Tap any sticker to read what it is; the field guide 📖 explains them all.", threats: ["phish", "weakpw"], defences: ["report", "mfa", "pwman"], goals: [{ threat: "phish", count: 3 }, { threat: "weakpw", count: 3 }], start: 14, tideSeconds: 0, unknowns: 0 },
  { id: 2, title: "The Tide Comes In", island: "Backup Bay", tip: "From now on, new threats keep washing in. Don't let the pile rest above the rope.", threats: ["phish", "weakpw", "ransom"], defences: ["report", "mfa", "pwman", "backup", "edr"], goals: [{ threat: "ransom", count: 3 }, { threat: "phish", count: 3 }, { threat: "weakpw", count: 2 }], start: 16, tideSeconds: 4.5, unknowns: 0 },
  { id: 3, title: "Patch Tuesday", island: "Patch Point", tip: "One defence can stop several threats, and one threat can have several defences.", threats: ["bug", "unpatched", "ransom", "phish"], defences: ["patch", "edr", "backup", "report", "mfa"], goals: [{ threat: "unpatched", count: 3 }, { threat: "bug", count: 3 }, { threat: "ransom", count: 2 }], start: 18, tideSeconds: 4, unknowns: 0 },
  { id: 4, title: "Unknown Signals", island: "Fog Reef", tip: "Grey alerts are unidentified. Secure a threat right next to one to investigate it.", threats: ["usb", "brute", "bug", "weakpw"], defences: ["usblock", "lockout", "edr", "mfa", "pwman"], goals: [{ threat: "brute", count: 3 }, { threat: "usb", count: 3 }, { threat: "bug", count: 2 }], start: 18, tideSeconds: 4, unknowns: 3 },
  { id: 5, title: "Storm Season", island: "Volcano Vault", tip: "Everything at once, and the tide is faster. Keep your streak going.", threats: ["leak", "ransom", "phish", "brute", "unpatched"], defences: ["encrypt", "backup", "edr", "report", "mfa", "lockout", "patch"], goals: [{ threat: "leak", count: 3 }, { threat: "ransom", count: 3 }, { threat: "brute", count: 2 }, { threat: "phish", count: 2 }], start: 20, tideSeconds: 3.2, unknowns: 2 },
];
