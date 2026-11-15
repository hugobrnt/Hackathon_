import { pushNotification } from "../notifications/Notifications";
import { ProductReview } from "./ProductReview";
import "./insights.css";
import { catalogFor, groupCatalog } from "../products/api";
import type { CatalogProduct } from "../products/types";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  insightCategories,
  insightsFor,
  type InsightCategory,
  type InsightsReport,
  type InsightTheme,
} from "../../api/insights";
import { sourceFor, type DataMode } from "../../api/source";
import type { Intent, PostIntentStats, SocialAccount } from "../../api/types";
import { Button, Heading, Metric } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { formatDate } from "../../shared/format";
import { reportTourAction } from "../onboarding/tour-model";
import { loadThemeEvidence, type ThemeEvidence } from "./evidence";
const labels: Record<InsightCategory, string> = {
  objections: "Objections",
  feature_requests: "Feature requests",
  needs: "Needs & questions",
  praise: "Praise",
};
const intentCategory: Partial<Record<Intent, InsightCategory>> = {
  objection: "objections",
  feature_request: "feature_requests",
  pre_purchase_question: "needs",
  testimonial: "praise",
};
interface ReportRow {
  account: SocialAccount;
  report: InsightsReport | null;
  error: string | null;
}
export function Insights({
  mode,
  accounts,
  catalogAccounts = accounts,
  posts,
  initial,
  query,
  onOpen,
  scope,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  catalogAccounts?: SocialAccount[];
  posts: PostIntentStats[];
  initial: Intent | "all";
  query: string;
  onOpen: (id: number, account: string) => void;
  scope?: ReactNode;
}) {
  const [filter, setFilter] = useState<InsightCategory | "all">(
    initial === "all" ? "all" : (intentCategory[initial] ?? "all"),
  );
  const [postId, setPostId] = useState("all"),
    [rows, setRows] = useState<ReportRow[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [productKey, setProductKey] = useState("all");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const catalogKey = catalogAccounts.map((a) => a.id).join("|");
  useEffect(() => {
    const c = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    void Promise.all(
      catalogAccounts.map((a) => catalogFor(mode).list(a.id, c.signal)),
    )
      .then((lists) => {
        if (!c.signal.aborted) setCatalog(lists.flat());
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setCatalogError(
            e instanceof Error ? e.message : "Unable to load products.",
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setCatalogLoading(false);
      });
    return () => c.abort();
  }, [mode, catalogKey, revision]);
  const products = groupCatalog(catalog);
  const productGroup = products.find(
    (group) => group[0].landing_url === productKey,
  );
  const productForAccount = (id: string) =>
    productKey === "all"
      ? null
      : productKey === "unassigned"
        ? 0
        : (productGroup?.find((p) => p.account_id === id)?.id ?? null);
  const productTitle =
    productKey === "all"
      ? "All products"
      : productKey === "unassigned"
        ? "Product to confirm"
        : (productGroup?.[0].title ?? "Product");
  const channelKey = accounts.map((a) => a.id).join("|");
  useEffect(() => {
    setPostId("all");
  }, [channelKey]);
  const post = postId === "all" ? null : Number(postId);
  const owner = posts.find((p) => p.post.id === post)?.post.account_id;
  const selected = accounts.filter(
    (a) =>
      (post === null || a.id === owner) &&
      (productKey === "all" ||
        productKey === "unassigned" ||
        productGroup?.some((p) => p.account_id === a.id)),
  );
  const accountKey = selected.map((a) => a.id).join("|");
  const source = insightsFor(mode),
    controller = useRef<AbortController | null>(null),
    working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    working.current = false;
    setBusy(false);
    setLoading(true);
    setRows([]);
    if (productKey === "unassigned") {
      setLoading(false);
      return () => c.abort();
    }
    void (async () => {
      const result: ReportRow[] = [];
      for (let i = 0; i < selected.length; i += 4) {
        const batch = await Promise.all(
          selected.slice(i, i + 4).map(async (account) => {
            try {
              return {
                account,
                report: await source.latest(
                  account.id,
                  post,
                  c.signal,
                  productForAccount(account.id),
                ),
                error: null,
              };
            } catch (e) {
              return {
                account,
                report: null,
                error:
                  e instanceof Error ? e.message : "Unable to load insights.",
              };
            }
          }),
        );
        if (c.signal.aborted) return;
        result.push(...batch);
      }
      if (!c.signal.aborted) {
        setRows(result);
        setLoading(false);
      }
    })();
    return () => c.abort();
  }, [source, accountKey, post, productKey, catalog, revision]);
  async function generate() {
    if (working.current || loading) return;
    const c = controller.current;
    if (!c || c.signal.aborted) return;
    working.current = true;
    setBusy(true);
    for (const account of selected) {
      if (c.signal.aborted) break;
      try {
        const report = await source.run(
          account.id,
          post,
          c.signal,
          productForAccount(account.id),
        );
        if (!c.signal.aborted)
          setRows((old) =>
            old.map((r) =>
              r.account.id === account.id
                ? { account, report, error: null }
                : r,
            ),
          );
      } catch (e) {
        if (!c.signal.aborted)
          setRows((old) =>
            old.map((r) =>
              r.account.id === account.id
                ? {
                    ...r,
                    error:
                      e instanceof Error ? e.message : "Generation failed.",
                  }
                : r,
            ),
          );
      }
    }
    if (!c.signal.aborted) {
      working.current = false;
      setBusy(false);
    }
  }
  const reports = rows.filter((r) => r.report),
    missing = rows.filter((r) => !r.report && !r.error),
    failed = rows.filter((r) => r.error);
  const themes = reports.flatMap((r) =>
    r.report!.categories.flatMap((c) =>
      c.themes.map((theme) => ({
        theme,
        account: r.account,
        report: r.report!,
      })),
    ),
  );
  const visible = themes
    .filter(
      ({ theme: t }) =>
        (filter === "all" || filter === t.category) &&
        [t.title, t.summary, ...t.quotes].some((s) =>
          s.toLowerCase().includes(query.toLowerCase()),
        ),
    )
    .sort((a, b) => b.theme.mention_count - a.theme.mention_count);
  const total = (category: InsightCategory) =>
    reports.reduce(
      (sum, r) =>
        sum +
        (r.report!.categories.find((c) => c.category === category)
          ?.total_messages ?? 0),
      0,
    );
  return (
    <>
      <Heading title="Product insights">
        {productKey === "unassigned" ? (
          <Button onClick={() => setRevision((n) => n + 1)}>
            Refresh messages
          </Button>
        ) : (
          <Button
            primary
            disabled={loading || busy || catalogLoading || !selected.length}
            onClick={() => void generate()}
          >
            {busy
              ? "Analyzing…"
              : reports.length
                ? "Refresh insights"
                : "Generate insights"}
          </Button>
        )}
      </Heading>
      <div className="insights-layout">
        <aside
          className="insights-products"
          aria-label="Filter insights by product"
        >
          <span className="eyebrow">PRODUCTS</span>
          <button
            aria-pressed={productKey === "all"}
            onClick={() => setProductKey("all")}
          >
            All products
          </button>
          {products.map((group) => (
            <button
              key={group[0].landing_url}
              aria-pressed={productKey === group[0].landing_url}
              onClick={() => setProductKey(group[0].landing_url)}
            >
              <span>{group[0].title}</span>
              {!group.some((p) => p.is_active) && <small>Archived</small>}
            </button>
          ))}
          <button
            aria-pressed={productKey === "unassigned"}
            onClick={() => setProductKey("unassigned")}
          >
            Product to confirm
          </button>
          {catalogLoading && (
            <p role="status" className="muted small">
              Loading products…
            </p>
          )}
          {catalogError && (
            <div role="alert" className="small">
              {catalogError}
              <Button onClick={() => setRevision((n) => n + 1)}>Retry</Button>
            </div>
          )}
          {!catalogLoading && !catalogError && !products.length && (
            <p className="muted small">Add your catalog in Products.</p>
          )}
        </aside>
        <div className="insights-results">
          <h2 className="insights-scope-title">{productTitle}</h2>
          {productKey === "unassigned" && (
            <p className="muted small">
              Choose the product each message refers to. Confirming a match does
              not send a DM.
            </p>
          )}
          {scope}
          <div className="section-heading product-insight-heading">
            <span className="muted small">
              {productKey === "unassigned"
                ? "Human review"
                : loading
                  ? "Loading reports…"
                  : `${reports.length}/${selected.length} channel reports`}
              {mode === "demo" ? " · Demo" : ""}
            </span>
            <label className="filter">
              <select
                aria-label="Insights post"
                value={postId}
                disabled={busy}
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
          {productKey === "unassigned" ? (
            <ProductReview
              key={`${mode}:${selected.map((a) => a.id).join(",")}:${post}:${revision}`}
              mode={mode}
              accounts={selected}
              products={catalog}
              post={post}
              query={query}
              onOpen={onOpen}
              revision={revision}
              onConfirmed={() =>
                pushNotification({
                  text: "Product confirmed. Refresh product insights to update grouped themes.",
                })
              }
            />
          ) : (
            <>
              {!!failed.length && (
                <div role="alert" className="notice notice--error">
                  <span>
                    {failed
                      .map(
                        (r) =>
                          `${r.account.username ?? r.account.platform}: ${r.error}${r.report ? " Showing the previous report." : ""}`,
                      )
                      .join(" ")}
                  </span>
                  <Button
                    disabled={busy}
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    Reload reports
                  </Button>
                </div>
              )}
              {!!missing.length && (
                <div className="notice">
                  <span>
                    No report yet for{" "}
                    {missing
                      .map((r) => r.account.username ?? r.account.platform)
                      .join(", ")}
                    . Generate insights for the selected scope.
                  </span>
                </div>
              )}
              <div className="metrics-grid">
                {insightCategories.map((category) => (
                  <Metric
                    key={category}
                    label={labels[category]}
                    value={reports.length ? total(category) : "—"}
                    definition="Classified incoming messages, including comments and DMs. The API analyzes up to 150 messages per category and channel and returns up to 20 themes."
                  />
                ))}
              </div>
              <div className="filter-row chips">
                <button
                  className={"chip " + (filter === "all" ? "selected" : "")}
                  onClick={() => setFilter("all")}
                >
                  All insights
                </button>
                {insightCategories.map((category) => (
                  <button
                    key={category}
                    data-tour={
                      category === "feature_requests"
                        ? "feature-filter"
                        : undefined
                    }
                    data-tour-next={
                      category === "feature_requests" && filter === category
                        ? "feature-insight"
                        : undefined
                    }
                    className={
                      "chip " + (filter === category ? "selected" : "")
                    }
                    onClick={() => setFilter(category)}
                  >
                    {labels[category]} <span>{total(category)}</span>
                  </button>
                ))}
              </div>
              {!selected.length && !catalogLoading ? (
                <div className="panel empty-inline">
                  This product is not linked to the selected channel or post.
                  Choose another channel.
                </div>
              ) : loading ? (
                <p role="status" className="loading">
                  Loading insights…
                </p>
              ) : !visible.length ? (
                <div className="panel empty-inline">
                  {reports.length
                    ? "No themes match this scope or search."
                    : "Generate your first product insights to see themes and audience quotes."}
                </div>
              ) : (
                <div className="product-insight-list">
                  {visible.map(({ theme, account, report }) => (
                    <ThemeRow key={account.id + ":" + report.run_id + ":" + theme.id} theme={theme} account={account} report={report} mode={mode} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
function ThemeRow({
  theme: t,
  account,
  report,
  mode,
  onOpen,
}: {
  theme: InsightTheme;
  account: SocialAccount;
  report: InsightsReport;
  mode: DataMode;
  onOpen: (id: number, account: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [evidence, setEvidence] = useState<ThemeEvidence | null>(null),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(5),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setError("");
    setEvidence(null);
    loadThemeEvidence(sourceFor(mode), account.id, t, c.signal)
      .then((result) => {
        if (!c.signal.aborted) setEvidence(result);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Source comments unavailable.",
          );
      });
    return () => c.abort();
  }, [open, account.id, t, mode, retry]);
  const heuristic =
    report.writer.includes("heuristic") || report.writer === "none";
  return (
    <details
      className="panel product-insight"
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open && t.category === "feature_requests")
          reportTourAction("feature-request");
      }}
    >
      <summary
        data-tour={
          t.category === "feature_requests" ? "feature-insight" : undefined
        }
      >
        <span className="insight-category">{labels[t.category]}</span>
        <span className="product-insight-title">{t.title}</span>
        <span className="insight-count">
          <strong>{t.mention_count}</strong> mentions · {t.post_ids.length}{" "}
          posts
        </span>
        <span className="insight-networks">
          <PlatformBadge platform={account.platform} />
        </span>
        <span className="insight-expand" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="insight-evidence">
        <div className="section-heading">
          <PlatformBadge platform={account.platform} label />
          <span className="muted small">
            @{account.username ?? account.id} ·{" "}
            {formatDate(report.generated_at)} ·{" "}
            {mode === "demo"
              ? "Demo grouping"
              : heuristic
                ? "Topic grouping"
                : "AI grouping"}
          </span>
        </div>
        {t.summary && (
          <section className="signal-analysis">
            <span className="pill">
              {mode === "demo"
                ? "Signal analysis · demo"
                : heuristic
                  ? "Signal topic summary"
                  : "Signal AI analysis"}
            </span>
            <p className="theme-summary">{t.summary}</p>
          </section>
        )}
        {!!t.quotes.length && (
          <div className="theme-quotes">
            {t.quotes.map((q, i) => (
              <blockquote key={i}>{q}</blockquote>
            ))}
          </div>
        )}
        <h3>Source comments</h3>
        {error ? (
          <div className="notice notice--error" role="alert">
            {error}
            <Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>
          </div>
        ) : !evidence ? (
          <p role="status" className="loading">
            Loading source comments…
          </p>
        ) : (
          <>
            {evidence.comments
              .slice(0, limit)
              .map(({ message: m, post: p }) => (
                <article className="insight-comment" key={m.id}>
                  <header>
                    <strong>{m.author_name ?? "Unknown author"}</strong>
                    <span>{formatDate(m.created_time)}</span>
                    {m.classification?.needs_review && (
                      <span className="pill">Needs review</span>
                    )}
                  </header>
                  <p>{m.text}</p>
                  <button
                    className="insight-source"
                    onClick={() => onOpen(p.id, account.id)}
                  >
                    <PlatformBadge platform={account.platform} label />
                    <span>{p.caption || "Untitled post"} ↗</span>
                  </button>
                </article>
              ))}
            {evidence.comments.length > limit && (
              <Button onClick={() => setLimit((n) => n + 10)}>
                Show more comments ({evidence.comments.length - limit})
              </Button>
            )}
            {evidence.unavailable > 0 && (
              <p className="muted small">
                {evidence.unavailable} source messages are not available in post
                details. The quotes above come from the saved report.
              </p>
            )}
          </>
        )}
        {!!t.post_ids.length && (
          <div className="actions theme-post-links">
            {t.post_ids.map((id) => (
              <button
                key={id}
                className="text-link small"
                onClick={() => onOpen(id, account.id)}
              >
                Post #{id} ↗
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
