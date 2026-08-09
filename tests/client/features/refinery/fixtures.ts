// Refinery CT fixtures — plain client read-model literals matching the R1 router's wire shapes
// (`@orb/contracts/refinery`), the `features/character/fixtures.ts` precedent: a fixture is a literal, not one
// of the `support/factories` DB-row builders.
//
// `characterId` carries its BRAND (`brand-in-name-position` — the compile-time hole this gate closes is real
// here too: a `RefinerySessionId` handed to the `characterId` slot would type-check as a bare string). It is a
// brand, so it costs nothing at runtime and `routeTrpc` still fulfills the same raw JSON. The default is
// MINTED once at module scope rather than hand-written — a literal that drifts from the 26-char base32
// alphabet would fail at a `typeIdSchema` seam instead of at an assertion — and minting ONCE keeps the
// fixture deterministic across calls within a run (`test-determinism`).

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";

const FROZEN_AT = 1_750_000_000_000;
const DEFAULT_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const DEFAULT_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

/** The `refinery.listSessions` row shape (`RefinerySessionSummary`) — a plain fixture literal, see header. */
export interface RefinerySessionSummaryFixture {
  readonly id: string;
  readonly characterId: CharacterId;
  /** Joined SERVER-SIDE since 2026-08-09 (the roster names every session it lists, past any
   *  `character.list` page) — so a roster fixture carries the display name, not just the id. */
  readonly characterName: string;
  readonly characterAvatarHash: string | null;
  readonly name: string | null;
  readonly status: string;
  readonly iterationCount: number;
  readonly latestVerdict: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function makeRefinerySessionSummary(overrides: Partial<RefinerySessionSummaryFixture> = {}): RefinerySessionSummaryFixture {
  return {
    id: DEFAULT_SESSION_ID,
    characterId: DEFAULT_CHARACTER_ID,
    characterName: "Seraphine",
    characterAvatarHash: null,
    name: "Rev",
    status: "active",
    iterationCount: 0,
    latestVerdict: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}
