// resolve/heal — model identity normalization at the last inference producer seam. The connection picker
// already validates its open provider-owned id; an agent-sdk alias may replace it with upstream daemon data,
// so that replacement must pass the same parser before it can carry the ModelId brand.

import type { AgentSdkModel } from "@orb/contracts/inference";
import { normalizeModelId } from "../../../packages/inference/src/resolve/heal.ts";
import { expect, test } from "../../support/fixtures.ts";

const DAEMON_ROW: AgentSdkModel = {
  alias: "sonnet",
  resolvedModel: "  claude-sonnet-5  ",
  displayName: "Sonnet",
  description: "",
  supportsEffort: false,
  effortLevels: [],
  supportsAdaptiveThinking: false,
};

test("an open provider-owned model id is normalized before branding", () => {
  expect(normalizeModelId("  plugin-model/future-1  ", null)).toBe("plugin-model/future-1");
});

test("an agent-sdk alias revalidates and normalizes the daemon's resolved model", () => {
  expect(normalizeModelId("sonnet", [DAEMON_ROW])).toBe("claude-sonnet-5");
});

test("an agent-sdk alias cannot smuggle a blank resolved model into ModelId", () => {
  expect(() => normalizeModelId("sonnet", [{ ...DAEMON_ROW, resolvedModel: "   " }])).toThrow();
});
