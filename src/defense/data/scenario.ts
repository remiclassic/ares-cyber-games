import type { Scenario } from "../sim/types";

// Meridian Freight is fictional. Technique ids follow MITRE ATT&CK for reference only. Every
// control effect below is a simplification and is pending SME review
// (docs/design/DEFENSE_IN_DEPTH.md).

export const SCENARIO: Scenario = {
  id: "the-long-week",
  title: "The Long Week",
  org: "Meridian Freight",
  crownJewels: "Customer records and file servers",
  stages: [
    { id: "initial", name: "Initial access", short: "Access", question: "How do they get in?" },
    { id: "execution", name: "Execution", short: "Execute", question: "How do they run code?" },
    { id: "credential", name: "Credential access", short: "Creds", question: "How do they get more access?" },
    { id: "lateral", name: "Lateral movement", short: "Move", question: "How do they reach the servers?" },
    { id: "impact", name: "Impact", short: "Impact", question: "What do they do there?" },
  ],
  techniques: [
    { id: "phish-macro", stage: "initial", name: "Invoice email with a macro", attack: "T1566.001", detail: "A spoofed supplier invoice asks the reader to enable editing and content.", leadsTo: "macro-ps" },
    { id: "iso-lnk", stage: "initial", name: "ISO attachment with a shortcut", attack: "T1566.001", detail: "The same lure, packed in a disk image so macro rules never see it.", leadsTo: "lnk-exec" },
    { id: "aitm-phish", stage: "initial", name: "Adversary-in-the-middle sign-in page", attack: "T1557", detail: "A proxy sign-in page relays the password and the one-time code, then keeps the session cookie.", leadsTo: "interactive" },
    { id: "rdp-spray", stage: "initial", name: "Password spraying exposed RDP", attack: "T1110.003", detail: "A few common passwords tried against every account on an internet-facing remote desktop server.", leadsTo: "interactive" },
    { id: "vpn-exploit", stage: "initial", name: "Exploit an unpatched VPN appliance", attack: "T1190", detail: "A published vulnerability in the VPN gateway gives a shell on the edge device.", leadsTo: "interactive" },
    { id: "bought-creds", stage: "initial", name: "Sign in with bought credentials", attack: "T1078", detail: "A staff password from an infostealer log, bought on a market, used on the remote access portal.", leadsTo: "interactive" },
    { id: "macro-ps", stage: "execution", name: "Macro launches PowerShell", attack: "T1059.001", detail: "The macro starts a PowerShell download cradle that fetches the actor's tooling." },
    { id: "lnk-exec", stage: "execution", name: "Shortcut runs a script", attack: "T1204.002", detail: "Opening the shortcut runs a script from the mounted image." },
    { id: "interactive", stage: "execution", name: "Hands-on-keyboard session", attack: "T1021", detail: "The actor works interactively on the foothold, as the signed-in user." },
    { id: "lsass-dump", stage: "credential", name: "Dump LSASS memory", attack: "T1003.001", detail: "Reads cached credentials, including an admin who signed in to the machine earlier." },
    { id: "kerberoast", stage: "credential", name: "Kerberoast service accounts", attack: "T1558.003", detail: "Requests service tickets and cracks weak service-account passwords offline." },
    { id: "creds-in-files", stage: "credential", name: "Passwords in scripts and shares", attack: "T1552.001", detail: "Searches file shares for scripts and spreadsheets with stored passwords." },
    { id: "smb-exec", stage: "lateral", name: "Remote service execution over SMB", attack: "T1021.002", detail: "Uses admin credentials to start a service on each server." },
    { id: "rdp-lateral", stage: "lateral", name: "RDP to the servers", attack: "T1021.001", detail: "Remote desktop from a workstation straight to the file and database servers." },
    { id: "ransomware", stage: "impact", name: "Encrypt the file servers", attack: "T1486", detail: "Encrypts shares and deletes shadow copies.", damage: 3 },
    { id: "exfil-cloud", stage: "impact", name: "Upload customer records to cloud storage", attack: "T1567.002", detail: "Compresses the customer database export and uploads it over HTTPS.", damage: 3 },
  ],
  controls: [
    { id: "mfa", name: "MFA on email and remote access", short: "MFA", cost: 3, friction: 0, frictionNote: "Users approve a prompt; accepted as normal.", detail: "A password alone no longer signs anyone in from outside. A relay page that passes the code through still works.", effects: { "rdp-spray": "block", "bought-creds": "block" } },
    { id: "fido", name: "Phishing-resistant MFA (security keys)", short: "Keys", cost: 5, friction: 1, frictionNote: "Keys have to be issued, registered and replaced when lost.", detail: "The key checks the site it is talking to, so a relay page gets nothing it can replay.", effects: { "rdp-spray": "block", "bought-creds": "block", "aitm-phish": "block" } },
    { id: "macro", name: "Block macros in files from the internet", short: "No macros", cost: 2, friction: 1, frictionNote: "Finance's supplier templates have to be re-signed or moved to a trusted location.", detail: "Office refuses to run macros in documents marked as downloaded from the internet.", effects: { "phish-macro": "block" } },
    { id: "attach", name: "Block risky attachment types", short: "Attach filter", cost: 2, friction: 0, frictionNote: "Almost nobody sends disk images by email.", detail: "The mail gateway quarantines ISO, IMG, VHD and LNK attachments.", effects: { "iso-lnk": "block" } },
    { id: "patch", name: "Patch internet-facing systems within 72 hours", short: "Edge patching", cost: 3, friction: 1, frictionNote: "Emergency maintenance windows on the VPN, sometimes out of hours.", detail: "Published vulnerabilities on edge devices are closed before mass exploitation starts.", effects: { "vpn-exploit": "block" } },
    { id: "nordp", name: "Remove RDP from the internet", short: "No public RDP", cost: 2, friction: 1, frictionNote: "Contractors must connect through the VPN first.", detail: "The remote desktop server is only reachable from inside the VPN.", effects: { "rdp-spray": "block" } },
    { id: "edr", name: "EDR on every endpoint", short: "EDR", cost: 4, friction: 0, frictionNote: "Runs quietly; tuning is the security team's job.", detail: "Blocks known credential-theft behaviour and raises alerts on suspicious scripts and remote services. Alerts need someone to act on them.", effects: { "macro-ps": "detect", "lnk-exec": "detect", "lsass-dump": "block", "smb-exec": "detect", "ransomware": "detect" } },
    { id: "allow", name: "Application allowlisting", short: "Allowlisting", cost: 4, friction: 3, frictionNote: "Every new tool needs an exception; the IT backlog grows and people find workarounds.", detail: "Only approved programs and signed scripts run on workstations and servers.", effects: { "macro-ps": "block", "lnk-exec": "block", "smb-exec": "block" } },
    { id: "credguard", name: "Credential Guard and LSA protection", short: "Cred Guard", cost: 2, friction: 0, frictionNote: "Invisible to users on supported hardware.", detail: "Cached credentials are isolated from the operating system, so memory dumps find nothing useful.", effects: { "lsass-dump": "block" } },
    { id: "gmsa", name: "Managed service account passwords", short: "gMSA", cost: 2, friction: 0, frictionNote: "A migration task for IT, invisible to users.", detail: "Service accounts get long random passwords rotated automatically, so cracked tickets are useless.", effects: { kerberoast: "block" } },
    { id: "vault", name: "Move stored passwords into a secrets vault", short: "Vault", cost: 2, friction: 0, frictionNote: "Script owners update their scripts once.", detail: "Scripts fetch secrets at run time; shares are scanned and cleaned of stored passwords.", effects: { "creds-in-files": "block" } },
    { id: "segment", name: "Segment server admin ports", short: "Segmentation", cost: 3, friction: 1, frictionNote: "Admins have to work through a jump host.", detail: "Workstations cannot reach SMB admin shares or RDP on servers; only the jump host can.", effects: { "smb-exec": "block", "rdp-lateral": "block" } },
    { id: "egress", name: "Egress filtering and DLP for uploads", short: "Egress DLP", cost: 3, friction: 1, frictionNote: "Personal cloud storage is blocked for everyone.", detail: "Uploads to unsanctioned cloud storage are blocked and large exports are held for review.", effects: { "exfil-cloud": "block" } },
    { id: "backups", name: "Offline, immutable backups", short: "Backups", cost: 3, friction: 0, frictionNote: "Runs overnight; nobody notices until it is needed.", detail: "Backups the actor cannot reach or delete. Encryption still happens, but the business restores in a day instead of weeks.", effects: { ransomware: "recover" } },
    { id: "soc", name: "24×7 monitoring and response", short: "24×7 SOC", cost: 4, friction: 0, frictionNote: "A contract, not a change to anyone's day.", detail: "Analysts act on every alert around the clock. They also spot unusual interactive sign-ins. Without them, alerts wait until Monday.", responds: true, effects: { interactive: "detect", "rdp-lateral": "detect" } },
  ],
  waves: [
    {
      id: "monday",
      title: "Monday: the opportunists",
      brief: "Two crews are known to be targeting logistics firms this month. Both follow fixed playbooks. Their intel is complete: you can see every step they will take.",
      credits: 10,
      frictionAllowance: 2,
      campaigns: [
        { id: "a", name: "Invoice lure", actor: "Crew 1", intel: "Fake supplier invoices; ransomware within hours of a foothold.", initial: ["phish-macro"], credential: ["lsass-dump"], lateral: ["smb-exec"], impact: ["ransomware"], alt: { impact: ["exfil-cloud"] } },
        { id: "b", name: "Spray and pray", actor: "Crew 2", intel: "Sprays exposed remote desktop servers, then steals data quietly.", initial: ["rdp-spray"], credential: ["kerberoast"], lateral: ["rdp-lateral"], impact: ["exfil-cloud"], alt: { impact: ["ransomware"] } },
      ],
      reference: ["macro", "nordp", "credguard", "gmsa"],
    },
    {
      id: "wednesday",
      title: "Wednesday: they adapt",
      brief: "The crews saw what you did on Monday. Intel lists their first choice at each step, but they will switch to an alternative when a control blocks the first.",
      credits: 8,
      frictionAllowance: 4,
      campaigns: [
        { id: "c", name: "Invoice lure, reworked", actor: "Crew 1", intel: "Has a disk-image variant of the invoice ready if macros are blocked.", initial: ["phish-macro", "iso-lnk"], credential: ["lsass-dump"], lateral: ["smb-exec"], impact: ["exfil-cloud"] },
        { id: "d", name: "Session thief", actor: "Crew 2", intel: "Switches to a relay sign-in page when spraying stops working.", initial: ["rdp-spray", "aitm-phish"], credential: ["kerberoast"], lateral: ["rdp-lateral"], impact: ["ransomware"], alt: { initial: ["aitm-phish", "rdp-spray"] } },
        { id: "e", name: "Edge exploit", actor: "Crew 3 (new)", intel: "Mass-exploits a VPN vulnerability published last week.", initial: ["vpn-exploit"], credential: ["lsass-dump"], lateral: ["smb-exec"], impact: ["ransomware"], alt: { lateral: ["rdp-lateral"] } },
      ],
      reference: ["attach", "patch", "fido"],
    },
    {
      id: "friday",
      title: "Friday: the operator",
      brief: "A skilled operator has bought access to your sector. They try every option they have, in order, at every step. You cannot block every door, so make sure a single failure does not open the way through.",
      credits: 6,
      frictionAllowance: 5,
      campaigns: [
        { id: "f", name: "Operator: identity first", actor: "Operator", intel: "Prefers bought credentials and relay sign-in pages; falls back to email lures.", initial: ["bought-creds", "aitm-phish", "phish-macro", "iso-lnk"], credential: ["lsass-dump", "kerberoast", "creds-in-files"], lateral: ["smb-exec", "rdp-lateral"], impact: ["ransomware", "exfil-cloud"], alt: { initial: ["aitm-phish", "bought-creds", "iso-lnk", "phish-macro"], credential: ["creds-in-files", "kerberoast", "lsass-dump"] } },
        { id: "g", name: "Operator: edge first", actor: "Operator", intel: "Prefers edge devices and exposed services; steals data before anything noisy.", initial: ["vpn-exploit", "rdp-spray", "bought-creds"], credential: ["kerberoast", "creds-in-files", "lsass-dump"], lateral: ["rdp-lateral", "smb-exec"], impact: ["exfil-cloud", "ransomware"], alt: { lateral: ["smb-exec", "rdp-lateral"], impact: ["ransomware", "exfil-cloud"] } },
      ],
      reference: ["vault", "segment"],
    },
  ],
};
