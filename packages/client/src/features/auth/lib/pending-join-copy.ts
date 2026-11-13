// The line the pending-join card shows when a confirm is refused.

import type { PendingJoinErrorCode } from "@orb/contracts/chat";
import { DEAD_INVITE_SENTENCE } from "#lib";

/** The copy for a confirm refusal. Exhaustive: a new wire code fails `tsc` here. */
export function pendingJoinRefusalCopy(code: PendingJoinErrorCode | null, providerName: string): string {
  switch (code) {
    case null:
    case "invalid_request":
      return "Joining didn't go through. Try again in a minute.";
    case "already_signed_in":
      return "You're already signed in. Open the invite link again from the app.";
    case "join_unavailable":
      return `${DEAD_INVITE_SENTENCE} Or continue with ${providerName}.`;
    case "account_exists":
      return `An account already exists for this identity. Continue with ${providerName} to sign in.`;
    default: {
      const exhaustive: never = code;
      return String(exhaustive);
    }
  }
}
