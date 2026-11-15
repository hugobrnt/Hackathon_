import type {
  ClassificationRunResult,
  ImportResult,
  PostDetail,
  PostIntentStats,
  PostSortKey,
  SocialAccount,
} from "./types";
const BASE = (import.meta.env?.VITE_API_BASE ?? "/api").replace(/\/$/, "");
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      credentials: "include",
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "Unable to reach Signal. Please try again.");
  }
  if (!response.ok) {
    let message = "API request failed (" + response.status + ").";
    try {
      const body = await response.json();
      const detail = body.detail ?? body.message ?? body.error;
      if (typeof detail === "string") message = detail;
    } catch {
      /* Non-JSON proxy errors. */
    }
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !path.startsWith("/auth/")
    )
      window.dispatchEvent(new Event("signal:session-expired"));
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}
export const api = {
  syncAccounts: () =>
    request<SocialAccount[]>("/accounts/sync", { method: "POST" }),
  listAccounts: (sync = false, signal?: AbortSignal) =>
    request<SocialAccount[]>("/accounts?sync=" + sync, { signal }),
  connect: (platform: string) =>
    request<{ auth_url: string }>(
      "/accounts/connect/" + encodeURIComponent(platform),
      { method: "POST" },
    ),
  importAccount: (id: string) =>
    request<ImportResult>("/accounts/" + encodeURIComponent(id) + "/import", {
      method: "POST",
      signal: AbortSignal.timeout(180000),
    }),
  loadDemo: () => request<ImportResult>("/demo/load", { method: "POST" }),
  runClassification: (id?: string) =>
    request<ClassificationRunResult>("/classification/run", {
      method: "POST",
      body: JSON.stringify({ account_id: id ?? null }),
      signal: AbortSignal.timeout(180000),
    }),
  rankPosts: (
    {
      accountId,
      sort,
      minComments,
    }: { accountId?: string; sort: PostSortKey; minComments: number },
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams({ sort, min_comments: String(minComments) });
    if (accountId) q.set("account_id", accountId);
    return request<PostIntentStats[]>("/analytics/posts?" + q, { signal });
  },
  postDetail: (id: number, signal?: AbortSignal) =>
    request<PostDetail>("/analytics/posts/" + id, { signal }),
};
