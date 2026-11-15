import type { Intent, Sentiment } from "../../api/types";

/** Display order: the strongest business signal first. */
export const INTENT_ORDER: Intent[] = [
  "purchase_intent",
  "pre_purchase_question",
  "objection",
  "feature_request",
  "testimonial",
  "support_complaint",
  "neutral_spam",
];

export const INTENT_LABELS: Record<Intent, string> = {
  purchase_intent: "Achat",
  pre_purchase_question: "Question pré-achat",
  objection: "Objection",
  feature_request: "Demande de feature",
  testimonial: "Témoignage",
  support_complaint: "Support / plainte",
  neutral_spam: "Neutre / spam",
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Positif",
  neutral: "Neutre",
  negative: "Négatif",
};
