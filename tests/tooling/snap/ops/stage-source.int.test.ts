// The isolation tripwire as a stage refusal: a vite.config that only mentions the variable would proxy /api to the dev server.
import { expect, test } from "@orb/testkit/tooling";
import { assertStageSourceSupportsIsolation } from "../../../../tooling/src/snap/ops/stage-source.ts";

const VITE_CONFIG_REL = "packages/client/vite.config.ts";

test("a dirty tree whose vite.config only names the tripwire in a comment is refused; one that reads it is accepted", async ({ plantedTree }) => {
  const reading = await plantedTree({ [VITE_CONFIG_REL]: 'const target = process.env["VITE_API_TARGET"] ?? "http://127.0.0.1:8788";\n' });
  expect(() => assertStageSourceSupportsIsolation(reading, true, "dirty")).not.toThrow();

  const commentOnly = await plantedTree({ [VITE_CONFIG_REL]: "// the VITE_API_TARGET env read below is the version tripwire\nconst target = 1;\n" });
  expect(() => assertStageSourceSupportsIsolation(commentOnly, true, "dirty")).toThrow("lacks the VITE_API_TARGET env hook");
});
