import {
  defaultReplies,
  saveReplies,
  type ReplyPreferences,
} from "../../api/replies";
import { ReplyPreferenceFields } from "../community/ReplyPreferencesForm";
import { ConnectionFallback } from "../accounts/ConnectionFallback";
import { DraftCatalog } from "../products/DraftCatalog";
import { saveCatalogAcrossChannels } from "../products/api";
import {
  demoCatalogInputs,
  replaceDemoCatalog,
} from "../products/demo-catalog";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api } from "../../api/client";
import { sourceFor, type DataMode } from "../../api/source";
import type { SocialAccount } from "../../api/types";
import type { ProductInput } from "../../api/outreach-types";
import { Button } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { SOCIAL_PLATFORMS } from "../../shared/platforms";
import { readStored, saveStored, safeExternalUrl } from "../../shared/storage";
import { configureDemo, demoAccounts } from "../demo/workspace";
import { resetDemoOutreach } from "../demo/outreach";
import { emptyProfile } from "../accounts/Profile";
import { AuthForm, type Owner } from "../auth/AuthForm";
import { TOUR_KEY } from "./tour-model";
const steps = [
  "Account",
  "Products",
  "Your agent",
  "Channels",
  "Import",
  "Ready",
];
export const onboardingKey = (mode: DataMode) => "signal:onboarding:v2:" + mode;
interface Progress {
  version?: 3;
  replies?: ReplyPreferences;
  step: number;
  product: ProductInput | null;
  products?: ProductInput[];
  channels: string[];
  imported: string[];
}
const initial = (mode: DataMode): Progress => ({
  step: 0,
  version: 3,
  replies: { ...defaultReplies },
  product: null,
  products:
    mode === "demo"
      ? demoCatalogInputs.map((p) => ({ ...p, name: p.title }))
      : [],
  channels: [],
  imported: [],
});
export function restartDemoOnboarding() {
  saveStored(onboardingKey("demo"), initial("demo"));
}
export function Onboarding({
  onComplete,
  onExit,
  mode = "demo",
  signedIn = false,
  onAuthenticated,
  initialError = "",
}: {
  onComplete: () => void;
  onExit: () => void;
  mode?: DataMode;
  signedIn?: boolean;
  onAuthenticated?: (owner: Owner) => void;
  initialError?: string;
}) {
  const demo = mode === "demo";
  const [state, setState] = useState<Progress>(() => {
    const p = readStored<Progress>(onboardingKey(mode), initial(mode));
    const valid =
      p &&
      Number.isInteger(p.step) &&
      p.step >= 0 &&
      p.step < steps.length &&
      Array.isArray(p.channels) &&
      Array.isArray(p.imported);
    const s = valid
      ? { ...p, step: p.version === 3 || p.step < 2 ? p.step : p.step + 1 }
      : initial(mode);
    return {
      ...s,
      version: 3,
      replies: s.replies ?? { ...defaultReplies },
      step: !demo && !signedIn ? 0 : signedIn ? Math.max(1, s.step) : s.step,
    };
  });
  const [accounts, setAccounts] = useState<SocialAccount[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [results, setResults] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(false);
  const reduce = useReducedMotion(),
    working = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (demo || signedIn) saveStored(onboardingKey(mode), state);
  }, [mode, state, demo, signedIn]);
  useEffect(() => {
    if (demo) {
      setAccounts(
        state.channels.length
          ? demoAccounts().filter((a) => state.channels.includes(a.platform))
          : [],
      );
      return;
    }
    if (!signedIn) return;
    const c = new AbortController();
    setLoading(true);
    api
      .syncAccounts(c.signal)
      .then((a) => {
        if (!c.signal.aborted) setAccounts(a.filter((v) => !v.is_demo));
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [demo, signedIn, state.channels.join("|")]);
  function go(step: number) {
    setError("");
    setState((s) => ({ ...s, step }));
  }
  async function connect(
    platform: string,
    loginMethod?: "instagram_login" | "facebook_login",
  ) {
    if (demo) {
      const channels = [...new Set([...state.channels, platform])];
      configureDemo(channels);
      setState((s) => ({ ...s, channels, imported: [] }));
      return;
    }
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      saveStored("signal:live:onboarding-active", true);
      saveStored("signal:connection:pending", platform);
      const r = await api.connect(platform, loginMethod),
        url = safeExternalUrl(r.auth_url);
      if (!url?.startsWith("https://"))
        throw new Error("Connection URL is unavailable. Please retry.");
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      setBusy(false);
      working.current = false;
    }
  }
  async function refreshAccounts() {
    setBusy(true);
    setError("");
    try {
      const connected = (await api.syncAccounts()).filter((a) => !a.is_demo);
      setAccounts(connected);
      const pending = readStored<string>("signal:connection:pending", "");
      if (
        !connected.length ||
        (pending && !connected.some((a) => a.platform === pending))
      ) {
        setError(
          "No new authorized account found in Zernio. Finish the authorization, try Facebook below, or connect in Zernio and check again.",
        );
      } else saveStored("signal:connection:pending", "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh accounts.");
    } finally {
      setBusy(false);
    }
  }
  async function persistReplies() {
    const results = await Promise.allSettled(
      accounts.map((a) =>
        saveReplies(mode, a.id, state.replies ?? defaultReplies),
      ),
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures)
      throw new Error(
        `Agent settings could not be saved on ${failures} channels. Please retry.`,
      );
  }
  async function continueWithReplies(step: number) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await persistReplies();
      go(step);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save agent settings.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function importContent() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await persistReplies();
      const products = state.products ?? (state.product ? [state.product] : []);
      const inputs = products.map((p) => ({
        business_type: p.business_type,
        title: p.name,
        landing_url: p.landing_url,
        description: p.description,
        is_active: true,
      }));
      if (demo) {
        for (const a of accounts) replaceDemoCatalog(a.id, inputs);
        resetDemoOutreach();
      } else {
        for (const input of inputs)
          await saveCatalogAcrossChannels(
            mode,
            accounts.map((a) => a.id),
            input,
          );
      }
      let failed = false;
      for (const a of accounts) {
        if (state.imported.includes(a.id)) continue;
        setResults((r) => ({ ...r, [a.id]: "Importing…" }));
        try {
          if (demo) {
            await sourceFor("demo").posts(a.id, new AbortController().signal);
          } else {
            const r = await api.importAccount(a.id);
            if (r.errors.length) throw new Error(r.errors.join(" · "));
            const classified = await api.runClassification(a.id);
            if (classified.failed)
              throw new Error(
                `${classified.failed} messages could not be analyzed. Retry to finish.`,
              );
          }
          setResults((r) => ({ ...r, [a.id]: "Ready" }));
          setState((s) => ({
            ...s,
            imported: [...new Set([...s.imported, a.id])],
          }));
        } catch (e) {
          failed = true;
          setResults((r) => ({
            ...r,
            [a.id]: e instanceof Error ? e.message : "Import failed",
          }));
        }
      }
      if (failed)
        setError(
          "Some channels could not finish. Retry to complete the import.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save your offer.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function complete() {
    if (state.product) {
      const p = {
        ...emptyProfile,
        name: state.product.name,
        website: state.product.landing_url,
        offer: state.product.description,
      };
      saveStored("signal:profile:" + mode + ":brand", p);
      saveStored("signal:profile:" + mode + ":workspace", p);
    }
    saveStored("signal:" + mode + ":ready", true);
    saveStored("signal:live:onboarding-active", false);
    if (demo) saveStored(TOUR_KEY, 0);
    onComplete();
  }
  const ready =
    accounts.length > 0 && accounts.every((a) => state.imported.includes(a.id));
  return (
    <div className="demo-onboarding">
      <header className="demo-onboarding-header">
        <button className="wordmark" onClick={onExit}>
          signal
        </button>
        {demo && <span className="pill">Demo</span>}
        <Button disabled={busy} onClick={onExit}>
          Back to home
        </Button>
      </header>
      <div className="demo-onboarding-layout">
        <aside className="onboarding-steps">
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>
            Understand your audience.
            <br />
            Grow your brand.
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
                  disabled={busy || i > state.step || i === 0}
                  onClick={() => go(i)}
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
        </aside>
        <main className="demo-step-main">
          <div
            className="step-progress"
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={state.step + 1}
          >
            <motion.div
              animate={{ width: ((state.step + 1) / steps.length) * 100 + "%" }}
              transition={{ duration: reduce ? 0 : 0.3 }}
            />
          </div>
          <div className="step-counter">
            STEP {state.step + 1} OF {steps.length}{" "}
            <span>{steps[state.step]}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.section
              className="demo-step"
              key={state.step}
              initial={{ opacity: 0, x: reduce ? 0 : 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : -12 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              onAnimationComplete={() =>
                heading.current?.focus({ preventScroll: true })
              }
            >
              {state.step === 0 ? (
                <AuthForm
                  demo={demo}
                  onSuccess={(owner) => {
                    onAuthenticated?.(owner);
                    go(
                      demo
                        ? 1
                        : Math.max(
                            1,
                            readStored<Progress>(
                              onboardingKey(mode),
                              initial(mode),
                            ).step,
                          ),
                    );
                  }}
                />
              ) : state.step === 1 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Add your products.
                  </h1>
                  <p className="step-intro">
                    Add a page and the key facts for each product. Signal uses
                    them to match requests and prepare the right reply.
                  </p>
                  <DraftCatalog
                    products={
                      state.products ?? (state.product ? [state.product] : [])
                    }
                    busy={busy}
                    onChange={(products) =>
                      setState((s) => ({
                        ...s,
                        products,
                        product: null,
                        imported: [],
                      }))
                    }
                  />
                  <div className="onboarding-step-actions">
                    <Button
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          products: [],
                          product: null,
                          step: 2,
                        }));
                      }}
                    >
                      Skip for now
                    </Button>
                    <Button primary onClick={() => go(2)}>
                      Set up my agent →
                    </Button>
                  </div>
                </>
              ) : state.step === 2 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Set up your agent.
                  </h1>
                  <p className="step-intro">
                    Choose how Signal replies, from the first DM to the rest of
                    the conversation.
                  </p>
                  <ReplyPreferenceFields
                    form={state.replies ?? defaultReplies}
                    disabled={busy}
                    onChange={(replies) => setState((s) => ({ ...s, replies }))}
                  />
                  <div className="onboarding-step-actions">
                    <Button onClick={() => go(1)}>← Back</Button>
                    <Button
                      primary
                      disabled={busy}
                      onClick={() => void continueWithReplies(3)}
                    >
                      Choose my channels →
                    </Button>
                  </div>
                </>
              ) : state.step === 3 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Connect your channels.
                  </h1>
                  <p className="step-intro">
                    Choose where your brand connects with its audience.
                  </p>
                  <div className="demo-networks">
                    {SOCIAL_PLATFORMS.map(([id, label], i) => {
                      const connected =
                        demo && accounts.some((a) => a.platform === id);
                      return (
                        <motion.button
                          key={id}
                          className={
                            "demo-network " + (connected ? "connected" : "")
                          }
                          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: reduce ? 0 : i * 0.025 }}
                          disabled={busy || (!demo && id === "bluesky")}
                          onClick={() => void connect(id)}
                          title={
                            id === "bluesky"
                              ? "Connect in Zernio, then refresh accounts"
                              : undefined
                          }
                        >
                          <PlatformBadge platform={id} />
                          <strong>{label}</strong>
                          <span>{connected ? "✓" : "+"}</span>
                          <small>
                            {connected
                              ? "Connected"
                              : id === "snapchat"
                                ? "Closed beta"
                                : id === "bluesky" && !demo
                                  ? "Connect through Zernio"
                                  : "Connect account"}
                          </small>
                        </motion.button>
                      );
                    })}
                  </div>
                  {!demo && (
                    <>
                      <div className="verified-channel-list">
                        {accounts.map((a) => (
                          <span className="pill" key={a.id}>
                            <PlatformBadge platform={a.platform} />@
                            {a.username ?? a.platform}
                          </span>
                        ))}
                      </div>
                      <ConnectionFallback
                        busy={busy || loading}
                        onInstagram={() =>
                          void connect("instagram", "facebook_login")
                        }
                        onRefresh={() => void refreshAccounts()}
                      />
                      <Button
                        disabled={busy || loading}
                        onClick={() => void refreshAccounts()}
                      >
                        Check connected accounts
                      </Button>
                    </>
                  )}
                  {loading && <p role="status">Loading your channels…</p>}
                  <div className="onboarding-step-actions">
                    <Button disabled={busy} onClick={() => go(2)}>
                      ← Back
                    </Button>
                    <span className="onboarding-connected-count" role="status">
                      {accounts.length}{" "}
                      {accounts.length === 1 ? "channel" : "channels"} connected
                    </span>
                    <Button
                      primary
                      disabled={busy || loading || !accounts.length}
                      onClick={() => go(4)}
                    >
                      Continue →
                    </Button>
                  </div>
                </>
              ) : state.step === 4 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Find your first signals.
                  </h1>
                  <p className="step-intro">
                    Bring your posts, performance and audience feedback
                    together.
                  </p>
                  <div className="import-stages">
                    {accounts.map((a) => (
                      <div
                        key={a.id}
                        className={
                          "import-account-row " +
                          (state.imported.includes(a.id)
                            ? "done"
                            : busy
                              ? "running"
                              : "")
                        }
                      >
                        <PlatformBadge platform={a.platform} />
                        <strong>{a.username ?? a.platform}</strong>
                        <span className="import-account-status" role="status">
                          {results[a.id] ??
                            (state.imported.includes(a.id)
                              ? "Ready"
                              : "Ready to import")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="onboarding-step-actions">
                    <Button disabled={busy} onClick={() => go(3)}>
                      ← Back
                    </Button>
                    <Button
                      primary
                      disabled={busy || !accounts.length}
                      onClick={() =>
                        ready
                          ? void continueWithReplies(5)
                          : void importContent()
                      }
                    >
                      {busy
                        ? "Importing…"
                        : ready
                          ? "Continue →"
                          : "Import content"}
                    </Button>
                  </div>
                  {!busy && !ready && Object.keys(results).length > 0 && (
                    <Button onClick={() => go(5)}>
                      Continue with available data
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <motion.div
                    className="ready-check"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    ✓
                  </motion.div>
                  <h1 ref={heading} tabIndex={-1}>
                    Your workspace is ready.
                  </h1>
                  <p className="step-intro">
                    Discover your strongest posts, what your audience wants, and
                    where to act next.
                  </p>
                  <Button primary className="full-width" onClick={complete}>
                    Open my workspace →
                  </Button>
                </>
              )}
              {error && (
                <p role="alert" className="notice notice--error">
                  {error}
                </p>
              )}
            </motion.section>
          </AnimatePresence>
          {state.step > 4 && (
            <Button
              className="step-back"
              disabled={busy}
              onClick={() => go(state.step - 1)}
            >
              ← Back
            </Button>
          )}
        </main>
      </div>
    </div>
  );
}
