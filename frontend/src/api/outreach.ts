import { request, ApiError } from "./client.ts";
import type {
  AutoDmInput,
  AutoDmSettings,
  DmAttempt,
  DmDraft,
  DmRun,
  Product,
  ProductInput,
  TrackedLink,
  TrackingStats,
  OutreachSnapshot,
} from "./outreach-types";
import type { DataMode } from "./source";
import { demoOutreach } from "../domains/demo/outreach.ts";
export interface OutreachSource {
  load(account: string, signal?: AbortSignal): Promise<OutreachSnapshot>;
  product(account: string, signal?: AbortSignal): Promise<Product | null>;
  saveProduct(account: string, input: ProductInput): Promise<Product>;
  settings(post: number, signal?: AbortSignal): Promise<AutoDmSettings>;
  saveSettings(post: number, input: AutoDmInput): Promise<AutoDmSettings>;
  preview(message: number): Promise<DmDraft>;
  run(post: number): Promise<DmRun>;
  approve(id: number, text: string): Promise<DmAttempt>;
  reject(id: number): Promise<DmAttempt>;
}
const longTimeout = () => AbortSignal.timeout(180000);
export const liveOutreach: OutreachSource = {
  product: (account, signal) =>
    request<Product>("/accounts/" + encodeURIComponent(account) + "/product", {
      signal,
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),

  async load(account, signal) {
    const q = "?account_id=" + encodeURIComponent(account);
    const [attempts, product, links, stats] = await Promise.all([
      request<DmAttempt[]>("/auto-dm/attempts" + q + "&limit=500", { signal }),
      request<Product>(
        "/accounts/" + encodeURIComponent(account) + "/product",
        { signal },
      ).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
      request<TrackedLink[]>("/tracking/links" + q, { signal }),
      request<TrackingStats>("/tracking/stats" + q, { signal }),
    ]);
    if (
      attempts.some((a) => a.account_id !== account) ||
      links.some((l) => l.account_id !== account) ||
      (product && product.account_id !== account)
    )
      throw new Error("Account mismatch in API response.");
    return { attempts, product, links, stats };
  },
  saveProduct: (account, input) =>
    request<Product>("/accounts/" + encodeURIComponent(account) + "/product", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  settings: (post, signal) =>
    request<AutoDmSettings>("/posts/" + post + "/auto-dm", { signal }),
  saveSettings: (post, input) =>
    request<AutoDmSettings>("/posts/" + post + "/auto-dm", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  preview: (message) =>
    request<DmDraft>("/messages/" + message + "/auto-dm/preview", {
      method: "POST",
      signal: longTimeout(),
    }),
  run: (post) =>
    request<DmRun>("/posts/" + post + "/auto-dm/run", {
      method: "POST",
      signal: longTimeout(),
    }),
  approve: (id, text) =>
    request<DmAttempt>("/auto-dm/attempts/" + id + "/approve", {
      method: "POST",
      body: JSON.stringify({ text }),
      signal: longTimeout(),
    }),
  reject: (id) =>
    request<DmAttempt>("/auto-dm/attempts/" + id + "/reject", {
      method: "POST",
    }),
};
export const outreachFor = (mode: DataMode): OutreachSource =>
  mode === "demo" ? demoOutreach : liveOutreach;
