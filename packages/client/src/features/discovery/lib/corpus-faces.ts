// The ONE mapper from a discovery cluster's member slice to `<AvatarStack>` seats — issue #139. Both
// clustering producers hand back the same `ArchetypeMember` (characterId · name · avatarHash: server
// `domain/discovery/contract/results.ts`), and two surfaces draw those members as faces: the CONTENT
// family plates (`corpus-family-map.tsx`) and the CONTEXT Archetypes tab (`corpus-archetypes-tab.tsx`).
// Keeping the hash→`blobUrl` + null→initials degradation here means the second surface cannot drift into
// a differently-behaved copy of the first (the tab shipped names-only precisely because it re-declared
// the member shape without the portrait).
//
// A NULL HASH OMITS `src` RATHER THAN PASSING ONE. `AvatarStack` seeds its fallback hue off the seat's
// `name` and renders `initialsFor(name)`, so an absent portrait degrades to hue-seeded initials — "we
// have no portrait for this one", never a broken image or an invented face.
//
// THE SLICE IS THE CALLER'S. `members` is already a bounded DISPLAY slice (the verb caps it) whose real
// total lives in `size`, and how many seats fit is a per-surface geometry question — a 13rem plate and a
// full-width CONTEXT row do not get the same budget. The caller passes its own, and the count it prints
// stays `size`, so no overflow chip is ever computed off this slice.

import { blobUrl } from "@orb/contracts/assets";
import type { AvatarStackItem } from "@orb/ui/avatar-stack";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

type ClusterMember = inferOutput<Trpc["discovery"]["archetypes"]>[number]["members"][number];

/** Map a cluster's member slice into the first `slots` `<AvatarStack>` seats (portrait when the member
 *  carries a hash, hue-seeded initials when it does not). */
export function toFaceItems(members: readonly ClusterMember[], slots: number): AvatarStackItem[] {
  return members.slice(0, slots).map((member) => ({
    name: member.name,
    ...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) }),
  }));
}
