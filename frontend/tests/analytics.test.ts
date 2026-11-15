import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  sortPosts,
  summarize,
  intentTimeline,
  periodRate,
  sumAvailable,
} from "../src/domains/analytics/model.ts";
import { buildDemo } from "../src/domains/demo/data.ts";
import { parseTimestamp } from "../src/shared/time.ts";
import type { Message, Intent } from "../src/api/types.ts";
const fixture = buildDemo();
test("SQLite timestamps without an offset are interpreted as UTC", () => {
  assert.equal(
    parseTimestamp("2026-11-09T00:00:00"),
    Date.parse("2026-11-09T00:00:00Z"),
  );
  assert.equal(
    parseTimestamp("2026-11-09 00:00:00"),
    Date.parse("2026-11-09T00:00:00Z"),
  );
  assert.equal(
    parseTimestamp("2026-11-09T01:00:00+01:00"),
    Date.parse("2026-11-09T00:00:00Z"),
  );
  assert.ok(Number.isNaN(parseTimestamp(null)));
});
function message(
  id: number,
  intent: Intent | null = "purchase_intent",
  extra: Partial<Message> = {},
): Message {
  const base = fixture[0].comments[0];
  return {
    ...base,
    id,
    classification: intent ? { ...base.classification!, intent } : null,
    ...extra,
  };
}
test("denominator includes neutral and unclassified comments but excludes owners, outgoing replies and DMs", () => {
  const messages = [
    message(1),
    message(2, "pre_purchase_question"),
    message(3, "objection"),
    message(4, "neutral_spam"),
    message(5, null),
    message(6, "purchase_intent", { author_is_owner: true }),
    message(7, "purchase_intent", { direction: "outgoing" }),
    message(8, "purchase_intent", { kind: "dm" }),
  ];
  const result = summarize(fixture[0].post, messages);
  assert.equal(result.total_comments, 5);
  assert.equal(result.classified_comments, 4);
  assert.equal(result.unclassified_comments, 1);
  assert.equal(result.purchase_intent_rate, 0.2);
  assert.equal(result.buying_signal_rate, 0.4);
  assert.equal(result.intent_score, 1.2);
  assert.equal(result.key_comments.length, 3);
});
test("account rate is weighted by audience comments, never the mean of post rates", () => {
  const first = summarize(fixture[0].post, [message(1)]);
  const second = summarize(
    fixture[1].post,
    Array.from({ length: 9 }, (_, i) => message(i, "neutral_spam")),
  );
  assert.equal(aggregate([first, second]).rate, 0.1);
  assert.equal(aggregate([]).rate, null);
});
test("null metrics stay unavailable; a measured zero remains zero", () => {
  assert.equal(sumAvailable([null, null]), null);
  assert.equal(sumAvailable([null, 0]), 0);
  assert.equal(sumAvailable([null, 12, 4]), 16);
});
test("ranking applies sample thresholds and deterministic purchase-intent tie-breaks without mutating input", () => {
  const low = {
    ...fixture[0],
    purchase_intent_rate: 0.5,
    total_comments: 2,
    intent_counts: { ...fixture[0].intent_counts, purchase_intent: 1 },
  };
  const high = {
    ...fixture[1],
    purchase_intent_rate: 0.5,
    total_comments: 40,
    intent_counts: { ...fixture[1].intent_counts, purchase_intent: 20 },
  };
  const input = [low, high],
    ranked = sortPosts(input, "purchase_intent_rate", 10);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].post.id, high.post.id);
  assert.equal(
    sortPosts(input, "purchase_intent_rate")[0].post.id,
    high.post.id,
  );
  assert.equal(input[0], low);
});
test("non-rate ranking uses intent score as tie breaker like the API", () => {
  const a = {
    ...fixture[0],
    intent_score: 0.2,
    post: { ...fixture[0].post, like_count: 10 },
  };
  const b = {
    ...fixture[1],
    intent_score: 1.2,
    post: { ...fixture[1].post, like_count: 10 },
  };
  assert.equal(sortPosts([a, b], "likes")[0].post.id, b.post.id);
});
test("timeline buckets use exact UTC boundaries and exclude undated and owner comments", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const rows = [
    message(1, "purchase_intent", { created_time: "2026-11-09T00:00:00Z" }),
    message(2, "neutral_spam", { created_time: "2026-11-15T23:59:59Z" }),
    message(3, "purchase_intent", { created_time: "2026-11-16T00:00:00Z" }),
    message(4, "purchase_intent", { created_time: null }),
    message(5, "purchase_intent", {
      created_time: "2026-11-10T12:00:00Z",
      author_is_owner: true,
    }),
  ];
  const timeline = intentTimeline(rows, now, 2);
  assert.equal(timeline[0].rate, null);
  assert.equal(timeline[1].total, 2);
  assert.equal(timeline[1].rate, 0.5);
  assert.equal(periodRate(timeline).rate, 0.5);
});
test("fixtures have unique message ids and all displayed rates reconcile with comment evidence", () => {
  const ids = fixture.flatMap((p) => p.comments.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const d of fixture) {
    const recomputed = summarize(d.post, d.comments);
    assert.equal(d.purchase_intent_rate, recomputed.purchase_intent_rate);
    assert.equal(d.total_comments, d.comments.length - 1);
    assert.equal(d.post.comment_count, d.comments.length);
    assert.equal(d.classified_comments, d.total_comments);
  }
  assert.equal(fixture[0].total_comments, 50);
  assert.equal(fixture[0].purchase_intent_rate, 0.24);
  assert.equal(fixture[0].intent_counts.purchase_intent, 12);
});
