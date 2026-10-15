// Pattern Patrol content: write a regular expression that flags the attack lines in a log
// excerpt and none of the benign look-alikes. A remix of RegExile (Project Ares games team):
// same skill, new twist (detection engineering: precision and recall). All log lines are
// fictional; addresses use documentation ranges. Pending SME review (docs/design/REMIXES.md).

export type Line = Readonly<{ text: string; bad: boolean; note?: string }>;

export type Level = Readonly<{
  id: string;
  title: string;
  goal: string;
  lesson: string;
  hint: string;
  example: string; // a reference pattern that passes (tested)
  lines: readonly Line[];
}>;

export const LEVELS: readonly Level[] = [
  {
    id: "failed",
    title: "Failed logins",
    goal: "Flag every failed SSH login. Successful ones are normal.",
    lesson: "Plain text is a pattern too. Start with the exact words that only the bad lines contain.",
    hint: "Every bad line contains the words “Failed password”.",
    example: "Failed password",
    lines: [
      { text: "sshd[811]: Failed password for alex from 198.51.100.7 port 51022", bad: true },
      { text: "sshd[811]: Accepted password for dana from 10.20.4.15 port 50231", bad: false },
      { text: "sshd[812]: Failed password for invalid user test from 198.51.100.7", bad: true },
      { text: "sshd[815]: Accepted publickey for deploy from 10.20.1.5", bad: false },
      { text: "sshd[819]: Failed password for dana from 10.20.4.15 port 50240", bad: true },
    ],
  },
  {
    id: "admins",
    title: "Privileged targets",
    goal: "Flag failed logins for root or admin only. Failures for ordinary users go to the help desk, not the SOC.",
    lesson: "Alternation with ( | ) narrows a broad match to the cases that matter, cutting alert noise.",
    hint: "Try “Failed password for (root|admin)\\b”. The \\b stops “admin” matching “administrator”.",
    example: "Failed password for (root|admin)\\b",
    lines: [
      { text: "sshd[901]: Failed password for root from 203.0.113.44", bad: true },
      { text: "sshd[902]: Failed password for alex from 10.20.4.22", bad: false },
      { text: "sshd[903]: Failed password for admin from 203.0.113.44", bad: true },
      { text: "sshd[904]: Accepted password for root from 10.20.1.5", bad: false },
      { text: "sshd[905]: Failed password for administrator-training from 10.20.4.9", bad: false, note: "Contains “admin” but is a training account." },
    ],
  },
  {
    id: "escape",
    title: "The attacker's address",
    goal: "Flag connections from 203.0.113.44 exactly. Watch the look-alikes.",
    lesson: "In a regex a dot means “any character”. Escape it as \\. when you mean a real dot, and use \\b so .44 doesn't also match .440.",
    hint: "Escape the dots: 203\\.0\\.113\\.44, and end with \\b.",
    example: "203\\.0\\.113\\.44\\b",
    lines: [
      { text: "fw ALLOW src=203.0.113.44 dst=10.20.2.20:443", bad: true },
      { text: "fw ALLOW src=203.0.113.4 dst=10.20.2.20:443", bad: false },
      { text: "fw ALLOW src=203a0b113c44 dst=10.20.2.20:443", bad: false, note: "Only matches if the dots are not escaped." },
      { text: "fw DENY src=203.0.113.44 dst=10.20.2.30:3389", bad: true },
      { text: "fw ALLOW src=203.0.113.440 dst=10.20.2.20:80", bad: false, note: "Not a real address, but logs get garbage too." },
    ],
  },
  {
    id: "encoded",
    title: "Encoded PowerShell",
    goal: "Flag PowerShell run with an encoded command (-enc or -EncodedCommand). Scripts run by file are normal admin work.",
    lesson: "Attackers hide commands in base64 with -EncodedCommand. A pattern on the switch, not the whole line, survives small variations.",
    hint: "Match powershell followed later by -enc, ignoring case: (?i)powershell.*-enc",
    example: "(?i)powershell.*-enc",
    lines: [
      { text: "proc: powershell.exe -NoP -W Hidden -enc SQBFAFgAIAAoAE4AZQB3AC0A", bad: true },
      { text: "proc: powershell.exe -File C:\\Scripts\\backup-report.ps1", bad: false },
      { text: "proc: POWERSHELL.EXE -EncodedCommand JABjAGwAaQBlAG4AdAAgAD0A", bad: true },
      { text: "proc: pwsh -Command Get-Service", bad: false },
      { text: "proc: powershell.exe -ExecutionPolicy Bypass -File update.ps1", bad: false },
    ],
  },
  {
    id: "night",
    title: "Off-hours sign-ins",
    goal: "Flag VPN sign-ins between 00:00 and 05:59. The depot night shift starts at 06:00.",
    lesson: "Character classes like [0-5] express ranges. Anchor them to the right field so they don't match digits elsewhere.",
    hint: "The hour comes straight after the date: \\dT0[0-5]: (a digit, then T, then the hour).",
    example: "\\dT0[0-5]:",
    lines: [
      { text: "2026-10-12T02:14:09Z vpn login ok user=j.alvarez", bad: true },
      { text: "2026-10-12T06:02:51Z vpn login ok user=p.osei", bad: false },
      { text: "2026-10-12T05:59:30Z vpn login ok user=k.tanaka", bad: true },
      { text: "2026-10-12T14:03:12Z vpn login ok user=j.alvarez session=T03:00", bad: false, note: "A T03: inside the session field, not the timestamp." },
      { text: "2026-10-12T00:00:01Z vpn login ok user=svc-backup", bad: true },
    ],
  },
  {
    id: "exfil",
    title: "Big uploads",
    goal: "Flag uploads of a gigabyte or more (bytes= with 10 or more digits).",
    lesson: "Quantifiers like {10,} count characters. Here the length of the number is the size threshold.",
    hint: "bytes=\\d{10,}",
    example: "bytes=\\d{10,}",
    lines: [
      { text: "proxy PUT https://files.example/upload bytes=2147483648 user=dana", bad: true },
      { text: "proxy PUT https://files.example/upload bytes=52428800 user=alex", bad: false },
      { text: "proxy PUT https://share.example/u bytes=1073741824 user=svc-backup", bad: true },
      { text: "proxy GET https://cdn.example/patch.msi bytes=987654321 user=it-01", bad: false },
    ],
  },
  {
    id: "cards",
    title: "Card numbers in the logs",
    goal: "Flag lines that leak a 16-digit card number (groups of four, with spaces, dashes or nothing). Order numbers have 12 digits.",
    lesson: "This is how DLP rules start. Repetition with {3} plus word boundaries keeps 12-digit order IDs out.",
    hint: "\\b(\\d{4}[ -]?){3}\\d{4}\\b",
    example: "\\b(\\d{4}[ -]?){3}\\d{4}\\b",
    lines: [
      { text: "checkout debug card=4111 1111 1111 1111 exp=12/28", bad: true },
      { text: "checkout order=771200345981 status=paid", bad: false },
      { text: "support ticket: customer read out 5500-0000-0000-0004", bad: true },
      { text: "checkout debug card=4012888888881881", bad: true },
      { text: "invoice ref=2026-0412-0099 amount=480.00", bad: false },
    ],
  },
  {
    id: "anchor",
    title: "Exactly that account",
    goal: "Flag lines where the user field is exactly svc-backup, the stolen service account. Similar names belong to other people.",
    lesson: "Anchors and boundaries (^, $, \\b) stop a match leaking into longer words: the difference between one alert and fifty.",
    hint: "user=svc-backup followed by a space or the end of the line: user=svc-backup(\\s|$)",
    example: "user=svc-backup(\\s|$)",
    lines: [
      { text: "smb open \\\\fs-02\\finance user=svc-backup host=WS-14", bad: true },
      { text: "smb open \\\\fs-02\\finance user=svc-backup2 host=BKP-01", bad: false },
      { text: "smb open \\\\fs-02\\hr user=svc-backup-old host=BKP-01", bad: false },
      { text: "rdp login user=svc-backup", bad: true },
      { text: "smb open \\\\bkp-01\\jobs user=svc-backupreader host=IT-03", bad: false },
    ],
  },
];
