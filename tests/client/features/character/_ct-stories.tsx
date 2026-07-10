// Character library CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// anchor + surface come through the feature front door; `CharacterCardTile` too (a leaf, but its own props
// type is exported from the front door so a story can drive it directly without a network layer).
//
// `CharacterCardTileStoryProps.tags` takes PLAIN string ids (CT-serializable — the branded `TagId`/
// `CharacterId` types are compile-time only, so `castId` is a zero-cost cast run HERE, inside the story
// component that executes post-mount in the real browser context, never at the `.ct.tsx` call site —
// the same "build the branded shape inside the story" precedent `MessageRowStory` sets for `Map`s).

import { useTRPC } from "@orb/client/data";
import {
  CharacterBulkBar,
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
  readonly handle?: string;
  readonly archived?: boolean;
  readonly starred?: boolean;
  readonly avatarHash?: string | null;
  readonly elevatorPitch?: string | null;
  readonly tags?: readonly CharacterCardTileStoryTag[];
  readonly selected?: boolean;
  readonly bulkMode?: boolean;
  readonly bulkSelected?: boolean;
}

/** The bare `<CharacterCardTile>` (§4.4 row) — drives avatar/subtitle-ladder/star/accent/bulk rendering in
 *  isolation; each action records its id into a visible marker so a CT can assert the seam fires with the
 *  right character id (the callback closures run in-browser, inside this story). */
export function CharacterCardTileStory({
  name = "Aria Nightshade",
  handle = "aria-nightshade",
  archived = false,
  starred = false,
  avatarHash = null,
  elevatorPitch = null,
  tags = [],
  selected = false,
  bulkMode = false,
  bulkSelected = false,
}: CharacterCardTileStoryProps): ReactElement {
  const [chattedId, setChattedId] = useState<string | null>(null);
  const [bulkId, setBulkId] = useState<string | null>(null);
  const [starredId, setStarredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div style={{ width: 360 }}>
      <CharacterCardTile
        bulkMode={bulkMode}
        bulkSelected={bulkSelected}
        character={{
          id: castId<CharacterId>("char_ct_story"),
          name,
          handle,
          archived,
          starred,
          avatarHash,
          elevatorPitch,
          themeOverride: null,
          tokenSize: 128,
          tags: tags.map((tag) => ({ ...tag, id: castId<TagId>(tag.id) })),
        }}
        onChat={setChattedId}
        onSelect={setSelectedId}
        onToggleBulk={setBulkId}
        onToggleStar={(id): void => setStarredId(id)}
        selected={selected}
      />
      <p data-testid="chatted-id">{chattedId ?? ""}</p>
      <p data-testid="bulk-id">{bulkId ?? ""}</p>
      <p data-testid="starred-id">{starredId ?? ""}</p>
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

// ── Bulk-bar story (P1: the narrow-panel clip regression) ──────────────────────────────────────────

/** `<CharacterBulkBar>` under the data layer, in a NARROW (~337px) LIST panel — the width side-eye measured
 *  the Delete button clipped at. `trpc` is read inside the provider tree (the surface's own wiring). */
function BulkBarInner(): ReactElement {
  const trpc = useTRPC();
  return (
    <CharacterBulkBar
      ids={["char_a", "char_b", "char_c"]}
      onClear={(): void => undefined}
      selectedCount={3}
      trpc={trpc}
    />
  );
}

export function CharacterBulkBarStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="bulk-panel" style={{ width: 337 }}>
        <BulkBarInner />
      </div>
    </CtDataProviders>
  );
}
