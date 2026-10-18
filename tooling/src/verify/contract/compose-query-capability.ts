// The native query frontier shares its physical-driver and query-free boot ownership across import and syntax checks.
export const ENTRY_SOURCE = "^packages/server/src/entry/";
export const ENTRY_WIRING_GLOBS = ["packages/server/src/entry/**/*.{ts,tsx}"];
const QUERY_FREE_BOOT_MODULES = ["seed-example-plugins", "seed-user-content", "seed-local-light"] as const;
export const QUERY_FREE_BOOT_GLOBS = QUERY_FREE_BOOT_MODULES.map((name) => `packages/server/src/entry/boot/${name}.ts`);
export const ENTRY_DRIVER_GLOBS = ["packages/server/src/entry/index.ts", "packages/server/src/entry/lifecycle.ts", "packages/server/src/entry/boot/**"];
export const ENTRY_DRIVER_PATTERN = `${ENTRY_SOURCE}(?:(?:index|lifecycle)\\.ts$|boot/(?!(?:${QUERY_FREE_BOOT_MODULES.join("|")})\\.ts$))`;

// Non-driver entry currently needs the relay target and the standalone media check's standard streams/status only.
export const ENTRY_PROCESS_PROPERTIES = ["platform", "arch", "stdout", "stderr", "exitCode"] as const;
