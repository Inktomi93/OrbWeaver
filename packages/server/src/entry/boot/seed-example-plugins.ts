// Idempotent SHOWCASE-PLUGIN seeder — the fourth member of the seeder family (default characters, default
// persona, roster presets, and the showcase plugins). Called both at boot (the deployment owner) and on first
// authed request (every new user), through the ONE shared instance so the in-process memo + the persisted
// latch make re-runs a no-op. `ensureSeeded` never throws.
//
// WHY EXAMPLES SHIP INSTALLED AT ALL. A plugin surface with an empty list teaches nobody what a plugin is.
// The set is one per ARCHETYPE — one EVENT-driven (Research Familiar), one TOOL-registering (Oracle Deck),
// and seven more — so the Settings → Plugins pane opens on working, readable, adaptable things instead of a
// dropzone.
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
// WHICH BUNDLES, AND WHERE THEY LIVE (#1692): the set is `SHOWCASE_PLUGIN_SLUGS`, owned by the
// `@orb/showcase-plugins` workspace package the server DECLARES as a dependency — the bytes arrive by NODE
// RESOLUTION, never a path literal into this tier. This module knows the slug tuple and nothing else about
// the content; the bytes and the shipped version both come in as injected ops.
//
// ── THE PASS HAS TWO HALVES, AND ONLY THE FIRST IS LATCHED (#803, owner-ruled 2026-09-05: AUTO-UPGRADE) ──
//
// INSTALL half — gated by `UserSettings.onboarding.examplePluginsSeeded`. Its two idempotency layers (the
// persona/character seeder shape — one layer is not enough, #461):
//   1. the persisted latch — once true the install half never re-runs, which is the DELETION-RESPECT guard
//      (a user who removed an example must not have it resurrected);
//   2. per-slug collision tolerance — a slug the user already holds is "already present, nothing to do"
//      rather than a failure. Layer 2 covers a latch that came back at schema defaults (a settings blob CAN,
//      live receipt 2026-08-22) without minting a second copy: `(owner, slug)` UNIQUE is the real backstop.
// The latch is written ONLY after a COMPLETE pass — every slug installed or already present — so a transient
// failure (a fs read, a db blip, a bundle the pack could not produce) retries on the next touch instead of
// silently skipping the user forever. That completeness is `SeedOutcome`'s whole job (#1411): a throw is not
// the only way a pass can be incomplete, and the non-throwing way used to latch.
//
// UPGRADE half — runs on EVERY pass, latched or not, because a latch that meant "never look at these rows
// again" is precisely what kept an improved bundle (card-atlas 1.0.0 → 1.1.0) from ever reaching an existing
// install: the improvement only reached a FRESH database. It touches a slug only when ALL of these hold:
//   · the user still HOLDS the row — a slug they deleted is simply absent from the read, so deletion-respect
//     is not a second rule here, it is the same one;
//   · the shipped version is strictly NEWER than the installed one (`isVersionNewer`, the domain's own
//     ordering — an equal version writes nothing, which is what makes a second boot a no-op);
//   · the install has NOT DIVERGED — `onboarding.seededPluginVersions[slug]` is the version this system
//     itself last wrote, and a row sitting at any other version has been taken over by its owner. That is
//     not a new idea: `domain/plugin/verbs/uninstall-for-all-users.ts` already rules that a row's `version`
//     is the divergence oracle and skips a `version-diverged` recipient for exactly this reason.
//
// THE PRIOR RULING SURVIVES; ITS INPUT CHANGED. The settings comment on `examplePluginsSeeded` used to end
// "No pack-version twin: a plugin's own manifest `version` + the `upgrade` verb are the release channel for
// bundle content, and re-dressing an INSTALLED plugin behind the user's back is exactly what the consent
// posture exists to prevent." Both halves are still obeyed and are what make the auto-upgrade admissible:
// the release channel is STILL the shipped manifest's version and STILL the REAL `upgrade` verb (no second
// install path, no pack-version counter — `seededPluginVersions` records provenance, not a release), and
// "behind the user's back" stays blocked by that verb's own wall — an upgrade that WIDENS reach lands the row
// DISABLED with a standing re-consent, the grant carried forward is the intersection of prior ∩ newly
// declared, and a plugin the user turned off stays off. What changed is the owner's answer to whether a
// PRISTINE copy of our own gift should keep improving: it should.
//
// THE BACKFILL ARM, stated so it is not mistaken for sloppiness: a held slug with NO recorded version is one
// seeded before #803 existed, and it is ADOPTED (treated as ours) rather than frozen. Freezing it would mean
// every install that predates this code never receives another improvement — the exact symptom the ruling
// was about — and pre-launch there is no population of hand-forked showcase installs to protect (D157). The
// arm self-retires: the first pass records every held slug, after which the oracle is exact.
//
// A per-slug upgrade FAILURE is tolerated and does not block the latch or the memo: the user keeps the older
// working version, the record is left un-advanced, and the next process retries. An upgrade is not a
// completeness claim about the seed the way an install is.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginId, UserId } from "@orb/kit/ids";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { isVersionNewer } from "#domain/plugin";
import { getLog } from "#foundation/observability";

/** What ONE slug's INSTALL pass can produce, homed as a tuple and DERIVED from (never re-spelled — the axis
 *  rule). `installed`/`present` both mean "accounted for"; `unavailable` means the pack shipped no such
 *  bundle, which is the one outcome that must block the latch. Module-local: the seeder's internal
 *  completeness vocabulary, never a cross-boundary shape. */
const SEED_OUTCOMES = ["installed", "present", "unavailable"] as const;
type SeedOutcome = (typeof SEED_OUTCOMES)[number];

/** One showcase row the caller currently holds, as the upgrade half needs to see it. Module-local: the
 *  projection of `plugin.list` this seeder reads, not a shape any other module names. */
interface HeldShowcasePlugin {
  readonly slug: string;
  readonly pluginId: PluginId;
  readonly version: string;
}

export interface ExamplePluginSeederDeps {
  /** Pack one example's source directory into installable bundle bytes; `null` when the pack ships no such
   *  slug. A missing example skips ONE plugin and does not fail the pass (the other slugs still install) —
   *  but it does BLOCK THE LATCH (#1411), so the skip is retried rather than made permanent. */
  readonly packBundle: (slug: string) => Promise<Uint8Array | null>;
  /** The version the SHIPPED bundle declares, read off its own manifest (`readShowcaseManifest`) and never
   *  re-spelled anywhere. `null` when the package ships no such slug — the same absence `packBundle` reports,
   *  so one missing bundle produces one skipped slug rather than two disagreeing answers. */
  readonly bundledVersion: (slug: string) => Promise<string | null>;
  /** The REAL install verb, under the receiving user's own Principal. */
  readonly install: (args: { readonly caller: Principal; readonly bundle: Uint8Array }) => Promise<{ readonly id: PluginId }>;
  /** The REAL upgrade verb — the SAME one a hand upload and the one-click url update drive, which is what
   *  carries the consent wall (widened reach ⇒ disabled + standing re-consent; grant = prior ∩ declared). */
  readonly upgrade: (args: { readonly caller: Principal; readonly pluginId: PluginId; readonly bundle: Uint8Array }) => Promise<void>;
  /** The REAL re-grant verb with an EMPTY grant — what raises `pending_reconsent` so the user's first act is
   *  a genuine consent against the real screen (file header). */
  readonly requestConsent: (args: { readonly caller: Principal; readonly pluginId: PluginId }) => Promise<void>;
  /** Every SHOWCASE row the caller holds right now — one read per pass, which is also the collision check the
   *  install half needs (`install` refuses a slug the user already holds). */
  readonly listHeld: (caller: Principal) => Promise<readonly HeldShowcasePlugin[]>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  readonly markSeeded: (principal: Principal) => Promise<void>;
  /** `onboarding.seededPluginVersions` — what this system last wrote per slug (the divergence oracle). */
  readonly readSeededVersions: (principal: Principal) => Promise<Readonly<Record<string, string>>>;
  /** Persist the whole map. Called ONLY when it actually changed, so a settled boot writes nothing. */
  readonly writeSeededVersions: (principal: Principal, versions: Readonly<Record<string, string>>) => Promise<void>;
}

export interface ExamplePluginSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

export function createExamplePluginSeeder(deps: ExamplePluginSeederDeps): ExamplePluginSeeder {
  const log = getLog();
  // Populated only on success — a transient failure retries on the next touch. ASSUMES(single-replica).
  // It also bounds the UPGRADE half to once per process per user, which is exactly right: the shipped
  // versions cannot change while the process runs, so a second look could only ever find nothing.
  const settled = new Set<UserId>();
  const inFlight = new Map<UserId, Promise<void>>();

  /** Install ONE example for `principal`. The outcome is the LATCH INPUT, not a log detail (#1411):
   *  `installed`/`present` are both "this slug is accounted for", `unavailable` is not. Returns the version
   *  it wrote so the caller can record OUR provenance for it. */
  async function seedOne(principal: Principal, slug: string, held: boolean): Promise<{ readonly outcome: SeedOutcome; readonly version: string | null }> {
    if (held) {
      return { outcome: "present", version: null };
    }
    const bundle = await deps.packBundle(slug);
    const version = await deps.bundledVersion(slug);
    if (bundle === null || version === null) {
      log.warn({ slug }, "plugin: showcase bundle is missing from the package — skipped, and the pass will NOT latch");
      return { outcome: "unavailable", version: null };
    }
    const { id } = await deps.install({ caller: principal, bundle });
    // The second half of the consent posture (file header): raise the standing ask. Deliberately NOT folded
    // into the install verb — a fresh install has nothing to re-consent to, which is exactly right for a
    // human who just chose a grant against the manifest, and exactly wrong for a row they never asked for.
    await deps.requestConsent({ caller: principal, pluginId: id });
    return { outcome: "installed", version };
  }

  /** The INSTALL half. Returns whether it LATCHED (which is also whether the memo may record the pass) plus
   *  the provenance every newly-installed slug earned. */
  async function install(
    principal: Principal,
    held: ReadonlySet<string>,
  ): Promise<{ readonly latched: boolean; readonly wrote: Readonly<Record<string, string>> }> {
    // Concurrent across SLUGS, and that is safe rather than merely convenient: each example is an independent
    // `(owner, slug)` row with its own CAS asset, so two passes share no row and cannot race each other. A
    // throw in any one of them rejects the whole pass — which is the intent: a partial seed must not latch.
    const results = await Promise.all(SHOWCASE_PLUGIN_SLUGS.map(async (slug) => ({ slug, ...(await seedOne(principal, slug, held.has(slug))) })));
    const minted = results.filter((row) => row.outcome === "installed").length;
    const unavailable = results.filter((row) => row.outcome === "unavailable").map((row) => row.slug);
    const wrote: Record<string, string> = {};
    for (const row of results) {
      if (row.version !== null) {
        wrote[row.slug] = row.version;
      }
    }
    // THE LATCH IS A COMPLETENESS CLAIM (#1411). `examplePluginsSeeded` is read BEFORE any slug is attempted,
    // so latching an incomplete pass means the missing example can never be retried — a transient pack failure
    // silently costs that user the example for the life of the install. The per-slug tolerance the file header
    // describes is unchanged (a missing bundle skips ONE plugin and the other eight still land); what it does
    // NOT buy is the latch.
    if (unavailable.length > 0) {
      log.warn(
        { userId: principal.userId, minted, unavailable },
        "plugin: showcase-plugin seed is INCOMPLETE — not latching, the missing examples retry on the next touch",
      );
      return { latched: false, wrote };
    }
    await deps.markSeeded(principal);
    log.info({ userId: principal.userId, minted }, "plugin: seeded the showcase plugins (installed, disabled, nothing granted)");
    return { latched: true, wrote };
  }

  /** Is this held row still exactly what WE last wrote? The divergence oracle, in one place — and it is the
   *  plugin domain's OWN rule rather than a new one: `domain/plugin/verbs/uninstall-for-all-users.ts:31`
   *  already treats a row's `version` as the oracle and passes over a `version-diverged` recipient because
   *  "they have taken the plugin over". `recorded === undefined` is the pre-#803 BACKFILL arm (adopt; the
   *  file header states why that is the safe arm and how it self-retires). */
  function isPristine(row: HeldShowcasePlugin, recorded: string | undefined): boolean {
    return recorded === undefined || recorded === row.version;
  }

  /** Take ONE held row from `row.version` to the shipped bundle, or answer `null` for "left alone" (nothing
   *  newer ships · this package ships no such slug · the owner has diverged · the upgrade failed). Split out
   *  from the loop so each reason states itself once. */
  async function upgradeOne(principal: Principal, row: HeldShowcasePlugin, recorded: string | undefined): Promise<string | null> {
    const shipped = await deps.bundledVersion(row.slug);
    if (shipped === null || !isVersionNewer(shipped, row.version)) {
      return null;
    }
    if (!isPristine(row, recorded)) {
      // The user has taken this plugin over. We do not touch it — and we still do not manufacture any state
      // for it here. Since #1740 the OWNER can take the newer bundle deliberately: `plugin.checkForUpdates`
      // reports a showcase row against the shipped manifest and `plugin.upgradeFromShowcase` runs it through
      // the REAL `upgrade` verb, so the offer is an explicit one-click and never this pass's doing. This log
      // line stays the record of what the AUTOMATIC pass refused.
      log.info(
        { userId: principal.userId, slug: row.slug, installed: row.version, shipped, seeded: recorded ?? null },
        "plugin: a NEWER showcase bundle ships, but this install has diverged from what we seeded — left untouched",
      );
      return null;
    }
    const bundle = await deps.packBundle(row.slug);
    if (bundle === null) {
      return null;
    }
    try {
      // The REAL upgrade verb, as the row's OWNER. Everything that makes this safe lives in there.
      await deps.upgrade({ caller: principal, pluginId: row.pluginId, bundle });
    } catch (err) {
      // Reported-and-continue (the log line below owns the failure): the user keeps the
      // older WORKING version, the provenance record is left un-advanced so the next process retries, and
      // one bundle's failure must not cost the other eight their upgrade. Ends if a failed showcase upgrade
      // becomes a condition the pass must fail on.
      log.warn(
        { userId: principal.userId, slug: row.slug, installed: row.version, shipped, err: errorMessage(err) },
        "plugin: showcase auto-upgrade FAILED for one slug — the installed version stands and the next boot retries",
      );
      return null;
    }
    log.info({ userId: principal.userId, slug: row.slug, from: row.version, to: shipped }, "plugin: auto-upgraded a seeded showcase plugin");
    return shipped;
  }

  /** The UPGRADE half. Runs on every pass; returns the provenance it advanced (empty when nothing moved). */
  async function upgradeHeld(
    principal: Principal,
    held: readonly HeldShowcasePlugin[],
    recorded: Readonly<Record<string, string>>,
  ): Promise<Readonly<Record<string, string>>> {
    const wrote: Record<string, string> = {};
    // SERIAL, unlike the install half: each iteration deactivates a resident instance, writes two CAS blobs
    // and swaps a row (`verbs/upgrade.ts`), and there is no reason to stack that work on one sqlite file for
    // a background improvement nobody is waiting on.
    for (const row of held) {
      const landed = await upgradeOne(principal, row, recorded[row.slug]);
      if (landed !== null) {
        wrote[row.slug] = landed;
      }
    }
    return wrote;
  }

  /** Runs a pass; returns whether it LATCHED (which is also whether the in-process memo may record it). */
  async function seed(principal: Principal): Promise<boolean> {
    const alreadySeeded = await deps.isSeeded(principal);
    const showcase = new Set<string>(SHOWCASE_PLUGIN_SLUGS);
    const held = (await deps.listHeld(principal)).filter((row) => showcase.has(row.slug));
    const recorded = await deps.readSeededVersions(principal);

    // The install half only when the latch is open; `held` is the collision check it used to make per slug.
    const installed = alreadySeeded
      ? { latched: true, wrote: {} as Readonly<Record<string, string>> }
      : await install(principal, new Set(held.map((row) => row.slug)));

    // The upgrade half ALWAYS — and only over rows the user still holds, which for a just-completed install
    // pass is the empty set (nothing installed a moment ago can be behind the bundle that installed it).
    const upgraded = await upgradeHeld(principal, held, recorded);

    const next = { ...recorded, ...installed.wrote, ...upgraded };
    // ONLY when it actually changed — a settled boot at equal versions must write nothing (the idempotency
    // claim this seeder's whole re-run posture rests on).
    if (JSON.stringify(next) !== JSON.stringify(recorded)) {
      await deps.writeSeededVersions(principal, next);
    }
    return installed.latched;
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
          log.error({ userId: principal.userId, err: errorMessage(err) }, "plugin: showcase-plugin seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
