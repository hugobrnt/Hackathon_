import type { DataSource } from "../../api/source";
import type { InsightTheme } from "../../api/insights";
import type { Message, Post } from "../../api/types";
export interface ThemeEvidence {
  comments: { message: Message; post: Post }[];
  unavailable: number;
}
export async function loadThemeEvidence(
  source: DataSource,
  account: string,
  theme: InsightTheme,
  signal: AbortSignal,
): Promise<ThemeEvidence> {
  const ids = [...new Set(theme.message_ids)],
    wanted = new Set(ids),
    seen = new Set<number>(),
    comments: ThemeEvidence["comments"] = [];
  const posts = [...new Set(theme.post_ids)];
  for (let i = 0; i < posts.length; i += 4) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = await Promise.all(
      posts.slice(i, i + 4).map((id) => source.detail(id, signal)),
    );
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    for (let j = 0; j < batch.length; j++) {
      const d = batch[j];
      if (d.post.account_id !== account || d.post.id !== posts[i + j])
        throw new Error(
          "Source evidence belongs to a different account or post.",
        );
      for (const m of d.comments)
        if (
          wanted.has(m.id) &&
          m.account_id === account &&
          m.direction === "incoming" &&
          !m.author_is_owner &&
          !seen.has(m.id)
        ) {
          seen.add(m.id);
          comments.push({ message: m, post: d.post });
        }
    }
  }
  return { comments, unavailable: Math.max(0, ids.length - comments.length) };
}
