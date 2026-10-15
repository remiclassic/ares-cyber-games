import type { Value, VariantId } from "../sim/types";

// Synthetic records for Case 01, "Unusual Access". Everything here is invented:
// names, accounts and devices are fictional, external addresses come from the
// documentation ranges (RFC 5737). SCENARIO CONTENT PENDING SME REVIEW.
//
// Both variants are built from the same recipe so the relevant activity and the
// benign distractors keep the same shape while every value changes. In variant
// B the service account fails more often than the account that matters, so the
// highest count is not the answer.

type Role = "subject" | "keeper" | "forgetful" | "traveller" | "owl" | "late" | "other";

type Person = Readonly<{ id: string; username: string; department: string; role: Role }>;

type Spec = Readonly<{
  id: VariantId;
  label: string;
  day: string;
  prevDay: string;
  window: readonly [string, string];
  windowLabel: string;
  city: string;
  people: readonly Person[];
  service: Readonly<{ id: string; username: string; device: string; ip: string; failures: number; at: string }>;
  attacker: Readonly<{ ip: string; location: string; device: string; failures: number; firstAt: string; successAt: string }>;
  traveller: Readonly<{ ip: string; location: string }>;
  owlAt: string;
  lateAt: string;
  sensitive: Readonly<{ folder: string; files: readonly string[] }>;
}>;

export type Facts = Readonly<{
  subject: Person;
  serviceId: string;
  serviceName: string;
  serviceFailures: number;
  serviceIp: string;
  burstFailures: number;
  burstFirst: string;
  burstLast: string;
  successAt: string;
  attackerIp: string;
  attackerLocation: string;
  rogueDevice: string;
  failuresInWindow: number;
  accountsWithFailures: number;
  singleFailureAccounts: readonly string[];
  forgetful: Person;
  forgetfulFailures: number;
  forgetfulAt: string;
  owl: Person;
  officeLoginAt: string;
  usualDevice: string;
  usualFolder: string;
  sensitiveFolder: string;
  fileEvents: number;
  filesTouched: number;
  downloads: number;
  filesFirst: string;
  filesLast: string;
}>;

export type Table = Readonly<{ name: string; description: string; columns: readonly (readonly [string, string, string])[]; rows: Value[][] }>;

export type Dataset = Readonly<{
  id: VariantId;
  label: string;
  window: readonly [string, string];
  windowLabel: string;
  tables: readonly Table[];
  facts: Facts;
}>;

const FOLDERS: Record<string, string> = {
  Finance: "/finance/reports",
  Engineering: "/eng/designs",
  Sales: "/sales/accounts",
  HR: "/hr/policies",
  IT: "/it/runbooks",
  Marketing: "/marketing/campaigns",
};

const SPECS: Record<VariantId, Spec> = {
  a: {
    id: "a",
    label: "Dataset A",
    day: "2024-04-03",
    prevDay: "2024-04-02",
    window: ["2024-04-03 00:00:00", "2024-04-03 06:00:00"],
    windowLabel: "3 April 2024, 00:00 to 06:00",
    city: "Toronto",
    people: [
      { id: "A-1001", username: "maria.gomez", department: "Finance", role: "forgetful" },
      { id: "A-1004", username: "priya.nair", department: "Sales", role: "traveller" },
      { id: "A-1007", username: "alex.chen", department: "Engineering", role: "subject" },
      { id: "A-1010", username: "sam.osei", department: "IT", role: "late" },
      { id: "A-1013", username: "lena.fischer", department: "HR", role: "other" },
      { id: "A-1016", username: "omar.haddad", department: "Finance", role: "keeper" },
      { id: "A-1019", username: "jo.park", department: "Engineering", role: "owl" },
    ],
    service: { id: "A-1900", username: "svc-backup", device: "SRV-BKP-01", ip: "10.0.5.20", failures: 5, at: "01:00:00" },
    attacker: { ip: "203.0.113.77", location: "Singapore", device: "DEV-9001", failures: 12, firstAt: "02:05:10", successAt: "02:21:30" },
    traveller: { ip: "192.0.2.44", location: "London" },
    owlAt: "00:12:05",
    lateAt: "05:40:20",
    sensitive: { folder: "/finance/payroll", files: ["2024-03-payroll-run.xlsx", "salary-bands.xlsx", "bank-details-export.csv", "bonus-plan-2024.docx"] },
  },
  b: {
    id: "b",
    label: "Dataset B",
    day: "2024-05-14",
    prevDay: "2024-05-13",
    window: ["2024-05-14 20:00:00", "2024-05-15 00:00:00"],
    windowLabel: "14 May 2024, 20:00 to midnight",
    city: "Montreal",
    people: [
      { id: "A-2002", username: "dana.okafor", department: "Marketing", role: "subject" },
      { id: "A-2005", username: "ravi.menon", department: "HR", role: "keeper" },
      { id: "A-2008", username: "chloe.martin", department: "Sales", role: "forgetful" },
      { id: "A-2011", username: "tomas.silva", department: "Engineering", role: "owl" },
      { id: "A-2014", username: "mei.tanaka", department: "IT", role: "late" },
      { id: "A-2017", username: "ben.adler", department: "Sales", role: "traveller" },
      { id: "A-2020", username: "nora.lind", department: "Finance", role: "other" },
    ],
    service: { id: "A-2901", username: "svc-reports", device: "SRV-RPT-02", ip: "10.0.7.31", failures: 15, at: "21:00:00" },
    attacker: { ip: "198.51.100.24", location: "Sao Paulo", device: "DEV-7300", failures: 9, firstAt: "22:31:05", successAt: "22:44:10" },
    traveller: { ip: "192.0.2.91", location: "Lisbon" },
    owlAt: "20:40:15",
    lateAt: "23:10:45",
    sensitive: { folder: "/hr/compensation", files: ["2024-salary-review.xlsx", "exec-compensation.xlsx", "employee-bank-details.csv", "severance-terms.docx"] },
  },
};

const pad = (n: number): string => String(n).padStart(2, "0");

function addSeconds(ts: string, seconds: number): string {
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  d.setUTCSeconds(d.getUTCSeconds() + seconds);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

type Login = { ts: string; account: string; device: string; ip: string; location: string; result: "success" | "failure" };
type FileEvent = { ts: string; account: string; device: string; path: string; action: "read" | "download"; sensitivity: "internal" | "restricted" };

function build(spec: Spec): Dataset {
  const logins: Login[] = [];
  const files: FileEvent[] = [];
  const at = (day: string, time: string): string => `${day} ${time}`;
  const laptop = (index: number): string => `LAP-${spec.id === "a" ? "01" : "02"}${pad(index * 3 + 12)}`;
  const office = (index: number): string => `10.20.1.${index + 31}`;
  const person = (role: Role): Person => spec.people.find((p) => p.role === role)!;
  const indexOf = (p: Person): number => spec.people.indexOf(p);
  const login = (ts: string, p: Person, result: Login["result"], from?: { ip: string; location: string; device?: string }): void => {
    logins.push({ ts, account: p.id, device: from?.device ?? laptop(indexOf(p)), ip: from?.ip ?? office(indexOf(p)), location: from?.location ?? spec.city, result });
  };

  const subject = person("subject");
  const forgetful = person("forgetful");
  const traveller = person("traveller");
  const owl = person("owl");
  const late = person("late");
  const keeper = person("keeper");
  const { attacker, service } = spec;

  // Ordinary working days.
  spec.people.forEach((p, i) => {
    const morning = `08:${pad(10 + i * 7)}:${pad((i * 13) % 60)}`;
    if (p !== subject) login(at(spec.prevDay, morning), p, "success");
    if (p !== subject && p !== forgetful && p !== traveller) login(at(spec.day, morning), p, "success");
    const folder = FOLDERS[p.department];
    const read = (ts: string, name: string): void => {
      files.push({ ts, account: p.id, device: laptop(i), path: `${folder}/${name}`, action: "read", sensitivity: "internal" });
    };
    read(at(spec.prevDay, `10:${pad(5 + i * 6)}:00`), "q2-plan.docx");
    read(at(spec.prevDay, `14:${pad(20 + i * 4)}:30`), "weekly-notes.docx");
    read(at(spec.day, `10:${pad(30 + i * 3)}:10`), "status-update.docx");
  });

  // The subject: one typo the day before, and an ordinary office sign-in on the day.
  login(at(spec.prevDay, "09:02:10"), subject, "failure");
  login(at(spec.prevDay, "09:02:40"), subject, "success");
  const officeLoginAt = at(spec.day, "09:10:25");
  login(officeLoginAt, subject, "success");

  // Benign distractors.
  const forgetfulAt = at(spec.day, "08:55:00");
  const forgetfulFailures = 4;
  for (let i = 0; i < forgetfulFailures; i++) login(addSeconds(forgetfulAt, i * 35), forgetful, "failure");
  login(addSeconds(forgetfulAt, 210), forgetful, "success");
  login(at(spec.day, "07:30:40"), traveller, "success", spec.traveller);
  const vpn = { ip: "172.16.8.14", location: `${spec.city} (VPN)` };
  login(at(spec.day, spec.owlAt), owl, "failure", vpn);
  login(addSeconds(at(spec.day, spec.owlAt), 50), owl, "success", vpn);
  login(at(spec.day, spec.lateAt), late, "failure");
  login(addSeconds(at(spec.day, spec.lateAt), 40), late, "success");

  // A scheduled job with an expired password: fails every night, never succeeds.
  for (const day of [spec.prevDay, spec.day]) {
    for (let i = 0; i < service.failures; i++) {
      logins.push({ ts: addSeconds(at(day, service.at), i * 20), account: service.id, device: service.device, ip: service.ip, location: `${spec.city} DC`, result: "failure" });
    }
  }

  // The activity under investigation.
  const from = { ip: attacker.ip, location: attacker.location, device: attacker.device };
  const burstFirst = at(spec.day, attacker.firstAt);
  let burstLast = burstFirst;
  for (let i = 0; i < attacker.failures; i++) {
    burstLast = addSeconds(burstFirst, i * 62 + (i % 3) * 4);
    login(burstLast, subject, "failure", from);
  }
  const successAt = at(spec.day, attacker.successAt);
  login(successAt, subject, "success", from);

  const [f1, f2, f3, f4] = spec.sensitive.files;
  const touched: [number, string, FileEvent["action"]][] = [
    [270, f1, "read"],
    [410, f2, "read"],
    [455, f2, "download"],
    [640, f3, "read"],
    [700, f3, "download"],
    [905, f4, "read"],
  ];
  for (const [offset, name, action] of touched) {
    files.push({ ts: addSeconds(successAt, offset), account: subject.id, device: attacker.device, path: `${spec.sensitive.folder}/${name}`, action, sensitivity: "restricted" });
  }
  // The folder's usual reader, during working hours.
  files.push({ ts: at(spec.prevDay, "11:02:00"), account: keeper.id, device: laptop(indexOf(keeper)), path: `${spec.sensitive.folder}/${f1}`, action: "read", sensitivity: "restricted" });
  files.push({ ts: at(spec.prevDay, "11:20:30"), account: keeper.id, device: laptop(indexOf(keeper)), path: `${spec.sensitive.folder}/${f2}`, action: "read", sensitivity: "restricted" });

  logins.sort((a, b) => a.ts.localeCompare(b.ts));
  files.sort((a, b) => a.ts.localeCompare(b.ts));
  const id = (prefix: string, i: number): string => `${prefix}-${String(i + 1).padStart(4, "0")}`;

  const inWindow = logins.filter((l) => l.result === "failure" && l.ts >= spec.window[0] && l.ts < spec.window[1]);
  const perAccount = new Map<string, number>();
  inWindow.forEach((l) => perAccount.set(l.account, (perAccount.get(l.account) ?? 0) + 1));
  const rogue = files.filter((f) => f.device === attacker.device);

  const tables: Table[] = [
    {
      name: "accounts",
      description: "One row per account.",
      columns: [
        ["account_id", "TEXT", "Account identifier, for example A-1007"],
        ["username", "TEXT", "Sign-in name"],
        ["department", "TEXT", "Department, or Service for scheduled jobs"],
        ["home_location", "TEXT", "Usual place of work"],
      ],
      rows: [...spec.people.map((p) => [p.id, p.username, p.department, spec.city]), [service.id, service.username, "Service", `${spec.city} DC`]],
    },
    {
      name: "devices",
      description: "Every device seen signing in.",
      columns: [
        ["device_id", "TEXT", "Device identifier"],
        ["hostname", "TEXT", "Name in the asset inventory, if any"],
        ["owner_account_id", "TEXT", "Account the device is issued to (NULL if none)"],
        ["device_type", "TEXT", "laptop, server or unknown"],
        ["registered", "INTEGER", "1 = in the asset inventory, 0 = not"],
      ],
      rows: [
        ...spec.people.map((p, i) => [laptop(i), `${p.username.split(".")[0]}-laptop`, p.id, "laptop", 1] as Value[]),
        [service.device, service.device.toLowerCase(), service.id, "server", 1],
        [attacker.device, null, null, "unknown", 0],
      ],
    },
    {
      name: "logins",
      description: "One row per sign-in attempt.",
      columns: [
        ["event_id", "TEXT", "Event identifier"],
        ["ts", "TEXT", "Time, as YYYY-MM-DD HH:MM:SS (sorts and compares as text)"],
        ["account_id", "TEXT", "Account that was used"],
        ["device_id", "TEXT", "Device the attempt came from"],
        ["source_ip", "TEXT", "Source address"],
        ["location", "TEXT", "Approximate location of the source"],
        ["result", "TEXT", "'success' or 'failure'"],
      ],
      rows: logins.map((l, i) => [id("L", i), l.ts, l.account, l.device, l.ip, l.location, l.result]),
    },
    {
      name: "file_access",
      description: "One row per file opened or downloaded.",
      columns: [
        ["event_id", "TEXT", "Event identifier"],
        ["ts", "TEXT", "Time, as YYYY-MM-DD HH:MM:SS"],
        ["account_id", "TEXT", "Account that was used"],
        ["device_id", "TEXT", "Device the access came from"],
        ["file_path", "TEXT", "Full path of the file"],
        ["action", "TEXT", "'read' or 'download'"],
        ["sensitivity", "TEXT", "'internal' or 'restricted'"],
      ],
      rows: files.map((f, i) => [id("F", i), f.ts, f.account, f.device, f.path, f.action, f.sensitivity]),
    },
  ];

  return {
    id: spec.id,
    label: spec.label,
    window: spec.window,
    windowLabel: spec.windowLabel,
    tables,
    facts: {
      subject,
      serviceId: service.id,
      serviceName: service.username,
      serviceFailures: service.failures,
      serviceIp: service.ip,
      burstFailures: attacker.failures,
      burstFirst,
      burstLast,
      successAt,
      attackerIp: attacker.ip,
      attackerLocation: attacker.location,
      rogueDevice: attacker.device,
      failuresInWindow: inWindow.length,
      accountsWithFailures: perAccount.size,
      singleFailureAccounts: [...perAccount].filter(([, n]) => n === 1).map(([account]) => account),
      forgetful,
      forgetfulFailures,
      forgetfulAt,
      owl,
      officeLoginAt,
      usualDevice: laptop(indexOf(subject)),
      usualFolder: FOLDERS[subject.department],
      sensitiveFolder: spec.sensitive.folder,
      fileEvents: rogue.length,
      filesTouched: new Set(rogue.map((f) => f.path)).size,
      downloads: rogue.filter((f) => f.action === "download").length,
      filesFirst: rogue[0].ts,
      filesLast: rogue[rogue.length - 1].ts,
    },
  };
}

export const DATASETS: Record<VariantId, Dataset> = { a: build(SPECS.a), b: build(SPECS.b) };

const literal = (v: Value): string => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

// The statements that create and fill the local, in-memory database.
export function seedSql(dataset: Dataset): string {
  return dataset.tables
    .map((t) => {
      const create = `CREATE TABLE ${t.name} (${t.columns.map(([name, type]) => `${name} ${type}`).join(", ")});`;
      const insert = `INSERT INTO ${t.name} VALUES ${t.rows.map((row) => `(${row.map(literal).join(", ")})`).join(", ")};`;
      return `${create}\n${insert}`;
    })
    .join("\n");
}
