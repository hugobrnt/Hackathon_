import type {
  Intent,
  Message,
  PostDetail,
  SocialAccount,
} from "../../api/types";
import { INTENTS, summarize } from "../analytics/model.ts";
export const DEMO_ACCOUNT = "signal-offline-demo";
const now = new Date();
export const DEMO_AS_OF = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
).toISOString();
const ago = (days: number, hours = 0) =>
  new Date(
    Date.parse(DEMO_AS_OF) - days * 86400000 + hours * 3600000,
  ).toISOString();
export const demoAccount: SocialAccount = {
  id: DEMO_ACCOUNT,
  username: "lingo.app",
  platform: "instagram",
  profile_id: "local-demo",
  is_demo: true,
  connected_at: ago(60),
  last_imported_at: DEMO_AS_OF,
};
const samples: Record<Intent, string[]> = {
  purchase_intent: [
    "Where can I try this before my interview?",
    "I want to sign up. Can you send me the link?",
    "This is exactly what I need. How do I get started?",
    "I’m ready to try Lingo for my next interview.",
  ],
  pre_purchase_question: [
    "Does it work for a sales interview?",
    "What is included in the plan?",
    "Can I practice at a beginner level?",
    "How long is a typical practice session?",
  ],
  objection: [
    "The price feels high compared with a language app.",
    "I would need to see a complete example first.",
    "I’m not sure an AI coach can understand my accent.",
  ],
  feature_request: [
    "Please add an Android version.",
    "An export of my practice feedback would be useful.",
    "Could you add a sales interview scenario?",
    "I would love an offline practice mode.",
  ],
  testimonial: [
    "The realistic interview example is so useful.",
    "I have been practicing every day. I feel more confident.",
    "Finally, a practical way to prepare.",
  ],
  support_complaint: [
    "I am stuck on the login screen.",
    "My practice session is not saving. Could you help?",
    "The microphone is not working on my phone.",
  ],
  neutral_spam: ["Nice!", "Love the idea 👏", "Interesting.", "Keep going!"],
};
const specs = [
  [
    "Your English interview, without the pressure.",
    3,
    12800,
    710,
    120,
    [12, 13, 5, 7, 7, 2, 4],
    "video",
  ],
  [
    "10 minutes. One real conversation.",
    9,
    8200,
    410,
    86,
    [4, 10, 5, 8, 8, 3, 6],
    "video",
  ],
  [
    "What changes after your first 30 days.",
    14,
    6400,
    290,
    52,
    [3, 7, 4, 3, 8, 2, 5],
    "video",
  ],
  [
    "3 mistakes before your next interview.",
    21,
    4100,
    198,
    46,
    [2, 12, 7, 3, 8, 1, 7],
    "carousel",
  ],
  [
    "When your English disappears in a meeting.",
    30,
    24600,
    860,
    205,
    [1, 8, 6, 4, 14, 3, 46],
    "video",
  ],
  [
    "Meet your new speaking partner.",
    37,
    9200,
    320,
    60,
    [3, 11, 5, 6, 8, 2, 15],
    "image",
  ],
  [
    "Practice at your own pace.",
    44,
    5100,
    201,
    null,
    [2, 6, 4, 5, 7, 1, 15],
    "video",
  ],
  [
    "A better way to prepare.",
    51,
    3600,
    180,
    21,
    [2, 7, 3, 4, 6, 2, 6],
    "carousel",
  ],
] as const;
const names = [
  "Emily R.",
  "Marc D.",
  "Sara J.",
  "Liam K.",
  "Maya P.",
  "Alex B.",
  "Noah T.",
  "Ava L.",
  "James W.",
  "Sofia M.",
];
export function buildDemo(): PostDetail[] {
  return specs.map(
    ([caption, days, views, likes, shares, counts, media], index) => {
      const id = index + 1,
        messages: Message[] = [];
      INTENTS.forEach((intent, ii) => {
        for (let j = 0; j < counts[ii]; j++) {
          const seq = messages.length;
          messages.push({
            id: id * 1000 + seq,
            external_id: "demo-" + id + "-" + seq,
            account_id: DEMO_ACCOUNT,
            kind: "comment",
            post_id: id,
            conversation_id: null,
            parent_external_id: null,
            author_id: "author-" + id + "-" + seq,
            author_name:
              names[seq % names.length] +
              (seq >= names.length
                ? " " + (Math.floor(seq / names.length) + 1)
                : ""),
            author_is_owner: false,
            direction: "incoming",
            text: samples[intent][j % samples[intent].length],
            created_time: ago(days, seq / 4),
            classification: {
              intent,
              sentiment:
                intent === "support_complaint" || intent === "objection"
                  ? "negative"
                  : intent === "testimonial" || intent === "purchase_intent"
                    ? "positive"
                    : "neutral",
              confidence: seq % 19 === 0 ? 0.56 : 0.91,
              rationale:
                "Illustrative classification: " +
                intent.replaceAll("_", " ") +
                ".",
              model: "offline-demo-fixture",
              needs_review: seq % 19 === 0,
              classified_at: DEMO_AS_OF,
            },
          });
        }
      });
      messages.push({
        ...messages[0],
        id: id * 1000 + 900,
        external_id: "demo-owner-" + id,
        author_id: "lingo",
        author_name: "Lingo",
        author_is_owner: true,
        direction: "outgoing",
        parent_external_id: messages[0].external_id,
        text: "Thanks for sharing your question!",
        classification: null,
      });
      return summarize(
        {
          id,
          external_id: "demo-post-" + id,
          account_id: DEMO_ACCOUNT,
          platform: "instagram",
          caption,
          permalink: null,
          picture: index === 0 ? "/assets/interview.png" : null,
          media_type: media,
          created_time: ago(days),
          comment_count: messages.length,
          like_count: likes,
          view_count: views,
          share_count: shares,
          repost_count: index % 2 ? 0 : null,
          metrics_updated_at: DEMO_AS_OF,
        },
        messages,
      );
    },
  );
}
export const demoDetails = buildDemo();
