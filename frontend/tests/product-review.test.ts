import test from "node:test";
import assert from "node:assert/strict";
import {
  configureDemo,
  demoAccounts,
  demoPosts,
} from "../src/domains/demo/workspace.ts";
import {
  loadProductReview,
  confirmProduct,
} from "../src/domains/products/review-api.ts";
import { readDemoCatalog } from "../src/domains/products/demo-catalog.ts";

test("demo product review persists a human match without network calls", async () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("No network in demo");
  };
  try {
    configureDemo(["instagram", "linkedin"]);
    const [account, other] = demoAccounts();
    const page = await loadProductReview("demo", account.id, null, null);
    assert.ok(page.items.length);
    const item = page.items[0],
      product = readDemoCatalog(account.id)[0];
    await assert.rejects(
      confirmProduct("demo", other.id, item.message_id, product.id),
    );
    await confirmProduct("demo", account.id, item.message_id, product.id);
    const fresh = await loadProductReview("demo", account.id, null, null);
    assert.ok(!fresh.items.some((m) => m.message_id === item.message_id));
    const saved = demoPosts(account.id)
      .flatMap((p) => p.comments)
      .find((m) => m.id === item.message_id)!;
    assert.equal(saved.classification!.product_id, product.id);
    assert.equal(saved.classification!.product_confidence, 1);
  } finally {
    globalThis.fetch = original;
  }
});
