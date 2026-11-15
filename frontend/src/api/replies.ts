import { request } from "./client.ts";
import type { DataMode } from "./source";
import { readStored, saveStored } from "../shared/storage.ts";
export interface ReplyPreferences {
  tone: "friendly" | "professional" | "concise";
  goal: "product_visit" | "trial" | "demo";
  escalation_topics: string;
}
export const defaultReplies: ReplyPreferences = {
  tone: "friendly",
  goal: "product_visit",
  escalation_topics: "",
};
export const readDemoReplies = (account: string): ReplyPreferences =>
  readStored("signal:demo:replies:" + account, { ...defaultReplies });
export async function loadReplies(
  mode: DataMode,
  account: string,
  signal?: AbortSignal,
): Promise<ReplyPreferences> {
  if (mode === "demo") return readDemoReplies(account);
  return request(
    "/accounts/" + encodeURIComponent(account) + "/reply-settings",
    { signal },
  );
}
export async function saveReplies(
  mode: DataMode,
  account: string,
  input: ReplyPreferences,
): Promise<void> {
  if (mode === "demo") {
    if (!saveStored("signal:demo:replies:" + account, input))
      throw new Error("Your settings could not be saved.");
    return;
  }
  await request(
    "/accounts/" + encodeURIComponent(account) + "/reply-settings",
    { method: "PUT", body: JSON.stringify(input) },
  );
}
