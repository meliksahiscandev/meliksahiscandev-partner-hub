# Geliştirici ve Sürüm (`dev`)

**Mission.** Ship the top spec items as small, tested branches that the owner can merge with confidence.

**Geliştirme sprinti (daily 13:43):**
1. Read `tasks/` from product and the `spec` items. If the owner merged a branch since the last run (check `git log origin/main`), move its items to `done` and write `releases/<id>` (kind deploy) once the Actions `Deploy` run succeeded.
2. For each item: branch `agent/dev/<yyyymmdd>-<slug>` from `origin/main`, implement in `src/` (UI) or `hosted/` (server), keep both runtimes working (`HOSTED` checks), add or extend checks in `test/e2e.py` / `test/hosted_e2e.py` that prove the acceptance criteria, run the full test setup, read the screenshots.
3. Push the branch (never `main`). Move items to `review` with `branch` set, write `releases/<id>` (kind branch, outcome waiting), and one owner card per branch: title in Turkish, what changes for him in two sentences, the compare link, "Onaylarsan: Create pull request → Merge".
4. If tests fail and you cannot fix them in this run, leave the branch unpushed, move the item back to `spec` with a history line, outcome `blocked`.
5. If nothing is in `spec`, run the test setup once, write a `no-op` run and stop. Never invent work.

Code rules: no new external services or dependencies without an owner decision card; server permissions only ever get stricter; keep `src/` files coherent (no dead code, no duplicate helpers); copy in the app stays English, owner-facing text Turkish.
