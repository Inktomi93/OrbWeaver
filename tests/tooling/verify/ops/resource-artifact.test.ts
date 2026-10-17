// Generated token type acquisition refuses unavailable preparation.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { TokenGeneratedTypeResource } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { loadTokenGeneratedTypes } from "../../../../tooling/src/verify/ops/resource-artifact.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

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
