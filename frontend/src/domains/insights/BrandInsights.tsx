import { useMemo, useState } from "react";
import type { DataMode } from "../../api/source";
import { useBrandPosts } from "../accounts/useBrandPosts";
import type { SocialAccount, Intent } from "../../api/types";
import { aggregate } from "../analytics/model";
import { formatPercent } from "../../shared/format";
import { Insights } from "./Insights";
import { Button } from "../../shared/ui";
export function BrandInsights({
  mode,
  accounts,
  revision,
  initial,
  query,
  onOpen,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  revision: number;
  initial: Intent | "all";
  query: string;
  onOpen: (id: number, account: string) => void;
}) {
  const [channel, setChannel] = useState("all");
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
            onChange={(e) => setChannel(e.target.value)}
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
          {posts.length} posts · {selected.filter((r) => !r.error).length}/
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
      {channel === "all" && accounts.length > 1 && (
        <details className="channel-breakdown">
          <summary>Break down by channel</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Comments</th>
                  <th>Purchase intent</th>
                  <th>Feature requests</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const a = aggregate(r.posts);
                  return (
                    <tr key={r.account.id}>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => setChannel(r.account.id)}
                        >
                          {r.account.platform} · @{r.account.username} ↗
                        </button>
                      </td>
                      <td>{r.error ? "—" : a.total}</td>
                      <td>{r.error ? "—" : formatPercent(a.rate)}</td>
                      <td>{r.error ? "—" : a.intents.feature_request}</td>
                      <td>{r.error ? "—" : a.intents.support_complaint}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
  return (
    <Insights
      key={channel + ":" + initial}
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
