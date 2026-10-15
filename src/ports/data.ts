// Port Authority content. A remix of Portflow (Project Ares games team): same skill (ports
// and protocols), new twist (apply a harbour policy, and upgrade cleartext protocols to their
// secure versions). Fictional; pending SME review (docs/design/REMIXES.md).

export type Service = Readonly<{ id: string; name: string; port: number; secure?: string; note: string }>;

export const SERVICES: readonly Service[] = [
  { id: "ftp", name: "FTP", port: 21, secure: "sftp", note: "File transfer; sends the password in cleartext." },
  { id: "ssh", name: "SSH", port: 22, note: "Encrypted remote shell (and SFTP file transfer)." },
  { id: "sftp", name: "SFTP", port: 22, note: "File transfer over SSH: encrypted." },
  { id: "telnet", name: "Telnet", port: 23, secure: "ssh", note: "Remote shell with everything, password included, in cleartext." },
  { id: "smtp", name: "SMTP", port: 25, note: "Mail delivery between mail servers." },
  { id: "dns", name: "DNS", port: 53, note: "Name lookups." },
  { id: "http", name: "HTTP", port: 80, secure: "https", note: "Web traffic in cleartext." },
  { id: "pop3", name: "POP3", port: 110, secure: "pop3s", note: "Mail download in cleartext." },
  { id: "snmp", name: "SNMP", port: 161, note: "Device monitoring; older versions use a shared community string." },
  { id: "ldap", name: "LDAP", port: 389, secure: "ldaps", note: "Directory lookups; binds can expose credentials in cleartext." },
  { id: "https", name: "HTTPS", port: 443, note: "Web traffic over TLS." },
  { id: "smb", name: "SMB", port: 445, note: "Windows file sharing; a favourite for lateral movement and ransomware." },
  { id: "ldaps", name: "LDAPS", port: 636, note: "LDAP over TLS." },
  { id: "pop3s", name: "POP3S", port: 995, note: "POP3 over TLS." },
  { id: "mysql", name: "MySQL", port: 3306, note: "Database connections." },
  { id: "rdp", name: "RDP", port: 3389, note: "Remote desktop; a top ransomware entry point when exposed." },
];

export const POLICY: readonly string[] = [
  "From the internet, only HTTPS to the web server and SMTP to the mail gateway.",
  "Admin access (SSH, RDP) only arrives through the VPN.",
  "No cleartext protocols: Telnet, FTP, HTTP, POP3 and LDAP get upgraded to their secure versions.",
  "Inside: DNS to the resolver, SMB from the office to the file server, databases only from the app server.",
];

export type Action = "allow" | "block" | "upgrade";

export type Ship = Readonly<{
  id: string;
  port: number;
  service: string;
  from: "Internet" | "Office" | "VPN" | "App server";
  to: string;
  action: Action;
  why: string;
}>;

export const ROUNDS: readonly (readonly Ship[])[] = [
  [
    { id: "s1", port: 443, service: "https", from: "Internet", to: "web server", action: "allow", why: "HTTPS from the internet to the web server is the one inbound web flow the policy allows." },
    { id: "s2", port: 23, service: "telnet", from: "Office", to: "core switch", action: "upgrade", why: "Telnet sends the admin password in cleartext. Manage the switch over SSH instead." },
    { id: "s3", port: 3389, service: "rdp", from: "Internet", to: "file server", action: "block", why: "RDP exposed to the internet is a top ransomware entry point. Admin access only comes through the VPN." },
    { id: "s4", port: 25, service: "smtp", from: "Internet", to: "mail gateway", action: "allow", why: "Other mail servers deliver to the mail gateway on SMTP: allowed by policy." },
    { id: "s5", port: 21, service: "ftp", from: "Office", to: "partner file drop", action: "upgrade", why: "FTP sends credentials and files in cleartext. SFTP does the same job encrypted." },
  ],
  [
    { id: "s6", port: 445, service: "smb", from: "Internet", to: "file server", action: "block", why: "SMB never crosses the internet edge; exposed SMB is how worms like WannaCry spread." },
    { id: "s7", port: 22, service: "ssh", from: "VPN", to: "jump host", action: "allow", why: "Encrypted admin access, arriving through the VPN to the jump host: exactly the policy." },
    { id: "s8", port: 80, service: "http", from: "Office", to: "intranet", action: "upgrade", why: "Even inside, cleartext HTTP exposes session cookies on the network. Serve the intranet on HTTPS." },
    { id: "s9", port: 53, service: "dns", from: "Office", to: "DNS resolver", action: "allow", why: "Office machines look names up with the internal resolver: allowed." },
    { id: "s10", port: 3306, service: "mysql", from: "Internet", to: "orders database", action: "block", why: "Databases only take connections from the app server, never straight from the internet." },
  ],
  [
    { id: "s11", port: 389, service: "ldap", from: "Office", to: "domain controller", action: "upgrade", why: "LDAP simple binds can carry passwords in cleartext. Use LDAPS (636)." },
    { id: "s12", port: 161, service: "snmp", from: "Internet", to: "edge router", action: "block", why: "SNMP from the internet leaks device details and is often still on a default community string." },
    { id: "s13", port: 3306, service: "mysql", from: "App server", to: "orders database", action: "allow", why: "The app server is the one thing allowed to talk to the database." },
    { id: "s14", port: 110, service: "pop3", from: "Office", to: "mail server", action: "upgrade", why: "POP3 sends the mailbox password in cleartext. POP3S (995) wraps it in TLS." },
    { id: "s15", port: 3389, service: "rdp", from: "VPN", to: "jump host", action: "allow", why: "RDP is acceptable when it arrives through the VPN to the jump host." },
  ],
];

export function service(id: string): Service {
  const found = SERVICES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown service ${id}`);
  return found;
}
