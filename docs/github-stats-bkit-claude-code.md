# GitHub Usage Statistics Report — bkit-claude-code

<!--
  This file is the fixed format the /github-stats skill fills in. Do not hand-edit.
  {{TOKEN}} placeholders are substituted from collect.sh's metrics JSON.
  Tables/trends are generated from .claude/state/github-stats-ledger.json.
  Number format: thousands separators. Estimated values MUST be marked "(est.)".
  Output language: English (per user request 2026-06-30; docs/ default is Korean).
-->

* **Repository**: [popup-studio-ai/bkit-claude-code](https://github.com/popup-studio-ai/bkit-claude-code)
* **Report date**: 2026-08-07
* **Data through**: 2026-08-06 (GitHub Traffic API has a 1-day delay)
* **Last push**: 2026-07-28
* **Cumulative data range**: 2026-01-09 ~ 2026-08-06

---

## 📌 Data Policy

> - **Stars / Forks / Watchers**: real-time cumulative values from the GitHub API → **exact**.
> - **Clones / Views (14d)**: the Traffic API only exposes a 14-day rolling window → daily tables show the last 14 days only.
> - **Cumulative Clones / Views**: anchor (historical baseline) + trend-estimated gap + measured daily sums. Gap-period values are **(est.)**.
> - **Cumulative Unique**: simple sum of daily uniques (counts repeat users across days). Treated as **(est.)** because it includes the estimated gap.

---

## 🔥 Executive Summary (collected 2026-08-07)

| Metric | Current | Previous (2026-07-28) | Change |
| --- | --- | --- | --- |
| ⭐ **Stars** | **589** | 584 | +5 |
| 🍴 **Forks** | **148** | 148 | ±0 |
| 👀 Views (14d) | **814** (356 unique) | 839 | -25 |
| 📥 Clones (14d) | **19,419** (1,533 unique) | 20,856 | -1,437 |
| 👀 **Cumulative Views** | **81,562** | 80,927 | +635 |
| 📥 **Cumulative Clones** | **438,625** | 424,184 | +14,441 |
| 👤 **Cumulative Unique Clones** | **62,393** (est.) | 59,581 | +2,812 |

### 🎯 Milestones / Headlines

- 👤 **Cumulative unique cloners passed 60K** — **62,393** (est.), up +2,812 since 2026-07-28. This is the headline milestone of this collection.
- 📥 **Cumulative clones passed 430K** — 438,625 as of 2026-08-06 (+14,441 in 10 days).
- ⭐ **Stars 589** — +5 since 2026-07-28 (**0.50 stars/day**), a slower pace than the 1.40/day burst around the v2.1.32 release.
- 📥 14-day clones **19,419** (-1,437) — the **first decline after four consecutive rises** (15,303 → 17,877 → 19,477 → 20,856 → 19,419).
- 📈 Single-day peak **2,113 clones on 2026-08-05**, the highest daily figure in the current window.
- 👀 14-day views **814** (-25) — a mild continued drift down; daily uniques stayed steady (356 over 14 days).
- 🍴 Forks 148 (±0) — flat since the last collection.
- ⏳ No measurement gap this cycle (`gapWarning: none`), so the daily series remains unbroken since 2026-06-16.

---

## 👀 Daily Views (last 14 days, 2026-07-24 ~ 2026-08-06)

| Date | Views | Unique | vs. prev day |
| --- | --- | --- | --- |
| 2026-07-24 | 59 | 31 | — |
| 2026-07-25 | 36 | 16 | -39.0% |
| 2026-07-26 | 35 | 21 | -2.8% |
| 2026-07-27 | 49 | 30 | +40.0% |
| 2026-07-28 | 58 | 32 | +18.4% |
| 2026-07-29 | 96 | 43 | +65.5% |
| 2026-07-30 | 75 | 38 | -21.9% |
| 2026-07-31 | 37 | 24 | -50.7% |
| 2026-08-01 | 43 | 14 | +16.2% |
| 2026-08-02 | 28 | 17 | -34.9% |
| 2026-08-03 | 69 | 34 | +146.4% |
| 2026-08-04 | 72 | 48 | +4.3% |
| 2026-08-05 | 66 | 41 | -8.3% |
| 2026-08-06 | 91 | 41 | +37.9% |
| **14d total** | **814** | **356** | |

---

## 📥 Daily Clones (last 14 days, 2026-07-24 ~ 2026-08-06)

| Date | Clones | Unique | vs. prev day |
| --- | --- | --- | --- |
| 2026-07-24 | 1,563 | 276 | — |
| 2026-07-25 | 1,076 | 180 | -31.2% |
| 2026-07-26 | 892 | 168 | -17.1% |
| 2026-07-27 | 1,447 | 295 | +62.2% |
| 2026-07-28 | 1,680 | 352 | +16.1% |
| 2026-07-29 | 1,637 | 284 | -2.6% |
| 2026-07-30 | 1,647 | 305 | +0.6% |
| 2026-07-31 | 1,392 | 271 | -15.5% |
| 2026-08-01 | 688 | 179 | -50.6% |
| 2026-08-02 | 904 | 205 | +31.4% |
| 2026-08-03 | 1,342 | 270 | +48.5% |
| 2026-08-04 | 1,480 | 307 | +10.3% |
| 2026-08-05 | 2,113 | 292 | +42.8% |
| 2026-08-06 | 1,558 | 347 | -26.3% |
| **14d total** | **19,419** | **1,533** | |

---

## 🧮 Cumulative Computation (Audit Trail)

| Component | Period | Views | Clones | Unique Clones | Note |
| --- | --- | --- | --- | --- | --- |
| Anchor (baseline cumulative) | ~2026-05-29 | 75,689 | 344,816 | 45,409 | User direct observation on 2026-05-30 (cumulative Clones seen >340K). Supersedes the 5/23 Slack report, which  |
| Gap estimate (est.) | 2026-05-30 ~ 2026-06-15 (17d) | 1,927 (est.) | 25,114 (est.) | 4,051 (est.) | trapezoidal — gap_days * avg(daily rate at anchor window, daily rate at next window). Daily rates are real API measurements, NOT scaled by correctionRatio. |
| Measured daily sum | 2026-06-16 ~ 2026-08-06 (52d) | 3,946 | 68,695 | 12,933 | API-measured |
| **Cumulative total** | ~2026-08-06 | **81,562** | **438,625** | **62,393** (est.) | |

> Estimation method: trapezoidal — `gap_days × avg(daily rate at anchor, daily rate at next window)`.
> The gap window falls outside the Traffic API window and is permanently lost, so it is preserved as an estimate.

---

## 📋 Collection Log (Snapshot History)

| Collected | Data through | Stars | Forks | Views (14d) | Clones (14d) | Cum. Views | Cum. Clones |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-23 | — | 549 | 141 | 1,888 | 25,320 | 60,625 | 267,833 |
| 2026-05-30 | 2026-05-29 | — | — | — | — | 75,689 | 344,816 |
| 2026-06-30 | 2026-06-29 | 566 | 151 | 1,286 | 16,044 | 78,902 | 385,974 |
| 2026-07-09 | 2026-07-08 | 574 | 148 | 1,341 | 15,303 | 79,807 | 397,050 |
| 2026-07-16 | 2026-07-14 | 575 | 149 | 1,130 | 17,877 | 80,150 | 405,198 |
| 2026-07-23 | 2026-07-21 | 577 | 149 | 938 | 19,477 | 80,619 | 415,353 |
| 2026-07-28 | 2026-07-27 | 584 | 148 | 839 | 20,856 | 80,927 | 424,184 |
| 2026-08-07 | 2026-08-06 | 589 | 148 | 814 | 19,419 | 81,562 | 438,625 |

---

> **Last updated**: 2026-08-07 | Data through: 2026-08-06
> Generated by the `/github-stats` skill (`.claude/skills/github-stats`) · Ledger: `.claude/state/github-stats-ledger.json`
