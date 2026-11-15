import { request } from "../../api/client.ts";
import type { DataMode } from "../../api/source";
import type { Intent } from "../../api/types";
import { demoPosts } from "../demo/workspace.ts";
import { confirmDemoProduct, readDemoCatalog } from "./demo-catalog.ts";
export interface ProductReviewItem {
  message_id: number;
  account_id: string;
  text: string;
  author_name: string | null;
  kind: string;
  created_time: string | null;
  post_id: number | null;
  post_caption: string | null;
  intent: Intent;
  suggested_product_id: number | null;
  suggested_product_title: string | null;
  product_confidence: number | null;
}
export interface ProductReviewPage {
  items: ProductReviewItem[];
  next_cursor: number | null;
}
export async function loadProductReview(
  mode: DataMode,
  account: string,
  post: number | null,
  before: number | null,
  signal?: AbortSignal,
): Promise<ProductReviewPage> {
  if (mode === "live") {
    const q = new URLSearchParams({ limit: "50" });
    if (post !== null) q.set("post_id", String(post));
    if (before !== null) q.set("before", String(before));
    return request(
      `/accounts/${encodeURIComponent(account)}/product-matches/review?${q}`,
      { signal },
    );
  }
  const products = readDemoCatalog(account);
  const items = demoPosts(account)
    .filter((p) => post === null || p.post.id === post)
    .flatMap((p) =>
      p.comments.flatMap((m) => {
        const c = m.classification;
        if (
          !c ||
          c.intent === "neutral_spam" ||
          m.author_is_owner ||
          m.direction !== "incoming" ||
          !m.text ||
          (before !== null && m.id >= before)
        )
          return [];
        if (
          c.product_id &&
          (c.product_confidence ?? 0) >= 0.7 &&
          products.some((p) => p.id === c.product_id && p.is_active)
        )
          return [];
        return [
          {
            message_id: m.id,
            account_id: account,
            text: m.text,
            author_name: m.author_name,
            kind: m.kind,
            created_time: m.created_time,
            post_id: p.post.id,
            post_caption: p.post.caption,
            intent: c.intent,
            suggested_product_id: c.product_id ?? null,
            suggested_product_title: c.product_title ?? null,
            product_confidence: c.product_confidence ?? null,
          },
        ];
      }),
    )
    .sort((a, b) => b.message_id - a.message_id);
  return {
    items: items.slice(0, 50),
    next_cursor: items.length > 50 ? items[49].message_id : null,
  };
}
export async function confirmProduct(
  mode: DataMode,
  account: string,
  message: number,
  product: number,
) {
  if (mode === "demo") {
    if (
      !demoPosts(account).some((p) =>
        p.comments.some(
          (m) =>
            m.id === message &&
            !m.author_is_owner &&
            m.direction === "incoming" &&
            m.classification,
        ),
      )
    )
      throw new Error("Audience message not found on this channel.");
    return confirmDemoProduct(account, message, product);
  }
  await request(`/messages/${message}/product-match`, {
    method: "PUT",
    body: JSON.stringify({ product_id: product }),
  });
}
