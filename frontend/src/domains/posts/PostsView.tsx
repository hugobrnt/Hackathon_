import { useMemo, useState, type ReactNode } from "react";
import type {
  PostIntentStats,
  PostSortKey,
  SocialAccount,
} from "../../api/types";
import { aggregate, PIR_DEFINITION, sortPosts } from "../analytics/model";
import { formatCount, formatDate, formatPercent } from "../../shared/format";
import { Button, Empty, Heading, Metric, PostVisual } from "../../shared/ui";
import { BoostDialog } from "./BoostDialog";

export const sortLabels: Partial<Record<PostSortKey, string>> = {
  purchase_intent_rate: "Purchase intent rate",
  buying_signal_rate: "Buying signals",
  comments: "Audience comments",
  recent: "Most recent",
};
export function PostsView({
  posts,
  query,
  onOpen,
  scope,
  accounts = [],
  loading = false,
}: {
  scope?: ReactNode;
  accounts?: SocialAccount[];
  loading?: boolean;
  posts: PostIntentStats[];
  query: string;
  onOpen: (id: number) => void;
}) {
  const [sort, setSort] = useState<PostSortKey>("purchase_intent_rate"),
    [minimum, setMinimum] = useState(0),
    [format, setFormat] = useState("all"),
    [layout, setLayout] = useState<"table" | "cards">("table"),
    [boostPost, setBoostPost] = useState<PostIntentStats | null>(null);
  const filtered = useMemo(
    () =>
      sortPosts(
        posts.filter(
          (p) =>
            (format === "all" || p.post.media_type === format) &&
            p.post.caption.toLowerCase().includes(query.toLowerCase()),
        ),
        sort,
        minimum,
      ),
    [posts, sort, minimum, format, query],
  );
  const total = aggregate(posts);
  const origin = (p: PostIntentStats) => {
    const account = accounts.find((a) => a.id === p.post.account_id);
    return (
      p.post.platform +
      (account?.username ? " · @" + account.username.replace(/^@/, "") : "")
    );
  };
  function postActions(post: PostIntentStats) {
    return (
      <div className="post-actions">
        <Button
          primary
          className="post-boost"
          onClick={() => setBoostPost(post)}
          aria-label={"Boost: " + (post.post.caption || "Untitled post")}
        >
          Boost
        </Button>
        <Button
          className="post-similar"
          disabled
          title="Create a similar ad — coming soon"
        >
          Similar ad
        </Button>
        <Button
          className="post-details"
          onClick={() => onOpen(post.post.id)}
          aria-label={"View details: " + (post.post.caption || "Untitled post")}
        >
          Details <span aria-hidden="true">↗</span>
        </Button>
      </div>
    );
  }
  function exportCsv() {
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "Post",
        "Channel",
        "Account",
        "Purchase intent rate",
        "Purchase intents",
        "Audience comments",
      ],
      ...filtered.map((p) => [
        p.post.caption,
        p.post.platform,
        accounts.find((a) => a.id === p.post.account_id)?.username ??
          p.post.account_id,
        p.purchase_intent_rate,
        p.intent_counts.purchase_intent,
        p.total_comments,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "signal-posts.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      {boostPost && (
        <BoostDialog
          post={boostPost}
          onClose={() => setBoostPost(null)}
          onOpen={onOpen}
        />
      )}
      <Heading title="Posts">
        <Button onClick={exportCsv} disabled={!filtered.length}>
          Export CSV ↗
        </Button>
      </Heading>
      {scope}
      <div className="metrics-grid">
        <Metric
          label="Purchase intent rate"
          value={formatPercent(total.rate)}
          hint={
            total.intents.purchase_intent +
            " / " +
            total.total +
            " audience comments"
          }
          accent
          definition={PIR_DEFINITION}
        />
        <Metric
          label="Intent comments"
          value={formatCount(total.intents.purchase_intent)}
          hint="Explicit buying or trial signals"
        />
        <Metric
          label="Audience comments"
          value={formatCount(total.total)}
          hint={total.classified + " classified"}
        />
        <Metric
          label="Posts analyzed"
          value={posts.length}
          hint="In the selected period"
        />
      </div>
      <div className="filter-row">
        <label>
          <span className="sr-only">Sort posts</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PostSortKey)}
          >
            {Object.entries(sortLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v} ↓
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Content format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="all">All formats</option>
            {[
              ...new Set(posts.map((p) => p.post.media_type).filter(Boolean)),
            ].map((v) => (
              <option key={v} value={v!}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="minimum-field">
          Min. comments{" "}
          <input
            type="number"
            min="0"
            max="100000"
            value={minimum}
            onChange={(e) =>
              setMinimum(Math.max(0, Number(e.target.value) || 0))
            }
          />
        </label>
        <span className="muted small">{filtered.length} posts</span>
        <div className="segmented">
          <button
            aria-pressed={layout === "table"}
            onClick={() => setLayout("table")}
          >
            Table
          </button>
          <button
            aria-pressed={layout === "cards"}
            onClick={() => setLayout("cards")}
          >
            Leaderboard
          </button>
        </div>
      </div>
      {loading ? (
        <p role="status" className="loading">
          Loading posts across channels…
        </p>
      ) : !filtered.length ? (
        <Empty
          title="No posts match these filters"
          action={
            <Button
              onClick={() => {
                setMinimum(0);
                setFormat("all");
              }}
            >
              Reset filters
            </Button>
          }
        >
          Try a lower comment threshold or another search.
        </Empty>
      ) : layout === "table" ? (
        <div className="panel table-scroll">
          <table className="post-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Purchase intent rate</th>
                <th className="post-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.post.id}
                  data-tour={i === 0 ? "post-ranking" : undefined}
                >
                  <td>
                    <button
                      className="post-title"
                      onClick={() => onOpen(p.post.id)}
                    >
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        {p.post.caption || "Untitled post"}
                        <small>
                          {origin(p)} · {p.post.media_type ?? "Post"} ·{" "}
                          {formatDate(p.post.created_time)}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <strong className="blue">
                      {p.total_comments
                        ? formatPercent(p.purchase_intent_rate)
                        : "—"}
                    </strong>
                    <small>
                      {p.intent_counts.purchase_intent} / {p.total_comments}{" "}
                      comments
                    </small>
                  </td>
                  <td>{postActions(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="leaderboard-grid" data-tour="post-ranking">
          {filtered.map((p, i) => (
            <article className="panel leader-card" key={p.post.id}>
              <div className="leader-rank">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{p.post.caption}</strong>
              </div>
              <PostVisual
                picture={p.post.picture}
                caption={p.post.caption}
                variant={i}
              />
              <strong className="leader-rate">
                {p.total_comments ? formatPercent(p.purchase_intent_rate) : "—"}
              </strong>
              <p>Purchase intent rate</p>
              <small>
                {p.intent_counts.purchase_intent} / {p.total_comments} audience
                comments
              </small>
              <div className="leader-meta">
                {origin(p)} · {p.post.media_type ?? "Post"} ·{" "}
                {formatDate(p.post.created_time)}
              </div>
              {postActions(p)}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
