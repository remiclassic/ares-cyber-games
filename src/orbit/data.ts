// Tactic Orbit content. A remix of Astro-Defense (Project Ares games team): same skill (ATT&CK
// tactics), new twist (tag each technique with its tactic to raise the right shield; techniques
// that serve several tactics accept any of them). Technique ids follow MITRE ATT&CK;
// descriptions are original. Pending SME review (docs/design/REMIXES.md).

export const TACTICS = [
  { id: "initial", name: "Initial Access", short: "Getting in" },
  { id: "execution", name: "Execution", short: "Running code" },
  { id: "persistence", name: "Persistence", short: "Staying in" },
  { id: "privesc", name: "Privilege Escalation", short: "Getting higher rights" },
  { id: "credential", name: "Credential Access", short: "Stealing logins" },
  { id: "discovery", name: "Discovery", short: "Looking around" },
  { id: "lateral", name: "Lateral Movement", short: "Moving to other systems" },
  { id: "exfil", name: "Exfiltration", short: "Taking data out" },
] as const;

export type TacticId = (typeof TACTICS)[number]["id"];

export type Technique = Readonly<{ id: string; attack: string; name: string; detail: string; tactics: readonly TacticId[]; why: string }>;

export const TECHNIQUES: readonly Technique[] = [
  { id: "phish-attach", attack: "T1566.001", name: "Spearphishing attachment", detail: "A tailored email carries a malicious document.", tactics: ["initial"], why: "It is how the attacker first gets a foothold: Initial Access." },
  { id: "public-app", attack: "T1190", name: "Exploit public-facing application", detail: "A flaw in an internet-facing server is used to get in.", tactics: ["initial"], why: "Breaking in through an exposed service is Initial Access." },
  { id: "powershell", attack: "T1059.001", name: "PowerShell", detail: "Commands and scripts run through PowerShell.", tactics: ["execution"], why: "Running the attacker's code: Execution." },
  { id: "user-exec", attack: "T1204.002", name: "User execution: malicious file", detail: "The victim opens a file that runs the payload.", tactics: ["execution"], why: "The user's click runs the code: Execution." },
  { id: "run-keys", attack: "T1547.001", name: "Registry run keys", detail: "A program is set to start every time a user logs on.", tactics: ["persistence", "privesc"], why: "Starting at every logon keeps access (Persistence). ATT&CK also lists it under Privilege Escalation when it runs with higher rights." },
  { id: "sched-task", attack: "T1053.005", name: "Scheduled task", detail: "A task is created to run the payload on a schedule.", tactics: ["persistence", "execution", "privesc"], why: "Scheduled tasks serve several tactics: they run code (Execution), survive reboots (Persistence), and can run as SYSTEM (Privilege Escalation)." },
  { id: "create-account", attack: "T1136", name: "Create account", detail: "A new local or domain account is added for later use.", tactics: ["persistence"], why: "A spare account is a way back in: Persistence." },
  { id: "priv-exploit", attack: "T1068", name: "Exploitation for privilege escalation", detail: "A local flaw is used to go from user to SYSTEM.", tactics: ["privesc"], why: "Going from ordinary user to administrator: Privilege Escalation." },
  { id: "uac-bypass", attack: "T1548.002", name: "Bypass User Account Control", detail: "Elevated rights are gained without the UAC prompt.", tactics: ["privesc"], why: "Gaining admin rights without the prompt: Privilege Escalation (ATT&CK also files it under Defense Evasion)." },
  { id: "lsass", attack: "T1003.001", name: "LSASS memory dumping", detail: "Cached credentials are read out of memory.", tactics: ["credential"], why: "Stealing passwords and hashes: Credential Access." },
  { id: "kerberoast", attack: "T1558.003", name: "Kerberoasting", detail: "Service tickets are requested and cracked offline.", tactics: ["credential"], why: "Cracking service-account passwords: Credential Access." },
  { id: "brute", attack: "T1110", name: "Brute force", detail: "Many passwords are tried until one works.", tactics: ["credential"], why: "Guessing passwords: Credential Access." },
  { id: "net-scan", attack: "T1046", name: "Network service discovery", detail: "Hosts are scanned for open ports and services.", tactics: ["discovery"], why: "Mapping what is out there: Discovery." },
  { id: "account-disc", attack: "T1087", name: "Account discovery", detail: "Domain users and admin groups are listed.", tactics: ["discovery"], why: "Learning who has which rights: Discovery." },
  { id: "rdp", attack: "T1021.001", name: "Remote Desktop Protocol", detail: "Stolen credentials are used to RDP into a server.", tactics: ["lateral"], why: "Hopping to another machine: Lateral Movement." },
  { id: "pth", attack: "T1550.002", name: "Pass the hash", detail: "A stolen hash authenticates without the password.", tactics: ["lateral"], why: "Using a hash to reach other systems: Lateral Movement (also Defense Evasion in ATT&CK)." },
  { id: "exfil-cloud", attack: "T1567.002", name: "Exfiltration to cloud storage", detail: "Data is uploaded to a file-sharing service.", tactics: ["exfil"], why: "Getting the data out: Exfiltration." },
  { id: "exfil-c2", attack: "T1041", name: "Exfiltration over C2 channel", detail: "Data leaves over the same channel used to control the implant.", tactics: ["exfil"], why: "Data leaving the network: Exfiltration." },
];

// Three waves of six. Each is ordered roughly like a real intrusion.
export const WAVES: readonly (readonly string[])[] = [
  ["phish-attach", "user-exec", "run-keys", "account-disc", "lsass", "rdp"],
  ["public-app", "powershell", "create-account", "priv-exploit", "net-scan", "exfil-cloud"],
  ["brute", "sched-task", "uac-bypass", "kerberoast", "pth", "exfil-c2"],
];
