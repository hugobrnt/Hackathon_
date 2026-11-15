import type { CatalogProduct } from "../products/types";
import { useEffect, useState } from "react";
import type { DataMode } from "../../api/source";
import { sourceFor } from "../../api/source";
import type { PostDetail, PostIntentStats } from "../../api/types";
import type {
  AutoDmSettings,
  AutoDmInput,
  DmDraft,
} from "../../api/outreach-types";
import { outreachFor } from "../../api/outreach";
import { ReplyPreferencesForm } from "./ReplyPreferencesForm";
import type { ActionConfirmation } from "./ConfirmAction";
import { Button } from "../../shared/ui";
import { intentLabels } from "../analytics/model";
export function Automation({
  mode,
  account,
  accounts,
  posts,
  products,
  busy,
  perform,
  confirm,
  onProducts,
}: {
  mode: DataMode;
  account: string;
  accounts: string[];
  posts: PostIntentStats[];
  products: CatalogProduct[];
  onProducts: () => void;
  busy: boolean;
  perform: (action: () => Promise<string>) => Promise<void>;
  confirm: (a: ActionConfirmation) => void;
}) {
  const source = outreachFor(mode),
    [postId, setPostId] = useState(posts[0]?.post.id ?? 0),
    [rule, setRule] = useState<AutoDmSettings | null>(null),
    [detail, setDetail] = useState<PostDetail | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!postId) return;
    const c = new AbortController();
    setRule(null);
    setDetail(null);
    setError("");
    Promise.all([
      source.settings(postId, c.signal),
      sourceFor(mode).detail(postId, c.signal),
    ])
      .then(([r, d]) => {
        if (d.post.account_id !== account) throw new Error("Account mismatch.");
        if (!c.signal.aborted) {
          setRule(r);
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [postId, source, mode, account, refresh]);
  return (
    <>
      <ReplyPreferencesForm
        mode={mode}
        account={account}
        accounts={accounts}
        busy={busy}
        perform={perform}
      />
      <div className="automation-grid">
        <section className="panel">
          <h2>Product routing</h2>
          <p className="muted">
            Each comment is matched to an active product. Uncertain matches wait
            for your review.
          </p>
          <p>
            {products.filter((p) => p.is_active).length} active products on this
            channel
          </p>
          <Button onClick={onProducts}>Manage products →</Button>
        </section>
        <section className="panel">
          <h2>Drafts or automatic replies</h2>
          <label className="field">
            Post
            <select
              value={postId}
              disabled={!posts.length || busy}
              onChange={(e) => setPostId(Number(e.target.value))}
            >
              {!posts.length && <option value={0}>Import a post first</option>}
              {posts.map((p) => (
                <option value={p.post.id} key={p.post.id}>
                  {p.post.caption || "Untitled post"}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <div className="notice notice--error" role="alert">
              {error}
              <Button onClick={() => setRefresh((n) => n + 1)}>Retry</Button>
            </div>
          ) : !rule && postId ? (
            <p role="status">Loading rules…</p>
          ) : rule && detail ? (
            <PostRules
              key={postId + ":" + rule.updated_at}
              mode={mode}
              rule={rule}
              detail={detail}
              products={products.filter((p) => p.is_active)}
              busy={busy}
              perform={perform}
              confirm={confirm}
              refresh={() => setRefresh((n) => n + 1)}
            />
          ) : (
            <p className="muted">Import content to configure Auto-DM.</p>
          )}
        </section>
      </div>
    </>
  );
}
function PostRules({
  mode,
  rule,
  detail,
  products,
  busy,
  perform,
  confirm,
  refresh,
}: {
  mode: DataMode;
  rule: AutoDmSettings;
  detail: PostDetail;
  products: CatalogProduct[];
  busy: boolean;
  perform: (a: () => Promise<string>) => Promise<void>;
  confirm: (a: ActionConfirmation) => void;
  refresh: () => void;
}) {
  const source = outreachFor(mode),
    [form, setForm] = useState<AutoDmInput>({
      enabled: rule.enabled,
      product_id: rule.product_id ?? null,
      public_reply: rule.public_reply ?? false,
      require_approval: rule.enabled ? rule.require_approval : true,
    }),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<DmDraft | null>(null);
  const candidates = detail.comments.filter(
    (m) =>
      !m.author_is_owner &&
      m.direction === "incoming" &&
      m.classification &&
      ["purchase_intent", "pre_purchase_question", "objection"].includes(
        m.classification.intent,
      ),
  );
  const [messageId, setMessageId] = useState(candidates[0]?.id ?? 0);
  const dirty =
    form.enabled !== rule.enabled ||
    form.product_id !== (rule.product_id ?? null) ||
    form.public_reply !== (rule.public_reply ?? false) ||
    form.require_approval !== rule.require_approval;
  function save() {
    setError("");
    const action = async () => {
      await perform(async () => {
        await source.saveSettings(rule.post_id, form);
        refresh();
        return "Auto-DM rules saved.";
      });
    };
    if (mode === "live" && form.enabled)
      confirm({
        title: "Enable these DM rules?",
        body: (
          <>
            <p>{detail.post.caption}</p>
            <p>
              {form.require_approval
                ? "New eligible comments will create drafts awaiting approval."
                : "New eligible comments may receive a real DM automatically. Negative or uncertain comments still need approval."}
            </p>
          </>
        ),
        label: "Save and enable",
        action,
      });
    else void action();
  }
  function run() {
    const action = async () => {
      await perform(async () => {
        const r = await source.run(rule.post_id);
        return (
          r.processed +
          " processed · " +
          r.sent +
          " sent · " +
          r.pending_approval +
          " awaiting approval · " +
          r.skipped +
          " skipped · " +
          r.failed +
          " failed."
        );
      });
    };
    if (mode === "live")
      confirm({
        title: "Process this post’s comments?",
        body: (
          <>
            <p>{detail.post.caption}</p>
            <p>
              {rule.require_approval
                ? "Eligible comments will be queued for approval under the saved rules."
                : "This action can send real DMs immediately under the saved rules."}
            </p>
          </>
        ),
        label: rule.require_approval ? "Prepare DMs" : "Process and send",
        action,
      });
    else void action();
  }
  return (
    <>
      <label className="toggle-row">
        <span>
          <strong>Auto-DM</strong>
          <small>For new eligible comments on this post</small>
        </span>
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={busy || !products.length}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>Require my approval</strong>
          <small>Review every message before it is sent</small>
        </span>
        <input
          type="checkbox"
          checked={form.require_approval}
          disabled={busy}
          onChange={(e) =>
            setForm({ ...form, require_approval: e.target.checked })
          }
        />
      </label>
      <label className="field">
        Product selection
        <select
          disabled={busy}
          value={form.product_id ?? "auto"}
          onChange={(e) =>
            setForm({
              ...form,
              product_id:
                e.target.value === "auto" ? null : Number(e.target.value),
            })
          }
        >
          <option value="auto">Automatic · match each comment</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="toggle-row">
        <span>
          <strong>Reply under the comment</strong>
          <small>Post a public reply after the DM is sent</small>
        </span>
        <input
          type="checkbox"
          checked={form.public_reply ?? false}
          disabled={busy}
          onChange={(e) => setForm({ ...form, public_reply: e.target.checked })}
        />
      </label>
      {!products.length && (
        <p className="notice">Save the product before enabling Auto-DM.</p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="actions">
        <Button primary disabled={busy || !dirty} onClick={save}>
          Save rules
        </Button>
        <Button
          disabled={busy || !rule.enabled || dirty || !products.length}
          onClick={run}
        >
          {mode === "demo"
            ? "Simulate processing"
            : rule.require_approval
              ? "Prepare pending DMs"
              : "Process eligible comments"}
        </Button>
      </div>
      <p className="footnote">
        {dirty
          ? "Save your changes before processing comments."
          : "Rules saved for this post."}
      </p>
      <hr />
      <h3>Preview before processing</h3>
      <label className="field">
        Source comment
        <select
          value={messageId}
          disabled={busy || !candidates.length}
          onChange={(e) => {
            setMessageId(Number(e.target.value));
            setPreview(null);
          }}
        >
          {!candidates.length && (
            <option value={0}>No eligible intent found</option>
          )}
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.author_name} · {intentLabels[m.classification!.intent]} ·{" "}
              {m.text.slice(0, 70)}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={busy || !products.length || !messageId}
        onClick={() =>
          void perform(async () => {
            const d = await source.preview(
              messageId,
              form.product_id ?? undefined,
            );
            setPreview(d);
            return "Preview generated. No message sent.";
          })
        }
      >
        Generate DM preview
      </Button>
      {preview && (
        <div className="preview-draft">
          <span className="pill">Preview only · {preview.writer}</span>
          <p>{preview.text}</p>
          <small>
            Generating a preview creates a tracking link. It does not send a DM.
          </small>
        </div>
      )}
    </>
  );
}
