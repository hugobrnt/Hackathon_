import test from "node:test";
import assert from "node:assert/strict";
import { buildDemo } from "../src/domains/demo/data.ts";
import { groupProductInsights } from "../src/domains/insights/model.ts";
import { isAudienceComment } from "../src/domains/analytics/model.ts";

test("product insights retain every classified non-neutral audience comment exactly once", () => {
  const details = buildDemo();
  const groups = groupProductInsights([...details, details[0]]);
  const expected = details
    .flatMap((d) => d.comments)
    .filter(
      (m) =>
        isAudienceComment(m) &&
        m.classification &&
        m.classification.intent !== "neutral_spam",
    );
  assert.equal(groups.flatMap((g) => g.evidence).length, expected.length);
  assert.equal(
    new Set(groups.flatMap((g) => g.evidence.map((e) => e.message.id))).size,
    expected.length,
  );
  for (const g of groups) {
    assert.equal(g.posts, new Set(g.evidence.map((e) => e.post.id)).size);
    assert.ok(
      g.evidence.every((e) => e.message.classification?.intent === g.intent),
    );
  }
});

test("topic grouping preserves intent distinctions and unknown product feedback verbatim", () => {
  const d = structuredClone(buildDemo()[0]);
  const source = d.comments.find(
    (m) => m.classification?.intent === "feature_request",
  )!;
  d.comments = [
    { ...source, id: 1, text: "Please add Android support." },
    {
      ...source,
      id: 2,
      text: "Android crashes on launch.",
      classification: {
        ...source.classification!,
        intent: "support_complaint",
      },
    },
    { ...source, id: 3, text: "Please support my unusual workflow." },
  ];
  const g = groupProductInsights([d]);
  assert.equal(g.length, 3);
  assert.equal(g.filter((g) => g.title === "Android availability").length, 2);
  assert.ok(g.some((g) => g.title === "Please support my unusual workflow."));
});

test("cross-channel evidence remains attributed and narrowing to one post reduces counts", () => {
  const a = structuredClone(buildDemo()[0]);
  const b = structuredClone(a);
  b.post = {
    ...b.post,
    id: 4001,
    account_id: "linkedin-account",
    platform: "linkedin",
  };
  b.comments = b.comments.map((m) => ({
    ...m,
    account_id: "linkedin-account",
    post_id: b.post.id,
  }));
  const global = groupProductInsights([a, b]);
  const local = groupProductInsights([a]);
  for (const g of local) {
    const combined = global.find((x) => x.id === g.id)!;
    assert.equal(combined.evidence.length, g.evidence.length * 2);
    assert.equal(combined.posts, 2);
    assert.deepEqual(combined.channels, ["instagram", "linkedin"]);
  }
});
