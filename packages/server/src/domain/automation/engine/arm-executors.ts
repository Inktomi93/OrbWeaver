// domain/automation/engine/arm-executors — the ARM DISPATCHER (03; A6). ONE `runArm` function that switches on
// the CLEAN `AutomationActionType` string union (NOT `action.type`) with `default: never` as the exhaustiveness
// pin (a new action type fails `tsc`), NO suppression. Why a switch and not the spine-§5.5 mapped-type Record:
// (1) biome's `noUnnecessaryConditions` cannot narrow a `z.infer` zod discriminated union — PROVEN via scratch
// probes (a 2-member TOY zod discriminatedUnion trips "unreachable" on every case identically, while a plain TS
// union narrows fine; it is NOT the `generate_image` `.extend` an earlier note guessed — a trivial inline
// `generate_image` member reproduced it), so `switch(action.type)` reads every case unreachable; (2) the Record's
// snake_case PROPERTY keys would trip `useNamingConvention` (whereas string-literal `case`s are DATA, not
// property names). The per-arm `as Extract<>` cast at each case is the price of narrowing off the string union,
// not the object union — sound by construction. Each live arm renders its templates (the ONE `renderArmTemplate`
// home — test/live parity) then dispatches through an INJECTED cross-feature op (`deps.ops`, wired at
// entry/compose — one-directional flow). `trigger_turn` is WIRED (its chat `requestTurn` seam landed — §AC-B) and
// dispatches a real autonomous turn; the sole v1-unwired arm is `transform_draft` (it registers into the prompt
// PIPELINE (A7), it never dispatches here) and the three reserved arms — both return a TYPED REFUSAL, never a
// fabricated success. A refusal is an `arm_error`; a
// SPEND ceiling (03 §3) is a `budget_refused` (the rule stays healthy). The first non-ok outcome aborts the
// rule's remaining arms (04 §3 step 5).

import type { AutomationAction } from "@orb/contracts/automation";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { VarOp } from "@orb/kit/macro";
import type { ArmDispatch, ArmExecutorDeps, ArmOutcome, DispatchFrame } from "../contract/ops";
import { isBookAttachedToChat, listRuleEntryTitles, loadPresentHumanMemberIds } from "../persistence/canon-reads";
import { deleteGlobalVariable, selectGlobalVariable, upsertGlobalVariable } from "../persistence/queries";
import { renderArmTemplate } from "../substrate/macro-render";
import { checkSpend } from "./spend-gate";

const DECIMAL_RADIX = 10;
const DEFAULT_INC_DEC_OPERAND = 1;
/** A rule's `insert_world_info_entry` entries are title-namespaced by the ruleId so a re-upsert with the same
 *  `entryKey` UPDATES its own prior entry (03 §1.3) and two rules never collide on one title. */
const AUTO_ENTRY_TITLE_PREFIX = "auto/";
/** The per-rule ≤64-entries-per-book cap (03 §1.3) — a looping inserter fills a book otherwise. */
const RULE_MAX_ENTRIES_PER_BOOK = 64;

const OK: ArmOutcome = { ok: true };
function armError(detail: string): ArmOutcome {
  return { ok: false, kind: "arm_error", detail };
}
function budgetRefused(detail: string): ArmOutcome {
  return { ok: false, kind: "budget_refused", detail };
}

/** The title a rule's `insert_world_info_entry` arm writes under (ruleId-namespaced idempotency handle). */
function ruleEntryTitle(frame: DispatchFrame, entryKey: string): string {
  return `${AUTO_ENTRY_TITLE_PREFIX}${frame.origin.ruleId}:${entryKey}`;
}

// ── 1.1 set_variable ──────────────────────────────────────────────────────────────────────────────
/** Resolve the final value string for a `set`/`inc`/`dec` op given the current value + the rendered operand.
 *  `inc`/`dec` compute against the CURRENT value (the standalone chat-fold cache or the author's global) — the
 *  VarOp vocabulary's `inc`/`dec` are ±1 only, so an operand-bearing inc/dec resolves to a computed `set`. */
function resolveNumericValue(op: "inc" | "dec", current: string, operandText: string): string {
  const parsedOperand = Number.parseInt(operandText, DECIMAL_RADIX);
  const operand = Number.isNaN(parsedOperand) ? DEFAULT_INC_DEC_OPERAND : parsedOperand;
  const base = Number.parseInt(current, DECIMAL_RADIX) || 0;
  return String(op === "inc" ? base + operand : base - operand);
}

async function runSetVariable(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "set_variable" }>, frame: DispatchFrame): Promise<ArmOutcome> {
  const { scope, key, op } = action;
  if (op === "delete") {
    if (scope === "chat") {
      await deps.ops.chat.applyVariableOps(frame.chatId, [{ op: "delete", key }]);
      // WRITE-THROUGH (03 §0 / 04 §3 — arms mutate the SHARED env; order IS semantics): the CEL env is built
      // once per chat per batch and cached. The DB delta alone is invisible to later arms + later rules on the
      // same chat this batch, so mirror the delete onto the shared in-memory `vars` (a delete is `has()`-false).
      delete frame.env.vars[key];
    } else {
      await deleteGlobalVariable(deps.db, frame.authorUserId, key);
    }
    return OK;
  }

  // `value` is a TEMPLATE (required for set; the operand for inc/dec, default "1").
  const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.value ?? String(DEFAULT_INC_DEC_OPERAND) });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  let value: string;
  if (op === "set") {
    value = rendered.text;
  } else {
    // inc/dec compute against the CURRENT value. Chat scope reads the SHARED env `vars` (so an earlier arm's
    // write in this same batch composes — `[set hp=5, inc hp]` ⇒ 6); global scope reads the DB fresh (globals
    // aren't env-cached, so they already compose across arms).
    const current = scope === "chat" ? (frame.env.vars[key] ?? "0") : ((await selectGlobalVariable(deps.db, frame.authorUserId, key)) ?? "0");
    value = resolveNumericValue(op, current, rendered.text);
  }

  if (scope === "chat") {
    const ops: readonly VarOp[] = [{ op: "set", key, value }];
    await deps.ops.chat.applyVariableOps(frame.chatId, ops);
    // WRITE-THROUGH: mirror the resolved value onto the SHARED cached env so both subsequent arms in THIS rule
    // and later rules on the same chat in THIS batch observe the write (predicates + inc/dec + templates read
    // `env.vars`). Without this the DB write is invisible until the NEXT batch rebuilds the env (the "order is
    // semantics" promise was false — a later inc read the stale pre-write value).
    frame.env.vars[key] = value;
  } else {
    await upsertGlobalVariable(deps.db, { ownerId: frame.authorUserId, key, value, updatedAt: frame.now });
  }
  return OK;
}

// ── 1.3 insert_world_info_entry ─────────────────────────────────────────────────────────────────────
async function runInsertWorldInfo(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "insert_world_info_entry" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  // The book must be attached to the rule's chat — the attachment IS the room's consent (03 §1.3).
  if (!(await isBookAttachedToChat(deps.db, frame.chatId, action.bookId))) {
    return armError(`book ${action.bookId} is not attached to this chat`);
  }
  const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.contentTemplate });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  const title = ruleEntryTitle(frame, action.entryKey);
  const owned = await listRuleEntryTitles(deps.db, action.bookId, `${AUTO_ENTRY_TITLE_PREFIX}${frame.origin.ruleId}:`);
  // A cap breach only when this is a NEW entry (an update of an existing title never grows the count).
  if (!owned.includes(title) && owned.length >= RULE_MAX_ENTRIES_PER_BOOK) {
    return armError(`rule already owns ${RULE_MAX_ENTRIES_PER_BOOK} entries in book ${action.bookId}`);
  }
  await deps.ops.worldInfo.upsertEntries({
    authorUserId: frame.authorUserId,
    bookId: action.bookId,
    entries: [{ title, keys: [...action.keys], content: rendered.text }],
  });
  return OK;
}

// ── 1.4 surface_quick_reply ─────────────────────────────────────────────────────────────────────────
function runSurfaceQuickReply(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "surface_quick_reply" }>, frame: DispatchFrame): ArmOutcome {
  const choices: { label: string; sendText: string }[] = [];
  for (const choice of action.choices) {
    const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: choice.sendTemplate });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    choices.push({ label: choice.label, sendText: rendered.text });
  }
  // The one MEMBER-visible automation-bus event (04 §5) — rendered display strings, no row (the chips are
  // transient). The `notify` sink is wired at compose to `publishAutomationEvent` (A8b), which fans this to the
  // chat's `automation.stream` subscribers; the client renders it as transient chips above the composer.
  deps.notify({ type: "quickReplySurfaced", chatId: frame.chatId, source: { kind: "rule", ruleId: frame.origin.ruleId }, choices });
  return OK;
}

// ── 1.5 post_notification ─────────────────────────────────────────────────────────────────────────
async function runPostNotification(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "post_notification" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.messageTemplate });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  // The rendered output can expand past the template cap; the `automation-notice` member caps the wire string.
  const message = rendered.text.slice(0, AUTOMATION_NOTICE_MESSAGE_MAX);
  // host = the rule author (v1 authors ARE hosts — 03 §2); all_members = the present human roster.
  const recipients = action.recipient === "host" ? [frame.authorUserId] : await loadPresentHumanMemberIds(deps.db, frame.chatId);
  const source = { kind: "rule", ruleId: frame.origin.ruleId } as const;
  await Promise.all(
    recipients.map((recipientUserId) => deps.ops.notifications.emit({ type: "automation-notice", recipientUserId, chatId: frame.chatId, source, message })),
  );
  return OK;
}

// ── 1.7 generate_image (the /imagine engine — SPEND-classed) ──────────────────────────────────────────
async function runGenerateImage(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "generate_image" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  // The prompt is a template like every arm field (§0); absent ⇒ imagery extracts from chat (a portrait mode).
  let prompt: string | undefined;
  if (action.prompt !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.prompt });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    prompt = rendered.text.length > 0 ? rendered.text : undefined;
  }
  // SPEND gate — debited BEFORE the op (03 §3), against the day ceilings + this rule's in-flight reservations.
  const verdict = await checkSpend(deps.db, { chatId: frame.chatId, nowMs: frame.now, reservedActions: frame.spend.actions(), reservedUsd: frame.spend.usd() });
  if (!verdict.ok) {
    return budgetRefused(verdict.detail);
  }
  const result = await deps.ops.imagery.generatePicture({
    authorUserId: frame.authorUserId,
    chatId: frame.chatId,
    // The firing rule's child depth — compose stamps it onto the non-quiet posted image so the resulting
    // `messageCommitted` fact rides at depth ≥ 1 and a non-opted re-fire is cascade-suppressed (F1 → N1).
    automationDepth: frame.origin.automationDepth,
    mode: action.mode,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(action.negative !== undefined ? { negative: action.negative } : {}),
    n: action.n,
    ...(action.size !== undefined ? { size: action.size } : {}),
    ...(action.subjectCharacterId !== undefined ? { subjectCharacterId: action.subjectCharacterId } : {}),
    useAvatarReference: action.useAvatarReference,
    reuse: action.reuse,
    // The MA-8/D96 diffusion knobs ride through verbatim; the imagery runner honours them only on a local
    // engine (ComfyUI) whose capability advertises them and ignores-with-honesty otherwise (no new warning site).
    ...(action.params !== undefined ? { params: action.params } : {}),
    // 03 §1.7 "one /imagine path": honour `quiet`. `false` (the default) ⇒ the op POSTS the generated image into
    // the chat as a message; `true` ⇒ generate silently (gallery-only). The arm passes the flag; compose owns
    // the single posting seam (imagery has no posting concept).
    quiet: action.quiet,
  });
  frame.spend.add(result.costUsd ?? 0);
  return OK;
}

// ── 1.6 trigger_turn (the gated one — an autonomous chat turn; SPEND-classed) ──────────────────────────
async function runTriggerTurn(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "trigger_turn" }>, frame: DispatchFrame): Promise<ArmOutcome> {
  // The guided steer is a template like every arm field (§0); absent ⇒ no steer.
  let guided: string | undefined;
  if (action.guidedTemplate !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.guidedTemplate });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    guided = rendered.text.length > 0 ? rendered.text : undefined;
  }
  // SPEND gate — debited BEFORE the op (03 §3), against the day ceilings + this rule's in-flight reservations.
  const verdict = await checkSpend(deps.db, { chatId: frame.chatId, nowMs: frame.now, reservedActions: frame.spend.actions(), reservedUsd: frame.spend.usd() });
  if (!verdict.ok) {
    return budgetRefused(verdict.detail);
  }
  // The chat non-human turn seam: `initiator:"automation"` is hardcoded at compose (automation cannot forge a
  // different origin), the funder = the rule author, the funding host is resolved from the ROOM, and the depth =
  // this dispatch's child-depth (`origin.automationDepth`) — stamped on the reply slot so the cascade guard
  // bounds the chain. The engine's D17 consent belt + per-member budget belt enforce INSIDE requestTurn; a
  // by-proxy hosted turn without owner consent (or a lost-authority / depth-cap / gone-chat) THROWS, mapped to a
  // typed `arm_error` here (never a fabricated success — the set_chat_background precedent).
  try {
    const result = await deps.ops.chat.requestTurn({
      authorUserId: frame.authorUserId,
      chatId: frame.chatId,
      automationDepth: frame.origin.automationDepth,
      ...(action.speakerCharacterId !== undefined ? { speakerCharacterId: action.speakerCharacterId } : {}),
      ...(guided !== undefined ? { guided } : {}),
    });
    // A completed turn IS a spend action (counts against `max_spend_actions_per_day` regardless of $) + its
    // metered cost feeds the per-day $ ceiling. `add` bumps the action count even at costUsd 0 (a local turn).
    frame.spend.add(result.costUsd ?? 0);
    return OK;
  } catch (err) {
    return armError(`trigger_turn refused: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 1.8 set_chat_background (BG-F — the /autobg engine: a QUIET LLM pick over the author's owned library) ──
/** The scene hint fed to the pick — the triggering message's content, capped so a long turn can't blow the
 *  quiet prompt. */
const AUTOBG_SCENE_MAX = 1200;
/** Build the model-facing pick prompt: the (capped) scene + the candidate NAMES + an optional rendered
 *  instruction, with a strict "reply with only the name" contract so the returned text matches a choice. */
function buildAutobgPrompt(sceneText: string, names: readonly string[], instruction: string): string {
  const scene = sceneText.slice(0, AUTOBG_SCENE_MAX).trim();
  const lines = [
    "Choose the single background that best fits the current scene.",
    scene.length > 0 ? `Scene:\n${scene}` : "Scene: (no recent text)",
    `Available backgrounds: ${names.join(", ")}`,
    instruction.length > 0 ? `Guidance: ${instruction}` : "",
    "Reply with ONLY the exact name of the chosen background, nothing else.",
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}

async function runSetChatBackground(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "set_chat_background" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  const choices = await deps.ops.chat.listBackgroundChoices(frame.authorUserId);
  // Nothing to pick from — a soft no-op (the author has no owned backgrounds yet), never an error.
  if (choices.length === 0) {
    return OK;
  }
  let instruction = "";
  if (action.instruction !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.instruction });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    instruction = rendered.text;
  }
  const sceneText = frame.fact.message === undefined ? "" : frame.fact.message.content;
  const prompt = buildAutobgPrompt(
    sceneText,
    choices.map((c) => c.name),
    instruction,
  );
  // SPEND gate — the quiet pick is an LLM call (03 §3): debit BEFORE the op against the day ceilings + this
  // rule's in-flight reservations, exactly like `generate_image`. A ceiling breach is a `budget_refused` (the
  // rule stays HEALTHY, no error increment) and no model call fires.
  const verdict = await checkSpend(deps.db, { chatId: frame.chatId, nowMs: frame.now, reservedActions: frame.spend.actions(), reservedUsd: frame.spend.usd() });
  if (!verdict.ok) {
    return budgetRefused(verdict.detail);
  }
  const quiet = await deps.ops.summarizeQuiet({ authorUserId: frame.authorUserId, chatId: frame.chatId, prompt });
  frame.spend.add(quiet.costUsd ?? 0);
  const picked = quiet.text.trim().toLowerCase();
  // Match the model's free-text pick back to a real choice (case/space-insensitive). A miss (an off-list or
  // empty generation) is a SOFT no-op — the model declining to pick a valid name must not error the rule.
  const chosen = choices.find((c) => c.name.trim().toLowerCase() === picked);
  if (chosen === undefined) {
    return OK;
  }
  // The write re-enters chat's host-authority gate under the AUTHOR's Principal (the DEF-11 wall — defense in
  // depth beyond the pre-dispatch `holdsAuthority` check). If the author LOST host authority between that gate
  // and here (a host-handoff race), the verb REFUSES; surface it as a typed `arm_error` (an expected authority
  // outcome that keeps the rule healthy per the taxonomy), never a raw rejection the dispatcher logs as an
  // isolated fault.
  try {
    await deps.ops.chat.setChatBackground({ authorUserId: frame.authorUserId, chatId: frame.chatId, background: chosen.background });
  } catch (err) {
    return armError(`set_chat_background refused: ${err instanceof Error ? err.message : String(err)}`);
  }
  return OK;
}

const TRANSFORM_DRAFT_REFUSAL = "transform_draft applies via the prompt-transform pipeline (A7), not the dispatch engine";
function reservedRefusal(type: string): string {
  return `arm '${type}' is reserved — its domain has not landed`;
}

/** The arm dispatcher (04 §4). Switches on the CLEAN `AutomationActionType` string union (via the local `type`
 *  binding) — NOT `action.type`: biome's `noUnnecessaryConditions` cannot narrow a `z.infer` zod discriminated
 *  union (PROVEN via scratch probes — a 2-member TOY zod discriminatedUnion trips "unreachable" on every case
 *  identically, while a hand-written plain TS union narrows fine; it is NOT the `generate_image` `.extend` as an
 *  earlier note guessed — a trivial inline `generate_image` member reproduced it too), so `switch(action.type)`
 *  reads every case unreachable; tgso narrows correctly. Switching on the bare string union keeps `default: never`
 *  as the exhaustiveness pin (a new action type fails `tsc`) with NO suppression. A mapped-type `Record` (spine
 *  §5.5) is the usual dodge, but its snake_case PROPERTY keys trip `useNamingConvention` — the exact reason a
 *  switch is used here (string-literal `case`s are DATA, not property names). The per-arm `as Extract<>` cast is
 *  the price of not narrowing off `action.type` — sound by construction (each case calls the matching runner). */
function runArm(deps: ArmExecutorDeps, action: AutomationAction, frame: DispatchFrame): Promise<ArmOutcome> {
  const type: AutomationAction["type"] = action.type;
  switch (type) {
    case "set_variable":
      return runSetVariable(deps, action as Extract<AutomationAction, { type: "set_variable" }>, frame);
    case "insert_world_info_entry":
      return runInsertWorldInfo(deps, action as Extract<AutomationAction, { type: "insert_world_info_entry" }>, frame);
    case "surface_quick_reply":
      return Promise.resolve(runSurfaceQuickReply(deps, action as Extract<AutomationAction, { type: "surface_quick_reply" }>, frame));
    case "post_notification":
      return runPostNotification(deps, action as Extract<AutomationAction, { type: "post_notification" }>, frame);
    case "generate_image":
      return runGenerateImage(deps, action as Extract<AutomationAction, { type: "generate_image" }>, frame);
    case "set_chat_background":
      return runSetChatBackground(deps, action as Extract<AutomationAction, { type: "set_chat_background" }>, frame);
    case "trigger_turn":
      return runTriggerTurn(deps, action as Extract<AutomationAction, { type: "trigger_turn" }>, frame);
    // v1-unwired (typed refusal, NOT a stub — the honest not-yet-wired state):
    case "transform_draft":
      return Promise.resolve(armError(TRANSFORM_DRAFT_REFUSAL));
    // reserved arms (createRule refuses them; here for the exhaustiveness pin):
    case "enqueue_crew_workload":
    case "rpg_verb":
    case "force_activate_entries":
      return Promise.resolve(armError(reservedRefusal(type)));
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled automation arm: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Bind the arm dispatcher to its deps (04 §4) — the injected `ArmDispatch` the compose root hands the
 *  automation context (`ctx.runArm`); A5's dispatch invokes it per matched arm. */
export function createArmExecutors(deps: ArmExecutorDeps): ArmDispatch {
  return (action, frame) => runArm(deps, action, frame);
}
