import type { PostDetail, PostIntentStats } from "../../api/types";
import {
  aggregate,
  intentTimeline,
  periodRate,
  PIR_DEFINITION,
  isAudienceComment,
} from "./model";
import { formatCount, formatDate, formatPercent } from "../../shared/format";
import { Heading, Metric } from "../../shared/ui";
export function Analytics({
  posts,
  details,
  loading,
  error,
}: {
  posts: PostIntentStats[];
  details: PostDetail[];
  loading: boolean;
  error: string | null;
}) {
  const totals = aggregate(posts),
    messages = details.flatMap((p) => p.comments),
    timeline = intentTimeline(messages),
    current = periodRate(timeline.slice(4)),
    previous = periodRate(timeline.slice(0, 4));
  const delta =
    current.rate !== null && previous.rate !== null
      ? (current.rate - previous.rate) * 100
      : null;
  const max = Math.max(0.1, ...timeline.map((b) => b.rate ?? 0));
  return (
    <>
      <Heading title="Analytics" />
      <div className="metrics-grid">
        <Metric
          label="Purchase intent · last 28 days"
          value={loading ? "…" : error ? "—" : formatPercent(current.rate)}
          accent
          hint={
            loading
              ? "Loading dated comments"
              : current.count + " / " + current.total + " audience comments"
          }
          definition={PIR_DEFINITION}
        />
        <Metric
          label="Change vs previous 28 days"
          value={
            loading
              ? "…"
              : delta === null
                ? "—"
                : (delta >= 0 ? "+" : "") + delta.toFixed(1) + " pp"
          }
          hint={
            delta === null
              ? "Both periods need comment data"
              : "Percentage points, not proven uplift"
          }
        />
        <Metric
          label="All-time intent comments"
          value={totals.intents.purchase_intent}
          hint="Across imported posts"
        />
        <Metric
          label="Classification coverage"
          value={formatPercent(
            totals.total ? totals.classified / totals.total : null,
          )}
          hint={totals.classified + " / " + totals.total + " comments"}
        />
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <span className="eyebrow">BY COMMENT DATE · UTC</span>
          <h2>Purchase intent over time</h2>
          <p className="muted small">
            Eight weeks of imported comments. Period rates are weighted by
            comment volume.
          </p>
          {loading ? (
            <p className="loading" role="status">
              Calculating the timeline from source comments…
            </p>
          ) : error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : (
            <div className="trend-chart">
              {timeline.map((b) => (
                <div className="trend-column" key={b.start}>
                  <strong>{formatPercent(b.rate)}</strong>
                  <div className="trend-track">
                    <span
                      style={{
                        height:
                          b.rate === null
                            ? "0"
                            : Math.max(2, (b.rate / max) * 100) + "%",
                      }}
                    />
                  </div>
                  <small>{formatDate(new Date(b.start).toISOString())}</small>
                  <span>
                    {b.count}/{b.total}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="footnote">
            — means no comments in the bucket. Unclassified comments remain in
            the denominator.{" "}
            {
              messages.filter(isAudienceComment).filter((m) => !m.created_time)
                .length
            }{" "}
            undated comments excluded. Classification changes can revise this
            historical view.
          </p>
        </section>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Available post views"
          value={formatCount(totals.views)}
          hint="Lifetime snapshots, not a daily trend"
        />
        <Metric
          label="Likes"
          value={formatCount(totals.likes)}
          hint="Imported platform metrics"
        />
        <Metric
          label="Shares"
          value={formatCount(totals.shares)}
          hint="Missing values stay unavailable"
        />
        <Metric
          label="Attributed purchases"
          value="Not connected"
          hint="Requires product-event tracking"
        />
      </div>
    </>
  );
}
