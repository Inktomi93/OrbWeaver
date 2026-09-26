// The Diagnostics tier's ACCOUNT checks (inference program §5.3a): which rows the credit balance and the
// sign-in check apply to, and the words each result is shown in. Both predicates read the provider row the
// way the server's diagnostic dispatch does, so the pane never offers a check whose only answer is a refusal.

import type { ProviderDef } from "@orb/contracts/inference";
import type { AccountCredits, VerifyAuthResult } from "@orb/contracts/providers";
import { formatUsd } from "@orb/kit/strings";

/** The balance is OpenRouter's `/credits` read; every other row refuses it (`requireOpenRouter` in the
 *  openai-compat diagnostics). */
export function servesAccountCredits(provider: Pick<ProviderDef, "dialect">): boolean {
  return provider.dialect === "openrouter";
}

/** The sign-in check is a one-word turn only the agent-sdk backend implements (`verifyAuth`). */
export function servesSignInCheck(provider: Pick<ProviderDef, "wire">): boolean {
  return provider.wire === "agent-sdk";
}

/** `$4.20 left · $5.80 used of $10.00` — what is left leads, because that is the number a user acts on. */
export function creditsLine(credits: AccountCredits): string {
  return `${formatUsd(credits.total - credits.used)} left · ${formatUsd(credits.used)} used of ${formatUsd(credits.total)}`;
}

export interface SignInVerdict {
  readonly ok: boolean;
  readonly title: string;
  /** The account behind the sign-in, or the reply that did not match; `null` when there is neither. */
  readonly detail: string | null;
}

/** One reading of a sign-in check, shared by the save-time notice and the editor's Diagnostics block. */
export function signInVerdict(result: VerifyAuthResult): SignInVerdict {
  if (!result.ok) {
    return {
      ok: false,
      title: "The Claude sign-in check didn't pass.",
      detail: result.reply === "" ? null : `It answered "${result.reply}" instead of the expected reply.`,
    };
  }
  const account = result.account;
  const parts = [account?.email, account?.organization, account?.subscriptionType].filter((part): part is string => part !== undefined && part !== "");
  return { ok: true, title: "Signed in to the Claude subscription.", detail: parts.length === 0 ? null : parts.join(" · ") };
}
