import { connectionErrorMessage } from "./domains/accounts/connection-errors";
import { canConnectPlatform } from "./shared/platforms";
import {
  Notifications,
  useNotifications,
} from "./domains/notifications/Notifications";
import { Products } from "./domains/products/Products";
import { useEffect, useState, type FormEvent } from "react";
import { api, request, ApiError } from "./api/client";
import { AuthForm, type Owner } from "./domains/auth/AuthForm";
import type { DataMode } from "./api/source";
import type { Intent } from "./api/types";
import { useWorkspace, useEvidence } from "./domains/accounts/useWorkspace";
import { Connections } from "./domains/accounts/Connections";
import {
  Profile,
  emptyProfile,
  lingoProfile,
  type BrandProfile,
} from "./domains/accounts/Profile";
import {
  Onboarding,
  restartDemoOnboarding,
} from "./domains/onboarding/Onboarding";
import { TOUR_KEY } from "./domains/onboarding/tour-model";
import { WorkspaceTour, tourSteps } from "./domains/onboarding/WorkspaceTour";
import { Landing } from "./domains/onboarding/Landing";
import { Dashboard } from "./domains/dashboard/Dashboard";
import { BrandPosts } from "./domains/posts/BrandPosts";
import { DetailDialog } from "./domains/posts/DetailDialog";
import { BrandInsights } from "./domains/insights/BrandInsights";
import { Analytics } from "./domains/analytics/Analytics";
import { Conversations } from "./domains/community/Conversations";
import { aggregate, INTENTS, PIR_DEFINITION } from "./domains/analytics/model";
import { Button, Empty, Heading, Icon, Metric } from "./shared/ui";
import { readStored, saveStored, safeExternalUrl } from "./shared/storage";
import {
  formatCount as count,
  formatPercent as percent,
} from "./shared/format";

const nav = [
  ["dashboard", "Dashboard"],
  ["posts", "Posts"],
  ["insights", "Insights"],
  ["products", "Products"],
  ["conversations", "Conversations"],
  ["analytics", "Analytics"],
] as const;
const routes = new Set([
  ...nav.map(([id]) => id),
  "landing",
  "onboarding",
  "auth",
  "demo",
  "brand",
  "connections",
  "profile",
  "data",
]);
function readRoute() {
  const [path, search = ""] = window.location.hash
    .replace(/^#\//, "")
    .split("?");
  return {
    view: routes.has(path) ? path : "landing",
    params: new URLSearchParams(search),
  };
}
function initialMode(): DataMode {
  const q = new URLSearchParams(location.search);
  if (q.has("connected") || q.has("error")) return "live";
  if (q.get("demo") === "1") return "demo";
  return readStored<string>("signal:mode", "live") === "live" ? "live" : "demo";
}
function profileFor(key: string, fallback: BrandProfile) {
  const value = readStored<BrandProfile>(key, fallback);
  return value &&
    Object.keys(fallback).every(
      (k) => typeof value[k as keyof BrandProfile] === "string",
    )
    ? value
    : fallback;
}
export default function App() {
  const [route, setRoute] = useState(readRoute),
    [mode, setMode] = useState<DataMode>(initialMode),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(""),
    [period, setPeriod] = useState("all"),
    [menuOpen, setMenuOpen] = useState(false),
    [busy, setBusy] = useState(""),
    [profileRevision, setProfileRevision] = useState(0),
    [tourStep, setTourStep] = useState<number>(() => {
      const n = readStored<unknown>(TOUR_KEY, -1);
      return typeof n === "number" && n >= 0 && n < tourSteps.length ? n : -1;
    });
  const notifications = useNotifications();
  const { notice, setNotice } = notifications;
  const [owner, setOwner] = useState<Owner | null>(null),
    [authLoading, setAuthLoading] = useState(true),
    [authError, setAuthError] = useState("");
  const needsAuth =
    mode === "live" && !["landing", "demo"].includes(route.view);
  useEffect(() => {
    if (!needsAuth || owner) return;
    const c = new AbortController();
    setAuthLoading(true);
    setAuthError("");
    request<Owner>("/auth/me", { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted) setOwner(v);
      })
      .catch((e) => {
        if (!c.signal.aborted && !(e instanceof ApiError && e.status === 401))
          setAuthError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setAuthLoading(false);
      });
    return () => c.abort();
  }, [needsAuth, owner]);
  useEffect(() => {
    const expired = () => {
      setOwner(null);
      navigate("auth", {}, false);
    };
    window.addEventListener("signal:session-expired", expired);
    return () => window.removeEventListener("signal:session-expired", expired);
  }, []);
  const workspaceEnabled =
    !["landing", "brand", "demo", "onboarding", "auth"].includes(route.view) &&
    (mode === "demo" || !!owner);
  const preferred = route.params.get("account") ?? "";
  const workspace = useWorkspace(mode, preferred, revision, workspaceEnabled);
  const account = workspace.account;
  const evidence = useEvidence(
    mode,
    workspace.posts,
    route.view === "analytics" && workspaceEnabled,
  );
  const profileKey = "signal:profile:" + mode + ":brand";
  const fallback =
    mode === "demo"
      ? lingoProfile
      : profileFor("signal:profile:live:workspace", emptyProfile);
  const profile = profileFor(profileKey, fallback);
  void profileRevision;
  function navigate(
    view: string,
    extra: Record<string, string> = {},
    keepAccount = true,
  ) {
    const params = new URLSearchParams(extra);
    if (keepAccount && !params.has("account") && account)
      params.set("account", account.id);
    const suffix = params.size ? "?" + params.toString() : "";
    location.hash = "/" + view + suffix;
    setMenuOpen(false);
  }
  function changeMode(next: DataMode, destination = "dashboard") {
    if (next !== mode) notifications.clear();
    setMode(next);
    saveStored("signal:mode", next);
    setQuery("");
    setPeriod("all");
    setNotice(null);
    navigate(destination, {}, false);
  }
  function beginDemo() {
    restartDemoOnboarding();
    setTourStep(-1);
    saveStored(TOUR_KEY, -1);
    changeMode("demo", "demo");
  }
  function finishDemo() {
    setTourStep(0);
    saveStored(TOUR_KEY, 0);
    setProfileRevision((r) => r + 1);
    setRevision((r) => r + 1);
    navigate("dashboard", {}, false);
  }
  function dismissTour() {
    setTourStep(-1);
    saveStored(TOUR_KEY, -1);
  }
  function goToTourStep(step: number) {
    setTourStep(step);
    saveStored(TOUR_KEY, step);
    setQuery("");
    const s = tourSteps[step];
    navigate(s.view, s.tab ? { tab: s.tab } : {});
  }
  function replayTour() {
    goToTourStep(0);
  }
  useEffect(() => {
    if (
      mode === "demo" &&
      route.view === "dashboard" &&
      readStored(TOUR_KEY, null) === null
    ) {
      setTourStep(0);
      saveStored(TOUR_KEY, 0);
    }
  }, [mode, route.view]);
  function nextTour() {
    if (tourStep >= tourSteps.length - 1) {
      dismissTour();
      return;
    }
    goToTourStep(tourStep + 1);
  }
  useEffect(() => {
    const update = () => {
      setRoute(readRoute());
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has("connected") || q.has("error")) {
      setMode("live");
      saveStored("signal:mode", "live");
      setNotice(
        q.has("error")
          ? {
              text: connectionErrorMessage(q),
              error: true,
            }
          : {
              text: "Channel authorized. Import its posts and comments to get started.",
            },
      );
      const id = q.get("account_id");
      location.hash = readStored("signal:live:onboarding-active", false)
        ? "/onboarding"
        : "/connections" + (id ? "?account=" + encodeURIComponent(id) : "");
      history.replaceState(null, "", location.pathname + location.hash);
    } else if (q.get("demo") === "1") {
      setMode("demo");
      saveStored("signal:mode", "demo");
      restartDemoOnboarding();
      setTourStep(-1);
      saveStored(TOUR_KEY, -1);
      location.hash = "/demo";
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }, []);
  useEffect(() => {
    if (mode !== "live" || !workspaceEnabled || busy) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRevision((r) => r + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [mode, workspaceEnabled, busy]);
  async function perform(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please retry.",
        error: true,
      });
    } finally {
      setBusy("");
    }
  }
  function connect(
    platform: string,
    loginMethod?: "instagram_login" | "facebook_login",
  ) {
    if (mode === "demo" || !canConnectPlatform(platform)) return;
    void perform("Connecting…", async () => {
      saveStored("signal:connection:pending", platform);
      const result = await api.connect(platform, loginMethod),
        url = safeExternalUrl(result.auth_url);
      if (!url || !url.startsWith("https://"))
        throw new Error("The API did not return a secure authorization URL.");
      saveStored("signal:mode", "live");
      window.location.assign(url);
    });
  }
  function syncAccounts() {
    void perform("Refreshing accounts…", async () => {
      const accounts = await api.syncAccounts();
      setRevision((r) => r + 1);
      setNotice(
        accounts.length
          ? { text: `${accounts.length} authorized accounts found in Zernio.` }
          : {
              text: "No authorized account found. Complete authorization, try the Facebook option, or connect in Zernio and check again.",
              error: true,
            },
      );
    });
  }
  function importAccount(id: string) {
    if (mode === "demo") {
      navigate("dashboard");
      return;
    }
    void perform("Importing posts & comments…", async () => {
      const result = await api.importAccount(id);
      setRevision((r) => r + 1);
      navigate("dashboard", { account: id }, false);
      setNotice({
        text: result.errors.length
          ? "Import partially completed: " + result.errors.join(" · ")
          : "Imported " +
            result.posts +
            " posts and " +
            result.comments +
            " comments. Classification will update automatically.",
        error: result.errors.length > 0,
      });
    });
  }
  function classify() {
    if (!account || mode === "demo") return;
    void perform("Classifying comments…", async () => {
      const r = await api.runClassification(account.id);
      setRevision((v) => v + 1);
      setNotice({
        text: r.classified + " messages classified. " + r.failed + " failed.",
        error: r.failed > 0,
      });
    });
  }
  function saveProfile(value: BrandProfile) {
    const key =
      route.view === "brand"
        ? "signal:profile:" + mode + ":workspace"
        : profileKey;
    const saved = saveStored(key, value);
    setProfileRevision((r) => r + 1);
    if (!saved) {
      setNotice({
        text: "Browser storage is unavailable. Profile could not be saved.",
        error: true,
      });
      return;
    }
    if (route.view === "brand") navigate("connections", {}, false);
    else setNotice({ text: "Brand context saved in this browser." });
  }
  function openPost(id: number) {
    navigate(route.view, {
      ...(route.view === "insights" && route.params.get("intent")
        ? { intent: route.params.get("intent")! }
        : {}),
      post: String(id),
    });
  }
  const currentIntent = route.params.get("intent");
  const intent: Intent | "all" = INTENTS.includes(currentIntent as Intent)
    ? (currentIntent as Intent)
    : "all";
  const total = aggregate(workspace.posts);
  const rawPost = route.params.get("post"),
    postId = rawPost && /^\d+$/.test(rawPost) ? Number(rawPost) : null;
  const displayName = profile.name || "Your brand";
  function search(event: FormEvent) {
    event.preventDefault();
    if (!["posts", "insights"].includes(route.view)) navigate("posts");
  }
  if (route.view === "demo")
    return (
      <Onboarding
        onComplete={finishDemo}
        onExit={() => navigate("landing", {}, false)}
      />
    );
  if (route.view === "landing")
    return (
      <Landing
        onDemo={beginDemo}
        onStart={() => {
          saveStored("signal:live:onboarding-active", true);
          changeMode("live", "onboarding");
        }}
        onResume={() => changeMode("live", "auth")}
      />
    );
  if (
    mode === "live" &&
    (route.view === "onboarding" || route.view === "brand")
  ) {
    if (authLoading)
      return (
        <div className="loading-state" role="status">
          Opening your workspace…
        </div>
      );
    return (
      <Onboarding
        key="live"
        mode="live"
        signedIn={!!owner}
        onAuthenticated={setOwner}
        initialError={notice?.error ? notice.text : ""}
        onExit={() => navigate("landing", {}, false)}
        onComplete={() => {
          setRevision((r) => r + 1);
          setProfileRevision((r) => r + 1);
          navigate("dashboard", {}, false);
        }}
      />
    );
  }
  if (needsAuth && (!owner || route.view === "auth"))
    return (
      <div className="onboarding">
        <header>
          <a href="#/landing" className="wordmark">
            signal
          </a>
          <Button onClick={() => navigate("landing", {}, false)}>
            Back to home
          </Button>
        </header>
        <main>
          {authLoading ? (
            <p role="status">Opening your workspace…</p>
          ) : owner ? (
            <>
              <h1>Welcome back, {owner.name}.</h1>
              <Button primary onClick={() => navigate("dashboard", {}, false)}>
                Open workspace →
              </Button>
            </>
          ) : (
            <AuthForm
              onSuccess={(v, created) => {
                setOwner(v);
                if (created) saveStored("signal:live:onboarding-active", true);
                navigate(
                  readStored("signal:live:onboarding-active", false)
                    ? "onboarding"
                    : "dashboard",
                  {},
                  false,
                );
              }}
            />
          )}
          {authError && <p role="alert">{authError}</p>}
        </main>
      </div>
    );

  return (
    <div className={"app " + (menuOpen ? "menu-is-open" : "")}>
      {menuOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className="sidebar">
        <a className="wordmark" href="#/dashboard">
          signal
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={route.view === id ? "active" : ""}
              aria-current={route.view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon name={id === "products" ? "posts" : id} />
              {label}
              {id === "conversations" && mode === "demo" && (
                <span className="nav-tag">Demo</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-accounts">
          <span className="eyebrow">YOUR ACCOUNTS</span>
          {workspace.accounts.map((a) => (
            <button
              key={a.id}
              className={
                "account-link " + (account?.id === a.id ? "current" : "")
              }
              onClick={() => {
                setQuery("");
                navigate(route.view, { account: a.id }, false);
              }}
            >
              <span className="account-symbol">
                {a.platform === "instagram"
                  ? "◎"
                  : a.platform.slice(0, 1).toUpperCase()}
              </span>
              <span>{a.username ?? a.platform}</span>
            </button>
          ))}
          <button
            className="account-link"
            onClick={() => navigate("connections")}
          >
            <Icon name="plus" />
            Connect a channel
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={route.view === "profile" ? "active" : ""}
            onClick={() => navigate("profile")}
          >
            <Icon name="settings" />
            Enrich profile
          </button>
          <button
            className={route.view === "data" ? "active" : ""}
            onClick={() => navigate("data")}
          >
            <Icon name="help" />
            Data & definitions
          </button>
          {mode === "demo" && (
            <>
              <button onClick={replayTour}>
                <Icon name="help" />
                Replay workspace tour
              </button>
              <button onClick={beginDemo}>
                <Icon name="plus" />
                Restart guided demo
              </button>
            </>
          )}
          <label className="mode-select">
            <span>Workspace</span>
            <select
              aria-label="Data mode"
              disabled={!!busy}
              value={mode}
              onChange={(e) =>
                e.target.value === "demo" &&
                !readStored("signal:demo:ready", false)
                  ? beginDemo()
                  : changeMode(e.target.value as DataMode)
              }
            >
              <option value="demo">Offline demo</option>
              <option value="live">Connected accounts</option>
            </select>
          </label>
          <div className="sidebar-brand">
            <span className="avatar">{displayName[0].toUpperCase()}</span>
            <span>
              {displayName}
              <small>
                {mode === "demo" ? "Demo workspace" : "Local workspace"}
              </small>
            </span>
          </div>
          {mode === "live" && owner && (
            <button
              className="sidebar-signout"
              onClick={() =>
                void request("/auth/logout", { method: "POST" })
                  .then(() => {
                    notifications.clear();
                    setOwner(null);
                    navigate("landing", {}, false);
                  })
                  .catch((e) => setNotice({ text: e.message, error: true }))
              }
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Button
            className="mobile-menu"
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </Button>
          <form className="global-search" onSubmit={search}>
            <Icon name="search" />
            <input
              aria-label="Search posts or comments"
              placeholder="Search a post, topic or comment…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </form>
          {mode === "demo" && <span className="pill pill--demo">Demo</span>}
          <div className="topbar-actions">
            <Notifications {...notifications} />
            <Button
              className="topbar-settings"
              aria-label="Brand settings"
              onClick={() => navigate("profile")}
            >
              <Icon name="settings" />
            </Button>
          </div>
          <span className="sr-only" role={notice?.error ? "alert" : "status"}>
            {notice?.text ?? ""}
          </span>
        </header>
        <main className="main">
          {mode === "demo" && tourStep >= 0 && (
            <WorkspaceTour
              step={tourStep}
              view={route.view}
              onNext={nextTour}
              onDismiss={dismissTour}
              onBack={() => goToTourStep(Math.max(0, tourStep - 1))}
              onResume={() => goToTourStep(tourStep)}
            />
          )}
          <div className="brand-bar">
            <div className="brand-identity">
              <span className="avatar avatar--large">
                {displayName[0].toUpperCase()}
              </span>
              <div>
                <div className="brand-title">
                  <h2>{displayName}</h2>
                  {["insights", "posts", "products", "dashboard"].includes(
                    route.view,
                  ) ? (
                    <span className="pill">
                      All channels · {workspace.accounts.length}
                    </span>
                  ) : (
                    account && (
                      <span className="pill">
                        {account.platform === "instagram" && (
                          <Icon name="instagram" />
                        )}
                        {account.platform}
                      </span>
                    )
                  )}
                </div>
                <p>
                  {mode === "demo"
                    ? "Language learning · Demonstration data"
                    : account?.username
                      ? "@" + account.username.replace(/^@/, "")
                      : "Connect a channel to begin"}
                </p>
              </div>
            </div>
            <div className="brand-controls">
              {["posts"].includes(route.view) && (
                <label className="filter">
                  <Icon name="calendar" />
                  <select
                    aria-label="Post publication date"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="all">All imported posts</option>
                    <option value="28">Published in 28 days</option>
                    <option value="90">Published in 90 days</option>
                  </select>
                </label>
              )}
              <Button
                disabled={!!busy || workspace.loading}
                onClick={() =>
                  mode === "demo"
                    ? setNotice({
                        text: "Demo data is local and ready to explore.",
                      })
                    : account
                      ? importAccount(account.id)
                      : navigate("connections")
                }
              >
                {busy ||
                  "↻ " + (mode === "demo" ? "Demo data" : "Sync content")}
              </Button>
            </div>
          </div>
          {workspace.error && (
            <div className="notice notice--error" role="alert">
              <span>{workspace.error}</span>
              <Button onClick={() => setRevision((r) => r + 1)}>Retry</Button>
              <Button onClick={beginDemo}>Try offline demo</Button>
            </div>
          )}
          {route.view === "connections" ? (
            <Connections
              error={notice?.error ? notice.text : ""}
              mode={mode}
              accounts={workspace.accounts}
              busy={!!busy}
              onConnect={connect}
              onSync={syncAccounts}
              onLive={() => changeMode("live", "connections")}
              onImport={importAccount}
              onDemo={beginDemo}
              onHome={() => navigate("dashboard")}
            />
          ) : route.view === "products" ? (
            <Products mode={mode} accounts={workspace.accounts} />
          ) : route.view === "profile" ? (
            <Profile key={profileKey} initial={profile} onSave={saveProfile} />
          ) : route.view === "data" ? (
            <>
              <Heading
                title="Data & definitions"
                subtitle="Know what every number represents."
              />
              <div className="metrics-grid">
                <Metric label="Audience comments" value={count(total.total)} />
                <Metric
                  label="Classification coverage"
                  value={percent(
                    total.total ? total.classified / total.total : null,
                  )}
                />
                <Metric label="Needs review" value={count(total.review)} />
              </div>
              <div className="panel definitions">
                <h2>Purchase intent rate</h2>
                <p>{PIR_DEFINITION}</p>
                <h2>Intent score</h2>
                <p>
                  (3 × purchase intent + 2 × pre-purchase questions +
                  objections) ÷ audience comments. Range: 0–3. This is a
                  prioritization score, not a conversion probability.
                </p>
                <h2>Scope and missing data</h2>
                <p>
                  Only imported, incoming audience comments count. Brand replies
                  and DMs are excluded. Unclassified comments remain in the
                  denominator. An em dash means the platform has not provided
                  the metric; zero means an observed zero.
                </p>
                <h2>Live capabilities</h2>
                <p>
                  Channel authorization, imports, classification, post ranking
                  and comment evidence use F1–F6. Conversations use F7–F8 for
                  DMs and tracking. Product insights use F12 reports; Boost uses
                  F9 ad accounts, campaign creation and status tracking.
                </p>
                <h2>Refresh</h2>
                <p>
                  Connected-account data is read from your backend every 15
                  seconds while this tab is visible. Sync content imports fresh
                  platform data. Classification can continue after an import
                  completes.
                </p>
                <div className="actions">
                  <Button
                    disabled={mode === "demo" || !account || !!busy}
                    onClick={classify}
                  >
                    Classify pending messages
                  </Button>
                  <Button onClick={() => navigate("connections")}>
                    Manage connections
                  </Button>
                </div>
              </div>
            </>
          ) : workspace.loading && !workspace.posts.length ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              Loading your workspace…
            </div>
          ) : !account ? (
            <Empty
              title={
                workspace.error
                  ? "Your backend is unavailable"
                  : "Your workspace is ready for its first channel"
              }
              action={
                <div className="actions">
                  <Button primary onClick={() => navigate("connections")}>
                    Connect a channel
                  </Button>
                  <Button onClick={beginDemo}>Explore demo</Button>
                </div>
              }
            >
              Import an account’s posts and comments to unlock your dashboard.
            </Empty>
          ) : !workspace.posts.length &&
            ![
              "conversations",
              "insights",
              "posts",
              "dashboard",
              "products",
            ].includes(route.view) ? (
            <Empty
              title="No posts imported yet"
              action={
                <Button
                  primary
                  disabled={!!busy}
                  onClick={() => importAccount(account.id)}
                >
                  Import posts & comments
                </Button>
              }
            >
              Your channel is connected. Import its content to calculate your
              first signals.
            </Empty>
          ) : route.view === "dashboard" ? (
            <Dashboard
              mode={mode}
              accounts={workspace.accounts}
              revision={revision}
              onOpen={(id, accountId) =>
                navigate("dashboard", { post: String(id), account: accountId })
              }
              onNavigate={navigate}
            />
          ) : route.view === "posts" ? (
            <BrandPosts
              mode={mode}
              accounts={workspace.accounts}
              revision={revision}
              period={period}
              query={query}
              channel={route.params.get("channel") ?? "all"}
              onChannelChange={(channel) => navigate("posts", { channel })}
              onOpen={(id, accountId) =>
                navigate(
                  "posts",
                  {
                    post: String(id),
                    account: accountId,
                    channel: route.params.get("channel") ?? "all",
                  },
                  false,
                )
              }
            />
          ) : route.view === "insights" ? (
            <BrandInsights
              key={intent}
              channel={route.params.get("channel") ?? "all"}
              onChannelChange={(channel) =>
                navigate("insights", { channel, intent })
              }
              mode={mode}
              accounts={workspace.accounts}
              revision={revision}
              initial={intent}
              query={query}
              onOpen={(id, accountId) =>
                navigate(
                  "insights",
                  {
                    post: String(id),
                    account: accountId,
                    intent,
                    channel: route.params.get("channel") ?? "all",
                  },
                  false,
                )
              }
            />
          ) : route.view === "analytics" ? (
            <Analytics
              posts={workspace.posts}
              details={evidence.items}
              loading={evidence.loading}
              error={evidence.error}
            />
          ) : (
            <Conversations
              key={mode + ":" + account.id}
              mode={mode}
              accountId={account.id}
              accounts={workspace.accounts}
              posts={workspace.posts}
              onProducts={() => navigate("products")}
              onPosts={() => navigate("posts")}
              onOpen={openPost}
              initialTab={route.params.get("tab") ?? "inbox"}
            />
          )}
        </main>
      </div>
      {postId !== null && account && (
        <DetailDialog
          id={postId}
          accountId={account.id}
          mode={mode}
          onClose={() => {
            const p = Object.fromEntries(route.params);
            delete p.post;
            navigate(route.view, p);
          }}
        />
      )}
    </div>
  );
}
