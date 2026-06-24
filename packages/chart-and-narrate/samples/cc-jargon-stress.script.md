---
script_id: cc-v1-jargon-stress-SAMPLE
channel: cashflow-compass
policy_version: v1
linter_version: 1.0.0
reviewed_by: ContentStrategist
reviewed_on: 2026-05-27
ymyl_pause_active: false

# Jargon-dense YMYL-green sample for THIAAAAA-53 (CEO note #2 on THIAAAAA-34
# comment 3d37ba2e): deliberately packs the finance-jargon vocab the WhisperX
# confidence floor is stress-tested against — ROIC, 401(k), basis points,
# Roth conversion ladder, tax-loss harvesting, MAGI, expense ratio, qualified
# dividend. Datasets per §11: FRED DGS10, IRS Pub 560, IRS Pub 590-A, NYU Stern
# (Damodaran). No monetization beat (keeps the sample focused on the numeric +
# disclosure gates rather than FTC affiliate rules).

sources:
  - id: fred-dgs10-2026
    publisher: FRED
    date: 2026-05-20
    url: https://fred.stlouisfed.org/series/DGS10
    accessed_at: 2026-05-27
  - id: irs-590a-2026
    publisher: IRS
    date: 2026-01-15
    url: https://irs.gov/pub/irs-pdf/p590a.pdf
    accessed_at: 2026-05-27
  - id: irs-560-2026
    publisher: IRS
    date: 2026-01-15
    url: https://irs.gov/pub/irs-pdf/p560.pdf
    accessed_at: 2026-05-27
  - id: nyustern-damodaran-2026
    publisher: NYU Stern
    date: 2026-01-05
    url: https://pages.stern.nyu.edu/~adamodar/
    accessed_at: 2026-05-27

beats:
  - id: hook
    start_s: 0
    end_s: 8
    has_affiliate: false
    has_sponsor: false
    has_disclaimer_card: true
  - id: definitions
    start_s: 8
    end_s: 120
    has_affiliate: false
    has_sponsor: false
  - id: limits
    start_s: 120
    end_s: 200
    has_affiliate: false
    has_sponsor: false

on_screen_text:
  - at_s: 6
    duration_s: 6
    text: "FRED — 2026-05-20"
    kind: citation_overlay
    cite_ref: fred-dgs10-2026
    pairs_with_numeric: "4.31%"
  - at_s: 12
    duration_s: 6
    text: "This video is general information, not personalized financial advice."
    kind: disclaimer_card
  - at_s: 18
    duration_s: 4
    text: "AI-narrated. Human-reviewed against the cited sources."
    kind: ai_presenter
  - at_s: 150
    duration_s: 6
    text: "IRS — Pub 590-A — 2026-01-15"
    kind: citation_overlay
    cite_ref: irs-590a-2026
    pairs_with_numeric: "$7,000"
  - at_s: 160
    duration_s: 6
    text: "IRS — Pub 560 — 2026-01-15"
    kind: citation_overlay
    cite_ref: irs-560-2026
    pairs_with_numeric: "$70,000"
  - at_s: 185
    duration_s: 6
    text: "NYU Stern — 2026-01-05"
    kind: citation_overlay
    cite_ref: nyustern-damodaran-2026
    pairs_with_numeric: "4.6%"

spoken_disclosures:
  - at_s: 20
    kind: ai_presenter

description: |
  ## About this video
  Cashflow Compass uses an AI-generated narrator to walk through finance
  terminology against cited primary sources.

  ## Disclaimer
  The information in this video is general in nature and is not personalized
  financial advice.

  ## Sources
  - FRED — 10-Year Treasury Constant Maturity (DGS10) — 2026-05-20 — https://fred.stlouisfed.org/series/DGS10
  - IRS — Pub 590-A — 2026-01-15 — https://irs.gov/pub/irs-pdf/p590a.pdf
  - IRS — Pub 560 — 2026-01-15 — https://irs.gov/pub/irs-pdf/p560.pdf
  - NYU Stern (Damodaran) — Equity Risk Premium dataset — 2026-01-05 — https://pages.stern.nyu.edu/~adamodar/
---

# VO

This is Cashflow Compass. In general terms, and not personalized advice, we explain the vocabulary behind retirement and investing math.

Start with the ten-year Treasury yield, a benchmark many savers track. Recently it sat near 4.31%.

Expense ratio is the annual fee a fund charges as a share of assets; over decades, a lower expense ratio compounds in a saver's favor. A qualified dividend is taxed at long-term rates, unlike an ordinary dividend. Your MAGI, or modified adjusted gross income, determines eligibility for many contributions and credits.

A Roth conversion ladder is the practice of converting funds in stages across several tax years. Tax-loss harvesting describes realizing a loss to offset a gain. ROIC, return on invested capital, is one efficiency lens analysts apply to a business. Moves in rates are measured in basis points, not headlines.

On the limits: for many earners the IRA contribution ceiling is $7,000 while a SEP plan under IRS Pub 560 can reach $70,000. A workplace 401(k) sits within its own elective-deferral schedule. Analysts at NYU Stern peg the long-run equity risk premium near 4.6%.
