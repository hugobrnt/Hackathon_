import { useEffect, useState } from "react";
import type { DataMode } from "../../api/source";
import type { SocialAccount } from "../../api/types";
import type { CatalogProduct } from "../products/types";
import {
  confirmProduct,
  loadProductReview,
  type ProductReviewItem,
} from "../products/review-api";
import { Button } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { formatDate } from "../../shared/format";
import { intentLabels } from "../analytics/model";
export function ProductReview({
  mode,
  accounts,
  products,
  post,
  query,
  onOpen,
  revision,
  onConfirmed,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  products: CatalogProduct[];
  post: number | null;
  query: string;
  onOpen: (id: number, account: string) => void;
  revision: number;
  onConfirmed: () => void;
}) {
  const [items, setItems] = useState<ProductReviewItem[]>([]),
    [cursors, setCursors] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [moreBusy, setMoreBusy] = useState(false);
  const key = accounts.map((a) => a.id).join("|");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setItems([]);
    setCursors({});
    Promise.all(
      accounts.map(async (a) => ({
        account: a.id,
        page: await loadProductReview(mode, a.id, post, null, c.signal),
      })),
    )
      .then((results) => {
        if (!c.signal.aborted) {
          setItems(results.flatMap((r) => r.page.items));
          setCursors(
            Object.fromEntries(
              results.map((r) => [r.account, r.page.next_cursor]),
            ),
          );
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [mode, key, post, revision, retry]);
  async function more() {
    setMoreBusy(true);
    setError("");
    try {
      const results = await Promise.all(
        Object.entries(cursors)
          .filter(([, cursor]) => cursor !== null)
          .map(async ([account, cursor]) => ({
            account,
            page: await loadProductReview(mode, account, post, cursor),
          })),
      );
      setItems((old) =>
        [...old, ...results.flatMap((r) => r.page.items)].filter(
          (item, i, list) =>
            list.findIndex(
              (m) =>
                m.message_id === item.message_id &&
                m.account_id === item.account_id,
            ) === i,
        ),
      );
      setCursors((old) => ({
        ...old,
        ...Object.fromEntries(
          results.map((r) => [r.account, r.page.next_cursor]),
        ),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load messages.");
    } finally {
      setMoreBusy(false);
    }
  }
  const shown = items.filter((m) =>
    [m.text, m.author_name, m.post_caption].some((v) =>
      v?.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  return (
    <section className="product-review-list">
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
          <Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading messages to review…</p>
      ) : (
        <>
          <p className="muted small">
            {items.length} messages to review
            {Object.values(cursors).some((v) => v !== null)
              ? " · more available"
              : ""}{" "}
            · classified comments and DMs
          </p>
          {!error && !shown.length && (
            <div className="panel empty-inline">
              {query
                ? "No messages match your search."
                : "No product matches waiting for confirmation."}
            </div>
          )}
          {shown.map((item) => (
            <ReviewRow
              key={item.account_id + ":" + item.message_id}
              item={item}
              account={accounts.find((a) => a.id === item.account_id)!}
              products={products.filter(
                (p) => p.account_id === item.account_id && p.is_active,
              )}
              mode={mode}
              onOpen={onOpen}
              onConfirmed={() => {
                setItems((old) =>
                  old.filter(
                    (m) =>
                      m.message_id !== item.message_id ||
                      m.account_id !== item.account_id,
                  ),
                );
                onConfirmed();
              }}
            />
          ))}
          {Object.values(cursors).some((v) => v !== null) && (
            <Button disabled={moreBusy} onClick={() => void more()}>
              {moreBusy ? "Loading…" : "Load more messages"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
function ReviewRow({
  item,
  account,
  products,
  mode,
  onOpen,
  onConfirmed,
}: {
  item: ProductReviewItem;
  account: SocialAccount;
  products: CatalogProduct[];
  mode: DataMode;
  onOpen: (id: number, account: string) => void;
  onConfirmed: () => void;
}) {
  const [product, setProduct] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    if (!product || busy) return;
    setBusy(true);
    setError("");
    try {
      await confirmProduct(mode, account.id, item.message_id, Number(product));
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm product.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel product-review-row">
      <header>
        <PlatformBadge platform={account.platform} label />
        <span>
          @{account.username} · {item.kind === "dm" ? "DM" : "Comment"} ·{" "}
          {formatDate(item.created_time)}
        </span>
        <span className="pill">{intentLabels[item.intent]}</span>
      </header>
      <strong className="review-author">
        {item.author_name ?? "Audience member"}
      </strong>
      <p>{item.text}</p>
      {item.post_id !== null && (
        <button
          className="insight-source review-origin"
          onClick={() => onOpen(item.post_id!, account.id)}
        >
          {item.post_caption || "Open source post"} ↗
        </button>
      )}
      {item.suggested_product_title && (
        <p className="muted small">
          Suggested: {item.suggested_product_title}
          {item.product_confidence !== null
            ? ` · ${Math.round(item.product_confidence * 100)}% confidence`
            : ""}
        </p>
      )}
      {products.length ? (
        <div className="review-confirm">
          <label className="field">
            Product
            <select
              value={product}
              disabled={busy}
              onChange={(e) => setProduct(e.target.value)}
            >
              <option value="">Choose a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            primary
            disabled={!product || busy}
            onClick={() => void confirm()}
          >
            {busy ? "Saving…" : "Confirm product"}
          </Button>
        </div>
      ) : (
        <a className="text-link" href="#/products">
          Add a product for this channel →
        </a>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </article>
  );
}
