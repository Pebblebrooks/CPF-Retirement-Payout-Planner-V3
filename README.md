CPF Planner Pro — Web Application
A privacy-first, client-side React application built with Vite. Designed to help Singaporeans calculate, project, and optimise their Central Provident Fund (CPF) retirement strategies using a fully compliant 2026 policy engine.

🔗 Live Links
Marketing Sitehttps://cpfplanner.ehtan2022.workers.dev/
Main Applicationhttps://cpfplannerappv3.ehtan2022.workers.dev/

📖 Project Overview
CPF policies are complex — varying interest rates, contribution ceilings, milestone rules (SA closure at 55, BHS cap, FRS/ERS tiers), and life-phase transitions all interact in ways that are difficult to reason about manually.
CPF Planner Pro provides a visual, interactive dashboard to simplify these policies. Users input their current balances, salary, and retirement targets to instantly generate long-term projections, compare CPF LIFE plans, stress-test with Monte Carlo simulation, and model real-world decisions like property purchases, voluntary top-ups, and property sales.

✨ Core Features
Projection Engine

Real-time projections — OA, SA, MA, RA balances year-by-year from current age to 95
2026 policy-compliant — OW ceiling $8,000/mo, AW ceiling $102,000/yr, FRS $220,400, ERS $440,800, BHS $79,000
SA closure at 55 — SA merges into RA; correct transfer to BRS/FRS/ERS modelled
Mandatory & voluntary contributions — employed, self-employed (SEP), and VC3A modes
All top-up schemes — RSTU, VC3A, VHR, MRSS ($2,000/yr matched), MMSS ($1,000/yr matched), WIS/Workfare
Property modelling — housing OA outflows, property pledge (BRS-only RA target), OA withdrawal at 55
Property sale & CPF refund — OA principal + 2.5%/yr accrued interest refunded to OA on sale; pledge path restores RA to FRS first

Analysis Tabs

Summary — KPI strip, FRS tracker, hero panel with stat rings, net worth doughnut, estate planning panel (bequest by age 65–95), milestone alerts, What-If Explorer
Accumulation (Growth) — stacked area chart OA/SA/MA/RA with Monte Carlo P10/P50/P90 bands
LIFE Comparison — Standard, Escalating, Basic plan payout curves; exact crossover ages; payout age sensitivity table (65–70)
Compare Scenarios — save two full scenario snapshots; colour-coded diff table
Data Table — full year-by-year projection; WIS cash column; XIRR per plan; Download CSV; Open in Google Sheets
Docs — full policy reference, user guide, yield/XIRR explainer, Monte Carlo explainer, legal disclaimer

Advanced Features

Monte Carlo simulation — 200 runs, ±1% interest rate variance + ±0.5% inflation variance; P10/P50/P90 confidence bands; probability of sufficiency score
What-If Explorer — live sliders for payout age, SA/RA top-up (with free-text override for any amount), housing outflow, salary increase; FRS/ERS headroom indicator
Share Link — encodes full profile into a compact base64url ?p= query parameter; recipient opens link and sees exact projection
PDF Report — 5-page print-ready report; Portrait/Landscape toggle; includes accumulation chart, LIFE comparison chart, net worth chart, year-by-year table, sensitivity analysis, FRS tracker, Monte Carlo score, breakeven analysis, payout age sensitivity table, milestones, and legal disclaimer
Save / Load Profile — export inputs as JSON; restore from JSON
Google Sheets export — one-click open in Google Sheets from Data Table

UX & Accessibility

Dark / Light / System theme (persisted to localStorage)
Sidebar section open/close state persisted to sessionStorage
Unsaved-changes beforeunload warning
Keyboard navigation on all sidebar section headers (Enter / Space)
KPI strip hover tooltips
Collapsible tab intro panels
Fully responsive — desktop sticky dual-panel layout; tablet/mobile normal page flow
Mobile hamburger menu with all actions (Reset, Save Profile, Load Profile, Share Link, PDF Report)

Privacy & Security

100% client-side — all calculations run in the browser; zero financial data transmitted or stored
Share link inputs whitelisted against DEFAULT_INPUTS keys on load
PDF generation has 30-second timeout guard
XIRR solver has sign-change guard and 100-iteration cap


📸 Screenshots

Drag and drop screenshots of the dashboard here in GitHub.


🛠 Tech Stack
LayerTechnologyFrameworkReact 18 (functional components, hooks)Build toolViteChartsRecharts (LineChart, AreaChart, BarChart, PieChart)IconsLucide ReactStylingInline styles + CSS custom properties (no external CSS framework)StateuseState, useMemo, useEffect (no external state library)DeploymentCloudflare Workers / Pages (static)

🚀 Local Development
Prerequisites
Node.js v16 or higher.
Setup
bash# Clone the repository
git clone https://github.com/your-username/cpfplannerv3.git
cd cpfplannerv3

# Install dependencies
npm install

# Start local dev server (usually http://localhost:5173)
npm run dev

# Build for production
npm run build
# Output: /dist folder — deploy as static site
Key File
All application logic, engine, and UI lives in a single file:
src/App.jsx   (~4,800 lines)
The engine (runProjectionEngine) is a pure function that takes inputs and options and returns a year-by-year projection array. It is called by useMemo with a debounced input key, and also directly by Monte Carlo (200×), PDF sensitivity analysis, and What-If Explorer calculations.

📁 Repository Architecture
The CPF Planner Pro ecosystem is split into two repositories:
RepositoryPurposeThis repo (The App)React/Vite web application — financial engine, interactive dashboard, all calculationsPromo repoStatic HTML/CSS/JS landing page — SEO, marketing, funnels users to the app

🗺 2026 Policy Engine — Key Rules Implemented
RuleDetailOA interest2.5% p.a. base; +1% bonus on first $20,000 (OA floor)SA/RA interest4.0% p.a.MA interest4.0% p.a.; capped at BHS ($79,000); excess → SA/RA → OAOW ceiling$8,000/mo (contribution base capped)AW ceiling$102,000 − total OW subject to CPFSA closure at 55SA transfers to RA up to FRS; surplus to OACPF Annual Limit$37,740 for voluntary contributionsMRSSDollar-for-dollar RA top-up match up to $2,000/yr; lifetime cap $20,000; age 55+, RA < BRSMMSSDollar-for-dollar MA top-up match up to $1,000/yr; age 55–70, MA < ½ BHSWISEmployees: 60% CPF (age-band split) + 40% cash; SEPs: 90% MA + 10% cashProperty pledgeOnly BRS needed in RA at 55; RA above BRS can be withdrawn as cash at pledgeWithdrawalAgeProperty CPF refundOn sale: cumulative OA housing principal + 2.5%/yr compound interest → OA; with pledge: restores RA to FRS firstCPF LIFE deferral+7% compound per year deferred past 6520% RA transferAt payout age: 20% of (RA − cumulative cash top-ups − cumulative RA interest) transfers to OA

💬 Feedback & Bugs
Found a calculation discrepancy or have a feature request? Please open an issue in this repository with:

Your inputs (age, balances, key settings)
Expected vs actual output
Screenshot if applicable


⚖️ Legal Disclaimer
Educational Purpose Only. This application is a prototype simulation tool intended strictly for informational, educational, and testing purposes. It does not constitute professional financial advice.
Independent Application. CPF Planner Pro and its underlying mathematical models are completely independent. We are neither supported, approved, nor sanctioned by the Central Provident Fund (CPF) Board or any government agency.
Hypothetical Projections. All calculations, charts, and inferences generated by this tool are entirely hypothetical. Policy rules are subject to change by the CPF Board. Please consult a certified financial advisor before making any real-world financial decisions.
No Liability. The creators and contributors of this application shall not be held liable for any direct, indirect, incidental, or consequential damages, losses, or legal repercussions arising from the use or misuse of this tool.

📄 License
All rights reserved. Intended for educational purposes.
