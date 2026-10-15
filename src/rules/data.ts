import type { Scenario } from "./engine";

// Meridian Freight's core firewall. Fictional; addresses are private ranges and documentation
// ranges (RFC 5737). Pending SME review (docs/design/RULE_ORDER.md).

export const SCENARIO: Scenario = {
  id: "fw-core",
  title: "FW-CORE change window",
  org: "Meridian Freight",
  hosts: [
    { id: "fs02", label: "FS-02 file server", ip: "10.20.2.20", groups: ["Servers", "Internal"] },
    { id: "paydb", label: "PAY-DB payroll database", ip: "10.20.2.30", groups: ["Servers", "Internal"] },
    { id: "dns01", label: "DNS-01 resolver", ip: "10.20.2.53", groups: ["DNS", "Internal"] },
    { id: "jmp01", label: "JMP-01 jump host", ip: "10.20.1.5", groups: ["Jump host", "Internal"] },
    { id: "web", label: "a website", ip: "192.0.2.80", groups: ["Internet"] },
  ],
  puzzles: [
    {
      id: "guest",
      title: "The guest Wi-Fi",
      brief: "Guests on 10.20.9.0/24 can reach the file server. There is a rule against it, so why is it not working?",
      lesson: "First match wins. A broad allow above a narrow deny hides the deny completely: this is called shadowing. Put specific rules above the broad ones they carve out of.",
      defaultAction: "deny",
      rules: [
        { id: "r1", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "Servers", port: "any", note: "Staff to servers" },
        { id: "r2", action: "deny", src: "10.20.9.0/24", srcLabel: "Guest Wi-Fi 10.20.9.0/24", dst: "Servers", port: "any", note: "Guests never reach servers" },
        { id: "r3", action: "allow", src: "10.20.9.0/24", srcLabel: "Guest Wi-Fi 10.20.9.0/24", dst: "Internet", port: 443, note: "Guests browse the web" },
      ],
      packets: [
        { id: "p1", label: "Office PC opens a file share", src: "10.20.4.15", dst: "fs02", port: 445, intent: "allow", why: "Staff work on the file server every day." },
        { id: "p2", label: "Guest laptop probes the file server", src: "10.20.9.40", dst: "fs02", port: 445, intent: "deny", why: "Guest devices are unmanaged and must never reach servers." },
        { id: "p3", label: "Guest laptop browses the web", src: "10.20.9.40", dst: "web", port: 443, intent: "allow", why: "Guest Wi-Fi exists for web access." },
      ],
    },
    {
      id: "early-default",
      title: "The early cleanup rule",
      brief: "After last night's change, half the office cannot browse. This firewall's built-in default is ALLOW, so the explicit deny-all has to stay, just not where it is now.",
      lesson: "A cleanup ‘deny everything’ rule belongs at the very bottom. Anywhere higher, it silently blocks every rule beneath it. And on a firewall whose default is allow, deleting it opens everything up.",
      defaultAction: "allow",
      rules: [
        { id: "r1", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "DNS", port: 53, note: "Name lookups" },
        { id: "r2", action: "deny", src: "any", srcLabel: "Anything", dst: "any", port: "any", note: "Cleanup: deny everything else" },
        { id: "r3", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "Internet", port: 443, note: "Web browsing" },
        { id: "r4", action: "allow", src: "10.20.4.0/24", srcLabel: "Office 10.20.4.0/24", dst: "Servers", port: 445, note: "Office file shares" },
      ],
      packets: [
        { id: "p1", label: "Office PC looks up a name", src: "10.20.4.15", dst: "dns01", port: 53, intent: "allow", why: "Nothing works without DNS." },
        { id: "p2", label: "Office PC browses the web", src: "10.20.4.15", dst: "web", port: 443, intent: "allow", why: "Web access is a business need." },
        { id: "p3", label: "Office PC opens a file share", src: "10.20.4.15", dst: "fs02", port: 445, intent: "allow", why: "Staff work on the file server." },
        { id: "p4", label: "Internet host tries RDP on the file server", src: "198.51.100.7", dst: "fs02", port: 3389, intent: "deny", why: "Remote desktop is never exposed to the internet." },
        { id: "p5", label: "Guest laptop probes the payroll database", src: "10.20.9.40", dst: "paydb", port: 1433, intent: "deny", why: "Nothing but the payroll app reaches the database." },
      ],
    },
    {
      id: "legacy",
      title: "The legacy exception",
      brief: "An audit flagged remote desktop open to anything. The vendor who needed it now has their own rule, and admins are meant to go through the jump host.",
      lesson: "‘Temporary’ broad rules outlive their reason. Remove the over-broad rule rather than working around it, and keep the narrow rules that carry the real need: least privilege.",
      defaultAction: "deny",
      rules: [
        { id: "r1", action: "allow", src: "any", srcLabel: "Anything", dst: "any", port: 3389, note: "TEMP vendor support (2019)" },
        { id: "r2", action: "allow", src: "203.0.113.10/32", srcLabel: "Vendor 203.0.113.10", dst: "Jump host", port: 3389, note: "Vendor to the jump host" },
        { id: "r3", action: "allow", src: "10.20.1.5/32", srcLabel: "Jump host 10.20.1.5", dst: "Servers", port: 3389, note: "Admins via the jump host" },
        { id: "r4", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "Internet", port: 443, note: "Web browsing" },
      ],
      packets: [
        { id: "p1", label: "Vendor connects to the jump host", src: "203.0.113.10", dst: "jmp01", port: 3389, intent: "allow", why: "The support contract needs it." },
        { id: "p2", label: "Jump host RDPs to the file server", src: "10.20.1.5", dst: "fs02", port: 3389, intent: "allow", why: "This is how admins are meant to work." },
        { id: "p3", label: "Internet scanner tries RDP on the file server", src: "198.51.100.7", dst: "fs02", port: 3389, intent: "deny", why: "Exposed RDP is a top ransomware entry point." },
        { id: "p4", label: "Office PC RDPs straight to the payroll DB", src: "10.20.4.15", dst: "paydb", port: 3389, intent: "deny", why: "Admin access goes through the jump host, where it is logged." },
      ],
    },
    {
      id: "rebuild",
      title: "Rebuild the order",
      brief: "A migration script imported the rules in the wrong order. Two packets are getting the wrong verdict. Find the fewest moves that fix both.",
      lesson: "Order rules from most specific to most general: specific exceptions first (the jump host), then the denies they carve out of, then the broad allows. Trace any packet you are unsure of before you push.",
      defaultAction: "deny",
      rules: [
        { id: "a", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "Internet", port: 443, note: "Web browsing" },
        { id: "e", action: "deny", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "Servers", port: 3389, note: "No direct RDP to servers" },
        { id: "d", action: "allow", src: "10.20.1.5/32", srcLabel: "Jump host 10.20.1.5", dst: "Servers", port: 3389, note: "Admins via the jump host" },
        { id: "c", action: "allow", src: "10.20.0.0/16", srcLabel: "All staff 10.20.0.0/16", dst: "DNS", port: 53, note: "Name lookups" },
        { id: "f", action: "allow", src: "10.20.4.0/24", srcLabel: "Office 10.20.4.0/24", dst: "Servers", port: 445, note: "Office file shares" },
        { id: "b", action: "deny", src: "10.20.9.0/24", srcLabel: "Guest Wi-Fi 10.20.9.0/24", dst: "Internal", port: "any", note: "Guests never reach internal systems" },
      ],
      packets: [
        { id: "p1", label: "Guest laptop queries the internal resolver", src: "10.20.9.40", dst: "dns01", port: 53, intent: "deny", why: "Guests use a separate public resolver; internal DNS reveals internal names." },
        { id: "p2", label: "Jump host RDPs to the file server", src: "10.20.1.5", dst: "fs02", port: 3389, intent: "allow", why: "This is how admins are meant to work." },
        { id: "p3", label: "Office PC RDPs to the file server", src: "10.20.4.15", dst: "fs02", port: 3389, intent: "deny", why: "Direct admin access bypasses the jump host's logging." },
        { id: "p4", label: "Office PC opens a file share", src: "10.20.4.15", dst: "fs02", port: 445, intent: "allow", why: "Staff work on the file server." },
        { id: "p5", label: "Office PC looks up a name", src: "10.20.4.15", dst: "dns01", port: 53, intent: "allow", why: "Nothing works without DNS." },
        { id: "p6", label: "Guest laptop browses the web", src: "10.20.9.40", dst: "web", port: 443, intent: "allow", why: "Guest Wi-Fi exists for web access." },
      ],
    },
  ],
};
