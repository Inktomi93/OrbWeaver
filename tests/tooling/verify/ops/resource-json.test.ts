// The strict-JSON door. The capability under test is the REFUSAL SPLIT, not the parse: missing, empty and
// unparseable are three different answers, and collapsing any of them into `{}` is how a liveness gate
// reports a clean zero over a config it never read (the ResourceHost access-pattern ruling). It is the same
// shape as the ruled biome refusal (0df3fa9d6, #1245): reading nothing is a REFUSAL, never a clean result.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { JsonResourceFacts } from "../../../../tooling/src/verify/contract/resource-json.ts";
import { loadJsonResource } from "../../../../tooling/src/verify/ops/resource-json.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BIOME = "biome.json";

function load(scratch: string, overlay: Readonly<Record<string, string | null>>): ResourceLoad<JsonResourceFacts> {
  return loadJsonResource(createResourceReader({ root: scratch, overlay }), "biome");
}

test("a valid document is ready, with exactly ONE measured member", ({ scratch }) => {
  const fact = load(scratch, { [BIOME]: '{"overrides":[{"includes":["a.ts"]}]}' });

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error("fixture resource failed");
  }
  expect(fact.value).toEqual({ id: "biome", path: BIOME, value: { overrides: [{ includes: ["a.ts"] }] } });
  // `members` is what the door MEASURED — one document — never the census inside it. A provider that
  // receipts its findings preempts its own accuser (guide §3).
  expect(fact.members).toBe(1);
  expect(fact.paths).toEqual([BIOME]);
});

test("MISSING and UNPARSEABLE are different facts, and neither is an empty object", ({ scratch }) => {
  const absent = load(scratch, {});
  const broken = load(scratch, { [BIOME]: '{"overrides":[' });
  const commented = load(scratch, { [BIOME]: '{\n  // strict JSON has no comments\n  "a": 1\n}' });

  // "the config is not there" and "the config is broken" send a reader to two different places.
  expect(absent.status).toBe("missing");
  expect(broken.status).toBe("unresolved");
  expect(broken.status === "unresolved" ? broken.reason : "").toContain("strict JSON");
  // A `//` in biome.json is a parse ERROR, not a nuance — the exact tell that biome silently fell back to
  // built-in defaults, which would make every verdict downstream of it a lie.
  expect(commented.status).toBe("unresolved");
  for (const fact of [absent, broken, commented]) {
    expect(fact).not.toHaveProperty("value");
    expect(fact.members).toBe(0);
  }
});

test("an EMPTY file is its own refusal, distinct from both", ({ scratch }) => {
  const fact = load(scratch, { [BIOME]: "" });

  expect(fact.status).toBe("empty");
  expect(fact.members).toBe(0);
});

test("an empty top-level collection is a POLICY-VISIBLE answer, not a host refusal", ({ scratch }) => {
  // The line the door must not cross. An empty document parsed fine; whether "zero override rows" is a
  // defect is the consuming policy's judgment, and turning it into a host-level refusal would withhold the
  // very policy whose job is to report it (guide §3).
  const fact = load(scratch, { [BIOME]: "{}" });

  expect(fact.status).toBe("ready");
  expect(fact.status === "ready" ? fact.value.value : null).toEqual({});
});

test("an unknown id refuses rather than resolving a path", ({ scratch }) => {
  const fact = loadJsonResource(createResourceReader({ root: scratch }), "not-a-json-id" as "biome");

  expect(fact.status).toBe("unresolved");
  expect(fact.status === "unresolved" ? fact.reason : "").toContain("unknown json resource id");
});
