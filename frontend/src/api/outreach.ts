import { catalogFor } from "../domains/products/api.ts";
import { request } from "./client.ts";
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
  preview(message: number, productId?: number): Promise<DmDraft>;
  run(post: number): Promise<DmRun>;
  approve(id: number, text: string, productId?: number): Promise<DmAttempt>;
  reject(id: number): Promise<DmAttempt>;
}
const longTimeout = () => AbortSignal.timeout(180000);
export const liveOutreach: OutreachSource = {
  async product(account, signal) {
    const p = (await catalogFor("live").list(account, signal)).find(
      (p) => p.is_active,
    );
    return p ? { ...p, name: p.title } : null;
  },

  async load(account, signal) {
    const q = "?account_id=" + encodeURIComponent(account);
    const [attempts, product, links, stats] = await Promise.all([
      request<DmAttempt[]>("/auto-dm/attempts" + q + "&limit=500", { signal }),
      liveOutreach.product(account, signal),
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
  async saveProduct(account, input) {
    const source = catalogFor("live"),
      all = await source.list(account);
    const old = all.find((p) => p.landing_url === input.landing_url);
    const p = await source.save(
      account,
      {
        business_type: input.business_type,
        title: input.name,
        landing_url: input.landing_url,
        description: input.description,
        is_active: true,
      },
      old?.id,
    );
    return { ...p, name: p.title };
  },
  settings: (post, signal) =>
    request<AutoDmSettings>("/posts/" + post + "/auto-dm", { signal }),
  saveSettings: (post, input) =>
    request<AutoDmSettings>("/posts/" + post + "/auto-dm", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  preview: (message, productId) =>
    request<DmDraft>(
      "/messages/" +
        message +
        "/auto-dm/preview" +
        (productId ? "?product_id=" + productId : ""),
      {
        method: "POST",
        signal: longTimeout(),
      },
    ),
  run: (post) =>
    request<DmRun>("/posts/" + post + "/auto-dm/run", {
      method: "POST",
      signal: longTimeout(),
    }),
  approve: (id, text, productId) =>
    request<DmAttempt>("/auto-dm/attempts/" + id + "/approve", {
      method: "POST",
      body: JSON.stringify({ text, product_id: productId }),
      signal: longTimeout(),
    }),
  reject: (id) =>
    request<DmAttempt>("/auto-dm/attempts/" + id + "/reject", {
      method: "POST",
    }),
};
export const outreachFor = (mode: DataMode): OutreachSource =>
  mode === "demo" ? demoOutreach : liveOutreach;
