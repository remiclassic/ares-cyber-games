import type { Scenario } from "../sim/types";

// All names, hosts and domains are fictional. The indicator domain uses the reserved
// .example TLD. Content is draft and pending SME review (docs/design/BLAST_RADIUS.md).

const WHY = {
  dns: "Branch clients resolve through this forwarder, so the central DNS log shows only the forwarder's address. Its cache statistics count distinct clients per domain but do not keep who they were.",
  proxy: "Outbound web traffic leaves through a shared NAT address. The proxy can count distinct client fingerprints that reached the domain, not which internal host each one was.",
  ids: "The segment sensor sees beacon sessions on the wire. Its summary counts distinct hosts with the pattern; the full packet store for this segment has already rolled over.",
  vpn: "The VPN concentrator logs session counts per profile. Per-user mapping is kept for 24 hours and this activity is older.",
} as const;

export const SCENARIO: Scenario = {
  id: "the-backup-account",
  title: "The Backup Account",
  org: "Meridian Freight",
  indicator: "beacons to cdn-update.example every 60 seconds",
  costs: { readSensor: 5, triage: 20 },
  cases: [
    {
      id: "harbour-branch",
      title: "Harbour Branch",
      site: "Harbour Branch · 5 hosts",
      brief:
        "Threat intel flagged cdn-update.example as command and control. Two aggregate sources at the branch can tell you how many hosts beacon to it. Host triage tells you exactly, one host at a time.",
      budgetMinutes: 60,
      guided: true,
      hosts: [
        { id: "hb-lt-01", label: "HB-LT-01", role: "Dispatcher laptop", kind: "laptop", x: 14, y: 22, weight: 1 },
        { id: "hb-lt-02", label: "HB-LT-02", role: "Dispatcher laptop", kind: "laptop", x: 14, y: 70, weight: 1 },
        { id: "hb-ws-03", label: "HB-WS-03", role: "Front desk PC", kind: "workstation", x: 50, y: 46, weight: 1 },
        { id: "hb-ws-04", label: "HB-WS-04", role: "Warehouse scanner station", kind: "workstation", x: 86, y: 22, weight: 1 },
        { id: "hb-ws-05", label: "HB-WS-05", role: "Warehouse office PC", kind: "workstation", x: 86, y: 70, weight: 1 },
      ],
      sensors: [
        { id: "hb-dns", label: "Branch DNS forwarder", kind: "dns", why: WHY.dns, covers: ["hb-lt-01", "hb-lt-02", "hb-ws-03"], x: 30, y: 46 },
        { id: "hb-proxy", label: "Branch proxy NAT", kind: "proxy", why: WHY.proxy, covers: ["hb-ws-03", "hb-ws-04", "hb-ws-05"], x: 70, y: 46 },
      ],
      variants: [{ compromised: ["hb-ws-03"] }, { compromised: ["hb-ws-03", "hb-ws-04"] }],
    },
    {
      id: "two-depots",
      title: "Two Depots",
      site: "North and South depots · 8 hosts",
      brief:
        "The same beacon shows up at both depots. Each depot has its own DNS forwarder, each department leaves through its own proxy pool, and some laptops are only seen by the VPN concentrator.",
      budgetMinutes: 90,
      hosts: [
        { id: "n-fin-01", label: "N-FIN-01", role: "Accounts payable", kind: "laptop", x: 10, y: 20, weight: 1 },
        { id: "n-fin-02", label: "N-FIN-02", role: "Billing clerk", kind: "workstation", x: 30, y: 20, weight: 1 },
        { id: "n-ops-01", label: "N-OPS-01", role: "Yard planner", kind: "workstation", x: 10, y: 58, weight: 1 },
        { id: "n-ops-02", label: "N-OPS-02", role: "Shift lead", kind: "laptop", x: 30, y: 58, weight: 1 },
        { id: "s-fin-01", label: "S-FIN-01", role: "Billing clerk", kind: "workstation", x: 70, y: 20, weight: 1 },
        { id: "s-fin-02", label: "S-FIN-02", role: "Depot accountant", kind: "laptop", x: 90, y: 20, weight: 1 },
        { id: "s-ops-01", label: "S-OPS-01", role: "Shift lead", kind: "laptop", x: 70, y: 58, weight: 1 },
        { id: "s-ops-02", label: "S-OPS-02", role: "Yard planner", kind: "workstation", x: 90, y: 58, weight: 1 },
      ],
      sensors: [
        { id: "td-dns-n", label: "North DNS forwarder", kind: "dns", why: WHY.dns, covers: ["n-fin-01", "n-fin-02", "n-ops-01", "n-ops-02"], x: 20, y: 96 },
        { id: "td-dns-s", label: "South DNS forwarder", kind: "dns", why: WHY.dns, covers: ["s-fin-01", "s-fin-02", "s-ops-01", "s-ops-02"], x: 80, y: 96 },
        { id: "td-proxy-fin", label: "Finance proxy pool", kind: "proxy", why: WHY.proxy, covers: ["n-fin-01", "n-fin-02", "s-fin-01", "s-fin-02"], x: 50, y: 0 },
        { id: "td-proxy-ops", label: "Operations proxy pool", kind: "proxy", why: WHY.proxy, covers: ["n-ops-01", "n-ops-02", "s-ops-01", "s-ops-02"], x: 50, y: 39 },
        { id: "td-vpn", label: "VPN concentrator", kind: "vpn", why: WHY.vpn, covers: ["n-fin-01", "n-ops-02", "s-fin-02", "s-ops-01"], x: 50, y: 78 },
      ],
      variants: [{ compromised: ["n-fin-02", "n-ops-02", "s-ops-01"] }, { compromised: ["n-fin-01", "s-fin-01", "s-ops-02"] }],
    },
    {
      id: "head-office",
      title: "Head Office",
      site: "Head office · 12 hosts, 2 critical",
      brief:
        "The stolen account belongs to the backup service, which reaches every server. Isolating a clean domain controller or payroll database stops the business for the day; leaving a compromised one running is worse.",
      budgetMinutes: 120,
      hosts: [
        { id: "fin-01", label: "FIN-01", role: "Finance analyst", kind: "workstation", x: 6, y: 18, weight: 1 },
        { id: "fin-02", label: "FIN-02", role: "Payroll officer", kind: "workstation", x: 22, y: 18, weight: 1 },
        { id: "fin-03", label: "FIN-03", role: "Controller", kind: "laptop", x: 38, y: 18, weight: 1 },
        { id: "hr-01", label: "HR-01", role: "HR advisor", kind: "workstation", x: 6, y: 46, weight: 1 },
        { id: "hr-02", label: "HR-02", role: "Recruiter", kind: "laptop", x: 22, y: 46, weight: 1 },
        { id: "it-01", label: "IT-01", role: "Service desk", kind: "workstation", x: 38, y: 46, weight: 1 },
        { id: "it-02", label: "IT-02", role: "Systems admin", kind: "workstation", x: 6, y: 74, weight: 1 },
        { id: "it-03", label: "IT-03", role: "Backup operator", kind: "workstation", x: 22, y: 74, weight: 1 },
        { id: "dc-01", label: "DC-01", role: "Domain controller", kind: "critical", x: 78, y: 18, weight: 3 },
        { id: "pay-db", label: "PAY-DB", role: "Payroll database", kind: "critical", x: 96, y: 18, weight: 3 },
        { id: "fs-02", label: "FS-02", role: "File server", kind: "server", x: 78, y: 74, weight: 1 },
        { id: "bkp-01", label: "BKP-01", role: "Backup server", kind: "server", x: 96, y: 74, weight: 1 },
      ],
      sensors: [
        { id: "ho-dns-2", label: "Floor 2 DNS forwarder", kind: "dns", why: WHY.dns, covers: ["fin-01", "fin-02", "fin-03", "hr-01"], x: 22, y: 0 },
        { id: "ho-dns-3", label: "Floor 3 DNS forwarder", kind: "dns", why: WHY.dns, covers: ["hr-02", "it-01", "it-02", "it-03"], x: 34, y: 96 },
        { id: "ho-proxy-a", label: "Proxy pool A", kind: "proxy", why: WHY.proxy, covers: ["fin-01", "hr-01", "hr-02", "it-02"], x: 14, y: 60 },
        { id: "ho-proxy-b", label: "Proxy pool B", kind: "proxy", why: WHY.proxy, covers: ["fin-02", "fin-03", "it-01", "it-03"], x: 52, y: 32 },
        { id: "ho-ids-srv", label: "Server VLAN IDS", kind: "ids", why: WHY.ids, covers: ["dc-01", "pay-db", "fs-02", "bkp-01"], x: 87, y: 46 },
        { id: "ho-ids-bkp", label: "Backup network IDS", kind: "ids", why: WHY.ids, covers: ["bkp-01", "fs-02", "it-03", "pay-db"], x: 60, y: 90 },
      ],
      variants: [{ compromised: ["it-03", "bkp-01", "fin-02", "dc-01"] }, { compromised: ["it-03", "bkp-01", "hr-02", "fs-02"] }],
    },
  ],
};
