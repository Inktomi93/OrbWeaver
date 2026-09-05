// Idempotent EXAMPLE-PLUGIN seeder — the fourth member of the seeder family (default characters, default
// persona, demo chats, and now the two showcase plugins). Called both at boot (the deployment owner) and on
// first authed request (every new user), through the ONE shared instance so the in-process memo + the
// persisted latch make re-runs a no-op. `ensureSeeded` never throws.
//
// WHY EXAMPLES SHIP INSTALLED AT ALL. A plugin surface with an empty list teaches nobody what a plugin is.
// These two are the archetypes — one EVENT-driven (Research Familiar), one TOOL-registering (Oracle Deck) —
// so the Settings → Plugins pane opens on two working, readable, adaptable things instead of a dropzone.
//
// CONSENT IS NOT SEEDED (the load-bearing decision). Each row lands INSTALLED, DISABLED, with ZERO granted
// capabilities and `pending_reconsent` raised, so the plugin can do literally nothing until the user reads
// the ask and allows it. That is why the seed is TWO verb calls rather than one: `install` with an empty
// grant records the row, and `setGrant` with an empty grant is what raises the standing "this plugin is
// asking for capabilities you have not allowed" state the client's consent affordance is gated on. Seeding
// a pre-granted plugin would be handing a stranger the keys on the user's behalf; a plugin nobody can grant
// is furniture. Neither verb is re-implemented here — the seeder drives the SAME trust edge a hand install
// drives, so the bundle meets the same unzip hardening, the same manifest validation and the same CAS store.
//
// IDEMPOTENCY HAS TWO LAYERS (the persona/character seeder shape — one layer is not enough, #461):
//   1. the persisted latch `UserSettings.onboarding.examplePluginsSeeded` — once true it never re-runs, which
//      is also the DELETION-RESPECT guard (a user who removed an example must not have it resurrected);
//   2. per-slug collision tolerance — `install` refuses a slug the user already holds
//      (`PluginAlreadyInstalledError`), which is treated as "already present, nothing to do" rather than a
//      failure. Layer 2 covers a latch that came back at schema defaults (a settings blob CAN, live receipt
//      2026-08-22) without minting a second copy: the `(owner, slug)` UNIQUE index is the real backstop.
// The latch is written ONLY after a COMPLETE pass — every slug installed or already present — so a transient
// failure (a fs read, a db blip, a bundle the pack could not produce) retries on the next touch instead of
// silently skipping the user forever. That completeness is `SeedOutcome`'s whole job (#1411): a throw is not
// the only way a pass can be incomplete, and the non-throwing way used to latch.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

/** The seeded examples, by bundle slug — the directory names under `boot/seed-assets/plugins/`. ONE per
 *  ARCHETYPE, which is what makes the set a menu rather than a demo: event reactor (research-familiar), tool
 *  provider + the whole UI plane (oracle-deck), quiet thinker + Tier-C (affinity-tracker), text pipeline
 *  (draft-polish), room surface + composition subscriber (scene-chips), room mechanics over chat variables
 *  (story-clocks), the ui.frame escape hatch (pocket-arcade), spend pipeline — quiet LLM + imagery
 *  (keepsake-camera), and the hub browser flagship (card-atlas). Adding a tenth is this tuple plus its
 *  source directory; nothing else here is per-plugin. The set's design + coverage matrix:
 *  `docs/design/plugin-showcase-set.md` (#774). */
export const EXAMPLE_PLUGIN_SLUGS = [
  "research-familiar",
  "oracle-deck",
  "affinity-tracker",
  "draft-polish",
  "scene-chips",
  "story-clocks",
  "pocket-arcade",
  "keepsake-camera",
  "card-atlas",
] as const;

/** What ONE slug's pass can produce, homed as a tuple and DERIVED from (never re-spelled — the axis rule).
 *  `installed`/`present` both mean "accounted for"; `unavailable` means the pack shipped no such bundle, which
 *  is the one outcome that must block the latch. Module-local: the seeder's internal completeness vocabulary,
 *  never a cross-boundary shape. */
const SEED_OUTCOMES = ["installed", "present", "unavailable"] as const;
type SeedOutcome = (typeof SEED_OUTCOMES)[number];

export interface ExamplePluginSeederDeps {
  /** Pack one example's source directory into installable bundle bytes; `null` when the pack ships no such
   *  slug. A missing example skips ONE plugin and does not fail the pass (the other slugs still install) —
   *  but it does BLOCK THE LATCH (#1411), so the skip is retried rather than made permanent. */
  readonly packBundle: (slug: string) => Promise<Uint8Array | null>;
  /** The REAL install verb, under the receiving user's own Principal. */
  readonly install: (args: { readonly caller: Principal; readonly bundle: Uint8Array }) => Promise<{ readonly id: PluginId }>;
  /** The REAL re-grant verb with an EMPTY grant — what raises `pending_reconsent` so the user's first act is
   *  a genuine consent against the real screen (file header). */
  readonly requestConsent: (args: { readonly caller: Principal; readonly pluginId: PluginId }) => Promise<void>;
  /** True when the caller already holds a plugin at this slug (`install` would refuse it). */
  readonly alreadyInstalled: (caller: Principal, slug: string) => Promise<boolean>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  readonly markSeeded: (principal: Principal) => Promise<void>;
}

export interface ExamplePluginSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

export function createExamplePluginSeeder(deps: ExamplePluginSeederDeps): ExamplePluginSeeder {
  const log = getLog();
  // Populated only on success — a transient failure retries on the next touch. ASSUMES(single-replica).
  const settled = new Set<UserId>();
  const inFlight = new Map<UserId, Promise<void>>();

  /** Seed ONE example for `principal`. The outcome is the LATCH INPUT, not a log detail (#1411):
   *  `installed`/`present` are both "this slug is accounted for", `unavailable` is not. */
  async function seedOne(principal: Principal, slug: string): Promise<SeedOutcome> {
    if (await deps.alreadyInstalled(principal, slug)) {
      return "present";
    }
    const bundle = await deps.packBundle(slug);
    if (bundle === null) {
      log.warn({ slug }, "plugin: example bundle is missing from the pack — skipped, and the pass will NOT latch");
      return "unavailable";
    }
    const { id } = await deps.install({ caller: principal, bundle });
    // The second half of the consent posture (file header): raise the standing ask. Deliberately NOT folded
    // into the install verb — a fresh install has nothing to re-consent to, which is exactly right for a
    // human who just chose a grant against the manifest, and exactly wrong for a row they never asked for.
    await deps.requestConsent({ caller: principal, pluginId: id });
    return "installed";
  }

  /** Runs a pass; returns whether it LATCHED (which is also whether the in-process memo may record it). */
  async function seed(principal: Principal): Promise<boolean> {
    if (await deps.isSeeded(principal)) {
      return true;
    }
    // Concurrent across SLUGS, and that is safe rather than merely convenient: each example is an independent
    // `(owner, slug)` row with its own CAS asset, so two passes share no row and cannot race each other. A
    // throw in any one of them rejects the whole pass — which is the intent: a partial seed must not latch.
    const outcomes = await Promise.all(EXAMPLE_PLUGIN_SLUGS.map(async (slug) => ({ slug, outcome: await seedOne(principal, slug) })));
    const minted = outcomes.filter((row) => row.outcome === "installed").length;
    const unavailable = outcomes.filter((row) => row.outcome === "unavailable").map((row) => row.slug);
    // THE LATCH IS A COMPLETENESS CLAIM (#1411). `examplePluginsSeeded` is read by `isSeeded` BEFORE any slug
    // is attempted, so latching an incomplete pass means the missing example can never be retried — a
    // transient pack failure silently costs that user the example for the life of the install. The per-slug
    // tolerance the file header describes is unchanged (a missing bundle skips ONE plugin and the other eight
    // still land); what it does NOT buy is the latch.
    if (unavailable.length > 0) {
      log.warn(
        { userId: principal.userId, minted, unavailable },
        "plugin: example-plugin seed is INCOMPLETE — not latching, the missing examples retry on the next touch",
      );
      return false;
    }
    await deps.markSeeded(principal);
    log.info({ userId: principal.userId, minted }, "plugin: seeded the example plugins (installed, disabled, nothing granted)");
    return true;
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
      if (settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending) {
        return pending;
      }
      const run = seed(principal)
        .then((latched: boolean): void => {
          // Only a LATCHED pass may be memoized — otherwise the in-process memo would suppress the retry the
          // un-written persisted latch just bought (#1411: the memo is the second half of the same skip).
          if (latched) {
            settled.add(principal.userId);
          }
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "plugin: example-plugin seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
