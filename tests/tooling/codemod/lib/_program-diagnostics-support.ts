export const NODE_OPTIONS = {
  target: "es2022",
  module: "esnext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  lib: ["es2022"],
  strict: true,
  noEmit: true,
} as const;

export const BROWSER_OPTIONS = { ...NODE_OPTIONS, lib: ["es2022", "dom"] } as const;

export function config(compilerOptions: object, include: readonly string[]): string {
  return JSON.stringify({ compilerOptions, include });
}
