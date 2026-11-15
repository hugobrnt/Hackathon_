import type { DataMode } from "../../api/source";
import type { SocialAccount } from "../../api/types";
import { useBrandPosts } from "../accounts/useBrandPosts";
import { parseTimestamp } from "../../shared/time";
import { Button } from "../../shared/ui";
import { PostsView } from "./PostsView";
export function BrandPosts({
  mode,
  accounts,
  revision,
  period,
  query,
  onOpen,
  channel,
  onChannelChange,
}: {
  channel: string;
  onChannelChange: (channel: string) => void;
  mode: DataMode;
  accounts: SocialAccount[];
  revision: number;
  period: string;
  query: string;
  onOpen: (id: number, account: string) => void;
}) {
  const { results, allPosts, loading, retry } = useBrandPosts(
    mode,
    accounts,
    revision,
  );
  const selected = results.filter(
    (r) => channel === "all" || r.account.id === channel,
  );
  const posts = allPosts.filter(
    (p) =>
      (channel === "all" || p.post.account_id === channel) &&
      (period === "all" ||
        parseTimestamp(p.post.created_time) >=
          Date.now() - Number(period) * 86400000),
  );
  const failed = selected.filter((r) => r.error);
  return (
    <PostsView
      posts={posts}
      query={query}
      accounts={accounts}
      loading={loading}
      onOpen={(id) => {
        const p = allPosts.find((p) => p.post.id === id);
        if (p) onOpen(id, p.post.account_id);
      }}
      scope={
        <>
          <div className="channel-scope">
            <label className="filter">
              <select
                aria-label="Posts channel"
                value={channel}
                onChange={(e) => onChannelChange(e.target.value)}
              >
                <option value="all">All channels</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.platform} · @{a.username ?? a.id}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted small">
              {posts.length} posts · {selected.filter((r) => !r.error).length}{" "}
              channels
            </span>
          </div>
          {!!failed.length && (
            <div className="notice notice--error" role="alert">
              Unavailable:{" "}
              {failed
                .map((r) => r.account.username ?? r.account.platform)
                .join(", ")}
              . Totals include loaded channels only.{" "}
              <Button onClick={retry}>Retry</Button>
            </div>
          )}
        </>
      }
    />
  );
}
