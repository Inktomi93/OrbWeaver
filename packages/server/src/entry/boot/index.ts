// entry/boot — FRONT DOOR for the boot protocol's step functions. `entry/lifecycle.ts` + `entry/index.ts`
// import the boot steps from here and run them in the §"Boot order" sequence (migrate → seed[credential /
// owner / default-preset / default-characters] → reclaim-locks). Each step is a small injected-deps factory
// owning zero business logic — it wires lower tiers (domain front doors + `@orb/db`) at boot time.

export type { MigrateDeps } from "./migrate";
export { resolveMigrationsFolder, runBootMigrations } from "./migrate";
export type { ReclaimLocksDeps } from "./reclaim-locks";
export { reclaimLocksOnBoot } from "./reclaim-locks";
export type { SeedCredentialDeps } from "./seed-credential";
export { seedCredentialFromEnv } from "./seed-credential";
export type { SeedDefaultCharactersDeps } from "./seed-default-characters";
export { seedDefaultCharacters } from "./seed-default-characters";
export type { SeedDefaultPresetDeps } from "./seed-default-preset";
export { seedDefaultPreset } from "./seed-default-preset";
export type { SeedOwnerDeps } from "./seed-owner";
export { seedOwner } from "./seed-owner";
export type { SeedThemesDeps } from "./seed-themes";
export { seedThemes } from "./seed-themes";
