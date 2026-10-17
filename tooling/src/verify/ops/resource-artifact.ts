// Canonical token-vault acquisition fails closed when any required input is unavailable.
import type { TokenContractTexts } from "@orb/ui/token-contract";
import { readTokenRemovalBaseline } from "@orb/ui/token-contract";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { generatedTypeHomeContextRefusal } from "../../floor/code-facts/type-home-declaration.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type { TokenContractResource, TokenGeneratedTypeResource } from "../contract/resource-artifact.ts";
import { TOKEN_CONTRACT_PATHS, TOKEN_GENERATED_TYPE_PATHS, TOKEN_GENERATION_INPUT_PATHS } from "../contract/resource-artifact.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

type TokenContractField = keyof TokenContractTexts;

const TOKEN_CONTRACT_FIELDS = Object.keys(TOKEN_CONTRACT_PATHS) as readonly TokenContractField[];

export function loadTokenContract(reader: ResourceReader, root: string): ResourceLoad<TokenContractResource> {
  const paths = TOKEN_CONTRACT_FIELDS.map((field) => TOKEN_CONTRACT_PATHS[field]).toSorted((left, right) => left.localeCompare(right));
  const texts: Partial<Record<TokenContractField, string>> = {};
  for (const field of TOKEN_CONTRACT_FIELDS) {
    const path = TOKEN_CONTRACT_PATHS[field];
    const loaded = reader.read(path);
    // ONE member short is a REFUSAL, never a partial bundle: the vault, its two themes, the Resolver, the
    // removed-token ledger and the two official schemas are a single fail-closed contract, and validating six
    // sevenths of it would report a clean vault over a missing schema.
    if (loaded.status !== "ready") {
      return {
        status: loaded.status,
        paths,
        members: Object.keys(texts).length,
        reason: `the token contract member ${field} (${path}) is unavailable: ${loaded.reason}`,
      };
    }
    texts[field] = loaded.value;
  }
  // The narrowing is sound by CONSTRUCTION rather than by assertion-flavoured optimism: the loop above is
  // total over `TOKEN_CONTRACT_FIELDS` (which is `keyof TokenContractTexts`) and returns on the first member
  // it could not read, so reaching this line means every field is populated.
  // THE RATCHET'S OTHER SIDE, acquired HERE because a policy has no root and no subprocess. It is read
  // unconditionally and its `unavailable` arm is DATA rather than an absence, so a fixture root (no `.git`)
  // and a real worktree take the same path through the validator and neither can read as "no removals".
  // `readTokenRemovalBaseline` owns the git invocation; this door owns only the decision to make it.
  const value: TokenContractResource = {
    texts: Object.freeze(texts) as TokenContractTexts,
    paths: Object.freeze(paths),
    removalBaseline: readTokenRemovalBaseline(root),
  };
  // `members` is what the door MEASURED — the seven bundle documents — never the token census inside them.
  return { status: "ready", value, paths, members: paths.length };
}

export function loadTokenGeneratedTypes(
  reader: ResourceReader,
  prepared: ResourceLoad<TokenGeneratedTypeResource> | undefined,
): ResourceLoad<TokenGeneratedTypeResource> {
  const paths = [...TOKEN_GENERATION_INPUT_PATHS, ...TOKEN_GENERATED_TYPE_PATHS];
  if (prepared === undefined) {
    return { status: "unresolved", paths, members: 0, reason: "generated token type preparation was not supplied" };
  }
  if (prepared.status !== "ready") {
    return prepared;
  }
  const refusal = generatedTypeHomeContextRefusal(prepared.value.context);
  if (refusal !== undefined) {
    return { status: "unresolved", paths, members: 0, reason: refusal };
  }
  for (const path of paths) {
    const text = prepared.value.observed.get(path);
    if (text === undefined) {
      return { status: "unresolved", paths, members: 0, reason: `generation input was not observed: ${path}` };
    }
    const current = reader.read(path);
    if (current.status !== "ready") {
      return { ...current, paths, members: 0 };
    }
    if (current.value !== text) {
      return { status: "unresolved", paths, members: 0, reason: `generated token source changed after preparation: ${path}` };
    }
  }
  return prepared;
}
