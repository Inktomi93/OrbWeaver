// The canonical token vault and generated-type preparation share production-owned shapes.
import type { TokenContractTexts, TokenRemovalBaseline } from "@orb/ui/token-contract";
import { TOKEN_ARTIFACT_PATHS, TOKEN_ARTIFACT_SOURCE_PATHS, TOKEN_TYPESCRIPT_ARTIFACT_KEYS } from "@orb/ui/token-contract";
import type { GeneratedTypeHomeContext } from "../../floor/code-facts/type-home-contract.ts";
import { UI_PACKAGE_ROOT } from "./css-family.ts";

/** The canonical token bundle, by the same field names the validator takes. Keeping the SHAPE aligned with
 *  `TokenContractTexts` is what lets the consuming gate hand this straight to `validateTokenContractTexts`
 *  without a re-spelling layer whose only job would be to rot. */
export const TOKEN_CONTRACT_PATHS: Readonly<Record<keyof TokenContractTexts, string>> = {
  base: "packages/ui/src/tokens/tokens.json",
  light: "packages/ui/src/tokens/themes/light.json",
  mocha: "packages/ui/src/tokens/themes/mocha.json",
  resolver: "packages/ui/src/tokens/resolver.json",
  removed: "packages/ui/src/tokens/removed.json",
  formatSchema: "packages/ui/src/tokens/schemas/format-2025.10.schema.json",
  resolverSchema: "packages/ui/src/tokens/schemas/resolver-2025.10.schema.json",
};

export interface TokenContractResource {
  readonly texts: TokenContractTexts;
  /** Repo-relative, sorted — the bundle's exact identity, so a finding can name the member it came from. */
  readonly paths: readonly string[];
  /** THE REMOVAL RATCHET'S OTHER SIDE (#2182 — `26f167a43d`; cited #2183, the sibling pair's issue, until
   *  #2294/#2314) — the merge-base copy of the vault, read by the PROVIDER
   *  because a policy has no root and cannot shell git (§12.3), the same shape `tracked-files` already uses
   *  for `git ls-files`. Without it `tokens-contract`'s conversion would have silently dropped half its
   *  stated subject: the static contract would still validate and a token removed with no ledger row would
   *  stop being reported, with every other check green. An UNAVAILABLE baseline is carried as data and the
   *  validator turns it into a `removed.baseline` DIAGNOSTIC — never a skip, so a fixture with no history
   *  and a repository with unreadable history answer the same way. */
  readonly removalBaseline: TokenRemovalBaseline;
}

export const TOKEN_GENERATED_TYPE_REQUEST = { kind: "token-contract", mode: "generated-types" } as const;
export type TokenGeneratedTypeRequest = typeof TOKEN_GENERATED_TYPE_REQUEST;
export const TOKEN_GENERATED_TYPE_PATHS = [
  `${UI_PACKAGE_ROOT}/${TOKEN_ARTIFACT_PATHS[TOKEN_TYPESCRIPT_ARTIFACT_KEYS[0]]}`,
  ...TOKEN_TYPESCRIPT_ARTIFACT_KEYS.slice(1).map((key) => `${UI_PACKAGE_ROOT}/${TOKEN_ARTIFACT_PATHS[key]}`),
] as const;
export const TOKEN_GENERATOR_PATH = `${UI_PACKAGE_ROOT}/${TOKEN_ARTIFACT_SOURCE_PATHS.producer}`;
export const TOKEN_GENERATION_INPUT_PATHS = [
  ...Object.values(TOKEN_CONTRACT_PATHS),
  ...Object.values(TOKEN_ARTIFACT_SOURCE_PATHS).map((path) => `${UI_PACKAGE_ROOT}/${path}`),
];

export interface TokenGeneratedTypeResource {
  readonly context: GeneratedTypeHomeContext;
  readonly observed: ReadonlyMap<string, string>;
}
