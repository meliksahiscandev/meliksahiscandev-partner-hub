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
