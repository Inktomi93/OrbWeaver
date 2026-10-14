import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { rpgGameTemplateSchema } from "../rpg/ruleset.ts";
import { chatInjectionInputSchema } from "./assemble.ts";
import { openingPolicySchema } from "./metadata.ts";

// `startChat` — CREATION-INTENT inputs only (D166). The former
// nine-field "draft carry" (seedGreetings/rosterOverrides/groupConfig/roomOverrides/guided, plus the
// `generate` opening arm + its `openingFailure` degrade) is GONE: R1 made every client caller create the
// real room before mounting, so those creation-time payloads were unreachable product surface. Post-create
// roster tuning, group config, room overrides and greeting edits ride their own already-built verbs
// (`setSeatKnobs`/`setGroupConfig`/`setRoomOverrides`/`editMessage`/`setSeededGreeting`) against the real
// room instead. `opening` EXCLUDES `"generate"` — "guide the opening" is now an ordinary post-creation
// `chat.generate` action against the real room, never a creation-fused turn.
export const startChatSchema = z.object({
  characterIds: z.array(typeIdSchema(ID_PREFIX.character)),
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  title: z.string().nullish(),
  opening: openingPolicySchema.exclude(["generate"]).optional(),
  injections: z.array(chatInjectionInputSchema).optional(),
  // ST "Temporary Chat" — born ephemeral: persisted so turns can run, hidden from `listChats`
  // ALWAYS, swept by `reapTemporaryChats` once past the caller's own TTL. Creation-only BY DESIGN (a fork
  // is born non-temporary; no verb updates the column), so this is the ONE place the flag can be set.
  temporary: z.boolean().optional(),
  // #40 DRAFT-TIME game start — mints the lite game right after chat creation, BEFORE the opening turn
  // (turn 1 in-game). `ruleset` rides rpg's own setting schema (the trust boundary); omit = `freeform`.
  startAsGame: rpgGameTemplateSchema.optional(),
});

export type StartChatInput = z.output<typeof startChatSchema>;
