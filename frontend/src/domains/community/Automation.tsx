import { useEffect, useState } from "react";
import type { DataMode } from "../../api/source";
import { sourceFor } from "../../api/source";
import type { PostDetail, PostIntentStats } from "../../api/types";
import type {
  AutoDmSettings,
  AutoDmInput,
  DmDraft,
  ProductInput,
  Product,
} from "../../api/outreach-types";
import { outreachFor } from "../../api/outreach";
import { saveBrandProduct } from "./brand-product";
import { ProductForm } from "./ProductForm";
import type { ActionConfirmation } from "./ConfirmAction";
import { Button } from "../../shared/ui";
import { safeExternalUrl } from "../../shared/storage";
import { intentLabels } from "../analytics/model";
export function Automation({
  mode,
  account,
  accounts,
  mismatch,
  posts,
  product,
  busy,
  perform,
  confirm,
}: {
  mode: DataMode;
  account: string;
  accounts: string[];
  mismatch: boolean;
  posts: PostIntentStats[];
  product: Product | null;
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
  function saveProduct(input: ProductInput) {
    void perform(async () => {
      const count = await saveBrandProduct(source, accounts, input);
      return "Product saved across " + count + " channels.";
    });
  }
  return (
    <div className="automation-grid">
      <section className="panel">
        <span className="eyebrow">01 · PRODUCT CONTEXT</span>
        <h2>Your product, across all channels.</h2>
        {mismatch && (
          <p className="notice">
            Product settings differ across channels. Save once to sync them.
          </p>
        )}
        <ProductForm
          key={product?.updated_at ?? "new"}
          product={product}
          busy={busy}
          onSave={saveProduct}
          demo={mode === "demo"}
        />
      </section>
      <section className="panel">
        <span className="eyebrow">02 · POST AUTOMATION</span>
        <h2>Choose how DMs are handled.</h2>
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
            product={!!product}
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
  );
}
function PostRules({
  mode,
  rule,
  detail,
  product,
  busy,
  perform,
  confirm,
  refresh,
}: {
  mode: DataMode;
  rule: AutoDmSettings;
  detail: PostDetail;
  product: boolean;
  busy: boolean;
  perform: (a: () => Promise<string>) => Promise<void>;
  confirm: (a: ActionConfirmation) => void;
  refresh: () => void;
}) {
  const source = outreachFor(mode),
    [form, setForm] = useState<AutoDmInput>({
      enabled: rule.enabled,
      landing_url: rule.landing_url,
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
    form.landing_url !== rule.landing_url ||
    form.require_approval !== rule.require_approval;
  function save() {
    if (form.landing_url && !safeExternalUrl(form.landing_url)) {
      setError("Use a complete http:// or https:// URL.");
      return;
    }
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
          disabled={busy || !product}
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
        Link override · optional
        <input
          type="url"
          disabled={busy}
          value={form.landing_url ?? ""}
          onChange={(e) =>
            setForm({ ...form, landing_url: e.target.value || null })
          }
          placeholder="Uses your product page by default"
        />
      </label>
      {!product && (
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
          disabled={busy || !rule.enabled || dirty || !product}
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
        disabled={busy || !product || !messageId}
        onClick={() =>
          void perform(async () => {
            const d = await source.preview(messageId);
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
