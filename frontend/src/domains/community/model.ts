import type {
  DmAttempt,
  DmStatus,
  TrackedLink,
  TrackingStats,
} from "../../api/outreach-types";
export const statusLabels: Record<DmStatus, string> = {
  pending_approval: "Needs approval",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  rejected: "Rejected",
};
export const canApprove = (a: DmAttempt) =>
  a.status === "pending_approval" || (a.status === "failed" && a.retryable);
export function trackingStats(
  attempts: DmAttempt[],
  links: TrackedLink[],
): TrackingStats {
  const grouped = new Map<
    number,
    {
      post_id: number;
      dms_sent: number;
      links_clicked: number;
      clicks: number;
      click_through_rate: number;
    }
  >();
  for (const a of attempts.filter((a) => a.status === "sent")) {
    const p = grouped.get(a.post_id) ?? {
      post_id: a.post_id,
      dms_sent: 0,
      links_clicked: 0,
      clicks: 0,
      click_through_rate: 0,
    };
    const clicks =
      links.find((l) => l.message_id === a.message_id)?.click_count ?? 0;
    p.dms_sent++;
    p.links_clicked += Number(clicks > 0);
    p.clicks += clicks;
    p.click_through_rate =
      Math.round((p.links_clicked / p.dms_sent) * 10000) / 10000;
    grouped.set(a.post_id, p);
  }
  const posts = [...grouped.values()].sort(
    (a, b) =>
      b.click_through_rate - a.click_through_rate || b.dms_sent - a.dms_sent,
  );
  const sum = (k: "dms_sent" | "links_clicked" | "clicks") =>
    posts.reduce((s, p) => s + p[k], 0);
  return {
    dms_sent: sum("dms_sent"),
    links_clicked: sum("links_clicked"),
    clicks: sum("clicks"),
    click_through_rate: sum("dms_sent")
      ? Math.round((sum("links_clicked") / sum("dms_sent")) * 10000) / 10000
      : 0,
    posts,
  };
}
