import { parseTimestamp } from "../../shared/time.ts";
import type {
  Intent,
  Message,
  PostDetail,
  PostIntentStats,
  PostSortKey,
} from "../../api/types";
export const INTENTS: Intent[] = [
  "purchase_intent",
  "pre_purchase_question",
  "objection",
  "feature_request",
  "testimonial",
  "support_complaint",
  "neutral_spam",
];
export const intentLabels: Record<Intent, string> = {
  purchase_intent: "Purchase intent",
  pre_purchase_question: "Pre-purchase question",
  objection: "Objection",
  feature_request: "Feature request",
  testimonial: "Praise",
  support_complaint: "Problem / support",
  neutral_spam: "Neutral / spam",
};
export const intentActions: Record<Intent, string> = {
  purchase_intent: "Review the request",
  pre_purchase_question: "Clarify the offer",
  objection: "Address the concern",
  feature_request: "Investigate the need",
  testimonial: "Learn what works",
  support_complaint: "Follow up personally",
  neutral_spam: "No action needed",
};
export const PIR_DEFINITION =
  "Purchase-intent comments ÷ all imported incoming audience comments. Includes unclassified and neutral/spam comments; excludes brand replies and DMs. An inferred signal, not a sale.";
export const isAudienceComment = (m: Message) =>
  m.kind === "comment" && m.direction === "incoming" && !m.author_is_owner;
const ratio = (a: number, b: number) =>
  b ? Math.round((a / b) * 10000) / 10000 : 0;
/** Same denominator, taxonomy and weighting as backend analytics/service.py. */
export function summarize(
  post: PostIntentStats["post"],
  messages: Message[],
): PostDetail {
  const audience = messages.filter(isAudienceComment),
    counts = Object.fromEntries(INTENTS.map((i) => [i, 0])) as Record<
      Intent,
      number
    >,
    sentiments = { positive: 0, neutral: 0, negative: 0 };
  let classified = 0,
    review = 0;
  for (const m of audience)
    if (m.classification) {
      counts[m.classification.intent]++;
      sentiments[m.classification.sentiment]++;
      classified++;
      review += Number(m.classification.needs_review);
    }
  const total = audience.length;
  const priorities: Partial<Record<Intent, number>> = {
    purchase_intent: 0,
    pre_purchase_question: 1,
    objection: 2,
    support_complaint: 3,
  };
  const key = audience
    .filter(
      (m) =>
        m.classification && priorities[m.classification.intent] !== undefined,
    )
    .sort(
      (a, b) =>
        priorities[a.classification!.intent]! -
          priorities[b.classification!.intent]! ||
        b.classification!.confidence - a.classification!.confidence,
    )
    .slice(0, 5);
  return {
    post,
    total_comments: total,
    classified_comments: classified,
    unclassified_comments: total - classified,
    intent_counts: counts,
    sentiment_counts: sentiments,
    purchase_intent_rate: ratio(counts.purchase_intent, total),
    buying_signal_rate: ratio(
      counts.purchase_intent + counts.pre_purchase_question,
      total,
    ),
    intent_score: ratio(
      counts.purchase_intent * 3 +
        counts.pre_purchase_question * 2 +
        counts.objection,
      total,
    ),
    needs_review: review,
    rank: 0,
    comments: messages,
    key_comments: key,
  };
}
export function sortPosts(
  posts: PostIntentStats[],
  key: PostSortKey,
  minimum = 0,
): PostIntentStats[] {
  const value = (p: PostIntentStats): number[] => {
    if (key === "intent_score" || key === "purchase_intent_rate")
      return [p[key], p.intent_counts.purchase_intent, p.total_comments];
    if (key === "buying_signal_rate")
      return [p.buying_signal_rate, p.intent_score, p.total_comments];
    if (key === "recent")
      return [parseTimestamp(p.post.created_time) || -62135596800000];
    return [
      {
        comments: p.total_comments,
        likes: p.post.like_count,
        views: p.post.view_count ?? 0,
        shares: p.post.share_count ?? 0,
      }[key],
      p.intent_score,
    ];
  };
  return [...posts]
    .filter((p) => p.total_comments >= minimum)
    .sort((a, b) => {
      const av = value(a),
        bv = value(b);
      for (let i = 0; i < av.length; i++) {
        if (av[i] !== bv[i]) return bv[i] - av[i];
      }
      return 0;
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));
}
export function sumAvailable(values: (number | null)[]): number | null {
  return values.some((v) => v !== null)
    ? values.reduce<number>((n, v) => n + (v ?? 0), 0)
    : null;
}
export function aggregate(posts: PostIntentStats[]) {
  const total = posts.reduce((n, p) => n + p.total_comments, 0),
    intents = Object.fromEntries(
      INTENTS.map((i) => [
        i,
        posts.reduce((n, p) => n + p.intent_counts[i], 0),
      ]),
    ) as Record<Intent, number>;
  return {
    total,
    intents,
    rate: total ? intents.purchase_intent / total : null,
    classified: posts.reduce((n, p) => n + p.classified_comments, 0),
    review: posts.reduce((n, p) => n + p.needs_review, 0),
    views: sumAvailable(posts.map((p) => p.post.view_count)),
    shares: sumAvailable(posts.map((p) => p.post.share_count)),
    likes: posts.reduce((n, p) => n + p.post.like_count, 0),
  };
}
/** Buckets are full UTC days and use comment timestamps, not post lifetime metrics. */
export function intentTimeline(
  messages: Message[],
  now = new Date(),
  weeks = 8,
) {
  const end = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
    week = 7 * 86400000;
  return Array.from({ length: weeks }, (_, i) => {
    const start = end - (weeks - i) * week,
      stop = start + week;
    const relevant = messages.filter(
      (m) =>
        isAudienceComment(m) &&
        m.created_time &&
        parseTimestamp(m.created_time) >= start &&
        parseTimestamp(m.created_time) < stop,
    );
    const count = relevant.filter(
      (m) => m.classification?.intent === "purchase_intent",
    ).length;
    return {
      start,
      end: stop,
      count,
      total: relevant.length,
      rate: relevant.length ? count / relevant.length : null,
    };
  });
}
export function periodRate(buckets: ReturnType<typeof intentTimeline>) {
  const total = buckets.reduce((n, b) => n + b.total, 0),
    count = buckets.reduce((n, b) => n + b.count, 0);
  return { total, count, rate: total ? count / total : null };
}
