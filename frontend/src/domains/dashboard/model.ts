import type { PostDetail, Message } from "../../api/types";
import { isAudienceComment, summarize } from "../analytics/model.ts";
import { parseTimestamp } from "../../shared/time.ts";
export function dateWindow(start: string, end: string) {
  const from = Date.parse(start + "T00:00:00Z"),
    to = Date.parse(end + "T00:00:00Z") + 86400000;
  return {
    from,
    to,
    valid: Number.isFinite(from) && Number.isFinite(to) && from < to,
  };
}
export function commentsInWindow(
  messages: Message[],
  from: number,
  to: number,
) {
  return messages.filter(
    (m) =>
      isAudienceComment(m) &&
      parseTimestamp(m.created_time) >= from &&
      parseTimestamp(m.created_time) < to,
  );
}
export function scopeDetails(details: PostDetail[], from: number, to: number) {
  return details.map((d) =>
    summarize(d.post, commentsInWindow(d.comments, from, to)),
  );
}
export function weeklyBuckets(messages: Message[], from: number, to: number) {
  const size = Math.max(
    86400000,
    Math.ceil((to - from) / 4 / 86400000) * 86400000,
  );
  const buckets = [];
  for (let start = from; start < to; start += size) {
    const end = Math.min(start + size, to),
      rows = commentsInWindow(messages, start, end),
      intent = rows.filter(
        (m) => m.classification?.intent === "purchase_intent",
      ).length;
    buckets.push({
      start,
      end,
      total: rows.length,
      intent,
      rate: rows.length ? intent / rows.length : null,
    });
  }
  return buckets;
}
