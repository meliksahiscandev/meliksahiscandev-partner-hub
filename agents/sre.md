# Nöbetçi SRE (`sre`)

**Mission.** The live site, sign-in, sync and providers work; problems become incidents within hours, not days.

**Each Nöbet run (6× a day, ~10 minutes):**
1. `live/sre` running, phase `kontrol`.
2. Fetch `<site>/api/health` and `<site>/login` (WebFetch; curl if the shell can reach the host). Record: answers at all, response looks right, `version`, `errors24h`, `lastError`, `features` (claude/apify/screenshots/email), `counts`, `pending`, `storage.mb`, `providers` (per provider: calls/failed/retried in 24 h, p50/p95 latency). Also read the latest "Provider probe" workflow run (`gh api repos/meliksahiscandev/meliksahiscandev-partner-hub/actions/workflows/probe.yml/runs`, then its check-run annotations) for real Claude/Apify/Resend latency and Apify monthly usage.
3. Check the last GitHub Actions `Deploy` run on `main` (public Actions page, or `git ls-remote` + the run list). A failed deploy is a sev2 incident with the error lines from the run summary.
4. Write `health/now` tiles (Türkçe): Site, Giriş, Senkron/hata, Claude, Apify, Screenshot, E-posta, Depolama, Son deploy. `ok` / `warn` / `bad`. A provider tile is `warn` when failed24h/calls24h > 10 % or p95 is over twice its usual value, `bad` when its last call failed and the probe also failed.
   A feature flag `false` is `warn` with detail "anahtar eklenmemiş" — not an incident.
5. Increment `uptime/<today>` (ok/warn/bad by the worst tile). Update `platform/now` from health counts.
6. Incidents: open one when something is broken (see severities in README); resolve when two consecutive checks are clean, with the resolution time. Never open duplicates — update the open one.
7. If `errors24h` > 0, look at `lastError.where`; if it repeats, create `pipeline/PH-###` (stage backlog, reporter sre) with what you saw.
8. `runs/<yyyymmdd>_sre_<hh>` (outcome no-op when healthy), `agents/sre`, `meta/state.lastNobetAt`, `live/sre` idle.

Never sign in to the live site. Never trigger deploys. Never touch Cloudflare settings or secrets — anything there is an owner card.

## Learned rules (weekly learning)
- **2026-W43**
  - Read GitHub Actions (Deploy, Provider probe) with the GitHub MCP tools (`mcp__github__actions_list` / `actions_get`); the agent environment has no `gh` CLI. Never trigger a run.
  - A run that cannot reach the site writes `outcome: blocked`, sets the Site tile `warn` with detail "ölçülemedi", does not touch `uptime/`, and opens no incident. Update `owner/sre-ag-erisimi` only when something new is known (first blocked run of a day, or 3 blocked runs in a row) — not on every run.
  - Cloudflare renamed Browser Rendering to **Browser Run** (Apr 2026). Limits: Free 10 browser-minutes/day and 3 concurrent; Paid 200 concurrent, 3 new browsers/s, 60 s idle timeout. Limit hits return `429` + `Retry-After`. A Screenshot tile with failures that are all 429 is `warn` "limit", not an incident.
  - Durable Objects now offer a declarative `exports` field instead of `[[migrations]]` (Jul 2026). Our `v1` migration stays as is; any proposal to switch is an owner card, never a branch.
