const messages: Record<string, string> = {
  personal_account_not_supported: "Instagram requires a Business or Creator account. Switch your account type in Instagram, then try again.",
  oauth_denied: "Instagram authorization was declined or cancelled. Try again and accept the requested permissions.",
  access_denied: "Authorization was denied. Check your account permissions, then try again.",
  no_facebook_pages: "No linked Facebook Page was available. Use Instagram directly, or link your professional Instagram account to a Page you manage.",
  expired_connection: "This connection attempt expired. Start a new connection from Signal.",
  code_already_redeemed: "This authorization has already been processed. Check connected accounts before trying again.",
};

export function connectionErrorMessage(params: URLSearchParams): string {
  const code = params.get("error") ?? "connection_failed";
  const message = params.get("error_message")?.trim() || messages[code] || "Account connection failed. Retry or use the connection options below.";
  const details = [code, params.get("stage"), params.get("request_id")].filter(Boolean);
  return `${message} (${details.join(" · ")})`;
}
