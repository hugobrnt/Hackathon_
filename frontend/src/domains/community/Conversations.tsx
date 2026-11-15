import { useState } from "react";
import type { DataMode } from "../../api/source";
import { demoDetails } from "../demo/data";
import { readStored, saveStored } from "../../shared/storage";
import { Button, Empty, Heading, Metric } from "../../shared/ui";
export function Conversations({
  mode,
  onPosts,
}: {
  mode: DataMode;
  onPosts: () => void;
}) {
  const candidates = demoDetails[0].key_comments.slice(0, 3),
    [selected, setSelected] = useState(candidates[0].id),
    [sent, setSent] = useState<Record<string, string>>(() =>
      readStored("signal:demo:replies", {}),
    ),
    [draft, setDraft] = useState(
      "Hi! Lingo helps you practice spoken English for interviews. What kind of role are you preparing for?",
    ),
    [saved, setSaved] = useState("");
  const person = candidates.find((m) => m.id === selected)!;
  if (mode === "live")
    return (
      <>
        <Heading
          title="Conversations"
          subtitle="Agent activity and human handoff"
        />
        <Empty
          title="Automatic DMs are not connected yet"
          action={
            <Button primary onClick={onPosts}>
              Review purchase-intent comments →
            </Button>
          }
        >
          This backend currently exposes F1–F6. Sending DMs, tracking links and
          managing conversations need the F7–F8 endpoints. No messages will be
          sent from this screen.
        </Empty>
      </>
    );
  return (
    <>
      <Heading
        title="Conversations"
        subtitle="A local simulation of the future agent inbox. No real messages are sent."
      />
      <div className="notice notice--demo">
        <strong>Demo simulation</strong> Draft and simulate a reply to try the
        workflow. Activity stays in this browser.
      </div>
      <div className="metrics-grid metrics-grid--three">
        <Metric label="Example conversations" value={candidates.length} />
        <Metric label="Simulated replies" value={Object.keys(sent).length} />
        <Metric
          label="Real DMs sent"
          value="0"
          hint="No messaging endpoint is called"
        />
      </div>
      <div className="conversation-layout">
        <aside className="panel conversation-list">
          {candidates.map((m) => (
            <button
              key={m.id}
              className={selected === m.id ? "selected" : ""}
              onClick={() => {
                setSelected(m.id);
                setSaved("");
              }}
            >
              <strong>{m.author_name}</strong>
              <p>{m.text}</p>
              <small>
                {sent[m.id] ? "Reply simulated" : "Ready to review"}
              </small>
            </button>
          ))}
        </aside>
        <section className="panel conversation-thread">
          <div className="section-heading">
            <h2>{person.author_name}</h2>
            <span className="pill">Instagram · Demo</span>
          </div>
          <div className="bubble">
            <small>Source comment</small>
            <p>{person.text}</p>
          </div>
          {sent[selected] && (
            <div className="bubble bubble--agent">
              <small>Simulated agent reply</small>
              <p>{sent[selected]}</p>
              <span className="pill">Not sent externally</span>
            </div>
          )}
          <label className="field">
            Reply draft
            <textarea
              value={draft}
              rows={5}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <Button
            primary
            disabled={!draft.trim()}
            onClick={() => {
              const next = { ...sent, [selected]: draft.trim() };
              setSent(next);
              setSaved(
                saveStored("signal:demo:replies", next)
                  ? "Reply simulated and saved locally."
                  : "Reply simulated for this session; browser storage is unavailable.",
              );
            }}
          >
            Simulate reply
          </Button>
          {saved && (
            <p role="status" className="success">
              {saved}
            </p>
          )}
        </section>
        <aside className="panel subtle">
          <h3>Why this conversation?</h3>
          <p>An explicit product request was found in a post comment.</p>
          <h4>Live implementation</h4>
          <p className="muted">
            Account eligibility, messaging windows, idempotency and approved
            product facts must be checked by the backend before sending.
          </p>
        </aside>
      </div>
    </>
  );
}
