// `useDraftCastCards` — the ONE client read of a DRAFT's founding cards, resolved LIST-FIRST.
//
// THE BUG IT EXISTS TO KILL (side-eye 2026-08-07 §④ P2, "the single biggest opportunity"): every new draft
// rendered a ~2s placebo identity first — the topbar read `? | ? | ? | New chat`, with no theme and no
// background, and then snapped to the correct room. Three separately-landed fixes (the draft title, the
// carried theme, the carried background) all looked broken simultaneously, on the very first frame of the
// phase the owner had already called sloppy, and the unresolved seat's glyph was a literal "?" — which reads
// as an ERROR, not as loading.
//
// THE MECHANISM, verified in source rather than inferred: every draft surface resolved its cast with N cold
// `character.get` reads (`chat-header.tsx`, `chats-selection-title.ts`, `use-carried-appearance.ts`), while
// the picker the user had just come through resolved the SAME characters one frame earlier through
// `character.list` — a different query key, so none of it counted. And `CharacterSummary` (the list row)
// already carries every field those three surfaces need: `name`, `avatarHash`, `themeOverride`,
// `backgroundOverride`. The data was in hand; only the key was wrong.
//
// SO: the cached list pages answer first, and `character.get` — still subscribed, still the authority —
// takes over the moment it lands. Nothing is FABRICATED into the `character.get` cache: seeding that key
// with a summary would be a typed lie (its consumers read `CharacterDetail`, of which a summary is a strict
// subset), and a lie in the cache outlives the frame it bought. This reads the list's own key, as the list.
//
// It lives in `#data` beside `use-carried-appearance.ts` for the same reason that hook does: three consumers
// across TWO features (the chat room's header, the chats section's mobile title, the app shell's carried
// background) and features cannot import each other.
//
// NON-SUSPENDING, like its sibling: an unresolved seat reports `undefined`, and every consumer renders that
// as LOADING (a skeleton), never as a "?" and never as a blocked room.

import type { ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { peekMatchingQueryData } from "./peek-query.ts";
import { useTRPC } from "./trpc.ts";

/** One founding character's card, reduced to what a pre-send room needs to dress itself: who it is, and what
 *  it looks like. Deliberately the INTERSECTION of `CharacterDetail` and `CharacterSummary`, so the two
 *  sources are interchangeable and a consumer can never depend on a field only one of them carries. */
export interface DraftCastCard {
  readonly name: string;
  readonly avatarHash: string | null;
  readonly themeOverride: ThemeOverride | null;
  readonly backgroundOverride: ThemeBackground | null;
}

/** A cached `character.list` page, as the client sees it. */
interface ListPage {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly avatarHash: string | null;
    readonly themeOverride: ThemeOverride | null;
    readonly backgroundOverride: ThemeBackground | null;
  }[];
}

/**
 * The founding cast's cards, one entry per id, IN SEED ORDER. `undefined` = this seat is not resolved yet
 * from either source — the consumer's loading arm.
 *
 * @param characterIds - the draft's founding cast (`resolveDraftCharacterIds`). Empty ⇒ an empty result and
 *   no reads.
 */
export function useDraftCastCards(characterIds: readonly CharacterId[]): readonly (DraftCastCard | undefined)[] {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The AUTHORITY, unchanged: the same `character.get` subscription every draft surface already made, so a
  // card that is edited mid-draft still updates and nothing here is a second source of truth.
  const cards = useQueries({
    queries: characterIds.map((characterId) => ({
      ...trpc.character.get.queryOptions({ characterId }),
      // Decoration + identity: a slow or failed card degrades to a skeleton, never into a shell's boundary.
      throwOnError: false,
    })),
  });

  // The FIRST-FRAME answer. A prefix peek, so it hits whichever `character.list` page is warm regardless of
  // the `limit` its caller used (see `peekMatchingQueryData`). Re-read on every render, which is enough:
  // the subscribed `character.get` queries are what re-render this hook when the authority lands.
  const byId = new Map<string, DraftCastCard>();
  for (const page of peekMatchingQueryData<ListPage>(queryClient, trpc.character.list.queryKey())) {
    for (const item of page.items) {
      byId.set(item.id, {
        name: item.name,
        avatarHash: item.avatarHash,
        themeOverride: item.themeOverride,
        backgroundOverride: item.backgroundOverride,
      });
    }
  }

  return characterIds.map((characterId, index) => {
    const detail = cards[index]?.data;
    // OPTIONAL-CHAINED on purpose: a card read that has not landed answers `undefined`, and the CT harness's
    // universal stub answers `null` — both mean UNRESOLVED here. A bare `!== undefined` would dereference the
    // null and blank the topbar, which is the wrong failure mode for a non-suspending decoration read that
    // every consumer already maps to "not resolved yet".
    if (detail?.name !== undefined) {
      return { name: detail.name, avatarHash: detail.avatarHash, themeOverride: detail.themeOverride, backgroundOverride: detail.backgroundOverride };
    }
    return byId.get(characterId);
  });
}
