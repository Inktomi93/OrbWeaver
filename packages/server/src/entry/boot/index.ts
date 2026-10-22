// Front door for the boot protocol's step functions, run in order by entry/lifecycle.ts.

export { backfillPluginProvenanceOnBoot } from "./backfill-plugin-provenance.ts";
export { settleBootSecrets } from "./boot-secrets.ts";
export { composeBootDisclaimer } from "./disclaimer.ts";
export { healLegacyBackgroundPinsOnBoot } from "./heal-legacy-background-pins.ts";
export { planLocalLightPrefetch } from "./local-light-prefetch.ts";
export { DB_LAUNCHED, runBootMigrations } from "./migrate.ts";
export { migrateDataLayout } from "./migrate-data-layout.ts";
export { migrateHandoffOfferVocabOnBoot } from "./migrate-handoff-offer-vocab.ts";
export { migratePluginToolWireNamesOnBoot } from "./migrate-plugin-tool-wire-names.ts";
export { migrateProseSlotVocabOnBoot } from "./migrate-prose-slot-vocab.ts";
export { announceOwnerClaim, removeOwnerClaimFileOnSpend } from "./owner-claim.ts";
export { reactivatePluginsOnBoot } from "./reactivate-plugins.ts";
export { rebuildStatsTimelineOnBoot } from "./rebuild-stats-timeline.ts";
export { reclaimLocksOnBoot } from "./reclaim-locks.ts";
export { repairStaleJoinSeqOnBoot } from "./repair-stale-join-seq.ts";
export { seedCasSchedules } from "./seed-cas-schedules.ts";
export { seedCredentialFromEnv } from "./seed-credential.ts";
export { seedDefaultBackgrounds } from "./seed-default-backgrounds.ts";
export { seedDefaultPreset } from "./seed-default-preset.ts";

export { seedExamplePlugins } from "./seed-example-plugins-step.ts";
export { createLocalLightUserSeed, seedLocalLightOnBoot } from "./seed-local-light.ts";
export { seedOwner } from "./seed-owner.ts";
export { seedThemes } from "./seed-themes.ts";
export { seedUserContent } from "./seed-user-content.ts";
