import type { Intent, Message, Post, PostDetail } from "../../api/types";
import { isAudienceComment } from "../analytics/model.ts";
export interface InsightEvidence {
  message: Message;
  post: Post;
}
export interface ProductInsight {
  id: string;
  title: string;
  intent: Intent;
  evidence: InsightEvidence[];
  posts: number;
  channels: string[];
  review: number;
}
// Topic labels describe evidence, not AI-generated recommendations. Unknown subjects
// retain the original comment as their heading rather than inventing a summary.
const topics: [string, RegExp][] = [
  ["Android availability", /\bandroid\b/],
  ["iOS availability", /\b(ios|iphone|ipad)\b/],
  ["Offline access", /\boffline\b|hors.ligne/],
  ["Exports and reports", /\b(export\w*|download\w*|telecharg\w*)\b/],
  [
    "Login and account access",
    /\b(log.?in|sign.?in|password|connexion|connecter|mot de passe)\b/,
  ],
  ["Saving progress", /\b(sav(e|es|ed|ing)|sauvegard\w*|enregistr\w*)\b/],
  ["Microphone and audio", /\b(microphone|micro|audio|sound|son)\b/],
  [
    "Pricing and value",
    /\b(price|pricing|cost|expensive|afford\w*|prix|tarif\w*|cher|chere|cout)\b/,
  ],
  [
    "Plans and what’s included",
    /\b(plan|included|includes|inclus\w*|abonnement)\b/,
  ],
  ["Accent recognition", /\baccent\w*\b/],
  ["Sales use cases", /\bsales\b|\bcommercial\w*\b/],
  ["Beginner accessibility", /\b(beginner\w*|debutant\w*)\b/],
  ["Session length", /how long|\bduration\b|combien de temps|\bduree\b/],
  ["Product examples", /\b(example\w*|exemple\w*|demonstration|demo)\b/],
  [
    "Confidence and progress",
    /\b(confident|confidence|confiance|progress\w*)\b/,
  ],
  [
    "Getting started and trying the product",
    /\b(try|trial|sign.?up|started|essayer|essai|inscri\w*|commencer)\b/,
  ],
];
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function groupProductInsights(details: PostDetail[]): ProductInsight[] {
  const groups = new Map<string, ProductInsight>(),
    seen = new Set<string>();
  for (const detail of details)
    for (const message of detail.comments) {
      const intent = message.classification?.intent;
      if (
        !isAudienceComment(message) ||
        !intent ||
        intent === "neutral_spam" ||
        !message.text.trim()
      )
        continue;
      const messageKey = message.account_id + ":" + message.id;
      if (seen.has(messageKey)) continue;
      seen.add(messageKey);
      const text = normalize(message.text);
      const topic = topics.find(([, pattern]) => pattern.test(text));
      const id = intent + ":" + (topic?.[0] ?? text);
      const group = groups.get(id) ?? {
        id,
        title: topic?.[0] ?? message.text.trim(),
        intent,
        evidence: [],
        posts: 0,
        channels: [],
        review: 0,
      };
      group.evidence.push({ message, post: detail.post });
      groups.set(id, group);
    }
  for (const group of groups.values()) {
    group.posts = new Set(
      group.evidence.map((e) => e.post.account_id + ":" + e.post.id),
    ).size;
    group.channels = [
      ...new Set(group.evidence.map((e) => e.post.platform)),
    ].sort();
    group.review = group.evidence.filter(
      (e) => e.message.classification?.needs_review,
    ).length;
  }
  return [...groups.values()].sort(
    (a, b) => b.evidence.length - a.evidence.length || a.id.localeCompare(b.id),
  );
}
