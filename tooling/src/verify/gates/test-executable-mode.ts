// Gate: test-executable-mode — tests run through the configured Node, Vitest and Playwright entry points;
// a test file carrying Git mode 100755 depends on POSIX executable metadata that Windows checkouts cannot
// preserve. Git's candidate index is the authority, delivered by the tracked-files resource; filesystem
// mode and shebang text are not substitutes. FAMILY: `tooling-os-neutral`, sharing the canonical case/message
// vocabulary in `lib/os-neutral.ts`. POPULATION: all authored tests; executable files outside tests are the
// narrowing control. RETIRED MARKERS: none.
import { defineGate } from "../contract/policy.ts";
import { OS_NEUTRAL_CASE_MESSAGES } from "../lib/os-neutral.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CASE = "test-executable-mode" as const;
const MESSAGE = `${OS_NEUTRAL_CASE_MESSAGES[CASE]}. Tests run through the configured Node, Vitest and Playwright entry points; Git mode 100755 creates a contributor-tree difference Windows cannot preserve. tooling/src/verify/gates/test-executable-mode.ts`;
const FIX = "clear the executable bit in the candidate index with `git update-index --chmod=-x -- <test-path>`";

export const gate = defineGate({
  id: "test-executable-mode",
  family: "tooling-os-neutral",
  authority: "hard",
  severity: "error",
  population: "@tests",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "tracked-files" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const { executablePaths } = readyResourceValue(ctx.resources.trackedFiles());
      for (const path of executablePaths.filter((candidate) => ctx.includesSubject(candidate) && candidate.startsWith("tests/"))) {
        ctx.report.file(path, { line: 1, column: 1, message: MESSAGE, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "tests/example.test.ts": "export const example = true;\n" },
      executable: ["tests/example.test.ts"],
      expect: { count: 1, line: 1, messageIncludes: "an executable Git mode on a test file" },
      why: "the prohibited Git-index shape: one authored test carries mode 100755 and reports at its first line",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "tests/example.test.ts": "export const example = true;\n",
        "scripts/operator-probe.sh": "#!/bin/sh\n",
      },
      executable: ["scripts/operator-probe.sh"],
      why: "the narrowing in both directions: an ordinary tracked test is silent, and an executable outside tests is outside this policy's subject",
    },
  ],
});
