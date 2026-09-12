// domain/automation/engine/arm-executors — the ARM DISPATCHER. ONE `runArm` function that switches on
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
// entry/compose — one-directional flow). `trigger_turn` is WIRED (its chat `requestTurn` seam landed) and
// dispatches a real autonomous turn; the sole v1-unwired arm is `transform_draft` (it registers into the prompt
// PIPELINE, it never dispatches here) and the three reserved arms — both return a TYPED REFUSAL, never a
// fabricated success. A refusal is an `arm_error`. The first non-ok outcome aborts the rule's remaining arms
// (dispatch step 5).
//
// `run_tool` (D146) IS DELIBERATELY NARROWER THAN ITS DESIGN, and this note is the correction of record —
// the automation-platform-axes design §3 says "every builtin AND plugin tool becomes an automation action";
// as built, the arm admits PLUGIN-sourced tools owned by the RULE AUTHOR and nothing else. Two receipts, so
// the next reader of that design line finds the reason at the code rather than re-widening it:
//   • the rpg builtins are TURN-SCOPED registrants and already refuse off a turn
//     (`domain/rpg/tools/index.ts` returns early when `exec.turnId === null`), so admitting them would buy an
//     act that can only ever fail — a guaranteed `arm_error` generator, i.e. the exact rot D146-d exists to
//     prevent, arriving through the front door.
//   • the only other builtin is imagery's, and generating an image IS the `generate_image` arm below;
//     admitting it would be two homes for one act, which the constitution merges rather than duplicates.
// THE SANCTIONED WIDENING DOOR is the reachability predicate in `domain/tool-use/substrate/reachability.ts` —
// one predicate, plus the capability ceiling a builtin already declares. Not a new arm, not a second registry,
// and not a special case here.

import type { AutomationAction, AutomationVariableScope, QuickReplyMode } from "@orb/contracts/automation";
import { AUTOMATION_VARIABLE_VALUE_MAX, isConfirmFirstArm } from "@orb/contracts/automation";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { parseCompleteInteger, readVarKey, setVarKey } from "@orb/kit/macro";
import type { RunAnalysisAction } from "../contract/analysis.ts";
import type { ArmDispatch, ArmExecutorDeps, ArmOutcome, DispatchFrame } from "../contract/ops.ts";
import { deleteGlobalVariable, selectGlobalVariable, upsertGlobalVariable } from "../persistence/queries.ts";
import { renderArmTemplate } from "../substrate/macro-render.ts";
import { resolveNotificationRecipients } from "../substrate/notification-recipients.ts";
import { AUTOMATION_SUGGESTION_TTL_MS, summarizeSuggestibleArm } from "../substrate/suggestions.ts";
import { runRunAnalysis } from "./analysis-arm.ts";
import { applyRuleLoreWrite } from "./lore-write.ts";

const DEFAULT_INC_DEC_OPERAND = 1;

const OK: ArmOutcome = { ok: true };
function armError(detail: string): ArmOutcome {
  return { ok: false, kind: "arm_error", detail };
}
/** D146-d — the arm's CONTRIBUTOR is not available to this rule's author right now. Distinct from
 *  {@link armError} in exactly one way that matters: it spends no error budget, so a plugin the owner turned
 *  off cannot rot the rules that name its tools. Only `run_tool` can produce it, and it carries no detail
 *  because a pause writes no fire row — there is nowhere for one to go. */
const PAUSED_ARM: ArmOutcome = { ok: false, kind: "paused" };

/** C5 — THE SECOND BELT on a chat-required arm: a typed refusal when the frame has no room.
 *
 *  The FIRST belt is the mint (`substrate/validate.ts`'s owner-global admission matrix, driven by the
 *  contracts `AUTOMATION_ARM_SCOPE` Record), which refuses these arms on a chat-less rule so no such rule is
 *  ever stored. This exists anyway, and for the same reason `set_chat_background` re-enters chat's host gate
 *  after `holdsAuthority` already passed (the DEF-11 wall): a non-null assertion here would be a claim about
 *  a validator two modules away, and the day a new mint path forgets a row the failure would be a crash in
 *  the fire-and-forget bus handler instead of one rule's honest `action_error`. Costing one comparison to
 *  make an entire class of mistake un-crashable is the trade the house takes every time. */
function chatRequiredRefusal(type: AutomationAction["type"]): ArmOutcome {
  // @orb-waive no-hardcoded-model-prose(the): a HOST-facing typed refusal read on the fire log, never bytes that reach a model — the prose catalogue is for strings a host may re-author into a PROMPT, and this one exists to repeat what the mint already said. Same for the three sibling refusals below.
  return armError(`the '${type}' action needs a chat and this rule is owner-global`);
}

// ── 1.1 set_variable ──────────────────────────────────────────────────────────────────────────────

/** Resolve the final value string for a `set`/`inc`/`dec` op given the current value + the rendered operand,
 *  or NULL when either input is not a complete integer (the caller turns that into an `arm_error`).
 *  `inc`/`dec` compute against the CURRENT value (the standalone chat-fold cache or the author's global) — the
 *  VarOp vocabulary's `inc`/`dec` are ±1 only, so an operand-bearing inc/dec resolves to a computed `set`.
 *
 *  BOTH INPUTS ARE VALIDATED, NOT COERCED (#1420). An absent operand is the arm's documented default of 1 and
 *  reaches here as the rendered `"1"`; an operand the author wrote and mis-spelled used to collapse to that
 *  SAME 1, so a typo was indistinguishable from writing nothing. And a non-numeric CURRENT value used to mean
 *  0 — silently rebasing a counter off whatever a `set` arm or a plugin had put in the variable. Both are now
 *  refusals the host reads on the fire log. (An ABSENT variable is still 0: the call site passes `"0"` for it,
 *  which is a fresh counter rather than a corrupt one.) */
function resolveNumericValue(op: "inc" | "dec", current: string, operandText: string): string | null {
  const operand = parseCompleteInteger(operandText);
  const base = parseCompleteInteger(current);
  if (operand === null || base === null) {
    return null;
  }
  return String(op === "inc" ? base + operand : base - operand);
}

/** THE ONE variable-WRITE seam an arm uses (`set_variable` writes here; `run_tool` captures its result here).
 *
 *  WRITE-THROUGH is the load-bearing half and it is why this is a shared helper rather than two similar
 *  blocks: arms mutate the SHARED env and ORDER IS SEMANTICS. The CEL env is built once per chat per dispatch
 *  BATCH and cached, so a DB-only write is invisible to later arms in this rule AND to later rules on the same
 *  chat in this batch — predicates, `inc`/`dec` and every template read `env.vars`. Mirroring the value onto
 *  the cached map is what makes "order is semantics" true instead of aspirational (it was false once, and a
 *  later `inc` read the stale pre-write value). The GLOBAL plane needs no mirror: globals are not env-cached,
 *  so they already compose across arms by being re-read. */
async function writeArmVariable(
  deps: ArmExecutorDeps,
  frame: DispatchFrame,
  args: { readonly scope: AutomationVariableScope; readonly key: string; readonly value: string },
): Promise<ArmOutcome> {
  const { scope, key, value } = args;
  const chatId = frame.chatId;
  if (scope === "chat") {
    // C5's PLANE belt, the second one. The `chat` variable plane IS a room's fold, so a chat-less rule has
    // nowhere to write it; the mint already refuses this configuration (the per-arm refinement the per-TYPE
    // scope Record structurally cannot express), and reaching here anyway earns the SAME typed refusal every
    // other unrunnable arm gets rather than a silent no-op — a variable write that quietly did not happen is
    // the worst of the three possible answers, because the next arm's `inc` composes on top of it.
    if (chatId === null) {
      // @orb-waive no-hardcoded-model-prose(the): a host-facing typed refusal (see `chatRequiredRefusal`), never model-facing bytes.
      return armError(`the '${scope}' variable plane needs a chat and this rule is owner-global`);
    }
    const ops: readonly VarOp[] = [{ op: "set", key, value }];
    await deps.ops.chat.applyVariableOps(chatId, ops);
    // The shared env is the plane's IN-MEMORY half; `setVarKey` is its own-key writer (`@orb/kit/macro` —
    // one home with the durable fold, #1564), because a `__proto__` key written with property syntax lands
    // nowhere and the next arm's read composes on a value that does not exist.
    setVarKey(frame.env.vars, key, value);
    return OK;
  }
  await upsertGlobalVariable(deps.db, { ownerId: frame.authorUserId, key, value, updatedAt: frame.now });
  return OK;
}

/** The `inc`/`dec` half of `set_variable`, split out so the arm's own body stays one decision deep.
 *
 *  It computes against the CURRENT value. Chat scope reads the SHARED env `vars` (so an earlier arm's write in
 *  this same batch composes — `[set hp=5, inc hp]` ⇒ 6); global scope reads the DB fresh (globals aren't
 *  env-cached, so they already compose across arms). An ABSENT variable is a fresh counter at 0; a variable
 *  holding something that is not a whole number is a REFUSAL, not a silent rebase (#1420). */
async function runIncDec(
  deps: ArmExecutorDeps,
  frame: DispatchFrame,
  args: { readonly scope: AutomationVariableScope; readonly key: string; readonly op: "inc" | "dec"; readonly operandText: string },
): Promise<ArmOutcome> {
  const { scope, key, op, operandText } = args;
  // OWN-key read (#1564). `frame.env.vars[key]` for the key `__proto__` answers `Object.prototype` on any
  // plane that does not already own it — an OBJECT where the rest of this function needs a string, which
  // turned a legal variable name into `current.trim is not a function` and a generic `action_error`.
  const current = scope === "chat" ? (readVarKey(frame.env.vars, key) ?? "0") : ((await selectGlobalVariable(deps.db, frame.authorUserId, key)) ?? "0");
  const value = resolveNumericValue(op, current, operandText);
  if (value === null) {
    // It names BOTH operands because either one can be the bad half.
    // @orb-waive no-hardcoded-model-prose(needs): a host-facing typed refusal read on the fire log (see `chatRequiredRefusal`), never model-facing bytes.
    return armError(`'${op}' needs whole numbers: operand '${operandText}' on current value '${current}'`);
  }
  return await writeArmVariable(deps, frame, { scope, key, value });
}

async function runSetVariable(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "set_variable" }>, frame: DispatchFrame): Promise<ArmOutcome> {
  const { scope, key, op } = action;
  const chatId = frame.chatId;
  if (op === "delete") {
    if (scope === "chat") {
      if (chatId === null) {
        // @orb-waive no-hardcoded-model-prose(the): a host-facing typed refusal (see `chatRequiredRefusal`), never model-facing bytes.
        return armError(`the '${scope}' variable plane needs a chat and this rule is owner-global`);
      }
      await deps.ops.chat.applyVariableOps(chatId, [{ op: "delete", key }]);
      // WRITE-THROUGH, the delete half (`writeArmVariable` states the rule for the set half): mirror the
      // delete onto the shared in-memory `vars` too, so a later `has()` in this batch is false.
      // `Reflect.deleteProperty`, never the bare `delete` operator (#1571) — `kit/macro/variables.ts`'s own
      // `applyVarOp` states why: house style bans it, and it is what keeps that file's "property syntax is
      // not used on this plane anywhere" claim actually true rather than one this call site quietly broke.
      Reflect.deleteProperty(frame.env.vars, key);
    } else {
      await deleteGlobalVariable(deps.db, frame.authorUserId, key);
    }
    return OK;
  }

  // `value` is a TEMPLATE (required for set; the operand for inc/dec, default "1").
  const rendered = renderArmTemplate({
    env: frame.env,
    chatScoped: chatId !== null,
    nowMs: frame.now,
    prng: deps.prng,
    template: action.value ?? String(DEFAULT_INC_DEC_OPERAND),
  });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  if (op === "set") {
    return await writeArmVariable(deps, frame, { scope, key, value: rendered.text });
  }
  return await runIncDec(deps, frame, { scope, key, op, operandText: rendered.text });
}

// ── 1.3 insert_world_info_entry ─────────────────────────────────────────────────────────────────────
// The BELTS (attach gate · per-rule entry cap · ruleId-namespaced title) live in the ONE lore-write home
// (`engine/lore-write.ts`) shared with the `run_analysis` lore route — this executor's own half is the
// HOST-authored template render (host text is macro-legal; the analysis route's model text is neutralized
// instead, at its own boundary).
async function runInsertWorldInfo(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "insert_world_info_entry" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  const rendered = renderArmTemplate({
    env: frame.env,
    chatScoped: frame.chatId !== null,
    nowMs: frame.now,
    prng: deps.prng,
    template: action.contentTemplate,
  });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  const written = await applyRuleLoreWrite(deps, {
    authorUserId: frame.authorUserId,
    chatId: frame.chatId,
    ruleId: frame.origin.ruleId,
    bookId: action.bookId,
    entries: [{ entryKey: action.entryKey, keys: action.keys, content: rendered.text }],
  });
  return written.ok ? OK : armError(written.refused);
}

// ── 1.4 surface_quick_reply ─────────────────────────────────────────────────────────────────────────
function runSurfaceQuickReply(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "surface_quick_reply" }>, frame: DispatchFrame): ArmOutcome {
  const chatId = frame.chatId;
  if (chatId === null) {
    return chatRequiredRefusal(action.type);
  }
  const choices: { label: string; sendText: string; mode: QuickReplyMode }[] = [];
  for (const choice of action.choices) {
    const rendered = renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: choice.sendTemplate });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    // `mode` travels VERBATIM from the authored choice to the member's surface — it is the author's
    // send-vs-compose declaration (the diegetic-chip authoring law's only lever), not a render product.
    choices.push({ label: choice.label, sendText: rendered.text, mode: choice.mode });
  }
  // The one MEMBER-visible automation-bus event — rendered display strings, no row (the chips are
  // transient). The `notify` sink is wired at compose to `publishAutomationEvent`, which fans this to the
  // chat's `automation.stream` subscribers; the client renders it as transient chips above the composer.
  deps.notify({ type: "quickReplySurfaced", chatId, source: { kind: "rule", ruleId: frame.origin.ruleId }, choices });
  return OK;
}

// ── 1.5 post_notification ─────────────────────────────────────────────────────────────────────────
async function runPostNotification(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "post_notification" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  const chatId = frame.chatId;
  if (chatId === null) {
    return chatRequiredRefusal(action.type);
  }
  const rendered = renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: action.messageTemplate });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  // The rendered output can expand past the template cap; the `automation-notice` member caps the wire string.
  const message = rendered.text.slice(0, AUTOMATION_NOTICE_MESSAGE_MAX);
  // The recipient AXIS is resolved in its ONE home (`substrate/notification-recipients`), exhaustively — this
  // was a binary ternary until C6, and a third member would have fallen silently into the all-members branch.
  // host = the rule author (v1 authors ARE hosts). The ACTOR is the triggering fact's message author, which is
  // why the async-nudge preset rides `messageCommitted`: a `turnCompleted` fact carries no `message`, so under
  // it `frame.fact.message` is absent and the actor-excluding member would spare nobody.
  const recipients = await resolveNotificationRecipients(deps.db, {
    recipient: action.recipient,
    chatId,
    hostUserId: frame.authorUserId,
    actorUserId: frame.fact.message?.authorUserId ?? null,
  });
  const source = { kind: "rule", ruleId: frame.origin.ruleId } as const;
  await Promise.all(recipients.map((recipientUserId) => deps.ops.notifications.emit({ type: "automation-notice", recipientUserId, chatId, source, message })));
  return OK;
}

// ── 1.7 generate_image (the /imagine engine) ───────────────────────────────────────────────────────────
async function runGenerateImage(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "generate_image" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  // The prompt is a template like every arm field; absent ⇒ imagery extracts from chat (a portrait mode).
  let prompt: string | undefined;
  if (action.prompt !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, chatScoped: frame.chatId !== null, nowMs: frame.now, prng: deps.prng, template: action.prompt });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    prompt = rendered.text.length > 0 ? rendered.text : undefined;
  }
  // THE SUBJECT, and where it comes from when the arm did not name one. An arm's `subjectCharacterId` is a
  // literal fixed at authoring, which is fine for a room rule pointed at one character — and useless to the
  // owner-global lane, whose whole point is "illustrate WHICHEVER character just changed". So an arm with no
  // authored subject inherits the TRIGGERING FACT's character when the fact has one. It is the same class of
  // read every other arm already does off the fact (`set_chat_background` takes its scene from
  // `fact.message.content`; `post_notification` takes its actor from `fact.message.authorUserId`), and it is
  // safe on the global lane specifically because the dispatch has already proven this author OWNS that
  // character (`runGates`' subject gate) — otherwise this line would caption a stranger's avatar.
  const subjectCharacterId = action.subjectCharacterId ?? (frame.fact.character === undefined ? undefined : castId<CharacterId>(frame.fact.character.id));
  await deps.ops.imagery.generatePicture({
    authorUserId: frame.authorUserId,
    chatId: frame.chatId,
    // The firing rule's child depth — compose stamps it onto the non-quiet posted image so the resulting
    // `messageCommitted` fact rides at depth ≥ 1 and a non-opted re-fire is cascade-suppressed.
    automationDepth: frame.origin.automationDepth,
    mode: action.mode,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(action.negative !== undefined ? { negative: action.negative } : {}),
    n: action.n,
    ...(action.size !== undefined ? { size: action.size } : {}),
    ...(subjectCharacterId !== undefined ? { subjectCharacterId } : {}),
    useAvatarReference: action.useAvatarReference,
    reuse: action.reuse,
    // ONE /imagine path: honour `quiet`. `false` (the default) ⇒ the op POSTS the generated image into
    // the chat as a message; `true` ⇒ generate silently (gallery-only). The arm passes the flag; compose owns
    // the single posting seam (imagery has no posting concept).
    quiet: action.quiet,
  });
  return OK;
}

// ── 1.6 trigger_turn (an autonomous chat turn) ─────────────────────────────────────────────────────────
async function runTriggerTurn(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "trigger_turn" }>, frame: DispatchFrame): Promise<ArmOutcome> {
  const chatId = frame.chatId;
  if (chatId === null) {
    return chatRequiredRefusal(action.type);
  }
  // The guided steer is a template like every arm field; absent ⇒ no steer.
  let guided: string | undefined;
  if (action.guidedTemplate !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: action.guidedTemplate });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    guided = rendered.text.length > 0 ? rendered.text : undefined;
  }
  // The chat non-human turn seam: `initiator:"automation"` is hardcoded at compose (automation cannot forge a
  // different origin), the funder = the rule author, the funding host is resolved from the ROOM, and the depth =
  // this dispatch's child-depth (`origin.automationDepth`) — stamped on the reply slot so the cascade guard
  // bounds the chain. LOOP SAFETY rides INSIDE requestTurn: the engine's D17 consent belt + the per-member turn
  // RATE budget + the cascade-depth guard. A by-proxy hosted turn without owner consent (or a lost-authority /
  // depth-cap / gone-chat) THROWS, mapped to a typed `arm_error` here (never a fabricated success).
  try {
    await deps.ops.chat.requestTurn({
      authorUserId: frame.authorUserId,
      chatId,
      automationDepth: frame.origin.automationDepth,
      ...(action.speakerCharacterId !== undefined ? { speakerCharacterId: action.speakerCharacterId } : {}),
      ...(guided !== undefined ? { guided } : {}),
    });
    return OK;
  } catch (err) {
    return armError(`trigger_turn refused: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 1.8 set_chat_background (BG-F — the /autobg engine: a QUIET LLM pick over the author's owned library) ──
/** The scene hint fed to the pick — the triggering message's content, capped so a long turn can't blow the
 *  quiet prompt. */
const AUTOBG_SCENE_MAX = 1200;
// The /autobg SYSTEM prompt moved here from compose when `summarizeQuiet` generalized (C1) and became the
// `automation.autobg.system` PROSE-1 slot in the same move — the domain owns its prompt text, hosts own
// its bytes, compose owns only the wire.
/** Build the model-facing pick prompt: the (capped) scene + the candidate NAMES + an optional rendered
 *  instruction, framed by the two authored PROSE-1 clauses (census 91) — the task lead and the strict
 *  "reply with only the name" contract the name-match depends on. The `Scene:`/`Available backgrounds:`/
 *  `Guidance:` labels are the prompt's grammar (spec §2.11) and stay here. */
function buildAutobgPrompt(prose: ProseOverrides, sceneText: string, names: readonly string[], instruction: string): string {
  const scene = sceneText.slice(0, AUTOBG_SCENE_MAX).trim();
  const lines = [
    resolveProseText("automation.autobg.task", prose),
    scene.length > 0 ? `Scene:\n${scene}` : "Scene: (no recent text)",
    `Available backgrounds: ${names.join(", ")}`,
    instruction.length > 0 ? `Guidance: ${instruction}` : "",
    resolveProseText("automation.autobg.reply", prose),
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}

async function runSetChatBackground(
  deps: ArmExecutorDeps,
  action: Extract<AutomationAction, { type: "set_chat_background" }>,
  frame: DispatchFrame,
): Promise<ArmOutcome> {
  const chatId = frame.chatId;
  if (chatId === null) {
    return chatRequiredRefusal(action.type);
  }
  const choices = await deps.ops.chat.listBackgroundChoices(frame.authorUserId);
  // Nothing to pick from — a soft no-op (the author has no owned backgrounds yet), never an error.
  if (choices.length === 0) {
    return OK;
  }
  let instruction = "";
  if (action.instruction !== undefined) {
    const rendered = renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: action.instruction });
    if (rendered.error !== undefined) {
      return armError(rendered.error);
    }
    instruction = rendered.text;
  }
  const sceneText = frame.fact.message === undefined ? "" : frame.fact.message.content;
  const prose = await deps.ops.chat.resolveChatProse(chatId);
  const prompt = buildAutobgPrompt(
    prose,
    sceneText,
    choices.map((c) => c.name),
    instruction,
  );
  const quiet = await deps.ops.summarizeQuiet({
    authorUserId: frame.authorUserId,
    chatId,
    systemPrompt: resolveProseText("automation.autobg.system", prose),
    prompt,
    posture: "autobg",
  });
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
    await deps.ops.chat.setChatBackground({ authorUserId: frame.authorUserId, chatId, background: chosen.background });
  } catch (err) {
    return armError(`set_chat_background refused: ${err instanceof Error ? err.message : String(err)}`);
  }
  return OK;
}

// ── 1.9 run_tool (D146 — the CONTRIBUTOR bridge arm) ────────────────────────────────────────────────────
/** Run a registered tool by name as the rule's AUTHOR, optionally capturing its result into a variable.
 *
 *  D146 clause (a): this arm IS the closed/open boundary. The union member is first-party and `tsc`-forced;
 *  `action.name` is the open-world contributor name. Nothing downstream of here dispatches on that string —
 *  it is data handed to the registry, which is what keeps every exhaustive switch in this file finite.
 *
 *  D146 clause (d): an `unavailable` outcome PAUSES the rule instead of erroring it. The rule passed the mint
 *  gate, so the name WAS drivable once; `unavailable` therefore means the contributor went away — a disabled,
 *  upgraded or uninstalled plugin, which is ordinary user action and not a fault. Note that `runGates` already
 *  pauses the rule BEFORE any arm runs, so reaching this branch means the plugin was deactivated inside the
 *  window between that gate and this call; it pauses identically rather than charging the race to the rule.
 *
 *  WHAT THIS ARM MAY NOT DO, stated so it stays true: the result is DATA returned to the arm. It may land in a
 *  variable and it may reach the model through a LATER turn's ordinary assembly of that variable — it may
 *  never be inserted as a message. There is no message-write op on `AutomationOps.tools` and adding one would
 *  cross the class-1 wall, not extend this arm.
 *
 *  THE AUTHORITY MODEL, in one place. Nothing here decides authority; it names WHO acts and lets each existing
 *  gate answer for itself: the rule's author (already re-checked as the chat's HOST by `runGates`) is the
 *  invoking principal, the registry re-checks that the tool is one THEY installed
 *  (`tool-use/substrate/reachability.ts` — a room-mate's plugin is not drivable by naming it), and a plugin
 *  tool's own PL-C ceiling then re-reads the INSTALLER's present role in this chat before the guest runs.
 *  Three belts, three owners, none of them this file's to re-implement. */
async function runRunTool(deps: ArmExecutorDeps, action: Extract<AutomationAction, { type: "run_tool" }>, frame: DispatchFrame): Promise<ArmOutcome> {
  // The args are a TEMPLATE like every arm field — rendered in the author's env, at fire time, once.
  const rendered = renderArmTemplate({ env: frame.env, chatScoped: frame.chatId !== null, nowMs: frame.now, prng: deps.prng, template: action.argsTemplate });
  if (rendered.error !== undefined) {
    return armError(rendered.error);
  }
  const outcome = await deps.ops.tools.runTool({
    authorUserId: frame.authorUserId,
    chatId: frame.chatId,
    name: action.name,
    argsJson: rendered.text,
  });
  if (!outcome.ok) {
    return outcome.reason === "unavailable" ? PAUSED_ARM : armError(`run_tool '${action.name}' failed: ${outcome.error}`);
  }
  if (action.resultVar !== undefined) {
    // TRUNCATED at the variable plane's own bound: the result is a CONTRIBUTOR's bytes, and this value rides
    // the cached CEL env into every later predicate and template render on this chat. A tool returning more
    // than the plane holds is misusing the channel — capture what fits and keep the rule healthy rather than
    // failing an invocation that actually succeeded.
    return await writeArmVariable(deps, frame, {
      scope: action.resultScope,
      key: action.resultVar,
      value: outcome.result.slice(0, AUTOMATION_VARIABLE_VALUE_MAX),
    });
  }
  return OK;
}

const TRANSFORM_DRAFT_REFUSAL = "transform_draft applies via the prompt-transform pipeline, not the dispatch engine";

// ── S4 — the confirm-first STASH (interaction-direction-spec §3-S4) ───────────────────────────────────
/** Hold a confirm-first arm as a pending ask instead of running it, and raise the host-only card event.
 *
 *  WHAT IS STORED, and why both halves: the ARM and the FRAME it resolved in. "Executes the STORED arm" is
 *  literal — the confirmed run must be the SAME act the host was shown, under the SAME author, cascade
 *  origin and `env` snapshot. Re-deriving a frame at confirm time would quietly execute a different act than
 *  the card described. The staleness that buys is the confirm class's ACKNOWLEDGED cost (the invitation
 *  class exists precisely because a pre-predicate refusal has no frame to stash) and is bounded by the TTL
 *  plus the confirm-time re-checks: rule still enabled, author still host.
 *
 *  REPLACE-PER-`(chatId, ruleId)` is the store's (RULED F1): a cadence rule that fires every beat keeps ONE
 *  live ask, so the band's one-visible-card budget is bounded by rule count, not by fire rate. */
function stashConfirmFirstArm(
  deps: ArmExecutorDeps,
  action: AutomationAction,
  frame: DispatchFrame,
  continuation: readonly AutomationAction[],
): ArmOutcome | null {
  if (!isConfirmFirstArm(action)) {
    return null;
  }
  const chatId = frame.chatId;
  // C5 — an owner-GLOBAL rule cannot ASK. The pending store keys its replace-per-kind slot on `(chatId,
  // source)`, the card rides the per-CHAT automation bus, and the confirm verb gates the chat's HOST: an ask
  // with no room is unanswerable in all three. The mint refuses `confirmFirst` on a chat-less rule for
  // exactly this reason, so reaching here means a stored rule got past that — refuse it typed rather than
  // stash a card that nothing could ever confirm and that the TTL would silently eat.
  if (chatId === null) {
    // @orb-waive no-hardcoded-model-prose(cannot): a host-facing typed refusal (see `chatRequiredRefusal`), never model-facing bytes.
    return armError(`'${action.type}' cannot ask first on an owner-global rule — a confirm card is raised in a room, to its host`);
  }
  const id = deps.newSuggestionId();
  const expiresAt = frame.now + AUTOMATION_SUGGESTION_TTL_MS;
  const summary = summarizeSuggestibleArm(action);
  const source = { kind: "rule", ruleId: frame.origin.ruleId } as const;
  deps.suggestions.raise({
    id,
    kind: "confirm",
    chatId,
    source,
    actorUserId: frame.authorUserId,
    summary,
    expiresAt,
    payload: { via: "arm", stashed: { action, frame, continuation } },
  });
  deps.notify({ type: "suggestionRaised", chatId, source, suggestionId: id, kind: "confirm", summary, expiresAt });
  // `suggested` is what keeps the fire log honest: the rule's remaining arms still run, but its TERMINAL
  // records no `fired` row, because nothing fired — a host was asked.
  return { ok: true, suggested: true };
}

/** The arm dispatcher. Switches on the CLEAN `AutomationActionType` string union (via the local `type`
 *  binding) — NOT `action.type`: biome's `noUnnecessaryConditions` cannot narrow a `z.infer` zod discriminated
 *  union (PROVEN via scratch probes — a 2-member TOY zod discriminatedUnion trips "unreachable" on every case
 *  identically, while a hand-written plain TS union narrows fine; it is NOT the `generate_image` `.extend` as an
 *  earlier note guessed — a trivial inline `generate_image` member reproduced it too), so `switch(action.type)`
 *  reads every case unreachable; tgso narrows correctly. Switching on the bare string union keeps `default: never`
 *  as the exhaustiveness pin (a new action type fails `tsc`) with NO suppression. A mapped-type `Record` (spine
 *  §5.5) is the usual dodge, but its snake_case PROPERTY keys trip `useNamingConvention` — the exact reason a
 *  switch is used here (string-literal `case`s are DATA, not property names). The per-arm `as Extract<>` cast is
 *  the price of not narrowing off `action.type` — sound by construction (each case calls the matching runner). */
function runArm(deps: ArmExecutorDeps, action: AutomationAction, frame: DispatchFrame, continuation: readonly AutomationAction[] = []): Promise<ArmOutcome> {
  const type: AutomationAction["type"] = action.type;
  // S4 — THE CONFIRM-FIRST CHOKEPOINT, deliberately ahead of the switch: an arm that asked to be confirmed
  // never reaches its executor on a fire. It STASHES itself (arm + frame + `continuation`, #1553 OWNER
  // RULING) and returns `ok` — the ARMS BEHIND IT wait on the same ask rather than running now or being
  // dropped (`verbs/confirm-suggestion.ts::executeStashedArm` runs the continuation once the host confirms).
  // The confirm verb feeds the stored arm back through THIS function with the flag CLEARED (`armToExecute`),
  // so a confirmed arm reaches its real executor and can never re-stash itself into a loop.
  // The predicate lives INSIDE the helper (rather than as a type guard here) on purpose: narrowing `action`
  // at this scope would subtract the four suggestible arms from the union the switch below casts against,
  // and every one of those casts would stop overlapping.
  const stashed = stashConfirmFirstArm(deps, action, frame, continuation);
  if (stashed !== null) {
    return Promise.resolve(stashed);
  }
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
    case "run_analysis": {
      // The one chat-required arm whose ENGINE is narrowed by TYPE rather than by a check at each read: the
      // scope gate happens here, once, and everything downstream takes a `ChatScopedDispatchFrame`.
      const chatId = frame.chatId;
      return chatId === null ? Promise.resolve(chatRequiredRefusal(type)) : runRunAnalysis(deps, action as RunAnalysisAction, { ...frame, chatId });
    }
    case "run_tool":
      return runRunTool(deps, action as Extract<AutomationAction, { type: "run_tool" }>, frame);
    // v1-unwired (typed refusal, NOT a stub — the honest not-yet-wired state):
    case "transform_draft":
      return Promise.resolve(armError(TRANSFORM_DRAFT_REFUSAL));

    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled automation arm: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Bind the arm dispatcher to its deps — the injected `ArmDispatch` the compose root hands the
 *  automation context (`ctx.runArm`); the dispatch invokes it per matched arm. */
export function createArmExecutors(deps: ArmExecutorDeps): ArmDispatch {
  return (action, frame, continuation = []) => runArm(deps, action, frame, continuation);
}
