// Chain Breaker content. A remix of Cylitaire: Kill Chain (Project Ares games team): same
// skill (kill chain order), new twist (rebuild a real incident patience-style, then choose
// where to break the chain; earlier is better). Fictional; pending SME review.

export const STAGES = ["Reconnaissance", "Weaponization", "Delivery", "Exploitation", "Installation", "Command & Control", "Actions on Objectives"] as const;

export type Card = Readonly<{ id: string; stage: number; text: string }>;
export type Break = Readonly<{ id: string; text: string; stage: number | null; why: string }>;
export type Incident = Readonly<{ id: string; title: string; brief: string; cards: readonly Card[]; breaks: readonly Break[] }>;

export const INCIDENTS: readonly Incident[] = [
  {
    id: "invoice",
    title: "The invoice lure",
    brief: "Customer records left the building. Rebuild how, then decide where the chain should have broken.",
    cards: [
      { id: "a0", stage: 0, text: "Finance staff names and roles scraped from a professional networking site" },
      { id: "a1", stage: 1, text: "A macro-enabled invoice template built with a hidden downloader" },
      { id: "a2", stage: 2, text: "Invoice email sent to accounts payable from a look-alike domain" },
      { id: "a3", stage: 3, text: "The clerk enables content; the macro launches PowerShell" },
      { id: "a4", stage: 4, text: "A scheduled task added so the implant starts at every logon" },
      { id: "a5", stage: 5, text: "The workstation beacons to cdn-update.example every 60 seconds" },
      { id: "a6", stage: 6, text: "Customer records zipped and uploaded to cloud storage" },
    ],
    breaks: [
      { id: "b1", text: "Mail filter quarantines look-alike sender domains", stage: 2, why: "Stops the email arriving at all: the chain breaks at Delivery." },
      { id: "b2", text: "Block macros in files from the internet", stage: 3, why: "The email arrives, but the macro never runs: the chain breaks at Exploitation." },
      { id: "b3", text: "DNS blocks known command-and-control domains", stage: 5, why: "The implant is installed but can't phone home: the chain breaks at C2." },
      { id: "b4", text: "Offline, immutable backups", stage: null, why: "Backups help you recover; they break no step of a data-theft chain." },
    ],
  },
  {
    id: "vpn",
    title: "The exposed VPN",
    brief: "Ransomware was staged across the domain. It started at the edge.",
    cards: [
      { id: "v0", stage: 0, text: "An internet-wide scan finds the VPN appliance and its exact version" },
      { id: "v1", stage: 1, text: "A public exploit for the VPN flaw is adapted for this appliance" },
      { id: "v2", stage: 2, text: "Exploit requests sent to the VPN's login page" },
      { id: "v3", stage: 3, text: "The flaw gives the attacker a shell on the appliance" },
      { id: "v4", stage: 4, text: "A web shell is written to the appliance's disk" },
      { id: "v5", stage: 5, text: "The web shell takes commands over ordinary-looking HTTPS" },
      { id: "v6", stage: 6, text: "Domain admin credentials harvested and ransomware staged on file servers" },
    ],
    breaks: [
      { id: "c1", text: "Put the VPN login behind a zero-trust access gateway", stage: 2, why: "Unauthenticated requests never reach the vulnerable page: the chain breaks at Delivery." },
      { id: "c2", text: "Patch internet-facing systems within 72 hours", stage: 3, why: "The request arrives, but the flaw is gone: the chain breaks at Exploitation." },
      { id: "c3", text: "File integrity monitoring on the appliance, with response", stage: 4, why: "The web shell is spotted and removed when written: the chain breaks at Installation." },
      { id: "c4", text: "Security awareness training", stage: null, why: "Valuable, but no person was tricked here. Nothing in this chain depends on a click." },
    ],
  },
  {
    id: "supply",
    title: "The poisoned update",
    brief: "Payroll data leaked through a tool everyone trusted.",
    cards: [
      { id: "s0", stage: 0, text: "The attacker learns which remote-support tool Meridian uses" },
      { id: "s1", stage: 1, text: "A backdoor is slipped into the vendor's update package" },
      { id: "s2", stage: 2, text: "The tool auto-updates from the vendor's server" },
      { id: "s3", stage: 3, text: "The signed update runs with SYSTEM rights" },
      { id: "s4", stage: 4, text: "A new service is registered so the backdoor survives reboots" },
      { id: "s5", stage: 5, text: "The backdoor talks to the attacker through DNS queries" },
      { id: "s6", stage: 6, text: "Payroll data copied out, a few bytes per DNS query" },
    ],
    breaks: [
      { id: "d1", text: "Stage vendor updates in a test ring before they roll out", stage: 2, why: "The update is caught in the test ring before it reaches the fleet: the chain breaks at Delivery." },
      { id: "d2", text: "EDR alert and response on new services", stage: 4, why: "Persistence is spotted and removed: the chain breaks at Installation." },
      { id: "d3", text: "Only the internal resolver may send DNS to the internet", stage: 5, why: "The backdoor's DNS tunnel has nowhere to go: the chain breaks at C2." },
      { id: "d4", text: "MFA on email", stage: null, why: "Good practice, but nothing in this chain signs in to email." },
    ],
  },
];
