import { useEffect, useMemo, useState } from "react";
import { sourceFor, type DataMode } from "../../api/source";
import type { SocialAccount, PostIntentStats } from "../../api/types";
interface ChannelResult {
  account: SocialAccount;
  posts: PostIntentStats[];
  error: string | null;
}
export function useBrandPosts(
  mode: DataMode,
  accounts: SocialAccount[],
  revision: number,
) {
  const [results, setResults] = useState<ChannelResult[]>([]),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const accountKey = accounts.map((a) => a.id).join("|");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setResults([]);
    void (async () => {
      const rows: ChannelResult[] = [];
      for (let i = 0; i < accounts.length; i += 4) {
        const batch = await Promise.all(
          accounts.slice(i, i + 4).map(async (account) => {
            try {
              return {
                account,
                posts: await sourceFor(mode).posts(account.id, c.signal),
                error: null,
              };
            } catch (e) {
              return {
                account,
                posts: [],
                error: e instanceof Error ? e.message : "Unavailable",
              };
            }
          }),
        );
        if (c.signal.aborted) return;
        rows.push(...batch);
      }
      if (!c.signal.aborted) {
        setResults(rows);
        setLoading(false);
      }
    })();
    return () => c.abort();
  }, [mode, accountKey, revision, retry]);
  const allPosts = useMemo(() => results.flatMap((r) => r.posts), [results]);
  return { results, loading, allPosts, retry: () => setRetry((n) => n + 1) };
}
