// domain/automation/substrate/validate — the create/update write-edge validation (04 §2). One async pass:
// trigger liveness (01 §1), CEL parse (02 §1), action-arm shapes + caps + reserved-arm refusal (03), the
// post_notification cooldown floor (03 §3), and world-info book attachment (03 §1.3). Throws a TYPED refusal
// (AutomationReservedTriggerError / RuleValidationError) — a rule with any violation is never stored. The db
// CHECKs + the `actions` zod are the ultimate guards; this gives a clean, user-visible refusal first.

import type { AutomationAction, AutomationTrigger } from "@orb/contracts/automation";
import { automationActionsSchema, LIVE_TRIGGERS, RESERVED_ACTION_TYPES } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { isCelParseError, parseCel } from "@orb/kit/cel";
import type { ChatId } from "@orb/kit/ids";
import { AutomationReservedTriggerError, RuleValidationError } from "../contract/errors";
import { isBookAttachedToChat } from "../persistence/canon-reads";

/** The per-rule cooldown floor (seconds) enforced when a `post_notification` arm is present — inbox spam
 *  trains dismissal (03 §3 / the chat-crew §5 lesson). */
const POST_NOTIFICATION_COOLDOWN_FLOOR = 60;
/** The per-rule fires/hour ceiling (03 §3 — default 30, cap 240). */
const RULE_MAX_FIRES_CAP = 240;
export const RULE_MAX_FIRES_DEFAULT = 30;

// The reserved arm types as a plain readonly string[] for `.includes` (a module-level `new Set()` trips the
// single-replica-state gate; this tuple is tiny — a linear scan is free).
const RESERVED_ARMS: readonly string[] = RESERVED_ACTION_TYPES;

interface ValidatedRule {
  readonly actions: readonly AutomationAction[];
}

interface ValidateInput {
  readonly trigger: AutomationTrigger;
  readonly predicateCel?: string | null | undefined;
  readonly actions: readonly AutomationAction[];
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
}

/** Parse + arm-cap + reserved-arm + cooldown-floor checks (the synchronous half). Returns the parsed arms. */
function validateActions(input: ValidateInput): readonly AutomationAction[] {
  const parsed = automationActionsSchema.safeParse(input.actions);
  if (!parsed.success) {
    throw new RuleValidationError("bad_action", `action list invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  const actions = parsed.data;
  const reserved = actions.find((a) => RESERVED_ARMS.includes(a.type));
  if (reserved !== undefined) {
    throw new RuleValidationError("reserved_arm", `action '${reserved.type}' is reserved (its domain is not wired v1)`);
  }
  if (actions.some((a) => a.type === "post_notification") && input.cooldownSeconds < POST_NOTIFICATION_COOLDOWN_FLOOR) {
    throw new RuleValidationError("cooldown_floor", `a post_notification rule requires cooldownSeconds ≥ ${POST_NOTIFICATION_COOLDOWN_FLOOR}`);
  }
  return actions;
}

/** A `transform_draft` arm rides the D50 prompt-transform pipeline (A7), NOT the watcher — it registers a
 *  synchronous transform over the turn's draft (03 §1.2). So a rule carrying one must (a) carry ONLY
 *  transform_draft arms (a mix would half-run through the watcher and half through the pipeline — incoherent)
 *  and (b) trigger on `chat/turnStarted` (the only turn-scoped moment a draft exists to rewrite). A rule with
 *  no transform_draft arm is unconstrained here. */
function assertTransformDraftShape(trigger: AutomationTrigger, actions: readonly AutomationAction[]): void {
  const transformCount = actions.filter((a) => a.type === "transform_draft").length;
  if (transformCount === 0) {
    return;
  }
  if (transformCount !== actions.length) {
    throw new RuleValidationError(
      "transform_mix",
      "a transform_draft rule's arms must ALL be transform_draft — it registers into the turn pipeline, not the watcher",
    );
  }
  if (trigger.bus !== "chat" || trigger.type !== "turnStarted") {
    throw new RuleValidationError("transform_trigger", "a transform_draft rule must trigger on chat/turnStarted (the moment a draft exists to rewrite)");
  }
}

/** Every `insert_world_info_entry` arm's book must be attached to the chat (03 §1.3). One batched probe. */
async function assertBooksAttached(db: Db, chatId: ChatId, actions: readonly AutomationAction[]): Promise<void> {
  const bookIds = actions.filter((a) => a.type === "insert_world_info_entry").map((a) => a.bookId);
  const results = await Promise.all(bookIds.map((bookId) => isBookAttachedToChat(db, chatId, bookId)));
  const unattachedIdx = results.indexOf(false);
  if (unattachedIdx !== -1) {
    throw new RuleValidationError("unattached_book", `book '${bookIds[unattachedIdx]}' is not attached to this chat`);
  }
}

/** Validate a create/update payload against the chat. Returns the parsed action list on success; throws a
 *  typed refusal otherwise. `db`/`chatId` are needed only for the book-attachment probe. */
export async function validateRuleInput(db: Db, chatId: ChatId, input: ValidateInput): Promise<ValidatedRule> {
  if (!LIVE_TRIGGERS[input.trigger.type]) {
    throw new AutomationReservedTriggerError(input.trigger.type);
  }
  if (input.maxFiresPerHour < 0 || input.maxFiresPerHour > RULE_MAX_FIRES_CAP) {
    throw new RuleValidationError("fires_cap", `maxFiresPerHour must be in 0..${RULE_MAX_FIRES_CAP}`);
  }
  if (input.cooldownSeconds < 0) {
    throw new RuleValidationError("cooldown_negative", "cooldownSeconds must be ≥ 0");
  }
  if (input.predicateCel !== undefined && input.predicateCel !== null && input.predicateCel !== "") {
    const program = parseCel(input.predicateCel);
    if (isCelParseError(program)) {
      throw new RuleValidationError("bad_cel", `predicate does not parse: ${program.message}`);
    }
  }
  const actions = validateActions(input);
  assertTransformDraftShape(input.trigger, actions);
  await assertBooksAttached(db, chatId, actions);
  return { actions };
}
