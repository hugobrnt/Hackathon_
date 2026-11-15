import "./insights.css";
import { reportTourAction } from "../onboarding/tour-model";
import { useMemo, useState, type ReactNode } from "react";
import type { Intent, PostDetail, PostIntentStats } from "../../api/types";
import { aggregate, INTENTS, intentLabels } from "../analytics/model";
import { groupProductInsights, type ProductInsight } from "./model";
import { Button, Heading, Metric } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { formatDate } from "../../shared/format";
export function Insights({
  posts,
  details,
  loading,
  error,
  initial,
  query,
  onOpen,
  scope,
}: {
  scope?: ReactNode;
  posts: PostIntentStats[];
  details: PostDetail[];
  loading: boolean;
  error: string | null;
  initial: Intent | "all";
  query: string;
  onOpen: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Intent | "all">(initial),
    [postId, setPostId] = useState("all");
  const selectedPosts = posts.filter(
    (p) => postId === "all" || String(p.post.id) === postId,
  );
  const a = aggregate(selectedPosts);
  const groups = useMemo(
    () =>
      groupProductInsights(
        details.filter((d) => postId === "all" || String(d.post.id) === postId),
      ),
    [details, postId],
  );
  const visible = groups.filter(
    (g) =>
      (filter === "all" || filter === g.intent) &&
      (g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.evidence.some((e) =>
          e.message.text.toLowerCase().includes(query.toLowerCase()),
        )),
  );
  return (
    <>
      <Heading title="Product insights" />
      {scope}
      <div className="metrics-grid">
        <Metric
          label="Purchase intent"
          value={a.intents.purchase_intent}
          accent
        />
        <Metric label="Feature requests" value={a.intents.feature_request} />
        <Metric label="Objections" value={a.intents.objection} />
        <Metric label="Problem reports" value={a.intents.support_complaint} />
      </div>
      <div className="filter-row chips">
        <button
          className={"chip " + (filter === "all" ? "selected" : "")}
          onClick={() => setFilter("all")}
        >
          All insights
        </button>
        {INTENTS.filter((i) => i !== "neutral_spam").map((i) => (
          <button
            key={i}
            className={"chip " + (filter === i ? "selected" : "")}
            data-tour={i === "feature_request" ? "feature-filter" : undefined}
            onClick={() => setFilter(i)}
          >
            {intentLabels[i]} <span>{a.intents[i]}</span>
          </button>
        ))}
      </div>
      <div className="section-heading product-insight-heading">
        <span className="muted small">
          {loading ? "Grouping comments…" : `${visible.length} insights`}
        </span>
        <label className="filter">
          <select
            aria-label="Insights post"
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
          >
            <option value="all">All posts</option>
            {posts.map((p) => (
              <option key={p.post.id} value={p.post.id}>
                {p.post.platform} · {p.post.caption || "Untitled post"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status" className="loading">
          Loading comment evidence…
        </p>
      ) : error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : !visible.length ? (
        <div className="panel empty-inline">
          No product insights match these filters.
        </div>
      ) : (
        <div className="product-insight-list">
          {visible.map((g) => (
            <InsightRow key={g.id + ":" + postId} insight={g} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );
}
function InsightRow({
  insight: g,
  onOpen,
}: {
  insight: ProductInsight;
  onOpen: (id: number) => void;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <details
      className="panel product-insight"
      onToggle={(e) => {
        if (e.currentTarget.open && g.intent === "feature_request")
          reportTourAction("feature-request");
      }}
    >
      <summary>
        <span className={"insight-category intent-" + g.intent}>
          {intentLabels[g.intent]}
        </span>
        <span className="product-insight-title">{g.title}</span>
        <span className="insight-count">
          <strong>{g.evidence.length}</strong>{" "}
          {g.evidence.length === 1 ? "comment" : "comments"} · {g.posts}{" "}
          {g.posts === 1 ? "post" : "posts"}
        </span>
        <span className="insight-networks">
          {g.channels.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </span>
        <span className="insight-expand" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="insight-evidence">
        <div className="section-heading">
          <h3>Supporting comments</h3>
          {!!g.review && <span className="pill">{g.review} to review</span>}
        </div>
        {g.evidence.slice(0, limit).map(({ message: m, post: p }) => (
          <article className="insight-comment" key={m.account_id + ":" + m.id}>
            <header>
              <strong>{m.author_name ?? "Unknown author"}</strong>
              <span>{formatDate(m.created_time)}</span>
              {m.classification?.needs_review && (
                <span className="pill">Needs review</span>
              )}
            </header>
            <p>{m.text}</p>
            <button className="insight-source" onClick={() => onOpen(p.id)}>
              <PlatformBadge platform={p.platform} label />
              <span>{p.caption || "Untitled post"} ↗</span>
            </button>
          </article>
        ))}
        {g.evidence.length > limit && (
          <Button onClick={() => setLimit((n) => n + 10)}>
            Show more comments ({g.evidence.length - limit})
          </Button>
        )}
      </div>
    </details>
  );
}
