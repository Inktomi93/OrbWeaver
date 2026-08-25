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
// The latch is written ONLY after a fully successful pass, so a transient failure (a fs read, a db blip)
// retries on the next touch instead of silently skipping the user forever.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

/** The seeded examples, by bundle slug — the directory names under `boot/seed-assets/plugins/`. ONE per
 *  ARCHETYPE, which is what makes the set a menu rather than a demo: event reactor (research-familiar), tool
 *  provider (oracle-deck), quiet thinker (affinity-tracker), prompt transform (draft-polish), room surface
 *  (scene-chips). Adding a sixth is this tuple plus its source directory; nothing else here is per-plugin. */
export const EXAMPLE_PLUGIN_SLUGS = ["research-familiar", "oracle-deck", "affinity-tracker", "draft-polish", "scene-chips"] as const;

export interface ExamplePluginSeederDeps {
  /** Pack one example's source directory into installable bundle bytes; `null` when the pack ships no such
   *  slug (a missing example skips ONE plugin, it does not fail the pass). */
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

  /** Seed ONE example for `principal`. Returns whether a row was minted (for the log line only). */
  async function seedOne(principal: Principal, slug: string): Promise<boolean> {
    if (await deps.alreadyInstalled(principal, slug)) {
      return false;
    }
    const bundle = await deps.packBundle(slug);
    if (bundle === null) {
      log.warn({ slug }, "plugin: example bundle is missing from the pack — skipped");
      return false;
    }
    const { id } = await deps.install({ caller: principal, bundle });
    // The second half of the consent posture (file header): raise the standing ask. Deliberately NOT folded
    // into the install verb — a fresh install has nothing to re-consent to, which is exactly right for a
    // human who just chose a grant against the manifest, and exactly wrong for a row they never asked for.
    await deps.requestConsent({ caller: principal, pluginId: id });
    return true;
  }

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      return;
    }
    // Concurrent across SLUGS, and that is safe rather than merely convenient: each example is an independent
    // `(owner, slug)` row with its own CAS asset, so two passes share no row and cannot race each other. A
    // throw in any one of them rejects the whole pass — which is the intent: a partial seed must not latch.
    const results = await Promise.all(EXAMPLE_PLUGIN_SLUGS.map((slug) => seedOne(principal, slug)));
    const minted = results.filter(Boolean).length;
    // Only a pass that got all the way here latches. A throw above propagates to `ensureSeeded`'s catch and
    // the user is retried on their next touch.
    await deps.markSeeded(principal);
    log.info({ userId: principal.userId, minted }, "plugin: seeded the example plugins (installed, disabled, nothing granted)");
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
        .then((): void => {
          settled.add(principal.userId);
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
