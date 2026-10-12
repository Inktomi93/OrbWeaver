// Each action spends its author's identity; tool disappearance pauses without consuming the error budget.

import { automationRuleToolViewSchema } from "@orb/contracts/automation";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/inference";
import type { AutomationRuntimeDeps, AutomationRuntimeOps } from "../contract/runtime-ops.ts";

/** Build the action adapters without transferring the author's shelf or the room host's funding. */

export function createAutomationRuntimeOps<TSet>(deps: AutomationRuntimeDeps<TSet>): AutomationRuntimeOps {
  const { imagery, settings, resolveOwnerPrincipal, roleClientsFor } = deps;
  return {
    requestTurn: async (req): ReturnType<AutomationRuntimeOps["requestTurn"]> => {
      const outcome = await deps.requestTurn({
        chatId: req.chatId,
        initiator: "automation",
        triggeredBy: req.authorUserId,
        automationDepth: req.automationDepth,
        timeZone: req.timeZone,
        // The rule is the binding actor: a connection its author bound to it is spent before their own role.
        actor: { kind: "automation-rule", ruleId: req.ruleId },
        ...(req.speakerCharacterId !== undefined ? { speakerCharacterId: req.speakerCharacterId } : {}),
        ...(req.guided !== undefined ? { guided: { action: "response", input: req.guided } } : {}),
      });
      return { messageCount: outcome.messages.length };
    },
    generatePicture: async (req): ReturnType<AutomationRuntimeOps["generatePicture"]> => {
      const caller = await resolveOwnerPrincipal(req.authorUserId);
      const picture = await imagery.generatePicture({
        caller,
        actor: { kind: "automation-rule", ruleId: req.ruleId },
        // C5 — an owner-GLOBAL rule's fire carries NO chat. Imagery's own param is optional and now behaves
        // chat-lessly for the caption modes, so the null maps onto the absent field rather than inventing a
        // room; the automation-side admission matrix is what guarantees only a caption mode gets here.
        ...(req.chatId === null ? {} : { chatId: req.chatId }),
        mode: req.mode,
        n: req.n,
        useAvatarReference: req.useAvatarReference,
        reuse: req.reuse,
        timeZone: req.timeZone,
        ...(req.prompt !== undefined ? { prompt: req.prompt } : {}),
        ...(req.negative !== undefined ? { negative: req.negative } : {}),
        ...(req.size !== undefined ? { size: req.size } : {}),
        ...(req.subjectCharacterId !== undefined ? { subjectCharacterId: req.subjectCharacterId } : {}),
      });
      // ONE /imagine path: the DEFAULT (`quiet:false`) surfaces the image IN-CHAT — otherwise a
      // `generate_image` rule's output is only ever reachable via the gallery. Post through chat's EXISTING
      // server-side image-post seam (`postNarratorMessage`), never a second posting path. `quiet:true` stays
      // store-only (gallery only).
      // The post path needs a room, and a chat-less request cannot reach it: the automation admission matrix
      // refuses a non-quiet `generate_image` on an owner-global rule for exactly this reason, so `chatId`
      // being null here is only ever the quiet lane.
      if (!req.quiet && req.chatId !== null && picture.images.length > 0) {
        // N1 (F1 cascade belt): stamp the posted image's slot with `initiator:"automation"` + the firing rule's
        // cascade depth so its `messageCommitted` fact rides at depth ≥ 1.
        await deps.postNarratorMessage(
          req.chatId,
          req.prompt ?? "",
          picture.images.map((img) => img.assetId),
          { initiator: "automation", automationDepth: req.automationDepth },
        );
      }
      return { imageCount: picture.images.length };
    },
    listBackgroundChoices: async (authorUserId): ReturnType<AutomationRuntimeOps["listBackgroundChoices"]> => {
      const config = (await settings.getUserSettings({ principal: await resolveOwnerPrincipal(authorUserId) })).config;
      return config.appearance.backgroundLibrary.map((entry) => ({
        name: entry.name,
        background: {
          kind: "asset" as const,
          externalUrl: "",
          assetId: entry.assetId,
          assetHash: entry.assetHash,
          mime: entry.mime,
          provenanceUrl: entry.provenanceUrl ?? "",
        },
      }));
    },
    runTool: async ({ authorUserId, chatId, name, argsJson }): ReturnType<AutomationRuntimeOps["runTool"]> => {
      // THE AUTHORITATIVE reachability check, and it is here rather than only at the arm ON PURPOSE. The arm's
      // gate is a UX decision (pause the rule before it does anything); this one is the security boundary, so
      // it must not depend on a caller having asked first — an injected op that trusts its caller is one
      // refactor away from being called by something that never checked. It also closes the TOCTOU: a plugin
      // deactivated between the gate and here answers `unavailable`, which the arm turns back into a PAUSE
      // rather than an error the rule pays for.
      if (!deps.toolUse.isToolDrivableBy(name, authorUserId)) {
        return { ok: false, reason: "unavailable" };
      }
      let set: TSet;
      try {
        // Resolved on the RULE AUTHOR's own shelf (#677): a rule names a tool its author installed, and the
        // gate above already refused anything else. Passing the author here is what makes that structural —
        // with N users' copies of the same plugin resident, a name-only resolve would hand the arm whichever
        // copy happened to register first, i.e. it would spend a stranger's grant on the author's rule.
        set = deps.toolUse.resolveTools(authorUserId, [name]);
      } catch {
        // `resolveTools` THROWS on an unknown name — its documented "at attach time this is OUR wiring bug"
        // posture, which is right for a turn and wrong for this consumer. Reaching it here means the
        // deactivation landed in the microtask between the check above and this line, so it is the same
        // vanished-contributor answer, never a rule fault.
        return { ok: false, reason: "unavailable" };
      }
      const records = await deps.toolUse.executeToolCalls(set, [{ toolCallId: deps.newToolCallId(), name, arguments: argsJson }], {
        // The tool acts AS the rule's author — on their grant, their credentials, their budget. Resolved by
        // ROW READ like every other author→Principal edge in this file; a bare `UserId` carries no authority.
        principal: await resolveOwnerPrincipal(authorUserId),
        triggeredBy: authorUserId,
        chatId,
        // No turn exists — a rule dispatch is not a turn. This is also why turn-scoped first-party tools are
        // not direct-drivable (`tool-use/substrate/reachability.ts` carries the receipts).
        turnId: null,
        // FAIL-CLOSED, deliberately. `roster` feeds the declarative `can()` ceiling, and only capability-NULL
        // tools are drivable today (a plugin tool's real ceiling is its PL-C installer read, which does its
        // own row read and ignores this field), so it is inert. The day a chat-scoped FIRST-PARTY tool
        // becomes drivable, a null roster DENIES it errors-as-data — the safe failure — and whoever widens
        // reachability must load the AUTHOR's real membership here to make it work. Handing over the
        // triggering member's roster instead would be the exact wrong-principal bug PL-C was fixed for.
        membership: null,
      });
      const record = records[0];
      if (record === undefined || record.result === null) {
        // `executeToolCalls` returns one record per call and never throws for a per-call failure, and a null
        // `result` means "not executed" — its recurse-limit case, which a single direct call cannot reach.
        // Either shape is a pipeline anomaly rather than a tool outcome, so it is reported as a FAILURE and
        // never as a fabricated `ok` with an empty string (a rule capturing "" as its tool's answer would be
        // the quiet kind of wrong).
        return { ok: false, reason: "failed", error: `tool '${name}' produced no result record` };
      }
      return record.isError ? { ok: false, reason: "failed", error: record.result } : { ok: true, result: record.result };
    },
    summarizeQuiet: async ({ authorUserId, systemPrompt, prompt, posture, responseFormat }): ReturnType<AutomationRuntimeOps["summarizeQuiet"]> => {
      const rc = await roleClientsFor(authorUserId);
      const sampling = resolveSideGenSampling(SIDE_GEN_POSTURES[posture], await deps.resolveUtilityPresetParams(authorUserId));
      const inputs = [{ systemPrompt, userPrompt: prompt }];
      const res = responseFormat === undefined ? await rc.summarize(inputs, sampling) : await rc.structured(inputs, { ...sampling, responseFormat });
      const item = res.items[0];
      return { text: (item?.text ?? "").trim() };
    },
    listRuleTools: (userId): ReturnType<AutomationRuntimeOps["listRuleTools"]> => {
      const names = deps.toolUse.listDrivableToolNames(userId);
      const resolved = deps.toolUse.resolveTools(userId, names);
      return deps.toolUse
        .toToolDefinitions(resolved)
        .map(({ name, description, parameters }) => automationRuleToolViewSchema.parse({ name, description, parameters }));
    },
  };
}
