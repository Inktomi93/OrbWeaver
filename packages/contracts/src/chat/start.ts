import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { rpgGameTemplateSchema } from "../rpg/ruleset.ts";
import { chatInjectionInputSchema } from "./assemble.ts";
import { openingPolicySchema } from "./metadata.ts";

// `startChat` — CREATION-INTENT inputs only (D166). Every client caller creates the real room before
// mounting, so creation-time payloads for roster tuning, group config, room overrides and greeting edits are
// unreachable product surface: those ride their own verbs (`setSeatKnobs`/`setGroupConfig`/
// `setRoomOverrides`/`editMessage`/`setSeededGreeting`) against the real room instead. `opening` EXCLUDES
// `"generate"` — "guide the opening" is an ordinary post-creation `chat.generate` action, never a
// creation-fused turn.
export const startChatSchema = z.strictObject({
  characterIds: z.array(typeIdSchema(ID_PREFIX.character)),
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  title: z.string().nullish(),
  opening: openingPolicySchema.exclude(["generate"]).optional(),
  injections: z.array(chatInjectionInputSchema).optional(),
  // Born ephemeral: persisted so turns can run, hidden from `listChats` ALWAYS, swept by
  // `reapTemporaryChats` once past the caller's own TTL. Creation-only BY DESIGN (a fork is born
  // non-temporary; no verb updates the column), so this is the ONE place the flag can be set.
  temporary: z.boolean().optional(),
  // DRAFT-TIME game start — mints the lite game right after chat creation, BEFORE the opening turn
  // (turn 1 in-game). `ruleset` rides rpg's own setting schema (the trust boundary); omit = `freeform`.
  startAsGame: rpgGameTemplateSchema.optional(),
});

export type StartChatInput = z.output<typeof startChatSchema>;
