import { useEffect, useMemo, useState } from "react";
import type { DataMode } from "../../api/source";
import type { SocialAccount } from "../../api/types";
import type { OutreachSnapshot } from "../../api/outreach-types";
import { outreachFor } from "../../api/outreach";
import { useBrandPosts } from "../accounts/useBrandPosts";
import { useEvidence } from "../accounts/useWorkspace";
import { catalogFor, groupCatalog } from "../products/api";
import type { CatalogProduct } from "../products/types";
import { aggregate, isAudienceComment, sortPosts } from "../analytics/model";
import { dateWindow, scopeDetails, weeklyBuckets } from "./model";
import { formatCount, formatDate, formatPercent } from "../../shared/format";
import { parseTimestamp } from "../../shared/time";
import { Button, Metric, InfoTip } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import "./dashboard.css";
const date = (n: number) => new Date(n).toISOString().slice(0, 10);
export function Dashboard({
  mode,
  accounts,
  revision,
  onOpen,
  onNavigate,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  revision: number;
  onOpen: (id: number, account: string) => void;
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  const [channel, setChannel] = useState("all"),
    [start, setStart] = useState(() => date(Date.now() - 27 * 86400000)),
    [end, setEnd] = useState(() => date(Date.now())),
    [extra, setExtra] = useState<{
      catalog: CatalogProduct[];
      snapshots: OutreachSnapshot[];
    } | null>(null),
    [extraError, setExtraError] = useState("");
  const selected = useMemo(
    () => accounts.filter((a) => channel === "all" || a.id === channel),
    [accounts, channel],
  );
  const brand = useBrandPosts(mode, selected, revision),
    evidence = useEvidence(mode, brand.allPosts, !brand.loading);
  useEffect(() => {
    const c = new AbortController();
    setExtra(null);
    setExtraError("");
    Promise.all(
      selected.map(async (a) => ({
        catalog: await catalogFor(mode).list(a.id, c.signal),
        snapshot: await outreachFor(mode).load(a.id, c.signal),
      })),
    )
      .then((rows) => {
        if (!c.signal.aborted)
          setExtra({
            catalog: rows.flatMap((r) => r.catalog),
            snapshots: rows.map((r) => r.snapshot),
          });
      })
      .catch((e) => {
        if (!c.signal.aborted) setExtraError(e.message);
      });
    return () => c.abort();
  }, [mode, selected.map((a) => a.id).join("|"), revision]);
  const range = dateWindow(start, end),
    scoped = useMemo(
      () => scopeDetails(evidence.items, range.from, range.to),
      [evidence.items, range.from, range.to],
    ),
    data = aggregate(scoped);
  const previous = aggregate(
    scopeDetails(
      evidence.items,
      range.from - (range.to - range.from),
      range.from,
    ),
  );
  const comments = scoped.flatMap((p) => p.comments),
    allComments = evidence.items
      .flatMap((p) => p.comments)
      .filter(isAudienceComment);
  const top = sortPosts(scoped, "purchase_intent_rate").slice(0, 3);
  const buckets = weeklyBuckets(allComments, range.from, range.to);
  const attempts = extra?.snapshots.flatMap((s) => s.attempts) ?? [],
    pending = attempts.filter((a) => a.status === "pending_approval");
  const sent = attempts.filter(
    (a) =>
      a.status === "sent" &&
      parseTimestamp(a.sent_at) >= range.from &&
      parseTimestamp(a.sent_at) < range.to,
  );
  const groups = groupCatalog(extra?.catalog ?? []),
    byId = new Map((extra?.catalog ?? []).map((p) => [p.id, p]));
  const productRows = groups
    .map((group) => {
      const ids = new Set(group.map((p) => p.id));
      const rows = comments.filter(
        (m) =>
          m.classification?.product_id &&
          ids.has(m.classification.product_id) &&
          (m.classification.product_confidence ?? 0) >= 0.7,
      );
      return {
        group,
        rows,
        buy: rows.filter((m) => m.classification?.intent === "purchase_intent")
          .length,
        questions: rows.filter(
          (m) => m.classification?.intent === "pre_purchase_question",
        ).length,
        objections: rows.filter((m) => m.classification?.intent === "objection")
          .length,
      };
    })
    .sort((a, b) => b.buy - a.buy);
  const unmatched = comments.filter(
    (m) =>
      m.classification?.intent === "purchase_intent" &&
      (!m.classification.product_id ||
        !byId.has(m.classification.product_id) ||
        (m.classification.product_confidence ?? 0) < 0.7),
  ).length;
  const latest = selected
    .map((a) => a.last_imported_at)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const insight = (intent: string) =>
    onNavigate("insights", { intent, channel });
  const scopeLabel =
    channel === "all"
      ? `All ${selected.length} channels`
      : (selected[0]?.platform ?? "Channel");
  const loading = brand.loading || evidence.loading;
  return (
    <div className="overview">
      <header className="overview-heading">
        <div>
          <h1>Overview</h1>
          <p className="muted small">
            {scopeLabel} · {brand.allPosts.length} imported posts
            {latest ? ` · Last import ${formatDate(latest)}` : ""}
          </p>
        </div>
        <div className="overview-filters">
          <label>
            Channels
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">All channels</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform} · @{a.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comments from
            <input
              aria-label="Comments from"
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Through
            <input
              aria-label="Comments through"
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      </header>
      {!range.valid ? (
        <p role="alert" className="notice notice--error">
          Choose a valid date range.
        </p>
      ) : loading ? (
        <p role="status">Analyzing comments across your channels…</p>
      ) : evidence.error || brand.results.some((r) => r.error) ? (
        <div role="alert" className="notice notice--error">
          {evidence.error ??
            "Some channels could not load. Retry before comparing results."}
          <Button onClick={brand.retry}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="overview-period">
            <strong>
              {formatDate(start)} – {formatDate(end)}, {end.slice(0, 4)}
            </strong>
            <span>
              Comments received in this period · UTC · includes older posts
            </span>
          </div>
          <section className="overview-kpis" data-tour="dashboard-signals">
            <Metric
              label="Audience comments"
              definition="Incoming audience comments received in the selected dates (UTC), including comments on older posts. Excludes brand replies, DMs and comments without dates."
              value={formatCount(data.total)}
              hint={`${data.classified} analyzed · ${data.total - data.classified} awaiting analysis`}
            />
            <Metric
              label="Purchase intent"
              value={formatPercent(data.rate)}
              accent
              hint={`${data.intents.purchase_intent} of ${data.total} comments mention buying or signing up`}
              definition="Classified purchase-intent comments divided by all incoming audience comments received in the selected dates. Not people or completed purchases."
            />
            <Metric
              label="Questions before buying"
              value={data.intents.pre_purchase_question}
              definition="Comments received in the selected dates that ask about the offer before deciding to buy."
            />
            <Metric
              label="DMs sent"
              value={extra ? sent.length : extraError ? "—" : "…"}
              definition="Successfully sent DMs in the selected dates. Based on loaded activity, up to 500 attempts per channel."
            />
          </section>
          <div className="overview-columns">
            <section className="panel overview-posts">
              <header className="overview-panel-heading">
                <h2>Top posts</h2>
                <InfoTip label="Top posts calculation">
                  Posts ranked by purchase intent rate: buying-intent comments
                  divided by audience comments received in the selected dates.
                  All posts are eligible; the counts show the sample size.
                </InfoTip>
              </header>
              <ol className="overview-ranking">
                {top.map((p, i) => (
                  <li key={p.post.id}>
                    <button
                      className="overview-post"
                      onClick={() => onOpen(p.post.id, p.post.account_id)}
                    >
                      <span className="overview-rank">{i + 1}</span>
                      <span className="overview-post-copy">
                        <span className="overview-post-title">
                          <PlatformBadge platform={p.post.platform} />
                          <span>{p.post.caption || "Untitled post"}</span>
                        </span>
                        <small>
                          Published {formatDate(p.post.created_time)} ·{" "}
                          {p.intent_counts.purchase_intent} buying-intent /{" "}
                          {p.total_comments} comments in period
                        </small>
                      </span>
                      <strong>
                        {formatPercent(
                          p.total_comments ? p.purchase_intent_rate : null,
                        )}
                      </strong>
                      <span className="overview-arrow">↗</span>
                    </button>
                  </li>
                ))}
              </ol>
              {!top.length && (
                <p className="overview-empty">
                  No posts imported yet. Connect a channel and import its
                  content.
                </p>
              )}
              <footer className="overview-panel-footer">
                <button
                  className="text-link"
                  onClick={() => onNavigate("posts", { channel })}
                >
                  Explore posts & Boost →
                </button>
              </footer>
            </section>
            <section className="panel">
              <header className="overview-panel-heading">
                <h2>Purchase intent trend</h2>
                <InfoTip label="Purchase intent trend calculation">
                  Each bar shows buying-intent comments divided by audience
                  comments in that date bucket. Change is measured in percentage
                  points against the previous period of equal length. No
                  comments means no rate.
                </InfoTip>
                <p>
                  {previous.total && data.total
                    ? `${(data.rate! - previous.rate!) * 100 >= 0 ? "+" : ""}${((data.rate! - previous.rate!) * 100).toFixed(1)} percentage points vs previous ${Math.round((range.to - range.from) / 86400000)} days`
                    : "Not enough prior comments for a comparison"}
                </p>
              </header>
              <div className="overview-trend">
                {buckets.map((b) => (
                  <div key={b.start}>
                    <strong>{formatPercent(b.rate)}</strong>
                    <div className="trend-track">
                      <span
                        style={{
                          height:
                            b.rate === null
                              ? 0
                              : Math.max(3, b.rate * 100) + "%",
                        }}
                      />
                    </div>
                    <span>{formatDate(new Date(b.start).toISOString())}</span>
                    <small>
                      {b.intent} / {b.total} comments
                    </small>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="overview-columns">
            <section className="panel">
              <header className="overview-panel-heading">
                <h2>Demand by product</h2>
                <InfoTip label="Product demand calculation">
                  Comments received in the selected dates, matched to a product
                  with at least 70% confidence. Uncertain buying-intent matches
                  appear under Product to confirm.
                </InfoTip>
              </header>
              {extraError ? (
                <p role="alert">{extraError}</p>
              ) : !extra ? (
                <p role="status">Loading products…</p>
              ) : (
                <div className="table-scroll">
                  <table className="overview-product-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Buying intent</th>
                        <th>Questions</th>
                        <th>Objections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map(
                        ({ group, buy, questions, objections }) => (
                          <tr key={group[0].landing_url}>
                            <td>
                              <strong>{group[0].title}</strong>
                              <small>
                                {group.filter((p) => p.is_active).length} active
                                channels
                              </small>
                            </td>
                            <td>{buy}</td>
                            <td>{questions}</td>
                            <td>{objections}</td>
                          </tr>
                        ),
                      )}
                      <tr>
                        <td>Product to confirm</td>
                        <td>{unmatched}</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <footer className="overview-panel-footer">
                <button
                  className="text-link"
                  onClick={() => onNavigate("products")}
                >
                  Manage product facts & links →
                </button>
              </footer>
            </section>
            <section className="panel">
              <header className="overview-panel-heading">
                <h2>Next actions</h2>
                <InfoTip label="Next actions scope">
                  Pending DMs cover all dates. Objections and feature requests
                  count comments in the selected dates; opening Insights shows
                  the full imported history.
                </InfoTip>
              </header>
              <div className="overview-actions">
                <button
                  disabled={!pending.length}
                  onClick={() =>
                    onNavigate("conversations", {
                      account: pending[0]?.account_id ?? selected[0]?.id ?? "",
                      tab: "inbox",
                    })
                  }
                >
                  <strong>
                    {extra ? pending.length : "…"} DMs waiting for approval{" "}
                    <span>→</span>
                  </strong>
                  <small>
                    All dates · confirm the product and reply before sending
                  </small>
                </button>
                <button
                  disabled={!data.intents.objection}
                  onClick={() => insight("objection")}
                >
                  <strong>
                    Address {data.intents.objection} objections <span>→</span>
                  </strong>
                  <small>
                    In this period · explore concerns to improve your offer
                  </small>
                </button>
                <button
                  disabled={!data.intents.feature_request}
                  onClick={() => insight("feature_request")}
                >
                  <strong>
                    Explore {data.intents.feature_request} feature requests{" "}
                    <span>→</span>
                  </strong>
                  <small>
                    In this period · open product insights and supporting
                    comments
                  </small>
                </button>
              </div>
            </section>
          </div>
          <details className="overview-coverage">
            <summary>Data coverage & how to read this view</summary>
            <p>
              Rates count comments, not unique people. Brand replies and DMs are
              excluded.{" "}
              {
                allComments.filter(
                  (m) => !Number.isFinite(parseTimestamp(m.created_time)),
                ).length
              }{" "}
              comments without a date are excluded. Product matches are separate
              from intent classifications. Insights opens the full imported
              history; post details show lifetime metrics.
            </p>
            <p>
              {attempts.length} DM attempts loaded
              {attempts.length >= 500 ? " (up to 500 per channel)" : ""}.
              Pending approvals use all dates. Views, likes and clicks are not
              presented as period totals because the API provides cumulative
              counters.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
