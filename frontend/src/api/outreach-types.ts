import type { Intent } from "./types";
export type DmStatus =
  | "pending_approval"
  | "sending"
  | "sent"
  | "failed"
  | "skipped"
  | "rejected";
export interface ProductInput {
  business_type: "saas" | "ecommerce";
  name: string;
  landing_url: string;
  description: string;
}
export interface Product extends ProductInput {
  account_id: string;
  updated_at: string;
}
export interface AutoDmInput {
  enabled: boolean;
  landing_url?: string | null;
  product_id?: number | null;
  public_reply?: boolean;
  require_approval: boolean;
}
export interface AutoDmSettings extends AutoDmInput {
  post_id: number;
  updated_at: string;
}
export interface DmDraft {
  product_id?: number | null;
  product_title?: string | null;
  text: string;
  writer: string;
  tracked_link_code: string | null;
  tracked_url: string | null;
}
export interface DmAttempt {
  product_id?: number | null;
  product_title?: string | null;
  id: number;
  message_id: number;
  account_id: string;
  post_id: number;
  recipient_id: string | null;
  recipient_name: string | null;
  intent: Intent;
  status: DmStatus;
  reason: string | null;
  text: string;
  writer: string;
  zernio_message_id: string | null;
  tracked_link_code: string | null;
  tracked_url: string | null;
  link_clicks: number;
  retryable: boolean;
  comment_time: string | null;
  created_at: string;
  sent_at: string | null;
  latency_seconds: number | null;
}
export interface DmRun {
  processed: number;
  sent: number;
  pending_approval: number;
  skipped: number;
  failed: number;
  attempts: DmAttempt[];
}
export interface TrackedLink {
  code: string;
  short_url: string;
  account_id: string;
  post_id: number;
  message_id: number;
  recipient_id: string | null;
  intent: string | null;
  destination_url: string;
  click_count: number;
  bot_hits: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  created_at: string;
}
export interface PostClickStats {
  post_id: number;
  dms_sent: number;
  links_clicked: number;
  clicks: number;
  click_through_rate: number;
}
export interface TrackingStats {
  dms_sent: number;
  links_clicked: number;
  clicks: number;
  click_through_rate: number;
  posts: PostClickStats[];
}
export interface OutreachSnapshot {
  attempts: DmAttempt[];
  product: Product | null;
  links: TrackedLink[];
  stats: TrackingStats;
}
