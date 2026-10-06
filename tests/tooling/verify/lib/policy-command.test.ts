import { parsePolicyCommand } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

test.describe("final policy command parser", () => {
  test.each([
    [[], { kind: "whole" }, "static"],
    [["--changed"], { kind: "changed" }, "changed"],
    [["--file", "b.ts", "--file", "a.ts"], { kind: "file", paths: ["a.ts", "b.ts"] }, "changed"],
    [["--folder", "tooling/src"], { kind: "folder", path: "tooling/src" }, "changed"],
    [["--package", "@orb/tooling"], { kind: "package", name: "@orb/tooling" }, "changed"],
    [["--project", "tooling/tsconfig.json"], { kind: "project", config: "tooling/tsconfig.json" }, "changed"],
  ] as const)("parses one of the six scope kinds %#", (argv, scope, tier) => {
    expect(parsePolicyCommand(argv)).toMatchObject({ ok: true, request: { mode: "run", scope, tier } });
  });

  test("parses explicit tier, selection, strict scope, warning promotion, and JSON", () => {
    expect(parsePolicyCommand(["--tier", "push", "--check", "z-last", "--check", "a-first", "--strict-scope", "--fail-on-warnings", "--json"])).toEqual({
      ok: true,
      request: {
        mode: "run",
        tier: "push",
        scope: { kind: "whole" },
        selector: { kind: "check", names: ["a-first", "z-last"] },
        strictScope: true,
        failOnWarnings: true,
        json: true,
      },
    });
  });

  test("preserves the existing bare tier markers", () => {
    expect(parsePolicyCommand(["--static"])).toMatchObject({ ok: true, request: { mode: "run", tier: "static" } });
    expect(parsePolicyCommand(["--push", "--file", "a.ts"])).toMatchObject({ ok: true, request: { mode: "run", tier: "push" } });
    expect(parsePolicyCommand(["--full"])).toMatchObject({ ok: true, request: { mode: "run", tier: "full" } });
    expect(parsePolicyCommand(["--product"])).toMatchObject({ ok: true, request: { mode: "run", tier: "product", scope: { kind: "whole" } } });
    expect(parsePolicyCommand(["--tier=product"])).toMatchObject({ ok: true, request: { mode: "run", tier: "product" } });
    expect(parsePolicyCommand(["--list", "--product"])).toMatchObject({ ok: false, exitCode: 3 });
  });

  test("list and explain are deterministic data requests", () => {
    expect(parsePolicyCommand(["--list", "--json"])).toEqual({ ok: true, request: { mode: "list", json: true } });
    expect(parsePolicyCommand(["--explain", "--family", "shared-family"])).toEqual({
      ok: true,
      request: { mode: "explain", selector: { kind: "family", names: ["shared-family"] }, json: false },
    });
  });

  test.each([
    [["--bogus"], /unknown|option/i],
    [["--changed", "--folder", "tooling"], /one scope/i],
    [["--check", "one", "--family", "two"], /check.*family|selection/i],
    [["--check", "one", "--check", "one"], /duplicate/i],
    [["--whole", "--whole"], /duplicate/i],
    [["--tier=push", "--tier", "push"], /duplicate/i],
    [["--check", "Not_Kebab"], /kebab/i],
    [["--tier", "manual"], /tier/i],
    [["--static", "--push"], /one tier/i],
    [["--explain"], /explain.*selection/i],
    [["--list", "--changed"], /list.*scope|inspection/i],
    [["--file"], /file.*value/i],
  ] as const)("refuses malformed or ambiguous argv %#", (argv, message) => {
    expect(parsePolicyCommand(argv)).toMatchObject({ ok: false, exitCode: 3, message: expect.stringMatching(message) });
  });
});
