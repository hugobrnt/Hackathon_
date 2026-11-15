import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api/client";
import { parseTimestamp } from "./shared/time";
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
  DemoOnboarding,
  restartDemoOnboarding,
} from "./domains/onboarding/DemoOnboarding";
import { WorkspaceTour, tourSteps } from "./domains/onboarding/WorkspaceTour";
import { Landing } from "./domains/onboarding/Landing";
import { Dashboard } from "./domains/dashboard/Dashboard";
import { PostsView } from "./domains/posts/PostsView";
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
  ["conversations", "Conversations"],
  ["analytics", "Analytics"],
] as const;
const routes = new Set([
  ...nav.map(([id]) => id),
  "landing",
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
  return readStored<string>("signal:mode", "demo") === "live" ? "live" : "demo";
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
    [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [profileRevision, setProfileRevision] = useState(0),
    [tourStep, setTourStep] = useState<number>(() => {
      const n = readStored<unknown>("signal:demo:tour", -1);
      return typeof n === "number" && n >= 0 && n < 4 ? n : -1;
    });
  const workspaceEnabled = !["landing", "brand", "demo"].includes(route.view);
  const preferred = route.params.get("account") ?? "";
  const workspace = useWorkspace(mode, preferred, revision, workspaceEnabled);
  const account = workspace.account;
  const evidence = useEvidence(
    mode,
    workspace.posts,
    route.view === "analytics",
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
    saveStored("signal:demo:tour", -1);
    changeMode("demo", "demo");
  }
  function finishDemo() {
    setTourStep(0);
    saveStored("signal:demo:tour", 0);
    setProfileRevision((r) => r + 1);
    setRevision((r) => r + 1);
    navigate("dashboard", {}, false);
  }
  function dismissTour() {
    setTourStep(-1);
    saveStored("signal:demo:tour", -1);
  }
  function nextTour() {
    if (tourStep >= tourSteps.length - 1) {
      dismissTour();
      return;
    }
    const next = tourStep + 1;
    setTourStep(next);
    saveStored("signal:demo:tour", next);
    navigate(tourSteps[next].view);
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
              text:
                q.get("error_message") ??
                "Account connection was not completed.",
              error: true,
            }
          : {
              text: "Channel authorized. Import its posts and comments to get started.",
            },
      );
      const id = q.get("account_id");
      location.hash =
        "/connections" + (id ? "?account=" + encodeURIComponent(id) : "");
      history.replaceState(null, "", location.pathname + location.hash);
    } else if (q.get("demo") === "1") {
      setMode("demo");
      saveStored("signal:mode", "demo");
      restartDemoOnboarding();
      setTourStep(-1);
      saveStored("signal:demo:tour", -1);
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
  function connect(platform: string) {
    if (mode === "demo") return;
    void perform("Connecting…", async () => {
      const result = await api.connect(platform),
        url = safeExternalUrl(result.auth_url);
      if (!url || !url.startsWith("https://"))
        throw new Error("The API did not return a secure authorization URL.");
      saveStored("signal:mode", "live");
      window.location.assign(url);
    });
  }
  function syncAccounts() {
    void perform("Refreshing accounts…", async () => {
      await api.syncAccounts();
      setRevision((r) => r + 1);
      setNotice({ text: "Accounts refreshed from Zernio." });
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
  const filteredPosts = workspace.posts.filter(
    (p) =>
      period === "all" ||
      (p.post.created_time &&
        parseTimestamp(p.post.created_time) >=
          Date.now() - Number(period) * 86400000),
  );
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
      <DemoOnboarding
        onComplete={finishDemo}
        onExit={() => navigate("landing", {}, false)}
      />
    );
  if (route.view === "landing")
    return (
      <Landing
        onDemo={beginDemo}
        onStart={() => changeMode("live", "brand")}
        onResume={() =>
          mode === "demo" && !readStored("signal:demo:ready", false)
            ? beginDemo()
            : navigate("dashboard", {}, false)
        }
      />
    );
  if (route.view === "brand")
    return (
      <div className="onboarding">
        <header>
          <a href="#/landing" className="wordmark">
            signal
          </a>
          <span className="muted small">
            01 Brand · 02 Channels · 03 Import
          </span>
          <Button onClick={beginDemo}>Try demo</Button>
        </header>
        <main>
          <Profile
            key={mode}
            initial={fallback}
            onSave={saveProfile}
            onSkip={() => navigate("connections", {}, false)}
            onboarding
          />
          {notice && (
            <div role="alert" className="notice notice--error">
              {notice.text}
            </div>
          )}
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
              <Icon name={id} />
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
            <button onClick={beginDemo}>
              <Icon name="plus" />
              Restart guided demo
            </button>
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
          <span className={"pill " + (mode === "demo" ? "pill--demo" : "")}>
            {mode === "demo" ? "Demo" : "Connected"}
          </span>
          <Button
            aria-label="Brand settings"
            onClick={() => navigate("profile")}
          >
            <Icon name="settings" />
          </Button>
        </header>
        <main className="main">
          {mode === "demo" && tourStep >= 0 && (
            <WorkspaceTour
              step={tourStep}
              view={route.view}
              onNext={nextTour}
              onDismiss={dismissTour}
              onResume={() => navigate(tourSteps[tourStep].view)}
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
                  {route.view === "insights" ? (
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
              {["dashboard", "posts"].includes(route.view) && (
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
          {notice && (
            <div
              className={"notice " + (notice.error ? "notice--error" : "")}
              role={notice.error ? "alert" : "status"}
            >
              <span>{notice.text}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                ×
              </button>
            </div>
          )}
          {workspace.error && (
            <div className="notice notice--error" role="alert">
              <span>{workspace.error}</span>
              <Button onClick={() => setRevision((r) => r + 1)}>Retry</Button>
              <Button onClick={beginDemo}>Try offline demo</Button>
            </div>
          )}
          {route.view === "connections" ? (
            <Connections
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
                  and comment evidence are connected to F1–F6. The merged F7–F8
                  backend adds auto-DM and tracking; those controls are not
                  wired into this interface yet. Paid promotion is not
                  connected.
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
            !["conversations", "insights"].includes(route.view) ? (
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
              posts={filteredPosts}
              onOpen={openPost}
              onInsight={(i) => navigate("insights", { intent: i })}
            />
          ) : route.view === "posts" ? (
            <PostsView posts={filteredPosts} query={query} onOpen={openPost} />
          ) : route.view === "insights" ? (
            <BrandInsights
              key={intent}
              mode={mode}
              accounts={workspace.accounts}
              revision={revision}
              initial={intent}
              query={query}
              onOpen={(id, accountId) =>
                navigate(
                  "insights",
                  { post: String(id), account: accountId },
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
