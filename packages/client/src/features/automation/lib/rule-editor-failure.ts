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

/** What a refusal shows: fixed copy, or copy that carries the server's own sentence when that names the
 *  specific thing refused (an arm, a book, a condition root, a knob). */
type RefusalCopy = RuleEditorFailure | ((serverMessage: string) => RuleEditorFailure);

const refused = (message: string): RuleEditorFailure => ({ message, retryable: false });
const refusedWith =
  (lead: string) =>
  (serverMessage: string): RuleEditorFailure =>
    refused(`${lead} ${serverMessage}`);

// Every refusal code the server can throw, with the copy it shows. A code's field copy marks that field.
const REFUSAL_COPY: Record<AutomationRuleRefusalCode, RefusalCopy> = {
  ["cooldown_floor"]: { field: "cooldownSeconds", message: RULE_NOTICE_COOLDOWN_ERROR, retryable: false },
  ["cooldown_negative"]: { field: "cooldownSeconds", message: "Cooldown cannot be negative.", retryable: false },
  ["bad_cel"]: { field: "predicateCel", message: "The condition could not be understood. Check the CEL expression.", retryable: false },
  name: { field: "name", message: "Enter a rule name within the allowed length.", retryable: false },
  ["fires_cap"]: { field: "maxFiresPerHour", message: "Choose a maximum runs per hour within the field's limits.", retryable: false },
  ["unknown_tool"]: refused("A selected tool is unavailable to this rule's author. Choose an available tool before saving."),
  ["active_game"]: refused("This chat's game directs its own story. Analysis rules cannot be saved while the game is active."),
  ["analysis_confirm_slots"]: refused(
    "An analysis action can have only one route that waits for your confirmation. Turn the others to apply automatically, or off.",
  ),
  ["analysis_no_routes"]: refused("An analysis action needs at least one output turned on. Enable a route, or remove the action."),
  ["bad_action"]: refusedWith("One of the actions is incomplete or out of range, so the rule was not saved."),
  ["global_arm_scope"]: refusedWith("This action needs a room, and a library-wide rule has none."),
  ["global_predicate_scope"]: refusedWith("A library-wide rule has no room for its condition to read."),
  ["global_trigger_bus"]: refused("A library-wide rule can only watch library events. Pick a library event, or save this rule inside the chat it watches."),
  ["preset_knob"]: refusedWith("A setting of this rule preset was refused."),
  ["preset_scope"]: refusedWith("This rule preset cannot be added here."),
  ["rule_disabled"]: refused("This rule is turned off. Turn it on before running it."),
  ["transform_mix"]: refused("A rule that rewrites your draft can only hold draft-rewrite actions. Move the other actions into a separate rule."),
  ["transform_not_runnable"]: refused("A rule that rewrites your draft runs as you send, so there is nothing to run on its own."),
  ["transform_trigger"]: refused("A rule that rewrites your draft must start when a turn begins. Pick that trigger."),
  ["unattached_book"]: refusedWith("The lorebook this rule writes to is not available to it."),
};

/** Domain refusal codes select field copy; unstructured transport failures retain their retry path. */
export function ruleEditorFailure(error: Error | null): RuleEditorFailure | null {
  if (error === null) {
    return null;
  }
  const code = ruleRefusalCodeOf(trpcErrorReason(error));
  const copy = code === null ? null : REFUSAL_COPY[code];
  if (copy !== null) {
    return typeof copy === "function" ? copy(error.message) : copy;
  }
  const wire: TrpcReadError | null = isTRPCClientError(error) ? error : null;
  const status = wire?.data?.httpStatus;
  const retryable = status === undefined || status >= SERVER_ERROR_START || status === REQUEST_TIMEOUT || status === TOO_MANY_REQUESTS;
  return { message: retryable ? error.message : "The rule was not accepted. Review its fields and your current permissions before editing again.", retryable };
}
