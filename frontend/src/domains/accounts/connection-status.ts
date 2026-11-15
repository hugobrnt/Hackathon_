import type { SocialAccount } from "../../api/types";

export function needsReconnection(account: SocialAccount): boolean {
  return !account.is_demo && (account.is_active === false || account.needs_reconnection === true);
}
