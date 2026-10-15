// Blind Spots content. A remix of Threat Modeler (Project Ares games team): same skill (attack
// paths and detection coverage), new twist (a sensor budget, then a red team run that scores
// how early each path was seen). Fictional; pending SME review (docs/design/REMIXES.md).

export type Node = Readonly<{ id: string; label: string; x: number; y: number }>;
export type Sensor = Readonly<{ id: string; name: string; node: string; cost: number; sees: readonly string[]; detail: string }>;
export type Step = Readonly<{ id: string; label: string; node: string }>;
export type Path = Readonly<{ id: string; name: string; steps: readonly Step[] }>;

export const BUDGET = 9;

export const NODES: readonly Node[] = [
  { id: "internet", label: "Internet", x: 6, y: 50 },
  { id: "mail", label: "Email gateway", x: 24, y: 16 },
  { id: "vpn", label: "VPN", x: 24, y: 50 },
  { id: "web", label: "Web app", x: 24, y: 84 },
  { id: "ws", label: "Workstations", x: 45, y: 16 },
  { id: "proxy", label: "Egress proxy", x: 45, y: 50 },
  { id: "dc", label: "Domain controller", x: 66, y: 50 },
  { id: "fs", label: "File server", x: 86, y: 16 },
  { id: "db", label: "Customer database", x: 66, y: 84 },
  { id: "cloud", label: "Cloud storage", x: 90, y: 84 },
];

export const SENSORS: readonly Sensor[] = [
  { id: "mailbox", name: "Attachment sandbox", node: "mail", cost: 2, sees: ["p1-deliver"], detail: "Detonates attachments and flags the ones that misbehave." },
  { id: "edr", name: "EDR with alerting", node: "ws", cost: 3, sees: ["p1-exec", "p1-dump"], detail: "Sees processes on workstations: macros spawning PowerShell, memory dumping." },
  { id: "vpnlog", name: "VPN sign-in analytics", node: "vpn", cost: 2, sees: ["p2-login"], detail: "Impossible travel and new-device alerts on VPN sign-ins." },
  { id: "waf", name: "Web app firewall logs", node: "web", cost: 2, sees: ["p3-sqli"], detail: "Flags injection attempts against the web app." },
  { id: "dcmon", name: "Domain auth monitoring", node: "dc", cost: 3, sees: ["p1-admin", "p2-roast"], detail: "Alerts on unusual admin logons and Kerberoasting ticket requests." },
  { id: "fsaudit", name: "File access auditing", node: "fs", cost: 2, sees: ["p1-mass"], detail: "Alerts when one account opens thousands of files." },
  { id: "dbaudit", name: "Database query audit", node: "db", cost: 2, sees: ["p2-dump", "p3-dump"], detail: "Alerts on bulk exports of customer tables." },
  { id: "egress", name: "Egress monitoring", node: "proxy", cost: 2, sees: ["p1-beacon", "p1-exfil", "p2-exfil"], detail: "Spots beaconing and large uploads leaving the network." },
  { id: "cloudtrail", name: "Cloud audit alerts", node: "cloud", cost: 2, sees: ["p3-public"], detail: "Alerts when a bucket is made public." },
];

export const PATHS: readonly Path[] = [
  {
    id: "p1",
    name: "Phish to file share",
    steps: [
      { id: "p1-deliver", label: "Malicious invoice delivered", node: "mail" },
      { id: "p1-exec", label: "Macro runs PowerShell", node: "ws" },
      { id: "p1-beacon", label: "Implant beacons out", node: "proxy" },
      { id: "p1-dump", label: "Credentials dumped from memory", node: "ws" },
      { id: "p1-admin", label: "Admin logon to the domain controller", node: "dc" },
      { id: "p1-mass", label: "Thousands of files read", node: "fs" },
      { id: "p1-exfil", label: "Archive uploaded out", node: "proxy" },
    ],
  },
  {
    id: "p2",
    name: "Stolen VPN login",
    steps: [
      { id: "p2-login", label: "VPN sign-in from a new country", node: "vpn" },
      { id: "p2-roast", label: "Service tickets requested in bulk", node: "dc" },
      { id: "p2-dump", label: "Customer table exported", node: "db" },
      { id: "p2-exfil", label: "Export uploaded out", node: "proxy" },
    ],
  },
  {
    id: "p3",
    name: "Web app to public bucket",
    steps: [
      { id: "p3-sqli", label: "SQL injection on the web app", node: "web" },
      { id: "p3-dump", label: "Customer rows pulled", node: "db" },
      { id: "p3-public", label: "Copied to a bucket made public", node: "cloud" },
    ],
  },
];
