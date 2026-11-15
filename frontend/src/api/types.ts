// Types of the FastAPI responses (see http://localhost:8000/docs).

export type Intent =
  | "purchase_intent"
  | "pre_purchase_question"
  | "objection"
  | "feature_request"
  | "testimonial"
  | "support_complaint"
  | "neutral_spam";

export type Sentiment = "positive" | "neutral" | "negative";

export interface SocialAccount {
  id: string;
  platform: string;
  username: string | null;
  profile_id: string | null;
  is_demo: boolean;
  connected_at: string;
  last_imported_at: string | null;
}

export interface Post {
  id: number;
  external_id: string;
  account_id: string;
  platform: string;
  caption: string;
  permalink: string | null;
  picture: string | null;
  media_type: string | null;
  created_time: string | null;
  comment_count: number;
  like_count: number;
  view_count: number | null;
  share_count: number | null;
  repost_count: number | null;
  metrics_updated_at: string | null;
}

export interface Classification {
  intent: Intent;
  sentiment: Sentiment;
  confidence: number;
  rationale: string;
  model: string;
  needs_review: boolean;
  classified_at: string;
}

export interface Message {
  id: number;
  external_id: string;
  account_id: string;
  kind: "comment" | "dm";
  post_id: number | null;
  conversation_id: string | null;
  parent_external_id: string | null;
  author_id: string | null;
  author_name: string | null;
  author_is_owner: boolean;
  direction: "incoming" | "outgoing";
  text: string;
  created_time: string | null;
  classification: Classification | null;
}

export interface PostIntentStats {
  post: Post;
  total_comments: number;
  classified_comments: number;
  unclassified_comments: number;
  intent_counts: Record<Intent, number>;
  sentiment_counts: Record<Sentiment, number>;
  purchase_intent_rate: number;
  buying_signal_rate: number;
  intent_score: number;
  needs_review: number;
  rank: number;
}

export interface PostDetail extends PostIntentStats {
  key_comments: Message[];
  comments: Message[];
}

export type PostSortKey =
  | "intent_score"
  | "purchase_intent_rate"
  | "buying_signal_rate"
  | "comments"
  | "likes"
  | "views"
  | "shares"
  | "recent";

export interface ImportResult {
  account_id: string;
  posts: number;
  comments: number;
  conversations: number;
  dms: number;
  metrics: number;
  new_messages: number;
  errors: string[];
}

export interface ClassificationRunResult {
  classified: number;
  escalated: number;
  fallback: number;
  failed: number;
  by_intent: Partial<Record<Intent, number>>;
}
