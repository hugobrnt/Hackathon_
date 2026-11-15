import { request } from "./client.ts";
import type { DataMode } from "./source";
import { demoAds } from "../domains/demo/ads.ts";
export type BoostGoal = "engagement" | "awareness" | "video_views";
export interface AdAccount {
  id: string;
  name: string | null;
  currency: string | null;
  account_status: string | number | null;
}
export interface BoostInput {
  ad_account_id: string;
  budget_amount: number;
  budget_type: "daily" | "lifetime";
  duration_days: number;
  goal: BoostGoal;
  name: string | null;
  start_paused: boolean;
  confirm: boolean;
}
export interface AdBoost extends Omit<BoostInput, "confirm"> {
  id: number;
  account_id: string;
  post_id: number;
  name: string;
  total_budget: number;
  currency: string | null;
  status: "requested" | "created" | "failed" | "demo";
  zernio_ad_id: string | null;
  campaign_id: string | null;
  ad_status: string | null;
  review_status: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  is_success: boolean;
}
export function totalBudget(
  input: Pick<BoostInput, "budget_amount" | "budget_type" | "duration_days">,
) {
  return (
    Math.round(
      input.budget_amount *
        (input.budget_type === "daily" ? input.duration_days : 1) *
        100,
    ) / 100
  );
}
export interface AdsSource {
  accounts(account: string, signal?: AbortSignal): Promise<AdAccount[]>;
  history(
    post: number,
    account: string,
    signal?: AbortSignal,
  ): Promise<AdBoost[]>;
  create(post: number, account: string, input: BoostInput): Promise<AdBoost>;
  refresh(id: number, post: number, account: string): Promise<AdBoost>;
}
function validate(boost: AdBoost, post: number, account: string) {
  if (boost.post_id !== post || boost.account_id !== account)
    throw new Error("The boost response does not match this post or account.");
  return boost;
}
export const liveAds: AdsSource = {
  accounts: (account, signal) =>
    request<AdAccount[]>(
      "/ads/accounts?" + new URLSearchParams({ account_id: account }),
      { signal },
    ),
  async history(post, account, signal) {
    return (await request<AdBoost[]>(`/posts/${post}/boosts`, { signal })).map(
      (b) => validate(b, post, account),
    );
  },
  async create(post, account, input) {
    if (!input.confirm)
      throw new Error("Review and confirm the campaign first.");
    return validate(
      await request<AdBoost>(`/posts/${post}/boost`, {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(180000),
      }),
      post,
      account,
    );
  },
  async refresh(id, post, account) {
    const b = validate(
      await request<AdBoost>(`/ads/boosts/${id}/refresh`, { method: "POST" }),
      post,
      account,
    );
    if (b.id !== id) throw new Error("Unexpected boost response.");
    return b;
  },
};
export const adsFor = (mode: DataMode): AdsSource =>
  mode === "demo" ? demoAds : liveAds;
