import { ApiError, request } from "./client.ts";
import type { DataMode } from "./source";
import { demoInsights } from "../domains/demo/insights.ts";
export const insightCategories = [
  "objections",
  "feature_requests",
  "needs",
  "praise",
] as const;
export type InsightCategory = (typeof insightCategories)[number];
export interface InsightTheme {
  id: number;
  category: InsightCategory;
  title: string;
  summary: string;
  mention_count: number;
  quotes: string[];
  message_ids: number[];
  post_ids: number[];
}
export interface InsightsReport {
  product_id?: number | null;
  run_id: string;
  account_id: string;
  post_id: number | null;
  writer: string;
  generated_at: string;
  categories: {
    category: InsightCategory;
    total_messages: number;
    themes: InsightTheme[];
  }[];
}
export interface InsightsSource {
  latest(
    account: string,
    post: number | null,
    signal?: AbortSignal,
    product?: number | null,
  ): Promise<InsightsReport | null>;
  run(
    account: string,
    post: number | null,
    signal?: AbortSignal,
    product?: number | null,
  ): Promise<InsightsReport>;
}
function validate(
  report: InsightsReport,
  account: string,
  post: number | null,
  product: number | null = null,
) {
  if (
    report.account_id !== account ||
    report.post_id !== post ||
    (report.product_id ?? null) !== product
  )
    throw new Error(
      "The insights response does not match the selected account, post or product.",
    );
  return report;
}
export const liveInsights: InsightsSource = {
  async latest(account, post, signal, product = null) {
    const q = new URLSearchParams({ account_id: account, top: "20" });
    if (post !== null) q.set("post_id", String(post));
    if (product !== null) q.set("product_id", String(product));
    try {
      return validate(
        await request<InsightsReport>("/insights?" + q, { signal }),
        account,
        post,
        product,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  async run(account, post, signal, product = null) {
    return validate(
      await request<InsightsReport>("/insights/run", {
        method: "POST",
        body: JSON.stringify({
          account_id: account,
          post_id: post,
          ...(product !== null ? { product_id: product } : {}),
          top: 20,
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
          : AbortSignal.timeout(180000),
      }),
      account,
      post,
      product,
    );
  },
};
export const insightsFor = (mode: DataMode): InsightsSource =>
  mode === "demo" ? demoInsights : liveInsights;
