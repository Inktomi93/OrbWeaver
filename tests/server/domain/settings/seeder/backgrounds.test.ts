// domain/settings/seeder/backgrounds — the per-user SCENE-PLATE seeder (owner ask 2026-09-18, "the weird
// seeded backgrounds"). The `domain/character/seeder` and `domain/chat/seeder` sibling.
//
// WHAT IS ACTUALLY AT RISK, and therefore what is pinned here:
//   · The LIBRARY IS THE USER'S. A re-run that appends ten duplicate rows, or that resurrects a plate the
//     user deleted, is the failure — so the latch (deletion respect) and the CONTENT-HASH dedup (crash
//     resume) are separate claims with separate tests.
//   · THE LATCH IS WRITTEN LAST. An interruption must leave it FALSE so the next touch finishes the job;
//     latch-first would commit "this user is seeded" ahead of it being true (`createPersonaSeedLatch`'s
//     #1412 order law, applied to a second seeder).
//   · THE MIGRATION RUNS ON EVERY PASS, latched or not. The latch is a claim about the PLATES, never about
//     legacy `kind:"seeded"` references — a user who was seeded before the retirement is exactly the user
//     who still carries them, and gating the rewrite behind the latch would make them unreachable forever.
//   · ONE MISSING FILE COSTS ONE PLATE. The pack is best-effort by contract; a `null` byte read must skip
//     that plate, never abort the seed or write a library row pointing at nothing.
//
// Every dep is a fake: this seeder imports no domain, no fs and no db by construction, and the REAL lift
// (`readSeedBackground` → `assets.store({kind:"background"})`) is the composition root's, pinned at
// `tests/server/entry/compose/assets-character.int.test.ts`.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  DefaultBackgroundSeederDeps,
  SeedBackgroundPlateRef,
  SeededLibraryEntry,
  SeededPlateAsset,
  SeededSlugResolver,
} from "@orb/server/domain/settings";
import { createDefaultBackgroundSeeder } from "@orb/server/domain/settings";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLATES: readonly SeedBackgroundPlateRef[] = [
  { slug: "assistant-bg", label: "Charlotte's study" },
  { slug: "niko-bg", label: "Konbini at 1 a.m." },
  { slug: "morgatha-bg", label: "The Ashen Spire" },
];

const ACTOR: Principal = makePrincipal(castId<UserId>("user_plates"));

/** The recorder's MUTABLE half — read live after the pass, so it is one object the deps close over rather
 *  than a snapshot (a spread would freeze the counters at build time and every assertion would read zero). */
interface SeedState {
  library: SeededLibraryEntry[];
  seeded: boolean;
  marks: number;
  stores: string[];
  rewrites: number;
  /** The library's LENGTH at the moment `markSeeded` fired — the order proof (latch LAST). */
  libraryAtMark: number | null;
}

interface HarnessOptions {
  readonly seeded?: boolean;
  readonly library?: SeededLibraryEntry[];
  /** Slugs this pack ships no bytes for (the reader's `null` arm). */
  readonly missing?: readonly string[];
  readonly onRewrite?: (resolve: SeededSlugResolver) => Promise<number>;
}

function harness(options: HarnessOptions = {}): { readonly state: SeedState; readonly deps: DefaultBackgroundSeederDeps } {
  const state: SeedState = {
    library: options.library ?? [],
    seeded: options.seeded ?? false,
    marks: 0,
    stores: [],
    rewrites: 0,
    libraryAtMark: null,
  };
  let entryCounter = 0;
  const deps: DefaultBackgroundSeederDeps = {
    plates: PLATES,
    // The CAS is content-addressed, so a plate's hash is a pure function of its bytes — faked off the slug,
    // which is what makes "does this library already carry it?" a hash lookup rather than a marker field.
    storePlate: (_p: Principal, slug: string): Promise<SeededPlateAsset | null> => {
      state.stores.push(slug);
      return Promise.resolve(
        (options.missing ?? []).includes(slug)
          ? null
          : { assetId: castId<AssetId>(`asset_${slug.replaceAll("-", "_")}`), assetHash: `hash_${slug}`, mime: "image/jpeg" },
      );
    },
    newEntryId: (): string => {
      entryCounter += 1;
      return `bg_entry_${entryCounter}`;
    },
    readOnboarding: (): Promise<{ readonly seeded: boolean }> => Promise.resolve({ seeded: state.seeded }),
    readLibrary: (): Promise<readonly SeededLibraryEntry[]> => Promise.resolve(state.library),
    writeLibrary: (_p: Principal, library: readonly SeededLibraryEntry[]): Promise<void> => {
      state.library = [...library];
      return Promise.resolve();
    },
    markSeeded: (): Promise<void> => {
      state.marks += 1;
      state.libraryAtMark = state.library.length;
      state.seeded = true;
      return Promise.resolve();
    },
    rewriteSeededReferences: async (_userId: UserId, resolve: SeededSlugResolver): Promise<number> => {
      state.rewrites += 1;
      return (await options.onRewrite?.(resolve)) ?? 0;
    },
  };
  return { state, deps };
}

test("a fresh user gets every shipped plate as a library entry, in PACK ORDER, wearing the pack's labels", async () => {
  const { state, deps } = harness();
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.library.map((entry) => entry.name)).toEqual(["Charlotte's study", "Konbini at 1 a.m.", "The Ashen Spire"]);
  expect(state.library.map((entry) => entry.assetHash)).toEqual(["hash_assistant-bg", "hash_niko-bg", "hash_morgatha-bg"]);
  // Every row is a `background`-kind asset ref the picker treats exactly like an upload — which is the
  // entire point of retiring `kind:"seeded"`.
  expect(state.library.every((entry) => entry.mime === "image/jpeg")).toBe(true);
  expect(new Set(state.library.map((entry) => entry.entryId)).size, "each row gets its OWN id").toBe(3);
});

test("THE LATCH IS WRITTEN LAST — the library is already complete when the mark fires (#1412's order law)", async () => {
  const { state, deps } = harness();
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.marks).toBe(1);
  // Latch-first would commit "this user is seeded" while the library was still empty, and an interruption
  // there would leave them permanently plate-less with nothing able to notice.
  expect(state.libraryAtMark).toBe(PLATES.length);
});

test("content-hash dedup — a crashed run that already landed some plates appends only the MISSING ones", async () => {
  // The crash-resume shape: two plates landed under a prior pass, the latch never did.
  const existing: SeededLibraryEntry[] = [
    { entryId: "bg_prior_1", assetId: castId<AssetId>("asset_assistant_bg"), assetHash: "hash_assistant-bg", mime: "image/jpeg", name: "Charlotte's study" },
    { entryId: "bg_prior_2", assetId: castId<AssetId>("asset_niko_bg"), assetHash: "hash_niko-bg", mime: "image/jpeg", name: "Konbini at 1 a.m." },
  ];
  const { state, deps } = harness({ library: existing });
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.library).toHaveLength(3);
  // The two survivors keep their ORIGINAL row ids: dedup is by CONTENT, so a re-run recognises the bytes
  // rather than minting a second row for the same plate (which is how a picker gets duplicate tiles).
  expect(state.library.slice(0, 2).map((entry) => entry.entryId)).toEqual(["bg_prior_1", "bg_prior_2"]);
  expect(state.library[2]?.assetHash).toBe("hash_morgatha-bg");
});

test("a renamed plate is still recognised — the dedup key is the HASH, never the display name", async () => {
  const renamed: SeededLibraryEntry[] = [
    { entryId: "bg_mine", assetId: castId<AssetId>("asset_assistant_bg"), assetHash: "hash_assistant-bg", mime: "image/jpeg", name: "my favourite room" },
  ];
  const { state, deps } = harness({ library: renamed });
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.library).toHaveLength(3);
  expect(state.library[0]?.name, "a rename is the user's — the seeder does not undo it").toBe("my favourite room");
});

test("DELETION RESPECT — a latched user is not re-seeded, even with an empty library", async () => {
  const { state, deps } = harness({ seeded: true, library: [] });
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  // The latch is the deletion-respect guard: a user who removed every plate must not get them back.
  expect(state.library).toEqual([]);
  expect(state.marks).toBe(0);
});

test("THE MIGRATION RUNS ON EVERY PASS, latched or not — the latch is a claim about plates, not references", async () => {
  // The exact cohort this matters for: a user seeded BEFORE the retirement. They are latched, so a
  // latch-gated rewrite would never reach the `kind:"seeded"` references they are the only ones carrying.
  let resolved: ThemeBackground | null = null;
  const { state, deps } = harness({
    seeded: true,
    onRewrite: async (resolve): Promise<number> => {
      resolved = await resolve("niko-bg");
      return 4;
    },
  });
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.rewrites).toBe(1);
  // …and the resolver it is handed lifts the plate on demand, so the rewrite can point at a real asset even
  // though the library pass was skipped.
  expect(resolved).toMatchObject({ kind: "asset", assetHash: "hash_niko-bg" });
});

test("one missing plate costs ONE plate — never a hole in the library, never a failed seed", async () => {
  const { state, deps } = harness({ missing: ["niko-bg"] });
  await createDefaultBackgroundSeeder(deps).ensureSeeded(ACTOR);

  expect(state.library.map((entry) => entry.name)).toEqual(["Charlotte's study", "The Ashen Spire"]);
  // It still latches: the pass is COMPLETE for the pack this install actually ships.
  expect(state.marks).toBe(1);
});

test("`resolvePlate` answers null for a slug this pack does not ship, and never stores for it", async () => {
  const { state, deps } = harness();
  const seeder = createDefaultBackgroundSeeder(deps);

  expect(await seeder.resolvePlate(ACTOR, "misty-highlands"), "a deleted landscape placeholder").toBeNull();
  // The guard is the MANIFEST, checked before the reader — a slug the pack never carried must not even
  // reach the store (a store call for it would be an asset write with no content behind it).
  expect(state.stores).toEqual([]);
});

test("a repeated resolve lifts the bytes ONCE — the pack dresses ten cards without ten reads of one file", async () => {
  const { state, deps } = harness();
  const seeder = createDefaultBackgroundSeeder(deps);

  await seeder.resolvePlate(ACTOR, "niko-bg");
  await seeder.resolvePlate(ACTOR, "niko-bg");
  await seeder.ensureSeeded(ACTOR);

  expect(state.stores.filter((slug) => slug === "niko-bg")).toHaveLength(1);
});

test("a failing pass does not latch in-process — the next touch retries it", async () => {
  const { state, deps } = harness({
    onRewrite: (): Promise<number> => Promise.reject(new Error("the rewrite died mid-pass")),
  });
  const seeder = createDefaultBackgroundSeeder(deps);

  // `ensureSeeded` never throws (the seeder contract its two siblings share) — a background seed must not
  // fail a boot or a first authed request.
  await expect(seeder.ensureSeeded(ACTOR)).resolves.toBeUndefined();
  await seeder.ensureSeeded(ACTOR);
  // Two real attempts, because the in-process memo is populated on SUCCESS only.
  expect(state.rewrites).toBe(2);
});
