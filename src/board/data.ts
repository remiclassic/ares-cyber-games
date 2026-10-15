// Confidence Board content: six categories, four questions each. A remix of Trivialoot
// (Project Ares games team): same six-category board, new twist (wager your confidence; the
// scoring rewards calibration). Original questions; pending SME review (docs/design/REMIXES.md).

export type Question = Readonly<{ value: number; prompt: string; options: readonly string[]; answer: number; explain: string }>;
export type Category = Readonly<{ id: string; name: string; questions: readonly Question[] }>;

export const CATEGORIES: readonly Category[] = [
  {
    id: "phish",
    name: "Phishing & people",
    questions: [
      { value: 100, prompt: "An email from “IT Support” says your mailbox is full and links to a sign-in page. What is the safest first move?", options: ["Click and sign in quickly before it locks", "Reply asking if it is real", "Report it with the report button, and check your mailbox through the usual app", "Forward it to colleagues to warn them"], answer: 2, explain: "Report it, and go to the service by your usual route. Replying goes to the sender, and forwarding spreads the link." },
      { value: 200, prompt: "What is “vishing”?", options: ["Phishing by voice call", "Phishing with a video file", "A virus that spreads by Wi-Fi", "Phishing with a QR code"], answer: 0, explain: "Voice phishing: a caller poses as IT, a bank or a manager to talk you into acting." },
      { value: 300, prompt: "A supplier emails new bank details for their next invoice. What should Accounts Payable do?", options: ["Update the details if the email passes DKIM", "Call the supplier on a phone number already on file", "Reply to the email to confirm", "Wait for a second email"], answer: 1, explain: "Verify out of band, on a number you already hold. A real but compromised mailbox passes every email check." },
      { value: 400, prompt: "An attacker follows an employee through a badge-only door. What is this called?", options: ["Shoulder surfing", "Pretexting", "Tailgating", "Baiting"], answer: 2, explain: "Tailgating (or piggybacking). Pretexting is the made-up story; baiting is the lure, like a dropped USB stick." },
    ],
  },
  {
    id: "auth",
    name: "Passwords & MFA",
    questions: [
      { value: 100, prompt: "Which password is strongest?", options: ["P@ssw0rd!", "Summer2026", "correct-harbour-lantern-violet", "Qx7!"], answer: 2, explain: "Length wins. A long, random passphrase beats a short password full of symbols that cracking tools already try." },
      { value: 200, prompt: "Why does reusing one password across sites matter?", options: ["Sites share passwords with each other", "A breach at one site lets attackers log in to the others", "It makes the password expire sooner", "It doesn't, if the password is strong"], answer: 1, explain: "Credential stuffing: leaked username and password pairs are tried automatically on other sites." },
      { value: 300, prompt: "Which MFA method resists a fake sign-in page that relays your codes?", options: ["SMS code", "Authenticator app code", "Push notification", "A FIDO2 security key or passkey"], answer: 3, explain: "Security keys and passkeys check the site's real domain, so a relay page gets nothing it can reuse. Codes can be typed into the fake page." },
      { value: 400, prompt: "You get MFA prompts you didn't start, again and again, late at night. What is likely happening?", options: ["An app update", "MFA fatigue: someone has your password and hopes you'll approve", "The authenticator app is broken", "IT is testing"], answer: 1, explain: "Push bombing. Deny the prompts, report it, and change the password: the attacker already has it." },
    ],
  },
  {
    id: "net",
    name: "Networks",
    questions: [
      { value: 100, prompt: "Which port does HTTPS use by default?", options: ["80", "443", "22", "8080"], answer: 1, explain: "443. Port 80 is cleartext HTTP; 22 is SSH." },
      { value: 200, prompt: "What does a firewall do with traffic that no rule matches, in a default-deny design?", options: ["Allows it", "Logs and allows it", "Blocks it", "Sends it to the DMZ"], answer: 2, explain: "Default deny: anything not explicitly allowed is blocked." },
      { value: 300, prompt: "Why put the guest Wi-Fi on its own network segment?", options: ["It makes it faster", "So unmanaged devices can't reach internal systems", "So guests can't use the internet", "Because Wi-Fi can't share a network with cables"], answer: 1, explain: "Segmentation limits what an untrusted or compromised device can reach." },
      { value: 400, prompt: "How many usable host addresses does a /26 subnet have?", options: ["64", "62", "30", "126"], answer: 1, explain: "6 host bits give 64 addresses, minus the network and broadcast addresses: 62." },
    ],
  },
  {
    id: "malware",
    name: "Malware & ransomware",
    questions: [
      { value: 100, prompt: "What does ransomware usually do?", options: ["Shows adverts", "Encrypts files and demands payment", "Slows the network", "Mines cryptocurrency"], answer: 1, explain: "It encrypts data and demands a ransom, and increasingly steals the data first too." },
      { value: 200, prompt: "Which backup survives ransomware best?", options: ["A copy on a mapped network drive", "A copy in the same cloud folder that syncs", "An offline or immutable copy", "A copy on the desktop"], answer: 2, explain: "Ransomware encrypts everything it can reach, including synced folders and mapped drives. Offline or immutable copies survive." },
      { value: 300, prompt: "A process dumps the memory of lsass.exe on a Windows machine. What is the attacker after?", options: ["Saved browser bookmarks", "Credentials cached on the machine", "The disk encryption key", "Licence keys"], answer: 1, explain: "LSASS holds credentials for signed-in users. Treat every account that used that machine as compromised." },
      { value: 400, prompt: "What is a “living off the land” attack?", options: ["Malware that only runs on farms", "Using built-in tools like PowerShell instead of custom malware", "An attack on agricultural systems", "Hiding malware in game mods"], answer: 1, explain: "Using the system's own trusted tools, which antivirus is less likely to flag." },
    ],
  },
  {
    id: "cloud",
    name: "Cloud & data",
    questions: [
      { value: 100, prompt: "In IaaS, who patches the operating system on your virtual machines?", options: ["The cloud provider", "You, the customer", "Nobody: it updates itself", "The hardware vendor"], answer: 1, explain: "Shared responsibility: the provider secures the hardware and hypervisor; you patch and secure what you run on it." },
      { value: 200, prompt: "An access key is accidentally committed to a public code repository. What first?", options: ["Delete the commit", "Make the repository private", "Deactivate and rotate the key", "Wait to see if it is used"], answer: 2, explain: "Bots scan public repositories within minutes. Deleting the commit doesn't revoke a key that has already been copied." },
      { value: 300, prompt: "What does “least privilege” mean?", options: ["Give admin rights only to managers", "Give each account only the access its task needs", "Remove all access after hours", "Use the fewest passwords possible"], answer: 1, explain: "Each identity gets the minimum it needs, which limits the damage when it is compromised." },
      { value: 400, prompt: "Encryption at rest protects data mainly against…", options: ["A stolen disk or snapshot", "A phished user who is logged in", "SQL injection", "A malicious insider with app access"], answer: 0, explain: "At-rest encryption protects stored media. A logged-in user or the application sees the data decrypted." },
    ],
  },
  {
    id: "ir",
    name: "Incident response",
    questions: [
      { value: 100, prompt: "You think you clicked a phishing link. What should you do?", options: ["Say nothing and hope", "Report it straight away", "Turn the laptop off and on again", "Delete the email"], answer: 1, explain: "Report fast. The security team can reset credentials and contain it, and early reports are never a nuisance." },
      { value: 200, prompt: "Which comes first in the usual incident response order?", options: ["Eradication", "Recovery", "Containment", "Lessons learned"], answer: 2, explain: "Detect and analyse, contain, eradicate, recover, then learn. Containment stops the spread before clean-up." },
      { value: 300, prompt: "Why might responders isolate a host rather than switch it off?", options: ["Switching off is slower", "To keep volatile evidence like memory", "Isolation deletes the malware", "Policy forbids switching off"], answer: 1, explain: "Network isolation stops the attacker while keeping memory and running processes for investigation." },
      { value: 400, prompt: "What is “dwell time”?", options: ["How long a patch takes to deploy", "How long an attacker is in the network before detection", "How long backups take", "The SOC's response time"], answer: 1, explain: "The time between initial compromise and detection. Shorter dwell time means less damage." },
    ],
  },
];

export const CONFIDENCE = [
  { id: "unsure", label: "Unsure", hint: "About 50/50", win: 0.5, lose: 0 },
  { id: "likely", label: "Likely", hint: "Leaning one way", win: 1, lose: 0.5 },
  { id: "sure", label: "Sure", hint: "Right about 3 in 4", win: 1.5, lose: 1.5 },
  { id: "certain", label: "Certain", hint: "Right 9 times in 10", win: 2, lose: 6 },
] as const;

export type ConfidenceId = (typeof CONFIDENCE)[number]["id"];
