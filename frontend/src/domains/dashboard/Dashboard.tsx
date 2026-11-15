import type { Intent, PostIntentStats } from "../../api/types";
import { aggregate, PIR_DEFINITION, sortPosts } from "../analytics/model";
import { formatCount, formatPercent } from "../../shared/format";
import { Icon } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import "./dashboard.css";

const feedback: { intent: Intent; label: string }[] = [
  { intent: "pre_purchase_question", label: "Questions before buying" },
  { intent: "feature_request", label: "Feature requests" },
  { intent: "objection", label: "Reasons to hesitate" },
  { intent: "testimonial", label: "Positive feedback" },
];

export function Dashboard({
  posts,
  onOpen,
  onInsight,
  onPosts,
}: {
  posts: PostIntentStats[];
  onOpen: (id: number) => void;
  onInsight: (i: Intent | "all") => void;
  onPosts: () => void;
}) {
  const data = aggregate(posts);
  const top = sortPosts(posts, "purchase_intent_rate")
    .filter((p) => p.total_comments >= 10)
    .slice(0, 3);
  const pending = data.total - data.classified;
  return (
    <div className="overview">
      <header className="overview-heading">
        <h1>Overview</h1>
        <span>
          {posts.length} {posts.length === 1 ? "post" : "posts"} ·{" "}
          {formatCount(data.total)} comments
        </span>
      </header>

      <section
        className="panel overview-intent"
        data-tour="dashboard-signals"
        aria-labelledby="overview-intent-title"
      >
        <div>
          <h2 id="overview-intent-title">
            Purchase intent rate{" "}
            <span className="tooltip" tabIndex={0} aria-label={PIR_DEFINITION}>
              <Icon name="help" />
              <span role="tooltip">{PIR_DEFINITION}</span>
            </span>
          </h2>
          <strong className="overview-rate">{formatPercent(data.rate)}</strong>
        </div>
        <div className="overview-explanation">
          {data.total ? (
            <p>
              <strong>
                {formatCount(data.intents.purchase_intent)} of{" "}
                {formatCount(data.total)} comments
              </strong>{" "}
              mention buying, trying or signing up.
            </p>
          ) : (
            <p>No comments to analyze yet.</p>
          )}
          {pending > 0 && (
            <small>
              {formatCount(pending)} comments still awaiting analysis.
            </small>
          )}
        </div>
      </section>

      <div className="overview-columns">
        <section
          className="panel overview-posts"
          aria-labelledby="overview-posts-title"
        >
          <header className="overview-panel-heading">
            <h2 id="overview-posts-title">Top posts</h2>
            <p>Ranked by purchase intent rate</p>
          </header>
          <ol className="overview-ranking">
            {top.map((p, i) => (
              <li key={p.post.id}>
                <button
                  className="overview-post"
                  onClick={() => onOpen(p.post.id)}
                  aria-label={
                    "View post: " + (p.post.caption || "Untitled post")
                  }
                >
                  <span className="overview-rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="overview-post-copy">
                    <span className="overview-post-title">
                      <PlatformBadge platform={p.post.platform} />
                      <span>{p.post.caption || "Untitled post"}</span>
                    </span>
                    <small>
                      {p.intent_counts.purchase_intent} of {p.total_comments}{" "}
                      comments show buying intent
                    </small>
                  </span>
                  <strong>{formatPercent(p.purchase_intent_rate)}</strong>
                  <span className="overview-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {!top.length && (
            <p className="overview-empty">
              A post needs at least 10 comments to appear in this ranking.
            </p>
          )}
          <footer className="overview-panel-footer">
            <button className="text-link" onClick={onPosts}>
              View all posts →
            </button>
            {!!top.length && <span>10+ comments per post</span>}
          </footer>
        </section>

        <section
          className="panel overview-feedback"
          aria-labelledby="overview-feedback-title"
        >
          <header className="overview-panel-heading">
            <h2 id="overview-feedback-title">Audience feedback</h2>
            <p>Comments grouped by what they say</p>
          </header>
          <ul className="overview-feedback-list">
            {feedback.map(({ intent, label }) => (
              <li key={intent}>
                <button
                  disabled={!data.intents[intent]}
                  onClick={() => onInsight(intent)}
                >
                  <span>{label}</span>
                  <strong>{formatCount(data.intents[intent])}</strong>
                  <span className="overview-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <footer className="overview-panel-footer">
            <button className="text-link" onClick={() => onInsight("all")}>
              Explore insights →
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
