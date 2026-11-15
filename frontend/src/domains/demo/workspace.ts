import { demoProductMatch } from "../products/demo-catalog.ts";
import { demoAccount, demoDetails } from "./data.ts";
import { readStored, saveStored } from "../../shared/storage.ts";
import type { PostDetail, SocialAccount } from "../../api/types";
import { SOCIAL_PLATFORMS } from "../../shared/platforms.ts";
export const demoChannels = SOCIAL_PLATFORMS;
const CONFIG_KEY = "signal:demo:channels";
export function demoAccounts(): SocialAccount[] {
  const raw = readStored<unknown>(CONFIG_KEY, ["instagram"]);
  const selected = Array.isArray(raw)
    ? demoChannels.filter(([id]) => raw.includes(id))
    : demoChannels.slice(0, 1);
  return (selected.length ? selected : demoChannels.slice(0, 1)).map(
    ([platform]) => ({
      ...demoAccount,
      platform,
      id:
        platform === "instagram"
          ? demoAccount.id
          : "signal-offline-" + platform,
      username: platform === "instagram" ? "lingo.app" : "lingo-" + platform,
    }),
  );
}
export function configureDemo(channels: string[]) {
  saveStored(CONFIG_KEY, channels);
}
export function demoPosts(account: string): PostDetail[] {
  const a = demoAccounts().find((a) => a.id === account);
  if (!a) return [];
  const offset = demoChannels.findIndex(([p]) => p === a.platform) * 100000;
  return structuredClone(demoDetails).map((d) => ({
    ...d,
    post: {
      ...d.post,
      id: d.post.id + offset,
      account_id: a.id,
      platform: a.platform,
    },
    comments: d.comments.map((m) => ({
      ...m,
      id: m.id + offset,
      post_id: d.post.id + offset,
      account_id: a.id,
      classification: m.classification
        ? {
            ...m.classification,
            ...demoProductMatch(a.id, m.text, d.post.caption),
          }
        : null,
    })),
    key_comments: d.key_comments.map((m) => ({
      ...m,
      id: m.id + offset,
      post_id: d.post.id + offset,
      account_id: a.id,
      classification: m.classification
        ? {
            ...m.classification,
            ...demoProductMatch(a.id, m.text, d.post.caption),
          }
        : null,
    })),
  }));
}
export function allDemoPosts() {
  return demoAccounts().flatMap((a) => demoPosts(a.id));
}
export function demoPost(id: number) {
  const p = allDemoPosts().find((p) => p.post.id === id);
  if (!p) throw new Error("Demo post not found.");
  return p;
}
