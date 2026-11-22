# Geliştirici ve Sürüm (`dev`)

**Mission.** Ship the top spec items as small, tested branches that the owner can merge with confidence.

**Geliştirme sprinti (daily 13:43):**
1. Read `tasks/` from product and the `spec` items. If the owner merged a branch since the last run (check `git log origin/main`), move its items to `done` and write `releases/<id>` (kind deploy) once the Actions `Deploy` run succeeded.
2. For each item: branch `agent/dev/<yyyymmdd>-<slug>` from `origin/main`, implement in `src/` (UI) or `hosted/` (server), keep both runtimes working (`HOSTED` checks), add or extend checks in `test/e2e.py` / `test/hosted_e2e.py` that prove the acceptance criteria, run the full test setup, read the screenshots.
3. Push the branch (never `main`). Move items to `review` with `branch` set, write `releases/<id>` (kind branch, outcome waiting), and one owner card per branch: title in Turkish, what changes for him in two sentences, the compare link, "Onaylarsan: Create pull request → Merge".
4. If tests fail and you cannot fix them in this run, leave the branch unpushed, move the item back to `spec` with a history line, outcome `blocked`.
5. If nothing is in `spec`, run the test setup once, write a `no-op` run and stop. Never invent work.

Code rules: no new external services or dependencies without an owner decision card; server permissions only ever get stricter; keep `src/` files coherent (no dead code, no duplicate helpers); copy in the app stays English, owner-facing text Turkish.

## Learned rules (weekly learning)
- **2026-W43**
  - Combined branch: on product's request, create `agent/dev/<yyyymmdd>-birlesik` from `origin/main`, `git merge --no-ff` each pending branch in date order, resolve conflicts, run the full test setup, push, write one owner card listing every PH item it closes. Later work that depends on unmerged code branches from it.
  - A run with nothing in `spec` also checks that every `review` branch still merges cleanly into `origin/main` (`git merge-tree --write-tree origin/main <branch>`); a conflict is fixed on the branch with a merge commit and noted on the items.
  - Apify output changes (W43): Instagram posts now have `sharesCount` (`reshareCount` deprecated, always empty); TikTok items may carry `isSponsored`. Read provider fields tolerantly: newest field first, then the old one, missing → `null` (shown as "—"), never `0`.
  - Do not migrate `hosted/wrangler.toml` from `[[migrations]]` to the new Durable Objects `exports` field, and do not bump `compatibility_date` as part of feature work; both are owner decisions.
  - Screenshots run on Cloudflare Browser Run: keep one browser per request, close it in `finally`, and keep the 429/`Retry-After` retry inside `withRetry` (limits: Free 10 min/day, 60 s idle timeout).
- **2026-W44**
  - Apify (Oct 2026): Instagram `isPinned` is now `false` instead of missing; Instagram `isSponsored` is deprecated and always `false` — never use it as a disclosure signal; TikTok `hasTikTokShopProduct` is only meaningful when present (missing = unknown). Instagram login-page URLs are skipped by the actor and return no item: our post-metrics call must turn an empty result into a clear "link not a post" message, not `0` metrics.
  - Post links are compared in normalized form (lower-case host, no trailing `/`, no `igsh`/`utm` parameters, `www.` removed). Use the actor's `ownerUsername` to warn when a link does not belong to the creator it is saved under.
  - Before stacking on a combined branch, run `git merge-tree --write-tree origin/main <branch>` and the full test setup on it; a stacked item is described in the same owner card, never in a new one.
- **2026-W45**
  - A sprint task that asks for branch verification is done on the waiting branch with the normal local setup: for each listed item, run the steps from its acceptance criteria, write one history line ("dalda doğrulandı: <what was checked>" or "dalda hâlâ var: <what fails>"), and mark the run `shipped` with the count. Fix nothing in that run; a "hâlâ var" item goes back to `spec`.
  - Apify (W45 check): no output change for our four actors since 16.10. Instagram `hashtags` entries are now the linked tag only (08.10); TikTok comments carry `images`/`sticker` (14.10, unused by us). No code change needed.
  - CI pins Python Playwright 1.56 (`deploy.yml`), agents use 1.63. Aligning them is PH-041 (P2); do not change CI versions as part of other work.
- **2026-W46**
  - A verification line "dalda hâlâ var" moves the item to `spec` in the same run (W46: PH-008 stayed in `review` for 7 days). The fix is one commit on the waiting combined branch — no new branch and no new owner card; update the `why` of the existing card with one sentence.
  - Apify TikTok (04.11): a profile behind TikTok's login wall now returns one item with `authorMeta` and a `note` ("Profile has videos, but TikTok returned none (login wall)") and no videos. `parseTiktokProfile` must then return followers with `er: null`, `sample: 0` and a reason the UI can show ("videolar alınamadı"), never ER `0` (PH-049). Instagram actors: no change since 16.10.
  - Do not wrap `Workspace` Durable Object calls in retry loops; the runtime retries them (05.11). `withRetry()` is only for provider calls.
- **2026-W47**
  - Evidence W47: PH-008's remaining fix and PH-050 went onto the waiting combined branch as single commits with no new branch or card; 5 no-op sprints while nothing was in `spec`. Correct; keep doing this.
  - Before each no-op sprint ends, run `git merge-tree --write-tree origin/main <combined>` and `git merge-tree --write-tree <combined> agent/dev/20261114-cop-gizli`; both clean on 22.11. A conflict is fixed on the branch the same day.
  - Apify (W47 check): Instagram `businessCategoryName` is now `null` instead of the text `"None"` (09.11). We do not read it; if it is ever shown, `null` → "—". TikTok actors: only a search-speed fix (11.11). No code change.
