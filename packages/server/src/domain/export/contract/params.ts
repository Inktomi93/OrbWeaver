// domain/export/contract/params — every verb's *Params + the serde-input shapes, declared ONCE (§7.4 —
// one type home; these exported shapes may NOT live in substrate/, which `no-inline-types` does not exempt).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose card" (NEVER a `users` read — the `no-direct-users-read` gate).
//
// FLAG[PD-44]: `ExportCardFields` + `ExportWorldEntry` are the input shapes for the LOCAL
// stopgap serde (`substrate/card-serde.ts`). Their canonical home is the shared serde module
// (`@orb/server/kit/serde/card` holds `ExportCardFields`; `.../world-entry` holds `ExportWorldEntry` —
// export.md Movement table), which is still an empty `.gitkeep`. When the import agent stands up
// `@orb/server/kit/serde`, these move there and this file keeps only the verb `*Params`.

import type { CardDepthPrompt } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { RegexScript } from "@orb/contracts/regex";
import type { CharacterId } from "@orb/kit/ids";

/** Common to every export verb: the acting principal whose `userId` scopes ownership. */
export interface ExportActorParams {
  readonly principal: Principal;
}

export interface ExportCharacterParams extends ExportActorParams {
  /** The owned character to serialize to a V3 card PNG. */
  readonly characterId: CharacterId;
}

/** The live-card columns the card emitter projects to the V3 wire (serde-private input — FLAG above).
 *  `greetings[0]` is the first message; the rest are alternate greetings. `tags` are the ACCEPTED
 *  `character_tags` names (export.md inv 4 — pending tags are NOT serialized). The typed promotions
 *  (`creator` / `cardVersion` / `regexScripts` / `extensions` / `depthPrompt`) are read straight off the
 *  flat row — no `raw` blob (export.md inv 3). */
export interface ExportCardFields {
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: string[];
  readonly exampleMessages: string | null;
  readonly systemPrompt: string | null;
  readonly postHistoryInstructions: string | null;
  readonly creatorNotes: string | null;
  readonly creator: string | null;
  readonly cardVersion: string | null;
  readonly tags: string[];
  readonly extensions: Record<string, unknown> | null;
  readonly regexScripts: RegexScript[];
  readonly depthPrompt: CardDepthPrompt | null;
}

/** One attached lore entry projected for the OUT mapper (serde-private input — FLAG above). Carries the
 *  full round-trip payload — typed columns PLUS the preserved `metadata` blob — so import → export →
 *  reimport doesn't strip `constant` / `position` / vendor extensions. */
export interface ExportWorldEntry {
  readonly keys: string[];
  readonly content: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly title: string;
  readonly ignoreBudget: boolean;
  readonly metadata: Record<string, unknown> | null;
}
