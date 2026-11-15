import { readDemoCatalog } from "../src/domains/products/demo-catalog.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { outreachFor, liveOutreach } from "../src/api/outreach.ts";
import {
  demoOutreach,
  resetDemoOutreach,
  simulateClick,
} from "../src/domains/demo/outreach.ts";
import {
  configureDemo,
  demoAccounts,
  demoPosts,
} from "../src/domains/demo/workspace.ts";
import { trackingStats, canApprove } from "../src/domains/community/model.ts";
import {
  saveBrandProduct,
  productsDiffer,
} from "../src/domains/community/brand-product.ts";
import { loadEvidence, sourceFor } from "../src/api/source.ts";
import type { ProductInput } from "../src/api/outreach-types.ts";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
});
const product: ProductInput = {
  business_type: "saas",
  name: "One brand product",
  landing_url: "https://product.example",
  description:
    "A single product sold through multiple channels with one consistent offer.",
};
function fresh() {
  memory.clear();
  configureDemo(["instagram", "linkedin"]);
  resetDemoOutreach();
  return demoAccounts();
}
test("the entire demo DM lifecycle works offline and click-through rate counts clicked DMs, not repeated clicks", async () => {
  const accounts = fresh(),
    id = accounts[0].id,
    original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network must not be used by demo");
  };
  try {
    const before = await outreachFor("demo").load(id);
    const pending = before.attempts.find(
      (a) => a.status === "pending_approval",
    )!;
    const productId = readDemoCatalog(id)[0].id;
    await assert.rejects(
      demoOutreach.approve(pending.id, pending.text),
      /Choose an active product/,
    );
    const draft = await demoOutreach.preview(pending.message_id, productId);
    await demoOutreach.approve(pending.id, draft.text, productId);
    simulateClick(pending.id);
    simulateClick(pending.id);
    const after = await demoOutreach.load(id);
    assert.equal(after.stats.dms_sent, before.stats.dms_sent + 1);
    assert.equal(after.stats.links_clicked, before.stats.links_clicked + 1);
    assert.equal(after.stats.clicks, before.stats.clicks + 2);
    assert.equal(
      after.stats.click_through_rate,
      Math.round((after.stats.links_clicked / after.stats.dms_sent) * 10000) /
        10000,
    );
    await assert.rejects(
      demoOutreach.approve(pending.id, pending.text),
      /current status/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("rejection and retry capabilities follow backend states", async () => {
  const [a] = fresh(),
    s = await demoOutreach.load(a.id),
    pending = s.attempts.find((a) => a.status === "pending_approval")!,
    failed = s.attempts.find((a) => a.status === "failed")!;
  assert.equal(canApprove({ ...failed, retryable: false }), false);
  assert.equal(canApprove(failed), true);
  await demoOutreach.reject(pending.id);
  await assert.rejects(
    demoOutreach.approve(pending.id, pending.text),
    /current status/,
  );
  assert.equal(
    (await demoOutreach.approve(failed.id, failed.text)).status,
    "sent",
  );
});
test("processing is idempotent and preview never sends a DM", async () => {
  const [a] = fresh(),
    post = demoPosts(a.id)[0],
    initial = await demoOutreach.load(a.id);
  await demoOutreach.preview(post.comments[9].id);
  assert.equal(
    (await demoOutreach.load(a.id)).attempts.length,
    initial.attempts.length,
  );
  const first = await demoOutreach.run(post.post.id),
    second = await demoOutreach.run(post.post.id);
  assert.ok(first.processed > 0);
  assert.equal(first.sent, 0);
  assert.equal(second.processed, 0);
});
test("one product is saved across channels and isolated demo accounts have distinct evidence", async () => {
  const accounts = fresh();
  assert.equal(
    await saveBrandProduct(
      demoOutreach,
      accounts.map((a) => a.id),
      product,
    ),
    2,
  );
  const products = await Promise.all(
    accounts.map((a) => demoOutreach.product(a.id)),
  );
  assert.equal(productsDiffer(products), false);
  assert.ok(
    accounts.every((a) =>
      readDemoCatalog(a.id).some((p) => p.title === product.name),
    ),
  );
  const posts = accounts.flatMap((a) => demoPosts(a.id));
  assert.equal(new Set(posts.map((p) => p.post.id)).size, 16);
  const details = await loadEvidence(
    sourceFor("demo"),
    posts,
    new AbortController().signal,
  );
  assert.equal(details.length, 16);
  assert.equal(new Set(details.map((p) => p.post.account_id)).size, 2);
});
test("partial product writes are reported rather than claiming all channels were saved", async () => {
  const accounts = fresh(),
    saved: string[] = [];
  const source = {
    ...demoOutreach,
    saveProduct: async (id: string, input: ProductInput) => {
      if (id === accounts[1].id) throw new Error("Unavailable");
      saved.push(id);
      return demoOutreach.saveProduct(id, input);
    },
  };
  await assert.rejects(
    saveBrandProduct(
      source,
      accounts.map((a) => a.id),
      product,
    ),
    /1\/2 channels/,
  );
  assert.deepEqual(saved, [accounts[0].id]);
});
test("pending and rejected preview links never inflate sent-DM tracking", async () => {
  const [a] = fresh(),
    s = await demoOutreach.load(a.id),
    pending = s.attempts.find((a) => a.status === "pending_approval")!;
  const links = s.links.map((l) =>
    l.message_id === pending.message_id ? { ...l, click_count: 999 } : l,
  );
  assert.deepEqual(trackingStats(s.attempts, links), s.stats);
});
test("live adapter uses F7/F8 account-scoped read endpoints and correct write methods", async () => {
  const [a] = fresh(),
    snapshot = await demoOutreach.load(a.id),
    calls: { url: string; method: string; body: unknown }[] = [],
    original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    calls.push({
      url: path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const value = path.includes("/auto-dm/attempts?")
      ? snapshot.attempts
      : path.includes("/tracking/stats")
        ? snapshot.stats
        : path.includes("/tracking/links")
          ? snapshot.links
          : path.includes("/products")
            ? init?.method === "POST"
              ? {
                  ...readDemoCatalog(a.id)[0],
                  ...JSON.parse(String(init.body)),
                }
              : readDemoCatalog(a.id)
            : path.includes("/preview")
              ? {
                  text: "Draft",
                  writer: "template",
                  tracked_link_code: null,
                  tracked_url: null,
                }
              : path.endsWith("/run")
                ? {
                    processed: 0,
                    sent: 0,
                    pending_approval: 0,
                    skipped: 0,
                    failed: 0,
                    attempts: [],
                  }
                : path.includes("/attempts/")
                  ? snapshot.attempts[0]
                  : {
                      post_id: 1,
                      enabled: true,
                      require_approval: true,
                      landing_url: null,
                      updated_at: "2026-11-15T00:00:00Z",
                    };
    return new Response(JSON.stringify(value), { status: 200 });
  };
  try {
    await liveOutreach.load(a.id);
    await liveOutreach.saveProduct(a.id, product);
    await liveOutreach.saveSettings(1, {
      enabled: true,
      require_approval: true,
      landing_url: null,
    });
    await liveOutreach.preview(1000);
    await liveOutreach.run(1);
    await liveOutreach.approve(1000, "Edited text");
    await liveOutreach.reject(1000);
    assert.ok(
      calls.some(
        (c) =>
          c.url === "/api/auto-dm/attempts?account_id=" + a.id + "&limit=500",
      ),
    );
    assert.ok(
      calls.some((c) => c.url === "/api/tracking/stats?account_id=" + a.id),
    );
    assert.ok(
      calls.some(
        (c) =>
          c.url.endsWith("/products") &&
          c.method === "POST" &&
          (c.body as { title: string }).title === product.name,
      ),
    );
    assert.deepEqual(calls.find((c) => c.url.endsWith("/approve"))?.body, {
      text: "Edited text",
    });
    assert.equal(calls.find((c) => c.url.endsWith("/preview"))?.method, "POST");
    assert.equal(calls.find((c) => c.url.endsWith("/reject"))?.method, "POST");
  } finally {
    globalThis.fetch = original;
  }
});
test("empty catalogs are empty states; server failures and cross-account data remain errors", async () => {
  const [a] = fresh(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify([]), { status: 200 });
    assert.equal(await liveOutreach.product(a.id), null);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "Unavailable" }), { status: 503 });
    await assert.rejects(liveOutreach.product(a.id), /Unavailable/);
    const other = await demoOutreach.load(demoAccounts()[1].id);
    globalThis.fetch = async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes("/attempts")
            ? other.attempts
            : String(url).includes("/stats")
              ? other.stats
              : String(url).includes("/links")
                ? other.links
                : readDemoCatalog(demoAccounts()[1].id),
        ),
        { status: 200 },
      );
    await assert.rejects(liveOutreach.load(a.id), /Account mismatch/);
  } finally {
    globalThis.fetch = original;
  }
});
