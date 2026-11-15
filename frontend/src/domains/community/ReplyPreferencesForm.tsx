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
    <section className="panel agent-behavior">
      <header className="settings-section-heading">
        <div>
          <span className="eyebrow">ALL CHANNELS · FIRST DM & FOLLOW-UPS</span>
          <h2>Agent behavior</h2>
          <p>Set the voice, next step and handoff rules for your agent.</p>
        </div>
      </header>
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
          <ReplyPreferenceFields
            form={form}
            onChange={setForm}
            disabled={busy || loading}
          />
          <Button primary type="submit" disabled={busy || loading}>
            {loading ? "Loading…" : "Save agent behavior"}
          </Button>
        </form>
      )}
    </section>
  );
}

export function ReplyPreferenceFields({
  form,
  onChange,
  disabled = false,
}: {
  form: ReplyPreferences;
  onChange: (value: ReplyPreferences) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="form-columns">
        <label className="field">
          Reply tone
          <select
            disabled={disabled}
            value={form.tone}
            onChange={(e) =>
              onChange({
                ...form,
                tone: e.target.value as ReplyPreferences["tone"],
              })
            }
          >
            <option value="friendly">Friendly</option>
            <option value="professional">Warm & professional</option>
            <option value="concise">Concise</option>
          </select>
        </label>
        <label className="field">
          Suggested next step
          <select
            disabled={disabled}
            value={form.goal}
            onChange={(e) =>
              onChange({
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
        Topics I handle personally
        <input
          maxLength={1000}
          disabled={disabled}
          placeholder="refund, cancellation, privacy"
          value={form.escalation_topics}
          onChange={(e) =>
            onChange({ ...form, escalation_topics: e.target.value })
          }
        />
        <small>
          Separate keywords with commas. The agent hands matching messages to
          you.
        </small>
      </label>
    </>
  );
}
