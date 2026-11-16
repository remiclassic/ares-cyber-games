// Backup or Bust content. Fictional organisation and systems. Content to be reviewed with SMEs.
import type { Game, System } from "./sim";

type Base = Omit<System, "hit">;

const patients: Base = {
  id: "patients",
  name: "Patient records database",
  desc: "Every animal's history, prescriptions and today's appointments. Updated at every consultation.",
  criticality: 3,
  change: "constant",
  hosted: false,
  fragile: true,
  lost: "Years of patient histories are gone; the practice works from memory and paper.",
};

const drive: Base = {
  id: "drive",
  name: "Shared drive",
  desc: "Rotas, client letters, consent forms and policies. Staff edit a few files each day.",
  criticality: 2,
  change: "daily",
  hosted: false,
  fragile: false,
  lost: "Rotas, letters and forms have to be written again from scratch.",
};

const finance: Base = {
  id: "finance",
  name: "Accounts system",
  desc: "Invoices and payroll in an accounts package. The bookkeeper enters a batch every Friday.",
  criticality: 2,
  change: "rarely",
  hosted: false,
  fragile: true,
  lost: "The year's accounts are rebuilt from bank statements and paper invoices.",
};

const lab: Base = {
  id: "lab",
  name: "Lab PC",
  desc: "Runs the blood analyser. Results are copied into the patient record; the PC keeps calibration files that change about monthly.",
  criticality: 1,
  change: "rarely",
  hosted: false,
  fragile: false,
  lost: "The analyser is recalibrated by the supplier: a call-out and a week of sending samples away.",
};

const email: Base = {
  id: "email",
  name: "Staff email",
  desc: "Hosted mailboxes in the practice's cloud account. Supplier orders, referrals and client replies.",
  criticality: 2,
  change: "daily",
  hosted: true,
  fragile: false,
  lost: "Every mailbox starts empty: referrals, orders and client threads are gone.",
};

const website: Base = {
  id: "website",
  name: "Website",
  desc: "Opening hours, prices and the team page, hosted in the practice's cloud account. Edited a few times a year.",
  criticality: 1,
  change: "rarely",
  hosted: true,
  fragile: false,
  lost: "The site is rebuilt page by page from old printouts.",
};

const booking: Base = {
  id: "booking",
  name: "Online booking",
  desc: "Clients book and pay deposits here, day and night. Hosted in the practice's cloud account; it exports plain booking files.",
  criticality: 3,
  change: "constant",
  hosted: true,
  fragile: false,
  lost: "Nobody knows who is booked or who has paid. Clients arrive to an empty diary.",
};

const display: Base = {
  id: "display",
  name: "Waiting room display PC",
  desc: "Shows the queue on a screen. Holds nothing of its own: it is reinstalled from the standard image in an hour.",
  criticality: 1,
  change: "rarely",
  hosted: false,
  fragile: false,
  rebuildable: true,
  lost: "Nothing: it is reinstalled from the standard image.",
};

export const GAME: Game = {
  id: "larkmoor",
  org: "Larkmoor Veterinary Practice",
  title: "Three years at Larkmoor",
  scenarios: [
    {
      id: "year1",
      title: "Year 1 · The warning",
      mode: "guided",
      budget: 19,
      lesson: "Ransomware reaches every copy the network can reach. Put copies out of its reach, and prove the important ones restore.",
      register: ["Ransomware is hitting small practices in the region. It encrypts every on-site machine and every network share those machines can reach."],
      incident: "Ransomware",
      story: "A nurse opens a fake courier invoice on Tuesday morning. By lunchtime every on-site machine shows a ransom note, and so does every network share they were connected to.",
      systems: [
        { ...patients, hit: "ransomware" },
        { ...drive, hit: "ransomware" },
        { ...finance, hit: "ransomware" },
        { ...lab, hit: "ransomware" },
      ],
    },
    {
      id: "year2",
      title: "Year 2 · Three small disasters",
      mode: "hints",
      budget: 18,
      lesson: "Different failures reach different copies. A cloud copy fails with the cloud account; a week of history fails a delete found late.",
      register: [
        "The main server (patient records and accounts) and the waiting room PC run on six-year-old disks.",
        "Staff tidy the shared drive every quarter. Mistakes there are usually noticed weeks later.",
        "Email and the website sit in one cloud account with a single admin and a payment card about to expire.",
      ],
      incident: "A failed disk, a late-found delete and a cloud lockout",
      story: "In March the main server's disk dies, and the waiting room PC follows. In June someone notices a folder of consent forms was deleted three weeks ago. In October the card on the cloud account bounces and the provider locks the account for a week.",
      systems: [
        { ...patients, hit: "disk" },
        { ...finance, hit: "disk" },
        { ...drive, hit: "delete" },
        { ...email, hit: "lockout" },
        { ...website, hit: "lockout" },
        { ...display, hit: "disk" },
      ],
    },
    {
      id: "year3",
      title: "Year 3 · The bad week",
      mode: "final",
      budget: 35,
      lesson: "No hints. Ask of every copy: what could reach it? Then spend on frequency and tests where they matter most.",
      register: [
        "Ransomware is still hitting practices in the region, and the newer crews go looking for backups first.",
        "One admin login runs everything: the on-site machines, the network shares and the cloud account.",
        "The practice now takes bookings and deposits online, around the clock.",
      ],
      incident: "Ransomware with a stolen admin login",
      story: "Attackers phish the admin login. Over one weekend they encrypt every on-site machine and network share, then change the cloud account's password: the hosted systems and everything stored in that account are locked away.",
      systems: [
        { ...patients, hit: "takeover" },
        { ...booking, hit: "takeover" },
        { ...drive, hit: "takeover" },
        { ...finance, hit: "takeover" },
        { ...email, hit: "takeover" },
        { ...lab, hit: "takeover" },
        { ...display, hit: "takeover" },
      ],
    },
  ],
};
