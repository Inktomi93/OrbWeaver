// Gate: tokens-contract (#936) — the canonical token vault, shipped value sets, Resolver manifest,
// vendored official schemas, Orb extensions, and removed-token ledger are one fail-closed contract.
// fsBacked is required because JSON and schema bytes are outside the shared ts-morph walk.
// The validator is reached by RELATIVE path, not an `@orb/ui` subpath: it is devtime build/verify
// machinery (node:fs + node:child_process + ajv, a @orb/ui devDependency) sitting beside tokens.build.ts
// at the package ROOT, so an `exports` entry for it would declare non-shippable code as @orb/ui's
// production surface — which is exactly what `knip --production` caught (#1847). Tools sit ABOVE the cake
// and may read down; the reverse edge is what `packages-no-tooling` seals, so the module cannot re-home
// here while packages/ui/tokens.build.ts consumes it.
import { join, resolve } from "node:path";
import type { TokenContractTexts } from "../../../../packages/ui/token-contract.ts";
import { readTokenContractTexts, validateTokenContract } from "../../../../packages/ui/token-contract.ts";
import type { GateDescriptor } from "../contract/gate.ts";

const UI_ROOT = join(import.meta.dirname, "../../../../packages/ui");
const REPO_ROOT = resolve(UI_ROOT, "../..");
const CANONICAL = readTokenContractTexts(UI_ROOT);

function fixtureFiles(texts: TokenContractTexts): Readonly<Record<string, string>> {
  return {
    "packages/ui/src/tokens/tokens.json": texts.base,
    "packages/ui/src/tokens/themes/light.json": texts.light,
    "packages/ui/src/tokens/themes/mocha.json": texts.mocha,
    "packages/ui/src/tokens/resolver.json": texts.resolver,
    "packages/ui/src/tokens/removed.json": texts.removed,
    "packages/ui/src/tokens/schemas/format-2025.10.schema.json": texts.formatSchema,
    "packages/ui/src/tokens/schemas/resolver-2025.10.schema.json": texts.resolverSchema,
  };
}

function invalidDimensionFixture(): TokenContractTexts {
  const base = JSON.parse(CANONICAL.base) as Record<string, unknown>;
  const spacing = base["spacing"] as Record<string, unknown>;
  const tight = spacing["tight"] as Record<string, unknown>;
  const value = tight["$value"] as Record<string, unknown>;
  if (value["unit"] !== "rem") {
    throw new Error("tokens-contract conformance plant lost its spacing.tight rem anchor");
  }
  value["unit"] = "ch";
  return { ...CANONICAL, base: `${JSON.stringify(base, null, 2)}\n` };
}

function findingFile(path: string): string {
  if (path.startsWith("src/")) {
    return `packages/ui/${path.split("/")[0] === "src" ? path : `src/tokens/${path}`}`;
  }
  return "packages/ui/src/tokens/tokens.json";
}

export const gate: GateDescriptor = {
  name: "tokens-contract",
  docRow: "token-contract-program.md §4",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the token vault violates the pinned DTCG 2025.10 Format/Resolver contract or Orb's closed semantic extensions; invalid token data must never reach Style Dictionary or generated CSS. See packages/ui/token-contract.ts",
  fix: "repair the reported token/schema/Resolver/extension/ledger violation, then run `pnpm --filter @orb/ui tokens:build`; contract: packages/ui/token-contract.ts",
  run: (ctx) => {
    // Conformance fixtures are complete filesystem corpora but intentionally are not Git worktrees.
    // The real gate invocation retains the history ratchet; the fixture arm proves the static contract.
    const historyRoot = resolve(ctx.root) === REPO_ROOT ? ctx.root : undefined;
    const result = validateTokenContract(join(ctx.root, "packages/ui"), historyRoot);
    ctx.scan({ unit: "token", candidates: result.scannedTokens, scanned: result.scannedTokens });
    for (const item of result.diagnostics) {
      ctx.report({
        file: findingFile(item.path),
        line: 0,
        column: 0,
        token: item.code,
        message: `[${item.code}] ${item.path}: ${item.message} — packages/ui/token-contract.ts`,
      });
    }
  },
  mustFlag: [
    {
      files: fixtureFiles(invalidDimensionFixture()),
      expect: { token: "format.schema", messageIncludes: "spacing/tight" },
      why: "a planted non-DTCG dimension unit is rejected by the official Format schema",
    },
  ],
  mustPass: [
    {
      files: fixtureFiles(CANONICAL),
      why: "the complete canonical filesystem corpus passes; the real-worktree invocation separately applies the Git removal ratchet",
    },
  ],
};
