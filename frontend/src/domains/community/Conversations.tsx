import { useEffect, useRef, useState } from "react";
import type { DataMode } from "../../api/source";
import { sourceFor } from "../../api/source";
import { productsDiffer } from "./brand-product";
import type { PostIntentStats, SocialAccount } from "../../api/types";
import type {
  DmAttempt,
  DmStatus,
  OutreachSnapshot,
  TrackedLink,
} from "../../api/outreach-types";
import { outreachFor } from "../../api/outreach";
import { simulateClick } from "../demo/outreach";
import { Button, Empty, Heading, Metric } from "../../shared/ui";
import { formatCount, formatDate, formatPercent } from "../../shared/format";
import { intentLabels } from "../analytics/model";
import { statusLabels, canApprove } from "./model";
import { Automation } from "./Automation";
import { ConfirmAction, type ActionConfirmation } from "./ConfirmAction";

export function Conversations({
  mode,
  accountId,
  accounts,
  posts,
  onPosts,
  onOpen,
  initialTab = "inbox",
}: {
  mode: DataMode;
  accountId: string;
  accounts: SocialAccount[];
  posts: PostIntentStats[];
  onPosts: () => void;
  onOpen: (id: number) => void;
  initialTab?: string;
}) {
  const source = outreachFor(mode),
    [tab, setTab] = useState(
      ["inbox", "automation", "tracking"].includes(initialTab)
        ? initialTab
        : "inbox",
    ),
    [data, setData] = useState<OutreachSnapshot | null>(null),
    [productMismatch, setProductMismatch] = useState(false),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState<DmStatus | "all">("all"),
    [postFilter, setPostFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(0),
    [confirmation, setConfirmation] = useState<ActionConfirmation | null>(null);
  const alive = useRef(true),
    busyRef = useRef(false),
    requestSequence = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestSequence.current++;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setInterval>;
    async function refresh() {
      if (busyRef.current) return;
      const seq = ++requestSequence.current;
      try {
        const [result, products] = await Promise.all([
          source.load(accountId, c.signal),
          Promise.all(accounts.map((a) => source.product(a.id, c.signal))),
        ]);
        if (
          !c.signal.aborted &&
          alive.current &&
          seq === requestSequence.current
        ) {
          setData({
            ...result,
            product: products.find((p) => p !== null) ?? null,
          });
          setProductMismatch(productsDiffer(products));
          setLoadError("");
        }
      } catch (e) {
        if (
          !c.signal.aborted &&
          alive.current &&
          seq === requestSequence.current
        )
          setLoadError(
            e instanceof Error ? e.message : "Unable to load DM activity.",
          );
      } finally {
        if (!c.signal.aborted && alive.current) setLoading(false);
      }
    }
    void refresh();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [source, accountId, accounts.map((a) => a.id).join("|"), revision]);
  async function perform(action: () => Promise<string>) {
    if (busyRef.current) return;
    busyRef.current = true;
    requestSequence.current++;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const message = await action();
      if (alive.current) {
        setNotice(message);
        setRevision((r) => r + 1);
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Action failed.");
        setRevision((r) => r + 1);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function ask(value: ActionConfirmation) {
    if (mode === "demo") void value.action();
    else setConfirmation(value);
  }
  const rows = (data?.attempts ?? []).filter(
    (a) =>
      (status === "all" || a.status === status) &&
      (postFilter === "all" || String(a.post_id) === postFilter) &&
      (a.recipient_name + " " + a.text + " " + a.reason)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const active =
    rows.find((a) => a.id === selected) ??
    rows.find((a) => a.status === "pending_approval") ??
    rows[0];
  const stats = data?.stats;
  const hasLocalTracking = data?.links.some((l) => {
    try {
      return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(
        new URL(l.short_url).hostname,
      );
    } catch {
      return false;
    }
  });
  return (
    <>
      <Heading title="Conversations">
        <Button
          disabled={busy || loading}
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh activity
        </Button>
      </Heading>
      {(error || loadError) && (
        <div role="alert" className="notice notice--error">
          <span>{error || loadError}</span>
          <Button disabled={busy} onClick={() => setRevision((r) => r + 1)}>
            Retry
          </Button>
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          <span>{notice}</span>
          <button
            aria-label="Dismiss activity notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <div className="metrics-grid">
        <Metric
          label="DMs sent"
          value={stats ? formatCount(stats.dms_sent) : "—"}
          hint="Account total · successfully sent"
        />
        <Metric
          label="Links clicked"
          value={stats ? formatCount(stats.links_clicked) : "—"}
          hint="Sent DMs with at least one human click"
        />
        <Metric
          label="DM click-through rate"
          value={
            stats
              ? formatPercent(stats.dms_sent ? stats.click_through_rate : null)
              : "—"
          }
          accent
          hint="Clicked sent DMs ÷ sent DMs"
        />
        <Metric
          label="Awaiting approval"
          value={
            data
              ? data.attempts.filter((a) => a.status === "pending_approval")
                  .length
              : "—"
          }
          hint="Among the latest 500 attempts"
        />
      </div>
      <div
        className="outreach-tabs"
        role="tablist"
        aria-label="Conversation views"
      >
        {[
          ["inbox", "DM activity"],
          ["automation", "Automation"],
          ["tracking", "Tracking"],
        ].map(([id, label]) => (
          <button
            role="tab"
            id={"outreach-tab-" + id}
            aria-controls="outreach-panel"
            aria-selected={tab === id}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        id="outreach-panel"
        role="tabpanel"
        aria-labelledby={"outreach-tab-" + tab}
      >
        {loading && !data ? (
          <div role="status" className="loading-state">
            Loading messages and tracking…
          </div>
        ) : !data ? (
          <Empty
            title="DM data is unavailable"
            action={
              <Button onClick={() => setRevision((r) => r + 1)}>Retry</Button>
            }
          >
            Check that your backend includes F7 and F8.
          </Empty>
        ) : tab === "automation" ? (
          <Automation
            mode={mode}
            account={accountId}
            accounts={accounts.map((a) => a.id)}
            mismatch={productMismatch}
            posts={posts}
            product={data.product}
            busy={busy}
            perform={perform}
            confirm={ask}
          />
        ) : tab === "tracking" ? (
          <>
            {hasLocalTracking && (
              <p className="notice">
                Some tracking URLs point to localhost. Use a public tracking URL
                on the backend to measure prospect clicks; DMs may currently use
                the UTM destination directly.
              </p>
            )}
            <div className="tracking-explainer">
              <div>
                <h2>From a DM to a product visit</h2>
                <p className="muted">
                  {data.stats.clicks} human clicks, including repeat visits. Bot
                  previews are excluded from CTR. Clicks do not prove a
                  purchase.
                </p>
              </div>
              <span className="pill">
                {data.links.reduce((sum, l) => sum + l.bot_hits, 0)} bot
                previews
              </span>
            </div>
            <div className="panel table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Sent DMs</th>
                    <th>Clicked DMs</th>
                    <th>Human clicks</th>
                    <th>DM CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.posts.map((p) => (
                    <tr key={p.post_id}>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => onOpen(p.post_id)}
                        >
                          {posts.find((v) => v.post.id === p.post_id)?.post
                            .caption ?? "Post " + p.post_id}{" "}
                          ↗
                        </button>
                      </td>
                      <td>{p.dms_sent}</td>
                      <td>{p.links_clicked}</td>
                      <td>{p.clicks}</td>
                      <td className="blue">
                        {formatPercent(p.click_through_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.stats.posts.length && (
                <p className="empty-inline">
                  Tracking starts after a DM is sent.
                </p>
              )}
            </div>
            <h3 className="tracking-links-title">
              Tracked links <span className="muted">({data.links.length})</span>
            </h3>
            <div className="panel table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Link / destination</th>
                    <th>Post</th>
                    <th>Human clicks</th>
                    <th>Bot previews</th>
                    <th>Last click</th>
                  </tr>
                </thead>
                <tbody>
                  {data.links.map((l) => (
                    <tr key={l.code}>
                      <td>
                        <code>{l.code}</code>
                        <small className="link-destination">
                          {l.destination_url}
                        </small>
                      </td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => onOpen(l.post_id)}
                        >
                          Post {l.post_id} ↗
                        </button>
                      </td>
                      <td>{l.click_count}</td>
                      <td>{l.bot_hits}</td>
                      <td>{formatDate(l.last_clicked_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.links.length && (
                <p className="empty-inline">
                  Generate a preview or process comments to create a link.
                </p>
              )}
            </div>
            <p className="footnote">
              Preview-only links may appear here. Only links associated with
              successfully sent DMs contribute to the CTR above.
            </p>
          </>
        ) : (
          <>
            <div className="filter-row">
              <input
                aria-label="Search DM activity"
                placeholder="Search a person or message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="DM status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DmStatus | "all")}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter DMs by post"
                value={postFilter}
                onChange={(e) => setPostFilter(e.target.value)}
              >
                <option value="all">All posts</option>
                {posts.map((p) => (
                  <option key={p.post.id} value={p.post.id}>
                    {p.post.caption}
                  </option>
                ))}
              </select>
              <span className="muted small">
                {rows.length} of {data.attempts.length} loaded attempts
              </span>
            </div>
            {data.attempts.length === 500 && (
              <p className="notice">
                Showing the latest 500 attempts. Account tracking totals include
                all sent DMs.
              </p>
            )}
            {!active ? (
              <Empty
                title={
                  data.attempts.length
                    ? "No matching messages"
                    : "No DM activity yet"
                }
                action={
                  <div className="actions">
                    <Button primary onClick={() => setTab("automation")}>
                      Set up Auto-DM →
                    </Button>
                    <Button onClick={onPosts}>Review posts</Button>
                  </div>
                }
              >
                {data.attempts.length
                  ? "Change the status, post or search filter."
                  : "Save your product, enable a post and prepare its eligible messages in Automation."}
              </Empty>
            ) : (
              <div className="dm-layout">
                <aside className="panel dm-list" aria-label="DM attempts">
                  {rows.map((a) => (
                    <button
                      key={a.id}
                      className={active.id === a.id ? "selected" : ""}
                      onClick={() => setSelected(a.id)}
                    >
                      <div>
                        <strong>
                          {a.recipient_name ?? "Unknown recipient"}
                        </strong>
                        <span className={"dm-status status-" + a.status}>
                          {statusLabels[a.status]}
                        </span>
                      </div>
                      <p>{a.text || a.reason || "No message text"}</p>
                      <small>
                        {intentLabels[a.intent]} · {a.link_clicks} clicks
                      </small>
                    </button>
                  ))}
                </aside>
                <AttemptPanel
                  key={active.id + ":" + active.status + ":" + active.text}
                  attempt={active}
                  link={data.links.find(
                    (l) => l.message_id === active.message_id,
                  )}
                  mode={mode}
                  account={accountId}
                  busy={busy}
                  onOpen={onOpen}
                  approve={(text) =>
                    ask({
                      title: "Send this DM?",
                      body: (
                        <>
                          <p>
                            To{" "}
                            <strong>
                              {active.recipient_name ?? active.recipient_id}
                            </strong>{" "}
                            · Post {active.post_id}
                          </p>
                          <blockquote>{text}</blockquote>
                          <p>
                            This sends a real private reply on the connected
                            account.
                          </p>
                        </>
                      ),
                      label:
                        active.status === "failed"
                          ? "Retry and send"
                          : "Approve and send",
                      action: async () => {
                        await perform(async () => {
                          const a = await source.approve(active.id, text);
                          return a.status === "sent"
                            ? mode === "demo"
                              ? "Demo DM sent locally."
                              : "DM sent."
                            : "Message status: " +
                                statusLabels[a.status] +
                                ". " +
                                (a.reason ?? "");
                        });
                      },
                    })
                  }
                  reject={() =>
                    void perform(async () => {
                      await source.reject(active.id);
                      return "DM rejected. Nothing was sent.";
                    })
                  }
                  click={() =>
                    void perform(async () => {
                      simulateClick(active.id);
                      return "Demo click recorded. Tracking metrics updated.";
                    })
                  }
                />
              </div>
            )}
          </>
        )}
      </section>
      {confirmation && (
        <ConfirmAction
          value={confirmation}
          busy={busy}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            if (!busy)
              void confirmation.action().then(() => {
                if (alive.current) setConfirmation(null);
              });
          }}
        />
      )}
    </>
  );
}
function AttemptPanel({
  attempt: a,
  link,
  mode,
  account,
  busy,
  onOpen,
  approve,
  reject,
  click,
}: {
  attempt: DmAttempt;
  link: TrackedLink | undefined;
  mode: DataMode;
  account: string;
  busy: boolean;
  onOpen: (id: number) => void;
  approve: (text: string) => void;
  reject: () => void;
  click: () => void;
}) {
  const [text, setText] = useState(a.text),
    [copyStatus, setCopyStatus] = useState("");
  const actionable = canApprove(a);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        a.tracked_url ?? link?.short_url ?? "",
      );
      setCopyStatus("Link copied. Opening it can count as a click.");
    } catch {
      setCopyStatus("Copy unavailable. Select the displayed link manually.");
    }
  }
  return (
    <section className="panel dm-thread">
      <header className="section-heading">
        <div>
          <h2>{a.recipient_name ?? "Unknown recipient"}</h2>
          <span className={"dm-status status-" + a.status}>
            {statusLabels[a.status]}
          </span>
        </div>
        <Button onClick={() => onOpen(a.post_id)}>Source post ↗</Button>
      </header>
      <SourceComment
        mode={mode}
        account={account}
        postId={a.post_id}
        messageId={a.message_id}
      />
      {a.reason && (
        <p
          className={
            "notice " +
            (a.status === "failed" ? "notice--error" : "notice--demo")
          }
        >
          {a.reason}
        </p>
      )}
      {actionable ? (
        <label className="field">
          Message to send
          <textarea
            maxLength={1000}
            rows={6}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
          />
          <small>
            {text.length}/1,000 · Edited text is sent as written. Keep the
            tracked link to measure clicks.
          </small>
        </label>
      ) : (
        <div className="bubble bubble--agent">
          <small>
            {a.status === "sent" ? "Sent private reply" : "Draft / outcome"}
          </small>
          <p>{a.text || "No DM was generated."}</p>
        </div>
      )}
      <div className="attempt-meta">
        <span>{intentLabels[a.intent]}</span>
        <span>Writer: {a.writer || "—"}</span>
        <span>Created: {formatDate(a.created_at)}</span>
        <span>Sent: {formatDate(a.sent_at)}</span>
        {a.latency_seconds !== null && (
          <span>Comment → send: {Math.round(a.latency_seconds)}s</span>
        )}
      </div>
      <div className="actions">
        {actionable && (
          <Button
            primary
            disabled={busy || !text.trim() || text.length > 1000}
            onClick={() => approve(text.trim())}
          >
            {mode === "demo"
              ? "Simulate send"
              : a.status === "failed"
                ? "Retry DM"
                : "Approve & send"}
          </Button>
        )}
        {a.status === "pending_approval" && (
          <Button disabled={busy} onClick={reject}>
            Reject
          </Button>
        )}
        {a.status === "failed" && !a.retryable && (
          <p className="muted small">
            The backend marked this failure as non-retryable.
          </p>
        )}
      </div>
      {(a.tracked_url || link) && (
        <div className="dm-tracking">
          <div className="section-heading">
            <h3>Link activity</h3>
            <strong className="blue">{a.link_clicks} human clicks</strong>
          </div>
          <code>{a.tracked_url ?? link?.short_url}</code>
          {link && (
            <p className="link-destination">
              Destination: {link.destination_url}
            </p>
          )}
          <div className="actions">
            {mode === "live" ? (
              <Button onClick={() => void copy()}>Copy tracked link</Button>
            ) : (
              <Button disabled={busy || a.status !== "sent"} onClick={click}>
                Simulate a click
              </Button>
            )}
            <span className="muted small">
              {link?.bot_hits ?? 0} bot previews
            </span>
          </div>
          {copyStatus && (
            <p role="status" className="footnote">
              {copyStatus}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
function SourceComment({
  mode,
  account,
  postId,
  messageId,
}: {
  mode: DataMode;
  account: string;
  postId: number;
  messageId: number;
}) {
  const [text, setText] = useState("Loading source comment…");
  useEffect(() => {
    const c = new AbortController();
    sourceFor(mode)
      .detail(postId, c.signal)
      .then((d) => {
        if (d.post.account_id !== account) throw new Error("Account mismatch.");
        if (!c.signal.aborted)
          setText(
            d.comments.find((m) => m.id === messageId)?.text ??
              "Source comment is no longer available.",
          );
      })
      .catch(() => {
        if (!c.signal.aborted)
          setText(
            "Source comment could not be loaded. Open the source post to retry.",
          );
      });
    return () => c.abort();
  }, [mode, account, postId, messageId]);
  return (
    <div className="source-comment">
      <span className="eyebrow">SOURCE COMMENT</span>
      <p>{text}</p>
    </div>
  );
}
