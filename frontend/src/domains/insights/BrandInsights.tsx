import { useEffect, useMemo, useState } from "react";
import type { DataMode } from "../../api/source";
import { sourceFor } from "../../api/source";
import type { SocialAccount, PostIntentStats, Intent } from "../../api/types";
import { useEvidence } from "../accounts/useWorkspace";
import { aggregate } from "../analytics/model";
import { formatPercent } from "../../shared/format";
import { Insights } from "./Insights";
import { Button } from "../../shared/ui";
interface ChannelResult {
  account: SocialAccount;
  posts: PostIntentStats[];
  error: string | null;
}
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
  const [results, setResults] = useState<ChannelResult[]>([]),
    [loading, setLoading] = useState(true),
    [channel, setChannel] = useState("all"),
    [retry, setRetry] = useState(0);
  const accountKey = accounts.map((a) => a.id).join("|");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setResults([]);
    void (async () => {
      const rows: ChannelResult[] = [];
      for (let i = 0; i < accounts.length; i += 4) {
        const batch = await Promise.all(
          accounts.slice(i, i + 4).map(async (account) => {
            try {
              return {
                account,
                posts: await sourceFor(mode).posts(account.id, c.signal),
                error: null,
              };
            } catch (e) {
              return {
                account,
                posts: [],
                error: e instanceof Error ? e.message : "Unavailable",
              };
            }
          }),
        );
        if (c.signal.aborted) return;
        rows.push(...batch);
      }
      if (!c.signal.aborted) {
        setResults(rows);
        setLoading(false);
      }
    })();
    return () => c.abort();
  }, [mode, accountKey, revision, retry]);
  const allPosts = useMemo(() => results.flatMap((r) => r.posts), [results]);
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
  const evidence = useEvidence(mode, posts, !loading);
  const failed = selected.filter((r) => r.error);
  const scope = (
    <>
      <div className="channel-scope">
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
          <Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>
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
      details={evidence.items}
      loading={loading || evidence.loading}
      error={evidence.error}
      initial={initial}
      query={query}
      scope={scope}
      onOpen={(id) => {
        const p = posts.find((p) => p.post.id === id);
        if (p) onOpen(id, p.post.account_id);
      }}
    />
  );
}
