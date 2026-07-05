// @orb/contracts/persona — the persona wire schemas (create / update / metadata).
//
// Cross-boundary: the tRPC router validates against these AND the client form runs the same schemas, so
// client and server can never disagree about what's valid. The PURE half — the placement tuple
// (`PERSONA_DESCRIPTION_POSITIONS`) + `resolvePersonaDescriptionPlacement` — lives in `@orb/kit/persona`;
// this node imports the tuple DOWN and wraps it in `z.enum`, the kit↔contracts tuple rule
// (shared-dissolution §5).
//
// DAG ROOT (ledger D32): persona no longer imports `@orb/contracts/world-info`. The `{depth, role}` inject
// shape comes from `@orb/kit/injection` and the role axis from `@orb/kit/message-role` — the SHARED
// neutral primitives every injector uses — NOT from world-info (that would re-create the dissolved
// persona→world-info edge).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 100_000;

// assistant @ depth 0 = a trailing assistant message = response PREFILL — unsupported across providers
// (the SAME write guard world-info + chat injections apply). The role is pinned to the canonical
// `MessageRole` axis (`@orb/kit/message-role`) so it can never drift from the union.
const PREFILL_ROLE: MessageRole = "assistant";
const PREFILL_DEPTH = 0;

// Persona metadata blob (READ shape): load-bearing placement fields + a loose tail (extras a future
// feature may stash ride through untouched, mirroring `worldEntries.metadata`). `descriptionPosition`
// drives the in-prompt-vs-at-depth-vs-none decision; `inject` carries the at-depth `{depth, role}`.
// `sourceCharacterId` + `swapMacros` are the orbweaver non-lossy `createFromCharacter` provenance:
// the swap decision is recoverable, so a persona minted from a card can re-derive its description if
// the card is edited.
export const personaMetadataSchema = z
  .object({
    descriptionPosition: z.enum(PERSONA_DESCRIPTION_POSITIONS).optional(),
    /** Depth + role for the `at_depth` placement — the shared injection directive (`@orb/kit/injection`). */
    inject: injectionDirectiveSchema.optional(),
    sourceCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
    swapMacros: z.boolean().optional(),
  })
  .loose();
export type PersonaMetadata = z.infer<typeof personaMetadataSchema>;

/** Write-side metadata guard (mirrors world-info's `entryMetadataWriteSchema`): the blob stays a lenient
 *  open record (the TS type stays `Record<string, unknown>` so callers building arbitrary blobs keep
 *  compiling), but known fields are validated when present so a typo'd `descriptionPosition` / `inject` is
 *  rejected at WRITE instead of silently no-op'ing at READ. Read stays lenient (the resolver normalizes). */
export const personaMetadataWriteSchema = z
  .record(z.string(), z.unknown())
  .superRefine((val, ctx): void => {
    const known = personaMetadataSchema.safeParse(val);
    if (!known.success) {
      for (const issue of known.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
      return;
    }
    const inj = known.data.inject;
    if (inj !== undefined && inj.role === PREFILL_ROLE && inj.depth === PREFILL_DEPTH) {
      ctx.addIssue({
        code: "custom",
        path: ["inject"],
        message:
          "assistant-role at depth 0 is a response prefill — unsupported across providers. Use depth >= 1, or role user/system.",
      });
    }
  });
export type PersonaMetadataWrite = z.infer<typeof personaMetadataWriteSchema>;

export const createPersonaSchema = z.object({
  name: z.string().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  /** Display subtitle for pickers/lists (ST persona "title") — never injected into the prompt. */
  title: z.string().max(NAME_MAX_LENGTH).nullable().optional(),
  description: z.string().max(DESCRIPTION_MAX_LENGTH),
  /** Favorite flag (ST persona favorites) — pickers sort/highlight starred first. */
  starred: z.boolean().optional(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable().optional(),
  metadata: personaMetadataWriteSchema.nullable().optional(),
});
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;

export const updatePersonaSchema = createPersonaSchema.partial();
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
