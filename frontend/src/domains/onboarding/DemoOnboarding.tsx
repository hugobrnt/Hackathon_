import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, Icon } from "../../shared/ui";
import { readStored, saveStored, safeExternalUrl } from "../../shared/storage";
import {
  demoChannels,
  configureDemo,
  demoAccounts,
  demoPosts,
} from "../demo/workspace";
import { demoOutreach, resetDemoOutreach } from "../demo/outreach";
import { ProductForm, defaultProduct } from "../community/ProductForm";
import type { ProductInput } from "../../api/outreach-types";
import { lingoProfile, type BrandProfile } from "../accounts/Profile";
const KEY = "signal:demo:onboarding";
const steps = [
  "Sign in",
  "Your brand",
  "Channels",
  "Import",
  "Your agent",
  "Ready",
];
interface Progress {
  version: 1;
  step: number;
  brand: BrandProfile;
  channels: string[];
  imported: boolean;
  product: ProductInput;
}
const initial = (): Progress => ({
  version: 1,
  step: 0,
  brand: { ...lingoProfile },
  channels: [],
  imported: false,
  product: { ...defaultProduct },
});
export function restartDemoOnboarding() {
  saveStored(KEY, initial());
}
function readProgress() {
  const p = readStored<Progress | null>(KEY, null);
  return p?.version === 1 &&
    Number.isInteger(p.step) &&
    p.step >= 0 &&
    p.step < 6 &&
    Array.isArray(p.channels) &&
    p.brand &&
    typeof p.brand.name === "string" &&
    p.product
    ? p
    : initial();
}
export function DemoOnboarding({
  onComplete,
  onExit,
}: {
  onComplete: () => void;
  onExit: () => void;
}) {
  const [state, setState] = useState(readProgress),
    [oauth, setOauth] = useState<string | null>(null),
    [google, setGoogle] = useState(false),
    [progress, setProgress] = useState(state.imported ? 3 : 0),
    [syncing, setSyncing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reduce = useReducedMotion(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    saveStored(KEY, state);
  }, [state]);
  useEffect(() => {
    if (state.step !== 3 || !syncing) return;
    if (progress >= 3) {
      setSyncing(false);
      setState((s) => ({ ...s, imported: true }));
      return;
    }
    const timer = setTimeout(
      () => setProgress((n) => n + 1),
      reduce ? 80 : 650,
    );
    return () => clearTimeout(timer);
  }, [progress, syncing, state.step, reduce]);
  function go(step: number) {
    setError("");
    setState((s) => ({ ...s, step }));
  }
  function connect(channel: string) {
    setState((s) => ({
      ...s,
      channels: [...new Set([...s.channels, channel])],
      imported: false,
    }));
    setProgress(0);
    setOauth(null);
  }
  function startImport() {
    configureDemo(state.channels);
    resetDemoOutreach();
    setProgress(0);
    setSyncing(true);
  }
  async function saveProduct(product: ProductInput) {
    setBusy(true);
    setError("");
    try {
      await Promise.all(
        demoAccounts().map((a) => demoOutreach.saveProduct(a.id, product)),
      );
      setState((s) => ({ ...s, product, step: 5 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare demo.");
    } finally {
      setBusy(false);
    }
  }
  function complete() {
    saveStored("signal:profile:demo:brand", state.brand);
    saveStored("signal:profile:demo:workspace", state.brand);
    for (const a of demoAccounts())
      saveStored("signal:profile:demo:" + a.id, state.brand);
    saveStored("signal:demo:tour", 0);
    saveStored("signal:demo:ready", true);
    onComplete();
  }
  const connected = state.channels
    .map((id) => demoChannels.find(([p]) => p === id)?.[1])
    .filter(Boolean);
  return (
    <div className="demo-onboarding">
      <header className="demo-onboarding-header">
        <button className="wordmark" onClick={onExit}>
          signal
        </button>
        <span className="pill pill--demo">Offline demo · Nothing is sent</span>
        <Button onClick={onExit}>Exit demo</Button>
      </header>
      <div className="demo-onboarding-layout">
        <aside className="onboarding-steps">
          <span className="eyebrow">YOUR WORKSPACE, STEP BY STEP</span>
          <h2>
            Turn comments
            <br />
            into conversations.
          </h2>
          <ol>
            {steps.map((label, i) => (
              <li
                key={label}
                className={
                  i === state.step
                    ? "current"
                    : i < state.step
                      ? "complete"
                      : ""
                }
              >
                <button
                  onClick={() => go(i)}
                  disabled={i > state.step || syncing || busy}
                  aria-current={i === state.step ? "step" : undefined}
                >
                  <span>
                    {i < state.step ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <p>
            A guided sample workspace. No Google login, social account or API
            key required.
          </p>
        </aside>
        <main className="demo-step-main">
          <div
            className="step-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={6}
            aria-valuenow={state.step + 1}
            aria-label="Onboarding progress"
          >
            <motion.div
              animate={{ width: ((state.step + 1) / 6) * 100 + "%" }}
              transition={{ duration: reduce ? 0 : 0.35 }}
            />
          </div>
          <div className="step-counter">
            STEP {state.step + 1} OF 6 <span>{steps[state.step]}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.section
              className="demo-step"
              key={state.step}
              initial={{ opacity: 0, x: reduce ? 0 : 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : -12 }}
              transition={{ duration: reduce ? 0.1 : 0.24 }}
              onAnimationComplete={() =>
                heading.current?.focus({ preventScroll: true })
              }
            >
              {state.step === 0 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Your signal starts here.
                  </h1>
                  <p className="step-intro">
                    Try the sign-in experience with a sample account.
                  </p>
                  {!google ? (
                    <>
                      <Button
                        primary
                        className="google-demo"
                        onClick={() => setGoogle(true)}
                      >
                        <span className="google-mark">G</span>Continue with
                        Google · Demo
                      </Button>
                      <div className="or-separator">
                        <span>or use the demo email</span>
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          go(1);
                        }}
                      >
                        <label className="field">
                          Demo email
                          <input
                            type="email"
                            value="alex@lingo.example"
                            readOnly
                          />
                        </label>
                        <Button type="submit" className="full-width">
                          Continue with demo email →
                        </Button>
                      </form>
                    </>
                  ) : (
                    <div className="demo-account-picker">
                      <span className="eyebrow">SIMULATED GOOGLE SIGN-IN</span>
                      <h3>Choose your demo account</h3>
                      <button className="picker-account" onClick={() => go(1)}>
                        <span className="avatar">A</span>
                        <span>
                          <strong>Alex · Lingo</strong>
                          <small>alex@lingo.example</small>
                        </span>
                        <span>→</span>
                      </button>
                      <Button onClick={() => setGoogle(false)}>
                        Back to sign in
                      </Button>
                    </div>
                  )}
                  <p className="footnote">
                    This is a local sign-in simulation. No credentials are
                    collected.
                  </p>
                </>
              ) : state.step === 1 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    A little context goes a long way.
                  </h1>
                  <p className="step-intro">
                    Use Lingo, our sample brand, or add your own name. This step
                    is optional.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        state.brand.website &&
                        !safeExternalUrl(state.brand.website)
                      ) {
                        setError("Use a complete website URL.");
                        return;
                      }
                      go(2);
                    }}
                  >
                    <label className="field">
                      Brand name
                      <input
                        maxLength={80}
                        value={state.brand.name}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            brand: { ...s.brand, name: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Website
                      <input
                        type="url"
                        value={state.brand.website}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            brand: { ...s.brand, website: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      What do you help people do?
                      <textarea
                        rows={3}
                        maxLength={2000}
                        value={state.brand.offer}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            brand: { ...s.brand, offer: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <div className="actions">
                      <Button primary type="submit">
                        Choose my channels →
                      </Button>
                      <Button onClick={() => go(2)}>Skip for now</Button>
                    </div>
                  </form>
                </>
              ) : state.step === 2 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Where does your brand live?
                  </h1>
                  <p className="step-intro">
                    Connect at least one sample channel. Each authorization is
                    simulated.
                  </p>
                  <div className="demo-networks">
                    {demoChannels.map(([id, label], i) => (
                      <motion.button
                        key={id}
                        className={
                          "demo-network " +
                          (state.channels.includes(id) ? "connected" : "")
                        }
                        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduce ? 0 : i * 0.05 }}
                        whileHover={reduce ? {} : { y: -2 }}
                        onClick={() => setOauth(id)}
                      >
                        {["instagram", "linkedin"].includes(id) ? (
                          <Icon name={id} />
                        ) : (
                          <span className="network-letter">{label[0]}</span>
                        )}
                        <strong>{label}</strong>
                        <span>{state.channels.includes(id) ? "✓" : "+"}</span>
                        <small>
                          {state.channels.includes(id)
                            ? "Demo account connected"
                            : "Connect sample account"}
                        </small>
                      </motion.button>
                    ))}
                  </div>
                  <Button
                    primary
                    disabled={!state.channels.length}
                    onClick={() => {
                      configureDemo(state.channels);
                      go(3);
                    }}
                  >
                    Continue with {state.channels.length || "your"}{" "}
                    {state.channels.length === 1 ? "channel" : "channels"} →
                  </Button>
                </>
              ) : state.step === 3 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Let’s find your first signals.
                  </h1>
                  <p className="step-intro">
                    Prepare sample content from {connected.join(", ")}.
                  </p>
                  <div className="import-animation">
                    <motion.div
                      className="import-orbit"
                      animate={
                        syncing && !reduce ? { rotate: 360 } : { rotate: 0 }
                      }
                      transition={{
                        duration: 3,
                        repeat: syncing && !reduce ? Infinity : 0,
                        ease: "linear",
                      }}
                      aria-hidden="true"
                    >
                      ◎
                    </motion.div>
                    <div className="import-stages">
                      {[
                        "Import sample posts and metrics",
                        "Classify comments and surface insights",
                        "Prepare DM activity and tracking",
                      ].map((label, i) => (
                        <div
                          key={label}
                          className={
                            progress > i
                              ? "done"
                              : progress === i && syncing
                                ? "running"
                                : ""
                          }
                        >
                          <span>
                            {progress > i
                              ? "✓"
                              : progress === i && syncing
                                ? "…"
                                : String(i + 1).padStart(2, "0")}
                          </span>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p role="status" className="import-status">
                    {state.imported
                      ? state.channels.length * 8 +
                        " sample posts and " +
                        state.channels.length * 368 +
                        " audience comments ready."
                      : syncing
                        ? "Preparing your local demo…"
                        : "No platform API will be called."}
                  </p>
                  <Button
                    primary
                    disabled={syncing}
                    onClick={() => (state.imported ? go(4) : startImport())}
                  >
                    {state.imported
                      ? "Set up my agent →"
                      : syncing
                        ? "Preparing…"
                        : "Import sample content"}
                  </Button>
                </>
              ) : state.step === 4 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Give your agent something useful to say.
                  </h1>
                  <p className="step-intro">
                    These product facts will appear in your simulated DMs. You
                    can edit them later in Conversations.
                  </p>
                  <ProductForm
                    product={state.product}
                    busy={busy}
                    demo
                    onSave={(p) => void saveProduct(p)}
                  />
                </>
              ) : (
                <>
                  <motion.div
                    className="ready-check"
                    initial={{ scale: reduce ? 1 : 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 20 }}
                    aria-hidden="true"
                  >
                    ✓
                  </motion.div>
                  <h1 ref={heading} tabIndex={-1}>
                    Your workspace is ready.
                  </h1>
                  <p className="step-intro">
                    Follow the evidence from a post to a DM, then see the click
                    appear in tracking.
                  </p>
                  <div className="ready-summary">
                    {[
                      [
                        String(demoAccounts().length),
                        "connected sample channels",
                      ],
                      [
                        String(
                          demoAccounts().reduce(
                            (n, a) => n + demoPosts(a.id).length,
                            0,
                          ),
                        ),
                        "posts analyzed",
                      ],
                      ["4 steps", "to explore your workspace"],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <strong>{value}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <Button primary className="full-width" onClick={complete}>
                    Open my guided workspace →
                  </Button>
                  <p className="footnote">
                    Review a pending DM, simulate a send, then simulate a click.
                    Your results persist in this browser.
                  </p>
                </>
              )}
              {error && (
                <div role="alert" className="notice notice--error">
                  {error}
                </div>
              )}
            </motion.section>
          </AnimatePresence>
          {state.step > 0 && (
            <Button
              className="step-back"
              disabled={syncing || busy}
              onClick={() => go(state.step - 1)}
            >
              ← Back
            </Button>
          )}
        </main>
      </div>
      {oauth && (
        <DemoAuthorization
          platform={oauth}
          connected={state.channels.includes(oauth)}
          onClose={() => setOauth(null)}
          onAllow={() => connect(oauth)}
        />
      )}
    </div>
  );
}
function DemoAuthorization({
  platform,
  connected,
  onClose,
  onAllow,
}: {
  platform: string;
  connected: boolean;
  onClose: () => void;
  onAllow: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="boost-dialog demo-authorization"
      aria-labelledby="demo-auth-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <span className="pill pill--demo">Simulated authorization</span>
      <h2 id="demo-auth-title">
        Connect {demoChannels.find(([id]) => id === platform)?.[1]}
      </h2>
      <div className="picker-account">
        <span className="avatar">L</span>
        <span>
          <strong>Lingo</strong>
          <small>@lingo.{platform === "instagram" ? "app" : platform}</small>
        </span>
        <span>✓</span>
      </div>
      <p>
        Allow Signal’s demo to display sample posts, comments and DM activity.
      </p>
      <p className="footnote">No real account permissions are requested.</p>
      <div className="actions">
        <Button primary onClick={onAllow}>
          {connected ? "Keep this demo account" : "Authorize demo connection"}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </dialog>
  );
}
