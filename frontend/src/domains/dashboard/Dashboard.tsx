import type { Intent, PostIntentStats } from "../../api/types";
import {
  aggregate,
  intentLabels,
  intentActions,
  PIR_DEFINITION,
  sortPosts,
} from "../analytics/model";
import { formatCount, formatPercent } from "../../shared/format";
import { Button, Metric } from "../../shared/ui";
export function Dashboard({
  posts,
  onOpen,
  onInsight,
}: {
  posts: PostIntentStats[];
  onOpen: (id: number) => void;
  onInsight: (i: Intent) => void;
}) {
  const data = aggregate(posts),
    top = sortPosts(posts, "purchase_intent_rate")
      .filter((p) => p.total_comments >= 10)
      .slice(0, 3);
  const strongest = sortPosts(posts, "intent_score")[0];
  const actions: [Intent, string, string][] = [
    [
      "purchase_intent",
      "Follow the strongest signal",
      strongest?.post.caption ?? "Import posts to find your next opportunity.",
    ],
    [
      "feature_request",
      "Investigate product requests",
      "Understand what people need before deciding what to build.",
    ],
    [
      "support_complaint",
      "Bring problems to the surface",
      "Find the comments that deserve a personal response.",
    ],
  ];
  const categories: Intent[] = [
    "testimonial",
    "objection",
    "feature_request",
    "support_complaint",
  ];
  return (
    <div className="dashboard-grid">
      <section className="next-moves">
        <div className="section-heading">
          <h2>Your next moves</h2>
          <span className="pill">3 priorities</span>
        </div>
        <p className="muted">Start with the signals in your comments.</p>
        {actions.map(([intent, title, desc], i) => (
          <article
            className={"panel action-card " + (i === 0 ? "subtle" : "")}
            key={intent}
          >
            <span className="eyebrow">
              0{i + 1} · {intentLabels[intent]}
            </span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span className="evidence-tag">
              {data.intents[intent]} comments ·{" "}
              {posts.filter((p) => p.intent_counts[intent] > 0).length} posts
            </span>
            <Button
              primary={i === 0}
              onClick={() =>
                i === 0 && strongest
                  ? onOpen(strongest.post.id)
                  : onInsight(intent)
              }
              disabled={!data.intents[intent]}
            >
              {i === 0 ? "Inspect the top post" : "Explore the evidence"} →
            </Button>
          </article>
        ))}
      </section>
      <section className="audience-summary">
        <h2>Understand your audience</h2>
        <div className="panel signal-panel">
          <span className="eyebrow">QUANTITATIVE SIGNALS</span>
          <h3>Which content creates purchase intent?</h3>
          <div className="metrics-grid metrics-grid--three">
            <Metric
              label="Purchase intent rate"
              value={formatPercent(data.rate)}
              hint={
                data.intents.purchase_intent +
                " / " +
                data.total +
                " audience comments"
              }
              accent
              definition={PIR_DEFINITION}
            />
            <Metric
              label="Intent comments"
              value={data.intents.purchase_intent}
              hint="Explicit buy / try / sign-up signals"
            />
            <Metric
              label="Needs review"
              value={data.review}
              hint="Classifications flagged by the backend"
            />
          </div>
          <div className="section-heading">
            <h4>Purchase intent by post</h4>
            <span className="muted small">10+ audience comments</span>
          </div>
          <div className="bar-list">
            {top.length ? (
              top.map((p) => (
                <button
                  className="chart-row"
                  key={p.post.id}
                  onClick={() => onOpen(p.post.id)}
                >
                  <span>{p.post.caption}</span>
                  <div className="track">
                    <span
                      style={{
                        width:
                          Math.max(
                            1,
                            (p.purchase_intent_rate /
                              Math.max(
                                ...top.map((t) => t.purchase_intent_rate),
                                0.01,
                              )) *
                              100,
                          ) + "%",
                      }}
                    />
                  </div>
                  <strong>
                    {formatPercent(p.purchase_intent_rate)}
                    <small>
                      {p.intent_counts.purchase_intent}/{p.total_comments}
                    </small>
                  </strong>
                </button>
              ))
            ) : (
              <p className="muted">
                More comments are needed to compare posts.
              </p>
            )}
          </div>
          <p className="footnote">
            Same account · Lifetime imported comments · Not a measure of sales
          </p>
        </div>
        <div className="panel signal-panel">
          <span className="eyebrow">QUALITATIVE SIGNALS</span>
          <h3>What your audience is telling you</h3>
          <p className="muted small">
            {data.classified} classified comments · Categories from the backend,
            not inferred topic clusters
          </p>
          <div className="table-scroll">
            <table className="insight-table">
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Comments</th>
                  <th>Across posts</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((i) => (
                  <tr key={i}>
                    <th>
                      <span className={"dot intent-" + i} />
                      {intentLabels[i]}
                    </th>
                    <td>{data.intents[i]}</td>
                    <td>
                      {posts.filter((p) => p.intent_counts[i] > 0).length}
                    </td>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => onInsight(i)}
                      >
                        {intentActions[i]} ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="summary-footer">
            <span>{formatCount(data.views)} available post views</span>
            <span>{formatCount(data.shares)} shares</span>
            <span>{posts.length} imported posts</span>
          </div>
        </div>
      </section>
    </div>
  );
}
