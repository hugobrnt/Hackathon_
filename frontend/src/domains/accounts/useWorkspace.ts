import { useEffect, useState } from "react";
import { sourceFor, loadEvidence, type DataMode } from "../../api/source";
import type {
  PostDetail,
  PostIntentStats,
  SocialAccount,
} from "../../api/types";

interface Workspace {
  mode: DataMode;
  requested: string;
  accounts: SocialAccount[];
  account: SocialAccount | null;
  posts: PostIntentStats[];
  loading: boolean;
  error: string | null;
}
export function useWorkspace(
  mode: DataMode,
  preferred: string,
  revision: number,
  enabled: boolean,
) {
  const [state, setState] = useState<Workspace>({
    mode,
    requested: preferred,
    accounts: [],
    account: null,
    posts: [],
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(),
      source = sourceFor(mode);
    setState((old) => ({ ...old, loading: true, error: null }));
    void (async () => {
      try {
        const accounts = await source.accounts(controller.signal);
        const account =
          accounts.find((a) => a.id === preferred) ?? accounts[0] ?? null;
        const posts = account
          ? await source.posts(account.id, controller.signal)
          : [];
        if (!controller.signal.aborted)
          setState({
            mode,
            requested: preferred,
            accounts,
            account,
            posts,
            loading: false,
            error: null,
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((old) => ({
            ...(old.mode === mode && old.requested === preferred
              ? old
              : {
                  mode,
                  requested: preferred,
                  accounts: [],
                  account: null,
                  posts: [],
                }),
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load accounts.",
          }));
      }
    })();
    return () => controller.abort();
  }, [mode, preferred, revision, enabled]);
  return state.mode === mode && state.requested === preferred
    ? state
    : {
        mode,
        requested: preferred,
        accounts: [],
        account: null,
        posts: [],
        loading: enabled,
        error: null,
      };
}
export function useEvidence(
  mode: DataMode,
  posts: PostIntentStats[],
  enabled: boolean,
) {
  const [state, setState] = useState<{
    key: string;
    items: PostDetail[];
    loading: boolean;
    error: string | null;
  }>({ key: "", items: [], loading: false, error: null });
  const key =
    mode +
    ":" +
    posts
      .map((p) =>
        [
          p.post.account_id,
          p.post.id,
          p.total_comments,
          p.classified_comments,
          p.intent_score,
        ].join(":"),
      )
      .join(",");
  useEffect(() => {
    if (!enabled || !posts.length) return;
    const controller = new AbortController();
    setState({ key, items: [], loading: true, error: null });
    loadEvidence(sourceFor(mode), posts, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setState({ key, items, loading: false, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            items: [],
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load comment evidence.",
          });
      });
    return () => controller.abort();
    // A newly fetched post list also refreshes evidence when classifications
    // changed without changing the total score or number of comments.
  }, [key, enabled, posts, mode]);
  return state.key === key
    ? state
    : { key, items: [], loading: enabled && posts.length > 0, error: null };
}
