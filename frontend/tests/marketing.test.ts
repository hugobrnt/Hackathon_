import test from "node:test";
import assert from "node:assert/strict";
import { insightsFor, liveInsights } from "../src/api/insights.ts";
import {
  adsFor,
  liveAds,
  totalBudget,
  type BoostInput,
} from "../src/api/ads.ts";
import {
  configureDemo,
  demoAccounts,
  demoPosts,
} from "../src/domains/demo/workspace.ts";
import { loadThemeEvidence } from "../src/domains/insights/evidence.ts";
import { sourceFor } from "../src/api/source.ts";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
});
function fresh() {
  memory.clear();
  configureDemo(["instagram", "linkedin"]);
  return demoAccounts();
}
const input: BoostInput = {
  ad_account_id: "act_1",
  budget_amount: 5,
  budget_type: "daily",
  duration_days: 3,
  goal: "engagement",
  name: null,
  start_paused: true,
  confirm: true,
};
test("F12 demo reports and source comments work offline for account and post scopes", async () => {
  const [a, b] = fresh(),
    original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Demo cannot access network");
  };
  try {
    const source = insightsFor("demo"),
      all = await source.latest(a.id, null),
      id = demoPosts(a.id)[0].post.id,
      one = await source.run(a.id, id);
    assert.deepEqual(
      one.categories.map((c) => c.category),
      ["objections", "feature_requests", "needs", "praise"],
    );
    assert.equal(one.post_id, id);
    assert.ok(
      all!.categories.reduce((n, c) => n + c.total_messages, 0) >
        one.categories.reduce((n, c) => n + c.total_messages, 0),
    );
    const theme = one.categories.find((c) => c.category === "feature_requests")!
      .themes[0];
    const evidence = await loadThemeEvidence(
      sourceFor("demo"),
      a.id,
      theme,
      new AbortController().signal,
    );
    assert.equal(evidence.comments.length, theme.mention_count);
    assert.equal(evidence.unavailable, 0);
    assert.ok(
      evidence.comments.every(
        (e) => theme.message_ids.includes(e.message.id) && e.post.id === id,
      ),
    );
    await assert.rejects(source.run(b.id, id), /not found/);
    const cached = await source.latest(a.id, id);
    assert.equal(cached?.run_id, one.run_id);
  } finally {
    globalThis.fetch = original;
  }
});
test("F9 demo creates only confirmed campaigns, persists history and simulates review without spending", async () => {
  const [a, b] = fresh(),
    id = demoPosts(a.id)[0].post.id,
    original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Demo cannot access network");
  };
  try {
    const source = adsFor("demo"),
      accounts = await source.accounts(a.id),
      payload = { ...input, ad_account_id: accounts[0].id };
    await assert.rejects(
      source.create(id, a.id, { ...payload, confirm: false }),
      /confirm/,
    );
    await assert.rejects(
      source.create(id, a.id, { ...payload, budget_amount: 20 }),
      /capped/,
    );
    const boost = await source.create(id, a.id, payload);
    assert.equal(boost.total_budget, 15);
    assert.equal(boost.status, "demo");
    assert.equal(boost.review_status, "pending_review");
    assert.equal(boost.ad_status, "PAUSED");
    assert.equal(boost.is_success, true);
    const refreshed = await source.refresh(boost.id, id, a.id);
    assert.equal(refreshed.review_status, "approved");
    assert.equal(refreshed.ad_status, "PAUSED");
    assert.equal((await source.history(id, a.id)).length, 1);
    assert.equal(
      (await source.history(demoPosts(b.id)[0].post.id, b.id)).length,
      0,
    );
    assert.equal(
      totalBudget({ ...input, budget_type: "lifetime", budget_amount: 25 }),
      25,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("F12 adapter reads exact scope and sends generation only on explicit run", async () => {
  const [a] = fresh(),
    report = await insightsFor("demo").run(a.id, null),
    original = globalThis.fetch,
    calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(report));
  };
  try {
    await liveInsights.latest(a.id, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, undefined);
    assert.ok(calls[0].url.includes("top=20"));
    await liveInsights.run(a.id, null);
    assert.equal(calls[1].init?.method, "POST");
    assert.equal(calls[1].url, "/api/insights/run");
    assert.deepEqual(JSON.parse(calls[1].init!.body as string), {
      account_id: a.id,
      post_id: null,
      top: 20,
    });
    await assert.rejects(liveInsights.latest(a.id, 42), /does not match/);
    assert.ok(calls[2].url.includes("post_id=42"));
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "No insights" }), { status: 404 });
    assert.equal(await liveInsights.latest(a.id, null), null);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "Service unavailable" }), {
        status: 503,
      });
    await assert.rejects(
      liveInsights.latest(a.id, null),
      /Service unavailable/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("F9 adapter sends reviewed payload once and preserves pending-review success", async () => {
  const [a] = fresh(),
    id = demoPosts(a.id)[0].post.id,
    account = (await adsFor("demo").accounts(a.id))[0],
    b = await adsFor("demo").create(id, a.id, {
      ...input,
      ad_account_id: account.id,
    }),
    boost = { ...b, status: "created" },
    original = globalThis.fetch,
    calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify(
        String(url).includes("/ads/accounts")
          ? [account]
          : String(url).endsWith("/boosts")
            ? [boost]
            : boost,
      ),
    );
  };
  try {
    await liveAds.accounts(a.id);
    assert.ok(calls[0].url.includes("account_id=" + a.id));
    await assert.rejects(
      liveAds.create(id, a.id, { ...input, confirm: false }),
      /confirm/,
    );
    assert.equal(calls.length, 1);
    const created = await liveAds.create(id, a.id, input);
    assert.equal(created.is_success, true);
    assert.equal(created.review_status, "pending_review");
    assert.equal(calls[1].url, `/api/posts/${id}/boost`);
    assert.equal(calls[1].init?.method, "POST");
    assert.deepEqual(JSON.parse(calls[1].init!.body as string), input);
    await liveAds.history(id, a.id);
    await liveAds.refresh(boost.id, id, a.id);
    assert.equal(calls[3].url, `/api/ads/boosts/${boost.id}/refresh`);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "Facebook Page required" }), {
        status: 422,
      });
    await assert.rejects(liveAds.accounts(a.id), /Facebook Page/);
  } finally {
    globalThis.fetch = original;
  }
});
test("campaign errors never trigger an automatic second create request", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("Network unavailable");
  };
  try {
    await assert.rejects(liveAds.create(1, "account", input), /Cannot reach/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("theme evidence rejects cross-account data and does not invent unavailable DM comments", async () => {
  const [a, b] = fresh(),
    report = await insightsFor("demo").run(a.id, null),
    theme = { ...report.categories[0].themes[0] },
    source = sourceFor("demo");
  theme.message_ids = [...theme.message_ids, 9999999];
  const result = await loadThemeEvidence(
    source,
    a.id,
    theme,
    new AbortController().signal,
  );
  assert.equal(result.unavailable, 1);
  await assert.rejects(
    loadThemeEvidence(
      {
        ...source,
        detail: async () => source.detail(demoPosts(b.id)[0].post.id),
      },
      a.id,
      theme,
      new AbortController().signal,
    ),
    /different account/,
  );
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ account_id: b.id, post_id: 1 }));
  try {
    await assert.rejects(liveAds.create(1, a.id, input), /does not match/);
  } finally {
    globalThis.fetch = original;
  }
});
