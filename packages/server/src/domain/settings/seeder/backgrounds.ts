// domain/settings/seeder/backgrounds — the idempotent per-user SCENE-PLATE seeder (the
// `domain/character/seeder/seed.ts` and `domain/chat/seeder/seed.ts` sibling), wired at entry/ from the same
// two call sites: boot for the deployment owner, first authed request for a new user.
//
// WHAT IT LANDS. The ten shipped character plates (`@orb/default-content`'s `backgrounds/<handle>-bg.jpg`)
// become ordinary OWNED backgrounds: each one CAS-stored as a `background`-kind asset and appended to
// `appearance.backgroundLibrary`. Until 2026-09-18 they were a static slug catalog in
// `@orb/contracts/theme` served as vite `public/` URLs behind a `BACKGROUND_IMAGE_KINDS` member of their
// own (`kind:"seeded"`) — a parallel channel a user could not rename, delete, export or pick beside their
// uploads, and one the CAS and asset GC could not see at all. Seeding them is what retires that kind.
//
// IDEMPOTENCY HAS TWO LAYERS, and the second one is what makes it safe to run before the latch lands:
//   1. The persisted latch `UserSettings.onboarding.defaultBackgroundsSeeded` — once true never re-runs,
//      which is also the deletion-respect guard (a user who deleted the plates does not get them back).
//   2. Under it, CONTENT-HASH dedup. The CAS key is sha256 of the bytes, so a plate always resolves to the
//      same `assetHash` for a given user and "does this library already carry this plate?" is a hash lookup
//      — no slug column, no marker field, nothing to go stale. A crash mid-run therefore re-runs cleanly
//      instead of appending ten duplicate rows, which is exactly the demo-chat seeder's `demo-chat:<slug>`
//      `importHash` story told with the bytes we already have.
//
// THE LATCH IS WRITTEN LAST (`createPersonaSeedLatch`'s #1412 order law): an interruption must leave the
// latch FALSE so the next touch re-enters and finishes, rather than committing "this user is seeded" ahead
// of it being true.
//
// IT ALSO CARRIES THE MIGRATION, and that is deliberate rather than a second boot step. A user's stored
// `kind:"seeded"` references can only be re-pointed once that user OWNS the plate assets, so the rewrite has
// to run strictly after the seed for the same user — folding it in makes that ordering structural instead of
// a wiring convention two call sites could get wrong. It runs on every pass (not behind the latch): the
// latch means "this user has their plates", never "this user has no legacy references left".
//
// This file imports no domain and no fs: the bytes, the CAS write, the settings read/patch and the three
// raw-JSON rewrites all arrive as injected closures the composition root builds.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import { errorMessage } from "@orb/kit/error-message";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { DefaultBackgroundSeeder, DefaultBackgroundSeederDeps, SeededLibraryEntry, SeededPlateAsset } from "../contract/seeder.ts";

/** One stored plate as a carried background SOURCE. Built through the canonicalizer every other carried
 *  background write path runs, so the seeded refs are byte-identical in shape to a hand-picked one. */
function plateSource(stored: SeededPlateAsset): ThemeBackground {
  return canonicalBackgroundSource({
    kind: "asset",
    assetId: stored.assetId,
    assetHash: stored.assetHash,
    mime: stored.mime,
    externalUrl: "",
    provenanceUrl: "",
  });
}

export function createDefaultBackgroundSeeder(deps: DefaultBackgroundSeederDeps): DefaultBackgroundSeeder {
  const log = getLog();
  // Only populated on success — a transient failure retries on the next touch. Assumes single-replica, the
  // `DefaultCharacterSeeder` assumption.
  const settled = new Set<UserId>();
  // Two parallel first requests share one in-flight run instead of double-appending the library.
  const inFlight = new Map<UserId, Promise<void>>();
  // The plates THIS run has already lifted for this principal, so the ten-card dressing pass does not
  // re-read and re-store the same file once per card. Cleared with the process; the CAS makes a miss cheap.
  const lifted = new Map<string, SeededPlateAsset | null>();

  async function liftPlate(principal: Principal, slug: string): Promise<SeededPlateAsset | null> {
    const key = `${principal.userId}:${slug}`;
    const memo = lifted.get(key);
    if (memo !== undefined) {
      return memo;
    }
    const stored = await deps.storePlate(principal, slug);
    lifted.set(key, stored);
    return stored;
  }

  /** The library with every shipped plate this user does not already carry appended, in pack order. A plate
   *  the pack ships no bytes for is SKIPPED, never a hole: one missing file costs one plate. */
  async function appendMissingPlates(principal: Principal, current: readonly SeededLibraryEntry[]): Promise<readonly SeededLibraryEntry[]> {
    const known = new Set(current.map((entry) => entry.assetHash));
    const next = [...current];
    for (const plate of deps.plates) {
      const stored = await liftPlate(principal, plate.slug);
      if (stored === null || known.has(stored.assetHash)) {
        continue;
      }
      known.add(stored.assetHash);
      next.push({ entryId: deps.newEntryId(), assetId: stored.assetId, assetHash: stored.assetHash, mime: stored.mime, name: plate.label });
    }
    return next;
  }

  const resolvePlate = async (principal: Principal, slug: string): Promise<ThemeBackground | null> => {
    if (!deps.plates.some((plate) => plate.slug === slug)) {
      return null;
    }
    const stored = await liftPlate(principal, slug);
    return stored === null ? null : plateSource(stored);
  };

  async function runSeed(principal: Principal): Promise<void> {
    if (!(await deps.readOnboarding(principal)).seeded) {
      const current = await deps.readLibrary(principal);
      const next = await appendMissingPlates(principal, current);
      if (next.length !== current.length) {
        await deps.writeLibrary(principal, next);
      }
      await deps.markSeeded(principal);
    }
    // ALWAYS, latched or not: the latch is a claim about the plates, never about legacy references.
    const rewritten = await deps.rewriteSeededReferences(principal.userId, (slug) => resolvePlate(principal, slug));
    if (rewritten > 0) {
      log.info({ userId: principal.userId, rewritten }, "seed/backgrounds: re-pointed retired `seeded` background references at their owned plate assets");
    }
  }

  return {
    ensureSeeded: async (principal: Principal): Promise<void> => {
      if (settled.has(principal.userId)) {
        return;
      }
      const running = inFlight.get(principal.userId);
      if (running !== undefined) {
        await running;
        return;
      }
      const attempt = (async (): Promise<void> => {
        try {
          await runSeed(principal);
          settled.add(principal.userId);
        } catch (err) {
          log.warn({ userId: principal.userId, err: errorMessage(err) }, "seed/backgrounds: seed pass failed; retrying on the next touch");
        } finally {
          inFlight.delete(principal.userId);
        }
      })();
      inFlight.set(principal.userId, attempt);
      await attempt;
    },
    // The pack dressing resolves plates DURING the character/chat seed, which may run BEFORE this seeder's
    // own pass. That is fine and deliberately not ordered: `liftPlate` STORES the bytes, so the card's ref
    // points at a real owned asset either way, and the library entry is `ensureSeeded`'s separate job. Both
    // paths go through the same memo, so a card dressed first costs the later seed nothing.
    resolvePlate,
  };
}
