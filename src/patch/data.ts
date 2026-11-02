import type { Scenario } from "./sim";

// Fernhill Community Health's monthly patch window. Every organisation, product, advisory id and
// score here is fictional. Content to be reviewed with SMEs (docs/design/PATCH_TUESDAY.md).
// Risk values in comments are risk() from sim.ts: likelihood (exploit x exposure) x impact (cvss/10 x criticality).

export const SCENARIO: Scenario = {
  id: "the-monthly-window",
  title: "The Monthly Window",
  org: "Fernhill Community Health",
  budget: 3,
  rounds: [
    {
      id: "r1",
      title: "Round 1 · Read past the headline",
      mode: "guided",
      lesson: "Severity says how bad a bug could be. Risk asks: can attackers reach it, are they already using it, and what sits behind it? Start with exploited-in-the-wild and internet-facing.",
      vulns: [
        // 1.96: the headline decoy
        { id: "FH-2611-01", asset: "HR records server", product: "LedgerLine HR 7", flaw: "Unauthenticated remote code execution in the reporting service", cvss: 9.8, exposure: "internal", exploit: "none", criticality: 2, breach: "", why: "A 9.8 sounds urgent, but it is internal only and nobody has an exploit: an attacker would need a foothold first. Defer to next window." },
        // 19.5
        { id: "FH-2611-02", asset: "Staff VPN portal", product: "NimbusGate VPN 12", flaw: "Session token can be reused after logout", cvss: 6.5, exposure: "internet", exploit: "itw", criticality: 3, breach: "Breached: attackers replayed stolen VPN sessions and walked into the clinical network.", why: "Only a medium, but it is internet-facing, actively exploited, and the VPN is the front door to everything. Top priority." },
        // 8.8
        { id: "FH-2611-03", asset: "Staff webmail", product: "Quillmail 4", flaw: "Crafted message runs script in the reader's browser", cvss: 8.8, exposure: "internet", exploit: "poc", criticality: 2, breach: "Breached: a weaponised email from the public exploit hijacked three staff mailboxes.", why: "Internet-facing with public exploit code: expect it to be weaponised within days." },
        // 0.91
        { id: "FH-2611-04", asset: "Clinic printer fleet", product: "PrintPoint firmware 3.2", flaw: "Buffer overflow in the print job parser", cvss: 9.1, exposure: "internal", exploit: "none", criticality: 1, breach: "", why: "High severity, but internal, unexploited and on low-value printers. Schedule it; it can wait." },
        // 10.8
        { id: "FH-2611-05", asset: "Public appointment booking site", product: "BookWell plugin 2.4", flaw: "SQL injection in the date picker", cvss: 5.4, exposure: "internet", exploit: "itw", criticality: 2, breach: "Breached: a scanning bot dumped the appointments table from the public booking site.", why: "A medium, but bots are exploiting it on public sites right now, and this one is on the internet." },
      ],
    },
    {
      id: "r2",
      title: "Round 2 · Inside the walls",
      mode: "hints",
      lesson: "Internal is not safe once attackers are already in. Weigh what sits behind each bug: an exploit on a canteen app can rank below public exploit code against patient records.",
      vulns: [
        // 10.5
        { id: "FH-2611-06", asset: "Domain controller", product: "KeyRing Directory 2026", flaw: "Any signed-in user can raise themselves to domain admin", cvss: 7.0, exposure: "internal", exploit: "itw", criticality: 3, breach: "Breached: a phished account used the flaw to become domain admin and pushed ransomware to every PC.", why: "Internal, but ransomware crews exploit it the moment they have any account, and it controls every login. Patch." },
        // 1.96: the headline decoy
        { id: "FH-2611-07", asset: "Marketing microsite", product: "Lumen CMS 5", flaw: "Remote code execution in the image resizer", cvss: 9.8, exposure: "internet", exploit: "none", criticality: 1, breach: "", why: "Critical and internet-facing, but no exploit exists and the site holds nothing but brochures. Defer, or take it offline." },
        // 10.8
        { id: "FH-2611-08", asset: "Remote support tool", product: "AssistDesk 9", flaw: "Authentication bypass on the technician login", cvss: 7.2, exposure: "internet", exploit: "poc", criticality: 3, breach: "Breached: attackers used the public bypass to take remote control of an admin's workstation.", why: "Internet-facing, public exploit code, and it gives remote control of admin machines. Patch." },
        // 5.55
        { id: "FH-2611-09", asset: "Patient records database", product: "VaultSafe DB 3", flaw: "Crafted query reads other clinics' records", cvss: 7.4, exposure: "internal", exploit: "poc", criticality: 3, breach: "", why: "Internal, but exploit code is public and it holds every patient record: once anyone is inside, this is where they go. Patch." },
        // 4.3
        { id: "FH-2611-10", asset: "Staff canteen ordering app", product: "MenuMate 11", flaw: "Stored script in order comments", cvss: 8.6, exposure: "internal", exploit: "itw", criticality: 1, breach: "", why: "Exploited and rated high, but internal and on a canteen app with nothing worth stealing. Next window." },
      ],
    },
    {
      id: "r3",
      title: "Round 3 · No hints",
      mode: "final",
      lesson: "Final round: no factor bars, no hints. Weigh all four signals yourself.",
      vulns: [
        // 3.4
        { id: "FH-2611-11", asset: "Lobby check-in kiosk", product: "KioskOS 8", flaw: "Escape to desktop from the check-in app", cvss: 6.8, exposure: "internal", exploit: "itw", criticality: 1, breach: "", why: "Exploited, but internal and on a low-value kiosk with no patient data. The weakest of the exploited items." },
        // 12.15
        { id: "FH-2611-12", asset: "Card payments gateway", product: "PayRelay API 6", flaw: "Forged request skips payment signature check", cvss: 8.1, exposure: "internet", exploit: "poc", criticality: 3, breach: "Breached: fraudsters used the published exploit to push refunds to their own cards.", why: "Internet-facing, public exploit, and it moves money. Patch." },
        // 17.7
        { id: "FH-2611-13", asset: "Patient portal sign-in", product: "OpenDoor SSO 4", flaw: "Password reset link can be redirected", cvss: 5.9, exposure: "internet", exploit: "itw", criticality: 3, breach: "Breached: attackers hijacked password resets and read patient records through the portal.", why: "A medium, but exploited in the wild on an internet-facing sign-in that guards patient records. Highest risk on the board." },
        // 3.0: the headline decoy
        { id: "FH-2611-14", asset: "Backup server", product: "Archivist 10", flaw: "Unauthenticated remote code execution in the agent", cvss: 10.0, exposure: "internal", exploit: "none", criticality: 3, breach: "", why: "A perfect 10 on a crown jewel, but internal with no exploit: an attacker would have to be inside first. Next in line; watch it." },
        // 4.5
        { id: "FH-2611-15", asset: "Developer test server", product: "Stackbox 2", flaw: "Default admin password on the management page", cvss: 9.0, exposure: "internet", exploit: "poc", criticality: 1, breach: "", why: "Low-value box, but it is on the internet with a public exploit: an easy foothold into the network. Patch it, or pull it offline." },
      ],
    },
  ],
};
