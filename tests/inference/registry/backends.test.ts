// registry/backends — `WIRE_DEFS[w].serves ≡` the methods the built backend implements (the §5.7/§8.6 table
// test), and `needs`: the agent-sdk wire is built only when the `claude` executable resolves; a skipped wire
// is absent from the registry and named in `skipped`.

import type { Task, Wire } from "@orb/contracts/inference";
import { WIRE_DEFS, WIRES } from "@orb/contracts/inference";
import type { ProviderBackend } from "../../../packages/inference/src/contract/backend.ts";
import { BACKEND_DEFS, buildBackends } from "../../../packages/inference/src/registry/backends.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeDeps } from "../_support.ts";

/** The task → backend method map — the ONE place the table test spells it. */
const METHOD_OF: Record<Task, keyof ProviderBackend> = {
  chat: "runChatTurn",
  agent: "runAgentTurn",
  summarize: "summarize",
  structured: "structured",
  generateImage: "generateImage",
  embed: "embed",
  imageEmbed: "imageEmbed",
  rerank: "rerank",
};

function implemented(backend: ProviderBackend): readonly Task[] {
  return (Object.keys(METHOD_OF) as Task[]).filter((task) => backend[METHOD_OF[task]] !== undefined);
}

test("every wire builds when its needs are present, and serves exactly WIRE_DEFS[wire].serves", () => {
  const built = buildBackends(fakeDeps({ claudeExecutable: "/usr/bin/claude" }));
  expect(built.skipped.size).toBe(0);
  for (const wire of WIRES) {
    const backend = built.registry.get(wire);
    expect(backend, `${wire} built`).toBeDefined();
    if (backend === undefined) {
      continue;
    }
    expect(backend.wire).toBe(wire);
    expect(implemented(backend).toSorted(), `${wire} serves`).toEqual([...WIRE_DEFS[wire].serves].toSorted());
    expect(BACKEND_DEFS[wire].serves).toEqual(WIRE_DEFS[wire].serves);
  }
});

test("the agent-sdk wire is skipped without the claude executable; every other wire still builds", () => {
  const built = buildBackends(fakeDeps({}));
  expect(built.registry.has("agent-sdk")).toBe(false);
  expect(built.agentSdk).toBeUndefined();
  expect([...built.skipped.keys()]).toEqual<Wire[]>(["agent-sdk"]);
  expect(built.skipped.get("agent-sdk")).toContain("claudeExecutable");
  for (const wire of WIRES.filter((w) => w !== "agent-sdk")) {
    expect(built.registry.has(wire), `${wire} built`).toBe(true);
  }
});

test("diagnostics live only on the wires that can answer them", () => {
  const built = buildBackends(fakeDeps({ claudeExecutable: "/usr/bin/claude" }));
  const local = built.registry.get("local-light");
  expect(local?.probe).toBeUndefined();
  expect(local?.listModels).toBeUndefined();
  const compat = built.registry.get("openai-compat");
  expect(compat?.probe).toBeDefined();
  expect(compat?.accountCredits).toBeDefined();
  expect(compat?.generationCost).toBeDefined();
  const agent = built.registry.get("agent-sdk");
  expect(agent?.verifyAuth).toBeDefined();
  expect(agent?.accountCredits).toBeUndefined();
});
