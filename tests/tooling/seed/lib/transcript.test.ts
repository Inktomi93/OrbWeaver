// The seed argv grammar (#971). Both parsers were `includes`/`indexOf` bags: a typo'd `--frsh` seeded ON
// TOP of the existing dev db instead of wiping it, and `--messages abc` silently built the 120-row default
// — a seeder answering a request nobody made, behind a clean exit. Every refusal here is a `UsageError`,
// which `seed/cli.ts` maps to exit 3 (misuse), because a bad invocation is not a tool failure.
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { parseChatArgs, parseDemoArgs } from "@orb/tooling/seed";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("parseDemoArgs accepts exactly its two flags", () => {
  expect(parseDemoArgs([])).toEqual({ fresh: false, force: false });
  expect(parseDemoArgs(["--fresh", "--force"])).toEqual({ fresh: true, force: true });
});

test("a typo'd --fresh REFUSES instead of seeding onto the existing database", () => {
  // The founding shape: `--frsh` produced `{fresh:false}`, so the seed ran WITHOUT the wipe and the
  // operator read the success line as a fresh corpus.
  expect(() => parseDemoArgs(["--frsh"])).toThrow(UsageError);
  expect(() => parseDemoArgs(["--frsh"])).toThrow("--frsh");
});

test("a positional argument to demo is misuse", () => {
  expect(() => parseDemoArgs(["chat"])).toThrow(UsageError);
});

test("parseChatArgs reads its four flags and defaults the rest", () => {
  expect(parseChatArgs(["--messages", "42"]).messages).toBe(42);
  expect(parseChatArgs(["--title", "Fixture"]).title).toBe("Fixture");
  expect(parseChatArgs(["--force"]).force).toBe(true);
  expect(parseChatArgs([]).messages).toBeGreaterThan(0);
});

test("an unknown chat flag REFUSES", () => {
  expect(() => parseChatArgs(["--mesages", "42"])).toThrow(UsageError);
});

test("a non-numeric or missing count REFUSES instead of quietly building the default fixture", () => {
  expect(() => parseChatArgs(["--messages", "abc"])).toThrow("--messages");
  expect(() => parseChatArgs(["--messages"])).toThrow("--messages");
  expect(() => parseChatArgs(["--messages", "0"])).toThrow("--messages");
  expect(() => parseChatArgs(["--messages", "--force"])).toThrow("--messages");
});

test("a valueless --title REFUSES rather than silently keeping the default title", () => {
  expect(() => parseChatArgs(["--title"])).toThrow("--title");
  expect(() => parseChatArgs(["--title", "--force"])).toThrow("--title");
});
