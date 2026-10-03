import type { AutomationRuleRefusalCode } from "@orb/contracts/automation";
import { ruleRefusalCodeOf } from "@orb/contracts/automation";
import { isTRPCClientError } from "@trpc/client";
import type { TrpcReadError } from "#data";
import { trpcErrorReason } from "#lib";
import type { RuleEditorFailure } from "./contract/rule-editor.ts";
import { RULE_NOTICE_COOLDOWN_ERROR } from "./contract/rule-editor.ts";

const SERVER_ERROR_START = 500;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;

// Every refusal code the server can throw, with the field copy it shows; `null` takes the generic refusal below.
const REFUSAL_COPY: Record<AutomationRuleRefusalCode, RuleEditorFailure | null> = {
  ["cooldown_floor"]: { field: "cooldownSeconds", message: RULE_NOTICE_COOLDOWN_ERROR, retryable: false },
  ["cooldown_negative"]: { field: "cooldownSeconds", message: "Cooldown cannot be negative.", retryable: false },
  ["bad_cel"]: { field: "predicateCel", message: "The condition could not be understood. Check the CEL expression.", retryable: false },
  name: { field: "name", message: "Enter a rule name within the allowed length.", retryable: false },
  ["fires_cap"]: { field: "maxFiresPerHour", message: "Choose a maximum runs per hour within the field's limits.", retryable: false },
  ["unknown_tool"]: { message: "A selected tool is unavailable to this rule's author. Choose an available tool before saving.", retryable: false },
  ["active_game"]: { message: "This chat's game directs its own story. Analysis rules cannot be saved while the game is active.", retryable: false },
  ["analysis_confirm_slots"]: null,
  ["analysis_no_routes"]: null,
  ["bad_action"]: null,
  ["global_arm_scope"]: null,
  ["global_predicate_scope"]: null,
  ["global_trigger_bus"]: null,
  ["preset_knob"]: null,
  ["preset_scope"]: null,
  ["rule_disabled"]: null,
  ["transform_mix"]: null,
  ["transform_not_runnable"]: null,
  ["transform_trigger"]: null,
  ["unattached_book"]: null,
};

/** Domain refusal codes select field copy; unstructured transport failures retain their retry path. */
export function ruleEditorFailure(error: Error | null): RuleEditorFailure | null {
  if (error === null) {
    return null;
  }
  const code = ruleRefusalCodeOf(trpcErrorReason(error));
  const copy = code === null ? null : REFUSAL_COPY[code];
  if (copy !== null) {
    return copy;
  }
  const wire: TrpcReadError | null = isTRPCClientError(error) ? error : null;
  const status = wire?.data?.httpStatus;
  const retryable = status === undefined || status >= SERVER_ERROR_START || status === REQUEST_TIMEOUT || status === TOO_MANY_REQUESTS;
  return { message: retryable ? error.message : "The rule was not accepted. Review its fields and your current permissions before editing again.", retryable };
}
