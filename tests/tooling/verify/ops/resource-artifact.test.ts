// Token-vault acquisition retains its real inputs and bounded unavailable-input controls.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { TokenContractResource, TokenGeneratedTypeResource } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { TOKEN_CONTRACT_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { loadTokenContract, loadTokenGeneratedTypes } from "../../../../tooling/src/verify/ops/resource-artifact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

function tokens(root: string, overlay: Readonly<Record<string, string | null>> = {}): ResourceLoad<TokenContractResource> {
  return loadTokenContract(createResourceReader({ root, overlay }), root);
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

test("generated type demand refuses absent preparation and missing native family instead of becoming an empty contract", () => {
  const reader = createResourceReader({ root: ROOT });
  expect(loadTokenGeneratedTypes(reader, undefined)).toMatchObject({ status: "unresolved", members: 0 });
  const prepared: ResourceLoad<TokenGeneratedTypeResource> = {
    status: "ready",
    paths: [],
    members: 0,
    value: { context: { sources: new Map(), outputs: new Map() }, observed: new Map() },
  };
  expect(loadTokenGeneratedTypes(reader, prepared)).toMatchObject({ status: "unresolved", members: 0, reason: expect.stringContaining("canonical producer") });
  expect(loadTokenGeneratedTypes(reader, { status: "missing", paths: ["producer"], members: 0, reason: "unavailable" })).toMatchObject({
    status: "missing",
    reason: "unavailable",
  });
});
