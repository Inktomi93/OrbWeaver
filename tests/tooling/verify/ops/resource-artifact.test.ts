// The two canonical generated artifacts. Both POSITIVE arms read the real tree, because both subjects ARE
// the committed tree; each refusal arm hides exactly one member through the reader overlay, which is the
// planted control in the other direction.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { DevToolsClosure, TokenContractResource } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { DEVTOOLS_CLOSURE_MANIFEST, DEVTOOLS_CLOSURE_ROOT, TOKEN_CONTRACT_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { loadDevToolsClosure, loadTokenContract } from "../../../../tooling/src/verify/ops/resource-artifact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

function tokens(root: string, overlay: Readonly<Record<string, string | null>> = {}): ResourceLoad<TokenContractResource> {
  return loadTokenContract(createResourceReader({ root, overlay }), root);
}

function closure(root: string, overlay: Readonly<Record<string, string | null>> = {}): ResourceLoad<DevToolsClosure> {
  return loadDevToolsClosure(createResourceReader({ root, overlay }));
}

test("the token bundle arrives as the seven texts the validator takes, with a seven-member receipt", () => {
  const fact = tokens(ROOT);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`token contract refused on the real tree: ${fact.reason}`);
  }
  expect(Object.keys(fact.value.texts).toSorted()).toEqual(["base", "formatSchema", "light", "mocha", "removed", "resolver", "resolverSchema"]);
  expect(JSON.parse(fact.value.texts.base)).toHaveProperty("spacing");
  // `members` is the seven bundle documents, never the token census inside them.
  expect(fact.members).toBe(7);
  expect(fact.paths).toContain(TOKEN_CONTRACT_PATHS.base);
});

test("ONE missing bundle member refuses — six sevenths of a fail-closed contract is not a contract", () => {
  const fact = tokens(ROOT, { [TOKEN_CONTRACT_PATHS.formatSchema]: null });

  expect(fact.status).toBe("missing");
  expect(fact.status === "ready" ? "" : fact.reason).toContain("formatSchema");
  expect(fact).not.toHaveProperty("value");
});

test("the DevTools closure is a hashed byte census whose hashes match the committed manifest", () => {
  const fact = closure(ROOT);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`devtools closure refused on the real tree: ${fact.reason}`);
  }
  // The pin's `manifestSha256` is over the manifest's exact BYTES, which is why the door publishes texts
  // rather than a re-serialized parse.
  const pin = JSON.parse(fact.value.pinText) as { readonly manifestSha256: string; readonly resourceCount: number };
  expect(createHash("sha256").update(fact.value.manifestText).digest("hex")).toBe(pin.manifestSha256);
  // The census is the receipt the validator would otherwise be taken on trust about: every manifest row's
  // hash is reproduced from the bytes this door actually read.
  const manifest = JSON.parse(fact.value.manifestText) as { readonly resources: readonly { readonly file: string; readonly sha256: string }[] };
  const hashes = new Map(fact.value.files.map((file) => [file.file, file.sha256]));
  expect(manifest.resources.length).toBe(pin.resourceCount);
  expect(manifest.resources.every((row) => hashes.get(row.file) === row.sha256)).toBe(true);
  expect(fact.members).toBe(fact.value.files.length);
  expect(fact.value.totalBytes).toBeGreaterThan(0);
});

test("a DRIFTED byte and a missing control document are different refusals — neither is a clean closure", () => {
  const manifestText = readFileSync(join(ROOT, DEVTOOLS_CLOSURE_MANIFEST), "utf8");
  const firstResource = (JSON.parse(manifestText) as { readonly resources: readonly { readonly file: string; readonly sha256: string }[] }).resources[0];
  if (firstResource === undefined) {
    throw new Error("the committed DevTools manifest has no resource row to drift");
  }
  // The PLANTED POSITIVE CONTROL for drift: overwrite one asset's bytes and the door's hash for that member
  // must stop matching the committed row. Without this the census could be reporting the manifest back to
  // itself and every comparison would pass forever.
  const drifted = closure(ROOT, { [`${DEVTOOLS_CLOSURE_ROOT}/${firstResource.file}`]: "tampered" });
  if (drifted.status !== "ready") {
    throw new Error(`drifted closure refused for the wrong reason: ${drifted.reason}`);
  }
  const hash = new Map(drifted.value.files.map((file) => [file.file, file.sha256])).get(firstResource.file);
  expect(hash).not.toBe(firstResource.sha256);
  expect(hash).toBe(createHash("sha256").update("tampered").digest("hex"));

  // And a closure whose control document is gone refuses outright rather than reporting an empty contract.
  const beheaded = closure(ROOT, { [DEVTOOLS_CLOSURE_MANIFEST]: null });
  expect(beheaded.status).toBe("missing");
  expect(beheaded.status === "ready" ? "" : beheaded.reason).toContain("manifest.json");
});

test("an absent closure root is a refusal, never an empty inventory", ({ scratch }) => {
  const fact = closure(scratch);

  expect(fact.status).toBe("missing");
  expect(fact).not.toHaveProperty("value");
});
