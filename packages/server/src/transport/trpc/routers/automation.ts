// transport/trpc/routers/automation — the client-facing surface of the automation LEAF (automation-design/05
// §A8: the rule editor + list/reorder + fire log + budget panel the settings pane consumes). Every verb is
// host-authored room authority in v1 (04 §2): the domain guard gates `can(principal, "host", {kind:"chat",
// roster})` over the chat's membership — a non-member collapses to a leak-free NOT_FOUND, a member-not-host
// propagates `can()`'s FORBIDDEN. Thin: validate the wire schema → `principal: ctx.auth` → the acting verb.
// The trigger/action VOCABULARY is NOT re-spelled here — the wire wrappers reference `@orb/contracts/automation`'s
// `automationTriggerSchema` + `automationActionsSchema` (one home per shape — `no-inline-union-redecl`); the
// scalar rule fields + budget knobs are inline wire wrappers (imagery router precedent). testRule's optional
// `sampleEvent` (a `TriggerFact`) has no wire schema home — the pane's dry-run synthesizes from the rule's
// trigger, so the wire omits it (the verb's `sampleEvent?` absent path). The A3 per-user global-variable verbs
// are NOT exposed here (the §A8 pane is rule-scoped; globals are a later settings surface). Result shapes flow
// to the client via tRPC `inferOutput` — no domain result type (RuleView/FireView/TestRunResult) duplicated.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import { automationActionsSchema, automationTriggerSchema } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { AutomationService } from "#domain/automation";
import { subscribeAutomation } from "../automation-bus";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

/** The one MEMBER-visible automation-bus event (04 §5) — the transient quick-reply chips. Every OTHER event
 *  (ruleFired/ruleErrored/ruleAutoDisabled/rulesChanged) is the host's hidden hand, filtered out below for a
 *  `member`-tier subscriber. */
const MEMBER_VISIBLE_EVENT: AutomationBusEvent["type"] = "quickReplySurfaced";

// The editable rule fields shared by create + update (the PUT-style replace — updateRule re-runs the same
// validation). The trigger + action shapes ride the contract vocabulary; the scalars are wire wrappers. `name`
// is non-empty (the notNull column); its length + the description/predicate bounds are the domain/DB CHECK's
// concern (the verb owns validation — a thin router never re-decides it).
const ruleEditableSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: automationTriggerSchema,
  predicateCel: z.string().nullish(),
  actions: automationActionsSchema,
  matchAutomationEvents: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  maxFiresPerHour: z.number().int().min(0).optional(),
});

export const automationRouter = t.router({
  // The rule list + reorder surface (host-only). listRules is position-ordered; reorderRules is a TOTAL rewrite.
  listRules: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.automation.listRules({ principal: ctx.auth, chatId: input.chatId })),

  reorderRules: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), orderedIds: z.array(brandedId<AutomationRuleId>()) }))
    .mutation(({ ctx, input }) => ctx.services.automation.reorderRules({ principal: ctx.auth, chatId: input.chatId, orderedIds: input.orderedIds })),

  // The rule editor (host-only). createRule is born DISABLED (enabling is the consent act); updateRule replaces
  // the editable field set + resets `consecutive_errors`. Both run the full write-edge validation in the verb
  // (trigger liveness · CEL parse · action shapes/caps/reserved-arm refusal · book attachment · cooldown floor).
  createRule: authedProcedure.input(ruleEditableSchema.extend({ chatId: brandedId<ChatId>() })).mutation(({ ctx, input }) =>
    ctx.services.automation.createRule({
      principal: ctx.auth,
      chatId: input.chatId,
      name: input.name,
      trigger: input.trigger,
      actions: input.actions,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.predicateCel === undefined ? {} : { predicateCel: input.predicateCel }),
      ...(input.matchAutomationEvents === undefined ? {} : { matchAutomationEvents: input.matchAutomationEvents }),
      ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
      ...(input.maxFiresPerHour === undefined ? {} : { maxFiresPerHour: input.maxFiresPerHour }),
    }),
  ),

  updateRule: authedProcedure.input(ruleEditableSchema.extend({ ruleId: brandedId<AutomationRuleId>() })).mutation(({ ctx, input }) =>
    ctx.services.automation.updateRule({
      principal: ctx.auth,
      ruleId: input.ruleId,
      name: input.name,
      trigger: input.trigger,
      actions: input.actions,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.predicateCel === undefined ? {} : { predicateCel: input.predicateCel }),
      ...(input.matchAutomationEvents === undefined ? {} : { matchAutomationEvents: input.matchAutomationEvents }),
      ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
      ...(input.maxFiresPerHour === undefined ? {} : { maxFiresPerHour: input.maxFiresPerHour }),
    }),
  ),

  setRuleEnabled: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.automation.setRuleEnabled({ principal: ctx.auth, ruleId: input.ruleId, enabled: input.enabled })),

  deleteRule: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.deleteRule({ principal: ctx.auth, ruleId: input.ruleId })),

  // The dry-run: evaluate the predicate + render every arm's templates, executing NOTHING (the editor's
  // diagnostics surface). The optional sampleEvent is synthesized in the verb from the rule's trigger.
  testRule: authedProcedure
    .input(z.object({ ruleId: brandedId<AutomationRuleId>() }))
    .mutation(({ ctx, input }) => ctx.services.automation.testRule({ principal: ctx.auth, ruleId: input.ruleId })),

  // The fire-log debug surface (host-only, newest first) — the "why didn't my rule fire" answer.
  listFires: authedProcedure.input(z.object({ ruleId: brandedId<AutomationRuleId>(), limit: z.number().int().min(1).optional() })).query(({ ctx, input }) =>
    ctx.services.automation.listFires({
      principal: ctx.auth,
      ruleId: input.ruleId,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    }),
  ),

  // The per-chat budget panel (host-only). Absent fields keep the current value; `maxUsdPerDay: null` clears
  // the dollar ceiling (local-only setups).
  setBudgets: authedProcedure
    .input(
      z.object({
        chatId: brandedId<ChatId>(),
        maxFiresPerHour: z.number().int().min(0).optional(),
        maxSpendActionsPerDay: z.number().int().min(0).optional(),
        maxUsdPerDay: z.number().min(0).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.automation.setBudgets({
        principal: ctx.auth,
        chatId: input.chatId,
        ...(input.maxFiresPerHour === undefined ? {} : { maxFiresPerHour: input.maxFiresPerHour }),
        ...(input.maxSpendActionsPerDay === undefined ? {} : { maxSpendActionsPerDay: input.maxSpendActionsPerDay }),
        ...(input.maxUsdPerDay === undefined ? {} : { maxUsdPerDay: input.maxUsdPerDay }),
      }),
    ),

  // The budget-panel READ (host-only) — the ceilings + the day spend accumulator the panel renders. Same
  // requireChatHost chokepoint as listRules; an absent budget row projects to the defaulted view.
  getBudgets: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.automation.getBudgets({ principal: ctx.auth, chatId: input.chatId })),

  // The per-chat automation feedback bus (04 §5; the rpg/crew `stream` precedent) — the member-facing home
  // of the transient `surface_quick_reply` chips + (host-only) the rule fire/error/disable events. ONE
  // procedure projecting by caller authority: `resolveStreamAuthority` is the visibility gate (a non-present
  // member throws AutomationChatNotFound → NOT_FOUND before any tail attaches — a user never receives another
  // chat's automation events) AND tells us the tier (`member` sees only the chips; `host` sees everything).
  // No durable resume (the bus is the ephemeral live feed; the chips are transient by design), so events yield
  // with a per-stream ordinal only. `withSubscriptionErrors` converts a thrown domain error into a typed frame.
  stream: authedProcedure.input(z.object({ chatId: brandedId<ChatId>() })).subscription(({ ctx, input, signal }) => {
    const sig = signal ?? new AbortController().signal;
    return withSubscriptionErrors(automationStream(ctx.services.automation, ctx.auth, input.chatId, sig));
  }),
});

/** Resolve the subscriber's authority via `resolveStreamAuthority` (which GATES — a non-member throws
 *  NOT_FOUND) then tail the chat's bus, eliding the host-only events for a `member`-tier subscriber (04 §5). */
async function* automationStream(
  service: AutomationService,
  principal: Principal,
  chatId: ChatId,
  signal: AbortSignal,
): AsyncGenerator<TrackedEnvelope<AutomationBusEvent>> {
  const authority = await service.resolveStreamAuthority({ principal, chatId });
  const isHost = authority === "host";
  let seq = 0;
  for await (const event of subscribeAutomation(chatId, signal)) {
    // A `member`-tier subscriber receives ONLY the room-visible chips; every other event is the host's hidden
    // hand (rule fire/error/disable/config-change), filtered out here per subscriber.
    if (!isHost && event.type !== MEMBER_VISIBLE_EVENT) {
      continue;
    }
    seq += 1;
    yield tracked(String(seq), event);
  }
}
