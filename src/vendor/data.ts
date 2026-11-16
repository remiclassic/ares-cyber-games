import type { Fact, FollowUp, Purchase, Section } from "./engine";

// Three purchases at Wrenfield Mutual (fictional). Every supplier is invented and uses a
// `.example` domain; audits and certificates are generic ("independent audit report", "security
// certificate") and name no real scheme or body. Content to be reviewed with SMEs
// (docs/design/VENDOR_VETTING.md).

export const ORG = "Wrenfield Mutual";
export const TODAY = "November 2026";

const f = (id: string, section: Section, text: string, key = false): Fact => ({ id, section, text, key });
const q = (id: string, question: string, answer: string, key = false): FollowUp => ({ id, question, answer, key });

const payroll: Purchase = {
  id: "payroll",
  title: "Payroll service",
  need: "Finance wants to replace the payroll spreadsheet with an online payroll service before the January pay run.",
  data: "Names, home addresses, bank details, salaries and tax identifiers for all 240 staff.",
  access: "The supplier hosts the data. HR and Finance admins sign in over the internet.",
  tier: "high",
  tierWhy: "High: sensitive personal and financial data about every employee leaves the building.",
  hints: "full",
  questions: 3,
  unmet: [
    ["Month 1", "No supplier is signed. Finance runs the January payroll on the old spreadsheet."],
    ["Month 4", "The spreadsheet, with every bank detail in it, is emailed to the wrong distribution list."],
    ["Month 12", "The business need is still unmet, and the data was less safe than it would have been with a vetted supplier."],
  ],
  suppliers: [
    {
      id: "paynimbus",
      name: "PayNimbus",
      domain: "paynimbus.example",
      price: 14000,
      badge: null,
      trap: "unverifiable",
      coach: "Every answer here is good news. Ask of each line: could anyone outside PayNimbus check this?",
      facts: [
        f("access", "access", "Hosts all payroll data. Support staff can open any customer's records 'to help quickly'.", true),
        f("answers", "questionnaire", "All 42 answers are 'Yes'. No documents attached. Signed by the sales lead.", true),
        f("audit", "audit", "None. 'Certification in progress', with no date given.", true),
        f("breach", "breach", "'We have never had a security incident.' The company began trading 14 months ago."),
        f("subs", "subs", "'Trusted partners' handle hosting and support. They are not named."),
        f("contract", "contract", "Breach notification 'without undue delay', no time limit. No right to audit. Data export on exit for a fee."),
      ],
      followUps: [
        q("partners", "Who are the partners, and how do support staff sign in?", "'We do not name partners before signature. Support is outsourced and the team uses one shared administrator login.'", true),
        q("proof", "Can you show any independent test of your security?", "'Not yet. We can share our internal checklist once you have signed.'"),
      ],
      approve: {
        grade: "poor",
        text: "Every assurance was the supplier's own word. Nothing in the file could be checked, and the shared support login was the way in.",
        events: [
          ["Month 2", "Payroll goes live on time and Finance is pleased with the price."],
          ["Month 7", "A former agent at the outsourced support firm still knows the shared administrator login. Bank details for all 240 staff are copied."],
          ["Month 8", "You hear about it from an employee whose bank rings about fraud. PayNimbus had no deadline to tell you, and you have no right to inspect what happened."],
        ],
      },
      reject: { grade: "best", text: "Right call. All 'Yes' with nothing attached, no audit, unnamed partners and open-ended support access: for bank details, that is a story nobody can verify." },
      conditions: {
        evidence: { grade: "ok", text: "PayNimbus promises an audit report 'next quarter' and never delivers one. Five months pass before you re-tender. Safe, but the file already showed there was nothing behind the answers." },
        onsite: { grade: "ok", text: "Your on-site audit finds the shared support login in the first hour and you walk away. Safe, but three months and the audit fee went on a supplier whose file already had nothing behind it." },
      },
      otherCondition: { grade: "poor", text: "The condition is one more promise from a supplier whose promises cannot be checked. The shared support login stays, and in month 7 bank details for all 240 staff are copied." },
    },
    {
      id: "quillmark",
      name: "Quillmark Ledger",
      domain: "quillmark.example",
      price: 22000,
      badge: "Security certified",
      trap: "badge",
      coach: "There is a badge on this bid. Read the scope line of the certificate: which product does it name, and which one are you buying?",
      facts: [
        f("access", "access", "Hosts all payroll data in its payroll module, PayDesk."),
        f("answers", "questionnaire", "Detailed answers with policies attached. They describe the Quillmark Books accounting product."),
        f("scope", "audit", "Security certificate issued 10 months ago. Scope line: 'Quillmark Books accounting platform and head office.' PayDesk is not listed.", true),
        f("module", "audit", "PayDesk was bought from another firm last year and still runs on that firm's hosting.", true),
        f("breach", "breach", "'Nothing to disclose.'"),
        f("subs", "subs", "Hosting for Quillmark Books is named. Hosting for PayDesk: 'legacy provider, being migrated'."),
        f("contract", "contract", "Breach notification within 72 hours. Right to audit on request, at your cost. Data returned within 60 days."),
      ],
      followUps: [
        q("covers", "Does the certificate cover the payroll module?", "'Not at present. PayDesk is planned for the audit cycle after next. The badge refers to our main product.'", true),
        q("history", "Were there incidents in PayDesk before you bought it?", "'We hold no incident records from the previous owner.'", true),
      ],
      approve: {
        grade: "poor",
        text: "The certificate covered the accounting product and head office. The product you bought was outside its scope, so the badge said nothing about it.",
        events: [
          ["Month 1", "The certificate badge reassures the steering group. Nobody reads the scope line."],
          ["Month 6", "PayDesk is still on its old hosting. An unpatched server there is broken into, and salary and bank files are taken."],
          ["Month 6", "Quillmark tells you within 72 hours, as the contract says. The certificate was never about PayDesk."],
        ],
      },
      reject: { grade: "best", text: "Right call. The audit excludes the payroll module you would be buying, and nobody holds its incident history. A certificate for a different product is not assurance." },
      conditions: {
        evidence: { grade: "ok", text: "Quillmark agrees, but PayDesk will not be audited until the cycle after next. January passes on the old spreadsheet. Safe and slow: the scope line already showed the gap." },
        onsite: { grade: "ok", text: "Your own audit of PayDesk finds unsupported servers on the legacy hosting and you withdraw. Safe, but it took three months to confirm what the scope line said." },
      },
      otherCondition: { grade: "poor", text: "The condition does not touch the real gap: nobody independent has looked at PayDesk. In month 6 its old hosting is broken into and salary and bank files are taken." },
    },
    {
      id: "harrowgate",
      name: "Harrowgate Pay",
      domain: "harrowgate-pay.example",
      price: 27000,
      badge: null,
      handledBreach: true,
      coach: "This supplier admits a breach. Look at what it did next and who checked the fix. Then find the single 'No' in the questionnaire.",
      facts: [
        f("access", "access", "Hosts all payroll data. Support access is per ticket, approved by the customer and logged."),
        f("answers", "questionnaire", "Answers with evidence attached. One 'No': multi-factor sign-in for customer admins is optional and off by default.", true),
        f("audit", "audit", "Independent audit report dated 4 months ago. Scope: 'the payroll platform, its hosting and the support desk.' Two minor findings, both closed.", true),
        f("breach", "breach", "Two years ago a support agent was phished and 310 payslips at one customer were viewed. Customers were told within 48 hours and a written review was published.", true),
        f("fix", "breach", "Since then support staff must use multi-factor sign-in and can no longer see bank details. The audit above tested both.", true),
        f("subs", "subs", "Two, both named and both covered by the audit report: a hosting provider and a payslip printing firm."),
        f("contract", "contract", "Breach notification within 72 hours. Right to audit once a year. Data returned within 30 days, then deleted with written confirmation."),
      ],
      followUps: [
        q("mfa", "Can multi-factor sign-in be required for our admins?", "'Yes, at no cost. Single sign-on and multi-factor are switched on per customer when the order form asks for it.'", true),
        q("checked", "Who checked the fixes made after the breach?", "'The independent auditor. Section 4 of the report covers the support-desk controls introduced after the incident.'"),
      ],
      approve: {
        grade: "ok",
        text: "Right supplier, one gap left open. The single 'No' in the questionnaire said multi-factor sign-in for your own admins was off by default.",
        events: [
          ["Month 1", "Payroll goes live. Multi-factor sign-in for your admins stays off, as it is by default."],
          ["Month 5", "An HR admin's password is phished. The attacker signs in and views 12 payslips before Harrowgate's monitoring locks the account."],
          ["Month 5", "Harrowgate tells you the same day. Twelve staff are notified, and multi-factor sign-in is switched on afterwards."],
        ],
      },
      reject: { grade: "poor", text: "You turned away the only bid whose claims were independently checked, because it admitted a breach. That breach was reported in 48 hours and fixed, and the fix was audited: that is evidence in its favour." },
      conditions: {
        mfa: {
          grade: "best",
          text: "The breach two years ago was told to customers in 48 hours and fixed, and the fix was independently tested. The one real gap was optional multi-factor sign-in for your own admins, and a light condition closed it.",
          events: [
            ["Month 1", "Single sign-on and multi-factor sign-in are switched on for your HR and Finance admins before go-live."],
            ["Month 5", "An HR admin's password is phished. The attacker cannot get past the second factor; the attempt is logged and reported to you."],
            ["Month 12", "The next annual audit report arrives, in scope, with no open findings. Payroll ran every month."],
          ],
        },
        onsite: { grade: "ok", text: "It works, eventually. Your own audit repeats what an in-scope report from four months ago already covers, pushes go-live past January, and still leaves multi-factor sign-in for your admins switched off." },
      },
      otherCondition: { grade: "ok", text: "Right supplier, but this condition asks for something the file shows is already in place. Multi-factor sign-in for your own admins stays off, and in month 5 a phished HR password exposes 12 payslips." },
    },
  ],
};

const chatbot: Purchase = {
  id: "chatbot",
  title: "Help-page chatbot",
  need: "Member Services wants a chatbot on the public website to answer questions about opening hours, fees and 'how do I' topics from the published help pages.",
  data: "Published help articles only. No sign-in and no member records.",
  access: "A chat window on the public website. No connection to internal systems.",
  tier: "low",
  tierWhy: "Low: public content only, and no way into internal systems.",
  hints: "light",
  hint: "Before you read the bids: how much data and access does this purchase involve? Let that set how much assurance you ask for.",
  questions: 2,
  unmet: [
    ["Month 1", "No chatbot is bought. Member Services keeps answering the same ten questions by phone."],
    ["Month 3", "The team installs a free chat widget by itself, without telling IT."],
    ["Month 12", "The need was met anyway, with no vetting at all."],
  ],
  suppliers: [
    {
      id: "chatperch",
      name: "ChatPerch",
      domain: "chatperch.example",
      price: 1200,
      badge: null,
      facts: [
        f("access", "access", "Reads the public help pages you list. The chat window runs in a sandboxed frame and cannot read the rest of the page.", true),
        f("data", "access", "Chat text is kept for 30 days and this can be switched off. Visitors are told not to enter personal details.", true),
        f("answers", "questionnaire", "Short and candid: 'We are a six-person company with no formal certification.' The admin console requires multi-factor sign-in."),
        f("audit", "audit", "None."),
        f("breach", "breach", "'None known.' There is nothing to check this against."),
        f("subs", "subs", "One named hosting provider."),
        f("contract", "contract", "Standard terms. Cancel with 30 days' notice. Breach notification 'promptly'."),
      ],
      followUps: [
        q("reach", "Can the bot ever reach member accounts or internal systems?", "'No. This plan has no integrations. It only reads the public pages you list.'", true),
        q("audit", "Would you commission an independent audit for this contract?", "'Not for a contract of this size. We are happy to answer more questions in writing.'"),
      ],
      approve: {
        grade: "best",
        text: "No audit report, and none was needed: public help pages, no sign-in and no link to internal systems. The assurance asked for matched what was at stake.",
        events: [
          ["Week 2", "The chatbot is live on the help pages. Setup took an afternoon."],
          ["Month 6", "Calls about opening hours and fees are down by a third."],
          ["Month 12", "Nothing to report. The bot only ever saw pages that were already public."],
        ],
      },
      reject: { grade: "ok", text: "Safe, but stricter than the purchase needs. With only public pages involved, a small, candid supplier without a certificate was acceptable." },
      conditions: {
        evidence: { grade: "poor", text: "ChatPerch will not commission an audit for a $1,200 contract and withdraws. Asking for heavyweight assurance on a bot that only reads public pages costs you the supplier." },
        onsite: { grade: "poor", text: "An on-site audit and penetration test would cost several times the contract. ChatPerch withdraws, and the business sees security blocking a low-risk purchase." },
      },
      otherCondition: { grade: "ok", text: "Harmless but unnecessary. The file shows this is already in place or does not matter for a bot that only reads public pages; it adds a few weeks of paperwork." },
    },
    {
      id: "lumenly",
      name: "Lumenly Assist",
      domain: "lumenly.example",
      price: 3500,
      badge: null,
      facts: [
        f("access", "access", "Reads your published help pages only. Sandboxed chat window.", true),
        f("data", "access", "Chat text is kept for 90 days; you can shorten this."),
        f("answers", "questionnaire", "Complete, with documents attached."),
        f("audit", "audit", "Independent audit report dated 8 months ago. Scope includes the chatbot service."),
        f("breach", "breach", "'None.'"),
        f("subs", "subs", "Two, both named."),
        f("contract", "contract", "Breach notification within 72 hours. Data deleted on request."),
      ],
      followUps: [
        q("link", "Does the service need any connection to our systems?", "'No. Optional integrations exist, but none are in this quote.'", true),
        q("price", "Is the price fixed?", "'Fixed for 12 months.'"),
      ],
      approve: {
        grade: "best",
        text: "A sound, proportionate choice: public content only and no connection to internal systems.",
        events: [
          ["Week 3", "The chatbot is live on the help pages."],
          ["Month 12", "Nothing to report. You paid more than the cheapest bid for an audit report this purchase did not strictly need."],
        ],
      },
      reject: { grade: "ok", text: "Safe, but nothing in the file gave a reason to turn it away. It reads public pages only." },
      conditions: {
        onsite: { grade: "poor", text: "Lumenly declines an on-site audit for a $3,500 public FAQ bot. A heavyweight condition on a low-risk purchase costs you the supplier." },
      },
      otherCondition: { grade: "ok", text: "Harmless but unnecessary. The file shows this is already in place or does not matter for a bot that only reads public pages; it adds paperwork, not safety." },
    },
    {
      id: "orbisdesk",
      name: "Orbisdesk AI",
      domain: "orbisdesk.example",
      price: 9000,
      badge: "Enterprise certified",
      trap: "overaccess",
      facts: [
        f("access", "access", "The quote includes 'Personalised Answers': a live connection that reads member records and past tickets from your CRM.", true),
        f("data", "access", "Member names, contact details and ticket history are copied to the supplier 'to tailor replies'.", true),
        f("answers", "questionnaire", "Thorough. Every answer comes with evidence."),
        f("audit", "audit", "Independent audit report dated 6 months ago. Scope includes the chatbot and its integrations."),
        f("breach", "breach", "'None.'"),
        f("subs", "subs", "Three, all named. One of them processes the copied member data.", true),
        f("contract", "contract", "Breach notification within 72 hours. Right to audit. Data returned on exit."),
      ],
      followUps: [
        q("why", "Why does a help-page bot need member records?", "'It does not need them to answer from help pages. The connection lets it greet members by name and mention their tickets.'", true),
        q("without", "Can we buy it without the CRM connection?", "'Yes, at the same price. Most customers keep it on.'", true),
      ],
      approve: {
        grade: "poor",
        text: "The audit was real and in scope, but the badge answered the wrong question. The purchase needed public pages only; this bid added member records and one more processor.",
        events: [
          ["Month 1", "The bot goes live with 'Personalised Answers'. Member records and ticket history are copied to the supplier."],
          ["Month 5", "A visitor types a member's email address into the chat. The bot helpfully summarises that member's open complaint."],
          ["Month 6", "You report a data breach caused by a FAQ bot. The supplier's audit was sound; the access was never needed."],
        ],
      },
      reject: { grade: "best", text: "Right call. Good audit, wrong purchase: it turns a low-risk FAQ bot into a system holding member records, at seven times the price of the cheapest bid." },
      conditions: {
        access: {
          grade: "ok",
          text: "Safe once the unneeded access was cut, but it cost seven times the cheapest bid for the same job.",
          events: [
            ["Month 1", "The CRM connection is struck from the order. The bot reads public pages only."],
            ["Month 12", "Nothing goes wrong. You paid $9,000 for what a $1,200 bid offered."],
          ],
        },
      },
      otherCondition: { grade: "poor", text: "The condition leaves the CRM connection in place. Member records still flow to a FAQ bot, and in month 5 it reads out a member's complaint to a stranger." },
    },
  ],
};

const hvac: Purchase = {
  id: "hvac",
  title: "Heating and cooling maintenance",
  need: "Facilities needs a contractor to maintain heating and cooling at head office, including the server-room cooling units, and to fix faults remotely out of hours.",
  data: "No personal data. Temperature readings and equipment settings.",
  access: "A remote connection into the building-control system. That system shares a network with the server room and the office floors.",
  tier: "high",
  tierWhy: "High: no personal data, but standing remote access into the network that holds the server room.",
  hints: "none",
  questions: 3,
  unmet: [
    ["Month 1", "No contractor is signed. Facilities calls engineers out fault by fault."],
    ["Month 7", "A server-room cooling unit fails on a hot weekend. Nobody can reach it remotely, and servers shut down for a day."],
    ["Month 12", "Facilities hires a contractor directly, outside procurement, with no vetting at all."],
  ],
  suppliers: [
    {
      id: "coolcurrent",
      name: "CoolCurrent Services",
      domain: "coolcurrent.example",
      price: 18000,
      badge: null,
      trap: "unverifiable",
      facts: [
        f("link", "access", "An always-on remote link from their office to the building-control system.", true),
        f("login", "access", "All eight technicians use one login per customer site. Some connect from personal laptops.", true),
        f("answers", "questionnaire", "Half the answers are blank. 'Remote access: yes, via our support tool.'"),
        f("audit", "audit", "None."),
        f("breach", "breach", "'No incidents.'"),
        f("subs", "subs", "'We sometimes use agency technicians.'"),
        f("contract", "contract", "No breach notification clause. No right to audit.", true),
      ],
      followUps: [
        q("named", "Can each technician have a named account with multi-factor sign-in?", "'Our support tool allows one login per site. We cannot change that.'", true),
        q("agency", "Who else can use the link?", "'Agency technicians get the same login while they cover for us.'", true),
      ],
      approve: {
        grade: "poor",
        text: "No personal data was involved, but the access was serious: an always-on link and one shared login into the network that holds the server room.",
        events: [
          ["Month 1", "Maintenance starts. The always-on link and the shared login are set up in a day."],
          ["Month 4", "An agency technician who covered two shifts keeps the login."],
          ["Month 8", "At 02:00 on a Sunday someone uses that login to switch off the server-room cooling. Servers shut down on over-temperature and member services are offline until Monday afternoon."],
          ["Month 8", "No clause obliges CoolCurrent to tell you anything, and nobody can say which technician it was."],
        ],
      },
      reject: { grade: "best", text: "Right call. One shared login, personal laptops and an always-on link into the server-room network cannot be made accountable, and nothing else in the file offsets it." },
      conditions: {
        access: { grade: "ok", text: "CoolCurrent agrees, then cannot deliver: its tool allows one login per site. Three months pass before you re-tender. Safe, but slow." },
        onsite: { grade: "ok", text: "Your audit finds the shared login and the personal laptops, and you withdraw. Safe, but the file already said so." },
      },
      otherCondition: { grade: "poor", text: "The condition does not change who can use the link. The shared login still leaks, and in month 8 someone uses it to switch off the server-room cooling." },
    },
    {
      id: "northvane",
      name: "Northvane Climate",
      domain: "northvane.example",
      price: 24000,
      badge: "Certified secure since 2019",
      trap: "badge",
      facts: [
        f("link", "access", "An always-on remote link to the building-control system, used by Northvane and by its monitoring partner.", true),
        f("answers", "questionnaire", "Complete. Several answers point to the certificate instead of giving detail."),
        f("date", "audit", "Security certificate dated November 2023, three years ago. It expired in 2024. 'Renewal is planned.'", true),
        f("changes", "audit", "Since the certificate, the remote-access tool was replaced and out-of-hours monitoring moved to another firm.", true),
        f("breach", "breach", "'Nothing to report.'"),
        f("subs", "subs", "Out-of-hours monitoring is done by a partner. The bid does not name it."),
        f("contract", "contract", "Breach notification within 5 working days. Right to audit 'by agreement'."),
      ],
      followUps: [
        q("partner", "Who is the monitoring partner, and has it ever been audited?", "'TempTrack Monitoring. It was not in scope of our 2023 certificate and we hold no audit of it.'", true),
        q("renewal", "Why was the certificate not renewed?", "'The audit was postponed while we changed tools. We expect to restart it next year.'", true),
      ],
      approve: {
        grade: "poor",
        text: "The certificate was three years old and had lapsed. Since then the tooling changed and monitoring moved to a firm the certificate never covered.",
        events: [
          ["Month 1", "The 'Certified secure since 2019' badge settles the discussion. Maintenance starts."],
          ["Month 5", "The portal of TempTrack, the monitoring partner nobody audited, is broken into."],
          ["Month 5", "The intruders ride the always-on link into the building-control system and on to the office network. Two file servers are encrypted."],
          ["Month 6", "Northvane tells you on the fifth working day, as its contract allows."],
        ],
      },
      reject: { grade: "best", text: "Right call. A lapsed, three-year-old certificate says nothing about today's tooling or about the unaudited partner sharing an always-on link." },
      conditions: {
        evidence: { grade: "ok", text: "Northvane restarts its audit, which takes seven months. The summer passes on emergency call-outs. Safe, but slow." },
        access: { grade: "ok", text: "Per-session, approved access keeps a break-in at the monitoring partner away from your network. You still depend on a supplier nobody has checked for three years, and the partner's out-of-hours monitoring no longer works as sold." },
        onsite: { grade: "ok", text: "Your audit finds the unaudited monitoring partner and you withdraw after three months. Safe, but slow." },
      },
      otherCondition: { grade: "poor", text: "The condition leaves an always-on link shared with an unaudited partner. In month 5 that partner is broken into and two of your file servers are encrypted." },
    },
    {
      id: "fennick",
      name: "Fennick Building Systems",
      domain: "fennick.example",
      price: 29000,
      badge: "Independently audited 2026",
      handledBreach: true,
      facts: [
        f("link", "access", "Default setup: an always-on link to every building controller. On request: access per session, approved by you, time-limited and recorded.", true),
        f("answers", "questionnaire", "Complete, with evidence. Technicians have named accounts with multi-factor sign-in."),
        f("audit", "audit", "Independent audit report dated 5 months ago. Scope: 'remote service operations, including the remote-access platform.'", true),
        f("breach", "breach", "18 months ago a technician's laptop was stolen with saved site passwords on it. Customers were told within 24 hours and every password was changed that day.", true),
        f("fix", "breach", "Since then: no saved passwords, and multi-factor sign-in for every session. The audit above tested this."),
        f("subs", "subs", "None for remote work. A named local electrician for on-site jobs."),
        f("contract", "contract", "Breach notification within 72 hours. Right to audit once a year."),
      ],
      followUps: [
        q("session", "Can the link stay off unless we approve a session?", "'Yes. Per-session access is built in; a few customers ask for it. Out-of-hours faults then need your duty officer to approve, which adds about ten minutes.'", true),
        q("checked", "Did anyone outside Fennick check the fix after the stolen laptop?", "'Yes. The independent auditor tested it; see section 3 of the report.'"),
      ],
      approve: {
        grade: "ok",
        text: "Right supplier, but the always-on link to every controller stayed in place. For remote access into the server-room network, the proportionate step was per-session access.",
        events: [
          ["Month 1", "Maintenance starts on the default setup: an always-on link to every building controller."],
          ["Month 7", "A night-time cooling fault is fixed remotely in minutes."],
          ["Month 10", "Your own penetration test reaches the building-control system from the office network and finds the standing link. No harm done, but the exposure was there all year."],
        ],
      },
      reject: { grade: "poor", text: "You turned away the bid with a current, in-scope audit because it disclosed a stolen laptop. It told customers within 24 hours, and the fix was independently tested." },
      conditions: {
        access: {
          grade: "best",
          text: "The stolen-laptop breach was told to customers within a day and fixed, and the fix was independently tested. The remaining risk was the always-on default, and limiting access to approved sessions closed it.",
          events: [
            ["Month 1", "The link is off by default. Each remote session is requested, approved by your duty officer, time-limited and recorded."],
            ["Month 7", "A server-room cooling unit faults at night. Approval adds ten minutes, and the technician fixes it remotely within the hour."],
            ["Month 9", "Someone tries a technician's password against the remote-access platform. There is no open link to reach, and multi-factor sign-in stops the attempt."],
            ["Month 12", "The next annual audit report arrives, current and in scope."],
          ],
        },
      },
      otherCondition: { grade: "ok", text: "Right supplier, but this condition repeats what the file already shows. The always-on link to every controller stays, and your own penetration test finds it in month 10." },
    },
  ],
};

export const PURCHASES: readonly Purchase[] = [payroll, chatbot, hvac];
