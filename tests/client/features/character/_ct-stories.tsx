// Character library CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// anchor + surface come through the feature front door; `CharacterCardTile` too (a leaf, but its own props
// type is exported from the front door so a story can drive it directly without a network layer).
//
// `CharacterCardTileStoryProps.tags` takes PLAIN string ids (CT-serializable — the branded `TagId`/
// `CharacterId` types are compile-time only, so `castId` is a zero-cost cast run HERE, inside the story
// component that executes post-mount in the real browser context, never at the `.ct.tsx` call site —
// the same "build the branded shape inside the story" precedent `MessageRowStory` sets for `Map`s).

import {
  CharacterCardTile,
  CharacterDetailCard,
  CharacterLibraryAnchor,
  CharacterLibrarySurface,
} from "@orb/client/features/character";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

// ── Pure-render story (no data layer) ───────────────────────────────────────────────────────────

export interface CharacterCardTileStoryTag {
  readonly id: string;
  readonly name: string;
  readonly isHiddenOnCard: boolean;
}

export interface CharacterCardTileStoryProps {
  readonly name?: string;
  readonly archived?: boolean;
  readonly avatarHash?: string | null;
  readonly tags?: readonly CharacterCardTileStoryTag[];
  readonly selected?: boolean;
}

/** The bare `<CharacterCardTile>` — drives avatar-fallback/tags/archived/selected rendering in isolation,
 *  plus the start-chat action: clicking it records the id into a visible marker so a CT can assert the
 *  seam fires with the right character id (the callback closure runs in-browser, inside this story). */
export function CharacterCardTileStory({
  name = "Aria Nightshade",
  archived = false,
  avatarHash = null,
  tags = [],
  selected = false,
}: CharacterCardTileStoryProps): ReactElement {
  const [startedId, setStartedId] = useState<string | null>(null);
  const [toggledId, setToggledId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div style={{ width: 360 }}>
      <CharacterCardTile
        character={{
          id: castId<CharacterId>("char_ct_story"),
          name,
          archived,
          avatarHash,
          tags: tags.map((tag) => ({ ...tag, id: castId<TagId>(tag.id) })),
        }}
        onSelect={setSelectedId}
        onStartChat={setStartedId}
        onToggleSelect={setToggledId}
        selected={selected}
      />
      <p data-testid="started-id">{startedId ?? ""}</p>
      <p data-testid="toggled-id">{toggledId ?? ""}</p>
      <p data-testid="selected-id">{selectedId ?? ""}</p>
    </div>
  );
}

// ── Detail-card story (pure render — no data layer) ────────────────────────────────────────────────

export interface CharacterDetailCardStoryProps {
  readonly name?: string;
  readonly description?: string | null;
  readonly creatorNotes?: string | null;
  readonly archived?: boolean;
  readonly tags?: readonly CharacterCardTileStoryTag[];
}

/** The bare `<CharacterDetailCard>` — drives the read-only render (conditional description/creator-notes,
 *  tags, archived badge, the disabled Edit) + the Start-chat seam (records the id into a visible marker). */
export function CharacterDetailCardStory({
  name = "Aria Nightshade",
  description = "A wandering cartographer with a sharp tongue.",
  creatorNotes = null,
  archived = false,
  tags = [],
}: CharacterDetailCardStoryProps): ReactElement {
  const [startedId, setStartedId] = useState<string | null>(null);
  return (
    <div style={{ width: 720 }}>
      <CharacterDetailCard
        character={{
          id: castId<CharacterId>("char_ct_detail"),
          name,
          description,
          creatorNotes,
          archived,
          avatarHash: null,
          tags: tags.map((tag) => ({ ...tag, id: castId<TagId>(tag.id) })),
        }}
        onStartChat={setStartedId}
      />
      <p data-testid="started-id">{startedId ?? ""}</p>
    </div>
  );
}

// ── Surface story (data layer — trpc stubbed at the network) ───────────────────────────────────────

/** The library surface wrapped in its anchor + the real data layer (`routeTrpc` stubs the network). */
export function CharacterLibrarySurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 480 }}>
        <CharacterLibraryAnchor>
          <CharacterLibrarySurface />
        </CharacterLibraryAnchor>
      </div>
    </CtDataProviders>
  );
}
