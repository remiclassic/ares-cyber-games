import { at, type Incident } from "./engine";

// Breach Timeline content. Every organisation, person, domain and incident is fictional: each
// incident is a composite of common attack patterns, not a real case. Days: 0 = Mon … 6 = Sun,
// 7 = the following Mon. Content to be reviewed with SMEs (docs/design/BREACH_TIMELINE.md).

export const FICTION_NOTE = "Fictionalised composite of common attack patterns. Not a real organisation or case.";

export const INCIDENTS: readonly Incident[] = [
  {
    id: "payroll-portal",
    title: "The payroll portal",
    org: "Larkspur Supplies",
    brief: "Staff records were stolen and the managing director is being blackmailed. Rebuild what happened, then find where it could have been stopped first.",
    quick: false,
    guided: true,
    events: [
      { id: "pp1", short: "Phishing email", text: "An email titled “Payroll portal: confirm your details by 5 pm” reaches 30 staff. It comes from a real supplier's hijacked mailbox.", at: at(0, "08:52"), mask: "full", after: [], clue: "The lure: nothing happens to an account before it arrives." },
      { id: "pp2", short: "Password entered", text: "Dana in HR clicks the link and types her username and password into a fake payroll sign-in page.", at: at(0, "09:31"), mask: "none", after: [{ id: "pp1", why: "Dana can't click a link in an email she hasn't received yet." }], clue: "Needs the email first." },
      { id: "pp3", short: "Sign-in from abroad", text: "Dana's account signs in to the VPN and webmail from a country Larkspur has never operated in. Password only: no second factor was asked for.", at: at(0, "23:10"), mask: "full", after: [{ id: "pp2", why: "The attacker can't sign in with a password they haven't stolen yet." }], clue: "Needs a working password." },
      { id: "pp4", short: "Mailbox rule", text: "A new inbox rule moves any email containing “IT”, “password” or “security” out of Dana's inbox into an obscure folder.", at: at(0, "23:26"), mask: "hour", after: [{ id: "pp3", why: "Only someone signed in to Dana's mailbox can add a rule to it." }], clue: "Needs someone inside her mailbox." },
      { id: "pp5", short: "File server reached", text: "Over the VPN, using Dana's account, the attacker connects to the HR file server.", at: at(1, "01:15"), mask: "day", after: [{ id: "pp3", why: "The file server is internal: it needs the VPN session first." }], clue: "Needs a way into the network." },
      { id: "pp6", short: "Data staged", text: "Forty gigabytes of staff records are compressed into password-protected archives in a temporary folder on the file server.", at: at(1, "03:40"), mask: "none", after: [{ id: "pp5", why: "Files can't be zipped on a server the attacker hasn't reached." }], clue: "Needs the attacker on the file server." },
      { id: "pp7", short: "Data exfiltrated", text: "The archives are uploaded to a consumer cloud-storage account over several hours.", at: at(2, "02:05"), mask: "hour", after: [{ id: "pp6", why: "You can't upload archives that don't exist yet." }], clue: "Needs the archives to exist." },
      { id: "pp8", short: "Extortion email", text: "Larkspur's managing director receives an email: pay, or the staff records are published.", at: at(2, "06:40"), mask: "full", after: [{ id: "pp7", why: "The threat to publish only works once the attacker holds a copy." }], clue: "Needs the data in the attacker's hands." },
    ],
    controls: {
      mail: { stops: null, why: "The email came from a real supplier's hijacked mailbox, passed sender checks, and the fake page went live after delivery. The filter had nothing to flag." },
      mfa: { stops: "pp3", why: "A second factor stops the sign-in: the attacker has Dana's password but not her phone. Nothing after it happens." },
      geo: { stops: "pp3", why: "Larkspur only operates in one country, so blocking sign-ins from elsewhere stops the same step as MFA. (A local proxy would get round it; MFA would not.)" },
      edr: { stops: "pp6", why: "EDR on the file server spots the mass archiving and isolates the server. Late: the account, the mailbox rule and the server connection have already happened." },
      egress: { stops: "pp7", why: "The 40 GB upload is spotted and blocked. Very late: the account is taken over and the data is already packed and waiting." },
    },
    summary: {
      headline: "One password, three days, one blackmail email",
      body: "A convincing email from a trusted supplier's real mailbox led one HR employee to a fake payroll page. That night the attacker signed in from abroad with just the password, hid security warnings with an inbox rule, and spent the next day quietly packing staff records on the HR file server before uploading them and demanding payment.",
      lesson: "The sign-in was the first step any control could stop. MFA or geo-blocking there means no mailbox rule, no file-server visit and nothing to extort.",
    },
  },
  {
    id: "push-storm",
    title: "The push storm",
    org: "Corvid Engineering",
    brief: "Product source code turned up on a file-sharing site. The trail starts with an old password.",
    quick: false,
    events: [
      { id: "ps1", short: "Old password leaked", text: "A fitness app that Sam, an engineer, used years ago is breached. Sam's email and password appear on a leak site.", at: at(5, "14:00"), mask: "day", after: [], clue: "Where the attacker got the password." },
      { id: "ps2", short: "Password sprayed", text: "An automated tool tries leaked passwords against Corvid's VPN. Sam reused the old password at work, and it works.", at: at(7, "01:12"), mask: "hour", after: [{ id: "ps1", why: "The attacker can only try a password once it has leaked." }], clue: "Needs the leaked password." },
      { id: "ps3", short: "Push flood", text: "Sam's phone receives 22 sign-in approval requests in ten minutes.", at: at(7, "01:25"), mask: "none", after: [{ id: "ps2", why: "Approval requests are only sent after the correct password is entered." }], clue: "Needs the correct password to be entered." },
      { id: "ps4", short: "Push approved", text: "Half asleep, Sam taps Approve to make the alerts stop.", at: at(7, "01:47"), mask: "full", after: [{ id: "ps3", why: "Sam can only approve a request that has been sent." }], clue: "Needs a request to approve." },
      { id: "ps5", short: "VPN session", text: "A VPN session opens from a rented cloud server in Corvid's own country.", at: at(7, "01:48"), mask: "none", after: [{ id: "ps4", why: "The session only opens once the second factor is approved." }], clue: "Needs the second factor approved." },
      { id: "ps6", short: "Password dump", text: "On an internal jump server, the attacker runs a credential-dumping tool and recovers a domain admin password from memory.", at: at(7, "02:30"), mask: "hour", after: [{ id: "ps5", why: "The jump server is internal; reaching it needs the VPN session." }], clue: "Needs a way into the network." },
      { id: "ps7", short: "Build server access", text: "The domain admin account signs in to the build server that holds the product source code.", at: at(7, "03:05"), mask: "none", after: [{ id: "ps6", why: "The attacker only has the admin password after the dump." }], clue: "Needs the admin password." },
      { id: "ps8", short: "Source code uploaded", text: "Archives of the source code are uploaded to a file-sharing site.", at: at(7, "05:12"), mask: "full", after: [{ id: "ps7", why: "The code lives on the build server, so it can't leave before the attacker gets there." }], clue: "Needs the attacker on the build server." },
    ],
    controls: {
      mail: { stops: null, why: "No email anywhere in this attack: the password came from an old, unrelated breach. Mail filtering has nothing to stop." },
      mfa: { stops: null, why: "Corvid already had push MFA, and Sam approved the 22nd prompt. Plain push approval didn't stop it. Number matching or a phishing-resistant key might have." },
      geo: { stops: null, why: "The session came from a cloud server inside Corvid's own country, so a country block lets it straight through." },
      edr: { stops: "ps6", why: "EDR on the jump server blocks the credential-dumping tool and isolates the server. No admin password, no build server, no leak." },
      egress: { stops: "ps8", why: "The bulk upload is blocked, but by then a domain admin account is compromised. Better than nothing, and very late." },
    },
    summary: {
      headline: "A reused password and a tired thumb",
      body: "An engineer's password leaked from an old personal app and still worked on the company VPN. The attacker flooded the engineer's phone with approval prompts after midnight until one was accepted, connected from a server in the same country, dumped an admin password on an internal server and walked off with the source code.",
      lesson: "MFA and geo-blocking were the ‘big’ answers here, and both were beaten. The earliest control that still worked was EDR stopping the credential dump.",
    },
  },
  {
    id: "invoice-zip",
    title: "The invoice ZIP",
    org: "Fenwick Joinery",
    brief: "48,000 went to a stranger's bank account. Work back from the payment to the first step.",
    quick: false,
    events: [
      { id: "iz1", short: "Invoice email", text: "Accounts receive an email from fenwick-joinery-billing.example, one letter off a supplier's real domain, with a ZIP named Invoice_0423.", at: at(1, "10:05"), mask: "full", after: [], clue: "The lure: it starts here." },
      { id: "iz2", short: "Script runs", text: "Priya in accounts opens the ZIP and double-clicks the file inside. A hidden script runs.", at: at(1, "10:12"), mask: "none", after: [{ id: "iz1", why: "Priya can't open an attachment before it arrives." }], clue: "Needs the attachment." },
      { id: "iz3", short: "Beacon", text: "Priya's laptop starts contacting an unknown server every 60 seconds.", at: at(1, "10:13"), mask: "hour", after: [{ id: "iz2", why: "The laptop only phones home once the script has installed the beacon." }], clue: "Needs something installed on the laptop." },
      { id: "iz4", short: "Keylogger", text: "Through that channel a keylogger is installed. It records Priya's password for the bank's business portal.", at: at(1, "11:40"), mask: "hour", after: [{ id: "iz3", why: "The keylogger is delivered over the beacon's channel." }], clue: "Needs a channel to the attacker." },
      { id: "iz5", short: "Forwarding rule", text: "From Priya's laptop, a rule is added to her mailbox: copy every email containing “invoice” to an outside address.", at: at(1, "14:20"), mask: "full", after: [{ id: "iz3", why: "It is set up from her infected laptop, so it needs the attacker's foothold." }], clue: "Needs the attacker's foothold on the laptop." },
      { id: "iz6", short: "Bank portal sign-in", text: "Priya's bank portal account signs in from overseas, using the recorded password.", at: at(2, "09:02"), mask: "day", after: [{ id: "iz4", why: "The attacker only has the bank password after the keylogger records it." }], clue: "Needs the bank password." },
      { id: "iz7", short: "Payment sent", text: "A payment of 48,000 to a new payee is approved from Priya's bank portal account.", at: at(2, "09:30"), mask: "day", after: [{ id: "iz6", why: "A payment needs a signed-in bank session." }], clue: "Needs a signed-in bank session." },
    ],
    controls: {
      mail: { stops: "iz1", why: "A filter that quarantines look-alike domains and ZIPs holding scripts stops the email reaching Priya. Nothing after it happens." },
      mfa: { stops: "iz6", why: "MFA on the bank portal stops the overseas sign-in, so no payment. But the laptop and mailbox are already compromised." },
      geo: { stops: "iz6", why: "Blocking overseas sign-ins to the bank portal stops the same step as MFA: equally late." },
      edr: { stops: "iz2", why: "EDR blocks the script when it runs. Early, but one step after the mail filter could have stopped it." },
      egress: { stops: null, why: "Nothing large leaves: the beacon and keylogger send tiny amounts. Monitoring tuned for bulk transfers never fires." },
    },
    summary: {
      headline: "A one-letter domain and a ZIP file",
      body: "An invoice email from a domain one letter off a real supplier's carried a ZIP with a script inside. Opening it gave the attacker a foothold on an accounts laptop, a keylogger captured the bank portal password, and the next morning a payment went out from overseas while a mailbox rule copied invoice emails out.",
      lesson: "EDR would have stopped it, but the mail filter stops it one step sooner. Earliest beats strongest.",
    },
  },
  // ---------- short incidents for the 60-second mode ----------
  {
    id: "shared-doc",
    title: "The shared document",
    org: "Alder & Rowe Solicitors",
    brief: "A client sent a house deposit to criminals. Find the first step a control could stop.",
    quick: true,
    events: [
      { id: "sd1", short: "Share email", text: "An email from alder-rowe-docs.example, a domain registered yesterday: “A document has been shared with you”.", at: at(3, "16:02"), mask: "full", after: [], clue: "The lure: it starts here." },
      { id: "sd2", short: "Password typed", text: "Tom clicks through and types his password into a copy of the firm's sign-in page.", at: at(3, "16:05"), mask: "none", after: [{ id: "sd1", why: "Tom can't follow a link before the email arrives." }], clue: "Needs the email." },
      { id: "sd3", short: "Night sign-in", text: "Tom's account signs in to webmail from a country the firm has never worked in.", at: at(4, "00:20"), mask: "hour", after: [{ id: "sd2", why: "No stolen password, no sign-in." }], clue: "Needs Tom's password." },
      { id: "sd4", short: "Hiding rule", text: "A rule is created that deletes any reply mentioning “bank details”.", at: at(4, "00:31"), mask: "hour", after: [{ id: "sd3", why: "Only someone inside Tom's mailbox can add a rule to it." }], clue: "Needs someone inside the mailbox." },
      { id: "sd5", short: "Fake bank details", text: "From Tom's real mailbox, a client is told to send their house deposit to new bank details.", at: at(4, "09:15"), mask: "full", after: [{ id: "sd3", why: "It is sent from inside Tom's mailbox." }], clue: "Needs someone inside the mailbox." },
    ],
    controls: {
      mail: { stops: "sd1", why: "The sender's domain was registered the day before. Filtering newly registered domains quarantines the email before Tom sees it." },
      mfa: { stops: "sd3", why: "MFA stops the night sign-in: the attacker has the password but not Tom's phone. One step later than the mail filter." },
      geo: { stops: "sd3", why: "Blocking sign-ins from abroad stops the same step as MFA." },
      edr: { stops: null, why: "Nothing runs on Tom's computer: it all happens in the browser and the cloud mailbox." },
      egress: { stops: null, why: "No data leaves in bulk. One email to a client is all it takes." },
    },
    summary: {
      headline: "A day-old domain",
      body: "A ‘shared document’ email from a brand-new look-alike domain harvested a solicitor's password. The attacker signed in from abroad overnight, hid replies about bank details and emailed a client new payment instructions from the real mailbox.",
      lesson: "MFA would have worked, but the email itself was the first thing a control could catch.",
    },
  },
  {
    id: "contractor-laptop",
    title: "The contractor laptop",
    org: "Brightwater Studios",
    brief: "Unreleased film files leaked online. No one was phished. Find the first step a control could stop.",
    quick: true,
    events: [
      { id: "cl1", short: "Laptop infected", text: "A contractor installs cracked editing software on a personal laptop at home. It carries malware.", at: at(6, "20:00"), mask: "day", after: [], clue: "Where the malware comes from." },
      { id: "cl2", short: "Network scan", text: "The laptop joins the studio Wi-Fi and the malware scans for open file shares.", at: at(7, "08:40"), mask: "hour", after: [{ id: "cl1", why: "The malware has to be on the laptop before it can scan from it." }], clue: "Needs the malware on the laptop." },
      { id: "cl3", short: "Share infected", text: "The malware copies itself to the studio file server through a share anyone can write to.", at: at(7, "08:55"), mask: "none", after: [{ id: "cl2", why: "It has to find the open share first." }], clue: "Needs to find an open share." },
      { id: "cl4", short: "Files packed", text: "On the file server, unreleased film files are packed into one 7 GB archive.", at: at(7, "10:30"), mask: "none", after: [{ id: "cl3", why: "Packing happens on the file server, so the malware must be running there." }], clue: "Needs the malware on the server." },
      { id: "cl5", short: "Upload", text: "The archive is uploaded to an unknown hosting site.", at: at(7, "11:48"), mask: "full", after: [{ id: "cl4", why: "The archive must exist before it can be uploaded." }], clue: "Needs the archive." },
    ],
    controls: {
      mail: { stops: null, why: "No email: the malware arrived on a personal laptop." },
      mfa: { stops: null, why: "Nobody signs in: the malware uses an open share that needs no password." },
      geo: { stops: null, why: "Geo-blocking filters sign-ins from abroad. Nothing here signs in." },
      edr: { stops: "cl3", why: "The contractor's own laptop has no EDR, but EDR on the file server blocks the malware the moment it lands there." },
      egress: { stops: "cl5", why: "The 7 GB upload is blocked, so the files stay in. But the server is infected and needs cleaning up." },
    },
    summary: {
      headline: "Cracked software, open share",
      body: "A contractor's personal laptop picked up malware from cracked software at home. On the studio Wi-Fi it found a file share anyone could write to, infected the file server, packed unreleased footage and uploaded it.",
      lesson: "No sign-in, no email: identity controls don't help. EDR on the server stops it two steps before egress monitoring would.",
    },
  },
  {
    id: "midnight-approval",
    title: "The midnight approval",
    org: "Tamsin Bay Council",
    brief: "Three years of residents' casework left in one night. Find the first step a control could stop.",
    quick: true,
    events: [
      { id: "ma1", short: "Password leaked", text: "A shopping site is breached. Lee's email and password appear on a leak site.", at: at(4, "12:00"), mask: "day", after: [], clue: "Where the password comes from." },
      { id: "ma2", short: "Sign-in from abroad", text: "Lee's reused password is tried on council webmail from abroad, and it is correct.", at: at(5, "03:30"), mask: "none", after: [{ id: "ma1", why: "The attacker can only try a password once it has leaked." }], clue: "Needs the leaked password." },
      { id: "ma3", short: "Push approved", text: "After a flood of approval prompts, Lee taps Approve on one.", at: at(5, "03:41"), mask: "full", after: [{ id: "ma2", why: "Prompts are only sent after the right password is entered." }], clue: "Needs the right password entered first." },
      { id: "ma4", short: "Forwarding rule", text: "A rule forwards all of Lee's mail to an outside address.", at: at(5, "04:02"), mask: "hour", after: [{ id: "ma3", why: "The mailbox only opens once the prompt is approved." }], clue: "Needs the mailbox open." },
      { id: "ma5", short: "Mailbox exported", text: "Lee's whole mailbox, three years of residents' casework, is exported.", at: at(5, "05:10"), mask: "full", after: [{ id: "ma3", why: "The mailbox only opens once the prompt is approved." }], clue: "Needs the mailbox open." },
    ],
    controls: {
      mail: { stops: null, why: "No email: the password came from an old, unrelated breach." },
      mfa: { stops: null, why: "MFA was on. Lee approved a prompt, so push approval alone didn't stop it." },
      geo: { stops: "ma2", why: "The sign-in came from abroad and the council only operates locally. A country block stops it before a single prompt is sent." },
      edr: { stops: null, why: "No council device is involved: it all happens in the cloud mailbox." },
      egress: { stops: null, why: "The export goes cloud to cloud and never crosses the council's network, so egress monitoring never sees it." },
    },
    summary: {
      headline: "MFA on, mailbox gone",
      body: "A council officer's password leaked from a shopping site and still worked on webmail. The attacker signed in from abroad in the small hours, flooded the officer with prompts until one was approved, set up forwarding and exported the mailbox.",
      lesson: "MFA was in place and was beaten by prompt fatigue. Geo-blocking stops it a step earlier, before any prompt is sent.",
    },
  },
];

export const FULL_INCIDENTS = INCIDENTS.filter((incident) => !incident.quick);
export const QUICK_INCIDENTS = INCIDENTS.filter((incident) => incident.quick);
