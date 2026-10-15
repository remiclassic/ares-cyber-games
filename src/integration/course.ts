// MOCK course context. The real module, objectives, and mission text must come
// from the selected Ares course owner — replace this object (or have the host
// pass it in via `ares:practice:init`) before any learner sees it.
export const COURSE_CONTEXT = {
  mock: true,
  courseTitle: "Network Defense Fundamentals",
  moduleTitle: "Module 3 — Access Control and Availability",
  activityId: "ares-network-defense/keep-finance-online/v0.1",
  missionTitle: "Mission: Hold the Perimeter",
  moduleObjectives: [
    "Trace how requests reach a service and what that service depends on.",
    "Write access rules that match policy without blocking required business.",
    "Restore availability without weakening security controls.",
  ],
  studyMaterial: [
    { kind: "Reading", title: "Routes, dependencies, and availability", minutes: 8 },
    { kind: "Reading", title: "Access control lists: source, destination, service", minutes: 10 },
    { kind: "Video", title: "Segmentation and trust boundaries", minutes: 6 },
  ],
  // Keyed by round id; shown in the debrief as "mission connection".
  missionConnections: {
    establish:
      "In the mission you'll restore services whose dependencies are scattered across zones — check what each service needs before you connect it.",
    review:
      "In the mission, perimeter alerts mix real partners with hostile probes. Inspect first, then deny only what the rules of engagement forbid.",
    recover:
      "In the mission, a failed link forces you to reroute under pressure. Your access rules must hold on every path you add.",
  } as Record<string, string>,
} as const;
