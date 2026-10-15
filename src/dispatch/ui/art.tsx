import type { AnalystId, DeptId, Mood, PersonId } from "../sim/types";

// All art is inline SVG drawn here, so there are no image files to license or load.

type Look = { skin: string; hair: string; style: "bun" | "short" | "long"; top: string; glasses?: boolean; beard?: boolean; headset?: boolean };

const LOOKS: Record<PersonId | AnalystId, Look> = {
  priya: { skin: "#c68a62", hair: "#1c1922", style: "bun", top: "#5b6178", glasses: true },
  daniel: { skin: "#e3b18d", hair: "#5b3a25", style: "short", top: "#3b5c8e", glasses: true, beard: true },
  elena: { skin: "#e9c0a1", hair: "#6d4731", style: "long", top: "#7d8cab" },
  alex: { skin: "#a8734e", hair: "#18161b", style: "short", top: "#2b4b80", glasses: true, beard: true, headset: true },
  jamie: { skin: "#f1c8a8", hair: "#b6562c", style: "long", top: "#3c6c6c", glasses: true },
};

const BROWS: Record<Mood, [number, number]> = { neutral: [37.5, 37], worried: [39.5, 35.5], relieved: [37, 37], annoyed: [36, 39.5], alarmed: [34, 32.5] };

export function Portrait({ who, mood = "neutral", className }: { who: PersonId | AnalystId; mood?: Mood; className?: string }) {
  const look = LOOKS[who];
  const [outer, inner] = BROWS[mood];
  const eye = mood === "alarmed" ? 3 : 2.3;
  const shade = "rgba(40,20,10,0.22)";
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`bg-${who}`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor="#3b5a94" />
          <stop offset="1" stopColor="#14213f" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" rx="14" fill={`url(#bg-${who})`} />
      {look.style === "long" && <path d="M27 44 Q24 16 50 15 Q76 16 73 44 Q80 62 74 82 L26 82 Q20 62 27 44Z" fill={look.hair} />}
      {look.style === "bun" && <circle cx="50" cy="15" r="10" fill={look.hair} />}
      <path d="M8 100 Q10 76 36 71 L64 71 Q90 76 92 100Z" fill={look.top} />
      <path d="M36 71 Q50 84 64 71 L60 69 L40 69Z" fill="rgba(0,0,0,0.25)" />
      <rect x="43" y="58" width="14" height="16" rx="5" fill={look.skin} />
      <rect x="43" y="62" width="14" height="6" fill={shade} />
      <ellipse cx="50" cy="44" rx="19" ry="22" fill={look.skin} />
      <ellipse cx="31" cy="46" rx="3" ry="5" fill={look.skin} />
      <ellipse cx="69" cy="46" rx="3" ry="5" fill={look.skin} />
      {look.beard && <path d="M32 48 Q33 68 50 68 Q67 68 68 48 Q64 58 57 58 Q50 55 43 58 Q36 58 32 48Z" fill={look.hair} opacity="0.92" />}
      {look.style === "short" ? (
        <path d="M30 42 Q27 19 50 19 Q73 19 70 42 Q67 30 58 29 Q44 31 36 29 Q32 33 30 42Z" fill={look.hair} />
      ) : (
        <path d="M30 44 Q27 20 50 20 Q73 20 70 44 Q66 31 52 29 Q40 36 30 44Z" fill={look.hair} />
      )}
      <line x1="36" y1={outer} x2="46" y2={inner} stroke={look.hair} strokeWidth="2.4" strokeLinecap="round" />
      <line x1="64" y1={outer} x2="54" y2={inner} stroke={look.hair} strokeWidth="2.4" strokeLinecap="round" />
      {mood === "alarmed" && (
        <>
          <circle cx="42" cy="45" r="4.4" fill="#fff" />
          <circle cx="58" cy="45" r="4.4" fill="#fff" />
        </>
      )}
      {mood === "relieved" ? (
        <>
          <path d="M39 45 Q42 42 45 45" stroke="#2a1c18" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M55 45 Q58 42 61 45" stroke="#2a1c18" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="42" cy="45" r={eye} fill="#2a1c18" />
          <circle cx="58" cy="45" r={eye} fill="#2a1c18" />
        </>
      )}
      {look.glasses && (
        <g fill="rgba(180,220,255,0.12)" stroke="#11131c" strokeWidth="1.8">
          <circle cx="42" cy="45" r="7.2" />
          <circle cx="58" cy="45" r="7.2" />
          <path d="M49.2 45 H50.8" />
        </g>
      )}
      {mood === "neutral" && <path d="M44 57 Q50 59 56 57" stroke="#7a3b32" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {mood === "worried" && <path d="M44 59 Q50 55 56 59" stroke="#7a3b32" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {mood === "relieved" && <path d="M43 55 Q50 62 57 55" stroke="#7a3b32" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      {mood === "annoyed" && <path d="M44 58 L56 56.5" stroke="#7a3b32" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      {mood === "alarmed" && <ellipse cx="50" cy="58" rx="3.4" ry="4.4" fill="#5c2620" />}
      {look.headset && (
        <g>
          <path d="M29 44 Q28 17 50 17 Q72 17 71 44" fill="none" stroke="#0e1422" strokeWidth="3.4" />
          <rect x="25" y="40" width="7" height="13" rx="3" fill="#0e1422" />
          <path d="M28 52 Q30 62 42 61" fill="none" stroke="#0e1422" strokeWidth="2" />
          <circle cx="43" cy="61" r="2" fill="#38d6ff" />
        </g>
      )}
    </svg>
  );
}

export function Mascot({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true" focusable="false">
      <line x1="30" y1="8" x2="30" y2="15" stroke="#38d6ff" strokeWidth="2.5" />
      <circle cx="30" cy="7" r="3.5" fill="#7fe6ff" />
      <rect x="8" y="14" width="44" height="30" rx="12" fill="#2f7dff" />
      <rect x="13" y="19" width="34" height="20" rx="8" fill="#0a1830" />
      <circle cx="23" cy="28" r="3.6" fill="#7fe6ff" />
      <circle cx="37" cy="28" r="3.6" fill="#7fe6ff" />
      <path d="M24 34 Q30 38 36 34" stroke="#7fe6ff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="20" y="45" width="20" height="11" rx="5" fill="#2468d8" />
      <rect x="3" y="24" width="6" height="11" rx="3" fill="#2468d8" />
      <rect x="51" y="24" width="6" height="11" rx="3" fill="#2468d8" />
    </svg>
  );
}

// ---------- company map ----------

export type DeptStatus = "calm" | "report" | "harm" | "resolved";

const DEPTS: { id: DeptId; label: string; x: number; y: number }[] = [
  { id: "finance", label: "Finance", x: 92, y: 60 },
  { id: "hr", label: "HR", x: 268, y: 60 },
  { id: "marketing", label: "Marketing", x: 180, y: 112 },
  { id: "product", label: "Product", x: 92, y: 164 },
  { id: "it", label: "IT", x: 268, y: 164 },
];

const STATUS: Record<DeptStatus, { color: string; glyph: string; text: string }> = {
  calm: { color: "#39e38b", glyph: "", text: "no reports" },
  report: { color: "#ffb347", glyph: "!", text: "report open" },
  harm: { color: "#ff5d6c", glyph: "×", text: "impact confirmed" },
  resolved: { color: "#39e38b", glyph: "✓", text: "report handled" },
};

const W = 68;
const H = 38;
const DEPTH = 9;

export function CompanyMap({ status, focus }: { status: Record<DeptId, DeptStatus>; focus: DeptId | null }) {
  const summary = DEPTS.map((d) => `${d.label}: ${STATUS[status[d.id]].text}`).join(". ");
  return (
    <svg className="cd-map" viewBox="0 0 360 222" role="img" aria-label={`Company map. ${summary}.`}>
      {DEPTS.map((d) => {
        const st = STATUS[status[d.id]];
        const active = focus === d.id;
        const top = `M${d.x} ${d.y - H} L${d.x + W} ${d.y} L${d.x} ${d.y + H} L${d.x - W} ${d.y}Z`;
        return (
          <g key={d.id} className={`cd-room ${status[d.id]}${active ? " focus" : ""}`}>
            <path d={`M${d.x - W} ${d.y} L${d.x} ${d.y + H} L${d.x} ${d.y + H + DEPTH} L${d.x - W} ${d.y + DEPTH}Z`} fill="#0d1a36" />
            <path d={`M${d.x + W} ${d.y} L${d.x} ${d.y + H} L${d.x} ${d.y + H + DEPTH} L${d.x + W} ${d.y + DEPTH}Z`} fill="#122449" />
            <path d={top} fill={active ? "#2a4680" : "#1c315e"} stroke={active ? "#ffb347" : "#3f65b0"} strokeWidth={active ? 2 : 1} />
            {[-1, 0, 1].map((i) => (
              <g key={i} transform={`translate(${d.x + i * 23} ${d.y + 8 - Math.abs(i) * 4})`}>
                <path d="M0 -7 L13 0 L0 7 L-13 0Z" fill="#35518c" />
                <path d="M-13 0 L0 7 L0 11 L-13 4Z" fill="#22386a" />
                <path d="M13 0 L0 7 L0 11 L13 4Z" fill="#2a4379" />
                <rect x="-3" y="-11" width="6" height="5" fill="#7fd0ff" opacity="0.8" />
              </g>
            ))}
            <circle className="cd-beacon-ring" cx={d.x} cy={d.y - 20} r="11" fill="none" stroke={st.color} strokeWidth="2" opacity="0.5" />
            <circle cx={d.x} cy={d.y - 20} r="8" fill={st.color} />
            <text x={d.x} y={d.y - 16} textAnchor="middle" fontSize="12" fontWeight="800" fill="#08101f">{st.glyph}</text>
            <rect x={d.x - 34} y={d.y - 48} width="68" height="17" rx="5" fill="rgba(6,12,26,0.85)" stroke="rgba(120,160,255,0.35)" />
            <text x={d.x} y={d.y - 36} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#eaf2ff">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
