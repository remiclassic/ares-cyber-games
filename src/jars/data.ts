import type { Scenario } from "./engine";

// Meridian Freight's shared drive is being cleaned up before the move to a new file store.
// Fictional; pending SME review (docs/design/NEED_TO_KNOW.md). Levels follow a common
// four-tier scheme; rename them to match the learner's own policy if it differs.

export const SCENARIO: Scenario = {
  id: "the-shared-drive",
  title: "The Shared Drive",
  org: "Meridian Freight",
  stages: [
    {
      id: "basics",
      title: "The obvious ones",
      lesson: "Ask one question: if this landed in the wrong inbox, who would be harmed, and how badly? Nobody: Public. No real harm: Internal. Real people or the business: Confidential. Severe, or a breach on its own: Restricted.",
      items: [
        { id: "press", title: "Press release (published)", detail: "“Meridian Freight opens new harbour depot”, already on the company website.", level: 0, why: "It is already public. A higher label only stops people sharing a link the whole world has.", clue: "Is it already on the website?" },
        { id: "canteen", title: "Canteen menu and fire-drill dates", detail: "Next month's menu and the date of the quarterly fire drill at head office.", level: 1, why: "Meant for staff, not the public, but harmless if it leaked. Internal is the default for everyday business information.", clue: "Who would be harmed if a stranger read it? Anyone at all?" },
        { id: "payroll", title: "Payroll export, March", detail: "Name, salary, bank account and national insurance number for 412 staff.", level: 3, why: "Bank details and national ID numbers for hundreds of people: a leak is a reportable breach and enables fraud. Restricted, with the smallest possible access list.", clue: "Look for bank details and government ID numbers." },
        { id: "vpnkey", title: "vpn-backup-admin.txt", detail: "A text file holding the admin password for the backup VPN appliance.", level: 3, why: "A credential to a system is Restricted, and it should not live in a file at all: move it to the password vault and rotate it.", clue: "What could someone do with what is inside?" },
      ],
    },
    {
      id: "people",
      title: "People and partners",
      lesson: "Personal data about customers or staff is Confidential at least. Special categories (health, card numbers, ID documents) are Restricted.",
      items: [
        { id: "rates", title: "Customer rate card, Northwind Retail", detail: "Negotiated per-pallet prices and the discount schedule from the signed contract.", level: 2, why: "Commercial terms: a competitor or another customer seeing them harms the business, but no one's identity is exposed. Confidential.", clue: "Would a competitor gain from it? Would a person be harmed?" },
        { id: "sick", title: "Return-to-work notes, warehouse", detail: "Manager notes on three named drivers, including the medical reasons for their absence.", level: 3, why: "Health information about named people is a special category of personal data. Restricted: HR and the line manager only.", clue: "What kind of personal data is it?" },
        { id: "phonelist", title: "Depot phone list", detail: "Names, job titles and desk extensions for the harbour depot team.", level: 1, why: "Work contact details shared across the company. Internal: a leak helps a phisher a little, but does no real harm. Keep it off public pages.", clue: "Is there anything here beyond what a work email signature shows?" },
        { id: "complaints", title: "Customer complaints log", detail: "Customer names, phone numbers, home addresses and what went wrong with each delivery.", level: 2, why: "Personal data about customers, but nothing special-category. Confidential: customer service and their managers.", clue: "It is personal data. Is any of it health, card or ID data?" },
      ],
    },
    {
      id: "tricky",
      title: "The tricky ones",
      lesson: "Classify by the most sensitive thing inside, not the file name. Combined data can be more sensitive than any part. And a label is not forever: data can move up or down.",
      items: [
        { id: "deck", title: "All-hands slides (draft)", detail: "Mostly team photos, plus one slide on next quarter's unannounced acquisition of Harbourline Ltd.", level: 3, why: "One slide sets the label for the whole file. Unannounced deal information is price-sensitive inside information: Restricted until it is announced. Better still, cut the slide.", clue: "Classify by the most sensitive slide, not the average." },
        { id: "roster", title: "Driver roster joined to route sheet", detail: "Each is Internal on its own. Joined: which named driver carries high-value cargo, on which route, at what time.", level: 2, why: "Aggregation: together the two Internal files tell a thief who to target and when. The combination is Confidential.", clue: "What does joining the two files reveal that neither does alone?" },
        { id: "results", title: "Quarterly results, after announcement", detail: "Final figures, published to the stock exchange this morning.", level: 0, why: "It was Restricted until this morning; once published it is Public. Labels change with time, so review them.", clue: "When was it published?" },
        { id: "anon", title: "Delivery-time dataset, “anonymised”", detail: "Names removed, but every row keeps full home postcode, date of birth and delivery times.", level: 2, why: "Postcode plus date of birth re-identifies most people, so this is still personal data: Confidential. Truly anonymised data would drop or coarsen those columns.", clue: "Could you work out who a row is about?" },
      ],
    },
  ],
};
