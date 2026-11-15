import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import type { PostDetail, PostIntentStats, PostSortKey, SocialAccount } from "./api/types";
import { AccountBar } from "./domains/accounts/AccountBar";
import { PostDetailPanel } from "./domains/posts/PostDetailPanel";
import { PostRanking, SORT_LABELS } from "./domains/posts/PostRanking";

// The webhooks (F2) add comments in real time: refresh the data at this interval.
const REFRESH_MS = 10_000;

// The URL hash keeps the selection: `#account=<id>&post=<id>`.
function readHash(): { accountId: string | null; postId: number | null } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const post = params.get("post");
  return { accountId: params.get("account"), postId: post && /^\d+$/.test(post) ? Number(post) : null };
}

export function App() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(() => readHash().accountId);
  const [sort, setSort] = useState<PostSortKey>("intent_score");
  const [minComments, setMinComments] = useState(0);
  const [stats, setStats] = useState<PostIntentStats[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => readHash().postId);
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadAccounts = useCallback(async (sync: boolean) => {
    const list = await api.listAccounts(sync);
    setAccounts(list);
    setAccountId((current) => current ?? list.find((a) => !a.is_demo)?.id ?? list[0]?.id ?? null);
  }, []);

  const loadStats = useCallback(async () => {
    if (!accountId) return;
    setStats(await api.rankPosts({ accountId, sort, minComments }));
  }, [accountId, sort, minComments]);

  const loadDetail = useCallback(async () => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    setDetail(await api.postDetail(selectedId));
  }, [selectedId]);

  const showError = (error: unknown) =>
    setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });

  useEffect(() => {
    loadAccounts(true).catch(showError);
  }, [loadAccounts]);

  useEffect(() => {
    loadStats().catch(showError);
  }, [loadStats]);

  useEffect(() => {
    loadDetail().catch(() => setSelectedId(null));
  }, [loadDetail]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (accountId) params.set("account", accountId);
    if (selectedId !== null) params.set("post", String(selectedId));
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [accountId, selectedId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      loadStats().catch(() => undefined);
      loadDetail().catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadStats, loadDetail]);

  async function runAction(name: string, action: () => Promise<string>) {
    setBusy(name);
    setNotice(null);
    try {
      setNotice({ kind: "ok", text: await action() });
      await loadStats();
      await loadDetail();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  const onImport = () =>
    runAction("import", async () => {
      if (!accountId) return "Aucun compte.";
      const r = await api.importAccount(accountId);
      const errors = r.errors.length ? ` · ${r.errors.length} erreur(s)` : "";
      return `Import : ${r.posts} posts, ${r.comments} commentaires, ${r.dms} DMs, ${r.new_messages} nouveaux. Classification en tâche de fond${errors}.`;
    });

  const onDemo = () =>
    runAction("demo", async () => {
      const r = await api.loadDemo();
      await loadAccounts(false);
      setAccountId(r.account_id);
      return `Démo chargée : ${r.posts} posts, ${r.comments} commentaires.`;
    });

  const onClassify = () =>
    runAction("classify", async () => {
      const r = await api.runClassification(accountId ?? undefined);
      return r.classified === 0
        ? "Tous les messages sont déjà classés."
        : `${r.classified} messages classés (${r.escalated} par le grand modèle, ${r.fallback} par l'heuristique).`;
    });

  const onAccountChange = (id: string) => {
    setAccountId(id);
    setSelectedId(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Social Intent Converter</h1>
          <p className="muted small">Quels posts vendent ? Classement par intention d'achat.</p>
        </div>
        <AccountBar
          accounts={accounts}
          accountId={accountId}
          busy={busy}
          onChange={onAccountChange}
          onImport={onImport}
          onDemo={onDemo}
          onClassify={onClassify}
        />
      </header>

      {notice && (
        <div className={`notice notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
          <button type="button" className="btn btn--ghost small" onClick={() => setNotice(null)} aria-label="Fermer">
            ✕
          </button>
        </div>
      )}

      <main className={`layout${detail ? " layout--split" : ""}`}>
        <section className="panel" aria-label="Classement des posts">
          <div className="toolbar">
            <h2>Posts</h2>
            <label className="field field--inline">
              <span className="field__label">Trier par</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as PostSortKey)}>
                {(Object.keys(SORT_LABELS) as PostSortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--inline">
              <span className="field__label">Min. commentaires</span>
              <input
                type="number"
                min={0}
                value={minComments}
                onChange={(e) => setMinComments(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="field field--inline checkbox">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Temps réel</span>
            </label>
          </div>
          <PostRanking stats={stats} selectedId={selectedId} onSelect={setSelectedId} />
        </section>

        {detail && <PostDetailPanel detail={detail} onClose={() => setSelectedId(null)} />}
      </main>
    </div>
  );
}
