import { isTRPCClientError } from "@trpc/client";
import type { TrpcReadError } from "#data";
import { trpcErrorReason } from "#lib";
import type { RuleEditorFailure } from "./contract/rule-editor.ts";
import { RULE_NOTICE_COOLDOWN_ERROR } from "./contract/rule-editor.ts";

const SERVER_ERROR_START = 500;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;

/** Domain refusal codes select field copy; unstructured transport failures retain their retry path. */
export function ruleEditorFailure(error: Error | null): RuleEditorFailure | null {
  if (error === null) {
    return null;
  }
  switch (trpcErrorReason(error)) {
    case "automation_rule_cooldown_floor":
      return { field: "cooldownSeconds", message: RULE_NOTICE_COOLDOWN_ERROR, retryable: false };
    case "automation_rule_cooldown_negative":
      return { field: "cooldownSeconds", message: "Cooldown cannot be negative.", retryable: false };
    case "automation_rule_bad_cel":
      return { field: "predicateCel", message: "The condition could not be understood. Check the CEL expression.", retryable: false };
    case "automation_rule_name":
      return { field: "name", message: "Enter a rule name within the allowed length.", retryable: false };
    case "automation_rule_fires_cap":
      return { field: "maxFiresPerHour", message: "Choose a maximum runs per hour within the field's limits.", retryable: false };
    case "automation_rule_unknown_tool":
      return { message: "A selected tool is unavailable to this rule's author. Choose an available tool before saving.", retryable: false };
    case "automation_rule_active_game":
      return { message: "This chat's game directs its own story. Analysis rules cannot be saved while the game is active.", retryable: false };
  }
  const wire: TrpcReadError | null = isTRPCClientError(error) ? error : null;
  const status = wire?.data?.httpStatus;
  const retryable = status === undefined || status >= SERVER_ERROR_START || status === REQUEST_TIMEOUT || status === TOO_MANY_REQUESTS;
  return { message: retryable ? error.message : "The rule was not accepted. Review its fields and your current permissions before editing again.", retryable };
}
