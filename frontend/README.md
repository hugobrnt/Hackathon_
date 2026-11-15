# Signal frontend

React + TypeScript + Vite, with Motion for React. The UI is in English.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:frontend
```

Open http://localhost:5173 and choose **Start the guided demo**, or use http://localhost:5173/?demo=1.

## Offline demo

The six-step onboarding includes simulated sign-in, optional brand context, simulated channel authorizations, sample import/classification, product configuration and a guided workspace tour. It never contacts Google, a social network, Zernio or the backend.

Connect one or several sample channels. Each channel has its own account, post and comment IDs. The workspace uses one brand and one product across them. Demo data and activity persist in browser storage; **Restart guided demo** replays onboarding. A new sample import resets the simulated outreach of the selected channels.

In Conversations, review a pending draft, **Simulate send**, then **Simulate a click**. Tracking updates from those local events. Approval, rejection, retryable failures, per-post rules, preview generation and idempotent comment processing use a separate offline adapter. Only eligible intent categories generate drafts; old comments and duplicate contacts are skipped. No real visit or DM is created.

Motion handles step transitions, progressive channel cards, import progress and the workspace guide. Reduced-motion preferences are respected. See [Motion installation](https://motion.dev/docs/react-installation) and [accessibility](https://motion.dev/docs/react-accessibility).

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

Insights defaults to all connected channels, with a per-channel filter and an expandable breakdown. Metrics aggregate comment counts, not average percentages. Failed channels are identified and excluded explicitly. Detail retrieval validates each requested account/post pair. Source comments display their channel.

Other account-scoped views, including DM activity and tracking, use the account selected in the sidebar.

## Metrics and limits

Purchase intent = purchase-intent comments / all imported incoming non-owner comments, including neutral/spam and unclassified comments. DMs and brand replies are excluded.

DM CTR = successfully sent DMs with at least one human click / successfully sent DMs. Repeated clicks increase clicks, not clicked DMs. Preview-only links and bot hits do not inflate CTR. No purchase attribution is claimed.

The Posts list focuses on purchase intent and actions. Platform metrics stay in detail; formula explanations live in tooltips/Data & definitions. Boost has no ad-buying integration and Similar ad is disabled.

Incoming chat replies, user authentication, publication and paid promotion remain outside the connected API features. Brand-voice fields are local; product facts used for DMs are persisted server-side.

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
