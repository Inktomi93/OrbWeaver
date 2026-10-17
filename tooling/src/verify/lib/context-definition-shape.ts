// Canonical mint vocabulary shared by native literal walls, projection publication and region-count health.
/** The ONE legal minter of both context-definition literal shapes. */
export const REGISTRY_CONTRACTS_RE = /\/lib\/registry-contracts\.ts$/u;

/** The region mint whose single-call-site invariant the `-health` sibling counts. */
export const DEFINE_CONTEXT_REGION = "defineContextRegion";

/** The tabs mint whose projection publication remains the custom owner's claim. */
export const DEFINE_CONTEXT_TABS = "defineContextTabs";

/** Actual native inputs whose edits or deletion must rejudge client context syntax. */
export const CONTEXT_NATIVE_INPUT_PATHS = ["eslint.config.js", "tooling/src/verify/lib/context-definition-shape.ts"] as const;
export const CONTEXT_NATIVE_RULES = ["orb/context-definition-shape", "orb/context-shell-chrome", "orb/no-mutating-register-api"] as const;

export function affectsContextNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || CONTEXT_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
