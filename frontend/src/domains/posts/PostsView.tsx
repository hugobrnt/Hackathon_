import { useMemo, useState } from "react";
import type { PostIntentStats, PostSortKey } from "../../api/types";
import { aggregate, PIR_DEFINITION, sortPosts } from "../analytics/model";
import {
  formatCount,
  formatDate,
  formatPercent,
  formatScore,
} from "../../shared/format";
import { Button, Empty, Heading, Metric, PostVisual } from "../../shared/ui";

export const sortLabels: Record<PostSortKey, string> = {
  intent_score: "Intent score",
  purchase_intent_rate: "Purchase intent rate",
  buying_signal_rate: "Buying signals",
  comments: "Audience comments",
  likes: "Likes",
  views: "Views",
  shares: "Shares",
  recent: "Most recent",
};
export function PostsView({
  posts,
  query,
  onOpen,
}: {
  posts: PostIntentStats[];
  query: string;
  onOpen: (id: number) => void;
}) {
  const [sort, setSort] = useState<PostSortKey>("purchase_intent_rate"),
    [minimum, setMinimum] = useState(0),
    [format, setFormat] = useState("all"),
    [layout, setLayout] = useState<"table" | "cards">("table");
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
        "Purchase intent rate",
        "Purchase intents",
        "Audience comments",
        "Intent score",
        "Views",
        "Likes",
        "Shares",
      ],
      ...filtered.map((p) => [
        p.post.caption,
        p.purchase_intent_rate,
        p.intent_counts.purchase_intent,
        p.total_comments,
        p.intent_score,
        p.post.view_count,
        p.post.like_count,
        p.post.share_count,
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
      <Heading
        title="Posts"
        subtitle="Find the content that creates interest. Understand the numbers behind it."
      >
        <Button onClick={exportCsv} disabled={!filtered.length}>
          Export CSV ↗
        </Button>
      </Heading>
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
          label="Post views"
          value={formatCount(total.views)}
          hint="Available lifetime snapshots"
        />
        <Metric
          label="Audience comments"
          value={formatCount(total.total)}
          hint={total.classified + " classified"}
        />
        <Metric
          label="Shares"
          value={formatCount(total.shares)}
          hint={
            posts.filter((p) => p.post.share_count !== null).length +
            " / " +
            posts.length +
            " posts with data"
          }
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
      {!filtered.length ? (
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
                <th>Intent score</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Shares</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.post.id}>
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
                          {p.post.media_type ?? "Post"} ·{" "}
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
                  <td>
                    {formatScore(p.intent_score)}
                    <small>out of 3</small>
                  </td>
                  <td>{formatCount(p.post.view_count)}</td>
                  <td>{formatCount(p.post.like_count)}</td>
                  <td>{formatCount(p.post.share_count)}</td>
                  <td>
                    {p.needs_review ? (
                      <span className="pill pill--amber">
                        {p.needs_review} to review
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="leaderboard-grid">
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
                {formatCount(p.post.view_count)} views ·{" "}
                {formatScore(p.intent_score)} intent score
              </div>
              <Button primary={i === 0} onClick={() => onOpen(p.post.id)}>
                Inspect signals →
              </Button>
            </article>
          ))}
        </div>
      )}
      <p className="footnote">{PIR_DEFINITION}</p>
      <div className="panel subtle">
        <h3>Volume matters as much as the rate.</h3>
        <p className="muted">
          Use a minimum comment count before comparing posts. A 50% rate from
          two comments is not stronger evidence than sustained interest across
          many comments.
        </p>
      </div>
    </>
  );
}
