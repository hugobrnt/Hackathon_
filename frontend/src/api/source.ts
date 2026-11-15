import { api } from "./client.ts";
import {
  demoAccounts,
  demoPosts,
  demoPost,
} from "../domains/demo/workspace.ts";
import { sortPosts } from "../domains/analytics/model.ts";
import type { PostDetail, PostIntentStats, SocialAccount } from "./types";
export type DataMode = "demo" | "live";
export interface DataSource {
  accounts: (signal?: AbortSignal) => Promise<SocialAccount[]>;
  posts: (id: string, signal?: AbortSignal) => Promise<PostIntentStats[]>;
  detail: (id: number, signal?: AbortSignal) => Promise<PostDetail>;
}
const offline: DataSource = {
  accounts: async () => demoAccounts(),
  posts: async (id) => sortPosts(demoPosts(id), "intent_score"),
  detail: async (id) => demoPost(id),
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
    if (
      batch.some(
        (p, index) =>
          p.post.account_id !== posts[i + index]?.post.account_id ||
          p.post.id !== posts[i + index]?.post.id,
      )
    )
      throw new Error(
        "The API returned a post from a different account or post.",
      );
    results.push(...batch);
  }
  return results;
}
