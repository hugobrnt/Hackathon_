import test from "node:test";
import assert from "node:assert/strict";
import { sourceFor, loadEvidence } from "../src/api/source.ts";
import { demoAccount, demoDetails } from "../src/domains/demo/data.ts";

test("offline accounts, ranking and evidence work with fetch blocked", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Network disabled"); };
  try {
    const source = sourceFor("demo");
    const accounts = await source.accounts();
    const posts = await source.posts(accounts[0].id);
    const details = await loadEvidence(source, posts, new AbortController().signal);
    assert.equal(accounts.length, 1);
    assert.equal(posts.length, 8);
    assert.equal(details.length, 8);
    assert.equal(calls, 0);
    details[0].post.caption = "Local mutation";
    assert.notEqual((await source.detail(details[0].post.id)).post.caption, "Local mutation");
    await assert.rejects(source.detail(-1), /not found/);
  } finally { globalThis.fetch = previous; }
});

test("connected mode uses the API, excludes seeded demo accounts, and never falls back to fixtures", async () => {
  const previous = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify([demoAccount, {...demoAccount, id:"real", is_demo:false}]), {status:200});
  };
  try {
    const accounts = await sourceFor("live").accounts();
    assert.deepEqual(accounts.map(a => a.id), ["real"]);
    assert.deepEqual(urls, ["/api/accounts?sync=false"]);
    globalThis.fetch = async () => { throw new Error("Backend offline"); };
    await assert.rejects(sourceFor("live").accounts(), /Cannot reach the API/);
  } finally { globalThis.fetch = previous; }
});

test("evidence loading rejects cross-account data and aborted work", async () => {
  const source = {...sourceFor("demo"), detail: async () => ({...demoDetails[0], post:{...demoDetails[0].post, account_id:"other"}})};
  await assert.rejects(loadEvidence(source, demoDetails, new AbortController().signal), /different account/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadEvidence(sourceFor("demo"),demoDetails,controller.signal), /Aborted/);
});
