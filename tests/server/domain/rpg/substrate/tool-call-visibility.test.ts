// substrate: tool-call-visibility (#1690) — the hidden-span belt for a RECORDED TOOL CALL's raw-JSON args
// and its diagnostic issue lines. The load-bearing case is the FALSE CLEAN that motivates the whole file:
// running the strip over the ENCODED JSON matches nothing and reports `hadHidden: false`, so this suite pins
// (1) that the naive strip really does leak — the control — and (2) that the projection does not.

import type { RpgRecordedToolCall } from "@orb/contracts/rpg";
import { RPG_STATE_ROUND_FAILED_SUMMARY } from "@orb/contracts/rpg";
import { stripHiddenSpans } from "@orb/kit/content";
import { describe } from "vitest";
import { projectFailureForViewer, projectToolCallsForViewer } from "../../../../../packages/server/src/domain/rpg/substrate/tool-call-visibility.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TRUTH = "the throne room is a trap";
const LIE = `<lie truth="${TRUTH}"/>`;

const sceneCall = (args: string, issues: readonly string[] = []): RpgRecordedToolCall => ({
  name: "update_scene",
  args,
  verdict: issues.length > 0 ? "dropped" : "applied",
  issues,
});

describe("projectToolCallsForViewer", () => {
  // THE CONTROL, and the reason this module exists: the blanket strip the naive fix would have used is not a
  // partial match — it is a silent no-op that reports it found nothing.
  test("CONTROL: a blanket strip over the RAW JSON is a false clean (the truth ships, hadHidden false)", () => {
    const args = JSON.stringify({ location: `A quiet hall ${LIE}` });
    const naive = stripHiddenSpans(args);
    expect(naive.hadHidden).toBe(false);
    expect(naive.content).toContain(TRUTH);
  });

  test("a viewer who does not read hidden gets the args PARSED and belted leaf by leaf", () => {
    const args = JSON.stringify({ location: `A quiet hall ${LIE}`, weather: { type: "indoors" }, npcs: [{ mood: `calm ${LIE}` }] });
    const [call] = projectToolCallsForViewer([sceneCall(args)], false);

    expect(call?.args).not.toContain(TRUTH);
    expect(call?.args).not.toContain("<lie");
    expect(call?.withheld).toBeNull();
    // …and the payload the panel would parse is still the same JSON document, minus the spans.
    expect(JSON.parse(call?.args ?? "")).toEqual({ location: "A quiet hall ", weather: { type: "indoors" }, npcs: [{ mood: "calm " }] });
  });

  test("a viewer who READS hidden gets the bytes back identical (identity, not a walk)", () => {
    const args = JSON.stringify({ location: `A quiet hall ${LIE}` });
    const issues = [`location: Invalid input — sent ${JSON.stringify(`A quiet hall ${LIE}`)}`];
    const [call] = projectToolCallsForViewer([sceneCall(args, issues)], true);

    expect(call?.args).toBe(args);
    expect(call?.issues).toEqual(issues);
    expect(call?.withheld).toBeNull();
  });

  test("an UNPARSEABLE arg is WITHHELD with a typed reason — never passed through", () => {
    // A mid-emission garble: the model's JSON never closed, and half a `<lie …` is in the bytes.
    const args = `{"location":"A quiet hall <lie truth="${TRUTH}`;
    const [call] = projectToolCallsForViewer([sceneCall(args, ["arguments: not valid JSON"])], false);

    expect(call?.withheld).toBe("unparseable");
    expect(call?.args).toBe("");
    expect(call?.args).not.toContain(TRUTH);
    // The reader keeps everything they can act on: the call's name and what happened to it.
    expect(call?.name).toBe("update_scene");
    expect(call?.verdict).toBe("dropped");
    expect(call?.issues).toEqual(["arguments: not valid JSON"]);
  });

  test("an issue line's model-SENT value is belted, and its actionable path/message half survives", () => {
    const issues = [`weather.type: Invalid option — sent ${JSON.stringify(`storm ${LIE}`)}`];
    const [call] = projectToolCallsForViewer([sceneCall("{}", issues)], false);

    expect(call?.issues[0]).toContain("weather.type: Invalid option");
    expect(call?.issues[0]).toContain("storm");
    expect(call?.issues[0]).not.toContain(TRUTH);
  });

  test("an issue value that cannot be decoded (the 80-char truncation) DROPS the value half, keeping the path", () => {
    // `malformedToolCallDetails` truncates a long rendered value and appends `…`, so the tail is no longer
    // valid JSON — the fail-closed arm.
    const issues = [`location: Invalid input — sent "A quiet hall <lie truth=\\"${TRUTH}`];
    const [call] = projectToolCallsForViewer([sceneCall("{}", issues)], false);

    expect(call?.issues[0]).toBe("location: Invalid input");
    expect(call?.issues[0]).not.toContain(TRUTH);
  });

  test("an issue line with no sent value is untouched (the salvage arm is pure schema paths)", () => {
    const [call] = projectToolCallsForViewer([sceneCall("{}", ["update_scene.weather"])], false);
    expect(call?.issues).toEqual(["update_scene.weather"]);
  });
});

describe("projectFailureForViewer (#1468 item 2)", () => {
  // The stored sentence is `<summary>: <the vehicle's own error>`. The tail is a PROVIDER diagnostic and this
  // read is member-gated, so it goes to the host only — the reader who can act on a broken connection.
  const stored = `${RPG_STATE_ROUND_FAILED_SUMMARY}: 401 from https://api.internal/v1/chat (model qwen-3-32b, key sk-…)`;

  test("a viewer who does not read hidden gets the SUMMARY only — the provider tail never leaves the host plane", () => {
    const seen = projectFailureForViewer(stored, false);
    expect(seen).toBe(RPG_STATE_ROUND_FAILED_SUMMARY);
    expect(seen).not.toContain("api.internal");
    expect(seen).not.toContain("sk-");
  });

  test("the host reads it verbatim (the args posture, one field over)", () => {
    expect(projectFailureForViewer(stored, true)).toBe(stored);
  });

  test("a round that reached a verdict has no failure on either arm — the quiet beat says nothing", () => {
    expect(projectFailureForViewer(null, false)).toBeNull();
    expect(projectFailureForViewer(null, true)).toBeNull();
  });
});
