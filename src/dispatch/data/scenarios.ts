import type { Scenario, ShiftDef } from "../sim/types";

// DRAFT CONTENT — PENDING SME REVIEW.
// Every person, company, address and event here is fictional. The response
// steps are placeholders for the organisation's approved playbook and have not
// been validated by a subject-matter expert. See docs/SME_REVIEW.md.

export const SME_NOTICE = "Scenario content pending SME review";
export const COURSE_MISSION = "Course mission (placeholder): turn every report into evidence-based, proportionate action that keeps people safe and working.";

const PRIYA = { id: "priya", name: "Priya Sharma", first: "Priya", dept: "marketing", deptLabel: "Marketing" } as const;
const DANIEL = { id: "daniel", name: "Daniel Brooks", first: "Daniel", dept: "product", deptLabel: "Product" } as const;
const ELENA = { id: "elena", name: "Elena Cruz", first: "Elena", dept: "finance", deptLabel: "Finance" } as const;

// ---------- Shift 1 (Monday): MFA is real, files are benign, invoice is medium ----------

const MFA_A: Scenario = {
  id: "mfa-a",
  family: "mfa",
  title: "Unexpected MFA prompt",
  tag: "Identity",
  reporter: PRIYA,
  opening: "Hi! I just got an MFA prompt but I'm not signing in right now. I'm at my desk. Is this legit?",
  truth: { priority: "high", needsAnalyst: true, summary: "Someone else has Priya's password and is trying to sign in." },
  facts: [
    { id: "not-approved", text: "Priya has not approved the prompt. It is still pending on her phone.", key: false },
    { id: "no-signin", text: "She is not signing in on any device or app right now.", key: true, justifies: ["high"] },
    { id: "location", text: "The prompt shows a Mail sign-in from Rotterdam. She is in the Lisbon office.", key: true, justifies: ["high"] },
    { id: "phish", text: "Yesterday she typed her password into a 'shared campaign brief' link.", key: true, justifies: ["high"] },
  ],
  questions: [
    { id: "q-approve", label: "Did you approve the sign-in?", reply: "No! I haven't touched it. It's still sitting there on my phone.", mood: "worried", fact: "not-approved" },
    { id: "q-active", label: "Is any device or app of yours signing in right now?", reply: "No. My laptop's been unlocked since 8:30 and nothing else is even switched on.", mood: "worried", fact: "no-signin" },
    { id: "q-details", label: "What does the prompt say? App, device, location?", reply: "It says 'Mail, sign-in from Rotterdam'. I am definitely not in Rotterdam.", mood: "alarmed", fact: "location" },
    { id: "q-password", label: "Have you typed your password anywhere unusual lately?", reply: "...Yesterday. A 'shared campaign brief' link asked me to sign in again, and I did. Oh no.", mood: "alarmed", fact: "phish", requires: "no-signin" },
    { id: "q-phone", label: "What kind of phone do you have?", reply: "A Pixel? Does that matter? The prompt is still on my screen.", mood: "annoyed" },
    { id: "q-manager", label: "Who is your manager?", reply: "Tomas. Should I be worried? Another prompt just popped up.", mood: "worried" },
  ],
  guidance: [
    { id: "g-deny", label: "Deny the prompt. Never approve one you didn't start.", quality: "correct", reply: "Denied. Okay. I'll deny anything else that shows up.", mood: "relieved" },
    { id: "g-approve", label: "Approve it so it clears, then carry on.", quality: "harmful", reply: "Okay... approved. Huh. My mail just signed me out.", mood: "alarmed", consequence: "Priya approved the sign-in. Someone else is now in her mailbox." },
    { id: "g-ignore", label: "Ignore it. It will time out.", quality: "weak", reply: "Okay... but they keep coming. It's hard to ignore.", mood: "worried", consequence: "The prompts kept arriving and Priya had no clear instruction." },
    { id: "g-restart", label: "Restart your phone and see if it stops.", quality: "weak", reply: "Restarted. There's a new prompt already.", mood: "annoyed", consequence: "Restarting did nothing about the sign-in attempts." },
  ],
  claims: [
    { id: "c-own", text: "Whether Priya started this sign-in herself", fact: "no-signin", why: "Only her answer about her own devices settles this. Without it, the prompt could be one of her apps." },
    { id: "c-pw", text: "Whether her password has been typed anywhere unusual", fact: "phish", why: "This is established only if you asked where she typed her password." },
    { id: "c-access", text: "Whether anyone else has got into her account", fact: null, why: "Nothing Priya can tell you shows this either way. An analyst has to check the sign-in logs." },
  ],
  harm: {
    afterMinutes: 8,
    headline: "Priya approved a prompt",
    text: "More prompts arrived. With no instruction, Priya tapped Approve to make them stop, and someone else signed in to her mailbox.",
  },
  analystMinutes: 12,
  outcomes: {
    clean: "{analyst} reset Priya's password and ended her sessions. The Rotterdam sign-in never succeeded.",
    recovered: "The account was open to someone else for a few minutes. {analyst} ended the session, reset the password and is reviewing what was read.",
    harmed: "Nobody reset the account. Phishing emails went out to Priya's contacts from her own address.",
    underhandled: "The prompt was denied, but Priya's password is still in someone else's hands and nobody is resetting it.",
    rightSized: "",
    overEscalated: "",
    unhandled: "Priya never got an answer. Her report was still waiting when the shift ended.",
  },
  lessons: {
    good: "A prompt nobody started means the password is already known. Denying it costs nothing and is safe whatever the cause, so it can come before the investigation is finished.",
    guidance: "Approving a prompt you did not start hands over the account. The only safe instruction is to deny it.",
    timing: "Repeated prompts wear people down. The safe step had to come early; the remaining questions could follow it.",
    route: "Denying the prompt stops this attempt, but the password is still exposed. Resetting it and ending sessions needs an analyst.",
    priority: "No sign-in of her own, an unfamiliar location and a password typed into a link all point to a live account takeover attempt: high.",
  },
  mission: "Immediate approved guidance and investigation can run side by side. Protect the person first, then build the evidence.",
};

const FILES_A: Scenario = {
  id: "files-a",
  family: "files",
  title: "Files will not open",
  tag: "Availability",
  reporter: DANIEL,
  opening: "None of my design files will open this morning. Is something going on with the network?",
  truth: { priority: "low", needsAnalyst: false, summary: "The shared drive was moved over the weekend. Nothing is wrong." },
  facts: [
    { id: "error", text: "The error is 'Location is not available'. File names and types look normal.", key: true, justifies: ["low"] },
    { id: "scope", text: "Only the old P: drive is affected. Files on his laptop open normally.", key: true, justifies: ["low"] },
    { id: "moved", text: "IT announced on Friday that the P: drive moved to the Projects site.", key: true, justifies: ["low"] },
    { id: "team", text: "A teammate sees the same error on the same drive.", key: false },
    { id: "no-install", text: "He has not installed or opened anything unusual.", key: false },
  ],
  questions: [
    { id: "q-error", label: "What happens when you try to open one?", reply: "It says 'Location is not available'. The names look normal, they just won't open.", mood: "worried", fact: "error" },
    { id: "q-scope", label: "Is it every file, or only files in one place?", reply: "Just the stuff on the old P: drive. Files on my desktop open fine.", mood: "neutral", fact: "scope" },
    { id: "q-change", label: "Did anything change before this started?", reply: "Oh. There was an email on Friday about the P: drive moving to the new Projects site. I... didn't read it.", mood: "relieved", fact: "moved", requires: "scope" },
    { id: "q-others", label: "Are teammates seeing the same thing?", reply: "Mei says hers is the same. Same drive.", mood: "neutral", fact: "team" },
    { id: "q-install", label: "Have you installed or opened anything unusual?", reply: "No. I got in, got coffee, opened my files. That's all.", mood: "neutral", fact: "no-install" },
    { id: "q-password", label: "When did you last change your password?", reply: "A month ago? I can sign in fine. It's the files.", mood: "annoyed" },
    { id: "q-size", label: "How large are the files?", reply: "Big? They're design files. They normally open fine.", mood: "annoyed" },
  ],
  guidance: [
    { id: "g-newpath", label: "Open them from the new Projects site. The link is in Friday's IT notice.", quality: "correct", reply: "...And there they are. Thanks. I'll read the next IT email, promise.", mood: "relieved" },
    { id: "g-disconnect", label: "Unplug from the network and stop working right away.", quality: "weak", reply: "Seriously? I have a review at ten. Fine. Unplugged.", mood: "annoyed", consequence: "Daniel sat disconnected and missed his review over a drive move." },
    { id: "g-tool", label: "Search online for a file repair tool and run it.", quality: "harmful", reply: "Found one called FixMyFiles Pro. Installing now...", mood: "worried", consequence: "Daniel installed unapproved software from the web on a work laptop." },
    { id: "g-wait", label: "Wait an hour and try again.", quality: "weak", reply: "An hour? Okay. I'll just sit here, then.", mood: "annoyed", consequence: "Daniel lost an hour waiting for something that was never going to change." },
  ],
  claims: [
    { id: "c-seen", text: "What Daniel sees when a file fails to open", fact: "error", why: "The exact error is what separates a missing location from damaged files. You have it only if you asked." },
    { id: "c-reach", text: "How far the problem reaches", fact: "scope", why: "You can state the scope only if you asked where the failing files live." },
    { id: "c-data", text: "Whether any data has left the company", fact: null, why: "Nothing points that way, but nobody has checked. An absence of signs is not a finding." },
  ],
  analystMinutes: 6,
  outcomes: {
    clean: "",
    recovered: "{analyst} removed the tool Daniel installed and pointed him to the new Projects site.",
    harmed: "Daniel is still running software nobody approved, and his files were never the problem.",
    underhandled: "",
    rightSized: "Daniel was working again two minutes later. No analyst time was used.",
    overEscalated: "{analyst} spent the time confirming a drive move that IT had announced on Friday.",
    unhandled: "Daniel gave up waiting and missed his review. His report was still open when the shift ended.",
  },
  lessons: {
    good: "A normal-looking error, one affected location and an announced change add up to a benign explanation. A clear next step closes it without using an analyst.",
    guidance: "Unapproved tools from the web create a new problem. Guidance has to come from the approved playbook.",
    timing: "",
    route: "Analysts are limited. Sending one to confirm an announced drive move leaves real incidents waiting.",
    priority: "A path error on one relocated drive, with normal file names, has little business impact: low.",
  },
  mission: "Not every report is an incident. Evidence is what lets you close one with confidence instead of escalating by reflex.",
};

const INVOICE_A: Scenario = {
  id: "invoice-a",
  family: "invoice",
  title: "Suspicious invoice",
  tag: "Payments",
  reporter: ELENA,
  opening: "I've got an urgent invoice from Northwind Supply with new bank details. Something feels off. Can you take a look?",
  truth: { priority: "medium", needsAnalyst: true, summary: "An impersonation attempt that has not yet cost anything." },
  facts: [
    { id: "domain", text: "Sender is northwind-supply.example. The vendor on file is northwindsupply.example.", key: true, justifies: ["medium"] },
    { id: "bank", text: "The email changes the bank account and demands payment before noon today.", key: true, justifies: ["medium"] },
    { id: "not-paid", text: "Nothing has been paid and the vendor record is unchanged.", key: true, justifies: ["medium"] },
    { id: "recipients", text: "The same email also went to the shared accounts-payable mailbox.", key: false },
    { id: "amount", text: "The invoice is for $18,400, a normal amount for this vendor.", key: false },
  ],
  questions: [
    { id: "q-sender", label: "What address did it come from?", reply: "billing@northwind-supply.example... wait. Our contact is at northwindsupply.example. No hyphen.", mood: "alarmed", fact: "domain" },
    { id: "q-change", label: "What exactly are they asking for?", reply: "Pay this invoice to a new account, 'effective immediately'. Today, before noon.", mood: "worried", fact: "bank" },
    { id: "q-paid", label: "Has anything been paid or changed yet?", reply: "No. I stopped when I saw the new account number. Nothing's been touched.", mood: "neutral", fact: "not-paid" },
    { id: "q-others", label: "Did anyone else in Finance get it?", reply: "Let me look... yes. It also went to the accounts-payable mailbox.", mood: "worried", fact: "recipients", requires: "domain" },
    { id: "q-amount", label: "How much is the invoice for?", reply: "$18,400. Honestly, that's normal for them.", mood: "neutral", fact: "amount" },
    { id: "q-browser", label: "Which browser do you read email in?", reply: "The usual one? I'm not sure how that helps.", mood: "annoyed" },
    { id: "q-print", label: "Did you print the invoice?", reply: "No... should I have?", mood: "annoyed" },
  ],
  guidance: [
    { id: "g-verify", label: "Don't pay or reply. Call Northwind on the number in our vendor record.", quality: "correct", reply: "Good. I'll hold it and ring the number we have on file.", mood: "relieved" },
    { id: "g-reply", label: "Reply to the email and ask them to confirm the new details.", quality: "harmful", reply: "They answered in two minutes with a signed letter. Looks official. I've queued the payment.", mood: "neutral", consequence: "The sender 'confirmed' their own request, and Elena queued the payment." },
    { id: "g-delete", label: "Delete the email and move on.", quality: "weak", reply: "Deleted. I hope nobody else acts on their copy.", mood: "worried", consequence: "The evidence is gone and the same email may be sitting in other inboxes." },
    { id: "g-holdall", label: "Stop every vendor payment for today.", quality: "weak", reply: "All of them? Payroll providers too? That is going to be noticed.", mood: "alarmed", consequence: "Legitimate vendors went unpaid over one suspicious email." },
  ],
  claims: [
    { id: "c-origin", text: "Where the request really came from", fact: "domain", why: "You can state this only after comparing the sender with the vendor on file." },
    { id: "c-changed", text: "Whether money or records have already changed", fact: "not-paid", why: "This decides the priority. It is established only if you asked." },
    { id: "c-vendor", text: "Whether the vendor's own mailbox was compromised", fact: null, why: "A lookalike domain suggests impersonation, not a breach at the vendor. Nothing here settles it either way." },
  ],
  harm: {
    afterMinutes: 16,
    headline: "Payment scheduled",
    text: "A colleague saw the same email in the accounts-payable mailbox and scheduled the payment to the new account.",
  },
  analystMinutes: 8,
  outcomes: {
    clean: "{analyst} blocked the lookalike domain and warned accounts payable. Northwind confirmed its bank details have not changed.",
    recovered: "{analyst} worked with Finance to recall the payment before the cut-off and blocked the lookalike domain.",
    harmed: "The payment went to the new account. Nobody was assigned to chase it.",
    underhandled: "Elena did not pay, but the lookalike domain is not blocked and the same email is still in other inboxes.",
    rightSized: "",
    overEscalated: "",
    unhandled: "Elena was left to decide alone. Her report was still waiting when the shift ended.",
  },
  lessons: {
    good: "Verifying through a contact you already hold defeats the impersonation, and a standard-priority handoff gets the domain blocked without pulling an analyst off something more urgent.",
    guidance: "Replying asks the sender to vouch for themselves. Verification has to use a contact you already hold.",
    timing: "Elena was careful, but the same email was in other inboxes. A clear 'do not pay, verify by phone' needed to reach Finance sooner.",
    route: "One careful person is not a control. Blocking the sender and warning the team needs an analyst.",
    priority: "A real fraud attempt, but nothing has been paid: medium. It would be high if money had already moved.",
  },
  mission: "Business impact sets the priority. The same email is medium before payment and high after it.",
};

// ---------- Shift 2 (Thursday): invoice first, MFA is benign, files are critical ----------

const INVOICE_B: Scenario = {
  id: "invoice-b",
  family: "invoice",
  title: "Bank details change request",
  tag: "Payments",
  reporter: ELENA,
  opening: "Quick one. Harbor Freight Lines emailed asking us to update their bank account before Friday's payment run. Can I just do it?",
  truth: { priority: "medium", needsAnalyst: true, summary: "An impersonation attempt. The record was changed but no payment has run." },
  facts: [
    { id: "replyto", text: "The reply-to address is a free webmail account, not Harbor Freight's domain.", key: true, justifies: ["medium"] },
    { id: "no-phone", text: "The email asks for a new bank and says to confirm 'by email only'.", key: true, justifies: ["medium"] },
    { id: "record", text: "Elena already entered the new account. The next payment run is Friday.", key: true, justifies: ["medium"] },
    { id: "amount", text: "Friday's run includes $42,000 for this vendor.", key: false },
  ],
  questions: [
    { id: "q-sender", label: "How did the request arrive?", reply: "As a reply in an old thread with their rep, Marcus. Although... the reply-to is a free webmail address.", mood: "worried", fact: "replyto" },
    { id: "q-change", label: "What exactly are they asking for?", reply: "New bank, new country, and 'please confirm by email only, our phone lines are down'.", mood: "worried", fact: "no-phone" },
    { id: "q-paid", label: "Has anything been paid or changed yet?", reply: "I... entered the new account ten minutes ago. Nothing goes out until Friday's run, though.", mood: "alarmed", fact: "record" },
    { id: "q-amount", label: "How much is due to them on Friday?", reply: "$42,000.", mood: "worried", fact: "amount", requires: "record" },
    { id: "q-browser", label: "Which browser do you read email in?", reply: "The usual one? I'm not sure how that helps.", mood: "annoyed" },
    { id: "q-timezone", label: "What time zone is Marcus in?", reply: "No idea. Does it matter?", mood: "annoyed" },
  ],
  guidance: [
    { id: "g-verify", label: "Put the old account back, then call Harbor Freight on the number we have on file.", quality: "correct", reply: "Reverting it now. I'll call their office number from the vendor record.", mood: "relieved" },
    { id: "g-reply", label: "Email Marcus back and ask him to confirm.", quality: "harmful", reply: "He replied straight away: 'Confirmed, thank you!' I've left the new account in and approved the batch early.", mood: "neutral", consequence: "The sender confirmed their own request, and Friday's batch was approved with the new account." },
    { id: "g-leave", label: "Leave it for now. Friday is days away.", quality: "weak", reply: "Okay. I'll leave the new details in for now.", mood: "neutral", consequence: "The fraudulent account stayed in the vendor record." },
    { id: "g-cancel", label: "Cancel Friday's whole payment run.", quality: "weak", reply: "The whole run? Forty vendors? That needs the CFO.", mood: "alarmed", consequence: "Forty legitimate payments were put at risk over one vendor record." },
  ],
  claims: [
    { id: "c-origin", text: "Where the request really came from", fact: "replyto", why: "You can state this only if you asked how the request arrived." },
    { id: "c-changed", text: "Whether money or records have already changed", fact: "record", why: "This changes what the analyst must do first. It is established only if you asked." },
    { id: "c-vendor", text: "Whether the vendor's own mailbox was compromised", fact: null, why: "The old thread makes it possible, but nothing Elena can see confirms it. It stays an open question for the analyst." },
  ],
  harm: {
    afterMinutes: 16,
    headline: "Batch approved early",
    text: "Finance approved Friday's batch ahead of schedule with the new account still in the vendor record.",
  },
  analystMinutes: 8,
  outcomes: {
    clean: "{analyst} confirmed the record was restored and told Harbor Freight their thread may be exposed. Friday's run is safe.",
    recovered: "{analyst} pulled the vendor's line from the approved batch before release and restored the record.",
    harmed: "Friday's run paid $42,000 to the new account. Nobody was assigned to stop it.",
    underhandled: "The record was put back, but nobody is checking how the attacker got into an existing thread.",
    rightSized: "",
    overEscalated: "",
    unhandled: "Elena was left to decide alone. Her report was still waiting when the shift ended.",
  },
  lessons: {
    good: "Restoring the record and verifying by phone removes the risk straight away. The analyst can then look at how the thread was hijacked, at standard priority.",
    guidance: "Asking the sender to confirm proves nothing. Verification has to use the number already on file.",
    timing: "A changed vendor record is a loaded trap. It needed reverting before the batch was prepared.",
    route: "Fixing the record is not the end. Someone has to find out how an existing thread was used.",
    priority: "The record changed but no payment runs until Friday: medium. New information that money had moved would make it high.",
  },
  mission: "New information can change a priority. Asking 'has anything changed yet?' is what told you how urgent this was.",
};

const MFA_B: Scenario = {
  id: "mfa-b",
  family: "mfa",
  title: "Unexpected MFA prompt",
  tag: "Identity",
  reporter: PRIYA,
  opening: "Hi, I just got an MFA prompt and I'm not signing in to anything. I'm at my desk. Is this legit?",
  truth: { priority: "low", needsAnalyst: false, summary: "Her own tablet is retrying an old password." },
  facts: [
    { id: "not-approved", text: "Priya has not approved the prompt. It is still pending on her phone.", key: false },
    { id: "own-device", text: "The prompt names her own tablet at the Lisbon office.", key: true, justifies: ["low"] },
    { id: "pw-change", text: "She changed her password this morning. The tablet's mail app still has the old one.", key: true, justifies: ["low"] },
    { id: "no-phish", text: "She has only typed her password on the normal sign-in page.", key: false },
  ],
  questions: [
    { id: "q-approve", label: "Did you approve the sign-in?", reply: "No, I left it alone. It's still on my phone.", mood: "worried", fact: "not-approved" },
    { id: "q-active", label: "Is any device or app of yours signing in right now?", reply: "My tablet's in my bag... I did change my password this morning. The mail app on it still has the old one. Oh.", mood: "relieved", fact: "pw-change" },
    { id: "q-details", label: "What does the prompt say? App, device, location?", reply: "'Mail on Priya's Tab, Lisbon office.' That's... my tablet.", mood: "neutral", fact: "own-device" },
    { id: "q-password", label: "Have you typed your password anywhere unusual lately?", reply: "No. Only on the normal sign-in page when I changed it.", mood: "neutral", fact: "no-phish" },
    { id: "q-phone", label: "What kind of phone do you have?", reply: "A Pixel? Does that matter?", mood: "annoyed" },
    { id: "q-manager", label: "Who is your manager?", reply: "Tomas. Is this serious enough for that?", mood: "worried" },
  ],
  guidance: [
    { id: "g-deny", label: "Deny this prompt, then update the password on your tablet's mail app.", quality: "correct", reply: "Denied... updated... and the prompts have stopped. That was it!", mood: "relieved" },
    { id: "g-share", label: "Reset your password again and send me the new one so I can test it.", quality: "harmful", reply: "Okay, sending it in chat now.", mood: "neutral", consequence: "Priya sent her new password over chat. It now has to be treated as exposed." },
    { id: "g-ignore", label: "Ignore it. It will time out.", quality: "weak", reply: "Okay... but they keep coming every few minutes.", mood: "annoyed", consequence: "The tablet kept retrying and the prompts kept coming." },
    { id: "g-shutdown", label: "Shut down your laptop and tablet until an analyst arrives.", quality: "weak", reply: "Everything? I have a launch email going out at ten.", mood: "alarmed", consequence: "Priya stopped work over a tablet with an old password." },
  ],
  claims: [
    { id: "c-own", text: "Whether Priya started this sign-in herself", fact: "pw-change", why: "Her answer about her own devices is what explains the prompt. You have it only if you asked." },
    { id: "c-pw", text: "Whether her password has been typed anywhere unusual", fact: "no-phish", why: "This is established only if you asked. If you did not, it is still an open question, and saying so is the honest handoff." },
    { id: "c-access", text: "Whether anyone else has got into her account", fact: null, why: "The evidence explains this prompt. It cannot prove that nobody else has been in." },
  ],
  analystMinutes: 6,
  outcomes: {
    clean: "",
    recovered: "{analyst} had Priya set a fresh password privately and confirmed the tablet was the cause.",
    harmed: "Priya's new password is sitting in a chat log and nobody has had her change it.",
    underhandled: "",
    rightSized: "The prompts stopped as soon as the tablet had the new password. No analyst time was used.",
    overEscalated: "{analyst} spent the time confirming that Priya's own tablet had an old password.",
    unhandled: "Priya never got an answer. Her report was still waiting when the shift ended.",
  },
  lessons: {
    good: "Her own device, her own office and a password change this morning explain the prompt. Denying it is still the right habit, and no analyst is needed.",
    guidance: "Nobody on a help desk should ever ask for a password. Sharing one creates the incident you were trying to rule out.",
    timing: "",
    route: "Analysts are limited. Sending one to a tablet with an old password leaves real incidents waiting.",
    priority: "The prompt is explained by her own tablet and a password change: low.",
  },
  mission: "The same report can be an attack or a non-event. Only the answers tell you which, so the label has to wait for the evidence.",
};

const FILES_B: Scenario = {
  id: "files-b",
  family: "files",
  title: "Files will not open",
  tag: "Availability",
  reporter: DANIEL,
  opening: "My design files won't open this morning and some of them look odd. Is this a known issue?",
  truth: { priority: "high", needsAnalyst: true, summary: "Ransomware is encrypting his laptop and the shared drive." },
  facts: [
    { id: "renamed", text: "File names now end in '.locked' and every folder has a READ_ME_NOW.txt.", key: true, justifies: ["high"] },
    { id: "spreading", text: "His laptop and the shared Product drive are both affected, and more files are changing.", key: true, justifies: ["high"] },
    { id: "installer", text: "About 20 minutes ago he ran a 'font pack installer' sent by a freelancer.", key: true, justifies: ["high"] },
    { id: "team", text: "A teammate sees the same on the shared drive.", key: false },
  ],
  questions: [
    { id: "q-error", label: "What happens when you try to open one?", reply: "The names all end in '.locked' now. And there's a new file in every folder: READ_ME_NOW.txt.", mood: "alarmed", fact: "renamed" },
    { id: "q-scope", label: "Is it every file, or only files in one place?", reply: "My laptop AND the shared Product drive. More of them are changing while I look.", mood: "alarmed", fact: "spreading" },
    { id: "q-change", label: "Did anything change before this started?", reply: "A freelancer sent me a 'font pack installer'. I ran it maybe twenty minutes ago.", mood: "worried", fact: "installer" },
    { id: "q-others", label: "Are teammates seeing the same thing?", reply: "Mei says the shared drive looks wrong for her too.", mood: "worried", fact: "team" },
    { id: "q-password", label: "When did you last change your password?", reply: "A month ago? Look, more files just changed.", mood: "annoyed" },
    { id: "q-size", label: "How large are the files?", reply: "Does it matter? They're all locked!", mood: "annoyed" },
  ],
  guidance: [
    { id: "g-disconnect", label: "Turn off Wi-Fi and unplug the network cable now. Leave the laptop switched on.", quality: "correct", reply: "Cable out, Wi-Fi off. It's still on. I'm not touching anything else.", mood: "relieved" },
    { id: "g-backup", label: "Copy whatever still opens to the shared drive as a backup.", quality: "harmful", reply: "Copying now... the copies are turning into .locked too.", mood: "alarmed", consequence: "The copy kept the laptop connected and the encryption spread further across the shared drive." },
    { id: "g-restart", label: "Restart the laptop and see if it clears.", quality: "weak", reply: "It's back up. More files are locked than before.", mood: "alarmed", consequence: "The restart changed nothing and the laptop stayed on the network." },
    { id: "g-wait", label: "Leave it with me while I look into it.", quality: "weak", reply: "Okay. I'll just watch it happen, I suppose.", mood: "worried", consequence: "The laptop stayed on the network while files kept changing." },
  ],
  claims: [
    { id: "c-seen", text: "What Daniel sees when a file fails to open", fact: "renamed", why: "Renamed files and a note are the core evidence. You have it only if you asked what he sees." },
    { id: "c-reach", text: "How far the problem reaches", fact: "spreading", why: "This sets the scale of the response. It is established only if you asked about scope." },
    { id: "c-data", text: "Whether any data has left the company", fact: null, why: "Daniel cannot know this. It stays unresolved until an analyst checks." },
  ],
  harm: {
    afterMinutes: 8,
    headline: "Encryption reached Finance",
    text: "Daniel's laptop stayed on the network. The encryption followed a mapped drive into the Finance share.",
    depts: ["product", "finance"],
  },
  analystMinutes: 14,
  outcomes: {
    clean: "{analyst} isolated the laptop and the Product share. The damage stopped at one drive, and restore from backup has started.",
    recovered: "The encryption reached a second share before it was contained. {analyst} isolated both and restore from backup has started.",
    harmed: "Nobody was assigned. Two departments lost their shared files for the day.",
    underhandled: "The laptop is off the network, but the shared drive is still encrypted and nobody is containing it.",
    rightSized: "",
    overEscalated: "",
    unhandled: "Daniel was left watching his files lock. His report was still waiting when the shift ended.",
  },
  lessons: {
    good: "Renamed files and a note are enough to act on. Disconnecting stops the spread, and leaving the laptop on keeps evidence for the analyst. The rest of the questions could follow.",
    guidance: "Anything that keeps the laptop connected lets the encryption spread. The first step is to disconnect.",
    timing: "This report could not wait in the queue. One question was enough to see it needed a safe step straight away.",
    route: "Disconnecting one laptop does not contain a shared drive. This needs an analyst at high priority.",
    priority: "Active encryption on a shared drive stops a whole team working: high.",
  },
  mission: "The same opening line was harmless on another day. Asking one good question is what separates a drive move from an emergency.",
};

export const SHIFTS: readonly ShiftDef[] = [
  {
    id: "shift-1",
    label: "Shift 1",
    day: "Mon",
    startMinutes: 9 * 60 + 14,
    length: 45,
    arrivals: [
      { caseId: "mfa-a", at: 0 },
      { caseId: "files-a", at: 5 },
      { caseId: "invoice-a", at: 11 },
    ],
    analysts: [
      { id: "alex", name: "Alex", busyUntil: 9 },
      { id: "jamie", name: "Jamie", busyUntil: 0 },
    ],
    scenarios: [MFA_A, FILES_A, INVOICE_A],
  },
  {
    id: "shift-2",
    label: "Shift 2",
    day: "Thu",
    startMinutes: 13 * 60 + 2,
    length: 45,
    arrivals: [
      { caseId: "invoice-b", at: 0 },
      { caseId: "mfa-b", at: 5 },
      { caseId: "files-b", at: 11 },
    ],
    analysts: [
      { id: "alex", name: "Alex", busyUntil: 0 },
      { id: "jamie", name: "Jamie", busyUntil: 12 },
    ],
    scenarios: [INVOICE_B, MFA_B, FILES_B],
  },
];

export function shiftById(id: string): ShiftDef {
  const found = SHIFTS.find((s) => s.id === id);
  if (!found) throw new Error(`no shift ${id}`);
  return found;
}
