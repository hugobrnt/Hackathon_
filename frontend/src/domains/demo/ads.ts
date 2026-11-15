import type { AdsSource, AdBoost } from "../../api/ads";
import { totalBudget } from "../../api/ads.ts";
import { demoPost, demoAccounts } from "./workspace.ts";
import { readStored, saveStored } from "../../shared/storage.ts";
const key = (account: string) => "signal:demo:boosts:" + account;
const rows = (account: string) => readStored<AdBoost[]>(key(account), []);
function check(post: number, account: string) {
  if (demoPost(post).post.account_id !== account)
    throw new Error("Demo post does not belong to this channel.");
}
export const demoAds: AdsSource = {
  async accounts(account) {
    if (!demoAccounts().some((a) => a.id === account))
      throw new Error("Unknown demo account.");
    return [
      {
        id: "act_demo_" + account,
        name: "Lingo · Demo ad account",
        currency: "EUR",
        account_status: 1,
      },
    ];
  },
  async history(post, account) {
    check(post, account);
    return rows(account).filter((b) => b.post_id === post);
  },
  async create(post, account, input) {
    check(post, account);
    if (!input.confirm)
      throw new Error("Review and confirm the campaign first.");
    if (input.ad_account_id !== "act_demo_" + account)
      throw new Error("Unknown demo ad account.");
    if (
      !Number.isFinite(input.budget_amount) ||
      input.budget_amount <= 0 ||
      !Number.isInteger(input.duration_days) ||
      input.duration_days < 1 ||
      input.duration_days > 30
    )
      throw new Error("Enter a valid budget and duration.");
    if (totalBudget(input) > 50)
      throw new Error("Demo total budget is capped at 50 EUR.");
    if (input.budget_type === "daily" && input.budget_amount < 1)
      throw new Error("Daily budget must be at least 1.");
    const existing = rows(account),
      id = Math.max(Date.now(), ...existing.map((b) => b.id + 1));
    const { confirm: _confirm, ...fields } = input;
    const b: AdBoost = {
      ...fields,
      id,
      account_id: account,
      post_id: post,
      name: input.name || "Boost – " + demoPost(post).post.caption.slice(0, 40),
      total_budget: totalBudget(input),
      currency: "EUR",
      status: "demo",
      zernio_ad_id: "demo-" + id,
      campaign_id: "demo-campaign-" + id,
      ad_status: input.start_paused ? "PAUSED" : "PENDING_REVIEW",
      review_status: "pending_review",
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_success: true,
    };
    saveStored(key(account), [b, ...existing]);
    return b;
  },
  async refresh(id, post, account) {
    check(post, account);
    const existing = rows(account),
      b = existing.find((b) => b.id === id && b.post_id === post);
    if (!b) throw new Error("Demo boost not found.");
    const next = {
      ...b,
      review_status: "approved",
      ad_status: b.start_paused ? "PAUSED" : "ACTIVE",
      updated_at: new Date().toISOString(),
    };
    saveStored(
      key(account),
      existing.map((b) => (b.id === id ? next : b)),
    );
    return next;
  },
};
