import { api } from "./client.ts";
import { demoAccount, demoDetails } from "../domains/demo/data.ts";
import { sortPosts } from "../domains/analytics/model.ts";
import type { PostDetail, PostIntentStats, SocialAccount } from "./types";
export type DataMode = "demo" | "live";
export interface DataSource {
  accounts: (signal?: AbortSignal) => Promise<SocialAccount[]>;
  posts: (id: string, signal?: AbortSignal) => Promise<PostIntentStats[]>;
  detail: (id: number, signal?: AbortSignal) => Promise<PostDetail>;
}
const offline: DataSource = {
  accounts: async () => [structuredClone(demoAccount)],
  posts: async (id) =>
    id === demoAccount.id
      ? structuredClone(sortPosts(demoDetails, "intent_score"))
      : [],
  detail: async (id) => {
    const p = demoDetails.find((p) => p.post.id === id);
    if (!p) throw new Error("Demo post not found.");
    return structuredClone(p);
  },
};
const live: DataSource = {
  accounts: async (signal) =>
    (await api.listAccounts(false, signal)).filter((a) => !a.is_demo),
  posts: (id, signal) =>
    api.rankPosts(
      { accountId: id, sort: "intent_score", minComments: 0 },
      signal,
    ),
  detail: (id, signal) => api.postDetail(id, signal),
};
export const sourceFor = (mode: DataMode): DataSource =>
  mode === "demo" ? offline : live;
export async function loadEvidence(
  source: DataSource,
  posts: PostIntentStats[],
  signal: AbortSignal,
): Promise<PostDetail[]> {
  const results: PostDetail[] = [];
  for (let i = 0; i < posts.length; i += 4) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = await Promise.all(
      posts.slice(i, i + 4).map((p) => source.detail(p.post.id, signal)),
    );
    if (batch.some((p) => p.post.account_id !== posts[0]?.post.account_id))
      throw new Error("The API returned a post from a different account.");
    results.push(...batch);
  }
  return results;
}
