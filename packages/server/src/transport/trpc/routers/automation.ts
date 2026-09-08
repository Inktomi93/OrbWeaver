// transport/trpc/routers/automation — the client-facing surface of the automation LEAF (rule lists + preset
// minting + lifecycle actions + fire logs for chat Rules and the Automation settings pane).
// AUTHORITY FOLLOWS THE RULE'S SCOPE, decided in the domain guard, never here:
//   • a CHAT-scoped rule — `can(principal, "host", {kind:"chat", membership})` over the chat's membership; a
//     non-member collapses to a leak-free NOT_FOUND, a member-not-host propagates `can()`'s FORBIDDEN.
//   • an OWNER-GLOBAL rule (C5) — the caller must BE the author; anyone else gets NOT_FOUND, because that
//     lane is visible to exactly one person and FORBIDDEN would make a rule id an existence oracle.
// Thin: validate the wire schema → `principal: ctx.auth` → the acting verb.
// The preset VOCABULARY is NOT re-spelled here — the wire wrappers reference `@orb/contracts/automation`'s
// preset id + knob schemas (one home per shape — `no-inline-union-redecl`). testRule's optional `sampleEvent`
// (a `TriggerFact`) has no wire schema home — the pane's dry-run synthesizes from the rule's
// trigger, so the wire omits it (the verb's `sampleEvent?` absent path). The per-user global-variable verbs
// are NOT exposed here (this pane is rule-scoped; globals are a later settings surface). Result shapes flow
// to the client via tRPC `inferOutput` — no domain result type (RuleView/FireView/TestRunResult) duplicated.
// THE LIVE FEED IS NOT HERE: the per-chat automation bus folded onto the multiplexed socket at SSE-1 S4 and
// is now the `automation` ROOM (`transport/trpc/stream/sources/automation.ts`) — this router is request/
// response only, and the `single-stream-transport` gate keeps a `.subscription(` from coming back to it.

import {
  AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR,
  AUTOMATION_FIRES_LIST_MAX_LIMIT,
  rulePresetIdSchema,
  rulePresetKnobValuesSchema,
} from "@orb/contracts/automation";
import type { AutomationRuleId, AutomationSuggestionId, ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const automationRouter = t.router({
  // The host-only rule list is position-ordered.
  listRules: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.automation.listRules({ principal: ctx.auth, chatId: input.chatId })),

  setRuleEnabled: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.automation.setRuleEnabled({ principal: ctx.auth, ruleId: input.ruleId, enabled: input.enabled })),

  // RULED F4's per-rule OPT-OUT (spec row B4) — whether a RATE REFUSAL of this rule still offers the host
  // the "run it now?" invitation. Its OWN procedure preserves the rule's mint provenance when the preference
  // flips. Same rule-scoped host gate as `setRuleEnabled`, which is the procedure this one is shaped on.
  setRuleSuggestOnRefusal: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>(), suggestOnRefusal: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.automation.setRuleSuggestOnRefusal({ principal: ctx.auth, ruleId: input.ruleId, suggestOnRefusal: input.suggestOnRefusal }),
    ),

  deleteRule: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.deleteRule({ principal: ctx.auth, ruleId: input.ruleId })),

  // The preset catalogue READ (S3) — the picker's read model: the committed presets projected to
  // id/title/summary/knob descriptors, in catalogue order. Static (no principal/chat/db), but authed: the
  // picker is a host-only surface and the vocabulary is not public. The CEL predicates + arm handlers stay
  // domain-side — only the projection crosses the wire (`@orb/contracts/automation`'s `RulePresetView`).
  listRulePresets: authedProcedure.query(({ ctx }) => ctx.services.automation.listRulePresets()),

  // Mint a preset's ordered RULE SET into a chat (S3). Thin driver: the wire validates the id + the partial
  // knob-override bag SHAPE; the verb resolves the overrides against the named preset's own descriptors (a
  // typed refusal on anything off-shape or out of bounds), substitutes them into the CEL sources as literals,
  // and creates each rule through the EXISTING host-gated `createRule` — so the host gate fires per rule, and
  // every minted rule is born DISABLED. An absent `knobs` takes every descriptor default (exactOptional).
  // `chatId` nullable for the same reason `createRule`'s is — and the verb additionally refuses a chat that
  // DISAGREES with the named preset's own declared scope, in both directions.
  createRuleFromPreset: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>().nullable(), presetId: rulePresetIdSchema, knobs: rulePresetKnobValuesSchema.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.automation.createRuleFromPreset({
        principal: ctx.auth,
        chatId: input.chatId,
        presetId: input.presetId,
        ...(input.knobs === undefined ? {} : { knobs: input.knobs }),
      }),
    ),

  // The dry-run: evaluate the predicate + render every arm's templates, executing NOTHING (the editor's
  // diagnostics surface). The optional sampleEvent is synthesized in the verb from the rule's trigger.
  testRule: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.testRule({ principal: ctx.auth, ruleId: input.ruleId })),

  // R7 — run ONE rule NOW (host-only): a fresh dispatch at depth 0. The TWIN of testRule, not a widening of
  // it: testRule executes NOTHING and stays that way, this one really runs the rule. Its one gate exemption
  // (the engine's fire-rate cap) is argued in the verb; every belt inside the arm's own pipeline still bites.
  runRuleNow: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.runRuleNow({ principal: ctx.auth, ruleId: input.ruleId })),

  // S4 — the suggest/confirm pair (host-only). The suggestion id is the CLAIM handle the card carries: it
  // reaches the client on the host-only `suggestionRaised` bus event and comes back here. Take-once lives in
  // the verb, so a double-click's loser gets NOT_FOUND rather than a second execution.
  confirmSuggestion: authedProcedure
    .input(z.object({ suggestionId: brandedId<AutomationSuggestionId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.confirmSuggestion({ principal: ctx.auth, suggestionId: input.suggestionId })),

  dismissSuggestion: authedProcedure
    .input(z.object({ suggestionId: brandedId<AutomationSuggestionId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.dismissSuggestion({ principal: ctx.auth, suggestionId: input.suggestionId })),

  // The fire-log debug surface (host-only, newest first) — the "why didn't my rule fire" answer.
  listFires: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>(), limit: z.number().int().min(1).max(AUTOMATION_FIRES_LIST_MAX_LIMIT).optional() }))
    .query(({ ctx, input }) =>
      ctx.services.automation.listFires({
        principal: ctx.auth,
        ruleId: input.ruleId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      }),
    ),

  // B11 — the room ACTIVITY read (host-only, newest first): this chat's fire log ACROSS all its rules, the
  // "what happened out-of-band while I was away" surface the chat Activity tab renders. Chat-scoped, so the
  // domain guard is `requireChatHost(chatId)` — a non-member passing a foreign chatId collapses to a leak-free
  // NOT_FOUND, exactly like `listRules`. Same page ceiling as `listFires`.
  listChatActivity: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), limit: z.number().int().min(1).max(AUTOMATION_FIRES_LIST_MAX_LIMIT).optional() }))
    .query(({ ctx, input }) =>
      ctx.services.automation.listChatActivity({
        principal: ctx.auth,
        chatId: input.chatId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      }),
    ),

  // ── C5: the OWNER-GLOBAL lane (the Automation settings pane's three procedures) ──────────────────
  // NONE OF THEM TAKES AN ID, and that is the whole authority story rather than a missing gate: the plane is
  // single-owned (D18), so the scope IS `ctx.auth.userId` and there is no other lane a caller could name.
  // The rule LIFECYCLE verbs the pane also drives (setRuleEnabled / deleteRule / testRule / runRuleNow /
  // listFires) are the SAME procedures the chat surface uses — they take a ruleId and the domain guard
  // answers for its scope, so the pane needs no duplicates of them.

  listOwnerRules: authedProcedure.query(({ ctx }) => ctx.services.automation.listOwnerRules({ principal: ctx.auth })),

  getOwnerBudgets: authedProcedure.query(({ ctx }) => ctx.services.automation.getOwnerBudgets({ principal: ctx.auth })),

  // The owner-wide fire-rate cap (#1430) mirrors the domain verb's authoritative ceiling at the wire edge.
  setOwnerBudgets: authedProcedure
    .input(z.object({ maxFiresPerHour: z.number().int().min(0).max(AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR).optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.automation.setOwnerBudgets({
        principal: ctx.auth,
        ...(input.maxFiresPerHour === undefined ? {} : { maxFiresPerHour: input.maxFiresPerHour }),
      }),
    ),
});
