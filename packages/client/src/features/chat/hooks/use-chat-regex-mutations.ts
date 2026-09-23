// The ROOM's regex writes (#1742) — the four the Regex section is allowed to make, and no others.
//
// FOUR WRITES, THREE AUTHORITIES, one file so the section's whole write surface is readable at once
// (the approved design: "It writes exactly four things"):
//   • `chat.setRegexAllow` — the per-chat master and the per-tier allows. HOST authority over the ROOM
//     (these decide which scripts the shared assembly runs), ONE lever per call because the verb writes ONE
//     metadata JSON path (#1450).
//   • `regex.updateScript {enabled}` — the row switch. This is the LIBRARY row's own flag, i.e. OFF
//     EVERYWHERE; the row says so in its accessible name and a flip that reaches beyond this chat raises the
//     Undo toast. Not a room write at all — which is exactly why the section labels it differently.
//   • `regex.attachToChat` / `detachFromChat` — the room's OWN tier's membership. Host-gated in the verbs.
//
// EVERY ONE IS `busDriven`, like every other regex/chat write: `setRegexAllow` emits `chatUpdated` (which
// invalidates `chat.listEffectiveRegex`, `invalidation.ts`) and the three regex verbs emit `regexChanged`,
// which #1733's room fan turns into the room-entity `regex` filter set (`invalidation-reads.ts`). So no call
// site hand-invalidates and a second device repaints from the same tick.
//
// NO OPTIMISTIC ARM, deliberately, and this is the one place it is worth saying: the section is an HONESTY
// instrument — every number in it (the ranks, the in-force counts, the kicker chip) comes from the server's
// one resolver, and an optimistic paint would have to RE-RUN that resolver client-side to be consistent,
// which is precisely the "the client never re-unions" rule (the mock design §7.1). The `RegexScopeOrder` reorder
// IS optimistic, and the difference is real: a drop's whole feedback is the row order, which the client
// already knows; a lever's feedback is a re-ranked union, which it does not.
//
// The chat feature owns its own factories rather than importing `features/regex`'s (features cannot import
// each other — the `use-chat-book-mutations.ts` precedent for the identical attach/detach shape).

import type { RegexTierKey } from "@orb/contracts/chat";
import type { UpdateRegexScriptInput } from "@orb/contracts/regex";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** ONE lever of the room's regex, spelled from the CONTRACT's tier key rather than inferred from the proc:
 *  the router validates `tier` through `regexTierKeySchema` (a `z.custom` over a branded template literal),
 *  whose inferred input erases the very union the section's dispatch is built on. The stricter shape stays
 *  assignable to the proc's input, so nothing is cast. */
interface RegexAllowVars {
  readonly chatId: ChatId;
  readonly lever: { readonly kind: "master"; readonly enabled: boolean } | { readonly kind: "tier"; readonly tier: RegexTierKey; readonly enabled: boolean };
}

export const useSetRegexAllow = createEntityMutation<RegexAllowVars, inferOutput<Trpc["chat"]["setRegexAllow"]>>({
  options: (trpc) => trpc.chat.setRegexAllow.mutationOptions(),
  busDriven: true, // setRegexAllow emits chatUpdated → the invalidation map re-reads listEffectiveRegex.
  errorToast: "Couldn't change what regex runs in this chat.",
});

/** The ROW switch — the library row's `enabled`, which is off EVERYWHERE and not per-chat. The section's own
 *  toast (with Undo) is raised at the call site rather than here, because whether the flip reaches beyond
 *  this room is a property of the ROW (`attachedElsewhere`), not of the verb. */
export const useSetRegexScriptEnabled = createEntityMutation<
  { readonly scriptId: RegexScriptId; readonly input: UpdateRegexScriptInput },
  inferOutput<Trpc["regex"]["updateScript"]>
>({
  options: (trpc) => trpc.regex.updateScript.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch that script.",
});

export const useAttachScriptToChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this chat.",
});

export const useDetachScriptFromChat = createEntityMutation<
  { readonly chatId: ChatId; readonly scriptId: RegexScriptId },
  inferOutput<Trpc["regex"]["detachFromChat"]>
>({
  options: (trpc) => trpc.regex.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this chat.",
});
