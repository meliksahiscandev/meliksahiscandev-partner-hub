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
