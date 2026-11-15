import type {
  InsightsSource,
  InsightsReport,
  InsightCategory,
} from "../../api/insights";
import { demoPosts, demoPost } from "./workspace.ts";
import { groupProductInsights } from "../insights/model.ts";
import { readStored, saveStored } from "../../shared/storage.ts";
const mapping = {
  objections: "objection",
  feature_requests: "feature_request",
  needs: "pre_purchase_question",
  praise: "testimonial",
} as const;
const key = (account: string, post: number | null, product: number | null) =>
  "signal:demo:insights:v2:" +
  account +
  ":" +
  (post ?? "all") +
  ":" +
  (product ?? "all");
function report(
  account: string,
  post: number | null,
  product: number | null,
): InsightsReport {
  const posts = demoPosts(account).filter(
    (p) => post === null || p.post.id === post,
  );
  if (post !== null && !posts.length)
    throw new Error("Demo post not found for this channel.");
  const groups = groupProductInsights(
    posts.map((p) => {
      const detail = demoPost(p.post.id);
      return {
        ...detail,
        comments: detail.comments.filter((m) => {
          const c = m.classification;
          if (product === null) return true;
          if (product === 0)
            return !c?.product_id || (c.product_confidence ?? 0) < 0.7;
          return (
            c?.product_id === product && (c.product_confidence ?? 0) >= 0.7
          );
        }),
      };
    }),
  );
  let id = 1;
  return {
    run_id: "demo-" + Date.now(),
    account_id: account,
    post_id: post,
    product_id: product,
    writer: "demo-heuristic",
    generated_at: new Date().toISOString(),
    categories: Object.entries(mapping).map(([category, intent]) => {
      const selected = groups.filter((g) => g.intent === intent);
      return {
        category: category as InsightCategory,
        total_messages: selected.reduce((sum, g) => sum + g.evidence.length, 0),
        themes: selected.slice(0, 20).map((g) => ({
          id: id++,
          category: category as InsightCategory,
          title: g.title,
          summary: `${g.evidence.length} sample comments mention this topic.`,
          mention_count: g.evidence.length,
          quotes: [...new Set(g.evidence.map((e) => e.message.text))].slice(
            0,
            3,
          ),
          message_ids: g.evidence.map((e) => e.message.id),
          post_ids: [...new Set(g.evidence.map((e) => e.post.id))],
        })),
      };
    }),
  };
}
export const demoInsights: InsightsSource = {
  async latest(account, post, signal, product = null) {
    const saved = readStored<InsightsReport | null>(
      key(account, post, product),
      null,
    );
    if (saved?.account_id === account && saved.post_id === post) return saved;
    return this.run(account, post, signal, product);
  },
  async run(account, post, _signal, product = null) {
    const next = report(account, post, product);
    saveStored(key(account, post, product), next);
    return next;
  },
};
