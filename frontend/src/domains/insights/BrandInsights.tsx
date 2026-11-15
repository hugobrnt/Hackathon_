import { useMemo } from "react";
import type { DataMode } from "../../api/source";
import { useBrandPosts } from "../accounts/useBrandPosts";
import type { SocialAccount, Intent } from "../../api/types";
import { Insights } from "./Insights";
import { Button } from "../../shared/ui";
export function BrandInsights({
  mode,
  accounts,
  revision,
  initial,
  query,
  onOpen,
  channel,
  onChannelChange,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  revision: number;
  initial: Intent | "all";
  query: string;
  onOpen: (id: number, account: string) => void;
  channel: string;
  onChannelChange: (channel: string) => void;
}) {
  const { results, allPosts, retry } = useBrandPosts(mode, accounts, revision);
  const selected =
    channel === "all"
      ? results
      : results.filter((r) => r.account.id === channel);
  const posts = useMemo(
    () =>
      channel === "all"
        ? allPosts
        : allPosts.filter((p) => p.post.account_id === channel),
    [channel, allPosts],
  );
  const failed = selected.filter((r) => r.error);
  const scope = (
    <>
      <div className="channel-scope" data-tour="insights-channels">
        <label className="filter">
          <select
            aria-label="Insights channel"
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
          {posts.length} imported posts ·{" "}
          {selected.filter((r) => !r.error).length}/
          {channel === "all" ? accounts.length : 1} channels loaded
        </span>
      </div>
      {failed.length > 0 && (
        <div className="notice notice--error" role="alert">
          <span>
            Unavailable:{" "}
            {failed
              .map((r) => r.account.username ?? r.account.platform)
              .join(", ")}
            . Totals include loaded channels only.
          </span>
          <Button onClick={retry}>Retry</Button>
        </div>
      )}
    </>
  );
  return (
    <Insights
      key={initial}
      catalogAccounts={accounts}
      posts={posts}
      mode={mode}
      accounts={accounts.filter((a) => channel === "all" || a.id === channel)}
      initial={initial}
      query={query}
      scope={scope}
      onOpen={onOpen}
    />
  );
}
