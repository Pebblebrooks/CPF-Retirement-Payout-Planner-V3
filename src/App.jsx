import { useState } from "react";

// ── Design tokens (mirrors app's CSS vars) ─────────────────────────────────
const T = {
  bgBase:   "#060d1f",
  bgPanel:  "#0d1b2e",
  bgInput:  "#162032",
  bgMuted:  "rgba(22,32,50,0.6)",
  border:   "#1f3050",
  borderMd: "#2d4a6e",
  textMain: "#e8f0fe",
  textMuted:"#94a3b8",
  textSub:  "#4a6285",
  textBrt:  "#ffffff",
  green:    "#10b981",
  blue:     "#3b82f6",
  amber:    "#f59e0b",
  red:      "#ef4444",
  purple:   "#8b5cf6",
  cyan:     "#06b6d4",
  emerald:  "#34d399",
};

// ── Sample data ─────────────────────────────────────────────────────────────
const D = {
  currentAge: 40, payoutAge: 65, planningHorizon: 90, isMale: true,
  score: 59, scoreLabel: "Needs Attention",
  frsRatio: 72, incomeRatio: 47, downsideRisk: 61, longevityCoverage: 78,
  totalCPF: 520000, monthlyPayout: 1420, incomeCoverage: 47, target: 3000,
  p10CPF: 429000, oaDepletes: 79, oaGap: 11,
  raAtPA: 320000, projBRS: 223000, projFRS: 446000, projERS: 669000,
  brsBarPct: 100, frsBarPct: 72, ersBarPct: 48,
  standardPay: 1420, escalatingPay: 1295, basicPay: 1070,
  oaBal: 85000, saBal: 62000, maBal: 35000,
  cpfLifeMonthly: 1420, oaDrawMonthly: 790, srsMonthly: 310, privateMonthly: 480,
  breakEvenStdEsc: 83, lifeExpMale: 85,
  nominated: false, nominationPct: 0,
  nominalMode: "nominal",
};

const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(n%1000===0?0:0)}k`.replace(/\.0k/,"k") : `$${n}`;
const fmtFull = (n) => `$${n.toLocaleString()}`;

// ── Reusable atoms ───────────────────────────────────────────────────────────
const Card = ({ style, children, glow }) => (
  <div style={{
    background: T.bgPanel, border: `1px solid ${T.border}`,
    borderRadius: 14, padding: "16px 18px",
    boxShadow: glow ? `0 0 0 1px ${T.green}33, 0 4px 20px #00000040` : "0 2px 12px #00000030",
    ...style,
  }}>{children}</div>
);

const Label = ({ children, style }) => (
  <p style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.07em",
    textTransform: "uppercase", margin: "0 0 6px", ...style }}>{children}</p>
);

const BigNum = ({ children, color }) => (
  <p style={{ fontSize: 24, fontWeight: 800, color: color || T.textBrt,
    letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>{children}</p>
);

const NewBadge = () => (
  <span style={{ fontSize: 9, fontWeight: 800, color: T.bgBase,
    background: T.green, borderRadius: 4, padding: "2px 6px",
    letterSpacing: "0.06em", marginLeft: 7, verticalAlign: "middle" }}>✦ NEW</span>
);

const MiniBar = ({ pct, color, height = 5 }) => (
  <div style={{ height, borderRadius: 99, background: T.border, overflow: "hidden", marginTop: 4 }}>
    <div style={{ height: "100%", width: `${Math.min(100,pct)}%`, borderRadius: 99,
      background: color, transition: "width 0.6s ease" }} />
  </div>
);

const ScoreColor = (s) => s >= 75 ? T.green : s >= 50 ? T.amber : T.red;
const ScoreLabel = (s) => s >= 75 ? "On Track" : s >= 50 ? "Needs Attention" : "At Risk";

// ── Gauge ────────────────────────────────────────────────────────────────────
const Gauge = ({ score }) => {
  const cx = 110, cy = 88, r = 70;
  const arc = (pct) => {
    const clamp = Math.min(1, Math.max(0, pct / 100));
    if (clamp <= 0) return "";
    const sa = Math.PI, ea = Math.PI + Math.PI * clamp;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const color = ScoreColor(score);
  // Tick marks
  const ticks = [0, 25, 50, 75, 100].map(p => {
    const a = Math.PI + Math.PI * (p / 100);
    const ri = r + 4, ro = r + 10;
    return { x1: cx + ri * Math.cos(a), y1: cy + ri * Math.sin(a), x2: cx + ro * Math.cos(a), y2: cy + ro * Math.sin(a), p };
  });
  return (
    <svg width="220" height="108" viewBox="0 0 220 108" style={{ overflow: "visible" }}>
      {/* Zone bands */}
      <path d={arc(50)} fill="none" stroke="#ef444420" strokeWidth="12" strokeLinecap="butt" />
      <path d={arc(100)} fill="none" stroke="transparent" strokeWidth="0" />
      {/* Track */}
      <path d={arc(100)} fill="none" stroke={T.border} strokeWidth="10" strokeLinecap="round" />
      {/* Fill with gradient glow */}
      <path d={arc(score)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }} />
      {/* Tick marks */}
      {ticks.map(t => (
        <line key={t.p} x1={t.x1.toFixed(1)} y1={t.y1.toFixed(1)}
          x2={t.x2.toFixed(1)} y2={t.y2.toFixed(1)}
          stroke={T.textSub} strokeWidth="1.5" strokeLinecap="round" />
      ))}
      {/* Score */}
      <text x="110" y="78" textAnchor="middle"
        style={{ fontSize: 36, fontWeight: 800, fill: color, fontFamily: "system-ui" }}>{score}</text>
      <text x="110" y="96" textAnchor="middle"
        style={{ fontSize: 10, fontWeight: 700, fill: T.textMuted, letterSpacing: "0.07em", fontFamily: "system-ui" }}>
        / 100 · {ScoreLabel(score).toUpperCase()}
      </text>
    </svg>
  );
};

// ── Donut ─────────────────────────────────────────────────────────────────────
const Donut = ({ oa, sa, ma }) => {
  const total = oa + sa + ma;
  if (!total) return null;
  const slices = [
    { v: oa, color: T.blue, label: "OA" },
    { v: sa, color: T.green, label: "SA" },
    { v: ma, color: T.purple, label: "MA" },
  ];
  let cum = -90;
  const paths = slices.map(s => {
    const pct = s.v / total, deg = pct * 360;
    const sa2 = cum, ea = cum + deg; cum += deg;
    const r = 44, cx = 56, cy = 56;
    const toR = d => d * Math.PI / 180;
    if (deg >= 359.9) return { ...s, d: `M ${cx+r} ${cy} A ${r} ${r} 0 1 1 ${cx+r-0.01} ${cy}`, pct };
    const x1 = cx + r*Math.cos(toR(sa2)), y1 = cy + r*Math.sin(toR(sa2));
    const x2 = cx + r*Math.cos(toR(ea)),  y2 = cy + r*Math.sin(toR(ea));
    return { ...s, d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${deg>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`, pct };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth="13" strokeLinecap="butt" />)}
        <circle cx="56" cy="56" r="31" fill={T.bgPanel} />
        <text x="56" y="51" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: T.textMuted, fontFamily: "system-ui" }}>TOTAL</text>
        <text x="56" y="66" textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: T.textBrt, fontFamily: "system-ui" }}>{fmt(D.oaBal+D.saBal+D.maBal)}</text>
      </svg>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: p.color }} />
              <span style={{ fontSize: 11, color: T.textMuted }}>{p.label}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textMain }}>{Math.round(p.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Income Waterfall ──────────────────────────────────────────────────────────
const IncomeWaterfall = () => {
  const items = [
    { label: "CPF LIFE", amount: D.cpfLifeMonthly, color: T.green },
    { label: "OA Draw", amount: D.oaDrawMonthly,   color: T.blue },
    { label: "SRS",     amount: D.srsMonthly,       color: T.purple },
    { label: "Private", amount: D.privateMonthly,   color: T.cyan },
  ];
  const total = items.reduce((s, i) => s + i.amount, 0);
  const pctOfTarget = Math.round((total / D.target) * 100);
  const col = pctOfTarget >= 100 ? T.green : pctOfTarget >= 70 ? T.amber : T.red;
  let cumPct = 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: col }}>{pctOfTarget}%</span>
        <span style={{ fontSize: 11, color: T.textSub }}>of ${D.target.toLocaleString()}/mo target</span>
      </div>
      {/* Stacked bar */}
      <div style={{ height: 20, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 14, background: T.border }}>
        {items.map((item) => {
          const w = (item.amount / D.target) * 100;
          cumPct += w;
          return (
            <div key={item.label} title={`${item.label}: $${item.amount}/mo`}
              style={{ width: `${Math.min(w, 100)}%`, background: item.color,
                borderRight: `1px solid ${T.bgPanel}`, transition: "width 0.5s ease" }} />
          );
        })}
        {/* Gap to target */}
        {cumPct < 100 && (
          <div style={{ flex: 1, background: `repeating-linear-gradient(45deg, ${T.bgInput}, ${T.bgInput} 3px, ${T.border} 3px, ${T.border} 6px)` }}
            title={`Gap: $${(D.target - total).toLocaleString()}/mo`} />
        )}
      </div>
      {/* Target line marker */}
      <div style={{ position: "relative", marginBottom: 6 }}>
        <div style={{ position: "absolute", left: `${Math.min(cumPct, 100)}%`, top: -26, transform: "translateX(-50%)",
          fontSize: 9, color: col, fontWeight: 700, whiteSpace: "nowrap" }}>
          ▲ ${total.toLocaleString()}/mo
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 4 }}>
        {items.map(item => (
          <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "4px 8px", borderRadius: 6, background: T.bgInput }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: item.color }} />
              <span style={{ fontSize: 10, color: T.textMuted }}>{item.label}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textMain }}>${item.amount}/mo</span>
          </div>
        ))}
      </div>
      {total < D.target && (
        <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 7, background: `${T.amber}15`,
          border: `1px solid ${T.amber}40`, fontSize: 11, color: T.amber, display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚠</span>
          <span>Gap of <strong>${(D.target - total).toLocaleString()}/mo</strong> — increase SRS or private savings to close</span>
        </div>
      )}
    </div>
  );
};

// ── Life Milestone Timeline ───────────────────────────────────────────────────
const MilestoneTimeline = () => {
  const events = [
    { age: 40, label: "Today",        sub: "Age 40",           type: "current",  icon: "●" },
    { age: 50, label: "SA Lock-in",   sub: "No OA→SA after 55",type: "info",     icon: "🔒" },
    { age: 55, label: "RA Forms",     sub: "OA + SA → RA",     type: "milestone",icon: "⭕" },
    { age: 65, label: "LIFE Starts",  sub: "$1,420/mo",        type: "success",  icon: "✓" },
    { age: 79, label: "OA Depletes",  sub: "11-yr gap risk",   type: "danger",   icon: "⚠" },
    { age: 85, label: "Life Exp.",    sub: "Male median",      type: "info",     icon: "◇" },
    { age: 90, label: "Horizon",      sub: "Planning end",     type: "muted",    icon: "◈" },
  ];
  const minAge = 38, maxAge = 92;
  const pct = (age) => ((age - minAge) / (maxAge - minAge)) * 100;
  const typeColor = { current: T.blue, milestone: T.emerald, success: T.green, danger: T.red, info: T.cyan, muted: T.textSub };

  return (
    <div style={{ position: "relative", paddingBottom: 52, paddingTop: 32 }}>
      {/* Axis line */}
      <div style={{ position: "absolute", top: 46, left: 0, right: 0, height: 2,
        background: `linear-gradient(to right, ${T.border}, ${T.borderMd}, ${T.border})`, borderRadius: 99 }} />
      {/* Events */}
      {events.map((e, i) => {
        const left = `${pct(e.age)}%`;
        const above = i % 2 === 0;
        const color = typeColor[e.type];
        return (
          <div key={e.age} style={{ position: "absolute", left, transform: "translateX(-50%)" }}>
            {/* Label above */}
            {above && (
              <div style={{ textAlign: "center", marginBottom: 4, whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color }}>{e.label}</div>
                <div style={{ fontSize: 9, color: T.textSub }}>{e.sub}</div>
              </div>
            )}
            {/* Node */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
              width: 24, height: 24, borderRadius: "50%", marginTop: above ? 0 : 0,
              background: e.type === "current" ? color : T.bgPanel,
              border: `2px solid ${color}`,
              boxShadow: e.type !== "muted" ? `0 0 8px ${color}50` : "none",
              fontSize: 10, color, fontWeight: 800, position: "relative", top: 34 }}>
              {e.type === "danger" ? "!" : e.type === "success" ? "✓" : e.type === "current" ? "●" : "○"}
            </div>
            {/* Age label on axis */}
            <div style={{ textAlign: "center", marginTop: 34, fontSize: 9, fontWeight: 700,
              color: e.type === "current" ? T.textMain : T.textSub, whiteSpace: "nowrap" }}>
              {e.age}
            </div>
            {/* Label below */}
            {!above && (
              <div style={{ textAlign: "center", marginTop: 2, whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color }}>{e.label}</div>
                <div style={{ fontSize: 9, color: T.textSub }}>{e.sub}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Action Priority Queue ─────────────────────────────────────────────────────
const ActionQueue = ({ onNavigate }) => {
  const [applied, setApplied] = useState({});
  const actions = [
    { id: 1, impact: 11, label: "Top up SA by $18,600",       desc: "Closes 28% FRS gap · largest single score lever",      cta: "Apply",  tab: null,        urgent: true  },
    { id: 2, impact: 5,  label: "Switch to CPF LIFE Standard",desc: "Currently on Basic plan — Standard pays +$350/mo",       cta: "Go To",  tab: "life",      urgent: true  },
    { id: 3, impact: 4,  label: "Increase SRS by $8,000/yr",  desc: "Closes income gap · tax-deductible retirement buffer",   cta: "Apply",  tab: null,        urgent: false },
    { id: 4, impact: 2,  label: "Submit CPF nomination",       desc: "Estate readiness incomplete — no nomination on file",   cta: "Go To",  tab: "summary",   urgent: false },
  ];
  const scoreGain = actions.filter(a => !applied[a.id]).reduce((s, a) => s + a.impact, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: T.textSub }}>
          Complete all 4 actions to gain up to <strong style={{ color: T.green }}>+{scoreGain} pts</strong>
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textSub }}>IMPACT · ACTION</span>
      </div>
      {actions.map((a, i) => {
        const done = applied[a.id];
        return (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 14px", borderRadius: 10,
            background: done ? `${T.green}10` : a.urgent ? `${T.amber}0d` : T.bgInput,
            border: `1px solid ${done ? T.green + "40" : a.urgent ? T.amber + "30" : T.border}`,
            opacity: done ? 0.65 : 1, transition: "all 0.2s",
          }}>
            {/* Rank */}
            <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              background: done ? T.green : T.bgPanel, border: `1.5px solid ${done ? T.green : T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: done ? T.bgBase : T.textMuted }}>
              {done ? "✓" : i + 1}
            </div>
            {/* Impact pill */}
            <div style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 6,
              background: done ? T.green + "20" : `${T.green}20`,
              fontSize: 10, fontWeight: 800, color: done ? T.green : T.emerald, whiteSpace: "nowrap" }}>
              +{a.impact} pts
            </div>
            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: done ? T.textMuted : T.textMain,
                textDecoration: done ? "line-through" : "none" }}>{a.label}</div>
              <div style={{ fontSize: 10, color: T.textSub, marginTop: 1 }}>{a.desc}</div>
            </div>
            {/* CTA */}
            {!done && (
              <button onClick={() => { if (a.tab) onNavigate(a.tab); else setApplied(p => ({ ...p, [a.id]: true })); }}
                style={{
                  flexShrink: 0, padding: "5px 12px", borderRadius: 7,
                  background: a.urgent ? T.amber : T.blue + "25",
                  border: `1px solid ${a.urgent ? T.amber + "80" : T.blue + "50"}`,
                  color: a.urgent ? T.bgBase : T.blue,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                {a.cta} {a.tab ? "→" : ""}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export default function ReadinessMockup() {
  const [plan, setPlan] = useState("standard");
  const [tab, setTab] = useState(null); // simulated nav

  const plans = [
    { key: "standard",   label: "Standard",   pay: D.standardPay,   desc: "Balanced payout, moderate bequest" },
    { key: "escalating", label: "Escalating", pay: D.escalatingPay, desc: "Lower start, rises 2%/yr" },
    { key: "basic",      label: "Basic",      pay: D.basicPay,      desc: "Highest bequest, lowest payout" },
  ];
  const rsBars = [
    { label: "BRS", pct: D.brsBarPct, target: D.projBRS },
    { label: "FRS", pct: D.frsBarPct, target: D.projFRS },
    { label: "ERS", pct: D.ersBarPct, target: D.projERS },
  ];
  const subScores = [
    { label: "FRS Coverage",       pct: D.frsRatio,         tip: `RA $${D.raAtPA.toLocaleString()} vs projected FRS $${D.projFRS.toLocaleString()}`, isNew: false },
    { label: "Income Coverage",    pct: D.incomeRatio,      tip: `$1,420/mo CPF LIFE vs $3,000/mo target`, isNew: false },
    { label: "Downside (P10)",     pct: D.downsideRisk,     tip: `Bad-luck scenario CPF: $429k vs base $520k (−17%)`, isNew: true },
    { label: "Longevity Cover",    pct: D.longevityCoverage, tip: `Income covers to age 82 vs male median 85`, isNew: true },
  ];

  const mainColor = ScoreColor(D.score);

  const sectionHead = (title, isNew = false) => (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.07em", textTransform: "uppercase" }}>{title}</span>
      {isNew && <NewBadge />}
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: T.bgBase,
      minHeight: "100vh", padding: "20px 16px 40px", color: T.textMain, boxSizing: "border-box" }}>

      {/* ── Watermark banner ── */}
      <div style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 8,
        background: `${T.blue}15`, border: `1px solid ${T.blue}40`,
        fontSize: 11, color: T.blue, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>🖼</span>
        <span><strong>Mockup</strong> — static data, age 40 → payout 65.
          <span style={{ color: T.textSub, marginLeft: 6 }}>
            Panels with <span style={{ background: T.green, color: T.bgBase, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 800 }}>✦ NEW</span> are proposed additions.
            All other panels already exist in the app.
          </span>
        </span>
      </div>

      {/* ══ ROW 1: Gauge + 5 KPI cards ════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 12, marginBottom: 12 }}>

        {/* Gauge — enhanced with 4 sub-scores */}
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <Label>Retirement Readiness</Label>
          <Gauge score={D.score} />
          <div style={{ width: "100%", marginTop: 6, display: "flex", flexDirection: "column", gap: 7 }}>
            {subScores.map(({ label, pct, tip, isNew }) => (
              <div key={label} title={tip}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: T.textMuted }}>
                    {label}{isNew && <NewBadge />}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800,
                    color: pct >= 75 ? T.green : pct >= 50 ? T.amber : T.red }}>{pct}%</span>
                </div>
                <MiniBar pct={pct} color={pct >= 75 ? T.green : pct >= 50 ? T.amber : T.red} />
              </div>
            ))}
          </div>
        </Card>

        {/* 5-card KPI hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
          {/* Existing 3 */}
          {[
            { label: `Total CPF at ${D.payoutAge}`, sub: "nominal", value: fmtFull(D.totalCPF), color: T.blue, isNew: false },
            { label: "Standard plan payout",         sub: "monthly CPF LIFE", value: `$${D.monthlyPayout.toLocaleString()}/mo`, color: T.green, isNew: false },
            { label: "Income coverage",              sub: `vs $${D.target.toLocaleString()}/mo`, value: `${D.incomeCoverage}%`, color: T.amber, isNew: false },
          ].map(({ label, sub, value, color, isNew }) => (
            <Card key={label} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Label>{label}{isNew && <NewBadge />}</Label>
              <BigNum color={color}>{value}</BigNum>
              {sub && <p style={{ fontSize: 10, color: T.textSub, margin: "3px 0 0" }}>{sub}</p>}
            </Card>
          ))}
          {/* NEW: P10 Downside */}
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Label>P10 Downside<NewBadge /></Label>
            <BigNum color={T.amber}>{fmtFull(D.p10CPF)}</BigNum>
            <p style={{ fontSize: 10, color: T.textSub, margin: "3px 0 0" }}>bad-luck scenario</p>
            <div style={{ marginTop: 6, fontSize: 10, color: T.red, fontWeight: 700 }}>
              −{Math.round((1 - D.p10CPF/D.totalCPF)*100)}% vs base
            </div>
          </Card>
          {/* NEW: OA Depletion */}
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center", borderColor: T.red + "60" }}>
            <Label>OA Depletes<NewBadge /></Label>
            <BigNum color={T.red}>Age {D.oaDepletes}</BigNum>
            <p style={{ fontSize: 10, color: T.textSub, margin: "3px 0 0" }}>drawdown exhausted</p>
            <div style={{ marginTop: 6, padding: "3px 7px", borderRadius: 5, background: `${T.red}18`,
              fontSize: 10, color: T.red, fontWeight: 700, display: "inline-block" }}>
              ⚠ {D.oaGap}-yr income gap
            </div>
          </Card>
        </div>
      </div>

      {/* ══ ROW 2: Plan comparison | RS bars | Income waterfall ═══════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>

        {/* Existing: CPF LIFE plan comparison */}
        <Card>
          {sectionHead("CPF LIFE Plan Comparison")}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {plans.map(({ key, label, pay, desc }) => {
              const active = plan === key;
              return (
                <button key={key} onClick={() => setPlan(key)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 12px", borderRadius: 9, cursor: "pointer", textAlign: "left", width: "100%",
                  background: active ? `${T.green}18` : T.bgInput,
                  border: `1.5px solid ${active ? T.green : "transparent"}`,
                  transition: "all 0.15s",
                }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? T.green : T.textMain }}>{label}</span>
                    <span style={{ fontSize: 10, color: T.textSub, marginLeft: 6 }}>{desc}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: active ? T.green : T.textMain, whiteSpace: "nowrap", marginLeft: 8 }}>
                    ${pay.toLocaleString()}/mo
                  </span>
                </button>
              );
            })}
            {/* NEW: Longevity risk note */}
            <div style={{ marginTop: 4, padding: "7px 10px", borderRadius: 7,
              background: `${T.cyan}12`, border: `1px solid ${T.cyan}30`,
              fontSize: 10, color: T.cyan, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>Longevity risk</span>
              <NewBadge />
              <span style={{ display: "block", marginTop: 2, color: T.textSub }}>
                Standard vs Escalating break-even: <strong style={{ color: T.cyan }}>Age {D.breakEvenStdEsc}</strong>.
                Male median life expectancy: <strong style={{ color: T.cyan }}>85</strong> — switch before 55.
              </span>
            </div>
          </div>
        </Card>

        {/* Existing: Retirement sums bars */}
        <Card>
          {sectionHead(`RA vs Retirement Sums at Age ${D.payoutAge}`)}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rsBars.map(({ label, pct, target }) => {
              const c = pct >= 100 ? T.green : pct >= 60 ? T.amber : T.red;
              return (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                      {label} <span style={{ fontSize: 10, color: T.textSub }}>({fmtFull(target)})</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: c }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 6, background: T.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, pct)}%`,
                      borderRadius: 6, background: c, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 10, color: T.textSub, marginTop: 2 }}>
              Projected RA at {D.payoutAge}: <strong style={{ color: T.textMain }}>{fmtFull(D.raAtPA)}</strong>
              {" · "}FRS growth 3%/yr
            </p>
          </div>
        </Card>

        {/* NEW: Income waterfall */}
        <Card glow>
          {sectionHead("Retirement Income Waterfall", true)}
          <IncomeWaterfall />
        </Card>
      </div>

      {/* ══ ROW 3: Allocation donut | Milestones | (mini estate card) ══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 200px", gap: 12, marginBottom: 12 }}>

        {/* Existing: Allocation donut */}
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {sectionHead("Current Allocation")}
          <Donut oa={D.oaBal} sa={D.saBal} ma={D.maBal} />
        </Card>

        {/* Existing: Milestones */}
        <Card>
          {sectionHead("Milestone Alerts (3)")}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { age: 55, label: "RA Formation", detail: "SA balance transfers into RA; OA → RA top-up option opens", type: "info" },
              { age: 65, label: "CPF LIFE Payout Begins", detail: "Standard plan pays $1,420/mo — ensure RA ≥ $60,000", type: "success" },
              { age: 79, label: "OA Drawdown Exhausted", detail: "11-year income gap risk if no private savings buffer", type: "danger" },
            ].map((m, i) => {
              const c = { success: T.green, danger: T.red, info: T.cyan }[m.type];
              return (
                <div key={i} style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8,
                  background: T.bgInput, borderLeft: `3px solid ${c}` }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: c, minWidth: 36, flexShrink: 0 }}>Ag {m.age}</span>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: T.textMain, margin: 0 }}>{m.label}</p>
                    <p style={{ fontSize: 10, color: T.textMuted, margin: "2px 0 0", lineHeight: 1.4 }}>{m.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* NEW: Estate / nomination */}
        <Card style={{ borderColor: D.nominated ? T.green + "50" : T.red + "50" }}>
          {sectionHead("Estate Readiness", true)}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "8px 10px", borderRadius: 8,
              background: `${T.red}15`, border: `1px solid ${T.red}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.red }}>⚠ No CPF nomination</div>
              <div style={{ fontSize: 10, color: T.textSub, marginTop: 2 }}>
                CPF savings will go to Public Trustee without one
              </div>
            </div>
            <div>
              <Label style={{ marginBottom: 4 }}>Projected CPF estate at 90</Label>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.purple }}>$148,000</div>
              <div style={{ fontSize: 10, color: T.textSub, marginTop: 2 }}>OA + MA residual (nominal)</div>
            </div>
            <button style={{ padding: "6px 0", borderRadius: 7, background: `${T.blue}20`,
              border: `1px solid ${T.blue}40`, color: T.blue, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              File Nomination →
            </button>
          </div>
        </Card>
      </div>

      {/* ══ ROW 4: Life Milestone Timeline (NEW, full-width) ══════════════════ */}
      <Card style={{ marginBottom: 12 }}>
        {sectionHead("Life Stage Timeline", true)}
        <MilestoneTimeline />
      </Card>

      {/* ══ ROW 5: Action Priority Queue (NEW, full-width) ════════════════════ */}
      <Card glow>
        {sectionHead("Action Priority Queue", true)}
        <ActionQueue onNavigate={setTab} />
        {tab && (
          <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 7, background: `${T.blue}20`,
            border: `1px solid ${T.blue}40`, fontSize: 11, color: T.blue }}>
            🔗 Navigating to <strong>{tab}</strong> tab… (simulated — no live router in mockup)
          </div>
        )}
      </Card>

    </div>
  );
}
