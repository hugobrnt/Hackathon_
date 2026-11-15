import test from "node:test";
import assert from "node:assert/strict";
import { needsReconnection } from "../src/domains/accounts/connection-status.ts";
import { api } from "../src/api/client.ts";
import type { SocialAccount } from "../src/api/types.ts";
const account: SocialAccount = { id: "acc-1", platform: "instagram", username: "hugo", profile_id: null, is_demo: false, connected_at: "2026-11-15", last_imported_at: null };

test("either provider failure flag requires reauthorization; demo stays usable", () => {
  assert.equal(needsReconnection({...account, is_active: false}), true);
  assert.equal(needsReconnection({...account, is_active: true, needs_reconnection: true}), true);
  assert.equal(needsReconnection({...account, is_active: true, needs_reconnection: false}), false);
  assert.equal(needsReconnection({...account, is_demo: true}), false);
});

test("reconnect requests target the exact account and preserve the chosen login method", async () => {
  const original = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (url) => { requested = String(url); return new Response(JSON.stringify({auth_url:"https://zernio.com/connect"}), {status:200}); };
  try {
    await api.connect("instagram", "facebook_login", "acc-1");
    const url = new URL(requested, "https://signal.test");
    assert.equal(url.pathname, "/api/accounts/connect/instagram");
    assert.equal(url.searchParams.get("reconnect_account_id"), "acc-1");
    assert.equal(url.searchParams.get("login_method"), "facebook_login");
    await api.connect("instagram");
    assert.equal(new URL(requested,"https://signal.test").search, "");
  } finally { globalThis.fetch = original; }
});
