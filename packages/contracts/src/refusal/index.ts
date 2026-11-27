// The one home of the refusal reasons a tRPC error's `data.reason` can carry that `packages/contracts` declares. The
// server's transport rides a `DomainOperationError` or `DomainForbiddenError` code there as an open string; the client
// reads it through `RefusalReason`, so a comparison against a reason no vocabulary declares fails `tsc`.
//
// A reason a server domain declares in its own `contract/` is not here: the client cannot import it, so it can never
// branch on it. A vocabulary that gains a member needs no edit here; a new vocabulary is added to
// `REFUSAL_REASONS` or it never reaches a client branch.

import { ASSET_UPLOAD_REFUSAL_CODES } from "#assets";
import type { AutomationRuleReason } from "#automation";
import { ruleRefusalCodeOf } from "#automation";
import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_RESERVED_OP_CODE, CHARACTER_STALE_BASIS_OP_CODE } from "#character";
import type { ProviderFailureReason } from "#chat";
import {
  CHAT_NOT_HOST_OP_CODE,
  EMPTY_GENERATION_OP_CODE,
  INVITE_TARGET_UNKNOWN_CODE,
  MEMORY_ITEM_STALE_OP_CODE,
  MESSAGE_MACRO_BUDGET_OP_CODE,
  MESSAGE_TOO_LONG_OP_CODE,
  PROVIDER_FAILURE_REASON_PREFIX,
  TURN_ABORTED_OP_CODE,
  TURN_HOST_UNAVAILABLE_OP_CODE,
  TURN_LOCKED_OP_CODE,
  TURN_ROOM_CLOSING_OP_CODE,
  USER_MACRO_UNKNOWN_PICK_OP_CODE,
} from "#chat";
import { CARD_NOT_DISTILLABLE_REASON } from "#discovery";
import { EXTRACTION_OP_CODES } from "#extraction";
import { IP_CERTIFICATE_REFUSALS, RELAY_BINARY_REFUSALS, SHARE_REFUSALS } from "#identity";
import { CONNECTION_OP_CODES } from "#inference";
import { PLUGIN_UI_HOST_CALL_CODES } from "#plugin";
import { REFINERY_OUTPUT_BUDGET_REASON, REFINERY_ROUND_IN_FLIGHT_REASON, REFINERY_SESSION_COMPLETED_REASON, REFINERY_STAGE_NOT_READY_REASON } from "#refinery";
import { SEARCH_SPACE_REINDEXING } from "#search";
import { BACKGROUND_UNAVAILABLE_OP_CODE } from "#theme";
import { WORKLOAD_ASKER_NOT_OWNER, WORKLOAD_NOT_ADMISSIBLE, WORKLOAD_RESULT_INVALID, WORKLOAD_RUN_ACCOUNT_REFUSAL_CODES, WORKLOAD_UNFUNDED } from "#workloads";

/** Every fixed reason the contracts declare. Each vocabulary is spread from its own export, never re-spelled. */
export const REFUSAL_REASONS = [
  ...Object.values(ASSET_UPLOAD_REFUSAL_CODES),
  ...Object.values(CONNECTION_OP_CODES),
  ...Object.values(EXTRACTION_OP_CODES),
  ...Object.values(PLUGIN_UI_HOST_CALL_CODES),
  ...IP_CERTIFICATE_REFUSALS,
  ...RELAY_BINARY_REFUSALS,
  ...SHARE_REFUSALS,
  ...WORKLOAD_RUN_ACCOUNT_REFUSAL_CODES,
  BACKGROUND_UNAVAILABLE_OP_CODE,
  CARD_NOT_DISTILLABLE_REASON,
  CHARACTER_HANDLE_CONFLICT_OP_CODE,
  CHARACTER_HANDLE_RESERVED_OP_CODE,
  CHARACTER_STALE_BASIS_OP_CODE,
  CHAT_NOT_HOST_OP_CODE,
  EMPTY_GENERATION_OP_CODE,
  INVITE_TARGET_UNKNOWN_CODE,
  MEMORY_ITEM_STALE_OP_CODE,
  MESSAGE_MACRO_BUDGET_OP_CODE,
  MESSAGE_TOO_LONG_OP_CODE,
  REFINERY_OUTPUT_BUDGET_REASON,
  REFINERY_ROUND_IN_FLIGHT_REASON,
  REFINERY_SESSION_COMPLETED_REASON,
  REFINERY_STAGE_NOT_READY_REASON,
  SEARCH_SPACE_REINDEXING,
  TURN_ABORTED_OP_CODE,
  TURN_HOST_UNAVAILABLE_OP_CODE,
  TURN_LOCKED_OP_CODE,
  TURN_ROOM_CLOSING_OP_CODE,
  USER_MACRO_UNKNOWN_PICK_OP_CODE,
  WORKLOAD_ASKER_NOT_OWNER,
  WORKLOAD_NOT_ADMISSIBLE,
  WORKLOAD_RESULT_INVALID,
  WORKLOAD_UNFUNDED,
] as const;

/** The reasons a tRPC error carries: a fixed reason above, a provider failure (the prefix plus a kind `@orb/inference`
 *  owns, which contracts cannot import) or an automation rule refusal (the prefix plus one rule refusal code). */
export type RefusalReason = (typeof REFUSAL_REASONS)[number] | ProviderFailureReason | AutomationRuleReason;

const FIXED_REASONS: ReadonlySet<string> = new Set(REFUSAL_REASONS);

/** Whether a wire `data.reason` is one the contracts declare. A reason only a server domain declares answers false. */
export function isRefusalReason(reason: string): reason is RefusalReason {
  return FIXED_REASONS.has(reason) || reason.startsWith(PROVIDER_FAILURE_REASON_PREFIX) || ruleRefusalCodeOf(reason) !== null;
}
