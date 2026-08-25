// domain/automation/substrate/validate — the create/update write-edge validation. One async pass:
// trigger liveness, CEL parse, action-arm shapes + caps + reserved-arm refusal, the
// post_notification cooldown floor, world-info book attachment (the arm's book AND a `run_analysis` lore
// route's), the S5 analysis admission rows (≥1 route · ≤1 confirm-class route · the active-game fence),
// and `run_tool` tool reachability. Throws a
// TYPED refusal (AutomationReservedTriggerError / RuleValidationError) — a rule with any violation is never
// stored. The db CHECKs + the `actions` zod are the ultimate guards; this gives a clean, user-visible refusal
// first.
//
// D146-b — WHERE THE BOOT-FATAL POSTURE WENT. A first-party contributor seam asserts exhaustive-and-unique
// against a compile-time tuple and is BOOT-FATAL both ways, because a first-party contributor is a build
// artifact: absent means the build is wrong. A CONTRIBUTOR (plugin) seam can do none of that — the vocabulary
// is not knowable at compile time. The equivalent strictness moves HERE, to the mint: a rule naming a tool its
// author cannot drive is never STORED. That is per-rule fatal and nothing else — never fatal to the process,
// never fatal to a sibling rule. The mint gate and the dispatch PAUSE gate ask the SAME predicate and mean
// opposite things by a `false`: here it means "you never had this", there it means "it went away".

import type { AutomationAction, AutomationActionInput, AutomationTrigger } from "@orb/contracts/automation";
import { automationActionsSchema, LIVE_TRIGGERS } from "@orb/contracts/automation";
import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { isCelParseError, parseCel } from "@orb/kit/cel";
import type { ChatId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { AutomationReservedTriggerError, RuleValidationError } from "../contract/errors.ts";
import type { AutomationOps } from "../contract/ops.ts";
import { hasActiveGame, isBookAttachedToChat } from "../persistence/canon-reads.ts";

/** The per-rule cooldown floor (seconds) enforced when a `post_notification` arm is present — inbox spam
 *  trains dismissal. DERIVED from the notice's own wire vocabulary (one home, two enforcers: this authoring
 *  gate and the plugin `notify` call-time floor), never a second literal. */
const POST_NOTIFICATION_COOLDOWN_FLOOR = AUTOMATION_NOTICE_COOLDOWN_SECONDS;
/** The per-rule fires/hour ceiling (default 30, cap 240). */
const RULE_MAX_FIRES_CAP = 240;
export const RULE_MAX_FIRES_DEFAULT = 30;

/** The PARSED arms — the stored/dispatched shape, with every default filled. This is what the caller
 *  persists; a verb never writes its own params (see `AutomationActionInput`'s header). */
interface ValidatedRule {
  readonly actions: readonly AutomationAction[];
}

interface ValidateInput {
  readonly trigger: AutomationTrigger;
  readonly predicateCel?: string | null | undefined;
  /** AUTHORED arms — the schema's INPUT. Parsing them IS this function's job. */
  readonly actions: readonly AutomationActionInput[];
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  /** The identity the stored rule will RUN AS — the rule's owner, which on `updateRule` is the rule's existing
   *  author and NOT necessarily the host doing the editing. `run_tool` reachability is checked against this
   *  user for exactly that reason: a co-host editing someone else's rule must not be able to point it at a
   *  tool the rule's actual author could never drive. */
  readonly authorUserId: UserId;
}

/** The reads this validation needs: the db (the book-attachment probe) and the injected tool registry
 *  (the `run_tool` reachability probe). `AutomationContext` satisfies it structurally, so both call sites hand
 *  over their own ctx rather than assembling a bag. */
interface ValidateDeps {
  readonly db: Db;
  readonly ops: AutomationOps;
}

/** Parse + arm-cap + reserved-arm + cooldown-floor checks (the synchronous half). Returns the parsed arms. */
function validateActions(input: ValidateInput): readonly AutomationAction[] {
  const parsed = automationActionsSchema.safeParse(input.actions);
  if (!parsed.success) {
    // `z.prettifyError` over `issues[0].message`: the arms are a discriminated array, so "Invalid input" with no
    // path named neither WHICH arm nor WHICH field. prettify carries `→ at 1.cooldownSeconds` per issue.
    throw new RuleValidationError("bad_action", `action list invalid:\n${z.prettifyError(parsed.error)}`);
  }
  const actions = parsed.data;

  if (actions.some((a) => a.type === "post_notification") && input.cooldownSeconds < POST_NOTIFICATION_COOLDOWN_FLOOR) {
    throw new RuleValidationError("cooldown_floor", `a post_notification rule requires cooldownSeconds ≥ ${POST_NOTIFICATION_COOLDOWN_FLOOR}`);
  }
  return actions;
}

/** A `transform_draft` arm rides the D50 prompt-transform pipeline, NOT the watcher — it registers a
 *  synchronous transform over the turn's draft. So a rule carrying one must (a) carry ONLY
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

/** Every book an arm can WRITE must be attached to the chat — `insert_world_info_entry`'s own book AND a
 *  `run_analysis` lore route's (both writes ride the ONE lore belt, so both mint against the same consent
 *  gate). One batched probe. */
async function assertBooksAttached(db: Db, chatId: ChatId, actions: readonly AutomationAction[]): Promise<void> {
  const bookIds = actions.flatMap((a) => {
    if (a.type === "insert_world_info_entry") {
      return [a.bookId];
    }
    if (a.type === "run_analysis" && a.routes.lore !== undefined) {
      return [a.routes.lore.bookId];
    }
    return [];
  });
  const results = await Promise.all(bookIds.map((bookId) => isBookAttachedToChat(db, chatId, bookId)));
  const unattachedIdx = results.indexOf(false);
  if (unattachedIdx !== -1) {
    throw new RuleValidationError("unattached_book", `book '${bookIds[unattachedIdx]}' is not attached to this chat`);
  }
}

/** S5's admission rows for a `run_analysis` arm, all three refusing at MINT so no stored rule can only
 *  ever fail (the D146-b posture applied to this arm):
 *   • ≥1 route — a routeless pass would think and route nothing, an arm that can never do anything;
 *   • at most ONE confirm-class route — the S4 pending store REPLACES per `(chatId, ruleId)` slot
 *     (RULED F1), so two card-raising routes on one rule would silently eat each other's asks;
 *   • no analysis on an ACTIVE-game chat — the game owns its own steering (D109; the legacy
 *     no-double-director law re-derived; §3-S5.7, deliberately v1-BROAD over every route and revisitable). */
async function assertAnalysisAdmissible(db: Db, chatId: ChatId, actions: readonly AutomationAction[]): Promise<void> {
  const analyses = actions.filter((a) => a.type === "run_analysis");
  if (analyses.length === 0) {
    return;
  }
  for (const arm of analyses) {
    const routes = arm.routes;
    const enabled = [routes.steer, routes.lore, routes.suggest, routes.vars].filter((r) => r !== undefined).length;
    if (enabled === 0) {
      throw new RuleValidationError("analysis_no_routes", "a run_analysis arm must enable at least one output route");
    }
    const confirmClass = [routes.steer?.apply === "confirm", routes.lore?.apply === "confirm", routes.suggest !== undefined].filter(Boolean).length;
    if (confirmClass > 1) {
      throw new RuleValidationError(
        "analysis_confirm_slots",
        "a run_analysis arm may carry at most one confirm-class route — pending cards replace per rule, so a second would silently displace the first",
      );
    }
  }
  if (await hasActiveGame(db, chatId)) {
    throw new RuleValidationError("active_game", "this chat's game directs its own story — analysis rules cannot be added while a game is active");
  }
}

/** D146-b — every `run_tool` arm must name a tool the rule's AUTHOR can actually drive, or the rule does not
 *  get stored. Refusing at the mint is what makes the dispatch-time PAUSE unambiguous: because the name was
 *  drivable once, a later `false` can only mean the contributor went away, so the engine can pause instead of
 *  guessing between "gone" and "never yours" — and a typo can never masquerade as a paused plugin.
 *
 *  Synchronous: the registry is an in-process Map. The FIRST offending name is named in the refusal (a rule
 *  carries at most 8 arms; a list of every bad name would read worse than the one to fix). */
function assertToolsDrivable(deps: ValidateDeps, authorUserId: UserId, actions: readonly AutomationAction[]): void {
  const named = actions.filter((action) => action.type === "run_tool").map((action) => action.name);
  const unreachable = named.find((name) => !deps.ops.tools.isToolDrivableBy(name, authorUserId));
  if (unreachable !== undefined) {
    throw new RuleValidationError(
      "unknown_tool",
      `tool '${unreachable}' is not available to this rule's author — a rule may only run tools from a plugin that author installed and enabled`,
    );
  }
}

/** Validate a create/update payload against the chat. Returns the parsed action list on success; throws a
 *  typed refusal otherwise. `deps.db`/`chatId` are needed for the book-attachment probe; `deps.ops` for the
 *  `run_tool` reachability probe. */
export async function validateRuleInput(deps: ValidateDeps, chatId: ChatId, input: ValidateInput): Promise<ValidatedRule> {
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
  assertToolsDrivable(deps, input.authorUserId, actions);
  await assertBooksAttached(deps.db, chatId, actions);
  await assertAnalysisAdmissible(deps.db, chatId, actions);
  return { actions };
}
