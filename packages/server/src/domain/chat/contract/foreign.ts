// domain/chat/contract/foreign — the FOREIGN-INPUTS contract (the assemble-input ownership split). The turn's
// cross-inputs were one 15-field `AssembleCrossInputs` bundle that lumped two different things together; they
// are split by OWNERSHIP:
//   • FOREIGN  (another domain owns the read) → {@link ForeignInputs}, a resolved-DATA DTO produced by the thin
//     composition-root dep {@link ResolveForeignInputsOp}. Chat DECLARES this dep + DTO and CONSUMES them; a
//     later compose chunk supplies the runtime fn. Chat never imports preset/persona/settings — it receives the
//     RESOLVED DATA shape (entry.md invariant 1: entry owns no business logic; the resolution takes chat-supplied
//     KEYS and returns DATA, so chat stays decoupled from those read APIs).
//   • CHAT-INTERNAL (chat owns the data/subsystem) → gathered by `substrate/assemble-gather.gatherAssembleContext`
//     using the `ChatContext` ops chat already holds (canon/injections/variables/metadata/memory/regex-tier).
//
// These are exported feature TYPES, so they live in `contract/` (the `types-in-contract` gate, §7.4) — NOT inline
// on a verb/substrate file. {@link ResolvedPersonas} is homed here (not assembly/context.ts, where it was a
// file-local shape) because BOTH `ForeignInputs` and the assembly producer now reference it — one home.

import type { AssemblePersona } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MemoryConfig } from "./memory";

/** The resolved personas for a turn (the persona domain owns the read — FOREIGN). `anchor` is `{{user}}` for
 *  card-derived sections (the chat-open anchor — `chats.anchorPersonaId`); `active` is `{{user}}` for
 *  prompt-config / user-authored sections — the TRIGGERING human's persona (whose turn it is —
 *  `triggerPersonaId`), NOT `personaIds[0]` (the presence-order-arbitrary first present human). */
export interface ResolvedPersonas {
  readonly anchor: AssemblePersona | null;
  readonly active: AssemblePersona | null;
}

/**
 * The FOREIGN half of the assemble inputs — RESOLVED DATA another domain owns, produced by
 * {@link ResolveForeignInputsOp} at the composition root and CONSUMED by the chat gather. Every field is
 * settings-/preset-/persona-derived (a read chat must NOT perform itself):
 *   • `promptConfig`        — the chat's active preset under the host's settings (preset domain).
 *   • `personas`            — anchor + active (persona domain).
 *   • `globalRegexScripts`  — the host's `UserSettings.regex.scripts` (settings) — the host-global regex tier.
 *   • `scanDepth`           — the host's `UserSettings.worldInfo.scanDepth` (settings) — the WI keyword-scan
 *                             window the gather slices `recentMessages` to.
 *   • `injectionTokenBudget`— the host's `UserSettings.worldInfo.tokenBudget` (settings) — the ONE injection
 *                             budget pass (0 ⇒ unbudgeted).
 *   • `memoryConfig`        — the resolved memory tuning (`AppSettings.memoryDefaults` ⊕ `UserSettings.memory`
 *                             enable, settings/admin) read by recall AND the post-turn build (threaded via
 *                             `TurnPrep.memoryConfig` — D36 opt-out on both sides); absent ⇒ the floor (`DEFAULTS`).
 */
export interface ForeignInputs {
  readonly promptConfig: PromptConfig;
  readonly personas: ResolvedPersonas;
  readonly globalRegexScripts: readonly RegexScript[];
  readonly scanDepth: number;
  readonly injectionTokenBudget: number;
  readonly memoryConfig?: MemoryConfig | null | undefined;
}

/**
 * The thin composition-root dep that resolves {@link ForeignInputs} from chat-supplied KEYS. The keys are the
 * minimum the FOREIGN reads need under the FROZEN `runAsUserId` (D19 — the host, never the caller); the resolver
 * returns RESOLVED DATA, so it touches NO chat tables (entry.md invariant 1). `anchorPersonaId` is the chat-open
 * anchor (`chats.anchorPersonaId`); `personaIds` are the present humans' active persona ids; `triggerPersonaId`
 * is the TRIGGERING human's active persona (whose turn drives this assemble) — the resolver binds `active` to
 * it (falling back to `personaIds[0]` only when the trigger has no persona), so prompt-config `{{user}}` is the
 * speaker's own persona, not the presence-order-arbitrary first human.
 */
export type ResolveForeignInputsOp = (args: {
  readonly chatId: ChatId;
  readonly runAsUserId: UserId;
  readonly model: string;
  readonly anchorPersonaId: PersonaId | null;
  readonly personaIds: readonly PersonaId[];
  readonly triggerPersonaId?: PersonaId | null | undefined;
}) => Promise<ForeignInputs>;
