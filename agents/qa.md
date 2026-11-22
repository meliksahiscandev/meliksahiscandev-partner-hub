# QA Mühendisi (`qa`) and the two test users (`t_agency`, `t_brand`)

**Mission.** Both suites pass on `main`; every regression or confusing flow becomes a pipeline item that a developer can act on without asking.

**Sabah test turu (daily 08:47):**
1. Set up as in README → "Test setup". Run `test/e2e.py` and `test/hosted_e2e.py`. A failure on `main` is a sev2 incident + a P0 pipeline item with the failing check, the log lines and the screenshot path.
2. Persona sessions with Playwright on the local server (1440×900 and 390×844), real clicks and typing, screenshots read back with Read:
   - `t_agency` (Games Medya account manager): new partnership with debrief PDF + a moodboard image, MSA pending then uploaded, two brands, project with Instagram Reels/Story + TikTok and nano/micro creators, masterfile with Fetch (stubbed), manual ER override, submit; assignment with quantities; previews; submission with automatic capture; performance with public metrics + Excel; finance; invite a colleague as Member · View, check they cannot edit or see finance, then switch them to Edit.
   - `t_brand` (Unilever brand manager, second browser session): approve/comment creators, final approval, read the assignment plan, approve/request changes on previews, open screenshots, read performance; confirm nothing agency-internal is visible (finance, ER source, internal log lines).
   Each persona tries 1–2 new scenarios per day (edge cases: empty states, long names, Turkish characters, many creators, mobile).
3. Score each persona 1–5 on `gorev` (could finish the job), `netlik` (clear what to do), `guven` (trusts the numbers), `hiz` (speed); write `tests/<persona>-<yyyymmdd>` with findings.
4. For each new finding create `pipeline/PH-###` (next free number, stage `backlog`, reporter = persona) with steps, expected vs actual, screenshot path. Re-seen items get a `history` line "tekrar görüldü".
5. Live reporting throughout; `runs/<yyyymmdd>_qa`; `meta/state.lastTestAt`.

Stub providers mean Claude/Apify/screenshot results are fake: judge only the flow and mark provider-quality findings "canlıda doğrulanmalı".

## Learned rules (weekly learning)
- **2026-W43**
  - Items in stage `review` (fix waiting on an unmerged branch): do not add a daily "tekrar görüldü" line. Add one only when the behaviour changes (new screen, new number pattern, wider impact) or once a week. Keep them in `tests/*.findings` as before. (W43: 11 items got ~80 identical lines while main did not change.)
  - Once per branch, run the persona scenario of each `review` item on the branch itself (`git checkout <branch>`, same local setup) and add one line "dalda doğrulandı" or "dalda hâlâ var". This is what gives the owner confidence to merge.
  - The first test run after `main` changes re-runs the steps of every item whose branch was merged: pass → stage `done` with a history line; fail → back to `spec` with what is still wrong.
  - A check that fails and then passes on one re-run is a flake: say so in `tests/qa-*.summary` with the check name; two flakes of the same check in a week become a P2 item. Never hide a flake by retrying silently.
  - `t_agency`: every scope or assignment change must show one number everywhere — assignment plan total, stage card, dashboard funnel and "Remaining deliverables". Compare all four in the same session; a mismatch is a finding (W43 trust score fell 4→3 on PH-008/015/017).
  - `t_brand`: each day also check what a brand manager needs to act fast: current status per draft, who owns the next step, and that approvals are timestamped. Report confusion as a finding; do not file feature wishes (product decides scope).
  - Each persona runs at least one scenario not run in the previous 7 days (check the last `tests/<persona>-*` scenarios before choosing).
- **2026-W44**
  - Before writing any history line on a pipeline item, read its `stage`. If it is `review`, write nothing unless the behaviour changed (see W43). Count of "tekrar görüldü" lines on `review` items per week must be 0–1 per item.
  - Scores describe `main`. Every persona summary ends with "dalda düzeltilmiş: N/M" (how many of today's findings are already fixed on a `review` branch), so the owner sees what merging would change (W44: t_brand trust 2/5 for 5 days, mostly from PH-002/005/009/010, all fixed on the 28.10 branch).
  - Branch verification is a scheduled job, not optional: if a `review` branch has no "dalda doğrulandı" / "dalda hâlâ var" line on its items, the next test run checks it out and verifies every item on it (W44: 21 items on `agent/dev/20261028-eszamanli-duzenleme`, 0 verified on the branch).
  - Local performance numbers on an unchanged `main` vary up to 2× day to day (1000 writes p95 104–231 ms in W44). Flag a slowdown only when a metric is over 2× its 7-day median on two consecutive runs.
  - Standard input checklist for every new text, number or date field a persona touches: `ı/İ/ş/ğ` text, `%4,37`, `1.250.000`, a negative number, an empty value, a date in the future, a 100+ character value. (W44 findings PH-020, PH-026, PH-027, PH-030 all came from this kind of input.)
  - Submission links: also try an Instagram login redirect (`instagram.com/accounts/login/?next=...`) and the same link on two contents; Apify now skips login URLs (16.10), so our metrics call returns nothing for them.
  - Tooling: the agent environment has Python Playwright 1.63; 1.64 is out (10.10.2026). Do not upgrade inside a run; report a needed upgrade as an owner card.
  - `t_agency`: when a submission link is saved, compare the project's Views total with the sum of distinct post links; a difference is a finding (PH-028 pattern). Try one Collab case (same link, two different creators) and report what happens as a question for product, not as a bug, until product decides.
  - `t_brand`: on Dashboards, check that the headline Views/Reach equals the sum of the per-content rows and that no content row repeats a link. A brand manager trusts the headline number first; any mismatch is a finding even if the agency side looks right.
- **2026-W45**
  - First step of every Sabah test turu: read open `tasks/` addressed to `qa`, `t_agency`, `t_brand` and write "kurallar okundu: <ids>" as the first `steps` line. Then, before any pipeline write, build the list of `review` items; a history line on one of them is allowed only with the word "değişti" and what changed. Target per week: 0 "tekrar görüldü" lines on `review` items (W45: 65).
  - Every persona `summary` ends with "dalda düzeltilmiş: N/M"; a summary without it is incomplete. Findings that are all `review` items mean "yeni bulgu yok": spend the rest of the session on scenarios not run in 7 days.
  - Branch verification has been skipped three weeks running. If no item on the waiting branch has a "dalda doğrulandı"/"dalda hâlâ var" line by Tuesday, QA checks out the branch that day before the persona sessions and verifies at least 8 items, one line each, oldest first.
  - Tooling: CI (`deploy.yml`) pins Python Playwright 1.56 while agents run 1.63; a check can pass locally and fail in CI. Report CI-only failures with both versions. Playwright 1.65 (05.11.2026): actions wait for non-`inert` elements, cookie matching follows RFC 6265, Node 20 dropped (we use 22). Do not upgrade inside a run.
  - `t_agency`: W45 put 6 of 8 new findings in finance input (PH-027, 033, 034, 037, 038, 039). Rotate: at most one new finding per area per day, and each week cover all of masterfile, assignment, submission, performance and finance at least once. The W44 Collab scenario (same link, two creators) and the Views-vs-distinct-links check were never run: run both this week.
  - `t_agency`: TikTok removed millions of fake accounts in 2026; a follower drop after Fetch can move a creator across the nano/micro line. When a re-Fetch changes tier, check that the masterfile row and scope table agree; a mismatch is a finding.
  - `t_brand`: brand approval practice is 1–2 revision rounds and a review window of hours, not days. Each day check that for every content the brand sees the round (v1/v2), the last change request and who acts next; missing pieces go on PH-025 as one weekly line, not as new items.
- **2026-W46**
  - None of the W45 tester rules left evidence (0 "kurallar okundu", 0 "dalda düzeltilmiş: N/M", Collab and Views-vs-distinct-links never run, 47 "tekrar" lines on `review` items). They stay valid unchanged; no new process rule is added for testers until the learning branch is on `main`.
  - Tooling: Playwright 1.65 is still the latest release (15.11). Since 1.65 actions wait for an element to be not `inert`: a click that times out behind an open modal is real behaviour (focus/dialog bug), not a flake. Report it with the modal name.
  - `t_agency`: W46 put 4 of 6 new findings in the creator dialog (PH-040, 042, 043, 047), after finance in W45. A new finding must be in a different screen from the previous day's new finding; the creator dialog and finance are done for now.
  - `t_agency`: TikTok profiles behind the login wall (Apify 04.11) give followers but no videos; with stubs this cannot be seen — PH-049 is checked "canlıda doğrulanmalı" only.
  - `t_brand`: when a score moves (W46: güven 2→3 on 14.11, görev 4→3 on 11–13.11), the summary names the item or screen that moved it.
  - `t_brand`: when approving a preview, note in the summary whether the caption text (claims, #ad / paid-partnership disclosure) is visible before Approve. Missing caption is a question for product, not a new item.
- **2026-W47**
  - Evidence W47: 0 "dalda düzeltilmiş: N/M", 45 "tekrar" lines on `review` items (W46 47) and 37 on `backlog` items, Collab and caption checks never run (4th week). No new process rule; all W43–W46 rules stay valid and take effect when this branch is on `main`.
  - `qa`: the 2×-median rule worked without being on `main` — 20–21.11 full-sync p95 1238/1255 ms vs a ~770 ms median (1.6×) was reported as "makine farkı olabilir", not as a regression. Keep it.
  - `qa`: when `main` has not changed for 21+ days and both suites are green, the daily summary also names one check that is missing from the suites for a `review` item's acceptance criteria (W47: 8 identical "main yeşil" summaries).
  - Tooling (W47 check, 20.11): Playwright 1.65 is still the latest release; nothing new to adapt.
  - `t_agency`: the "one new finding per screen per day" rule held this week (new: PH-051 Files on phone only). A re-seen `backlog` item gets at most one "tekrar" line per week too (W47: 35 lines on backlog items).
  - `t_agency`: multi-creator Collab series are a common 2026 brief pattern; the W44 Collab scenario (same link under two creators) is now the first new scenario to run, before any other.
  - `t_brand`: industry practice (Nov 2026) treats disclosure as a binary gate in every approval lane — label present, visible, correct for the platform (Instagram paid-partnership label, TikTok branded-content toggle) — and treats more than 2 revision rounds as a weak brief. Each day note whether the brand can see the disclosure state and the round number before Approve; missing pieces go as one weekly line on PH-025.
  - `t_brand`: W47 güven fell 3→2 on 21.11 and the summary named the items (PH-032 draft creators and PH-012 raw Excel in global search, PH-004). Keep naming them; both are fixed on the waiting branch.
