import { useState, type ReactNode } from "react";
import type { Intent, PostDetail, PostIntentStats } from "../../api/types";
import {
  aggregate,
  INTENTS,
  intentLabels,
  intentActions,
  isAudienceComment,
} from "../analytics/model";
import { Comment } from "../posts/DetailDialog";
import { Button, Heading, Metric } from "../../shared/ui";
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
  const [filter, setFilter] = useState<Intent | "all">(initial);
  const a = aggregate(posts),
    comments = details
      .flatMap((d) =>
        d.comments
          .filter(isAudienceComment)
          .map((m) => ({ message: m, post: d.post })),
      )
      .filter(
        ({ message: m }) =>
          (filter === "all" || m.classification?.intent === filter) &&
          m.text.toLowerCase().includes(query.toLowerCase()),
      );
  const [limit, setLimit] = useState(30);
  return (
    <>
      <Heading title="Insights" />
      {scope}
      <div className="metrics-grid">
        <Metric
          label="Purchase intent"
          value={a.intents.purchase_intent}
          hint="Explicit buying or trial signals"
          accent
        />
        <Metric
          label="Feature requests"
          value={a.intents.feature_request}
          hint="Requests to investigate"
        />
        <Metric
          label="Objections"
          value={a.intents.objection}
          hint="Friction in the buying decision"
        />
        <Metric
          label="Problem reports"
          value={a.intents.support_complaint}
          hint="Human follow-up first"
        />
      </div>
      <div className="filter-row chips">
        <button
          className={"chip " + (filter === "all" ? "selected" : "")}
          onClick={() => {
            setFilter("all");
            setLimit(30);
          }}
        >
          All signals
        </button>
        {INTENTS.map((i) => (
          <button
            className={"chip " + (filter === i ? "selected" : "")}
            key={i}
            onClick={() => {
              setFilter(i);
              setLimit(30);
            }}
          >
            {intentLabels[i]} <span>{a.intents[i]}</span>
          </button>
        ))}
      </div>
      <div className="insights-grid">
        <section className="panel">
          <span className="eyebrow">WHAT TO KEEP, FIX AND EXPLORE</span>
          <h2>Signals → decisions</h2>
          <table className="insight-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Comments</th>
                <th>Next move</th>
              </tr>
            </thead>
            <tbody>
              {INTENTS.filter((i) => i !== "neutral_spam").map((i) => (
                <tr key={i}>
                  <th>
                    <button
                      className="text-link"
                      onClick={() => {
                        setFilter(i);
                        setLimit(30);
                      }}
                    >
                      <span className={"dot intent-" + i} />
                      {intentLabels[i]}
                    </button>
                  </th>
                  <td>{a.intents[i]}</td>
                  <td>{intentActions[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel evidence-panel">
          <div className="section-heading">
            <h2>
              {filter === "all" ? "Comment evidence" : intentLabels[filter]}
            </h2>
            <span className="pill">{comments.length} comments</span>
          </div>
          {loading ? (
            <p role="status" className="loading">
              Loading source comments…
            </p>
          ) : error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : !comments.length ? (
            <p className="empty-inline">
              No comments match this category or search.
            </p>
          ) : (
            <>
              {comments.slice(0, limit).map(({ message, post }) => (
                <div className="evidence-source" key={message.id}>
                  <Comment message={message} />
                  <button
                    className="text-link small"
                    onClick={() => onOpen(post.id)}
                  >
                    {post.platform} · {post.caption.slice(0, 65)} ↗
                  </button>
                </div>
              ))}
              {comments.length > limit && (
                <Button onClick={() => setLimit((l) => l + 30)}>
                  Load 30 more comments
                </Button>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
