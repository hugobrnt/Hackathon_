import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PostIntentStats } from "../../api/types";
import type { DataMode } from "../../api/source";
import {
  adsFor,
  totalBudget,
  type AdAccount,
  type AdBoost,
  type BoostGoal,
  type BoostInput,
} from "../../api/ads";
import { ApiError } from "../../api/client";
import { Button } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { formatDate, formatPercent } from "../../shared/format";
import "./boost.css";
const goals: Record<BoostGoal, string> = {
  engagement: "Engagement",
  awareness: "Awareness",
  video_views: "Video views",
};
export function BoostDialog({
  post,
  mode,
  onClose,
  onOpen,
}: {
  post: PostIntentStats;
  mode: DataMode;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    working = useRef(false),
    source = adsFor(mode);
  const [accounts, setAccounts] = useState<AdAccount[]>([]),
    [history, setHistory] = useState<AdBoost[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [accountError, setAccountError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [error, setError] = useState("");
  const [adAccount, setAdAccount] = useState(""),
    [amount, setAmount] = useState("5"),
    [days, setDays] = useState("3"),
    [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily"),
    [goal, setGoal] = useState<BoostGoal>("engagement"),
    [name, setName] = useState(""),
    [paused, setPaused] = useState(true);
  const [review, setReview] = useState<BoostInput | null>(null),
    [result, setResult] = useState<AdBoost | null>(null),
    [uncertain, setUncertain] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    alive.current = true;
    const d = ref.current;
    d?.showModal();
    return () => {
      alive.current = false;
      d?.close();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setAccountError("");
    setHistoryError("");
    void Promise.allSettled([
      source.accounts(post.post.account_id, c.signal),
      source.history(post.post.id, post.post.account_id, c.signal),
    ]).then(([a, h]) => {
      if (c.signal.aborted) return;
      if (a.status === "fulfilled") {
        setAccounts(a.value);
        setAdAccount((old) =>
          a.value.some((a) => a.id === old) ? old : (a.value[0]?.id ?? ""),
        );
      } else
        setAccountError(
          a.reason instanceof Error
            ? a.reason.message
            : "Ad accounts unavailable.",
        );
      if (h.status === "fulfilled") {
        setHistory(h.value);
        setUncertain(false);
      } else
        setHistoryError(
          h.reason instanceof Error
            ? h.reason.message
            : "Boost history unavailable.",
        );
      setLoading(false);
    });
    return () => c.abort();
  }, [source, post.post.id, post.post.account_id, revision]);
  const account = accounts.find((a) => a.id === adAccount);
  const input: BoostInput = {
    ad_account_id: adAccount,
    budget_amount: Number(amount),
    budget_type: budgetType,
    duration_days: Number(days),
    goal,
    name: name.trim() || null,
    start_paused: paused,
    confirm: false,
  };
  const currency = account?.currency ?? "account currency";
  const pending = history.some((b) => b.status === "requested");
  function prepare(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !account ||
      !Number.isFinite(input.budget_amount) ||
      input.budget_amount <= 0 ||
      !Number.isInteger(input.duration_days) ||
      input.duration_days < 1 ||
      input.duration_days > 30 ||
      (input.budget_type === "daily" && input.budget_amount < 1)
    ) {
      setError(
        "Choose an ad account, a positive budget and a duration from 1 to 30 days. Daily budgets start at 1.",
      );
      return;
    }
    if (!paused && !account.currency) {
      setError("A currency is required before creating an active campaign.");
      return;
    }
    setReview({ ...input, confirm: true });
  }
  async function create() {
    if (!review || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const created = await source.create(
        post.post.id,
        post.post.account_id,
        review,
      );
      if (alive.current) {
        setResult(created);
        setReview(null);
        setHistory((old) => [
          created,
          ...old.filter((b) => b.id !== created.id),
        ]);
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Unable to create boost.");
        setReview(null);
        setUncertain(true);
        // Read history after errors; never automatically repeat a campaign POST.
        try {
          const entries = await source.history(
            post.post.id,
            post.post.account_id,
          );
          if (alive.current) setHistory(entries);
        } catch {
          if (alive.current)
            setHistoryError(
              "Could not check campaign history. Reload before trying again.",
            );
        }
        if (e instanceof ApiError && e.status === 0)
          setError(
            "Creation could not be confirmed. Reload and check boost history before creating another campaign.",
          );
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function refresh(b: AdBoost) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await source.refresh(
        b.id,
        post.post.id,
        post.post.account_id,
      );
      if (alive.current) {
        setHistory((old) => old.map((b) => (b.id === next.id ? next : b)));
        setResult((old) => (old?.id === next.id ? next : old));
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to refresh status.");
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="boost-dialog boost-connected"
      aria-labelledby="boost-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!working.current) onClose();
      }}
    >
      <header className="section-heading">
        <h2 id="boost-title">
          {review ? "Review your boost" : "Boost this post"}
        </h2>
        <Button aria-label="Close boost" disabled={busy} onClick={onClose}>
          ✕
        </Button>
      </header>
      <div className="section-heading">
        <PlatformBadge platform={post.post.platform} label />
        {mode === "demo" && <span className="pill">Demo · no ad spend</span>}
      </div>
      <p className="boost-caption">{post.post.caption || "Untitled post"}</p>
      <p className="boost-signal">
        <strong>
          {post.total_comments ? formatPercent(post.purchase_intent_rate) : "—"}
        </strong>{" "}
        purchase intent · {post.intent_counts.purchase_intent}/
        {post.total_comments} comments
      </p>
      {error && (
        <div role="alert" className="notice notice--error">
          {error}
        </div>
      )}
      {(accountError || historyError) && (
        <div role="alert" className="notice notice--error">
          <span>
            {accountError} {historyError}
          </span>
          <Button
            disabled={busy || loading || !!review}
            onClick={() => setRevision((n) => n + 1)}
          >
            Reload
          </Button>
        </div>
      )}
      {result ? (
        <section className="boost-result" role="status">
          <h3>
            {result.is_success
              ? mode === "demo"
                ? "Demo boost created"
                : "Campaign created"
              : "Campaign request saved"}
          </h3>
          <p>
            {result.review_status === "pending_review"
              ? "Awaiting platform review. "
              : ""}
            {result.ad_status ?? result.status}
          </p>
          <p>Campaign: {result.campaign_id ?? "Not assigned yet"}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setResult(null);
              setReview(null);
              setName("");
            }}
          >
            Create another boost
          </Button>
        </section>
      ) : review ? (
        <section className="boost-review">
          <dl>
            <dt>Ad account</dt>
            <dd>
              {account?.name ?? review.ad_account_id} · {review.ad_account_id}
            </dd>
            <dt>Goal</dt>
            <dd>{goals[review.goal]}</dd>
            <dt>Budget</dt>
            <dd>
              {review.budget_amount.toFixed(2)} {currency}{" "}
              {review.budget_type === "daily" ? "per day" : "total"}
            </dd>
            <dt>Duration</dt>
            <dd>{review.duration_days} days</dd>
            <dt>Total budget</dt>
            <dd>
              <strong>
                {totalBudget(review).toFixed(2)} {currency}
              </strong>
            </dd>
            <dt>Delivery</dt>
            <dd>
              {review.start_paused
                ? "Created paused"
                : "Starts after platform review"}
            </dd>
            <dt>Name</dt>
            <dd>
              {review.name || "Boost – " + post.post.caption.slice(0, 40)}
            </dd>
          </dl>
          <p className="muted small">
            {mode === "demo"
              ? "This creates a local simulated campaign only."
              : review.start_paused
                ? "The campaign will stay paused until you activate it on the ad platform."
                : "This creates a real campaign that may spend the total budget shown above."}
          </p>
          <div className="actions">
            <Button primary disabled={busy} onClick={() => void create()}>
              {busy
                ? "Creating…"
                : mode === "demo"
                  ? "Confirm simulated boost"
                  : review.start_paused
                    ? "Confirm paused campaign"
                    : "Confirm and launch campaign"}
            </Button>
            <Button disabled={busy} onClick={() => setReview(null)}>
              Back
            </Button>
          </div>
        </section>
      ) : loading ? (
        <p role="status" className="loading">
          Loading ad accounts and campaign history…
        </p>
      ) : (
        <form onSubmit={prepare} className="boost-form">
          {!accounts.length && !accountError && (
            <p className="notice">
              No ad accounts are available for this channel. Connect an eligible
              ad account before boosting.
            </p>
          )}
          <label className="field">
            Ad account
            <select
              value={adAccount}
              onChange={(e) => {
                setAdAccount(e.target.value);
                setPaused(true);
              }}
              required
              disabled={busy || !accounts.length}
            >
              <option value="">Choose an ad account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.id} · {a.currency ?? "Currency unavailable"} ·{" "}
                  {a.id}
                </option>
              ))}
            </select>
          </label>
          <div className="boost-fields">
            <label className="field">
              Goal
              <select
                value={goal}
                disabled={busy}
                onChange={(e) => setGoal(e.target.value as BoostGoal)}
              >
                {Object.entries(goals).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Budget type
              <select
                value={budgetType}
                disabled={busy}
                onChange={(e) =>
                  setBudgetType(e.target.value as "daily" | "lifetime")
                }
              >
                <option value="daily">Daily</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            <label className="field">
              Budget ({currency})
              <input
                type="number"
                step="0.01"
                min={budgetType === "daily" ? 1 : 0.01}
                required
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="field">
              Duration (days)
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                required
                value={days}
                disabled={busy}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Campaign name · optional
            <input
              maxLength={100}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder={"Boost – " + post.post.caption.slice(0, 40)}
            />
          </label>
          <label className="boost-paused">
            <input
              type="checkbox"
              checked={paused}
              disabled={busy || !account?.currency}
              onChange={(e) => setPaused(e.target.checked)}
            />
            Create paused
          </label>
          {!account?.currency && accounts.length > 0 && (
            <p className="muted small">
              Currency unavailable. Only paused creation is available.
            </p>
          )}
          <p className="boost-total">
            Total budget{" "}
            <strong>
              {Number.isFinite(totalBudget(input))
                ? totalBudget(input).toFixed(2)
                : "—"}{" "}
              {currency}
            </strong>
          </p>
          {(uncertain || pending) && (
            <div className="notice">
              <span>
                {pending
                  ? "A campaign request is still pending. Check its status before creating another."
                  : "Check the history below before creating another campaign."}
              </span>
              <Button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
                Reload history
              </Button>
            </div>
          )}
          <Button
            primary
            type="submit"
            disabled={
              busy ||
              !account ||
              !!accountError ||
              !!historyError ||
              uncertain ||
              pending
            }
          >
            Review boost →
          </Button>
        </form>
      )}
      <section className="boost-history">
        <div className="section-heading">
          <h3>Boost history</h3>
          <Button
            disabled={busy || loading || !!review}
            onClick={() => setRevision((n) => n + 1)}
          >
            Reload
          </Button>
        </div>
        {!history.length ? (
          <p className="muted small">No boosts recorded for this post.</p>
        ) : (
          history.map((b) => (
            <article className="boost-history-row" key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <p>
                  {b.total_budget.toFixed(2)}{" "}
                  {b.currency ??
                    accounts.find((a) => a.id === b.ad_account_id)?.currency ??
                    "account currency"}{" "}
                  · {b.duration_days} days · {formatDate(b.created_at)}
                </p>
                <p>
                  {b.status} · {b.ad_status ?? "Delivery unknown"} ·{" "}
                  {b.review_status ?? "Review unknown"}
                </p>
                {b.error && <p className="boost-error">{b.error}</p>}
              </div>
              <Button
                disabled={
                  busy || b.status === "failed" || b.status === "requested"
                }
                onClick={() => void refresh(b)}
              >
                {mode === "demo" ? "Simulate review" : "Refresh status"}
              </Button>
            </article>
          ))
        )}
      </section>
      <button
        disabled={busy}
        className="text-link small"
        onClick={() => {
          onClose();
          onOpen(post.post.id);
        }}
      >
        View post details ↗
      </button>
    </dialog>
  );
}
