// domain/settings/contract/seeder — the injected-op types for the default SCENE-PLATE seeder (the
// `DefaultCharacterSeeder` / `DemoChatSeeder` sibling). The seeder itself imports no domain: the bytes
// (`@orb/default-content`), the CAS write (`assets.store`) and the settings read/patch all arrive as
// closures the composition root builds.
//
// WHY THE PLATES NEEDED A SEEDER AT ALL. Until 2026-09-18 the ten shipped character backgrounds were a
// static slug catalog in `@orb/contracts/theme` whose bytes were vite `public/` URLs, reachable only through
// a `BACKGROUND_IMAGE_KINDS` member of their own (`kind:"seeded"`). That was a parallel background channel:
// a plate could not be renamed, deleted, exported, or offered beside a user's own uploads, and the CAS and
// asset GC could not see it at all. Seeding them makes a plate an ORDINARY owned background — which is also
// what retires the `seeded` kind.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { AssetId, UserId } from "@orb/kit/ids";

/** One shipped plate's identity in the pack: the content `slug` (`<handle>-bg`) and the display NAME its
 *  `appearance.backgroundLibrary` entry wears. Structurally the `@orb/default-content` manifest row; spelled
 *  here so this domain declares the shape it consumes rather than importing a node-only package. */
export interface SeedBackgroundPlateRef {
  readonly slug: string;
  readonly label: string;
}

/** A plate that has landed in the caller's CAS as a `background`-kind asset. `assetHash` is the CAS content
 *  hash, which is what makes the seed idempotent WITHOUT a slug column anywhere: the same bytes always hash
 *  the same, so "does this library already carry this plate?" is a hash lookup, not a marker field. */
export interface SeededPlateAsset {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}

export interface DefaultBackgroundSeederDeps {
  /** The shipped pack, in the order the library entries are appended. */
  readonly plates: readonly SeedBackgroundPlateRef[];
  /** Lift ONE plate's shipped bytes into an owned `background` asset (CAS-deduped). `null` ⇒ the pack ships
   *  no such plate / the store refused it, so the caller skips ONE plate instead of failing the seed. */
  readonly storePlate: (principal: Principal, slug: string) => Promise<SeededPlateAsset | null>;
  /** Mint one `backgroundLibrary` row id (the settings service's own `newBackgroundEntryId`). */
  readonly newEntryId: () => string;
  /** The caller's own settings — the latch, the pack stamp and the current library. */
  readonly readOnboarding: (principal: Principal) => Promise<{ readonly seeded: boolean }>;
  readonly readLibrary: (principal: Principal) => Promise<readonly SeededLibraryEntry[]>;
  /** Replace `appearance.backgroundLibrary` (the section merge REPLACES arrays — read-modify-write). */
  readonly writeLibrary: (principal: Principal, library: readonly SeededLibraryEntry[]) => Promise<void>;
  /** Land the once-per-user latch, LAST (the `createPersonaSeedLatch` order law: an interruption must leave
   *  the latch false so the next touch re-enters). */
  readonly markSeeded: (principal: Principal) => Promise<void>;
  /** The RAW-JSON rewrite pass: every stored `kind:"seeded"` reference this user owns becomes the plate's
   *  now-owned asset ref, or `none` when the slug names a plate this pack no longer ships (the four deleted
   *  landscape placeholders). Injected because the three storage locations belong to three domains. */
  readonly rewriteSeededReferences: (userId: UserId, resolve: SeededSlugResolver) => Promise<number>;
}

/** slug → the caller's owned plate ref, or `null` when this pack ships no such plate. */
export type SeededSlugResolver = (slug: string) => Promise<ThemeBackground | null>;

/** The `appearance.backgroundLibrary` row shape this seeder reads and writes. Structurally
 *  `BackgroundLibraryEntry`; spelled here as the injected-op vocabulary so the seeder needs no contracts
 *  import beyond the background source it returns. */
export interface SeededLibraryEntry {
  readonly entryId: string;
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
  readonly name: string;
}

export interface DefaultBackgroundSeeder {
  /** Idempotent per-user seed: the ten plates land as owned assets + library entries, then every stored
   *  `seeded` reference this user owns is rewritten. Never throws (a failure retries on the next touch). */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
  /** The seed-time resolver the character/chat packs dress with: slug → this user's owned plate ref. */
  readonly resolvePlate: (principal: Principal, slug: string) => Promise<ThemeBackground | null>;
}
