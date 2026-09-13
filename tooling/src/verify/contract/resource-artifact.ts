// The two CANONICAL GENERATED ARTIFACTS — deliberately narrow, exactly as `resource-gate-access-patterns.md`
// §7 specifies them, and neither reachable through any door that already ships.
//
// WHY `installed-package` DOES NOT COVER EITHER. Its three modes are a parsed declaration surface, a manifest
// tuple, and ONE named file's text. The token vault is seven authored documents that are one contract; the
// DevTools closure is a 500-file BYTE closure whose subject is the hash of every member. A `text` read of one
// file is not a closure, and a closure assembled by a policy calling `text` 500 times would be a private
// reader wearing a contract's clothes.
//
// THE VALIDATORS STAY WHERE THEY ARE. `validateTokenContractTexts` and the DevTools pin/manifest/licence
// validation are unique algorithms owned by their gates (`packages/ui/token-contract.ts:757`,
// `tooling/src/_shared/devtools-assets.ts:123,260`). These doors own LOADING, identity, refusal and the
// receipt — which is why each publishes the count the validator would otherwise have to be trusted about:
// seven token texts, and the exact file/byte census of the closure.
import type { TokenContractTexts, TokenRemovalBaseline } from "@orb/ui/token-contract";

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
  /** THE REMOVAL RATCHET'S OTHER SIDE (#2183) — the merge-base copy of the vault, read by the PROVIDER
   *  because a policy has no root and cannot shell git (§12.3), the same shape `tracked-files` already uses
   *  for `git ls-files`. Without it `tokens-contract`'s conversion would have silently dropped half its
   *  stated subject: the static contract would still validate and a token removed with no ledger row would
   *  stop being reported, with every other check green. An UNAVAILABLE baseline is carried as data and the
   *  validator turns it into a `removed.baseline` DIAGNOSTIC — never a skip, so a fixture with no history
   *  and a repository with unreadable history answer the same way. */
  readonly removalBaseline: TokenRemovalBaseline;
}

/** The committed DevTools frontend closure root. Every member is owned, regular and hashed. */
export const DEVTOOLS_CLOSURE_ROOT = "tooling/src/snap/lib/devtools-frontend";
export const DEVTOOLS_CLOSURE_PIN = "tooling/src/snap/lib/devtools-frontend/pin.json";
export const DEVTOOLS_CLOSURE_MANIFEST = "tooling/src/snap/lib/devtools-frontend/manifest.json";
export const DEVTOOLS_CLOSURE_LICENSES = "tooling/src/snap/lib/devtools-frontend/licenses.json";

/** One closure member. `path` is relative to the closure ROOT, because that is the spelling the manifest and
 *  licence rows use and re-anchoring it would make every comparison a string-surgery exercise. */
export interface DevToolsClosureFile {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface DevToolsClosure {
  readonly root: string;
  /** The three control documents, as text, because the pin's own `manifestSha256` is over the manifest's
   *  exact BYTES and re-serializing a parsed copy would not reproduce it. */
  readonly pinText: string;
  readonly manifestText: string;
  readonly licensesText: string;
  /** EVERY regular file under the root, the three control documents included, sorted by `file`. The exact
   *  inventory is the subject: an extra unowned member is as much a defect as a missing one. */
  readonly files: readonly DevToolsClosureFile[];
  readonly totalBytes: number;
}
