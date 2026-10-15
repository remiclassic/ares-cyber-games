import type {
  ActionKind,
  FlowDef,
  NodeDef,
  RoundDef,
  Rule,
  ServiceId,
  SourceId,
  Variant,
} from "../sim/types";

// Scenario "Keep Finance Online". Everything a designer or SME would want to
// change lives here: board, traffic, evidence, policy, rounds, and feedback.
// Educational content is DRAFT and must be reviewed by Circadence SMEs.

export const ACTION_COSTS: Readonly<Record<ActionKind, number>> = {
  inspect: 20,
  rule: 40,
  route: 60,
  revise: 10,
};

export const SETBACK_LIMIT = 3;
export const SETBACK_REPAIR_GRANT = 40;
export const TICKS_PER_SECOND = 30;
// Board units travelled per tick.
export const TOKEN_SPEED = 0.11;

export const GRID_SIZE = 10;

// Conduit geometry: right-angle waypoints (tile coords) between two nodes,
// listed from the first node to the second. Links not listed run straight.
// Movement speed uses the same polyline, so what you see is what is simulated.
export const LINK_WAYPOINTS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  "core-finance": [[9, 4]],
  "gateway-finance": [[9, 8]],
  "backup-finance": [[9, 7]],
  "inspect-backup": [[4, 4], [4, 7]],
  "backup-hr": [[7, 7], [7, 0]],
};

export const NODES: readonly NodeDef[] = [
  { id: "internet", label: "Internet", short: "Internet", role: "External network entry. All outside requests arrive here.", zone: "external", gx: 1, gy: 8, sprite: "source" },
  { id: "gateway", label: "Gateway", short: "Gateway", role: "Security gateway. Enforces your access rules on every request that enters.", zone: "dmz", gx: 3, gy: 8, sprite: "firewall" },
  { id: "inspect", label: "Inspection Point", short: "Inspect", role: "Records request details so you can inspect evidence.", zone: "dmz", gx: 3, gy: 4, sprite: "latency-trap" },
  { id: "core", label: "Core Server", short: "Core", role: "Hosts the shared database that HR and Finance depend on.", zone: "internal", gx: 6, gy: 4, sprite: "core" },
  { id: "hr", label: "HR", short: "HR", role: "HR portal service. Depends on the Core server.", zone: "internal", gx: 6, gy: 0, sprite: "scrubber", dependsOn: ["core"] },
  { id: "finance", label: "Finance", short: "Finance", role: "Invoice portal and admin console. Depends on the Core server's database.", zone: "internal", gx: 9, gy: 5, sprite: "overclock", dependsOn: ["core"] },
  { id: "backup", label: "Backup Link", short: "Backup", role: "Spare relay that can carry traffic if a primary connection fails.", zone: "internal", gx: 6, gy: 7, sprite: "relay" },
];

export const NODE_BY_ID = Object.fromEntries(NODES.map((node) => [node.id, node])) as Record<NodeDef["id"], NodeDef>;

export const SERVICE_LABELS: Record<ServiceId, string> = {
  invoice: "Invoice portal (HTTPS 443)",
  hrportal: "HR portal (HTTPS 443)",
  admin: "Admin console (SSH 22)",
};

export const ORG_POLICY: readonly string[] = [
  "Approved suppliers may use the Finance invoice portal.",
  "Staff connected through the company VPN may use the HR portal.",
  "Administrative consoles may only be used from inside the internal network.",
  "Any other external access is not permitted.",
];

export const APPROVED_SUPPLIERS = ["Northwind Supply — 203.0.113.10"];

export const VARIANTS: readonly Variant[] = [
  { failLink: "core-finance", unknownAddress: "198.51.100.77", adminLabel: "Admin console (SSH 22)" },
  { failLink: "inspect-core", unknownAddress: "198.51.100.23", adminLabel: "Remote desktop admin (RDP 3389)" },
];

export function buildFlows(variant: Variant): Record<SourceId, FlowDef> {
  return {
    supplier: {
      id: "supplier",
      label: "Northwind Supply",
      address: "203.0.113.10",
      dest: "finance",
      service: "invoice",
      permitted: true,
      evidence: [
        "Source 203.0.113.10 is registered to Northwind Supply.",
        "Northwind Supply appears on the approved supplier list.",
        "Destination: Finance — Invoice portal (HTTPS 443).",
        "Steady pattern: one invoice upload every few seconds during business hours.",
      ],
    },
    hrstaff: {
      id: "hrstaff",
      label: "Remote HR staff",
      address: "VPN 10.8.0.14",
      dest: "hr",
      service: "hrportal",
      permitted: true,
      evidence: [
        "Source arrives through the company VPN as user j.ortiz (HR department).",
        "Destination: HR — HR portal (HTTPS 443).",
        "Signed in with multi-factor authentication at 08:02.",
      ],
    },
    unknown: {
      id: "unknown",
      label: "Unrecognized host",
      address: variant.unknownAddress,
      dest: "finance",
      service: "admin",
      permitted: false,
      evidence: [
        `Source ${variant.unknownAddress} is not on any approved list and is outside the company network.`,
        `Destination: Finance — ${variant.adminLabel}.`,
        "Pattern: repeated sign-in attempts, each with a different username.",
      ],
    },
  };
}

export function serviceLabel(service: ServiceId, variant: Variant): string {
  return service === "admin" ? variant.adminLabel : SERVICE_LABELS[service];
}

export const INITIAL_LINKS: readonly (readonly [NodeDef["id"], NodeDef["id"]])[] = [
  ["internet", "gateway"],
  ["gateway", "inspect"],
  ["inspect", "core"],
  ["core", "hr"],
];

export const INITIAL_RULES: readonly Rule[] = [
  {
    id: "legacy",
    action: "allow",
    source: "any",
    dest: "any",
    service: "any",
    note: "Legacy rule left by the previous administrator.",
  },
];

export function buildRounds(variant: Variant): RoundDef[] {
  const backupCandidates =
    variant.failLink === "core-finance"
      ? [
          {
            id: "backup-core-finance",
            label: "Core → Backup Link → Finance",
            description: "Carries Finance traffic and database access around the failed Core–Finance link.",
            kind: "backup" as const,
            links: [["core", "backup"], ["backup", "finance"]] as const,
          },
          {
            id: "backup-backup-hr",
            label: "Backup Link → HR",
            description: "Adds a second connection to HR through the Backup Link.",
            kind: "backup" as const,
            links: [["core", "backup"], ["backup", "hr"]] as const,
          },
        ]
      : [
          {
            id: "backup-inspect-core",
            label: "Inspection Point → Backup Link → Core",
            description: "Carries traffic around the failed Inspection–Core link.",
            kind: "backup" as const,
            links: [["inspect", "backup"], ["backup", "core"]] as const,
          },
          {
            id: "backup-backup-finance",
            label: "Backup Link → Finance",
            description: "Adds a second connection to Finance through the Backup Link.",
            kind: "backup" as const,
            links: [["backup", "finance"], ["backup", "hr"]] as const,
          },
        ];

  const failLabel = variant.failLink === "core-finance" ? "Core–Finance" : "Inspection–Core";

  return [
    {
      id: "establish",
      title: "Round 1 — Establish service",
      objective: "Restore the connection Finance needs so supplier invoices are delivered.",
      situation:
        "Finance was just moved to a new rack and is not connected yet. Northwind Supply's invoices cannot reach it.",
      apGrant: 100,
      flows: ["supplier", "hrstaff"],
      counts: { supplier: 5, hrstaff: 3 },
      spacing: 22,
      candidates: [
        {
          id: "core-finance",
          label: "Core → Finance",
          description: "Connects Finance to the Core server inside the internal zone.",
          kind: "primary",
          links: [["core", "finance"]],
        },
        {
          id: "gateway-finance",
          label: "Gateway → Finance",
          description: "Connects Finance straight to the Gateway — the shortest path from the internet.",
          kind: "primary",
          links: [["gateway", "finance"]],
        },
      ],
      events: [],
      allowedActions: ["route", "inspect", "revise"],
      success: { minLegitRatio: 0.8, minFinanceRatio: 0.8, maxProhibitedDelivered: 0 },
    },
    {
      id: "review",
      title: "Round 2 — Review activity",
      objective: "Keep approved work flowing while stopping access the policy does not permit.",
      situation:
        "Requests to Finance are arriving from two outside sources. The gateway still has a legacy rule that allows everything.",
      apGrant: 80,
      flows: ["supplier", "hrstaff", "unknown"],
      counts: { supplier: 5, hrstaff: 3, unknown: 6 },
      spacing: 16,
      candidates: [],
      events: [
        {
          kind: "pauseOnArrival",
          flow: "unknown",
          title: "New activity at the Gateway",
          message:
            "Requests from an unrecognized source just reached the Gateway, headed for Finance. The legacy rule will let them in. Inspect the evidence, then decide.",
        },
      ],
      allowedActions: ["inspect", "rule", "revise"],
      success: { minLegitRatio: 0.8, maxProhibitedDelivered: 0 },
      checkpoint: "rule-reason",
    },
    {
      id: "recover",
      title: "Round 3 — Recover safely",
      objective: "Bring Finance back online without weakening your access rules.",
      situation:
        "Mixed traffic continues. Watch the connections — the network is under strain.",
      apGrant: 60,
      flows: ["supplier", "hrstaff", "unknown"],
      counts: { supplier: 6, hrstaff: 3, unknown: 5 },
      spacing: 15,
      candidates: backupCandidates,
      events: [
        {
          kind: "linkFail",
          tick: 75,
          linkId: variant.failLink,
          title: `${failLabel} connection failed`,
          message: `The ${failLabel} link just went down. Requests that need it are queuing. Add a backup route to restore service.`,
        },
      ],
      allowedActions: ["route", "inspect", "rule", "revise"],
      success: { minLegitRatio: 0.7, minFinanceRatio: 0.7, maxProhibitedDelivered: 0 },
      checkpoint: "backup-reason",
    },
  ];
}

export type CheckpointDef = Readonly<{
  id: string;
  prompt: string;
  options: readonly Readonly<{ id: string; text: string; correct: boolean; feedback: string }>[];
}>;

export const CHECKPOINTS: Record<string, CheckpointDef> = {
  "rule-reason": {
    id: "rule-reason",
    prompt: "Why should Northwind Supply keep reaching Finance while the unrecognized host is denied?",
    options: [
      {
        id: "scoped",
        text: "The supplier matches the approved dependency; the restriction targets only the prohibited access.",
        correct: true,
        feedback: "Right. Policy, not suspicion of all outsiders, decides what is allowed — so the rule should be as narrow as the violation.",
      },
      {
        id: "block-all",
        text: "External traffic is risky, so blocking all of it is the safest choice.",
        correct: false,
        feedback: "Blocking everything stops the attack but also stops approved business. Security that breaks required services is not the goal.",
      },
      {
        id: "volume",
        text: "The supplier sends more requests, so it matters more.",
        correct: false,
        feedback: "Volume doesn't decide trust. The supplier is allowed because the policy approves it, and the host is denied because the policy forbids external admin access.",
      },
    ],
  },
  "backup-reason": {
    id: "backup-reason",
    prompt: "Which statement about the backup route is accurate?",
    options: [
      {
        id: "same-policy",
        text: "A backup route restores connectivity but still needs the same policy.",
        correct: true,
        feedback: "Exactly. Availability and trust are separate questions — the new path still runs through the gateway's rules.",
      },
      {
        id: "trusted",
        text: "Traffic on a backup route can be trusted because it is internal.",
        correct: false,
        feedback: "A backup path changes where traffic travels, not who is sending it. The unrecognized host is no more trustworthy on a different route.",
      },
      {
        id: "slow",
        text: "Backup routes are slower, so attackers usually give up.",
        correct: false,
        feedback: "Speed is not a security control. The rules at the gateway are what keep prohibited access out.",
      },
    ],
  },
};

// Fresh example with no hints, used after round 3.
export const FINAL_CHALLENGE = {
  prompt:
    "New situation: Kestrel IT, an approved contractor, uses the HR portal. Logs also show 203.0.113.200 — not on any list — repeatedly trying the HR admin console. The gateway allows everything. Which single rule best fits the policy?",
  options: [
    { id: "scoped", text: "DENY 203.0.113.200 → HR : Admin console", correct: true },
    { id: "dest", text: "DENY Any → HR : Any service", correct: false },
    { id: "all", text: "DENY Any → Any : Any service", correct: false },
    { id: "allow", text: "ALLOW Kestrel IT → HR : HR portal", correct: false },
  ],
  feedback: {
    scoped: "Correct — it denies exactly the prohibited access and leaves the approved contractor working.",
    dest: "This would stop the attacker but also lock out Kestrel IT, which the policy approves.",
    all: "This stops everything external, including approved work. It's the blanket block the scenario warned about.",
    allow: "Allowing the contractor is fine, but with an allow-everything rule in place it changes nothing — the admin attempts still get through.",
  } as Record<string, string>,
};

// Polyline (tile-center coords) for a link travelled from `a` to `b`.
export function linkPolyline(a: NodeDef["id"], b: NodeDef["id"]): { x: number; y: number }[] {
  const center = (gx: number, gy: number) => ({ x: gx + 0.5, y: gy + 0.5 });
  const forward = LINK_WAYPOINTS[`${a}-${b}`];
  const backward = LINK_WAYPOINTS[`${b}-${a}`];
  const mids = forward ?? (backward ? [...backward].reverse() : []);
  return [center(NODE_BY_ID[a].gx, NODE_BY_ID[a].gy), ...mids.map(([x, y]) => center(x, y)), center(NODE_BY_ID[b].gx, NODE_BY_ID[b].gy)];
}

export function polylineLength(points: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

export function pointAlong(points: readonly { x: number; y: number }[], t: number): { x: number; y: number } {
  const total = polylineLength(points);
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (remaining <= seg || i === points.length - 1) {
      const f = seg ? remaining / seg : 0;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
    }
    remaining -= seg;
  }
  return points[points.length - 1];
}
