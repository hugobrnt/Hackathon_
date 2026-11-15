import type {
  ClassificationRunResult,
  ImportResult,
  PostDetail,
  PostIntentStats,
  PostSortKey,
  SocialAccount,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body) {
        const value = (body as { detail: unknown }).detail;
        detail = typeof value === "string" ? value : JSON.stringify(value);
      }
    } catch {
      // Keep the status text.
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export const api = {
  listAccounts: (sync = true) => request<SocialAccount[]>(`/accounts?sync=${sync}`),
  importAccount: (accountId: string) =>
    request<ImportResult>(`/accounts/${encodeURIComponent(accountId)}/import`, { method: "POST" }),
  loadDemo: () => request<ImportResult>("/demo/load", { method: "POST" }),
  runClassification: (accountId?: string) =>
    request<ClassificationRunResult>("/classification/run", {
      method: "POST",
      body: JSON.stringify({ account_id: accountId ?? null }),
    }),
  rankPosts: (params: { accountId?: string; sort: PostSortKey; minComments: number }) => {
    const query = new URLSearchParams({ sort: params.sort, min_comments: String(params.minComments) });
    if (params.accountId) query.set("account_id", params.accountId);
    return request<PostIntentStats[]>(`/analytics/posts?${query.toString()}`);
  },
  postDetail: (postId: number) => request<PostDetail>(`/analytics/posts/${postId}`),
};
