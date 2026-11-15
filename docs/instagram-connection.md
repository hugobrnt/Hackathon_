# Instagram connection troubleshooting

Signal currently enables Instagram connection in its UI. Other Zernio platforms remain visible but disabled, including in the demo.

## Running on another machine or a shared URL

`FRONTEND_URL` must be the exact origin used to open Signal (including scheme and port). State-changing requests from another origin are rejected. `PUBLIC_BASE_URL` must reach the backend from the browser completing OAuth; the return endpoint is `/accounts/callback`. Signal then redirects to `FRONTEND_URL`.

The defaults `http://localhost:5173` and `http://localhost:8000` work only when that browser can reach the same frontend/backend on its own machine. Sharing a frontend tunnel does not expose the backend callback. Configure both addresses and restart the backend. If a reverse proxy exposes `/api` to the backend, `PUBLIC_BASE_URL=https://signal.example/api` is valid only if `/api/accounts/callback` actually reaches `/accounts/callback`. Keep the same SQLite database throughout authorization; it holds the expiring connection state.

Do not derive trusted redirect destinations from arbitrary request headers or disable origin checks to fix this.

## Provider authorization

Use an Instagram Business or Creator account. Complete permission consent, then click Continue on Zernio's exit page to return to Signal. The alternative “Connect Instagram through Facebook” requires a linked Facebook Page. A normal Instagram login without completing authorization is insufficient.

If Signal receives an error, the connection screen displays the provider message/code and any `request_id` and `stage` supplied by Zernio. Share these identifiers for diagnosis, never tokens or passwords. “Check connection” imports already authorized accounts; it cannot grant missing permissions or repair an unreachable callback.

Source: https://docs.zernio.com/connect/get-connect-url
