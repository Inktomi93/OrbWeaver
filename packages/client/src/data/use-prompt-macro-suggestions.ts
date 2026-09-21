// `usePromptMacroSuggestions` — the `{{ }}` completion catalog for a prompt-text field on a GLOBAL entity
// editor (a persona description, a character card facet). MACU-2, owner ruling 2026-08-03: the macro plane
// belongs on every surface where a user macro actually RESOLVES.
//
// WHY THESE SURFACES QUALIFY (the mechanism, not the vibe). A card facet and a persona description are
// rendered during turn assembly by `renderMemberField`/`renderMacros`, and the registry those calls receive
// is the PER-TURN one that `buildTurnUserMacros` composes — `createDefaultRegistry()` plus the active
// preset's `userMacros` plus the game's. So `{{house_rule}}` typed into a character's description really
// does resolve at turn time, and a popover that only knew the builtins was advertising half the vocabulary.
// (The imagery mode-templates USED to be the counter-example here — `extractQuiet` ran `processMacros` with no
// registry — and IMGMAC closed that: the shaper now builds a per-call registry from both authoring homes, so
// that section reads this hook too, taking only its `category === "user"` rows. The MacroTextarea surfaces
// that still do NOT qualify are cited where they live: every user-tier prose slot is `macros:"none"`.)
//
// WHY THE ACTIVE PRESET IS THE HONEST PLANE. These editors have no chat and no preset in scope — a card is
// authored once and played in many rooms, and a room can override the preset — so the exact set that will
// resolve is unknowable here. The user's ACTIVE preset (`seeds.defaultPresetId`, `null` ⇒ the built-in) is
// the closest true answer, and `withUserMacros` already labels a name-only plane with its provenance. This
// is a completion catalog, not a resolution promise: an offered name resolves wherever its plane is in
// scope, exactly as a builtin does.
//
// It lives in `#data` rather than `features/preset` because its consumers are the PERSONA and CHARACTER
// editors, and a feature never imports another feature (the `useDisplayScripts` precedent).

import { useQuery } from "@tanstack/react-query";
import { withUserMacros } from "#lib";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

/** The plane-less arm, hoisted so the identity handed to `withUserMacros` is stable across renders (it is
 *  the key its memo — and behind it `<MacroTextarea>`'s fuzzy index — is built on). */
const NO_USER_MACROS: readonly never[] = [];

/**
 * The builtin catalog UNION the active preset's user macros. While the two reads are in flight this is the
 * plane-less catalog — the shared module constant, so the field is completable from the first keystroke and
 * simply gains the user rows when they land (never a disabled or empty popover waiting on a fetch).
 *
 * Deliberately NOT annotated with `MacroSuggestion`: that type re-exports from the `@orb/ui/macro-textarea`
 * browser TSX, which naming here would drag into the DOM-less type programs (the `prompt-macros.ts` header
 * has the full account). The shape stays pinned where it is consumed — every call site hands the result to a
 * `suggestions` prop that IS typed `readonly MacroSuggestion[]`, in a program that has lib.dom.
 */
export function usePromptMacroSuggestions(): ReturnType<typeof withUserMacros> {
  const trpc = useTRPC();
  // Both reads are cache-first and already warm on any real session (the settings blob is read by half the
  // shell; the preset by the preset surfaces) — this adds a cache hit, not a round trip, on the common path.
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  const activePresetId = settings.data?.config.seeds.defaultPresetId ?? null;
  // `null` means the BUILT-IN default is active, which declares no user macros. No PresetId is manufactured:
  // the gated options builder is never called and the builtin catalog is already the complete answer.
  const preset = useGatedQuery(activePresetId, (id) => trpc.preset.get.queryOptions({ id }));
  // The array's IDENTITY is the memo key, and TanStack's structural sharing keeps it stable across refetches
  // that don't change the list — which is what makes the union (and the fuzzy index behind it) pay off.
  return withUserMacros(preset.data?.config.userMacros ?? NO_USER_MACROS);
}
