// domain/automation/substrate/validate — the create/update write-edge validation. One async pass:
// trigger liveness, CEL parse, action-arm shapes + caps + reserved-arm refusal, the
// post_notification cooldown floor, the C5 owner-global SCOPE matrix (which arms and which CEL roots a
// chat-less rule may carry), world-info book consent (the arm's book AND a `run_analysis` lore route's —
// attachment for a room's rule, OWNERSHIP for a global one), the S5 analysis admission rows (≥1 route · ≤1
// confirm-class route · the active-game fence), and `run_tool` tool reachability. Throws a
// TYPED refusal (AutomationReservedTriggerError / RuleValidationError) — a rule with any violation is never
// stored. It also holds `assertFireRateCap`, the authoritative bound on the owner BUDGET plane (#1430): a
// belt's ceiling belongs beside the per-rule ceiling it has to cohere with, not only on the wire. The db CHECKs + the `actions` zod are the ultimate guards; this gives a clean, user-visible refusal
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
import { AUTOMATION_ARM_SCOPE, AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR, automationActionsSchema, LIVE_TRIGGERS } from "@orb/contracts/automation";
import { MULTIMODAL_MODES } from "@orb/contracts/imagery";
import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { isCelParseError, parseCel } from "@orb/kit/cel";
import type { ChatId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { AutomationReservedTriggerError, BudgetValidationError, RuleValidationError } from "../contract/errors.ts";
import type { AutomationOps } from "../contract/ops.ts";
import { hasActiveGame, isBookAttachedToChat, isBookOwnedBy } from "../persistence/canon-reads.ts";

/** The per-rule cooldown floor (seconds) enforced when a `post_notification` arm is present — inbox spam
 *  trains dismissal. DERIVED from the notice's own wire vocabulary (one home, two enforcers: this authoring
 *  gate and the plugin `notify` call-time floor), never a second literal. */
const POST_NOTIFICATION_COOLDOWN_FLOOR = AUTOMATION_NOTICE_COOLDOWN_SECONDS;
/** The per-rule fires/hour ceiling (default 30, cap 240). */
const RULE_MAX_FIRES_CAP = 240;
export const RULE_MAX_FIRES_DEFAULT = 30;

/** THE AUTHORITATIVE BOUND on the editable fire-rate BELT — the per-owner cap (`setOwnerBudgets`) — #1430.
 *
 *  A rule's OWN `maxFiresPerHour` has been 0..240 since v1 (`validateRuleInput` below); the budget plane
 *  had no ceiling at all, and the wire's `int().min(0)` let an owner set a nine-digit "cap" that bounds nothing
 *  while the panel reads as configured. The belt exists to make a runaway rule stop hammering a paid API, so a
 *  cap that cannot be exceeded is not a cap.
 *
 *  IT LIVES AT THE VERB, not only on the wire, because the wire is not the only door: compose can reach the
 *  verb directly, and the transport schema's `int()`/`min(0)` half is a MIRROR of this one (the header of
 *  `AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR` states the pairing). `undefined` is the "keep the current value"
 *  patch and is admitted untouched. */
export function assertFireRateCap(maxFiresPerHour: number | undefined): void {
  if (maxFiresPerHour === undefined) {
    return;
  }
  if (!Number.isInteger(maxFiresPerHour) || maxFiresPerHour < 0 || maxFiresPerHour > AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR) {
    throw new BudgetValidationError(`maxFiresPerHour must be a whole number in 0..${AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR}`);
  }
}

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

/** C5 — WHERE the rule being validated will live, as ONE value the whole pass reads.
 *
 *  `chatId: null` is the owner-GLOBAL scope, and `authorUserId` is not redundant beside it: an owner-global
 *  rule's consent gates are ownership gates, so the author IS the scope. Passing the two as one value is what
 *  stops a later check from branching on the chat while silently gating against the WRONG user (on
 *  `updateRule` the author is the rule's existing owner, NOT the host doing the editing — the same trap
 *  `assertToolsDrivable` already names). */
interface RuleScope {
  readonly chatId: ChatId | null;
  readonly authorUserId: UserId;
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

/** Every book an arm can WRITE must pass the SCOPE's own consent gate — `insert_world_info_entry`'s own book
 *  AND a `run_analysis` lore route's (both writes ride the ONE lore belt, so both mint against the same
 *  gate). One batched probe.
 *
 *  TWO GATES, ONE QUESTION, decided by the rule's scope (the RULED book-ownership call, §3-S3): a CHAT rule's
 *  write asks the ROOM's consent and the attachment IS that consent; an owner-GLOBAL rule has no room to ask,
 *  so its write is a LIBRARY write into the author's OWN book and ownership is that consent (D23 keeps
 *  `world_books.ownerId` top-level single ownership, and no room inherits the content unless its own scope
 *  junction says so). `persistence/canon-reads.ts::isBookOwnedBy` carries the full argument. */
async function assertBooksWritable(deps: ValidateDeps, scope: RuleScope, actions: readonly AutomationAction[]): Promise<void> {
  const bookIds = actions.flatMap((a) => {
    if (a.type === "insert_world_info_entry") {
      return [a.bookId];
    }
    if (a.type === "run_analysis" && a.routes.lore !== undefined) {
      return [a.routes.lore.bookId];
    }
    return [];
  });
  const chatId = scope.chatId;
  const results = await Promise.all(
    bookIds.map((bookId) => (chatId === null ? isBookOwnedBy(deps.db, bookId, scope.authorUserId) : isBookAttachedToChat(deps.db, chatId, bookId))),
  );
  const refusedIdx = results.indexOf(false);
  if (refusedIdx !== -1) {
    throw new RuleValidationError(
      "unattached_book",
      chatId === null ? `book '${bookIds[refusedIdx]}' is not one this rule's author owns` : `book '${bookIds[refusedIdx]}' is not attached to this chat`,
    );
  }
}

// ── C5 — the OWNER-GLOBAL admission matrix ────────────────────────────────────────────────────────────
// A rule with no chat may only carry acts that HAVE no chat. The per-TYPE half of that is one exhaustive
// contracts Record (`AUTOMATION_ARM_SCOPE`, which a new arm fails `tsc` until it declares); everything below
// is the half a per-type Record structurally cannot express — the arm CONFIGURATIONS that name a room even
// though their arm type does not have to.
//
// Every refusal is TYPED and happens at the MINT, which is the D146-b posture applied to scope: a rule that
// could only ever fail is never stored, so the fire log never fills with `action_error` rows explaining a
// mistake the author made once at authoring time.

/** The CAPTION image modes — the only ones a chat-less `generate_image` can run. `MULTIMODAL_MODES` is the
 *  contracts home; this alias exists so the refusal below can NAME the set it enforces. */
const CHAT_LESS_IMAGE_MODES: readonly string[] = MULTIMODAL_MODES;

/** The per-ARM refusal reason for a chat-less rule, or `null` when the arm is admissible. Ordered
 *  type-first: an arm whose whole TYPE needs a room is refused before its configuration is read. */
function globalArmRefusal(action: AutomationAction): string | null {
  if (AUTOMATION_ARM_SCOPE[action.type] === "chat-required") {
    return `the '${action.type}' action needs a chat — an owner-global rule has no room to act in`;
  }
  // A SUGGESTIBLE arm asks a HOST. The S4 pending store is keyed `(chatId, ruleId)`, its card rides the
  // per-CHAT automation bus, and its confirm gate is the chat's host — none of which exists here. The schema
  // still ADMITS `confirmFirst` on these arms (unwired ≠ unshaped): an owner-plane ask surface is the graft
  // this refusal names, and it is the one thing standing between a global rule and a card nobody can answer.
  if ("confirmFirst" in action && action.confirmFirst) {
    return `'${action.type}' cannot ask first on an owner-global rule — a confirm card is raised in a room, to its host, and this rule has neither`;
  }
  if (action.type === "generate_image") {
    if (!action.quiet) {
      // A non-quiet generation POSTS the image into a chat as a message (the ONE image-post seam).
      return "a global 'generate_image' must be quiet — a non-quiet generation posts the image into a chat, and this rule has none";
    }
    if (!CHAT_LESS_IMAGE_MODES.includes(action.mode)) {
      // The text-EXTRACTION modes resolve their prompt through chat's quiet shaper over the room's recent
      // canon (`domain/imagery/verbs/extract-prompt.ts`); the CAPTION modes read the subject's avatar and
      // touch no chat at all. Admitting an extraction mode here would store a rule that errors on every fire.
      return `image mode '${action.mode}' reads a chat's recent messages to build its prompt — a global rule can only use ${CHAT_LESS_IMAGE_MODES.join(" or ")}`;
    }
  }
  // The two PLANE refinements. Both arms are chat-INDEPENDENT as types and both can still name the `chat`
  // variable plane, which is one room's own fold — the author's `global` plane is the chat-less one.
  if (action.type === "set_variable" && action.scope === "chat") {
    return "a global rule cannot write a chat variable — use the global scope (the author's own plane)";
  }
  if (action.type === "run_tool" && action.resultScope === "chat") {
    return "a global rule cannot capture a tool result into a chat variable — use the global scope";
  }
  return null;
}

/** The TRIGGER half of the matrix: an owner-global rule may listen to the DOMAIN bus only.
 *
 *  IT IS A COST GATE, and the cost is structural rather than a policy preference. The domain bus is
 *  chat-spanning and cheap — the pre-check is one in-process boolean (`hasDomainRules`) and a domain event
 *  arrives when a library row changes, which is rare. A CHAT-bus global rule would have to be considered on
 *  EVERY chat event in every room the process serves, which is the per-event scan the pre-check exists to
 *  avoid, and it would fan one author's rule across rooms they may not even be a member of.
 *
 *  The trigger schema still ADMITS the pair (unwired ≠ unshaped, the platform bar), so this is a typed
 *  refusal that NAMES the graft rather than a shape that cannot be expressed. */
function assertGlobalTriggerAdmissible(scope: RuleScope, trigger: AutomationTrigger): void {
  if (scope.chatId === null && trigger.bus !== "domain") {
    throw new RuleValidationError(
      "global_trigger_bus",
      `an owner-global rule can only watch library events, not chat events like '${trigger.type}' — a global rule has no room whose events it could be listening to`,
    );
  }
}

/** The arm half of the owner-global admission matrix. Chat-scoped rules are unconstrained here (every arm is
 *  admissible in a room), so this returns immediately for them. */
function assertArmsScopeAdmissible(scope: RuleScope, actions: readonly AutomationAction[]): void {
  if (scope.chatId !== null) {
    return;
  }
  // `find` narrows the result to `string | undefined` — a `!== null` beside it would be a dead conditional.
  const refusal = actions.map(globalArmRefusal).find((r) => r !== null);
  if (refusal !== undefined) {
    throw new RuleValidationError("global_arm_scope", refusal);
  }
}

/** The CEL roots that only a room can bind. The RULED chat-less env (§3-S3): these three stay REQUIRED on
 *  `AutomationCelEnv` — so every existing preset predicate and the cel-goldens vector are untouched — and a
 *  GLOBAL rule's predicate simply may not NAME them. */
const CHAT_KEYED_CEL_ROOTS: readonly string[] = ["chat", "vars", "choice"];

/** The predicate half of the matrix: walk the PARSED predicate for chat-keyed roots and refuse them on a
 *  chat-less rule.
 *
 *  IT WALKS THE AST, not the source text, and the difference is the whole reason `kit/cel` grew
 *  `rootIdentifiers`: a substring scan would refuse the string literal `"chat"` and miss `vars` reached
 *  through a comprehension. The walk over-reports exactly one shape (a comprehension VARIABLE named `chat`),
 *  which is a fail-closed refusal rather than a hole — stated at the kit seam. */
function assertPredicateScopeAdmissible(scope: RuleScope, predicateCel: string | null | undefined): void {
  if (scope.chatId !== null || predicateCel === undefined || predicateCel === null || predicateCel === "") {
    return;
  }
  const program = parseCel(predicateCel);
  if (isCelParseError(program)) {
    return; // The parse refusal is the caller's, and it fires first — nothing to add here.
  }
  const named = program.rootIdentifiers().find((root) => CHAT_KEYED_CEL_ROOTS.includes(root));
  if (named !== undefined) {
    throw new RuleValidationError(
      "global_predicate_scope",
      `a global rule's condition cannot read '${named}' — that is one room's state, and this rule has no room. Global conditions read event, global and now.`,
    );
  }
}

/** S5's admission rows for a `run_analysis` arm, all three refusing at MINT so no stored rule can only
 *  ever fail (the D146-b posture applied to this arm):
 *   • ≥1 route — a routeless pass would think and route nothing, an arm that can never do anything;
 *   • at most ONE confirm-class route — the S4 pending store REPLACES per `(chatId, ruleId)` slot
 *     (RULED F1), so two card-raising routes on one rule would silently eat each other's asks;
 *   • no analysis on an ACTIVE-game chat — the game owns its own steering (D109; the legacy
 *     no-double-director law re-derived; §3-S5.7, deliberately v1-BROAD over every route and revisitable). */
async function assertAnalysisAdmissible(db: Db, chatId: ChatId | null, actions: readonly AutomationAction[]): Promise<void> {
  const analyses = actions.filter((a) => a.type === "run_analysis");
  // A chat-less rule cannot carry this arm at all — `AUTOMATION_ARM_SCOPE` marks it chat-required and
  // `assertArmsScopeAdmissible` refused it above, so a null chat here means there is no analysis to admit.
  if (analyses.length === 0 || chatId === null) {
    return;
  }
  for (const arm of analyses) {
    const routes = arm.routes;
    const enabled = [routes.steer, routes.lore, routes.suggest, routes.rewrite, routes.vars].filter((r) => r !== undefined).length;
    if (enabled === 0) {
      throw new RuleValidationError("analysis_no_routes", "a run_analysis arm must enable at least one output route");
    }
    const confirmClass = [
      routes.steer?.apply === "confirm",
      routes.lore?.apply === "confirm",
      routes.suggest !== undefined,
      routes.rewrite !== undefined,
    ].filter(Boolean).length;
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

/** Validate a create/update payload against its SCOPE. Returns the parsed action list on success; throws a
 *  typed refusal otherwise. `deps.db` + the scope are needed for the book consent probe; `deps.ops` for the
 *  `run_tool` reachability probe.
 *
 *  The owner-global rows (`assertArmsScopeAdmissible`, `assertPredicateScopeAdmissible`) are NO-OPS for a
 *  chat-scoped rule, so a room's rule is validated byte-identically to before C5. */
export async function validateRuleInput(deps: ValidateDeps, scope: RuleScope, input: ValidateInput): Promise<ValidatedRule> {
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
  // The SCOPE rows run BEFORE the db probes: they are synchronous and they subsume most of what the probes
  // would otherwise have to special-case (a global rule carrying a `run_analysis` arm is already refused by
  // the arm matrix, so the game fence below never has to answer "an active game in WHICH chat?").
  assertGlobalTriggerAdmissible(scope, input.trigger);
  assertArmsScopeAdmissible(scope, actions);
  assertPredicateScopeAdmissible(scope, input.predicateCel);
  await assertBooksWritable(deps, scope, actions);
  await assertAnalysisAdmissible(deps.db, scope.chatId, actions);
  return { actions };
}
