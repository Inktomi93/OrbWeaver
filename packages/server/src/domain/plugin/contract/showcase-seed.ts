// Showcase seeding consumes settings completion/provenance ports; plugin owns install and upgrade policy.

import type { Principal } from "@orb/contracts/identity";
import type { ExamplePluginSeededOp, MarkExamplePluginSeededOp, ReadSeededPluginVersionsOp, WriteSeededPluginVersionsOp } from "@orb/contracts/settings";
import type { Logger } from "#foundation/observability";
import type { PluginSeedOps } from "./seed-ops.ts";
import type { PluginContext } from "./service.ts";

export interface ExamplePluginSeederDeps {
  readonly logger: Logger;
  readonly slugs: readonly string[];
  /** Pack one example's source directory into installable bundle bytes; `null` when the pack ships no such
   *  slug. A missing example skips ONE plugin and does not fail the pass (the other slugs still install) —
   *  but it does BLOCK THE LATCH, so the skip is retried rather than made permanent. */
  readonly packBundle: (slug: string) => Promise<Uint8Array | null>;
  /** The version the SHIPPED bundle declares, read off its own manifest (`readShowcaseManifest`) and never
   *  re-spelled anywhere. `null` when the package ships no such slug — the same absence `packBundle` reports,
   *  so one missing bundle produces one skipped slug rather than two disagreeing answers. */
  readonly bundledVersion: PluginContext["showcase"]["version"];
  /** The REAL install verb, under the receiving user's own Principal. */
  readonly install: (...args: Parameters<PluginSeedOps["install"]>) => Promise<Pick<Awaited<ReturnType<PluginSeedOps["install"]>>, "id">>;
  /** The REAL upgrade verb — the SAME one a hand upload and the one-click url update drive, which is what
   *  carries the consent wall (widened reach ⇒ disabled + standing re-consent; grant = prior ∩ declared). */
  readonly upgrade: PluginSeedOps["upgrade"];
  /** The REAL re-grant verb with an EMPTY grant — what raises `pending_reconsent` so the user's first act is
   *  a genuine consent against the real screen (file header). */
  readonly requestConsent: PluginSeedOps["requestConsent"];
  /** Every SHOWCASE row the caller holds right now — one read per pass, which is also the collision check the
   *  install half needs (`install` refuses a slug the user already holds). */
  readonly listHeld: PluginSeedOps["listHeld"];
  readonly isSeeded: ExamplePluginSeededOp;
  readonly markSeeded: MarkExamplePluginSeededOp;
  /** `onboarding.seededPluginVersions` — what this system last wrote per slug (the divergence oracle). */
  readonly readSeededVersions: ReadSeededPluginVersionsOp;
  /** Persist the whole map. Called ONLY when it actually changed, so a settled boot writes nothing. */
  readonly writeSeededVersions: WriteSeededPluginVersionsOp;
}

export interface ExamplePluginSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

const SEED_OUTCOMES = ["installed", "present", "unavailable"] as const;
type SeedOutcome = (typeof SEED_OUTCOMES)[number];

/** Only a newly installed bundle supplies written-version provenance. */
export type ShowcaseSeedResult =
  | { readonly outcome: Extract<SeedOutcome, "installed">; readonly version: string }
  | { readonly outcome: Exclude<SeedOutcome, "installed">; readonly version: null };
