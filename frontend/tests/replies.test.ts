import test from "node:test";
import assert from "node:assert/strict";
import { loadReplies, saveReplies } from "../src/api/replies.ts";
import {
  demoOutreach,
  resetDemoOutreach,
} from "../src/domains/demo/outreach.ts";
import {
  configureDemo,
  demoAccounts,
  demoPosts,
} from "../src/domains/demo/workspace.ts";

test("reply preferences persist offline and change previews without API calls", async () => {
  const original = globalThis.fetch,
    storage = globalThis.localStorage;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
  globalThis.fetch = async () => {
    throw new Error("Network forbidden");
  };
  try {
    configureDemo(["instagram"]);
    resetDemoOutreach();
    const account = demoAccounts()[0].id,
      post = demoPosts(account)[0];
    await saveReplies("demo", account, {
      tone: "concise",
      goal: "trial",
      escalation_topics: "pricing",
    });
    assert.equal((await loadReplies("demo", account)).tone, "concise");
    const preview = await demoOutreach.preview(post.comments[0].id);
    assert.match(preview.text, /trial options/);
    assert.ok(!preview.text.startsWith("Hi"));
  } finally {
    globalThis.fetch = original;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
  }
});

test("live reply preferences use authenticated account-scoped GET and PUT", async () => {
  const original = globalThis.fetch,
    calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        tone: "professional",
        goal: "demo",
        escalation_topics: "refund",
      }),
      { status: 200 },
    );
  };
  try {
    const result = await loadReplies("live", "account/a");
    await saveReplies("live", "account/a", result);
    assert.ok(calls[0].url.endsWith("/accounts/account%2Fa/reply-settings"));
    assert.equal(calls[1].init.method, "PUT");
    assert.equal(calls[1].init.credentials, "include");
    assert.equal(
      JSON.parse(String(calls[1].init.body)).escalation_topics,
      "refund",
    );
  } finally {
    globalThis.fetch = original;
  }
});
