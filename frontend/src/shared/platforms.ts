export const SOCIAL_PLATFORMS = [
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["twitter", "X"],
  ["youtube", "YouTube"],
  ["pinterest", "Pinterest"],
  ["reddit", "Reddit"],
  ["threads", "Threads"],
  ["bluesky", "Bluesky"],
  ["googlebusiness", "Google Business Profile"],
  ["snapchat", "Snapchat"],
] as const;

/** Channels enabled in Signal; the Zernio catalog alone does not enable a channel. */
export const canConnectPlatform = (platform: string): boolean => platform === "instagram";
