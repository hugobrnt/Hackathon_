# Signal — how to run the app (for the judges)

Signal reads the comments and DMs of a brand on social media, finds the purchase intent, ranks the posts that
sell, and turns buyers into conversations with a personalized DM.

**We recommend the guided demo.** It runs fully in your browser, with sample data. You do not need an API key,
a social account or the backend.

---

## 1. Guided demo (5 minutes, recommended)

### Prerequisites

- [Node.js](https://nodejs.org) 22 or later.
- pnpm. If the `pnpm` command is not found, run:

  ```sh
  corepack enable
  ```

### Start the app

From the root of the repository:

```sh
pnpm install
pnpm dev:frontend
```

Open **http://localhost:5173/?demo=1**.

You can also open http://localhost:5173 and click **Guided demo**.

> The demo never contacts the backend, Zernio or a social network. No real DM is sent and no real visit is
> counted. The demo data stays in your browser.

### What to try

1. **Onboarding (5 steps).** Create the demo account, describe the offer (optional), connect one or more
   sample channels, import the posts, then start the guided tour of the workspace.
2. **Dashboard and Posts.** The posts are ranked by purchase intent, not by likes. Open a post to see the
   intent breakdown (purchase, pre-purchase question, objection, feature request, praise, support) and the key
   comments.
3. **Insights.** The comments grouped into themes: reasons to hesitate, questions before buying, feature
   requests and positive feedback, with real quotes.
4. **Conversations.** Review a draft DM written for a buyer, click **Simulate send**, then **Simulate a click**.
5. **Tracking** (tab in Conversations). See the DMs sent, the clicks and the DM click-through rate update.

To start again, use **Restart guided demo**. To see the tour again, use **Replay workspace tour**.

---

## 2. Optional: the backend API on your machine

The backend (FastAPI) has its own demo dataset. It also works without any API key: in that case, it uses
keyword rules instead of the LLM.

### Prerequisites

- Python 3.13.
- [uv](https://docs.astral.sh/uv/getting-started/installation/).

### Start the backend

In a second terminal:

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Open the API documentation at **http://localhost:8000/docs**. Then try these calls in this order (button
**Try it out** in the documentation):

1. `POST /demo/load`: loads a demo Instagram account (3 posts, 19 comments, 4 DMs, 3 products).
2. `GET /analytics/posts?account_id=demo-instagram`: the posts ranked by Intent Score.
3. `GET /analytics/posts/{post_id}`: the detail of one post, with its key comments.
4. `POST /insights/run` with `{"account_id": "demo-instagram"}`: the themes of the comments.
5. `POST /insights/post-ideas` with `{"account_id": "demo-instagram"}`: 3 post ideas from these themes.

To run the tests:

```sh
cd backend
uv run pytest
```

---

## 3. Optional: real accounts

This part is not necessary to evaluate the project. It needs your own keys:

1. Copy `backend/.env.example` to `backend/.env` and fill in the values:
   - `ZERNIO_API_KEY`: a [Zernio](https://zernio.com) API key, with an Instagram Business account connected.
   - `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`: Cloudflare Workers AI, for the LLM features.
   - `ZERNIO_WEBHOOK_SECRET`: any long random string (`openssl rand -hex 32`).
2. Zernio must reach your machine for the real-time webhooks. Start a tunnel and put its URL in
   `PUBLIC_BASE_URL` and `TRACKING_BASE_URL`:

   ```sh
   cloudflared tunnel --url http://localhost:8000
   ```

3. Restart the backend, then register the webhook with `POST /webhooks/register`.

---

## Troubleshooting

| Problem | Solution |
| --- | --- |
| `pnpm: command not found` | Run `corepack enable`, then try again. |
| Port 5173 or 8000 is already used | Stop the other process, or start Vite with `pnpm --filter frontend dev --port 5174`. |
| The demo shows old data | Click **Restart guided demo**, or clear the site data of `localhost:5173` in your browser. |
| `uv: command not found` | Install uv: `curl -LsSf https://astral.sh/uv/install.sh \| sh`. |
