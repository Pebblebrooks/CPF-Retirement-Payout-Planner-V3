import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea,
  PieChart as RechartsPieChart, Pie as RechartsPie, Cell as RechartsCell
} from "recharts";
import {
  Calculator, TrendingUp, User, Info, ShieldCheck, PieChart,
  AlignJustify, HelpCircle, MinusCircle, Printer,
  Briefcase, Gift, Download, Loader2, FileText, BarChart2,
  AlertTriangle, Clock, CheckCircle2, Split, BookOpen, Scale,
  LayoutDashboard, RotateCcw, Activity, Bell, X,
  SlidersHorizontal, Percent, Link, Target,
  Moon, Sun, Monitor, Lightbulb, Copy, ChevronDown, ChevronUp,
  ArrowRightLeft, LogOut, Users, ExternalLink, Home, Upload
} from "lucide-react";

const TableIcon = AlignJustify;
const BarChart3 = BarChart2;
const ArrowDownToLine = Download;

// ═══════════════════════════════════════════════════════════════════════════════
// CPF POLICY CONSTANTS — UPDATE EACH JANUARY WHEN CPF BOARD PUBLISHES NEW VALUES
// ───────────────────────────────────────────────────────────────────────────────
// Checklist of values that change annually:
//   [ ] RETIREMENT_SUMS_2026  — BRS / FRS / ERS / BHS (CPF Board circular, ~Aug–Sep)
//   [ ] ANNUAL_LIMIT          — CPF Annual Contribution Limit (Budget announcement)
//   [ ] CPF_RATES             — OA / SA / MA / RA interest rates (usually stable)
//   [ ] MMSS_PILOT_END_YEAR   — if CPF Board extends the MediSave Matched Savings Scheme
//   [ ] PR_CONTRIBUTION_RATES — G/G rate tables (below) if CPF Board revises PR rates
//   [ ] PR_FG_CONTRIBUTION_RATES — F/G rate tables (below) if revised
// After updating, do a global search for the old year (e.g. "2026") to catch any
// prose references in UI strings that also need bumping.
// ═══════════════════════════════════════════════════════════════════════════════

const CPF_RATES = { OA: 0.025, SA: 0.04, MA: 0.04, RA: 0.04, EXTRA_1: 0.01, EXTRA_2: 0.01 };
const RETIREMENT_SUMS_2026 = { BRS: 110200, FRS: 220400, ERS: 440800, BHS: 79000 };
const ANNUAL_LIMIT = 37740;
const ASSUMED_TARGET_GROWTH = 0.03; // Rev #5: kept as fallback; engine + UI now use inputs.retirementSumGrowth

// MMSS pilot window — update MMSS_PILOT_END_YEAR if CPF Board extends the scheme.
// Engine uses these constants at the simYear gate (search MMSS_PILOT_START_YEAR to find it).
const MMSS_PILOT_START_YEAR = 2026;
const MMSS_PILOT_END_YEAR   = 2030;

// ── Rev #D2: Life Event type registry ──────────────────────────────────────────
// Each entry: { label, color, icon, description, isPoint }
// isPoint = true  → startAge === endAge (one-off); no End Age field in UI
// isPoint = false → range event; shaded band on chart
const LIFE_EVENT_TYPES = {
  retrenchment:     { label: "Retrenchment",      color: "#ef4444", icon: "📉", isPoint: false,
    description: "Salary and mandatory CPF contributions drop to $0 for the specified age range." },
  career_break:     { label: "Career Break",       color: "#f97316", icon: "⏸",  isPoint: false,
    description: "Voluntary pause — contributions stop (e.g. parental leave, caregiving, travel)." },
  medical_crisis:   { label: "Medical Crisis",     color: "#a855f7", icon: "🏥", isPoint: false,
    description: "Annual cash outflow from OA and/or private assets for medical costs." },
  windfall:         { label: "Windfall",            color: "#10b981", icon: "💰", isPoint: true,
    description: "One-off cash inflow — inheritance, bonus, asset sale proceeds." },
  early_retirement: { label: "Early Retirement",   color: "#3b82f6", icon: "🏖", isPoint: true,
    description: "CPF contributions stop at this age (overrides Contrib Stop Age if earlier)." },
  hyperinflation:   { label: "Hyperinflation",     color: "#eab308", icon: "📈", isPoint: false,
    description: "Temporarily override the inflation rate for the specified age range." },
};
// Convenience: draw source options for medical_crisis
const DRAW_SOURCE_LABELS = {
  oa_then_private: "OA → Private (default)",
  oa:              "OA only",
  private:         "Private only",
};
// Windfall destination options
const WINDFALL_DEST_LABELS = {
  private: "Private Assets",
  oa:      "OA (Annual Limit applies)",
  srs:     "SRS (cap applies)",
};

// CPF contribution rates for PR members in Year 1 and Year 2.
// Source: CPF Board Tables 2 & 3, Graduated Employer / Graduated Employee (G/G) rates, 1 Jan 2026.
// Total rates per age band are taken directly from the official tables.
// OA/SA/MA splits are proportionally derived from SC/PR3+ age-band allocation ratios (combined
// employer + employee), scaled to each band's correct PR total — no separate CPF allocation
// table is published for PR G/G, so proportional scaling is the authoritative approximation.
// flatRate  = employer-only rate applicable when OW is $50–$500 (employee contributes Nil).
// gradFactor = employee phase-in rate for OW $500–$750 band (= employeeRate × 750/250 = employeeRate × 3).
const PR_CONTRIBUTION_RATES = {
  1: [
    // PR Year 1 G/G (Table 2, 1 Jan 2026). Employee = 5% for all bands.
    // Total: 9% (age ≤60), 8.5% (age >60). OA/SA/MA proportionally scaled from SC/PR3+ ratios.
    { maxAge: 35, oa: 0.056, sa: 0.015, ma: 0.019, total: 0.090, flatRate: 0.040, gradFactor: 0.15  }, // 9.0%  ≤35
    { maxAge: 45, oa: 0.051, sa: 0.017, ma: 0.022, total: 0.090, flatRate: 0.040, gradFactor: 0.15  }, // 9.0%  36–45
    { maxAge: 50, oa: 0.046, sa: 0.019, ma: 0.025, total: 0.090, flatRate: 0.040, gradFactor: 0.15  }, // 9.0%  46–50
    { maxAge: 55, oa: 0.036, sa: 0.028, ma: 0.026, total: 0.090, flatRate: 0.040, gradFactor: 0.15  }, // 9.0%  51–55
    { maxAge: 60, oa: 0.032, sa: 0.030, ma: 0.028, total: 0.090, flatRate: 0.040, gradFactor: 0.15  }, // 9.0%  56–60
    { maxAge: 65, oa: 0.012, sa: 0.037, ma: 0.036, total: 0.085, flatRate: 0.035, gradFactor: 0.15  }, // 8.5%  61–65
    { maxAge: 70, oa: 0.005, sa: 0.026, ma: 0.054, total: 0.085, flatRate: 0.035, gradFactor: 0.15  }, // 8.5%  66–70
    { maxAge: Infinity, oa: 0.007, sa: 0.007, ma: 0.071, total: 0.085, flatRate: 0.035, gradFactor: 0.15  }, // 8.5%  >70
  ],
  2: [
    // PR Year 2 G/G (Table 3, 1 Jan 2026). Employee: 15% (≤55), 12.5% (56–60), 7.5% (61–65), 5% (>65).
    // Total: 24% (≤55), 18.5% (56–60), 11% (61–65), 8.5% (>65). OA/SA/MA proportionally scaled.
    { maxAge: 35, oa: 0.149, sa: 0.039, ma: 0.052, total: 0.240, flatRate: 0.090, gradFactor: 0.45  }, // 24.0% ≤35
    { maxAge: 45, oa: 0.136, sa: 0.045, ma: 0.059, total: 0.240, flatRate: 0.090, gradFactor: 0.45  }, // 24.0% 36–45
    { maxAge: 50, oa: 0.123, sa: 0.052, ma: 0.065, total: 0.240, flatRate: 0.090, gradFactor: 0.45  }, // 24.0% 46–50
    { maxAge: 55, oa: 0.097, sa: 0.075, ma: 0.068, total: 0.240, flatRate: 0.090, gradFactor: 0.45  }, // 24.0% 51–55
    { maxAge: 60, oa: 0.065, sa: 0.063, ma: 0.057, total: 0.185, flatRate: 0.060, gradFactor: 0.375 }, // 18.5% 56–60
    { maxAge: 65, oa: 0.015, sa: 0.049, ma: 0.046, total: 0.110, flatRate: 0.035, gradFactor: 0.225 }, // 11.0% 61–65
    { maxAge: 70, oa: 0.005, sa: 0.026, ma: 0.054, total: 0.085, flatRate: 0.035, gradFactor: 0.15  }, // 8.5%  66–70
    { maxAge: Infinity, oa: 0.007, sa: 0.007, ma: 0.071, total: 0.085, flatRate: 0.035, gradFactor: 0.15  }, // 8.5%  >70
  ],
};
// F/G rates: Full Employer (same as SC/PR3+ employer rates) + Graduated Employee (same as G/G employee rates).
// Requires voluntary joint application by employer and employee.
// Source: CPF Board — employer rates from Table 1, employee rates from Tables 2 & 3.
// OA/SA/MA splits proportionally scaled from SC/PR3+ ratios (same method as G/G above).
// flatRate = full employer-only rate (same as SC/PR3+ employer share).
// gradFactor = employeeRate × 3 (Yr1: 5%×3=0.15; Yr2: age-banded, same as G/G Yr2).
const PR_FG_CONTRIBUTION_RATES = {
  1: [
    // F/G Year 1: Employer 17% (full) + Employee 5% (graduated) = 22% total (≤55)
    { maxAge: 35, oa: 0.136, sa: 0.036, ma: 0.048, total: 0.220, flatRate: 0.17,  gradFactor: 0.15  }, // 22.0% ≤35
    { maxAge: 45, oa: 0.124, sa: 0.042, ma: 0.054, total: 0.220, flatRate: 0.17,  gradFactor: 0.15  }, // 22.0% 36–45
    { maxAge: 50, oa: 0.112, sa: 0.048, ma: 0.060, total: 0.220, flatRate: 0.17,  gradFactor: 0.15  }, // 22.0% 46–50
    { maxAge: 55, oa: 0.090, sa: 0.068, ma: 0.062, total: 0.220, flatRate: 0.17,  gradFactor: 0.15  }, // 22.0% 51–55
    { maxAge: 60, oa: 0.074, sa: 0.071, ma: 0.065, total: 0.210, flatRate: 0.16,  gradFactor: 0.15  }, // 21.0% 56–60
    { maxAge: 65, oa: 0.024, sa: 0.077, ma: 0.074, total: 0.175, flatRate: 0.125, gradFactor: 0.15  }, // 17.5% 61–65
    { maxAge: 70, oa: 0.009, sa: 0.042, ma: 0.089, total: 0.140, flatRate: 0.09,  gradFactor: 0.15  }, // 14.0% 66–70
    { maxAge: Infinity, oa: 0.010, sa: 0.010, ma: 0.105, total: 0.125, flatRate: 0.075, gradFactor: 0.15  }, // 12.5% >70
  ],
  2: [
    // F/G Year 2: Employer full + Employee graduated (15% ≤55, 12.5% 56–60, 7.5% 61–65, 5% >65)
    { maxAge: 35, oa: 0.199, sa: 0.052, ma: 0.069, total: 0.320, flatRate: 0.17,  gradFactor: 0.45  }, // 32.0% ≤35
    { maxAge: 45, oa: 0.182, sa: 0.060, ma: 0.078, total: 0.320, flatRate: 0.17,  gradFactor: 0.45  }, // 32.0% 36–45
    { maxAge: 50, oa: 0.164, sa: 0.069, ma: 0.087, total: 0.320, flatRate: 0.17,  gradFactor: 0.45  }, // 32.0% 46–50
    { maxAge: 55, oa: 0.130, sa: 0.099, ma: 0.091, total: 0.320, flatRate: 0.17,  gradFactor: 0.45  }, // 32.0% 51–55
    { maxAge: 60, oa: 0.101, sa: 0.096, ma: 0.088, total: 0.285, flatRate: 0.16,  gradFactor: 0.375 }, // 28.5% 56–60
    { maxAge: 65, oa: 0.028, sa: 0.088, ma: 0.084, total: 0.200, flatRate: 0.125, gradFactor: 0.225 }, // 20.0% 61–65
    { maxAge: 70, oa: 0.009, sa: 0.042, ma: 0.089, total: 0.140, flatRate: 0.09,  gradFactor: 0.15  }, // 14.0% 66–70
    { maxAge: Infinity, oa: 0.010, sa: 0.010, ma: 0.105, total: 0.125, flatRate: 0.075, gradFactor: 0.15  }, // 12.5% >70
  ],
};
// Helper: look up PR OA/SA/MA rates for a given year, age, and rate type (GG or FG).
// rateType 'GG' = Graduated Employer + Graduated Employee (default, no application needed).
// rateType 'FG' = Full Employer + Graduated Employee (requires voluntary joint application).
const getPRRates = (prYear, age, rateType = 'GG') => {
  const rateSet = rateType === 'FG' ? PR_FG_CONTRIBUTION_RATES : PR_CONTRIBUTION_RATES;
  const table = rateSet[prYear];
  if (!table) return null;
  return table.find(r => age <= r.maxAge) || table[table.length - 1];
};
// ── CPF LIFE 2026 Payout Reference Dataset ──────────────────────────────────
// Source: CPF Board Monthly Payout Estimator (2026 cohort, male, payout age 65).
// CPF Board does not publish exact actuarial/mortality formulas — industry standard
// is to use verified Estimator data points with linear interpolation between them.
// Escalating ≈ 80% of Standard; Basic ≈ 92% of Standard (confirmed across all RA levels).
// Female: apply 0.93 multiplier to male figures (longer life expectancy).
const CPF_LIFE_TABLE_M = [
  { ra:  50000, std:  490, esc:  390, bas:  450 },
  { ra: 110200, std:  950, esc:  760, bas:  880 }, // BRS
  { ra: 150000, std: 1250, esc: 1000, bas: 1150 },
  { ra: 220400, std: 1780, esc: 1420, bas: 1640 }, // FRS
  { ra: 300000, std: 2380, esc: 1900, bas: 2190 },
  { ra: 440800, std: 3440, esc: 2750, bas: 3160 }, // ERS
];
const FEMALE_PAYOUT_MULTIPLIER = 0.93;
// Phase 1B trigger age: age when RA_Retained drops below $60K and payout slope begins.
// Source: CPF LIFE Basic Plan documentation (2026 cohort estimates).
// Members with larger RA stay in Phase 1A longer before Phase 1B slope begins.
const BASIC_PHASE1B_TRIGGER = [
  { ra:  100000, triggerAge: 73 },
  { ra:  150000, triggerAge: 78 },
  { ra:  200000, triggerAge: 81 },
  { ra:  300000, triggerAge: 85 },
  { ra:  400000, triggerAge: 87 },
  { ra:  500000, triggerAge: 88 },
];
// Interpolate Phase 1B trigger age for a given RA and payout start age.
// pAge offset: deferring payout means RA is larger AND Phase 1A lasts longer.
const interpolatePhase1bTrigger = (raBalance, pAge) => {
  const tbl = BASIC_PHASE1B_TRIGGER;
  let baseAge;
  if (raBalance <= tbl[0].ra) {
    baseAge = tbl[0].triggerAge - (tbl[0].ra - raBalance) / tbl[0].ra * 4;
  } else if (raBalance >= tbl[tbl.length-1].ra) {
    baseAge = Math.min(89, tbl[tbl.length-1].triggerAge + (raBalance - tbl[tbl.length-1].ra) / 100000);
  } else {
    let lo = tbl[0], hi = tbl[1];
    for (let i = 0; i < tbl.length-1; i++) {
      if (raBalance >= tbl[i].ra && raBalance <= tbl[i+1].ra) { lo = tbl[i]; hi = tbl[i+1]; break; }
    }
    baseAge = lo.triggerAge + (raBalance - lo.ra) * ((hi.triggerAge - lo.triggerAge) / (hi.ra - lo.ra));
  }
  // Deferral offset: each year of deferral beyond 65 shifts trigger ~0.8 yrs later
  const deferralOffset = Math.max(0, pAge - 65) * 0.8;
  return Math.min(89, Math.round(baseAge + deferralOffset));
};

// Phase 2 payout drop % relative to Phase 1A, sourced from CPF LIFE Basic Plan estimates.
// Phase 2 payout = Phase 1A × (1 − drop). Larger RA → smaller drop (more self-sustaining).
// Source: CPF Basic Plan payout model documentation (2026 cohort).
const BASIC_PHASE2_DROP = [
  { ra:  100000, drop: 0.072 },
  { ra:  200000, drop: 0.067 },
  { ra:  300000, drop: 0.058 },
  { ra:  400000, drop: 0.053 },
  { ra:  500000, drop: 0.051 },
  { ra:  700000, drop: 0.042 },
  { ra: 1000000, drop: 0.034 },
];
// Linear interpolation of Phase 2 drop % for any RA balance.
const interpolatePhase2Drop = (raBalance) => {
  if (raBalance <= 0) return 0.072;
  const tbl = BASIC_PHASE2_DROP;
  if (raBalance <= tbl[0].ra) return tbl[0].drop;
  if (raBalance >= tbl[tbl.length - 1].ra) return tbl[tbl.length - 1].drop;
  let lo = tbl[0], hi = tbl[1];
  for (let i = 0; i < tbl.length - 1; i++) {
    if (raBalance >= tbl[i].ra && raBalance <= tbl[i + 1].ra) { lo = tbl[i]; hi = tbl[i + 1]; break; }
  }
  return lo.drop + (raBalance - lo.ra) * ((hi.drop - lo.drop) / (hi.ra - lo.ra));
};
// Newton-Raphson solver: find the effective monthly rate r such that
// PMT × [1-(1+r)^-n]/r = PV  (i.e. the rate that depletes PV to $0 in n months paying PMT/mo).
// Used to track RA_Retained depletion correctly when Phase 1A PMT comes from lookup table.
const solveEffectiveRate = (pmt, pv, n) => {
  if (pmt <= 0 || pv <= 0 || n <= 0) return 0.04 / 12;
  let r = 0.06 / 12;
  for (let i = 0; i < 120; i++) {
    const factor = (1 - Math.pow(1 + r, -n)) / r;
    const f = pmt * factor - pv;
    const df = pmt * ((-n * Math.pow(1 + r, -n - 1) * r - (1 - Math.pow(1 + r, -n))) / (r * r));
    if (Math.abs(df) < 1e-15) break;
    r -= f / df;
    if (r <= 0.001 / 12) r = 0.001 / 12;
    if (r > 0.20 / 12) r = 0.20 / 12;
  }
  return r;
};
// Linear interpolation between two known CPF Estimator data points.
// For RA above ERS: extrapolate using the slope of the last two points.
// For RA below minimum: scale proportionally from the first data point.
const interpolateCpfLife = (raBalance, plan, isMale) => {
  const tbl = CPF_LIFE_TABLE_M;
  let monthly;
  if (raBalance <= 0) return 0;
  if (raBalance <= tbl[0].ra) {
    // Below minimum — scale proportionally from first point
    monthly = tbl[0][plan] * (raBalance / tbl[0].ra);
  } else if (raBalance >= tbl[tbl.length - 1].ra) {
    // Above ERS — extrapolate using last two points
    const lo = tbl[tbl.length - 2], hi = tbl[tbl.length - 1];
    monthly = hi[plan] + (raBalance - hi.ra) * ((hi[plan] - lo[plan]) / (hi.ra - lo.ra));
  } else {
    // Standard linear interpolation between bracket
    let lo = tbl[0], hi = tbl[1];
    for (let i = 0; i < tbl.length - 1; i++) {
      if (raBalance >= tbl[i].ra && raBalance <= tbl[i + 1].ra) { lo = tbl[i]; hi = tbl[i + 1]; break; }
    }
    monthly = lo[plan] + (raBalance - lo.ra) * ((hi[plan] - lo[plan]) / (hi.ra - lo.ra));
  }
  return Math.max(0, monthly * (isMale ? 1 : FEMALE_PAYOUT_MULTIPLIER));
};

// Shared Basic Plan parameter setup — used by payoutProjection and sensitivityData.
// Accepts phase1aMonthly from caller so each site can source it differently:
//   payoutProjection  → lifePlans.basic.start  (gender-adjusted lookup, already computed)
//   sensitivityData   → interpolateCpfLife(raVal, 'bas', isMaleSens)  (per-pAge RA)
const computeBasicPlanParams = (raVal, pAge, phase1aMonthly, premiumPct) => {
  const bPct         = (premiumPct || 10) / 100;
  const premium      = raVal * bPct;
  const pv           = raVal * (1 - bPct);
  const nMonths      = Math.max(12, (90 - pAge) * 12);
  const phase1aAnnual  = phase1aMonthly * 12;
  const dropPct      = interpolatePhase2Drop(raVal);
  const phase2Annual = phase1aAnnual * (1 - dropPct);
  const phase1bTrigger = interpolatePhase1bTrigger(raVal, pAge);
  const effR         = solveEffectiveRate(phase1aMonthly, pv, nMonths);
  const effAnnualFactor = Math.pow(1 + effR, 12);
  return { premium, pv, nMonths, phase1aAnnual, dropPct, phase2Annual, phase1bTrigger, effR, effAnnualFactor };
};

// CQ-1: Shared Basic Plan year-payout helper — eliminates the duplicated Phase 1A/1B/2
// decision tree that previously existed identically in payoutProjection AND sensitivityData.
// Returns {basPay, newRaRem} for one projection year. Caller is responsible for accumulating
// cumPayoutBasicPool (Phase 2 bequest calc) — it is not tracked here to keep the function pure.
//
// Params: age, phase1bTrigger, phase1aAnnual, phase2Annual, basicRaRem, effAnnualFactor
// Returns: { basPay: annual payout this year, newRaRem: updated RA_Retained }
const computeBasicPlanYearPayout = (age, phase1bTrigger, phase1aAnnual, phase2Annual, basicRaRem, effAnnualFactor) => {
  if (age < 90) {
    let basPay;
    if (age < phase1bTrigger) {
      // Phase 1A: stable lookup-table payout
      basPay = phase1aAnnual;
    } else {
      // Phase 1B: linear decline from Phase 1A → Phase 2 between trigger age and 90
      const yTotal = 90 - phase1bTrigger;
      const yLeft  = 90 - age;
      const t = yTotal > 0 ? yLeft / yTotal : 0;
      basPay = phase2Annual + t * (phase1aAnnual - phase2Annual);
    }
    // RA_Retained: effective annual factor (~8–11%/yr) embeds the annuity pool subsidy,
    // calibrated to deplete basicPV to $0 at age 90 at the lookup-table PMT.
    const newRaRem = Math.max(0, (basicRaRem * effAnnualFactor) - basPay);
    return { basPay, newRaRem };
  } else {
    // Phase 2 (age ≥ 90): lower constant payout from communal annuity pool
    return { basPay: phase2Annual, newRaRem: 0 };
  }
};

// CQ-2: Pure helper that computes one sensitivity-table row for a given payout age.
// Extracted from the sensitivityData useMemo so the per-pAge accumulation loop is no
// longer duplicated alongside the payoutProjection loop — it lives here once.
//
// Params:
//   pAge             — payout age to evaluate (e.g. 65–70)
//   raAfterTransfer  — RA balance at pAge after the standard 20% OA transfer deduction
//   isMale           — gender flag (same as debouncedInputs.isMale)
//   basicPremiumPct  — premium percentage for Basic Plan (usually ~10)
//
// Returns: { pAge, stdMonthly, escMonthly, basMonthly, escVsStd, stdVsBasic, escVsBasic }
const computeSensitivityRow = (pAge, raAfterTransfer, isMale, basicPremiumPct) => {
  const stdStart = interpolateCpfLife(raAfterTransfer, 'std', isMale);
  const escStart = interpolateCpfLife(raAfterTransfer, 'esc', isMale);

  const { premium: basicPremS, pv: basicPVS,
          phase1aAnnual: basicP1aAnnual, phase2Annual: basicP2Annual,
          phase1bTrigger: phase1bTriggerS, effAnnualFactor: basicEffAFS
        } = computeBasicPlanParams(raAfterTransfer, pAge, interpolateCpfLife(raAfterTransfer, 'bas', isMale), basicPremiumPct);

  let basicRaRem = basicPVS, cumStd = 0, cumEsc = 0, cumBas = 0;
  let escVsStd = null, stdVsBasic = null, escVsBasic = null;

  for (let age = pAge; age <= 95; age++) {
    const yr = age - pAge;
    const stdPay = stdStart * 12;
    const escPay = (escStart * Math.pow(1.02, yr)) * 12;
    cumStd += stdPay; cumEsc += escPay;

    const { basPay, newRaRem } = computeBasicPlanYearPayout(
      age, phase1bTriggerS, basicP1aAnnual, basicP2Annual, basicRaRem, basicEffAFS
    );
    let basBeq = 0;
    if (age < 90) {
      basicRaRem = newRaRem;
      basBeq = basicRaRem + basicPremS;
    } else {
      basicRaRem = 0;
      basBeq = Math.max(0, basicPremS - cumBas);
    }
    cumBas += basPay;

    // E2 fix: bequest pool uses post-transfer RA
    const stdBeq = Math.max(0, raAfterTransfer - cumStd);
    const escBeq = Math.max(0, raAfterTransfer - cumEsc);
    const stdT = cumStd + stdBeq, escT = cumEsc + escBeq, basT = cumBas + basBeq;
    if (!escVsStd   && age > pAge && escT > stdT)  escVsStd   = age;
    if (!stdVsBasic && age > pAge && stdT > basT)  stdVsBasic = age;
    if (!escVsBasic && age > pAge && escT > basT)  escVsBasic = age;
  }

  return {
    pAge,
    stdMonthly: Math.round(stdStart),
    escMonthly: Math.round(escStart),
    basMonthly: Math.round(interpolateCpfLife(raAfterTransfer, 'bas', isMale)),
    escVsStd, stdVsBasic, escVsBasic
  };
};

const LEGAL_DISCLAIMER = "DISCLAIMER: This application is a prototype simulation tool intended strictly for informational, educational, and testing purposes only. This app and its underlying mathematical models are completely independent and are neither supported, approved, nor sanctioned by the Central Provident Fund (CPF) Board or any government agency. All projections, calculations, and inferences generated by this tool are entirely hypothetical and should not be construed or relied upon as professional financial advice. The author(s) and creator(s) of this application shall not be held liable for any direct, indirect, incidental, consequential damages, losses, or legal repercussions arising from the use or misuse of this tool. Please consult a certified financial advisor before making any financial decisions.";

const DEFAULT_INPUTS = {
  name: "", currentAge: 35, currentYear: 2026, payoutAge: 65,
  contributionStopAge: 65, housingStopAge: 55,
  isSelfEmployed: false, isMale: true, netTradeIncome: 0,
  oaBalance: 50000, saBalance: 40000, maBalance: 30000,
  showSalaryCalc: false, salaryGross: 6000, salaryBonus: 12000, salaryGrowthRate: 0,
  // Rev #22: phased salary & career break
  salaryPhaseAge: "", salaryGrowthRate2: 0,
  careerBreakStartAge: "", careerBreakEndAge: "",
  empOaCont: 12000, empSaCont: 4000, empMaCont: 4000,
  // VC3A: single cash lump-sum, auto-split by age-band allocation rates
  vc3aCash: 0,
  // RSTU: cash top-up to SA (pre-55) or RA (post-55)
  vcSaTopup: 0,
  // Housing refund: credited to OA (VHR)
  vcVhr: 0,
  // Gov grants / MRSS / MMSS / WIS
  annualGovGrant: 500,
  mrssGrant: 0,               // MRSS: govt matches RSTU RA top-up, up to $2,000/yr (lifetime cap $20,000), age 55+, RA below BRS
  mmssGrant: 0,               // MMSS: govt matches MA top-up, up to $1,000/yr, age 55-70
  wisAmount: 0,               // WIS: Workfare Income Supplement — 60% CPF (age-band), 40% cash (employees); 90% MA (SEP)
  // CPF Transfers
  oaToSaTransfer: 0,          // annual OA→SA transfer before 55
  oaToMaTransfer: 0,          // annual OA→MA transfer
  // Age 55 options
  oaWithdrawalAt55: 0,
  usePropertyPledge: false,
  pledgeWithdrawalAmount: 0,    // amount to withdraw from RA (pledged sum) as cash
  pledgeWithdrawalAge: 55,      // age at which member applies to withdraw pledged RA funds
  // CPFIS
  cpfisOaAmount: 0,    // Annual CPFIS investment from OA (OA must be > $20,000)
  cpfisSaAmount: 0,    // Annual CPFIS investment from SA (SA must be > $40,000, pre-55 only)
  // Outflows
  housingOutflow: 12000, oaEduLoan: 0, oaEduLoanFreq: 'one-time',
  medicalUsage: 500, medishieldIP: 900, elderCareShield: 500,
  medicalInflationRate: 5,
  propertyValue: 500000, propertyGrowthRate: 2, propertyLeasehold: false, propertyLeaseYears: 99,
  inflationRate: 2, includeProperty: true,
  sellPropertyAge: 0,
  // Private Assets & Goals
  targetMonthlyIncome: 0,
  currentPrivateAssets: 0,
  annualPrivateSaving: 0,
  privateAssetGrowthRate: 0,
  plannedDownpaymentOA: 0,
  downpaymentAge: 35,
  // OA Drawdown (post-payout-age supplementary income from OA)
  oaDrawdownStartAge: 0,         // 0 = disabled; age to begin drawing from OA (must be >= payoutAge)
  oaDrawdownMonthly: 0,          // monthly cash draw from OA (in addition to CPF LIFE)
  oaDrawdownFloor: 0,            // minimum OA balance to preserve (bequest floor); draw stops when OA hits this
  // Property Monetisation
  propMonetiseEnabled: false,    // master toggle
  propMonetiseScheme: "downgrade", // "downgrade" | "lbs" | "shb"
  propMonetiseAge: 65,           // age at which the scheme event occurs (one-time)
  propMonetiseCashProceeds: 0,   // net cash received by member (after CPF refund, stamp duty etc.)
  propMonetiseRaTopup: 0,        // RA top-up component (Silver Housing Bonus CPF portion, or LBS annuity lump-sum)
  // SRS (Supplementary Retirement Scheme)
  srsBalance: 0,
  srsAnnualContribution: 0,
  srsContribStopAge: 63,
  srsReturnRate: 4,
  srsDrawdownStartAge: 63,
  srsDrawdownYears: 10,
  // Die with Zero — fully deplete liquid assets by a target age
  dieWithZeroEnabled: false,
  dieWithZeroAge: 85,
  // Cash top-up to MA (direct, annual, any age, capped at BHS)
  vcMaCash: 0,
  // OA→MA transfer destination: false = self (internal move), true = loved one (OA outflow only)
  oaToMaForLovedOne: false,
  // OA→SA/RA transfer destination: false = self (internal move), true = loved one (OA outflow only)
  oaToSaForLovedOne: false,
  // Frequency toggles — 'annual' (recurring each year) or 'one-time' (applied in first year only)
  vc3aFreq: 'annual', vcSaFreq: 'annual', vcMaFreq: 'annual', vcVhrFreq: 'annual',
  govGrantFreq: 'annual', wisFreq: 'annual',
  cpfisOaFreq: 'annual', cpfisSaFreq: 'annual', housingFreq: 'annual',
  oaWithdrawalFreq: 'one-time', oaToMaFreq: 'annual', oaToSaFreq: 'annual',
  // Duration for recurring fields (0 = indefinite/∞; N = apply for first N projection years from current age).
  // Ignored when the paired *Freq is 'one-time' — one-time fields already fire only in year 1.
  // SRS excluded — its stop is controlled precisely by srsContribStopAge instead.
  vc3aDur: 0, vcSaDur: 0, vcMaDur: 0, vcVhrDur: 0,
  govGrantDur: 0, wisDur: 0,
  cpfisOaDur: 0, cpfisSaDur: 0, housingDur: 0,
  oaToMaDur: 0, oaToSaDur: 0, oaEduLoanDur: 0,
  // PR tenure year — 1, 2, or 3+ (3 = full rates). Only shown/relevant when citizenStatus === 'PR'.
  prYear: 3,
  // PR rate type — 'GG' (Graduated Employer + Graduated Employee, default) or
  // 'FG' (Full Employer + Graduated Employee, requires voluntary joint application).
  // Only applies when citizenStatus === 'PR' && prYear < 3. Year 3+ always uses full SC/PR3+ rates.
  prRateType: 'GG',
  // Global citizenship status: 'SC' (Singapore Citizen) or 'PR' (Permanent Resident).
  // Gates MRSS, MMSS (SC only), and PR tenure contribution warnings.
  // Foreigners are not modelled — they have no CPF entitlements.
  citizenStatus: 'SC',
  // Person with Disabilities (PwD): unlocks MRSS eligibility below age 55.
  // PwD members with OA+SA below BRS qualify for MRSS from 2026 regardless of age.
  isPwD: false,
  // Rev #5: Annual growth rate assumed for CPF retirement sums (FRS/BHS/BRS/ERS) projections.
  // CPF Board has historically raised these at ~3%/yr. Range: 0–10%; warn outside 0–6%.
  // Affects every projected FRS/BHS/BRS/ERS threshold in the engine and UI milestones.
  retirementSumGrowth: 3,
  // Rev #MC: Monte Carlo rate variance (±%). Controls the noise band applied to CPF interest
  // rates in each of the 200 simulation runs. Default 1% matches historical CPF rate stability.
  mcVariancePct: 1,
  // Rev #D2: Life Events — array of user-defined stress-test events overlaid on the projection.
  // Each event has: id, type, label, startAge, endAge, magnitude, enabled,
  // and optional type-specific fields: drawSource (medical_crisis), destination (windfall).
  lifeEvents: [],
};

const PRESET_PROFILES = [
  {
    id: "blank", label: "Blank Slate", icon: "🧹",
    desc: "All zeros — start completely fresh",
    inputs: {
      // ── Profile (sensible defaults, not zeroed) ──────────────────────────
      name: "", currentAge: 30, currentYear: 2026, payoutAge: 65,
      contributionStopAge: 65, housingStopAge: 65,
      isMale: true, isSelfEmployed: false,
      citizenStatus: "SC", prYear: 3, prRateType: 'GG',
      // ── CPF Balances ─────────────────────────────────────────────────────
      oaBalance: 0, saBalance: 0, maBalance: 0,
      // ── Salary & Mandatory Contributions ─────────────────────────────────
      salaryGross: 0, salaryBonus: 0, salaryGrowthRate: 0,
      showSalaryCalc: false,
      empOaCont: 0, empSaCont: 0, empMaCont: 0,
      netTradeIncome: 0,
      // ── Voluntary Top-ups & Grants ────────────────────────────────────────
      vc3aCash: 0, vcSaTopup: 0, vcVhr: 0, vcMaCash: 0,
      annualGovGrant: 0, mrssGrant: 0, mmssGrant: 0, wisAmount: 0,
      // ── CPF Transfers ─────────────────────────────────────────────────────
      oaToSaTransfer: 0, oaToMaTransfer: 0, oaToMaForLovedOne: false,
      // ── CPFIS ─────────────────────────────────────────────────────────────
      cpfisOaAmount: 0, cpfisSaAmount: 0,
      // ── Outflows ──────────────────────────────────────────────────────────
      housingOutflow: 0, medicalUsage: 0, medishieldIP: 0,
      elderCareShield: 0, medicalInflationRate: 0,
      // ── Property & Timelines ──────────────────────────────────────────────
      propertyValue: 0, propertyGrowthRate: 0,
      includeProperty: false, propertyLeasehold: false, propertyLeaseYears: 99,
      sellPropertyAge: 0,
      // ── Age-55 Options ────────────────────────────────────────────────────
      oaWithdrawalAt55: 0,
      usePropertyPledge: false, pledgeWithdrawalAmount: 0, pledgeWithdrawalAge: 55,
      // ── Housing Downpayment ───────────────────────────────────────────────
      plannedDownpaymentOA: 0, downpaymentAge: 35,
      // ── SRS ───────────────────────────────────────────────────────────────
      srsBalance: 0, srsAnnualContribution: 0, srsReturnRate: 0,
      srsContribStopAge: 63, srsDrawdownStartAge: 63, srsDrawdownYears: 10,
      // ── Private Assets & Goals ────────────────────────────────────────────
      currentPrivateAssets: 0, annualPrivateSaving: 0, privateAssetGrowthRate: 0,
      targetMonthlyIncome: 0,
      oaDrawdownMonthly: 0, oaDrawdownStartAge: 65, oaDrawdownFloor: 0,
      // ── Property Monetisation ─────────────────────────────────────────────
      propMonetiseEnabled: false, propMonetiseCashProceeds: 0, propMonetiseRaTopup: 0,
      // ── Die with Zero ─────────────────────────────────────────────────────
      dieWithZeroEnabled: false, dieWithZeroAge: 85,
    }
  },
  {
    id: "typical35", label: "Typical Employee, 35", icon: "👔",
    desc: "Median CPF balances, $5.5k salary, HDB mortgage",
    inputs: { name: "Sample Member", currentAge: 35, payoutAge: 65, contributionStopAge: 65, housingStopAge: 55, isMale: true, oaBalance: 55000, saBalance: 35000, maBalance: 28000, salaryGross: 5500, salaryBonus: 11000, empOaCont: 12804, empSaCont: 4302, empMaCont: 4302, housingOutflow: 12000, medicalUsage: 500, medishieldIP: 900, elderCareShield: 500, propertyValue: 450000, propertyGrowthRate: 2, annualGovGrant: 500, targetMonthlyIncome: 3000 }
  },
  {
    id: "late50", label: "Late Starter, 50", icon: "⏰",
    desc: "Lower balances at 50, 5 years to SA closure",
    inputs: { name: "Late Starter", currentAge: 50, payoutAge: 65, contributionStopAge: 65, housingStopAge: 55, isMale: true, oaBalance: 80000, saBalance: 60000, maBalance: 55000, salaryGross: 6000, salaryBonus: 12000, empOaCont: 7920, empSaCont: 5160, empMaCont: 5160, housingOutflow: 8400, medicalUsage: 800, medishieldIP: 1200, elderCareShield: 600, propertyValue: 500000, propertyGrowthRate: 2, vcSaTopup: 8000, annualGovGrant: 500, oaToSaTransfer: 10000, targetMonthlyIncome: 3500,
      lifeEvents: [{ id: "le-late50-retrenched", type: "retrenchment", label: "Retrenchment", startAge: 52, endAge: 53, magnitude: 72000, enabled: true }] }
  },
  {
    id: "sep40", label: "Self-Employed, 40", icon: "💼",
    desc: "SEP mode, NTI $80k, no mandatory OA/SA",
    inputs: { name: "Freelancer", currentAge: 40, payoutAge: 65, contributionStopAge: 65, housingStopAge: 55, isSelfEmployed: true, isMale: true, netTradeIncome: 80000, oaBalance: 30000, saBalance: 25000, maBalance: 20000, empOaCont: 0, empSaCont: 0, empMaCont: 6720, vc3aCash: 20000, housingOutflow: 9600, medicalUsage: 500, medishieldIP: 900, elderCareShield: 500, propertyValue: 400000, propertyGrowthRate: 2, srsAnnualContribution: 15300, srsReturnRate: 4, srsContribStopAge: 63, srsDrawdownStartAge: 63, srsDrawdownYears: 10, targetMonthlyIncome: 3500 }
  },
  {
    id: "highearn40", label: "High Earner, 40", icon: "🚀",
    desc: "$8k salary cap, bonus at AW ceiling, ERS target",
    inputs: { name: "High Earner", currentAge: 40, payoutAge: 65, contributionStopAge: 65, housingStopAge: 55, isMale: true, oaBalance: 150000, saBalance: 120000, maBalance: 65000, salaryGross: 8000, salaryBonus: 6000, empOaCont: 14400, empSaCont: 5040, empMaCont: 5040, housingOutflow: 18000, medicalUsage: 600, medishieldIP: 1500, elderCareShield: 600, propertyValue: 1200000, propertyGrowthRate: 2, vcSaTopup: 8000, oaToSaTransfer: 20000, annualGovGrant: 0, srsAnnualContribution: 15300, srsBalance: 50000, srsReturnRate: 5, srsContribStopAge: 63, srsDrawdownStartAge: 63, srsDrawdownYears: 10, targetMonthlyIncome: 6000,
      lifeEvents: [{ id: "le-high40-medical", type: "medical_crisis", label: "Cancer Treatment", startAge: 60, endAge: 62, magnitude: 25000, enabled: true, drawSource: "oa_then_private" }] }
  },
  {
    id: "near55", label: "Near Retirement, 54", icon: "🔔",
    desc: "Age 54, near-FRS, focus on OA→SA + payout choice",
    inputs: { name: "Near Retirement", currentAge: 54, payoutAge: 65, contributionStopAge: 65, housingStopAge: 55, isMale: true, oaBalance: 180000, saBalance: 200000, maBalance: 72000, salaryGross: 7000, salaryBonus: 14000, empOaCont: 8400, empSaCont: 5520, empMaCont: 5520, housingOutflow: 6000, medicalUsage: 800, medishieldIP: 1500, elderCareShield: 600, propertyValue: 700000, propertyGrowthRate: 1.5, oaToSaTransfer: 15000, vcSaTopup: 8000, annualGovGrant: 500, targetMonthlyIncome: 4000 }
  },
  {
    id: "post55ra", label: "Post-55 RA Builder, 57", icon: "🏦",
    desc: "SA closed, RA below FRS — OA→RA + MRSS focus",
    inputs: { name: "RA Builder", currentAge: 57, payoutAge: 67, contributionStopAge: 65, housingStopAge: 57, isMale: true, oaBalance: 120000, saBalance: 90000, maBalance: 68000, salaryGross: 5000, salaryBonus: 10000, empOaCont: 6000, empSaCont: 3900, empMaCont: 3900, housingOutflow: 0, medicalUsage: 900, medishieldIP: 1600, elderCareShield: 600, propertyValue: 550000, propertyGrowthRate: 1.5, oaToSaTransfer: 12000, vcSaTopup: 8000, annualGovGrant: 500, targetMonthlyIncome: 3500 }
  },
];

const INPUT_LABELS = {
  name: "Name", currentAge: "Current Age", currentYear: "Current Year", payoutAge: "Payout Age",
  contributionStopAge: "Contrib Stop Age", housingStopAge: "Housing Stop Age",
  isMale: "Gender (Male)", netTradeIncome: "Net Trade Income", oaBalance: "OA Balance", saBalance: "SA Balance", maBalance: "MA Balance",
  salaryGross: "Gross Salary", salaryBonus: "Annual Bonus", salaryGrowthRate: "Salary Growth %",
  salaryPhaseAge: "Phase 2 Start Age", salaryGrowthRate2: "Phase 2 Growth %",
  careerBreakStartAge: "Career Break Start Age", careerBreakEndAge: "Career Break End Age",
  empOaCont: "Emp OA Contrib", empSaCont: "Emp SA Contrib", empMaCont: "Emp MA Contrib",
  vc3aCash: "VC3A Cash (Annual)", vcSaTopup: "RSTU SA/RA Top-up", vcVhr: "Housing Refund (VHR)",
  annualGovGrant: "Annual Gov Grant", mrssGrant: "MRSS Grant", mmssGrant: "MMSS Grant",
  wisAmount: "WIS (Workfare)", oaToSaTransfer: "OA→SA Transfer",
  oaToMaTransfer: "OA→MA Transfer", oaWithdrawalAt55: "OA Withdrawal at 55",
  usePropertyPledge: "Property Pledge", cpfisOaAmount: "CPFIS OA Invested", cpfisSaAmount: "CPFIS SA Invested",
  housingOutflow: "Housing Outflow", oaEduLoan: "OA Education Loan", oaEduLoanFreq: "OA Edu Loan Freq",
  medicalUsage: "Medical Usage",
  medishieldIP: "MediShield/IP", elderCareShield: "CareShield", medicalInflationRate: "Medical Infl. %",
  propertyValue: "Property Value", propertyGrowthRate: "Prop Growth %",
  propertyLeasehold: "Is Leasehold", propertyLeaseYears: "Lease Years",
  inflationRate: "Inflation Rate %", includeProperty: "Include Property",
  sellPropertyAge: "Sell Property Age",
  targetMonthlyIncome: "Target Monthly Income", currentPrivateAssets: "Private Assets",
  annualPrivateSaving: "Annual Private Saving", privateAssetGrowthRate: "Private Asset Growth %",
  plannedDownpaymentOA: "OA Downpayment", downpaymentAge: "Downpayment Age",
  oaDrawdownStartAge: "OA Drawdown Start Age", oaDrawdownMonthly: "OA Monthly Drawdown",
  oaDrawdownFloor: "OA Drawdown Floor", propMonetiseEnabled: "Prop Monetise",
  propMonetiseScheme: "Prop Scheme", propMonetiseAge: "Prop Monetise Age",
  propMonetiseCashProceeds: "Prop Cash Proceeds", propMonetiseRaTopup: "Prop RA Top-up",
  srsBalance: "SRS Balance", srsAnnualContribution: "SRS Annual Contrib",
  srsContribStopAge: "SRS Contrib Stop Age", srsReturnRate: "SRS Return Rate %",
  srsDrawdownStartAge: "SRS Drawdown Start Age", srsDrawdownYears: "SRS Drawdown Years",
  // Session 2 & 3 additions
  isSelfEmployed: "Self-Employed", showSalaryCalc: "Show Salary Calc",
  pledgeWithdrawalAmount: "Pledge Withdrawal Amount", pledgeWithdrawalAge: "Pledge Withdrawal Age",
  dieWithZeroEnabled: "Die with Zero", dieWithZeroAge: "Die with Zero Age",
  vcMaCash: "Cash Top-up to MA", oaToMaForLovedOne: "OA→MA For Loved One", oaToSaForLovedOne: "OA→SA/RA For Loved One",
  prYear: "PR Tenure Year", citizenStatus: "Citizenship Status", isPwD: "Person with Disabilities (PwD)",
  retirementSumGrowth: "Retirement Sum Growth (%/yr)",
  mcVariancePct: "Monte Carlo Variance (%)",
  lifeEvents: "Life Events",
  cpfisOaFreq: "CPFIS OA Freq", cpfisSaFreq: "CPFIS SA Freq",
  oaWithdrawalFreq: "OA Withdrawal Freq", oaToMaFreq: "OA→MA Freq", oaToSaFreq: "OA→SA Freq", prRateType: "PR Rate Type",
  // Duration fields (years) for recurring freq-controlled inputs (0 = indefinite)
  vc3aDur: "VC3A Duration (yrs)", vcSaDur: "RSTU Duration (yrs)", vcMaDur: "VCMA Duration (yrs)",
  vcVhrDur: "VHR Duration (yrs)", govGrantDur: "Gov Grant Duration (yrs)",
  wisDur: "WIS Duration (yrs)", // mrssDur removed — MRSS frequency mirrors RSTU by CPF policy
  cpfisOaDur: "CPFIS OA Duration (yrs)", cpfisSaDur: "CPFIS SA Duration (yrs)",
  housingDur: "Housing Duration (yrs)", oaToMaDur: "OA-MA Duration (yrs)",
  oaToSaDur: "OA-SA Duration (yrs)", oaEduLoanDur: "OA Edu Loan Duration (yrs)",
};

// Alias used by the Compare tab — same labels, one source of truth
const SCENARIO_LABELS = INPUT_LABELS;

// ─── SHARED PROJECTION ENGINE ───────────────────────────────────────────────
// Single source of truth for year-by-year CPF accumulation logic.
// Used by main projection, Monte Carlo, What-If, and sensitivity table
// to eliminate code duplication and ensure policy changes apply everywhere.
function runProjectionEngine(inputs, {
  overrideContribStop,
  overrideVcSA,
  overrideHousingOutflow,
  overrideSalaryBump,
  overridePrivDrawdown,            // P1-D: annual private-asset draw injected by DWZ two-pass logic
  overridePrivDrawdownStart,       // P1-D: age from which the drawdown begins
  overrideOaDrawdownMonthly,       // Rev #12: What-If OA monthly drawdown override
  overrideSrsContrib,              // Rev #12: What-If SRS annual contribution override
  overridePrivGrowthRate,          // Rev #12: What-If private asset growth rate % override
  maxAge = 95,
  randomiseRates = false,          // Monte Carlo mode: rate variance applied per year
  mcVariance = 1,                  // Rev #MC: variance band in % (e.g. 1 = ±1%). Sourced from inputs.mcVariancePct.
} = {}) {
  const startAge = Math.max(0, Number(inputs.currentAge) || 0);
  const baseYear = Number(inputs.currentYear) || 2026;
  const contribStop = overrideContribStop !== undefined ? overrideContribStop : (Number(inputs.contributionStopAge) || 95);
  const housingStop = Number(inputs.housingStopAge) || 95;
  const salaryGrowth = (Number(inputs.salaryGrowthRate) || 0) / 100;
  const salaryBump = (overrideSalaryBump || 0) / 100;
  // Rev #22: phased salary & career break constants
  const salaryPhaseAge       = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null ? Number(inputs.salaryPhaseAge) : null;
  const salaryGrowthRate2    = (Number(inputs.salaryGrowthRate2) || 0) / 100;
  const careerBreakStart     = inputs.careerBreakStartAge !== "" && inputs.careerBreakStartAge != null ? Number(inputs.careerBreakStartAge) : null;
  const careerBreakEnd       = inputs.careerBreakEndAge   !== "" && inputs.careerBreakEndAge   != null ? Number(inputs.careerBreakEndAge)   : null;
  // computeGF: returns the salary growth factor at a given age, respecting phase change and career break.
  // Phase 1: (1+r1)^(age-startAge). Phase 2 (age >= phaseAge): (1+r1)^(phaseAge-startAge) * (1+r2)^(age-phaseAge).
  // Career break: returns 0 for ages within [breakStart, breakEnd], halting contributions for those years.
  const computeGF = (age, bump = 0) => {
    const inBreak = careerBreakStart !== null && careerBreakEnd !== null && age >= careerBreakStart && age <= careerBreakEnd;
    if (inBreak) return 0;
    const yearsTotal = Math.max(0, age - startAge);
    let gfVal;
    if (salaryPhaseAge !== null && age >= salaryPhaseAge) {
      const years1 = Math.max(0, salaryPhaseAge - startAge);
      const years2 = Math.max(0, age - salaryPhaseAge);
      gfVal = Math.pow(1 + salaryGrowth, years1) * Math.pow(1 + salaryGrowthRate2, years2);
    } else {
      gfVal = Math.pow(1 + salaryGrowth, yearsTotal);
    }
    return gfVal * (1 + bump);
  };

  const baseOA_Emp = Number(inputs.empOaCont) || 0;
  const baseSA_Emp = Number(inputs.empSaCont) || 0;
  const baseMA_Emp = Number(inputs.empMaCont) || 0;
  // VC3A: single cash lump-sum, auto-split by age-band rates (same as mandatory).
  // Replaces separate vcOaTopup/vcSaTopup/vcMaTopup — all go through age-band proportional split.
  const vc3aCash = Number(inputs.vc3aCash) || 0;
  // VHR (housing refund) goes to OA separately
  const vcVhrAmt = Number(inputs.vcVhr) || 0;
  // RSTU: cash top-up to SA (pre-55) or RA (post-55) is handled via cappedVcSA in the employed/SEP
  // contribution blocks below. vcSA_RSTU was a dead variable here — removed (BUG-06 fix).
  const annualOaToSa = Number(inputs.oaToSaTransfer) || 0;
  const annualOaToMa = Number(inputs.oaToMaTransfer) || 0;
  const oaToMaForLovedOne = inputs.oaToMaForLovedOne === true;
  const oaToSaForLovedOne = inputs.oaToSaForLovedOne === true;
  // Frequency flags — used to zero out recurring fields for 'one-time' application
  const vc3aFreq     = inputs.vc3aFreq     || 'annual';
  const vcSaFreq     = inputs.vcSaFreq     || 'annual';
  const vcMaFreq     = inputs.vcMaFreq     || 'annual';
  const vcVhrFreq    = inputs.vcVhrFreq    || 'annual';
  const govGrantFreq = inputs.govGrantFreq || 'annual';
  // mmssFreq removed — MMSS ties to effVcMaFreq, not a separate toggle
  const wisFreq      = inputs.wisFreq      || 'annual';
  const cpfisOaFreq   = inputs.cpfisOaFreq   || 'annual';
  const cpfisSaFreq   = inputs.cpfisSaFreq   || 'annual';
  const housingFreq   = inputs.housingFreq   || 'annual';
  const oaWithdrawalFreq = inputs.oaWithdrawalFreq || 'one-time';
  const oaToMaFreq    = inputs.oaToMaFreq    || 'annual';
  const oaToSaFreq    = inputs.oaToSaFreq    || 'annual';
  // Duration limits for recurring fields (0 = indefinite; N = stop after N projection years from startAge)
  const vc3aDur      = Number(inputs.vc3aDur)      || 0;
  const vcSaDur      = Number(inputs.vcSaDur)      || 0;
  const vcMaDur      = Number(inputs.vcMaDur)      || 0;
  const vcVhrDur     = Number(inputs.vcVhrDur)     || 0;
  const govGrantDur  = Number(inputs.govGrantDur)  || 0;
  // mrssDur removed — MRSS frequency mirrors RSTU (vcSaFreq) by CPF policy; no separate freq/dur control needed
  // mmssDur removed — dead field, never read by MMSS engine block
  const wisDur       = Number(inputs.wisDur)       || 0;
  const cpfisOaDur   = Number(inputs.cpfisOaDur)   || 0;
  const cpfisSaDur   = Number(inputs.cpfisSaDur)   || 0;
  const housingDur   = Number(inputs.housingDur)   || 0;
  const oaToMaDur    = Number(inputs.oaToMaDur)    || 0;
  const oaToSaDur    = Number(inputs.oaToSaDur)    || 0;
  const oaEduLoanDur = Number(inputs.oaEduLoanDur) || 0;
  // Direct cash top-up to MA (any age, capped at BHS, not Annual Limit)
  const vcMaCash = Number(inputs.vcMaCash) || 0;
  // MRSS and MMSS are now auto-derived inside the projection loop:
  //   MRSS = min(vcSaTopup * effVcSaFreq, 2000, lifetimeCapRemaining) when eligible
  //   MMSS = min(vcMaCash * effVcMaFreq, 1000, maRoom) when eligible
  // mrssGrant and mmssGrant inputs are no longer user-entered and are always 0.
  // Citizenship gate: MRSS and MMSS are Singapore Citizens only.
  // PR members cannot receive either grant regardless of age or account balance.
  // Rev #5: User-controllable retirement sum growth rate. Replaces the former rsGrowth
  // constant throughout the engine. All FRS/BHS/BRS/ERS projections use this rate.
  // Legacy profiles without the field default to 3% (historical CPF Board average).
  const rsGrowth = (Number(inputs.retirementSumGrowth) || 3) / 100;

  const isSC = (inputs.citizenStatus === 'SC') || (inputs.citizenStatus === undefined); // default to SC if field absent (legacy profiles)
  // PwD gate: MRSS is available below age 55 for PwD members with OA+SA below BRS (from 2026).
  const isPwD = !!inputs.isPwD;
  // WIS: Workfare Income Supplement
  //   Employees:  60% allocated to CPF accounts via age-band rates, 40% cash (not modelled in CPF)
  //   SEP:        90% to MA (subject to BHS), 10% cash (not modelled in CPF)
  const wisAmount = Number(inputs.wisAmount) || 0;
  const cpfisOaAmount = Number(inputs.cpfisOaAmount) || 0;
  // SA CPFIS: only investible pre-55 (SA closes at 55); SA above $40,000 required.
  const cpfisSaAmount = Number(inputs.cpfisSaAmount) || 0;
  const baseHousing = overrideHousingOutflow !== undefined ? overrideHousingOutflow : (Number(inputs.housingOutflow) || 0);
  const oaEduLoanAnnual = Number(inputs.oaEduLoan) || 0;  // D1: OA Education Loan Scheme outflow
  const oaEduLoanFreq   = inputs.oaEduLoanFreq || 'one-time';
  const baseMedical = (Number(inputs.medicalUsage) || 0) + (Number(inputs.medishieldIP) || 0) + (Number(inputs.elderCareShield) || 0);
  const medInfl = (Number(inputs.medicalInflationRate) || 0) / 100;
  const isSEP = inputs.isSelfEmployed === true;
  const isLeasehold = inputs.propertyLeasehold === true;
  const totalLease = Math.max(30, Number(inputs.propertyLeaseYears) || 99);
  const propGrowth = (Number(inputs.propertyGrowthRate) || 0) / 100;
  const usePropertyPledge = inputs.usePropertyPledge === true;

  // Phase 2: Private Assets & Housing Downpayment
  let privateAssets = Number(inputs.currentPrivateAssets) || 0;
  const privateGrowth = overridePrivGrowthRate !== undefined ? overridePrivGrowthRate / 100 : (Number(inputs.privateAssetGrowthRate) || 0) / 100;
  const privateSaving = Number(inputs.annualPrivateSaving) || 0;
  const plannedDownpaymentOA = Number(inputs.plannedDownpaymentOA) || 0;
  const downpaymentAge = Number(inputs.downpaymentAge) || 35;
  let downpaymentApplied = startAge > downpaymentAge;

  // SRS: Supplementary Retirement Scheme
  // Contributions grow at srsReturnRate. At srsDrawdownStartAge the balance is drawn down
  // evenly over srsDrawdownYears (must deplete within 10 yrs of first withdrawal per IRAS rules).
  // Only 50% of each annual withdrawal is taxable income (statutory retirement age concession).
  // POL-3 fix: foreigners have a higher SRS cap ($35,700/yr) than SC/PR ($15,300/yr).
  // citizenStatus 'foreigner' → $35,700; 'SC' or 'PR' (or undefined/legacy) → $15,300.
  // Q1 note: `inputs` here is the runProjectionEngine function parameter (line 495),
  // NOT the React component's live inputs state. validateInputs uses `inp` for the
  // same cap — both correctly read from their own function parameter; the naming
  // difference (inputs vs inp) is stylistic only and carries no runtime risk.
  const srsCap = (inputs.citizenStatus === 'foreigner') ? 35700 : 15300;
  const srsContrib = overrideSrsContrib !== undefined ? Math.min(overrideSrsContrib, srsCap) : Math.min(Number(inputs.srsAnnualContribution) || 0, srsCap);
  const srsContribStop = Number(inputs.srsContribStopAge) || 63;
  const srsReturn = (Number(inputs.srsReturnRate) || 0) / 100;
  const srsDrawStart = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63); // min statutory age 63
  const srsDrawYears = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10); // 1–10 yrs
  let srsBalance = Number(inputs.srsBalance) || 0;
  let srsDrawdownApplied = startAge >= srsDrawStart;
  let srsAnnualDraw = 0; // computed once at drawdown start age

  // Cohort FRS at age 55
  const yearsTo55 = Math.max(0, 55 - startAge);
  const projFRS55 = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + yearsTo55) - 2026)));
  const past55FRS = Math.round(RETIREMENT_SUMS_2026.FRS / Math.pow(1 + rsGrowth, Math.max(0, startAge - 55)));
  // Property pledge allows keeping only BRS in RA (rest can be withdrawn / kept in OA)
  const cohortRetSum = usePropertyPledge
    ? (startAge >= 55 ? Math.round(RETIREMENT_SUMS_2026.BRS / Math.pow(1 + rsGrowth, Math.max(0, startAge - 55)))
      : Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + yearsTo55) - 2026))))
    : (startAge >= 55 ? past55FRS : projFRS55);

  let oa = Number(inputs.oaBalance) || 0;
  let sa = Number(inputs.saBalance) || 0;
  let ma = Number(inputs.maBalance) || 0;
  let ra = startAge >= 55 ? sa : 0;
  if (startAge >= 55) sa = 0;

  let totalInjected = 0, totalInterest = 0, totalOutSpent = 0;
  // #3 Property CPF refund: track cumulative OA housing withdrawals for refund calc
  const sellPropertyAge = Number(inputs.sellPropertyAge) || 0;
  let cumHousingOA = 0;        // tracks cumulative OA used for housing (principal)
  let cumEduOut = 0;           // P3-B: cumulative OA education loan withdrawals for 40% cap anchoring
  // cumHousingFV tracks the compound future value of ALL OA housing withdrawals at 2.5%/yr.
  // Each year: cumHousingFV = (cumHousingFV + activeHousing) * 1.025
  // This correctly compounds each year's withdrawal forward from its own date.
  // At sell time: totalRefund = cumHousingFV (principal + compounded interest).
  // Accrued interest = cumHousingFV - cumHousingOA.
  let cumHousingFV = 0;
  let refundApplied = startAge >= sellPropertyAge && sellPropertyAge > 0;
  // Track SA/RA cash top-ups (vcSa + govGrant + mrss) and interest earned on RA
  // separately — needed to compute the correct 20% RA-to-OA transfer base.
  // Policy: transfer base = RA at payout − (cumulative SA/RA cash top-ups + cumulative RA interest)
  let cumRaCashTopUps = 0;  // vcSaTopup + annualGovGrant + mrssGrant credited to SA/RA
  let cumRaInterest = 0;  // interest accruing to SA (pre-55) and RA (post-55) accounts
  // MRSS lifetime cap: $20,000 per member. Track cumulative amount received to stop at cap.
  let cumMrssReceived = 0;
  let currentPropValue = Number(inputs.propertyValue) || 0;
  let leaseRemaining = totalLease;
  // OA withdrawal at 55: applied once when age 55 is reached
  const oaWithdrawalAt55 = Number(inputs.oaWithdrawalAt55) || 0;
  let withdrawalApplied = startAge >= 55; // already past 55 → already happened
  // Pledge RA withdrawal: only applies when pledge is ON; withdrawn directly from RA at pledgeWithdrawalAge
  const pledgeWithdrawalAmount = (usePropertyPledge && Number(inputs.pledgeWithdrawalAmount)) ? Number(inputs.pledgeWithdrawalAmount) : 0;
  const pledgeWithdrawalAge = Math.max(55, Number(inputs.pledgeWithdrawalAge) || 55);
  let pledgeWithdrawalApplied = startAge >= pledgeWithdrawalAge;

  // OA Drawdown: post-payout-age supplementary cash drawn from OA
  // Supplements CPF LIFE shortfall; stops when OA hits oaDrawdownFloor.
  const oaDrawdownStartAge = Number(inputs.oaDrawdownStartAge) || 0;
  const oaDrawdownMonthly = overrideOaDrawdownMonthly !== undefined ? overrideOaDrawdownMonthly : (Number(inputs.oaDrawdownMonthly) || 0);
  const oaDrawdownAnnual = oaDrawdownMonthly * 12;
  const oaDrawdownFloor = Number(inputs.oaDrawdownFloor) || 0;
  const oaDrawdownActive = oaDrawdownStartAge > 0 && oaDrawdownMonthly > 0;

  // Property Monetisation: one-time event (downgrade / LBS / Silver Housing Bonus)
  // Cash proceeds go to member's bank account (private assets); RA top-up credited to RA.
  const propMonetiseEnabled = inputs.propMonetiseEnabled === true;
  const propMonetiseAge = Number(inputs.propMonetiseAge) || 65;
  const propMonetiseCash = Number(inputs.propMonetiseCashProceeds) || 0;
  const propMonetiseRaTopup = Number(inputs.propMonetiseRaTopup) || 0;
  let propMonetiseApplied = startAge >= propMonetiseAge && propMonetiseEnabled;

  // AW ceiling: $102,000 − Total Ordinary Wages subject to CPF for the year
  // (NOT the CPF contributions themselves — the OW wages, capped at $8,000/mo × 12 = $96,000)
  // E.g. if OW = $8,000/mo → OW subject to CPF = $96,000 → AW ceiling = $102,000 − $96,000 = $6,000
  const owMonthly = Math.min(Number(inputs.salaryGross) || 0, 8000);
  const owAnnualSubjectToCPF = owMonthly * 12;
  const awCeiling = Math.max(0, 102000 - owAnnualSubjectToCPF);

  // PR tenure rate advancement
  // isPR: true only for PR members; SC and undefined default to SC behaviour.
  // startPrYear: the PR tenure year the member is currently in (1, 2, or 3+).
  //   Clamped to [1, 3] — 3 means "Year 3 and beyond" (full SC/PR3+ rates).
  // annualGrossSalary: annual OW subject to CPF (capped at $8,000/mo), used to
  //   derive mandatory OA/SA/MA from the G/G rate table when isPR && currentPrYear < 3,
  //   and for the graduated PR→SC transition (startPrYear < 3, currentPrYear >= 3).
  // currentPrYear: mutable counter incremented each loop iteration; drives
  //   the rate-tier switch from Year 1 → Year 2 → Year 3+ automatically.
  // Three engine paths (see mandatory-contribution block):
  //   A. currentPrYear < 3 → PR rate table × (OW + AW)   [Yr1/Yr2]
  //   B. startPrYear < 3, currentPrYear >= 3 → SC/PR3+ rates × gross salary [graduated]
  //   C. SC or PR3+ from start → baseOA_Emp * gf          [standard]
  const isPR = (inputs.citizenStatus || 'SC') === 'PR';
  const isForeigner = (inputs.citizenStatus || 'SC') === 'foreigner'; // B1: foreigners have no CPF — gates all contributions, voluntary top-ups, and transfers
  const startPrYear = Math.min(3, Math.max(1, Number(inputs.prYear) || 3));
  const annualGrossSalary = owMonthly * 12; // already capped at $8,000/mo above
  let currentPrYear = startPrYear;
  // MMSS carry: grant earned in year N is credited to MA at the start of year N+1 per CPF policy.
  // Set to actualMmss at end of eligible year; applied and reset at the top of the following year.
  let pendingMmssCarry = 0;

  const data = [];

  for (let age = startAge; age <= maxAge; age++) {
    let yearInflow = 0;
    // Per-category flow trackers (reset each year for cashflow ledger)
    let yearMandatory = 0;
    let yearVoluntary = 0;
    let yearGovGrants = 0;
    let yearWisCash = 0;   // BUG-44: WIS cash portion paid directly to member (not in CPF) — for Data Table display only
    let yearOaInterest = 0;
    let yearSaRaInterest = 0;
    let yearMaInterest = 0;
    let yearHousingOut = 0;
    let yearMedOut = 0;
    let yearOaDrawOut = 0;
    let yearLovedOneOut = 0; // OA→MA/SA for loved one (true outflow)
    // Rev #D2: life event flow trackers (reset each year)
    let yearEventsIn  = 0;  // windfall inflows
    let yearEventsOut = 0;  // medical_crisis outflows

    // ── Rev #D2: Resolve active life events for this age ─────────────────────
    const activeEvents = (inputs.lifeEvents || []).filter(
      e => e.enabled !== false && Number(e.startAge) <= age && age <= Number(e.endAge)
    );
    // Flags derived from active events — used throughout the loop below
    const leContribPaused    = activeEvents.some(e => e.type === 'retrenchment' || e.type === 'career_break');
    const leEarlyRetire      = activeEvents.some(e => e.type === 'early_retirement');
    const leHyperinflation   = activeEvents.find(e => e.type === 'hyperinflation');
    const leMedicalEvents    = activeEvents.filter(e => e.type === 'medical_crisis');
    const leWindfallEvents   = activeEvents.filter(e => e.type === 'windfall' && age === Number(e.startAge));

    // ── MMSS carry credit (Issues 1/C2 + 3 fix) ──────────────────────────────────
    // MMSS grants earned in year N are credited to MA at the start of year N+1 per CPF policy.
    // yearInflow + totalInjected are updated here at the correct year (not at grant computation time).
    if (pendingMmssCarry > 0) {
      ma += pendingMmssCarry;
      yearGovGrants += pendingMmssCarry;
      yearInflow += pendingMmssCarry;
      totalInjected += pendingMmssCarry;
      pendingMmssCarry = 0;
    }

    // ── Frequency & duration gating ──────────────────────────────────────────────
    // 'one-time' fields fire only in the first projection year.
    // 'annual' fields with a duration (dur > 0) fire for the first dur years then stop.
    // yearIdx is 0-based: 0 = current age, 1 = next year, etc.
    const isFirstYear = age === startAge;
    const yearIdx     = age - startAge;
    const effVc3aFreq    = vc3aFreq     === 'one-time' && !isFirstYear ? 0 : (vc3aDur     > 0 && yearIdx >= vc3aDur)     ? 0 : 1;
    const effVcSaFreq    = vcSaFreq     === 'one-time' && !isFirstYear ? 0 : (vcSaDur     > 0 && yearIdx >= vcSaDur)     ? 0 : 1;
    const effVcMaFreq    = vcMaFreq     === 'one-time' && !isFirstYear ? 0 : (vcMaDur     > 0 && yearIdx >= vcMaDur)     ? 0 : 1;
    const effVcVhrFreq   = vcVhrFreq    === 'one-time' && !isFirstYear ? 0 : (vcVhrDur    > 0 && yearIdx >= vcVhrDur)    ? 0 : 1;
    const effGovGrantFreq= govGrantFreq === 'one-time' && !isFirstYear ? 0 : (govGrantDur > 0 && yearIdx >= govGrantDur) ? 0 : 1;
    const effWisFreq     = wisFreq      === 'one-time' && !isFirstYear ? 0 : (wisDur      > 0 && yearIdx >= wisDur)      ? 0 : 1;
    const effCpfisOaFreq  = cpfisOaFreq  === 'one-time' && !isFirstYear ? 0 : (cpfisOaDur  > 0 && yearIdx >= cpfisOaDur)  ? 0 : 1;
    const effCpfisSaFreq  = cpfisSaFreq  === 'one-time' && !isFirstYear ? 0 : (cpfisSaDur  > 0 && yearIdx >= cpfisSaDur)  ? 0 : 1;
    const effHousingFreq  = housingFreq  === 'one-time' && !isFirstYear ? 0 : (housingDur  > 0 && yearIdx >= housingDur)  ? 0 : 1;
    const effOaToMaFreq   = oaToMaFreq   === 'one-time' && !isFirstYear ? 0 : (oaToMaDur   > 0 && yearIdx >= oaToMaDur)   ? 0 : 1;
    const effOaToSaFreq   = oaToSaFreq   === 'one-time' && !isFirstYear ? 0 : (oaToSaDur   > 0 && yearIdx >= oaToSaDur)   ? 0 : 1;

    let yearCpfisOut = 0;    // CPFIS outflow from OA + SA this year
    let yearEduOut = 0;      // D1: OA Education Loan Scheme outflow this year

    // ── Mid-year (June) convention: capture OPENING balances before any inflows ──
    // CPF Board rule: contributions received in month M earn from month M+1.
    // Averaging opening + closing gives each inflow ~6 months, each outflow ~6
    // months of interest — the closest annual-model approximation to CPF actual.
    const oaOpen = oa, saOpen = sa, maOpen = ma, raOpen = ra;

    // Phase 2: Private Assets Growth + DWZ Drawdown
    // P1-D fix: when overridePrivDrawdown is injected by the DWZ two-pass logic, the engine
    // deducts the annual draw from private assets (post-growth) so charts reflect reality.
    let yearPrivDrawOut = 0;
    if (age > startAge) {
      privateAssets = privateAssets * (1 + privateGrowth) + privateSaving;
    } else {
      privateAssets += privateSaving;
    }
    if (overridePrivDrawdown > 0 && overridePrivDrawdownStart > 0 && age >= overridePrivDrawdownStart) {
      const actualPrivDraw = Math.min(overridePrivDrawdown, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actualPrivDraw);
      yearPrivDrawOut = actualPrivDraw;
    }

    // SRS accumulation and drawdown
    // 1. Growth on existing balance (always, even during drawdown — on remaining balance)
    if (age > startAge) srsBalance = srsBalance * (1 + srsReturn);
    // 2. Annual contribution (up to stop age, only before drawdown starts)
    if (age <= srsContribStop && age < srsDrawStart) srsBalance += srsContrib;
    // 3. Drawdown: compute fixed annual draw at drawdown start, then deplete over srsDrawYears
    if (age === srsDrawStart && !srsDrawdownApplied) {
      // Divide balance evenly over the drawdown window — growth continues on remaining balance
      // NX5 fix: use PMT annuity formula so the level annual draw exactly depletes the
      // growing SRS balance over srsDrawYears — avoids the large forced-zero discontinuity
      // that the old "balance / n" approach produced in the final year.
      // PMT = PV × r / (1 − (1+r)^−n)  where PV = post-growth balance at drawdown start.
      srsAnnualDraw = srsDrawYears > 0
        ? (srsReturn > 0
            ? Math.round(srsBalance * srsReturn / (1 - Math.pow(1 + srsReturn, -srsDrawYears)))
            : Math.round(srsBalance / srsDrawYears))
        : srsBalance;
      srsDrawdownApplied = true;
    }
    if (srsDrawdownApplied && age >= srsDrawStart && age < srsDrawStart + srsDrawYears) {
      srsBalance = Math.max(0, srsBalance - srsAnnualDraw);
    }
    // PMT formula produces near-zero balance at final year; cleanup handles any float residual
    if (srsDrawdownApplied && age === srsDrawStart + srsDrawYears - 1) srsBalance = 0;

    // Phase 2: Property Downpayment from OA
    if (age === downpaymentAge && plannedDownpaymentOA > 0 && !downpaymentApplied) {
      const actualDownpayment = Math.min(oa, plannedDownpaymentOA);
      oa -= actualDownpayment;
      cumHousingOA += actualDownpayment;
      cumHousingFV  += actualDownpayment;   // start compounding interest from downpayment year
      downpaymentApplied = true;
    }

    // SA closure at 55
    if (age === 55 && startAge < 55) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
      // CPF policy (Slide 21): if FRS cannot be met, retain at least $5,000 in OA for withdrawal.
      const fromOA = Math.min(Math.max(0, oa - 5000), req); ra += fromOA; oa -= fromOA;
    } else if (age === startAge && startAge >= 55 && sa > 0) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
    }

    // OA withdrawal at 55 — one-time (default: deduct once at 55) or annual (deduct every year from 55+)
    if (oaWithdrawalAt55 > 0) {
      // NX2 fix: both paths now (a) respect oaDrawdownFloor, (b) credit yearOaDrawOut so the
      // withdrawal appears in the cashflow ledger OA-draw column, and (c) increment totalOutSpent
      // so cumulativeOutflow is correct. Previously OA simply shrank silently with no ledger trace.
      if (oaWithdrawalFreq === 'annual') {
        if (age >= 55) {
          const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor));
          oa            -= actualW55;
          yearOaDrawOut += actualW55;
          totalOutSpent += actualW55;
        }
      } else {
        if (age === 55 && !withdrawalApplied) {
          const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor));
          oa            -= actualW55;
          yearOaDrawOut += actualW55;
          totalOutSpent += actualW55;
          withdrawalApplied = true;
        }
      }
    }

    // Pledge RA withdrawal: member applies to withdraw pledged RA funds (above BRS) as cash at pledgeWithdrawalAge
    // Funds leave CPF entirely (go to bank account). Only deducted if pledge is ON and age matches.
    if (usePropertyPledge && pledgeWithdrawalAmount > 0 && age === pledgeWithdrawalAge && !pledgeWithdrawalApplied) {
      // Can only withdraw RA above BRS
      const projBRS_pw = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
      const maxWithdrawable = Math.max(0, ra - projBRS_pw);
      const actualPledgeWithdraw = Math.min(pledgeWithdrawalAmount, maxWithdrawable);
      ra = Math.max(0, ra - actualPledgeWithdraw);
      // P1-A fix: credit outflow trackers so cumulative outflow KPI and cashflow ledger are correct
      totalOutSpent += actualPledgeWithdraw;
      yearOaDrawOut += actualPledgeWithdraw; // reuse OA-draw ledger column (cash-out from CPF)
      pledgeWithdrawalApplied = true;
    }

    // OA→SA transfer (annual/one-time, before 55 only)
    // Policy: capped at (1) OA balance and (2) FRS headroom in SA (self only).
    // For loved one: OA is simply an outflow; SA/RA of the loved one is not tracked here.
    if (age < 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const actualTransfer = oaToSaForLovedOne
        ? Math.min(annualOaToSa, oa)
        : (() => {
            const projFRS_oaToSa = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
            const saRoom_oaToSa = Math.max(0, projFRS_oaToSa - sa);
            return Math.min(annualOaToSa, oa, saRoom_oaToSa);
          })();
      oa -= actualTransfer;
      if (!oaToSaForLovedOne) {
        sa += actualTransfer;
      } else {
        yearLovedOneOut += actualTransfer;
        totalOutSpent += actualTransfer;
      }
    }
    // OA→RA transfer (annual/one-time, age 55 and above only)
    // Policy: voluntary transfers to loved one's RA = OA outflow only (no internal RA credit).
    if (age >= 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const actualTransferRA = oaToSaForLovedOne
        ? Math.min(annualOaToSa, oa)
        : (() => {
            const projERS_oaToRa = Math.round(RETIREMENT_SUMS_2026.ERS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
            const raRoom_oaToRa = Math.max(0, projERS_oaToRa - ra);
            return Math.min(annualOaToSa, oa, raRoom_oaToRa);
          })();
      oa -= actualTransferRA;
      if (!oaToSaForLovedOne) {
        ra += actualTransferRA;
        cumRaCashTopUps += actualTransferRA;
      } else {
        yearLovedOneOut += actualTransferRA;
        totalOutSpent += actualTransferRA;
      }
    }

    // OA→MA transfer: CPF policy requires age 55+, FRS or BRS+property already set aside.
    // For self: internal move OA→MA (both accounts change). For loved one: OA outflow only.
    if (age >= 55 && annualOaToMa > 0 && effOaToMaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const projBHS_tr = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
      const maRoom_tr = oaToMaForLovedOne ? annualOaToMa : Math.max(0, projBHS_tr - ma);
      const actualOaToMa = Math.min(annualOaToMa, oa, maRoom_tr);
      oa -= actualOaToMa;
      if (!oaToMaForLovedOne) {
        ma += actualOaToMa; // self: internal move
      } else {
        yearLovedOneOut += actualOaToMa; // loved one: tracked as outflow
        totalOutSpent += actualOaToMa;
      }
    }

    // Direct cash top-up to MA (freq-gated, any age, capped at BHS headroom, not Annual Limit)
    // maBeforeVcMa: saved here for MMSS eligibility check — policy assesses MA balance
    // before the current year's VCMA top-up (Issue 5 fix).
    const maBeforeVcMa = ma;
    if (vcMaCash * effVcMaFreq > 0 && !isForeigner) { // B1: foreigners cannot top up CPF
      const projBHS_vcma = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
      const maRoom_vcma = Math.max(0, projBHS_vcma - ma);
      const actualVcMa = Math.min(vcMaCash * effVcMaFreq, maRoom_vcma);
      ma += actualVcMa;
      yearInflow += actualVcMa;
      totalInjected += actualVcMa;
      yearVoluntary += actualVcMa;
    }

    // MMSS: auto-derived from vcMaCash × effVcMaFreq — no separate user-entered grant amount.
    // Fixes applied:
    //   Issue 2: simYear gate is now 2026–2030 (added lower bound — pilot starts 1 Jan 2026).
    //   Issue 3: grant is NOT credited immediately; stored in pendingMmssCarry and applied
    //            at the top of the NEXT loop iteration (CPF policy: credited start of following year).
    //   Issue 4: income gate enforced — employed uses owMonthly; SEP uses netTradeIncome/12.
    //   Issue 5: eligibility uses maBeforeVcMa (pre-VCMA balance), not the post-top-up ma.
    //            maRoom_mm still uses current (post-VCMA) ma for the headroom cap — correct,
    //            as the grant arrives next year when MA is at least at today's post-VCMA level.
    // N3 fix: clamp effectiveBaseYear to 2026 so legacy/imported profiles with a stale
    // currentYear < 2026 don't have their MMSS pilot window suppressed.  The MMSS scheme
    // launched in 2026; any simulation year computed from an earlier baseYear would fail
    // the >= 2026 gate even when the user is clearly projecting into 2026+ territory.
    const effectiveBaseYear_mmss = Math.max(MMSS_PILOT_START_YEAR, baseYear);
    const simYear_mmss = effectiveBaseYear_mmss + (age - startAge);
    // P1 fix: MMSS income gate must include AW/bonus in monthly gross, mirroring the MRSS N4 fix
    // (lines 1216-1219) and the MMSS UI badge (BUG-6 comment, lines 6154-6162).
    // gf_mmss is computed locally — this block runs outside the contribStop gate so the
    // top-level gf (line 979) is not yet in scope. salaryGrowth and salaryBump are pre-loop.
    const gf_mmss             = computeGF(age, salaryBump);
    const owAnnualScaled_mmss = Math.min(owMonthly * 12 * gf_mmss, 96000);
    const awCeilingMmss       = Math.max(0, 102000 - owAnnualScaled_mmss);
    const bonusMmss           = Math.min((Number(inputs.salaryBonus) || 0) * gf_mmss, awCeilingMmss);
    const mmssMonthlyIncome   = isSEP
      ? ((Number(inputs.netTradeIncome) || 0) / 12)
      : Math.round((owAnnualScaled_mmss + bonusMmss) / 12); // OW + AW/12; 0 post-retirement
    if (isSC && age >= 55 && age <= 70 &&
        simYear_mmss >= MMSS_PILOT_START_YEAR && simYear_mmss <= MMSS_PILOT_END_YEAR &&
        mmssMonthlyIncome <= 4000) {
      const projBHS_mm = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + rsGrowth, Math.max(0, simYear_mmss - 2026)));
      if (maBeforeVcMa < projBHS_mm / 2) { // Issue 5: pre-VCMA balance for eligibility
        const vcMaThis = vcMaCash * effVcMaFreq;
        if (vcMaThis > 0) {
          const maRoom_mm = Math.max(0, projBHS_mm - ma); // post-VCMA ma for headroom cap
          const actualMmss = Math.min(vcMaThis, 1000, maRoom_mm);
          // Issue 3: store in carry — credited to MA at start of following year, not immediately.
          // Issues 1/C2: yearInflow + totalInjected also updated then, in the carry block above.
          // NX6 fix: use += not = so back-to-back eligible years accumulate correctly
          // and future refactoring (e.g. moving the MMSS block) can't silently discard a prior carry
          if (actualMmss > 0) { pendingMmssCarry += actualMmss; }
        }
      }
    }

    // CPFIS — OA tranche: only OA savings ABOVE $20,000 are investible; age 18+ required.
    if (cpfisOaAmount * effCpfisOaFreq > 0 && age >= 18 && !isForeigner) { // B1: foreigners have no CPF
      const cpfisOaInvestible = Math.max(0, oa - 20000);
      const actualCpfisOa = Math.min(cpfisOaAmount * effCpfisOaFreq, cpfisOaInvestible);
      oa -= actualCpfisOa;
      yearCpfisOut += actualCpfisOa;
      totalOutSpent += actualCpfisOa;
    }
    // CPFIS — SA tranche: only SA savings ABOVE $40,000 are investible; SA is open pre-55 only; age 18+ required.
    // Post-55 SA is closed (merged to RA) so SA CPFIS is silently skipped after age 55.
    if (cpfisSaAmount * effCpfisSaFreq > 0 && age < 55 && age >= 18 && !isForeigner) { // B1: foreigners have no CPF
      const cpfisSaInvestible = Math.max(0, sa - 40000);
      const actualCpfisSa = Math.min(cpfisSaAmount * effCpfisSaFreq, cpfisSaInvestible);
      sa -= actualCpfisSa;
      yearCpfisOut += actualCpfisSa;
      totalOutSpent += actualCpfisSa;
    }

    // Rev #D2: leContribPaused (retrenchment/career_break) zeros gf like a career break.
    // leEarlyRetire treats this age as past contribStop — skip the entire contribution block.
    if (age < contribStop && !isForeigner && !leEarlyRetire) { // B1: foreigners have no CPF obligations
      const gf = leContribPaused ? 0 : computeGF(age, salaryBump);
      // mandatorySA_base: used by SEP branch (always from user-entered baseSA_Emp).
      // Non-SEP branch computes its own mandatorySA_dyn below, which may come from
      // the PR G/G rate table when isPR && currentPrYear < 3.
      const mandatorySA_base = Math.round(baseSA_Emp * gf);

      if (isSEP) {
        // SEP VC3A: single cash lump-sum auto-split by age-band rates + VHR to OA
        // VHR is NOT subject to the Annual Limit — apply it straight to OA
        const nti = Number(inputs.netTradeIncome) || 0;
        let sepMandatoryMA = 0;
        if (nti > 6000) {
            // CPF Board's SEP MediSave Contribution Schedule is NTI-based and age-banded.
            // These rates apply equally to SC and all PR years — no separate PR G/G table
            // is published for SEP MA contributions. This is correct by policy design.
            let maRate = 0.08;
            if (age > 50) maRate = 0.105;
            else if (age > 45) maRate = 0.10;
            else if (age > 35) maRate = 0.09;
            sepMandatoryMA = Math.round(Math.min(nti, 96000) * maRate);
        }
        const vc3aTotal = Math.min(vc3aCash * effVc3aFreq, Math.max(0, ANNUAL_LIMIT - sepMandatoryMA)); // E1 fix: apply frequency/duration gate (mirrors employee branch line 1160)
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if (age <= 35) { vc3aOaRatio = 0.23; vc3aSaRatio = 0.06; vc3aMaRatio = 0.08; }
        else if (age <= 45) { vc3aOaRatio = 0.21; vc3aSaRatio = 0.07; vc3aMaRatio = 0.09; }
        else if (age <= 50) { vc3aOaRatio = 0.19; vc3aSaRatio = 0.08; vc3aMaRatio = 0.10; }
        else if (age <= 55) { vc3aOaRatio = 0.15; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 60) { vc3aOaRatio = 0.12;  vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 65) { vc3aOaRatio = 0.035; vc3aSaRatio = 0.11;  vc3aMaRatio = 0.105; }
        else if (age <= 70) { vc3aOaRatio = 0.01;  vc3aSaRatio = 0.05;  vc3aMaRatio = 0.105; }
        else               { vc3aOaRatio = 0.01;  vc3aSaRatio = 0.01;  vc3aMaRatio = 0.105; }
        const ratioSum = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        const toOA_vc3a = Math.round(vc3aTotal * (vc3aOaRatio / ratioSum)) + vcVhrAmt * effVcVhrFreq; // E1 fix: apply frequency gate to VHR in SEP branch
        const toMA_vc3a = Math.round(vc3aTotal * (vc3aMaRatio / ratioSum));
        const toSA_vc3a = vc3aTotal - Math.round(vc3aTotal * (vc3aOaRatio / ratioSum)) - toMA_vc3a;
        // WIS for SEP: 90% goes to MA (subject to BHS), 10% is cash (not modelled here)
        const wisToMA_sep = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.9) : 0;
        yearWisCash = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.1) : 0; // BUG-44: cash portion for display
        const projBHS_i = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const maRoom = Math.max(0, projBHS_i - ma);
        // B3 SEP: priority split — mandatory MA gets first claim on BHS room, vc3a MA gets remainder
        const actualMandatoryMA_sep = Math.min(sepMandatoryMA, maRoom);
        const vcMaRoomSep = Math.max(0, maRoom - actualMandatoryMA_sep);
        const actualVcMA_sep = Math.min(toMA_vc3a, vcMaRoomSep);
        // maSpill carries both mandatory overflow (if BHS already full) and vc3a MA overflow
        const maSpill = (sepMandatoryMA - actualMandatoryMA_sep) + (toMA_vc3a - actualVcMA_sep);
        // B2 SEP: WIS MA overflow — any WIS that can't fit in remaining BHS room spills to SA/RA
        const remainingMaRoom = Math.max(0, maRoom - actualMandatoryMA_sep - actualVcMA_sep);
        const actualToMAWis = Math.min(wisToMA_sep, remainingMaRoom);
        const wisMASpill = wisToMA_sep - actualToMAWis;   // B2: overflow routed below
        ma += (actualMandatoryMA_sep + actualVcMA_sep + actualToMAWis);
        // M3: projFRS_sep is shared by both age branches — identical formula, computed once
        const projFRS_sep = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        if (age >= 55) {
          // VC3A: RA cap is FRS (not ERS — ERS applies only to RSTU cash top-ups)
          const raRoom_sep = Math.max(0, projFRS_sep - ra);
          // B2: include wisMASpill in SA/RA routing alongside vc3a SA and maSpill
          const toRA_sep = Math.min(toSA_vc3a + maSpill + wisMASpill, raRoom_sep);
          ra += toRA_sep;
          oa += (toSA_vc3a + maSpill + wisMASpill - toRA_sep);
        } else {
          // MA spill to SA is capped at FRS — excess above FRS overflows to OA
          const saRoomSep = Math.max(0, projFRS_sep - sa);
          // B2: include wisMASpill in SA routing
          const toSA_total = toSA_vc3a + maSpill + wisMASpill;
          const actualToSA_sep = Math.min(toSA_total, saRoomSep);
          sa += actualToSA_sep;
          oa += (toSA_total - actualToSA_sep); // FRS overflow to OA
        }
        oa += toOA_vc3a;
        // MRSS eligibility: SC only · age >= 55 (or PwD) · RA/balance below BRS · income ≤ $4,000/mo · lifetime cap $20,000
        // Auto-derived: grant = min(RSTU top-up this year, $2,000, cap remaining). No separate user input.
        const projBRS_sep = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_sep = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_sep = age >= 55 ? ra < projBRS_sep : (oa + sa) < projBRS_sep;
        // Reuse mmssMonthlyIncome (computed above for MMSS) so both MRSS and MMSS
        // use the same single monthly-income source for the ≤$4,000 income gate.
        // For SEPs: mmssMonthlyIncome = NTI / 12 (same formula; AW not applicable).
        const mrssIncomeOk_sep = mmssMonthlyIncome <= 4000;
        const vcSaThis_sep = (Number(inputs.vcSaTopup) || 0) * effVcSaFreq;
        const mrssEligible_sep = isSC && mrssAgeOk_sep && mrssBalOk_sep && mrssIncomeOk_sep && cumMrssReceived < 20000 && vcSaThis_sep > 0;
        const actualMrss_sep = mrssEligible_sep ? Math.min(vcSaThis_sep, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_sep > 0) cumMrssReceived += actualMrss_sep;
        const govGrant_sep = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        if (age >= 55) { ra += govGrant_sep + actualMrss_sep; }
        else { sa += govGrant_sep + actualMrss_sep; }
        // B2: yearInflow and yearGovGrants now include WIS (wisToMA_sep = actualToMAWis + wisMASpill)
        // Fix: use a local variable for the contribution-phase inflow so that vcMaCash and
        // any MMSS carry already accumulated into yearInflow (before this block) are not
        // overwritten. yearInflow must be += (not =) to preserve those earlier additions.
        const sepContribInflow = vc3aTotal + vcVhrAmt * effVcVhrFreq + sepMandatoryMA + govGrant_sep + actualMrss_sep + wisToMA_sep; // E1 fix: VHR frequency-gated
        yearInflow += sepContribInflow;
        totalInjected += sepContribInflow;
        cumRaCashTopUps += toSA_vc3a + maSpill + wisMASpill + govGrant_sep + actualMrss_sep;
        // Cashflow ledger breakdown (SEP)
        yearMandatory += actualMandatoryMA_sep;          // B3: actual amount credited to MA, not nominal
        yearVoluntary += vc3aTotal + vcVhrAmt * effVcVhrFreq; // E1 fix: VHR frequency-gated
        yearGovGrants += govGrant_sep + actualMrss_sep + wisToMA_sep; // B2: WIS included
      } else {
        // Mandatory contribution calculation — three paths:
        // Path A. PR Yr1/2 (currentPrYear < 3): use advancing PR rate table applied to
        //    annualGrossSalary * gf (OW) + AW bonus portion. Bug fix: bonus was
        //    previously excluded, understating PR Yr1/2 contributions for members
        //    with a significant annual wage.
        // Path B. PR Yr3+ graduated from Yr1/2 (isPR && startPrYear < 3 && currentPrYear >= 3):
        //    use SC/PR3+ rates computed dynamically from gross salary. Bug fix: previously
        //    fell back to baseOA_Emp which held PR Yr1/2 values (~9–24%), silently
        //    understating contributions by the difference vs SC rates (~37%).
        // Path C. SC or PR3+ from start: use user-entered base fields scaled by gf (unchanged).
        let mandatoryOA_i, mandatorySA_dyn, mandatoryMA_i;
        if (isPR && currentPrYear < 3) {
          // Path A — PR Yr1/2: rate table × (OW + AW)
          // Fix 2: include AW (bonus) using the same awCeiling logic as Auto-Calc.
          // The bonus scales with gf (consistent with how SC path scales baseOA_Emp * gf,
          // which already bakes in the bonus at year 0).
          const prRates = getPRRates(currentPrYear, age, inputs.prRateType || 'GG');
          const grossScaled = annualGrossSalary * gf;
          // OW ceiling at $8k/mo already enforced in annualGrossSalary; scale with gf
          // but re-cap at $96k (8000×12) if salary growth pushes past ceiling.
          const owScaledCapped = Math.min(grossScaled, 96000);
          const awCeilingEng = Math.max(0, 102000 - owScaledCapped);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = owScaledCapped + bonusCpfEng;
          mandatoryOA_i  = Math.round(totalScaled * prRates.oa);
          mandatorySA_dyn = Math.round(totalScaled * prRates.sa);
          mandatoryMA_i  = Math.round(totalScaled * prRates.ma);
        } else if (isPR && startPrYear < 3) {
          // Path B — PR member graduated to Yr3+: compute SC/PR3+ rates dynamically.
          // Fix 1: previously used baseOA_Emp (PR Yr1/2 values) — now uses SC rate table.
          // OA/SA/MA rates mirror the SC/PR3+ (Table 1, 2026) age-band splits in Auto-Calc.
          let scOA, scSA, scMA;
          if      (age <= 35) { scOA=0.23; scSA=0.06;  scMA=0.08;  }
          else if (age <= 45) { scOA=0.21; scSA=0.07;  scMA=0.09;  }
          else if (age <= 50) { scOA=0.19; scSA=0.08;  scMA=0.10;  }
          else if (age <= 55) { scOA=0.15; scSA=0.115; scMA=0.105; }
          else if (age <= 60) { scOA=0.12; scSA=0.115; scMA=0.105; }
          else if (age <= 65) { scOA=0.035;scSA=0.11;  scMA=0.105; }
          else if (age <= 70) { scOA=0.01; scSA=0.05;  scMA=0.105; }
          else               { scOA=0.01; scSA=0.01;  scMA=0.105; }
          const grossScaled = Math.min(annualGrossSalary * gf, 96000);
          const awCeilingEng = Math.max(0, 102000 - grossScaled);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = grossScaled + bonusCpfEng;
          mandatoryOA_i  = Math.round(totalScaled * scOA);
          mandatorySA_dyn = Math.round(totalScaled * scSA);
          mandatoryMA_i  = Math.round(totalScaled * scMA);
        } else {
          // Path C — SC or PR3+ from start: use user-entered base fields scaled by gf.
          mandatoryOA_i  = Math.round(baseOA_Emp * gf);
          mandatorySA_dyn = mandatorySA_base; // same as Math.round(baseSA_Emp * gf)
          mandatoryMA_i  = Math.round(baseMA_Emp * gf);
          // P3-A fix: Paths A & B cap at OW/AW ceilings which implicitly cap below ANNUAL_LIMIT.
          // Path C (manual entries) has no such ceiling — growth factor (gf) can push totals past
          // $37,740/yr indefinitely. Proportionally scale down to ANNUAL_LIMIT if breached.
          const totalC = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
          if (totalC > ANNUAL_LIMIT) {
            const scaleC = ANNUAL_LIMIT / totalC;
            mandatoryOA_i   = Math.round(mandatoryOA_i   * scaleC);
            mandatorySA_dyn = Math.round(mandatorySA_dyn * scaleC);
            mandatoryMA_i   = ANNUAL_LIMIT - mandatoryOA_i - mandatorySA_dyn; // remainder prevents rounding gap
          }
        }
        // VC3A: single lump-sum auto-split by age-band rates + VHR to OA
        // WIS employees: 60% goes to CPF via age-band rates
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if (age <= 35) { vc3aOaRatio = 0.23; vc3aSaRatio = 0.06; vc3aMaRatio = 0.08; }
        else if (age <= 45) { vc3aOaRatio = 0.21; vc3aSaRatio = 0.07; vc3aMaRatio = 0.09; }
        else if (age <= 50) { vc3aOaRatio = 0.19; vc3aSaRatio = 0.08; vc3aMaRatio = 0.10; }
        else if (age <= 55) { vc3aOaRatio = 0.15; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 60) { vc3aOaRatio = 0.12; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 65) { vc3aOaRatio = 0.035; vc3aSaRatio = 0.11; vc3aMaRatio = 0.105; }
        else if (age <= 70) { vc3aOaRatio = 0.01; vc3aSaRatio = 0.05; vc3aMaRatio = 0.105; }
        else { vc3aOaRatio = 0.01; vc3aSaRatio = 0.01; vc3aMaRatio = 0.105; }
        const ratioSum_emp = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        // WIS: 60% of annual WIS amount goes to CPF via age-band split
        const wisCpf = wisAmount * effWisFreq > 0 ? Math.round(wisAmount * effWisFreq * 0.6) : 0;
        yearWisCash = Math.round(wisAmount * effWisFreq * 0.4); // BUG-44: cash portion (40%) for Data Table display
        const wisOA = Math.round(wisCpf * (vc3aOaRatio / ratioSum_emp));
        const wisMA = Math.round(wisCpf * (vc3aMaRatio / ratioSum_emp));
        const wisSA = wisCpf - wisOA - wisMA;
        // VC3A (cash only) split — freq-gated
        const vc3aCashEff = vc3aCash * effVc3aFreq;
        const vcVhrAmtEff = vcVhrAmt * effVcVhrFreq;
        const vc3aOA = Math.round(vc3aCashEff * (vc3aOaRatio / ratioSum_emp));
        const vc3aMA = Math.round(vc3aCashEff * (vc3aMaRatio / ratioSum_emp));
        const vc3aSA = vc3aCashEff - vc3aOA - vc3aMA;
        // Annual Limit: applies to mandatory + VC3A (WIS is govt, not counted in limit)
        const totalMandatory = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
        const vcRoomThisYear = Math.max(0, ANNUAL_LIMIT - totalMandatory);
        // Scale VC3A if it exceeds the room (VHR + RSTU handled separately outside limit)
        const vc3aScale = vc3aCashEff > 0 && vc3aCashEff > vcRoomThisYear ? vcRoomThisYear / vc3aCashEff : 1;
        const cappedVcOA = Math.round(vc3aOA * vc3aScale) + vcVhrAmtEff;
        const cappedVcSA = overrideVcSA !== undefined
          ? Math.round(overrideVcSA * vc3aScale) + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq
          : Math.round(vc3aSA * vc3aScale) + (Number(inputs.vcSaTopup) || 0) * effVcSaFreq + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        const cappedVcMA = Math.round(vc3aMA * vc3aScale);

        const totalOA = mandatoryOA_i + cappedVcOA + wisOA;
        // BHS cap on MA — B3: priority split so mandatory gets first claim, then vc3a MA, then WIS MA
        const projBHS_emp = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const maRoomEmp = Math.max(0, projBHS_emp - ma);
        const actualMandatoryMA_emp = Math.min(mandatoryMA_i, maRoomEmp);
        const vcMaRoomEmp = Math.max(0, maRoomEmp - actualMandatoryMA_emp);
        const actualVcMA_emp = Math.min(cappedVcMA, vcMaRoomEmp);
        const wisMARoom_emp = Math.max(0, vcMaRoomEmp - actualVcMA_emp);
        const actualWisMA_emp = Math.min(wisMA, wisMARoom_emp);
        const actualMA = actualMandatoryMA_emp + actualVcMA_emp + actualWisMA_emp;
        const rawMA = mandatoryMA_i + cappedVcMA + wisMA;  // retained for maSpillEmp
        const maSpillEmp = rawMA - actualMA;

        oa += totalOA;
        ma += actualMA;
        // Fix: use a local variable so yearInflow += (not =) preserves vcMaCash and
        // MMSS carry already accumulated into yearInflow before the contrib block.
        // BUG-02 fix: actualMrss_emp is computed below (line ~1181) but must be included
        // in empContribInflow so yearInflow and totalInjected are accurate.
        // We defer the final empContribInflow addition until after actualMrss_emp is known.
        // The base portion (without MRSS) is accumulated first; MRSS is added after line 1182.
        const empContribInflowBase = totalOA + mandatorySA_dyn + cappedVcSA + actualMA + wisSA;
        // yearInflow and totalInjected updated below after actualMrss_emp is resolved.
        // Cashflow ledger breakdown (employed) — B3: use priority-split actuals, not Math.min on raw
        yearMandatory += mandatoryOA_i + mandatorySA_dyn + actualMandatoryMA_emp;
        // N5 fix: replace bare vcSaTopup term with (cappedVcSA - annualGovGrant).
        // cappedVcSA = vc3aSA*scale + vcSaTopup + annualGovGrant.  Previously only
        // vcSaTopup was credited here, leaving vc3aSA silently missing from yearVoluntary
        // (it flowed into yearInflow via cappedVcSA but never into any sub-ledger bucket).
        // annualGovGrant is correctly owned by yearGovGrants — subtract it to avoid overlap.
        const govGrantContrib_emp = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        yearVoluntary += (cappedVcOA - vcVhrAmtEff) + (vc3aCashEff > 0 ? actualVcMA_emp : 0) + (cappedVcSA - govGrantContrib_emp) + vcVhrAmtEff;
        // MRSS eligibility: SC only · age >= 55 (or PwD) · RA/balance below BRS · income ≤ $4,000/mo · lifetime cap $20,000
        // Auto-derived: grant = min(RSTU top-up this year, $2,000, cap remaining). No separate user input.
        const projBRS_emp = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_emp = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_emp = age >= 55 ? ra < projBRS_emp : (oa + sa) < projBRS_emp;
        // N4 fix: MRSS income gate must use total gross monthly income (OW + AW/12), not OW alone.
        // A member earning $3,900/mo OW + $24,000 bonus has ~$5,900 effective monthly gross and
        // is ineligible. Mirror the AW ceiling logic used by the PR rate engine paths.
        const owAnnualScaled_mrss = Math.min(owMonthly * 12 * gf, 96000);
        const awCeilingMrss = Math.max(0, 102000 - owAnnualScaled_mrss);
        const bonusMrss = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingMrss);
        const mrssMonthlyGross_emp = Math.round((owAnnualScaled_mrss + bonusMrss) / 12);
        const mrssIncomeOk_emp = mrssMonthlyGross_emp <= 4000;
        const vcSaThis_emp = (Number(inputs.vcSaTopup) || 0) * effVcSaFreq;
        const mrssEligible_emp = isSC && mrssAgeOk_emp && mrssBalOk_emp && mrssIncomeOk_emp && cumMrssReceived < 20000 && vcSaThis_emp > 0;
        const actualMrss_emp = mrssEligible_emp ? Math.min(vcSaThis_emp, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_emp > 0) cumMrssReceived += actualMrss_emp;
        yearGovGrants += (Number(inputs.annualGovGrant)||0) * effGovGrantFreq + actualMrss_emp + wisCpf * effWisFreq;
        // BUG-02 fix: include actualMrss_emp in empContribInflow so yearInflow/totalInjected are accurate.
        // MRSS is a government grant that flows into RA — it is a real inflow to the member's CPF.
        const empContribInflow = empContribInflowBase + actualMrss_emp;
        yearInflow += empContribInflow;
        totalInjected += empContribInflow;

        if (age >= 55) {
          let roomInRA_Mand = Math.max(0, cohortRetSum - ra);
          let mandToRA = Math.min(mandatorySA_dyn, roomInRA_Mand);
          ra += mandToRA;
          oa += (mandatorySA_dyn - mandToRA);
          // VC3A: RA cap is FRS (not ERS — ERS applies only to RSTU cash top-ups)
          const projFRS_vc3a_emp = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          const vcRoomInRA = Math.max(0, projFRS_vc3a_emp - ra);
          const vcToRA = Math.min(cappedVcSA + maSpillEmp + wisSA, vcRoomInRA);
          ra += vcToRA;
          oa += (cappedVcSA + maSpillEmp + wisSA - vcToRA);
          ra += actualMrss_emp;
          cumRaCashTopUps += vcToRA + actualMrss_emp;
        } else {
          // MA spill to SA is capped at FRS — excess above FRS overflows to OA
          const projFRS_sa = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          const totalToSA = mandatorySA_dyn + cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
          const saRoom = Math.max(0, projFRS_sa - sa);
          const actualToSA = Math.min(totalToSA, saRoom);
          const saOverflow = totalToSA - actualToSA;
          sa += actualToSA;
          oa += saOverflow; // FRS overflow goes to OA
          cumRaCashTopUps += cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
        }
      }
    }

    // Interest (annual rates, randomised ±1% in Monte Carlo mode)
    // Rev #MC: variance band sourced from mcVariance parameter (in %). Inflation noise is half the rate noise.
    const _band = (mcVariance / 100);
    const rateNoise = randomiseRates ? (Math.random() * _band * 2 - _band) : 0;
    const inflNoise = randomiseRates ? (Math.random() * _band - _band / 2) : 0; // ±half-band inflation variance
    const rOA = CPF_RATES.OA + rateNoise;
    const rSA = CPF_RATES.SA + rateNoise;
    const rMA = CPF_RATES.MA + rateNoise;
    const rRA = CPF_RATES.RA + rateNoise;
    // ENG-2 fix: effectiveInflation removed — was declared here but never read downstream.

    // ── Interest: mid-year (June) average-balance convention ──────────────────
    // Base = (opening + post-inflow-and-outflow closing) / 2
    // This gives each inflow ~6 months of interest and each outflow ~6 months
    // of lost interest, matching CPF's own simplified annual projection method.
    const oaAvg = (oaOpen + oa) / 2;
    const saAvg = (saOpen + sa) / 2;
    const maAvg = (maOpen + ma) / 2;
    const raAvg = (raOpen + ra) / 2;
    // ── Extra interest: correct CPF priority order and credit destinations ────
    // Pre-55  (+1% on first $60K): OA* first (cap $20K) → SA → MA
    //   OA's extra credited to SA; SA's extra to SA; MA's extra stays in MA.
    // Post-55 (+1% on first $60K AND +1% on first $30K): RA → OA* (cap $20K) → MA
    //   OA's extra credited to RA (not to OA itself); MA's extra stays in MA.
    // Source: CPF Board interest priority tables (Images 1–4 reviewed Apr 2025).
    let b1ToSA = 0, b1ToMA = 0, b1ToRA = 0;  // extra 1% ($60K pool) credit splits
    let b2ToRA = 0, b2ToMA = 0;               // extra 2nd 1% ($30K pool) credit splits
    if (age < 55) {
      // Pre-55 pool: OA* (cap $20K) → SA → MA
      const oaP1 = Math.min(oaAvg, 20000);
      const rem1 = Math.max(0, 60000 - oaP1);
      const saP1 = Math.min(saAvg, rem1);
      const maP1 = Math.min(maAvg, Math.max(0, rem1 - saP1));
      b1ToSA = (oaP1 + saP1) * CPF_RATES.EXTRA_1;  // OA & SA extra → SA
      b1ToMA = maP1 * CPF_RATES.EXTRA_1;             // MA extra stays in MA
    } else {
      // Post-55 extra 1% ($60K pool): RA → OA* (cap $20K) → MA
      const raP1 = Math.min(raAvg, 60000);
      const rem1 = Math.max(0, 60000 - raP1);
      const oaP1 = Math.min(oaAvg, Math.min(20000, rem1));
      const maP1 = Math.min(maAvg, Math.max(0, rem1 - oaP1));
      b1ToRA = (raP1 + oaP1) * CPF_RATES.EXTRA_1;   // RA & OA extra → RA
      b1ToMA = maP1 * CPF_RATES.EXTRA_1;              // MA extra stays in MA
      // Post-55 extra 2nd 1% ($30K pool): RA → OA* (cap $20K) → MA
      const raP2 = Math.min(raAvg, 30000);
      const rem2 = Math.max(0, 30000 - raP2);
      const oaP2 = Math.min(oaAvg, Math.min(20000, rem2));
      const maP2 = Math.min(maAvg, Math.max(0, rem2 - oaP2));
      b2ToRA = (raP2 + oaP2) * CPF_RATES.EXTRA_2;   // RA & OA extra → RA
      b2ToMA = maP2 * CPF_RATES.EXTRA_2;              // MA extra stays in MA
    }
    const b1 = b1ToSA + b1ToMA + b1ToRA;
    const b2 = b2ToRA + b2ToMA;
    const yearTotalInterest = (oaAvg * rOA) + (saAvg * rSA) + (maAvg * rMA) + (raAvg * rRA) + b1 + b2;
    totalInterest += yearTotalInterest;
    // Per-account interest for cashflow ledger — MA extra now correctly attributed to MA column
    yearOaInterest = Math.round(oaAvg * rOA);
    yearMaInterest = Math.round(maAvg * rMA + b1ToMA + b2ToMA);
    yearSaRaInterest = Math.round(yearTotalInterest) - yearOaInterest - yearMaInterest;
    // Track interest accruing to SA (pre-55) or RA (post-55) for 20% transfer base
    const yearRaInterest = age >= 55
      ? (raAvg * rRA) + b1ToRA + b2ToRA    // post-55: RA base + RA/OA pool extras → RA
      : (saAvg * rSA) + b1ToSA;            // pre-55:  SA base + OA/SA pool extras → SA
    cumRaInterest += yearRaInterest;

    oa += oaAvg * rOA;
    sa += saAvg * rSA;
    ra += raAvg * rRA;
    ma += maAvg * rMA;
    // Apply extra interest to the correct accounts (MA's share stays in MA, not SA/RA)
    if (age < 55) { sa += b1ToSA; ma += b1ToMA; }
    else           { ra += b1ToRA + b2ToRA; ma += b1ToMA + b2ToMA; }

    // Outflows
    const activeHousing = age < housingStop ? baseHousing * effHousingFreq : 0;
    if (activeHousing > 0) { cumHousingOA += activeHousing; yearHousingOut = activeHousing; }
    // Compound existing accrued interest and add this year's withdrawal's first year of interest
    cumHousingFV = (cumHousingFV + activeHousing) * 1.025;   // (prev + this year's withdrawal) × 1.025 — each withdrawal compounds from its own year
    oa = Math.max(0, oa - activeHousing);
    // #3 Property CPF refund: at sell age, refund principal + 2.5% accrued interest to OA
    if (sellPropertyAge > 0 && age === sellPropertyAge && !refundApplied) {
      // cumHousingFV = FV of all OA housing withdrawals compounded at 2.5%/yr per withdrawal date.
      // This correctly compounds each withdrawal from its own year — no lump-sum assumption.
      // Accrued interest = cumHousingFV - cumHousingOA (principal).
      const totalRefund = Math.round(cumHousingFV);
      // Step 1: Full refund credited to OA
      oa += totalRefund;
      yearInflow += totalRefund;
      totalInjected += totalRefund;
      yearVoluntary += totalRefund; // P1-B fix: classify in ledger so CSV sub-bucket math balances
      // Step 2: If property pledge was active, restore RA to FRS from OA
      // (pledge reduced RA to BRS at 55 — sale reverses this benefit up to FRS)
      if (usePropertyPledge) {
        const yrsSince2026 = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projFRSNow = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, yrsSince2026));
        const raHeadroom = Math.max(0, projFRSNow - ra);
        const transferToRA = Math.min(raHeadroom, oa);
        if (transferToRA > 0) {
          oa -= transferToRA;
          ra += transferToRA;
          // P1-E fix: do NOT tag as cumRaCashTopUps — this is a mandatory CPF pledge restoration,
          // not a voluntary top-up. Tagging it was incorrectly shielding these funds from the
          // 20% RA-to-OA transfer at payout age (raTransferBase was understated).
        }
        // Surplus above FRS stays in OA — ERS top-up is always optional
      }
      // Step 3: Property value removed from net worth (sold)
      currentPropValue = 0;
      refundApplied = true;
    }
    const yrSince = Math.max(0, age - startAge);
    const totalMaOut = Math.round(baseMedical * Math.pow(1 + medInfl, yrSince));
    ma = Math.max(0, ma - totalMaOut);
    yearMedOut = totalMaOut;
    const yearTotalOut = activeHousing + totalMaOut;
    totalOutSpent += yearTotalOut;

    // OA Drawdown — post-payout supplementary income drawn from OA
    if (oaDrawdownActive && age >= oaDrawdownStartAge) {
      const availableToDraw = Math.max(0, oa - oaDrawdownFloor);
      const actualDraw = Math.min(oaDrawdownAnnual, availableToDraw);
      oa = Math.max(oaDrawdownFloor, oa - actualDraw);
      yearOaDrawOut = actualDraw;
      totalOutSpent += actualDraw; // tracked as outflow (cash leaving CPF to member)
    }

    // D1: OA Education Loan Scheme — withdraws from OA (CPF Board Education Loan Scheme)
    // Policy: up to 40% of accumulated OA (excluding housing principal already withdrawn).
    //   Accurate cap = 40% of (oa + cumHousingOA) less housing already used, simplified to
    //   40% of current OA balance each year — housing is already deducted from oa above.
    // Age 55+ rule: FRS must be set aside in RA before OA can be used for education.
    // Interest at 2.5%/yr accrues on withdrawn amount immediately (same rate as OA).
    //   From the lender's projection perspective this is a pure OA outflow — cash repayment
    //   back to OA is not modelled here (repayment occurs externally in cash).
    if (oaEduLoanAnnual > 0) {
      const effEduFreq = oaEduLoanFreq === 'one-time' && !isFirstYear ? 0 : (oaEduLoanDur > 0 && yearIdx >= oaEduLoanDur) ? 0 : 1;
      if (effEduFreq > 0) {
        const yrsSince2026_edu = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projFRS_edu = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + rsGrowth, yrsSince2026_edu));
        // Age 55+ FRS gate: skip if RA hasn't met FRS yet
        const frsBlocked = age >= 55 && ra < projFRS_edu;
        if (!frsBlocked) {
          // P3-B fix: CPF policy anchors the 40% cap to *accumulated historical* OA
          // (current balance + prior education withdrawals), not just the shrinking current balance.
          // Old: eduCap = oa * 0.40  (recalculates against ever-smaller oa each year — too restrictive)
          // New: eduCap = (oa + cumEduOut) * 0.40 - cumEduOut  (preserves correct policy headroom)
          const eduCap = Math.max(0, (oa + cumEduOut) * 0.40 - cumEduOut);
          const actualEduLoan = Math.min(oaEduLoanAnnual * effEduFreq, eduCap, oa);
          oa = Math.max(0, oa - actualEduLoan);
          cumEduOut += actualEduLoan; // update cumulative tracker
          yearEduOut = actualEduLoan;
          totalOutSpent += actualEduLoan;
        }
      }
    }

    // Property Monetisation — one-time event (downgrade / LBS / Silver Housing Bonus)
    if (propMonetiseEnabled && age === propMonetiseAge && !propMonetiseApplied) {
      // Cash proceeds credited to private assets (member's bank account)
      privateAssets += propMonetiseCash;
      // RA top-up (e.g. Silver Housing Bonus CPF component, or LBS annuity lump-sum to RA)
      if (propMonetiseRaTopup > 0 && !isForeigner) { // B1: foreigners have no RA — RA top-up silently skipped; cash proceeds still flow to privateAssets above
        ra += propMonetiseRaTopup;
        cumRaCashTopUps += propMonetiseRaTopup;
        yearInflow += propMonetiseRaTopup;
        totalInjected += propMonetiseRaTopup;
        yearVoluntary += propMonetiseRaTopup; // P1-C fix: classify in ledger so sub-bucket sum matches yearInflow
      }
      // Property value reduced to reflect downgrade / LBS (approximate: remove proceeds from property value)
      currentPropValue = Math.max(0, currentPropValue - propMonetiseCash - propMonetiseRaTopup);
      propMonetiseApplied = true;
    }

    // Property
    leaseRemaining = Math.max(0, totalLease - yrSince);
    let effPropGrowth = propGrowth;
    if (isLeasehold && leaseRemaining < 60) effPropGrowth = propGrowth + Math.max(-0.05, -0.002 * (60 - leaseRemaining) / 10);
    currentPropValue = Math.max(0, currentPropValue * (1 + effPropGrowth));

    // PR tenure advancement: each projection year advances the PR rate tier by 1,
    // capped at 3 (full SC/PR3+ rates). Has no effect for SC members (isPR = false).
    if (isPR && currentPrYear < 3) currentPrYear++;

    // ── Rev #D2: Life event effects applied after all other calculations ─────
    // 1. Medical crisis — annual outflow per drawSource
    for (const ev of leMedicalEvents) {
      const amt = Number(ev.magnitude) || 0;
      if (amt <= 0) continue;
      const src = ev.drawSource || 'oa_then_private';
      let actualOut = 0;
      if (src === 'oa') {
        const fromOA = Math.min(amt, Math.max(0, oa));
        oa = Math.max(0, oa - fromOA);
        actualOut = fromOA;
      } else if (src === 'private') {
        const fromPriv = Math.min(amt, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - fromPriv);
        actualOut = fromPriv;
      } else { // oa_then_private (default)
        const fromOA = Math.min(amt, Math.max(0, oa));
        oa = Math.max(0, oa - fromOA);
        const remainder = amt - fromOA;
        const fromPriv = Math.min(remainder, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - fromPriv);
        actualOut = fromOA + fromPriv;
      }
      yearEventsOut += actualOut;
      totalOutSpent += actualOut;
    }
    // 2. Windfall — one-off inflow fires only at startAge
    for (const ev of leWindfallEvents) {
      const amt = Number(ev.magnitude) || 0;
      if (amt <= 0) continue;
      const dest = ev.destination || 'private';
      if (dest === 'private') {
        privateAssets += amt;
      } else if (dest === 'oa') {
        // Respect Annual Limit: only credit up to remaining VC room
        const annualLimitRoom = Math.max(0, ANNUAL_LIMIT - (yearMandatory + yearVoluntary));
        const actualOA = Math.min(amt, annualLimitRoom);
        oa += actualOA;
        yearVoluntary += actualOA;
      } else if (dest === 'srs') {
        // Respect SRS annual cap ($15,300 SC/PR, $35,700 foreigner)
        const srsCapAmt = (inputs.citizenStatus === 'foreigner') ? 35700 : 15300;
        const actualSRS = Math.min(amt, srsCapAmt);
        srsBalance += actualSRS;
      }
      yearEventsIn  += amt;
      yearInflow    += amt;
      totalInjected += amt;
    }
    // 3. Hyperinflation — no balance effect; magnitude stored in projection row for UI use
    // (purchasing-power / real-dollar display uses inflationRate; override surfaced in row below)

    data.push({
      age,
      oa: Math.round(oa), sa: Math.round(sa),
      ma: Math.round(ma), ra: Math.round(ra),
      total: Math.round(oa + sa + ma + ra),
      propertyValue: Math.round(currentPropValue),
      privateAssets: Math.round(privateAssets),
      srsBalance: Math.round(srsBalance),
      interest: Math.round(yearTotalInterest),
      injected: Math.round(yearInflow),
      outflow: Math.round(yearHousingOut + yearMedOut + yearOaDrawOut + yearCpfisOut + yearEduOut + yearLovedOneOut + yearEventsOut),
      cumulativeInjected: Math.round(totalInjected),
      cumulativeInterest: Math.round(totalInterest),
      cumulativeOutflow: Math.round(totalOutSpent),
      cumRaCashTopUps: Math.round(cumRaCashTopUps),
      cumRaInterest: Math.round(cumRaInterest),
      // Cashflow ledger breakdown fields
      yearMandatory: Math.round(yearMandatory),
      yearVoluntary: Math.round(yearVoluntary),
      yearGovGrants: Math.round(yearGovGrants),
      yearOaInterest, yearSaRaInterest, yearMaInterest,
      yearHousingOut: Math.round(yearHousingOut),
      yearMedOut: Math.round(yearMedOut),
      yearOaDrawOut: Math.round(yearOaDrawOut),
      yearLovedOneOut: Math.round(yearLovedOneOut),
      yearCpfisOut: Math.round(yearCpfisOut),
      yearEduOut: Math.round(yearEduOut),
      yearEventsIn:  Math.round(yearEventsIn),   // Rev #D2: windfall inflows
      yearEventsOut: Math.round(yearEventsOut),  // Rev #D2: medical crisis outflows
      yearPrivDrawOut: Math.round(yearPrivDrawOut), // P1-D: private asset DWZ drawdown this year
      yearWisCash: Math.round(yearWisCash),          // BUG-44: WIS cash portion (not CPF) for Data Table display
      cumHousingFV: Math.round(cumHousingFV),        // ENG-1: exact FV of all OA housing withdrawals compounded at 2.5%/yr per-withdrawal — used in milestone alert
      // Rev #D2: active life event types this year (for chart marker rendering)
      activeEventTypes: activeEvents.map(e => e.type),
      activeHyperinflation: leHyperinflation ? Number(leHyperinflation.magnitude) || 0 : 0,
    });
  }
  return data;
}
// ────────────────────────────────────────────────────────────────────────────

export const TooltipContext = createContext({ show: null, set: () => {} });

export const TooltipBox = ({ id, text }) => {
  const { show, set } = useContext(TooltipContext);
  const isOpen = show === id;
  const iconRef = useRef(null);
  const [rect, setRect] = useState(null);

  const handleToggle = (e) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    if (!isOpen && iconRef.current) setRect(iconRef.current.getBoundingClientRect());
    set(isOpen ? null : id); 
  };

  const handleMouseEnter = () => {
    if (iconRef.current) setRect(iconRef.current.getBoundingClientRect());
    set(id);
  };

  return (
    <span 
      ref={iconRef}
      style={{ position: "relative", display: "inline-block", marginLeft: 4, verticalAlign: "middle", lineHeight: 1, cursor: "pointer" }}
      onClick={handleToggle}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => set(null)}
      role="button"
      tabIndex={-1}
    >
      <HelpCircle
        style={{ width: 14, height: 14, display: "inline-block", verticalAlign: "middle", color: isOpen ? "#34d399" : "var(--text-muted)", transition: "color 0.15s" }}
      />
      {isOpen && rect && createPortal(
        <span style={{ position: "fixed", zIndex: 999999, top: rect.top - 8, left: rect.left + (rect.width / 2), transform: "translate(-50%, -100%)", width: 280, padding: "10px 12px", background: "var(--tooltip-bg)", backdropFilter: "blur(4px)", color: "var(--tooltip-text)", fontSize: 11, borderRadius: 8, boxShadow: "var(--tooltip-shadow-inline)", border: "1px solid var(--tooltip-border-inline)", lineHeight: 1.5, display: "block", whiteSpace: "normal", pointerEvents: "none", textAlign: "left" }}>
          {text}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", borderWidth: 6, borderStyle: "solid", borderColor: "var(--tooltip-bg) transparent transparent transparent" }} />
        </span>,
        document.body
      )}
    </span>
  );
};

// ── FreqToggle ──────────────────────────────────────────────────────────────
// Top-level component (NOT defined inside App) so its reference is stable
// across renders. Defined inside App previously caused React to unmount/remount
// every FreqToggle on each setInputs call, which could collapse sidebar sections.
// All call sites pass inputs={inputs} setInputs={setInputs} explicitly.
//
// Props:
//   freqKey  — key in inputs for 'annual' | 'one-time'
//   durKey   — (optional) key in inputs for duration in years (0 = indefinite/∞).
//              Only shown when freq is 'annual' and durKey is provided.
//   type     — pass "one-time" to render a static ONE-TIME badge (no toggle)
//   inputs, setInputs — passed from App
const FreqToggle = ({ freqKey, durKey, type, inputs, setInputs }) => {
  if (type === "one-time") {
    return (
      <span style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 800,
        letterSpacing: "0.04em", verticalAlign: "middle",
        background: "rgba(251,191,36,0.15)", color: "#fbbf24",
        border: "1px solid rgba(251,191,36,0.3)" }}>ONE-TIME</span>
    );
  }
  const current = (inputs && inputs[freqKey]) || "annual";
  const isAnnual = current === "annual";
  const durVal = durKey ? (Number((inputs && inputs[durKey]) || 0)) : 0;
  const btnBase = { fontSize: 10, fontWeight: 800, padding: "2px 8px", border: "none", cursor: "pointer", letterSpacing: "0.04em", lineHeight: 1.6 };
  const makeHandler = (val) => (e) => {
    e.stopPropagation();
    if (setInputs) setInputs(p => ({ ...p, [freqKey]: val }));
  };
  const handleDurChange = (e) => {
    e.stopPropagation();
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const v = raw === "" ? 0 : Math.min(99, Math.max(0, parseInt(raw, 10)));
    if (setInputs) setInputs(p => ({ ...p, [durKey]: v }));
  };
  return (
    <span className="freq-toggle-wrap" onClick={e => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", marginLeft: 6, verticalAlign: "middle", flexShrink: 0, gap: 0 }}>
      {/* Freq toggle pill */}
      <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: `1px solid ${isAnnual ? "rgba(16,185,129,0.35)" : "rgba(251,191,36,0.35)"}` }}>
        <button
          type="button"
          onClick={makeHandler("annual")}
          style={{ ...btnBase, background: isAnnual ? "rgba(16,185,129,0.25)" : "transparent", color: isAnnual ? "#34d399" : "var(--text-subtle)" }}>
          Recurring
        </button>
        <button
          type="button"
          onClick={makeHandler("one-time")}
          style={{ ...btnBase, background: !isAnnual ? "rgba(251,191,36,0.25)" : "transparent", color: !isAnnual ? "#fbbf24" : "var(--text-subtle)", borderLeft: "1px solid var(--border-subtle)" }}>
          One-Time
        </button>
      </span>
      {/* Duration input — only shown for Recurring + durKey provided */}
      {isAnnual && durKey && (
        <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 4,
          background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.25)",
          borderRadius: 3, padding: "0 6px 0 6px", height: 24 }}
          title="Number of years to apply this recurring contribution (0 or blank = indefinite ∞)">
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em", marginRight: 2 }}>for</span>
          <input
            type="text"
            inputMode="numeric"
            value={durVal === 0 ? "" : durVal}
            placeholder="∞"
            onChange={handleDurChange}
            onClick={e => e.stopPropagation()}
            onFocus={e => { e.stopPropagation(); e.target.select(); }}
            style={{
              width: 30, fontSize: 10, fontWeight: 800, fontFamily: "monospace",
              background: "transparent", border: "none", outline: "none",
              color: durVal > 0 ? "var(--clr-sky)" : "var(--text-subtle)",
              textAlign: "center", padding: 0, lineHeight: 1
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em" }}>yr{durVal !== 1 ? "s" : ""}</span>
        </span>
      )}
    </span>
  );
};
// ────────────────────────────────────────────────────────────────────────────

// ── Share-link encode / decode helpers (module-level) ──────────────────────────
// Three formats are recognised on decode, identified by the first character:
//   '~'  New format (this codebase): delta-encoded inputs + plain base64url.
//        Only fields that differ from DEFAULT_INPUTS are stored, so a typical
//        1,500-char JSON shrinks to ~200–400 chars before base64 → final URL
//        length of ~270–540 chars instead of the previous 3,000+ chars.
//   '.'  Old LZ77 format (retired — produced URLs LARGER than plain base64url).
//        Kept in the decoder for backward compatibility with existing share links.
//   no prefix  Legacy: plain base64url of raw UTF-8 bytes. Pre-LZ77 era links.
//
// DEFAULT_INPUTS must be defined before this block (it is — see line ~330).

const lzCompress = (str) => {
  try {
    const state = JSON.parse(str);
    // Delta-encode main inputs: only store fields that differ from DEFAULT_INPUTS
    if (state.inputs && typeof state.inputs === 'object') {
      const delta = {};
      for (const k of Object.keys(DEFAULT_INPUTS)) {
        if (state.inputs[k] !== undefined &&
            JSON.stringify(state.inputs[k]) !== JSON.stringify(DEFAULT_INPUTS[k])) {
          delta[k] = state.inputs[k];
        }
      }
      state.inputs = delta;
    }
    // Delta-encode scenario inputs too
    for (const slot of ['scenarioAInputs', 'scenarioBInputs']) {
      if (state[slot] && typeof state[slot] === 'object') {
        const delta = {};
        for (const k of Object.keys(DEFAULT_INPUTS)) {
          if (state[slot][k] !== undefined &&
              JSON.stringify(state[slot][k]) !== JSON.stringify(DEFAULT_INPUTS[k])) {
            delta[k] = state[slot][k];
          }
        }
        state[slot] = delta;
      }
    }
    const compact = JSON.stringify(state);
    // Plain base64url — no LZ overhead, delta alone gives 60–75% URL reduction
    return '~' + btoa(unescape(encodeURIComponent(compact)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (e) { return encodeURIComponent(str); }
};

const lzDecompress = (encoded) => {
  try {
    if (encoded.startsWith('~')) {
      // New delta format: base64url of compact delta-encoded JSON
      const b64 = encoded.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
      return decodeURIComponent(escape(atob(b64 + pad)));
    }
    if (encoded.startsWith('.')) {
      // Old LZ77 format: strip '.' prefix, decode compressed byte stream
      const b64  = encoded.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      const pad  = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
      const binary = atob(b64 + pad);
      const src  = Array.from(binary, c => c.charCodeAt(0));
      const out  = [];
      let i = 0;
      while (i < src.length) {
        const flag = src[i++];
        if (flag === 0) {
          const off = src[i++], len = src[i++];
          const base = out.length - off;
          for (let k = 0; k < len; k++) out.push(out[base + k]);
        } else {
          out.push(src[i++]);
        }
      }
      return new TextDecoder().decode(new Uint8Array(out));
    }
    // Legacy format: plain base64url of raw UTF-8 bytes (pre-LZ77 era)
    const b64    = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad    = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
    const binary = atob(b64 + pad);
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch (e) { return decodeURIComponent(encoded); }
};

// ── Pure utility functions — hoisted to module level (R7, R8) ──────────────
// Defined outside App() so they are stable references — not re-created on
// every render. Both are pure with no component state dependency.
const formatCurrency = val => "$" + Math.round(Number(val) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// XIRR computation (Newton-Raphson)
// cashFlows: array of {t: year_index, v: amount} — negative = outflow, positive = inflow
const computeXIRR = (cashFlows, guess = 0.05) => {
  if (!cashFlows || cashFlows.length < 2) return null;
  if (cashFlows.every(cf => cf.v >= 0) || cashFlows.every(cf => cf.v <= 0)) return null;
  let rate = guess;
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (const { t, v } of cashFlows) {
      const denom = Math.pow(1 + rate, t);
      f += v / denom;
      df += -t * v / (denom * (1 + rate));
    }
    if (Math.abs(df) < 1e-12) break;
    const newRate = rate - f / df;
    if (Math.abs(newRate - rate) < 1e-8) { rate = newRate; break; }
    rate = newRate;
    if (rate < -0.999) rate = -0.999;
  }
  return isFinite(rate) ? rate : null;
};

// ─── Item 27: React Error Boundary ───────────────────────────────────────────
// Catches runtime errors anywhere in the render tree (engine NaN cascades, bad
// imports, unexpected null access) and surfaces a friendly recovery UI instead
// of a blank screen. Class component is required — React only supports error
// boundaries via getDerivedStateFromError / componentDidCatch on class components.
//
// Placement: wraps the inner content div *inside* TooltipContext.Provider so the
// context is available if we ever need it in the fallback, and so context itself
// is never the thing that crashes.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    // Log to console for debugging — swap to a real error-reporting service if needed
    console.error('[CPF Planner] Render error caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleReset() {
    // Clear profile data from localStorage so a corrupt import can't cause a
    // boot-loop. Section-state and theme prefs are left intact.
    try { localStorage.removeItem('cpf_planner_profile'); } catch { /* ignore */ }
    this.setState({ hasError: false, errorMessage: '' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Fallback UI — deliberately minimal so it can never itself throw
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: 32
      }}>
        <div style={{
          maxWidth: 480, textAlign: 'center', background: '#161b22',
          border: '1px solid #30363d', borderRadius: 16, padding: 40
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#f0f6fc' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: '#8b949e', marginBottom: 8, lineHeight: 1.6 }}>
            The planner encountered an unexpected error and could not render.
            This is usually caused by a malformed imported profile or an engine edge-case.
          </p>
          <p style={{ fontSize: 12, color: '#6e7681', marginBottom: 24,
            fontFamily: 'monospace', background: '#0d1117', borderRadius: 8,
            padding: '8px 12px', wordBreak: 'break-all' }}>
            {this.state.errorMessage}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                background: '#238636', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}
            >
              ↺ Reset &amp; Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d',
                borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}
            >
              ⟳ Reload Page
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 20 }}>
            Your exported profiles are safe — re-import them after resetting.
          </p>
        </div>
      </div>
    );
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const rootRef = useRef(null); // used for sandbox-safe downloads
  const rstuRef = useRef(null); // scroll target for gap-alert "Fix in Inflows ↗" banner
  const [inputs, setInputs] = useState({ ...DEFAULT_INPUTS });
  // Stable refs for keyboard shortcut handler — avoids stale closures in the
  // useEffect (which uses [] deps so the listener is only registered once).
  // Declared here, before activeTab useState, so activeTabRef.current = activeTab
  // on the next line is never in the Temporal Dead Zone.
  const handleShareLinkInitRef = useRef(null);
  const handleResetRef = useRef(null);
  const activeTabRef = useRef("summary");
  const isForeignerRef = useRef(false); // stable ref so keyboard nav can read current citizenship

  const [activeTab, setActiveTab] = useState("summary");
  activeTabRef.current = activeTab; // keep ref current for keyboard shortcut handler
  const [highlightPlan, setHighlightPlan] = useState("standard");
  const [viewMode, setViewMode] = useState("bequest");
  const [showTooltipId, setShowTooltipId] = useState(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isRealDollars, setIsRealDollars] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [scenarioA, setScenarioA] = useState(null);
  const [scenarioB, setScenarioB] = useState(null);
  const [scenarioLabelA, setScenarioLabelA] = useState("");
  const [scenarioLabelB, setScenarioLabelB] = useState("");
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [showLifeEventMarkers, setShowLifeEventMarkers] = useState(true); // Rev #D2: default ON so events are visible immediately
  const [whatIfPayoutAge, setWhatIfPayoutAge] = useState(null);
  const [whatIfSaTopup, setWhatIfSaTopup] = useState(null);
  const [whatIfHousing, setWhatIfHousing] = useState(null);
  const [whatIfSalaryBump, setWhatIfSalaryBump] = useState(null);
  const [whatIfContribStop, setWhatIfContribStop] = useState(null);   // Rev #12
  const [whatIfOaDrawdown, setWhatIfOaDrawdown]   = useState(null);   // Rev #12
  const [whatIfSrsContrib, setWhatIfSrsContrib]   = useState(null);   // Rev #12
  const [whatIfPrivGrowth, setWhatIfPrivGrowth]   = useState(null);   // Rev #12
  const [showWhatIf, setShowWhatIf] = useState(false);
  // Payout premium percentages for CPF LIFE plans (Basic: 10-20%, Standard: 100%, Escalating: 100%)
  const [basicPremiumPct, setBasicPremiumPct] = useState(10);
  const [pdfOrientation, setPdfOrientation] = useState("portrait");

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState("auto");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [tableSubTab, setTableSubTab] = useState("projection");
  const [showDataTableGuide, setShowDataTableGuide] = useState(false);
  const [showWisEligibility, setShowWisEligibility] = useState(false); // WIS eligibility panel toggle — must be top-level (Rules of Hooks)
  // BUG-2 fix: Life Events panel state hoisted from IIFE to top-level useState.
  // Calling React.useState inside an IIFE embedded in JSX violates Rules of Hooks:
  // the hook call count changes when the IIFE is conditionally skipped, React's
  // identity checks break under Strict Mode double-invocation, and the state is
  // re-created from scratch on every render rather than being stable across renders.
  // Renamed with "le" prefix to avoid collision with any future same-named locals.
  const [leEditingId, setLeEditingId] = useState(null); // null = closed; 'new' = adding new
  const [leFormState, setLeFormState] = useState({});

  // Sidebar accordion — supports multiple open sections simultaneously
  // All section IDs — used for expand-all default and expandAllSections helper
  // BUG-2b fix: "lifeevents" was missing — section never opened on fresh load, was excluded
  // from Expand All, and its open/closed state was not persisted in localStorage.
  const ALL_SECTION_IDS = ["profile", "contribs", "topups", "outflows", "transfers", "property", "privateAssets", "lifeevents", "decumulation"];
  // Item 28: use localStorage (persists across tab closes) with a versioned key so
  // a future schema change can bump to 'cpf_planner_v2_sections' without reading stale data.
  const SECTIONS_STORAGE_KEY = 'cpf_planner_v1_sections';
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = localStorage.getItem(SECTIONS_STORAGE_KEY);
      // No saved state: default to ALL sections open so the sidebar is immediately usable
      return saved ? new Set(JSON.parse(saved)) : new Set(ALL_SECTION_IDS);
    } catch { return new Set(ALL_SECTION_IDS); } // also default open on parse error
  });
  const toggleSection = (id) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([...next])); } catch { }
    return next;
  });
  const expandAllSections = () => {
    const all = new Set(ALL_SECTION_IDS);
    setOpenSections(all);
    try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(ALL_SECTION_IDS)); } catch { }
  };
  const collapseAllSections = () => {
    setOpenSections(new Set());
    try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([])); } catch { }
  };

  // Welcome Modal, Share Modal & Toast State
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  // In-app export modals (sandbox-safe alternatives to download/print)
  const [exportModal, setExportModal] = useState(null); // {type:'csv'|'json'|'print'|'pdf', content:string}
  // In-app confirm dialog (replaces window.confirm which is blocked in sandbox)
  const [confirmModal, setConfirmModal] = useState(null); // {message, onConfirm}
  // Rev #13 — tracks the currently focused sidebar input so currency fields show raw value while editing
  const [focusedField, setFocusedField] = useState(null);

  // Theme Management
  const [themeMode, setThemeMode] = useState(() => { try { return localStorage.getItem('cpf_theme') || 'dark'; } catch { return 'dark'; } });
  const [isDark, setIsDark] = useState(true);

  // ── Debounced inputs for expensive computations ──────────────────────────
  // UI inputs update immediately; heavy projections use the debounced copy
  const [debouncedInputs, setDebouncedInputs] = useState({ ...DEFAULT_INPUTS });
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInputs(inputs), 180);
    return () => clearTimeout(t);
  }, [inputs]);

  // #8 — Warn before leaving if inputs differ from last saved state
  const lastSavedRef = useRef(JSON.stringify(inputs));
  // Rev#18: savedSeq is incremented on export to trigger hasUnsaved recompute
  // (handleExportProfile stamps lastSavedRef without calling setInputs, so we
  //  need an explicit re-render trigger; all other stamp sites already call setInputs)
  const [savedSeq, setSavedSeq] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      if (JSON.stringify(inputs) !== lastSavedRef.current) {
        e.preventDefault(); e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [inputs]);

  // Rev#18: derived boolean — true whenever inputs have drifted from the last export/import/reset.
  // Recomputes on every input edit (via `inputs` dep) and immediately after export (via `savedSeq` dep).
  const hasUnsaved = useMemo(
    () => JSON.stringify(inputs) !== lastSavedRef.current,
    [inputs, savedSeq] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Input validation helpers ─────────────────────────────────────────────
  const [inputErrors, setInputErrors] = useState({});
  const validateInputs = (inp) => {
    const errs = {};
    const ca = Number(inp.currentAge) || 0;
    const pa = Number(inp.payoutAge) || 65;
    const cs = Number(inp.contributionStopAge) || 65;
    const hs = Number(inp.housingStopAge) || 55;
    if (ca < 0 || ca > 95) errs.currentAge = "Age must be 0–95";
    // D3: under-16 info note — cash top-ups locked, CPF nominations and CPFIS not yet available
    if (!errs.currentAge && ca >= 0 && ca < 16) errs.currentAge = "Members under 16 are managed by a parent or guardian. Cash top-ups to SA/MA, OA→SA, and OA→RA transfers are supported by a parent/guardian. CPF nominations require age 16+. CPFIS requires age 18+. Both are locked in this simulation.";
    // D3: age 16–17 info note — nominations OK, CPFIS still locked
    if (!errs.currentAge && ca >= 16 && ca < 18) errs.currentAge = "CPF nominations are available from age 16. CPFIS requires age 18+ and is locked in the Outflows section.";
    // A7: soft warning when current age is at or beyond payout age (no hard block)
    if (!errs.currentAge && ca > 0 && ca >= pa) errs.currentAge = `Age ${ca} ≥ payout age ${pa} — CPF LIFE has likely started. Most contribution fields will have no effect.`;
    if (pa < 65 || pa > 70) errs.payoutAge = "Payout age must be 65–70";
    if (cs < ca) errs.contributionStopAge = "Must be ≥ current age";
    if (hs < ca) errs.housingStopAge = "Must be ≥ current age";
    const infl = Number(inp.inflationRate) || 0;
    if (infl < 0 || infl > 20) errs.inflationRate = "0–20%";
    const mInfl = Number(inp.medicalInflationRate) || 0;
    if (mInfl < 0 || mInfl > 30) errs.medicalInflationRate = "0–30%";
    // MRSS and MMSS: no longer user-entered — both auto-derived by the projection engine.
    // Engine enforces all eligibility gates (SC, age, balance, income, pilot end, lifetime cap) per year.
    // WIS: max $4,900/yr (employee cap from 2025); eligibility requires avg gross monthly income $500–$3,000
    const wis = Number(inp.wisAmount) || 0;
    if (wis < 0) errs.wisAmount = "Must be ≥ 0";
    else if (wis > 4900) errs.wisAmount = "Max $4,900/yr (employee WIS cap from 2025)";
    // W1: Salary eligibility gate — amber warning only, not a hard block
    if (wis > 0 && !errs.wisAmount) {
      const sg = Number(inp.salaryGross) || 0;
      const nti = Number(inp.netTradeIncome) || 0;
      const monthlyIncome = inp.isSelfEmployed ? (nti / 12) : sg;
      if (monthlyIncome > 3000) errs.wisAmount = `WIS eligibility: avg gross ≤ $3,000/mo (your income: ~$${Math.round(monthlyIncome).toLocaleString()}/mo). Verify at cpf.gov.sg/wis.`;
      else if (monthlyIncome > 0 && monthlyIncome < 500) errs.wisAmount = `WIS eligibility: avg gross ≥ $500/mo (unless PWD/caregiver/ComCare). Your income: ~$${Math.round(monthlyIncome).toLocaleString()}/mo.`;
    }
    // Pledge withdrawal age must be ≥ 55
    if (inp.usePropertyPledge) {
      const pwa = Number(inp.pledgeWithdrawalAge) || 55;
      if (pwa < 55) errs.pledgeWithdrawalAge = "Min age 55";
      if (pwa > 95) errs.pledgeWithdrawalAge = "Max age 95";
    }
    // CPF balances: 0 – $5,000,000
    ["oaBalance", "saBalance", "maBalance"].forEach(k => {
      const v = Number(inp[k]) || 0;
      if (v < 0 || v > 5000000) errs[k] = "0 – $5,000,000";
    });
    // NTI
    const nti = Number(inp.netTradeIncome) || 0;
    if (nti < 0 || nti > 2000000) errs.netTradeIncome = "0 – $2,000,000";
    // Annual contributions: 0 – $100,000
    ["empOaCont", "empSaCont", "empMaCont"].forEach(k => {
      const v = Number(inp[k]) || 0;
      if (v < 0 || v > 100000) errs[k] = "0 – $100,000/yr";
    });
    // Salary: 0 – $50,000/mo
    const sg = Number(inp.salaryGross) || 0;
    if (sg < 0 || sg > 50000) errs.salaryGross = "0 – $50,000/mo";
    // A6: PR Year 1/2 engine derives contributions from salary — warn if salary is 0
    // so the user knows why the projection shows zero mandatory contributions.
    if (!errs.salaryGross
        && (inp.citizenStatus || 'SC') === 'PR'
        && (Number(inp.prYear) || 3) < 3
        && !inp.isSelfEmployed
        && sg === 0) {
      const prYrLabel = (Number(inp.prYear) || 1);
      const totalPct  = prYrLabel === 1 ? '9%' : '~24%';
      const rateType  = (inp.prRateType || 'GG') === 'FG' ? 'F/G (Full ER)' : 'G/G (Graduated)';
      errs.salaryGross = `PR Year ${prYrLabel} ${rateType}: contributions are computed from your salary (${totalPct} total). Enter your monthly gross then click ⚡ Auto-Calc — otherwise the engine projects zero mandatory contributions.`;
    }
    // B1: Foreigner — zero out effect warning. Salary, contributions and voluntary
    // top-up fields have no effect because the engine gates all CPF flows for foreigners.
    if ((inp.citizenStatus || 'SC') === 'foreigner') {
      if (!errs.salaryGross && ((Number(inp.salaryGross) || 0) > 0 || (Number(inp.empOaCont) || 0) > 0))
        errs.salaryGross = "Foreigners are not subject to mandatory CPF contributions — salary and contribution fields have no effect on the CPF projection. Only SRS and private assets are modelled.";
      if ((Number(inp.vcSaTopup) || 0) > 0 || (Number(inp.vc3aCash) || 0) > 0 || (Number(inp.vcMaCash) || 0) > 0)
        errs.vc3aCash = "Foreigners cannot make voluntary CPF top-ups — VC3A, RSTU, and VCMA fields have no effect on the projection.";
    }
    const sb = Number(inp.salaryBonus) || 0;
    if (sb < 0 || sb > 2000000) errs.salaryBonus = "0 – $2,000,000";
    // Growth rates: -50% to 50%
    const sgr = Number(inp.salaryGrowthRate) || 0;
    if (sgr < -50 || sgr > 50) errs.salaryGrowthRate = "-50% to 50%";
    // Rev #22: phased salary validation
    const phaseAge = inp.salaryPhaseAge !== "" && inp.salaryPhaseAge != null ? Number(inp.salaryPhaseAge) : null;
    const sgr2 = Number(inp.salaryGrowthRate2) || 0;
    if (phaseAge !== null) {
      if (isNaN(phaseAge) || phaseAge < ca || phaseAge > 95) errs.salaryPhaseAge = `Must be ${ca}–95`;
      if (sgr2 < -50 || sgr2 > 50) errs.salaryGrowthRate2 = "-50% to 50%";
    }
    // Rev #22: career break validation
    const cbStart = inp.careerBreakStartAge !== "" && inp.careerBreakStartAge != null ? Number(inp.careerBreakStartAge) : null;
    const cbEnd   = inp.careerBreakEndAge   !== "" && inp.careerBreakEndAge   != null ? Number(inp.careerBreakEndAge)   : null;
    if (cbStart !== null) {
      if (isNaN(cbStart) || cbStart < ca || cbStart > 95) errs.careerBreakStartAge = `Must be ${ca}–95`;
    }
    if (cbEnd !== null) {
      if (isNaN(cbEnd) || cbEnd > 95) errs.careerBreakEndAge = "Must be ≤ 95";
      else if (cbStart !== null && cbEnd < cbStart) errs.careerBreakEndAge = "Must be ≥ break start age";
      else if (cbEnd < ca) errs.careerBreakEndAge = `Must be ≥ current age (${ca})`;
    }
    if (cbStart !== null && cbEnd === null) errs.careerBreakEndAge = "Enter a break end age";
    if (cbEnd !== null && cbStart === null) errs.careerBreakStartAge = "Enter a break start age";
    // Rev #D2: Life event validation
    const lifeEvs = Array.isArray(inp.lifeEvents) ? inp.lifeEvents : [];
    const leErrs = [];
    lifeEvs.forEach((ev, idx) => {
      const evErrs = {};
      const sa = Number(ev.startAge);
      const ea = Number(ev.endAge);
      const mag = Number(ev.magnitude);
      const isPoint = ev.type === 'windfall' || ev.type === 'early_retirement';
      if (!ev.type) evErrs.type = "Select an event type";
      if (isNaN(sa) || sa < ca || sa > 95) evErrs.startAge = `Must be ${ca}–95`;
      if (!isPoint) {
        if (isNaN(ea) || ea < sa) evErrs.endAge = "Must be ≥ start age";
        if (ea > 95) evErrs.endAge = "Must be ≤ 95";
      }
      if (isNaN(mag) || mag <= 0) evErrs.magnitude = "Must be > 0";
      if (ev.type === 'hyperinflation' && mag > 50) evErrs.magnitude = "Max 50%";
      // Overlap check: same type, overlapping age range, both enabled
      lifeEvs.forEach((other, otherIdx) => {
        if (otherIdx === idx || other.type !== ev.type || other.enabled === false || ev.enabled === false) return;
        const oStart = Number(other.startAge), oEnd = Number(other.endAge);
        if (sa <= oEnd && ea >= oStart) evErrs.startAge = (evErrs.startAge ? evErrs.startAge + "; " : "") + "Overlaps another event of the same type";
      });
      if (Object.keys(evErrs).length > 0) leErrs.push({ idx, ...evErrs });
    });
    if (leErrs.length > 0) errs.lifeEvents = leErrs;
    // Rev #5: Retirement sum growth rate — valid range 0–10%; warn outside 0–6%
    const rsg = Number(inp.retirementSumGrowth);
    if (!isNaN(rsg) && (rsg < 0 || rsg > 10)) errs.retirementSumGrowth = "0% to 10%";
    else if (!isNaN(rsg) && rsg > 6) errs.retirementSumGrowth = "Above 6% is aggressive — CPF Board historical average is ~3%";
    // Property value: 0 – $50,000,000
    const sPA = Number(inp.sellPropertyAge) || 0;
    if (sPA > 0 && (sPA < (Number(inp.currentAge) || 35) || sPA > 95)) errs.sellPropertyAge = `Must be ${Number(inp.currentAge) || 35}–95`;
    const pv = Number(inp.propertyValue) || 0;
    if (pv < 0 || pv > 50000000) errs.propertyValue = "0 – $50M";
    const pgr = Number(inp.propertyGrowthRate) || 0;
    if (pgr < -20 || pgr > 30) errs.propertyGrowthRate = "-20% to 30%";
    // Housing outflow: 0 – $200,000/yr
    const ho = Number(inp.housingOutflow) || 0;
    if (ho < 0 || ho > 200000) errs.housingOutflow = "0 – $200,000/yr";
    // Medical: 0 – $100,000/yr
    ["medicalUsage", "medishieldIP", "elderCareShield"].forEach(k => {
      const v = Number(inp[k]) || 0;
      if (v < 0 || v > 100000) errs[k] = "0 – $100,000/yr";
    });
    // CPFIS OA tranche: only OA savings above $20,000 are investible; requires age 18+
    const cpfisOaVal = Number(inp.cpfisOaAmount) || 0;
    if (cpfisOaVal < 0) errs.cpfisOaAmount = "Must be ≥ 0";
    if (cpfisOaVal > 0) {
      if ((Number(inp.currentAge) || 0) < 18) {
        errs.cpfisOaAmount = "CPFIS requires age 18+";
      } else {
        const cpfisOaBal = Number(inp.oaBalance) || 0;
        const cpfisOaInvestible = Math.max(0, cpfisOaBal - 20000);
        if (cpfisOaBal <= 20000) {
          errs.cpfisOaAmount = `OA must exceed $20,000 before investing. Current OA: ${formatCurrency(cpfisOaBal)}.`;
        } else if (cpfisOaVal > cpfisOaInvestible) {
          errs.cpfisOaAmount = `Max investible from OA is $${cpfisOaInvestible.toLocaleString()} (OA − $20k reserve). Engine auto-caps.`;
        }
      }
    }
    // CPFIS SA tranche: only SA savings above $40,000 are investible; SA is only available pre-55; requires age 18+
    const cpfisSaVal = Number(inp.cpfisSaAmount) || 0;
    if (cpfisSaVal < 0) errs.cpfisSaAmount = "Must be ≥ 0";
    if (cpfisSaVal > 0) {
      const ca_cpfis = Number(inp.currentAge) || 0;
      if (ca_cpfis < 18) {
        errs.cpfisSaAmount = "CPFIS requires age 18+";
      } else if (ca_cpfis >= 55) {
        errs.cpfisSaAmount = "SA is closed at 55 — SA CPFIS not available at age 55+.";
      } else {
        const cpfisSaBal = Number(inp.saBalance) || 0;
        const cpfisSaInvestible = Math.max(0, cpfisSaBal - 40000);
        if (cpfisSaBal <= 40000) {
          errs.cpfisSaAmount = `SA must exceed $40,000 before investing. Current SA: ${formatCurrency(cpfisSaBal)}.`;
        } else if (cpfisSaVal > cpfisSaInvestible) {
          errs.cpfisSaAmount = `Max investible from SA is $${cpfisSaInvestible.toLocaleString()} (SA − $40k reserve). Engine auto-caps.`;
        }
      }
    }
    // D1: OA Education Loan validation
    const oaEduLoanVal = Number(inp.oaEduLoan) || 0;
    if (oaEduLoanVal < 0) {
      errs.oaEduLoan = "Must be ≥ 0";
    } else if (oaEduLoanVal > 0) {
      const oaBal = Number(inp.oaBalance) || 0;
      // BUG-21 fix: engine uses cumulative formula (oa + cumEduOut) * 0.40 − cumEduOut, so the cap
      // grows as prior education withdrawals accumulate. The sidebar check uses oaBal * 0.40 (first-year
      // cap, cumEduOut = 0). Warning is conservative — engine may allow more in later projection years.
      const eduCap40 = Math.max(0, oaBal * 0.40);
      if (oaBal === 0) {
        errs.oaEduLoan = "OA balance is $0 — no funds available for education loan";
      } else if (oaEduLoanVal > oaBal) {
        errs.oaEduLoan = `Exceeds current OA balance ($${oaBal.toLocaleString()}). Engine will cap to available OA.`;
      } else if (oaEduLoanVal > eduCap40) {
        errs.oaEduLoan = `Exceeds initial 40% OA cap ($${Math.round(eduCap40).toLocaleString()}). Engine applies cumulative formula — cap may be higher in later years.`;
      }
    }
    // Minor age gate: cash top-ups require the initiator to be age 16+ (CPF policy)
    const _under16 = (Number(inp.currentAge) || 0) < 16;
    // VC3A: 0 – Annual Limit, reduced by mandatory contributions already in use.
    // Bug fix: previously validated against hardcoded $37,740; a user with $35k in mandatory
    // contributions could enter $5,000 VC3A with no warning, even though combined total
    // exceeded the Annual Limit. Engine silently caps it — now the UI warns correctly.
    const vc3a = Number(inp.vc3aCash) || 0;
    const _isSepForVC = !!inp.isSelfEmployed;
    const _mandatoryVC = _isSepForVC
      ? (Number(inp.empMaCont) || 0)                                           // SEP: only mandatory MA counts
      : (Number(inp.empOaCont) || 0) + (Number(inp.empSaCont) || 0) + (Number(inp.empMaCont) || 0);
    const _maxVC3A = Math.max(0, ANNUAL_LIMIT - _mandatoryVC);
    if (_under16 && vc3a > 0) errs.vc3aCash = "Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.";
    else if (vc3a < 0 || vc3a > ANNUAL_LIMIT) errs.vc3aCash = `0 – $${ANNUAL_LIMIT.toLocaleString()} (Annual Limit)`;
    else if (!errs.vc3aCash && vc3a > _maxVC3A && _maxVC3A < ANNUAL_LIMIT)
      errs.vc3aCash = `Exceeds available Annual Limit room ($${_maxVC3A.toLocaleString()}) after mandatory contributions of $${_mandatoryVC.toLocaleString()}. Engine will scale down.`;
    // RSTU SA top-up: 0 – ERS
    const rstu = Number(inp.vcSaTopup) || 0;
    if (_under16 && rstu > 0) errs.vcSaTopup = "Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.";
    else if (rstu < 0 || rstu > 500000) errs.vcSaTopup = "0 – $500,000";
    // Cash MA top-up validation
    const vcMaCashVal = Number(inp.vcMaCash) || 0;
    if (_under16 && vcMaCashVal > 0) {
      errs.vcMaCash = "Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.";
    } else if (vcMaCashVal < 0) { errs.vcMaCash = "Must be ≥ 0"; }
    if (!errs.vcMaCash && vcMaCashVal > 0) {
      const bhsForMa = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, Math.max(0, (Number(inp.currentYear)||2026) - 2026)));
      const maHead = Math.max(0, bhsForMa - (Number(inp.maBalance)||0));
      if (vcMaCashVal > maHead) errs.vcMaCash = `Exceeds BHS headroom ($${maHead.toLocaleString()}). Engine auto-caps.`;
    }
    // OA transfers: negative not allowed
    const oaToSa = Number(inp.oaToSaTransfer) || 0;
    if (oaToSa < 0) errs.oaToSaTransfer = "Must be ≥ 0";
    // Warn if OA balance is zero — transfers will have no effect
    const currentOaBal = Number(inp.oaBalance) || 0;
    if (currentOaBal === 0 && oaToSa > 0) {
      errs.oaToSaTransfer = "OA balance is $0 — transfer has no effect until OA accumulates funds";
    } else if (oaToSa > 0 && oaToSa > currentOaBal) {
      errs.oaToSaTransfer = `Exceeds current OA balance ($${currentOaBal.toLocaleString()}). Engine will transfer up to available OA each year.`;
    }
    const yearsFromBaseVal = Math.max(0, (Number(inp.currentYear) || 2026) - 2026);
    const currentAge_v = Number(inp.currentAge) || 0;
    const isOaToSaForLovedOne = inp.oaToSaForLovedOne === true;
    // FRS/ERS headroom checks only apply for Self (not Loved One — their account isn't tracked here).
    // N2 fix: guard with !errs.oaToSaTransfer so an OA balance error set above is never silently
    // overwritten by a FRS/ERS headroom message (OA balance is the more actionable constraint).
    if (!isOaToSaForLovedOne && !errs.oaToSaTransfer) {
      if (currentAge_v < 55) {
        const frsNowVal = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, yearsFromBaseVal));
        const saRoomNow = Math.max(0, frsNowVal - (Number(inp.saBalance) || 0));
        if (oaToSa > 0 && oaToSa > saRoomNow) errs.oaToSaTransfer = `Exceeds FRS headroom in your SA ($${saRoomNow.toLocaleString()}). Engine auto-caps.`;
      } else {
        const ersNowVal = Math.round(RETIREMENT_SUMS_2026.ERS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, yearsFromBaseVal));
        const raRoomNow = Math.max(0, ersNowVal - (Number(inp.saBalance) || 0));
        if (oaToSa > 0 && oaToSa > raRoomNow) errs.oaToSaTransfer = `Exceeds ERS headroom in your RA ($${raRoomNow.toLocaleString()}). Engine auto-caps.`;
      }
    }
    const oaToMa = Number(inp.oaToMaTransfer) || 0;
    if (oaToMa < 0) errs.oaToMaTransfer = "Must be ≥ 0";
    // OA→MA: CPF policy requires age 55+ for both self and loved one
    if (oaToMa > 0 && currentAge_v < 55) {
      errs.oaToMaTransfer = "OA→MA requires age 55+ (CPF policy). Engine will not apply this transfer until age 55.";
    } else if (oaToMa > 0 && currentAge_v >= 55) {
      // Check FRS or BRS+property condition
      const frsNow55 = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, yearsFromBaseVal));
      const brsNow55 = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, yearsFromBaseVal));
      const raBalNow = Number(inp.saBalance) || 0; // saBalance holds RA post-55
      const hasProperty = (Number(inp.propertyValue) || 0) > 0;
      if (raBalNow < brsNow55) {
        errs.oaToMaTransfer = `RA ($${raBalNow.toLocaleString()}) is below BRS ($${brsNow55.toLocaleString()}). Must meet FRS or BRS with property to transfer OA→MA.`;
      } else if (raBalNow < frsNow55 && !hasProperty) {
        errs.oaToMaTransfer = `RA ($${raBalNow.toLocaleString()}) is below FRS ($${frsNow55.toLocaleString()}). Must own a property (BRS+property) or meet FRS to transfer OA→MA.`;
      }
      // OA balance sufficiency check (mirrors A2 fix for OA→SA)
      if (currentOaBal === 0) errs.oaToMaTransfer = "OA balance is $0 — transfer has no effect until OA accumulates funds";
      else if (!errs.oaToMaTransfer && oaToMa > currentOaBal && currentOaBal > 0) errs.oaToMaTransfer = `Exceeds current OA balance ($${currentOaBal.toLocaleString()}). Engine will transfer up to available OA each year.`;
      // BHS headroom check (only relevant for self transfer)
      if (!errs.oaToMaTransfer && !(inp.oaToMaForLovedOne)) {
        const bhsNowVal = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inp.retirementSumGrowth)||3)/100, Math.max(0, (Number(inp.currentYear) || 2026) - 2026)));
        const maRoomNow = Math.max(0, bhsNowVal - (Number(inp.maBalance) || 0));
        if (oaToMa > maRoomNow) errs.oaToMaTransfer = `Exceeds BHS headroom ($${maRoomNow.toLocaleString()}/yr). Engine auto-caps.`;
      }
    }
    // Contrib stop and housing stop age bounds
    if (cs > 95) errs.contributionStopAge = "Must be ≤ 95";
    if (hs > 95) errs.housingStopAge = "Must be ≤ 95";
    // OA Drawdown validation
    const oaDrawStart = Number(inp.oaDrawdownStartAge) || 0;
    const pa2 = Number(inp.payoutAge) || 65;
    if (oaDrawStart > 0 && oaDrawStart < pa2) errs.oaDrawdownStartAge = `Must be ≥ payout age (${pa2})`;
    if (oaDrawStart > 95) errs.oaDrawdownStartAge = "Must be ≤ 95";
    const oaDrawAmt = Number(inp.oaDrawdownMonthly) || 0;
    if (oaDrawAmt < 0 || oaDrawAmt > 50000) errs.oaDrawdownMonthly = "0 – $50,000/mo";
    const oaFloor = Number(inp.oaDrawdownFloor) || 0;
    if (oaFloor < 0 || oaFloor > 5000000) errs.oaDrawdownFloor = "0 – $5,000,000";
    // NX2 fix: warn if annual lump-sum withdrawal and monthly drawdown are both active — they stack
    if ((Number(inp.oaWithdrawalAt55) || 0) > 0 && inp.oaWithdrawalFreq === 'annual'
        && (Number(inp.oaDrawdownMonthly) || 0) > 0 && !inp.dieWithZeroEnabled) {
      errs.oaWithdrawalAt55 = 'Annual OA withdrawal + monthly drawdown both active — these stack and may deplete OA faster than intended.';
    }
    // Die with Zero age validation
    if (inp.dieWithZeroEnabled) {
      const dwzA = Number(inp.dieWithZeroAge) || 85;
      const pa3  = Number(inp.payoutAge) || 65;
      if (dwzA <= pa3) errs.dieWithZeroAge = `Must be after payout age (${pa3})`;
      else if (dwzA > 95) errs.dieWithZeroAge = "Must be ≤ 95";
    }
    // Property Monetisation validation — Q1: LBS and SHB are HDB/CPF schemes, SC/PR only; foreigners cannot use them
    if (inp.propMonetiseEnabled && (inp.citizenStatus || 'SC') !== 'foreigner') {
      const pmScheme = inp.propMonetiseScheme ?? 'downgrade';
      const pmAge = Number(inp.propMonetiseAge) || 65;
      const ca3 = Number(inp.currentAge) || 35;
      if (pmAge < ca3 || pmAge > 95) errs.propMonetiseAge = `${ca3}–95`;
      // LBS-specific: CPF Board minimum entry age is 65
      if (pmScheme === 'lbs' && !errs.propMonetiseAge && pmAge < 65) errs.propMonetiseAge = "LBS requires age 65+ (CPF Board eligibility)";
      const pmCash = Number(inp.propMonetiseCashProceeds) || 0;
      if (pmCash < 0 || pmCash > 10000000) errs.propMonetiseCashProceeds = "0 – $10M";
      const pmRA = Number(inp.propMonetiseRaTopup) || 0;
      if (pmRA < 0 || pmRA > 2000000) errs.propMonetiseRaTopup = "0 – $2,000,000";
      // LBS-specific: HDB pays annuity premium into RA; total RA cannot exceed ERS
      if (pmScheme === 'lbs' && !errs.propMonetiseRaTopup && pmRA > 440800) errs.propMonetiseRaTopup = "LBS RA top-up capped at ERS ($440,800)";
      // SHB-specific: bonus is $30k (3-room or smaller) or $15k (2-room Flexi); soft warn if suspiciously high
      if (pmScheme === 'shb' && !errs.propMonetiseRaTopup && pmRA > 90000) errs.propMonetiseRaTopup = "SHB RA bonus cap is $30,000–$90,000 depending on flat type — verify with CPF Board";
    }
    // SRS validation
    const srsCap = (inp.citizenStatus === 'foreigner') ? 35700 : 15300; // POL-3 fix: foreigners $35,700/yr; SC/PR $15,300/yr
    const srsContrib = Number(inp.srsAnnualContribution) || 0;
    if (srsContrib < 0 || srsContrib > srsCap) errs.srsAnnualContribution = `Max $${srsCap.toLocaleString()}/yr`;
    const srsBal = Number(inp.srsBalance) || 0;
    if (srsBal < 0 || srsBal > 5000000) errs.srsBalance = "0 – $5,000,000";
    const srsRate = Number(inp.srsReturnRate) || 0;
    if (srsRate < 0 || srsRate > 30) errs.srsReturnRate = "0–30%";
    const srsStop = Number(inp.srsContribStopAge) || 63;
    if (srsStop < (Number(inp.currentAge) || 35) || srsStop > 95) errs.srsContribStopAge = `${Number(inp.currentAge) || 35}–95`;
    const srsDraw = Number(inp.srsDrawdownStartAge) || 63;
    if (srsDraw < 63 || srsDraw > 95) errs.srsDrawdownStartAge = "Min age 63 (statutory retirement age)";
    // BUG-17 fix: cross-field check — contributions must stop before or at drawdown start
    if (!errs.srsContribStopAge && !errs.srsDrawdownStartAge && srsStop > srsDraw) {
      errs.srsContribStopAge = `Must be ≤ drawdown start age (${srsDraw}). SRS contributions cannot run past the drawdown start.`;
    }
    const srsYrs = Number(inp.srsDrawdownYears) || 10;
    if (srsYrs < 1 || srsYrs > 10) errs.srsDrawdownYears = "1–10 years";
    setInputErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    // Parse state from URL on mount
    try {
      const params = new URLSearchParams(window.location.search);
      const pParam = params.get('p');      // New full-profile share link
      const sParam = params.get('s');      // Legacy compressed format
      const stateParam = params.get('state'); // Legacy plain format
      if (pParam) {
        // New format: full state encoded via lzCompress (LZ77 or legacy base64url)
        const fullState = JSON.parse(lzDecompress(pParam));
        if (fullState.inputs) {
          // Whitelist only known keys from DEFAULT_INPUTS to prevent injection
          const safeInputs = {};
          Object.keys(DEFAULT_INPUTS).forEach(k => {
            if (fullState.inputs[k] !== undefined) safeInputs[k] = fullState.inputs[k];
          });
          const mergedInputs = { ...DEFAULT_INPUTS, ...safeInputs };
          setInputs(mergedInputs);
          // R1 fix: stamp lastSavedRef with the merged object so the beforeunload
          // "unsaved changes" guard doesn't fire on every navigation after a share-link load.
          // setInputs() is async — inputs won't reflect the new value until next render —
          // so we must use the locally-built mergedInputs, not the stale inputs state.
          lastSavedRef.current = JSON.stringify(mergedInputs);
        }
        if (fullState.activeTab) setActiveTab(fullState.activeTab);
        if (fullState.highlightPlan) setHighlightPlan(fullState.highlightPlan);
        if (fullState.viewMode) setViewMode(fullState.viewMode);
        if (fullState.basicPremiumPct != null) setBasicPremiumPct(fullState.basicPremiumPct);
        if (fullState.scenarioLabelA != null) setScenarioLabelA(fullState.scenarioLabelA);
        if (fullState.scenarioLabelB != null) setScenarioLabelB(fullState.scenarioLabelB);
        if (fullState.whatIfPayoutAge != null) setWhatIfPayoutAge(fullState.whatIfPayoutAge);
        if (fullState.whatIfSaTopup != null) setWhatIfSaTopup(fullState.whatIfSaTopup);
        if (fullState.whatIfHousing != null) setWhatIfHousing(fullState.whatIfHousing);
        if (fullState.whatIfSalaryBump != null) setWhatIfSalaryBump(fullState.whatIfSalaryBump);
        if (fullState.whatIfContribStop != null) setWhatIfContribStop(fullState.whatIfContribStop);
        if (fullState.whatIfOaDrawdown != null) setWhatIfOaDrawdown(fullState.whatIfOaDrawdown);
        if (fullState.whatIfSrsContrib != null) setWhatIfSrsContrib(fullState.whatIfSrsContrib);
        if (fullState.whatIfPrivGrowth != null) setWhatIfPrivGrowth(fullState.whatIfPrivGrowth);
        if (fullState.showWhatIf != null) setShowWhatIf(fullState.showWhatIf);
        if (fullState.isRealDollars != null) setIsRealDollars(fullState.isRealDollars);
        if (fullState.pdfOrientation) setPdfOrientation(fullState.pdfOrientation);
        // Fix 3 + Fix 4: Scenario slot restoration from share link.
        //
        // Three cases per slot:
        //   A) scenarioAInputs key present + is object  → reconstruct projection from inputs (Fix 3)
        //   B) scenarioAInputs key present + is null    → no scenario saved; clear slot (Fix 4)
        //   C) scenarioAInputs key absent               → old share link; leave existing slot untouched (Fix 4)
        //
        // runProjectionEngine is module-level — safe to call synchronously here.
        // payoutProj set to null; getNetWorth fallback path handles it correctly.
        let shareLinkScenariosRestored = false;
        if ('scenarioAInputs' in fullState) {
          if (fullState.scenarioAInputs && typeof fullState.scenarioAInputs === 'object') {
            const safeScenA = { ...DEFAULT_INPUTS };
            Object.keys(DEFAULT_INPUTS).forEach(k => { if (fullState.scenarioAInputs[k] !== undefined) safeScenA[k] = fullState.scenarioAInputs[k]; });
            setScenarioA({ inputs: safeScenA, projection: runProjectionEngine(safeScenA), payoutProj: null });
            shareLinkScenariosRestored = true;
          } else {
            setScenarioA(null); // explicit null → no scenario in this share link
          }
        }
        // else: key absent → leave existing slot untouched
        if ('scenarioBInputs' in fullState) {
          if (fullState.scenarioBInputs && typeof fullState.scenarioBInputs === 'object') {
            const safeScenB = { ...DEFAULT_INPUTS };
            Object.keys(DEFAULT_INPUTS).forEach(k => { if (fullState.scenarioBInputs[k] !== undefined) safeScenB[k] = fullState.scenarioBInputs[k]; });
            setScenarioB({ inputs: safeScenB, projection: runProjectionEngine(safeScenB), payoutProj: null });
            shareLinkScenariosRestored = true;
          } else {
            setScenarioB(null);
          }
        }
        // Backward compat: very old share links that carried full scenarioA/B objects directly
        // (pre-Fix 2, appVersion V4-2026). Only act if new scenarioAInputs key is absent.
        if (!('scenarioAInputs' in fullState) && fullState.appVersion === "V4-2026" && fullState.scenarioA) {
          setScenarioA(fullState.scenarioA);
        }
        if (!('scenarioBInputs' in fullState) && fullState.appVersion === "V4-2026" && fullState.scenarioB) {
          setScenarioB(fullState.scenarioB);
        }
        showToast(shareLinkScenariosRestored
          ? "✓ Profile loaded — Compare scenarios restored (projections recalculated)"
          : "✓ Profile loaded from share link");
        // Clean URL without reloading
        window.history.replaceState({}, '', window.location.pathname);
      } else if (sParam) {
        // Legacy compressed base64url format — lzDecompress handles both old and new encoding
        const decoded = JSON.parse(lzDecompress(sParam));
        // Whitelist only known keys from DEFAULT_INPUTS to prevent unknown key injection
        const safeDecoded = {};
        Object.keys(DEFAULT_INPUTS).forEach(k => { if (decoded[k] !== undefined) safeDecoded[k] = decoded[k]; });
        const mergedLegacy = { ...DEFAULT_INPUTS, ...safeDecoded };
        setInputs(mergedLegacy);
        // R1 fix: stamp lastSavedRef so the beforeunload guard doesn't fire after a legacy share-link load.
        lastSavedRef.current = JSON.stringify(mergedLegacy);
      } else if (stateParam) {
        // Legacy plain format
        const decoded = JSON.parse(decodeURIComponent(stateParam));
        // Whitelist only known keys from DEFAULT_INPUTS to prevent unknown key injection
        const safeDecoded = {};
        Object.keys(DEFAULT_INPUTS).forEach(k => { if (decoded[k] !== undefined) safeDecoded[k] = decoded[k]; });
        const mergedPlain = { ...DEFAULT_INPUTS, ...safeDecoded };
        setInputs(mergedPlain);
        // R1 fix: stamp lastSavedRef so the beforeunload guard doesn't fire after a legacy plain share-link load.
        lastSavedRef.current = JSON.stringify(mergedPlain);
      } else {
        // Always show welcome modal on fresh load
        setShowWelcome(true);
      }
    } catch (e) {
      console.error("Failed to parse URL state");
    }
  }, []);

  const closeWelcome = () => {
    setShowWelcome(false);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (themeMode === 'system') setIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);

    if (themeMode === 'system') {
      setIsDark(mediaQuery.matches);
    } else {
      setIsDark(themeMode === 'dark');
    }
    try { localStorage.setItem('cpf_theme', themeMode); } catch { }
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  useEffect(() => {
    setSaveStatus("Saving...");
    const t = setTimeout(() => setSaveStatus("Saved"), 600);
    return () => clearTimeout(t);
  }, [inputs]);

  // Dismiss any open tooltip when clicking outside
  useEffect(() => {
    const dismiss = () => setShowTooltipId(null);
    document.addEventListener('click', dismiss);
    document.addEventListener('touchstart', dismiss, { passive: true });
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('touchstart', dismiss);
    };
  }, []);

  // iOS Safari keyboard dismiss fix — directly update root div height when keyboard closes
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let ticking = false;
    const onResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = vv.height + 'px';
        // Set CSS variable (for any CSS rules using it)
        document.documentElement.style.setProperty('--viewport-height', h);
        // Directly set the root div height — bypasses any inline style specificity
        if (rootRef.current) rootRef.current.style.height = h;
        ticking = false;
      });
    };
    // Set immediately on mount
    onResize();
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  // Keyboard Shortcuts — registered once ([] deps). All mutable values are read
  // through stable refs so the handler always uses current state/functions.
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleShareLinkInitRef.current?.();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleResetRef.current?.();
      } else if (e.ctrlKey && e.key === ']') {
        e.preventDefault();
        const tabs = ["summary", "strategy", "accumulation", ...(isForeignerRef.current ? [] : ["life"]), "compare", "table", "notes"];
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx + 1) % tabs.length]);
      } else if (e.ctrlKey && e.key === '[') {
        e.preventDefault();
        const tabs = ["summary", "strategy", "accumulation", ...(isForeignerRef.current ? [] : ["life"]), "compare", "table", "notes"];
        const idx = tabs.indexOf(activeTabRef.current);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const is55Plus     = (Number(inputs.currentAge) || 0) >= 55;
  const isUnder16    = (Number(inputs.currentAge) || 0) < 16;   // CPF minor gate: cash top-ups require age 16+
  const isSelfEmployed = inputs.isSelfEmployed === true;
  // BUG-NEW-1 fix: isForeigner must be declared at component scope so JSX references in the
  // LIFE tab (line ~8140) and elsewhere resolve correctly. Previously only existed inside a
  // local IIFE (line ~6994) and inside runProjectionEngine — both out of component render scope.
  // Accessing an undeclared identifier in JSX throws ReferenceError, crashing the LIFE tab
  // for every user who navigates to it. reads live `inputs` (not debounced) — intentional,
  // as this gates UI display only, not projection computation.
  const isForeigner  = (inputs.citizenStatus || 'SC') === 'foreigner';
  isForeignerRef.current = isForeigner; // keep ref current for keyboard shortcut handler

  // Rev #13 — Currency fields that display as $X,XXX when not focused.
  // Excludes: age fields, rate/% fields, duration (Dur) fields, year fields, boolean fields.
  const CURRENCY_FIELDS = new Set([
    'oaBalance','saBalance','maBalance',
    'salaryGross','salaryBonus','netTradeIncome',
    'empOaCont','empSaCont','empMaCont',
    'housingOutflow','medicalUsage','medishieldIP','elderCareShield',
    'propertyValue',
    'vc3aCash','vcSaTopup','vcVhr','vcMaCash',
    'annualGovGrant','mrssGrant','mmssGrant','wisAmount',
    'oaToSaTransfer','oaToMaTransfer','oaWithdrawalAt55',
    'oaMonthlyDraw','oaBequestFloor',
    'srsBalance','srsAnnualContribution',
    'currentPrivateAssets','annualPrivateSaving',
    'propMonetiseCashProceeds','propMonetiseRaTopup',
    'targetMonthlyIncome',
    'oaEduLoanAnnual',
    'cpfisOaAmount','cpfisSaAmount',
  ]);
  // Returns formatted display value: $X,XXX when not focused, raw number string when focused.
  const getDisplayValue = (name, rawValue) => {
    if (focusedField === name) return String(rawValue ?? '');
    const n = Number(rawValue);
    if (CURRENCY_FIELDS.has(name) && n > 0) return '$' + n.toLocaleString();
    return String(rawValue ?? '');
  };

  // FreqToggle is now a top-level component (defined before App) — receives inputs+setInputs as props.
  // This prevents it from being recreated on every App render, which was causing sidebar section flicker.
  // SEP has no mandatory contributions → full $37,740 VC3A available
  const currentAge_ui = Number(inputs.currentAge) || 35;
  const nti_ui = Number(inputs.netTradeIncome) || 0;
  let sepMandatoryMA_ui = 0;
  if (isSelfEmployed && nti_ui > 6000) {
      let maRate = 0.08;
      if (currentAge_ui > 50) maRate = 0.105;
      else if (currentAge_ui > 45) maRate = 0.10;
      else if (currentAge_ui > 35) maRate = 0.09;
      sepMandatoryMA_ui = Math.round(Math.min(nti_ui, 96000) * maRate);
  }
  const totalMandatory = isSelfEmployed ? sepMandatoryMA_ui : ((Number(inputs.empOaCont) || 0) + (Number(inputs.empSaCont) || 0) + (Number(inputs.empMaCont) || 0));
  const maxAllowableVC = Math.max(0, ANNUAL_LIMIT - totalMandatory);
  // VC3A lump-sum + VHR counted toward Annual Limit; RSTU is separate (no Annual Limit)
  // VHR (Housing Refund) is NOT subject to the Annual Limit — it refunds CPF used for housing
  // Only VC3A counts toward the Annual Limit
  const totalVC = (Number(inputs.vc3aCash) || 0);
  const isVcOverLimit = totalVC > maxAllowableVC;

  const annualGross = ((Number(inputs.salaryGross) || 0) * 12) + (Number(inputs.salaryBonus) || 0);
  const estimatedTaxRate = annualGross > 320000 ? 0.22 : annualGross > 240000 ? 0.19 : annualGross > 160000 ? 0.17 : annualGross > 120000 ? 0.15 : annualGross > 80000 ? 0.115 : annualGross > 40000 ? 0.07 : 0.035;

  const baseYear = Number(inputs.currentYear) || 2026;
  const yearsFrom2026 = Math.max(0, baseYear - 2026);
  const currentBRS = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, yearsFrom2026));
  const currentFRS = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, yearsFrom2026));
  const currentERS = currentFRS * 2;
  const currentBHS = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, yearsFrom2026));

  const currentSaRa = Number(inputs.saBalance) || 0;
  const currentMa = Number(inputs.maBalance) || 0;

  // Tax relief only applies to top-ups that bring SA/RA up to FRS (not beyond).
  // If currentSaRa >= currentFRS, eligible amount is $0. Hard cap $8,000/yr.
  const frsHeadroomForRelief = Math.max(0, currentFRS - currentSaRa);
  const topupEligibleForRelief = Math.min(Number(inputs.vcSaTopup) || 0, frsHeadroomForRelief);
  const eligibleRSTU = Math.min(topupEligibleForRelief, 8000);
  const estimatedTaxSavings = Math.round(eligibleRSTU * estimatedTaxRate);

  const ersPercentText = ((currentSaRa / currentERS) * 100).toFixed(1);
  const bhsPercentText = Math.min(100, (currentMa / currentBHS) * 100).toFixed(1);
  const saRaVisualWidth = Math.min(100, (currentSaRa / currentERS) * 100);
  const bhsVisualWidth = Math.min(100, (currentMa / currentBHS) * 100);

  const handleInputChange = (e) => {
    let { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e) => {
    let { name, value } = e.target;
    const coerced = (value === "" || isNaN(Number(value))) ? 0 : Number(value);
    // Pure updater — no side effects inside setState. Validation is handled by the
    // dedicated useEffect below which always receives the fully committed inputs state,
    // eliminating the stale-closure risk of the previous Promise.resolve microtask.
    setInputs(prev => ({ ...prev, [name]: coerced }));
  };

  // Bug 1 fix: validation useEffect — replaces the Promise.resolve microtask that was
  // previously scheduled inside the handleBlur setState updater. Running here guarantees:
  //   1. inputs is the fully committed, up-to-date state — no stale-closure risk.
  //   2. Programmatic input changes (Apply Top-Up, Auto-Calc, profile import, preset load)
  //      are also validated automatically, not just blur events.
  //   3. No double-invocation risk under React 18 Strict Mode / Concurrent Mode.
  // validateInputs closes over only setInputErrors (a stable React setter) — safe to omit
  // from deps. All other reads go through the `inp` parameter, not component closure.
  useEffect(() => {
    validateInputs(inputs);
  }, [inputs]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-11 fix: cache the focusable-element list outside the keydown handler so it is
  // built once per mount rather than on every Enter keypress (was an O(n) DOM scan
  // on every keystroke in a ~60-field form).  Rebuilt on any input/select mount/unmount
  // via a MutationObserver attached below.
  const focusableListRef = useRef([]);
  useEffect(() => {
    const rebuild = () => {
      focusableListRef.current = Array.from(
        document.querySelectorAll('input:not([type="hidden"]):not([readonly]), select')
      );
    };
    rebuild();
    const obs = new MutationObserver(rebuild);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['readonly', 'disabled'] });
    return () => obs.disconnect();
  }, []);

  // Move to next input on Enter, set 0 if blank
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let { name, value } = e.target;
      if (value === "" || isNaN(Number(value))) {
        setInputs(prev => ({ ...prev, [name]: 0 }));
      } else {
        setInputs(prev => ({ ...prev, [name]: Number(value) }));
      }
      const formElements = focusableListRef.current;
      const index = formElements.indexOf(e.target);
      if (index > -1 && index < formElements.length - 1) {
        formElements[index + 1].focus();
      }
    }
  };

  const handleAutoCalc = () => {
    const gross = Number(inputs.salaryGross) || 0;
    const bonus = Number(inputs.salaryBonus) || 0;
    const cappedGross = Math.min(gross, 8000); // OW ceiling $8,000/mo
    const age = Number(inputs.currentAge) || 35;
    const prYr = Number(inputs.prYear) || 3;
    const isPR = (inputs.citizenStatus || 'SC') === 'PR';
    const prRateType = (isPR && prYr < 3) ? (inputs.prRateType || 'GG') : 'GG';

    // ── Step 1: determine OA/SA/MA rates and salary-band parameters ──────────────
    // totalRate = combined employer+employee rate for OW > $750 (standard band).
    // flatRate  = employer-only rate for OW $50–$500 (employee Nil in this band).
    //             Equals the employer share of the standard rate.
    // gradFactor = employee phase-in coefficient for OW $500–$750.
    //              = employeeRate × 750 / (750 − 500) = employeeRate × 3.
    //              At exactly OW = $750: flatRate×750 + gradFactor×250 = totalRate×750 ✓
    let oaRate, saRate, maRate, flatRate, gradFactor;

    if (isPR && prYr < 3) {
      // PR Year 1 or 2 — CPF Tables 2 & 3 (G/G) or F/G rates (1 Jan 2026)
      const prRates = getPRRates(prYr, age, prRateType);
      oaRate = prRates.oa;
      saRate = prRates.sa;
      maRate = prRates.ma;
      flatRate = prRates.flatRate;
      gradFactor = prRates.gradFactor;
    } else {
      // SC / PR Year 3+ — CPF Table 1 (1 Jan 2026), combined employer+employee rates
      // flatRate = employer rate (= total − employee). gradFactor = employeeRate × 3.
      if      (age <= 35) { oaRate=0.23; saRate=0.06;  maRate=0.08;  flatRate=0.17;  gradFactor=0.60;  }
      else if (age <= 45) { oaRate=0.21; saRate=0.07;  maRate=0.09;  flatRate=0.17;  gradFactor=0.60;  }
      else if (age <= 50) { oaRate=0.19; saRate=0.08;  maRate=0.10;  flatRate=0.17;  gradFactor=0.60;  }
      else if (age <= 55) { oaRate=0.15; saRate=0.115; maRate=0.105; flatRate=0.17;  gradFactor=0.60;  }
      else if (age <= 60) { oaRate=0.12; saRate=0.115; maRate=0.105; flatRate=0.16;  gradFactor=0.54;  }
      else if (age <= 65) { oaRate=0.035;saRate=0.11;  maRate=0.105; flatRate=0.125; gradFactor=0.375; }
      else if (age <= 70) { oaRate=0.01; saRate=0.05;  maRate=0.105; flatRate=0.09;  gradFactor=0.225; }
      else                { oaRate=0.01; saRate=0.01;  maRate=0.105; flatRate=0.075; gradFactor=0.15;  }
    }

    // ── Step 2: apply salary-band formula to monthly OW ──────────────────────────
    // OW ≤ $50:       Nil (no contribution)
    // OW $50–$500:    flatRate × OW  (employer share only, employee contributes Nil)
    // OW $500–$750:   flatRate × OW + gradFactor × (OW − $500)  (employee phases in)
    // OW > $750:      totalRate × OW  (standard full rates — most members fall here)
    const totalRate = oaRate + saRate + maRate;
    let monthlyOwContrib;
    if (cappedGross <= 50) {
      monthlyOwContrib = 0;
    } else if (cappedGross <= 500) {
      monthlyOwContrib = flatRate * cappedGross;
    } else if (cappedGross <= 750) {
      monthlyOwContrib = flatRate * cappedGross + gradFactor * (cappedGross - 500);
    } else {
      monthlyOwContrib = totalRate * cappedGross;
    }
    const annualOwContrib = monthlyOwContrib * 12;

    // ── Step 3: proportionally allocate OW contribution across OA/SA/MA ──────────
    // Uses OA:SA:MA ratios from the standard (>$750) rates — the same proportions
    // apply regardless of which wage band is active; only the total changes.
    const owOA = (totalRate > 0 && annualOwContrib > 0) ? Math.round(annualOwContrib * oaRate / totalRate) : 0;
    const owMA = (totalRate > 0 && annualOwContrib > 0) ? Math.round(annualOwContrib * maRate / totalRate) : 0;
    const owSA = (annualOwContrib > 0) ? (Math.round(annualOwContrib) - owOA - owMA) : 0;

    // ── Step 4: AW (bonus) — always uses standard (>$750) rates ─────────────────
    // AW ceiling = $102,000 − annual OW subject to CPF (wages, not contributions).
    const owIncome = cappedGross * 12;
    const awCap = Math.max(0, 102000 - owIncome);
    const bonusCpf = Math.min(bonus, awCap);
    const annualOA = owOA + Math.round(bonusCpf * oaRate);
    const annualSA = owSA + Math.round(bonusCpf * saRate);
    const annualMA = owMA + Math.round(bonusCpf * maRate);

    // ── Step 5: duplicate-press guard ────────────────────────────────────
    // If computed values are identical to what is already in the fields,
    // do NOT update state. Prevents user confusion about whether repeated
    // presses accumulate values (they never do — this just makes it explicit).
    const alreadyCurrent =
      Number(inputs.empOaCont) === annualOA &&
      Number(inputs.empSaCont) === annualSA &&
      Number(inputs.empMaCont) === annualMA;

    if (alreadyCurrent) {
      showToast(
        `ℹ Contributions already up to date — ` +
        `OA $${annualOA.toLocaleString()} / SA $${annualSA.toLocaleString()} / MA $${annualMA.toLocaleString()} (annual). ` +
        `No changes made.`
      );
      return;
    }

    setInputs(prev => ({
      ...prev,
      empOaCont: annualOA,
      empSaCont: annualSA,
      empMaCont: annualMA,
      showSalaryCalc: false
    }));

    // ── Step 6: toast — state annual figures and basis explicitly ─────────
    // "Annual" is called out prominently so users don't confuse these totals
    // with the monthly salary figure shown in the input above.
    const totalAnnual = annualOA + annualSA + annualMA;
    const annualSalaryBase = cappedGross * 12;
    const effectivePct = annualSalaryBase > 0
      ? Math.round((totalAnnual / annualSalaryBase) * 1000) / 10
      : 0;
    const bandNote = cappedGross <= 50  ? ' [OW ≤$50: Nil]'
      : cappedGross <= 500 ? ' [OW ≤$500: employer-only flat rate]'
      : cappedGross <= 750 ? ' [OW $500–$750: graduated rate]'
      : '';

    if (isPR && prYr < 3) {
      const rateLabel = prRateType === 'FG' ? 'F/G (Full ER)' : 'G/G (Graduated)';
      showToast(
        `⚡ PR Year ${prYr} ${rateLabel} applied${bandNote}. ` +
        `Annual contributions: OA $${annualOA.toLocaleString()} / SA $${annualSA.toLocaleString()} / MA $${annualMA.toLocaleString()} ` +
        `= $${totalAnnual.toLocaleString()} (${effectivePct}% of $${annualSalaryBase.toLocaleString()}/yr). ` +
        `Rates auto-advance Yr 1 → Yr 2 → Yr 3+ in the projection.`
      );
    } else {
      showToast(
        `⚡ ${isPR ? 'PR Year 3+' : 'SC'} rates applied${bandNote}. ` +
        `Annual contributions: OA $${annualOA.toLocaleString()} / SA $${annualSA.toLocaleString()} / MA $${annualMA.toLocaleString()} ` +
        `= $${totalAnnual.toLocaleString()} (${effectivePct}% of $${annualSalaryBase.toLocaleString()}/yr).`
      );
    }
  };

  const handleReset = () => {
    setConfirmModal({
      message: "Reset all inputs and clear all scenarios, What-If, and comparison data?",
      onConfirm: () => {
        // R3 fix: stamp lastSavedRef INSIDE onConfirm, not before the dialog opens.
        // Previously it was stamped before setConfirmModal — if the user cancelled,
        // lastSavedRef was already overwritten with DEFAULT_INPUTS, falsely marking
        // their real inputs as "unsaved" and triggering spurious beforeunload warnings.
        lastSavedRef.current = JSON.stringify(DEFAULT_INPUTS);
        setInputs({ ...DEFAULT_INPUTS });
        setInputErrors({});
        setScenarioA(null);
        setScenarioB(null);
        setScenarioLabelA("");
        setScenarioLabelB("");
        setShowWhatIf(false);
        setWhatIfPayoutAge(null);
        setWhatIfSaTopup(null);
        setWhatIfHousing(null);
        setWhatIfSalaryBump(null);
        setWhatIfContribStop(null);
        setWhatIfOaDrawdown(null);
        setWhatIfSrsContrib(null);
        setWhatIfPrivGrowth(null);
        setActiveTab("summary");
        showToast("All inputs, scenarios, and What-If data reset to defaults.");
      }
    });
  };
  handleResetRef.current = handleReset; // keep ref current for keyboard shortcut handler

  // ── Sandbox-safe file download — tries Blob URL, always falls back to copy modal ──
  const triggerDownload = (content, filename, mimeType) => {
    const isCSV = mimeType.includes("csv");
    // Always open the export modal so user sees content regardless of download success
    setExportModal({ type: isCSV ? "csv" : "json", content, filename });
    // Also try Blob URL download (works in most browsers even in iframes)
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      showToast(`✓ Download started: ${filename}`);
    } catch (e) {
      // Modal already open — user can copy from there
    }
  };

  // ── Save Profile: saves ALL app state — inputs + scenarios + UI choices — as JSON directly ──
  const handleExportProfile = () => {
    lastSavedRef.current = JSON.stringify(inputs);
    setSavedSeq(s => s + 1); // Rev#18: trigger hasUnsaved recompute → badge disappears
    const memberName = (inputs.name || "Member").replace(/[^a-zA-Z0-9]/g, "_");
    const fullState = {
      // Core inputs
      inputs,
      // Tab + LIFE tab choices
      activeTab,
      highlightPlan,
      viewMode,
      basicPremiumPct,
      // Scenario comparison state
      scenarioA: scenarioA ? { projection: scenarioA.projection, payoutProj: scenarioA.payoutProj, inputs: scenarioA.inputs, label: scenarioA.label } : null,
      scenarioB: scenarioB ? { projection: scenarioB.projection, payoutProj: scenarioB.payoutProj, inputs: scenarioB.inputs, label: scenarioB.label } : null,
      scenarioLabelA,
      scenarioLabelB,
      // What-If explorer state
      whatIfPayoutAge,
      whatIfSaTopup,
      whatIfHousing,
      whatIfSalaryBump,
      whatIfContribStop,
      whatIfOaDrawdown,
      whatIfSrsContrib,
      whatIfPrivGrowth,
      showWhatIf,
      // Display preferences
      isRealDollars,
      pdfOrientation,
      // Meta
      savedAt: new Date().toISOString(),
      appVersion: "V4-2026"
    };
    const json = JSON.stringify(fullState, null, 2);
    // Download directly — no modal
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `CPF_Profile_${memberName}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      showToast(`✓ Profile saved: CPF_Profile_${memberName}.json`);
    } catch (e) {
      // Fallback: show modal with JSON to copy
      setExportModal({ type: "json", content: json, filename: `CPF_Profile_${memberName}.json` });
    }
  };

  const handleImportProfile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const target = e.target;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const p = JSON.parse(ev.target.result);
        // Whitelist helper — only copies known DEFAULT_INPUTS keys, fills gaps with
        // defaults so a profile from any older/newer version never injects unknown
        // keys or leaves required fields undefined (which causes NaN in the engine).
        const sanitiseInputs = (raw) => {
          const safe = { ...DEFAULT_INPUTS };
          Object.keys(DEFAULT_INPUTS).forEach(k => {
            if (raw[k] !== undefined) safe[k] = raw[k];
          });
          // Legacy migration: old profiles stored a single cpfisAmount — seed OA field from it
          if (raw.cpfisAmount !== undefined && !raw.cpfisOaAmount) {
            safe.cpfisOaAmount = raw.cpfisAmount;
          }
          return safe;
        };
        // Support both old format (just inputs) and new full-state format
        const rawInputs = p.inputs || p;
        if (!rawInputs || typeof rawInputs !== "object") {
          alert("Invalid profile file — no inputs found. Make sure you are loading a CPF Planner Pro JSON export.");
          target.value = "";
          return;
        }
        const safeIn = sanitiseInputs(rawInputs);
        setInputs(safeIn);
        // Restore optional UI state — each wrapped individually so one bad field
        // doesn't prevent the rest of the profile from loading
        if (p.inputs) {
          try { if (p.activeTab) setActiveTab(p.activeTab); } catch {}
          try { if (p.highlightPlan) setHighlightPlan(p.highlightPlan); } catch {}
          try { if (p.viewMode) setViewMode(p.viewMode); } catch {}
          try { if (p.basicPremiumPct != null) setBasicPremiumPct(p.basicPremiumPct); } catch {}
          try { if (p.scenarioLabelA != null) setScenarioLabelA(p.scenarioLabelA); } catch {}
          try { if (p.scenarioLabelB != null) setScenarioLabelB(p.scenarioLabelB); } catch {}
          try { if (p.whatIfPayoutAge != null) setWhatIfPayoutAge(p.whatIfPayoutAge); } catch {}
          try { if (p.whatIfSaTopup != null) setWhatIfSaTopup(p.whatIfSaTopup); } catch {}
          try { if (p.whatIfHousing != null) setWhatIfHousing(p.whatIfHousing); } catch {}
          try { if (p.whatIfSalaryBump != null) setWhatIfSalaryBump(p.whatIfSalaryBump); } catch {}
          try { if (p.whatIfContribStop != null) setWhatIfContribStop(p.whatIfContribStop); } catch {}
          try { if (p.whatIfOaDrawdown != null) setWhatIfOaDrawdown(p.whatIfOaDrawdown); } catch {}
          try { if (p.whatIfSrsContrib != null) setWhatIfSrsContrib(p.whatIfSrsContrib); } catch {}
          try { if (p.whatIfPrivGrowth != null) setWhatIfPrivGrowth(p.whatIfPrivGrowth); } catch {}
          try { if (p.showWhatIf != null) setShowWhatIf(p.showWhatIf); } catch {}
          try { if (p.isRealDollars != null) setIsRealDollars(p.isRealDollars); } catch {}
          try { if (p.pdfOrientation) setPdfOrientation(p.pdfOrientation); } catch {}
          // Fix 1: Restore scenario slots — if payoutProj is missing (old export format),
          // regenerate the projection from the sanitised inputs so the Compare chart
          // uses current-format engine output rather than stale stored rows.
          // runProjectionEngine is a module-level function — safe to call synchronously here.
          let scenariosRefreshed = false;
          try {
            if (p.scenarioA && p.scenarioA.inputs && Array.isArray(p.scenarioA.projection) && p.scenarioA.projection.length > 0) {
              const safeScenAInputs = sanitiseInputs(p.scenarioA.inputs);
              // BUG-6 fix: always regenerate projection from sanitised inputs rather than restoring
              // the stored projection rows. Stored rows from older exports may be missing fields
              // added since export (e.g. yearEventsIn / yearEventsOut), causing those columns to
              // silently read as zero in the ledger and Compare chart.
              // The payoutProj branch previously restored as-is — dropped. payoutProj: null is
              // handled correctly by the getNetWorth fallback (same as share-link restore path).
              const freshProjA = runProjectionEngine(safeScenAInputs);
              setScenarioA({ inputs: safeScenAInputs, projection: freshProjA, payoutProj: null, label: p.scenarioA.label });
              scenariosRefreshed = true;
            } else { setScenarioA(null); }
          } catch { setScenarioA(null); }
          try {
            if (p.scenarioB && p.scenarioB.inputs && Array.isArray(p.scenarioB.projection) && p.scenarioB.projection.length > 0) {
              const safeScenBInputs = sanitiseInputs(p.scenarioB.inputs);
              // BUG-6 fix: same as Scenario A — always regenerate, never restore stale rows.
              const freshProjB = runProjectionEngine(safeScenBInputs);
              setScenarioB({ inputs: safeScenBInputs, projection: freshProjB, payoutProj: null, label: p.scenarioB.label });
              scenariosRefreshed = true;
            } else { setScenarioB(null); }
          } catch { setScenarioB(null); }
          setMobileMenuOpen(false);
          lastSavedRef.current = JSON.stringify(safeIn); // clear unsaved-changes flag
          showToast(scenariosRefreshed
            ? "✓ Profile loaded — scenario projections refreshed from inputs (older export format detected)"
            : "✓ Profile loaded successfully");
        } else {
          // Legacy: old format was just the inputs object directly
          setScenarioA(null);
          setScenarioB(null);
          setMobileMenuOpen(false);
          lastSavedRef.current = JSON.stringify(safeIn); // clear unsaved-changes flag
          showToast("✓ Profile inputs imported (legacy format)");
        }
      } catch (err) {
        alert(`Could not read profile file.\n\nMake sure you are loading a CPF Planner Pro JSON export (.json). If the file was saved with an older version of the app, try the Share Code import instead.\n\nTechnical detail: ${err.message}`);
      }
      target.value = "";
    };
    reader.readAsText(file);
  };

  // lzCompress / lzDecompress are module-level (see top of file) — accessible here via closure.

  const handleShareLinkInit = () => {
    try {
      // Fix 2: include scenario INPUTS only (not projection arrays) so the recipient
      // can restore Compare slots from the share link. Projections are recalculated on load.
      // scenarioAInputs: null means no scenario saved; absent key = old link format.
      // BUG-4 fix: whatIfContribStop / OaDrawdown / SrsContrib / PrivGrowth were restored
      // on decode (lines ~2567-2570) but were never written into fullState, so they were
      // silently dropped from every share link. All 8 What-If fields now included.
      const fullState = {
        inputs, activeTab, highlightPlan, viewMode, basicPremiumPct,
        scenarioLabelA, scenarioLabelB,
        scenarioAInputs: scenarioA?.inputs ?? null,
        scenarioBInputs: scenarioB?.inputs ?? null,
        whatIfPayoutAge, whatIfSaTopup, whatIfHousing, whatIfSalaryBump,
        whatIfContribStop, whatIfOaDrawdown, whatIfSrsContrib, whatIfPrivGrowth,
        showWhatIf, isRealDollars, pdfOrientation, appVersion: "V4-2026"
      };
      const compressed = lzCompress(JSON.stringify(fullState));
      setShareUrl(compressed);
      setShowShareModal(true);
    } catch (e) {
      alert("Could not generate share code: " + e.message);
    }
  };
  handleShareLinkInitRef.current = handleShareLinkInit; // keep ref current for keyboard shortcut handler

  const executeCopy = () => {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Link Copied to Clipboard!");
        setShowShareModal(false);
      }).catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    const el = document.createElement('textarea');
    el.value = shareUrl;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      showToast("Link Copied to Clipboard!");
      setShowShareModal(false);
    } catch (err) {
      alert("Failed to copy automatically. Please manually copy the link from the text box.");
    }
    document.body.removeChild(el);
  };

  const handleExportCSV = () => {
    if (!projection || projection.length === 0) return;
    const baseYear = Number(inputs.currentYear) || 2026;
    const startAge = Number(inputs.currentAge) || 35;
    const headers = [
      "Age", "Year", "OA Balance", "SA Balance", "MA Balance", "RA Balance", "Total CPF",
      "Annual Inflow", "Cumulative Inflow", "Annual Outflow", "Cumulative Outflow",
      "Annual Interest", "Cumulative Interest", "Property Value",
      "Std Monthly Payout", "Std Annual Payout", "Std Bequest",
      "Esc Monthly Payout", "Esc Annual Payout", "Esc Bequest",
      "Bas Monthly Payout", "Bas Annual Payout", "Bas Bequest",
      "Std Total Yield", "Esc Total Yield", "Bas Total Yield",
      "Net Worth - Std (incl. Property)", "Net Worth - Esc (incl. Property)", "Net Worth - Bas (incl. Property)",
      "Yield (B) Amount", "Yield (S) Amount", "Yield (E) Amount", "Yield IRR % (Std)", "Yield IRR % (Esc)", "Yield IRR % (Bas)"
    ];
    const rows = projection.map(row => {
      const lr = payoutByAge.get(row.age) || {};
      const yr = baseYear + (row.age - startAge);
      return [
        row.age, yr,
        row.oa, row.sa, row.ma, row.ra, row.total,
        row.injected, row.cumulativeInjected,
        row.outflow, row.cumulativeOutflow,
        row.interest, row.cumulativeInterest,
        row.propertyValue,
        lr.standardMonthly || "", lr.standardAnnual || "", lr.standardBequest ?? "",
        lr.escalatingMonthly || "", lr.escalatingAnnual || "", lr.escalatingBequest ?? "",
        lr.basicMonthly || "", lr.basicAnnual || "", lr.basicBequest ?? "",
        lr.standardTotal || "", lr.escalatingTotal || "", lr.basicTotal || "",
        lr.standardNetWorth || "", lr.escalatingNetWorth || "", lr.basicNetWorth || "",
        // Yield amounts (annual payout per plan)
        lr.basicAnnual || "", lr.standardAnnual || "", lr.escalatingAnnual || "",
        // Yield XIRR % — pre-computed Newton-Raphson XIRR for each plan
        ...(["standard", "escalating", "basic"].map(plan => {
          const pa = payoutAge65; // use debounced value — matches xirrByAge which is keyed on debounced pa
          if (row.age < pa) return "";
          const xirr = xirrByAge[plan]?.[row.age];
          return xirr != null ? xirr.toFixed(2) + "%" : "";
        }))
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const memberName = (inputs.name || "Member").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `CPF_Projection_${memberName}_Age${startAge}_to95.csv`;
    // Download directly — no modal
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      showToast(`✓ CSV downloaded: ${filename}`);
    } catch (e) {
      // Fallback: show modal with CSV content to copy
      setExportModal({ type: "csv", content: csv, filename });
    }
  };

  const handleExportLedgerCSV = () => {
    if (!displayAccumulation || displayAccumulation.length === 0) return;
    const memberName = (inputs.name || "Member").replace(/[^a-zA-Z0-9]/g, "_");
    const startAge = Number(inputs.currentAge) || 35;
    const saRaLabel = (Number(inputs.currentAge) >= 55 || (Number(inputs.payoutAge) <= Number(inputs.currentAge))) ? "RA Interest" : "SA Interest";
    const headers = [
      "Age",
      "Mandatory",
      "Voluntary",
      "Grants/WIS",
      "OA Interest",
      saRaLabel,
      "MA Interest",
      "Total Inflow",
      "Housing Out",
      "Medical Out",
      "OA Draw",
      "Edu Loan Out",
      "Loved One Out",
      "CPFIS Out",
      "Events In",
      "Events Out",
      "Total Outflow",
      "Net Flow"
    ];
    // Accumulate totals for the TOTAL row
    const totals = { mandatory:0, voluntary:0, grants:0, oaInt:0, saRaInt:0, maInt:0, housOut:0, medOut:0, oaDraw:0, eduOut:0, lovedOut:0, cpfisOut:0, eventsIn:0, eventsOut:0 };
    const dataRows = displayAccumulation.map(row => {
      const mandatory  = row.yearMandatory    || 0;
      const voluntary  = row.yearVoluntary    || 0;
      const grants     = row.yearGovGrants    || 0;
      const oaInt      = row.yearOaInterest   || 0;
      const saRaInt    = row.yearSaRaInterest || 0;
      const maInt      = row.yearMaInterest   || 0;
      const housOut    = row.yearHousingOut   || 0;
      const medOut     = row.yearMedOut       || 0;
      const oaDraw     = row.yearOaDrawOut    || 0;
      const eduOut     = row.yearEduOut       || 0;
      const lovedOut   = row.yearLovedOneOut  || 0;
      const cpfisOut   = row.yearCpfisOut     || 0;
      const eventsIn   = row.yearEventsIn     || 0;
      const eventsOut  = row.yearEventsOut    || 0;
      const totalIn    = mandatory + voluntary + grants + oaInt + saRaInt + maInt + eventsIn;
      const totalOut   = housOut + medOut + oaDraw + eduOut + lovedOut + cpfisOut + eventsOut;
      const net        = totalIn - totalOut;
      totals.mandatory += mandatory; totals.voluntary += voluntary; totals.grants += grants;
      totals.oaInt     += oaInt;     totals.saRaInt   += saRaInt;  totals.maInt  += maInt;
      totals.housOut   += housOut;   totals.medOut    += medOut;   totals.oaDraw += oaDraw;
      totals.eduOut    += eduOut;    totals.lovedOut  += lovedOut; totals.cpfisOut += cpfisOut;
      totals.eventsIn  += eventsIn;  totals.eventsOut += eventsOut;
      return [row.age, mandatory, voluntary, grants, oaInt, saRaInt, maInt, totalIn, housOut, medOut, oaDraw, eduOut, lovedOut, cpfisOut, eventsIn, eventsOut, totalOut, net];
    });
    const totIn  = totals.mandatory + totals.voluntary + totals.grants + totals.oaInt + totals.saRaInt + totals.maInt + totals.eventsIn;
    const totOut = totals.housOut + totals.medOut + totals.oaDraw + totals.eduOut + totals.lovedOut + totals.cpfisOut + totals.eventsOut;
    const totNet = totIn - totOut;
    const totalRow = ["TOTAL", totals.mandatory, totals.voluntary, totals.grants, totals.oaInt, totals.saRaInt, totals.maInt, totIn, totals.housOut, totals.medOut, totals.oaDraw, totals.eduOut, totals.lovedOut, totals.cpfisOut, totals.eventsIn, totals.eventsOut, totOut, totNet];
    const csv = [headers, ...dataRows, totalRow].map(r => r.join(",")).join("\n");
    const filename = `CPF_Cashflow_Ledger_${memberName}_Age${startAge}_to95.csv`;
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      showToast(`✓ Ledger CSV downloaded: ${filename}`);
    } catch (e) {
      setExportModal({ type: "csv", content: csv, filename });
    }
  };

  // Rev #24 — Scenario A vs B diff export (CSV)
  const handleExportScenarioDiff = () => {
    if (!scenarioA?.projection?.length || !scenarioB?.projection?.length) return;
    const labelA = scenarioLabelA || "Scenario A";
    const labelB = scenarioLabelB || "Scenario B";

    // Build O(1) lookup maps
    const mapA = new Map(scenarioA.projection.map(r => [r.age, r]));
    const mapB = new Map(scenarioB.projection.map(r => [r.age, r]));

    // Collect key ages: every 5 years + both payout ages, sorted
    const paA = Number(scenarioA.inputs?.payoutAge) || 65;
    const paB = Number(scenarioB.inputs?.payoutAge) || 65;
    const startAge = Math.min(
      Number(scenarioA.inputs?.currentAge) || 35,
      Number(scenarioB.inputs?.currentAge) || 35
    );
    const ageSet = new Set([paA, paB]);
    for (let a = startAge; a <= 95; a += 5) ageSet.add(a);
    const ages = [...ageSet].filter(a => a >= startAge && a <= 95).sort((x, y) => x - y);

    // Headers — label each column with scenario name
    const headers = [
      "Age",
      `OA (${labelA})`, `OA (${labelB})`, "ΔOA (B−A)",
      `SA/RA (${labelA})`, `SA/RA (${labelB})`, "ΔSA/RA (B−A)",
      `MA (${labelA})`, `MA (${labelB})`, "ΔMA (B−A)",
      `Total (${labelA})`, `Total (${labelB})`, "ΔTotal (B−A)",
    ];

    const rows = ages.map(age => {
      const rA = mapA.get(age) || {};
      const rB = mapB.get(age) || {};
      const oaA = rA.oa || 0; const oaB = rB.oa || 0;
      const saA = rA.sa || 0; const saB = rB.sa || 0;
      const maA = rA.ma || 0; const maB = rB.ma || 0;
      const totA = rA.total || 0; const totB = rB.total || 0;
      return [
        age,
        oaA, oaB, oaB - oaA,
        saA, saB, saB - saA,
        maA, maB, maB - maA,
        totA, totB, totB - totA,
      ];
    });

    // Inputs-diff footer — show only keys that differ between the two scenarios
    const diffKeys = Object.keys(scenarioA.inputs || {}).filter(k =>
      String(scenarioA.inputs[k]) !== String(scenarioB.inputs[k]) && k !== 'name'
    );
    const diffRows = [
      [],
      ["KEY INPUTS THAT DIFFER", labelA, labelB, ""],
      ...diffKeys.map(k => [k, scenarioA.inputs[k], scenarioB.inputs[k], ""])
    ];

    const csv = [headers, ...rows, ...diffRows].map(r => r.join(",")).join("\n");
    const filename = `CPF_ScenarioDiff_${labelA.replace(/\W/g,"_")}_vs_${labelB.replace(/\W/g,"_")}.csv`;
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      showToast(`✓ Scenario diff downloaded: ${filename}`);
    } catch (e) {
      setExportModal({ type: "csv", content: csv, filename });
    }
  };

  const handlePrintTable = () => {
    const memberName = debouncedInputs.name || "Member";
    const startAge = Number(debouncedInputs.currentAge) || 35;
    // R2 fix: use payoutAge65 (debounced) so the pa guard and row highlighting
    // match the debounced displayProjection data. Using live inputs.payoutAge caused
    // the wrong row to be highlighted green during the 180ms debounce window.
    const pa = payoutAge65;
    const fmt = v => v != null ? `$${Number(v).toLocaleString()}` : "-";

    // Build HTML table for print
    const rowsHtml = displayProjection.map(row => {
      const baseRow = accumulationByAge.get(row.age) || {};
      const raSaBal = (baseRow.sa || 0) + (row[`${highlightPlan}RA`] || 0);
      const isPA = row.age >= pa;
      const bg = row.age === pa ? "#e8f5e9" : row.age % 2 === 0 ? "#f8fafc" : "#ffffff";
      return `<tr style="background:${bg}">
        <td style="font-weight:700">${row.age}</td>
        <td>${fmt(baseRow.oa)}</td><td>${fmt(baseRow.ma)}</td><td>${fmt(raSaBal)}</td>
        <td>${fmt(baseRow.injected)}</td><td>${fmt(baseRow.outflow)}</td>
        <td>${isPA ? fmt(row.basicAnnual) : "-"}</td><td>${fmt(row.basicBequest)}</td>
        <td>${isPA ? fmt(row.standardAnnual) : "-"}</td><td>${fmt(row.standardBequest)}</td>
        <td>${isPA ? fmt(row.escalatingAnnual) : "-"}</td><td>${fmt(row.escalatingBequest)}</td>
        <td style="font-weight:700">${fmt(row[`${highlightPlan}Total`])}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html style="background:#ffffff"><head><meta charset="UTF-8"/>
<title>CPF Data Table — ${memberName}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, sans-serif; font-size: 9px; color: #0f172a; }
  h1 { font-size: 14px; font-weight: 900; margin: 0 0 4px; }
  p { font-size: 9px; color: #64748b; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0f172a; color: #fff; padding: 5px 6px; text-align: right; font-size: 8px; text-transform: uppercase; }
  th:first-child { text-align: left; }
  td { padding: 4px 6px; text-align: right; border-bottom: 1px solid #e2e8f0; }
  td:first-child { text-align: left; font-weight: 700; }
</style></head><body>
<h1>CPF Projection — ${memberName} (Age ${startAge} to 95)</h1>
<p>Plan shown: ${highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)} | Payout Age: ${pa} | Generated: ${new Date().toLocaleDateString("en-SG")}</p>
<table>
<thead><tr><th>Age</th><th>OA</th><th>MA</th><th>SA/RA</th><th>Inflows</th><th>Outflows</th>
<th>Bas Pay</th><th>Bas Beq</th><th>Std Pay</th><th>Std Beq</th><th>Esc Pay</th><th>Esc Beq</th><th>Total Yield</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</body></html>`;

    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => { setTimeout(() => { win.focus(); win.print(); URL.revokeObjectURL(url); }, 400); };
        showToast("Data table opened — use print dialog to save as PDF or print");
      } else {
        URL.revokeObjectURL(url);
        showToast("Pop-up blocked — please allow pop-ups for this site and try again");
      }
    } catch (e) {
      // Fallback to text modal
      // R2 fix: derive is55Plus from debouncedInputs so the SA/RA column label
      // matches the same data source as the rest of the print function.
      const is55PlusAtPrint = (Number(debouncedInputs.currentAge) || 0) >= 55;
      const headers = ["Age", "OA", "MA", is55PlusAtPrint ? "RA" : "SA", "Inflows", "Outflows", "Bas Pay", "Bas Beq", "Std Pay", "Std Beq", "Esc Pay", "Esc Beq", "Yield"].join("\t");
      const textRows = displayProjection.map(row => {
        const baseRow = accumulationByAge.get(row.age) || {};
        const raSaBal = (baseRow.sa || 0) + (row[`${highlightPlan}RA`] || 0);
        const isPA = row.age >= pa;
        return [row.age, fmt(baseRow.oa), fmt(baseRow.ma), fmt(raSaBal), fmt(baseRow.injected), fmt(baseRow.outflow), isPA ? fmt(row.basicAnnual) : "-", fmt(row.basicBequest), isPA ? fmt(row.standardAnnual) : "-", fmt(row.standardBequest), isPA ? fmt(row.escalatingAnnual) : "-", fmt(row.escalatingBequest), fmt(row[`${highlightPlan}Total`])].join("\t");
      }).join("\n");
      setExportModal({ type: "print", content: `CPF Projection — ${memberName} (Age ${startAge} to 95)\n${"=".repeat(60)}\n${headers}\n${textRows}` });
    }
  };

  const printMilestoneReport = () => {
    const lines = milestones.map(m => `Age ${String(m.age).padStart(3)}  |  ${m.label.padEnd(40)}  |  ${m.detail}`).join("\n");
    const content = `MILESTONE REPORT — ${inputs.name || "Member"}\n${"=".repeat(80)}\n${"Age".padEnd(8)}Event${" ".repeat(35)}Details\n${"-".repeat(80)}\n${lines}\n\n${LEGAL_DISCLAIMER}`;
    setExportModal({ type: "milestone", content });
  };

  // #7 — Memoise on only engine-relevant fields (not name, display prefs etc.)
  const engineKey = useMemo(() => {
    const {
      currentAge, currentYear, payoutAge, contributionStopAge, housingStopAge,
      isSelfEmployed, isMale, oaBalance, saBalance, maBalance,
      empOaCont, empSaCont, empMaCont, vc3aCash, vcSaTopup, vcVhr,
      annualGovGrant, wisAmount,
      oaToSaTransfer, oaToMaTransfer, oaWithdrawalAt55,
      usePropertyPledge, pledgeWithdrawalAmount, pledgeWithdrawalAge,
      cpfisOaAmount, cpfisSaAmount, housingOutflow, oaEduLoan, oaEduLoanFreq,
      medicalUsage, medishieldIP, elderCareShield,
      medicalInflationRate, propertyValue, propertyGrowthRate,
      propertyLeasehold, propertyLeaseYears, inflationRate, includeProperty,
      salaryGross, salaryBonus, salaryGrowthRate, netTradeIncome,
      sellPropertyAge,
      currentPrivateAssets, annualPrivateSaving, privateAssetGrowthRate,
      plannedDownpaymentOA, downpaymentAge,
      srsBalance, srsAnnualContribution, srsContribStopAge, srsReturnRate,
      srsDrawdownStartAge, srsDrawdownYears, // R4: srsCitizenPR removed — dead field, engine reads citizenStatus instead
      oaDrawdownStartAge, oaDrawdownMonthly, oaDrawdownFloor,
      propMonetiseEnabled, propMonetiseScheme, propMonetiseAge,
      propMonetiseCashProceeds, propMonetiseRaTopup,
      vcMaCash, oaToMaForLovedOne, oaToSaForLovedOne, citizenStatus, prYear, prRateType, isPwD,
      vc3aFreq, vcSaFreq, vcMaFreq, vcVhrFreq, govGrantFreq, wisFreq, // mrssFreq removed — mirrors vcSaFreq by CPF policy
      cpfisOaFreq, cpfisSaFreq, housingFreq, oaWithdrawalFreq, oaToMaFreq, oaToSaFreq,
      vc3aDur, vcSaDur, vcMaDur, vcVhrDur, govGrantDur, wisDur, // mrssDur removed — no separate MRSS duration control
      cpfisOaDur, cpfisSaDur, housingDur, oaToMaDur, oaToSaDur, oaEduLoanDur,
      dieWithZeroEnabled, dieWithZeroAge,
      retirementSumGrowth, // Rev #5: changing this rate changes all FRS/BHS/BRS/ERS projections
      salaryPhaseAge, salaryGrowthRate2, careerBreakStartAge, careerBreakEndAge, // Rev #22
      lifeEvents // Rev #D2
    } = debouncedInputs;
    return JSON.stringify({
      currentAge, currentYear, payoutAge, contributionStopAge, housingStopAge,
      isSelfEmployed, isMale, oaBalance, saBalance, maBalance,
      empOaCont, empSaCont, empMaCont, vc3aCash, vcSaTopup, vcVhr,
      annualGovGrant, wisAmount,
      oaToSaTransfer, oaToMaTransfer, oaWithdrawalAt55,
      usePropertyPledge, pledgeWithdrawalAmount, pledgeWithdrawalAge,
      cpfisOaAmount, cpfisSaAmount, housingOutflow, oaEduLoan, oaEduLoanFreq,
      medicalUsage, medishieldIP, elderCareShield,
      medicalInflationRate, propertyValue, propertyGrowthRate,
      propertyLeasehold, propertyLeaseYears, inflationRate, includeProperty,
      salaryGross, salaryBonus, salaryGrowthRate, netTradeIncome,
      sellPropertyAge,
      currentPrivateAssets, annualPrivateSaving, privateAssetGrowthRate,
      plannedDownpaymentOA, downpaymentAge,
      srsBalance, srsAnnualContribution, srsContribStopAge, srsReturnRate,
      srsDrawdownStartAge, srsDrawdownYears,
      oaDrawdownStartAge, oaDrawdownMonthly, oaDrawdownFloor,
      propMonetiseEnabled, propMonetiseScheme, propMonetiseAge,
      propMonetiseCashProceeds, propMonetiseRaTopup,
      vcMaCash, oaToMaForLovedOne, oaToSaForLovedOne, citizenStatus, prYear, prRateType, isPwD,
      vc3aFreq, vcSaFreq, vcMaFreq, vcVhrFreq, govGrantFreq, wisFreq,
      cpfisOaFreq, cpfisSaFreq, housingFreq, oaWithdrawalFreq, oaToMaFreq, oaToSaFreq,
      vc3aDur, vcSaDur, vcMaDur, vcVhrDur, govGrantDur, wisDur,
      cpfisOaDur, cpfisSaDur, housingDur, oaToMaDur, oaToSaDur, oaEduLoanDur,
      dieWithZeroEnabled, dieWithZeroAge,
      retirementSumGrowth, // Rev #5
      salaryPhaseAge, salaryGrowthRate2, careerBreakStartAge, careerBreakEndAge, // Rev #22
      lifeEvents // Rev #D2
    });
  }, [debouncedInputs]);
  const projection = useMemo(() => {
    if (debouncedInputs.dieWithZeroEnabled) {
      const pa   = Number(debouncedInputs.payoutAge) || 65;
      const dwzA = Number(debouncedInputs.dieWithZeroAge) || 85;
      const n    = Math.max(1, dwzA - pa);
      const rOA  = 0.025;
      const pass1 = runProjectionEngine({ ...debouncedInputs, oaDrawdownMonthly: 0, oaDrawdownStartAge: 0 });
      const oaAtPayout = pass1.find(r => r.age === pa)?.oa || 0;
      const dwzPmt = oaAtPayout > 0
        ? (rOA > 0 ? Math.round(oaAtPayout * rOA / (1 - Math.pow(1 + rOA, -n)) / 12) : Math.round(oaAtPayout / n / 12))
        : 0;
      const pass2 = runProjectionEngine({ ...debouncedInputs, oaDrawdownMonthly: dwzPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 });
      // NX3 fix: verify OA actually depletes to ~$0 at dwzAge.
      // If mandatory contributions or other inflows continue post-payout, OA will retain a residual
      // that the PMT formula (computed on oaAtPayout alone) did not account for.
      // Apply a first-order correction: spread the residual evenly over the drawdown window and
      // run a corrected pass3. Store _dwzResidualOa for UI disclosure.
      const residualOa = pass2.find(r => r.age === dwzA)?.oa || 0;
      let finalPmt  = dwzPmt;
      let finalPass = pass2;
      if (residualOa > 500 && dwzPmt > 0) {
        const correctionMonthly = Math.round(residualOa / Math.max(1, n * 12));
        finalPmt  = dwzPmt + correctionMonthly;
        finalPass = runProjectionEngine({ ...debouncedInputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 });
      }
      finalPass._dwzOaMonthly  = finalPmt;
      finalPass._dwzStartAge   = pa;
      finalPass._dwzResidualOa = finalPass.find(r => r.age === dwzA)?.oa || 0;

      // P1-D fix: compute private-asset DWZ draw and inject into the final engine pass.
      // Pattern mirrors the OA three-pass: read privAssets at payout age from finalPass,
      // compute PMT over the DWZ window, then re-run the engine with overridePrivDrawdown
      // so the chart and ledger reflect actual depletion rather than endless growth.
      const rPriv = Math.max(0, (Number(debouncedInputs.privateAssetGrowthRate) || 0) / 100);
      const privAtPayout = finalPass.find(r => r.age === pa)?.privateAssets || 0;
      let pmtPrivAnnual = privAtPayout > 0
        ? (rPriv > 0
            ? Math.round(privAtPayout * rPriv / (1 - Math.pow(1 + rPriv, -n)))
            : Math.round(privAtPayout / n))
        : 0;
      if (pmtPrivAnnual > 0) {
        let privPass = runProjectionEngine(
          { ...debouncedInputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 },
          { overridePrivDrawdown: pmtPrivAnnual, overridePrivDrawdownStart: pa }
        );
        // BUG-9 fix: the PMT formula is computed on privAtPayout alone and assumes no further
        // inflows. However, the engine unconditionally adds privateSaving every year — including
        // during the DWZ drawdown window — leaving a residual of ~privateSaving × n at dwzAge.
        // Mirror the OA residual-correction pass: measure the overshoot, spread it evenly over
        // the drawdown window, increment pmtPrivAnnual, and re-run once to correct depletion.
        const residualPriv = privPass.find(r => r.age === dwzA)?.privateAssets || 0;
        if (residualPriv > 500 && pmtPrivAnnual > 0) {
          const correctionAnnual = Math.round(residualPriv / Math.max(1, n));
          pmtPrivAnnual += correctionAnnual;
          privPass = runProjectionEngine(
            { ...debouncedInputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 },
            { overridePrivDrawdown: pmtPrivAnnual, overridePrivDrawdownStart: pa }
          );
        }
        finalPass = privPass;
        finalPass._dwzOaMonthly   = finalPmt;
        finalPass._dwzStartAge    = pa;
        finalPass._dwzResidualOa  = finalPass.find(r => r.age === dwzA)?.oa || 0;
        finalPass._dwzResidualPriv = finalPass.find(r => r.age === dwzA)?.privateAssets || 0;
      }
      finalPass._dwzPrivMonthly = Math.round(pmtPrivAnnual / 12); // monthly draw for UI display
      return finalPass;
    }
    return runProjectionEngine(debouncedInputs);
  }, [engineKey]); // eslint-disable-line

  // projectionByAge: O(1) lookup for the raw (nominal) engine projection — used wherever
  // projection.find(r => r.age === X) was called repeatedly in useMemos and render.
  // IMPORTANT: declared here (immediately after `projection`) to avoid TDZ — the const
  // was previously positioned ~180 lines later, after payoutRow65 which uses it directly.
  const projectionByAge = useMemo(
    () => new Map((projection || []).map(r => [r.age, r])),
    [projection]);

  const effectiveOaDrawMonthly  = debouncedInputs.dieWithZeroEnabled ? (projection._dwzOaMonthly || 0) : (Number(debouncedInputs.oaDrawdownMonthly) || 0);
  const effectiveOaDrawStartAge = debouncedInputs.dieWithZeroEnabled ? (projection._dwzStartAge || Number(debouncedInputs.payoutAge) || 65) : (Number(debouncedInputs.oaDrawdownStartAge) || 0);
  const effectiveOaDrawFloor    = debouncedInputs.dieWithZeroEnabled ? 0 : (Number(debouncedInputs.oaDrawdownFloor) || 0);

  // NX10 fix: payoutAge65 reads debouncedInputs so it matches the debounced projection
  // Declared HERE (before raAtPayout) to avoid TDZ — raAtPayout references it directly.
  const payoutAge65 = Number(debouncedInputs.payoutAge) || 65;

  // CQ-2 perf: use projectionByAge Map (O(1)) instead of projection.find() (O(n))
  const raAtPayout = projectionByAge.get(payoutAge65)?.ra || 0;

  // 20% RA-to-OA transfer at payout age (CPF policy):
  // Transfer base = RA at payout − (cumulative cash top-ups to SA/RA + interest earned on SA/RA)
  // Cash top-ups: voluntary SA top-ups, gov grants, MRSS grants credited to SA/RA
  // Interest: interest accruing to SA (pre-55) and RA (post-55) accounts over the full period
  // These deductions are sourced directly from the projection engine's per-row tracking.
  const payoutRow65 = projectionByAge.get(payoutAge65);
  const cumulativeCashTopUps = payoutRow65?.cumRaCashTopUps ?? 0;
  const cumulativeRaInterest = payoutRow65?.cumRaInterest ?? 0;
  const raTransferBase = Math.max(0, raAtPayout - cumulativeCashTopUps - cumulativeRaInterest);
  const raOaTransfer = Math.round(raTransferBase * 0.20);
  // RA after 20% transfer (before CPF LIFE premium deduction)
  const raAfterTransfer = raAtPayout - raOaTransfer;

  const lifePlans = useMemo(() => {
    // NX10 fix: use debouncedInputs inside useMemos that depend on the debounced projection
    const pAge = Number(debouncedInputs.payoutAge) || 65;
    const male = debouncedInputs.isMale !== false;
    // CPF LIFE payout is calculated on RA AFTER the 20% OA transfer.
    // The transfer reduces the RA entering the LIFE pool — payouts are correspondingly lower.
    const raBase = raAfterTransfer;
    // ── Standard Plan: linear interpolation from 2026 CPF Estimator lookup table ──
    // The 7% deferral is a marketing approximation for Standard Plan only;
    // the correct approach is to read the actual RA from the projection at each
    // payout age and interpolate — the gain emerges naturally from RA growth + shorter N.
    const startM = interpolateCpfLife(raBase, 'std', true);
    const startF = interpolateCpfLife(raBase, 'std', false);
    const startActive = male ? startM : startF;

    // ── Escalating Plan: same interpolation; ~80% of Standard (confirmed across all RA) ──
    const escStartM = interpolateCpfLife(raBase, 'esc', true);
    const escStartF = interpolateCpfLife(raBase, 'esc', false);
    const escStartActive = male ? escStartM : escStartF;

    // ── Basic Plan: interpolation for display; PMT used internally for RA depletion ──
    // Payout ≈ 92% of Standard (confirmed 91.8-92.6% in CPF Estimator data).
    // Monthly PMT formula: r=4%/12, n=300 months (extra interest extends 240→300 months).
    const basStartM = interpolateCpfLife(raBase, 'bas', true);
    const basStartF = interpolateCpfLife(raBase, 'bas', false);
    const basStartActive = male ? basStartM : basStartF;

    return {
      standard:   { name: "Standard",   start: startActive,    startM,        startF        },
      escalating: { name: "Escalating", start: escStartActive,  startM: escStartM, startF: escStartF },
      basic:      { name: "Basic",      start: basStartActive,  startM: basStartM, startF: basStartF }
    };
  }, [raAfterTransfer, debouncedInputs.payoutAge, debouncedInputs.isMale]); // R6 fix: basicPremiumPct removed — lifePlans never reads it; only payoutProjection does

  const payoutProjection = useMemo(() => {
    let data = [];
    const pAge = Number(debouncedInputs.payoutAge) || 65; // NX10 fix: stay in sync with projection
    // initialRA = RA after 20% transfer — this is what enters the CPF LIFE pool
    const initialRA = raAfterTransfer;
    const includeProp = debouncedInputs.includeProperty ?? true; // use debounced — deps already list debouncedInputs.includeProperty
    let cumPayoutStandard = 0, cumPayoutEscalating = 0, cumPayoutBasic = 0;

    // ── BASIC PLAN MATH ────────────────────────────────────────────────────────
    // Architecture (per CPF actuarial document + drop-table analysis):
    //
    //   Phase 1A (pAge → Phase1B trigger): STABLE payout = interpolateCpfLife 'bas' result.
    //     RA_Retained tracked using the effective rate r that depletes it to $0 at exactly
    //     age 90 given the lookup-table PMT (solved via Newton-Raphson).
    //     This effective rate (~8-11%/yr) is higher than 4% because it reflects the pooled
    //     fund subsidy — the lookup PMT is actuarially set, not a pure RSS drawdown.
    //
    //   Phase 1B trigger: when combined balance (RA_Retained + OA + MA from live projection)
    //     drops below $60K. Payout linearly declines from Phase 1A → Phase 2 level.
    //
    //   Phase 2 (age ≥ 90): LOWER constant payout = Phase1A × (1 − dropPct).
    //     dropPct interpolated from CPF document table (7.2% at $100K → 3.4% at $1M RA).
    //
    // Phase 1A monthly payout = lookup table (authoritative CPF Estimator value)
    const basicPhase1aMonthly = lifePlans.basic.start; // already gender-adjusted
    const { premium: basicPremium, pv: basicPV,
            phase1aAnnual: basicPhase1aAnnual, phase2Annual: basicPhase2Annual,
            phase1bTrigger: phase1bStartAge, effAnnualFactor: basicEffAnnualFactor
          } = computeBasicPlanParams(initialRA, pAge, basicPhase1aMonthly, basicPremiumPct);
    let basicRaRemaining = basicPV;
    let cumPayoutBasicPool = 0;

    for (let p of projection) {
      const age = p.age; const yearsElapsed = age - pAge;
      let stdBeq = 0, escBeq = 0, basBeq = 0, stdPayY = 0, escPayY = 0, basPayY = 0, stdRA = 0, escRA = 0, basRA = 0;
      if (age < pAge) {
        stdRA = p.ra; escRA = p.ra; basRA = p.ra;
        stdBeq = p.sa + p.ra; escBeq = p.sa + p.ra; basBeq = p.sa + p.ra;
      } else {
        stdPayY = lifePlans.standard.start * 12; cumPayoutStandard += stdPayY;
        stdBeq = Math.max(0, initialRA - cumPayoutStandard);

        escPayY = (lifePlans.escalating.start * Math.pow(1.02, yearsElapsed)) * 12; cumPayoutEscalating += escPayY;
        escBeq = Math.max(0, initialRA - cumPayoutEscalating);

        // ── Basic Plan: Phase 1A / Phase 1B / Phase 2 — use shared helper ──────
        if (age < 90) {
          const { basPay, newRaRem } = computeBasicPlanYearPayout(
            age, phase1bStartAge, basicPhase1aAnnual, basicPhase2Annual,
            basicRaRemaining, basicEffAnnualFactor
          );
          basPayY = basPay;
          basicRaRemaining = newRaRem;
          cumPayoutBasic += basPayY;
          basRA = basicRaRemaining;
          basBeq = basRA + basicPremium; // Phase 1: remaining RA + full premium refund
        } else {
          // Phase 2 (age ≥ 90): lower constant payout from communal annuity pool
          const { basPay } = computeBasicPlanYearPayout(
            age, phase1bStartAge, basicPhase1aAnnual, basicPhase2Annual, 0, basicEffAnnualFactor
          );
          basicRaRemaining = 0;
          basRA = 0;
          basPayY = basPay;
          cumPayoutBasic += basPayY;
          cumPayoutBasicPool += basPayY;
          basBeq = Math.max(0, basicPremium - cumPayoutBasicPool);
        }
      }
      const propVal = includeProp ? p.propertyValue : 0;
      const privAsset = p.privateAssets || 0;
      const srsBal = p.srsBalance || 0;
      data.push({
        age, standardMonthly: Math.round(stdPayY / 12), escalatingMonthly: Math.round(escPayY / 12), basicMonthly: Math.round(basPayY / 12),
        standardAnnual: Math.round(stdPayY), escalatingAnnual: Math.round(escPayY), basicAnnual: Math.round(basPayY),
        standardBequest: Math.round(stdBeq), escalatingBequest: Math.round(escBeq), basicBequest: Math.round(basBeq),
        standardRA: Math.round(stdRA), escalatingRA: Math.round(escRA), basicRA: Math.round(basRA),
        standardTotal: Math.round(cumPayoutStandard + stdBeq), escalatingTotal: Math.round(cumPayoutEscalating + escBeq), basicTotal: Math.round(cumPayoutBasic + basBeq),
        srsBalance: srsBal,
        standardNetWorth: Math.round(p.oa + p.sa + p.ma + stdBeq + propVal + privAsset + srsBal), escalatingNetWorth: Math.round(p.oa + p.sa + p.ma + escBeq + propVal + privAsset + srsBal), basicNetWorth: Math.round(p.oa + p.sa + p.ma + basBeq + propVal + privAsset + srsBal)
      });
    }
    return data;
  }, [projection, lifePlans, debouncedInputs.payoutAge, raAtPayout, raAfterTransfer, debouncedInputs.includeProperty, basicPremiumPct]);

  const applyInflation = (val, age) => {
    if (!isRealDollars || isNaN(val)) return val;
    const ca = Number(debouncedInputs.currentAge) || 35; const yrs = Math.max(0, age - ca); // use debounced — mirrors displayProjection/displayAccumulation deflation source
    const infl = (Number(debouncedInputs.inflationRate) || 0) / 100;
    return val / Math.pow(1 + infl, yrs);
  };

  // BUG-12 fix: use debouncedInputs for the deflation factor so displayProjection and
  // displayAccumulation only recompute when their debounced source data also recomputes.
  // Previously: applyInflation closed over live inputs.inflationRate/currentAge, so the memos
  // fired immediately on keypress, applying a new rate to stale debounced payouts for ~180ms.
  const displayProjection = useMemo(() => {
    if (!isRealDollars) return payoutProjection;
    const inflD = (Number(debouncedInputs.inflationRate) || 0) / 100;
    const caD   = Number(debouncedInputs.currentAge) || 35;
    const deflate = (val, age) => isNaN(val) ? val : Math.round(val / Math.pow(1 + inflD, Math.max(0, age - caD)));
    return payoutProjection.map(row => { let n = { ...row }; Object.keys(n).forEach(k => { if (typeof n[k] === "number" && k !== "age") n[k] = deflate(n[k], row.age); }); return n; });
  }, [payoutProjection, isRealDollars, debouncedInputs.inflationRate, debouncedInputs.currentAge]);

  const displayAccumulation = useMemo(() => {
    if (!isRealDollars) return projection;
    const inflD = (Number(debouncedInputs.inflationRate) || 0) / 100;
    const caD   = Number(debouncedInputs.currentAge) || 35;
    const deflate = (val, age) => isNaN(val) ? val : Math.round(val / Math.pow(1 + inflD, Math.max(0, age - caD)));
    return projection.map(row => { let n = { ...row }; Object.keys(n).forEach(k => { if (typeof n[k] === "number" && k !== "age") n[k] = deflate(n[k], row.age); }); return n; });
  }, [projection, isRealDollars, debouncedInputs.inflationRate, debouncedInputs.currentAge]);

  // O(1) age-keyed Maps — replaces O(n²) .find(p => p.age === row.age) in print/export/table render loops
  const accumulationByAge = useMemo(
    () => new Map((displayAccumulation || []).map(r => [r.age, r])),
    [displayAccumulation]);
  const payoutByAge = useMemo(
    () => new Map((payoutProjection || []).map(r => [r.age, r])),
    [payoutProjection]);
  // ── Gap Alert computation (shared by summary banner + RSTU inline card) ──
  // Returns null when no gap exists (member meets or exceeds FRS, or after top-up).
  // Both render sites simply show nothing when null — reactive disappearance is automatic.
  const gapAlert = useMemo(() => {
    // N1 fix: all scalar reads use debouncedInputs (same source as projection/displayAccumulation)
    // so there is no mismatch during the 180ms debounce window.
    const ca = Number(debouncedInputs.currentAge) || 35;
    const cy = Number(debouncedInputs.currentYear) || 2026;
    let raForAlert, projFRS55;

    if (ca >= 55) {
      const past55FRS = Math.round(RETIREMENT_SUMS_2026.FRS / Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, ca - 55)));
      projFRS55 = past55FRS;
      const pa_alert = Number(debouncedInputs.payoutAge) || 65;
      const paRow = projectionByAge.get(pa_alert);              // E4 fix: always nominal — accumulationByAge is deflated when isRealDollars=true, causing gap to be computed against deflated RA vs nominal FRS
      raForAlert = paRow ? (paRow.ra || 0) : (Number(debouncedInputs.saBalance) || 0);
    } else {
      const yt55 = Math.max(0, (cy + Math.max(0, 55 - ca)) - 2026);
      projFRS55 = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, yt55));
      const frsRow55 = projectionByAge.get(55);                  // O(1) — was projection.find
      raForAlert = frsRow55 ? (frsRow55.ra || 0) : 0;
    }

    if (raForAlert >= projFRS55) return null;
    const frsGap = Math.max(0, projFRS55 - raForAlert);
    if (frsGap <= 0) return null;

    const pa = Number(debouncedInputs.payoutAge) || 65;
    const yearsToGo = ca >= 55 ? Math.max(1, pa - ca) : Math.max(1, 55 - ca);
    const r = 0.04;
    const fvAnnuityFactor = (Math.pow(1 + r, yearsToGo) - 1) / r;
    const annualTopUp = fvAnnuityFactor > 0 ? Math.round(frsGap / fvAnnuityFactor) : Math.round(frsGap / yearsToGo);
    const monthlyTopUp = Math.round(annualTopUp / 12);
    const isUrgent = yearsToGo <= 5;
    const currentVcSa = Number(debouncedInputs.vcSaTopup) || 0;
    const newTopUp = Math.round(currentVcSa + annualTopUp);
    const raLabel = ca >= 55 ? "Current RA" : "Projected RA at 55";
    const topupNote = ca >= 55
      ? "RSTU cash top-up to RA · credited directly · subject to ERS cap"
      : "RSTU SA/RA cash top-up · compounds at 4% p.a.";
    return { raForAlert, projFRS55, frsGap, annualTopUp, monthlyTopUp,
             yearsToGo, isUrgent, currentVcSa, newTopUp, raLabel, topupNote };
  }, [projection, projectionByAge, displayAccumulation, accumulationByAge, debouncedInputs.currentAge, debouncedInputs.currentYear,
      debouncedInputs.payoutAge, debouncedInputs.saBalance, debouncedInputs.vcSaTopup]);

  const monteCarloData = useMemo(() => {
    if (!showMonteCarlo) return null;
    const RUNS = 200; // reduced from 500 — still robust for P10/P50/P90
    const pa = Number(debouncedInputs.payoutAge) || 65;
    const ca = Number(debouncedInputs.currentAge) || 35;
    const ageTotals = {};
    for (let age = ca; age <= pa; age++) ageTotals[age] = [];
    const mcVar = Math.max(0.1, Number(debouncedInputs.mcVariancePct) || 1); // Rev #MC: user-controlled band
    for (let run = 0; run < RUNS; run++) {
      const _inflBand = (mcVar / 100) / 2;
      const mcInflRate = (Number(debouncedInputs.inflationRate) || 2) / 100 + (Math.random() * _inflBand * 2 - _inflBand);
      const mcRows = runProjectionEngine(debouncedInputs, { maxAge: pa, randomiseRates: true, mcVariance: mcVar });
      for (const row of mcRows) {
        if (ageTotals[row.age] !== undefined) {
          // Deflate by this run's inflation so MC bands reflect real-dollar uncertainty
          const real = row.total / Math.pow(1 + mcInflRate, Math.max(0, row.age - ca));
          ageTotals[row.age].push(isRealDollars ? real : row.total);
        }
      }
    }
    const rows = Object.entries(ageTotals).map(([age, vals]) => {
      vals.sort((a, b) => a - b);
      const p = pct => vals[Math.floor(pct * vals.length)] || 0;
      return { age: Number(age), p10: p(0.10), p50: p(0.50), p90: p(0.90), allVals: vals };
    });
    const payoutRow = rows.find(r => r.age === pa);
    const yrsToPFRS = Math.max(0, pa - ca);
    const frsAtPayout = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100,
      Math.max(0, (Number(debouncedInputs.currentYear) || 2026) + yrsToPFRS - 2026)));
    const probSufficiency = payoutRow
      ? Math.round((payoutRow.allVals.filter(v => v >= frsAtPayout).length / payoutRow.allVals.length) * 100)
      : null;
    return { rows: rows.map(({ allVals: _, ...r }) => r), probSufficiency, frsAtPayout };
  }, [showMonteCarlo, debouncedInputs]);

  // Baseline projection — mandatory contributions only, all voluntary inputs zeroed.
  // Used as a dashed ghost line on the Accumulation chart to show how much voluntary
  // top-ups, transfers, and grants are contributing above the mandatory floor.
  const baselineProjection = useMemo(() => {
    if (!showBaseline) return null;
    const pa = Number(debouncedInputs.payoutAge) || 65;
    const baselineInputs = {
      ...debouncedInputs,
      // Zero all voluntary inflows
      vc3aCash: 0, vcSaTopup: 0, vcVhr: 0, vcMaCash: 0,
      annualGovGrant: 0, mrssGrant: 0, mmssGrant: 0, wisAmount: 0,
      // Zero all CPF transfers
      oaToSaTransfer: 0, oaToMaTransfer: 0,
      // Zero CPFIS
      cpfisOaAmount: 0, cpfisSaAmount: 0,
      // Zero OA drawdown (decumulation strategy irrelevant for baseline)
      oaDrawdownMonthly: 0,
    };
    const rows = runProjectionEngine(baselineInputs, { maxAge: pa });
    if (isRealDollars) {
      const ca = Number(debouncedInputs.currentAge) || 35;
      const inflRate = (Number(debouncedInputs.inflationRate) || 2) / 100;
      return rows.map(r => ({ age: r.age, baselineTotal: Math.round(r.total / Math.pow(1 + inflRate, Math.max(0, r.age - ca))) }));
    }
    return rows.map(r => ({ age: r.age, baselineTotal: r.total }));
  }, [showBaseline, debouncedInputs, isRealDollars]);

  const whatIfProjection = useMemo(() => {
    if (!showWhatIf) return null;
    // NX8 fix: use debouncedInputs (not live inputs) so the What-If baseline stays in sync
    // with the main projection — previously the 180ms debounce window caused the What-If
    // chart to show new input values against a stale main projection baseline.
    const effPA  = whatIfPayoutAge   !== null ? whatIfPayoutAge   : (Number(debouncedInputs.payoutAge) || 65);
    const effST  = whatIfSaTopup     !== null ? whatIfSaTopup     : (Number(debouncedInputs.vcSaTopup) || 0);
    const effH   = whatIfHousing     !== null ? whatIfHousing     : (Number(debouncedInputs.housingOutflow) || 0);
    const effSB  = whatIfSalaryBump  !== null ? whatIfSalaryBump  : 0;
    const effCS  = whatIfContribStop !== null ? whatIfContribStop : (Number(debouncedInputs.contributionStopAge) || 65);
    const effOAD = whatIfOaDrawdown  !== null ? whatIfOaDrawdown  : (Number(debouncedInputs.oaDrawdownMonthly) || 0);
    const effSRS = whatIfSrsContrib  !== null ? whatIfSrsContrib  : (Number(debouncedInputs.srsAnnualContribution) || 0);
    const effPG  = whatIfPrivGrowth  !== null ? whatIfPrivGrowth  : (Number(debouncedInputs.privateAssetGrowthRate) || 0);
    const rows = runProjectionEngine(debouncedInputs, {
      maxAge: effPA,
      overrideVcSA: effST,
      overrideHousingOutflow: effH,
      overrideSalaryBump: effSB,
      overrideContribStop: effCS,
      overrideOaDrawdownMonthly: effOAD,
      overrideSrsContrib: effSRS,
      overridePrivGrowthRate: effPG,
    });
    return { rows, effPA, effST, effH, effSB, effCS, effOAD, effSRS, effPG };
  }, [showWhatIf, whatIfPayoutAge, whatIfSaTopup, whatIfHousing, whatIfSalaryBump,
      whatIfContribStop, whatIfOaDrawdown, whatIfSrsContrib, whatIfPrivGrowth,
      debouncedInputs]);

  const comparisonData = useMemo(() => {
    // Helper: compute net worth series from a scenario object
    // Supports both new format (has payoutProj) and old format (only projection)
    const getNetWorth = (scenario, age) => {
      if (!scenario) return undefined;
      // New format: payoutProj has standardTotal/basicTotal etc.
      if (scenario.payoutProj?.length) {
        const pm = scenario.payoutProj.find(d => d.age === age);
        if (pm) return pm[`${highlightPlan}Total`] ?? pm.standardTotal;
      }
      // Old format fallback: estimate net worth as accumulation total + cumulative payout estimate
      const am = scenario.projection?.find(d => d.age === age);
      if (!am) return undefined;
      const pa = Number(scenario.inputs?.payoutAge) || 65;
      const raRow = scenario.projection?.find(d => d.age === pa);
      const raAtPa = raRow?.ra || 0;
      // BUG-19 fix: at payout age, CPF Board transfers 20% of RA to OA before LIFE payouts begin.
      // Ignoring this overstates LIFE payouts (higher raAtPa → higher interpolated monthly).
      const raForLife = Math.round(raAtPa * 0.8);       // RA remaining after 20% transfer
      const oaFromTransfer = Math.round(raAtPa * 0.2);  // 20% lump-sum credited to OA
      // Approximate monthly payout using CPF Estimator lookup (male baseline) on corrected RA
      const monthlyEst = interpolateCpfLife(raForLife, 'std', scenario.inputs?.isMale !== false);
      // Cumulative payout since payout age
      const yearsInPayout = Math.max(0, age - pa);
      const cumPayout = age >= pa ? monthlyEst * 12 * yearsInPayout : 0;
      // Include one-time OA top-up from the 20% transfer in the net worth at and after payout age
      const oaBonus = age >= pa ? oaFromTransfer : 0;
      return (am.total || 0) + cumPayout + oaBonus;
    };

    let data = [];
    const startA = scenarioA?.projection?.[0]?.age ?? 35;
    const startB = scenarioB?.projection?.[0]?.age ?? 35;
    const startAge = Math.min(startA, startB, 35);
    for (let age = startAge; age <= 95; age++) {
      const yA = getNetWorth(scenarioA, age);
      const yB = getNetWorth(scenarioB, age);
      if (yA != null || yB != null) {
        const row = { age };
        if (yA != null) row.yieldA = yA;
        if (yB != null) row.yieldB = yB;
        data.push(row);
      }
    }
    return data;
  }, [scenarioA, scenarioB, highlightPlan]);

  // BUG-09 fix: use payoutAge65 (debounced) instead of live inputs.payoutAge so intersection
  // ages are always computed against the same debounced payoutProjection they filter.
  const intersectionEscVsStd = useMemo(() => { const m = payoutProjection.find(d => d.age > payoutAge65 && d.escalatingTotal > d.standardTotal); return m ? m.age : null; }, [payoutProjection, payoutAge65]);
  const intersectionStdVsBasic = useMemo(() => { const m = payoutProjection.find(d => d.age > payoutAge65 && d.standardTotal > d.basicTotal); return m ? m.age : null; }, [payoutProjection, payoutAge65]);
  const intersectionEscVsBasic = useMemo(() => { const m = payoutProjection.find(d => d.age > payoutAge65 && d.escalatingTotal > d.basicTotal); return m ? m.age : null; }, [payoutProjection, payoutAge65]);
  const intersectionEscPayVsStdPay = useMemo(() => { const m = payoutProjection.find(d => d.age > payoutAge65 && d.escalatingMonthly > d.standardMonthly); return m ? m.age : null; }, [payoutProjection, payoutAge65]);

  const sensitivityData = useMemo(() => {
    // CQ-2: loop logic extracted to module-level computeSensitivityRow — see its definition
    // above computeBasicPlanYearPayout. Each pAge row: look up projected RA, apply the
    // standard 20% OA-transfer deduction (mirrors payoutProjection lines ~3047–3052),
    // then delegate to the pure helper. deps unchanged.
    const pAs = [65, 66, 67, 68, 69, 70];
    const isMaleSens = debouncedInputs.isMale !== false; // N6 fix: use debouncedInputs.isMale
    return pAs.map(pAge => {
      const raRow = projectionByAge.get(pAge);
      if (!raRow) return { pAge, stdMonthly: 0, escMonthly: 0, basMonthly: 0, escVsStd: null, stdVsBasic: null, escVsBasic: null };
      const raVal = raRow.ra || 0;
      // E2 fix: apply the same 20% RA-to-OA transfer deduction used by lifePlans and payoutProjection.
      const raTransferBaseSens  = Math.max(0, raVal - (raRow.cumRaCashTopUps || 0) - (raRow.cumRaInterest || 0));
      const raOaTransferSens    = Math.round(raTransferBaseSens * 0.20);
      const raAfterTransferSens = Math.max(0, raVal - raOaTransferSens);
      return computeSensitivityRow(pAge, raAfterTransferSens, isMaleSens, basicPremiumPct);
    });
  }, [projection, projectionByAge, basicPremiumPct, debouncedInputs.isMale]);

  // R7: formatCurrency hoisted to module level

  const milestones = useMemo(() => {
    // NX9 fix: use debouncedInputs for all scalar reads so milestones never compute
    // against old projection rows mixed with live (180ms-ahead) input scalars.
    const alerts = []; const payoutAge = Number(debouncedInputs.payoutAge) || 65; const ca = Number(debouncedInputs.currentAge) || 35; const cy = Number(debouncedInputs.currentYear) || 2026;
    if (!projection || projection.length === 0) return alerts;
    const projFRS = age => Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (cy + (age - ca)) - 2026)));
    const projERS = age => Math.round(RETIREMENT_SUMS_2026.ERS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (cy + (age - ca)) - 2026)));
    const projBRS = age => Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (cy + (age - ca)) - 2026)));
    for (let i = 0; i < projection.length - 1; i++) { const row = projection[i]; const next = projection[i + 1]; if (row.age < 55 && row.sa < projFRS(row.age) && next.sa >= projFRS(next.age)) { alerts.push({ age: next.age, type: "success", label: "SA hits Full Retirement Sum", detail: `SA balance reaches the projected FRS of $${Math.round(projFRS(next.age) / 1000)}k at age ${next.age}.` }); break; } }
    for (let i = 0; i < projection.length - 1; i++) { const row = projection[i]; const next = projection[i + 1]; if (row.age < 55 && row.sa < projERS(row.age) && next.sa >= projERS(next.age)) { alerts.push({ age: next.age, type: "gold", label: "SA hits Enhanced Retirement Sum", detail: `SA balance reaches the projected ERS of $${Math.round(projERS(next.age) / 1000)}k at age ${next.age}. Maximum CPF LIFE payout unlocked.` }); break; } }
    for (let i = 0; i < projection.length - 1; i++) { const row = projection[i]; const next = projection[i + 1]; if (row.age < payoutAge && row.oa > 0 && next.oa === 0) { alerts.push({ age: next.age, type: "warning", label: "OA balance depleted", detail: `Ordinary Account reaches $0 at age ${next.age}. Housing outflows have fully drained OA. Consider reducing CPF housing payments.` }); break; } }
    // MA depletion milestone — fires when MediSave hits $0 at any age.
    // This can happen when medical inflation (default 5%/yr) outpaces BHS growth (3%/yr),
    // or when high MediShield/ElderShield premiums are modelled over many years.
    // Actionable: user can reduce medical spend assumptions or increase VCMA top-ups.
    for (let i = 0; i < projection.length - 1; i++) {
      const row = projection[i]; const next = projection[i + 1];
      if (row.ma > 0 && next.ma === 0) {
        const isRetired = next.age >= payoutAge;
        alerts.push({
          age: next.age,
          type: "danger",
          label: "MediSave balance depleted",
          detail: `MA reaches $0 at age ${next.age}${isRetired ? " (retirement phase)" : ""}. Medical premiums and outflows exceed MA inflows. Consider increasing VCMA top-ups, reducing MediShield IP tier, or adjusting the medical inflation assumption.`
        });
        break;
      }
    }
    // Post-payout OA drawdown exhaustion milestone (uses effective values — respects DwZ auto-draw)
    const oaDrawStartM = effectiveOaDrawStartAge;
    const oaDrawAmtM   = effectiveOaDrawMonthly;
    const oaFloorM     = effectiveOaDrawFloor;
    if (oaDrawStartM > 0 && oaDrawAmtM > 0) {
      for (let i = 0; i < projection.length - 1; i++) {
        const row = projection[i]; const next = projection[i + 1];
        if (row.age >= oaDrawStartM && row.oa > oaFloorM && next.oa <= oaFloorM) {
          alerts.push({ age: next.age, type: "warning", label: "OA Drawdown exhausted", detail: `OA balance reaches the bequest floor (${formatCurrency(oaFloorM)}) at age ${next.age}. Monthly OA draw of ${formatCurrency(oaDrawAmtM)}/mo stops. Consider reducing the draw amount or lowering the floor.` });
          break;
        }
      }
    }

    const row55 = projectionByAge.get(55); // R3: removed 13 stale blank lines
    if (row55 && (row55.sa + row55.ra) < projBRS(55)) alerts.push({ age: 55, type: "danger", label: "RA below Basic Retirement Sum at 55", detail: `Projected RA at age 55 is $${Math.round((row55.sa + row55.ra) / 1000)}k, below the BRS of $${Math.round(projBRS(55) / 1000)}k.` });
    // #3 Property sale milestone
    const sPA = Number(debouncedInputs.sellPropertyAge) || 0;
    if (sPA > 0 && sPA >= Number(debouncedInputs.currentAge)) {
      // ENG-1 fix: use cumHousingFV from the projection row at (sPA - 1) — this is the exact
      // future value of all OA housing withdrawals compounded at 2.5%/yr from each withdrawal date,
      // matching the engine's own refund calculation. The old estimate (estHousing2 * 1.025^N) treated
      // all withdrawals as a single day-one lump sum and consistently overstated the refund.
      const sellRow = projectionByAge.get(sPA - 1) || projection[0];
      const exactRefund = sellRow?.cumHousingFV || 0;
      const pledgeNote2 = debouncedInputs.usePropertyPledge ? " Pledge active: refund restores RA to FRS first; surplus stays in OA." : " Refund credited to OA.";
      const refundDisplay = exactRefund > 0
        ? `~${formatCurrency(exactRefund)} (OA housing principal + 2.5%/yr accrued interest, exact per-withdrawal compounding)`
        : "minimal (no OA housing withdrawals projected before sale)";
      alerts.push({ age: sPA, type: "teal", label: "Property Sale & CPF Refund", detail: `Property sold at age ${sPA}. Estimated CPF refund ${refundDisplay}.${pledgeNote2}` });
    }
    return alerts.sort((a, b) => a.age - b.age);
  }, [projection, projectionByAge, debouncedInputs, effectiveOaDrawStartAge, effectiveOaDrawMonthly, effectiveOaDrawFloor]);

  // R8: computeXIRR hoisted to module level

  // Per-age XIRR for all three plans — lazy: only computed when Data Table tab is active.
  // Skipping on other tabs eliminates ~540k float ops per input change (90 NR calls x 100
  // iterations x ~60 cashflows each). CSV export also lives in the table tab, so xirrByAge
  // is always populated when the user clicks Download CSV.
  const xirrByAge = useMemo(() => {
    if (activeTab !== "table") return {}; // bail immediately on all other tabs
    const pa = payoutAge65; // use debounced value — matches projection/payoutProjection which are also debounced
    const ca = Number(debouncedInputs.currentAge) || 35;
    const result = { standard: {}, escalating: {}, basic: {} };
    // Pre-build contribution outflows once
    const contribFlows = projection
      .filter(r => r.injected > 0)
      .map(r => ({ t: r.age - ca, v: -(r.injected) }));
    // Pre-index payout rows for O(1) lookup
    const ppByAge = {};
    for (const d of payoutProjection) ppByAge[d.age] = d;
    // Pre-slice payout rows from pa — avoids O(n) filter per age
    const payoutRows = payoutProjection.filter(d => d.age >= pa);
    const cumFlows = { standard: [], escalating: [], basic: [] };
    for (const d of payoutRows) {
      for (const plan of ['standard', 'escalating', 'basic']) {
        cumFlows[plan].push({ t: d.age - ca, v: d[`${plan}Annual`] || 0 });
      }
    }
    for (const row of projection) {
      if (row.age < pa) continue;
      const pp = ppByAge[row.age];
      if (!pp) continue;
      const idx = row.age - pa;
      for (const plan of ['standard', 'escalating', 'basic']) {
        const payoutFlows = cumFlows[plan].slice(0, idx + 1);
        const terminalFlow = { t: row.age - ca, v: pp[`${plan}Bequest`] || 0 };
        const xirr = computeXIRR([...contribFlows, ...payoutFlows, terminalFlow]);
        result[plan][row.age] = xirr !== null ? Math.max(-0.10, Math.min(0.10, xirr)) * 100 : null;
      }
    }
    return result;
  }, [activeTab, projection, payoutProjection, payoutAge65, debouncedInputs.currentAge]);

  // BUG-10 fix: use payoutAge65 (debounced) so payoutAgeData matches the debounced displayAccumulation.
  const payoutAgeData = displayAccumulation.find(d => d.age === payoutAge65) || {};
  const totalCpfAtPayout = (payoutAgeData.oa || 0) + (payoutAgeData.sa || 0) + (payoutAgeData.ma || 0) + (payoutAgeData.ra || 0);

  // ── Strategy Chart Data (age 65→95, monthly income streams) ────────────────
  const strategyChartData = useMemo(() => {
    // BUG-46 fix: use payoutAge65 (debounced) so chart doesn't stutter during the 180ms debounce window
    const pa = payoutAge65;
    const srsStart = Math.max(Number(debouncedInputs.srsDrawdownStartAge) || 63, 63);
    const srsYears = Math.min(Math.max(Number(debouncedInputs.srsDrawdownYears) || 10, 1), 10);
    const oaDrawStart   = effectiveOaDrawStartAge;
    const oaDrawMonthly = effectiveOaDrawMonthly;
    const oaFloor       = effectiveOaDrawFloor;
    const propMonAge = Number(debouncedInputs.propMonetiseAge) || 65;
    const propMonCash = Number(debouncedInputs.propMonetiseCashProceeds) || 0;
    const propEnabled = debouncedInputs.propMonetiseEnabled === true;

    // Pre-compute SRS annual draw from projection (first year of drawdown balance / years)
    // P2-A fix: use displayAccumulation so Real Dollars toggle is respected
    const srsRowAtStart = accumulationByAge.get(srsStart);
    const srsBalAtStart = srsRowAtStart?.srsBalance || 0;
    // NX5 fix: mirror the PMT formula used in the engine so displayed draw matches projection
    const srsRateDisp = (Number(debouncedInputs.srsReturnRate) || 0) / 100;
    const srsAnnualDraw = srsYears > 0
      ? (srsRateDisp > 0
          ? Math.round(srsBalAtStart * srsRateDisp / (1 - Math.pow(1 + srsRateDisp, -srsYears)))
          : Math.round(srsBalAtStart / srsYears))
      : srsBalAtStart;
    const srsMonthlyDraw = Math.round(srsAnnualDraw / 12);

    const data = [];
    for (let age = pa; age <= 95; age++) {
      // BUG-13 fix: use O(1) Map lookups instead of O(n) .find() inside the loop
      const ppRow   = payoutByAge.get(age)        || {};
      const projRow = accumulationByAge.get(age)  || {};
      const prevProjRow = accumulationByAge.get(age - 1) || {};

      // CPF LIFE — use the active highlighted plan
      const cpfLife = ppRow[`${highlightPlan}Monthly`] || 0;

      // OA Drawdown — active during draw window; check OA floor via projection
      let oaDraw = 0;
      if (oaDrawStart > 0 && oaDrawMonthly > 0 && age >= oaDrawStart) {
        const oaBal = projRow.oa || 0;
        if (oaBal > oaFloor) oaDraw = Math.min(oaDrawMonthly, Math.max(0, Math.round((oaBal - oaFloor) / 12)));
        oaDraw = Math.min(oaDraw, oaDrawMonthly);
      }

      // SRS drawdown
      let srs = 0;
      if (age >= srsStart && age < srsStart + srsYears && srsMonthlyDraw > 0) {
        srs = srsMonthlyDraw;
      }

      // Private Assets drawdown delta — month-over-month change (P2-A: use displayAccumulation)
      const paPriv = projRow.privateAssets || 0;
      const prevPriv = prevProjRow.privateAssets || paPriv;
      const privateDrawdown = Math.max(0, Math.round((prevPriv - paPriv) / 12));

      // Property Monetisation — one-time cash event spread over the year
      const propMon = (propEnabled && age === propMonAge && propMonCash > 0) ? Math.round(propMonCash / 12) : 0;

      const totalMonthly = cpfLife + oaDraw + srs + privateDrawdown + propMon;

      data.push({ age, cpfLife, oaDraw, srs, privateAsset: privateDrawdown, propMon, totalMonthly });
    }
    return data;
  // BUG-13+46 fix: deps updated — use payoutAge65 (debounced), add accumulationByAge + payoutByAge Maps (O(1) lookups),
  // replace live inputs.* with debouncedInputs.* for SRS/property fields.
  }, [displayProjection, displayAccumulation, accumulationByAge, payoutByAge, isRealDollars, payoutAge65,
    debouncedInputs.srsDrawdownStartAge, debouncedInputs.srsDrawdownYears,
    effectiveOaDrawStartAge, effectiveOaDrawMonthly, effectiveOaDrawFloor,
    debouncedInputs.propMonetiseEnabled, debouncedInputs.propMonetiseAge, debouncedInputs.propMonetiseCashProceeds,
    debouncedInputs.srsReturnRate, highlightPlan]);

  // OA Exhaustion Age: first projection age where OA balance falls to/below the bequest floor
  // during the drawdown window. null = OA sustains to age 95 (or drawdown not active).
  const oaExhaustAge = useMemo(() => {
    const drawStart   = effectiveOaDrawStartAge;
    const drawMonthly = effectiveOaDrawMonthly;
    const floor       = effectiveOaDrawFloor;
    if (drawStart <= 0 || drawMonthly <= 0) return null;
    for (const row of projection) {
      if (row.age >= drawStart && row.oa <= floor) return row.age;
    }
    return null;
  }, [projection, effectiveOaDrawStartAge, effectiveOaDrawMonthly, effectiveOaDrawFloor]);

  const generatePDF = async (orientOverride) => {
    setIsGeneratingPdf(true);
    // Safety timeout — clear flag after 30s even if generation hangs
    const pdfTimeout = setTimeout(() => {
      setIsGeneratingPdf(false);
      showToast("⚠️ PDF generation timed out — try again");
    }, 30000);
    try {
      const pa = Number(inputs.payoutAge) || 65;
      const ca = Number(inputs.currentAge) || 35;
      const cy = Number(inputs.currentYear) || 2026;
      const fc = n => "$" + Math.round(n || 0).toLocaleString();
      const pRow = accumulationByAge.get(pa) || {};    // O(1) — was displayAccumulation.find
      const ppRow = payoutByAge.get(pa) || {};         // O(1) — was payoutProjection.find
      const nwPayout = ppRow[`${highlightPlan}NetWorth`] || 0;
      const nwAt95 = payoutProjection.find(d => d.age === 95)?.[`${highlightPlan}NetWorth`] || 0;
      const totalCpf = (pRow.oa || 0) + (pRow.sa || 0) + (pRow.ma || 0) + (pRow.ra || 0);
      const dateStr = new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" });
      const stdMonthly = Math.round(lifePlans.standard.start);
      const escMonthly = Math.round(lifePlans.escalating.start);
      const basMonthly = Math.round(lifePlans.basic.start);
      const memberType = isSelfEmployed ? "Self-Employed" : "Employed";
      const genderLabel = inputs.isMale !== false ? "Male" : "Female";
      const dollarMode = isRealDollars ? "Real Dollars" : "Nominal Dollars";

      // Year-by-year rows (every 5 years + payout age)
      // Pre-build local Map so .map() below is O(1) per row, not O(n) payoutProjection.find
      const ppByAgePdf = new Map(payoutProjection.map(d => [d.age, d]));
      const projRowsData = projection.filter(r => r.age % 5 === 0 || r.age === pa || r.age === ca).map(r => {
        const ppR = ppByAgePdf.get(r.age) || {};
        const rowTotal = (r.oa || 0) + (r.sa || 0) + (r.ma || 0) + (r.ra || 0);
        const nw = ppR[`${highlightPlan}NetWorth`] || rowTotal + (inputs.includeProperty ? r.propertyValue : 0);
        return `<tr style="background:${r.age === pa ? "#e8f5e9" : ""}">
          <td style="font-weight:700">${r.age}</td>
          <td>${fc(r.oa)}</td>
          <td>${fc(r.sa)}</td>
          <td>${fc(r.ma)}</td>
          <td>${fc(r.ra)}</td>
          <td style="font-weight:700;color:#0369a1">${fc(rowTotal)}</td>
          <td style="font-weight:700;color:#047857">${fc(nw)}</td>
        </tr>`;
      }).join("");

      // Sensitivity analysis: housing outflow rows × SA top-up columns
      const baseH = Number(inputs.housingOutflow) || 0;
      const baseSATopup = Number(inputs.vcSaTopup) || 0;
      const hRows = [Math.max(0, baseH - 6000), Math.max(0, baseH - 3000), baseH, baseH + 3000, baseH + 6000];
      const saTopupCols = [Math.max(0, baseSATopup - 4000), Math.max(0, baseSATopup - 2000), baseSATopup, baseSATopup + 2000, baseSATopup + 4000];
      const calcTotalAtPA = (hOut, saTop) => {
        // Use debouncedInputs (same source as main projection) for strict consistency
        const rows = runProjectionEngine(debouncedInputs, {
          overrideVcSA: saTop,
          overrideHousingOutflow: hOut,
          overrideContribStop: Number(debouncedInputs.contributionStopAge) || 65,
          maxAge: pa,
        });
        const last = rows.find(r => r.age === pa) || rows[rows.length - 1];
        return last ? last.total : 0;
      };
      const baseTotal = calcTotalAtPA(baseH, baseSATopup);
      // Q3 fix: yield after EVERY sensitivity cell (batch size 1) so the browser
      // gets a paint opportunity between each of the 25 engine calls. Previously
      // SENS_BATCH=5 meant 5 synchronous engine calls (~100-150ms) before each yield,
      // causing perceptible jank on mobile. With batch=1 the UI stays responsive.
      showToast("⏳ Building PDF — computing sensitivity tables...");
      const sensCache = new Map();
      const allParams = [...hRows.flatMap(h => saTopupCols.map(s => [h, s]))];
      const SENS_BATCH = 1; // Q3 fix: was 5 — yield after every single cell
      for (let _bi = 0; _bi < allParams.length; _bi += SENS_BATCH) {
        const batch = allParams.slice(_bi, _bi + SENS_BATCH);
        batch.forEach(([h, s]) => { const key = `${h}_${s}`; if (!sensCache.has(key)) sensCache.set(key, calcTotalAtPA(h, s)); });
        await new Promise(r => setTimeout(r, 0)); // yield to browser after every cell
      }
      const sensRows = hRows.map(h => {
        const cells = saTopupCols.map(s => {
          const val = sensCache.get(`${h}_${s}`) || 0;
          const isBase = h === baseH && s === baseSATopup;
          return `<td style="text-align:right;font-weight:${isBase ? "900" : "400"};background:${isBase ? "#dcfce7" : ""};color:${isBase ? "#166534" : ""};padding:5px 8px">${fc(val)}</td>`;
        }).join("");
        return `<tr><td style="padding:5px 8px;font-weight:700">${fc(h)}</td>${cells}</tr>`;
      }).join("");

      // Milestone rows
      const msRows = milestones.map(m => `<tr><td style="padding:5px 8px;font-weight:700">${m.age}</td><td style="padding:5px 8px">${m.label}</td><td style="padding:5px 8px;color:#475569">${m.detail}</td></tr>`).join("");

      // Payout-age sensitivity: 6 engine runs pre-computed here (async, yielding after every call)
      // so the template literal below can simply reference payAgeSensHtml as a plain string.
      const isMalePdf = inputs.isMale !== false;
      let payAgeSensRows = '';
      const pAges = [65, 66, 67, 68, 69, 70];
      for (let _pi = 0; _pi < pAges.length; _pi++) {
        const testPA = pAges[_pi];
        const testRows = runProjectionEngine(debouncedInputs, { maxAge: testPA, overrideContribStop: Number(debouncedInputs.contributionStopAge) || 65 });
        const raRow = testRows.find(r => r.age === testPA) || testRows[testRows.length - 1];
        const ra = raRow?.ra || 0;
        const stdM = Math.round(interpolateCpfLife(ra, 'std', isMalePdf));
        const escM = Math.round(interpolateCpfLife(ra, 'esc', isMalePdf));
        const basM = Math.round(interpolateCpfLife(ra, 'bas', isMalePdf));
        const isCurrent = testPA === pa;
        payAgeSensRows += `<tr style="background:${isCurrent ? "#dcfce7" : ""}"><td style="font-weight:${isCurrent ? "900" : "400"};color:${isCurrent ? "#166534" : ""}">${testPA}${isCurrent ? " ◄" : ""}</td><td style="text-align:right">${fc(stdM)}/mo</td><td style="text-align:right;color:#059669">${fc(escM)}/mo</td><td style="text-align:right;color:#b45309">${fc(basM)}/mo</td></tr>`;
        await new Promise(r => setTimeout(r, 0)); // Q3 fix: yield after every call (was every 2)
      }
      const payAgeSensHtml = `
<h2 style="margin-top:12px">Payout Age Sensitivity — Monthly Starting Payouts</h2>
<p style="font-size:8px;color:#64748b;margin-bottom:6px">Each row shows estimated monthly payouts based on 2026 CPF Board data, interpolated from the official CPF LIFE Estimator. Deferral gain comes from RA growth during additional contribution years. Green row = your selected payout age.</p>
<table><thead><tr><th>Payout Age</th><th style="text-align:right">Standard</th><th style="text-align:right;color:#059669">Escalating</th><th style="text-align:right;color:#b45309">Basic</th></tr></thead>
<tbody>${payAgeSensRows}</tbody></table>`;

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="color-scheme" content="light only"/><style>:root{color-scheme:light only}html,body{background:#fff!important}</style><title>CPF Retirement Report — ${inputs.name}</title>
<style>
  @page{size:A4 ${orientOverride || pdfOrientation};margin:${(orientOverride || pdfOrientation) === "landscape" ? "12mm 15mm" : "15mm 12mm"}}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  html,body{background:#ffffff !important;color:#0f172a !important;}
  @media print{
    @page{size:A4 ${orientOverride || pdfOrientation};margin:${(orientOverride || pdfOrientation) === "landscape" ? "12mm 15mm" : "15mm 12mm"}}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page-break{page-break-before:always;break-before:page;}
  }
  /* Force orientation via print stylesheet — Chrome respects this form */
  @media print{html{width:${(orientOverride || pdfOrientation) === "landscape" ? "277mm" : "190mm"}}}
  body{font-family:Arial,sans-serif;font-size:10px;color:#0f172a;background:#ffffff !important;margin:0;padding:${(orientOverride || pdfOrientation) === "landscape" ? "6mm 12mm" : "8mm 10mm"};-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  /* Force browser to respect orientation by setting explicit page size */
  html{width:${(orientOverride || pdfOrientation) === "landscape" ? "297mm" : "210mm"};max-width:${(orientOverride || pdfOrientation) === "landscape" ? "297mm" : "210mm"}}
  h1{font-size:18px;font-weight:900;color:#0f172a;margin:0 0 4px}
  h2{font-size:13px;font-weight:800;color:#1e3a5f;margin:14px 0 6px;border-bottom:2px solid #0f172a;padding-bottom:4px;text-transform:uppercase;letter-spacing:0.05em}
  h3{font-size:11px;font-weight:700;color:#334155;margin:10px 0 4px}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  th{background:#0f172a;color:#fff;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.04em}
  td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
  .kpi-label{font-size:8px;font-weight:900;text-transform:uppercase;color:#64748b;margin-bottom:4px}
  .kpi-value{font-size:16px;font-weight:900}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
  .row-kv{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:9.5px}
  .row-kv:last-child{border-bottom:none}
  .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:8px;font-weight:800;text-transform:uppercase}
  .page-break{page-break-before:always}
  @media print{.page-break{page-break-before:always}}
</style>
</head><body>

<!-- PAGE 1: COVER -->
<div style="text-align:center;padding:20px 0 10px">
  <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#64748b;margin-bottom:8px">CPF RETIREMENT PLANNER PRO &middot; RETIREMENT ENGINE V2026</div>
  <h1 style="font-size:22px;margin-bottom:6px">Retirement Projection Report</h1>
  <p style="color:#64748b;font-size:11px;margin:0"><strong>${inputs.name}</strong> &middot; Current Age ${ca} &middot; Payout Age ${pa} &middot; ${dollarMode} &middot; ${memberType}</p>
  <p style="color:#94a3b8;font-size:9px;margin-top:6px">Generated on ${dateStr}</p>
</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Total CPF @ Age ${pa}</div><div class="kpi-value" style="color:#059669">${fc(totalCpf)}</div></div>
  <div class="kpi"><div class="kpi-label">Standard Monthly Payout</div><div class="kpi-value" style="color:#1d4ed8">${fc(stdMonthly)}/mo</div></div>
  <div class="kpi"><div class="kpi-label">Net Worth @ Age ${pa}</div><div class="kpi-value" style="color:#7c3aed">${fc(nwPayout)}</div></div>
  <div class="kpi"><div class="kpi-label">Net Worth @ Age 95</div><div class="kpi-value" style="color:#b45309">${fc(nwAt95)}</div></div>
</div>
<p style="font-size:8px;color:#94a3b8;text-align:center;margin-top:6px">For informational purposes only — not financial advice</p>

<!-- PAGE 2: INPUT PARAMETERS + RETIREMENT SUMMARY + CPF LIFE ESTIMATES -->
<div class="page-break">
<h2>Input Parameters</h2>
<div class="two-col">
  <div class="box">
    <h3>Profile</h3>
    <div class="row-kv"><span>Name</span><strong>${inputs.name}</strong></div>
    <div class="row-kv"><span>Member Type</span><strong>${memberType}</strong></div>
    <div class="row-kv"><span>Gender</span><strong>${genderLabel}</strong></div>
    ${inputs.oaWithdrawalAt55 > 0 ? `<div class="row-kv"><span>OA Withdrawal at 55</span><strong>${fc(inputs.oaWithdrawalAt55)}</strong></div>` : ''}
    ${inputs.usePropertyPledge ? `<div class="row-kv"><span>Property Pledge</span><strong>Yes (BRS target)</strong></div>` : ''}
    ${(Number(inputs.sellPropertyAge) || 0) > 0 ? `<div class="row-kv"><span>Sell Property at Age</span><strong>Age ${inputs.sellPropertyAge} — CPF OA refund + 2.5%/yr interest credited to OA${inputs.usePropertyPledge ? " (pledge: RA restored to FRS first)" : ""}</strong></div>` : ''}
    ${inputs.oaToSaTransfer > 0 ? `<div class="row-kv"><span>OA→SA Transfer/yr</span><strong>${fc(inputs.oaToSaTransfer)}</strong></div>` : ''}
    ${(() => { const _rstu = Number(inputs.vcSaTopup) || 0; const _ca = Number(inputs.currentAge) || 0; const _isSC = (inputs.citizenStatus === 'SC') || !inputs.citizenStatus; const _mrssAmt = _isSC && _rstu > 0 && (_ca >= 55 || !!inputs.isPwD) ? Math.min(_rstu, 2000) : 0; return _mrssAmt > 0 ? `<div class="row-kv"><span>Est. MRSS Grant/yr</span><strong>${fc(_mrssAmt)}</strong></div>` : ''; })()}
    <div class="row-kv"><span>Current Age</span><strong>${ca}</strong></div>
    <div class="row-kv"><span>Current Year</span><strong>${cy}</strong></div>
    <div class="row-kv"><span>Payout Age</span><strong>${pa}</strong></div>
    <div class="row-kv"><span>Contribution Stop Age</span><strong>${inputs.contributionStopAge}</strong></div>
    <div class="row-kv"><span>Housing Stop Age</span><strong>${inputs.housingStopAge}</strong></div>
  </div>
  <div class="box">
    <h3>CPF Balances &amp; Annual Flows</h3>
    <div class="row-kv"><span>OA Balance</span><strong>${fc(inputs.oaBalance)}</strong></div>
    <div class="row-kv"><span>${ca >= 55 ? "RA" : "SA"} Balance</span><strong>${fc(inputs.saBalance)}</strong></div>
    <div class="row-kv"><span>MA Balance</span><strong>${fc(inputs.maBalance)}</strong></div>
    <div class="row-kv"><span>Annual Inflow (OA+SA+MA)</span><strong>${fc((Number(inputs.empOaCont) || 0) + (Number(inputs.empSaCont) || 0) + (Number(inputs.empMaCont) || 0))}</strong></div>
    <div class="row-kv"><span>Annual Housing Outflow</span><strong>${fc(inputs.housingOutflow)}</strong></div>
    <div class="row-kv"><span>Annual VC Top-ups</span><strong>${fc((Number(inputs.vc3aCash) || 0) + (Number(inputs.vcSaTopup) || 0) + (Number(inputs.vcVhr) || 0))}</strong></div>
  </div>
</div>
<h2>Retirement Summary at Payout Age ${pa}</h2>
<div class="two-col">
  <div class="box">
    <div class="row-kv"><span>OA Balance</span><strong style="color:#2563eb">${fc(pRow.oa)}</strong></div>
    <div class="row-kv"><span>SA Balance (Closed at 55)</span><strong style="color:#64748b">${fc(pRow.sa || 0)}</strong></div>
    <div class="row-kv"><span>MA Balance</span><strong style="color:#7c3aed">${fc(pRow.ma)}</strong></div>
    <div class="row-kv"><span>RA Balance</span><strong style="color:#059669">${fc(pRow.ra)}</strong></div>
    <div class="row-kv"><span style="font-weight:800">Total CPF</span><strong style="color:#0369a1;font-size:12px">${fc(totalCpf)}</strong></div>
  </div>
  <div class="box">
    <div class="row-kv"><span>Cumulative Top-ups</span><strong>${fc(pRow.cumulativeInjected)}</strong></div>
    <div class="row-kv"><span>Cumulative Outflow</span><strong>${fc(pRow.cumulativeOutflow)}</strong></div>
    <div class="row-kv"><span>Cumulative Interest Earned</span><strong>${fc(pRow.cumulativeInterest)}</strong></div>
    <div class="row-kv"><span>Net Worth @ Payout Age</span><strong style="color:#7c3aed">${fc(nwPayout)}</strong></div>
  </div>
</div>
<h2>CPF LIFE Payout Estimates (Monthly, from Age ${pa})</h2>
<table><thead><tr><th>Plan</th><th>Monthly Payout</th><th>Annual Payout</th><th>Payout Type</th><th>Net Worth @ Age 95</th></tr></thead><tbody>
  <tr><td><strong>Standard Plan</strong></td><td>${fc(stdMonthly)}/mo</td><td>${fc(stdMonthly * 12)}/yr</td><td>Level payouts for life</td><td>${fc(payoutProjection.find(d => d.age === 95)?.standardNetWorth || 0)}</td></tr>
  <tr><td><strong>Escalating Plan</strong></td><td>${fc(escMonthly)}/mo</td><td>${fc(escMonthly * 12)}/yr</td><td>+2% per year escalation</td><td>${fc(payoutProjection.find(d => d.age === 95)?.escalatingNetWorth || 0)}</td></tr>
  <tr><td><strong>Basic Plan</strong></td><td>${fc(basMonthly)}/mo</td><td>${fc(basMonthly * 12)}/yr</td><td>RA drawdown to ~90, pool thereafter</td><td>${fc(payoutProjection.find(d => d.age === 95)?.basicNetWorth || 0)}</td></tr>
</tbody></table>
</div>

<!-- PAGE 3: CHARTS -->
<div class="page-break">
<h2>CPF Balance Accumulation Chart (Age ${ca} to 95)</h2>
${(() => {
          const chartRows = projection.filter(r => r.age % 5 === 0 || r.age === pa || r.age === ca);
          const maxTotal = Math.max(...chartRows.map(r => (r.oa || 0) + (r.sa || 0) + (r.ma || 0) + (r.ra || 0))) || 1;
          const W = 700, H = 200, PAD_L = 60, PAD_B = 30, PAD_T = 10, PAD_R = 10;
          const chartW = W - PAD_L - PAD_R;
          const chartH = H - PAD_T - PAD_B;
          const n = chartRows.length;
          const barW = Math.max(4, Math.floor(chartW / n) - 3);
          const fmt3 = v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v;
          const bars = chartRows.map((r, idx) => {
            const x = PAD_L + idx * (chartW / n) + (chartW / n - barW) / 2;
            const total = (r.oa || 0) + (r.sa || 0) + (r.ma || 0) + (r.ra || 0);
            const oaH = Math.round((r.oa || 0) / maxTotal * chartH);
            const saH = Math.round((r.sa || 0) / maxTotal * chartH);
            const maH = Math.round((r.ma || 0) / maxTotal * chartH);
            const raH = Math.round((r.ra || 0) / maxTotal * chartH);
            const y0 = PAD_T + chartH;
            const isPA = r.age === pa;
            return `<rect x="${x}" y="${y0 - oaH}" width="${barW}" height="${oaH}" fill="#3b82f6" opacity="0.85"/>
<rect x="${x}" y="${y0 - oaH - saH}" width="${barW}" height="${saH}" fill="#10b981" opacity="0.85"/>
<rect x="${x}" y="${y0 - oaH - saH - maH}" width="${barW}" height="${maH}" fill="#a855f7" opacity="0.85"/>
<rect x="${x}" y="${y0 - oaH - saH - maH - raH}" width="${barW}" height="${raH}" fill="#f59e0b" opacity="0.85"/>
${isPA ? `<line x1="${x + barW / 2}" y1="${PAD_T}" x2="${x + barW / 2}" y2="${y0}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>` : ''}
<text x="${x + barW / 2}" y="${y0 + 14}" text-anchor="middle" font-size="7" fill="#64748b">${r.age}</text>`;
          }).join('');
          const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => {
            const val = Math.round(t * maxTotal);
            const y = PAD_T + chartH - Math.round(t * chartH);
            return `<line x1="${PAD_L - 4}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/><text x="${PAD_L - 6}" y="${y + 3}" text-anchor="end" font-size="7" fill="#94a3b8">${fmt3(val)}</text>`;
          }).join('');
          return `<svg width="${W}" height="${H}" style="display:block;margin:8px 0;border:1px solid #e2e8f0;border-radius:6px;background:#fafafa">
${yTicks}${bars}
<text x="${PAD_L}" y="${PAD_T + chartH + 26}" font-size="7" fill="#94a3b8">Age</text>
</svg>
<div style="display:flex;gap:16px;font-size:8px;color:#64748b;margin-bottom:8px">
<span><rect width="10" height="10" fill="#3b82f6" style="display:inline-block;vertical-align:middle;margin-right:3px"></rect>OA</span>
<span><rect width="10" height="10" fill="#10b981" style="display:inline-block;vertical-align:middle;margin-right:3px"></rect>SA</span>
<span><rect width="10" height="10" fill="#a855f7" style="display:inline-block;vertical-align:middle;margin-right:3px"></rect>MA</span>
<span><rect width="10" height="10" fill="#f59e0b" style="display:inline-block;vertical-align:middle;margin-right:3px"></rect>RA</span>
<span style="color:#ef4444">&#9135; Payout Age ${pa}</span>
</div>`;
        })()}

<h2>CPF LIFE Payout Comparison Chart (Age ${pa} to 95)</h2>
${(() => {
          const lifeRows = payoutProjection.filter(r => r.age >= pa && r.age <= 95);
          if (lifeRows.length < 2) return '<p style="color:#94a3b8;font-size:9px">Insufficient data for chart.</p>';
          const maxY = Math.max(...lifeRows.map(r => Math.max(r.standardTotal || 0, r.escalatingTotal || 0, r.basicTotal || 0))) || 1;
          const W = 700, H = 180, PAD_L = 65, PAD_B = 28, PAD_T = 10, PAD_R = 10;
          const chartW = W - PAD_L - PAD_R;
          const chartH = H - PAD_T - PAD_B;
          const n = lifeRows.length;
          const xOf = idx => PAD_L + idx * (chartW / (n - 1));
          const yOf = val => PAD_T + chartH - Math.round((val / maxY) * chartH);
          const polyline = (key, color) => {
            const pts = lifeRows.map((r, i) => `${xOf(i)},${yOf(r[key] || 0)}`).join(' ');
            return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.9"/>`;
          };
          const fmt3 = v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v;
          const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => {
            const val = Math.round(t * maxY);
            const y = PAD_T + chartH - Math.round(t * chartH);
            return `<line x1="${PAD_L - 4}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/><text x="${PAD_L - 6}" y="${y + 3}" text-anchor="end" font-size="7" fill="#94a3b8">${fmt3(val)}</text>`;
          }).join('');
          const xTicks = lifeRows.filter((r, i) => i % Math.ceil(n / 10) === 0 || r.age === 95).map((r, _, arr) => {
            const idx = lifeRows.indexOf(r);
            return `<text x="${xOf(idx)}" y="${PAD_T + chartH + 14}" text-anchor="middle" font-size="7" fill="#94a3b8">${r.age}</text>`;
          }).join('');
          return `<svg width="${W}" height="${H}" style="display:block;margin:8px 0;border:1px solid #e2e8f0;border-radius:6px;background:#fafafa">
${yTicks}${xTicks}
${polyline('standardTotal', '#2563eb')}
${polyline('escalatingTotal', '#10b981')}
${polyline('basicTotal', '#f59e0b')}
</svg>
<div style="display:flex;gap:16px;font-size:8px;color:#64748b;margin-bottom:8px">
<span style="color:#2563eb">&#9644; Standard Plan</span>
<span style="color:#10b981">&#9644; Escalating Plan</span>
<span style="color:#f59e0b">&#9644; Basic Plan</span>
<span style="color:#94a3b8">(Cumulative Total Value = Payouts + Bequest)</span>
</div>`;
        })()}
${(() => {
          // Net Worth chart
          const nwRows = payoutProjection.filter(r => r.age >= pa && r.age <= 95);
          if (nwRows.length < 2) return '';
          const maxNW = Math.max(...nwRows.map(r => Math.max(r.standardNetWorth || 0, r.escalatingNetWorth || 0, r.basicNetWorth || 0))) || 1;
          const W2 = 700, H2 = 160, PL2 = 65, PB2 = 28, PT2 = 10, PR2 = 10;
          const cW2 = W2 - PL2 - PR2, cH2 = H2 - PT2 - PB2, n2 = nwRows.length;
          const xOf2 = idx => PL2 + idx * (cW2 / (n2 - 1));
          const yOf2 = val => PT2 + cH2 - Math.round((Math.max(0, val) / maxNW) * cH2);
          const fmt4 = v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(Math.round(v));
          const poly2 = (key, color) => { const pts = nwRows.map((r, i) => `${xOf2(i)},${yOf2(r[key] || 0)}`).join(' '); return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.9"/>`; };
          const yT2 = [0, 0.25, 0.5, 0.75, 1.0].map(t => { const val = Math.round(t * maxNW); const y = PT2 + cH2 - Math.round(t * cH2); return `<line x1="${PL2 - 4}" y1="${y}" x2="${W2 - PR2}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/><text x="${PL2 - 6}" y="${y + 3}" text-anchor="end" font-size="7" fill="#94a3b8">${fmt4(val)}</text>`; }).join('');
          const xT2 = nwRows.filter((_, i) => i % Math.ceil(n2 / 10) === 0 || nwRows[i].age === 95).map(r => { const idx = nwRows.indexOf(r); return `<text x="${xOf2(idx)}" y="${PT2 + cH2 + 14}" text-anchor="middle" font-size="7" fill="#94a3b8">${r.age}</text>`; }).join('');
          return `<h2>Net Worth Comparison Chart (Age ${pa} to 95)</h2><svg width="${W2}" height="${H2}" style="display:block;margin:8px 0;border:1px solid #e2e8f0;border-radius:6px;background:#fafafa">${yT2}${xT2}${poly2('standardNetWorth', '#2563eb')}${poly2('escalatingNetWorth', '#10b981')}${poly2('basicNetWorth', '#f59e0b')}</svg><div style="display:flex;gap:16px;font-size:8px;color:#64748b;margin-bottom:8px"><span style="color:#2563eb">&#9644; Standard</span><span style="color:#10b981">&#9644; Escalating</span><span style="color:#f59e0b">&#9644; Basic</span><span style="color:#94a3b8">(Net Worth = Cumulative Payouts + Bequest + OA + MA)</span></div>`;
        })()}
</div>

<!-- PAGE 4: YEAR-BY-YEAR PROJECTION + SENSITIVITY ANALYSIS -->
<div class="page-break">
<h2>Year-by-Year Projection (Every 5 Years + Payout Age)</h2>
<table><thead><tr><th>Age</th><th>OA</th><th>SA</th><th>MA</th><th>RA</th><th>Total CPF</th><th>Net Worth</th></tr></thead>
<tbody>${projRowsData}</tbody></table>

<h2 style="margin-top:16px">Sensitivity Analysis — Total CPF at Payout Age ${pa}</h2>
<p style="font-size:9px;color:#64748b;margin-bottom:6px">Rows = Housing Outflow / Year &nbsp;|&nbsp; Columns = SA/RA Top-up / Year &nbsp;|&nbsp; <span style="background:#dcfce7;padding:1px 6px;border-radius:3px;color:#166534;font-weight:800">Green = Base Case</span></p>
<table><thead><tr><th>Housing \ SA/RA Top-up</th>${saTopupCols.map(s => `<th style="text-align:right">${fc(s)}</th>`).join("")}</tr></thead>
<tbody>${sensRows}</tbody></table>
</div>

<!-- PAGE 4: FRS TRACKER + BREAKEVEN ANALYSIS + PAYOUT SENSITIVITY -->
<div class="page-break">
${(() => {
          // FRS Tracker
          const yt55 = Math.max(0, 55 - ca);
          const projFRS55 = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, yt55));
          const projBRS55 = Math.round(projFRS55 / 2);
          const projERS55 = projFRS55 * 2;
          const raAt55 = projection.find(r => r.age === Math.max(ca, 55))?.ra || 0;
          const frsShortfall = projFRS55 - raAt55;
          const frsPct = Math.min(100, Math.round((raAt55 / projERS55) * 100));
          const barsW = Math.round((raAt55 / projERS55) * 500);
          let frsStatus = raAt55 >= projERS55 ? "ERS Achieved ✓" : raAt55 >= projFRS55 ? "FRS Achieved ✓" : raAt55 >= projBRS55 ? "BRS Met — FRS Gap" : "Below BRS";
          let frsColor = raAt55 >= projERS55 ? "#0369a1" : raAt55 >= projFRS55 ? "#166534" : raAt55 >= projBRS55 ? "#92400e" : "#991b1b";
          return `
<h2>FRS Tracker — Projected RA at Age 55</h2>
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
  <div class="kpi"><div class="kpi-label">Projected RA @ 55</div><div class="kpi-value" style="color:${frsColor};font-size:14px">${fc(raAt55)}</div></div>
  <div class="kpi"><div class="kpi-label">BRS Target @ 55</div><div class="kpi-value" style="font-size:14px">${fc(projBRS55)}</div></div>
  <div class="kpi"><div class="kpi-label">FRS Target @ 55</div><div class="kpi-value" style="font-size:14px">${fc(projFRS55)}</div></div>
  <div class="kpi"><div class="kpi-label">Status</div><div class="kpi-value" style="color:${frsColor};font-size:11px">${frsStatus}</div></div>
</div>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:6px">
  <div style="background:#e2e8f0;border-radius:4px;height:12px;overflow:hidden;position:relative">
    <div style="height:100%;border-radius:4px;background:${frsColor};width:${frsPct}%"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:7px;color:#94a3b8;margin-top:3px">
    <span>$0</span><span>BRS ${fc(projBRS55)}</span><span>FRS ${fc(projFRS55)}</span><span>ERS ${fc(projERS55)}</span>
  </div>
  ${frsShortfall > 0 ? `<p style="font-size:8px;color:#b45309;margin-top:4px">Top up ${fc(Math.abs(frsShortfall))} more to reach FRS and unlock higher CPF LIFE payouts.</p>` : `<p style="font-size:8px;color:#166534;margin-top:4px">FRS achieved — consider topping up to ERS (${fc(projERS55)}) for maximum payouts.</p>`}
</div>`;
        })()}

${(() => {
          // Monte Carlo probability (if available)
          if (!monteCarloData?.probSufficiency) return '';
          const prob = monteCarloData.probSufficiency;
          const probColor = prob >= 80 ? "#166534" : prob >= 50 ? "#92400e" : "#991b1b";
          return `
<h2>Monte Carlo — Probability of Sufficiency</h2>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:16px">
  <div style="font-size:32px;font-weight:900;color:${probColor}">${prob}%</div>
  <div>
    <p style="font-size:9px;font-weight:700;color:#334155;margin:0 0 3px">Of 200 simulations (±1% rate variance), ${prob}% reached the projected FRS (${fc(monteCarloData.frsAtPayout)}) by payout age ${pa}.</p>
    <p style="font-size:8px;color:#64748b;margin:0">${prob >= 80 ? "Strong result — your plan is resilient to interest rate variation." : prob >= 50 ? "Moderate — consider increasing RSTU top-ups or deferring payout age." : "Lower confidence — significant top-ups or later payout age recommended."}</p>
  </div>
  <div style="flex:1;background:#e2e8f0;border-radius:4px;height:10px;overflow:hidden">
    <div style="height:100%;border-radius:4px;background:${probColor};width:${prob}%"></div>
  </div>
</div>`;
        })()}

<h2>CPF LIFE Breakeven Analysis</h2>
<table><thead><tr>
  <th>Comparison</th><th>Result</th><th>What it means</th>
</tr></thead><tbody>
  <tr><td><strong>Escalating overtakes Standard</strong></td>
    <td style="font-weight:900;color:#92400e">${intersectionEscVsStd ? `Age ${intersectionEscVsStd}` : "Beyond Age 95"}</td>
    <td style="font-size:8.5px;color:#475569">Escalating starts ~20% lower but grows 2%/yr. Cumulative total yield surpasses Standard at this age.</td></tr>
  <tr><td><strong>Standard overtakes Basic</strong></td>
    <td style="font-weight:900;color:#1d4ed8">${intersectionStdVsBasic ? `Age ${intersectionStdVsBasic}` : "Beyond Age 95"}</td>
    <td style="font-size:8.5px;color:#475569">Basic yields more early (RA earns 4%), but Standard overtakes after Basic RA depletes at ~90.</td></tr>
  <tr><td><strong>Escalating overtakes Basic</strong></td>
    <td style="font-weight:900;color:#7c3aed">${intersectionEscVsBasic ? `Age ${intersectionEscVsBasic}` : "Beyond Age 95"}</td>
    <td style="font-size:8.5px;color:#475569">Escalating's 2%/yr growth eventually compounds past Basic's early advantage.</td></tr>
  <tr><td><strong>Esc monthly payout exceeds Standard</strong></td>
    <td style="font-weight:900;color:#047857">${intersectionEscPayVsStdPay ? `Age ${intersectionEscPayVsStdPay}` : "Beyond Age 95"}</td>
    <td style="font-size:8.5px;color:#475569">The age your monthly Escalating cheque exceeds the fixed Standard amount.</td></tr>
</tbody></table>

${payAgeSensHtml}
</div>

<!-- PAGE 5: DECUMULATION STRATEGY -->
<div class="page-break">
<h2>Decumulation Strategy — Income at Retirement</h2>
${(() => {
          const oaDrawStart = effectiveOaDrawStartAge;
          const oaDrawMo   = effectiveOaDrawMonthly;
          const oaFloor    = effectiveOaDrawFloor;
          const target = Number(inputs.targetMonthlyIncome) || 0;
          const srsStartPdf = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
          const srsYearsPdf = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
          const srsRowPdf = projection.find(r => r.age === srsStartPdf);
          // P2-B fix: use PMT annuity formula (mirrors engine) instead of naive balance/years/12 division
          const srsBalPdf = srsRowPdf?.srsBalance || 0;
          const srsRatePdf = Math.max(0, (Number(inputs.srsReturnRate) || 0) / 100);
          const srsAnnualDrawPdf = srsYearsPdf > 0
            ? (srsRatePdf > 0
                ? Math.round(srsBalPdf * srsRatePdf / (1 - Math.pow(1 + srsRatePdf, -srsYearsPdf)))
                : Math.round(srsBalPdf / srsYearsPdf))
            : srsBalPdf;
          const srsMoPdf = Math.round(srsAnnualDrawPdf / 12);
          const privRowPdf = projection.find(r => r.age === pa) || {};
          const prevPrivRowPdf = projection.find(r => r.age === pa - 1) || {};
          // When DWZ is active, use the engine-computed _dwzPrivMonthly (exact PMT draw).
          // When DWZ is off, use the private-asset delta (growth reduction from manual scenarios).
          const privMoPdf = debouncedInputs.dieWithZeroEnabled
            ? (projection._dwzPrivMonthly || 0)
            : Math.max(0, Math.round(((prevPrivRowPdf.privateAssets || 0) - (privRowPdf.privateAssets || 0)) / 12));
          const cpfLifeMoPdf = stdMonthly;
          const totalMoPdf = cpfLifeMoPdf + (oaDrawMo || 0) + srsMoPdf + privMoPdf;
          const shortfallPdf = target > 0 ? target - totalMoPdf : 0;
          // Compute OA exhaust age for PDF
          let oaExhaustPdf = null;
          if (oaDrawStart > 0 && oaDrawMo > 0) {
            for (const row of projection) {
              if (row.age >= oaDrawStart && row.oa <= oaFloor) { oaExhaustPdf = row.age; break; }
            }
          }
          const incomeRows = [
            { label: "CPF LIFE (Standard)", start: pa, end: "Life", mo: cpfLifeMoPdf, color: "#7c3aed" },
            ...(oaDrawStart > 0 && oaDrawMo > 0 ? [{ label: "OA Drawdown", start: oaDrawStart, end: oaExhaustPdf ?? "95+", mo: oaDrawMo, color: "#b45309" }] : []),
            ...(srsMoPdf > 0 ? [{ label: "SRS Drawdown", start: srsStartPdf, end: srsStartPdf + srsYearsPdf - 1, mo: srsMoPdf, color: "#0369a1" }] : []),
            ...(privMoPdf > 0 ? [{ label: "Private Assets", start: pa, end: "95+", mo: privMoPdf, color: "#166534" }] : []),
          ];
          return `
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
  <div class="kpi"><div class="kpi-label">CPF LIFE (Standard)</div><div class="kpi-value" style="color:#7c3aed;font-size:14px">${fc(cpfLifeMoPdf)}/mo</div></div>
  <div class="kpi"><div class="kpi-label">OA Drawdown</div><div class="kpi-value" style="color:#b45309;font-size:14px">${oaDrawMo > 0 ? fc(oaDrawMo) + "/mo" : "—"}</div></div>
  <div class="kpi"><div class="kpi-label">SRS / Private</div><div class="kpi-value" style="color:#0369a1;font-size:14px">${fc(srsMoPdf + privMoPdf)}/mo</div></div>
  <div class="kpi"><div class="kpi-label">${target > 0 ? (shortfallPdf <= 0 ? "Surplus vs Target" : "Shortfall vs Target") : "Total Income"}</div><div class="kpi-value" style="color:${target > 0 ? (shortfallPdf <= 0 ? "#166534" : "#991b1b") : "#334155"};font-size:14px">${target > 0 ? (shortfallPdf <= 0 ? "+" : "-") + fc(Math.abs(shortfallPdf)) : fc(totalMoPdf)}/mo</div></div>
</div>
<table><thead><tr><th>Income Stream</th><th>Start Age</th><th>End Age</th><th style="text-align:right">Monthly Income</th><th style="text-align:right">Lifetime Total</th></tr></thead>
<tbody>${incomeRows.map(r => `<tr><td style="color:${r.color};font-weight:700">${r.label}</td><td>${r.start}</td><td>${r.end}</td><td style="text-align:right;font-weight:700">${fc(r.mo)}/mo</td><td style="text-align:right">${typeof r.end === "number" ? fc(r.mo * 12 * (r.end - r.start + 1)) : fc(r.mo * 12 * (95 - r.start + 1))}</td></tr>`).join("")}
<tr style="background:#f1f5f9;font-weight:900"><td colspan="3">Combined Monthly (excl. one-time)</td><td style="text-align:right;font-size:12px">${fc(totalMoPdf)}/mo</td><td style="text-align:right">${target > 0 ? `Target: ${fc(target)}/mo` : ""}</td></tr>
</tbody></table>
${oaDrawStart > 0 && oaDrawMo > 0 ? `
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:8.5px">
  <strong>OA Drawdown Details:</strong> ${fc(oaDrawMo)}/mo from age ${oaDrawStart} · Bequest floor: ${fc(oaFloor)} · OA earns 2.5%/yr on remaining balance · ${oaExhaustPdf ? `OA reaches floor at age <strong>${oaExhaustPdf}</strong>` : "OA sustains to age 95+"}
</div>` : ""}
${target > 0 ? `<div style="background:${shortfallPdf <= 0 ? "#f0fdf4" : "#fef2f2"};border:1px solid ${shortfallPdf <= 0 ? "#bbf7d0" : "#fecaca"};border-radius:6px;padding:8px 12px;margin-top:6px;font-size:8.5px;color:${shortfallPdf <= 0 ? "#166534" : "#991b1b"}"><strong>${shortfallPdf <= 0 ? "✓ Income goal met" : "⚠ Income shortfall"}:</strong> Combined income of ${fc(totalMoPdf)}/mo vs target of ${fc(target)}/mo — ${shortfallPdf <= 0 ? "surplus of " + fc(Math.abs(shortfallPdf)) + "/mo" : "gap of " + fc(shortfallPdf) + "/mo. Increase OA drawdown or private savings to close the gap."}</div>` : ""}`;
        })()}
</div>

<!-- PAGE 6: MILESTONE ALERTS + DISCLAIMER -->
<div class="page-break">
<h2>Milestone Alerts</h2>
${milestones.length > 0 ? `<table><thead><tr><th>Age</th><th>Event</th><th>Details</th></tr></thead><tbody>${msRows}</tbody></table>` : `<p style="color:#64748b;font-style:italic">No milestone alerts detected for current inputs.</p>`}

<h2 style="margin-top:20px">Legal Disclaimer</h2>
<p style="font-size:8.5px;color:#64748b;line-height:1.6;text-align:justify">${LEGAL_DISCLAIMER}</p>
</div>

</body></html>`;

      // Always open in-app modal first so user can pick orientation and preview before printing
      setExportModal({ type: "pdf", content: html });
    } catch (e) { alert("Report failed: " + e.message); } finally { clearTimeout(pdfTimeout); setIsGeneratingPdf(false); }
  };
  return (
    <TooltipContext.Provider value={{ show: showTooltipId, set: setShowTooltipId }}>
      <ErrorBoundary>
      <div ref={rootRef} className={isDark ? "theme-dark" : "theme-light"} style={{ width: "100%", display: "flex", flexDirection: "column", background: "var(--bg-base)", color: "var(--text-main)", fontFamily: "system-ui,sans-serif" }}>
      <style>{`
        /* ─── VITE OVERRIDES (Fix Desktop White Space) ─── */
        html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; overflow-x: hidden !important; }
        #root { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; display: flex; min-height: 100vh; min-height: 100dvh; }
        :root { --app-height: 100vh; --viewport-height: 100vh; }
        @supports (height: 100dvh) { :root { --app-height: 100dvh; --viewport-height: 100dvh; } }
        /* Base height on theme classes — controlled by JS on mobile */
        .theme-dark, .theme-light { height: 100vh; height: 100dvh; overflow: hidden; }
        /* iOS Safari keyboard fix — JS sets rootRef height directly via visualViewport */
        @media (max-width: 1024px) {
          .theme-dark, .theme-light { height: var(--viewport-height, 100dvh) !important; min-height: var(--viewport-height, 100dvh) !important; }
        }
        .theme-dark {
          --bg-base: #060d1f;
          --bg-panel: #0d1b2e;
          --bg-input: #162032;
          --bg-muted: rgba(22,32,50,0.6);
          --bg-panel-muted: rgba(13,27,46,0.7);
          --tooltip-bg: rgba(6, 13, 31, 0.95);
          --tooltip-text: #ffffff;
          --tooltip-border: rgba(255,255,255,0.15);
          --tooltip-label: #94a3b8;
          --border-subtle: #1f3050;
          --border-strong: #2d4a6e;
          --text-main: #e8f0fe;
          --text-bright: #ffffff;
          --text-highlight: #c8d8f0;
          --text-muted: #a0b4cc;
          --text-subtle: #7090a8;
          --header-bg: rgba(13,27,46,0.97);
          --chart-grid: #1a2d45;
          --chart-text: #7090a8;
          /* Hero panel */
          --hero-left-bg: #1e3a5f;
          --hero-right-bg: #162032;
          --hero-border: #2d4a6e;
          --hero-text: #ffffff;
          --hero-label: rgba(255,255,255,0.55);
          --hero-card-bg: rgba(255,255,255,0.08);
          --hero-acct-bg: rgba(255,255,255,0.05);
          --hero-acct-border: rgba(255,255,255,0.08);
          --hero-ring-bg: rgba(255,255,255,0.1);
          --hero-divider: rgba(255,255,255,0.15);
          --hero-arrow: white;
          /* Shadows & interactive */
          --shadow-modal: 0 25px 50px -12px rgba(0,0,0,0.75);
          --shadow-panel: 0 4px 8px rgba(0,0,0,0.35);
          --shadow-sticky: 2px 0 6px rgba(0,0,0,0.35);
          --shadow-mobile-menu: 0 8px 24px rgba(0,0,0,0.4);
          --shadow-kpi: 0 2px 4px rgba(0,0,0,0.25);
          --chart-cursor: rgba(255,255,255,0.2);
          --tooltip-border-inline: rgba(255,255,255,0.15);
          --tooltip-shadow-inline: 0 8px 24px rgba(0,0,0,0.65);
          --code-bg: #060d1f;
          --code-text: #c8d8f0;
          --share-url-color: #6ee7b7;
          --mc-total-border: rgba(255,255,255,0.12);
          --mc-total-color: #ffffff;
          /* ── Section-header accent colours (theme-aware) ── */
          --clr-sky:  #38bdf8;   /* Profile & Balances header + body accents */
          --clr-lime: #a3e635;   /* Mandatory Contributions header + body accents */
        }
        .theme-light {
          /* ── Backgrounds: warm slate-grey base, off-white panels — no blinding white ── */
          --bg-base: #dce4ee;
          --bg-panel: #eef1f6;
          --bg-input: #d4dde8;
          --bg-muted: rgba(220,228,238,0.96);
          --bg-panel-muted: rgba(238,241,246,0.92);
          --tooltip-bg: rgba(238,241,246,0.99);
          --tooltip-text: #0d1520;
          --tooltip-border: rgba(20,40,70,0.22);
          --tooltip-label: #334d6b;
          /* ── Borders: clearly visible without being harsh ── */
          --border-subtle: #a2b4c8;
          --border-strong: #627e98;
          /* ── Text: all levels darkened for WCAG AA minimum ── */
          --text-main: #162033;
          --text-bright: #08111e;
          --text-highlight: #0d2a4a;
          --text-muted: #2e4560;
          --text-subtle: #3d5875;
          --header-bg: rgba(228,234,244,0.98);
          /* ── Charts: readable gridlines and labels ── */
          --chart-grid: #c0cedd;
          --chart-text: #2e4560;
          /* ── Hero / KPI panel ── */
          --hero-left-bg: #c4d4e4;
          --hero-right-bg: #e2eaf4;
          --hero-border: #a0b8cc;
          --hero-text: #0a1c2e;
          --hero-label: rgba(10,28,46,0.65);
          --hero-card-bg: rgba(10,28,46,0.07);
          --hero-acct-bg: rgba(10,28,46,0.05);
          --hero-acct-border: rgba(10,28,46,0.16);
          --hero-ring-bg: rgba(10,28,46,0.12);
          --hero-divider: rgba(10,28,46,0.18);
          --hero-arrow: #0d2a4a;
          /* ── Shadows & interactive ── */
          --shadow-modal: 0 25px 50px -12px rgba(0,0,0,0.22);
          --shadow-panel: 0 2px 8px rgba(0,0,0,0.10);
          --shadow-sticky: 2px 0 5px rgba(0,0,0,0.09);
          --shadow-mobile-menu: 0 6px 18px rgba(0,0,0,0.14);
          --shadow-kpi: 0 1px 4px rgba(0,0,0,0.10);
          --chart-cursor: rgba(20,40,70,0.20);
          --tooltip-border-inline: rgba(20,40,70,0.22);
          --tooltip-shadow-inline: 0 8px 24px rgba(0,0,0,0.16);
          --code-bg: #dce4ee;
          --code-text: #0d2a4a;
          --share-url-color: #065f46;
          --mc-total-border: rgba(20,40,70,0.18);
          --mc-total-color: #08111e;
          /* ── Section-header accent colours (theme-aware, WCAG AA) ── */
          --clr-sky:  #0284c7;   /* 5.8:1 on light bg — replaces #38bdf8 */
          --clr-lime: #4d7c0f;   /* 7.1:1 on light bg — replaces #a3e635 */
        }
        /* ══════════════════════════════════════════════════════════════
           LIGHT MODE SPECIFIC OVERRIDES — full contrast pass
           ══════════════════════════════════════════════════════════════ */

        /* ── Sidebar section headers — stronger gradient + crisper border ── */
        .theme-light .sidebar-section-hdr {
          background: linear-gradient(135deg, #ccd9e8 0%, #d8e4f0 100%) !important;
          border-color: #a8bcce !important;
        }

        /* ── Input & select text — full darkness ── */
        .theme-light input[type="number"],
        .theme-light input[type="text"],
        .theme-light select {
          color: #162033 !important;
          background: #d8e0eb !important;
        }
        .theme-light input[type="number"]::placeholder,
        .theme-light input[type="text"]::placeholder {
          color: #4a6480 !important;
        }

        /* ── Table column headers ── */
        .theme-light table thead th {
          color: #162033 !important;
          font-weight: 800 !important;
          background: #d4dde9 !important;
        }
        .theme-light table thead th:first-child {
          background: #d4dde9 !important;
        }
        .theme-light table tbody tr:nth-child(even) {
          background: rgba(180,198,220,0.18) !important;
        }
        .theme-light table tbody td {
          color: #1e3350;
        }

        /* ── Nav/tab bar buttons ── */
        .theme-light .cpf-nav-btn {
          color: #2e4560 !important;
        }
        .theme-light .cpf-nav-btn.active {
          color: #0d2a4a !important;
          font-weight: 800 !important;
        }

        /* ── Sub-tab toggles ── */
        .theme-light button[style*="borderRadius: 20"] {
          border-color: #6e87a2 !important;
        }

        /* ── KPI strip inactive values ── */
        .theme-light .kpi-inactive-val {
          color: #2e4560 !important;
        }

        /* ── Panel/card borders ── */
        .theme-light .panel-card {
          border-color: #adbcce !important;
          background: #f2f5f9 !important;
        }

        /* ── Lifetime Summary card labels ── */
        .theme-light .lifetime-label {
          color: #2e4560 !important;
          font-size: 10px !important;
        }

        /* ── Chart legend & axis text ── */
        .theme-light .recharts-legend-item-text {
          color: #2e4560 !important;
          font-weight: 600 !important;
        }
        .theme-light .recharts-cartesian-axis-tick-value {
          fill: #2e4560 !important;
        }

        /* ── Sidebar gap alert box ── */
        .theme-light .gap-alert-box {
          background: rgba(254,243,199,0.85) !important;
          border-color: #d4a017 !important;
        }

        /* ── Bottom badge pills ── */
        .theme-light .info-badge {
          background: #d8e0eb !important;
          color: #162033 !important;
          border-color: #adbcce !important;
        }

        /* ── Header action pill buttons: blue (Import/Export/Share/Link) ──
             #60a5fa on rgba(236,241,248) ≈ 2.5:1 — fails WCAG AA.
             Replace with #1d4ed8 on rgba(29,78,216,0.12) ≈ 5.8:1. ── */
        .theme-light .cpf-header-actions button[style*="#60a5fa"],
        .theme-light .cpf-header-actions label[style*="#60a5fa"] {
          color: #1d4ed8 !important;
          background: rgba(29,78,216,0.10) !important;
          border-color: rgba(29,78,216,0.28) !important;
        }

        /* ── Reset button: #f87171 on near-white ≈ 2.0:1 — fails WCAG AA.
             Replace with #b91c1c ≈ 5.4:1 ── */
        .theme-light .cpf-header-actions button[style*="#f87171"] {
          color: #b91c1c !important;
          background: rgba(185,28,28,0.10) !important;
          border-color: rgba(185,28,28,0.28) !important;
        }

        /* ── Samples button: #fbbf24 on near-white ≈ 1.9:1 — fails WCAG AA.
             Replace with #92400e (dark amber) ≈ 5.7:1 ── */
        .theme-light .cpf-header-actions button[style*="#fbbf24"] {
          color: #92400e !important;
          background: rgba(146,64,14,0.10) !important;
          border-color: rgba(146,64,14,0.28) !important;
        }

        /* ── PDF/Export green buttons: #34d399 on near-white ≈ 1.7:1 — fails WCAG AA.
             Replace with #065f46 ≈ 7.3:1 ── */
        .theme-light button[style*="#34d399"] {
          color: #065f46 !important;
          background: rgba(6,95,70,0.10) !important;
          border-color: rgba(6,95,70,0.28) !important;
        }

        /* ── FreqToggle: Recurring badge (#34d399 tint on panel bg) ── */
        .theme-light .freq-recurring-active {
          color: #065f46 !important;
          background: rgba(6,95,70,0.14) !important;
        }
        /* ── FreqToggle: One-Time badge (#fbbf24 tint on panel bg) ── */
        .theme-light .freq-onetime-active {
          color: #92400e !important;
          background: rgba(146,64,14,0.14) !important;
        }

        /* ── Sidebar field value hints (monospace amounts in teal) ──
             #38bdf8 / #34d399 / #a78bfa etc. on #f2f5f9 need boosting ── */
        /* -- #38bdf8 now handled via var(--clr-sky) -- */
        .theme-light [style*="color: \"#a78bfa\""],
        .theme-light [style*='color: "#a78bfa"'] { color: #6d28d9 !important; }
        .theme-light [style*="color: \"#fb923c\""],
        .theme-light [style*='color: "#fb923c"'] { color: #c2410c !important; }
        .theme-light [style*="color: \"#f87171\""],
        .theme-light [style*='color: "#f87171"'] { color: #b91c1c !important; }
        .theme-light [style*="color: \"#fbbf24\""],
        .theme-light [style*='color: "#fbbf24"'] { color: #92400e !important; }

        /* ── Sidebar section body: labels use var(--text-subtle) = #4a6480.
             Boost label contrast on #f2f5f9 panel background ── */
        .theme-light .sidebar-field-label {
          color: #2e4560 !important;
          font-weight: 600 !important;
        }

        /* ── Toast notification: was near-invisible on light bg ── */
        .theme-light .cpf-toast {
          background: #162033 !important;
          color: #f0f6ff !important;
          border-color: #2e4560 !important;
        }

        /* ── Modal overlays: ensure headings readable ── */
        .theme-light .modal-heading {
          color: #08111e !important;
        }

        /* ── Tooltip box text inside sidebar ── */
        .theme-light .tooltip-content {
          color: #162033 !important;
          background: rgba(242,245,249,0.99) !important;
          border-color: rgba(20,40,70,0.22) !important;
        }

        /* ── Recharts Tooltip (chart hover) ── */
        .theme-light .recharts-default-tooltip {
          background: rgba(242,245,249,0.99) !important;
          border-color: rgba(20,40,70,0.22) !important;
          color: #162033 !important;
        }
        .theme-light .recharts-tooltip-label {
          color: #162033 !important;
          font-weight: 700 !important;
        }
        .theme-light .recharts-tooltip-item {
          color: #2e4560 !important;
        }

        /* ── KPI / Summary panel metric values —
             Large coloured dollar figures (OA blue, MA green, RA purple)
             need higher luminance/contrast against light card backgrounds ── */
        .theme-light [style*="color: \"#60a5fa\""],
        .theme-light [style*='color: "#60a5fa"'] { color: #1d4ed8 !important; }   /* OA blue */
        .theme-light [style*="color: \"#34d399\""],
        .theme-light [style*='color: "#34d399"'] { color: #065f46 !important; }   /* MA green */
        .theme-light [style*="color: \"#c084fc\""],
        .theme-light [style*='color: "#c084fc"'] { color: #6d28d9 !important; }   /* RA purple */
        .theme-light [style*="color: \"#10b981\""],
        .theme-light [style*='color: "#10b981"'] { color: #065f46 !important; }   /* accent green */
        .theme-light [style*="color: \"#818cf8\""],
        .theme-light [style*='color: "#818cf8"'] { color: #4338ca !important; }   /* indigo */
        .theme-light [style*="color: \"#94a3b8\""],
        .theme-light [style*='color: "#94a3b8"'] { color: #334155 !important; }   /* gray (legacy) */

        /* ── Profile & Balances header + body accents: use var(--clr-sky) in JSX ── */
        .theme-light .clr-sky  { color: var(--clr-sky)  !important; }
        /* ── Mandatory Contributions header + body accents: use var(--clr-lime) in JSX ── */
        .theme-light .clr-lime { color: var(--clr-lime) !important; }

        /* ── Sidebar section header gray text: boost in light mode ── */
        .theme-light [style*="color: \"#94a3b8\""] {
          color: #475569 !important;
        }
        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
        @keyframes sidebarIn {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes unsavedPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        
        /* ─── BASE LAYOUT (desktop default) ─────────────────────────── */
        .cpf-layout {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 24px;
          width: 100%;
          margin: 0 auto;
          padding: 24px 20px;
          align-items: start;
          box-sizing: border-box;
          transition: max-width 0.3s ease, grid-template-columns 0.3s ease, padding 0.3s ease;
          /* Fill all available height between header and footer */
          height: 100%;
          overflow: hidden;
        }
        /* Sidebar scrolls independently */
        .cpf-sidebar-wrap {
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: var(--border-strong) transparent;
          align-self: stretch;
        }
        .cpf-sidebar-wrap::-webkit-scrollbar { width: 4px; }
        .cpf-sidebar-wrap::-webkit-scrollbar-track { background: transparent; }
        .cpf-sidebar-wrap::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
        /* Main content panel: grid with sticky header row + scrollable content row */
        .cpf-main-wrap {
          height: 100%;
          display: grid !important;
          grid-template-rows: auto 1fr;
          overflow: hidden;
          min-width: 0;
        }
        /* The scrollable content area inside the main wrap */
        .cpf-tab-content {
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: var(--border-strong) transparent;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .cpf-tab-content::-webkit-scrollbar { width: 5px; }
        .cpf-tab-content::-webkit-scrollbar-track { background: transparent; }
        .cpf-tab-content::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
        /* ─── DESKTOP VIEWPORT MODES ─────────────────────────────────── */
        .cpf-layout[data-mode="fhd"] { grid-template-columns: 380px 1fr; max-width: 1920px; gap: 28px; padding: 28px 32px; }
        .cpf-layout[data-mode="hd"] { grid-template-columns: 360px 1fr; max-width: 1440px; gap: 24px; padding: 24px 28px; }
        @media (min-width: 1920px) { .cpf-layout[data-mode="auto"] { grid-template-columns: 380px 1fr; gap: 28px; padding: 28px 32px; } }
        @media (min-width: 1440px) and (max-width: 1919px) { .cpf-layout[data-mode="auto"] { grid-template-columns: 360px 1fr; gap: 24px; padding: 24px 24px; } }
        @media (max-width: 1439px) and (min-width: 1025px) { .cpf-layout[data-mode="auto"] { grid-template-columns: 300px 1fr; gap: 16px; padding: 16px 16px; } }

        /* ─── PAGE-WIDE WRAPPER ─── */
        .cpf-page-wrap { max-width: 1920px; margin: 0 auto; padding: 6px 20px; width: 100%; box-sizing: border-box; }
        .cpf-page-wrap[data-mode="fhd"] { max-width: 1920px; padding: 6px 32px; }
        .cpf-page-wrap[data-mode="hd"]  { max-width: 1440px; padding: 6px 28px; }
        .cpf-page-wrap[data-mode="auto"] { max-width: 1920px; padding: 6px 20px; }
        @media (min-width: 1920px) { .cpf-page-wrap[data-mode="auto"] { padding: 6px 32px; } }
        @media (min-width: 1440px) and (max-width: 1919px) { .cpf-page-wrap[data-mode="auto"] { max-width: 1920px; padding: 6px 24px; } }
        @media (max-width: 1439px) and (min-width: 1025px) { .cpf-page-wrap[data-mode="auto"] { max-width: 1920px; padding: 6px 16px; } }

        .cpf-header-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; flex: 1 1 auto; min-width: 0; }
        .mobile-menu-btn { display: none; }
        .desktop-only { display: flex; }
        .cpf-tabs { display: flex; gap: 4px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 2px; touch-action: pan-x; }
        .cpf-tabs::-webkit-scrollbar { display: none; }
        /* Ensure active tab scrolls into view on mobile */
        .cpf-tabs button[aria-selected="true"] { scroll-snap-align: center; }
        .cpf-tabs { scroll-snap-type: x proximity; scroll-padding: 0 20px; }

        .rg-6 { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
        .rg-5 { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
        .rg-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .rg-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
        .rg-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .sidebar-toggle-btn { display: none; }
        /* Sidebar sticky expand/collapse bar — only meaningful on desktop where sidebar scrolls */
        .sidebar-sticky-bar { display: flex; }
        @media (max-width: 1024px) { .sidebar-sticky-bar { display: none !important; } }
        /* Keyboard accessibility for sidebar sections */
        .sidebar-section-header:focus { outline: 2px solid #34d399; outline-offset: -2px; border-radius: 8px; }
        .sidebar-section-header:focus:not(:focus-visible) { outline: none; }
        /* FreqToggle responsive — larger touch targets on narrow screens */
        @media (max-width: 768px) {
          .freq-toggle-wrap { margin-left: 0 !important; display: flex !important; }
          .freq-toggle-wrap button { padding: 4px 10px !important; font-size: 9px !important; min-height: 28px; }
        }

        /* ─── TABLET LANDSCAPE  769 – 1024 px ───────────────────────── */
        @media (max-width: 1024px) and (min-width: 769px) {
          /* Revert to normal page flow — no sticky panels on tablet */
          .theme-dark, .theme-light { height: auto !important; overflow: visible !important; }
          .cpf-layout { grid-template-columns: 1fr !important; gap: 0 !important; padding: 0 !important; max-width: 100% !important; height: auto !important; overflow: visible !important; flex: none !important; }
          .cpf-sidebar-wrap { width: 100%; border-bottom: 2px solid var(--border-subtle); position: static !important; background: var(--bg-base); height: auto !important; overflow-y: visible !important; align-self: auto !important; }
          .cpf-main-wrap { height: auto !important; overflow: visible !important; display: flex !important; grid-template-rows: none !important; flex-direction: column !important; }
          .cpf-tab-content { overflow-y: visible !important; padding: 10px 14px !important; }
          .cpf-sidebar-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 14px 16px; animation: sidebarIn 0.2s ease-out; overflow-y: visible; }
          .cpf-sidebar-inner.sidebar-collapsed { display: none !important; }
          .cpf-main-wrap { padding: 16px 14px; }
          .sidebar-toggle-btn { display: flex !important; position: sticky; top: 0; z-index: 40; background: var(--bg-panel); }
          .desktop-only { display: none !important; }
          .rg-6, .rg-5 { grid-template-columns: repeat(3,1fr) !important; }
          .rg-4, .rg-3, .rg-2, .life-plans-grid { grid-template-columns: 1fr 1fr !important; }
          .cpf-table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .cpf-modal-inner { max-width: 100% !important; margin: 0 !important; border-radius: 0 !important; }
          .welcome-step3-grid { grid-template-columns: 1fr 1fr !important; }
        }

        /* ─── TABLET PORTRAIT + MOBILE  ≤ 768 px ────────────────────── */
        @media (max-width: 768px) {
          /* Revert to normal page flow — no sticky panels on mobile */
          .theme-dark, .theme-light { height: auto !important; overflow: visible !important; }
          .cpf-layout { grid-template-columns: 1fr !important; gap: 0 !important; padding: 0 !important; max-width: 100% !important; height: auto !important; overflow: visible !important; flex: none !important; }
          .cpf-header-actions .hide-mobile { display: none; }
          .cpf-sidebar-wrap { width: 100%; border-bottom: 2px solid var(--border-subtle); position: static !important; background: var(--bg-base); height: auto !important; overflow-y: visible !important; align-self: auto !important; }
          .cpf-sidebar-inner { display: flex; flex-direction: column; gap: 12px; padding: 10px 12px 14px; animation: sidebarIn 0.2s ease-out; overflow-y: visible; }
          .cpf-sidebar-inner.sidebar-collapsed { display: none !important; }
          .cpf-main-wrap { height: auto !important; overflow: visible !important; display: flex !important; grid-template-rows: none !important; flex-direction: column !important; }
          .cpf-tab-content { overflow-y: visible !important; padding: 10px 10px !important; }
          .sidebar-toggle-btn { display: flex !important; position: sticky; top: 0; z-index: 40; background: var(--bg-panel); }
          .desktop-only { display: none !important; }
          .rg-6 { grid-template-columns: repeat(2,1fr) !important; gap: 6px !important; }
          .rg-5, .rg-4, .rg-3, .rg-2 { grid-template-columns: 1fr 1fr !important; }
          .life-plans-grid { grid-template-columns: 1fr !important; }
          .cpf-table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .cpf-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; }
          .cpf-modal-inner { max-width: 100% !important; border-radius: 12px !important; }
          .cpf-welcome-body { max-height: 50vh !important; overflow-y: auto !important; }
          .welcome-step3-grid { grid-template-columns: 1fr !important; }
          .kpi-strip { grid-template-columns: 1fr 1fr !important; }
          .kpi-strip > div { min-width: 0 !important; padding: 8px 8px !important; }
          .cpf-kpi-value { font-size: 12px !important; }
          .cpf-kpi-label { font-size: 8px !important; }
          body { overflow-x: hidden !important; }
          .pie-chart-wrap { flex-direction: column !important; align-items: stretch !important; }
          .pie-chart-wrap > div:first-child { width: 100% !important; }
          .pie-legend { grid-template-columns: 1fr 1fr !important; }
          .docs-two-col { grid-template-columns: 1fr !important; }
          .life-chart-header { flex-direction: column !important; }
          .hero-split { grid-template-columns: 1fr !important; }
          .hero-split > div { overflow: hidden !important; min-width: 0 !important; }
          .hero-split svg { overflow: visible !important; }
          /* Yield breakeven cards: 1-col on mobile */
          .yield-cards-grid { grid-template-columns: 1fr !important; }
        }

        /* ─── SMALL PHONE  ≤ 480 px ─────────────────────────────────── */
        @media (max-width: 480px) {
          .cpf-main-wrap { padding: 6px 6px; }
          .rg-6, .rg-5, .rg-4, .rg-3 { grid-template-columns: 1fr 1fr !important; gap: 5px !important; }
          .rg-2, .life-plans-grid { grid-template-columns: 1fr !important; }
          .cpf-kpi-value { font-size: 14px !important; }
          .cpf-kpi-label { font-size: 9px !important; }
          .cpf-tab-btn { font-size: 9px !important; padding: 6px 8px !important; }
          .sidebar-toggle-btn span { font-size: 9px !important; }
          .cpf-welcome-header { padding: 10px 12px !important; }
          .cpf-welcome-body { padding: 16px !important; max-height: 45vh !important; overflow-y: auto !important; }
          .welcome-step3-grid { grid-template-columns: 1fr !important; }
          .cpf-welcome-footer { padding: 14px 16px !important; }
        }

        /* ─── MOBILE HEADER  ≤ 640 px ───────────────────────────────── */
        @media (max-width: 640px) {
          .mobile-menu-btn { display: flex !important; }
          .cpf-header-actions > *:not(.mobile-menu-btn):not(.sidebar-toggle-btn) { display: none !important; }
          .cpf-header-actions { gap: 4px; }
          /* Pin the header so inputs toggle + hamburger are always reachable */
          header { position: fixed !important; top: 0; left: 0; right: 0; z-index: 50; }
          /* Push layout content below the fixed header (header is ~48px tall on mobile) */
          .cpf-mobile-top-spacer { display: block !important; height: 48px; flex-shrink: 0; }
          .cpf-mobile-menu { display: flex !important; flex-direction: column; gap: 8px; position: fixed; top: 48px; right: 0; left: 0; background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle); padding: 12px 14px; z-index: 49; box-shadow: var(--shadow-mobile-menu); max-height: calc(100dvh - 48px); overflow-y: auto; }
          .cpf-mobile-menu-row { display: flex; gap: 8px; flex-wrap: wrap; }
          .cpf-logo-text { font-size: 13px !important; }
          .cpf-logo-sub  { display: none !important; }
          /* Show toggle btn on mobile — no positioning here (handled per-context below) */
          .sidebar-toggle-btn { display: flex !important; z-index: 40; background: var(--bg-panel); }
          /* The sidebar INPUT PARAMETERS bar: fixed just below the fixed header */
          .cpf-sidebar-wrap .sidebar-toggle-btn { position: fixed !important; top: 48px; left: 0; right: 0; z-index: 48; }
          /* Push sidebar sections below the fixed toggle bar (~44px tall) */
          .cpf-sidebar-wrap { padding-top: 44px; }
          .desktop-only { display: none !important; }
          .rg-5, .rg-4, .rg-3 { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 641px) {
          .cpf-mobile-menu { display: none !important; }
          .cpf-mobile-top-spacer { display: none !important; }
        }

        /* ─── GLOBAL OVERFLOW GUARD (Fixed for Recharts) ───────────── */
        @media (max-width: 1024px) {
          body, html, #root, .cpf-page-wrap, .cpf-layout, .cpf-main-wrap { max-width: 100vw; box-sizing: border-box; overflow-x: hidden; }
          img { max-width: 100%; height: auto; }
          pre, code { white-space: pre-wrap; word-break: break-word; }
          input, select, textarea { max-width: 100%; }
          table { table-layout: auto; }
        }

        /* ─── MOBILE TOUCH SCROLL FIX ─── */
        .recharts-wrapper, .recharts-surface, input[type="range"] {
          touch-action: pan-y !important;
        }
      `}</style>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 99999, background: "#10b981", color: "#020617", padding: "12px 24px", borderRadius: 12, fontWeight: 800, boxShadow: "0 10px 25px rgba(16,185,129,0.3)", display: "flex", alignItems: "center", gap: 8, animation: "slideDown 0.3s ease-out" }}>
          <CheckCircle2 style={{ width: 18, height: 18 }} /> {toastMessage}
        </div>
      )}

      {/* IN-APP CONFIRM DIALOG — replaces window.confirm (blocked in sandbox) */}
      {confirmModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.88)", backdropFilter: "blur(6px)", zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 16, width: "100%", maxWidth: 400, padding: 28, boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <AlertTriangle style={{ width: 22, height: 22, color: "#f59e0b", flexShrink: 0 }} />
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-bright)", margin: 0 }}>Confirm Action</h3>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>{confirmModal.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "var(--bg-input)", color: "var(--text-muted)", border: "1px solid var(--border-strong)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE CODE MODAL */}
      {showShareModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.85)", backdropFilter: "blur(8px)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 20, width: "100%", maxWidth: 520, padding: 28, boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-bright)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <Link style={{ width: 18, height: 18, color: "#60a5fa" }} />Share This Projection
              </h3>
              <button onClick={() => setShowShareModal(false)} style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer" }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
              Copy the code below and send to your financial advisor or colleague. They paste it into the <strong style={{ color: "var(--text-main)" }}>Restore</strong> box to see your exact projection instantly.
            </p>

            {/* Profile Code */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>📋 Your Encoded Profile Code</label>
              <textarea readOnly value={shareUrl} rows={4} onFocus={e => e.target.select()} style={{ width: "100%", padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--share-url-color)", fontSize: 10, outline: "none", resize: "none", fontFamily: "monospace", boxSizing: "border-box", lineBreak: "anywhere" }} />
            </div>
            <button onClick={executeCopy} style={{ width: "100%", padding: "11px", borderRadius: 12, background: "#10b981", color: "#020617", fontWeight: 800, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, marginBottom: 18 }}>
              <Copy style={{ width: 15, height: 15 }} />Copy Code to Clipboard
            </button>

            {/* Restore */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16, marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>📥 Restore from a Received Code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="import-code-input" type="text" placeholder="Paste a received profile code here…" style={{ flex: 1, padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-bright)", fontSize: 11, outline: "none" }} />
                <button onClick={() => {
                  const val = document.getElementById("import-code-input")?.value?.trim();
                  if (!val) return;
                  try {
                    const decoded = lzDecompress(val);
                    const parsed = JSON.parse(decoded);
                    const rawInp = parsed.inputs || parsed;
                    // Whitelist — same guard as JSON file import
                    const safeInp = { ...DEFAULT_INPUTS };
                    Object.keys(DEFAULT_INPUTS).forEach(k => { if (rawInp[k] !== undefined) safeInp[k] = rawInp[k]; });
                    setInputs(safeInp);
                    if (parsed.highlightPlan) setHighlightPlan(parsed.highlightPlan);
                    if (parsed.viewMode) setViewMode(parsed.viewMode);
                    if (parsed.basicPremiumPct != null) setBasicPremiumPct(parsed.basicPremiumPct);
                    if (parsed.scenarioLabelA != null) setScenarioLabelA(parsed.scenarioLabelA);
                    if (parsed.scenarioLabelB != null) setScenarioLabelB(parsed.scenarioLabelB);
                    if (parsed.whatIfPayoutAge != null) setWhatIfPayoutAge(parsed.whatIfPayoutAge);
                    if (parsed.whatIfSaTopup != null) setWhatIfSaTopup(parsed.whatIfSaTopup);
                    if (parsed.whatIfHousing != null) setWhatIfHousing(parsed.whatIfHousing);
                    if (parsed.whatIfSalaryBump != null) setWhatIfSalaryBump(parsed.whatIfSalaryBump);
                    if (parsed.showWhatIf != null) setShowWhatIf(parsed.showWhatIf);
                    if (parsed.isRealDollars != null) setIsRealDollars(parsed.isRealDollars);
                    // Scenario restore — handle both formats:
                    //   New format (V4-2026+): scenarioAInputs key holds just inputs; projection recalculated.
                    //   Old format (pre-Fix 2): scenarioA.inputs + scenarioA.projection stored directly.
                    // This mirrors the URL-parameter decode logic at the top of the mount useEffect.
                    let scenariosRestored = false;
                    if ('scenarioAInputs' in parsed) {
                      if (parsed.scenarioAInputs && typeof parsed.scenarioAInputs === 'object') {
                        const safeScenA = { ...DEFAULT_INPUTS };
                        Object.keys(DEFAULT_INPUTS).forEach(k => { if (parsed.scenarioAInputs[k] !== undefined) safeScenA[k] = parsed.scenarioAInputs[k]; });
                        setScenarioA({ inputs: safeScenA, projection: runProjectionEngine(safeScenA), payoutProj: null });
                        scenariosRestored = true;
                      } else { setScenarioA(null); } // explicit null = no scenario in this code
                    } else if (parsed.scenarioA && parsed.scenarioA.inputs && parsed.scenarioA.projection) {
                      // BUG-6 fix: old-format code with embedded projection — was restored as-is
                      // (stale rows, missing newer fields). Now regenerate from sanitised inputs.
                      const safeOldScenA = { ...DEFAULT_INPUTS };
                      Object.keys(DEFAULT_INPUTS).forEach(k => { if (parsed.scenarioA.inputs[k] !== undefined) safeOldScenA[k] = parsed.scenarioA.inputs[k]; });
                      setScenarioA({ inputs: safeOldScenA, projection: runProjectionEngine(safeOldScenA), payoutProj: null, label: parsed.scenarioA.label });
                      scenariosRestored = true;
                    } else { setScenarioA(null); }
                    if ('scenarioBInputs' in parsed) {
                      if (parsed.scenarioBInputs && typeof parsed.scenarioBInputs === 'object') {
                        const safeScenB = { ...DEFAULT_INPUTS };
                        Object.keys(DEFAULT_INPUTS).forEach(k => { if (parsed.scenarioBInputs[k] !== undefined) safeScenB[k] = parsed.scenarioBInputs[k]; });
                        setScenarioB({ inputs: safeScenB, projection: runProjectionEngine(safeScenB), payoutProj: null });
                        scenariosRestored = true;
                      } else { setScenarioB(null); }
                    } else if (parsed.scenarioB && parsed.scenarioB.inputs && parsed.scenarioB.projection) {
                      // BUG-6 fix: same as Scenario A — regenerate from sanitised inputs.
                      const safeOldScenB = { ...DEFAULT_INPUTS };
                      Object.keys(DEFAULT_INPUTS).forEach(k => { if (parsed.scenarioB.inputs[k] !== undefined) safeOldScenB[k] = parsed.scenarioB.inputs[k]; });
                      setScenarioB({ inputs: safeOldScenB, projection: runProjectionEngine(safeOldScenB), payoutProj: null, label: parsed.scenarioB.label });
                      scenariosRestored = true;
                    } else { setScenarioB(null); }
                    setShowShareModal(false);
                    showToast(scenariosRestored
                      ? "✓ Profile restored — Compare scenarios loaded (projections recalculated)"
                      : "✓ Profile restored — all settings loaded");
                  } catch (e) { alert("Invalid code — please check and try again."); }
                }} style={{ padding: "10px 18px", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Load</button>
              </div>
            </div>

            {/* Deploy tip */}
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>🌐 Want a shareable public URL?</div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>Deploy the ZIP to <strong style={{ color: "var(--text-main)" }}>Vercel</strong> or <strong style={{ color: "var(--text-main)" }}>Netlify</strong> (free, ~2 min). Anyone with the URL can open the app and paste your code to see your exact projection. Use <strong style={{ color: "var(--text-main)" }}>Export Profile</strong> (💾) to back up your full .json file locally.</p>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP EXPORT MODAL */}
      {exportModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.92)", backdropFilter: "blur(8px)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 20, width: "100%", maxWidth: exportModal.type === "pdf" ? "1040px" : "740px", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-modal)" }}>

            {/* ── Header ── */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-bright)", margin: "0 0 3px" }}>
                  {exportModal.type === "pdf" && "📄 PDF Report"}
                  {exportModal.type === "csv" && "📊 CSV Export — Year-by-Year Projection"}
                  {exportModal.type === "json" && "💾 Profile Backup — JSON"}
                  {exportModal.type === "print" && "🖨️ Data Table — Plain Text"}
                  {exportModal.type === "milestone" && "🎯 Milestone Report"}
                </h3>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                  {exportModal.type === "pdf" && "Preview your report below. Use the buttons to print or save as PDF."}
                  {exportModal.type === "csv" && "Click Download to save the file, or select-all and copy to paste into Excel / Google Sheets."}
                  {exportModal.type === "json" && "Click Download to save your profile backup as a .json file."}
                  {(exportModal.type === "print" || exportModal.type === "milestone") && "Select all and copy, then paste into any text editor or spreadsheet."}
                </p>
              </div>
              <button onClick={() => setExportModal(null)} style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer", flexShrink: 0, marginLeft: 16, marginTop: 2 }}><X style={{ width: 20, height: 20 }} /></button>
            </div>

            {/* ── Action bar ── */}
            <div style={{ padding: "10px 16px", flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap", background: "var(--bg-muted)", borderBottom: "1px solid var(--border-subtle)", alignItems: "center" }}>
              {/* PDF actions */}
              {exportModal.type === "pdf" && (<>
                {/* Orientation: Chrome ignores @page size — user sets it in the print dialog */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 10, color: "#fbbf24" }}>
                  <span style={{ fontWeight: 700 }}>Landscape:</span> In print dialog → <strong style={{ color: "var(--text-main)" }}>More settings → Layout → Landscape</strong>
                </div>
                <button onClick={() => {
                  // Use the preview iframe directly — most reliable for @page CSS
                  const iframe = document.getElementById("pdf-preview-frame");
                  if (iframe?.contentDocument) {
                    try {
                      iframe.contentWindow.focus();
                      iframe.contentWindow.print();
                      showToast("🖨️ Print dialog open — set destination to Save as PDF");
                    } catch (e) {
                      // Fallback: open blob in new tab
                      const blob = new Blob([exportModal.content], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const win = window.open(url, "_blank");
                      if (win) { win.onload = () => { setTimeout(() => { win.focus(); win.print(); URL.revokeObjectURL(url); }, 600); }; }
                      else { URL.revokeObjectURL(url); showToast("⚠️ Allow pop-ups then try again"); }
                    }
                  } else {
                    const blob = new Blob([exportModal.content], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const win = window.open(url, "_blank");
                    if (win) { win.onload = () => { setTimeout(() => { win.focus(); win.print(); URL.revokeObjectURL(url); }, 600); }; showToast("📄 Print dialog opening"); }
                    else { URL.revokeObjectURL(url); showToast("⚠️ Allow pop-ups then try again"); }
                  }
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "#10b981", color: "#020617", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>
                  <Printer style={{ width: 14, height: 14 }} />Print / Save as PDF
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", fontSize: 10, color: "var(--text-muted)" }}>
                  In print dialog → destination: <strong style={{ color: "var(--text-main)", margin: "0 3px" }}>"Save as PDF"</strong> → click Save
                </div>
              </>)}

              {/* CSV / JSON download */}
              {(exportModal.type === "csv" || exportModal.type === "json") && (<>
                <button onClick={() => {
                  const mimeType = exportModal.type === "csv" ? "text/csv" : "application/json";
                  const fname = exportModal.filename || (exportModal.type === "csv" ? "projection.csv" : "profile.json");
                  try {
                    const blob = new Blob([exportModal.content], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = fname;
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
                    showToast(`✓ Downloading ${fname}`);
                  } catch (e) { showToast("Download blocked — select all text below and paste into a new file"); }
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "#10b981", color: "#020617", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>
                  <Download style={{ width: 14, height: 14 }} />Download {exportModal.type === "csv" ? "CSV" : "JSON"} File
                </button>
                <button onClick={() => {
                  const el = document.getElementById("export-modal-content");
                  if (el) { el.select(); try { document.execCommand("copy"); showToast("✓ Copied to clipboard"); } catch (e) { showToast("Press Ctrl+A then Ctrl+C to copy"); } }
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontWeight: 700, border: "1px solid rgba(96,165,250,0.3)", cursor: "pointer", fontSize: 12 }}>
                  <Copy style={{ width: 13, height: 13 }} />Select All &amp; Copy
                </button>
              </>)}

              {/* Text print / milestone */}
              {(exportModal.type === "print" || exportModal.type === "milestone") && (
                <button onClick={() => {
                  const el = document.getElementById("export-modal-content");
                  if (el) { el.select(); try { document.execCommand("copy"); showToast("✓ Copied — paste into any app and print"); } catch (e) { showToast("Press Ctrl+A then Ctrl+C to copy"); } }
                }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "#10b981", color: "#020617", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>
                  <Copy style={{ width: 13, height: 13 }} />Select All &amp; Copy
                </button>
              )}
            </div>

            {/* ── Content area ── */}
            <div style={{ flex: 1, overflow: "auto", padding: exportModal.type === "pdf" ? 0 : 12 }}>
              {exportModal.type === "pdf" ? (
                <iframe id="pdf-preview-frame" srcDoc={exportModal.content} style={{ width: "100%", height: "100%", minHeight: 560, border: "none", background: "#fff" }} title="PDF Report Preview" />
              ) : (
                <textarea id="export-modal-content" readOnly value={exportModal.content}
                  style={{ width: "100%", height: "100%", minHeight: 420, padding: 12, background: "var(--code-bg)", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--code-text)", fontSize: 11, fontFamily: "monospace", resize: "none", outline: "none", lineHeight: 1.5, boxSizing: "border-box" }}
                  onFocus={e => e.target.select()}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ONBOARDING MODAL */}
      {/* PRESET PROFILES MODAL */}
      {showPresets && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.88)", backdropFilter: "blur(6px)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-panel)", borderRadius: 20, border: "1px solid var(--border-strong)", width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text-bright)", margin: 0 }}>Sample Profiles</h3>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>Load a pre-built scenario to explore the tool — all values can be edited after loading.</p>
              </div>
              <button onClick={() => setShowPresets(false)} style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer", padding: 4 }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {PRESET_PROFILES.map(p => (
                <button key={p.id} onClick={() => {
                  const merged = { ...DEFAULT_INPUTS, ...p.inputs };
                  setInputs(merged);
                  // BUG-12 fix: stamp lastSavedRef so the beforeunload "unsaved changes"
                  // guard doesn't fire the moment a user navigates away after loading a
                  // preset — the profile was just loaded fresh, nothing has changed yet.
                  lastSavedRef.current = JSON.stringify(merged);
                  setInputErrors({});
                  // Clear scenario comparison slots — a sample profile is a fresh start;
                  // leaving stale scenarios from the previous session would show mismatched
                  // Compare data (old profile's scenarios vs. new profile's inputs).
                  setScenarioA(null);
                  setScenarioB(null);
                  setScenarioLabelA("");
                  setScenarioLabelB("");
                  // Clear What-If overrides — old values are meaningless against new inputs.
                  setShowWhatIf(false);
                  setWhatIfPayoutAge(null);
                  setWhatIfSaTopup(null);
                  setWhatIfHousing(null);
                  setWhatIfSalaryBump(null);
                  setWhatIfContribStop(null);
                  setWhatIfOaDrawdown(null);
                  setWhatIfSrsContrib(null);
                  setWhatIfPrivGrowth(null);
                  setShowPresets(false);
                  showToast(`✓ Loaded: ${p.label}`);
                }} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)", borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left", width: "100%", transition: "border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#fbbf24"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
                >
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{p.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-bright)", marginBottom: 3 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{p.desc}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, flexShrink: 0 }}>Load →</div>
                </button>
              ))}
            </div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-base)", borderRadius: "0 0 20px 20px" }}>
              <p style={{ fontSize: 10, color: "var(--text-subtle)", margin: 0 }}>⚠ Loading a sample profile will overwrite your current inputs. Export your profile first if you want to keep it.</p>
            </div>
          </div>
        </div>
      )}
      {showWelcome && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.85)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 24, width: "100%", maxWidth: 640, height: "min(90vh,700px)", overflow: "hidden", boxShadow: "var(--shadow-modal)", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div className="cpf-welcome-header" style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ background: "#10b98122", padding: 10, borderRadius: 12 }}>
                  {welcomeStep === 0 && <Calculator style={{ width: 24, height: 24, color: "#10b981" }} />}
                  {welcomeStep === 1 && <User style={{ width: 24, height: 24, color: "#3b82f6" }} />}
                  {welcomeStep === 2 && <LayoutDashboard style={{ width: 24, height: 24, color: "#a855f7" }} />}
                  {welcomeStep === 3 && <Lightbulb style={{ width: 24, height: 24, color: "#fbbf24" }} />}
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-bright)", marginBottom: 2 }}>
                    {welcomeStep === 0 && "Welcome to CPF Planner Pro"}
                    {welcomeStep === 1 && "Setting Up Your Profile"}
                    {welcomeStep === 2 && "Exploring the Dashboard"}
                    {welcomeStep === 3 && "Advanced Features & Disclaimer"}
                  </h2>
                  <p style={{ color: "var(--text-subtle)", fontSize: 11, margin: 0 }}>
                    {welcomeStep === 0 && "Your end-to-end Singapore retirement simulation engine"}
                    {welcomeStep === 1 && "Step 1 of 3 — The Input Engine (left panel)"}
                    {welcomeStep === 2 && "Step 2 of 3 — The right panel tabs"}
                    {welcomeStep === 3 && "Step 3 of 3 — Power tools and legal notice"}
                  </p>
                </div>
              </div>
              <button onClick={closeWelcome} style={{ background: "none", border: "none", color: "var(--text-subtle)", cursor: "pointer" }}><X style={{ width: 20, height: 20 }} /></button>
            </div>

            {/* Body */}
            <div className="cpf-welcome-body" style={{ padding: "18px 20px", flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
              {welcomeStep === 0 && (
                <>
                  <p style={{ color: "var(--text-main)", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>This tool models your entire CPF journey — from today's balances through to monthly payouts in retirement — using <strong>2026 CPF Board rates and policies</strong>.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    {[
                      ["Year-by-year accumulation", TrendingUp], ["CPF LIFE plan comparison", ShieldCheck],
                      ["Monte Carlo stress testing (Mild / Base / Stress variance)", Activity], ["Milestone alerts", Bell],
                      ["OA→SA / OA→RA transfers + ⚡ Fill Gap", ArrowRightLeft], ["Holistic Strategy & income gap analysis", Target],
                      ["OA Drawdown decumulation engine", Download], ["What-If Explorer sliders", SlidersHorizontal],
                      ["SRS — tax-deferred retirement savings", BookOpen], ["Property Monetisation (LBS / downgrade)", Home],
                      ["Die with Zero — PMT draw-down planner", Clock], ["7 sample profiles to explore instantly", Users],
                      ["PR G/G & F/G contribution rates", Users], ["Recurring / One-Time frequency toggles", ArrowRightLeft],
                      ["For Loved One CPF transfers (OA→MA / OA→SA / OA→RA)", Users], ["Annual Cashflow Ledger", TableIcon],
                      ["Education Loan from OA (40% ceiling)", BookOpen], ["PwD MRSS bypass (age-55 waiver)", ShieldCheck],
                      ["MMSS — MA top-up matching grant", Gift], ["SA / RA balance split view at age 55", Split],
                      ["Retirement Sum Growth — adjustable FRS/BHS projection rate", TrendingUp], ["Phased Salary & Career Break modelling", Briefcase],
                      ["Life Events & Stress Testing (retrenchment, medical, windfall)", Activity],
                    ].map(([text, Icon], i) => (
                      <div key={i} style={{ background: "var(--bg-muted)", padding: "12px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--border-subtle)" }}>
                        <Icon style={{ width: 16, height: 16, color: "#10b981" }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-highlight)" }}>{text}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "var(--bg-base)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}><strong style={{ color: "var(--text-bright)" }}>Data stays on your device.</strong> Use <strong style={{ color: "var(--text-bright)" }}>Export Profile</strong> to back up your inputs as a JSON file, or Share to generate an encoded profile code you can send to others. Hit <strong style={{ color: "var(--text-bright)" }}>Samples</strong> in the header to load a pre-built profile and explore the tool instantly.</p>
                  </div>
                </>
              )}
              {welcomeStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    ["1", "Enter your CPF balances & select citizenship", "Type your current OA, SA, and MA balances. Select Male or Female — this sets the correct CPF LIFE payout ratio. Select SC or PR — citizenship gates which schemes apply (MRSS/MMSS are SC-only; PR Year 1/2 use lower contribution rates). The progress bars compare against the 2026 FRS ($220,400), ERS ($440,800), and BHS ($79,000) milestones.", "#3b82f6"],
                    ["2", "Auto-Calc your contributions", "Click ⚡ Auto-Calc in the Mandatory Contributions panel. Enter OW (Monthly Gross), AW (Annual Bonus), and Salary Growth %, then hit the button. SC uses full rates. PR: select tenure year (1/2/3+) and rate type — G/G (graduated employer, default) or F/G (full employer 17%, requires joint CPF application). The engine advances PR tiers automatically year by year. Use Phase 2 / Career Break (below Salary Growth) to model a growth rate change at a specific age or a contribution pause (e.g. sabbatical, NS, parental leave). Set Retirement Sum Growth (default 3%) to control how fast the FRS/BHS targets rise.", "#10b981"],
                    ["3", "Inflows, Outflows & CPF Transfers", "The Inflows panel has: VC3A (single cash lump-sum, auto-split by age-band), RSTU (SA/RA cash top-up, tax-relievable), VHR, gov grants, MRSS (RA top-up, up to $2,000/yr · RA below BRS), MMSS (MA match, up to $1,000/yr), and WIS/Workfare (60% CPF for employees, 90% MA for SEPs). Outflows: Housing Loan (OA), medical, CPFIS. CPF Transfers: OA→MA, OA→SA (pre-55, capped at FRS), and OA→RA (age 55+, capped at ERS).", "#a855f7"],
                    ["4", "Set your life-phase timelines", "Use Contrib Stop Age (when you retire) and Housing Stop Age (when your mortgage ends) to model real-world cash flow transitions accurately.", "#fbbf24"],
                    ["5", "Set up SRS (optional)", "If you contribute to the Supplementary Retirement Scheme, enter your SRS balance, annual contribution, and drawdown start age in the SRS panel. Contributions are tax-deductible; 50% of withdrawals are taxable from age 63. All funds must be withdrawn within 10 years.", "#10b981"],
                                    ].map(([num, title, desc, color]) => (
                    <div key={num} style={{ display: "flex", gap: 16 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{num}</div>
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-bright)", marginBottom: 4 }}>{title}</h4>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {welcomeStep === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    ["Summary", PieChart, "#10b981", "Key metrics at a glance: total CPF at payout age, 20% RA-to-OA transfer notice, net worth breakdown, milestone alerts, and the What-If Explorer sliders."],
                    ["Strategy", Target, "#f43f5e", "Holistic retirement income planner. Set a Target Monthly Income, then use ⚡ Fill Gap to auto-calculate the OA Drawdown needed to close the shortfall. Shows CPF LIFE + OA Drawdown + SRS + Private Assets in a Gantt timeline and income table. Displays real OA exhaustion age."],
                    ["Accumulation", BarChart3, "#3b82f6", "Stacked area chart of OA/SA/MA/RA year-by-year. Toggle Monte Carlo to overlay a P10–P90 confidence band from 200 simulations. Choose Mild (±0.5%), Base (±1%), or Stress (±2%) variance — the active band is shown on the Probability of Sufficiency badge."],
                    ["LIFE Comparison", ShieldCheck, "#a855f7", "Side-by-side payout curves for Standard, Escalating, and Basic plans. Basic payout = PMT formula; bequest in Phase 1 includes full premium refund. Vertical lines mark exact break-even ages."],
                    ["Compare", Split, "#fb923c", "Save two scenarios (e.g. retire at 65 vs 70) and view a colour-coded diff table showing every metric that changes between them."],
                    ["Data Table", TableIcon, "#fbbf24", "Full year-by-year projection table with sticky Age column, Yield (B/S/E), and IRR %. Switch to the Cashflow Ledger sub-tab for a complete annual breakdown of every inflow, outflow, and interest component. Download either view as CSV."]
                  ].map(([title, Icon, color, desc]) => (
                    <div key={title}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}15`, border: `1px solid ${color}33`, padding: "4px 10px", borderRadius: 8, marginBottom: 8 }}>
                        <Icon style={{ width: 12, height: 12, color }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>{title}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</p>
                    </div>
                  ))}
                </div>
              )}
              {welcomeStep === 3 && (
                <div>
                  <div className="welcome-step3-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {[
                      ["Share Link", Link, "Generates a URL with your full profile encoded. Anyone opening the link sees your exact inputs and projection — no file needed."],
                      ["PDF Report", Download, "Print-ready 6-page report: cover, inputs & CPF LIFE, charts, projection & sensitivity, Decumulation Strategy (income table + OA exhaustion), milestones & disclaimer."],
                      ["SEP Mode", Briefcase, "Self-Employed mode: no mandatory contributions. VC3A up to $37,740/yr proportionally allocated. BHS, ERS, and AW ceiling enforced."],
                      ["Monte Carlo", Activity, "200 simulations with user-selectable variance: Mild ±0.5% / Base ±1% / Stress ±2%. Toggle in the Accumulation tab. Shows probability of meeting FRS at payout age and a live P10–P90 confidence band on the chart."],
                      ["Retirement Sum Growth", TrendingUp, "Control the annual rate at which FRS, BRS, ERS, and BHS targets rise (default 3%, CPF Board historical average). Lower it for a conservative FRS target; raise it for a pessimistic view. Preset buttons: 2% / 3% / 4%. Found in the Salary section."],
                      ["Phased Salary & Career Break", Briefcase, "Model two-phase salary growth (e.g. 4%/yr to age 45, then 1%/yr after) or pause contributions entirely for a career break age range (sabbatical, NS, parental leave). Both affect all mandatory contribution projections. Found in the Salary section below Retirement Sum Growth."],
                      ["Life Events", Activity, "Overlay stress-test events: Retrenchment, Career Break (contributions pause), Medical Crisis (draws from OA/private), Windfall (one-off inflow), Early Retirement, or Hyperinflation. Visible as coloured bands on the Accumulation chart and a row in the Strategy Gantt. Found in the Life Events panel."],
                      ["SRS", BookOpen, "Supplementary Retirement Scheme — tax-deductible contributions up to $15,300/yr (SC/PR). 50% of withdrawals taxable from age 63. Must deplete within 10 years of first withdrawal. Modelled in the SRS panel."],
                      ["Property Monetisation", Home, "Model a one-time monetisation event: downgrade, Lease Buyback Scheme, or Silver Housing Bonus. Net cash proceeds go to private assets; RA top-up credited to RA. Now in the Property & Timelines panel."],
                      ["Die with Zero Mode", Clock, "Toggle in Decumulation & Goals. Uses the PMT annuity formula to compute the optimal monthly draw from OA, SRS, and Private Assets so all reach $0 at your target age. RA/CPF LIFE cannot be depleted."],
                      ["Sample Profiles", Users, "7 pre-built scenarios (Blank Slate, Typical Employee, Late Starter, SEP, High Earner, Near Retirement, Post-55). Load from the Samples button in the header — a great way to explore the tool quickly."],
                      ["OA→SA / OA→RA Transfer", ArrowRightLeft, "Pre-55: transfer OA to SA (capped at FRS). Age 55+: SA closes — transfer OA to RA instead (capped at ERS, $440,800). Both earn 4% vs 2.5%. Irreversible. No tax relief. CPF Transfers panel."],
                      ["OA Drawdown & ⚡ Fill Gap", Download, "Draw monthly cash from OA post-retirement to supplement CPF LIFE. Set a Target Monthly Income, then click ⚡ Fill Gap to auto-calculate the exact OA draw needed. Shows OA exhaustion age and sustainability warning."],
                      ["Property Pledge", Target, "Only BRS needed in RA at 55 (not FRS). Reduces locked-in RA but also reduces monthly CPF LIFE payouts. Toggle in Advanced panel."],
                      ["MRSS Grant", Gift, "Matched Retirement Savings Scheme — govt matches RSTU cash top-ups up to $2,000/yr (lifetime cap $20,000) for Singapore Citizens aged 55+ with RA below BRS."],
                      ["What-If Explorer", SlidersHorizontal, "Drag sliders to instantly see how changing payout age, SA top-ups, or housing affects your outcome. Hover any point on the What-If chart for a full per-account breakdown tooltip."],
                      ["Gender Toggle", Users, "Male/Female selection (Profile section). Affects CPF LIFE payout — female payouts are ~7% lower (0.93× male) due to longer statistical life expectancy. Estimates based on 2026 CPF Board Estimator data."],
                      ["MMSS Grant", Gift, "Matched MediSave Savings Scheme — govt tops up MA dollar-for-dollar up to $1,000/yr for Singapore Citizens aged 55–70 with MA below half of the Basic Healthcare Sum (~$39,500). SC only. Auto-assessed."],
                      ["Education Loan from OA", BookOpen, "Model CPF Education Scheme withdrawals. Engine enforces the 40% OA ceiling (based on accumulated OA savings) and the age 55+ FRS-first rule. Modelled as a pure OA outflow in the Outflows panel."],
                      ["PwD MRSS Bypass", ShieldCheck, "Enable the Person with Disabilities (PwD) flag in Profile to unlock MRSS eligibility below age 55. PwD members are exempt from the age-55 requirement for the Matched Retirement Savings Scheme. SC only."],
                      ["PR G/G & F/G Rates", Users, "PR members in Year 1 or 2 can select G/G (graduated employer, default) or F/G (full employer 17% — requires joint CPF application). The engine automatically advances Yr 1 → Yr 2 → Yr 3+ rates year-by-year in the projection."],
                      ["Recurring / One-Time Toggles", ArrowRightLeft, "Every inflow and outflow field has a frequency toggle. 'Recurring' applies the amount every projection year. 'One-Time' applies it only in the first projection year — ideal for lump-sum top-ups or one-off withdrawals."],
                    ].map(([title, Icon, desc]) => (
                      <div key={title} style={{ background: "var(--bg-muted)", padding: "12px", borderRadius: 10, border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <Icon style={{ width: 14, height: 14, color: "#3b82f6" }} />
                          <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-bright)" }}>{title}</h4>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", padding: "12px 14px", borderRadius: "10px" }}>
                    <p style={{ fontSize: 10, color: "#fbbf24", lineHeight: 1.6, textAlign: "justify" }}><strong style={{ fontWeight: 800 }}>Legal Disclaimer:</strong> {LEGAL_DISCLAIMER} By using this tool, you acknowledge and accept that you are using the information provided at your own risk.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="cpf-welcome-footer" style={{ padding: "20px 32px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-base)" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ width: i === welcomeStep ? 24 : 8, height: 8, borderRadius: 4, background: i === welcomeStep ? "#10b981" : "var(--border-strong)", transition: "all 0.3s" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {welcomeStep > 0 && <button onClick={() => setWelcomeStep(s => s - 1)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-panel)", color: "var(--text-highlight)", border: "1px solid var(--border-strong)", cursor: "pointer" }}>Back</button>}
                {welcomeStep < 3 ? (
                  <button onClick={() => setWelcomeStep(s => s + 1)} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#10b981", color: "#020617", border: "none", cursor: "pointer" }}>Next &rarr;</button>
                ) : (
                  <button onClick={closeWelcome} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#10b981", color: "#020617", border: "none", cursor: "pointer" }}>I Understand &mdash; Start Planning</button>
                )}
                <button onClick={closeWelcome} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-strong)", cursor: "pointer" }}>Skip</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0, zIndex: 50, backdropFilter: "blur(8px)" }}>
        <div className="cpf-page-wrap" data-mode={desktopMode} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ background: "#10b981", padding: 8, borderRadius: 12 }}>
              <Calculator style={{ color: "#020617", width: 18, height: 18 }} />
            </div>
            <div>
              <div className="cpf-logo-text" style={{ fontWeight: 900, fontSize: 16, background: "linear-gradient(90deg,#10b981,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", whiteSpace: "nowrap" }}>CPF Planner Pro</div>
              <div className="cpf-logo-sub" style={{ fontSize: 9, color: "#10b981", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Retirement Engine v2026</div>
            </div>
          </div>
          <div className="cpf-header-actions" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 auto", minWidth: 0 }}>
            {/* Sidebar toggle — tablet/mobile only via CSS */}
            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(v => !v)} style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 5, background: sidebarOpen ? "rgba(16,185,129,0.12)" : "var(--bg-panel)", border: `1px solid ${sidebarOpen ? "rgba(16,185,129,0.4)" : "var(--border-strong)"}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: sidebarOpen ? "#34d399" : "var(--text-muted)" }}>
              <SlidersHorizontal style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 10, fontWeight: 700 }}>{sidebarOpen ? "Inputs ▲" : "Inputs ▼"}</span>
            </button>
            {/* Mobile hamburger menu button */}
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(v => !v)} style={{ alignItems: "center", justifyContent: "center", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "var(--text-muted)" }}>
              <AlignJustify style={{ width: 18, height: 18 }} />
            </button>
            {/* Real vs Nominal Toggle */}
            <div style={{ display: "flex", background: "var(--bg-panel)", padding: 4, borderRadius: 8, border: "1px solid var(--border-strong)" }}>
              <button onClick={() => setIsRealDollars(false)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: !isRealDollars ? "var(--border-strong)" : "transparent", color: !isRealDollars ? "var(--text-bright)" : "var(--text-muted)" }}>Nom.</button>
              <button onClick={() => setIsRealDollars(true)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: isRealDollars ? "#2563eb" : "transparent", color: isRealDollars ? "#fff" : "var(--text-muted)" }}>Real</button>
            </div>

            <button onClick={handleReset} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", color: "#f87171", padding: "6px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(239,68,68,0.35)", cursor: "pointer" }} title="Reset all inputs and scenarios to defaults">
              <RotateCcw style={{ width: 12, height: 12 }} />Reset
            </button>
            {/* Rev#18: Unsaved changes badge — appears when inputs differ from last export/import/reset */}
            {hasUnsaved && (
              <span title="Inputs have changed since last export — click Export Profile to save" style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "6px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(251,191,36,0.4)", animation: "unsavedPulse 2.4s ease-in-out infinite", whiteSpace: "nowrap", userSelect: "none" }}>
                ● Unsaved
              </span>
            )}
            <button onClick={() => setShowPresets(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(251,191,36,0.12)", color: "#fbbf24", padding: "6px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(251,191,36,0.3)", cursor: "pointer" }} title="Load a sample scenario to explore different profiles">
              <Users style={{ width: 12, height: 12 }} />Samples
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "6px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }} title="Load a previously saved JSON profile">
              <Upload style={{ width: 12, height: 12 }} />Import Profile<input type="file" accept=".json" style={{ display: "none" }} onClick={(e) => { e.target.value = null; }} onChange={handleImportProfile} />
            </label>
            <button onClick={handleExportProfile} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "6px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }} title="Save inputs as a JSON backup file">
              <Download style={{ width: 12, height: 12 }} />Export Profile
            </button>
            <button onClick={() => {
              try {
                const fullState = { inputs, activeTab, highlightPlan, viewMode, basicPremiumPct, scenarioLabelA, scenarioLabelB, scenarioAInputs: scenarioA?.inputs ?? null, scenarioBInputs: scenarioB?.inputs ?? null, whatIfPayoutAge, whatIfSaTopup, whatIfHousing, whatIfSalaryBump, showWhatIf, isRealDollars, pdfOrientation, appVersion: "V4-2026" }; // Fix 2: scenario inputs included
                const code = lzCompress(JSON.stringify(fullState));
                const base = (window.location.origin + window.location.pathname).replace(/\/$/, '');
                const shareURL = `${base}?p=${code}`;
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(shareURL)
                    .then(() => showToast("✓ Share link copied — opens app with your exact inputs!"))
                    .catch(() => { prompt("Copy & share this link:", shareURL); });
                } else { prompt("Copy & share this link:", shareURL); }
              } catch (e) { showToast("Could not generate share link: " + e.message); }
            }} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "6px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }} title="Copy a shareable URL encoding all inputs, active tab, and Compare scenario slots A &amp; B. Anyone opening this link sees your exact projection. Use Export Profile for a JSON backup.">
              <Link style={{ width: 12, height: 12 }} />Share Link
            </button>
            <button onClick={generatePDF} disabled={isGeneratingPdf} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "6px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(16,185,129,0.4)", cursor: "pointer", opacity: isGeneratingPdf ? 0.5 : 1 }} title="Generate a full PDF report with all charts and tables">
              {isGeneratingPdf ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Printer style={{ width: 12, height: 12 }} />}PDF Report
            </button>

            {/* Desktop Viewport Mode: FHD / HD / Auto — hidden on mobile via .desktop-only */}
            <div className="desktop-only" style={{ display: "flex", background: "var(--bg-panel)", padding: 4, borderRadius: 8, border: "1px solid var(--border-strong)", gap: 0 }}>
              {[["fhd", "FHD", "1920px"], ["hd", "HD", "1440px"], ["auto", "Auto", ""]].map(([mode, label, sub]) => (
                <button key={mode} onClick={() => setDesktopMode(mode)} title={sub || "Follow screen width"} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", lineHeight: 1.3, background: desktopMode === mode ? "var(--border-strong)" : "transparent", color: desktopMode === mode ? "var(--text-bright)" : "var(--text-muted)" }}>
                  <span>{label}</span>
                  {sub && <span style={{ fontSize: 7, opacity: 0.55, fontWeight: 500 }}>{sub}</span>}
                </button>
              ))}
            </div>

            {/* Theme Toggle */}
            <div style={{ display: "flex", background: "var(--bg-panel)", padding: 4, borderRadius: 8, border: "1px solid var(--border-strong)" }}>
              <button onClick={() => setThemeMode('dark')} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: themeMode === 'dark' ? "var(--border-strong)" : "transparent", color: themeMode === 'dark' ? "var(--text-bright)" : "var(--text-muted)" }}>
                <Moon style={{ width: 11, height: 11 }} />Dark
              </button>
              <button onClick={() => setThemeMode('light')} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: themeMode === 'light' ? "var(--border-strong)" : "transparent", color: themeMode === 'light' ? "var(--text-bright)" : "var(--text-muted)" }}>
                <Sun style={{ width: 11, height: 11 }} />Light
              </button>
              <button onClick={() => setThemeMode('system')} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: themeMode === 'system' ? "var(--border-strong)" : "transparent", color: themeMode === 'system' ? "var(--text-bright)" : "var(--text-muted)" }}>
                <Monitor style={{ width: 11, height: 11 }} />System
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="cpf-mobile-menu">
          <div className="cpf-mobile-menu-row">
            <div style={{ display: "flex", background: "var(--bg-input)", padding: 4, borderRadius: 8, border: "1px solid var(--border-strong)" }}>
              <button onClick={() => setIsRealDollars(false)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: !isRealDollars ? "var(--border-strong)" : "transparent", color: !isRealDollars ? "var(--text-bright)" : "var(--text-muted)" }}>Nominal</button>
              <button onClick={() => setIsRealDollars(true)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: isRealDollars ? "#2563eb" : "transparent", color: isRealDollars ? "#fff" : "var(--text-muted)" }}>Real $</button>
            </div>
            <div style={{ display: "flex", background: "var(--bg-input)", padding: 4, borderRadius: 8, border: "1px solid var(--border-strong)" }}>
              <button onClick={() => setThemeMode('dark')} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: themeMode === 'dark' ? "var(--border-strong)" : "transparent", color: themeMode === 'dark' ? "var(--text-bright)" : "var(--text-muted)" }}>● Dark</button>
              <button onClick={() => setThemeMode('light')} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: themeMode === 'light' ? "var(--border-strong)" : "transparent", color: themeMode === 'light' ? "var(--text-bright)" : "var(--text-muted)" }}>○ Light</button>
            </div>
            {/* Sidebar toggle shortcut in mobile dropdown */}
            <button onClick={() => { setSidebarOpen(v => !v); setMobileMenuOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: `1px solid ${sidebarOpen ? "rgba(16,185,129,0.4)" : "var(--border-strong)"}`, background: sidebarOpen ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.15)", color: sidebarOpen ? "#34d399" : "var(--text-subtle)", cursor: "pointer" }}>
              <SlidersHorizontal style={{ width: 13, height: 13 }} />{sidebarOpen ? "Hide Inputs" : "Show Inputs"}
            </button>
          </div>
          <div className="cpf-mobile-menu-row">
            <button onClick={() => { setMobileMenuOpen(false); setShowPresets(true); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.12)", color: "#fbbf24", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(251,191,36,0.3)", cursor: "pointer" }}>
              <Users style={{ width: 13, height: 13 }} />Samples
            </button>
            <button onClick={() => { setMobileMenuOpen(false); handleReset(); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.12)", color: "#f87171", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(239,68,68,0.35)", cursor: "pointer" }} title="Reset all inputs and scenarios to defaults">
              <RotateCcw style={{ width: 13, height: 13 }} />Reset
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }}>
              <Upload style={{ width: 13, height: 13 }} />Import Profile
              <input type="file" accept=".json" style={{ display: "none" }} onClick={(e) => { e.target.value = null; }} onChange={handleImportProfile} />
            </label>
            {/* Rev#18: mobile unsaved badge — same logic as desktop */}
            {hasUnsaved && (
              <span title="Inputs have changed since last export" style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "8px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(251,191,36,0.4)", animation: "unsavedPulse 2.4s ease-in-out infinite", whiteSpace: "nowrap", userSelect: "none" }}>
                ● Unsaved
              </span>
            )}
            <button onClick={() => { setMobileMenuOpen(false); handleExportProfile(); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }}>
              <Download style={{ width: 13, height: 13 }} />Export Profile
            </button>
            <button onClick={() => {
              setMobileMenuOpen(false);
              try {
                const fullState = { inputs, activeTab, highlightPlan, viewMode, basicPremiumPct, scenarioLabelA, scenarioLabelB, scenarioAInputs: scenarioA?.inputs ?? null, scenarioBInputs: scenarioB?.inputs ?? null, whatIfPayoutAge, whatIfSaTopup, whatIfHousing, whatIfSalaryBump, showWhatIf, isRealDollars, pdfOrientation, appVersion: "V4-2026" }; // Fix 2: scenario inputs included
                const code = lzCompress(JSON.stringify(fullState));
                const base = (window.location.origin + window.location.pathname).replace(/\/$/, '');
                const shareURL = `${base}?p=${code}`;
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(shareURL).then(() => showToast("✓ Share link copied!")).catch(() => { prompt("Copy this link:", shareURL); });
                } else { prompt("Copy this link:", shareURL); }
              } catch (e) { showToast("Could not generate share link"); }
            }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(59,130,246,0.1)", color: "#60a5fa", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }}>
              <Link style={{ width: 13, height: 13 }} />Share Link
            </button>
            <button onClick={() => { setMobileMenuOpen(false); generatePDF(); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "8px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid rgba(16,185,129,0.4)", cursor: "pointer" }}>
              <Printer style={{ width: 13, height: 13 }} />PDF Report
            </button>
          </div>
        </div>
      )}

      {/* Mobile fixed-header spacer — hidden on desktop via CSS */}
      <div className="cpf-mobile-top-spacer" style={{ display: "none" }} />
      {isVcOverLimit && (
        <div style={{ background: "rgba(234,88,12,0.2)", borderBottom: "1px solid rgba(234,88,12,0.5)", padding: "8px 20px", textAlign: "center", color: "#fdba74", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "#fb923c" }} />VC Exceeds Available Limit ({formatCurrency(maxAllowableVC)})
        </div>
      )}
      <div
        className="cpf-layout"
        data-mode={desktopMode}
        style={{
          maxWidth: desktopMode === 'fhd' ? '1920px' : desktopMode === 'hd' ? '1440px' : '100%',
          flex: '1 1 0',
          overflow: 'hidden',
          background: 'var(--bg-base)'
        }}
      >
        {/* SIDEBAR — desktop: left column | tablet/mobile: collapsible strip */}
        <aside className="cpf-sidebar-wrap" style={{ background: "var(--bg-base)" }}>
          {/* Toggle bar — only visible on tablet/mobile via CSS .sidebar-toggle-btn */}
          <div className="sidebar-toggle-btn" style={{ display: "none", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", userSelect: "none", background: "var(--bg-panel)" }}>
            {/* Left: tap the label/chevron to open/close sidebar */}
            <div onClick={() => setSidebarOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
              <SlidersHorizontal style={{ width: 14, height: 14, color: "#10b981" }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-main)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Input Parameters</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginLeft: 4 }}>{sidebarOpen ? "▲" : "▼"}</span>
            </div>
            {/* Right: Expand All / Collapse All — only useful when sidebar is open */}
            {sidebarOpen && (
              <div style={{ display: "flex", gap: 4, marginLeft: 8 }} onClick={e => e.stopPropagation()}>
                <button onClick={expandAllSections} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                  <ChevronDown style={{ width: 10, height: 10 }} />All
                </button>
                <button onClick={collapseAllSections} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: "rgba(100,116,139,0.1)", color: "var(--text-muted)", border: "1px solid var(--border-strong)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                  <ChevronUp style={{ width: 10, height: 10 }} />None
                </button>
              </div>
            )}
          </div>
          {/* Sticky Expand / Collapse bar — always visible at top of sidebar while scrolling */}
          <div className="sidebar-sticky-bar" style={{ display: "flex", gap: 6, padding: "6px 8px", position: "sticky", top: 0, zIndex: 10, background: "var(--bg-base)", borderBottom: "1px solid var(--border-subtle)", backdropFilter: "blur(6px)" }}>
            <button onClick={expandAllSections} style={{ flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <ChevronDown style={{ width: 11, height: 11 }} />Expand All
            </button>
            <button onClick={collapseAllSections} style={{ flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "rgba(100,116,139,0.1)", color: "var(--text-muted)", border: "1px solid var(--border-strong)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <ChevronUp style={{ width: 11, height: 11 }} />Collapse All
            </button>
          </div>
          <div className={`cpf-sidebar-inner${sidebarOpen ? "" : " sidebar-collapsed"}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("profile")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("profile"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("profile") ? "rgba(56,189,248,0.08)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <User style={{ width: 14, height: 14, color: "var(--clr-sky)" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--clr-sky)" }}>Profile & Balances</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: saveStatus === "Saving..." ? "rgba(251,191,36,0.1)" : "rgba(56,189,248,0.12)", color: saveStatus === "Saving..." ? "#fbbf24" : "var(--clr-sky)" }}>
                    {saveStatus === "Saving..." ? <Loader2 style={{ width: 10, height: 10 }} /> : <CheckCircle2 style={{ width: 10, height: 10 }} />}{saveStatus}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("profile") ? "▲" : "▼"}</span>
                </div>
              </div>
              {openSections.has("profile") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--clr-sky)", textTransform: "uppercase", marginBottom: 4 }}>Name</label>
                    <input type="text" name="name" placeholder="e.g. John Doe" onFocus={(e) => e.target.select()} value={inputs.name} onChange={handleInputChange} aria-label="Member name" style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "flex-end" }}>
                    {[["currentYear", "Curr Year"], ["currentAge", "Curr Age"]].map(([n, l]) => (
                      <div key={n} style={{ minWidth: 0 }}>{/* minWidth:0 lets 1fr cells shrink below content width */}
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: inputErrors[n] ? "#f87171" : "var(--clr-sky)", textTransform: "uppercase", marginBottom: 4 }}>{l}{inputErrors[n] && <span style={{ marginLeft: 4, fontSize: 9, color: "#f87171" }}>⚠</span>}</label>
                        <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l} aria-invalid={!!inputErrors[n]} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: `1px solid ${inputErrors[n] ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                        {/* Short errors (e.g. currentYear) stay inline; currentAge long errors rendered below the grid */}
                        {inputErrors[n] && n !== "currentAge" && <p style={{ fontSize: 10, color: "#f87171", marginTop: 4, marginBottom: 0, lineHeight: 1.4, wordBreak: "break-word" }}>⚠ {inputErrors[n]}</p>}
                      </div>
                    ))}
                    <div>
                      <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--clr-sky)", textTransform: "uppercase", marginBottom: 4 }}>
                        Payout At {isForeigner && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4 }}>🔒 CPF LIFE N/A</span>}
                      </div>
                      <div style={{ opacity: isForeigner ? 0.3 : 1, pointerEvents: isForeigner ? "none" : "auto" }}>
                        <select name="payoutAge" value={inputs.payoutAge} onChange={handleInputChange} aria-label="CPF LIFE payout start age" style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                          {[65, 66, 67, 68, 69, 70].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* currentAge error shown full-width below the grid — message is too long for a 1fr column */}
                  {inputErrors.currentAge && (
                    <p style={{ fontSize: 10, color: "#f87171", margin: "2px 0 0", lineHeight: 1.5 }}>⚠ {inputErrors.currentAge}</p>
                  )}
                  {/* A9: Age-conditional info banners for minors */}
                  {(Number(inputs.currentAge) || 0) < 16 && (Number(inputs.currentAge) || 0) >= 0 && (
                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", fontSize: 10, color: "#fbbf24", lineHeight: 1.5 }}>
                      👶 <strong>Under 16:</strong> Parents or guardians manage CPF transactions on the member's behalf. Cash top-ups to SA/MA and OA→SA transfers are supported. CPFIS (age 18+) and CPF nominations (age 16+) are not available.
                    </div>
                  )}
                  {(Number(inputs.currentAge) || 0) >= 16 && (Number(inputs.currentAge) || 0) < 18 && (
                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", fontSize: 10, color: "#93c5fd", lineHeight: 1.5 }}>
                      ℹ️ <strong>Age 16–17:</strong> CPF nominations are available. CPFIS requires age 18+ and is disabled in the Outflows section below.
                    </div>
                  )}
                  {/* Gender toggle — affects CPF LIFE monthly payout ratio; locked for foreigners */}
                  <div style={{ opacity: isForeigner ? 0.35 : 1, pointerEvents: isForeigner ? "none" : "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Users style={{ width: 13, height: 13, color: "var(--clr-sky)" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)", textTransform: "uppercase" }}>Gender</span>
                      <TooltipBox id="t-gender" text={isForeigner ? "Gender affects CPF LIFE payouts (SC/PR only). Not applicable for foreigners." : "Affects CPF LIFE payout. Female payouts are ~7% lower than male (0.93× multiplier) due to longer life expectancy — the annuity pool must fund more years. Estimates based on 2026 CPF Board data."} />
                      {isForeigner && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 2 }}>🔒 CPF LIFE N/A</span>}
                    </div>
                    <div style={{ display: "flex", background: "var(--bg-panel)", padding: 3, borderRadius: 7, gap: 2 }}>
                      <button onClick={() => setInputs(p => ({ ...p, isMale: true }))} aria-pressed={inputs.isMale !== false} style={{ padding: "4px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.isMale !== false ? "var(--clr-sky)" : "transparent", color: inputs.isMale !== false ? "#020617" : "var(--text-muted)" }}>Male</button>
                      <button onClick={() => setInputs(p => ({ ...p, isMale: false }))} aria-pressed={inputs.isMale === false} style={{ padding: "4px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.isMale === false ? "#60a5fa" : "transparent", color: inputs.isMale === false ? "#020617" : "var(--text-muted)" }}>Female</button>
                    </div>
                  </div>
                  </div>

                  {/* Citizenship status — global gate for MRSS, MMSS, PR tenure warnings, and foreigner CPF lock */}
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: isForeigner ? "rgba(251,191,36,0.06)" : "var(--bg-muted)", border: `1px solid ${isForeigner ? "rgba(251,191,36,0.35)" : "var(--border-subtle)"}` }}>
                    {/* Row 1: SC / PR / Foreigner toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (inputs.citizenStatus || 'SC') === 'PR' || isForeigner ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isForeigner ? "#fbbf24" : "var(--text-highlight)", textTransform: "uppercase" }}>Citizenship</span>
                        <TooltipBox id="t-citizenship" text="Select SC (Singapore Citizen), PR (Permanent Resident), or Foreigner. SC/PR have CPF accounts — all CPF schemes, contributions, and top-ups apply. Foreigners have no CPF — all CPF sections are locked. Foreigners can use SRS (up to $35,700/yr), Property, and Private Assets. MRSS and MMSS are SC-only." />
                      </div>
                      <div style={{ display: "flex", background: "var(--bg-panel)", padding: 3, borderRadius: 7, gap: 2 }}>
                        <button onClick={() => setInputs(p => ({ ...p, citizenStatus: 'SC' }))}
                          style={{ padding: "4px 11px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                            background: (inputs.citizenStatus || 'SC') === 'SC' ? "var(--clr-sky)" : "transparent",
                            color: (inputs.citizenStatus || 'SC') === 'SC' ? "#020617" : "var(--text-muted)" }}>SC</button>
                        <button onClick={() => setInputs(p => ({ ...p, citizenStatus: 'PR', mrssGrant: 0, mmssGrant: 0 }))}
                          style={{ padding: "4px 11px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                            background: (inputs.citizenStatus || 'SC') === 'PR' ? "#fbbf24" : "transparent",
                            color: (inputs.citizenStatus || 'SC') === 'PR' ? "#020617" : "var(--text-muted)" }}>PR</button>
                        <button onClick={() => {
                          setInputs(p => ({ ...p,
                            citizenStatus: 'foreigner',
                            // Clear all CPF fields — foreigners have no CPF account
                            oaBalance: 0, saBalance: 0, maBalance: 0,
                            empOaCont: 0, empSaCont: 0, empMaCont: 0,
                            vc3aCash: 0, vcSaTopup: 0, vcMaCash: 0, vcVhr: 0,
                            annualGovGrant: 0, mrssGrant: 0, mmssGrant: 0, wisAmount: 0,
                            cpfisOaAmount: 0, cpfisSaAmount: 0,
                            oaToSaTransfer: 0, oaToMaTransfer: 0,
                            housingOutflow: 0, oaEduLoan: 0, oaWithdrawalAt55: 0,
                            oaDrawdownMonthly: 0, oaDrawdownStartAge: 0, oaDrawdownFloor: 0,
                            dieWithZeroEnabled: false,
                            usePropertyPledge: false, propMonetiseEnabled: false, // Q1: CPF/HDB-specific property schemes not available to foreigners
                          }));
                          // Q3: auto-collapse CPF-specific sections so the sidebar shows only relevant panels
                          setOpenSections(prev => {
                            const next = new Set(prev);
                            ['contribs', 'topups', 'outflows', 'transfers'].forEach(id => next.delete(id));
                            try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([...next])); } catch {}
                            return next;
                          });
                        }}
                          style={{ padding: "4px 11px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                            background: isForeigner ? "#f59e0b" : "transparent",
                            color: isForeigner ? "#020617" : "var(--text-muted)" }}>Foreigner</button>
                      </div>
                    </div>
                    {/* Foreigner info banner */}
                    {isForeigner && (
                      <div style={{ fontSize: 10, color: "#fde68a", lineHeight: 1.6, background: "rgba(251,191,36,0.08)", borderRadius: 7, padding: "6px 10px" }}>
                        🌐 <strong style={{ color: "#fbbf24" }}>No CPF account</strong> — CPF sections collapsed &amp; locked. Your primary tax-deferred vehicle is <strong>SRS</strong> (up to $35,700/yr). Property value tracking and Private Assets remain fully active. Property Pledge and Monetisation (LBS/SHB) are SC/PR-only and are hidden.
                      </div>
                    )}
                    {/* Row 2: PR Tenure — only shown when PR is selected */}
                    {(inputs.citizenStatus || 'SC') === 'PR' && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>PR Tenure</span>
                            <TooltipBox id="t-prYear" text="PR Year 1: 9% total contributions (5% employee + 4% employer). Year 2: intermediate rates. Year 3+: full SC/PR rates (37% total ≤55). Select the year that applies to your current PR status." />
                          </div>
                          <div style={{ display: "flex", background: "var(--bg-panel)", padding: 3, borderRadius: 7, gap: 2 }}>
                            {[[1,"Yr 1"],[2,"Yr 2"],[3,"Yr 3+"]].map(([val,label]) => (
                              <button key={val} onClick={() => setInputs(p => ({ ...p, prYear: val }))}
                                style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                                  background: (inputs.prYear || 3) === val ? "#fbbf24" : "transparent",
                                  color: (inputs.prYear || 3) === val ? "#020617" : "var(--text-muted)" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(inputs.prYear || 3) < 3 && (
                          <div style={{ marginBottom: 6 }}>
                            {/* G/G vs F/G rate type toggle — only relevant for PR Year 1 or 2 */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>Rate Type</span>
                                <TooltipBox id="t-prRateType" text="G/G (default): Both employer and employee pay graduated rates — no application needed. F/G (Full ER): Employer pays full 17% while employee still pays graduated (lower) rates — requires a voluntary joint application by both parties to CPF Board. F/G boosts the employee's CPF savings without extra cost to the employee." />
                              </div>
                              <div style={{ display: "flex", background: "var(--bg-panel)", padding: 3, borderRadius: 7, gap: 2 }}>
                                {[["GG", "G/G"], ["FG", "F/G"]].map(([val, label]) => (
                                  <button key={val} onClick={() => setInputs(p => ({ ...p, prRateType: val }))}
                                    style={{ padding: "3px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                                      background: (inputs.prRateType || 'GG') === val ? "#fbbf24" : "transparent",
                                      color: (inputs.prRateType || 'GG') === val ? "#020617" : "var(--text-muted)" }}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Warning box with rate-type-aware messaging */}
                            <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "5px 8px" }}>
                              <p style={{ fontSize: 10, color: "#fcd34d", margin: 0, lineHeight: 1.5 }}>
                                {(inputs.prRateType || 'GG') === 'FG'
                                  ? (inputs.prYear || 3) === 1
                                    ? "⚠ F/G Year 1: Employer pays full 17%, employee pays 5%. Total 22% (≤55). Requires joint CPF application."
                                    : "⚠ F/G Year 2: Employer pays full rates, employee pays graduated rates. Requires joint CPF application."
                                  : (inputs.prYear || 3) === 1
                                    ? "⚠ G/G Year 1: Both pay graduated rates — 9% total (≤55). Default arrangement, no application needed."
                                    : "⚠ G/G Year 2: Both pay graduated rates — 24% total (≤55). Default arrangement, no application needed."}
                              </p>
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
                          MRSS and MMSS grants not available to PRs
                        </p>
                      </div>
                    )}
                    {(inputs.citizenStatus || 'SC') === 'SC' && (
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, marginBottom: 0 }}>Full SC rates apply · MRSS and MMSS available</p>
                    )}
                  </div>
                  {/* PwD toggle — shown for SC members only (PRs cannot receive MRSS anyway) */}
                  {(inputs.citizenStatus || 'SC') === 'SC' && (
                    <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 8, background: inputs.isPwD ? "rgba(168,85,247,0.08)" : "var(--bg-muted)", border: `1px solid ${inputs.isPwD ? "rgba(168,85,247,0.35)" : "var(--border-subtle)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: inputs.isPwD ? "#c084fc" : "var(--text-muted)", textTransform: "uppercase" }}>Person with Disabilities</span>
                        <TooltipBox id="t-isPwD" text="PwD members may qualify for MRSS below age 55 (from 2026), provided their combined OA + SA balance is below the Basic Retirement Sum (BRS). For members aged 55 and above, the standard MRSS eligibility applies regardless of PwD status. SC only — this flag has no effect for PR members." />
                      </div>
                      <button
                        onClick={() => setInputs(p => ({ ...p, isPwD: !p.isPwD }))}
                        style={{ padding: "3px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.isPwD ? "#c084fc" : "var(--bg-panel)", color: inputs.isPwD ? "#020617" : "var(--text-muted)" }}>
                        {inputs.isPwD ? "ON" : "OFF"}
                      </button>
                    </div>
                  )}
                  {/* CPF Balances + Goal Trackers — locked for foreigners.
                      Structure: position:relative gate → opacity/pointer-events dim → content
                                              → overlay (absolute, inside gate) → gate closes.
                      The overlay MUST be inside position:relative before it closes so
                      inset:0 is contained to this block and does not cover the whole sidebar. */}
                  <div style={{ position: "relative" }}>
                    {/* Single opacity wrapper covers BOTH balance inputs AND goal trackers */}
                    <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto" }}>
                      {/* Balance inputs */}
                      {[["oaBalance", "Ordinary (OA)"], ["saBalance", is55Plus ? "Retirement (RA)" : "Special (SA)"], ["maBalance", "MediSave (MA)"]].map(([n, l]) => (
                        <div key={n}>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--clr-sky)", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                          <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l + ' balance'} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                        </div>
                      ))}
                      {/* Goal Trackers */}
                      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                        {/* SA/RA Goal */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 700, color: "var(--text-highlight)", marginBottom: 8 }}>
                            <span>{is55Plus ? "RA" : "SA"} Goal <TooltipBox id="t-ers" text={`Basic Retirement Sum (BRS): ${formatCurrency(currentBRS)} · Full Retirement Sum (FRS): ${formatCurrency(currentFRS)} · Enhanced Retirement Sum (ERS): ${formatCurrency(currentERS)}`} /></span>
                            <span style={{ color: currentSaRa >= currentFRS ? "var(--clr-sky)" : "#fbbf24", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
                              {Math.round((currentSaRa / currentFRS) * 100)}%{currentSaRa >= currentFRS ? " ✓" : ""}
                            </span>
                          </div>
                          <div style={{ width: "100%", background: "var(--bg-input)", borderRadius: 999, height: 10, overflow: "hidden", position: "relative" }}>
                            {[25, 50].map(p => <div key={p} style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "var(--bg-base)", zIndex: 1 }} />)}
                            <div style={{ height: 10, borderRadius: 999, background: "linear-gradient(90deg,#3b82f6,#06b6d4)", width: `${saRaVisualWidth}%`, transition: "width 0.8s" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-subtle)", marginTop: 4, fontFamily: "monospace" }}>
                            <span>0</span><span>BRS</span><span>FRS</span><span>ERS</span>
                          </div>
                        </div>
                        {/* MA Goal */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 700, color: "var(--text-highlight)", marginBottom: 8 }}>
                            <span>MA Goal <TooltipBox id="t-bhs" text={`Basic Healthcare Sum (BHS): ${formatCurrency(currentBHS)}. MA cap — excess flows to SA (before 55) or RA (after 55).`} /></span>
                            <span style={{ color: currentMa >= currentBHS ? "var(--clr-sky)" : "#60a5fa", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
                              {Math.round(Number(bhsPercentText))}%{currentMa >= currentBHS ? " ✓" : ""}
                            </span>
                          </div>
                          <div style={{ width: "100%", background: "var(--bg-input)", borderRadius: 999, height: 10, overflow: "hidden", position: "relative" }}>
                            {[25, 50, 75].map(p => <div key={p} style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "var(--bg-base)", zIndex: 1 }} />)}
                            <div style={{ height: 10, borderRadius: 999, background: "linear-gradient(90deg,#8b5cf6,#6366f1)", width: `${bhsVisualWidth}%`, transition: "width 0.8s" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-subtle)", marginTop: 4, fontFamily: "monospace" }}>
                            <span>0</span><span>25%</span><span>50%</span><span>75%</span><span>MAX</span>
                          </div>
                        </div>
                      </div>{/* /Goal Trackers */}
                    </div>{/* /opacity+pointerEvents dim wrapper — closes before overlay */}
                    {/* Overlay: position:absolute is contained by position:relative parent above */}
                    {isForeigner && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, zIndex: 10, pointerEvents: "all" }}>
                        <div style={{ background: "rgba(15,23,42,0.82)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 16px", fontSize: 10, color: "#fbbf24", fontWeight: 700, textAlign: "center" }}>
                          🔒 No CPF account — balances &amp; goals not applicable
                        </div>
                      </div>
                    )}
                  </div>{/* /position:relative gate — overlay is contained here */}
                </div>{/* /flex column L5279 */}
              </div>}{/* /openSections profile body */}
            </div>{/* /profile section outer */}
            {/* Mandatory Contribs */}
            <div style={{ position: "relative" }}>
            {isForeigner && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.55)", pointerEvents: "all" }}>
                <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 18px", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>🔒 CPF scheme — not available to foreigners</div>
              </div>
            )}
            <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto", background: "var(--bg-panel)", border: `1px solid ${isSelfEmployed ? "rgba(251,146,60,0.3)" : "var(--border-subtle)"}`, borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("contribs")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("contribs"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("contribs") ? "rgba(163,230,53,0.07)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clr-lime)" }}>
                  <Briefcase style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Mandatory Contributions{isSelfEmployed ? " (SEP)" : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isSelfEmployed && <span style={{ fontSize: 9, background: "rgba(251,146,60,0.15)", color: "#fb923c", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>SEP</span>}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("contribs") ? "▲" : "▼"}</span>
                </div>
              </div>
              {openSections.has("contribs") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
                  <button onClick={() => setInputs(p => ({ ...p, isSelfEmployed: !p.isSelfEmployed, empOaCont: p.isSelfEmployed ? DEFAULT_INPUTS.empOaCont : 0, empSaCont: p.isSelfEmployed ? DEFAULT_INPUTS.empSaCont : 0, empMaCont: p.isSelfEmployed ? DEFAULT_INPUTS.empMaCont : 0 }))} style={{ fontSize: 10, background: isSelfEmployed ? "rgba(251,146,60,0.15)" : "rgba(100,116,139,0.15)", color: isSelfEmployed ? "#fb923c" : "var(--text-subtle)", padding: "4px 10px", borderRadius: 6, fontWeight: 700, border: `1px solid ${isSelfEmployed ? "rgba(251,146,60,0.4)" : "var(--border-strong)"}`, cursor: "pointer" }}>
                    {isSelfEmployed ? "SEP ✓" : "SEP?"}
                  </button>
                  {!isSelfEmployed && <button onClick={() => setInputs(p => ({ ...p, showSalaryCalc: !p.showSalaryCalc }))} style={{ fontSize: 10, background: "rgba(163,230,53,0.12)", color: "var(--clr-lime)", padding: "4px 10px", borderRadius: 6, fontWeight: 700, border: "none", cursor: "pointer" }}>
                    {inputs.showSalaryCalc ? "Hide" : "Auto-Calc"}
                  </button>}
                </div>
                {isSelfEmployed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: 10, borderRadius: 10, background: "var(--bg-muted)", border: "1px solid var(--border-strong)" }}>
                  <div style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)", borderRadius: 10, padding: 10, marginBottom: 4, fontSize: 10, color: "#fdba74", lineHeight: 1.5 }}>
                    <strong style={{ color: "#fb923c" }}>Self-Employed Member (SEP):</strong> No mandatory OA/SA contributions. Use the Inflows panel below to enter your VC3A (up to $37,740/yr). Funds are <strong style={{ color: "#fdba74" }}>proportionally allocated</strong> across OA/SA/MA using your age-based CPF rates. MA excess above BHS spills to SA/RA (capped at FRS); further excess flows to OA. MA contributions required if net trade income &gt; $6,000.
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 4 }}>Net Trade Income ($/yr)</label>
                    <input type="text" inputMode="decimal" name="netTradeIncome" value={getDisplayValue("netTradeIncome", inputs.netTradeIncome)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Net Trade Income" onFocus={() => setFocusedField("netTradeIncome")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  </div>
                )}
                {/* Salary fields — always visible for employed members */}
                {!isSelfEmployed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: 10, borderRadius: 10, background: "var(--bg-muted)", border: "1px solid var(--border-strong)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 2 }}>Salary Inputs</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[["salaryGross", "OW / Monthly Gross ($)"], ["salaryBonus", "AW / Annual Bonus ($)"]].map(([n, l]) => (
                        <div key={n}><label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 3 }}>{l}</label>
                          <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l} style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} /></div>
                      ))}
                    </div>
                    <div><label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 3 }}>Salary Growth Rate (% /yr)</label>
                      <input type="text" inputMode="decimal" name="salaryGrowthRate" value={inputs.salaryGrowthRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Annual salary growth rate" step="0.5" style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>OW ceiling: $8,000/mo · AW ceiling: $102,000/yr</p>
                    </div>
                    {/* Rev #5: Retirement Sum Growth — controls FRS/BHS/BRS/ERS projection rate */}
                    <div>
                      {/* a11y fix: was <label> — changed to <div> because TooltipBox (role=button) inside
                          a <label> triggers double-focus on mobile tap: label activates the input AND
                          the tooltip button fires simultaneously. aria-label on the input below preserves
                          screen-reader association without the <label> wrapper. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 3 }}>
                        Retirement Sum Growth (% /yr)
                        <TooltipBox id="t-rsGrowth" text="Annual rate at which CPF Board raises the Retirement Sums (FRS, BRS, ERS) and Basic Healthcare Sum (BHS). Historically ~3%/yr. Lowering this makes future FRS targets easier to reach; raising it makes them harder. Range: 0–10%. Values above 6% are flagged as aggressive." />
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="text" inputMode="decimal" name="retirementSumGrowth"
                          value={inputs.retirementSumGrowth ?? 3}
                          onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                          aria-label="Retirement sum annual growth rate"
                          style={{ flex: 1, padding: "6px 10px", background: "var(--bg-panel)", border: `1px solid ${inputErrors.retirementSumGrowth ? "#f87171" : "var(--border-strong)"}`, borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                        {/* Quick-set presets: Conservative / Base / Optimistic */}
                        {[["2%", 2, "#60a5fa"], ["3%", 3, "#34d399"], ["4%", 4, "#fb923c"]].map(([lbl, val, clr]) => (
                          <button key={lbl} onClick={() => setInputs(p => ({ ...p, retirementSumGrowth: val }))}
                            style={{ padding: "4px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, border: `1px solid ${(Number(inputs.retirementSumGrowth)||3) === val ? clr : "var(--border-strong)"}`, background: (Number(inputs.retirementSumGrowth)||3) === val ? `${clr}22` : "transparent", color: (Number(inputs.retirementSumGrowth)||3) === val ? clr : "var(--text-muted)", cursor: "pointer" }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                      {inputErrors.retirementSumGrowth && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{inputErrors.retirementSumGrowth}</p>}
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>CPF Board historical average ~3%/yr</p>
                    </div>
                    {/* Rev #22: Phase 2 salary & Career Break sub-section */}
                    {(() => {
                      const hasPhase = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null;
                      const hasBreak = inputs.careerBreakStartAge !== "" && inputs.careerBreakStartAge != null;
                      return (
                        <div style={{ borderTop: "1px dashed var(--border-strong)", paddingTop: 8, marginTop: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase 2 / Career Break</span>
                            <TooltipBox id="t-phase2" text="Phase 2: model a salary growth rate change from a specified age (e.g. slower growth post-45, or 0% after a promotion plateau). Career Break: contributions and salary drop to $0 for the specified age range (e.g. a sabbatical, NS, or parental leave). Both can be used independently or together." />
                          </div>
                          {/* Phase 2 start age */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 3 }}>Phase 2 Start Age</label>
                              <input type="text" inputMode="decimal" name="salaryPhaseAge"
                                value={inputs.salaryPhaseAge ?? ""}
                                onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                                placeholder="–"
                                aria-label="Phase 2 salary start age"
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: `1px solid ${inputErrors.salaryPhaseAge ? "#f87171" : "var(--border-strong)"}`, borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                              {inputErrors.salaryPhaseAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{inputErrors.salaryPhaseAge}</p>}
                            </div>
                            {/* Phase 2 growth rate — only show when phase age is entered */}
                            <div style={{ opacity: hasPhase ? 1 : 0.35, pointerEvents: hasPhase ? "auto" : "none" }}>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 3 }}>Phase 2 Growth %</label>
                              <input type="text" inputMode="decimal" name="salaryGrowthRate2"
                                value={inputs.salaryGrowthRate2 ?? 0}
                                onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                                placeholder="0"
                                readOnly={!hasPhase}
                                aria-label="Phase 2 salary growth rate"
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: `1px solid ${inputErrors.salaryGrowthRate2 ? "#f87171" : "var(--border-strong)"}`, borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                              {inputErrors.salaryGrowthRate2 && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{inputErrors.salaryGrowthRate2}</p>}
                            </div>
                          </div>
                          {hasPhase && (
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                              Phase 1: {inputs.salaryGrowthRate || 0}%/yr up to age {inputs.salaryPhaseAge} → Phase 2: {inputs.salaryGrowthRate2 || 0}%/yr thereafter
                            </p>
                          )}
                          {/* Career break */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "#fb923c", textTransform: "uppercase", marginBottom: 3 }}>Break Start Age</label>
                              <input type="text" inputMode="decimal" name="careerBreakStartAge"
                                value={inputs.careerBreakStartAge ?? ""}
                                onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                                placeholder="–"
                                aria-label="Career break start age"
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: `1px solid ${inputErrors.careerBreakStartAge ? "#f87171" : "var(--border-strong)"}`, borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                              {inputErrors.careerBreakStartAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{inputErrors.careerBreakStartAge}</p>}
                            </div>
                            <div style={{ opacity: hasBreak ? 1 : 0.35, pointerEvents: hasBreak ? "auto" : "none" }}>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "#fb923c", textTransform: "uppercase", marginBottom: 3 }}>Break End Age</label>
                              <input type="text" inputMode="decimal" name="careerBreakEndAge"
                                value={inputs.careerBreakEndAge ?? ""}
                                onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                                placeholder="–"
                                readOnly={!hasBreak}
                                aria-label="Career break end age"
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: `1px solid ${inputErrors.careerBreakEndAge ? "#f87171" : "var(--border-strong)"}`, borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                              {inputErrors.careerBreakEndAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{inputErrors.careerBreakEndAge}</p>}
                            </div>
                          </div>
                          {hasBreak && inputs.careerBreakEndAge && (
                            <p style={{ fontSize: 10, color: "#fdba74", marginTop: 4 }}>
                              ⏸ Contributions paused ages {inputs.careerBreakStartAge}–{inputs.careerBreakEndAge} ({Math.max(0, (Number(inputs.careerBreakEndAge) - Number(inputs.careerBreakStartAge)) + 1)} yr{Math.max(0, (Number(inputs.careerBreakEndAge) - Number(inputs.careerBreakStartAge)) + 1) !== 1 ? "s" : ""})
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <button onClick={handleAutoCalc} style={{ width: "100%", background: "var(--clr-lime)", color: "#020617", fontWeight: 700, padding: "7px", borderRadius: 8, fontSize: 11, border: "none", cursor: "pointer" }}>⚡ Auto-Calc CPF Contributions</button>
                  </div>
                )}
                {inputs.showSalaryCalc && !isSelfEmployed && (() => {
                  const displayAge = Number(inputs.currentAge) || 35;
                  const displayIsPR = (inputs.citizenStatus || 'SC') === 'PR';
                  const displayPrYr = Number(inputs.prYear) || 3;
                  const displayRateType = (inputs.prRateType || 'GG');
                  // SC/PR3+ (Table 1 2026): combined employer+employee rates. PR1/PR2: correct totals, proportional splits.
                  const scTable = [
                    ["≤ 35",  23,   6,    8,    37,   "17%",   "0.60"],
                    ["36–45", 21,   7,    9,    37,   "17%",   "0.60"],
                    ["46–50", 19,   8,    10,   37,   "17%",   "0.60"],
                    ["51–55", 15,   11.5, 10.5, 37,   "17%",   "0.60"],
                    ["56–60", 12,   11.5, 10.5, 34,   "16%",   "0.54"],
                    ["61–65", 3.5,  11,   10.5, 25,   "12.5%", "0.375"],
                    ["66–70", 1,    5,    10.5, 16.5, "9%",    "0.225"],
                    ["> 70",  1,    1,    10.5, 12.5, "7.5%",  "0.15"],
                  ];
                  const pr1Table = [
                    ["≤ 35",  5.6, 1.5, 1.9, 9.0, "4%",   "0.15"],
                    ["36–45", 5.1, 1.7, 2.2, 9.0, "4%",   "0.15"],
                    ["46–50", 4.6, 1.9, 2.5, 9.0, "4%",   "0.15"],
                    ["51–55", 3.6, 2.8, 2.6, 9.0, "4%",   "0.15"],
                    ["56–60", 3.2, 3.0, 2.8, 9.0, "4%",   "0.15"],
                    ["61–65", 1.2, 3.7, 3.6, 8.5, "3.5%", "0.15"],
                    ["> 65",  0.5, 2.6, 5.4, 8.5, "3.5%", "0.15"],
                  ];
                  const pr2Table = [
                    ["≤ 35",  14.9, 3.9, 5.2, 24.0, "9%",   "0.45"],
                    ["36–45", 13.6, 4.5, 5.9, 24.0, "9%",   "0.45"],
                    ["46–50", 12.3, 5.2, 6.5, 24.0, "9%",   "0.45"],
                    ["51–55", 9.7,  7.5, 6.8, 24.0, "9%",   "0.45"],
                    ["56–60", 6.5,  6.3, 5.7, 18.5, "6%",   "0.375"],
                    ["61–65", 1.5,  4.9, 4.6, 11.0, "3.5%", "0.225"],
                    ["> 65",  0.5,  2.6, 5.4, 8.5,  "3.5%", "0.15"],
                  ];
                  // F/G Year 1: Full Employer (17%) + Graduated Employee (5%)
                  const fg1Table = [
                    ["≤ 35",  13.6, 3.6, 4.8, 22.0, "17%",   "0.15"],
                    ["36–45", 12.4, 4.2, 5.4, 22.0, "17%",   "0.15"],
                    ["46–50", 11.2, 4.8, 6.0, 22.0, "17%",   "0.15"],
                    ["51–55", 9.0,  6.8, 6.2, 22.0, "17%",   "0.15"],
                    ["56–60", 7.4,  7.1, 6.5, 21.0, "16%",   "0.15"],
                    ["61–65", 2.4,  7.7, 7.4, 17.5, "12.5%", "0.15"],
                    ["> 65",  0.9,  4.2, 8.9, 14.0, "9%",    "0.15"],
                  ];
                  // F/G Year 2: Full Employer + Graduated Employee (15% ≤55, 12.5% 56–60, 7.5% 61–65, 5% >65)
                  const fg2Table = [
                    ["≤ 35",  19.9, 5.2, 6.9, 32.0, "17%",   "0.45"],
                    ["36–45", 18.2, 6.0, 7.8, 32.0, "17%",   "0.45"],
                    ["46–50", 16.4, 6.9, 8.7, 32.0, "17%",   "0.45"],
                    ["51–55", 13.0, 9.9, 9.1, 32.0, "17%",   "0.45"],
                    ["56–60", 10.1, 9.6, 8.8, 28.5, "16%",   "0.375"],
                    ["61–65", 2.8,  8.8, 8.4, 20.0, "12.5%", "0.225"],
                    ["> 65",  0.9,  4.2, 8.9, 14.0, "9%",    "0.15"],
                  ];
                  const isFG = displayIsPR && displayPrYr < 3 && displayRateType === 'FG';
                  const activeTable =
                    displayIsPR && displayPrYr === 1 ? (isFG ? fg1Table : pr1Table) :
                    displayIsPR && displayPrYr === 2 ? (isFG ? fg2Table : pr2Table) :
                    scTable;
                  const tableTitle =
                    displayIsPR && displayPrYr === 1 && isFG ? "PR Year 1 F/G (Full ER) — 1 Jan 2026" :
                    displayIsPR && displayPrYr === 1         ? "PR Year 1 G/G — Table 2 (1 Jan 2026)" :
                    displayIsPR && displayPrYr === 2 && isFG ? "PR Year 2 F/G (Full ER) — 1 Jan 2026" :
                    displayIsPR && displayPrYr === 2         ? "PR Year 2 G/G — Table 3 (1 Jan 2026)" :
                    "SC / PR Year 3+ — Table 1 (1 Jan 2026)";
                  const isActive = (bracket) => {
                    const a = displayAge;
                    if (bracket === "≤ 35")  return a <= 35;
                    if (bracket === "36–45") return a > 35 && a <= 45;
                    if (bracket === "46–50") return a > 45 && a <= 50;
                    if (bracket === "51–55") return a > 50 && a <= 55;
                    if (bracket === "56–60") return a > 55 && a <= 60;
                    if (bracket === "61–65") return a > 60 && a <= 65;
                    if (bracket === "66–70") return a > 65 && a <= 70;
                    if (bracket === "> 70")  return a > 70;
                    if (bracket === "> 65")  return a > 65;
                    return false;
                  };
                  const activeRow = activeTable.find(r => isActive(r[0])) || activeTable[0];
                  const activeFlatRate = activeRow[5];
                  const activeGradFactor = activeRow[6];
                  return (
                    <div style={{ background: "var(--bg-input)", padding: 14, borderRadius: 12, marginBottom: 14, border: "1px solid var(--border-strong)" }}>
                      <div style={{ marginTop: 4, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-strong)" }}>
                        <div style={{ background: "var(--bg-panel)", padding: "6px 10px", fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)" }}>{tableTitle}</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                          <thead><tr style={{ background: "var(--bg-muted)" }}>
                            <th style={{ padding: "4px 8px", textAlign: "left",   color: "var(--text-muted)" }}>Age</th>
                            <th style={{ padding: "4px 8px", textAlign: "center", color: "#60a5fa" }}>OA</th>
                            <th style={{ padding: "4px 8px", textAlign: "center", color: "var(--clr-lime)" }}>{is55Plus ? "RA" : "SA"}</th>
                            <th style={{ padding: "4px 8px", textAlign: "center", color: "#a78bfa" }}>MA</th>
                            <th style={{ padding: "4px 8px", textAlign: "center", color: "var(--text-highlight)" }}>Total</th>
                          </tr></thead>
                          <tbody>
                            {activeTable.map(([bracket, oa, sa, ma, total]) => {
                              const active = isActive(bracket);
                              return (
                                <tr key={bracket} style={{ borderTop: "1px solid var(--border-subtle)", background: active ? "rgba(163,230,53,0.08)" : "" }}>
                                  <td style={{ padding: "5px 8px", fontWeight: 700, color: active ? "var(--clr-lime)" : "var(--text-muted)", fontFamily: "system-ui" }}>
                                    {bracket}{active && <span style={{ marginLeft: 4, fontSize: 7, background: "rgba(16,185,129,0.2)", color: "var(--clr-lime)", padding: "1px 4px", borderRadius: 4 }}>YOU</span>}
                                  </td>
                                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#93c5fd", fontFamily: "monospace" }}>{oa}%</td>
                                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#6ee7b7", fontFamily: "monospace" }}>{sa}%</td>
                                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#c4b5fd", fontFamily: "monospace" }}>{ma}%</td>
                                  <td style={{ padding: "5px 8px", textAlign: "center", color: "var(--text-highlight)", fontFamily: "monospace", fontWeight: 700 }}>{total}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 6, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", fontSize: 9, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        <strong style={{ color: "#fbbf24" }}>Salary banding (OW/month, your age band):</strong><br />
                        ≤ $50 → Nil &nbsp;|&nbsp; $51–$500 → {activeFlatRate} × OW (employer only) &nbsp;|&nbsp; $501–$750 → {activeFlatRate} × OW + {activeGradFactor} × (OW − $500) &nbsp;|&nbsp; &gt; $750 → full rates above
                        <br /><span style={{ color: "var(--text-subtle)" }}>Rates shown are combined employer + employee as % of wages (OW &gt; $750). Auto-Calc applies the correct band formula automatically.</span>
                      </div>

                      {/* ── PR Tier Progression Panel — only shown when PR Year 1 or Year 2 ── */}
                      {displayIsPR && displayPrYr < 3 && (() => {
                        const growthRate  = (Number(inputs.salaryGrowthRate)  || 0) / 100;
                        const growthRate2 = (Number(inputs.salaryGrowthRate2) || 0) / 100;
                        const phaseAge_ui  = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null ? Number(inputs.salaryPhaseAge) : null;
                        const cbStart_ui   = inputs.careerBreakStartAge !== "" && inputs.careerBreakStartAge != null ? Number(inputs.careerBreakStartAge) : null;
                        const cbEnd_ui     = inputs.careerBreakEndAge   !== "" && inputs.careerBreakEndAge   != null ? Number(inputs.careerBreakEndAge)   : null;
                        const baseMonthly = Math.min(Number(inputs.salaryGross) || 0, 8000);
                        const bonusBase   = Number(inputs.salaryBonus) || 0;
                        // Phase/break-aware GF for UI preview (mirrors engine computeGF)
                        const uiGF = (ageAtYear) => {
                          const inBreak = cbStart_ui !== null && cbEnd_ui !== null && ageAtYear >= cbStart_ui && ageAtYear <= cbEnd_ui;
                          if (inBreak) return 0;
                          if (phaseAge_ui !== null && ageAtYear >= phaseAge_ui) {
                            const y1 = Math.max(0, phaseAge_ui - displayAge);
                            const y2 = Math.max(0, ageAtYear  - phaseAge_ui);
                            return Math.pow(1 + growthRate, y1) * Math.pow(1 + growthRate2, y2);
                          }
                          return Math.pow(1 + growthRate, Math.max(0, ageAtYear - displayAge));
                        };

                        // Helper: compute annual OA/SA/MA for a given PR tier and year offset
                        const computeTierYear = (tierYear, offset) => {
                          const ageAtYear = displayAge + offset;
                          const gf = uiGF(ageAtYear);
                          const cappedMo = Math.min(baseMonthly * gf, 8000);
                          let oaR, saR, maR, totalPct;
                          if (tierYear < 3) {
                            const r = getPRRates(tierYear, ageAtYear, displayRateType);
                            oaR = r.oa; saR = r.sa; maR = r.ma;
                            totalPct = Math.round(r.total * 1000) / 10;
                          } else {
                            // SC/PR3+ full rates
                            if      (ageAtYear <= 35) { oaR=0.23; saR=0.06;  maR=0.08;  }
                            else if (ageAtYear <= 45) { oaR=0.21; saR=0.07;  maR=0.09;  }
                            else if (ageAtYear <= 50) { oaR=0.19; saR=0.08;  maR=0.10;  }
                            else if (ageAtYear <= 55) { oaR=0.15; saR=0.115; maR=0.105; }
                            else if (ageAtYear <= 60) { oaR=0.12; saR=0.115; maR=0.105; }
                            else if (ageAtYear <= 65) { oaR=0.035;saR=0.11;  maR=0.105; }
                            else if (ageAtYear <= 70) { oaR=0.01; saR=0.05;  maR=0.105; }
                            else                      { oaR=0.01; saR=0.01;  maR=0.105; }
                            totalPct = Math.round((oaR+saR+maR) * 1000) / 10;
                          }
                          const totalR  = oaR + saR + maR;
                          const owAnn   = cappedMo * 12;
                          const owOwContrib = totalR * owAnn;
                          const owOA   = totalR > 0 ? Math.round(owOwContrib * oaR / totalR) : 0;
                          const owMA   = totalR > 0 ? Math.round(owOwContrib * maR / totalR) : 0;
                          const owSA   = owOwContrib > 0 ? Math.round(owOwContrib) - owOA - owMA : 0;
                          // AW (bonus) — always at full standard rates
                          const awCap  = Math.max(0, 102000 - owAnn);
                          const bCpf   = Math.min(bonusBase * gf, awCap);
                          const oa  = owOA + Math.round(bCpf * oaR);
                          const sa  = owSA + Math.round(bCpf * saR);
                          const ma  = owMA + Math.round(bCpf * maR);
                          return { oa, sa, ma, total: oa+sa+ma, totalPct, tierYear, ageAtYear };
                        };

                        // Build 4 rows: absolute PR years based on user-selected starting year
                        const rows = [
                          { label: `Yr ${displayPrYr}`,               offset: 0, tier: displayPrYr,                       absYear: displayPrYr },
                          { label: `Yr ${Math.min(displayPrYr+1,3)}${displayPrYr+1>3?"+ (steady)":""}`, offset: 1, tier: Math.min(displayPrYr + 1, 3), absYear: displayPrYr + 1 },
                          { label: `Yr ${Math.min(displayPrYr+2,3)}${displayPrYr+2>3?"+ (steady)":""}`, offset: 2, tier: Math.min(displayPrYr + 2, 3), absYear: displayPrYr + 2 },
                          { label: `Yr ${Math.min(displayPrYr+3,3)}${displayPrYr+3>3?"+ (steady)":""}`, offset: 3, tier: 3,                           absYear: displayPrYr + 3 },
                        ].map(r => ({ ...r, ...computeTierYear(r.tier, r.offset) }));

                        const tierLabel = t => t === 1 ? 'PR Yr 1' : t === 2 ? 'PR Yr 2' : 'SC/PR3+';
                        const tierColor = t => t === 1 ? '#fbbf24' : t === 2 ? '#fb923c' : 'var(--clr-lime)';
                        const fc = v => `$${(v/1000).toFixed(1)}k`;

                        return (
                          <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(251,191,36,0.3)" }}>
                            <div style={{ background: "rgba(251,191,36,0.08)", padding: "6px 10px", fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "#fbbf24", letterSpacing: "0.05em" }}>
                              📈 PR Tier Progression — Annual Contributions (Yr 1 → Yr 4+)
                              <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text-muted)", textTransform: "none" }}>Rate tier auto-advances each year in the engine</span>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-muted)" }}>
                                  {["Proj. Year", "Tier (Rate)", "OA", is55Plus ? "RA" : "SA", "MA", "Total"].map((h, i) => (
                                    <th key={h} style={{ padding: "4px 8px", textAlign: i <= 1 ? "left" : "right",
                                      color: i===2?"#60a5fa": i===3?"var(--clr-lime)": i===4?"#a78bfa": i===5?"var(--text-highlight)":"var(--text-muted)",
                                      fontWeight: 800, fontSize: 9 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, idx) => {
                                  const isNow = r.absYear === displayPrYr;
                                  const isFull = r.tier >= 3;
                                  return (
                                    <tr key={r.label} style={{ borderTop: "1px solid var(--border-subtle)", background: isNow ? "rgba(251,191,36,0.06)" : isFull ? "rgba(163,230,53,0.06)" : "" }}>
                                      <td style={{ padding: "5px 8px", fontWeight: isNow ? 800 : 600, color: isNow ? "#fbbf24" : "var(--text-muted)", fontFamily: "system-ui", whiteSpace: "nowrap" }}>
                                        {r.label}{isNow && <span style={{ marginLeft: 4, fontSize: 7, background: "rgba(163,230,53,0.25)", color: "var(--clr-lime)", padding: "1px 4px", borderRadius: 4 }}>You</span>}
                                        {growthRate > 0 && <span style={{ marginLeft: 3, fontSize: 7, color: "var(--text-subtle)" }}>×{(Math.pow(1+growthRate, r.offset)*100).toFixed(0)}%</span>}
                                      </td>
                                      <td style={{ padding: "5px 8px" }}>
                                        <span style={{ fontSize: 8, fontWeight: 800, color: tierColor(r.tier), background: `${tierColor(r.tier)}18`, border: `1px solid ${tierColor(r.tier)}40`, borderRadius: 4, padding: "1px 5px" }}>
                                          {tierLabel(r.tier)} · {r.totalPct}%
                                        </span>
                                      </td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#93c5fd", fontFamily: "monospace" }}>{fc(r.oa)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#6ee7b7", fontFamily: "monospace" }}>{fc(r.sa)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#c4b5fd", fontFamily: "monospace" }}>{fc(r.ma)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--text-highlight)", fontFamily: "monospace", fontWeight: 800 }}>{fc(r.total)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div style={{ padding: "5px 10px", background: "rgba(251,191,36,0.04)", fontSize: 8, color: "var(--text-subtle)", lineHeight: 1.6 }}>
                              Auto-Calc fills Year 1 figures into the OA/SA/MA fields below. Year 2–4+ are projections only — the engine advances the tier automatically each year without further input.
                              {growthRate > 0 && ` Salary growth of ${inputs.salaryGrowthRate}%/yr applied.`}
                              {(inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null) && <span style={{ color: "#fbbf24" }}> Phase 2 growth ({inputs.salaryGrowthRate2 || 0}%/yr from age {inputs.salaryPhaseAge}) is modelled in the projection but not reflected in this Year-1 Auto-Calc.</span>}
                              {(inputs.careerBreakStartAge !== "" && inputs.careerBreakStartAge != null) && <span style={{ color: "#fdba74" }}> Career break ages {inputs.careerBreakStartAge}–{inputs.careerBreakEndAge || "?"} is modelled in the projection — contributions drop to $0 during that period.</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
                {!isSelfEmployed && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["empOaCont", "OA"], ["empSaCont", is55Plus ? "RA" : "SA"], ["empMaCont", "MA"]].map(([n, l]) => (
                    <div key={n}><label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--clr-lime)", textTransform: "uppercase", marginBottom: 4 }}>{l}</label>
                      <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} /></div>
                  ))}
                  {/* ── PR Yr1→4 progression table: always visible for PR Year 1 or 2 members ── */}
                  {(() => {
                    const _isPR2 = (inputs.citizenStatus || 'SC') === 'PR';
                    const _prYr2 = Number(inputs.prYear) || 3;
                    if (!_isPR2 || _prYr2 >= 3) return null;
                    const _growthRate  = (Number(inputs.salaryGrowthRate)  || 0) / 100;
                    const _growthRate2 = (Number(inputs.salaryGrowthRate2) || 0) / 100;
                    const _phaseAge    = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null ? Number(inputs.salaryPhaseAge) : null;
                    const _cbStart     = inputs.careerBreakStartAge !== "" && inputs.careerBreakStartAge != null ? Number(inputs.careerBreakStartAge) : null;
                    const _cbEnd       = inputs.careerBreakEndAge   !== "" && inputs.careerBreakEndAge   != null ? Number(inputs.careerBreakEndAge)   : null;
                    const _baseMonthly = Math.min(Number(inputs.salaryGross) || 0, 8000);
                    const _bonusBase = Number(inputs.salaryBonus) || 0;
                    const _rateType = inputs.prRateType || 'GG';
                    const _age0 = Number(inputs.currentAge) || 35;
                    // Phase/break-aware GF for second PR table (mirrors engine computeGF)
                    const _uiGF = (ageAtYear) => {
                      const inBreak = _cbStart !== null && _cbEnd !== null && ageAtYear >= _cbStart && ageAtYear <= _cbEnd;
                      if (inBreak) return 0;
                      if (_phaseAge !== null && ageAtYear >= _phaseAge) {
                        const y1 = Math.max(0, _phaseAge - _age0);
                        const y2 = Math.max(0, ageAtYear - _phaseAge);
                        return Math.pow(1 + _growthRate, y1) * Math.pow(1 + _growthRate2, y2);
                      }
                      return Math.pow(1 + _growthRate, Math.max(0, ageAtYear - _age0));
                    };
                    const _computeYear = (tierYear, offset) => {
                      const ageAtYear = _age0 + offset;
                      const gf = _uiGF(ageAtYear);
                      const cappedMo = Math.min(_baseMonthly * gf, 8000);
                      let oaR, saR, maR, totalPct;
                      if (tierYear < 3) {
                        const r = getPRRates(tierYear, ageAtYear, _rateType);
                        oaR = r.oa; saR = r.sa; maR = r.ma;
                        totalPct = Math.round(r.total * 1000) / 10;
                      } else {
                        if      (ageAtYear <= 35) { oaR=0.23; saR=0.06;  maR=0.08;  }
                        else if (ageAtYear <= 45) { oaR=0.21; saR=0.07;  maR=0.09;  }
                        else if (ageAtYear <= 50) { oaR=0.19; saR=0.08;  maR=0.10;  }
                        else if (ageAtYear <= 55) { oaR=0.15; saR=0.115; maR=0.105; }
                        else if (ageAtYear <= 60) { oaR=0.12; saR=0.115; maR=0.105; }
                        else if (ageAtYear <= 65) { oaR=0.035;saR=0.11;  maR=0.105; }
                        else if (ageAtYear <= 70) { oaR=0.01; saR=0.05;  maR=0.105; }
                        else                      { oaR=0.01; saR=0.01;  maR=0.105; }
                        totalPct = Math.round((oaR+saR+maR)*1000)/10;
                      }
                      const totalR = oaR + saR + maR;
                      const owAnn = cappedMo * 12;
                      const owContrib = totalR * owAnn;
                      const owOA = totalR > 0 ? Math.round(owContrib * oaR / totalR) : 0;
                      const owMA = totalR > 0 ? Math.round(owContrib * maR / totalR) : 0;
                      const owSA = owContrib > 0 ? Math.round(owContrib) - owOA - owMA : 0;
                      const awCap = Math.max(0, 102000 - owAnn);
                      const bCpf = Math.min(_bonusBase * gf, awCap);
                      const oa = owOA + Math.round(bCpf * oaR);
                      const sa = owSA + Math.round(bCpf * saR);
                      const ma = owMA + Math.round(bCpf * maR);
                      return { oa, sa, ma, total: oa+sa+ma, totalPct, tierYear, ageAtYear };
                    };
                    const rows = [
                      { label: `Yr ${_prYr2}`,                                   offset: 0, tier: _prYr2,                       absYear: _prYr2 },
                      { label: `Yr ${Math.min(_prYr2+1,3)}${_prYr2+1>3?"+ (steady)":""}`, offset: 1, tier: Math.min(_prYr2 + 1, 3), absYear: _prYr2 + 1 },
                      { label: `Yr ${Math.min(_prYr2+2,3)}${_prYr2+2>3?"+ (steady)":""}`, offset: 2, tier: Math.min(_prYr2 + 2, 3), absYear: _prYr2 + 2 },
                      { label: `Yr ${Math.min(_prYr2+3,3)}${_prYr2+3>3?"+ (steady)":""}`, offset: 3, tier: 3,                       absYear: _prYr2 + 3 },
                    ].map(r => ({ ...r, ..._computeYear(r.tier, r.offset) }));
                    const tColor = t => t === 1 ? "#fbbf24" : t === 2 ? "#fb923c" : "var(--clr-lime)";
                    const tLabel = t => t === 1 ? "PR Yr 1" : t === 2 ? "PR Yr 2" : "SC/PR3+";
                    const fc2 = v => `$${(v/1000).toFixed(1)}k`;
                    return (
                      <div style={{ marginTop: 6, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(251,191,36,0.3)" }}>
                        <div style={{ background: "rgba(251,191,36,0.08)", padding: "5px 10px", fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "#fbbf24", letterSpacing: "0.05em" }}>
                          📈 PR Tier Progression — Yr 1 → Yr 4+
                          <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text-muted)", textTransform: "none" }}>auto-advances each year</span>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                          <thead>
                            <tr style={{ background: "var(--bg-muted)" }}>
                              {["Year", "Rate Tier", "OA", is55Plus ? "RA" : "SA", "MA", "Total"].map((h, i) => (
                                <th key={h} style={{ padding: "4px 6px", textAlign: i <= 1 ? "left" : "right",
                                  color: i===2?"#60a5fa":i===3?"var(--clr-lime)":i===4?"#a78bfa":i===5?"var(--text-highlight)":"var(--text-muted)",
                                  fontWeight: 800, fontSize: 8 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, idx) => {
                              const isNow = r.absYear === _prYr2;
                              return (
                                <tr key={r.label} style={{ borderTop: "1px solid var(--border-subtle)", background: isNow ? "rgba(251,191,36,0.07)" : r.tier >= 3 ? "rgba(163,230,53,0.06)" : "" }}>
                                  <td style={{ padding: "4px 6px", fontWeight: isNow ? 800 : 600, color: isNow ? "#fbbf24" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                                    {r.label}{isNow && <span style={{ marginLeft: 4, fontSize: 7, background: "rgba(163,230,53,0.25)", color: "var(--clr-lime)", padding: "1px 3px", borderRadius: 3 }}>You</span>}
                                  </td>
                                  <td style={{ padding: "4px 6px" }}>
                                    <span style={{ fontSize: 7, fontWeight: 800, color: tColor(r.tier), background: `${tColor(r.tier)}18`, border: `1px solid ${tColor(r.tier)}40`, borderRadius: 3, padding: "1px 4px" }}>
                                      {tLabel(r.tier)} · {r.totalPct}%
                                    </span>
                                  </td>
                                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#93c5fd", fontFamily: "monospace" }}>{fc2(r.oa)}</td>
                                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#6ee7b7", fontFamily: "monospace" }}>{fc2(r.sa)}</td>
                                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#c4b5fd", fontFamily: "monospace" }}>{fc2(r.ma)}</td>
                                  <td style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-highlight)", fontFamily: "monospace", fontWeight: 800 }}>{fc2(r.total)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ padding: "4px 8px", background: "rgba(251,191,36,0.04)", fontSize: 8, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                          Yr 1 = auto-calc values above. Yr 2–4+ are projections — engine advances tier automatically.{_growthRate > 0 ? ` Salary growth ${inputs.salaryGrowthRate}%/yr applied.` : ""}
                        </div>
                      </div>
                    );
                  })()}
                </div>}
              </div>}
            </div>{/* /contribs inner */}
            </div>{/* /contribs gate wrapper */}
            {/* Inflows */}
            <div style={{ position: "relative" }}>
            {isForeigner && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.55)", pointerEvents: "all" }}>
                <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 18px", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>🔒 CPF scheme — not available to foreigners</div>
              </div>
            )}
            <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto", background: "var(--bg-panel)", border: `1px solid ${isVcOverLimit ? "#f97316" : isSelfEmployed ? "rgba(251,146,60,0.3)" : "var(--border-subtle)"}`, borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("topups")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("topups"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("topups") ? (isVcOverLimit ? "rgba(249,115,22,0.06)" : "rgba(163,230,53,0.08)") : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: isVcOverLimit ? "#fb923c" : "#34d399" }}>
                  <Gift style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Inflows ($/yr)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-subtle)" }}>Limit: {formatCurrency(maxAllowableVC)}/yr</span>
                  {isVcOverLimit && <AlertTriangle style={{ width: 12, height: 12, color: "#fb923c" }} />}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("topups") ? "▲" : "▼"}</span>
                </div>
              </div>
              {openSections.has("topups") && <div style={{ padding: "0 16px 16px" }}>
                {isSelfEmployed && (
                  <div style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 10, color: "#fdba74", lineHeight: 1.5 }}>
                    <strong style={{ color: "#fb923c" }}>SEP VC3A Flow:</strong> Proportionally split across OA/SA/MA using age-based CPF rates. MA excess above BHS spills to SA/RA up to FRS; further excess flows to OA. Max $37,740/yr.
                  </div>
                )}
                {isVcOverLimit && <div style={{ background: "rgba(249,115,22,0.15)", color: "#fdba74", fontSize: 10, fontWeight: 700, padding: 10, borderRadius: 8, marginBottom: 10, display: "flex", gap: 6 }}>
                  <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />VC3A exceeds available limit ({formatCurrency(maxAllowableVC)}/yr). Contributions will be scaled down.
                </div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* VC3A — single cash lump-sum + read-only breakdown */}
                  <div>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: isVcOverLimit ? "#fb923c" : "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                      VC3A – Cash Lump Sum <FreqToggle freqKey="vc3aFreq" durKey="vc3aDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-vc3a" text="Voluntary Contribution to 3 Accounts — cash only. Auto-split across OA/SA/MA using your age-band allocation rates. Counts toward the $37,740 Annual Limit. No tax relief for employees." />
                    </div>
                    <input type="text" inputMode="decimal" name="vc3aCash" value={getDisplayValue("vc3aCash", inputs.vc3aCash)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                      readOnly={isUnder16} tabIndex={isUnder16 ? -1 : undefined}
                      aria-label="VC3A annual cash contribution" onFocus={() => setFocusedField("vc3aCash")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${isVcOverLimit ? "#f97316" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", opacity: isUnder16 ? 0.4 : 1, cursor: isUnder16 ? "not-allowed" : "text" }} />
                    {isUnder16
                      ? <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>⚠ Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.</p>
                      : inputErrors.vc3aCash && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.vc3aCash}</p>}
                    {/* Annual Limit headroom badge — colour-coded: green → amber → red */}
                    {!isUnder16 && (() => {
                      const vc3aVal   = Number(inputs.vc3aCash) || 0;
                      const usedPct   = maxAllowableVC > 0 ? Math.min(1, vc3aVal / maxAllowableVC) : (vc3aVal > 0 ? 1 : 0);
                      const badgeCol  = usedPct >= 1 ? "#f87171" : usedPct >= 0.75 ? "#fb923c" : "#34d399";
                      const barBg     = usedPct >= 1 ? "rgba(248,113,113,0.18)" : usedPct >= 0.75 ? "rgba(251,146,60,0.18)" : "rgba(52,211,153,0.12)";
                      const remaining = Math.max(0, maxAllowableVC - vc3aVal);
                      return (
                        <div style={{ marginTop: 6, padding: "7px 10px", borderRadius: 7, background: barBg, border: `1px solid ${badgeCol}44` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: badgeCol, textTransform: "uppercase", letterSpacing: "0.04em" }}>Annual Limit Headroom</span>
                            <span style={{ fontSize: 9, fontWeight: 900, color: badgeCol, fontFamily: "monospace" }}>
                              {formatCurrency(remaining)} left of {formatCurrency(maxAllowableVC)}
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-muted)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, usedPct * 100)}%`, background: badgeCol, borderRadius: 2, transition: "width 0.3s" }} />
                          </div>
                          <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                            Auto-split by age-band rates · no tax relief
                            {totalMandatory > 0 && ` · $${totalMandatory.toLocaleString()} mandatory already counted`}
                          </p>
                        </div>
                      );
                    })()}
                    {/* Read-only breakdown of how lump-sum is auto-split */}
                    {(Number(inputs.vc3aCash) || 0) > 0 && (() => {
                      const age = Number(inputs.currentAge) || 35;
                      const _isPR_vc3a  = (inputs.citizenStatus || 'SC') === 'PR';
                      const _prYr_vc3a  = Number(inputs.prYear) || 3;
                      const _rtType_vc3a = (inputs.prRateType || 'GG');
                      let oaR, saR, maR;
                      // BUG-13 fix: for PR Year 1 or 2 members use the PR rate table so the
                      // displayed OA/SA/MA split matches what the engine actually applies.
                      // Previously SC/PR3+ constants were hardcoded here regardless of PR status,
                      // showing wrong allocations to PR Year 1/2 members.
                      if (_isPR_vc3a && _prYr_vc3a < 3) {
                        const prR = getPRRates(_prYr_vc3a, age, _rtType_vc3a);
                        oaR = prR.oa; saR = prR.sa; maR = prR.ma;
                      } else {
                        if (age <= 35) { oaR = 0.23; saR = 0.06; maR = 0.08; }
                        else if (age <= 45) { oaR = 0.21; saR = 0.07; maR = 0.09; }
                        else if (age <= 50) { oaR = 0.19; saR = 0.08; maR = 0.10; }
                        else if (age <= 55) { oaR = 0.15; saR = 0.115; maR = 0.105; }
                        else if (age <= 60) { oaR = 0.12; saR = 0.115; maR = 0.105; }
                        else if (age <= 65) { oaR = 0.035; saR = 0.11; maR = 0.105; }
                        else if (age <= 70) { oaR = 0.01; saR = 0.05; maR = 0.105; }
                        else { oaR = 0.01; saR = 0.01; maR = 0.105; }
                      }
                      const total = oaR + saR + maR;
                      const v = Number(inputs.vc3aCash) || 0;
                      const oaAmt = Math.round(v * (oaR / total));
                      const maAmt = Math.round(v * (maR / total));
                      const saAmt = v - oaAmt - maAmt;
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8, padding: "8px 10px", background: "var(--bg-base)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                          {[["OA", oaAmt, "#60a5fa"], ["MA", maAmt, "#a78bfa"], [is55Plus ? "RA" : "SA", saAmt, "#34d399"]].map(([acct, amt, col]) => (
                            <div key={acct} style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: "uppercase", marginBottom: 2 }}>{acct}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-bright)", fontFamily: "monospace" }}>{formatCurrency(amt)}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Rev #21 — VC3A per-dollar SA ROI heuristic */}
                    {!isUnder16 && !isForeigner && (Number(inputs.vc3aCash) || 0) > 0 && (() => {
                      const _ca  = Number(inputs.currentAge) || 35;
                      const _pa  = Number(inputs.payoutAge)  || 65;
                      const _yrs = Math.max(0, _pa - _ca);
                      if (_yrs < 1) return null;
                      // Derive SA ratio at current age (mirrors breakdown grid logic above)
                      let _oaR, _saR, _maR;
                      const _isPR_h = (inputs.citizenStatus || 'SC') === 'PR';
                      const _prYr_h = Number(inputs.prYear) || 3;
                      if (_isPR_h && _prYr_h < 3) {
                        const _prR = getPRRates(_prYr_h, _ca, inputs.prRateType || 'GG');
                        _oaR = _prR.oa; _saR = _prR.sa; _maR = _prR.ma;
                      } else {
                        if (_ca <= 35)      { _oaR = 0.23; _saR = 0.06; _maR = 0.08; }
                        else if (_ca <= 45) { _oaR = 0.21; _saR = 0.07; _maR = 0.09; }
                        else if (_ca <= 50) { _oaR = 0.19; _saR = 0.08; _maR = 0.10; }
                        else if (_ca <= 55) { _oaR = 0.15; _saR = 0.115; _maR = 0.105; }
                        else if (_ca <= 60) { _oaR = 0.12; _saR = 0.115; _maR = 0.105; }
                        else if (_ca <= 65) { _oaR = 0.035; _saR = 0.11; _maR = 0.105; }
                        else if (_ca <= 70) { _oaR = 0.01; _saR = 0.05; _maR = 0.105; }
                        else               { _oaR = 0.01; _saR = 0.01; _maR = 0.105; }
                      }
                      const _tot = _oaR + _saR + _maR;
                      const _saFrac = _saR / _tot;
                      // SA/RA portion of $1,000 VC3A, grown at 4%/yr to payout age
                      const _saPortionToday = Math.round(1000 * _saFrac);
                      const _saFV = Math.round(_saPortionToday * Math.pow(1.04, _yrs));
                      return (
                        <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 7, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#34d399" }}>💡 ROI estimate · </span>
                          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                            {is55Plus ? "RA" : "SA"} portion of <strong style={{ color: "var(--text-bright)" }}>$1,000</strong> VC3A today → <strong style={{ color: "#34d399", fontFamily: "monospace" }}>${_saPortionToday}</strong> into {is55Plus ? "RA" : "SA"} → grows to <strong style={{ color: "#34d399", fontFamily: "monospace" }}>{formatCurrency(_saFV)}</strong> at age {_pa} (4%/yr)
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div ref={rstuRef}>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                      RSTU – {is55Plus ? "RA" : "SA"} Cash Top-up <FreqToggle freqKey="vcSaFreq" durKey="vcSaDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-rstu" text={`Retirement Sum Topping-Up Scheme — cash top-up to your ${is55Plus ? "RA" : "SA"} directly (not split across accounts). Eligible for up to $8,000/yr tax relief (own account) + $8,000 for loved ones. Capped at FRS (SA) or ERS (RA). NOT counted in Annual Limit.`} />
                    </div>
                    <input type="text" inputMode="decimal" name="vcSaTopup" value={getDisplayValue("vcSaTopup", inputs.vcSaTopup)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                      readOnly={isUnder16} tabIndex={isUnder16 ? -1 : undefined}
                      aria-label="RSTU annual cash top-up" onFocus={() => setFocusedField("vcSaTopup")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.vcSaTopup ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", opacity: isUnder16 ? 0.4 : 1, cursor: isUnder16 ? "not-allowed" : "text" }} />
                    {isUnder16
                      ? <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>⚠ Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.</p>
                      : inputErrors.vcSaTopup && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.vcSaTopup}</p>}
                    {!isUnder16 && <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Tax relief up to $8,000/yr · not in Annual Limit · capped at {is55Plus ? "ERS" : "FRS"}</p>}

                    {/* Live tax-saving badge — shows estimated annual tax saved via RSTU relief */}
                    {!isUnder16 && estimatedTaxSavings > 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, padding: "7px 10px", borderRadius: 7, background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.28)" }}>
                        <div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.04em" }}>💰 Est. Tax Saved (RSTU)</span>
                          <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            Based on ~{Math.round(estimatedTaxRate * 100)}% marginal rate · relief capped at $8,000/yr
                            {eligibleRSTU < (Number(inputs.vcSaTopup) || 0) && ` · capped at FRS headroom ($${Math.round(eligibleRSTU).toLocaleString()})`}
                          </p>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: "#34d399", fontFamily: "monospace", whiteSpace: "nowrap", marginLeft: 8 }}>
                          {formatCurrency(estimatedTaxSavings)}<span style={{ fontSize: 9, fontWeight: 400, color: "#6ee7b7", marginLeft: 3 }}>/yr</span>
                        </span>
                      </div>
                    )}

                    {/* Rev #21 — RSTU per-dollar ROI heuristic */}
                    {!isUnder16 && !isForeigner && (Number(inputs.vcSaTopup) || 0) > 0 && (() => {
                      const _ca  = Number(inputs.currentAge) || 35;
                      const _pa  = Number(inputs.payoutAge)  || 65;
                      const _yrs = Math.max(0, _pa - _ca);
                      // Each $1,000 RSTU today grows at 4%/yr SA/RA rate to payout
                      const _fv  = Math.round(1000 * Math.pow(1.04, _yrs));
                      // CPF LIFE Standard Plan payout ≈ $5.40/mo per $1,000 RA (male) / $5.00/mo (female) at age 65.
                      // Apply +7%/yr deferral premium per year beyond 65 (CPF Board guidance).
                      const _baseRate = inputs.isMale !== false ? 5.40 : 5.00;
                      const _deferralBonus = Math.max(0, _pa - 65) * 0.07;
                      const _payoutRate = _baseRate * (1 + _deferralBonus); // $/mo per $1,000 RA at payout
                      const _monthlyAdd = Math.round(_fv * _payoutRate / 1000 * 10) / 10;
                      if (_yrs < 1) return null;
                      return (
                        <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 7, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#34d399" }}>💡 ROI estimate · </span>
                          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                            Each <strong style={{ color: "var(--text-bright)" }}>$1,000</strong> top-up today → <strong style={{ color: "#34d399", fontFamily: "monospace" }}>{formatCurrency(_fv)}</strong> in {is55Plus ? "RA" : "SA"} at age {_pa} (4%/yr) → est. <strong style={{ color: "#34d399", fontFamily: "monospace" }}>+${_monthlyAdd}/mo</strong> CPF LIFE ({inputs.isMale !== false ? "male" : "female"}, Standard plan)
                          </span>
                        </div>
                      );
                    })()}

                    {/* Inline gap card — only shown when a gap exists and FRS not yet met */}
                    {gapAlert && (
                      <div style={{ marginTop: 10, borderRadius: 10, padding: 12, border: `1px solid ${gapAlert.isUrgent ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`, background: gapAlert.isUrgent ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                          <AlertTriangle style={{ width: 12, height: 12, color: gapAlert.isUrgent ? "#f87171" : "#fbbf24", flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: gapAlert.isUrgent ? "#f87171" : "#fbbf24" }}>Contribution Gap</span>
                        </div>
                        <p style={{ fontSize: 10, color: gapAlert.isUrgent ? "#fca5a5" : "#fcd34d", marginBottom: 8, lineHeight: 1.4 }}>
                          {gapAlert.raLabel} is <strong>{formatCurrency(gapAlert.raForAlert)}</strong> — <strong>{formatCurrency(gapAlert.frsGap)}</strong> short of FRS ({formatCurrency(gapAlert.projFRS55)}).
                        </p>
                        <div style={{ background: gapAlert.isUrgent ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)", borderRadius: 6, padding: 8, fontSize: 9, fontFamily: "monospace" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-muted)" }}>Additional top-up needed*:</span>
                            <span style={{ fontWeight: 900, color: gapAlert.isUrgent ? "#f87171" : "#fcd34d" }}>{formatCurrency(gapAlert.annualTopUp)}/yr</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: "var(--text-muted)" }}>Monthly equivalent:</span>
                            <span style={{ fontWeight: 900, color: gapAlert.isUrgent ? "#f87171" : "#fcd34d" }}>{formatCurrency(gapAlert.monthlyTopUp)}/mo</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid rgba(100,116,139,0.25)" }}>
                            <span style={{ color: "var(--text-muted)" }}>Years to target age:</span>
                            <span style={{ fontWeight: 900, color: "var(--text-highlight)" }}>{gapAlert.yearsToGo} yrs</span>
                          </div>
                          {gapAlert.currentVcSa > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ color: "var(--text-muted)" }}>Current RSTU top-up:</span>
                              <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>{formatCurrency(gapAlert.currentVcSa)}/yr</span>
                            </div>
                          )}
                          {gapAlert.currentVcSa > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-muted)" }}>Suggested new top-up:</span>
                              <span style={{ fontWeight: 900, color: gapAlert.isUrgent ? "#f87171" : "#fcd34d" }}>{formatCurrency(gapAlert.newTopUp)}/yr</span>
                            </div>
                          )}
                          <p style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.4 }}>*Additional top-up ON TOP of current projection. {gapAlert.topupNote}.</p>
                        </div>
                        {gapAlert.annualTopUp > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setInputs(prev => ({ ...prev, vcSaTopup: gapAlert.newTopUp }));
                              showToast(`✓ RSTU set to ${formatCurrency(gapAlert.newTopUp)}/yr — gap closed`);
                            }}
                            style={{ width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 7, fontSize: 10, fontWeight: 800, border: `1px solid ${gapAlert.isUrgent ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`, background: gapAlert.isUrgent ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", color: gapAlert.isUrgent ? "#f87171" : "#fbbf24", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            ⚡ Apply Top-up — Set RSTU to {formatCurrency(gapAlert.newTopUp)}/yr
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* MRSS auto-badge — shown under RSTU when member is eligible (SC · age 55+ or PwD · RA/OA+SA < BRS · income ≤ $4k) */}
                  {(() => {
                    const _isSC = (inputs.citizenStatus === 'SC') || !inputs.citizenStatus;
                    if (!_isSC) return null;
                    const _ca  = Number(inputs.currentAge) || 0;
                    const _isPwD = !!inputs.isPwD;
                    const _mrssAgeOk = _ca >= 55 || _isPwD;
                    if (!_mrssAgeOk) return null;
                    const _brsNow = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (Number(inputs.currentYear) || 2026) - 2026)));
                    const _oa = Number(inputs.oaBalance) || 0;
                    const _sa = Number(inputs.saBalance) || 0;
                    const _mrssBalOk = _ca >= 55 ? _sa < _brsNow : (_oa + _sa) < _brsNow;
                    // BUG-6 fix: mirror engine income gate (lines 1216–1220) — include AW/bonus
                    // in the monthly gross figure.  Previously only salaryGross (OW) was used,
                    // so a member with $3,800/mo OW + $40k bonus (≈ $7,133/mo gross) was
                    // incorrectly shown as eligible when the engine would deny the grant.
                    const _owAnnual = Math.min((Number(inputs.salaryGross) || 0) * 12, 96000);
                    const _awCeil   = Math.max(0, 102000 - _owAnnual);
                    const _bonus    = Math.min(Number(inputs.salaryBonus) || 0, _awCeil);
                    const _income   = inputs.isSelfEmployed
                      ? Math.round((Number(inputs.netTradeIncome) || 0) / 12)
                      : Math.round((_owAnnual + _bonus) / 12);
                    const _mrssIncomeOk = _income <= 4000;
                    const _rstu = Number(inputs.vcSaTopup) || 0;
                    const _mrssMatch = Math.min(_rstu, 2000);
                    if (!_mrssBalOk) {
                      // Balance already at/above BRS — not eligible
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "6px 10px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", fontSize: 9, color: "var(--text-muted)" }}>
                          ℹ️ <strong>MRSS:</strong> {_ca >= 55 ? "RA" : "OA + SA"} is at or above BRS ({formatCurrency(_brsNow)}) — not eligible this year.
                        </div>
                      );
                    }
                    if (!_mrssIncomeOk) {
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "6px 10px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", fontSize: 9, color: "var(--text-muted)" }}>
                          ℹ️ <strong>MRSS:</strong> Monthly income ({formatCurrency(_income)}) exceeds $4,000 limit — not eligible.
                        </div>
                      );
                    }
                    if (_rstu === 0) {
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "7px 10px", borderRadius: 8, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 9, color: "#fbbf24" }}>
                          💡 <strong>MRSS eligible{_isPwD && _ca < 55 ? " (PwD)" : ""}:</strong> Add an RSTU top-up above to automatically receive up to <strong>$2,000/yr</strong> government match · $20,000 lifetime cap · SC only
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop: -6, marginBottom: 2, padding: "7px 10px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.3)", fontSize: 9, color: "#34d399" }}>
                        ✓ <strong>MRSS match{_isPwD && _ca < 55 ? " (PwD)" : ""}:</strong> <strong style={{ fontFamily: "monospace", fontSize: 10 }}>{formatCurrency(_mrssMatch)}/yr</strong> auto-credited to {_ca >= 55 ? "RA" : "SA"} · $20,000 lifetime cap · SC only
                        {_mrssMatch < _rstu && <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>({formatCurrency(_rstu - _mrssMatch)} excess RSTU eligible for tax relief)</span>}
                      </div>
                    );
                  })()}

                  {/* VCMA — Cash Top-up to MA (moved directly after RSTU per docx #5) */}
                  <div>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                      VCMA – Cash Top-up to MA <FreqToggle freqKey="vcMaFreq" durKey="vcMaDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-vcmacash" text="Voluntary Cash MediSave Top-up (VCMA) — direct annual cash deposit to your own MA. Credited each year, capped at the Basic Healthcare Sum (BHS, $79,000 in 2026). Not subject to the $37,740 Annual Limit. If you are eligible for MMSS (SC, age 55–70, MA below ½ BHS, income ≤ $4,000/mo), the government automatically matches your VCMA dollar-for-dollar up to $1,000/yr — the engine computes and credits the match automatically. No separate entry needed." />
                    </div>
                    {(() => {
                      const bhsNowMa = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (Number(inputs.currentYear) || 2026) - 2026)));
                      const maHeadroom = Math.max(0, bhsNowMa - (Number(inputs.maBalance) || 0));
                      const enteredVcMa = Number(inputs.vcMaCash) || 0;
                      const isOver = enteredVcMa > maHeadroom;
                      return (
                        <>
                          <input type="text" inputMode="decimal" name="vcMaCash" value={getDisplayValue("vcMaCash", inputs.vcMaCash)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                            readOnly={isUnder16} tabIndex={isUnder16 ? -1 : undefined}
                            aria-label="VCMA annual cash top-up to MA" onFocus={() => setFocusedField("vcMaCash")} style={{ width: "100%", padding: "8px 12px", background: isOver ? "rgba(251,146,60,0.07)" : "var(--bg-muted)", border: `1px solid ${inputErrors.vcMaCash ? "#f87171" : isOver ? "rgba(251,146,60,0.5)" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", opacity: isUnder16 ? 0.4 : 1, cursor: isUnder16 ? "not-allowed" : "text" }} />
                          {isUnder16
                            ? <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>⚠ Cash top-ups require age 16+. A parent/guardian may action this on the member's behalf.</p>
                            : inputErrors.vcMaCash && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.vcMaCash}</p>}
                          {!isUnder16 && (
                            <p style={{ fontSize: 10, color: maHeadroom === 0 ? "#f87171" : "var(--text-muted)", marginTop: 3 }}>
                              MA headroom to BHS: <strong style={{ color: maHeadroom === 0 ? "#f87171" : "#34d399", fontFamily: "monospace" }}>{formatCurrency(maHeadroom)}</strong>
                              {maHeadroom === 0 && <span style={{ marginLeft: 4, fontWeight: 700 }}>BHS reached ✓</span>}
                              {" "}· not in Annual Limit · no tax relief
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* MMSS auto-badge — shown under VCMA when member is eligible (SC · age 55–70 · MA < BHS/2 · income ≤ $4k · pilot ≤ 2030) */}
                  {(() => {
                    const _isSC = (inputs.citizenStatus === 'SC') || !inputs.citizenStatus;
                    if (!_isSC) return null;
                    const _ca  = Number(inputs.currentAge) || 0;
                    if (_ca < 55 || _ca > 70) return null;
                    const _baseYear = Number(inputs.currentYear) || 2026;
                    if (_baseYear > 2030) return null; // pilot ended
                    if (_baseYear < 2026) return null; // pilot not yet started
                    const _bhsNow = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, _baseYear - 2026)));
                    const _halfBhs = Math.round(_bhsNow / 2);
                    const _maBal = Number(inputs.maBalance) || 0;
                    // BUG-6 (MMSS): mirror engine income gate — include AW/bonus in monthly gross.
                    // Previously only salaryGross (OW) was checked, matching the MRSS badge error.
                    const _owAnnual_mm = Math.min((Number(inputs.salaryGross) || 0) * 12, 96000);
                    const _awCeil_mm   = Math.max(0, 102000 - _owAnnual_mm);
                    const _bonus_mm    = Math.min(Number(inputs.salaryBonus) || 0, _awCeil_mm);
                    const _income = inputs.isSelfEmployed
                      ? Math.round((Number(inputs.netTradeIncome) || 0) / 12)
                      : Math.round((_owAnnual_mm + _bonus_mm) / 12);
                    const _vcMa = Number(inputs.vcMaCash) || 0;
                    const _mmssMatch = Math.min(_vcMa, 1000);
                    if (_maBal >= _halfBhs) {
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "6px 10px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", fontSize: 9, color: "var(--text-muted)" }}>
                          ℹ️ <strong>MMSS:</strong> MA ({formatCurrency(_maBal)}) is at or above half of BHS ({formatCurrency(_halfBhs)}) — not eligible.
                        </div>
                      );
                    }
                    if (_income > 4000) {
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "6px 10px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", fontSize: 9, color: "var(--text-muted)" }}>
                          ℹ️ <strong>MMSS:</strong> Monthly income ({formatCurrency(_income)}) exceeds $4,000 limit — not eligible.
                        </div>
                      );
                    }
                    if (_vcMa === 0) {
                      return (
                        <div style={{ marginTop: -6, marginBottom: 2, padding: "7px 10px", borderRadius: 8, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 9, color: "#fbbf24" }}>
                          💡 <strong>MMSS eligible:</strong> Add a VCMA top-up above to automatically receive up to <strong>$1,000/yr</strong> MediSave match · SC only · pilot ends 2030
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop: -6, marginBottom: 2, padding: "7px 10px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.3)", fontSize: 9, color: "#34d399" }}>
                        ✓ <strong>MMSS match:</strong> <strong style={{ fontFamily: "monospace", fontSize: 10 }}>{formatCurrency(_mmssMatch)}/yr</strong> auto-credited to MA · engine auto-stops when MA reaches {formatCurrency(_halfBhs)} · SC only · pilot ends 2030
                      </div>
                    );
                  })()}

                  {/* Housing Refund (VHR) */}
                  <div>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                      Housing Refund – VHR (to OA) <FreqToggle freqKey="vcVhrFreq" durKey="vcVhrDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-vhr" text="Voluntary Housing Refund: cash returned to OA to offset CPF used for housing. Credited to OA. NOT counted in Annual Limit." />
                    </div>
                    <input type="text" inputMode="decimal" name="vcVhr" value={getDisplayValue("vcVhr", inputs.vcVhr)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Voluntary housing refund" onFocus={() => setFocusedField("vcVhr")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                  </div>

                  {/* Gov grants */}
                  <div>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                      Gov Grants (to {is55Plus ? "RA" : "SA"}) <FreqToggle freqKey="govGrantFreq" durKey="govGrantDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-govgrant" text="Government grants credited to SA (pre-55) or RA (post-55). Tracked separately for the 20% RA transfer base calculation." />
                    </div>
                    <input type="text" inputMode="decimal" name="annualGovGrant" value={getDisplayValue("annualGovGrant", inputs.annualGovGrant)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Annual government grant" onFocus={() => setFocusedField("annualGovGrant")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                  </div>

                  {/* WIS — W2: Estimate button + W3: eligibility panel */}
                  {(() => {
                    // W2: WIS estimate table by monthly income band (employee, 2025 schedule)
                    // Source: CPF Board WIS 2025 — https://www.cpf.gov.sg/member/infohub/news/wis
                    const WIS_EMPLOYEE = [
      { maxIncome: 1000, wis: 4900 }, { maxIncome: 1500, wis: 3267 },
      { maxIncome: 2000, wis: 2450 }, { maxIncome: 2500, wis: 1633 },
      { maxIncome: 3000, wis: 700  },
    ];
                    const WIS_SEP = [
      { maxIncome: 1000, wis: 3267 }, { maxIncome: 1500, wis: 2450 },
      { maxIncome: 2000, wis: 1633 }, { maxIncome: 2500, wis: 1225 },
      { maxIncome: 3000, wis: 467  },
    ];
                    const monthlyIncome = isSelfEmployed
                      ? Math.round((Number(inputs.netTradeIncome) || 0) / 12)
                      : (Number(inputs.salaryGross) || 0);
                    const table = isSelfEmployed ? WIS_SEP : WIS_EMPLOYEE;
                    const estimated = monthlyIncome >= 500 && monthlyIncome <= 3000
                      ? (table.find(r => monthlyIncome <= r.maxIncome) || table[table.length - 1]).wis
                      : null;
                    const [showEligibility, setShowEligibility] = [showWisEligibility, setShowWisEligibility]; // top-level state — no hook call here
                    return (
                      <div>
                        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 4 }}>
                          WIS – Workfare Supplement <FreqToggle freqKey="wisFreq" durKey="wisDur" inputs={inputs} setInputs={setInputs} />
                          <TooltipBox id="t-wis" text="Workfare Income Supplement (WIS): Enter your total annual WIS award. CPF portion is modelled: Employees — 60% to CPF (OA/SA/MA) + 40% cash paid separately to you. SEPs — 90% to MA (BHS-capped) + 10% cash. The cash portion (shown below) is not included in CPF projection but forms part of your real income. Auto-assessed by CPF Board — no application needed." />
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="text" inputMode="decimal" name="wisAmount" value={getDisplayValue("wisAmount", inputs.wisAmount)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Annual WIS workfare supplement" onFocus={() => setFocusedField("wisAmount")}
                            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.wisAmount ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {/* W2: Estimate WIS button */}
                          {estimated !== null && (
                            <button onClick={() => setInputs(p => ({ ...p, wisAmount: estimated }))}
                              title={`Estimate based on your salary (~$${monthlyIncome.toLocaleString()}/mo)`}
                              style={{ padding: "6px 10px", borderRadius: 7, fontSize: 9, fontWeight: 800, border: "1px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.1)", color: "#34d399", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                              ⚡ ${estimated.toLocaleString()}
                            </button>
                          )}
                        </div>
                        {(Number(inputs.wisAmount) || 0) > 0 && (
                          <p style={{ fontSize: 10, color: "#34d399", marginTop: 4 }}>
                            CPF portion: {formatCurrency(Math.round((Number(inputs.wisAmount) || 0) * (isSelfEmployed ? 0.9 : 0.6)))} ·
                            Cash paid to you: {formatCurrency(Math.round((Number(inputs.wisAmount) || 0) * (isSelfEmployed ? 0.1 : 0.4)))} (not in projection)
                          </p>
                        )}
                        {inputErrors.wisAmount && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.wisAmount}</p>}
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                          {isSelfEmployed ? "SEP: 90% → MA (BHS-capped), 10% cash (not modelled)" : "Employee: 60% → CPF (age-band split), 40% cash (not modelled)"}
                        </p>
                        {/* W3: Eligibility criteria toggle */}
                        <button onClick={() => setShowEligibility(v => !v)}
                          style={{ marginTop: 5, fontSize: 9, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                          {showEligibility ? "▲ Hide eligibility criteria" : "▼ WIS eligibility criteria"}
                        </button>
                        {showEligibility && (
                          <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 7, background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 9, color: "var(--text-muted)", lineHeight: 1.6 }}>
                            <strong style={{ color: "var(--text-highlight)" }}>WIS eligibility (2025):</strong><br />
                            • Singapore Citizen · Age ≥ 30 (or any age if PWD)<br />
                            • Avg gross monthly income: $500–$3,000<br />
                            • Live in property with Annual Value ≤ $21,000<br />
                            • Own ≤ 1 property (≤ 2 combined if married)<br />
                            • Spouse income ≤ $70,000/yr (if married)<br />
                            • <strong>Automatic</strong> — no application needed; CPF Board assesses annually
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </div>}
            </div>{/* /topups inner */}
            </div>{/* /topups gate wrapper */}

            {/* Outflows */}
            <div style={{ position: "relative" }}>
            {isForeigner && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.55)", pointerEvents: "all" }}>
                <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 18px", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>🔒 CPF scheme — not available to foreigners</div>
              </div>
            )}
            <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto", background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("outflows")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("outflows"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("outflows") ? "rgba(244,63,94,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f472b6" }}>
                  <MinusCircle style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Outflows ($/yr)</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("outflows") ? "▲" : "▼"}</span>
              </div>
              {openSections.has("outflows") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["medicalUsage", "Medical Usage (MA) — Annual", "annual"], ["medishieldIP", "MediShield Life / IP (MA) — Annual", "annual"], ["elderCareShield", "ElderShield / CareShield (MA) — Annual", "annual"]].map(([n, l, freq]) => (
                    <div key={n}><div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4 }}>{l.replace(" — Annual","")}</div>
                      <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l} style={{ width: "100%", padding: "8px 12px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} /></div>
                  ))}
                  {/* CPFIS — OA and SA separate fields */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ padding: "10px 0", borderRadius: 10, background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.18)" }}>
                      <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4, paddingLeft: 12, paddingRight: 12 }}>
                        CPFIS – OA Invested <FreqToggle freqKey="cpfisOaFreq" durKey="cpfisOaDur" inputs={inputs} setInputs={setInputs} />
                        <TooltipBox id="t-cpfis-oa" text="CPF Investment Scheme (OA): Only OA savings ABOVE $20,000 are investible — the first $20k must always remain in OA. Investment returns are NOT modelled — only the annual outflow from OA is applied. Age 18+. Complete CPFIS SAQ first." />
                      </div>
                      {(() => {
                        const oaBal = Number(inputs.oaBalance) || 0;
                        const cpfisOaInvestible = Math.max(0, oaBal - 20000);
                        const isUnder18_cpfis = (Number(inputs.currentAge) || 0) < 18;
                        return (
                          <>
                            <input type="text" inputMode="decimal" name="cpfisOaAmount" value={getDisplayValue("cpfisOaAmount", inputs.cpfisOaAmount)} onFocus={() => setFocusedField("cpfisOaAmount")}
                              onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                              readOnly={isUnder18_cpfis} tabIndex={isUnder18_cpfis ? -1 : undefined}
                              aria-label="Annual CPFIS OA investment amount"
                              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)",
                                border: `1px solid ${inputErrors.cpfisOaAmount ? "#f87171" : "rgba(244,63,94,0.2)"}`,
                                borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none",
                                fontFamily: "monospace", boxSizing: "border-box",
                                opacity: isUnder18_cpfis ? 0.4 : 1, cursor: isUnder18_cpfis ? "not-allowed" : "text" }} />
                            {isUnder18_cpfis
                              ? <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 2, paddingLeft: 12 }}>⚠ CPFIS requires age 18+</p>
                              : inputErrors.cpfisOaAmount && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2, paddingLeft: 12 }}>⚠ {inputErrors.cpfisOaAmount}</p>}
                            {!isUnder18_cpfis && (
                              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, paddingLeft: 12 }}>
                                Investible (OA − $20k floor): <strong style={{ color: cpfisOaInvestible === 0 ? "#f87171" : "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(cpfisOaInvestible)}</strong>
                                {cpfisOaInvestible === 0 && <span style={{ color: "#f87171", fontWeight: 700 }}> · OA ≤ $20k</span>}
                                {" "}· returns not modelled
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ padding: "10px 0", borderRadius: 10, background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.18)" }}>
                      <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4, paddingLeft: 12, paddingRight: 12 }}>
                        CPFIS – SA Invested <FreqToggle freqKey="cpfisSaFreq" durKey="cpfisSaDur" inputs={inputs} setInputs={setInputs} />
                        <TooltipBox id="t-cpfis-sa" text="CPF Investment Scheme (SA): Only SA savings ABOVE $40,000 are investible. SA CPFIS is only available before age 55 — SA closes at 55 (merges into RA) and cannot be invested via CPFIS after that. Investment returns are NOT modelled — only the annual outflow from SA is applied." />
                      </div>
                      {(() => {
                        const saBal = Number(inputs.saBalance) || 0;
                        const ca = Number(inputs.currentAge) || 0;
                        const is55Plus_cpfis = ca >= 55;
                        const isUnder18_cpfis_sa = ca < 18;
                        const cpfisDisabled = is55Plus_cpfis || isUnder18_cpfis_sa;
                        const cpfisSaInvestible = cpfisDisabled ? 0 : Math.max(0, saBal - 40000);
                        return (
                          <>
                            <input type="text" inputMode="decimal" name="cpfisSaAmount" value={getDisplayValue("cpfisSaAmount", inputs.cpfisSaAmount)} onFocus={() => setFocusedField("cpfisSaAmount")}
                              onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                              readOnly={cpfisDisabled} tabIndex={cpfisDisabled ? -1 : undefined}
                              aria-label="Annual CPFIS SA investment amount"
                              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)",
                                border: `1px solid ${inputErrors.cpfisSaAmount ? "#f87171" : "rgba(244,63,94,0.2)"}`,
                                borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none",
                                fontFamily: "monospace", boxSizing: "border-box",
                                cursor: cpfisDisabled ? "not-allowed" : "text",
                                opacity: cpfisDisabled ? 0.4 : 1 }} />
                            {!cpfisDisabled && inputErrors.cpfisSaAmount && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2, paddingLeft: 12 }}>⚠ {inputErrors.cpfisSaAmount}</p>}
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, paddingLeft: 12 }}>
                              {is55Plus_cpfis
                                ? <span style={{ color: "#f87171" }}>SA closed at 55 — SA CPFIS not available</span>
                                : isUnder18_cpfis_sa
                                  ? <span style={{ color: "#fbbf24" }}>⚠ CPFIS requires age 18+</span>
                                  : <>Investible (SA − $40k floor): <strong style={{ color: cpfisSaInvestible === 0 ? "#f87171" : "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(cpfisSaInvestible)}</strong>
                                    {cpfisSaInvestible === 0 && <span style={{ color: "#f87171", fontWeight: 700 }}> · SA ≤ $40k</span>}
                                    {" "}· returns not modelled</>}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {/* D1: OA Education Loan Scheme */}
                  {(() => {
                    const ca = Number(inputs.currentAge) || 0;
                    const oaBal = Number(inputs.oaBalance) || 0;
                    // BUG-21 fix: engine uses (oa + cumEduOut) * 0.40 − cumEduOut (cumulative policy formula).
                    // At input time cumEduOut = 0 (no prior withdrawals yet), so the first-year cap equals oaBal * 0.40.
                    // However, the engine's cap GROWS as prior education withdrawals accumulate — the sidebar
                    // was showing this as a hard ceiling, misleading users. We now display it as a "starting cap"
                    // with a note that the engine applies the correct cumulative formula throughout the projection.
                    const eduCap40 = Math.max(0, oaBal * 0.40);
                    const enteredEdu = Number(inputs.oaEduLoan) || 0;
                    const isOver40 = enteredEdu > eduCap40 && oaBal > 0;
                    const is55PlusEdu = ca >= 55;
                    // Age 55+ FRS check (informational — engine enforces per year)
                    const currentFRS55 = Math.round(RETIREMENT_SUMS_2026.FRS);
                    const currentSaRa = Number(is55PlusEdu ? inputs.saBalance : 0) || 0;
                    const frsNotMet = is55PlusEdu && currentSaRa < currentFRS55;
                    return (
                      <div style={{ paddingTop: 8, borderTop: "1px solid rgba(244,63,94,0.15)" }}>
                        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4 }}>
                          OA Education Loan Scheme <FreqToggle freqKey="oaEduLoanFreq" durKey="oaEduLoanDur" inputs={inputs} setInputs={setInputs} />
                          <TooltipBox id="t-oaedu" text="CPF Education Loan Scheme: use your OA savings (or a family member's) to pay subsidised tuition fees at approved local institutions (NUS, NTU, SMU, SIT, SUTD, SUSS, polytechnics, LASALLE, NAFA). Withdrawal limit: 40% of accumulated OA savings (excluding housing amounts already used), or remaining OA balance, whichever is lower. Interest accrues at 2.5%/yr immediately upon withdrawal. Repayment must begin 1 year after graduation and be completed within 12 years — in cash only, not CPF. Age 55+ lenders: FRS must be set aside in RA first. Modelled as a pure OA outflow; cash repayment back to OA is not projected here." />
                        </div>
                        {frsNotMet && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.35)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                            <AlertTriangle style={{ width: 11, height: 11, color: "#fb923c", flexShrink: 0, marginTop: 1 }} />
                            <p style={{ fontSize: 10, color: "#fdba74", margin: 0, lineHeight: 1.5 }}>
                              <strong>Age 55+ — FRS not yet met.</strong> CPF policy requires FRS to be set aside in RA before OA can be used for education loans. Engine will skip this outflow until RA ≥ FRS.
                            </p>
                          </div>
                        )}
                        <input type="text" inputMode="decimal" name="oaEduLoan"
                          value={getDisplayValue("oaEduLoan", inputs.oaEduLoan)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown}
                          onFocus={() => setFocusedField("oaEduLoan")}
                          aria-label="Annual OA education loan amount"
                          style={{ width: "100%", padding: "8px 12px",
                            background: isOver40 ? "rgba(251,146,60,0.07)" : "rgba(244,63,94,0.05)",
                            border: `1px solid ${inputErrors.oaEduLoan ? "#f87171" : isOver40 ? "rgba(251,146,60,0.5)" : "rgba(244,63,94,0.15)"}`,
                            borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none",
                            fontFamily: "monospace", boxSizing: "border-box" }} />
                        {inputErrors.oaEduLoan
                          ? <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaEduLoan}</p>
                          : <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                              Initial 40% OA cap: <strong style={{ color: eduCap40 === 0 ? "#f87171" : isOver40 ? "#fb923c" : "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(eduCap40)}</strong>
                              {isOver40 && <span style={{ color: "#fb923c", fontWeight: 700 }}> · Exceeds initial cap — engine auto-caps</span>}
                              {" "}· <span style={{ color: "var(--text-subtle)" }} title="Engine uses (OA + cumulative prior edu/investment withdrawals) × 40% − prior withdrawals each year — cap rises as education loans accumulate">Cap grows as loans accumulate ⓘ</span>
                              {" "}· OA outflow only · repayment in cash (not modelled)
                            </p>}
                      </div>
                    );
                  })()}
                  {/* OA Withdrawal (from age 55) */}
                  <div style={{ paddingTop: 8, borderTop: "1px solid rgba(244,63,94,0.15)" }}>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4 }}>
                      OA Lump Sum Withdrawal (from age 55) <FreqToggle freqKey="oaWithdrawalFreq" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-oawithdraw" text="From age 55, after SA closes, you may withdraw OA savings above the BRS ($110,200). Withdrawn from OA permanently. For Property Pledge withdrawals use the Pledge RA Withdrawal fields in the Property & Timelines panel." />
                    </div>
                    <input type="text" inputMode="decimal" name="oaWithdrawalAt55" value={getDisplayValue("oaWithdrawalAt55", inputs.oaWithdrawalAt55)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="OA lump sum withdrawal from age 55" onFocus={() => setFocusedField("oaWithdrawalAt55")} style={{ width: "100%", padding: "8px 12px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>From age 55 · partial or full withdrawal · OA balance reduces accordingly</p>
                  </div>
                  <div><div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", marginBottom: 4 }}>Medical Inflation Rate (%)</div>
                    <input type="text" inputMode="decimal" name="medicalInflationRate" value={inputs.medicalInflationRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} step="0.5" aria-label="Medical inflation rate" style={{ width: "100%", padding: "8px 12px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} /></div>
                </div>
              </div>}
            </div>{/* /outflows inner */}
            </div>{/* /outflows gate wrapper */}

            {/* CPF Transfers */}
            <div style={{ position: "relative" }}>
            {isForeigner && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.55)", pointerEvents: "all" }}>
                <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 18px", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>🔒 CPF scheme — not available to foreigners</div>
              </div>
            )}
            <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto", background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("transfers")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("transfers"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("transfers") ? "rgba(251,191,36,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fbbf24" }}>
                  <ArrowRightLeft style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>CPF Transfers ($/yr)</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("transfers") ? "▲" : "▼"}</span>
              </div>
              {openSections.has("transfers") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* OA → MA */}
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: inputErrors.oaToMaTransfer ? "#fb923c" : "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                      <span>OA → MA Transfer</span> <FreqToggle freqKey="oaToMaFreq" durKey="oaToMaDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-oatoma" text="CPF policy: OA→MA requires age 55+. You must have set aside FRS, or BRS if you own a property with sufficient lease. For self: internal move (OA ↓, MA ↑). For loved one (spouse/parent/sibling/grandparent): funds leave your OA permanently as an outflow — your MA does not increase." />
                    </div>
                    {/* Age gate warning */}
                    {!is55Plus && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.35)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                        <AlertTriangle style={{ width: 11, height: 11, color: "#fb923c", flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 10, color: "#fdba74", margin: 0, lineHeight: 1.5 }}>
                          <strong>Age 55+ required.</strong> OA→MA transfers are not permitted before age 55 (CPF policy). Any amount entered here will be ignored by the engine until age 55 is reached.
                        </p>
                      </div>
                    )}
                    {/* For self / For loved one toggle */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {[["For Self", false], ["For Loved One", true]].map(([label, val]) => (
                        <button key={label} onClick={() => setInputs(p => ({ ...p, oaToMaForLovedOne: val }))}
                          style={{ flex: 1, padding: "5px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, border: "1px solid", cursor: "pointer",
                            background: inputs.oaToMaForLovedOne === val ? (val ? "rgba(244,63,94,0.2)" : "rgba(251,191,36,0.15)") : "transparent",
                            color: inputs.oaToMaForLovedOne === val ? (val ? "#f87171" : "#fbbf24") : "var(--text-muted)",
                            borderColor: inputs.oaToMaForLovedOne === val ? (val ? "rgba(244,63,94,0.5)" : "rgba(251,191,36,0.4)") : "var(--border-strong)" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {inputs.oaToMaForLovedOne && (
                      <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 6, padding: "7px 10px", marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: "#fca5a5", margin: 0, lineHeight: 1.5 }}>
                          <strong style={{ color: "#f87171" }}>Outflow mode:</strong> Funds leave your OA permanently. Eligible recipients: spouse, parents, parents-in-law, grandparents, grandparents-in-law, or siblings. Recipient's MA must be below BHS.
                        </p>
                      </div>
                    )}
                    {(() => {
                      const bhsNow = Math.round(RETIREMENT_SUMS_2026.BHS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (Number(inputs.currentYear) || 2026) - 2026)));
                      const maRoom = Math.max(0, bhsNow - (Number(inputs.maBalance) || 0));
                      const enteredAmt = Number(inputs.oaToMaTransfer) || 0;
                      const isOver = !inputs.oaToMaForLovedOne && enteredAmt > maRoom;
                      return (
                        <>
                          <input type="text" inputMode="decimal" name="oaToMaTransfer" value={getDisplayValue("oaToMaTransfer", inputs.oaToMaTransfer)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Annual OA to MA transfer" onFocus={() => setFocusedField("oaToMaTransfer")} style={{ width: "100%", padding: "8px 12px", background: isOver ? "rgba(251,146,60,0.07)" : "rgba(251,191,36,0.05)", border: `1px solid ${inputErrors.oaToMaTransfer ? "#f87171" : isOver ? "rgba(251,146,60,0.5)" : "rgba(251,191,36,0.2)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.oaToMaTransfer && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaToMaTransfer}</p>}
                          {!inputs.oaToMaForLovedOne && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                              <p style={{ fontSize: 10, color: maRoom === 0 ? "#f87171" : "var(--text-muted)", margin: 0 }}>
                                MA: <strong style={{ color: "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(Number(inputs.maBalance) || 0)}</strong>
                                {" "}/ BHS: <strong style={{ color: "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(bhsNow)}</strong>
                                {" "}· Headroom: <strong style={{ color: maRoom === 0 ? "#f87171" : "#fbbf24", fontFamily: "monospace" }}>{formatCurrency(maRoom)}</strong>
                              </p>
                              {maRoom === 0 && <span style={{ fontSize: 9, color: "#f87171", fontWeight: 700 }}>BHS reached ✓</span>}
                            </div>
                          )}
                          {isOver && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 6, padding: "5px 8px", marginTop: 4 }}>
                              <AlertTriangle style={{ width: 10, height: 10, color: "#fb923c", flexShrink: 0 }} />
                              <p style={{ fontSize: 10, color: "#fdba74", margin: 0 }}>Exceeds BHS headroom — engine auto-caps to {formatCurrency(maRoom)}/yr</p>
                            </div>
                          )}
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                            Age 55+ required · {inputs.oaToMaForLovedOne ? "outflow from your OA (loved one's MA not tracked here)" : "internal move OA→MA"} · irreversible · no tax relief
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  {/* OA → SA (pre-55) / OA → RA (55 and above) */}
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: inputErrors.oaToSaTransfer ? "#fb923c" : "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                      <span>{is55Plus ? "OA → RA Transfer" : "OA → SA Transfer"}</span> <FreqToggle freqKey="oaToSaFreq" durKey="oaToSaDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-oatosa" text={is55Plus
                        ? "Transfer OA savings to your RA (or a loved one's RA) to earn 4% instead of 2.5%. Available from age 55. For Self: capped at ERS ($440,800) in RA. Irreversible. No tax relief. For Loved One: OA is simply an outflow — their RA is not tracked here."
                        : "Transfer OA savings to your SA (or a loved one's SA) to earn 4% instead of 2.5%. Before age 55 this goes to SA; from age 55 the engine automatically redirects the same amount to RA instead (SA is closed at 55). For Self: capped at FRS ($220,400) in SA pre-55, then ERS in RA post-55. Irreversible. No tax relief."
                      } />
                    </div>
                    {/* For Self / For Loved One toggle — matches OA→MA style */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {[["For Self", false], ["For Loved One", true]].map(([label, val]) => (
                        <button key={label} onClick={() => setInputs(p => ({ ...p, oaToSaForLovedOne: val }))}
                          style={{ flex: 1, padding: "5px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, border: "1px solid", cursor: "pointer",
                            background: inputs.oaToSaForLovedOne === val ? (val ? "rgba(244,63,94,0.2)" : "rgba(251,191,36,0.15)") : "transparent",
                            color: inputs.oaToSaForLovedOne === val ? (val ? "#f87171" : "#fbbf24") : "var(--text-muted)",
                            borderColor: inputs.oaToSaForLovedOne === val ? (val ? "rgba(244,63,94,0.5)" : "rgba(251,191,36,0.4)") : "var(--border-strong)" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {inputs.oaToSaForLovedOne && (
                      <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.25)", fontSize: 9, color: "#fca5a5", lineHeight: 1.6 }}>
                        <strong style={{ color: "#f87171" }}>For Loved One:</strong> The entered amount is deducted from <em>your</em> OA each year and treated as an outflow. Your loved one's {is55Plus ? "RA" : "SA"} is not tracked in this tool. FRS/ERS headroom check is skipped — only your OA balance limits the transfer.
                      </div>
                    )}
                    <input type="text" inputMode="decimal" name="oaToSaTransfer" value={getDisplayValue("oaToSaTransfer", inputs.oaToSaTransfer)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label={is55Plus ? "Annual OA to RA transfer" : "Annual OA to SA transfer"} onFocus={() => setFocusedField("oaToSaTransfer")} style={{ width: "100%", padding: "8px 12px", background: inputs.oaToSaForLovedOne ? "rgba(244,63,94,0.05)" : "rgba(251,191,36,0.05)", border: `1px solid ${inputErrors.oaToSaTransfer ? "#f87171" : inputs.oaToSaForLovedOne ? "rgba(244,63,94,0.2)" : "rgba(251,191,36,0.2)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    {inputErrors.oaToSaTransfer && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaToSaTransfer}</p>}
                    <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                      {inputs.oaToSaForLovedOne
                        ? `OA outflow only · loved one's ${is55Plus ? "RA" : "SA"} not tracked · irreversible · no tax relief`
                        : is55Plus
                          ? "Age 55+ · capped at ERS in RA · irreversible · not in Annual Limit · no tax relief"
                          : "Pre-55 → SA · age 55+ auto-redirects to RA · capped at FRS/ERS · irreversible · no tax relief"}
                    </p>
                    {/* NX4 fix: clarify SA→RA auto-transition so users entering this field at 40
                        understand the same amount continues as OA→RA after their 55th birthday */}
                    {!inputs.oaToSaForLovedOne && !is55Plus && (
                      <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 2 }}>
                        ⚙ From age 55 this transfer automatically redirects to RA — SA closes at 55.
                      </p>
                    )}
                    {/* Rev #10 — forward-looking auto-stop message */}
                    {!inputs.oaToSaForLovedOne && (() => {
                      const _ca = Number(inputs.currentAge) || 35;
                      const _cy = Number(inputs.currentYear) || 2026;
                      const _sa = Number(inputs.saBalance) || 0;
                      const _ra = Number(inputs.saBalance) || 0; // post-55 saBalance holds RA
                      const _targetSum = is55Plus
                        ? Math.round(RETIREMENT_SUMS_2026.ERS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, _cy - 2026)))
                        : Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, _cy - 2026)));
                      const _currentBal = is55Plus ? _ra : _sa;
                      const _label = is55Plus ? "RA" : "SA";
                      const _capLabel = is55Plus ? "ERS" : "FRS";
                      if (_currentBal >= _targetSum) {
                        return (
                          <p style={{ fontSize: 9, color: "#fb923c", marginTop: 2 }}>
                            ⚙ {_label} already at/above {_capLabel} ({formatCurrency(_targetSum)}) — transfers have no effect.
                          </p>
                        );
                      }
                      // Scan displayAccumulation for the first age where SA/RA meets or exceeds the projected FRS/ERS
                      const _crossover = displayAccumulation.find(row => {
                        const _projCap = is55Plus
                          ? Math.round(RETIREMENT_SUMS_2026.ERS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (_cy + (row.age - _ca)) - 2026)))
                          : Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (_cy + (row.age - _ca)) - 2026)));
                        const _bal = is55Plus ? (row.ra || 0) : (row.sa || 0);
                        return row.age > _ca && _bal >= _projCap;
                      });
                      if (_crossover) {
                        return (
                          <p style={{ fontSize: 9, color: "#34d399", marginTop: 2 }}>
                            ⚙ Engine auto-stops transfers at est. age <strong>{_crossover.age}</strong> when {_label} reaches projected {_capLabel}.
                          </p>
                        );
                      }
                      return (
                        <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 2 }}>
                          ⚙ {_label} does not reach {_capLabel} within the projection horizon at current inputs.
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>}
            </div>{/* /transfers inner */}
            </div>{/* /transfers gate wrapper */}

            {/* Property — consolidated section */}
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden" }}>
              <div onClick={() => toggleSection("property")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("property"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("property") ? "rgba(96,165,250,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#60a5fa" }}>
                  <Home style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Property & Timelines</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("property") ? "▲" : "▼"}</span>
              </div>
              {openSections.has("property") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Timelines */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["contributionStopAge", "Contrib Stop Age"], ["housingStopAge", "Housing Stop Age"]].map(([n, l]) => (
                      <div key={n}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: inputErrors[n] ? "#f87171" : "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                          {l}{inputErrors[n] && <span style={{ marginLeft: 4, fontSize: 9, color: "#f87171" }}>⚠</span>}
                        </label>
                        <input type="text" inputMode="decimal" name={n} value={getDisplayValue(n, inputs[n])} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={() => setFocusedField(n)} aria-label={l} aria-invalid={!!inputErrors[n]} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors[n] ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>

                  {/* Inflation */}
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Inflation Rate (%)</label>
                    <input type="text" inputMode="decimal" name="inflationRate" value={inputs.inflationRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Inflation rate" style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.inflationRate ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    {inputErrors.inflationRate && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.inflationRate}</p>}
                  </div>

                  {/* Property details */}
                  <div style={{ paddingTop: 8, borderTop: "1px solid rgba(96,165,250,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase" }}>Include Property in Net Worth</label>
                      <button onClick={() => setInputs(p => ({ ...p, includeProperty: !p.includeProperty }))} aria-pressed={!!inputs.includeProperty} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.includeProperty ? "#10b981" : "var(--border-strong)", color: inputs.includeProperty ? "#020617" : "var(--text-muted)" }}>{inputs.includeProperty ? "ON" : "OFF"}</button>
                    </div>
                    <div style={{ opacity: inputs.includeProperty ? 1 : 0.4, pointerEvents: inputs.includeProperty ? "auto" : "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Property Value ($)</label>
                        <input type="text" inputMode="decimal" name="propertyValue" value={getDisplayValue("propertyValue", inputs.propertyValue)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Property value" onFocus={() => setFocusedField("propertyValue")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.propertyValue ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                        {inputErrors.propertyValue && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.propertyValue}</p>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Prop Growth (%)</label>
                          <input type="text" inputMode="decimal" name="propertyGrowthRate" value={inputs.propertyGrowthRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.propertyGrowthRate ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                            Type
                            <TooltipBox id="t-leasehold" text="Freehold: no lease decay. Leasehold: enter remaining lease years — property growth decelerates when lease falls below 60 years." />
                          </div>
                          <button onClick={() => setInputs(p => ({ ...p, propertyLeasehold: !p.propertyLeasehold }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "1px solid var(--border-strong)", cursor: "pointer", background: inputs.propertyLeasehold ? "rgba(96,165,250,0.15)" : "var(--bg-muted)", color: inputs.propertyLeasehold ? "#60a5fa" : "var(--text-muted)" }}>
                            {inputs.propertyLeasehold ? "Leasehold" : "Freehold"}
                          </button>
                        </div>
                      </div>
                      {inputs.propertyLeasehold && (
                        <div>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Remaining Lease (years)</div>
                          <input type="text" inputMode="decimal" name="propertyLeaseYears" value={inputs.propertyLeaseYears} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Growth decelerates when lease &lt; 60 yrs</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Housing loan — locked for foreigners (no OA account) */}
                  {!isForeigner && <div style={{ paddingTop: 8, borderTop: "1px solid rgba(96,165,250,0.15)" }}>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                      Housing Loan — OA Outflow ($/yr) <FreqToggle freqKey="housingFreq" durKey="housingDur" inputs={inputs} setInputs={setInputs} />
                      <TooltipBox id="t-housing-prop" text="Annual OA deduction for mortgage repayment. Stops at Housing Stop Age. Tracked for CPF refund on property sale." />
                    </div>
                    <input type="text" inputMode="decimal" name="housingOutflow" value={getDisplayValue("housingOutflow", inputs.housingOutflow)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Annual housing loan outflow" onFocus={() => setFocusedField("housingOutflow")} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.housingOutflow ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    {inputErrors.housingOutflow && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.housingOutflow}</p>}
                  </div>}

                  {/* OA Downpayment — locked for foreigners (no OA account) */}
                  {!isForeigner && <div>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                      OA Downpayment
                      <TooltipBox id="t-dp-prop" text="One-time OA deduction for property purchase downpayment. Applied once at the specified age if OA balance permits." />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input type="text" inputMode="decimal" name="plannedDownpaymentOA" placeholder="Amount ($)" value={inputs.plannedDownpaymentOA} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                      <input type="text" inputMode="decimal" name="downpaymentAge" placeholder="Age" value={inputs.downpaymentAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Amount ($) · Age of purchase</p>
                  </div>}

                  {/* Sell Property */}
                  <div style={{ paddingTop: 8, borderTop: "1px solid rgba(96,165,250,0.15)" }}>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                      Sell Property at Age
                      <TooltipBox id="t-sell-prop" text="When you sell your property, CPF requires refund of OA principal withdrawn for housing + 2.5%/yr accrued interest. The full refund is credited to OA. Property value is removed from net worth at the sale age." />
                    </div>
                    <input type="text" inputMode="decimal" name="sellPropertyAge" value={inputs.sellPropertyAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} placeholder="0 = no sale" aria-label="Age to sell property" style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.sellPropertyAge ? "#f87171" : "var(--border-strong)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
                    {inputErrors.sellPropertyAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.sellPropertyAge}</p>}
                    {(Number(inputs.sellPropertyAge) || 0) > 0 && <p style={{ fontSize: 10, color: "#60a5fa", marginTop: 4, lineHeight: 1.5 }}>Sale at age {inputs.sellPropertyAge}: OA principal + 2.5%/yr interest refunded to OA.{inputs.usePropertyPledge ? " Pledge active: RA restored to FRS first." : ""} Property removed from net worth.</p>}
                  </div>

                  {/* Property Pledge — hidden for foreigners (requires CPF RA; SC/PR only) */}
                  {!isForeigner && <div style={{ paddingTop: 8, borderTop: "1px solid rgba(96,165,250,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                          Property Pledge (BRS only)
                          <TooltipBox id="t-pledge" text="A CPF Property Pledge lets you use your property as security so only BRS ($110,200) needs to remain in RA at 55. The pledged sum (RA above BRS) stays in RA earning 4% until you apply to CPF to withdraw it as cash directly to your bank account — it does NOT move to OA. Payouts will be significantly lower (~$730–$790/mo vs ~$1,350–$1,450/mo at FRS). Property must have lease to age 95. HDB 2-room Flexi and Lease Buyback Scheme properties ineligible." />
                        </div>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Only BRS needed in RA at 55 · pledged sum stays in RA at 4% · withdraw as cash via CPF application</p>
                      </div>
                      <button onClick={() => setInputs(p => ({ ...p, usePropertyPledge: !p.usePropertyPledge }))} aria-pressed={!!inputs.usePropertyPledge} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.usePropertyPledge ? "#10b981" : "var(--border-strong)", color: inputs.usePropertyPledge ? "#020617" : "var(--text-muted)", flexShrink: 0, marginTop: 2 }}>{inputs.usePropertyPledge ? "ON" : "OFF"}</button>
                    </div>
                    {inputs.usePropertyPledge && (() => {
                      const ca = Number(inputs.currentAge) || 35;
                      const cy = Number(inputs.currentYear) || 2026;
                      const yearsTo55 = Math.max(0, 55 - ca);
                      const projBRS55 = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (cy + yearsTo55) - 2026)));
                      const projFRS55 = projBRS55 * 2;
                      const approxPledgedAmount = Math.max(0, projFRS55 - projBRS55);
                      return (
                        <div style={{ background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4, letterSpacing: "0.05em" }}>🏠 Pledge RA Withdrawal</p>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
                            Pledged funds sit in RA (4%) until you apply to CPF to withdraw. Only RA above BRS can be withdrawn as cash. Estimated pledgeable amount at age 55: <strong style={{ color: "var(--text-bright)" }}>{formatCurrency(approxPledgedAmount)}</strong> (FRS − BRS at age 55 in {cy + yearsTo55}).
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Withdrawal Amount ($)</label>
                              <input type="text" inputMode="decimal" name="pledgeWithdrawalAmount" value={inputs.pledgeWithdrawalAmount} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Pledge RA withdrawal amount" style={{ width: "100%", padding: "8px 12px", background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Max = RA − BRS at withdrawal age</p>
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Withdrawal Age</label>
                              <input type="text" inputMode="decimal" name="pledgeWithdrawalAge" value={inputs.pledgeWithdrawalAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} aria-label="Pledge RA withdrawal age" min="55" style={{ width: "100%", padding: "8px 12px", background: "rgba(96,165,250,0.05)", border: `1px solid ${inputErrors.pledgeWithdrawalAge ? "#f87171" : "rgba(96,165,250,0.2)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                              {inputErrors.pledgeWithdrawalAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.pledgeWithdrawalAge}</p>}
                              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Min age 55 · applied once</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>}


                  {/* Property Monetisation — hidden for foreigners (LBS = HDB/SC-only; SHB = SC-only; RA top-up requires CPF RA) */}
                  {!isForeigner && <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid rgba(96,165,250,0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                          Property Monetisation
                          <TooltipBox id="t-prop-mon" text="Model a one-time property monetisation event. Choose your scheme — Downgrade (sell and buy smaller), LBS (Lease Buyback — sell tail-end of HDB lease to HDB, stay in flat, from age 65), or SHB (Silver Housing Bonus — downgrade to 3-room or smaller HDB with CPF RA bonus). The field labels, tooltips, and validations update per scheme. The engine credits cash proceeds to private assets and RA top-up directly to RA as a one-time event at your chosen age. Note: if modelling a property sale via 'Sell Property at Age', the CPF OA refund on that sale is handled separately." />
                        </p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Downgrade · LBS · Silver Housing Bonus · one-time event</p>
                      </div>
                      <button onClick={() => setInputs(p => ({ ...p, propMonetiseEnabled: !p.propMonetiseEnabled }))} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.propMonetiseEnabled ? "#60a5fa" : "var(--border-strong)", color: inputs.propMonetiseEnabled ? "#020617" : "var(--text-muted)", flexShrink: 0 }}>{inputs.propMonetiseEnabled ? "ON" : "OFF"}</button>
                    </div>
                    {inputs.propMonetiseEnabled && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Scheme selector — labels, tooltips, validation, and guidance text are scheme-specific */}
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Scheme</label>
                          <div style={{ display: "flex", background: "var(--bg-input)", padding: 3, borderRadius: 8, border: "1px solid var(--border-strong)", gap: 2 }}>
                            {[["downgrade", "Downgrade"], ["lbs", "LBS"], ["shb", "Silver HB"]].map(([val, label]) => (
                              <button key={val} onClick={() => setInputs(p => ({ ...p, propMonetiseScheme: val }))} style={{ flex: 1, padding: "4px 6px", borderRadius: 6, fontSize: 9, fontWeight: 700, border: "none", cursor: "pointer", background: (inputs.propMonetiseScheme ?? "downgrade") === val ? "#60a5fa" : "transparent", color: (inputs.propMonetiseScheme ?? "downgrade") === val ? "#020617" : "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</button>
                            ))}
                          </div>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                            {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && "Sell existing home, buy smaller. Enter net cash after CPF OA refund (handled by Sell Property at Age), agent fees, stamp duty, and replacement home cost. Any voluntary RA top-up from proceeds is optional."}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && "Sell tail-end of HDB lease to HDB; you stay in your flat for life. Available from age 65 (SC only). HDB pays an annuity premium directly into RA (enter in RA field below); you may also receive a smaller cash component. ⚠ Monthly LBS income is not modelled as a cash stream — add it as private income in Decumulation & Goals if needed."}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && "Downgrade to a 3-room or smaller HDB; govt tops up RA as a CPF bonus. Cash bonus (if any) enters private assets; CPF RA bonus enters RA. Bonus amount depends on flat type — verify the exact figures with CPF Board before entering."}
                          </p>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>Age of Event</label>
                            <input type="text" inputMode="decimal" name="propMonetiseAge" value={inputs.propMonetiseAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.propMonetiseAge ? "#f87171" : "rgba(96,165,250,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                            {inputErrors.propMonetiseAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.propMonetiseAge}</p>}
                          </div>
                          <div>
                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                              {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && "Net Cash Proceeds ($)"}
                              {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && "LBS Cash Component ($)"}
                              {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && "Cash Bonus ($)"}
                              {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && <TooltipBox id="t-pm-cash" text="Net cash received into your bank account after all deductions: sale price minus CPF OA refund (the OA refund is handled by 'Sell Property at Age'), agent commissions, stamp duties, and the cost of your replacement home. This amount is credited to your private assets at the event age." />}
                              {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && <TooltipBox id="t-pm-cash" text="The cash component HDB pays you at LBS completion — typically a small amount after the annuity premium is deducted and routed to RA. Many LBS recipients receive $0 cash (all proceeds go to RA as annuity premium). Enter 0 if your LBS deal has no cash component. Credited to private assets." />}
                              {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && <TooltipBox id="t-pm-cash" text="Any cash Silver Housing Bonus amount. Note: the SHB bonus is primarily credited to RA (enter in the RA field below), not paid as cash. This field is for any residual cash payout. Enter 0 if no cash component applies to your specific SHB type. Credited to private assets." />}
                            </div>
                            <input type="text" inputMode="decimal" name="propMonetiseCashProceeds" value={getDisplayValue("propMonetiseCashProceeds", inputs.propMonetiseCashProceeds)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("propMonetiseCashProceeds"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.propMonetiseCashProceeds ? "#f87171" : "rgba(96,165,250,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                            {inputErrors.propMonetiseCashProceeds && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.propMonetiseCashProceeds}</p>}
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 4 }}>
                            {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && "RA Top-up — Voluntary ($)"}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && "Annuity Premium to RA ($)"}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && "CPF RA Bonus ($)"}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && <TooltipBox id="t-pm-ra" text="Optional: voluntarily top up RA from your net proceeds. This grows at 4%/yr and boosts monthly CPF LIFE payouts. Leave as 0 if you prefer to keep the cash in private assets. Cannot push RA above ERS ($440,800)." />}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && <TooltipBox id="t-pm-ra" text="The annuity premium HDB pays directly into your RA — this is the core LBS mechanism. The amount depends on your flat type, remaining lease, and RA balance. It cannot exceed ERS ($440,800). This directly increases your CPF LIFE monthly payout. Check the CPF Board LBS calculator for your exact figure." />}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && <TooltipBox id="t-pm-ra" text="The CPF RA bonus credited under SHB. Amount varies by flat type: typically $30,000 for 3-room or smaller, or $15,000 for 2-room Flexi. A soft warning fires if you enter more than $90,000. Confirm the exact figure with CPF Board before using this tool for financial decisions." />}
                          </div>
                          <input type="text" inputMode="decimal" name="propMonetiseRaTopup" value={getDisplayValue("propMonetiseRaTopup", inputs.propMonetiseRaTopup)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("propMonetiseRaTopup"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.propMonetiseRaTopup ? "#f87171" : "rgba(96,165,250,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.propMonetiseRaTopup && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.propMonetiseRaTopup}</p>}
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                            {(inputs.propMonetiseScheme ?? "downgrade") === "downgrade" && "Credited to RA at event age · boosts CPF LIFE payout · reduces property value in projection"}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && "HDB annuity premium → RA · boosts CPF LIFE payout · capped at ERS ($440,800)"}
                            {(inputs.propMonetiseScheme ?? "downgrade") === "shb" && "SHB RA bonus → RA · boosts CPF LIFE payout · typically $15,000–$30,000"}
                          </p>
                          {(inputs.propMonetiseScheme ?? "downgrade") === "lbs" && (
                            <div style={{ marginTop: 6, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 10, color: "#93c5fd", lineHeight: 1.5 }}>
                              💡 <strong>LBS monthly payout not modelled:</strong> After LBS, HDB pays you a monthly income for the duration of the sold lease tail. This stream is not modelled as a recurring cash flow here. To include it, add the estimated annual LBS payout as a recurring private income amount in the <strong>Decumulation &amp; Goals</strong> panel.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>}

                  {/* Foreigner note — shown only when citizenship = Foreigner, explains what is hidden */}
                  {isForeigner && (
                    <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid rgba(251,191,36,0.2)", fontSize: 10, color: "#fde68a", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.6 }}>
                      🔒 <strong style={{ color: "#fbbf24" }}>Not available to foreigners:</strong> Housing OA Outflow, OA Downpayment, Property Pledge (BRS mode), and Property Monetisation (LBS/SHB) require a CPF account (SC or PR). Property value tracking and Sell Property at Age remain active.
                    </div>
                  )}
                </div>
              </div>}
            </div>
            {/* Private Assets — accumulation inputs: cash, savings, growth, SRS */}
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "visible", marginTop: 12, marginBottom: 0 }}>
              <div onClick={() => toggleSection("privateAssets")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("privateAssets"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("privateAssets") ? "rgba(168,85,247,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#a855f7" }}>
                  <Briefcase style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Private Assets</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("privateAssets") ? "▲" : "▼"}</span>
              </div>
              {openSections.has("privateAssets") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  
                  {/* Private Assets */}
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c084fc", textTransform: "uppercase", marginBottom: 4 }}>Current Private Assets ($)</label>
                    <input type="text" inputMode="decimal" name="currentPrivateAssets" value={getDisplayValue("currentPrivateAssets", inputs.currentPrivateAssets)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("currentPrivateAssets"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c084fc", textTransform: "uppercase", marginBottom: 4 }}>Annual Saving</label>
                      <input type="text" inputMode="decimal" name="annualPrivateSaving" value={getDisplayValue("annualPrivateSaving", inputs.annualPrivateSaving)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("annualPrivateSaving"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c084fc", textTransform: "uppercase", marginBottom: 4 }}>Growth (%)</label>
                      <input type="text" inputMode="decimal" name="privateAssetGrowthRate" value={inputs.privateAssetGrowthRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                  </div>

                  {/* SRS — Supplementary Retirement Scheme */}
                  <div style={{ paddingTop: 8, borderTop: "1px solid rgba(14,165,233,0.2)", marginTop: 4 }}>
                    <div style={{ background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 3, letterSpacing: "0.06em" }}>
                        SRS — Supplementary Retirement Scheme
                        <TooltipBox id="t-srs" text="SRS is a voluntary tax-deferred savings scheme. SC/PR: contributions up to $15,300/yr are deductible from chargeable income. Foreigners: cap is $35,700/yr (no CPF, so SRS is the main tax-deferred vehicle). At statutory retirement age (63), 50% of withdrawals are taxable. All funds must be withdrawn within 10 years of first withdrawal." />
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>Voluntary · tax-deductible contributions · 50% of withdrawals taxable · 10-yr drawdown window from age 63</p>
                    </div>

                    {/* POL-3 fix: annual cap varies by citizenship — foreigner $35,700, SC/PR $15,300 */}
                    {(() => {
                      const isForeigner = inputs.citizenStatus === 'foreigner';
                      const capAmt = isForeigner ? 35700 : 15300;
                      return (
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
                          Annual cap: <strong style={{ color: isForeigner ? "#f59e0b" : "var(--text-bright)" }}>{formatCurrency(capAmt)}</strong>
                          {isForeigner
                            ? <span style={{ color: "#f59e0b" }}> · Foreigner rate (no CPF; SRS is your primary tax-deferred scheme)</span>
                            : <> · SC/PR · set citizenship in Profile</>}
                        </p>
                      );
                    })()}

                    {/* SRS fields grid */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>Current Balance ($)</label>
                          <input type="text" inputMode="decimal" name="srsBalance" value={getDisplayValue("srsBalance", inputs.srsBalance)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("srsBalance"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsBalance ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsBalance && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsBalance}</p>}
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>Annual Contribution ($)</label>
                          <input type="text" inputMode="decimal" name="srsAnnualContribution" value={getDisplayValue("srsAnnualContribution", inputs.srsAnnualContribution)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("srsAnnualContribution"); e.target.select(); }} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsAnnualContribution ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsAnnualContribution && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsAnnualContribution}</p>}
                          {/* Live SRS tax-saving badge */}
                          {(() => {
                            const _srsCap  = isForeigner ? 35700 : 15300;
                            const _srsElig = Math.min(Number(inputs.srsAnnualContribution) || 0, _srsCap);
                            const _srsTax  = Math.round(_srsElig * estimatedTaxRate);
                            if (_srsElig <= 0 || _srsTax <= 0) return null;
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, padding: "7px 10px", borderRadius: 7, background: "rgba(14,165,233,0.10)", border: "1px solid rgba(14,165,233,0.28)" }}>
                                <div>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.04em" }}>💰 Est. Tax Saved (SRS)</span>
                                  <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                                    ~{Math.round(estimatedTaxRate * 100)}% marginal rate · 50% of withdrawals taxable from 63
                                  </p>
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 900, color: "#38bdf8", fontFamily: "monospace", whiteSpace: "nowrap", marginLeft: 8 }}>
                                  {formatCurrency(_srsTax)}<span style={{ fontSize: 9, fontWeight: 400, color: "#7dd3fc", marginLeft: 3 }}>/yr</span>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>Contrib Stop Age</label>
                          <input type="text" inputMode="decimal" name="srsContribStopAge" value={inputs.srsContribStopAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsContribStopAge ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsContribStopAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsContribStopAge}</p>}
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>Return Rate (%)</label>
                          <input type="text" inputMode="decimal" name="srsReturnRate" value={inputs.srsReturnRate} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsReturnRate ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsReturnRate && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsReturnRate}</p>}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>
                            Drawdown Start Age
                            <TooltipBox id="t-srs-draw" text="Minimum age 63 (statutory retirement age). 50% of each annual withdrawal is taxable income. Must fully deplete within 10 years of first withdrawal." />
                          </div>
                          <input type="text" inputMode="decimal" name="srsDrawdownStartAge" value={inputs.srsDrawdownStartAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsDrawdownStartAge ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsDrawdownStartAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsDrawdownStartAge}</p>}
                        </div>
                        <div>
                          <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>
                            Drawdown Years
                            <TooltipBox id="t-srs-yrs" text="Number of years over which the SRS balance is drawn down evenly. Max 10 years — IRAS requires full withdrawal within 10 years of first withdrawal." />
                          </div>
                          <input type="text" inputMode="decimal" name="srsDrawdownYears" value={inputs.srsDrawdownYears} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.srsDrawdownYears ? "#f87171" : "rgba(14,165,233,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                          {inputErrors.srsDrawdownYears && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.srsDrawdownYears}</p>}
                        </div>
                      </div>
                      {/* Live SRS projection summary */}
                      {(Number(inputs.srsBalance) > 0 || Number(inputs.srsAnnualContribution) > 0) && (() => {
                        const bal = Number(inputs.srsBalance) || 0;
                        const contrib = Math.min(Number(inputs.srsAnnualContribution) || 0, isForeigner ? 35700 : 15300); // BUG-NEW-2 fix: foreigner cap $35,700; SC/PR cap $15,300 — mirrors engine srsCap at line 602
                        const rate = (Number(inputs.srsReturnRate) || 0) / 100;
                        const stopAge = Number(inputs.srsContribStopAge) || 63;
                        const drawAge = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
                        const ca = Number(inputs.currentAge) || 35;
                        const yrsToStop = Math.max(0, Math.min(stopAge, drawAge) - ca);
                        let projBal = bal;
                        for (let i = 0; i < yrsToStop; i++) { projBal = projBal * (1 + rate) + contrib; }
                        for (let i = yrsToStop; i < drawAge - ca; i++) { projBal = projBal * (1 + rate); }
                        const drawYrs = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
                        const annualDraw = drawYrs > 0 ? Math.round(projBal / drawYrs) : projBal;
                        return (
                          <div style={{ background: "rgba(14,165,233,0.06)", borderRadius: 8, padding: "8px 10px", marginTop: 2 }}>
                            <p style={{ fontSize: 10, color: "#0ea5e9", fontWeight: 700, marginBottom: 4 }}>Projection at drawdown age {drawAge}:</p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
                              Est. balance: <strong style={{ color: "var(--text-bright)" }}>{formatCurrency(Math.round(projBal))}</strong><br/>
                              Annual draw: <strong style={{ color: "var(--text-bright)" }}>{formatCurrency(annualDraw)}</strong> × {drawYrs} yrs<br/>
                              Monthly equiv: <strong style={{ color: "#0ea5e9" }}>{formatCurrency(Math.round(annualDraw / 12))}/mo</strong> <span style={{ color: "var(--text-muted)" }}>(50% taxable)</span>
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>


                </div>
              </div>}
            </div>

            {/* ── Rev #D2: Life Events / Stress Testing panel ── */}
            {(() => {
              const lifeEvents = Array.isArray(inputs.lifeEvents) ? inputs.lifeEvents : [];
              const enabledCount = lifeEvents.filter(e => e.enabled !== false).length;
              // leEditingId / leFormState are top-level component state (hoisted from here — BUG-2 fix).
              const leErrors = (inputErrors.lifeEvents || []);
              const getEvErr = (id, field) => {
                const idx = lifeEvents.findIndex(e => e.id === id);
                const evErr = leErrors.find(e => e.idx === idx);
                return evErr ? evErr[field] : null;
              };
              const startEdit = (ev) => { setLeFormState({ ...ev }); setLeEditingId(ev.id); };
              const startNew = () => {
                const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `le-${Date.now()}`;
                setLeFormState({ id, type: 'retrenchment', label: 'Retrenchment', startAge: Number(inputs.currentAge) || 35, endAge: (Number(inputs.currentAge) || 35) + 1, magnitude: 0, enabled: true, drawSource: 'oa_then_private', destination: 'private' });
                setLeEditingId('new');
              };
              const saveEvent = () => {
                if (!leFormState.type || leFormState.startAge === "" || leFormState.startAge === undefined || leFormState.startAge === null) return;
                const isPoint = leFormState.type === 'windfall' || leFormState.type === 'early_retirement';
                // BUG-LOW fix: block saving range events with endAge < startAge or missing endAge.
                // validateInputs already shows the UI error; without this guard the bad event
                // was committed to inputs.lifeEvents and then silently skipped by the engine
                // (the age filter never matched), giving the user no indication it was inactive.
                if (!isPoint) {
                  const sa = Number(leFormState.startAge);
                  const ea = leFormState.endAge === "" || leFormState.endAge === null || leFormState.endAge === undefined
                    ? NaN : Number(leFormState.endAge);
                  if (isNaN(ea) || ea < sa) return; // error already visible in validateInputs UI
                }
                const ev = { ...leFormState, endAge: isPoint ? leFormState.startAge : leFormState.endAge };
                if (leEditingId === 'new') {
                  setInputs(p => ({ ...p, lifeEvents: [...(p.lifeEvents || []), ev] }));
                } else {
                  setInputs(p => ({ ...p, lifeEvents: (p.lifeEvents || []).map(e => e.id === ev.id ? ev : e) }));
                }
                setLeEditingId(null); setLeFormState({});
              };
              const deleteEvent = (id) => setInputs(p => ({ ...p, lifeEvents: (p.lifeEvents || []).filter(e => e.id !== id) }));
              const toggleEvent = (id) => setInputs(p => ({ ...p, lifeEvents: (p.lifeEvents || []).map(e => e.id === id ? { ...e, enabled: e.enabled === false } : e) }));
              const toggleAll = () => {
                const anyEnabled = lifeEvents.some(e => e.enabled !== false);
                setInputs(p => ({ ...p, lifeEvents: (p.lifeEvents || []).map(e => ({ ...e, enabled: !anyEnabled })) }));
              };
              const isPoint = leFormState.type === 'windfall' || leFormState.type === 'early_retirement';
              return (
                <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "visible", marginTop: 12, marginBottom: 12 }}>
                  {/* Header */}
                  <div onClick={() => toggleSection("lifeevents")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("lifeevents"); }}} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("lifeevents") ? "rgba(239,68,68,0.06)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Activity style={{ width: 14, height: 14, color: "#ef4444" }} />
                      <span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", color: "#ef4444" }}>Life Events</span>
                      {lifeEvents.length > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 800, background: enabledCount > 0 ? "rgba(239,68,68,0.2)" : "rgba(100,116,139,0.2)", color: enabledCount > 0 ? "#ef4444" : "var(--text-muted)", padding: "2px 7px", borderRadius: 10, border: `1px solid ${enabledCount > 0 ? "rgba(239,68,68,0.4)" : "var(--border-strong)"}` }}>
                          {enabledCount} active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("lifeevents") ? "▲" : "▼"}</span>
                  </div>

                  {openSections.has("lifeevents") && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {/* Intro + global toggle */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>Overlay stress-test events on your projection — retrenchments, medical crises, windfalls, and more.</p>
                        {lifeEvents.length > 0 && (
                          <button onClick={toggleAll} style={{ flexShrink: 0, marginLeft: 8, fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
                            {lifeEvents.some(e => e.enabled !== false) ? "Disable All" : "Enable All"}
                          </button>
                        )}
                      </div>

                      {/* Event list */}
                      {lifeEvents.length === 0 && leEditingId === null && (
                        <div style={{ padding: "14px 0", textAlign: "center", color: "var(--text-subtle)", fontSize: 11 }}>No events yet — click Add Event to get started.</div>
                      )}
                      {lifeEvents.map(ev => {
                        const meta = LIFE_EVENT_TYPES[ev.type] || {};
                        const isEnabled = ev.enabled !== false;
                        const evIdx = lifeEvents.findIndex(e => e.id === ev.id);
                        const evErr = leErrors.find(e => e.idx === evIdx);
                        return (
                          <div key={ev.id} style={{ marginBottom: 6, padding: "8px 10px", borderRadius: 10, background: isEnabled ? "var(--bg-muted)" : "rgba(100,116,139,0.06)", border: `1px solid ${isEnabled ? (meta.color || "#ef4444") + "44" : "var(--border-subtle)"}`, opacity: isEnabled ? 1 : 0.55 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13 }}>{meta.icon || "⚡"}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isEnabled ? (meta.color || "#ef4444") : "var(--text-muted)" }}>{ev.label || meta.label}</span>
                                <span style={{ fontSize: 10, color: "var(--text-subtle)", marginLeft: 6 }}>
                                  Age {ev.startAge}{ev.type !== 'windfall' && ev.type !== 'early_retirement' && ev.endAge !== ev.startAge ? `–${ev.endAge}` : ""}
                                  {ev.magnitude > 0 && ` · ${ev.type === 'hyperinflation' ? `${ev.magnitude}%` : `$${Number(ev.magnitude).toLocaleString()}`}${ev.type === 'medical_crisis' || ev.type === 'retrenchment' || ev.type === 'career_break' || ev.type === 'hyperinflation' ? '/yr' : ''}`}
                                </span>
                              </div>
                              <button onClick={() => toggleEvent(ev.id)} title={isEnabled ? "Disable" : "Enable"} style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5, border: `1px solid ${isEnabled ? (meta.color || "#ef4444") + "60" : "var(--border-strong)"}`, background: isEnabled ? `${meta.color || "#ef4444"}18` : "transparent", color: isEnabled ? (meta.color || "#ef4444") : "var(--text-muted)", cursor: "pointer" }}>{isEnabled ? "ON" : "OFF"}</button>
                              <button onClick={() => startEdit(ev)} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-subtle)", cursor: "pointer" }}>✎</button>
                              <button onClick={() => deleteEvent(ev.id)} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#f87171", cursor: "pointer" }}>✕</button>
                            </div>
                            {evErr && <p style={{ fontSize: 9, color: "#f87171", margin: "4px 0 0" }}>⚠ {Object.values(evErr).filter(v => typeof v === 'string').join(" · ")}</p>}
                          </div>
                        );
                      })}

                      {/* Add/Edit inline form */}
                      {leEditingId !== null && (
                        <div style={{ marginTop: 8, padding: "12px 12px", borderRadius: 12, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", marginBottom: 10 }}>{leEditingId === 'new' ? "Add Event" : "Edit Event"}</div>

                          {/* Type selector */}
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Event Type</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                              {Object.entries(LIFE_EVENT_TYPES).map(([key, meta]) => (
                                <button key={key} onClick={() => setLeFormState(p => ({ ...p, type: key, label: meta.label, endAge: (meta.isPoint ? p.startAge : p.endAge) || p.startAge }))}
                                  style={{ padding: "5px 6px", borderRadius: 6, fontSize: 9, fontWeight: 700, textAlign: "left", border: `1px solid ${leFormState.type === key ? meta.color : "var(--border-strong)"}`, background: leFormState.type === key ? `${meta.color}18` : "transparent", color: leFormState.type === key ? meta.color : "var(--text-muted)", cursor: "pointer" }}>
                                  {meta.icon} {meta.label}
                                </button>
                              ))}
                            </div>
                            {leFormState.type && <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 5 }}>{LIFE_EVENT_TYPES[leFormState.type]?.description}</p>}
                          </div>

                          {/* Label */}
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>Label</label>
                            <input type="text" value={leFormState.label || ""} onChange={e => setLeFormState(p => ({ ...p, label: e.target.value }))}
                              style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                          </div>

                          {/* Ages + Magnitude */}
                          <div style={{ display: "grid", gridTemplateColumns: isPoint ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>Start Age</label>
                              <input type="text" inputMode="decimal" value={leFormState.startAge ?? ""} onChange={e => setLeFormState(p => ({ ...p, startAge: e.target.value === "" ? "" : Number(e.target.value) }))}
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                            </div>
                            {!isPoint && (
                              <div>
                                <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>End Age</label>
                                <input type="text" inputMode="decimal" value={leFormState.endAge ?? ""} onChange={e => setLeFormState(p => ({ ...p, endAge: e.target.value === "" ? "" : Number(e.target.value) }))}
                                  style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                              </div>
                            )}
                            <div>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>
                                {leFormState.type === 'hyperinflation' ? "Rate (%)" : leFormState.type === 'windfall' ? "Amount ($)" : "$/yr"}
                              </label>
                              <input type="text" inputMode="decimal" value={leFormState.magnitude ?? ""} onChange={e => setLeFormState(p => ({ ...p, magnitude: e.target.value === "" ? "" : Number(e.target.value) }))}
                                style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-bright)", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                            </div>
                          </div>

                          {/* Draw Source — medical_crisis only */}
                          {leFormState.type === 'medical_crisis' && (
                            <div style={{ marginBottom: 8 }}>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Draw From</label>
                              <div style={{ display: "flex", gap: 4 }}>
                                {Object.entries(DRAW_SOURCE_LABELS).map(([key, lbl]) => (
                                  <button key={key} onClick={() => setLeFormState(p => ({ ...p, drawSource: key }))}
                                    style={{ flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 9, fontWeight: 700, border: `1px solid ${leFormState.drawSource === key ? "#a855f7" : "var(--border-strong)"}`, background: leFormState.drawSource === key ? "rgba(168,85,247,0.15)" : "transparent", color: leFormState.drawSource === key ? "#a855f7" : "var(--text-muted)", cursor: "pointer" }}>{lbl}</button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Destination — windfall only */}
                          {leFormState.type === 'windfall' && (
                            <div style={{ marginBottom: 8 }}>
                              <label style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Deposit To</label>
                              <div style={{ display: "flex", gap: 4 }}>
                                {Object.entries(WINDFALL_DEST_LABELS).map(([key, lbl]) => (
                                  <button key={key} onClick={() => setLeFormState(p => ({ ...p, destination: key }))}
                                    style={{ flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 9, fontWeight: 700, border: `1px solid ${leFormState.destination === key ? "#10b981" : "var(--border-strong)"}`, background: leFormState.destination === key ? "rgba(16,185,129,0.15)" : "transparent", color: leFormState.destination === key ? "#10b981" : "var(--text-muted)", cursor: "pointer" }}>{lbl}</button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Save / Cancel */}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={saveEvent} style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer" }}>Save Event</button>
                            <button onClick={() => { setLeEditingId(null); setLeFormState({}); }} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Add button */}
                      {leEditingId === null && (
                        <button onClick={startNew} style={{ width: "100%", marginTop: 8, padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "1px dashed rgba(239,68,68,0.5)", background: "transparent", color: "#ef4444", cursor: "pointer" }}>
                          + Add Life Event
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Decumulation & Goals — income targets, OA drawdown, Die with Zero */}
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "visible", marginTop: 12, marginBottom: 12 }}>
              <div onClick={() => toggleSection("decumulation")} tabIndex={0} className="sidebar-section-header" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection("decumulation"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", userSelect: "none", background: openSections.has("decumulation") ? "rgba(244,63,94,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f43f5e" }}>
                  <Target style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" }}>Decumulation &amp; Goals</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{openSections.has("decumulation") ? "▲" : "▼"}</span>
              </div>
              {openSections.has("decumulation") && <div style={{ padding: "0 16px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Monthly Goal */}
                  <div style={{ background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10, padding: 12, marginBottom: 4 }}>
                    <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f43f5e", textTransform: "uppercase", marginBottom: 4 }}>
                      Target Retirement Income ($/mo)
                      <TooltipBox id="t-target-inc" text="Your desired total monthly income in retirement — covering all expenses. Compared against the combined total of CPF LIFE + OA Drawdown + SRS + Private Assets in the Strategy tab. Use ⚡ Fill Gap below to automatically set the OA Drawdown amount needed to close any shortfall." />
                    </div>
                    <input type="text" inputMode="decimal" name="targetMonthlyIncome" value={getDisplayValue("targetMonthlyIncome", inputs.targetMonthlyIncome)} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => { setFocusedField("targetMonthlyIncome"); e.target.select(); }} aria-label="Target monthly income" style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-bright)", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace", fontWeight: 700 }} />
                  </div>


                  {/* OA Drawdown — locked for foreigners (no OA account) */}
                  <div style={{ position: "relative" }}>
                  {isForeigner && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 20, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.55)", pointerEvents: "all" }}>
                      <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: "8px 18px", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>🔒 OA Drawdown — no CPF account for foreigners</div>
                    </div>
                  )}
                  <div style={{ opacity: isForeigner ? 0.2 : 1, pointerEvents: isForeigner ? "none" : "auto", paddingTop: 8, borderTop: "1px solid rgba(244,63,94,0.15)", marginTop: 4 }}>
                    {/* Change 5: DwZ-managed state */}
                    {(() => {
                      const dwzOn = !!inputs.dieWithZeroEnabled;
                      const dwzPmt = projection._dwzOaMonthly || 0;
                      const pa = payoutAge65; // CQ-2 fix: cosmetic — keeps "from age X" banner in sync with debounced data
                      return (
                        <>
                          <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                            <p style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", marginBottom: 3, letterSpacing: "0.06em" }}>
                              OA Drawdown
                              <TooltipBox id="t-oa-draw" text="Draw monthly cash from OA after CPF LIFE starts — supplements shortfall against your retirement income goal. OA continues earning 2.5%/yr on remaining balance. Drawdown stops when OA falls to your chosen floor (bequest reserve). Set Start Age to 0 to disable." />
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>Supplements CPF LIFE payout · OA earns 2.5%/yr on remaining balance · set floor to preserve bequest</p>
                          </div>
                          {/* DwZ amber banner — shown when Die with Zero is active */}
                          {dwzOn && (
                            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 9, color: "#fde68a", lineHeight: 1.6 }}>
                              ⏳ <strong style={{ color: "#fbbf24" }}>Managed by Die with Zero</strong> — the OA draw ({dwzPmt > 0 ? `${formatCurrency(dwzPmt)}/mo from age ${pa}` : "$0/mo"}) is computed automatically. Disable Die with Zero above to edit manually.
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8, opacity: dwzOn ? 0.45 : 1, pointerEvents: dwzOn ? "none" : "auto" }}>
                      <div>
                        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                          Start Age
                          <TooltipBox id="t-oa-draw-age" text="Age to begin OA drawdown. Must be at or after your CPF LIFE payout age. Set to 0 to disable." />
                        </div>
                        <input type="text" inputMode="decimal" name="oaDrawdownStartAge" value={inputs.oaDrawdownStartAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} readOnly={dwzOn} tabIndex={dwzOn ? -1 : undefined} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.oaDrawdownStartAge ? "#f87171" : "rgba(251,191,36,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", cursor: dwzOn ? "not-allowed" : "text" }} />
                        {inputErrors.oaDrawdownStartAge && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaDrawdownStartAge}</p>}
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>0 = disabled · ≥ payout age</p>
                      </div>
                      <div>
                        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                          Monthly Draw ($)
                          <TooltipBox id="t-oa-draw-amt" text="Monthly cash drawn from OA to supplement CPF LIFE. OA continues earning 2.5%/yr on the remaining balance. Draw stops automatically when OA hits the bequest floor. Use ⚡ Fill Gap to auto-calculate the exact amount needed to meet your retirement income target." />
                        </div>
                        <input type="text" inputMode="decimal" name="oaDrawdownMonthly" value={inputs.oaDrawdownMonthly} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} readOnly={dwzOn} tabIndex={dwzOn ? -1 : undefined} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.oaDrawdownMonthly ? "#f87171" : "rgba(251,191,36,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", cursor: dwzOn ? "not-allowed" : "text" }} />
                        {inputErrors.oaDrawdownMonthly && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaDrawdownMonthly}</p>}
                      </div>
                    </div>
                          {/* ⚡ Fill Gap button — auto-sets OA draw to close income shortfall */}
                          {/* Hidden when DwZ is ON — draw is engine-managed */}
                          {!dwzOn && (() => {
                            const target = Number(inputs.targetMonthlyIncome) || 0;
                            if (target <= 0) return null;
                      const pa = payoutAge65; // CQ-2 fix: use debounced value to match payoutProjection/projection data
                      const cpfLife = payoutProjection.find(r => r.age === pa)?.[`${highlightPlan}Monthly`] || 0;
                      const srsStart = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
                      const srsYears = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
                      const srsRowAtStart = projection.find(r => r.age === srsStart);
                      const srsBalAtStart = srsRowAtStart?.srsBalance || 0;
                      const srsRate = Math.max(0, (Number(inputs.srsReturnRate) || 0) / 100);
                      const srsMo = srsYears > 0
                        ? Math.round((srsRate > 0
                            ? srsBalAtStart * srsRate / (1 - Math.pow(1 + srsRate, -srsYears))
                            : srsBalAtStart / srsYears) / 12)
                        : 0;
                      const privRow = projection.find(r => r.age === pa) || {};
                      const prevPrivRow = projection.find(r => r.age === pa - 1) || {};
                      const privMo = Math.max(0, Math.round(((prevPrivRow.privateAssets || 0) - (privRow.privateAssets || 0)) / 12));
                      const nonOaDraw = cpfLife + srsMo + privMo;
                      const requiredOADraw = Math.max(0, Math.round(target - nonOaDraw));
                      const currentDraw = Number(inputs.oaDrawdownMonthly) || 0;
                      const alreadyMet = nonOaDraw >= target;
                      return (
                        <div style={{ marginBottom: 8 }}>
                          {alreadyMet ? (
                            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, padding: "8px 12px", fontSize: 9, color: "#6ee7b7" }}>
                              ✓ Income target met by CPF LIFE + SRS + Private Assets — no OA drawdown needed.
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button
                                onClick={() => setInputs(p => ({
                                  ...p,
                                  oaDrawdownMonthly: requiredOADraw,
                                  // UX-1 fix: always use Math.max(pa, existing) so a pre-existing start age below
                                  // payoutAge (e.g. 55 when pa=65) is corrected, not silently preserved.
                                  oaDrawdownStartAge: Math.max(pa, p.oaDrawdownStartAge > 0 ? p.oaDrawdownStartAge : pa)
                                }))}
                                style={{ flex: 1, background: currentDraw === requiredOADraw ? "rgba(251,191,36,0.15)" : "#fbbf24", color: currentDraw === requiredOADraw ? "#fbbf24" : "#020617", fontWeight: 800, padding: "7px 10px", borderRadius: 8, fontSize: 10, border: currentDraw === requiredOADraw ? "1px solid rgba(251,191,36,0.4)" : "none", cursor: "pointer", textAlign: "center" }}
                              >
                                ⚡ Fill Gap — Set Draw to {formatCurrency(requiredOADraw)}/mo
                              </button>
                            </div>
                          )}
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                            Gap = {formatCurrency(target)}/mo target − {formatCurrency(nonOaDraw)}/mo (CPF LIFE + SRS + Private) = <strong style={{ color: alreadyMet ? "#10b981" : "#fbbf24" }}>{alreadyMet ? "No gap" : formatCurrency(requiredOADraw) + "/mo needed from OA"}</strong>
                          </p>
                        </div>
                            );
                          })()
                          }
                          {/* Bequest Floor — dims with the grid when DwZ ON */}
                          <div>
                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>
                              OA Bequest Floor ($)
                              <TooltipBox id="t-oa-floor" text="Minimum OA balance to preserve at all times. Drawdown stops when OA reaches this amount. Set to 0 to allow full depletion. When Die with Zero is active, floor is set to $0 automatically." />
                            </div>
                            <input type="text" inputMode="decimal" name="oaDrawdownFloor" value={inputs.oaDrawdownFloor} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} readOnly={dwzOn} tabIndex={dwzOn ? -1 : undefined} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${inputErrors.oaDrawdownFloor ? "#f87171" : "rgba(251,191,36,0.3)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box", cursor: dwzOn ? "not-allowed" : "text" }} />
                            {inputErrors.oaDrawdownFloor && <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {inputErrors.oaDrawdownFloor}</p>}
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>0 = deplete fully · preserves bequest from OA</p>
                          </div>
                          {/* OA exhaustion + sustainability warning — uses effectiveOaDraw* so DwZ is reflected */}
                          {(() => {
                            const drawActive = effectiveOaDrawStartAge > 0 && effectiveOaDrawMonthly > 0;
                            if (!drawActive) return null;
                            const exhaustAge = oaExhaustAge;
                            const oaAtDrawStart = projection.find(r => r.age === effectiveOaDrawStartAge)?.oa || 0;
                            const annualDraw = effectiveOaDrawMonthly * 12;
                            const annualInterest = oaAtDrawStart * 0.025;
                            const isEroding = annualDraw > annualInterest;
                            return (
                              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ background: exhaustAge ? "rgba(244,63,94,0.07)" : "rgba(16,185,129,0.07)", border: `1px solid ${exhaustAge ? "rgba(244,63,94,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>OA Exhaustion</span>
                                  <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "monospace", color: exhaustAge ? "#f43f5e" : "#10b981" }}>
                                    {exhaustAge ? `Age ${exhaustAge}` : "Sustains to 95+"}
                                  </span>
                                </div>
                                {isEroding && (
                                  <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "8px 12px", fontSize: 9, color: "#fde68a", lineHeight: 1.5 }}>
                                    ⚠ Draw ({formatCurrency(effectiveOaDrawMonthly)}/mo) exceeds OA interest ({formatCurrency(Math.round(annualInterest / 12))}/mo) — principal is being depleted.{exhaustAge ? ` OA reaches floor at age ${exhaustAge}.` : ""}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>{/* /OA Drawdown inner */}
                  </div>{/* /OA Drawdown gate wrapper */}

                  {/* ── Die with Zero ── */}
                  <div style={{ paddingTop: 8, borderTop: "1px solid rgba(244,63,94,0.2)", marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 800, color: "#f43f5e", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                          Die with Zero
                          <TooltipBox id="t-dwz" text="Based on Bill Perkins' concept: spend your liquid assets fully by a chosen age instead of leaving unspent wealth. The tool computes the optimal monthly draw from OA and Private Assets using the PMT annuity formula so both reach $0 at your target age. RA/CPF LIFE and MA cannot be depleted — these are governed by CPF Board rules." />
                        </p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Deplete OA + Private Assets by a target age · RA/MA excluded (CPF rules)</p>
                      </div>
                      <button onClick={() => setInputs(p => ({ ...p, dieWithZeroEnabled: !p.dieWithZeroEnabled }))} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: inputs.dieWithZeroEnabled ? "#f43f5e" : "var(--border-strong)", color: inputs.dieWithZeroEnabled ? "#fff" : "var(--text-muted)", flexShrink: 0 }}>{inputs.dieWithZeroEnabled ? "ON" : "OFF"}</button>
                    </div>
                    {inputs.dieWithZeroEnabled && (() => {
                      // Change 4: pmtOA is now sourced directly from the two-pass projection.
                      // The engine has already computed and applied this draw — no Apply button needed.
                      const pa       = payoutAge65; // CQ-2 fix: use debounced value to match projection/payoutProjection data
                      const dwzAge   = Number(inputs.dieWithZeroAge) || 85;
                      const n        = Math.max(1, dwzAge - pa);
                      const pmtOA    = projection._dwzOaMonthly || 0;  // from two-pass engine (OA)
                      // P1-D fix: read pmtPriv from the engine's stored value (_dwzPrivMonthly),
                      // which was computed by the DWZ two-pass and injected into the final engine run.
                      // The old local recalculation was display-only and never matched actual engine deductions.
                      const pmtPriv  = projection._dwzPrivMonthly || 0; // from two-pass engine (private)
                      const oaAtPayout    = projection.find(r => r.age === pa)?.oa || 0;
                      const privAtPayout  = projection.find(r => r.age === pa)?.privateAssets || 0;
                      const cpfLife       = payoutProjection.find(r => r.age === pa)?.[`${highlightPlan}Monthly`] || 0;
                      const totalMonthly  = cpfLife + pmtOA + pmtPriv;
                      const srsDwzStart   = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
                      const srsDwzYrs     = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
                      const srsAtStart    = projection.find(r => r.age === srsDwzStart)?.srsBalance || 0;
                      // P2-B fix: PMT annuity formula to match engine depletion (was naive balance/years/12)
                      const srsDwzRate    = Math.max(0, (Number(inputs.srsReturnRate) || 0) / 100);
                      const srsAnnualDwz  = srsDwzYrs > 0
                        ? (srsDwzRate > 0
                            ? Math.round(srsAtStart * srsDwzRate / (1 - Math.pow(1 + srsDwzRate, -srsDwzYrs)))
                            : Math.round(srsAtStart / srsDwzYrs))
                        : srsAtStart;
                      const srsMoDwz      = Math.round(srsAnnualDwz / 12);
                      const srsWarning    = dwzAge > srsDwzStart + srsDwzYrs;
                      const dwzAgeErr     = inputErrors.dieWithZeroAge;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {/* Target depletion age input */}
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#f43f5e", textTransform: "uppercase", marginBottom: 4 }}>Target Age (Deplete by)</label>
                            <input type="text" inputMode="decimal" name="dieWithZeroAge" value={inputs.dieWithZeroAge} onChange={handleInputChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={e => e.target.select()} style={{ width: "100%", padding: "8px 12px", background: "var(--bg-muted)", border: `1px solid ${dwzAgeErr ? "#f87171" : "rgba(244,63,94,0.35)"}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                            {dwzAgeErr
                              ? <p style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>⚠ {dwzAgeErr}</p>
                              : <>
                                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Age {pa} (payout) → Age {dwzAge} = {n} year drawdown window</p>
                                  {/* NX3 fix: disclose residual OA if correction was needed */}
                                  {(projection._dwzResidualOa || 0) > 500 && (
                                    <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 3 }}>
                                      ⚠ OA projected to retain ~{formatCurrency(Math.round(projection._dwzResidualOa / 1000) * 1000)} at age {dwzAge} due to ongoing contributions — draw auto-corrected upward to compensate.
                                    </p>
                                  )}
                                </>
                            }
                          </div>
                          {/* Auto-applied badge — replaces the old ⚡ Apply button */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, padding: "7px 12px" }}>
                            <span style={{ fontSize: 14 }}>✓</span>
                            <div>
                              <p style={{ fontSize: 10, fontWeight: 800, color: "#10b981", margin: 0 }}>OA Draw auto-applied to projection</p>
                              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, marginTop: 1 }}>{pmtOA > 0 ? `${formatCurrency(pmtOA)}/mo drawn from OA starting age ${pa}` : "OA balance at payout age is $0 — no draw computed"}</p>
                            </div>
                          </div>
                          {/* Computed PMT summary table */}
                          <div style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                            <p style={{ fontSize: 10, fontWeight: 800, color: "#f43f5e", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.06em" }}>Computed Draw Schedule (PMT)</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {[
                                // OA Draw — hidden for foreigners (no OA account)
                                ...(!isForeigner ? [["OA Draw/mo", pmtOA > 0 ? formatCurrency(pmtOA) : "—", "#fbbf24", `OA at age ${pa}: ${formatCurrency(oaAtPayout)} · 2.5%/yr · ${n}yr window`]] : []),
                                ["SRS Draw/mo", srsMoDwz > 0 ? formatCurrency(srsMoDwz) : "—", "#0ea5e9", `IRAS-governed: max 10yr from age ${srsDwzStart}`],
                                ["Private Draw/mo", pmtPriv > 0 ? formatCurrency(pmtPriv) : "—", "#10b981", `Private assets ${formatCurrency(privAtPayout)} at age ${pa}`],
                                // CPF LIFE — hidden for foreigners (no CPF account, $0 payout is misleading)
                                ...(!isForeigner ? [["CPF LIFE/mo", formatCurrency(cpfLife), "#a855f7", "Lifetime annuity — cannot be depleted"]] : []),
                              ].map(([lbl, val, color, note]) => (
                                <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 5, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                  <div>
                                    <span style={{ fontSize: 10, fontWeight: 700, color }}>{lbl}</span>
                                    <p style={{ fontSize: 8, color: "var(--text-subtle)", margin: 0, marginTop: 1 }}>{note}</p>
                                  </div>
                                  <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 12, color }}>{val}</span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-bright)" }}>Total/mo</span>
                                <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 14, color: "#f43f5e" }}>{formatCurrency(totalMonthly + srsMoDwz)}</span>
                              </div>
                            </div>
                          </div>
                          {/* CPF constraints notice */}
                          <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 9, color: "#fde68a", lineHeight: 1.6 }}>
                            {isForeigner ? (
                              <><strong style={{ color: "#fbbf24" }}>Foreigner constraints:</strong> OA, RA, and MA are not applicable — only SRS and Private Assets are included in the draw schedule. SRS is capped at a 10-year withdrawal window by IRAS regardless of target age.
                              {srsWarning && <span style={{ color: "#f87171" }}> ⚠ Your Die with Zero age ({dwzAge}) exceeds your SRS window ({srsDwzStart + srsDwzYrs}) — SRS depletes at age {srsDwzStart + srsDwzYrs}.</span>}</>
                            ) : (
                              <><strong style={{ color: "#fbbf24" }}>CPF Constraints:</strong> RA and MA cannot be depleted by choice — RA funds CPF LIFE for life; MA withdrawals are limited to approved medical uses. SRS is capped at a 10-year withdrawal window by IRAS regardless of target age.
                              {srsWarning && <span style={{ color: "#f87171" }}> ⚠ Your Die with Zero age ({dwzAge}) exceeds your SRS window ({srsDwzStart + srsDwzYrs}) — SRS depletes at age {srsDwzStart + srsDwzYrs}.</span>}</>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>


                </div>
              </div>}
            </div>
            {/* Gap Alert — compact summary banner; full detail card lives under RSTU in Inflows.
                Hidden for foreigners: no CPF account means no RA, no FRS, no gap concept. */}
            {gapAlert && !isForeigner && (
              <div style={{ borderRadius: 10, padding: "9px 12px", border: `1px solid ${gapAlert.isUrgent ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`, background: gapAlert.isUrgent ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <AlertTriangle style={{ width: 12, height: 12, color: gapAlert.isUrgent ? "#f87171" : "#fbbf24", flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: gapAlert.isUrgent ? "#fca5a5" : "#fcd34d", lineHeight: 1.3 }}>
                    RA gap: <strong>{formatCurrency(gapAlert.frsGap)}</strong> short of FRS · +{formatCurrency(gapAlert.annualTopUp)}/yr needed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenSections(prev => {
                      const next = new Set(prev);
                      next.add("topups");
                      try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([...next])); } catch { }
                      return next;
                    });
                    setTimeout(() => rstuRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
                  }}
                  style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800, border: `1px solid ${gapAlert.isUrgent ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`, background: gapAlert.isUrgent ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", color: gapAlert.isUrgent ? "#f87171" : "#fbbf24", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  Fix in Inflows ↗
                </button>
              </div>
            )}
          </div>
          {/* Confidence badge — pinned at sidebar bottom, always visible */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, background: "var(--bg-base)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: "#34d399", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "3px 8px" }}>
              <span>📅</span> 2026 CPF Rates
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: "#94a3b8", background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 20, padding: "3px 8px" }}>
              <span>🎓</span> Educational Tool
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 20, padding: "3px 8px" }}>
              <span>🔒</span> Data stays local
            </span>
          </div>
        </aside>
        {/* Confidence badge comment cleaned up */}
        <section className="cpf-main-wrap" style={{ minWidth: 0, boxSizing: "border-box", width: "100%" }}>
          {/* Tabs + Persistent KPI Strip — sticky within the main scroll panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: "16px 16px 0 0", zIndex: 30, boxShadow: "var(--shadow-panel)" }}>
            {/* Tab navigation */}
            <div className="cpf-tabs" role="tablist" aria-label="Dashboard sections" style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", padding: "6px 6px 0", gap: 2, borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
              {[["welcome", "Welcome", Lightbulb, "#64748b"], ["summary", "Summary", PieChart, "#10b981"], ["strategy", "Strategy", Target, "#f43f5e"], ["accumulation", "Growth", BarChart3, "#3b82f6"], ["life", "LIFE", ShieldCheck, "#a855f7"], ["compare", "Compare", Split, "#f59e0b"], ["table", "Data Table", TableIcon, "#94a3b8"], ["notes", "Docs", BookOpen, "#60a5fa"]].map(([id, label, Icon, accent]) => {
                const isLifeLocked = id === "life" && isForeigner;
                return (
                <button key={id} role="tab" aria-selected={activeTab === id} aria-controls={`panel-${id}`}
                  onClick={() => { if (isLifeLocked) return; setActiveTab(id); }}
                  title={isLifeLocked ? "CPF LIFE — not available to foreigners" : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: "10px 10px 0 0", fontSize: 11, fontWeight: 700, border: "none", cursor: isLifeLocked ? "not-allowed" : "pointer", background: activeTab === id ? "var(--bg-base)" : "transparent", color: activeTab === id ? accent : isLifeLocked ? "rgba(168,85,247,0.3)" : "var(--text-muted)", borderBottom: activeTab === id ? `2px solid ${accent}` : "2px solid transparent", transition: "all 0.15s", whiteSpace: "nowrap", marginBottom: -1, opacity: isLifeLocked ? 0.45 : 1 }}>
                  <Icon style={{ width: 12, height: 12 }} />{label}{isLifeLocked && <span style={{ fontSize: 9, marginLeft: 2 }}>🔒</span>}
                </button>
                );
              })}
            </div>
            {/* Persistent KPI strip */}
            {activeTab !== "welcome" && activeTab !== "notes" && (
              <div className="kpi-strip" style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", gap: 0, background: "var(--bg-muted)", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                {(() => {
                  const pa = payoutAge65; // CQ-2 fix: use debounced value to match displayProjection/displayAccumulation
                  // Use displayProjection (already inflation-adjusted when isRealDollars=true)
                  const paRow = displayProjection.find(d => d.age === pa) || displayProjection.find(d => d.age > pa) || displayProjection[0];
                  // totalCpfAtPayout from displayAccumulation (also inflation-adjusted)
                  const dispPayoutData = displayAccumulation.find(d => d.age === pa) || {};
                  const dispTotal = (dispPayoutData.oa || 0) + (dispPayoutData.sa || 0) + (dispPayoutData.ma || 0) + (dispPayoutData.ra || 0);
                  // RA at 55 — from displayAccumulation; if already past 55, use current RA
                  const ca2 = Number(inputs.currentAge) || 35;
                  const ra55Row = ca2 >= 55
                    ? displayAccumulation[0]  // current state
                    : displayAccumulation.find(r => r.age === 55);
                  const ra55 = ra55Row?.ra || 0;
                  const ra55Label = ca2 >= 55 ? "Current RA" : "RA at 55";
                  return [
                    { label: "At Payout", value: formatCurrency(dispTotal), color: "#60a5fa", tip: "Total CPF balance (OA+MA+RA) at your chosen payout age" },
                    { label: "Monthly (Std)", value: paRow?.standardMonthly ? formatCurrency(paRow.standardMonthly) : "—", color: "#94a3b8", tip: "Standard Plan: fixed level monthly payout for life" },
                    { label: "Monthly (Esc)", value: paRow?.escalatingMonthly ? formatCurrency(paRow.escalatingMonthly) : "—", color: "#10b981", tip: "Escalating Plan: starts ~20% lower, grows 2%/yr for life" },
                    { label: "Monthly (Bas)", value: paRow?.basicMonthly ? formatCurrency(paRow.basicMonthly) : "—", color: "#f59e0b", tip: "Basic Plan: RA self-funds to ~age 90, then pool phase" },
                    { label: ra55Label || "RA at 55", value: formatCurrency(ra55), color: "#a855f7", tip: ca2 >= 55 ? "Current Retirement Account balance — determines CPF LIFE payout tier (BRS/FRS/ERS)" : "Projected RA at age 55 — determines CPF LIFE payout tier (BRS/FRS/ERS)" },
                    { label: "Payout Age", value: `${inputs.payoutAge}`, color: "#fbbf24", tip: "Age CPF LIFE payouts begin. Deferring allows RA to grow further, increasing monthly payouts. Estimates based on 2026 CPF Board data." },
                  ];
                })().map(({ label, value, color, tip }, i) => (
                  <div key={i} title={tip || ""} style={{ padding: "16px 20px", borderRight: "1px solid var(--border-subtle)", flex: "1 1 0", minWidth: 100, textAlign: "center", boxSizing: "border-box", cursor: "help", background: i === 0 ? "rgba(96,165,250,0.08)" : i > 0 && i < 4 ? "rgba(16,185,129,0.04)" : "transparent" }}>
                    <div className="cpf-kpi-label" style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? "#60a5fa" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    <div className="cpf-kpi-value" style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "monospace", textShadow: "var(--shadow-kpi)" }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Tab content panels — scrollable row 2 of main wrap grid */}
          <div className="cpf-tab-content">
            {/* ── WELCOME TAB ── */}
            {activeTab === "welcome" && (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 28, borderRadius: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}><Lightbulb style={{ width: 22, height: 22, color: "#10b981" }} />CPF Planner Pro — Welcome Guide</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                  {/* Page 1 */}
                  <div style={{ background: "var(--bg-muted)", borderRadius: 16, border: "1px solid var(--border-strong)", overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(135deg,#064e3b,#065f46)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ background: "#10b98122", padding: 12, borderRadius: 12 }}><Calculator style={{ width: 24, height: 24, color: "#10b981" }} /></div>
                      <div><h4 style={{ fontSize: 18, fontWeight: 900, color: "#ecfdf5", marginBottom: 2 }}>Welcome to CPF Planner Pro</h4><p style={{ fontSize: 12, color: "#6ee7b7" }}>Your end-to-end Singapore retirement simulation engine</p></div>
                    </div>
                    <div style={{ padding: "20px 24px" }}>
                      <p style={{ color: "var(--text-main)", fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>This tool models your entire CPF journey — from today's balances through to monthly payouts in retirement — using <strong>2026 CPF Board rates and policies</strong>.</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
                        {[["Year-by-year accumulation", TrendingUp], ["CPF LIFE plan comparison", ShieldCheck], ["Monte Carlo stress testing", Activity], ["Milestone alerts", Bell], ["Holistic Strategy & ⚡ Fill Gap", Target], ["OA Drawdown decumulation engine", ArrowRightLeft], ["Side-by-side scenario diff", Split], ["PDF & CSV export", Download], ["SRS tax-deferred savings", BookOpen], ["Property Monetisation (LBS / downgrade)", Home], ["Die with Zero draw-down planner", Clock], ["7 sample profiles to explore instantly", Users], ["PR G/G & F/G rates with auto-advancement", Users], ["Recurring / One-Time frequency toggles", ArrowRightLeft], ["OA→SA / OA→RA For Loved One transfers", Users], ["Annual Cashflow Ledger", TableIcon], ["OA Education Loan Scheme", BookOpen], ["PwD MRSS under-55 bypass", ShieldCheck], ["MMSS 5-year pilot (2026–2030)", Gift], ["Accumulation: SA pre-55 / RA from-55 split", BarChart3]].map(([text, Icon], i) => (
                          <div key={i} style={{ background: "var(--bg-base)", padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border-subtle)" }}>
                            <Icon style={{ width: 14, height: 14, color: "#10b981" }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-highlight)" }}>{text}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "var(--bg-base)", padding: 14, borderRadius: 10, border: "1px solid var(--border-subtle)", marginTop: 16 }}>
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}><strong style={{ color: "var(--text-bright)" }}>Data stays on your device.</strong> Use <strong style={{ color: "var(--text-bright)" }}>Export Profile</strong> to back up your inputs as a JSON file, or Share to generate an encoded profile code. No server storage — everything runs locally in your browser. Hit <strong style={{ color: "var(--text-bright)" }}>Samples</strong> in the header to instantly load a pre-built profile and start exploring.</p>
                      </div>
                    </div>
                  </div>
                  {/* Page 2 */}
                  <div style={{ background: "var(--bg-muted)", borderRadius: 16, border: "1px solid var(--border-strong)", overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(135deg,#1e3a5f,#1e40af)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ background: "#3b82f622", padding: 12, borderRadius: 12 }}><User style={{ width: 24, height: 24, color: "#60a5fa" }} /></div>
                      <div><h4 style={{ fontSize: 18, fontWeight: 900, color: "#eff6ff", marginBottom: 2 }}>Setting Up Your Profile</h4><p style={{ fontSize: 12, color: "#93c5fd" }}>Step 1 — The Input Engine (left panel)</p></div>
                    </div>
                    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                      {[["1", "Enter your CPF balances & gender", "Type your current OA, SA, and MA balances. Select Male or Female — this sets the correct CPF LIFE payout ratio (~$540/mo vs ~$500/mo per $100k RA). Select SC or PR — PR members in Year 1 or 2 get lower contribution rates, with the engine automatically advancing from Yr 1 → Yr 2 → Yr 3+ rates each projection year.", "#3b82f6"], ["2", "Auto-Calc Contributions (SC / PR / SEP)", "For employed members: enter OW, AW, and Salary Growth %, then click ⚡ Auto-Calc. SC uses full rates. PR members: select tenure year (1 / 2 / 3+) and rate type — G/G (default, graduated employer) or F/G (full employer 17%, requires joint CPF application). Auto-Calc uses the correct rates and the engine advances tiers automatically year-by-year. SEP members use the Inflows (VC3A) panel instead.", "#10b981"], ["3", "Add voluntary top-ups & CPF Transfers", "RSTU top-ups to SA/RA, gov grants, MRSS/MMSS. Every inflow and outflow field has a Recurring / One-Time frequency toggle — use One-Time for lump sums that only apply in the current year. CPF Transfers: OA→SA/RA (For Self: internal move; For Loved One: OA outflow only, no FRS cap). CPFIS: OA above $20k and SA above $40k are investible separately.", "#a855f7"], ["4", "Review the Inflows panel limit", "The Inflows panel tracks the $37,740 CPF Annual Limit for VC contributions. It turns orange if your combined VC3A/RSTU inputs exceed your remaining allowance.", "#fbbf24"], ["5", "Set your life-phase timelines", "Use Contrib Stop Age (when you retire) and Housing Stop Age (when your mortgage ends) to model transitions accurately. If selling property, enter Sell Property at Age — CPF requires refund of OA housing principal + 2.5%/yr accrued interest, credited back to OA.", "#fb923c"], ["6", "Configure SRS (optional)", "Enter your SRS balance, annual contribution (max $15,300/yr for SC/PR), and drawdown start age in the SRS panel. Contributions are tax-deductible; 50% of each withdrawal is taxable from age 63; full balance must be withdrawn within 10 years of first withdrawal. The engine models growth and drawdown separately.", "#0ea5e9"], ["7", "Plan decumulation income & Property Monetisation", "Set a Target Monthly Income in Decumulation & Goals. Click ⚡ Fill Gap to auto-set the OA Drawdown amount. If you plan to downgrade, use LBS, or sell and buy smaller, toggle Property Monetisation in the Property & Timelines section to add net cash proceeds and any RA top-up to the projection.", "#f43f5e"], ["8", "Try Die with Zero mode (optional)", "Toggle Die with Zero in Decumulation & Goals. Set a target depletion age — the tool automatically computes the exact monthly OA draw using the PMT annuity formula and applies it directly to the projection. The OA draw is shown as auto-applied in the panel. RA and CPF LIFE payouts are unaffected.", "#34d399"]].map(([num, title, desc, color]) => (
                        <div key={num} style={{ display: "flex", gap: 14 }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{num}</div>
                          <div><h5 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-bright)", marginBottom: 4 }}>{title}</h5><p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Page 3 */}
                  <div style={{ background: "var(--bg-muted)", borderRadius: 16, border: "1px solid var(--border-strong)", overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(135deg,#3b0764,#6b21a8)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ background: "#a855f722", padding: 12, borderRadius: 12 }}><LayoutDashboard style={{ width: 24, height: 24, color: "#c084fc" }} /></div>
                      <div><h4 style={{ fontSize: 18, fontWeight: 900, color: "#faf5ff", marginBottom: 2 }}>Exploring the Dashboard</h4><p style={{ fontSize: 12, color: "#d8b4fe" }}>Step 2 — The right panel tabs</p></div>
                    </div>
                    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {[["Summary", PieChart, "#10b981", "Key metrics at a glance: total CPF at payout age, net worth breakdown doughnut chart, estate planning panel, milestone alerts, 20% RA-to-OA transfer notice, and What-If Explorer with SA/RA text override."], ["Strategy", Target, "#f43f5e", "Holistic income planner for retirement. Set your Target Monthly Income, then click ⚡ Fill Gap to auto-set the OA Drawdown needed to close the income gap. Gantt timeline shows all income streams. Income table shows CPF LIFE, OA Drawdown (with real exhaustion age), SRS, and Private Assets side by side."], ["Accumulation", BarChart3, "#3b82f6", "Stacked area chart of OA/SA/MA/RA year-by-year. Toggle Monte Carlo to overlay a P10–P90 confidence band from 200 simulations. Choose Mild (±0.5%), Base (±1%), or Stress (±2%) variance. Real vs Nominal dollar toggle adjusts for inflation."], ["LIFE Comparison", ShieldCheck, "#a855f7", "Side-by-side payout curves for Standard, Escalating, and Basic plans. Vertical lines mark exact break-even ages. Toggle between Bequest and Cumulative Payout views. Basic plan payout = PMT formula; bequest includes full premium refund during Phase 1."], ["Compare", Split, "#fb923c", "Save two scenarios (e.g. retire at 65 vs 70) and view a colour-coded diff table showing every metric that changes between them."], ["Data Table", TableIcon, "#fbbf24", "Full year-by-year projection table with sticky Age column, Yield (B/S/E) amounts, and Yield IRR %. Download as CSV."]].map(([title, Icon, color, desc]) => (
                        <div key={title}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}15`, border: `1px solid ${color}33`, padding: "4px 10px", borderRadius: 8, marginBottom: 6 }}>
                            <Icon style={{ width: 12, height: 12, color }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color }}>{title}</span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Page 4 */}
                  <div style={{ background: "var(--bg-muted)", borderRadius: 16, border: "1px solid var(--border-strong)", overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(135deg,#78350f,#92400e)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ background: "#fbbf2422", padding: 12, borderRadius: 12 }}><Lightbulb style={{ width: 24, height: 24, color: "#fbbf24" }} /></div>
                      <div><h4 style={{ fontSize: 18, fontWeight: 900, color: "#fffbeb", marginBottom: 2 }}>Advanced Features & Disclaimer</h4><p style={{ fontSize: 12, color: "#fde68a" }}>Step 3 — Power tools and legal notice</p></div>
                    </div>
                    <div style={{ padding: "20px 24px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginBottom: 20 }}>
                        {[["Share Link", Link, "Encode your entire profile into a compact code. Send to a financial advisor or save as a bookmark."], ["PDF Report", Download, "Print-ready 6-page report: cover KPIs, input parameters & CPF LIFE estimates, charts, year-by-year projection & sensitivity, Decumulation Strategy (income table + OA exhaustion age), milestones & disclaimer."], ["SEP Mode", Briefcase, "Self-Employed mode: no mandatory contributions. VC3A up to $37,740/yr split proportionally across OA/SA/MA. BHS and ERS caps enforced."], ["Monte Carlo", Activity, "200 simulations with selectable variance: Mild ±0.5% / Base ±1% / Stress ±2%. Toggle in the Accumulation tab. Probability of Sufficiency badge shows the active band."], ["SRS", BookOpen, "Tax-deferred savings scheme — contributions deductible up to $15,300/yr (SC/PR). 50% of withdrawals taxable from age 63; full balance must be withdrawn within 10 years. Model in the SRS panel."], ["Property Monetisation", Home, "One-time event: downgrade, Lease Buyback Scheme, or Silver Housing Bonus. Net cash proceeds to private assets; RA top-up to RA. Now in the Property & Timelines panel."], ["Die with Zero", Clock, "PMT-based draw-down planner — toggle in Decumulation & Goals. Set a target depletion age; the OA draw is computed via PMT and auto-applied to the projection immediately. All liquid assets reach $0 at that age; RA/CPF LIFE unaffected."], ["Sample Profiles", Users, "7 pre-built scenarios from Blank Slate to Post-55 RA Builder. Load from the Samples button in the header (desktop) or hamburger menu (mobile) to explore the tool instantly."], ["PR G/G & F/G Rates", Users, "PR members in Year 1 or 2 can select G/G (graduated employer, default) or F/G (full employer 17% — requires joint CPF application). The engine automatically advances Yr 1 → Yr 2 → Yr 3+ rates in the projection."], ["Recurring / One-Time Toggles", ArrowRightLeft, "Every inflow/outflow field has a frequency toggle. 'Recurring' applies the amount every projection year. 'One-Time' applies it only in the first projection year — ideal for lump-sum top-ups or one-off withdrawals."], ["OA→SA / OA→RA For Loved One", Users, "CPF Transfers panel supports For Self (internal move with FRS/ERS cap) and For Loved One (OA outflow only, no headroom constraint on the recipient). Applies to both OA→SA (pre-55) and OA→RA (55+)."], ["Annual Cashflow Ledger", TableIcon, "In the Data Table tab, switch to Cashflow Ledger for a full year-by-year breakdown: mandatory, voluntary, grants, OA/SA/RA/MA interest, housing outflow, medical, OA drawdown, loved-one transfers, and CPFIS — with column totals."], ["Gender Toggle", Users, "Male/Female selection affects CPF LIFE payout. Female payouts are ~7% lower (0.93× male) due to longer life expectancy. Estimates use 2026 CPF Board data with linear interpolation."], ["OA Drawdown & ⚡ Fill Gap", Download, "Draw monthly cash from OA after CPF LIFE starts to close the income gap. Set a Target Monthly Income, then click ⚡ Fill Gap to auto-set the exact draw amount. OA Exhaustion Age badge updates live."], ["Property Sale & CPF Refund", Home, "Enter Sell Property at Age in Timelines & Property. On sale, CPF refunds OA housing principal + 2.5%/yr interest to OA. With pledge active, refund restores RA to FRS first."], ["OA Education Loan", BookOpen, "Model CPF Education Scheme withdrawals: use OA savings to fund tuition at approved local institutions. Engine enforces the 40% OA ceiling and age 55+ FRS-first rule. Modelled as a pure OA outflow."], ["PwD MRSS Bypass", ShieldCheck, "Enable the Person with Disabilities (PwD) flag in Profile to unlock MRSS below age 55. PwD members are exempt from the age-55 requirement for the Matched Retirement Savings Scheme."], ["Retirement Sum Growth", TrendingUp, "Control how fast FRS, BRS, ERS, and BHS targets rise each year (default 3%, CPF Board historical average). Preset buttons: 2% / 3% / 4%. Found in the Salary section."], ["Phased Salary & Career Break", Briefcase, "Model a growth rate change at a specific age (Phase 2) or a full contribution pause for a career break age range (sabbatical, NS, parental leave). Both affect mandatory contribution projections. Found in the Salary section."], ["Life Events", Activity, "Overlay stress-test events: Retrenchment, Career Break, Medical Crisis (draws OA/private), Windfall (one-off inflow), Early Retirement, or Hyperinflation. Coloured bands on the Accumulation chart and a row in the Strategy Gantt. Found in the Life Events panel."]].map(([title, Icon, desc]) => (
                          <div key={title} style={{ background: "var(--bg-base)", padding: "14px", borderRadius: 10, border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <Icon style={{ width: 14, height: 14, color: "#3b82f6" }} />
                              <h5 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-bright)" }}>{title}</h5>
                            </div>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{desc}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", padding: "14px", borderRadius: "10px" }}>
                        <p style={{ fontSize: 10, color: "#fbbf24", lineHeight: 1.6, textAlign: "justify" }}><strong style={{ fontWeight: 800 }}>Legal Disclaimer:</strong> {LEGAL_DISCLAIMER}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* ── SUMMARY TAB ── */}
            {activeTab === "summary" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Summary tab intro — collapsible via native <details> (no hooks) */}
                <details style={{ borderRadius: 14, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                  <summary style={{ padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", listStyle: "none", outline: "none" }}>
                    <p style={{ fontWeight: 700, color: "var(--text-highlight)", margin: 0, fontSize: 12 }}>📋 Summary Tab — What You're Looking At</p>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>▼ Show</span>
                  </summary>
                  <div style={{ padding: "0 18px 14px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
                      {[
                        ["💰 Projected Total CPF", "Your total OA + MA + RA balance at your chosen payout age. This is the nest egg that funds CPF LIFE payouts."],
                        ["📊 Account Balances", "Breakdown of OA, MA, SA, and RA at payout age. SA shows 'Merged into RA' for members aged 55+."],
                        ["💵 CPF LIFE Starting Payouts", "Estimated monthly payout under each LIFE plan (Standard, Escalating, Basic) based on your RA at payout age."],
                        ["📈 Key Statistics Row", "Five KPIs: total contributions made, total outflows, net worth at 65, net worth at 95, and estimated annual RSTU tax savings."],
                        ["📅 Contribution Timeline", "Gantt chart showing when contributions, housing outflows, LIFE payouts, and each plan phase are active across your lifetime."],
                        ["🎯 FRS Tracker", "Projected RA at age 55 vs BRS/FRS/ERS targets. Shows if you're on track and how much more is needed."],
                        ["🥧 Net Worth Breakdown", "Doughnut chart of OA + MA + RA + Property at payout age. Shows how your wealth is distributed across buckets."],
                        ["🔔 Milestone Alerts", "Automatic alerts for key events like BRS/FRS/ERS achievement, SA closure, BHS reached, OA drawdown exhaustion, and payout start."],
                        ["🔧 What-If Explorer", "Drag sliders to test how changing payout age, RSTU top-ups, housing outflow, or salary affects your total CPF. Type any amount in the SA/RA field to override the $40k slider limit."],
                        ["🏠 Estate Planning", "Shows estimated estate value (CPF bequest + OA + MA + property) if death occurs at each age from 65 to 95. Includes a Total Estate summary at your payout age."],
                        ["📋 Strategy Tab", "Holistic decumulation planner — set a Target Monthly Income, use ⚡ Fill Gap to auto-calculate the OA Drawdown needed, and view all income streams (CPF LIFE, OA Drawdown, SRS, Private Assets) in a Gantt and income table. OA Exhaustion Age shown live."],
                      ].map(([title, desc]) => (
                        <div key={title} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-highlight)", marginBottom: 3 }}>{title}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
                {isRealDollars ? (
                  <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", padding: 10, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#93c5fd", borderRadius: 10 }}>Displaying Real Dollars (Adjusted for {inputs.inflationRate}% Inflation)</div>
                ) : (
                  <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-strong)", padding: 10, textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", borderRadius: 10 }}>Displaying Nominal Dollars</div>
                )}
                {/* Property Pledge Active Notice */}
                {inputs.usePropertyPledge && (() => {
                  const age55Row = projection.find(r => r.age === 55);
                  const age55OA = age55Row?.oa ?? 0;
                  const age55RA = age55Row?.ra ?? 0;
                  // Without pledge, RA would be ≈ cohortFRS. With pledge it's ≈ BRS.
                  // The OA difference is the pledge benefit — show it clearly.
                  const ca = Number(inputs.currentAge) || 35;
                  const yearsTo55 = Math.max(0, 55 - ca);
                  const baseYear = Number(inputs.currentYear) || 2026;
                  const pledgeBRS = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (baseYear + yearsTo55) - 2026)));
                  return (
                    <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Target style={{ width: 16, height: 16, color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
                      <p style={{ fontSize: 11, color: "#fbbf24", lineHeight: 1.5, margin: 0 }}>
                        <strong>Property Pledge Active:</strong> At age 55, only BRS (~{formatCurrency(pledgeBRS)}) is retained in RA. RA savings above BRS remain in RA (still earning 4%) until you apply to CPF to withdraw them as cash. Use the <strong>Pledge RA Withdrawal</strong> fields in the Property & Timelines panel to enter the amount and age at which you plan to withdraw pledged funds as cash. These funds leave the RA directly — not via OA. See the Accumulation chart for the OA spike at age 55.
                      </p>
                    </div>
                  );
                })()}
                {/* 20% RA-to-OA Transfer Notice */}
                {raOaTransfer > 0 && (
                  <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <ShieldCheck style={{ width: 16, height: 16, color: "#34d399", flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: "#34d399", lineHeight: 1.5, margin: 0 }}>
                      <strong>CPF Policy — 20% RA-to-OA Transfer at Age {inputs.payoutAge}:</strong> Approx. {formatCurrency(raOaTransfer)} is transferred from RA to OA. Transfer base = RA ({formatCurrency(raAtPayout)}) − govt grants, housing grants, MRSS, MMSS &amp; all voluntary SA/RA top-ups ({formatCurrency(cumulativeCashTopUps)}) − SA/RA interest accumulated ({formatCurrency(cumulativeRaInterest)}) = {formatCurrency(raTransferBase)}, × 20%. CPF LIFE payouts are calculated on <strong>RA after transfer ({formatCurrency(raAfterTransfer)})</strong> — the 20% deducted to OA reduces the RA balance and correspondingly lowers your monthly payout.
                    </p>
                  </div>
                )}
                {/* Hero — two-panel split */}
                {/* ── Hero Panel: Left (deep navy + stats) + Right (account balances) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="hero-split">

                  {/* LEFT: projected total + nominal/real + 3 stat rings */}
                  <div style={{ background: "var(--hero-left-bg)", borderRadius: 16, padding: "22px", color: "var(--hero-text)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <svg style={{ position: "absolute", right: 0, top: 0, opacity: 0.07, pointerEvents: "none" }} width="160" height="160" viewBox="0 0 100 100">
                      <path d="M10 90 L80 20 M55 20 L80 20 L80 45" fill="none" stroke="var(--hero-arrow)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {/* Top block: numbers — always use raw projection, never displayAccumulation */}
                    {(() => {
                      const rawRow = projectionByAge.get(payoutAge65) || {}; // debounced — was live inputs.payoutAge
                      const nominalTotal = (rawRow.oa || 0) + (rawRow.sa || 0) + (rawRow.ma || 0) + (rawRow.ra || 0);
                      const years = Math.max(0, payoutAge65 - Number(inputs.currentAge));
                      const inflRate = (Number(inputs.inflationRate) || 2) / 100;
                      const realTotal = Math.round(nominalTotal / Math.pow(1 + inflRate, years));
                      return (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 16 }}>
                          <p style={{ fontSize: 9, fontWeight: 700, color: "var(--hero-label)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Projected Total CPF Balance at Age {inputs.payoutAge}</p>
                          <div className="hero-nums-row" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
                            <div>
                              <p className="hero-nom" style={{ fontSize: 32, fontWeight: 500, margin: 0, letterSpacing: "-0.5px", lineHeight: 1.1, color: "#ffffff" }}>{formatCurrency(nominalTotal)}</p>
                              <p style={{ fontSize: 10, color: "var(--hero-label)", marginTop: 4 }}>Nominal (future $)</p>
                            </div>
                            <div className="hero-divider-v" style={{ width: 1, height: 48, background: "var(--hero-divider)" }} />
                            <div>
                              <p className="hero-real" style={{ fontSize: 24, fontWeight: 500, margin: 0, letterSpacing: "-0.3px", lineHeight: 1.1, color: "var(--hero-text)", opacity: 0.75 }}>{formatCurrency(realTotal)}</p>
                              <p style={{ fontSize: 10, color: "var(--hero-label)", marginTop: 4 }}>Real (today's $, {inputs.inflationRate || 2}% infl.)</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* How this was calculated — collapsible assumptions panel */}
                    {(() => {
                      const pa = payoutAge65; // CQ-2 fix: use debounced value to match projection data
                      const ca = Number(inputs.currentAge) || 35;
                      const paRow = projectionByAge.get(pa) || {}; // CQ-2 perf: O(1) Map lookup
                      const totalInj = paRow.cumulativeInjected || 0;
                      const totalInt = paRow.cumulativeInterest || 0;
                      const totalOut = paRow.cumulativeOutflow || 0;
                      const startBal = (Number(inputs.oaBalance)||0) + (Number(inputs.saBalance)||0) + (Number(inputs.maBalance)||0);
                      return (
                        <details style={{ marginTop: 10, marginBottom: 6 }}>
                          <summary style={{ fontSize: 9, fontWeight: 700, color: "var(--hero-label)", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", listStyle: "none", outline: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            <span>▸</span> How this was calculated
                          </summary>
                          <div style={{ marginTop: 8, fontSize: 9, color: "var(--hero-label)", lineHeight: 1.8, paddingLeft: 2 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px" }}>
                              <span>Opening balances (age {ca})</span><span style={{ fontFamily: "monospace", textAlign: "right" }}>+{formatCurrency(startBal)}</span>
                              <span>Contributions &amp; inflows</span><span style={{ fontFamily: "monospace", textAlign: "right" }}>+{formatCurrency(totalInj)}</span>
                              <span>Interest earned (2.5–4% p.a.)</span><span style={{ fontFamily: "monospace", textAlign: "right" }}>+{formatCurrency(totalInt)}</span>
                              <span>Outflows (housing, medical, etc.)</span><span style={{ fontFamily: "monospace", textAlign: "right", color: "#f87171" }}>−{formatCurrency(totalOut)}</span>
                              <span style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 3, fontWeight: 700, color: "#34d399" }}>= Total at age {pa}</span>
                              <span style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 3, fontFamily: "monospace", textAlign: "right", fontWeight: 700, color: "#34d399" }}>{formatCurrency(startBal + totalInj + totalInt - totalOut)}</span>
                            </div>
                            <p style={{ marginTop: 6, fontSize: 8, opacity: 0.55, lineHeight: 1.5, margin: "6px 0 0" }}>Annual compounding · BOY convention · 2026 CPF rates · Verify with CPF Board tools</p>
                          </div>
                        </details>
                      );
                    })()}
                    {/* Divider */}
                    <div style={{ height: 1, background: "var(--hero-divider)", marginBottom: 16 }} />
                    {/* Bottom block: 3 stat rings */}
                    {(() => {
                      const pa = payoutAge65; // CQ-2 fix: use debounced value to match projection data
                      const paRowBase = projectionByAge.get(pa) || {}; // CQ-2 perf: O(1) Map lookup
                      const totalInt = paRowBase.cumulativeInterest || 0;
                      const totalInj = paRowBase.cumulativeInjected || 0;
                      const tot = totalInt + totalInj || 1;
                      const intPct = Math.round((totalInt / tot) * 100);
                      const injPct = 100 - intPct;
                      const ratio = totalInj > 0 ? (totalInt / totalInj) : 0;
                      const ratioPct = Math.min(100, Math.round(ratio * 100));
                      const r = 18, circ = 2 * Math.PI * r;
                      const arc = (p) => (p / 100) * circ;
                      return (
                        <div className="hero-stats-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          {[
                            { val: `$${Math.round(totalInt / 1000)}k`, lbl: "Interest earned", pct: intPct, color: "#60a5fa", tc: "#93c5fd", dash: arc(intPct) },
                            { val: `$${Math.round(totalInj / 1000)}k`, lbl: "Total inflows", pct: injPct, color: "#34d399", tc: "#6ee7b7", dash: arc(injPct) },
                            { val: `${ratio.toFixed(2)}×`, lbl: "Interest / contribution", pct: ratioPct, color: "#f59e0b", tc: "#fbbf24", dash: arc(ratioPct) },
                          ].map(({ val, lbl, pct, color, tc, dash }) => (
                            <div key={lbl} style={{ background: "var(--hero-card-bg)", borderRadius: 10, padding: "10px", display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                              <svg width="48" height="48" viewBox="0 0 48 48" style={{ flexShrink: 0, overflow: "visible" }}>
                                <circle cx="24" cy="24" r={r} fill="none" stroke="var(--hero-ring-bg)" strokeWidth="4" />
                                <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
                                  strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 24 24)" />
                                <text x="24" y="28" textAnchor="middle" fill={tc} fontSize="8.5" fontWeight="500">{pct}%</text>
                              </svg>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--hero-text)" }}>{val}</div>
                                <div style={{ fontSize: 9, color: "var(--hero-label)", marginTop: 2, lineHeight: 1.3 }}>{lbl}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* RIGHT: 2×2 account balance cards with rings */}
                  <div style={{ background: "var(--hero-right-bg)", border: "1px solid var(--hero-border)", borderRadius: 16, padding: 20, color: "var(--hero-text)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "var(--hero-label)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Account Balances at Age {inputs.payoutAge}</p>
                    {(() => {
                      const tot2 = (payoutAgeData.oa || 0) + (payoutAgeData.ma || 0) + (payoutAgeData.ra || 0) || 1;
                      const accts = [
                        { label: "Ordinary (OA)", val: payoutAgeData.oa, color: "#60a5fa", tc: "#93c5fd", closed: false },
                        { label: "Special (SA)", val: null, color: "#94a3b8", tc: "#94a3b8", closed: true },
                        { label: "MediSave (MA)", val: payoutAgeData.ma, color: "#34d399", tc: "#6ee7b7", closed: false },
                        { label: "Retirement (RA)", val: payoutAgeData.ra, color: "#a78bfa", tc: "#c4b5fd", closed: false },
                      ];
                      const r2 = 18, circ2 = 2 * Math.PI * r2;
                      return (
                        <div className="hero-acct-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
                          {accts.map(({ label, val, color, tc, closed }) => {
                            const pct = closed ? 0 : Math.round(((val || 0) / tot2) * 100);
                            const dash = (pct / 100) * circ2;
                            return (
                              <div key={label} style={{ background: "var(--hero-acct-bg)", border: "1px solid var(--hero-acct-border)", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10, overflow: "hidden", opacity: closed ? 0.45 : 1 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 9, fontWeight: 600, color: "var(--hero-label)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 3px" }}>{label}</p>
                                  {closed
                                    ? <p style={{ fontSize: 12, color: "var(--hero-label)", fontStyle: "italic", margin: 0 }}>Merged into RA</p>
                                    : <><p style={{ fontSize: 15, fontWeight: 500, color: tc, margin: 0, fontFamily: "monospace" }}>{formatCurrency(val)}</p>
                                      <p style={{ fontSize: 9, color: "var(--hero-label)", marginTop: 3 }}>{pct}% of total</p></>
                                  }
                                </div>
                                <svg width="48" height="48" viewBox="0 0 48 48" style={{ flexShrink: 0, overflow: "visible" }}>
                                  <circle cx="24" cy="24" r={r2} fill="none" stroke="var(--hero-ring-bg)" strokeWidth="4" />
                                  {!closed && <circle cx="24" cy="24" r={r2} fill="none" stroke={color} strokeWidth="4"
                                    strokeDasharray={`${dash} ${circ2}`} strokeLinecap="round" transform="rotate(-90 24 24)" />}
                                  <text x="24" y="28" textAnchor="middle" fill={closed ? "rgba(255,255,255,0.25)" : tc} fontSize="9" fontWeight="500">{closed ? "—" : `${pct}%`}</text>
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {/* LIFE Plans — hidden for foreigners (no CPF LIFE eligibility) */}
                {!isForeigner && (
                <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 20, padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>CPF LIFE Starting Payouts (Monthly)</p>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: inputs.isMale !== false ? "rgba(52,211,153,0.15)" : "rgba(96,165,250,0.15)", color: inputs.isMale !== false ? "#34d399" : "#60a5fa", border: `1px solid ${inputs.isMale !== false ? "rgba(52,211,153,0.3)" : "rgba(96,165,250,0.3)"}` }}>
                      {inputs.isMale !== false ? "Male selected" : "Female selected"}
                    </span>
                  </div>
                  <div className="life-plans-grid rg-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {Object.entries(lifePlans).map(([key, plan]) => (
                      <div key={key} style={{ background: "var(--bg-muted)", padding: 16, borderRadius: 12, border: "1px solid var(--border-strong)", display: "flex", flexDirection: "column", gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-highlight)", textTransform: "capitalize" }}>{key} Plan</span>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 9, color: inputs.isMale !== false ? "#34d399" : "var(--text-muted)", textTransform: "uppercase", fontWeight: 800, marginBottom: 2 }}>{inputs.isMale !== false ? "Male ✓" : "Male"}</div>
                            <div style={{ fontSize: inputs.isMale !== false ? 20 : 15, fontWeight: 900, color: inputs.isMale !== false ? "#34d399" : "var(--text-muted)" }}>{formatCurrency(applyInflation(plan.startM, inputs.payoutAge))}</div>
                          </div>
                          <div style={{ width: 1, height: 24, background: "var(--border-strong)" }}></div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: inputs.isMale === false ? "#60a5fa" : "var(--text-muted)", textTransform: "uppercase", fontWeight: 800, marginBottom: 2 }}>{inputs.isMale === false ? "Female ✓" : "Female"}</div>
                            <div style={{ fontSize: inputs.isMale === false ? 20 : 15, fontWeight: 900, color: inputs.isMale === false ? "#60a5fa" : "var(--text-muted)" }}>{formatCurrency(applyInflation(plan.startF, inputs.payoutAge))}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )} {/* end !isForeigner CPF LIFE Starting Payouts */}
                {/* Goal Tracking Card — hidden for foreigners (CPF LIFE plan basis is irrelevant) */}
                {!isForeigner && (() => {
                  const target = Number(inputs.targetMonthlyIncome) || 0;
                  if (target > 0) {
                    const planPayout = lifePlans[highlightPlan]?.[inputs.isMale !== false ? 'startM' : 'startF'] || 0;
                    const realPlanPayout = applyInflation(planPayout, inputs.payoutAge);
                    const gap = realPlanPayout - target;
                    const isShortfall = gap < 0;
                    return (
                      <div style={{ background: isShortfall ? "rgba(244,63,94,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${isShortfall ? "rgba(244,63,94,0.3)" : "rgba(16,185,129,0.3)"}`, borderRadius: 16, padding: "16px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: isShortfall ? "#f472b6" : "#34d399", margin: "0 0 6px 0" }}>Retirement Income Goal vs {highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)} Plan</p>
                            <p style={{ fontSize: 24, fontWeight: 900, color: isShortfall ? "#f43f5e" : "#10b981", margin: 0, fontFamily: "monospace" }}>
                              {isShortfall ? "-" : "+"}{formatCurrency(Math.abs(gap))} <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "sans-serif" }}>/ mo {isShortfall ? "shortfall" : "surplus"}</span>
                            </p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px 0", textTransform: "uppercase", fontWeight: 700 }}>Target: {formatCurrency(target)}/mo</p>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", fontWeight: 700 }}>Projected: {formatCurrency(realPlanPayout)}/mo</p>
                          </div>
                        </div>
                        {isShortfall && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid rgba(244,63,94,0.15)`, fontSize: 11, color: "#fda4af", lineHeight: 1.5 }}>
                            <strong>Actionable Insight:</strong> To close this gap of {formatCurrency(Math.abs(gap))}/mo, you could increase voluntary RSTU top-ups to your SA/RA, delay your Payout Age to allow RA to grow further (larger RA → higher payouts), or build up your <strong>Private Assets</strong> portfolio to generate supplementary income.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* Stats Row */}
                <div className="rg-5" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                  {/* CQ-2 perf: use pre-built Maps instead of 4× O(n) .find() calls */}
                  {/* M2 fix: append Nom. badge when real-dollar mode is on — these 4 cards always read from
                   projectionByAge/payoutByAge (nominal), while surrounding hero uses displayAccumulation (deflated). */
                  [[`Cumulative Top-ups${isRealDollars ? ' · Nom.' : ''}`, projectionByAge.get(payoutAge65)?.cumulativeInjected || 0, "#34d399"], [`Cumulative Outflow${isRealDollars ? ' · Nom.' : ''}`, projectionByAge.get(payoutAge65)?.cumulativeOutflow || 0, "#f472b6"], [`Net Worth @ ${payoutAge65}${isRealDollars ? ' · Nom.' : ''}`, payoutByAge.get(payoutAge65)?.[`${highlightPlan}NetWorth`] || 0, "#60a5fa"], [`Net Worth @ 95${isRealDollars ? ' · Nom.' : ''}`, payoutByAge.get(95)?.[`${highlightPlan}NetWorth`] || 0, "var(--text-bright)"]].map(([label, val, color]) => (
                    <div key={label} style={{ padding: 16, borderRadius: 16, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)" }}>
                      <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{label}</p>
                      <p style={{ fontSize: 14, fontWeight: 900, color, fontFamily: "monospace" }}>{formatCurrency(val)}</p>
                    </div>
                  ))}
                  <div style={{ padding: 16, borderRadius: 16, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "#d97706", marginBottom: 6 }}>Est. Tax Savings (RSTU)</p>
                    <p style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>{formatCurrency(estimatedTaxSavings)}<span style={{ fontSize: 9, color: "#92400e", marginLeft: 4 }}>/ yr</span></p>
                    {currentSaRa >= currentFRS && <p style={{ fontSize: 9, color: "#d97706", marginTop: 4 }}>SA/RA ≥ FRS — top-ups earn no tax relief (ERS top-ups permitted but unrelieved)</p>}
                    {currentSaRa < currentFRS && eligibleRSTU < (Number(inputs.vcSaTopup) || 0) && <p style={{ fontSize: 9, color: "#d97706", marginTop: 4 }}>Relief capped at FRS headroom ({formatCurrency(Math.max(0, currentFRS - currentSaRa))})</p>}
                  </div>
                </div>
                {/* Stats Row explanation */}
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--text-highlight)" }}>Key Statistics explained: </strong>
                  <strong style={{ color: "#34d399" }}>Cumulative Top-ups</strong> = all contributions + inflows made from your current age to payout age. &nbsp;
                  <strong style={{ color: "#f472b6" }}>Cumulative Outflow</strong> = all housing and medical deductions over the same period. &nbsp;
                  <strong style={{ color: "#60a5fa" }}>Net Worth @ payout age / 95</strong> = OA + MA + RA + Property at that age under the highlighted LIFE plan. &nbsp;
                  <strong style={{ color: "#fbbf24" }}>Est. Tax Savings (RSTU)</strong> = annual tax relief estimate from your RSTU cash top-up, capped at $8,000 and FRS headroom.
                </div>
                {/* ── Contribution Timeline Gantt ── */}
                {(() => {
                  const ca = Number(inputs.currentAge) || 35;
                  const payoutAge = payoutAge65; // CQ-2 fix: cosmetic — keeps Gantt bar positions in sync with debounced data
                  const contribStop = Number(inputs.contributionStopAge) || 65;
                  const housingStop = Number(inputs.housingStopAge) || 55;
                  const lifeStart = payoutAge;
                  const pool90 = 90;
                  const END = 95;
                  const START = ca;
                  const totalSpan = END - START;
                  const pct = (a, b) => `${Math.max(0, Math.min(100, ((a - START) / totalSpan) * 100)).toFixed(1)}%`;
                  const width = (a, b) => `${Math.max(0, Math.min(100, ((Math.min(b, END) - Math.max(a, START)) / totalSpan) * 100)).toFixed(1)}%`;
                  const left = (a) => `${Math.max(0, ((a - START) / totalSpan) * 100).toFixed(1)}%`;
                  const hasRSTU = (Number(inputs.vcSaTopup) || 0) > 0;
                  const hasVC3A = (Number(inputs.vc3aCash) || 0) > 0;
                  const phases = [
                    // Contributions and housing phases — excluded for foreigners (no CPF account)
                    ...(!isForeigner ? [
                      { label: "Contributions Active", from: ca, to: contribStop, color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.5)" },
                      { label: "Housing Outflow (OA)", from: ca, to: housingStop, color: "#f472b6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.5)" },
                      ...(hasRSTU ? [{ label: `RSTU Top-up ($${Math.round((Number(inputs.vcSaTopup) || 0) / 1000)}k/yr)`, from: ca, to: contribStop, color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.4)" }] : []),
                      ...(hasVC3A ? [{ label: `VC3A Lump-sum ($${Math.round((Number(inputs.vc3aCash) || 0) / 1000)}k/yr)`, from: ca, to: contribStop, color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.4)" }] : []),
                      // CPF LIFE plan phases — SC/PR only
                      { label: "CPF LIFE Payouts", from: lifeStart, to: END, color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.5)" },
                      { label: "Standard — Level Payouts", from: lifeStart, to: END, color: "#6366f1", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.4)" },
                      { label: "Escalating — Growing Payouts", from: lifeStart, to: END, color: "#22d3ee", bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.4)" },
                      { label: "Basic — RA Self-Funds (to 90)", from: lifeStart, to: Math.min(pool90, END), color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.5)" },
                      { label: "Basic — Pool Phase (90+)", from: pool90, to: END, color: "#fb923c", bg: "rgba(251,146,60,0.15)", border: "rgba(251,146,60,0.5)" },
                    ] : [
                      // Foreigner: show only SRS drawdown period if configured
                      { label: "SRS Drawdown Window", from: Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63), to: Math.min(Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63) + (Number(inputs.srsDrawdownYears) || 10), END), color: "#0ea5e9", bg: "rgba(14,165,233,0.1)", border: "rgba(14,165,233,0.4)" },
                    ]),
                  ];
                  const markers = (!isForeigner
                    ? [ca, contribStop, housingStop, lifeStart, pool90, END]
                    : [ca, END]
                  ).filter((v, i, a) => v >= ca && v <= END && a.indexOf(v) === i).sort((a, b) => a - b);
                  return (
                    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", borderRadius: 20, padding: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <Activity style={{ width: 15, height: 15, color: "#60a5fa" }} />
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-bright)", margin: 0 }}>Contribution Timeline Overview</h4>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>Age {ca} → 95</span>
                      </div>
                      {/* Age ruler */}
                      <div style={{ position: "relative", height: 20, marginBottom: 4 }}>
                        {markers.map(age => (
                          <div key={age} style={{ position: "absolute", left: left(age), transform: "translateX(-50%)", fontSize: 9, color: "var(--text-muted)", fontWeight: 700, fontFamily: "monospace" }}>
                            {age}
                          </div>
                        ))}
                      </div>
                      {/* Tick lines */}
                      <div style={{ position: "relative", height: 4, marginBottom: 8, background: "var(--border-subtle)", borderRadius: 2 }}>
                        {markers.map(age => (
                          <div key={age} style={{ position: "absolute", left: left(age), width: 2, height: "100%", background: "var(--text-muted)", transform: "translateX(-50%)" }} />
                        ))}
                      </div>
                      {/* Phase bars */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {phases.filter(p => p.from < END && p.to > ca).map((phase, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0, fontSize: 10, fontWeight: 700, color: phase.color, textAlign: "right", paddingRight: 4 }}>{phase.label}</div>
                            <div style={{ flex: 1, position: "relative", height: 20, background: "var(--bg-muted)", borderRadius: 4 }}>
                              <div style={{
                                position: "absolute",
                                left: left(Math.max(phase.from, ca)),
                                width: width(phase.from, phase.to),
                                height: "100%",
                                background: phase.bg,
                                border: `1px solid ${phase.border}`,
                                borderRadius: 4,
                                display: "flex", alignItems: "center", justifyContent: "center"
                              }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: phase.color, whiteSpace: "nowrap" }}>
                                  {Math.max(phase.from, ca)}–{Math.min(phase.to, END)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
                        <Info style={{ width: 11, height: 11, display: "inline", marginRight: 6, color: "#60a5fa" }} />
                        Adjust <strong style={{ color: "var(--text-main)" }}>Contrib Stop Age</strong>, <strong style={{ color: "var(--text-main)" }}>Housing Stop Age</strong> and <strong style={{ color: "var(--text-main)" }}>Payout Age</strong> in the sidebar to update this timeline.
                      </div>
                    </div>
                  );
                })()}
                {/* FRS Tracker — hidden for foreigners (no CPF account, no RA) */}
                {!isForeigner && (() => {
                  const currentAge = Number(inputs.currentAge) || 35;
                  const isAlreadyPast55 = currentAge >= 55;
                  // If already past 55, use the RA from the first projection row (current state)
                  const frsRow55 = isAlreadyPast55
                    ? projection[0]  // current balances
                    : projection.find(r => r.age === 55);
                  const raAt55Proj = frsRow55 ? (isAlreadyPast55 ? (frsRow55.ra || 0) : (frsRow55.ra || 0)) : 0;
                  const yt55 = Math.max(0, (Number(inputs.currentYear || 2026) + Math.max(0, 55 - currentAge)) - 2026);
                  const projBRS55 = Math.round(RETIREMENT_SUMS_2026.BRS * Math.pow(1.03, yt55));
                  const projFRS55 = Math.round(RETIREMENT_SUMS_2026.FRS * Math.pow(1.03, yt55));
                  const projERS55 = projFRS55 * 2;
                  const frsProgress = Math.min(100, (raAt55Proj / projERS55) * 100);
                  const frsShortfall = projFRS55 - raAt55Proj; // negative = surplus
                  let statusLabel = "Below BRS", statusColor = "#f87171", borderColor = "rgba(239,68,68,0.3)", bgColor = "rgba(239,68,68,0.08)";
                  if (raAt55Proj >= projERS55) { statusLabel = "ERS Achieved ✓"; statusColor = "#38bdf8"; borderColor = "rgba(56,189,248,0.3)"; bgColor = "rgba(56,189,248,0.08)"; }
                  else if (raAt55Proj >= projFRS55) { statusLabel = "FRS Achieved ✓"; statusColor = "#34d399"; borderColor = "rgba(52,211,153,0.3)"; bgColor = "rgba(52,211,153,0.08)"; }
                  else if (raAt55Proj >= projBRS55) { statusLabel = "BRS Met — FRS Gap"; statusColor = "#fbbf24"; borderColor = "rgba(251,191,36,0.3)"; bgColor = "rgba(251,191,36,0.08)"; }
                  const trackerTitle = isAlreadyPast55 ? `Current RA vs FRS Target (Age ${currentAge})` : "FRS Tracker — Projected RA at 55";
                  return (
                    <div style={{ padding: 20, borderRadius: 20, border: `1px solid ${borderColor}`, background: bgColor }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Target style={{ width: 16, height: 16, color: "#34d399" }} /><span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{trackerTitle}</span></div>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, border: `1px solid ${borderColor}`, color: statusColor, background: bgColor }}>{statusLabel}</span>
                      </div>
                      <div className="rg-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                        {[
                          [isAlreadyPast55 ? `RA at ${currentAge}` : "Projected RA @ 55", raAt55Proj, statusColor],
                          ["FRS Target @ 55", projFRS55, "var(--text-highlight)"],
                          [frsShortfall > 0 ? "FRS Shortfall" : "FRS Surplus", Math.abs(frsShortfall), frsShortfall > 0 ? "#f87171" : "#34d399"]
                        ].map(([l, v, c]) => (
                          <div key={l} style={{ textAlign: "center" }}><p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 4 }}>{l}</p><p style={{ fontSize: 18, fontWeight: 900, color: c, fontFamily: "monospace" }}>{frsShortfall <= 0 && l.includes("Surplus") ? "+" : ""}{formatCurrency(v)}</p></div>
                        ))}
                      </div>
                      <div style={{ height: 10, background: "var(--bg-input)", borderRadius: 999, overflow: "hidden", position: "relative", marginBottom: 6 }}>
                        {[25, 50].map(p => <div key={p} style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "var(--bg-base)", zIndex: 1 }} />)}
                        <div style={{ height: 10, borderRadius: 999, background: `linear-gradient(90deg,${statusColor},${statusColor}99)`, width: `${frsProgress}%`, transition: "width 0.8s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>
                        <span>$0</span><span style={{ position: "relative", left: "25%" }}>BRS</span><span style={{ position: "relative", left: "25%" }}>FRS</span><span>ERS</span>
                      </div>
                      {frsShortfall > 0 && raAt55Proj < projFRS55 && raAt55Proj >= projBRS55 && (
                        <p style={{ marginTop: 8, fontSize: 10, color: "#fbbf24" }}>BRS met. Top up {formatCurrency(frsShortfall)} more to reach FRS and unlock higher LIFE payouts.</p>
                      )}
                      {frsShortfall > 0 && raAt55Proj < projBRS55 && (
                        <p style={{ marginTop: 8, fontSize: 10, color: "#f87171" }}>Top up {formatCurrency(projBRS55 - raAt55Proj)} to reach BRS, then {formatCurrency(frsShortfall)} to reach FRS.</p>
                      )}
                      {frsShortfall <= 0 && raAt55Proj < projERS55 && (
                        <p style={{ marginTop: 8, fontSize: 10, color: "#34d399" }}>FRS achieved ✓ Top up {formatCurrency(projERS55 - raAt55Proj)} more to reach ERS for maximum payouts.</p>
                      )}
                      {raAt55Proj >= projERS55 && (
                        <p style={{ marginTop: 8, fontSize: 10, color: "var(--clr-sky)" }}>ERS achieved ✓ Maximum CPF LIFE payout unlocked.</p>
                      )}
                    </div>
                  );
                })()}
                {/* Doughnut */}
                {(() => {
                  const oaVal = payoutAgeData.oa || 0;
                  const maVal = payoutAgeData.ma || 0;
                  const raVal = payoutAgeData.ra || 0;
                  const propVal = inputs.includeProperty ? (payoutAgeData.propertyValue || Number(inputs.propertyValue) || 0) : 0;
                  const privAsset = payoutAgeData.privateAssets || 0;
                  const srsVal = payoutAgeData.srsBalance || 0;
                  const slices = [{ name: "OA", value: Math.max(0, oaVal || 0), color: "#1d4ed8" }, { name: "MA", value: Math.max(0, maVal || 0), color: "#059669" }, { name: "RA", value: Math.max(0, raVal || 0), color: "#7c3aed" }, { name: "Property", value: Math.max(0, propVal || 0), color: "#f43f5e" }, { name: "Private Assets", value: Math.max(0, privAsset || 0), color: "#c084fc" }, { name: "SRS", value: Math.max(0, srsVal || 0), color: "#0ea5e9" }].filter(s => s.value > 0);
                  const total = slices.reduce((s, d) => s + d.value, 0);
                  if (total === 0) return null;
                  const RADIAN = Math.PI / 180;
                  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    if (percent < 0.05) return null;
                    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + r * Math.cos(-midAngle * RADIAN); const y = cy + r * Math.sin(-midAngle * RADIAN);
                    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">{`${(percent * 100).toFixed(0)}%`}</text>;
                  };
                  return (
                    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                        <PieChart style={{ width: 18, height: 18, color: "#60a5fa" }} /><h3 style={{ fontSize: 16, fontWeight: 800 }}>Net Worth Breakdown at Age {inputs.payoutAge}</h3>
                      </div>
                      <div className="pie-chart-wrap" style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                        <div style={{ width: 240, height: 240, flexShrink: 0, minWidth: 0 }}>
                          <ResponsiveContainer width="99%" height="100%">
                            <RechartsPieChart>
                              <RechartsPie isAnimationActive={false} data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={105} paddingAngle={3} dataKey="value" labelLine={false} label={renderLabel}>
                                {slices.map((entry, i) => <RechartsCell key={i} fill={entry.color} stroke="transparent" />)}
                              </RechartsPie>
                              <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: "var(--tooltip-bg)", backdropFilter: "blur(4px)", border: "1px solid var(--tooltip-border)", borderRadius: 8, fontSize: 11, padding: "6px 10px" }} itemStyle={{ padding: 0, color: "var(--tooltip-text)" }} wrapperStyle={{ pointerEvents: "none" }} />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="pie-legend" style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {slices.map(s => (
                            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, background: "var(--bg-muted)", border: "1px solid var(--border-strong)", minWidth: 0 }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</p><p style={{ fontSize: 13, fontWeight: 900, color: "var(--text-main)" }}>{formatCurrency(s.value)}</p></div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>{((s.value / total) * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                          <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, background: "var(--bg-panel-muted)", border: "1px solid var(--border-strong)" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
                            <div style={{ flex: 1 }}><p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)" }}>Total Net Worth</p><p style={{ fontSize: 18, fontWeight: 900, color: "var(--text-bright)" }}>{formatCurrency(total)}</p></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* Estate Planning Panel */}
                {(() => {
                  const ages = [65, 70, 75, 80, 85, 90, 95];
                  const plan = highlightPlan;
                  return (
                    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <Gift style={{ width: 18, height: 18, color: "#a78bfa" }} />
                        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Estate at Death — Bequest Projection</h3>
                        <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 999, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa", textTransform: "uppercase", fontWeight: 700 }}>{plan}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                        Estimated estate value if death occurs at each age. Includes CPF bequest (RA premium refund minus payouts drawn), remaining OA, MA balance, and property value. Under the <strong style={{ color: "var(--text-bright)" }}>{plan}</strong> plan.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
                        {ages.map(age => {
                          const pRow = payoutByAge.get(age);           // O(1) — was displayProjection.find
                          const aRow = accumulationByAge.get(age);     // O(1) — was displayAccumulation.find
                          if (!pRow || !aRow) return null;
                          const bequest = pRow[`${plan}Bequest`] || 0;
                          const oa = aRow.oa || 0;
                          const ma = aRow.ma || 0;
                          const prop = inputs.includeProperty ? (aRow.propertyValue || 0) : 0;
                          const total = bequest + oa + ma + prop;
                          const isPayout = age >= payoutAge65;         // debounced
                          return (
                            <div key={age} style={{ background: "var(--bg-muted)", borderRadius: 12, padding: 12, border: `1px solid ${age === payoutAge65 ? "rgba(167,139,250,0.4)" : "var(--border-subtle)"}`, opacity: isPayout ? 1 : 0.5 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Age {age}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>{formatCurrency(total)}</div>
                              <div style={{ fontSize: 8, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                                <div>CPF: {formatCurrency(bequest + oa + ma)}</div>
                                {prop > 0 && <div>Property: {formatCurrency(prop)}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ gridColumn: "1/-1", background: "var(--bg-panel-muted)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border-strong)", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-highlight)", textTransform: "uppercase" }}>Estimated Total Estate at Age {inputs.payoutAge}</span>
                        {(() => {
                          const pr = payoutByAge.get(payoutAge65);               // debounced
                          const ar = accumulationByAge.get(payoutAge65);          // debounced
                          if (!pr || !ar) return null;
                          const tot = (pr[`${highlightPlan}Bequest`] || 0) + (ar.oa || 0) + (ar.ma || 0) + (inputs.includeProperty ? (ar.propertyValue || 0) : 0);
                          return <span style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>{formatCurrency(tot)}</span>;
                        })()}
                      </div>
                      <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 8, gridColumn: "1/-1" }}>
                        * Before payout age: CPF bequest = total OA+MA+RA (death benefit). After payout age: CPF LIFE bequest = premium paid minus cumulative payouts received. OA and MA balances pass to nominated beneficiaries in full.
                      </p>
                    </div>
                  );
                })()}

                {/* Milestones */}
                {milestones.length > 0 && (
                  <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Bell style={{ width: 18, height: 18, color: "#fbbf24" }} /><h3 style={{ fontSize: 16, fontWeight: 800 }}>Milestone Alerts</h3></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, background: "var(--bg-input)", color: "var(--text-muted)", padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-strong)" }}>{milestones.length} milestone{milestones.length !== 1 ? "s" : ""} detected</span>
                        <button onClick={printMilestoneReport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d", cursor: "pointer" }}>
                          <Printer style={{ width: 11, height: 11 }} />Print Report
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {milestones.map((m, idx) => {
                        const colors = { success: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", badge: "rgba(16,185,129,0.15)", badgeText: "#34d399", dot: "#34d399" }, gold: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", badge: "rgba(245,158,11,0.15)", badgeText: "#fbbf24", dot: "#fbbf24" }, teal: { bg: "rgba(20,184,166,0.08)", border: "rgba(20,184,166,0.25)", badge: "rgba(20,184,166,0.15)", badgeText: "#2dd4bf", dot: "#2dd4bf" }, warning: { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", badge: "rgba(249,115,22,0.15)", badgeText: "#fb923c", dot: "#fb923c" }, danger: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", badge: "rgba(239,68,68,0.15)", badgeText: "#f87171", dot: "#f87171" } }[m.type] || { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", badge: "rgba(59,130,246,0.15)", badgeText: "#60a5fa", dot: "#60a5fa" };
                        return (<div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bg }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot, flexShrink: 0, marginTop: 4 }} />
                          <div><div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: colors.badge, color: colors.badgeText }}>Age {m.age}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: colors.badgeText }}>{m.label}</span>
                          </div><p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{m.detail}</p></div>
                        </div>);
                      })}
                    </div>
                    <p style={{ marginTop: 16, fontSize: 10, color: "var(--text-muted)" }}>Milestones update automatically as you adjust inputs.</p>
                  </div>
                )}
                {/* What-If */}
                <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><SlidersHorizontal style={{ width: 18, height: 18, color: "#34d399" }} /><h3 style={{ fontSize: 16, fontWeight: 800 }}>What-If Explorer</h3><span style={{ fontSize: 9, background: "var(--bg-input)", color: "var(--text-muted)", padding: "3px 8px", borderRadius: 999, border: "1px solid var(--border-strong)" }}>Live Simulation</span></div>
                    <button onClick={(e) => {
                      const target = e.currentTarget;
                      const willShow = !showWhatIf;
                      setShowWhatIf(willShow);
                      if (willShow) {
                        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                      }
                    }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${showWhatIf ? "rgba(16,185,129,0.5)" : "var(--border-strong)"}`, background: showWhatIf ? "rgba(16,185,129,0.15)" : "var(--bg-input)", color: showWhatIf ? "#34d399" : "var(--text-muted)", cursor: "pointer" }}>
                      <SlidersHorizontal style={{ width: 13, height: 13 }} />{showWhatIf ? "Close Explorer" : "Open What-If Explorer"}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>Drag sliders to explore how changes affect your total CPF balance — without modifying saved inputs.</p>
                  {showWhatIf && (() => {
                    const effPA  = whatIfPayoutAge   !== null ? whatIfPayoutAge   : Number(inputs.payoutAge);
                    const effST  = whatIfSaTopup     !== null ? whatIfSaTopup     : (Number(inputs.vcSaTopup) || 0);
                    const effH   = whatIfHousing     !== null ? whatIfHousing     : (Number(inputs.housingOutflow) || 0);
                    const effSB  = whatIfSalaryBump  !== null ? whatIfSalaryBump  : 0;
                    const effCS  = whatIfContribStop !== null ? whatIfContribStop : (Number(inputs.contributionStopAge) || 65);
                    const effOAD = whatIfOaDrawdown  !== null ? whatIfOaDrawdown  : (Number(inputs.oaDrawdownMonthly) || 0);
                    const effSRS = whatIfSrsContrib  !== null ? whatIfSrsContrib  : (Number(inputs.srsAnnualContribution) || 0);
                    const effPG  = whatIfPrivGrowth  !== null ? whatIfPrivGrowth  : (Number(inputs.privateAssetGrowthRate) || 0);
                    const baseTotal = projectionByAge.get(payoutAge65)?.total || 0; // debounced
                    const whatIfTotal = whatIfProjection?.rows[whatIfProjection.rows.length - 1]?.total || 0;
                    const delta = whatIfTotal - baseTotal;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
                          <button onClick={() => { setWhatIfPayoutAge(null); setWhatIfSaTopup(null); setWhatIfHousing(null); setWhatIfSalaryBump(null); setWhatIfContribStop(null); setWhatIfOaDrawdown(null); setWhatIfSrsContrib(null); setWhatIfPrivGrowth(null); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "var(--bg-input)", color: "var(--text-muted)", border: "1px solid var(--border-strong)", cursor: "pointer" }}>
                            ↺ Reset sliders
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          {/* SA/RA Top-up — special: slider 0–40k + free-text override */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>
                                {is55Plus ? "Annual RA Top-up" : "Annual SA Top-up"}
                                <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 400, marginLeft: 4 }}>{Number(inputs.currentAge) < 55 ? "(SA → FRS)" : "(RA → ERS)"}</span>
                              </label>
                              <input
                                type="text" inputMode="decimal" min={0} step={500}
                                value={effST}
                                onChange={e => setWhatIfSaTopup(Math.max(0, Number(e.target.value) || 0))}
                                style={{ width: 90, padding: "3px 8px", borderRadius: 6, fontSize: 13, fontWeight: 900, fontFamily: "monospace", color: "#34d399", background: "var(--bg-input)", border: "1px solid var(--border-strong)", outline: "none", textAlign: "right" }}
                              />
                            </div>
                            <input type="range" min={0} max={40000} step={500} value={Math.min(effST, 40000)}
                              onChange={e => setWhatIfSaTopup(Number(e.target.value))}
                              onMouseUp={e => setWhatIfSaTopup(Number(e.target.value))}
                              onTouchEnd={e => setWhatIfSaTopup(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#34d399", cursor: "pointer" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}>
                              <span>$0</span>
                              <span style={{ color: "var(--text-subtle)", fontSize: 8 }}>type above for any amount</span>
                              <span>$40k</span>
                            </div>
                            {(() => {
                              const ca3 = Number(inputs.currentAge) || 35;
                              const headroom = ca3 < 55 ? Math.max(0, currentFRS - (currentSaRa || 0)) : Math.max(0, currentERS - (currentSaRa || 0));
                              const target = ca3 < 55 ? "FRS" : "ERS";
                              return headroom > 0 ? (
                                <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 3 }}>
                                  {target} headroom remaining: <strong style={{ color: "#34d399" }}>{formatCurrency(headroom)}</strong>
                                </p>
                              ) : (<p style={{ fontSize: 9, color: "#34d399", marginTop: 3 }}>{target} already met ✓</p>);
                            })()}
                          </div>
                          {/* Other original 3 sliders */}
                          {[[`Payout Age`, effPA, 65, 70, 1, setWhatIfPayoutAge, "#34d399", `${effPA}`], [`Annual Housing Outflow`, effH, 0, Math.max(60000, (Number(inputs.housingOutflow) || 0) * 2), 500, setWhatIfHousing, "#fb923c", formatCurrency(effH)], [`Salary Increase (%)`, effSB, 0, 50, 5, setWhatIfSalaryBump, "#60a5fa", `${effSB}%`]].map(([label, val, min, max, step, setter, color, display]) => (
                            <div key={label}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>{label}</label>
                                <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color }}>{display}</span>
                              </div>
                              <input type="range" min={min} max={max} step={step} value={val}
                                onChange={e => setter(Number(e.target.value))}
                                onMouseUp={e => setter(Number(e.target.value))}
                                onTouchEnd={e => setter(Number(e.target.value))}
                                style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}><span>{min}</span><span>{max}</span></div>
                            </div>
                          ))}

                          {/* Rev #12 — Contribution Stop Age */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>
                                Contribution Stop Age
                                <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 400, marginLeft: 4 }}>(mandatory + voluntary)</span>
                              </label>
                              <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#fbbf24" }}>Age {effCS}</span>
                            </div>
                            <input type="range" min={Number(inputs.currentAge) || 35} max={75} step={1} value={effCS}
                              onChange={e => setWhatIfContribStop(Number(e.target.value))}
                              onMouseUp={e => setWhatIfContribStop(Number(e.target.value))}
                              onTouchEnd={e => setWhatIfContribStop(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#fbbf24", cursor: "pointer" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}>
                              <span>Age {Number(inputs.currentAge) || 35}</span><span>Age 75</span>
                            </div>
                            <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 3 }}>
                              Sidebar value: <strong>Age {Number(inputs.contributionStopAge) || 65}</strong>
                            </p>
                          </div>

                          {/* Rev #12 — OA Monthly Drawdown (shown only when drawdown is configured) */}
                          {(Number(inputs.oaDrawdownStartAge) || 0) > 0 ? (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>
                                  OA Monthly Drawdown
                                  <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 400, marginLeft: 4 }}>(from age {Number(inputs.oaDrawdownStartAge)})</span>
                                </label>
                                <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#f87171" }}>${effOAD}/mo</span>
                              </div>
                              <input type="range" min={0} max={Math.max(5000, (Number(inputs.oaDrawdownMonthly) || 0) * 2)} step={100} value={effOAD}
                                onChange={e => setWhatIfOaDrawdown(Number(e.target.value))}
                                onMouseUp={e => setWhatIfOaDrawdown(Number(e.target.value))}
                                onTouchEnd={e => setWhatIfOaDrawdown(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#f87171", cursor: "pointer" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}>
                                <span>$0</span><span>${Math.max(5000, (Number(inputs.oaDrawdownMonthly) || 0) * 2).toLocaleString()}/mo</span>
                              </div>
                              <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 3 }}>
                                Sidebar value: <strong>${Number(inputs.oaDrawdownMonthly) || 0}/mo</strong>
                              </p>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 10px", borderRadius: 10, border: "1px dashed var(--border-subtle)", background: "var(--bg-base)" }}>
                              <p style={{ fontSize: 9, color: "var(--text-subtle)", textAlign: "center", lineHeight: 1.5 }}>
                                <strong style={{ color: "var(--text-muted)" }}>OA Monthly Drawdown</strong><br />
                                Set an OA Drawdown Start Age in the sidebar to enable this slider.
                              </p>
                            </div>
                          )}

                          {/* Rev #12 — SRS Annual Contribution */}
                          {!isForeigner && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>
                                  SRS Annual Contribution
                                  <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 400, marginLeft: 4 }}>(cap ${((inputs.citizenStatus || "SC") === "foreigner" ? 35700 : 15300).toLocaleString()})</span>
                                </label>
                                <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#a78bfa" }}>{formatCurrency(effSRS)}/yr</span>
                              </div>
                              <input type="range" min={0} max={(inputs.citizenStatus || "SC") === "foreigner" ? 35700 : 15300} step={500} value={effSRS}
                                onChange={e => setWhatIfSrsContrib(Number(e.target.value))}
                                onMouseUp={e => setWhatIfSrsContrib(Number(e.target.value))}
                                onTouchEnd={e => setWhatIfSrsContrib(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#a78bfa", cursor: "pointer" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}>
                                <span>$0</span><span>Max</span>
                              </div>
                              <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 3 }}>
                                Sidebar value: <strong>{formatCurrency(Number(inputs.srsAnnualContribution) || 0)}/yr</strong>
                              </p>
                            </div>
                          )}

                          {/* Rev #12 — Private Asset Growth Rate */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-highlight)" }}>
                                Private Asset Growth Rate
                                <span style={{ fontSize: 9, color: "var(--text-subtle)", fontWeight: 400, marginLeft: 4 }}>(annual %)</span>
                              </label>
                              <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#60a5fa" }}>{effPG}%</span>
                            </div>
                            <input type="range" min={0} max={12} step={0.5} value={effPG}
                              onChange={e => setWhatIfPrivGrowth(Number(e.target.value))}
                              onMouseUp={e => setWhatIfPrivGrowth(Number(e.target.value))}
                              onTouchEnd={e => setWhatIfPrivGrowth(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#60a5fa", cursor: "pointer" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--border-strong)", marginTop: 2 }}>
                              <span>0%</span><span>12%</span>
                            </div>
                            <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 3 }}>
                              Sidebar value: <strong>{Number(inputs.privateAssetGrowthRate) || 0}%</strong>
                            </p>
                          </div>

                        </div>
                        {whatIfProjection && (
                          <div className="rg-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                            {[["Base Total", baseTotal, "var(--text-muted)"], ["What-If Total", whatIfTotal, "#34d399"], ["Difference", delta, delta >= 0 ? "#34d399" : "#f87171"], ["Change %", null, delta >= 0 ? "#34d399" : "#f87171"]].map(([label, val, color], i) => (
                              <div key={label} style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12 }}>
                                <p style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>{label}</p>
                                <p style={{ fontSize: 13, fontWeight: 900, fontFamily: "monospace", color }}>{i === 3 ? baseTotal > 0 ? `${delta >= 0 ? "+" : ""}${((delta / baseTotal) * 100).toFixed(1)}%` : "N/A" : `${delta >= 0 && i === 2 ? "+" : ""}${formatCurrency(Math.abs(val))}`}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {whatIfProjection && (
                          <div style={{ height: 280 }}>
                            <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>Blue = base · Green = what-if · <span style={{ color: "var(--text-subtle)" }}>Hover for account breakdown</span></p>
                            <ResponsiveContainer width="99%" height="100%">
                              <LineChart data={(() => {
                                const baseData = displayAccumulation.filter(d => d.age <= Math.max(payoutAge65, effPA)); // BUG-51 fix: use debounced payoutAge65
                                return baseData.map(d => {
                                  const whatIfRow = whatIfProjection.rows.find(w => w.age === d.age);
                                  return {
                                    age: d.age,
                                    baseTotal: d.total, baseOA: d.oa, baseSA: d.sa, baseMA: d.ma, baseRA: d.ra,
                                    whatIfTotal: whatIfRow ? (whatIfRow.oa + whatIfRow.sa + whatIfRow.ma + whatIfRow.ra) : null,
                                    whatIfOA: whatIfRow?.oa ?? null, whatIfSA: whatIfRow?.sa ?? null,
                                    whatIfMA: whatIfRow?.ma ?? null, whatIfRA: whatIfRow?.ra ?? null,
                                  };
                                });
                              })()}
                                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} stroke="var(--chart-text)" fontSize={10} tickCount={8} />
                                <YAxis tickFormatter={v => `$${v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} stroke="var(--chart-text)" fontSize={10} width={52} />
                                <Tooltip
                                  cursor={{ stroke: "var(--chart-cursor)", strokeWidth: 1, strokeDasharray: "4 3" }}
                                  wrapperStyle={{ pointerEvents: "none", zIndex: 100 }}
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const base = payload.find(p => p.dataKey === "baseTotal");
                                    const wi = payload.find(p => p.dataKey === "whatIfTotal");
                                    const d = payload[0]?.payload || {};
                                    const diff = (wi?.value ?? 0) - (base?.value ?? 0);
                                    return (
                                      <div style={{ background: "var(--tooltip-bg)", backdropFilter: "blur(8px)", border: "1px solid var(--tooltip-border)", borderRadius: 10, padding: "10px 14px", fontSize: 10, minWidth: 210 }}>
                                        <p style={{ color: "#94a3b8", fontWeight: 800, marginBottom: 8, fontSize: 11 }}>Age {label}</p>
                                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "3px 10px", alignItems: "center" }}>
                                          <span style={{ color: "#64748b", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}></span>
                                          <span style={{ color: "#3b82f6", fontSize: 9, fontWeight: 800, textAlign: "right" }}>BASE</span>
                                          <span style={{ color: "#10b981", fontSize: 9, fontWeight: 800, textAlign: "right" }}>WHAT-IF</span>
                                          {[["OA", d.baseOA, d.whatIfOA, "#60a5fa"], ["SA/RA", (d.baseSA||0)+(d.baseRA||0), (d.whatIfSA||0)+(d.whatIfRA||0), "#34d399"], ["MA", d.baseMA, d.whatIfMA, "#a78bfa"]].map(([lbl, bv, wv, c]) => (
                                            <>
                                              <span style={{ color: c, fontWeight: 700 }}>{lbl}</span>
                                              <span style={{ color: "#e2e8f0", fontFamily: "monospace", textAlign: "right" }}>{formatCurrency(bv ?? 0)}</span>
                                              <span style={{ color: wv != null ? "#e2e8f0" : "#64748b", fontFamily: "monospace", textAlign: "right" }}>{wv != null ? formatCurrency(wv) : "—"}</span>
                                            </>
                                          ))}
                                          <span style={{ color: "var(--mc-total-color)", fontWeight: 800, borderTop: "1px solid var(--mc-total-border)", paddingTop: 4 }}>Total</span>
                                          <span style={{ color: "#3b82f6", fontFamily: "monospace", fontWeight: 800, textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}>{formatCurrency(base?.value ?? 0)}</span>
                                          <span style={{ color: wi?.value != null ? "#10b981" : "#64748b", fontFamily: "monospace", fontWeight: 800, textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}>{wi?.value != null ? formatCurrency(wi.value) : "—"}</span>
                                        </div>
                                        {wi?.value != null && base?.value != null && (
                                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>Difference</span>
                                            <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 11, color: diff >= 0 ? "#10b981" : "#f87171" }}>{diff >= 0 ? "+" : ""}{formatCurrency(diff)}</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }}
                                />
                                <Legend verticalAlign="top" height={20} iconSize={6} wrapperStyle={{ fontSize: 9, fontWeight: 600, color: "var(--text-main)" }} />
                                <Line isAnimationActive={false} type="monotone" dataKey="baseTotal" stroke="#3b82f6" strokeWidth={2} dot={false} name="Base" activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 1.5 }} />
                                <Line isAnimationActive={false} type="monotone" dataKey="whatIfTotal" stroke="#10b981" strokeWidth={2.5} dot={false} name={`What-If (PA:${effPA})`} activeDot={{ r: 4, fill: "#10b981", stroke: "#fff", strokeWidth: 1.5 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            {/* ── ACCUMULATION TAB ── */}
            {activeTab === "accumulation" && (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                {/* Foreigner context — CPF lines are all $0 but SRS + Private Assets still plot */}
                {isForeigner && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.3)", marginBottom: 16, fontSize: 10, color: "#fbbf24", lineHeight: 1.6 }}>
                    <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong>Foreigner mode:</strong> CPF accounts (OA / SA / MA / RA) are not applicable — those lines will show $0.
                      The chart reflects <strong>SRS</strong> and <strong>Private Assets</strong> accumulation only.
                      Switch citizenship to <strong>SC</strong> or <strong>PR</strong> in the Profile panel to model CPF balances.
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Accumulation Phase (To Age {inputs.payoutAge})</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowBaseline(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${showBaseline ? "rgba(148,163,184,0.5)" : "var(--border-strong)"}`, background: showBaseline ? "rgba(148,163,184,0.12)" : "var(--bg-input)", color: showBaseline ? "#94a3b8" : "var(--text-muted)", cursor: "pointer" }}>
                      <MinusCircle style={{ width: 13, height: 13 }} />{showBaseline ? "Hide" : "Show"} Baseline
                    </button>
                    <button onClick={() => setShowMonteCarlo(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${showMonteCarlo ? "rgba(139,92,246,0.5)" : "var(--border-strong)"}`, background: showMonteCarlo ? "rgba(139,92,246,0.15)" : "var(--bg-input)", color: showMonteCarlo ? "#a78bfa" : "var(--text-muted)", cursor: "pointer" }}>
                      <Activity style={{ width: 13, height: 13 }} />{showMonteCarlo ? "Hide" : "Show"} Monte Carlo (200 runs)
                    </button>
                    {/* Rev #D2: Events toggle — only shown when life events exist */}
                    {(inputs.lifeEvents || []).filter(e => e.enabled !== false).length > 0 && (
                      <button onClick={() => setShowLifeEventMarkers(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${showLifeEventMarkers ? "rgba(239,68,68,0.5)" : "var(--border-strong)"}`, background: showLifeEventMarkers ? "rgba(239,68,68,0.12)" : "var(--bg-input)", color: showLifeEventMarkers ? "#ef4444" : "var(--text-muted)", cursor: "pointer" }}>
                        <Bell style={{ width: 13, height: 13 }} />{showLifeEventMarkers ? "Hide" : "Show"} Events
                      </button>
                    )}
                  </div>
                </div>
                  {/* Rev #MC: variance preset buttons — only shown when MC is active */}
                  {showMonteCarlo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -12, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Rate variance:</span>
                      {[["Mild ±0.5%", 0.5, "#60a5fa"], ["Base ±1%", 1, "#a78bfa"], ["Stress ±2%", 2, "#f87171"]].map(([lbl, val, clr]) => {
                        const active = (Number(inputs.mcVariancePct) || 1) === val;
                        return (
                          <button key={lbl} onClick={() => setInputs(p => ({ ...p, mcVariancePct: val }))}
                            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${active ? clr : "var(--border-strong)"}`, background: active ? `${clr}22` : "transparent", color: active ? clr : "var(--text-muted)", cursor: "pointer" }}>
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  )}
                {showMonteCarlo && monteCarloData?.probSufficiency != null && (() => {
                  const prob = monteCarloData.probSufficiency;
                  const c = prob >= 80 ? "#34d399" : prob >= 50 ? "#fbbf24" : "#f87171";
                  return (<>
                    <div style={{ marginBottom: 12, padding: 16, borderRadius: 14, border: `1px solid ${c}33`, background: `${c}11`, display: "flex", alignItems: "center", gap: 16 }}>
                      <Percent style={{ width: 20, height: 20, color: c, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Probability of Sufficiency</p><p style={{ fontSize: 10, color: "var(--text-muted)" }}>% of 200 runs where CPF at age {inputs.payoutAge} ≥ projected FRS ({formatCurrency(monteCarloData.frsAtPayout)}) · ±{Number(inputs.mcVariancePct) || 1}% rate variance</p></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 100, height: 6, background: "var(--bg-input)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 999, background: c, width: `${prob}%` }} /></div>
                        <span style={{ fontSize: 28, fontWeight: 900, color: c, fontFamily: "monospace" }}>{prob}%</span>
                      </div>
                    </div>
                    {/* Plain-English Monte Carlo explanation */}
                    <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <p style={{ fontWeight: 700, color: "#a78bfa", marginBottom: 8, fontSize: 12 }}>🎲 What is Monte Carlo simulation?</p>
                      <p style={{ marginBottom: 8 }}>A Monte Carlo simulation runs your retirement projection <strong style={{ color: "var(--text-bright)" }}>200 times</strong>, each time with slightly different CPF interest rates. The variance band is user-selectable: <strong style={{ color: "#60a5fa" }}>Mild ±0.5%</strong>, <strong style={{ color: "#a78bfa" }}>Base ±1%</strong> (default), or <strong style={{ color: "#f87171" }}>Stress ±2%</strong>. This mimics real-world rate uncertainty. The result is a <strong style={{ color: "var(--text-bright)" }}>range of possible outcomes</strong>, not just one single prediction.</p>
                      <p style={{ fontWeight: 700, color: "#a78bfa", marginBottom: 6 }}>How to read the chart bands:</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
                        {[
                          ["Purple band (shaded)", "The full range between the worst 10% of outcomes (P10) and best 10% of outcomes (P90). Wider = more uncertainty.", "rgba(124,58,237,0.15)"],
                          ["Dashed purple line (P50)", "The median outcome — half the simulations finished above this line, half below. Think of it as the most likely single scenario.", "rgba(167,139,250,0.15)"],
                          ["Probability of Sufficiency", "The % of all 200 runs where your CPF at payout age was enough to meet the FRS target. 80%+ is strong; below 50% suggests risk.", "rgba(52,211,153,0.1)"],
                        ].map(([title, desc, bg]) => (
                          <div key={title} style={{ padding: "8px 10px", borderRadius: 8, background: bg, border: "1px solid rgba(139,92,246,0.2)", display: "flex", flexDirection: "column" }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "#a78bfa", marginBottom: 3 }}>{title}</div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5, flex: 1 }}>{desc}</div>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 10, color: "var(--text-subtle)" }}>💡 <strong>What to do with this:</strong> If the probability is low, consider increasing your RSTU top-ups or deferring your payout age. The What-If Explorer (Summary tab) lets you test these adjustments instantly.</p>
                    </div>
                  </>);
                })()}
                <div style={{ height: 380 }}>
                  <ResponsiveContainer width="99%" height="100%">
                    <AreaChart data={(() => {
                      const base = displayAccumulation.filter(d => d.age <= payoutAge65).map(row => ({ // BUG-51 fix: use debounced payoutAge65
                        ...row,
                        // SA is closed at 55 — zero it out post-55 so the area ends cleanly.
                        // RA only exists post-55 — zero it out pre-55 so it doesn't ghost below the axis.
                        sa: row.age >= 55 ? 0 : (row.sa || 0),
                        ra: row.age < 55 ? 0 : (row.ra || 0),
                      }));
                      let merged = base;
                      if (showMonteCarlo && monteCarloData) {
                        merged = merged.map(row => { const mc = monteCarloData.rows.find(m => m.age === row.age); return mc ? { ...row, mcP10: mc.p10, mcP90: mc.p90, mcP50: mc.p50 } : row; });
                      }
                      if (showBaseline && baselineProjection) {
                        merged = merged.map(row => { const bl = baselineProjection.find(b => b.age === row.age); return bl ? { ...row, baselineTotal: bl.baselineTotal } : row; });
                      }
                      return merged;
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="age" stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Age", position: "insideBottomRight", offset: -5, fill: "var(--chart-text)", fontSize: 9 }} />
                      <YAxis tickFormatter={v => `$${v > 999 ? (v / 1000).toFixed(0) + "k" : v}`} stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "CPF Balance ($)", angle: -90, position: "insideLeft", offset: 14, fill: "var(--chart-text)", fontSize: 9, style: { textAnchor: "middle" } }} />
                      <Tooltip contentStyle={{ background: "var(--tooltip-bg)", backdropFilter: "blur(4px)", border: "1px solid var(--tooltip-border)", borderRadius: 8, fontSize: 10, padding: "6px 8px" }} itemStyle={{ padding: 0, color: "var(--tooltip-text)" }} labelStyle={{ fontSize: 10, color: "var(--tooltip-label)", marginBottom: 2 }} formatter={(v, n) => { if (n === "MC Band") return null; return [formatCurrency(v), n]; }} wrapperStyle={{ pointerEvents: "none" }} />
                      <Legend verticalAlign="top" height={28} iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 600, color: "var(--text-main)" }} />
                      {showMonteCarlo && monteCarloData && <><Area isAnimationActive={false} type="monotone" dataKey="mcP90" stroke="none" fill="#7c3aed" fillOpacity={0.12} name="MC Band" legendType="none" /><Area isAnimationActive={false} type="monotone" dataKey="mcP10" stroke="none" fill="var(--bg-base)" fillOpacity={1} name="" legendType="none" /><Line isAnimationActive={false} type="monotone" dataKey="mcP50" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="MC Median (P50)" /></>}
                      {milestones.filter(m => m.age <= payoutAge65).map((m, idx) => { // BUG-51 fix: use debounced payoutAge65
                        const sc = m.type === "success" ? "#10b981" : m.type === "gold" ? "#f59e0b" : m.type === "warning" ? "#f97316" : "#ef4444";
                        return <ReferenceLine key={idx} x={m.age} stroke={sc} strokeWidth={1.5} strokeDasharray="3 3" label={{ position: "insideTopRight", value: `Age ${m.age}`, fill: sc, fontSize: 8, fontWeight: "bold" }} />;
                      })}
                      {/* Rev #D2: Life event markers — bands for range events, lines for point events */}
                      {showLifeEventMarkers && (inputs.lifeEvents || []).filter(e => e.enabled !== false).map((ev, idx) => {
                        const meta = LIFE_EVENT_TYPES[ev.type] || {};
                        const color = meta.color || "#ef4444";
                        const sa = Number(ev.startAge);
                        const ea = Number(ev.endAge);
                        const isPoint = ev.type === 'windfall' || ev.type === 'early_retirement' || sa === ea;
                        const labelVal = `${meta.icon || "⚡"} ${ev.label || meta.label}`;
                        if (isPoint) {
                          return <ReferenceLine key={`le-${idx}`} x={sa} stroke={color} strokeWidth={2} strokeDasharray="5 3"
                            label={{ position: "insideTopLeft", value: labelVal, fill: color, fontSize: 8, fontWeight: "bold" }} />;
                        }
                        return <ReferenceArea key={`le-${idx}`} x1={sa} x2={Math.min(ea, payoutAge65)} fill={color} fillOpacity={0.08}
                          stroke={color} strokeOpacity={0.4} strokeWidth={1}
                          label={{ position: "insideTop", value: labelVal, fill: color, fontSize: 8, fontWeight: "bold" }} />;
                      })}
                      <Area isAnimationActive={false} type="monotone" dataKey="oa" stackId="1" stroke="#1d4ed8" fill="#1d4ed8" fillOpacity={0.85} name="OA" />
                      <Area isAnimationActive={false} type="monotone" dataKey="sa" stackId="1" stroke="#b45309" fill="#b45309" fillOpacity={0.85} name="SA (pre-55)" />
                      <Area isAnimationActive={false} type="monotone" dataKey="ma" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.85} name="MA" />
                      <Area isAnimationActive={false} type="monotone" dataKey="ra" stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.85} name="RA (from 55)" />
                      {showBaseline && baselineProjection && <Line isAnimationActive={false} type="monotone" dataKey="baselineTotal" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Mandatory-only baseline" />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {showBaseline && baselineProjection && (() => {
                  const pa = payoutAge65; // CQ-2 fix: use debounced value to match displayAccumulation data
                  const withRow = accumulationByAge.get(pa) || {}; // CQ-2 perf: O(1) Map lookup
                  const withTotal = (withRow.oa || 0) + (withRow.sa || 0) + (withRow.ma || 0) + (withRow.ra || 0);
                  const blRow = baselineProjection.find(r => r.age === pa) || {};
                  const blTotal = blRow.baselineTotal || 0;
                  const uplift = withTotal - blTotal;
                  const upliftPct = blTotal > 0 ? Math.round((uplift / blTotal) * 100) : 0;
                  return (
                    <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.2)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <MinusCircle style={{ width: 16, height: 16, color: "#94a3b8", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 2 }}>Mandatory-Only Baseline (dashed line)</p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
                          Without voluntary top-ups, transfers, or grants — mandatory contributions only. At age {pa}: <strong style={{ color: "#94a3b8" }}>{formatCurrency(blTotal)}</strong> baseline vs <strong style={{ color: "#34d399" }}>{formatCurrency(withTotal)}</strong> with your current strategy.
                        </p>
                      </div>
                      {uplift > 0 && (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>+{formatCurrency(uplift)}</div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>+{upliftPct}% uplift from voluntary strategy</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  <p style={{ fontWeight: 700, color: "var(--text-highlight)", marginBottom: 8, fontSize: 12 }}>📊 How to read this chart (Age {inputs.currentAge} → {inputs.payoutAge})</p>
                  <p style={{ marginBottom: 8 }}>This stacked area chart shows how your CPF savings accumulate year by year from your current age ({inputs.currentAge}) until your chosen payout age ({inputs.payoutAge}). Each coloured band represents one account:</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8, marginBottom: 10 }}>
                    {[
                      ["OA (Ordinary Account)", "#1d4ed8", "2.5% p.a. Used for housing, investments. Contributions stop at Contrib Stop Age."],
                      ["SA (Special Account)", "#b45309", "4.0% p.a. Locked for retirement — cannot be used for housing. Closed permanently at age 55 and merged into RA."],
                      ["MA (MediSave)", "#059669", "4.0% p.a. Used for healthcare. Capped at BHS ($79,000). Excess above BHS flows to SA/RA."],
                      ["RA (Retirement Account)", "#7c3aed", "4.0% p.a. Created at age 55 from SA. Funds the CPF LIFE pool at payout age."],
                    ].map(([name, col, desc]) => (
                      <div key={name} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg-muted)", border: `1px solid ${col}44` }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: col, marginBottom: 3 }}>{name}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ marginBottom: 6 }}><strong style={{ color: "var(--text-bright)" }}>Key transitions to watch for:</strong></p>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10 }}>
                    <li><strong style={{ color: "#b45309" }}>Age 55 — SA Closure:</strong> SA balance merges into RA. Only FRS (~${Math.round((RETIREMENT_SUMS_2026.FRS * Math.pow(1 + (Number(inputs.retirementSumGrowth)||3)/100, Math.max(0, (Number(inputs.currentYear) || 2026) + Math.max(0, 55 - (Number(inputs.currentAge) || 35)) - 2026))) / 1000)}k at age 55) goes to RA; any excess stays in OA.</li>
                    <li><strong style={{ color: "#1d4ed8" }}>Housing outflow:</strong> OA may shrink if Housing Loan deductions exceed contributions. This stops at Housing Stop Age ({inputs.housingStopAge}).</li>
                    <li><strong style={{ color: "#7c3aed" }}>Age {inputs.payoutAge} — LIFE pool:</strong> RA transfers into the CPF LIFE pool. Monthly payouts begin. The chart stops here; the LIFE tab shows payouts from age {inputs.payoutAge} to 95.</li>
                  </ul>
                </div>
              </div>
            )}
            {/* ── LIFE TAB ── */}
            {activeTab === "life" && (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="life-chart-header" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Chart Projection (Age {inputs.payoutAge} – 95)</h3>
                  {/* B6: CPF LIFE eligibility info bar */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", fontSize: 10, color: "var(--text-muted)" }}>
                    {[
                      ["🏛 Eligibility", "SC & PR only"],
                      ["📅 Born", "1958 or after"],
                      ["💰 RA threshold", "≥ $60,000 for auto-enrolment"],
                      ["⏱ Payout start", "Age 65–70 (your choice)"],
                      ["📈 Deferral bonus", "+7%/yr past 65"],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--text-subtle)", fontSize: 9 }}>{label}:</span>
                        <span style={{ fontWeight: 700, color: "var(--text-highlight)", fontSize: 10 }}>{val}</span>
                        <span style={{ color: "rgba(168,85,247,0.3)", marginLeft: 2, fontSize: 9 }}>|</span>
                      </div>
                    ))}
                    <span style={{ fontSize: 9, color: "var(--text-subtle)", alignSelf: "center" }}>Projections assume enrolment. Members below $60k RA may not auto-enrol but can apply.</span>
                  </div>
                  {/* P1 fix: Foreigner gate — CPF LIFE is SC/PR only. Show a prominent warning when
                      citizenStatus === 'foreigner' so the user knows the payout estimates below do not apply.
                      The chart is not suppressed — foreigners may be exploring what-if SC/PR scenarios. */}
                  {isForeigner && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 12, background: "rgba(251,191,36,0.08)", border: "2px solid rgba(251,191,36,0.45)" }}>
                      <AlertTriangle style={{ width: 18, height: 18, color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 11, lineHeight: 1.65, color: "var(--text-muted)" }}>
                        <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 12 }}>CPF LIFE is not available to foreigners.</span>
                        {" "}CPF LIFE is restricted to <strong>Singapore Citizens and Permanent Residents</strong> born in <strong>1958 or after</strong>.
                        As a foreigner, you have no CPF account and are not eligible for CPF LIFE, RA top-ups, RSTU, MRSS, or MMSS.
                        <br />
                        <span style={{ color: "var(--text-subtle)", fontSize: 10, marginTop: 4, display: "block" }}>
                          All CPF LIFE charts and analysis below are hidden for foreigners.
                          Your primary tax-deferred retirement vehicle is <strong>SRS</strong> (Supplementary Retirement Scheme) — contributions up to <strong>$35,700/yr</strong> are tax-deductible.
                          Update your citizenship in the <strong>Profile</strong> sidebar panel if this is incorrect.
                        </span>
                      </div>
                    </div>
                  )}
                  {/* life-chart-header closes here — the ternary below must be at the same
                      level as life-chart-header, not nested inside it, so the SC/PR fragment
                      can include all subsequent sibling sections without invalid JSX nesting. */}
                </div>
                {/* Gate all SC/PR content. Foreigners → locked SRS redirect panel.
                    Previously the chart, breakeven cards, and sensitivity table were shown
                    with RA=0, producing misleading "Beyond Age 95" crossover cards and $0
                    sensitivity rows. Now fully suppressed and replaced. */}
                {isForeigner ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "28px 24px", borderRadius: 16, background: "rgba(251,191,36,0.05)", border: "2px dashed rgba(251,191,36,0.3)", textAlign: "center" }}>
                    <div style={{ fontSize: 32 }}>🔒</div>
                    <p style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24", margin: 0 }}>CPF LIFE — Not Available to Foreigners</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
                      CPF LIFE is a mandatory annuity scheme for <strong style={{ color: "var(--text-bright)" }}>Singapore Citizens and Permanent Residents</strong> only.
                      As a foreigner you have no CPF account, no RA, and no eligibility for any CPF LIFE plan — the chart and analysis below would only show $0 payouts and are therefore not displayed.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 500, margin: "0 auto", width: "100%" }}>
                      {[
                        ["💰 Your retirement scheme", "SRS (Supplementary Retirement Scheme)", "#0ea5e9"],
                        ["📋 Annual contribution cap", "$35,700 / yr (foreigner rate)", "#34d399"],
                        ["🧾 Tax deduction", "SRS contributions are fully tax-deductible", "#a78bfa"],
                        ["📊 Manage SRS", "Use the SRS panel in the sidebar", "#fbbf24"],
                      ].map(([lbl, desc, color]) => (
                        <div key={lbl} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)", textAlign: "left" }}>
                          <p style={{ fontSize: 10, fontWeight: 800, color, margin: "0 0 4px" }}>{lbl}</p>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{desc}</p>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, color: "var(--text-subtle)", margin: 0 }}>
                      Switch citizenship to <strong>SC</strong> or <strong>PR</strong> in the Profile panel to explore CPF LIFE plan comparisons.
                    </p>
                  </div>
                ) : (
                  <>
                  {/* LIFE tab intro — collapsible via native <details> (no hooks) */}
                  <details style={{ borderRadius: 12, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                    <summary style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", listStyle: "none", outline: "none" }}>
                      <p style={{ fontWeight: 700, color: "var(--text-highlight)", margin: 0, fontSize: 12 }}>📊 LIFE Tab — How to Read This Tab</p>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>▼ Show</span>
                    </summary>
                    <div style={{ padding: "0 16px 12px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, marginBottom: 8 }}>
                        {[
                          ["📈 The Line Chart", "Shows monthly payout, annual payout, bequest, or cumulative total yield from age " + inputs.payoutAge + " to 95 for all three LIFE plans simultaneously. Toggle view modes using the buttons above the chart."],
                          ["Standard Plan (grey)", "Level flat monthly payout for life. 100% of RA transferred as premium. Predictable income but no inflation protection."],
                          ["Escalating Plan (green)", "Monthly payout starts ~20% lower than Standard but grows at 2%/yr. Surpasses Standard eventually — see the crossover age below."],
                          ["Basic Plan (amber)", "RA is split: a % is premium (pool), the rest stays in your personal RA earning 4% and funds your own payouts until ~age 90. After 90, the pool takes over."],
                          ["📐 Breakeven / Crossover", "The age where one plan's cumulative total yield overtakes another. Switch to 'Total Yield' view to see the dotted reference lines on the chart."],
                          ["📋 Sensitivity Table", "Shows starting monthly payouts and all crossover ages for every payout age from 65 to 70. Green row = your current selection."],
                        ].map(([title, desc]) => (
                          <div key={title} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-highlight)", marginBottom: 3 }}>{title}</div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 10, color: "var(--text-subtle)" }}>💡 <strong>Tip:</strong> Use the plan selector (Standard / Escalating / Basic) to highlight one plan's line. The other two are dimmed for clarity. Hover over the chart to see exact values at any age.</p>
                    </div>
                  </details>
                  <div style={{ display: "flex", background: "var(--bg-input)", padding: 4, borderRadius: 10, gap: 2, alignSelf: "flex-start" }}>
                    {["standard", "escalating", "basic"].map(plan => (
                      <button key={plan} onClick={() => setHighlightPlan(plan)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800, textTransform: "uppercase", border: "none", cursor: "pointer", background: highlightPlan === plan ? "#10b981" : "transparent", color: highlightPlan === plan ? "#020617" : "var(--text-muted)" }}>
                        {plan}
                      </button>
                    ))}
                  </div>
                {/* Payout Premium Sliders - Standard & Escalating only (Basic has its own slider below) */}
                <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: "14px 18px" }}>
                  <h4 style={{ fontSize: 12, fontWeight: 800, color: "var(--text-bright)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><SlidersHorizontal style={{ width: 13, height: 13, color: "#fbbf24" }} />CPF LIFE Premium Structure</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Standard Plan Premium</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8" }}>100% (Fixed)</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#94a3b8", width: "100%", marginBottom: 4 }} />
                      <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>Fixed at 100%. Full RA transferred to CPF Board as premium. Flat monthly payout for life.</p>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>Escalating Plan Premium</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#10b981" }}>100% (Fixed)</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#10b981", width: "100%", marginBottom: 4 }} />
                      <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>Fixed at 100%. Full RA transferred to CPF Board as premium. Payout grows 2%/yr for life.</p>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", background: "var(--bg-base)", padding: 4, borderRadius: 12, border: "1px solid var(--border-subtle)", gap: 2 }}>
                  {[["payout", "Monthly Payout"], ["annualPayout", "Annual Payout"], ["bequest", "Bequest"], ["total", "Total Yield"]].map(([id, label]) => (
                    <button key={id} onClick={() => setViewMode(id)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase", border: "none", cursor: "pointer", background: viewMode === id ? "#10b981" : "transparent", color: viewMode === id ? "#020617" : "var(--text-muted)" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ height: 350 }}>
                  <ResponsiveContainer width="99%" height="100%">
                    <LineChart data={displayProjection.filter(d => d.age >= payoutAge65)}> {/* BUG-51 fix: use debounced payoutAge65 */}
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="age" stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Age", position: "insideBottomRight", offset: -5, fill: "var(--chart-text)", fontSize: 9 }} />
                      <YAxis tickFormatter={v => `$${v > 999 ? (v / 1000).toFixed(0) + "k" : v}`} stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Amount ($)", angle: -90, position: "insideLeft", offset: 14, fill: "var(--chart-text)", fontSize: 9, style: { textAnchor: "middle" } }} />
                      <Tooltip contentStyle={{ background: "var(--tooltip-bg)", backdropFilter: "blur(4px)", border: "1px solid var(--tooltip-border)", borderRadius: 8, fontSize: 10, padding: "6px 8px" }} itemStyle={{ padding: 0, color: "var(--tooltip-text)" }} labelStyle={{ fontSize: 10, color: "var(--tooltip-label)", marginBottom: 2 }} formatter={v => formatCurrency(v)} wrapperStyle={{ pointerEvents: "none" }} />
                      <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: 9, fontWeight: 600, color: "var(--text-main)" }} />
                      {viewMode === "total" && intersectionEscVsStd && <ReferenceLine x={intersectionEscVsStd} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" label={{ position: "insideTopLeft", value: `Break-Even Age ${intersectionEscVsStd}`, fill: "#f59e0b", fontSize: 9, fontWeight: "bold" }} />}
                      {viewMode === "total" && intersectionStdVsBasic && <ReferenceLine x={intersectionStdVsBasic} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" label={{ position: "insideBottomRight", value: `Std>Basic Age ${intersectionStdVsBasic}`, fill: "#3b82f6", fontSize: 9, fontWeight: "bold" }} />}
                      {viewMode === "payout" && intersectionEscPayVsStdPay && <ReferenceLine x={intersectionEscPayVsStdPay} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" label={{ position: "insideTopLeft", value: `Esc>Std Pay Age ${intersectionEscPayVsStdPay}`, fill: "#10b981", fontSize: 9, fontWeight: "bold" }} />}
                      <Line isAnimationActive={false} type="monotone" dataKey={viewMode === "payout" ? "standardMonthly" : viewMode === "annualPayout" ? "standardAnnual" : viewMode === "total" ? "standardTotal" : "standardBequest"} stroke="#94a3b8" strokeWidth={highlightPlan === "standard" ? 4 : 2} strokeDasharray={highlightPlan === "standard" ? "" : "6 3"} opacity={highlightPlan === "standard" ? 1 : 0.65} dot={false} name="Standard" />
                      <Line isAnimationActive={false} type="monotone" dataKey={viewMode === "payout" ? "escalatingMonthly" : viewMode === "annualPayout" ? "escalatingAnnual" : viewMode === "total" ? "escalatingTotal" : "escalatingBequest"} stroke="#10b981" strokeWidth={highlightPlan === "escalating" ? 4 : 2} strokeDasharray={highlightPlan === "escalating" ? "" : "6 3"} opacity={highlightPlan === "escalating" ? 1 : 0.65} dot={false} name="Escalating" />
                      <Line isAnimationActive={false} type="monotone" dataKey={viewMode === "payout" ? "basicMonthly" : viewMode === "annualPayout" ? "basicAnnual" : viewMode === "total" ? "basicTotal" : "basicBequest"} stroke="#f59e0b" strokeWidth={highlightPlan === "basic" ? 4 : 2} strokeDasharray={highlightPlan === "basic" ? "" : "6 3"} opacity={highlightPlan === "basic" ? 1 : 0.65} dot={false} name="Basic" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Info cards */}
                <div className="rg-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[["Standard/Escalating Bequest", "Beneficiaries receive total premium minus cumulative payouts. Interest not included.", "#94a3b8"], ["Total Yield", "Cumulative payouts received plus remaining bequest. Switch to Total Yield to see breakeven lines.", "#60a5fa"]].map(([title, text, color]) => (
                    <div key={title} style={{ padding: 14, borderRadius: 12, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      <strong style={{ color }}>{title}: </strong>{text}
                    </div>
                  ))}
                  {/* Basic plan card with embedded slider */}
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "2px solid rgba(245,158,11,0.3)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    <strong style={{ color: "#f59e0b" }}>Basic Bequest: </strong>Before age 90 (Phase 1): remaining personal RA balance <em>plus</em> a full refund of the premium paid — CPF policy returns the full premium if death occurs before the pool phase. After 90 (Phase 2): unused pool premium minus any payouts already drawn from the pool. Higher % → larger pool premium, smaller retained RA, lower Phase 1 payout.
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(245,158,11,0.2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}><SlidersHorizontal style={{ width: 11, height: 11 }} />Basic Premium</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>{basicPremiumPct}%</span>
                      </div>
                      <input type="range" min={10} max={20} step={1} value={basicPremiumPct} onChange={e => setBasicPremiumPct(Number(e.target.value))} style={{ width: "100%", accentColor: "#f59e0b", margin: "2px 0" }} />
                      <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>10%–20% of RA deducted as life-pool premium. Drag to see live impact on chart above.</p>
                    </div>
                  </div>
                </div>
                {/* Breakeven Analysis */}
                <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 900, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><Activity style={{ width: 14, height: 14, color: "#fbbf24" }} />Plan Breakeven &amp; Crossover Analysis</h4>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 14 }}>All crossover ages based on cumulative Total Yield. Switch to "Total Yield" view to see reference lines.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["Standard vs. Escalating", "Escalating Overtakes Standard", intersectionEscVsStd, "#fbbf24", "rgba(245,158,11,0.1)", "rgba(245,158,11,0.2)", "Esc starts ~20% lower but grows 2%/yr. Takes decades for cumulative total yield to catch up. Break-Even Age shows when Escalating surpasses Standard."],
                      ["Standard vs. Basic", "Standard Overtakes Basic", intersectionStdVsBasic, "#60a5fa", "rgba(59,130,246,0.1)", "rgba(59,130,246,0.2)", "In early retirement, Basic yields more total value because the 90% retained RA earns compound interest into your bequest. Once Basic RA depletes at 90, Standard overtakes."],
                      ["Escalating vs. Basic", "Escalating Overtakes Basic", intersectionEscVsBasic, "#c084fc", "rgba(168,85,247,0.1)", "rgba(168,85,247,0.2)", "Basic's high early bequest makes it lead initially, but Escalating's 2% annual growth compounds fastest over the extreme long term, eventually surpassing Basic."],
                      ["Monthly Payout Crossover", "Esc Monthly Payout Exceeds Standard", intersectionEscPayVsStdPay, "#34d399", "rgba(16,185,129,0.1)", "rgba(16,185,129,0.2)", "At 2%/yr compounding, Escalating monthly payout eventually exceeds Standard's fixed amount. This is the age your monthly cheque is larger under Escalating."]
                    ].map(([cardTitle, label, age, color, bg, border, note]) => (
                      <div key={label} style={{ padding: 14, borderRadius: 12, background: bg, border: `1px solid ${border}` }}>
                        <p style={{ fontSize: 13, fontWeight: 900, color, marginBottom: 4 }}>{cardTitle}</p>
                        <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{label}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color, marginBottom: 6 }}>{age ? `Age ${age}` : "Beyond Age 95"}</p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{note}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Sensitivity Table */}
                <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 900, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Scale style={{ width: 14, height: 14, color: "#60a5fa" }} />Payout Age Sensitivity Table</h4>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                    Each row shows estimated monthly payouts at each payout age, based on 2026 CPF Board data. Deferral increases payouts because RA grows further and the payout period shortens. The green-highlighted row is your current payout age selection.
                    <br /><strong style={{ color: "var(--text-bright)" }}>Column guide: </strong>
                    <span style={{ color: "#94a3b8" }}>Std</span> = Standard monthly · <span style={{ color: "#34d399" }}>Esc</span> = Escalating monthly · <span style={{ color: "#fb923c" }}>Bas</span> = Basic monthly · <span style={{ color: "#fbbf24" }}>Esc&gt;Std</span> = age when Escalating cumulative total overtakes Standard · <span style={{ color: "#60a5fa" }}>Std&gt;Bas</span> = age when Standard overtakes Basic · <span style={{ color: "#c084fc" }}>Esc&gt;Bas</span> = age when Escalating overtakes Basic.
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
                      <thead><tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                        <th style={{ padding: "8px", textAlign: "left", color: "var(--text-muted)", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Payout Age</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#94a3b8", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Std $/mo</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#34d399", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Esc $/mo</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#fb923c", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Bas $/mo</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#fbbf24", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Esc&gt;Std</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#60a5fa", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Std&gt;Bas</th>
                        <th style={{ padding: "8px", textAlign: "right", color: "#c084fc", fontWeight: 800, fontSize: 9, textTransform: "uppercase" }}>Esc&gt;Bas</th>
                      </tr></thead>
                      <tbody>{sensitivityData.map(row => {
                        const isCurrent = row.pAge === (Number(inputs.payoutAge) || 65);
                        return (<tr key={row.pAge} style={{ borderBottom: "1px solid var(--border-subtle)", background: isCurrent ? "rgba(16,185,129,0.08)" : "" }}>
                          <td style={{ padding: "8px", fontWeight: 800, color: isCurrent ? "#34d399" : "var(--text-muted)" }}>Age {row.pAge}{isCurrent ? "  ◀ " : ""}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "var(--text-highlight)" }}>{row.stdMonthly > 0 ? `$${row.stdMonthly.toLocaleString()}` : "—"}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#34d399" }}>{row.escMonthly > 0 ? `$${row.escMonthly.toLocaleString()}` : "—"}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#fb923c" }}>{row.basMonthly > 0 ? `$${row.basMonthly.toLocaleString()}` : "—"}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#fbbf24", fontWeight: 700 }}>{row.escVsStd ? `Age ${row.escVsStd}` : ">95"}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#93c5fd", fontWeight: 700 }}>{row.stdVsBasic ? `Age ${row.stdVsBasic}` : ">95"}</td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#d8b4fe", fontWeight: 700 }}>{row.escVsBasic ? `Age ${row.escVsBasic}` : ">95"}</td>
                        </tr>);
                      })}</tbody>
                    </table>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}
            {/* ── COMPARE TAB ── */}
            {activeTab === "compare" && (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}><Scale style={{ width: 18, height: 18, color: "#34d399" }} />Compare Scenarios</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Change your inputs, then save to Slot A or B. Both scenarios persist for comparison.</p>
                {/* Compare tab explanation */}
                <div style={{ padding: "12px 16px", borderRadius: 12, background: "var(--bg-panel-muted)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 20 }}>
                  <p style={{ fontWeight: 700, color: "var(--text-highlight)", marginBottom: 6, fontSize: 12 }}>🔀 How to use this tab</p>
                  <ol style={{ paddingLeft: 18, margin: 0, fontSize: 10, lineHeight: 1.8 }}>
                    <li><strong style={{ color: "var(--text-bright)" }}>Set up Scenario A:</strong> Configure your inputs in the sidebar for your first scenario (e.g. retire at 65), then click <em>Save Current as A</em>.</li>
                    <li><strong style={{ color: "var(--text-bright)" }}>Change inputs for Scenario B:</strong> Adjust your inputs (e.g. change payout age to 70, increase RSTU top-up), then click <em>Save Current as B</em>.</li>
                    <li><strong style={{ color: "var(--text-bright)" }}>View the chart:</strong> The line chart shows total CPF balance year-by-year for both scenarios from your current age to 95. Blue = Scenario A, Orange = Scenario B.</li>
                    <li><strong style={{ color: "var(--text-bright)" }}>Scenario configuration:</strong> Each saved slot shows all inputs that differ from the default — so you can quickly see what changed between the two scenarios.</li>
                  </ol>
                  <p style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 6 }}>💡 <strong>Tip:</strong> Give each scenario a descriptive label (e.g. "Retire at 65" vs "Defer to 70") using the label field to make the chart legend readable.</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  {/* ── Slot A ── */}
                  {(() => {
                    const color = "#3b82f6", bg = "rgba(59,130,246,0.08)", border = "rgba(59,130,246,0.2)";
                    return (
                      <div style={{ padding: 16, borderRadius: 14, background: bg, border: `1px solid ${border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <h4 style={{ fontWeight: 700, color, fontSize: 14 }}>Scenario A</h4>
                          {scenarioA && <button onClick={() => { setScenarioA(null); setScenarioLabelA(""); }} style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Clear</button>}
                        </div>
                        <input type="text" value={scenarioLabelA} onChange={e => setScenarioLabelA(e.target.value)} placeholder="Label (e.g. Retire at 65)" style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel-muted)", border: `1px solid ${border}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 11, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
                        {scenarioA ? (
                          <div style={{ flex: 1, marginBottom: 16 }}>
                            <p style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Scenario Configuration (vs Default)</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                              {/* BUG-47 fix: use String() coercion — JSON-imported profiles have numeric fields as strings, causing "65" !== 65 false diffs */}
                              {/* BUG-1 fix: guard against array/object values (e.g. lifeEvents) being passed as raw React children,
                                  which throws "Objects are not valid as a React child" and crashes the Compare tab.
                                  Arrays → show count; booleans → Yes/No; objects → JSON; primitives → as-is. */}
                              {Object.keys(DEFAULT_INPUTS).filter(k => (String(scenarioA.inputs[k]) !== String(DEFAULT_INPUTS[k]) || k === 'payoutAge' || k === 'currentAge') && k !== 'name').map(k => {
                                const rawVal = scenarioA.inputs[k];
                                const displayVal = Array.isArray(rawVal)
                                  ? `${rawVal.length} event${rawVal.length !== 1 ? 's' : ''}`
                                  : typeof rawVal === 'boolean'
                                    ? (rawVal ? 'Yes' : 'No')
                                    : (rawVal !== null && typeof rawVal === 'object')
                                      ? JSON.stringify(rawVal)
                                      : rawVal;
                                return (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", background: "var(--bg-base)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{SCENARIO_LABELS[k] || k}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "monospace" }}>{displayVal}</span>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 16 }}>Empty — configure inputs then save</div>
                        )}
                        <button onClick={() => {
                          // BUG-42 fix: always save nominal (non-deflated) engine output — see original comment.
                          // BUG-3 fix: compute projection from live `inputs`, not the debounce-lagged `projection`
                          // variable. If the user clicks Save within the 180ms debounce window the stored
                          // projection would be one step behind the stored inputs, causing the Compare chart
                          // to show mismatched lines. runProjectionEngine is module-level — safe to call here.
                          // payoutProj set to null: the Compare tab's getNetWorth fallback handles it correctly.
                          const freshProj = runProjectionEngine({ ...inputs });
                          setScenarioA({ inputs: { ...inputs }, projection: freshProj, payoutProj: null });
                        }} style={{ width: "100%", padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: `${color}22`, color, marginTop: "auto" }}>Save Current as A</button>
                      </div>
                    );
                  })()}
                  {/* ── Slot B ── */}
                  {(() => {
                    const color = "#f97316", bg = "rgba(249,115,22,0.08)", border = "rgba(249,115,22,0.2)";
                    return (
                      <div style={{ padding: 16, borderRadius: 14, background: bg, border: `1px solid ${border}`, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <h4 style={{ fontWeight: 700, color, fontSize: 14 }}>Scenario B</h4>
                          {scenarioB && <button onClick={() => { setScenarioB(null); setScenarioLabelB(""); }} style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Clear</button>}
                        </div>
                        <input type="text" value={scenarioLabelB} onChange={e => setScenarioLabelB(e.target.value)} placeholder="Label (e.g. Retire at 70)" style={{ width: "100%", padding: "6px 10px", background: "var(--bg-panel-muted)", border: `1px solid ${border}`, borderRadius: 8, color: "var(--text-bright)", fontSize: 11, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
                        {scenarioB ? (
                          <div style={{ flex: 1, marginBottom: 16 }}>
                            <p style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Scenario Configuration (vs Default)</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                              {/* BUG-47 fix: use String() coercion — JSON-imported profiles have numeric fields as strings, causing "65" !== 65 false diffs */}
                              {/* BUG-1 fix: same array/object guard as Scenario A — prevents crash when lifeEvents (or any future array field) is in scenarioB.inputs */}
                              {Object.keys(DEFAULT_INPUTS).filter(k => (String(scenarioB.inputs[k]) !== String(DEFAULT_INPUTS[k]) || k === 'payoutAge' || k === 'currentAge') && k !== 'name').map(k => {
                                const rawVal = scenarioB.inputs[k];
                                const displayVal = Array.isArray(rawVal)
                                  ? `${rawVal.length} event${rawVal.length !== 1 ? 's' : ''}`
                                  : typeof rawVal === 'boolean'
                                    ? (rawVal ? 'Yes' : 'No')
                                    : (rawVal !== null && typeof rawVal === 'object')
                                      ? JSON.stringify(rawVal)
                                      : rawVal;
                                return (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", background: "var(--bg-base)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{SCENARIO_LABELS[k] || k}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "monospace" }}>{displayVal}</span>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 16 }}>Empty — configure inputs then save</div>
                        )}
                        <button onClick={() => {
                          // BUG-42 fix: always save nominal engine output (see Scenario A comment above).
                          // BUG-3 fix: compute fresh projection from live inputs — same reason as Scenario A.
                          const freshProj = runProjectionEngine({ ...inputs });
                          setScenarioB({ inputs: { ...inputs }, projection: freshProj, payoutProj: null });
                        }} style={{ width: "100%", padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: `${color}22`, color, marginTop: "auto" }}>Save Current as B</button>
                      </div>
                    );
                  })()}
                </div>
                {scenarioA && scenarioB ? (<div>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--text-bright)" }}>Y-axis: Cumulative Total Yield ($)</strong> — the sum of all CPF LIFE payouts received to date plus the remaining bequest (death benefit) value at each age, under the <strong style={{ color: "#34d399" }}>{highlightPlan}</strong> plan. A higher line means more total financial value returned from CPF over your lifetime. The lines diverge where payout age, contribution amount, or RA size creates a lasting difference in returns.
                  </p>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer width="99%" height="100%">
                      <LineChart data={comparisonData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="age" stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Age", position: "insideBottomRight", offset: -5, fill: "var(--chart-text)", fontSize: 10 }} />
                        <YAxis tickFormatter={v => `$${v > 999 ? (v / 1000).toFixed(0) + "k" : v}`} stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Cumulative Total Yield", angle: -90, position: "insideLeft", offset: 10, fill: "var(--chart-text)", fontSize: 9, style: { textAnchor: "middle" } }} />
                        <Tooltip contentStyle={{ background: "var(--tooltip-bg)", backdropFilter: "blur(4px)", border: "1px solid var(--tooltip-border)", borderRadius: 8, fontSize: 10, padding: "6px 8px" }} itemStyle={{ padding: 0, color: "var(--tooltip-text)" }} labelStyle={{ fontSize: 10, color: "var(--tooltip-label)", marginBottom: 2 }} formatter={(v, n) => [formatCurrency(v), n]} labelFormatter={v => `Age ${v}`} wrapperStyle={{ pointerEvents: "none" }} />
                        <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 600, color: "var(--text-main)" }} />
                        <Line isAnimationActive={false} type="monotone" dataKey="yieldA" stroke="#3b82f6" strokeWidth={3} dot={false} name={`Slot A${scenarioLabelA ? `: ${scenarioLabelA}` : ""}`} />
                        <Line isAnimationActive={false} type="monotone" dataKey="yieldB" stroke="#f97316" strokeWidth={3} dot={false} name={`Slot B${scenarioLabelB ? `: ${scenarioLabelB}` : ""}`} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Rev #24 — Export diff button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                    <button
                      onClick={handleExportScenarioDiff}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(52,211,153,0.10)", color: "#34d399", border: "1px solid rgba(52,211,153,0.35)", cursor: "pointer" }}
                    >
                      <Download style={{ width: 13, height: 13 }} />
                      Export A vs B Diff (CSV)
                    </button>
                  </div>
                </div>) : <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-muted)", fontStyle: "italic", border: "2px dashed var(--border-strong)", borderRadius: 16 }}>Save both scenarios to view comparison chart</div>}
              </div>
            )}
            {/* ── DATA TABLE TAB ── */}
            {activeTab === "table" && (
              <div>
                {/* Scenario context banner */}
                {(scenarioA || scenarioB) && (
                  <div style={{ marginBottom: 10, padding: "8px 14px", borderRadius: 10, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Viewing:</span>
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)", fontWeight: 700, textTransform: "capitalize" }}>{highlightPlan} Plan</span>
                    {scenarioA && <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)", fontSize: 10 }}>Slot A: {scenarioLabelA || "Scenario A"}</span>}
                    {scenarioB && <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", fontSize: 10 }}>Slot B: {scenarioLabelB || "Scenario B"}</span>}
                    <span style={{ fontSize: 10, color: "var(--text-subtle)", marginLeft: "auto" }}>Data shows current inputs · switch plans via LIFE tab</span>
                  </div>
                )}
                {/* Sub-tab toggle + guide button */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  {[["projection", "📋 Projection Table"], ["ledger", "💰 Cashflow Ledger"]].map(([id, label]) => (
                    <button key={id} onClick={() => setTableSubTab(id)} style={{ padding: "6px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid", cursor: "pointer",
                      background: tableSubTab === id ? "rgba(16,185,129,0.15)" : "transparent",
                      color: tableSubTab === id ? "#34d399" : "var(--text-muted)",
                      borderColor: tableSubTab === id ? "rgba(16,185,129,0.4)" : "var(--border-strong)" }}>
                      {label}
                    </button>
                  ))}
                  {tableSubTab === "projection" && (
                    <button onClick={() => setShowDataTableGuide(v => !v)}
                      style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        border: `1px solid ${showDataTableGuide ? "rgba(96,165,250,0.5)" : "var(--border-strong)"}`,
                        background: showDataTableGuide ? "rgba(96,165,250,0.12)" : "transparent",
                        color: showDataTableGuide ? "#60a5fa" : "var(--text-muted)", cursor: "pointer" }}>
                      {showDataTableGuide ? "Hide Guide" : "Show Guide"}
                    </button>
                  )}
                </div>

                {/* ── CASHFLOW LEDGER ── */}
                {tableSubTab === "ledger" && (() => {
                  const pa = Number(inputs.payoutAge) || 65;
                  const ledgerRows = displayAccumulation;
                  const fc2 = v => v === 0 ? "—" : `$${(v/1000).toFixed(1)}k`;
                  return (
                    <div>
                      <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 12, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)" }}>
                        <p style={{ fontWeight: 700, color: "var(--text-highlight)", marginBottom: 6, fontSize: 12 }}>💰 Annual Cashflow Ledger — every inflow, outflow, and interest component year by year</p>
                        <p style={{ fontSize: 10, lineHeight: 1.6, margin: 0 }}>
                          <strong style={{ color: "#34d399" }}>Inflows:</strong> Mandatory contributions · Voluntary (VC3A/RSTU/VHR/Cash MA) · Gov grants/MRSS/MMSS/WIS &nbsp;|&nbsp;
                          <strong style={{ color: "#60a5fa" }}>Interest:</strong> OA (2.5%) · {is55Plus ? "RA" : "SA"} (4%) · MA (4%) &nbsp;|&nbsp;
                          <strong style={{ color: "#f472b6" }}>Outflows:</strong> Housing loan · Medical · OA Drawdown · CPFIS (OA+SA) · Education Loan · Loved-one transfers
                        </p>
                      </div>
                      {/* Export bar — matches projection table style */}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                        <button onClick={handleExportLedgerCSV} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer" }}>
                          <Download style={{ width: 11, height: 11 }} />Download CSV
                        </button>
                      </div>
                      {/* Single scroll container handles both axes — required for position:sticky
                          on thead to work correctly. Split outer/inner divs break sticky on mobile
                          because the thead's scroll parent becomes the inner div which loses its
                          fixed height context when the page reflows to height:auto on small screens. */}
                      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 540, borderRadius: 16, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", WebkitOverflowScrolling: "touch" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
                          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                            <tr style={{ background: "var(--bg-base)", borderBottom: "2px solid var(--border-strong)" }}>
                              {["Age", "Mandatory", "Voluntary", "Grants/WIS", "OA Int.", is55Plus ? "RA Int." : "SA Int.", "MA Int.", "▶ Total In", "Housing Out", "Medical Out", "OA Draw", "Edu Loan Out", "Loved One Out", "CPFIS Out", "Events In", "Events Out", "▶ Total Out", "Net Flow"].map((h, i) => (
                                <th key={h} style={{ padding: "6px 8px", textAlign: i === 0 ? "center" : "right", fontSize: 9, fontWeight: 800, color: i === 14 ? "#10b981" : i === 15 ? "#a855f7" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                                  ...(i === 0 ? { position: "sticky", left: 0, zIndex: 20, background: "var(--bg-base)", boxShadow: "var(--shadow-sticky)" } : {}) }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ledgerRows.map((row, i) => {
                              const isPayout = row.age === pa;
                              const mandatory = row.yearMandatory || 0;
                              const voluntary = row.yearVoluntary || 0;
                              const grants = row.yearGovGrants || 0;
                              const oaInt = row.yearOaInterest || 0;
                              const saRaInt = row.yearSaRaInterest || 0;
                              const maInt = row.yearMaInterest || 0;
                              const housOut = row.yearHousingOut || 0;
                              const medOut = row.yearMedOut || 0;
                              const oaDraw = row.yearOaDrawOut || 0;
                              const eduOut = row.yearEduOut || 0;
                              const lovedOut = row.yearLovedOneOut || 0;
                              const cpfisOut = row.yearCpfisOut || 0;
                              const eventsIn = row.yearEventsIn || 0;
                              const eventsOut = row.yearEventsOut || 0;
                              const totalIn = mandatory + voluntary + grants + oaInt + saRaInt + maInt + eventsIn;
                              const totalOut = housOut + medOut + oaDraw + eduOut + lovedOut + cpfisOut + eventsOut;
                              const net = totalIn - totalOut;
                              return (
                                <tr key={row.age} style={{ borderBottom: "1px solid var(--border-subtle)", background: isPayout ? "rgba(16,185,129,0.08)" : i % 2 === 1 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                                  <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: isPayout ? 900 : 600, color: isPayout ? "#10b981" : "var(--text-highlight)", position: "sticky", left: 0, zIndex: 5, background: isPayout ? "rgba(16,185,129,0.12)" : "var(--bg-panel)", boxShadow: "var(--shadow-sticky)", whiteSpace: "nowrap" }}>{row.age}{isPayout ? " ★" : ""}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#34d399" }}>{fc2(mandatory)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#6ee7b7" }}>{fc2(voluntary)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#a78bfa" }}>{fc2(grants)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#60a5fa" }}>{fc2(oaInt)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#818cf8" }}>{fc2(saRaInt)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#c084fc" }}>{fc2(maInt)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#34d399", borderLeft: "1px solid var(--border-subtle)" }}>{fc2(totalIn)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#f472b6" }}>{fc2(housOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#fb7185" }}>{fc2(medOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#f87171" }}>{fc2(oaDraw)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#fb923c" }}>{fc2(eduOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#fca5a5" }}>{fc2(lovedOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#fb923c" }}>{fc2(cpfisOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#10b981", fontWeight: eventsIn > 0 ? 700 : 400 }}>{fc2(eventsIn)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: "#a855f7", fontWeight: eventsOut > 0 ? 700 : 400 }}>{fc2(eventsOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#f472b6", borderLeft: "1px solid var(--border-subtle)" }}>{fc2(totalOut)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: net >= 0 ? "#34d399" : "#f87171" }}>{net >= 0 ? "+" : "-"}{fc2(Math.abs(net))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const t = ledgerRows.reduce((a, r) => ({
                                mandatory: a.mandatory+(r.yearMandatory||0), voluntary: a.voluntary+(r.yearVoluntary||0),
                                grants: a.grants+(r.yearGovGrants||0), oaInt: a.oaInt+(r.yearOaInterest||0),
                                saRaInt: a.saRaInt+(r.yearSaRaInterest||0), maInt: a.maInt+(r.yearMaInterest||0),
                                housOut: a.housOut+(r.yearHousingOut||0), medOut: a.medOut+(r.yearMedOut||0),
                                oaDraw: a.oaDraw+(r.yearOaDrawOut||0), eduOut: a.eduOut+(r.yearEduOut||0),
                                lovedOut: a.lovedOut+(r.yearLovedOneOut||0),
                                cpfisOut: a.cpfisOut+(r.yearCpfisOut||0),
                                eventsIn: a.eventsIn+(r.yearEventsIn||0),
                                eventsOut: a.eventsOut+(r.yearEventsOut||0),
                              }), {mandatory:0,voluntary:0,grants:0,oaInt:0,saRaInt:0,maInt:0,housOut:0,medOut:0,oaDraw:0,eduOut:0,lovedOut:0,cpfisOut:0,eventsIn:0,eventsOut:0});
                              const fc3 = v => v===0?"—":`$${(v/1000).toFixed(0)}k`;
                              const totalIn = t.mandatory+t.voluntary+t.grants+t.oaInt+t.saRaInt+t.maInt+t.eventsIn;
                              const totalOut = t.housOut+t.medOut+t.oaDraw+t.eduOut+t.lovedOut+t.cpfisOut+t.eventsOut;
                              const net = totalIn - totalOut;
                              return (
                                <tr style={{ borderTop: "2px solid var(--border-strong)", background: "var(--bg-panel)", fontWeight: 800 }}>
                                  <td style={{ padding: "7px 8px", textAlign: "center", color: "var(--text-bright)", fontSize: 9, position: "sticky", left: 0, zIndex: 5, background: "var(--bg-panel)", boxShadow: "var(--shadow-sticky)", fontWeight: 800 }}>TOTAL</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#34d399" }}>{fc3(t.mandatory)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#6ee7b7" }}>{fc3(t.voluntary)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#a78bfa" }}>{fc3(t.grants)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#60a5fa" }}>{fc3(t.oaInt)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#818cf8" }}>{fc3(t.saRaInt)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#c084fc" }}>{fc3(t.maInt)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 900, color: "#34d399", borderLeft: "1px solid var(--border-strong)" }}>{fc3(totalIn)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#f472b6" }}>{fc3(t.housOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#fb7185" }}>{fc3(t.medOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#f87171" }}>{fc3(t.oaDraw)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#fb923c" }}>{fc3(t.eduOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#fca5a5" }}>{fc3(t.lovedOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#fb923c" }}>{fc3(t.cpfisOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#10b981", fontWeight: 900 }}>{fc3(t.eventsIn)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#a855f7", fontWeight: 900 }}>{fc3(t.eventsOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 900, color: "#f472b6", borderLeft: "1px solid var(--border-strong)" }}>{fc3(totalOut)}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 900, color: net>=0?"#34d399":"#f87171" }}>{net>=0?"+":"-"}{fc3(Math.abs(net))}</td>
                                </tr>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* ── PROJECTION TABLE ── */}
                {tableSubTab === "projection" && (<>
                {/* Data Table explanation — toggled by Show/Hide Guide button */}
                {showDataTableGuide && (
                <div style={{ marginBottom: 16, padding: "14px 18px", borderRadius: 14, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  <p style={{ fontWeight: 700, color: "var(--text-highlight)", marginBottom: 8, fontSize: 12 }}>📋 Data Table — Column Guide</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8, marginBottom: 8 }}>
                    {[
                      ["Age", "Year of life. Green row = your payout age (CPF LIFE begins).", "var(--text-muted)"],
                      ["OA", "Ordinary Account balance at year end. Earns 2.5% p.a.", "#93c5fd"],
                      ["MA", "MediSave Account balance. Earns 4% p.a. Capped at BHS.", "#6ee7b7"],
                      [is55Plus ? "RA" : "SA", "Special Account (pre-55) or Retirement Account (post-55). Earns 4% p.a.", "#34d399"],
                      ["Inflows (+)", "Total annual inflows that year: contributions + voluntary top-ups + grants.", "#6ee7b7"],
                      ["Outflows (−)", "Total annual outflows: housing loan and medical deductions.", "#f9a8d4"],
                      ["Bas/Std/Esc Pay", "Annual payout received under each LIFE plan. Shows '−' before payout age.", "#fb923c"],
                      ["Bas/Std/Esc Beq", "Bequest (death benefit) value at that age under each plan.", "var(--text-muted)"],
                      ["Yield (B/S/E)", "Cumulative total yield = all payouts received + current bequest value. Measures the total financial return of each plan.", "#60a5fa"],
                      ["XIRR", "Internal Rate of Return of the highlighted plan at each age. Compares total return vs all contributions made. Green = good (>4%), yellow = moderate, red = below CPF rates.", "#a78bfa"],
                    ].map(([col, desc, color]) => (
                      <div key={col} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 3 }}>{col}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "var(--text-subtle)" }}>
                    💡 <strong>Before payout age</strong>: Pay, Bequest, Yield, and XIRR columns show "−" — payouts haven't started yet. &nbsp;
                    The <strong>Lifetime Summary</strong> header above the table shows totals across your full life (age {inputs.currentAge} → 95). &nbsp;
                    Use <strong>Download CSV</strong> to export all columns to a spreadsheet.
                  </p>
                </div>
                )}
                {(() => {
                  const lastBase = displayAccumulation[displayAccumulation.length - 1] || {};
                  const lastRow = displayProjection[displayProjection.length - 1] || {};
                  const totalPayouts = displayProjection.filter(r => r.age >= payoutAge65).reduce((s, r) => s + (r[`${highlightPlan}Annual`] || 0), 0); // BUG-51 fix: use debounced payoutAge65
                  return (<div style={{ marginBottom: 16, background: "var(--bg-panel)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}><TableIcon style={{ width: 14, height: 14, color: "#34d399" }} />Lifetime Summary — <span style={{ color: "#34d399" }}>{highlightPlan.toUpperCase()}</span></h4>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Age {inputs.currentAge} → 95</span>
                    </div>
                    <div className="rg-6" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                      {[["Total Contributions", lastBase.cumulativeInjected, "#34d399"], ["Total Interest", lastBase.cumulativeInterest, "#60a5fa"], ["Total Outflows", lastBase.cumulativeOutflow, "#f472b6"], ["Total Payouts", totalPayouts, "#fb923c"], ["Final Bequest", lastRow[`${highlightPlan}Bequest`] || 0, "#fbbf24"], ["Net Worth @ 95", lastRow[`${highlightPlan}NetWorth`] || 0, "var(--text-bright)"]].map(([label, val, color]) => (
                        <div key={label} style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 10 }}>
                          <p style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.3 }}>{label}</p>
                          <p style={{ fontSize: 12, fontWeight: 900, color, fontFamily: "monospace" }}>{formatCurrency(val || 0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>);
                })()}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Year-by-year projection · <span style={{ color: "var(--text-bright)", fontWeight: 700 }}>{highlightPlan.toUpperCase()}</span> plan</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handlePrintTable} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "rgba(30,41,59,0.6)", color: "#94a3b8", border: "1px solid var(--border-strong)", cursor: "pointer" }}>
                      <Printer style={{ width: 11, height: 11 }} />Print
                    </button>
                    <button onClick={handleExportCSV} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer" }}>
                      <Download style={{ width: 11, height: 11 }} />Download CSV
                    </button>
                    <button onClick={() => {
                      // Build CSV and open in Google Sheets via import URL
                      try {
                        const rows = [["Age", "OA", "SA/RA", "MA", "Total CPF", "Inflows", "Outflows", "Std Payout", "Esc Payout", "Bas Payout", "Net Worth"], ...displayProjection.map(r => {
                          const base = accumulationByAge.get(r.age) || {};
                          const pa = Number(inputs.payoutAge) || 65;
                          return [r.age, Math.round(base.oa || 0), Math.round((base.sa || 0) + (base.ra || 0)), Math.round(base.ma || 0), Math.round((base.oa || 0) + (base.sa || 0) + (base.ma || 0) + (base.ra || 0)), Math.round(base.injected || 0), Math.round(base.outflow || 0), r.age >= pa ? Math.round(r.standardAnnual || 0) : "", r.age >= pa ? Math.round(r.escalatingAnnual || 0) : "", r.age >= pa ? Math.round(r.basicAnnual || 0) : "", Math.round(r[`${highlightPlan}NetWorth`] || 0)];
                        })];
                        const csv = rows.map(r => r.join(",")).join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = `https://docs.google.com/spreadsheets/d/create?usp=drive_web`;
                        a.target = "_blank";
                        a.click();
                        showToast("✓ Google Sheets opened — paste your CSV data there (or use Download CSV to import)");
                        URL.revokeObjectURL(url);
                      } catch (e) { showToast("Open Google Sheets manually and use File → Import to upload your CSV"); }
                    }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)", cursor: "pointer" }}>
                      <ExternalLink style={{ width: 11, height: 11 }} />Open in Sheets
                    </button>
                  </div>
                </div>
                <div className="cpf-table-scroll" style={{ overflowX: "auto", overflowY: "auto", maxHeight: 560, borderRadius: 16, background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, fontSize: 11, fontFamily: "monospace", tableLayout: "auto" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                        <tr style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border-strong)" }}>
                          {["Age", "OA", "MA", "SA/RA", "Inflows", "Outflows", ...((Number(inputs.wisAmount) || 0) > 0 ? ["WIS Cash"] : []), "Bas Pay", "Bas Beq", "Std Pay", "Std Beq", "Esc Pay", "Esc Beq", "Yield (B)", "Yield (S)", "Yield (E)", `XIRR (${highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)})`].map((h, i) => (
                            <th key={h} style={{
                              padding: "10px 8px", textAlign: i === 0 ? "left" : "right", fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: i >= 12 ? "#60a5fa" : "var(--text-muted)", whiteSpace: "nowrap",
                              ...(i === 0 ? { position: "sticky", left: 0, zIndex: 20, background: "var(--header-bg)", boxShadow: "var(--shadow-sticky)" } : {})
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayProjection.map(row => {
                          const baseRow = accumulationByAge.get(row.age) || {};
                          const raSaBal = (baseRow.sa || 0) + (row[`${highlightPlan}RA`] || 0);
                          const isPA = row.age >= payoutAge65;            // BUG-43 fix: use debounced payoutAge65
                          const isPayoutAge = row.age === payoutAge65;    // BUG-43 fix: use debounced payoutAge65
                          const rowBg = isPayoutAge ? "rgba(16,185,129,0.08)" : "transparent";
                          const c = (v, color = "var(--text-bright)") => <td style={{ padding: "7px 8px", textAlign: "right", color, whiteSpace: "nowrap" }}>{v != null ? formatCurrency(v) : "-"}</td>;
                          return (<tr key={row.age} style={{ borderBottom: "1px solid var(--border-subtle)", background: rowBg }}>
                            <td style={{ padding: "7px 8px", fontWeight: 700, color: isPayoutAge ? "#34d399" : "var(--text-muted)", fontFamily: "system-ui", position: "sticky", left: 0, zIndex: 5, background: isPayoutAge ? "rgba(16,185,129,0.12)" : "var(--bg-panel)", boxShadow: "var(--shadow-sticky)", whiteSpace: "nowrap" }}>{row.age}</td>
                            {c(baseRow.oa)}
                            {c(baseRow.ma)}
                            {c(raSaBal, "#34d399")}
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "#6ee7b7", whiteSpace: "nowrap" }}>+{formatCurrency(baseRow.injected || 0)}</td>
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "#f9a8d4", whiteSpace: "nowrap" }}>-{formatCurrency(baseRow.outflow || 0)}</td>
                            {(Number(inputs.wisAmount) || 0) > 0 && (
                              <td style={{ padding: "7px 8px", textAlign: "right", color: "#fde68a", whiteSpace: "nowrap" }}>
                                {/* BUG-44 fix: use engine's yearWisCash so wisFreq/wisDur inactive years show $0 */}
                                +{formatCurrency(accumulationByAge.get(row.age)?.yearWisCash ?? 0)}
                              </td>
                            )}
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "#fb923c", whiteSpace: "nowrap" }}>{isPA ? formatCurrency(row.basicAnnual) : "-"}</td>
                            {c(row.basicBequest, "#fb923c")}
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-bright)", whiteSpace: "nowrap" }}>{isPA ? formatCurrency(row.standardAnnual) : "-"}</td>
                            {c(row.standardBequest)}
                            <td style={{ padding: "7px 8px", textAlign: "right", color: "#34d399", whiteSpace: "nowrap" }}>{isPA ? formatCurrency(row.escalatingAnnual) : "-"}</td>
                            {c(row.escalatingBequest, "#34d399")}
                            {c(row.basicTotal, "#fb923c")}
                            {c(row.standardTotal, "#94a3b8")}
                            {c(row.escalatingTotal, "#34d399")}
                            {(() => {
                              const pa = payoutAge65; // BUG-43 fix: use debounced payoutAge65
                              if (row.age < pa) return <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap" }}>-</td>;
                              if (row.age < pa + 3) return <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: 9 }}>settling...</td>;
                              const xirr = xirrByAge[highlightPlan]?.[row.age];
                              if (xirr == null) return <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap" }}>—</td>;
                              const irrColor = xirr > 4 ? "#34d399" : xirr > 2 ? "#fbbf24" : "#f87171";
                              // Sparkline: map xirr -10% to +10% to 0–100% bar width
                              const barPct = Math.max(0, Math.min(100, ((xirr + 10) / 20) * 100));
                              return (
                                <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }} title={`XIRR at age ${row.age}: ${xirr.toFixed(2)}%`}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                    <div style={{ width: 48, height: 6, background: "var(--bg-muted)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                                      <div style={{ width: `${barPct}%`, height: "100%", background: irrColor, borderRadius: 3, transition: "width 0.3s" }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: irrColor, fontFamily: "monospace", minWidth: 38, textAlign: "right" }}>{xirr.toFixed(2)}%</span>
                                  </div>
                                </td>
                              );
                            })()}
                          </tr>);
                        })}
                      </tbody>
                    </table>
                </div>
                </>)}
              </div>
            )}
            {/* ── DOCS TAB ── */}
            {activeTab === "notes" && (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 28, borderRadius: 24 }}>
                {/* Sticky wrapper: title + anchor nav scroll together as one bar */}
                <div style={{ position: "sticky", top: -20, zIndex: 20, background: "var(--bg-panel)", backdropFilter: "blur(8px)", marginLeft: -28, marginRight: -28, marginTop: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 24, paddingBottom: 16, borderBottom: "1px solid var(--border-subtle)", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}><BookOpen style={{ width: 22, height: 22, color: "#34d399" }} />User Guide & Financial Analysis</h3>
                  {/* Anchor navigation */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 10 }}>
                  {[
                    ["#doc-guide", "📖 User Guide"],
                    ["#doc-engine", "⚙️ Projection Engine"],
                    ["#doc-policy", "🛡 Policy Reference"],
                    ["#doc-planning", "🎯 Planning Tools"],
                    ["#doc-srs", "💳 SRS"],
                    ["#doc-propmon", "🏠 Property Monetisation"],
                    ["#doc-dwz", "⏳ Die with Zero"],
                    ["#doc-sep", "💼 SEP Rules"],
                    ["#doc-yield", "📈 Yield & XIRR"],
                    ["#doc-montecarlo", "🎲 Monte Carlo"],
                    ["#doc-minor", "👶 Minor & PwD"],
                    ["#doc-eduloan", "🎓 Education Loan"],
                    ["#doc-rsgrowth", "📈 RS Growth Rate"],
                    ["#doc-phasedsalary", "💼 Phased Salary"],
                    ["#doc-lifeevents", "⚡ Life Events"],
                  ].map(([href, label]) => (
                    <a key={href} href={href} style={{ display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "var(--bg-input)", color: "var(--text-highlight)", border: "1px solid var(--border-strong)", textDecoration: "none", cursor: "pointer" }}
                      onClick={e => { e.preventDefault(); document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                      {label}
                    </a>
                  ))}
                  </div>
                </div>{/* end sticky wrapper */}
                <div style={{ display: "flex", flexDirection: "column", gap: 32, fontSize: 13, lineHeight: 1.7, color: "var(--text-muted)" }}>

                  {/* User Guide */}
                  <section id="doc-guide" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><LayoutDashboard style={{ width: 18, height: 18 }} />Step-by-Step User Guide</h4>
                    {[
                      ["1", "Setup Your Profile", "#60a5fa", "rgba(59,130,246,0.08)", "rgba(59,130,246,0.2)", "Enter your current OA, SA, and MA balances. Select Male/Female (affects CPF LIFE payout ratio). Select SC or PR — PR members select their tenure year (1 / 2 / 3+) and rate type (G/G default or F/G). The engine automatically advances Yr 1 → Yr 2 → Yr 3+ rates each projection year. Progress bars compare balances against the 2026 FRS ($220,400), ERS ($440,800), and BHS ($79,000) milestones."],
                      ["2", "Auto-Calc Contributions (SC / PR / SEP)", "#10b981", "rgba(16,185,129,0.08)", "rgba(16,185,129,0.2)", "Enter OW (Monthly Gross), AW (Annual Bonus), and Salary Growth %, then click ⚡ Auto-Calc. SC uses full rates. PR G/G: graduated employer — no application needed. PR F/G: full employer 17%, employee pays graduated rate — requires joint CPF application. OW ceiling $8,000/mo, AW ceiling $102,000/yr. SEP members use the Inflows (VC3A) panel. Important: if citizenship is PR (Year 1 or 2) and Monthly Gross is left at $0, a validation warning will appear — the engine derives PR contributions from salary so gross pay must be entered before Auto-Calc can apply the correct rates."],
                      ["3", "Add Voluntary Top-Ups & CPF Transfers", "#a855f7", "rgba(168,85,247,0.08)", "rgba(168,85,247,0.2)", "Every inflow and outflow field has a Recurring / One-Time frequency toggle — use One-Time for lump sums that only apply in the first projection year. RSTU tops up SA (pre-55) or RA (post-55). CPF Transfers support For Self (internal move with FRS/ERS cap) and For Loved One (OA outflow only). CPFIS: OA above $20k and SA above $40k are investible separately with their own frequency toggles."],
                      ["4", "Compare CPF LIFE Plans", "#fbbf24", "rgba(245,158,11,0.08)", "rgba(245,158,11,0.2)", "Open the LIFE Comparison tab to evaluate Standard, Escalating, and Basic plans. Vertical lines explicitly mark age intersections for total yield and payouts. Toggle between Bequest and Cumulative Payout views."],
                      ["5", "Save Scenarios & Compare", "#fb923c", "rgba(249,115,22,0.08)", "rgba(249,115,22,0.2)", "Go to the Compare tab. Save your current inputs as Scenario A, adjust parameters (e.g. delay payout age to 70), then save as Scenario B for a colour-coded side-by-side diff."],
                      ["6", "Share & Export", "#f43f5e", "rgba(244,63,94,0.08)", "rgba(244,63,94,0.2)", "Use Share to encode your entire profile into a URL. Download a PDF report or CSV. On mobile, all actions (Share, PDF, Export, Import, Samples, Reset) are in the ☰ hamburger menu. Keyboard shortcuts: Ctrl+S (Share), Ctrl+Shift+R (Reset), Ctrl+]/[ (switch tabs)."],
                      ["7", "Load a Sample Profile", "#0ea5e9", "rgba(14,165,233,0.08)", "rgba(14,165,233,0.2)", "Click Samples in the header (desktop) or ☰ hamburger menu (mobile) to choose from 7 pre-built scenarios: Blank Slate, Typical Employee (35), Late Starter (50), Self-Employed (40), High Earner (40), Near Retirement (54), and Post-55 RA Builder (57). Loading a sample overwrites current inputs — export your profile first."],
                      ["8", "Annual Cashflow Ledger", "#2dd4bf", "rgba(45,212,191,0.08)", "rgba(45,212,191,0.2)", "In the Data Table tab, switch to the Cashflow Ledger sub-tab for a complete year-by-year breakdown of every flow: mandatory contributions, voluntary top-ups, gov grants/WIS, OA/SA-RA/MA interest, housing outflow, medical, OA drawdown, loved-one transfers, and CPFIS — with a column totals row at the bottom. Download as CSV."],
                    ].map(([num, title, color, bg, border, text]) => (
                      <div key={num} style={{ background: "var(--bg-muted)", borderRadius: 14, border: "1px solid var(--border-strong)", overflow: "hidden", marginBottom: 12 }}>
                        <div style={{ background: bg, borderBottom: `1px solid ${border}`, borderLeft: `4px solid ${color}`, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 24, height: 24, borderRadius: "50%", background: bg, border: `1px solid ${border}`, color, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
                          <h5 style={{ fontWeight: 700, color, fontSize: 14 }}>{title}</h5>
                        </div>
                        <div style={{ padding: "14px 18px", fontSize: 12, color: "var(--text-muted)" }}>{text}</div>
                      </div>
                    ))}
                  </section>

                  {/* ── Projection Engine ── */}
                  <section id="doc-engine" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#34d399", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Activity style={{ width: 18, height: 18 }} />Projection Engine — How the Numbers Are Computed</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Annual Loop Model:</strong> The engine runs one iteration per year of life, from your current age to age 95. Each iteration applies inflows, outflows, transfers, interest, and growth in a fixed sequence. This is a standard annual actuarial approximation — CPF Board's own simplified calculators use the same approach. A full monthly model (12× iterations, lowest-monthly-balance tracking) would be 12× slower with minimal practical difference for multi-decade projections.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Mid-Year (June) Interest Convention:</strong> Interest is computed on the <em>average</em> of the opening balance (before any inflows or outflows) and the closing balance (after all inflows and outflows). Formula: <code>Interest = ((Opening + Closing) / 2) × Annual Rate</code>. This gives each inflow approximately 6 months of interest and each outflow approximately 6 months of lost interest — matching the June actuarial mid-year convention and closely approximating CPF's actual rule (contributions earn from the month after receipt, withdrawals lose interest from the month they occur).</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Interest Rates & Bonus Tiers:</strong> OA: 2.5%/yr. SA, RA, MA: 4%/yr. <strong>Bonus tiers (also on average balance):</strong> +1% on the first $60,000 combined (OA capped at $20k). Members aged 55+: additional +1% on the first $30,000 of RA (priority), then SA+MA, then OA (up to $20k). These bonus tiers are computed on average balances using the same mid-year convention.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Recurring vs One-Time Frequency:</strong> Each inflow and outflow field has a Recurring / One-Time toggle. <strong>Recurring</strong> (stored as <code>'annual'</code> internally): the amount is applied every projection year until the relevant stop age. <strong>One-Time</strong>: the amount is applied only in the first year of the projection (the year you are currently at). Use One-Time for lump-sum top-ups, one-off withdrawals, or events that happen just once. The engine checks <code>isFirstYear</code> — if false and the field is One-Time, the effective amount is zeroed out for that year.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>PR Tier Auto-Advancement:</strong> When citizenship is set to PR and tenure year is 1 or 2, the engine automatically advances the rate tier each projection year: Year 1 → Year 2 → Year 3+ (full rates). The <code>currentPrYear</code> counter increments at the end of each loop iteration and is capped at 3. Auto-Calc fills the Year 1 (or Year 2) contributions into the mandatory fields; the engine then advances automatically without further input.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f472b6", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>CPFIS Engine Enforcement:</strong> OA CPFIS: only OA above $20,000 is investible each year — engine caps to <code>Max(0, OA − $20,000)</code>. SA CPFIS: only SA above $40,000 is investible, and only before age 55 — SA CPFIS is silently skipped after 55 (SA is closed). Both deductions are accumulated into the annual Cashflow Ledger under "CPFIS Out." Investment returns on CPFIS funds are <strong>not modelled</strong> — only the outflow from CPF is applied.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MRSS Engine Enforcement:</strong> The engine enforces all MRSS eligibility conditions automatically: <strong>SC only</strong> (PR members receive $0 regardless of input); <strong>age 55+</strong>; <strong>RA must be below the current-year BRS</strong> (inflation-adjusted at 3%/yr from 2026); and a <strong>$20,000 lifetime cap</strong> tracked via a cumulative counter. Once the lifetime cap is reached, no further MRSS is credited even if you enter a non-zero amount. The income gate (≤ $4,000/mo) uses the same monthly income variable as MMSS — for employees this is the OW-based gross; for SEPs it is NTI ÷ 12. The app validates these constraints in real time and shows warnings at the input field.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MMSS Engine Enforcement:</strong> SC only; age 55–70; MA must be below half of BHS (inflation-adjusted). All three conditions are checked per year — if MA rises above the half-BHS threshold in a later year (e.g. due to MA top-ups), MMSS stops being credited automatically. The engine never applies MMSS outside the 55–70 age window.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Salary Growth:</strong> The engine applies compound salary growth (<code>gf = (1 + rate)^yearsElapsed</code>) to mandatory contributions and to PR-rate-derived contributions each year. The salary growth multiplier is displayed in the PR Tier Progression table in the Auto-Calc breakdown. OW ceiling ($8,000/mo) is enforced after growth is applied.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>What Is Not Modelled:</strong> CPFIS investment returns (only the outflow is tracked). Full monthly compounding and lowest-monthly-balance interest (annual approximation used). CPF LIFE insurance pool internals (payouts are calculated from an actuarial ratio applied to RA at payout age). Tax implications of SRS withdrawals (50% taxable shown as a note only). Means-tested government assistance schemes other than WIS, MRSS, and MMSS.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* CPF Policy Reference */}
                  <section id="doc-policy" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#2dd4bf", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck style={{ width: 18, height: 18 }} />CPF 2026 Policy Reference</h4>

                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", marginBottom: 16, overflowX: "auto" }}>
                      <h5 style={{ fontWeight: 700, color: "#2dd4bf", marginBottom: 12 }}>CPF Contribution Rates by Age (From 1 Jan 2026)</h5>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-base)" }}>
                            <th style={{ padding: "8px", textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>Age Band</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "#60a5fa", borderBottom: "1px solid var(--border-strong)" }}>Total</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "var(--text-highlight)", borderBottom: "1px solid var(--border-strong)" }}>Emp</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "var(--text-highlight)", borderBottom: "1px solid var(--border-strong)" }}>Employer</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "#34d399", borderBottom: "1px solid var(--border-strong)" }}>OA</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "#a855f7", borderBottom: "1px solid var(--border-strong)" }}>SA</th>
                            <th style={{ padding: "8px", textAlign: "center", color: "#f472b6", borderBottom: "1px solid var(--border-strong)" }}>MA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["≤ 35", "37%", "20%", "17%", "23%", "6%", "8%"],
                            ["36 – 45", "37%", "20%", "17%", "21%", "7%", "9%"],
                            ["46 – 50", "37%", "20%", "17%", "19%", "8%", "10%"],
                            ["51 – 55", "37%", "20%", "17%", "15%", "11.5%", "10.5%"],
                            ["56 – 60", "34%", "17%", "17%", "12%", "11.5%", "10.5%"],
                            ["61 – 65", "25%", "13%", "12%", "3.5%", "11%", "10.5%"],
                            ["66 – 70", "16.5%", "7.5%", "9%", "1%", "5%", "10.5%"],
                            ["> 70", "12.5%", "5%", "7.5%", "1%", "1%", "10.5%"]
                          ].map(([age, tot, e1, e2, oa, sa, ma], i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td style={{ padding: "8px", fontWeight: 700, color: "var(--text-highlight)" }}>{age}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "#60a5fa", fontWeight: 800 }}>{tot}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "var(--text-muted)" }}>{e1}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "var(--text-muted)" }}>{e2}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "#34d399" }}>{oa}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "#a855f7" }}>{sa}</td>
                              <td style={{ padding: "8px", textAlign: "center", color: "#f472b6" }}>{ma}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="docs-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)" }}>
                        <h5 style={{ fontWeight: 700, color: "#2dd4bf", marginBottom: 12 }}>2026 Retirement Sum Thresholds</h5>
                        {[["Basic Retirement Sum (BRS)", "$110,200", "Minimum RA at 55", "#fbbf24"], ["Full Retirement Sum (FRS)", "$220,400", "Standard RA target; 2× BRS", "#34d399"], ["Enhanced Retirement Sum (ERS)", "$440,800", "Maximum RA top-up; 4× BRS", "#60a5fa"], ["Basic Healthcare Sum (BHS)", "$79,000", "MA cap; excess flows to SA/RA", "#a78bfa"]].map(([label, val, note, color]) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                            <div><p style={{ color: "var(--text-highlight)", fontWeight: 600, fontSize: 12 }}>{label}</p><p style={{ color: "var(--text-muted)", fontSize: 10 }}>{note}</p></div>
                            <span style={{ color, fontWeight: 900, fontSize: 14, flexShrink: 0, marginLeft: 10 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)" }}>
                        <h5 style={{ fontWeight: 700, color: "#2dd4bf", marginBottom: 12 }}>CPF Interest Rates</h5>
                        {[["OA", "2.5% p.a.", "Guaranteed floor rate"], ["SA", "4.0% p.a.", "Long-term savings rate"], ["MA", "4.0% p.a.", "Same as SA"], ["RA", "4.0% p.a.", "Retirement Account after 55"], ["Extra (first $60k)", "+1.0% p.a.", "Combined balances; OA capped $20k"], ["Extra 55+ (first $30k)", "+1.0% p.a.", "Additional bonus for 55+ members"]].map(([label, val, note]) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                            <div><p style={{ color: "var(--text-highlight)", fontWeight: 600, fontSize: 12 }}>{label}</p><p style={{ color: "var(--text-muted)", fontSize: 10 }}>{note}</p></div>
                            <span style={{ color: "#34d399", fontWeight: 900, fontSize: 14, flexShrink: 0, marginLeft: 10 }}>{val}</span>
                          </div>
                        ))}
                        {/* Timing Assumption box */}
                        <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.2)", borderRadius: 8 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#2dd4bf", marginBottom: 6 }}>⏱ Computation Timing Assumption</p>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 4 }}>
                            This model uses an <strong style={{ color: "var(--text-bright)" }}>annual, beginning-of-year (BOY) convention</strong>:
                          </p>
                          <ul style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 14, lineHeight: 1.7, margin: 0 }}>
                            <li><strong style={{ color: "var(--text-bright)" }}>Step 1 — Transitions:</strong> Age-55 SA closure, pledge withdrawal, and OA withdrawal are applied at the start of the age-55 year, before contributions or interest.</li>
                            <li><strong style={{ color: "var(--text-bright)" }}>Step 2 — Contributions & inflows:</strong> All annual contributions (mandatory, VC3A, RSTU, grants, WIS) are credited at the start of each year.</li>
                            <li><strong style={{ color: "var(--text-bright)" }}>Step 3 — Interest:</strong> Interest is calculated on the <em>opening balance after contributions</em> for each account and credited for the full year.</li>
                            <li><strong style={{ color: "var(--text-bright)" }}>Step 4 — Outflows:</strong> Housing loan deductions and medical expenses are deducted after interest is applied.</li>
                            <li><strong style={{ color: "var(--text-bright)" }}>Step 5 — Record:</strong> End-of-year balances are recorded in the Data Table and charts.</li>
                          </ul>
                          <p style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 6 }}>In practice CPF credits interest monthly (OA) and annually (SA/MA/RA). This model simplifies to annual compounding, which is a standard actuarial approximation. The difference from monthly compounding is less than 0.2% per year.</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* New Planning Tools Policy Reference */}
                  <section id="doc-planning" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Target style={{ width: 18, height: 18 }} />Planning Tools — Policy Reference <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>(Assumptions)</span></h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Gender &amp; CPF LIFE Payout Ratio:</strong> Male members receive ~$540/mo per $100k RA at 65; female members ~$500/mo, reflecting longer female life expectancy. CPF LIFE payouts increase by up to 7% compound per year of deferral past 65 — approximately $37/mo per year for a $540 base, giving ~$730/mo at age 70. Select gender in the Profile section — the LIFE comparison cards highlight the selected gender and show both for reference.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>20% RA-to-OA Transfer:</strong> At payout age, CPF transfers 20% of the <em>eligible</em> RA to OA. Eligible RA = RA at payout − cumulative SA/RA cash top-ups (RSTU, gov grants, MRSS, MMSS, housing grants, all voluntary SA/RA top-ups) − cumulative interest earned on SA/RA. <strong>CPF LIFE payouts are calculated on the RA remaining after this transfer</strong> — the deducted 20% reduces the RA balance and lowers monthly payouts accordingly. The Summary tab shows all components.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>OA → SA / OA → RA Transfer:</strong> Before age 55: transfer OA savings to SA, capped at FRS. At age 55 and above: SA is closed; you may instead transfer OA savings to RA, capped at ERS ($440,800 in 2026). Both directions earn 4% instead of 2.5%. All transfers are irreversible. Not counted toward the Annual Limit. CPF-to-CPF transfers do NOT qualify for income tax relief — only voluntary cash top-ups under RSTU are tax-relievable. Available in the <strong>CPF Transfers panel</strong>.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>OA → MA Transfer:</strong> Transfer OA savings to MA to earn 4% instead of 2.5%, or to top up MA towards BHS. Subject to BHS cap. Irreversible. Available in the CPF Transfers panel.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f472b6", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>CPFIS — CPF Investment Scheme:</strong> Annual amounts moved from OA and/or SA into investments. OA: only savings <strong>above $20,000</strong> are investible (the first $20k must stay in OA). SA: only savings <strong>above $40,000</strong> are investible, and SA CPFIS is only available before age 55 (SA closes at 55). You can invest from both accounts simultaneously. Investment returns are <strong>not</strong> modelled — only the cash outflows from OA and SA are applied. Age 18+. Available in the Outflows panel.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>VC3A — Cash Only, Auto-Split:</strong> Voluntary Contribution to 3 Accounts is cash-only — you cannot split existing CPF balances across accounts via VC3A. Enter a single annual lump-sum in the Inflows panel; the engine automatically allocates it across OA/SA/MA using your age-band rates. Counts toward the $37,740 Annual Limit. <strong>No tax relief</strong> for employees. SEPs can use VC3A up to the full $37,740/yr.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>RSTU — Cash Top-ups and CPF Transfers:</strong> The Retirement Sum Topping-Up Scheme allows both (1) cash top-ups to SA/RA (tax-relievable up to $8,000/yr own + $8,000 for loved ones; capped at FRS for SA or ERS for RA) and (2) CPF OA→SA/RA transfers (no tax relief — CPF-to-CPF transfers do not qualify). Enter cash top-ups in the Inflows panel (RSTU field); enter CPF transfers in the CPF Transfers panel.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MMSS — Matched MediSave Scheme (1 Jan 2026 – 31 Dec 2030):</strong> A five-year pilot where the government matches voluntary cash MA top-ups dollar-for-dollar up to <strong>$1,000/year</strong>. Eligibility (assessed as at 31 Dec each year): Singapore Citizens aged 55–70, MA balance below half of BHS (~$39,500 in 2026), average monthly income ≤ $4,000, own no more than one property with AV ≤ $21,000. Pilot runs from 1 January 2026 to 31 December 2030 — the engine enforces both the 2026 start and 2030 end bounds. Matching grant is credited to MA at the <strong>beginning of the following year</strong> (e.g. top-ups made in 2026 are credited in January 2027). The engine models this one-year carry correctly. Cash top-ups attracting MMSS match are <strong>not eligible</strong> for income tax relief.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>WIS — Workfare Income Supplement:</strong> For employees: 60% of the WIS award goes to CPF accounts allocated via age-band rates (OA/SA/MA), and 40% is paid as cash (not modelled). For SEPs: 90% goes to MA (subject to BHS cap) and 10% cash. Enter your annual WIS award amount in the Inflows panel — only the CPF portion is applied.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>OA Lump-Sum Withdrawal at Age 55:</strong> After SA closure and RA funding, members may withdraw OA savings above BRS as cash. Applied once. Input in the <strong>Outflows panel</strong>. Note: this is for general OA cash-out — for Property Pledge withdrawals, use the separate <strong>Pledge RA Withdrawal</strong> fields (shown in Property & Timelines when pledge is ON).</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>OA Drawdown (Decumulation):</strong> After CPF LIFE starts, members may supplement monthly income by drawing down the OA balance. The engine deducts the monthly draw annually, respects the bequest floor (OA never falls below the floor), and shows the projected <strong>OA Exhaustion Age</strong>. A sustainability warning fires when the annual draw exceeds the annual OA interest (2.5%), meaning principal is being eroded. Use <strong>⚡ Fill Gap</strong> in the OA Drawdown panel to automatically calculate the draw amount needed to reach your Target Monthly Income (Target − CPF LIFE − SRS − Private Assets). OA drawdown does not affect RA or CPF LIFE payouts.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Property Pledge (BRS Mode):</strong> Use your property as security so only BRS ($110,200) needs to remain in RA at age 55. This makes you <em>eligible</em> to apply to CPF to withdraw RA savings above BRS as cash to your bank account — the pledged funds remain in RA (earning 4%) until the actual withdrawal is made. <strong>Important:</strong> Pledging does not automatically transfer funds to OA or anywhere else. To model the cash withdrawal in this tool, use the <strong>Pledge RA Withdrawal</strong> fields (Amount and Age) in the Outflows panel — these appear automatically when the Property Pledge toggle is ON. The funds are withdrawn directly from RA, not via OA. Property must be a completed Singapore property (HDB or private) with a remaining lease lasting to at least age 95. HDB 2-room Flexi flats and properties under the Lease Buyback Scheme are ineligible. If the property is sold, the pledged amount must be refunded to CPF. Monthly CPF LIFE payouts will be significantly lower (~$730–$790/mo vs ~$1,350–$1,450/mo at FRS) because less RA enters the LIFE pool.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Property CPF Refund on Sale:</strong> When you sell your HDB or private property, CPF Board requires you to refund the CPF Ordinary Account monies used for housing — including the principal withdrawn and the accrued interest at the OA rate of 2.5%/yr from the time of each withdrawal. The refund is credited back to your OA. If a Property Pledge was active (only BRS held in RA at 55), the refund first restores RA up to FRS; any surplus stays in OA. ERS top-up from OA is always optional. Model this using the <strong>Sell Property at Age</strong> field in Timelines &amp; Property.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MRSS — Matched Retirement Savings Scheme:</strong> Government matches RSTU cash top-ups to RA dollar-for-dollar up to $2,000/year (lifetime cap $20,000) for Singapore Citizens aged 55 and above (or any age if PwD is enabled) with RA below the Basic Retirement Sum (BRS) and monthly income ≤ $4,000. Automatically assessed — no application needed. <strong>No separate input required</strong>: the engine computes the MRSS match automatically each projection year based on your RSTU entry and eligibility conditions. An MRSS eligibility badge appears under the RSTU field in the Inflows panel showing the auto-credited amount. The $20,000 lifetime cap is tracked cumulatively across all projection years.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#38bdf8", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>AW Ceiling ($102,000/Year):</strong> AW Ceiling = $102,000 − Total Ordinary Wages subject to CPF for the year (not the CPF contributions themselves). E.g. if your annual OW subject to CPF is $96,000 ($8,000/mo × 12), the AW ceiling is $6,000. The Auto-Calc applies this correctly.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>CPF LIFE — Eligibility:</strong> CPF LIFE is available to <strong>Singapore Citizens and Permanent Residents</strong> born in <strong>1958 or after</strong>. Members with <strong>RA ≥ $60,000</strong> at their payout age are automatically enrolled; those below $60,000 may apply to join voluntarily. Payout start age is between 65 and 70 — deferring earns approximately <strong>+7% per year</strong> of additional monthly payout. Payouts are for life regardless of how long you live. This tool's projections assume CPF LIFE enrolment; members with very low RA balances may not qualify for auto-enrolment.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* SRS */}
                  <section id="doc-srs" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#0ea5e9", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><BookOpen style={{ width: 18, height: 18 }} />Supplementary Retirement Scheme (SRS)</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>What it is:</strong> SRS is a voluntary government-administered scheme that lets you save for retirement with immediate tax benefits. Contributions are deducted from your chargeable income in the year made — reducing your personal income tax bill.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Annual contribution cap:</strong> Singapore Citizens and PRs: <strong>$15,300/yr</strong>. Foreigners: <strong>$35,700/yr</strong>. Contributions are made to your SRS account at a participating bank (DBS, OCBC, UOB) and can be invested in stocks, ETFs, unit trusts, fixed deposits, and insurance products.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "#34d399" }}>Withdrawal rules:</strong> You can begin withdrawing from age 63 (statutory retirement age). <strong>Only 50% of each withdrawal is taxable</strong> — the other 50% is tax-free. All funds must be fully withdrawn within <strong>10 years</strong> of your first withdrawal; failure to do so triggers a 5% penalty on the undistributed balance, and the full amount becomes taxable.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Premature withdrawal:</strong> Withdrawing before age 63 incurs a <strong>5% penalty</strong> plus full taxation on the withdrawn amount. Exceptions apply for death, medical grounds, and bankruptcy.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How this tool models SRS:</strong> Enter your current SRS balance, annual contribution amount, the age you plan to stop contributing, your expected return rate (%), the age you plan to start withdrawing (min 63), and the drawdown window (1–10 years). The engine grows contributions at your chosen rate and divides the balance evenly over the drawdown window. The monthly draw appears in the Strategy tab income table. The Die with Zero panel uses the PMT formula on the SRS balance separately.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>SRS vs CPF SA/RA:</strong> SRS is more flexible (you can invest freely and withdraw early with penalty), but unlike CPF SA/RA it earns bank-rate interest if left uninvested (often 0.05% p.a.), so the onus is on you to invest the funds. The tax savings from contributions can be significant for high earners — at a 22% marginal rate, a $15,300 contribution saves ~$3,366 in tax annually.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Property Monetisation */}
                  <section id="doc-propmon" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#fb923c", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Home style={{ width: 18, height: 18 }} />Property Monetisation</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>What it covers:</strong> Three main approaches to unlocking value from your home in retirement: (1) <strong>Downgrading</strong> — sell your current home and buy a smaller/cheaper one, pocketing the difference as cash; (2) <strong>Lease Buyback Scheme (LBS)</strong> — sell a portion of your HDB flat's remaining lease back to HDB in exchange for a lump-sum annuity premium deposited into your CPF RA plus a cash bonus; (3) <strong>Silver Housing Bonus (SHB)</strong> — downgrade to a 3-room or smaller flat and receive a cash bonus plus a CPF RA top-up of up to $30,000.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "#34d399" }}>Net Cash Proceeds:</strong> Enter the amount that actually reaches your bank account <em>after</em> deducting the cost of your replacement home, CPF housing refund (principal + accrued interest), agent fees, and stamp duty. This sum is credited to your private assets in the projection and earns your chosen private growth rate from that point forward.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>RA Top-up Component:</strong> For LBS, the annuity premium HDB pays to your RA to fund the monthly LBS payout. For SHB, the CPF portion of the bonus (up to $30,000). Enter this amount in the RA Top-up field — it is credited directly to RA and increases your CPF LIFE payouts. For a standard open-market downgrade with no scheme, leave this at $0.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Monetisation Age:</strong> Set to the age at which the event occurs. The tool models this as a one-time event — property value is removed from your net worth at this age (if Sell Property at Age is also set) and the cash proceeds / RA top-up are applied in the same year. The Strategy tab income table shows the cash proceeds as a one-time income line.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How to use in this tool:</strong> Enable the toggle in the <strong>Property &amp; Timelines → Property Monetisation</strong> panel. Select the scheme type, set the age, enter Net Cash Proceeds and RA Top-up. The cash proceeds grow at your private asset growth rate from the monetisation age onward and appear as a supplemental income source in the Strategy tab.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Die with Zero */}
                  <section id="doc-dwz" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#f43f5e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Clock style={{ width: 18, height: 18 }} />Die with Zero Mode</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>The concept:</strong> Based on Bill Perkins' <em>Die with Zero</em> — the idea that unspent wealth at death is unlived life. Rather than preserving capital indefinitely, this mode computes the mathematically optimal monthly draw from each liquid asset so that all balances reach exactly $0 at your chosen target age. RA and CPF LIFE are excluded — they are governed by CPF Board rules and cannot be freely depleted.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "#34d399" }}>The PMT formula:</strong> For each liquid asset (OA, SRS, Private Assets), the tool solves for the fixed periodic payment that depletes the balance to $0 over the remaining years, factoring in the asset's interest/growth rate. The formula is: <strong>Monthly Draw = PV × r / (1 − (1+r)^−n) / 12</strong>, where PV = balance at drawdown start, r = annual rate, n = years to depletion. If r = 0, the draw is simply PV / (n × 12).</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>SRS constraint:</strong> IRAS requires full SRS withdrawal within 10 years of first withdrawal. If your Die with Zero target age exceeds the 10-year SRS window, a warning is shown and the SRS draw is calculated over the 10-year window regardless.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MA cannot be depleted:</strong> MediSave Account funds are ring-fenced by CPF Board for approved medical expenses, MediShield Life premiums, and CareShield Life premiums. They cannot be freely drawn down and are not included in the Die with Zero calculation.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5e9", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How to use:</strong> Toggle <strong>Die with Zero</strong> in the <strong>Decumulation &amp; Goals</strong> panel. Set your target depletion age (e.g. 85 or 90). The OA draw is computed via PMT annuity formula and <strong>auto-applied to the projection immediately</strong> — no extra button press required. The panel shows the computed monthly draws per asset (OA, SRS, Private, CPF LIFE) and a green ✓ badge confirms the draw is active. The OA Drawdown sidebar dims and locks while Die with Zero is ON.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Self-Employed Policy */}
                  <section id="doc-sep" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#fb923c", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Briefcase style={{ width: 18, height: 18 }} />Self-Employed Person (SEP) — VC3A Rules</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>No Mandatory OA/SA Contributions:</strong> SEPs are not required to contribute to OA or SA. Only MA contributions are compulsory if net trade income exceeds $6,000/year (at the employee rate).</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>VC3A Annual Limit — $37,740:</strong> SEPs may voluntarily contribute up to $37,740/year (the CPF Annual Limit) into their CPF accounts. This is the same as the total mandatory + voluntary ceiling for employees.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "#34d399" }}>Proportional Allocation (CPF Board Policy):</strong> Per CPF Board: <em>"The allocation of VC to the three CPF accounts will follow the allocation rates for mandatory CPF contributions."</em> VC3A funds are split across OA/SA/MA using the same <strong>age-based ratios</strong> as mandatory contributions (e.g. age ≤35: OA 62.2%, SA 16.2%, MA 21.6% of total). MA excess above BHS spills to SA (if &lt;55) or RA (if ≥55), but only up to the Full Retirement Sum (FRS). Once SA/RA hits the FRS, any remaining MA excess flows to OA. This is NOT a waterfall to MA first.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Tax Relief:</strong> VC3A contributions qualify for tax relief under the CPF Relief for Self-Employed scheme, subject to the prevailing income tax rules.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How to Use in This Tool:</strong> Toggle <strong>SEP?</strong> in the Mandatory Contribs panel. Mandatory OA/SA inputs are hidden. Enter your desired annual VC3A amount in the Voluntary Top-ups panel — the engine splits funds proportionally across OA/SA/MA using your age-band allocation rates (same ratios as mandatory contributions). MA excess above BHS spills to SA/RA. For members aged 55+, SA is permanently closed — VC3A contributions that would go to SA are routed to RA instead, up to the Full Retirement Sum (FRS); once FRS is met, excess flows to OA.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Monte Carlo + Actuarial Math */}
                  <section id="doc-montecarlo" style={{ scrollMarginTop: "160px" }}>
                    {/* ── Monte Carlo ── */}
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Activity style={{ width: 18, height: 18 }} />Monte Carlo Simulation</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>What it does:</strong> Monte Carlo runs your entire retirement projection <strong style={{ color: "var(--text-bright)" }}>200 times</strong> in parallel. Each run uses the same inputs you entered, but CPF interest rates are randomly varied each year by a user-selectable band. This produces a realistic spread of outcomes rather than a single deterministic line.</p>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>How to enable:</strong> Go to the <strong>Accumulation</strong> tab and click the <strong>Show Monte Carlo (200 runs)</strong> button. A purple shaded band appears on the chart alongside three overlay lines.</p>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>Variance presets:</strong> Three preset buttons appear below the Monte Carlo toggle — <strong style={{ color: "#60a5fa" }}>Mild ±0.5%</strong> (stable rate environment), <strong style={{ color: "#a78bfa" }}>Base ±1%</strong> (default, moderate uncertainty), and <strong style={{ color: "#f87171" }}>Stress ±2%</strong> (volatile rates). The active preset is displayed on the Probability of Sufficiency badge (e.g. "±1% rate variance"). Under Base, OA could earn 1.5%–3.5% and SA/RA/MA could earn 3%–5% in any given year.</p>
                      <p style={{ marginBottom: 12 }}><strong style={{ color: "var(--text-highlight)" }}>Reading the band:</strong></p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                        {[
                          ["P90 — Optimistic", "Top edge of the purple band. 90% of simulations fell below this value — only 10% of runs produced an outcome this good or better. Treat as a best-case ceiling.", "#a78bfa"],
                          ["P50 — Median (dashed)", "The dashed purple line running through the band. Half of all 200 runs landed above this, half below. This is the most likely single-number outcome under rate uncertainty.", "#c4b5fd"],
                          ["P10 — Pessimistic", "Bottom edge of the band. 90% of simulations did better than this. Only 1 in 10 runs produced an outcome this low. Treat as a stress-test floor.", "#7c3aed"],
                        ].map(([title, desc, color]) => (
                          <div key={title} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(124,58,237,0.07)", border: `1px solid ${color}55` }}>
                            <p style={{ fontWeight: 700, color, marginBottom: 6, fontSize: 11 }}>{title}</p>
                            <p style={{ fontSize: 11, lineHeight: 1.5 }}>{desc}</p>
                          </div>
                        ))}
                      </div>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>Probability of Sufficiency:</strong> Shown as a large percentage badge when Monte Carlo is active. It answers: <em>"What share of my 200 simulated futures reached the projected FRS by payout age?"</em> A result of <strong style={{ color: "#34d399" }}>80%+</strong> suggests a robust plan. Below <strong style={{ color: "#f87171" }}>50%</strong> means more than half your simulated futures fell short — consider increasing top-ups or deferring payout age.</p>
                      <p style={{ marginBottom: 0 }}><strong style={{ color: "var(--text-highlight)" }}>Limitations:</strong> Only CPF interest rates are randomised. Salary growth, contribution amounts, housing outflows, and SRS returns remain fixed at your inputs. Monte Carlo here measures <em>rate risk only</em> — it does not model job loss, medical crises, or policy changes. For those scenarios, use the What-If Explorer in the Summary tab.</p>
                    </div>

                    {/* ── Actuarial Math (kept here — content still relevant to CPF LIFE analysis) ── */}
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: "#fb923c", marginBottom: 10, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}><PieChart style={{ width: 16, height: 16 }} />Actuarial Math & Depletion Models</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Age-Adjusted Actuarial Ratio:</strong> This engine uses ~$540 per $100k RA at age 65, scaling by 7% compound per year of deferral — approximately $730/mo at age 70. Correctly applies CPF Board deferral credit. Correctly applies deferral credit without double-counting standard interest.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Standard & Escalating (Full Premium):</strong> 100% of your RA deducted. Bequest tracked as <code>Premium - Payouts</code>. Pool absorbs the 4% interest.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "#fb923c" }}>Basic Plan (The Slow-Draw):</strong> A premium is deducted from RA and paid into CPF's insurance pool. <strong>Note: The Basic Plan premium % is not user-configurable</strong> — it is set by CPF Board actuaries based on your age and gender to fund the mortality pool from age 90. It typically lands between 10% and 20%. The slider in this tool is an approximation aid only. You retain the remainder in your personal RA earning 4%. The monthly payout equals the PMT from the standard annuity formula — this is also the rate at which your personal RA depletes to $0 around age 90. <strong>Bequest Phase 1 (before age 90)</strong> = remaining personal RA balance <em>plus</em> a full refund of the CPF LIFE premium. <strong>Bequest Phase 2 (age 90+)</strong> = unused pool premium after deducting all payouts funded from the pool since age 90. Higher premium % → larger pool, smaller retained RA, lower Phase 1 payout.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Bonus Interest Cascading:</strong> +1% on first $60k combined (OA capped $20k), plus extra +1% on first $30k for 55+. Early contributions compound dramatically over decades.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Minor Members & PwD */}
                  <section id="doc-minor" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#34d399", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Users style={{ width: 18, height: 18 }} />Minor Members &amp; Person with Disabilities (PwD)</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Under 16 — Parent/Guardian Managed:</strong> CPF accounts for members under 16 are administered by a parent or guardian. Cash top-ups to SA and MA (VC3A, RSTU, VCMA), and OA→SA/RA transfers are supported. CPF nominations require age 16+. CPFIS requires age 18+. The app locks cash top-up fields and shows a field-level note when current age is below 16.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Age 16–17 — Nominations Available, CPFIS Locked:</strong> Members aged 16 and above may make a CPF nomination to direct their CPF savings to nominees on death. CPFIS remains locked until age 18. The sidebar shows an info note in this age range, and the CPFIS field is disabled.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>MRSS PwD Bypass (age &lt; 55):</strong> The Matched Retirement Savings Scheme (MRSS) normally requires age 55+. Members certified as a Person with Disabilities (PwD) by an approved medical professional are exempt from this age requirement and may receive MRSS matching at any age, subject to all other eligibility criteria (SC only, RA/OA+SA below BRS, income ≤ $4,000/mo, lifetime cap $20,000). Enable the <strong>PwD toggle</strong> in the Profile section. The MRSS match badge under RSTU will reflect eligibility automatically.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Engine Enforcement Summary:</strong> VC3A/RSTU/VCMA cash top-ups blocked below age 16. CPFIS OA and SA blocked below age 18. MRSS blocked below age 55 unless PwD flag is set. MMSS enforced to age 55–70 window and 2030 pilot end. All gates apply automatically — no manual overrides needed.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Education Loan */}
                  <section id="doc-eduloan" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#818cf8", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><BookOpen style={{ width: 18, height: 18 }} />OA Education Loan Scheme</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>What It Is:</strong> The CPF Education Loan Scheme allows you (or an immediate family member) to use OA savings to pay subsidised tuition fees at approved local institutions — NUS, NTU, SMU, SIT, SUTD, SUSS, polytechnics, LASALLE, and NAFA. The loan accrues 2.5%/yr interest from the date of each withdrawal.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Withdrawal Limit:</strong> Maximum 40% of accumulated OA savings (current balance plus any OA amounts previously used for education or investment, excluding housing). The app enforces this cap and shows a validation warning if the entered amount exceeds it.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Age 55+ Rule:</strong> Members aged 55 and above must first set aside the Full Retirement Sum (FRS) in their RA before any OA education withdrawal is permitted. The engine enforces this automatically.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Repayment — Not Modelled:</strong> In reality, the graduate must repay the loan in cash within 12 years of graduation, starting 1 year after. The app models the withdrawal as a pure OA outflow only — repayments back to OA are not projected. This produces a conservative (lower) OA trajectory. Plan accordingly.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How to Use:</strong> Enter the annual loan amount in the <strong>OA Education Loan</strong> field in the Outflows section. Use the frequency toggle to select Recurring (e.g. annual draw over a 3-year course) or One-Time (single lump-sum).</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* ── Retirement Sum Growth ── */}
                  <section id="doc-rsgrowth" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#34d399", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><TrendingUp style={{ width: 18, height: 18 }} />Retirement Sum Growth Rate</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>What it controls:</strong> Every year CPF Board typically raises the Full Retirement Sum (FRS), Basic Retirement Sum (BRS), Enhanced Retirement Sum (ERS), and Basic Healthcare Sum (BHS) by approximately 3%. This field lets you override that assumption — raising it makes future targets harder to reach; lowering it makes them easier. The change cascades through all projection years: contribution stop checks, CPFIS investible limits, MRSS BRS eligibility, and the accumulation chart lines all use this rate.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Where to find it:</strong> Salary section of the left panel, below Salary Growth Rate. Preset buttons: <strong>2%</strong> (conservative), <strong>3%</strong> (base / CPF Board historical average), <strong>4%</strong> (optimistic / inflation-driven). Valid range: 0–10%. Values above 6% show an advisory warning.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Practical use:</strong> Run the same profile at 2%, 3%, and 4% to bracket your FRS target uncertainty. A member who comfortably hits FRS at 3% but misses at 4% should consider increasing top-ups or deferring payout age to build in a buffer.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* ── Phased Salary & Career Break ── */}
                  <section id="doc-phasedsalary" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#fb923c", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Briefcase style={{ width: 18, height: 18 }} />Phased Salary &amp; Career Break</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fb923c", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Phase 2 Salary Growth:</strong> Enter a <strong>Phase 2 Start Age</strong> and a <strong>Phase 2 Growth %</strong> in the Salary section. Before that age, contributions compound at Phase 1 growth rate (Salary Growth %). From that age onward, they compound at Phase 2 rate. Example: 4%/yr to age 45 then 1%/yr models a mid-career plateau. Setting Phase 2 rate to 0% models a frozen salary from that age.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Career Break:</strong> Enter a <strong>Break Start Age</strong> and <strong>Break End Age</strong>. During those years (inclusive), the salary growth factor drops to zero — mandatory contributions pause entirely, as if salary is $0. This models sabbaticals, full-time caregiving, national service commitments, or parental leave. Both OA/SA/MA mandatory contributions and the employer component are paused.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Stacking:</strong> Phase 2 and Career Break can be used together. Example: Phase 2 starts at 40 (1%/yr), Career Break at 43–45 (contributions paused), then Phase 2 resumes at 46. The engine handles all three periods correctly using the same compounding formula as the base salary growth.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Auto-Calc note:</strong> The ⚡ Auto-Calc button computes Year 1 contributions only, using Phase 1 rates. It does not attempt to preview Phase 2 or break years — those are modelled automatically in the projection engine. An advisory note appears in the Auto-Calc panel when Phase 2 or a Career Break is active.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* ── Life Events / Stress Testing ── */}
                  <section id="doc-lifeevents" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#ef4444", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Activity style={{ width: 18, height: 18 }} />Life Events &amp; Stress Testing</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
                      <p style={{ marginBottom: 12 }}>The Life Events panel (between Timelines and Decumulation in the left sidebar) lets you overlay named stress-test scenarios onto your projection. Events are processed by the engine each year and appear as coloured markers on the Accumulation chart and a dedicated row in the Strategy Gantt timeline.</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                        {Object.entries(LIFE_EVENT_TYPES).map(([key, meta]) => (
                          <div key={key} style={{ padding: "12px 14px", borderRadius: 10, background: `${meta.color}0d`, border: `1px solid ${meta.color}33` }}>
                            <p style={{ fontWeight: 700, color: meta.color, marginBottom: 6, fontSize: 11 }}>{meta.icon} {meta.label}</p>
                            <p style={{ fontSize: 11, lineHeight: 1.5 }}>{meta.description}</p>
                          </div>
                        ))}
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>How to add an event:</strong> Open the Life Events panel, click <strong>+ Add Life Event</strong>, select a type, fill in the label, age range, and magnitude, then click <strong>Save Event</strong>. The projection updates immediately. Use the ON/OFF toggle on each event to compare your plan with and without it — or use Disable All to see your baseline.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Medical Crisis — Draw Source:</strong> Choose where the annual cost is drawn from: <em>OA only</em> (debits CPF OA each year), <em>Private only</em> (debits private assets), or <em>OA → Private</em> (default: OA first, remainder from private assets if OA is exhausted). This appears in the <strong>Events Out</strong> column of the Cashflow Ledger.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Windfall — Destination:</strong> Choose where a one-off inflow lands: <em>Private Assets</em> (full amount goes to private investment account), <em>OA</em> (credited to CPF OA, capped at remaining Annual Limit headroom), or <em>SRS</em> (credited to SRS balance, capped at the annual SRS contribution cap). This appears in the <strong>Events In</strong> column of the Cashflow Ledger.</div>
                        </li>
                        <li style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#eab308", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Hyperinflation:</strong> The magnitude sets an alternative annual inflation rate (%) active during the event age range. This overrides the global Inflation Rate for purchasing-power calculations in those years — useful for stress-testing a supply shock or stagflation scenario on your real retirement income.</div>
                        </li>
                        <li style={{ display: "flex", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", marginTop: 6, flexShrink: 0 }} />
                          <div><strong style={{ color: "var(--text-highlight)" }}>Chart markers:</strong> When the <strong>Show Events</strong> button is active on the Accumulation chart, point events (Windfall, Early Retirement) appear as labelled dashed vertical lines; range events appear as translucent shaded bands in the event's colour. The Strategy Gantt shows all enabled events as a single Life Events row with icon-labelled blocks or dots.</div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Yield Math */}
                  <section id="doc-yield" style={{ scrollMarginTop: "160px" }}>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Scale style={{ width: 18, height: 18 }} />Yield Intersections & "The Flatline"</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
                      <p><strong style={{ color: "var(--text-highlight)" }}>The Flatline:</strong> Total Yield = Payouts Received + Remaining Bequest. Since Bequest = Initial Premium − Payouts, the formula nets out to exactly your Initial Premium. Total Yield flatlines until your Bequest hits $0 (~late 70s), then every payout becomes "pure profit" drawn from the mortality pool.</p>
                    </div>
                    <div className="yield-cards-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        ["Standard vs. Escalating", "Escalating starts ~20% lower but grows 2%/yr. Takes decades for cumulative total yield to catch up. Break-Even Age shows when Escalating surpasses Standard.", intersectionEscVsStd, "#fbbf24", "rgba(245,158,11,0.08)", "rgba(245,158,11,0.3)"],
                        ["Standard vs. Basic", "In early retirement, Basic yields more total value because the 90% retained RA earns compound interest into your bequest. Once Basic RA depletes at 90, Standard overtakes.", intersectionStdVsBasic, "#60a5fa", "rgba(59,130,246,0.08)", "rgba(59,130,246,0.3)"],
                        ["Escalating vs. Basic", "Basic's high early bequest makes it lead initially, but Escalating's 2% annual growth compounds fastest over the extreme long term, eventually surpassing Basic.", intersectionEscVsBasic, "#c084fc", "rgba(168,85,247,0.08)", "rgba(168,85,247,0.3)"]
                      ].map(([title, desc, age, color, bg, border]) => (
                        <div key={title} style={{ background: bg, padding: 16, borderRadius: 14, border: `1px solid ${color}44` }}>
                          <h5 style={{ fontWeight: 700, color, marginBottom: 8, fontSize: 13 }}>{title}</h5>
                          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>{desc}</p>
                          <div style={{ background: "var(--bg-base)", padding: "14px 16px", borderRadius: 10, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "monospace", letterSpacing: "-0.5px", textAlign: "center" }}>{age ? `Age ${age}` : "Beyond Age 95"}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── XIRR sub-section ── */}
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: "#a78bfa", marginBottom: 10, marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}><Percent style={{ width: 16, height: 16 }} />XIRR — Internal Rate of Return</h4>
                    <div style={{ background: "var(--bg-muted)", padding: 18, borderRadius: 14, border: "1px solid var(--border-strong)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>What XIRR measures:</strong> The XIRR column in the Data Table shows the <em>Extended Internal Rate of Return</em> of the highlighted CPF LIFE plan at each projection age. It answers: <em>"If I treat all my CPF contributions as money out and all my payouts + final bequest as money in, what annual return did I earn on the whole strategy?"</em> A positive XIRR above the CPF SA/RA rate (4%) means your overall strategy is generating value faster than simply leaving money in SA/RA.</p>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>How it is computed:</strong> The engine builds a cashflow timeline: contributions made each year are negative (money leaving your pocket), and CPF LIFE payouts received each year plus the terminal bequest value are positive (money coming back). Newton-Raphson iteration then finds the single discount rate that makes the net present value of that entire cashflow stream equal to zero. That rate is the XIRR. Up to 100 iterations per age-point are run; if it fails to converge, the cell shows <strong>—</strong>.</p>
                      <p style={{ marginBottom: 12 }}><strong style={{ color: "var(--text-highlight)" }}>Colour coding in the Data Table:</strong></p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                        {[
                          ["🟢  > 4%", "Beats the SA/RA base rate. Your contributions have compounded at a rate better than what CPF would have earned passively in SA or RA. This is the target zone.", "#34d399", "rgba(52,211,153,0.07)", "rgba(52,211,153,0.3)"],
                          ["🟡  2% – 4%", "Moderate return — below SA/RA rate but still positive real growth. Typical in early accumulation years before payout compounding kicks in.", "#fbbf24", "rgba(251,191,36,0.07)", "rgba(251,191,36,0.3)"],
                          ["🔴  < 2%", "Below CPF's floor rates. Common in very early years when contributions have been made but payouts have not yet started, so the numerics are dominated by outflows.", "#f87171", "rgba(248,113,113,0.07)", "rgba(248,113,113,0.3)"],
                        ].map(([title, desc, color, bg, border]) => (
                          <div key={title} style={{ padding: "12px 14px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
                            <p style={{ fontWeight: 700, color, marginBottom: 6, fontSize: 11 }}>{title}</p>
                            <p style={{ fontSize: 11, lineHeight: 1.5 }}>{desc}</p>
                          </div>
                        ))}
                      </div>
                      <p style={{ marginBottom: 10 }}><strong style={{ color: "var(--text-highlight)" }}>Why it shows — before payout age:</strong> XIRR requires at least one positive cashflow (a payout or bequest) to produce a meaningful result. Before your payout age, the entire cashflow series is negative contributions with no inflows yet — the IRR is mathematically undefined, so the column shows <strong>—</strong> for all pre-payout rows.</p>
                      <p style={{ marginBottom: 0 }}><strong style={{ color: "var(--text-highlight)" }}>Display cap ±10%:</strong> To prevent extreme outliers from distorting the table, XIRR results are clamped to a ±10% display range. Any computed value outside this range is pinned at the boundary. This is a display-only cap — the underlying Newton-Raphson result is unchanged.</p>
                    </div>
                  </section>

                </div>
              </div>
            )}
            {/* ── STRATEGY TAB ── */}
            {activeTab === "strategy" && (() => {
              const pa = payoutAge65; // CQ-2 fix: use debounced value to match payoutProjection data (cpfLifeMonthly at L9137)
              const ca = Number(inputs.currentAge) || 35;
              const target = Number(inputs.targetMonthlyIncome) || 0;
              const srsStart = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
              const srsYears = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
              const oaDrawStart = effectiveOaDrawStartAge;
              const contribStop = Number(inputs.contributionStopAge) || 65;
              const propMonAge = Number(inputs.propMonetiseAge) || 65;
              const propEnabled = inputs.propMonetiseEnabled === true;

              // Gantt span: current age (min 25) to 95
              const ganttStart = Math.min(ca, 25);
              const ganttEnd = 95;
              const ganttSpan = ganttEnd - ganttStart;
              const ganttPct = (start, end) => ({
                left: `${Math.max(0, ((Math.max(start, ganttStart) - ganttStart) / ganttSpan) * 100).toFixed(2)}%`,
                width: `${Math.max(0, ((Math.min(end, ganttEnd) - Math.max(start, ganttStart)) / ganttSpan) * 100).toFixed(2)}%`,
              });
              const ganttDot = (age) => ({
                left: `${Math.max(0, Math.min(100, ((age - ganttStart) / ganttSpan) * 100)).toFixed(2)}%`,
              });

              // Build summary table rows from strategyChartData
              const summaryRows = [];
              const cpfLifeMonthly = !isForeigner ? (payoutProjection.find(r => r.age === pa)?.[`${highlightPlan}Monthly`] || 0) : 0;
              if (cpfLifeMonthly > 0) {
                summaryRows.push({ label: `CPF LIFE (${highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)})`, startAge: pa, endAge: "Life", monthly: cpfLifeMonthly, total: cpfLifeMonthly * 12 * (95 - pa + 1), color: "#a855f7" });
              }
              if (oaDrawStart > 0 && effectiveOaDrawMonthly > 0) {
                const oaMo = effectiveOaDrawMonthly;
                const oaEnd = oaExhaustAge ?? 95;
                summaryRows.push({ label: "OA Drawdown", startAge: oaDrawStart, endAge: oaEnd, monthly: oaMo, total: oaMo * 12 * (oaEnd - oaDrawStart + 1), color: "#fbbf24" });
              }
              const hasSRS = Number(inputs.srsBalance) > 0 || Number(inputs.srsAnnualContribution) > 0;
              if (hasSRS) {
                const srsRowAtStart = projection.find(r => r.age === srsStart);
                const srsBalAtStart = srsRowAtStart?.srsBalance || 0;
                const srsRateSS = Math.max(0, (Number(inputs.srsReturnRate) || 0) / 100);
                const srsMo = srsYears > 0
                  ? Math.round((srsRateSS > 0
                      ? srsBalAtStart * srsRateSS / (1 - Math.pow(1 + srsRateSS, -srsYears))
                      : srsBalAtStart / srsYears) / 12)
                  : 0;
                if (srsMo > 0) summaryRows.push({ label: "SRS Drawdown", startAge: srsStart, endAge: srsStart + srsYears - 1, monthly: srsMo, total: srsMo * 12 * srsYears, color: "#0ea5e9" });
              }
              const avgPrivMo = Math.round(strategyChartData.reduce((s, r) => s + r.privateAsset, 0) / Math.max(strategyChartData.length, 1));
              if (avgPrivMo > 0) {
                const totalPriv = strategyChartData.reduce((s, r) => s + r.privateAsset * 12, 0);
                summaryRows.push({ label: "Private Assets", startAge: pa, endAge: 95, monthly: avgPrivMo, total: totalPriv, color: "#10b981", note: "avg/mo" });
              }
              if (propEnabled && (Number(inputs.propMonetiseCashProceeds) || 0) > 0) {
                const propCash = Number(inputs.propMonetiseCashProceeds) || 0;
                summaryRows.push({ label: `Property Mon. (${inputs.propMonetiseScheme || "downgrade"})`, startAge: propMonAge, endAge: propMonAge, monthly: Math.round(propCash / 12), total: propCash, color: "#fb923c", note: "one-time" });
              }

              const totalCombined = summaryRows.filter(r => r.label !== `Property Mon. (${inputs.propMonetiseScheme || "downgrade"})`).reduce((s, r) => s + r.monthly, 0);
              const shortfall = target > 0 ? target - totalCombined : 0;

              return (
                <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)", padding: 24, borderRadius: 24, display: "flex", flexDirection: "column", gap: 24 }}>

                  {/* ── Header ── */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ background: "rgba(244,63,94,0.15)", padding: 10, borderRadius: 12 }}>
                        <Target style={{ width: 22, height: 22, color: "#f43f5e" }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: "var(--text-bright)" }}>Holistic Retirement Strategy</h3>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                          {isForeigner
                            ? "SRS + Private Assets · No CPF account — CPF LIFE not applicable"
                            : `All income streams · Age ${pa}–95 · ${highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)} CPF LIFE plan active`}
                        </p>
                      </div>
                    </div>
                    {target > 0 && (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
                          <p style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", fontWeight: 700 }}>Target</p>
                          <p style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: "#a855f7", margin: 0 }}>{formatCurrency(target)}/mo</p>
                        </div>
                        <div style={{ background: shortfall <= 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)", border: `1px solid ${shortfall <= 0 ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`, borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
                          <p style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", fontWeight: 700 }}>{shortfall <= 0 ? "Surplus" : "Shortfall"}</p>
                          <p style={{ fontSize: 16, fontWeight: 900, fontFamily: "monospace", color: shortfall <= 0 ? "#10b981" : "#f43f5e", margin: 0 }}>{shortfall <= 0 ? "+" : "-"}{formatCurrency(Math.abs(shortfall))}/mo</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* No target nudge */}
                  {target === 0 && (
                    <div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <Target style={{ width: 14, height: 14, color: "#a855f7", flexShrink: 0 }} />
                      <p style={{ fontSize: 11, color: "#c084fc", margin: 0 }}>Set a <strong>Target Retirement Income</strong> in the Private Assets &amp; Strategy panel (sidebar) to activate shortfall analysis and the goal line on the chart below.</p>
                    </div>
                  )}

                  {/* ── SECTION 1: Stacked Income AreaChart ── */}
                  <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <BarChart2 style={{ width: 15, height: 15, color: "#f43f5e" }} />
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-bright)", margin: 0 }}>Combined Monthly Income Stack (Age {pa}–95)</h4>
                    </div>
                    <div style={{ height: 320 }}>
                      <ResponsiveContainer width="99%" height="100%">
                        <AreaChart data={strategyChartData} margin={{ top: 10, right: 14, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis dataKey="age" stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Age", position: "insideBottomRight", offset: -5, fill: "var(--chart-text)", fontSize: 9 }} />
                          <YAxis tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} stroke="var(--chart-text)" fontSize={11} tick={{ fill: "var(--chart-text)", fontWeight: 600 }} label={{ value: "Monthly Income ($)", angle: -90, position: "insideLeft", offset: 14, fill: "var(--chart-text)", fontSize: 9, style: { textAnchor: "middle" } }} />
                          <Tooltip
                            contentStyle={{ background: "var(--tooltip-bg)", backdropFilter: "blur(6px)", border: "1px solid var(--tooltip-border)", borderRadius: 10, fontSize: 11, padding: "10px 14px" }}
                            itemStyle={{ padding: "2px 0", color: "var(--tooltip-text)" }}
                            labelStyle={{ fontSize: 11, color: "var(--tooltip-label)", marginBottom: 6, fontWeight: 800 }}
                            formatter={(v, n) => v > 0 ? [formatCurrency(v) + "/mo", n] : null}
                            wrapperStyle={{ pointerEvents: "none" }}
                          />
                          <Legend verticalAlign="top" height={32} iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 600, color: "var(--text-main)" }} />
                          {target > 0 && (
                            <ReferenceLine y={target} stroke="#f43f5e" strokeWidth={2} strokeDasharray="7 4"
                              label={{ position: "insideTopRight", value: `Target ${formatCurrency(target)}/mo`, fill: "#f43f5e", fontSize: 9, fontWeight: "bold" }} />
                          )}
                          {!isForeigner && <Area isAnimationActive={false} type="monotone" dataKey="cpfLife"      stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.82} name="CPF LIFE" />}
                          <Area isAnimationActive={false} type="monotone" dataKey="oaDraw"       stackId="1" stroke="#d97706" fill="#d97706" fillOpacity={0.78} name="OA Drawdown" />
                          <Area isAnimationActive={false} type="monotone" dataKey="srs"          stackId="1" stroke="#0369a1" fill="#0369a1" fillOpacity={0.78} name="SRS" />
                          <Area isAnimationActive={false} type="monotone" dataKey="privateAsset" stackId="1" stroke="#065f46" fill="#065f46" fillOpacity={0.78} name="Private Assets" />
                          <Area isAnimationActive={false} type="monotone" dataKey="propMon"      stackId="1" stroke="#9a3412" fill="#9a3412" fillOpacity={0.78} name="Property Mon." />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                      {[["CPF LIFE", "#7c3aed"], ["OA Drawdown", "#d97706"], ["SRS", "#0369a1"], ["Private Assets", "#065f46"], ["Property Mon.", "#9a3412"]].map(([name, color]) => (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-muted)" }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.85 }} />
                          <span>{name}</span>
                        </div>
                      ))}
                      {target > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#f43f5e" }}>
                          <div style={{ width: 18, height: 2, background: "#f43f5e", borderRadius: 1 }} />
                          <span>Target Income</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── SECTION 2: Life Journey Timeline (Gantt) ── */}
                  <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                      <Clock style={{ width: 15, height: 15, color: "#60a5fa" }} />
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-bright)", margin: 0 }}>Life Journey Timeline</h4>
                    </div>

                    {/* Age axis ticks */}
                    <div style={{ display: "flex", marginBottom: 4 }}>
                      <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0 }} />
                      <div style={{ flex: 1, position: "relative", height: 18 }}>
                        {[25, 35, 45, 55, 65, 75, 85, 95].filter(a => a >= ganttStart && a <= ganttEnd).map(a => (
                          <span key={a} style={{ position: "absolute", fontSize: 8, color: "var(--text-subtle)", fontFamily: "monospace", fontWeight: 700, transform: "translateX(-50%)", ...ganttDot(a) }}>{a}</span>
                        ))}
                      </div>
                    </div>

                    {/* Gantt rows */}
                    {[
                      { label: "Accumulation", color: "#3b82f6", bands: [{ start: ca, end: contribStop }] },
                      { label: "Housing Loan", color: "#64748b", bands: [{ start: ca, end: Number(inputs.housingStopAge) || 55 }] },
                      ...(hasSRS ? [{ label: "SRS Contribs", color: "#38bdf8", bands: [{ start: ca, end: Number(inputs.srsContribStopAge) || 63 }] }] : []),
                      ...(hasSRS ? [{ label: "SRS Drawdown", color: "#0369a1", bands: [{ start: srsStart, end: srsStart + srsYears - 1 }] }] : []),
                      ...(oaDrawStart > 0 && effectiveOaDrawMonthly > 0 ? [{ label: "OA Drawdown", color: "#d97706", bands: [{ start: oaDrawStart, end: 95 }] }] : []),
                      { label: `CPF LIFE (${highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)})`, color: "#7c3aed", bands: [{ start: pa, end: 95 }] },
                    ].map(({ label, color, bands }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0, fontSize: 10, fontWeight: 600, color: "var(--text-muted)", paddingRight: 10, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                        <div style={{ flex: 1, position: "relative", height: 18, background: "var(--bg-panel)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                          {(bands || []).map((b, bi) => (
                            <div key={bi} title={`Age ${b.start}–${b.end}`} style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 4, background: color, opacity: 0.82, ...ganttPct(b.start, b.end) }} />
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Property monetisation pulse */}
                    {propEnabled && (Number(inputs.propMonetiseCashProceeds) || 0) > 0 && (
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0, fontSize: 10, fontWeight: 600, color: "var(--text-muted)", paddingRight: 10, textAlign: "right" }}>Property Mon.</div>
                        <div style={{ flex: 1, position: "relative", height: 18, background: "var(--bg-panel)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                          <div title={`Property monetisation at age ${propMonAge}`} style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", width: 16, height: 16, borderRadius: "50%", background: "#fb923c", border: "2px solid var(--bg-muted)", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", ...ganttDot(propMonAge) }}>
                            <span style={{ fontSize: 8, color: "#fff", fontWeight: 900 }}>$</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rev #D2: Life Events Gantt row — one block per enabled event */}
                    {(inputs.lifeEvents || []).filter(e => e.enabled !== false).length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0, fontSize: 10, fontWeight: 600, color: "#ef4444", paddingRight: 10, textAlign: "right", whiteSpace: "nowrap" }}>Life Events</div>
                        <div style={{ flex: 1, position: "relative", height: 18, background: "var(--bg-panel)", borderRadius: 4, border: "1px solid rgba(239,68,68,0.2)" }}>
                          {(inputs.lifeEvents || []).filter(e => e.enabled !== false).map((ev, idx) => {
                            const meta = LIFE_EVENT_TYPES[ev.type] || {};
                            const color = meta.color || "#ef4444";
                            const sa = Number(ev.startAge);
                            const ea = Number(ev.endAge);
                            const isPoint = ev.type === 'windfall' || ev.type === 'early_retirement' || sa === ea;
                            if (isPoint) {
                              return (
                                <div key={idx} title={`${ev.label || meta.label} · Age ${sa}`}
                                  style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: color, border: "2px solid var(--bg-muted)", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", ...ganttDot(sa) }}>
                                  <span style={{ fontSize: 7, color: "#fff", fontWeight: 900 }}>{meta.icon || "⚡"}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={idx} title={`${ev.label || meta.label} · Age ${sa}–${ea}`}
                                style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 4, background: color, opacity: 0.75, display: "flex", alignItems: "center", paddingLeft: 3, cursor: "default", overflow: "hidden", ...ganttPct(sa, ea) }}>
                                <span style={{ fontSize: 7, color: "#fff", fontWeight: 800, whiteSpace: "nowrap" }}>{meta.icon} {ev.label || meta.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Current age + payout age marker row */}
                    <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                      <div style={{ width: "clamp(90px, 22vw, 160px)", flexShrink: 0 }} />
                      <div style={{ flex: 1, position: "relative", height: 24 }}>
                        <div style={{ position: "absolute", top: 4, bottom: 0, width: 1.5, background: "#34d399", opacity: 0.9, ...ganttDot(ca) }}>
                          <span style={{ position: "absolute", bottom: 4, left: 3, fontSize: 8, color: "#34d399", fontWeight: 800, whiteSpace: "nowrap" }}>Now ({ca})</span>
                        </div>
                        <div style={{ position: "absolute", top: 4, bottom: 0, width: 1.5, background: "#a855f7", opacity: 0.9, ...ganttDot(pa) }}>
                          <span style={{ position: "absolute", bottom: 4, left: 3, fontSize: 8, color: "#a855f7", fontWeight: 800, whiteSpace: "nowrap" }}>LIFE ({pa})</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── SECTION 3: Lifetime Strategy Summary Table ── */}
                  <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <TableIcon style={{ width: 15, height: 15, color: "#10b981" }} />
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-bright)", margin: 0 }}>Lifetime Income Summary</h4>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border-strong)" }}>
                            {["Income Stream", "Start Age", "End Age", "Monthly Income", "Lifetime Total"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: h === "Income Stream" ? "left" : "right", fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summaryRows.length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-subtle)", fontSize: 12 }}>
                                No income streams active — configure CPF LIFE payout age, OA Drawdown, SRS, or Private Assets in the sidebar.
                              </td>
                            </tr>
                          )}
                          {summaryRows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.1s" }}>
                              <td style={{ padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                                  <span style={{ fontWeight: 700, color: "var(--text-bright)" }}>{row.label}</span>
                                  {row.note && <span style={{ fontSize: 9, color: "var(--text-subtle)", background: "var(--bg-base)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>{row.note}</span>}
                                </div>
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)", fontFamily: "monospace" }}>{row.startAge}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)", fontFamily: "monospace" }}>{row.endAge}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: row.color, fontFamily: "monospace" }}>{formatCurrency(row.monthly)}/mo</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-highlight)", fontFamily: "monospace" }}>{formatCurrency(row.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border-strong)", background: "var(--bg-panel)" }}>
                            <td colSpan={3} style={{ padding: "12px 12px", fontWeight: 800, color: "var(--text-bright)", fontSize: 13 }}>Total Combined (excl. one-time) @ Age {pa}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 900, fontFamily: "monospace", fontSize: 15, color: target > 0 ? (shortfall <= 0 ? "#10b981" : "#fbbf24") : "var(--text-bright)" }}>{formatCurrency(totalCombined)}/mo</td>
                            <td style={{ padding: "12px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{formatCurrency(summaryRows.reduce((s, r) => s + r.total, 0))}</td>
                          </tr>
                          {target > 0 && (
                            <tr style={{ background: shortfall <= 0 ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)", border: `1px solid ${shortfall <= 0 ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}` }}>
                              <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 800, color: shortfall <= 0 ? "#10b981" : "#f43f5e", fontSize: 12 }}>
                                {shortfall <= 0 ? "✓ Income Goal Met" : "⚠ Income Shortfall vs Target"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, fontFamily: "monospace", fontSize: 14, color: shortfall <= 0 ? "#10b981" : "#f43f5e" }}>
                                {shortfall <= 0 ? "+" : "-"}{formatCurrency(Math.abs(shortfall))}/mo vs {formatCurrency(target)}
                              </td>
                              <td />
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>

                    {/* Gap bridging tip */}
                    {target > 0 && shortfall > 0 && (
                      <div style={{ marginTop: 14, background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.22)", borderRadius: 10, padding: "12px 16px", fontSize: 11, color: "#fca5a5", lineHeight: 1.6 }}>
                        <strong style={{ color: "#f43f5e" }}>Closing the {formatCurrency(shortfall)}/mo gap:</strong> Use <strong>⚡ Fill Gap</strong> in the OA Drawdown panel (sidebar) to automatically set the exact monthly OA draw needed. You can also boost Private Asset savings, maximise SRS contributions, or enable Property Monetisation (in Property &amp; Timelines) to top up your RA.
                        {oaExhaustAge && <span> At the current draw rate, OA reaches its floor at <strong style={{ color: "#fbbf24" }}>age {oaExhaustAge}</strong> — adjust the bequest floor or draw amount to extend coverage.</span>}
                      </div>
                    )}
                    {target > 0 && shortfall <= 0 && (
                      <div style={{ marginTop: 14, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 10, padding: "12px 16px", fontSize: 11, color: "#6ee7b7", lineHeight: 1.6 }}>
                        <strong style={{ color: "#10b981" }}>Income goal met with a {formatCurrency(Math.abs(shortfall))}/mo surplus</strong> at payout age {pa}. Your combined income streams comfortably cover your retirement target.
                      </div>
                    )}
                  </div>

                  {/* ── Footer note ── */}
                  <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <ShieldCheck style={{ width: 13, height: 13, color: "#a855f7", flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                      CPF LIFE amounts reflect the <strong style={{ color: "#a855f7" }}>{highlightPlan.charAt(0).toUpperCase() + highlightPlan.slice(1)} Plan</strong> — switch plans in the LIFE tab to see how Standard, Escalating, or Basic payouts change your strategy. OA Drawdown end age reflects the projected exhaustion point from your inputs.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>{/* /tab content panels */}
        </section>
      </div>
      </div>{/* /rootRef */}
      </ErrorBoundary>
    </TooltipContext.Provider>
  );
}

