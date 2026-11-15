# Signal frontend

English interface for the F1–F6 FastAPI backend, using React, TypeScript and Vite. No additional runtime dependencies.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:frontend
```

Open http://localhost:5173 and choose **Explore the demo**, or open http://localhost:5173/?demo=1 directly.

**The offline demo needs no backend, Zernio credentials, Instagram account or external asset request.** Its 8 posts and source comments use the API's shapes and score formulas. Demo replies and brand context stay in browser local storage. The mode selector switches explicitly between demo and connected accounts; API failures never silently display fake data.

## Connected accounts

Start the existing backend on port 8000 (see root README). Use **Connect my channels → optional brand context → channel authorization → import**. Refresh accounts also discovers channels already authorized in Zernio.

The five available connection buttons reflect the backend's SupportedPlatform enum: Instagram, LinkedIn, Facebook, TikTok and X. OAuth redirects through the existing backend callback. API credentials are never requested or bundled by the frontend.

| View           | Source and capabilities                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Dashboard      | F4/F5 ranking data; weighted account indicators and category counts                                   |
| Posts          | F5 response; local sort/filter, minimum sample size, table/leaderboard and CSV export                 |
| Post detail    | F6; platform metrics, intent distribution, source comments and classification evidence                |
| Insights       | F6 comments, loaded with at most 4 concurrent requests; category filtering, evidence links and search |
| Analytics      | F6 comment timestamps; 8 weekly UTC buckets and weighted 28-day comparison                            |
| Conversations  | Clearly marked local reply simulation in demo; unavailable state in connected mode                    |
| Enrich profile | Optional browser-local form; not yet sent to the classifier                                           |

Connected data refreshes from the local backend every 15 seconds while visible. **Sync content** starts an actual Zernio import. Classification may complete asynchronously. The Data & definitions screen provides manual pending classification and metric definitions.

No user authentication, live DM sending, product-event attribution, automatic publication or ad buying is invented in this frontend. These need backend endpoints. This is a local hackathon workspace, not a multi-tenant authenticated deployment.

## Metric rules

- Purchase intent rate = purchase-intent comments / **all imported incoming non-owner comments**, including neutral/spam and unclassified comments. DMs and brand replies are excluded.
- Account-level rate is a weighted ratio of counts, not an average of post percentages.
- Intent score = (3 × purchase intent + 2 × pre-purchase questions + objections) / audience comments.
- Null metrics appear as an em dash; totals label available coverage. Observed zero is not missing.
- Timeline uses comment dates, not cumulative post metrics. Undated comments are excluded; later classification changes can revise past rates.
- Comparison shows percentage-point change in expressed intent, not causal uplift or attributed sales.
- Client sorting mirrors backend tie-breaks. A minimum comment threshold helps avoid rankings dominated by tiny samples.
- Browser-local profile and simulated replies are stored separately from backend data.

For large accounts, replace the current bounded detail fetch with backend paginated/aggregated insights and timeline endpoints. This avoids refetching all comments while keeping metric definitions centralized.

## Configuration

Copy `.env.example` to `.env.local` if needed.

- `VITE_API_TARGET`: development proxy destination (default http://localhost:8000).
- `VITE_API_BASE`: browser-visible API base URL (default /api). A production reverse proxy must forward /api and strip the prefix; the Vite dev proxy does not exist in the production build.
- Backend `FRONTEND_URL` must match the browser's origin for the OAuth callback.

Hash routes work without server-side route rewriting. Post detail URLs carry account and post IDs. Mode and profile settings persist locally; do not put secrets in them.

## Checks

```sh
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm build:frontend
```

Tests use Node's built-in TypeScript support (Node 24+ recommended). They cover denominator exclusions, weighted aggregation, missing metrics, ranking tie-breaks, UTC date boundaries and reconciliation of demo evidence with displayed rates.

All visual assets and the Inter font are served from public/assets. The font license is included.
