import test from "node:test";
import assert from "node:assert/strict";
import {
  dateWindow,
  commentsInWindow,
  scopeDetails,
  weeklyBuckets,
} from "../src/domains/dashboard/model.ts";
import { demoDetails } from "../src/domains/demo/data.ts";
test("dashboard dates use incoming comment timestamps, not publication or lifetime counters", () => {
  const d = structuredClone(demoDetails[0]);
  d.post.created_time = "2025-01-01T00:00:00Z";
  const m = d.comments[0];
  const rows = [
    { ...m, id: 1, created_time: "2026-11-01T00:00:00Z" },
    { ...m, id: 2, created_time: "2026-11-02T23:59:59Z" },
    { ...m, id: 3, created_time: "2026-11-03T00:00:00Z" },
    { ...m, id: 4, created_time: null },
    {
      ...m,
      id: 5,
      created_time: "2026-11-01T12:00:00Z",
      author_is_owner: true,
    },
  ];
  const { from, to, valid } = dateWindow("2026-11-01", "2026-11-02");
  assert.equal(valid, true);
  assert.deepEqual(
    commentsInWindow(rows, from, to).map((m) => m.id),
    [1, 2],
  );
  const result = scopeDetails([{ ...d, comments: rows }], from, to)[0];
  assert.equal(result.total_comments, 2);
  assert.equal(result.intent_counts.purchase_intent, 2);
  assert.equal(result.post.created_time, "2025-01-01T00:00:00Z");
  assert.equal(
    weeklyBuckets(rows, from, to).reduce((n, b) => n + b.total, 0),
    2,
  );
  assert.equal(dateWindow("2026-11-03", "2026-11-01").valid, false);
});
