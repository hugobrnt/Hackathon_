import { readDemoReplies } from "../../api/replies.ts";
import type { OutreachSource } from "../../api/outreach";
import type {
  AutoDmSettings,
  DmAttempt,
  DmDraft,
  DmRun,
  Product,
  TrackedLink,
  OutreachSnapshot,
} from "../../api/outreach-types";
import { readStored, saveStored } from "../../shared/storage.ts";
import {
  allDemoPosts,
  demoAccounts,
  demoPost,
  demoPosts,
} from "./workspace.ts";
import { trackingStats, canApprove } from "../community/model.ts";
import { parseTimestamp } from "../../shared/time.ts";
type State = {
  version: 1;
  product: Product | null;
  rules: Record<number, AutoDmSettings>;
  attempts: DmAttempt[];
  links: TrackedLink[];
};
const key = (account: string) => "signal:demo:outreach:" + account;
const now = () => new Date().toISOString();
const cache = new Map<string, State>();
export function resetDemoOutreach() {
  for (const a of demoAccounts()) {
    cache.delete(a.id);
    saveStored(key(a.id), null);
  }
}
function seed(account: string): State {
  const p = demoPosts(account)[0];
  if (!p) throw new Error("Unknown demo account.");
  const state: State = {
    version: 1,
    product: {
      account_id: account,
      business_type: "saas",
      name: "Lingo",
      landing_url: "https://lingo.example",
      description:
        "Lingo is an AI English coach for interview practice. Practice realistic conversations and receive feedback. Try a free session before choosing a plan.",
      updated_at: now(),
    },
    rules: {
      [p.post.id]: {
        post_id: p.post.id,
        enabled: true,
        require_approval: true,
        landing_url: null,
        updated_at: now(),
      },
    },
    attempts: [],
    links: [],
  };
  for (let i = 0; i < 6; i++) {
    const m = p.comments[i],
      code = "demo-" + m.id,
      url = "https://signal.example/r/" + code;
    const status = (
      [
        "pending_approval",
        "sent",
        "sent",
        "failed",
        "skipped",
        "rejected",
      ] as const
    )[i];
    state.attempts.push({
      id: m.id,
      message_id: m.id,
      account_id: account,
      post_id: p.post.id,
      recipient_id: m.author_id,
      recipient_name: m.author_name,
      intent: m.classification!.intent,
      status,
      reason:
        status === "failed"
          ? "Rate limit reached. This message can be retried."
          : status === "skipped"
            ? "The person was already contacted on this post."
            : status === "pending_approval"
              ? "Human approval is required."
              : null,
      text:
        status === "skipped"
          ? ""
          : "Hi " +
            m.author_name +
            "! Try a free interview practice session with Lingo: " +
            url,
      writer: "demo-template",
      zernio_message_id: status === "sent" ? "demo-sent-" + m.id : null,
      tracked_link_code: status === "skipped" ? null : code,
      tracked_url: status === "skipped" ? null : url,
      link_clicks: i === 1 ? 2 : 0,
      retryable: status === "failed",
      comment_time: m.created_time,
      created_at: now(),
      sent_at: status === "sent" ? now() : null,
      latency_seconds: status === "sent" ? 42 : null,
    });
    if (status !== "skipped")
      state.links.push({
        code,
        short_url: url,
        account_id: account,
        post_id: p.post.id,
        message_id: m.id,
        recipient_id: m.author_id,
        intent: m.classification!.intent,
        destination_url:
          "https://lingo.example/?utm_source=" +
          p.post.platform +
          "&utm_medium=dm&utm_campaign=auto_dm&utm_content=post_" +
          p.post.external_id,
        click_count: i === 1 ? 2 : 0,
        bot_hits: i === 1 ? 1 : 0,
        first_clicked_at: i === 1 ? now() : null,
        last_clicked_at: i === 1 ? now() : null,
        created_at: now(),
      });
  }
  return state;
}
function stateFor(account: string): State {
  if (!demoAccounts().some((a) => a.id === account))
    throw new Error("Unknown demo account.");
  if (!cache.has(account)) {
    const saved = readStored<State | null>(key(account), null);
    cache.set(
      account,
      saved?.version === 1 &&
        Array.isArray(saved.attempts) &&
        Array.isArray(saved.links) &&
        saved.rules
        ? saved
        : seed(account),
    );
  }
  return cache.get(account)!;
}
function persist(account: string) {
  saveStored(key(account), stateFor(account));
}
function findAttempt(id: number) {
  for (const a of demoAccounts()) {
    const state = stateFor(a.id),
      attempt = state.attempts.find((x) => x.id === id);
    if (attempt) return { state, attempt, account: a.id };
  }
  throw new Error("DM not found.");
}
function draft(messageId: number): DmDraft {
  const p = allDemoPosts().find((p) =>
    p.comments.some((m) => m.id === messageId),
  );
  if (!p) throw new Error("Comment not found.");
  const m = p.comments.find((m) => m.id === messageId)!,
    s = stateFor(p.post.account_id);
  if (!s.product) throw new Error("Save your product first.");
  const code = "demo-" + m.id,
    url = "https://signal.example/r/" + code;
  if (!s.links.some((l) => l.message_id === m.id)) {
    const dest = new URL(
      s.rules[p.post.id]?.landing_url || s.product.landing_url,
    );
    for (const [k, v] of Object.entries({
      utm_source: p.post.platform,
      utm_medium: "dm",
      utm_campaign: "auto_dm",
      utm_content: "post_" + p.post.external_id,
    }))
      dest.searchParams.set(k, v);
    s.links.push({
      code,
      short_url: url,
      account_id: p.post.account_id,
      post_id: p.post.id,
      message_id: m.id,
      recipient_id: m.author_id,
      intent: m.classification?.intent ?? null,
      destination_url: dest.href,
      click_count: 0,
      bot_hits: 0,
      first_clicked_at: null,
      last_clicked_at: null,
      created_at: now(),
    });
  }
  persist(p.post.account_id);
  const preferences = readDemoReplies(p.post.account_id);
  const greeting = preferences.tone === "professional" ? "Hello" : "Hi";
  const action =
    preferences.goal === "trial"
      ? "Explore trial options on the product page."
      : preferences.goal === "demo"
        ? "Explore demo options on the product page."
        : "Learn more on the product page.";
  const text =
    preferences.tone === "concise"
      ? `${s.product.name}: ${action} ${url}`
      : `${greeting} ${(m.author_name ?? "there").replace(/[.!]+$/, "")}. ${s.product.description.slice(0, 180)} ${action} ${url}`;
  return {
    text,
    writer: "demo-template",
    tracked_link_code: code,
    tracked_url: url,
  };
}
export const demoOutreach: OutreachSource = {
  async product(account) {
    return structuredClone(stateFor(account).product);
  },
  async load(account): Promise<OutreachSnapshot> {
    const s = stateFor(account);
    return structuredClone({
      product: s.product,
      attempts: s.attempts.map((a) => ({
        ...a,
        link_clicks:
          s.links.find((l) => l.message_id === a.message_id)?.click_count ?? 0,
      })),
      links: s.links,
      stats: trackingStats(s.attempts, s.links),
    });
  },
  async saveProduct(account, input) {
    const s = stateFor(account);
    s.product = { ...input, account_id: account, updated_at: now() };
    persist(account);
    return structuredClone(s.product);
  },
  async settings(id) {
    const p = demoPost(id),
      s = stateFor(p.post.account_id);
    return structuredClone(
      s.rules[id] ?? {
        post_id: id,
        enabled: false,
        require_approval: true,
        landing_url: null,
        updated_at: now(),
      },
    );
  },
  async saveSettings(id, input) {
    const p = demoPost(id),
      s = stateFor(p.post.account_id);
    if (input.enabled && !s.product)
      throw new Error("Save your product first.");
    s.rules[id] = { ...input, post_id: id, updated_at: now() };
    persist(p.post.account_id);
    return structuredClone(s.rules[id]);
  },
  async preview(id) {
    return draft(id);
  },
  async run(id) {
    const p = demoPost(id),
      account = p.post.account_id,
      s = stateFor(account),
      rule = s.rules[id];
    if (!rule?.enabled) throw new Error("Enable Auto-DM for this post first.");
    const result: DmRun = {
      processed: 0,
      sent: 0,
      pending_approval: 0,
      failed: 0,
      skipped: 0,
      attempts: [],
    };
    for (const m of p.comments) {
      if (
        m.kind !== "comment" ||
        m.author_is_owner ||
        m.direction !== "incoming" ||
        !m.classification ||
        !["purchase_intent", "pre_purchase_question", "objection"].includes(
          m.classification.intent,
        ) ||
        s.attempts.some((a) => a.message_id === m.id)
      )
        continue;
      const old =
        Number.isFinite(parseTimestamp(m.created_time)) &&
        Date.now() - parseTimestamp(m.created_time) > 7 * 86400000;
      const duplicate = s.attempts.some(
        (a) =>
          a.post_id === id &&
          a.recipient_id === m.author_id &&
          ["sent", "sending", "pending_approval"].includes(a.status),
      );
      const skip = old || duplicate || !m.author_id;
      const status = skip
        ? "skipped"
        : readDemoReplies(p.post.account_id)
              .escalation_topics.split(",")
              .some(
                (t) =>
                  t.trim() &&
                  m.text.toLowerCase().includes(t.trim().toLowerCase()),
              ) ||
            rule.require_approval ||
            m.classification.needs_review ||
            m.classification.sentiment === "negative"
          ? "pending_approval"
          : "sent";
      const d = skip
        ? { text: "", writer: "", tracked_link_code: null, tracked_url: null }
        : draft(m.id);
      const attempt: DmAttempt = {
        id: m.id,
        message_id: m.id,
        account_id: account,
        post_id: id,
        recipient_id: m.author_id,
        recipient_name: m.author_name,
        intent: m.classification.intent,
        status,
        reason: old
          ? "Comment is older than 7 days."
          : duplicate
            ? "Already contacted on this post."
            : status === "pending_approval"
              ? "Human approval is required."
              : null,
        ...d,
        zernio_message_id: status === "sent" ? "demo-sent-" + m.id : null,
        link_clicks: 0,
        retryable: false,
        comment_time: m.created_time,
        created_at: now(),
        sent_at: status === "sent" ? now() : null,
        latency_seconds: status === "sent" ? 45 : null,
      };
      s.attempts.unshift(attempt);
      result.processed++;
      result[status]++;
      result.attempts.push(structuredClone(attempt));
    }
    persist(account);
    return result;
  },
  async approve(id, text) {
    const { attempt, account } = findAttempt(id);
    if (!canApprove(attempt))
      throw new Error("This DM cannot be sent in its current status.");
    if (!text.trim() || text.length > 1000)
      throw new Error("Use 1–1,000 characters.");
    attempt.text = text.trim();
    attempt.status = "sent";
    attempt.reason = null;
    attempt.retryable = false;
    attempt.writer = "human";
    attempt.sent_at = now();
    attempt.zernio_message_id = "demo-sent-" + id;
    persist(account);
    return structuredClone(attempt);
  },
  async reject(id) {
    const { attempt, account } = findAttempt(id);
    if (attempt.status !== "pending_approval")
      throw new Error("Only pending messages can be rejected.");
    attempt.status = "rejected";
    persist(account);
    return structuredClone(attempt);
  },
};
export function simulateClick(id: number) {
  const { state, attempt, account } = findAttempt(id);
  if (attempt.status !== "sent") throw new Error("Send the demo DM first.");
  const link = state.links.find((l) => l.message_id === attempt.message_id);
  if (!link) throw new Error("No tracked link for this DM.");
  link.click_count++;
  link.first_clicked_at ??= now();
  link.last_clicked_at = now();
  persist(account);
}
