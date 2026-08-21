// The argv contract of `pnpm perf-meter` (scripts/probes/perf-meter.ts). Home per Spine-Testing §2: a test
// of a scripts/ tool lives in tests/tooling/.
//
// WHAT THIS PINS (2026-08-17, issue #148 item 1): SPA navigation is a STEP, so a surface behind a room can
// be metered at all — before this the probe could only click, and the chat context panel (2+ hops) had no
// reachable throttled-input number. And the strict CLI: an unknown flag is misuse, because a typo'd step
// used to be skipped in silence and the run then metered the landing page and reported it clean.
import { parsePerfArgs } from "../../scripts/probes/perf-meter.ts";
import { expect, test } from "../support/tool-fixtures.ts";

test("nav flags become steps in TRUE argv order, interleaved with the DOM steps", () => {
  const args = parsePerfArgs(["/", "--open-chat", "latest", "--context-tab", "rpg.game", "--click", "[data-slot=toggle]", "--pause", "400"]);

  expect(args.errors).toEqual([]);
  expect(args.steps).toEqual([
    { kind: "nav", method: "open-chat", target: "latest" },
    { kind: "nav", method: "context-tab", target: "rpg.game" },
    { kind: "click", selector: "[data-slot=toggle]" },
    { kind: "pause", ms: 400 },
  ]);
});

test("--cycles unrolls nav steps with everything else — a repetition-decay run re-navigates", () => {
  const args = parsePerfArgs(["/", "--goto", "settings:appearance", "--cycles", "2"]);

  expect(args.steps).toEqual([
    { kind: "nav", method: "goto", target: "settings:appearance" },
    { kind: "nav", method: "goto", target: "settings:appearance" },
  ]);
});

test("an unknown or value-less flag is CLI misuse (exit 2), never a silently skipped step", () => {
  // The unknown flag's orphaned VALUE then reads as a second route — the same cascade design-audit's scan
  // produces, and both lines are true.
  expect(parsePerfArgs(["/", "--open-caht", "latest"]).errors).toEqual(["unknown flag --open-caht", "expected at most one route, got 2"]);
  expect(parsePerfArgs(["/", "--click"]).errors).toEqual(["--click requires a value"]);
  // A boolean flag takes no value and must not be reported as needing one.
  expect(parsePerfArgs(["/", "--cpuprofile"]).errors).toEqual([]);
  expect(parsePerfArgs(["/", "--cpuprofile"]).cpuProfile).toBe(true);
});

test("the route is still positional, and exactly one of them", () => {
  expect(parsePerfArgs(["/chats"]).route).toBe("/chats");
  expect(parsePerfArgs(["/chats", "/other"]).errors).toEqual(["expected at most one route, got 2"]);
});
