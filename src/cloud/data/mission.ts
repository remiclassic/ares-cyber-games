import type { Mission, Service } from "../sim/types";

// Authored content for the first mission. DRAFT: every instructional statement here is pending
// SME review (docs/SME_REVIEW_CLOUD.md). All organisations, accounts and numbers are fictional.
// Numbers quoted in evidence are built from the same constants the simulation uses.

const CHECKOUT: Service = { id: "checkout", name: "Checkout", unitCapacity: 250, unitCost: 4, dependsOn: [{ service: "payments", callsPerRequest: 1 }] };
const PAYMENTS: Service = { id: "payments", name: "Payments API", unitCapacity: 400, unitCost: 6, dependsOn: [] };
const STOREFRONT: Service = { id: "storefront", name: "Storefront", unitCapacity: 300, unitCost: 4, dependsOn: [] };

const START = { checkout: 4, payments: 3, storefront: 8 };
const SURGE = { now: 1100, peak: 1300, headroom: 0.1, hours: 2, ceiling: 120 };
const QUIET = { now: 600, peak: 750, headroom: 0.25, hours: 4, ceiling: 80 };
const n = (value: number) => value.toLocaleString("en-US");

export const FIRST_ORBIT: Mission = {
  id: "first-orbit",
  title: "First Orbit",
  organisation: "Meridian Outfitters",
  serviceModel: {
    name: "Infrastructure as a Service (IaaS)",
    summary: "Meridian Outfitters, a fictional online shop, rents virtual machines from a cloud provider and runs its own services on them.",
    provider: ["Data centres, power and physical security", "Physical servers, storage and network", "The virtualisation layer that runs the machines"],
    customer: ["How many instances run, and when", "Operating systems and the applications on them", "Accounts and the permissions they hold", "The data, including backups"],
  },
  budget: 320,
  fees: { inspect: 5, revise: 10 },
  maxAttempts: 3,
  services: [CHECKOUT, PAYMENTS, STOREFRONT],
  initialInstances: START,
  initialGrants: ["snapshots:read", "archive:write", "keys:use", "archive:delete", "snapshots:delete", "iam:manage", "analytics:query"],
  checkpoints: [
    {
      id: "surge",
      kind: "capacity",
      station: "eu-central",
      title: "Traffic surge",
      goal: "Keep checkout available",
      brief: "A campaign is sending a spike of customers to EU-CENTRAL. Checkout is turning requests away.",
      requirements: [
        "Serve at least 99% of checkout requests at the peak.",
        `Policy: keep ${SURGE.headroom * 100}% headroom above the expected peak on every service in the request path.`,
        `Cost ceiling: ${SURGE.ceiling} credits for the ${SURGE.hours}-hour surge window. Every running instance is billed.`,
      ],
      focus: "checkout",
      adjustable: [
        { service: "checkout", min: START.checkout, max: 8, card: "add", title: "Add capacity: Checkout", blurb: "Run more Checkout instances to handle the surge." },
        { service: "payments", min: START.payments, max: 6, card: "add", title: "Add capacity: Payments API", blurb: "Run more Payments API instances.", needs: "dependency" },
      ],
      demandNow: SURGE.now,
      demandPeak: SURGE.peak,
      headroom: SURGE.headroom,
      minAvailability: 0.99,
      windowHours: SURGE.hours,
      costCeiling: SURGE.ceiling,
      inspect: { title: "Inspect dependency", blurb: "Trace what a checkout request calls before you spend on capacity." },
      evidence: [
        {
          id: "surge-demand",
          source: "chip",
          icon: "demand",
          title: "Checkout demand",
          lines: [`Now: ${n(SURGE.now)} requests per second (rps) and rising.`, `Campaign forecast: a peak of ${n(SURGE.peak)} rps within ${SURGE.hours} hours.`],
          reveals: "peak",
        },
        {
          id: "surge-fleet",
          source: "chip",
          icon: "capacity",
          title: "Checkout fleet",
          lines: [
            `${START.checkout} instances × ${CHECKOUT.unitCapacity} rps each = ${n(START.checkout * CHECKOUT.unitCapacity)} rps of capacity.`,
            `Each instance costs ${CHECKOUT.unitCost} credits per hour.`,
          ],
        },
        {
          id: "surge-errors",
          source: "chip",
          icon: "errors",
          title: "Error sample",
          lines: ["Customers see “service unavailable” at checkout.", "Every checkout request waits on a call to another service before it completes."],
        },
        {
          id: "surge-dependency",
          source: "inspect",
          icon: "link",
          title: "Dependency: Payments API",
          lines: [
            `Each checkout request makes ${CHECKOUT.dependsOn[0].callsPerRequest} call to Payments API.`,
            `Payments API: ${START.payments} instances × ${PAYMENTS.unitCapacity} rps = ${n(START.payments * PAYMENTS.unitCapacity)} rps, at ${PAYMENTS.unitCost} credits per instance-hour.`,
          ],
          reveals: "dependency",
        },
      ],
      justifications: [
        {
          id: "both",
          text: "Checkout is over capacity, and Payments API would saturate next. Both need capacity for the peak.",
          valid: true,
          fits: ["up:checkout", "up:payments"],
          needs: "dependency",
          feedback: "This matches the request path: a checkout request only succeeds if both services have room for it.",
        },
        {
          id: "checkout-only",
          text: "Demand exceeds Checkout's capacity, so Checkout needs more instances.",
          valid: true,
          fits: ["up:checkout"],
          feedback: "True as far as it goes. Whether it is enough depends on what Checkout itself relies on.",
        },
        {
          id: "provider-scales",
          text: "On IaaS the provider adds instances during a surge, so the safest change is none.",
          valid: false,
          fits: [],
          feedback: "On IaaS the provider keeps the hardware and virtualisation running. How many instances you run is your configuration.",
        },
        {
          id: "anywhere",
          text: "More capacity anywhere in the region raises availability.",
          valid: false,
          fits: [],
          feedback: "Capacity helps only where it is the constraint. Elsewhere it adds cost and changes nothing.",
        },
      ],
      responsibility: "On IaaS the provider keeps the underlying machines available. Sizing Checkout and the services it calls for a surge is the customer's job.",
      connection: "Interpreting demand against capacity, and following a request through its dependencies, is how you find the real constraint before spending on it.",
    },
    {
      id: "quiet",
      kind: "capacity",
      station: "us-west",
      title: "Quiet period",
      goal: "Stop paying for idle capacity",
      brief: "It is overnight in US-WEST. Storefront is running far more instances than its traffic needs.",
      requirements: [
        "Serve at least 99% of storefront requests at the expected peak.",
        `Policy: keep ${QUIET.headroom * 100}% headroom above the expected peak, and never fewer than 2 instances.`,
        `Cost ceiling: ${QUIET.ceiling} credits for the ${QUIET.hours}-hour overnight window. Every running instance is billed.`,
      ],
      focus: "storefront",
      adjustable: [{ service: "storefront", min: 2, max: 8, card: "rightsize", title: "Right-size: Storefront", blurb: "Set how many Storefront instances run in this window." }],
      demandNow: QUIET.now,
      demandPeak: QUIET.peak,
      headroom: QUIET.headroom,
      minAvailability: 0.99,
      windowHours: QUIET.hours,
      costCeiling: QUIET.ceiling,
      evidence: [
        {
          id: "quiet-demand",
          source: "chip",
          icon: "demand",
          title: "Storefront demand",
          lines: [
            `Now: ${n(QUIET.now)} rps.`,
            `${START.storefront} instances × ${STOREFRONT.unitCapacity} rps each = ${n(START.storefront * STOREFRONT.unitCapacity)} rps of capacity.`,
          ],
        },
        {
          id: "quiet-forecast",
          source: "chip",
          icon: "forecast",
          title: "Morning forecast",
          lines: ["A promotional email goes out before this window ends.", `Expected peak inside the window: ${n(QUIET.peak)} rps.`],
          reveals: "peak",
        },
        {
          id: "quiet-cost",
          source: "chip",
          icon: "cost",
          title: "Storefront cost",
          lines: [
            `${START.storefront} instances × ${STOREFRONT.unitCost} credits = ${START.storefront * STOREFRONT.unitCost} credits per hour.`,
            "Instances are billed while they run, whether they are busy or idle.",
          ],
        },
      ],
      justifications: [
        {
          id: "peak-plus-headroom",
          text: "Capacity is far above the expected peak plus the required headroom, so instances can come down to that level.",
          valid: true,
          fits: ["down:storefront", "meets-headroom"],
          feedback: "Sizing to the expected peak plus headroom removes waste without betting on the quietest moment.",
        },
        {
          id: "extra-margin",
          text: "Reduce, but keep some margin beyond the minimum because a forecast can be wrong.",
          valid: true,
          fits: ["down:storefront", "meets-headroom"],
          feedback: "A defensible trade: a little more cost for more room if the forecast is low. The headroom rule already includes some of that margin.",
        },
        {
          id: "match-now",
          text: "Demand is low right now, so capacity should match what is being used right now.",
          valid: false,
          fits: [],
          feedback: "Right-sizing looks at the expected peak in the window plus headroom, not at the quietest reading.",
        },
        {
          id: "idle-is-free",
          text: "Idle instances cost nothing until traffic arrives, so there is nothing to save.",
          valid: false,
          fits: [],
          feedback: "On IaaS you pay for instances while they run, whether or not they serve traffic.",
        },
      ],
      responsibility: "The provider bills for what you keep running. Choosing how much to run, and accepting the availability risk of running less, stays with the customer.",
      connection: "Balancing availability and cost means sizing to expected demand plus stated headroom: enough to stay available, no more than you can justify.",
    },
    {
      id: "access",
      kind: "access",
      station: "ap-southeast",
      title: "Access review",
      goal: "Fit the account to its task",
      brief: "A review flagged svc-backup-runner in AP-SOUTHEAST. It holds more permissions than its stated task appears to need.",
      requirements: ["The account must still be able to do its stated task.", "Policy: an account holds only the permissions its stated task needs (least privilege)."],
      account: "svc-backup-runner",
      statedTask: "Copy nightly analytics snapshots to the archive.",
      ticketPermissions: ["snapshots:read", "archive:write"],
      requiredPermissions: ["snapshots:read", "archive:write", "keys:use"],
      permissions: [
        { id: "snapshots:read", allows: "read analytics snapshots", lastUsed: "last night", neededFor: "to read the snapshots it copies." },
        { id: "archive:write", allows: "write new objects to the archive", lastUsed: "last night", neededFor: "to store each copy in the archive." },
        { id: "keys:use", allows: "use the snapshot encryption key", lastUsed: "last night", neededFor: "because snapshots are encrypted and cannot be read without the key." },
        { id: "archive:delete", allows: "delete archived backups", lastUsed: "never" },
        { id: "snapshots:delete", allows: "delete analytics snapshots", lastUsed: "never" },
        { id: "iam:manage", allows: "create accounts and change permissions", lastUsed: "never" },
        { id: "analytics:query", allows: "query customer analytics data", lastUsed: "212 days ago" },
      ],
      inspect: { title: "Inspect dependency", blurb: "Trace what the backup job relies on to read a snapshot." },
      evidence: [
        {
          id: "access-ticket",
          source: "chip",
          icon: "ticket",
          title: "Change ticket",
          lines: [
            "svc-backup-runner — stated task: “Copy nightly analytics snapshots to the archive.”",
            "The ticket names snapshots:read and archive:write.",
            "Old archives are removed by the archive's own retention rule, not by this account.",
          ],
        },
        {
          id: "access-inventory",
          source: "chip",
          icon: "keys",
          title: "Permission inventory",
          lines: ["The account holds 7 permissions.", "They include deleting backups and managing other accounts."],
        },
        {
          id: "access-log",
          source: "chip",
          icon: "log",
          title: "Access log, last 90 days",
          lines: ["Used nightly: snapshots:read, archive:write, keys:use.", "Not used in 90 days: archive:delete, snapshots:delete, iam:manage, analytics:query."],
          reveals: "usage",
        },
        {
          id: "access-dependency",
          source: "inspect",
          icon: "link",
          title: "Dependency: snapshot encryption",
          lines: ["Analytics snapshots are encrypted with the key analytics-backup-key.", "Reading a snapshot requires keys:use on that key. The ticket does not mention it."],
          reveals: "usage",
        },
      ],
      justifications: [
        {
          id: "task-only",
          text: "Keep only what the backup task actually uses, and remove the rest.",
          valid: true,
          fits: ["narrowed", "removes-excess", "keeps-required"],
          feedback: "That is least privilege: the task defines the permissions, and evidence of use confirms what the task needs.",
        },
        {
          id: "ticket-only",
          text: "Remove everything the ticket does not name.",
          valid: false,
          fits: [],
          feedback: "A ticket states the goal, not every call the job makes. Check usage or dependencies before removing access.",
        },
        {
          id: "provider-secures",
          text: "The provider secures accounts on its platform, so these permissions are acceptable.",
          valid: false,
          fits: [],
          feedback: "The provider supplies the access-control system. Who holds which permission is the customer's configuration in every service model.",
        },
        {
          id: "unused-harmless",
          text: "Permissions the job never uses are harmless, so nothing needs to change.",
          valid: false,
          fits: [],
          feedback: "An unused permission still works for anyone who obtains the account's credentials.",
        },
      ],
      responsibility: "Identity and access configuration belongs to the customer in every cloud service model. The provider runs the access-control system; you decide what each account may do.",
      connection: "Least privilege means the task sets the permissions. Narrowing access is only correct if the authorised task still works afterwards.",
    },
  ],
};
