# Signal frontend

React + TypeScript + Vite, with Motion for React. The UI is in English.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:frontend
```

Open http://localhost:5173 and choose **Guided demo**, or use http://localhost:5173/?demo=1.

## Offline demo

The five-step onboarding shares the real flow: Account, Your offer (optional), Channels, Import, Ready, followed by a guided workspace tour. It never contacts Google, a social network, Zernio or the backend.

Connect one or several sample channels. Each channel has its own account, post and comment IDs. The workspace uses one brand and one product across them. Demo data and activity persist in browser storage; **Restart guided demo** replays onboarding. A new sample import resets the simulated outreach of the selected channels.

In Conversations, review a pending draft, **Simulate send**, then **Simulate a click**. Tracking updates from those local events. Approval, rejection, retryable failures, per-post rules, preview generation and idempotent comment processing use a separate offline adapter. Only eligible intent categories generate drafts; old comments and duplicate contacts are skipped. No real visit or DM is created.

Motion handles step transitions, progressive channel cards, import progress and a seven-step anchored workspace tour. The tour highlights each target, follows scrolling/resizing, waits for feature filtering / simulated sending / simulated clicking, and opens Tracking for the result. Back, skip, Escape and **Replay workspace tour** are available; it yields to post-detail dialogs. Reduced-motion preferences are respected. See [Motion installation](https://motion.dev/docs/react-installation) and [accessibility](https://motion.dev/docs/react-accessibility).

## Connected accounts and F7–F8

Start the backend on port 8000. Connect/import accounts using the existing Zernio flow.

Conversations is an **outgoing DM activity view**, not a two-way chat inbox; the backend does not expose incoming replies as conversation threads.

| View/action                       | Backend                                      |
| --------------------------------- | -------------------------------------------- |
| DM history, status filters        | GET /auto-dm/attempts?account_id=…&limit=500 |
| Product context                   | GET/PUT /accounts/{account_id}/product       |
| Per-post automation               | GET/PUT /posts/{post_id}/auto-dm             |
| DM preview                        | POST /messages/{message_id}/auto-dm/preview  |
| Process eligible comments         | POST /posts/{post_id}/auto-dm/run            |
| Approve/edit/send, retry          | POST /auto-dm/attempts/{id}/approve          |
| Reject a pending message          | POST /auto-dm/attempts/{id}/reject           |
| Human clicks / bot previews       | GET /tracking/links?account_id=…             |
| CTR totals and per-post breakdown | GET /tracking/stats?account_id=…             |

Real sends and enabling live rules have a review dialog. Runs use saved server settings, not unsaved form controls. Retry is offered only for retryable failures. Backend eligibility, deduplication, time windows and delivery decisions remain authoritative.

The UI polls visible DM activity every 15 seconds, pauses polling during mutations, and cancels stale reads. Errors do not fall back to demo data. Draft edits survive polling. The inbox is explicitly limited to the latest 500 attempts; tracking totals come from the full backend aggregation.

Tracking links are displayed/copied, never automatically opened or prefetched. Localhost tracking URLs are flagged: use a publicly reachable backend tracking base URL to count prospects' clicks. UTM destination fallbacks do not provide redirect counts to this API.

## One brand, one product, multiple channels

Brand context is shared locally instead of keyed per channel. Product configuration is edited once in Conversations → Automation and saved to every connected account, adapting to the backend's per-account product model. Partial failures are reported; conflicting/missing product copies are surfaced and can be reconciled by saving again. Newly connected channels are included on the next save.

Posts and Insights default to all connected channels, with a per-channel filter and an expandable breakdown. Metrics aggregate comment counts, not average percentages. Failed channels are identified and excluded explicitly. Detail retrieval validates each requested account/post pair. Source comments display their channel.

DM activity and tracking use the account selected in the sidebar. Every DM lists its channel, account and source-post title, repeated in the detail panel. Posts carry channel/account labels in table, leaderboard and CSV; the channel filter persists through post-detail navigation.

## Metrics and limits

Purchase intent = purchase-intent comments / all imported incoming non-owner comments, including neutral/spam and unclassified comments. DMs and brand replies are excluded.

DM CTR = successfully sent DMs with at least one human click / successfully sent DMs. Repeated clicks increase clicks, not clicked DMs. Preview-only links and bot hits do not inflate CTR. No purchase attribution is claimed.

The Posts list focuses on purchase intent and actions. Platform metrics stay in detail; formula explanations live in tooltips/Data & definitions. Boost uses F9 campaign creation; Similar ad remains disabled.

Incoming chat replies and publication remain outside the connected API features. Email/password authentication and reply settings now persist in SQLite.

For large accounts, add backend pagination and aggregated cross-channel insight endpoints rather than fetching every post detail (currently bounded to four concurrent requests).

## Configuration

Copy .env.example to .env.local if needed.

- VITE_API_TARGET: dev proxy destination (default http://localhost:8000).
- VITE_API_BASE: browser-visible API base (default /api). Production needs a reverse proxy stripping /api, or a configured public API URL.
- Backend FRONTEND_URL must match the browser origin for OAuth.
- Keep backend API keys out of frontend environment variables.

## Validation

```sh
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm build:frontend
```

Node 24+ is recommended. Tests cover metric denominators, weighted rates, UTC dates, demo isolation, DM lifecycle/idempotency, CTR, F7/F8 HTTP contracts, cross-channel evidence and partial product synchronization. External sends are mocked in tests.

## F12 product insights

Connected mode reads `GET /insights?account_id=…&post_id=…&top=20` and generates reports only after an explicit click via `POST /insights/run`. A 404 means no saved report for this exact scope; other errors are shown. Global view gathers the account reports without pretending to merge independently generated themes. Each row retains its channel, run date and grouping method (AI or heuristic).

The API supports objections, feature requests, needs and praise, covering classified incoming comments and DMs. It currently selects up to 150 messages per category/account and returns up to 20 themes. Counts are messages, not people or purchases. GET totals are calculated by the backend from current classifications, whereas themes belong to the saved run. Refresh to regenerate them together. Empty runs have no persisted theme rows in the current backend, so an empty report may require regeneration after reloading.

Rows show backend titles, summaries and quotes. Source comments are resolved lazily through F6 using the report’s message/post IDs, with account validation and four concurrent reads maximum. DM sources absent from post detail are not invented. Missing reports and partial channel failures are explicit. Demo uses the same report shape with isolated local grouping and storage; live never falls back to local themes.

## F9 Boost

The Boost dialog loads `GET /ads/accounts?account_id=…` and `GET /posts/{id}/boosts`, then collects an ad account, goal, budget type/amount and duration. A separate review step shows the total and delivery choice before `POST /posts/{id}/boost` with `confirm: true`. Creation defaults to paused. Active creation requires a known ad-account currency. The backend enforces its configured budget cap and platform constraints; errors such as missing linked Facebook Page are displayed.

Created/pending-review campaigns count as successful creations, not active delivery. History shows request, delivery and review statuses. `POST /ads/boosts/{id}/refresh` updates an existing campaign’s status. No create request is automatically retried; after an error the user must inspect/reload history before submitting again. The server generates a fresh idempotency key for each new create request, so the UI locks concurrent submissions and offers a distinct “Create another boost” action after success.

Demo campaigns never contact the backend or Zernio. They persist locally, use EUR and a simulated 50 EUR cap, and can move from pending review to approved using “Simulate review”. These local values do not override live server configuration. Validation uses mocked campaign requests and offline simulation; no real campaign is created by automated tests.


## Account and onboarding

The local installation has **one brand workspace and one owner**. SQLite persists a scrypt password hash and hashed, revocable seven-day sessions; the session token stays in an HttpOnly SameSite cookie. The first registration claims this installation, including existing social accounts. Further registrations are closed: sign in with the existing owner. This is not multi-tenant hosting. There is no Google login, email verification or self-service password reset yet.

Restart the backend after updating. Use the exact `FRONTEND_URL` origin (default `http://localhost:5173`), and enable HTTPS in deployment so cookies are Secure. Cross-origin API hosting must use compatible cookie domains and CORS; the Vite `/api` proxy is the recommended local setup. Private routes require a session; signed Zernio webhooks and public tracked-link redirects remain reachable. OAuth callbacks use expiring, single-use state and verify the account against Zernio.

Create an account and Guided demo share Account → Your offer → Channels → Import → Ready. Offer context is optional; its draft stays in this browser until saved to connected channels before import. Real imports and classification must finish successfully before a channel is shown as ready; failures are retryable. The live flow resumes at Channels after OAuth. Demo is isolated and sends nothing. A brief Demo badge distinguishes it; the landing describes the product rather than its fixtures.

The social catalog includes Instagram, LinkedIn, Facebook, TikTok, X, YouTube, Pinterest, Reddit, Threads, Bluesky, Google Business Profile and Snapchat. Snapchat requires Zernio closed-beta access. Bluesky uses credentials rather than our hosted OAuth path: connect it in Zernio and refresh accounts. Metrics, comments and DM support differ by network. Logos do not imply every feature is supported everywhere.

Conversations → Reply settings persists tone, objective and comma-separated human-review keywords per connected channel. These preferences feed DM generation; matching terms require approval even when a post is automatic. Draft/automatic delivery stays explicit per post. Saving preferences does not send messages or rewrite existing drafts.
