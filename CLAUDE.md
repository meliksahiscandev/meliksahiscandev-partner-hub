# Partner Hub — notes for Claude

Owner: Meliksah (Games Medya). He writes Turkish; answer in Turkish. Product copy in the app is English; Ops Center and owner-facing notes are Turkish.

## What runs where
- `src/` is the single source of the UI. `python3 build.py` produces two outputs:
  - `partner-hub.html` — the claude.ai Artifact (https://claude.ai/artifact/MnvVs9ffRfaDvEYLV2e7kD), uses the artifact runtime (db/user/assets/sample/downloads/mcp).
  - `hosted/public/index.html` — the Cloudflare version; `hosted/client/runtime.js` implements the same `window.claude.use(name)` API on top of the server and sets `window.__HOSTED__`. Code paths that differ check `HOSTED`.
- `hosted/src/worker.js`: Worker + one SQLite Durable Object (`Workspace`, name `main`). Tables: users, sessions, docs (path, col, data JSON, version, seq), blobs (1 MB chunks), blob_meta, meta, throttle. Clients sync with `/api/db/sync?since=<seq>` and get a WebSocket nudge (`/ws`) on every change. `filetext` is lazy (fetched by `/api/db/doc`, never pushed).
- Roles (`access()` in worker.js, `computeAccess` in core.js — keep them identical): agency owner | admin | member with `perm` edit|view; customer per partnership admin | edit | view (invite `role` admin|member + `access` edit|view; legacy approver=edit, viewer=view). Finance: owner + agency admins (hosted), owner only in the artifact. Agency members: no finance, invites without codeHash, partnership summary budget stripped; view members write nothing but their own member doc and audit events.
- Permissions live in `readFilter` and `canWrite`. Customers: only their partnerships; never finance; influencer `fetched/fSource/erSource` stripped; writes limited to approvals/comments (own comments only, resolve allowed) and masterfile final approval while `in_review`. Audit events written by non-admins get `by` forced to the caller.
- Providers: Claude (`/api/claude`, model `CLAUDE_MODEL` or claude-sonnet-5-5), Apify (`apify~instagram-profile-scraper`, `clockworks~tiktok-profile-scraper`, `apify~instagram-scraper`, `clockworks~tiktok-scraper`), Browser Rendering screenshots (`/api/social/capture`), Resend email (`/api/email`, only to invited addresses). `STUB_PROVIDERS=1` stubs all of them for tests.
- `/api/health` is public and non-sensitive: version, feature flags, counts, errors in the last 24 h, storage, and per-provider call counts/latency (`providers`, numbers only).
- Every provider call goes through `upstream()`/`withRetry()` (retry 429/5xx/529 with backoff, timeouts, counters). Never call `fetch` to a provider directly. In stub mode `/api/test/fault` (owner only) queues injected failures for `test/reliability.mjs`. `.github/workflows/probe.yml` measures the real providers weekly (label a PR `probe` to run it on demand).

## Design
- Dark "signal" theme in `src/styles.css`: dark tokens on bare `:root` (default), light under `:root[data-theme="light"]` (sidebar "Light mode" switch, saved as `ph-theme`). Fonts: Geist (UI), Chakra Petch (numbers, page titles), Geist Mono (handles, codes). The signal gradient (cyan → violet → magenta) is reserved for progress: stage path, bars (sized to the track so colour = position on the scale), active tab and nav item. Status colours only for state. No uppercase labels. `hosted/client/login.html` mirrors the tokens.

## Rules
- Never put keys, passwords or tokens in the repo, the page, docs or the Ops Center. Secrets are GitHub Actions secrets copied to the Worker at deploy.
- Never weaken a server permission to make a UI flow work; change the UI or add a narrowly checked endpoint.
- Every change: `python3 build.py`, `node --check` the three JS files, run `test/e2e.py`, `test/hosted_e2e.py` and then `node test/reliability.mjs` on the same local server (see README). All must end with `0 failed`.
- Deploy = merge to `main` (GitHub Actions `Deploy`). Agents never push to `main`; they push `agent/...` branches and leave an owner card with the compare link. The owner merges.
- The `SEED` in `hosted/wrangler.toml` only applies to an empty workspace. Never change or remove the Durable Object migration tags.

## Ops Center and agents
See `agents/README.md`. Dashboard URL is in `agents/dashboard.url`.
