// Generated token type preparation uses production-owned artifact paths.
import type { TokenContractTexts } from "@orb/ui/token-contract";
import { TOKEN_ARTIFACT_PATHS, TOKEN_ARTIFACT_SOURCE_PATHS, TOKEN_TYPESCRIPT_ARTIFACT_KEYS } from "@orb/ui/token-contract";
import type { GeneratedTypeHomeContext } from "../../floor/code-facts/type-home-contract.ts";
import { UI_PACKAGE_ROOT } from "./css-family.ts";

export const TOKEN_CONTRACT_PATHS: Readonly<Record<keyof TokenContractTexts, string>> = {
  base: "packages/ui/src/tokens/tokens.json",
  light: "packages/ui/src/tokens/themes/light.json",
  mocha: "packages/ui/src/tokens/themes/mocha.json",
  resolver: "packages/ui/src/tokens/resolver.json",
  removed: "packages/ui/src/tokens/removed.json",
  formatSchema: "packages/ui/src/tokens/schemas/format-2025.10.schema.json",
  resolverSchema: "packages/ui/src/tokens/schemas/resolver-2025.10.schema.json",
};

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
