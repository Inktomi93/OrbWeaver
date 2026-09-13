// Canonical generated-artifact acquisition: the token bundle as text, and the DevTools closure as a hashed
// byte census. Both fail closed — a partially-read contract is not a contract.
import { createHash } from "node:crypto";
import type { TokenContractTexts } from "@orb/ui/token-contract";
import { readTokenRemovalBaseline } from "@orb/ui/token-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type { DevToolsClosure, DevToolsClosureFile, TokenContractResource } from "../contract/resource-artifact.ts";
import {
  DEVTOOLS_CLOSURE_LICENSES,
  DEVTOOLS_CLOSURE_MANIFEST,
  DEVTOOLS_CLOSURE_PIN,
  DEVTOOLS_CLOSURE_ROOT,
  TOKEN_CONTRACT_PATHS,
} from "../contract/resource-artifact.ts";

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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function loadDevToolsClosure(reader: ResourceReader): ResourceLoad<DevToolsClosure> {
  const tree = reader.tree(DEVTOOLS_CLOSURE_ROOT);
  if (tree.status !== "ready") {
    return { status: tree.status, paths: tree.paths, members: 0, reason: `the DevTools asset closure ${DEVTOOLS_CLOSURE_ROOT} is unavailable: ${tree.reason}` };
  }
  const paths = tree.value
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path)
    .toSorted((left, right) => left.localeCompare(right));
  const snapshot = reader.snapshot(paths);
  if (snapshot.status !== "ready") {
    return { status: snapshot.status, paths, members: 0, reason: `the DevTools asset closure could not be read: ${snapshot.reason}` };
  }
  const files: DevToolsClosureFile[] = [];
  let totalBytes = 0;
  for (const member of snapshot.value) {
    // A symlink inside the closure is a refusal, not a member: the closure's guarantee is that every served
    // byte is an OWNED byte, and a link is a byte nobody in this repository controls.
    if (member.kind !== "file") {
      return { status: "unresolved", paths, members: files.length, reason: `the DevTools asset closure contains a symbolic link: ${member.path}` };
    }
    totalBytes += member.bytes.length;
    files.push(Object.freeze({ file: member.path.slice(`${DEVTOOLS_CLOSURE_ROOT}/`.length), bytes: member.bytes.length, sha256: sha256(member.bytes) }));
  }
  const texts = new Map<string, string>();
  for (const control of [DEVTOOLS_CLOSURE_PIN, DEVTOOLS_CLOSURE_MANIFEST, DEVTOOLS_CLOSURE_LICENSES]) {
    const loaded = reader.read(control);
    if (loaded.status !== "ready") {
      return {
        status: loaded.status,
        paths,
        members: files.length,
        reason: `the DevTools closure control document ${control} is unavailable: ${loaded.reason}`,
      };
    }
    texts.set(control, loaded.value);
  }
  const value: DevToolsClosure = {
    root: DEVTOOLS_CLOSURE_ROOT,
    pinText: texts.get(DEVTOOLS_CLOSURE_PIN) ?? "",
    manifestText: texts.get(DEVTOOLS_CLOSURE_MANIFEST) ?? "",
    licensesText: texts.get(DEVTOOLS_CLOSURE_LICENSES) ?? "",
    files: Object.freeze(files.toSorted((left, right) => left.file.localeCompare(right.file))),
    totalBytes,
  };
  // `members` is the exact file census the door hashed — the receipt the closure validator would otherwise
  // have to be taken on trust about.
  return { status: "ready", value, paths, members: files.length };
}
