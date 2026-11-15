import { PlatformBadge } from "../../shared/PlatformBadge";
import { useEffect, useRef, useState } from "react";
import { sourceFor, type DataMode } from "../../api/source";
import type { Intent, Message, PostDetail } from "../../api/types";
import {
  INTENTS,
  intentLabels,
  PIR_DEFINITION,
  isAudienceComment,
} from "../analytics/model";
import {
  formatCount,
  formatDate,
  formatPercent,
  formatScore,
} from "../../shared/format";
import { safeExternalUrl } from "../../shared/storage";
import { Button, Metric, PostVisual } from "../../shared/ui";
export function Comment({ message }: { message: Message }) {
  const c = message.classification;
  return (
    <article
      className={"comment " + (message.author_is_owner ? "comment--owner" : "")}
    >
      <header>
        <span className="comment-avatar">
          {(message.author_name ?? "?").slice(0, 1)}
        </span>
        <strong>{message.author_name ?? "Unknown author"}</strong>
        {message.author_is_owner ? (
          <span className="pill">Brand reply</span>
        ) : c ? (
          <span className={"intent-badge intent-" + c.intent}>
            {intentLabels[c.intent]}
          </span>
        ) : (
          <span className="pill">Not classified</span>
        )}
        <time>{formatDate(message.created_time)}</time>
      </header>
      <p>{message.text}</p>
      {c && c.intent !== "neutral_spam" && (
        <p className="small">
          <strong>Product: {c.product_title ?? "To confirm"}</strong>
          {c.product_confidence != null &&
            ` · ${Math.round(c.product_confidence * 100)}% match confidence`}
          {c.product_confidence != null &&
            c.product_confidence < 0.7 &&
            " · Human review required"}
        </p>
      )}
      {c && (
        <small>
          {c.sentiment} · {Math.round(c.confidence * 100)}% confidence
          {c.needs_review ? " · Needs review" : ""} · {c.rationale}
        </small>
      )}
    </article>
  );
}
export function DetailDialog({
  id,
  accountId,
  mode,
  onClose,
}: {
  id: number;
  accountId: string;
  mode: DataMode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [detail, setDetail] = useState<PostDetail | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<Intent | "all">("all"),
    [query, setQuery] = useState(""),
    [captionExpanded, setCaptionExpanded] = useState(false);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      node?.close();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError("");
    setFilter("all");
    sourceFor(mode)
      .detail(id, controller.signal)
      .then((d) => {
        if (d.post.account_id !== accountId)
          throw new Error("This post does not belong to the selected account.");
        if (!controller.signal.aborted) setDetail(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, accountId, mode]);
  const comments =
    detail?.comments.filter(
      (m) =>
        (filter === "all" || m.classification?.intent === filter) &&
        m.text.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const url = safeExternalUrl(detail?.post.permalink ?? null);
  return (
    <dialog
      className="detail-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="detail-shell">
        <header className="detail-top">
          <div>
            <span className="eyebrow">POST INTELLIGENCE</span>
            <h2 id="detail-title">Post details</h2>
          </div>
          <Button onClick={onClose} aria-label="Close post detail">
            ✕
          </Button>
        </header>
        {error ? (
          <div role="alert" className="notice notice--error">
            {error}
          </div>
        ) : !detail ? (
          <div className="loading" role="status">
            Loading post and comments…
          </div>
        ) : (
          <>
            <div className="detail-overview">
              <div className="detail-preview">
                <PostVisual
                  picture={detail.post.picture}
                  caption={detail.post.caption}
                />
                {url && (
                  <a
                    className="text-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open on {detail.post.platform} ↗
                  </a>
                )}
                <div className="detail-platform">
                  <PlatformBadge platform={detail.post.platform} label />
                </div>
                <small>
                  {formatDate(detail.post.created_time)} ·{" "}
                  {detail.post.media_type ?? "Post"}
                </small>
              </div>
              <div className="detail-summary">
                <section
                  className="post-content-block"
                  aria-label="Post content"
                >
                  <h3>Post content</h3>
                  <p
                    className={
                      "post-caption " + (captionExpanded ? "expanded" : "")
                    }
                  >
                    {detail.post.caption || "No caption."}
                  </p>
                  {detail.post.caption.length > 400 && (
                    <button
                      className="text-link"
                      aria-expanded={captionExpanded}
                      onClick={() => setCaptionExpanded((v) => !v)}
                    >
                      {captionExpanded ? "Show less" : "Read full caption"}
                    </button>
                  )}
                </section>
                <p className="muted small detail-metric-period">
                  Lifetime metrics
                  {detail.post.metrics_updated_at
                    ? ` · Updated ${formatDate(detail.post.metrics_updated_at)}`
                    : ""}
                </p>
                <div className="metrics-grid metrics-grid--three">
                  <Metric
                    label="Purchase intent rate"
                    value={
                      detail.total_comments
                        ? formatPercent(detail.purchase_intent_rate)
                        : "—"
                    }
                    hint={
                      detail.intent_counts.purchase_intent +
                      " / " +
                      detail.total_comments +
                      " comments"
                    }
                    accent
                    definition={PIR_DEFINITION}
                  />
                  <Metric
                    label="Intent score"
                    value={formatScore(detail.intent_score)}
                    hint="Weighted score out of 3"
                  />
                  <Metric
                    label="Needs review"
                    value={detail.needs_review}
                    hint="Classifier flagged"
                  />
                </div>
                <div className="platform-metrics">
                  {[
                    ["Views", detail.post.view_count],
                    ["Likes", detail.post.like_count],
                    ["Comments", detail.post.comment_count],
                    ["Shares", detail.post.share_count],
                    ["Reposts", detail.post.repost_count],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <strong>{formatCount(value as number | null)}</strong>
                      <small>{label}</small>
                    </div>
                  ))}
                </div>
                <h4>What people are saying</h4>
                <div className="breakdown">
                  {INTENTS.map((i) => (
                    <button
                      key={i}
                      onClick={() => setFilter(filter === i ? "all" : i)}
                      aria-pressed={filter === i}
                    >
                      <span>{intentLabels[i]}</span>
                      <span className="track">
                        <span
                          className={"intent-" + i}
                          style={{
                            width:
                              (detail.total_comments
                                ? (detail.intent_counts[i] /
                                    detail.total_comments) *
                                  100
                                : 0) + "%",
                          }}
                        />
                      </span>
                      <strong>{detail.intent_counts[i]}</strong>
                    </button>
                  ))}
                </div>
                <p className="footnote">
                  {detail.classified_comments}/{detail.total_comments} audience
                  comments classified. Platform comment totals can include
                  replies. Missing metrics are shown as —.
                </p>
              </div>
            </div>
            <section className="comment-section">
              <div className="section-heading">
                <h3>
                  Comment evidence{" "}
                  <span className="muted">({comments.length})</span>
                </h3>
                <Button
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Reset filters
                </Button>
              </div>
              <div className="filter-row">
                <input
                  aria-label="Search comments"
                  placeholder="Search the comments…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Comment intent"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Intent | "all")}
                >
                  <option value="all">
                    All comments, including brand replies
                  </option>
                  {INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {intentLabels[i]}
                    </option>
                  ))}
                </select>
              </div>
              {!comments.length ? (
                <p className="empty-inline">No comments match this filter.</p>
              ) : (
                comments.map((m) => <Comment key={m.id} message={m} />)
              )}
              <p className="footnote">
                {detail.comments.filter(isAudienceComment).length} incoming
                audience comments. {detail.unclassified_comments} awaiting
                classification.
              </p>
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
