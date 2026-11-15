import { useEffect, useState } from "react";
import type { DataMode } from "../../api/source";
import {
  defaultReplies,
  loadReplies,
  saveReplies,
  type ReplyPreferences,
} from "../../api/replies";
import { Button } from "../../shared/ui";
export function ReplyPreferencesForm({
  mode,
  account,
  accounts,
  busy,
  perform,
}: {
  mode: DataMode;
  account: string;
  accounts: string[];
  busy: boolean;
  perform: (a: () => Promise<string>) => Promise<void>;
}) {
  const [form, setForm] = useState<ReplyPreferences>({ ...defaultReplies }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    loadReplies(mode, account, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setForm(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [mode, account, revision]);
  return (
    <section className="panel">
      <h2>Reply settings</h2>
      {error ? (
        <p role="alert">
          {error}{" "}
          <Button onClick={() => setRevision((r) => r + 1)}>Retry</Button>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              const r = await Promise.allSettled(
                accounts.map((a) => saveReplies(mode, a, form)),
              );
              const failed = r.filter((v) => v.status === "rejected").length;
              if (failed)
                throw new Error(
                  `Settings could not be saved to ${failed} channels. Retry to finish.`,
                );
              return "Reply settings saved across your channels.";
            });
          }}
        >
          <div className="form-columns">
            <label className="field">
              Tone
              <select
                disabled={busy || loading}
                value={form.tone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tone: e.target.value as ReplyPreferences["tone"],
                  })
                }
              >
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="concise">Concise</option>
              </select>
            </label>
            <label className="field">
              Goal
              <select
                disabled={busy || loading}
                value={form.goal}
                onChange={(e) =>
                  setForm({
                    ...form,
                    goal: e.target.value as ReplyPreferences["goal"],
                  })
                }
              >
                <option value="product_visit">Visit the product page</option>
                <option value="trial">Explore a trial</option>
                <option value="demo">Explore a demo</option>
              </select>
            </label>
          </div>
          <label className="field">
            Topics to send to me
            <input
              maxLength={1000}
              disabled={busy || loading}
              placeholder="refund, cancellation, privacy"
              value={form.escalation_topics}
              onChange={(e) =>
                setForm({ ...form, escalation_topics: e.target.value })
              }
            />
            <small>
              Separate keywords with commas. Matching comments always require
              your approval.
            </small>
          </label>
          <Button primary type="submit" disabled={busy || loading}>
            {loading ? "Loading…" : "Save reply settings"}
          </Button>
        </form>
      )}
    </section>
  );
}
