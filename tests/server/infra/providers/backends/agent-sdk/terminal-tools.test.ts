// biome-ignore-all lint/style/useNamingConvention: the SDK hook-input fixtures use the runtime's own
// snake_case wire fields (hook_event_name, tool_name, tool_input).
//
// The agent-sdk TERMINAL-tool channel module (D112 R1) at ITS OWN seam: the three halves in isolation —
// DECLARE (the JSON-Schema → zod lift → a real in-process MCP server, all-or-nothing), STOP (the PreToolUse
// deny+continue:false payload the runtime turns into `hook_stopped`), CAPTURE (a `tool_use` block → the
// cross-backend ToolCallInput). `runner.test.ts` proves the WIRING (options, round count, capture through a
// whole turn); this file proves the unit contracts that wiring depends on.

import { logger } from "@orb/server/foundation/observability";
import { isTerminalToolCall, TERMINAL_MCP_NAMESPACE, terminalToolOptions, toTerminalCall } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const TURN = "turn-1";
const NS = TERMINAL_MCP_NAMESPACE;
const PREFIX = `mcp__${NS}__`;

/** The `party` plane's projected shape, trimmed to the constructs that matter: a ref ENUM (the per-game
 *  constraint that must survive the lift or the model is handed an unconstrained target), a bounded integer,
 *  and the `anyOf` cell (`trackerSets[].value` is number-or-string). */
const PARTY_PARAMS = {
  type: "object",
  properties: {
    targetRef: { type: "string", enum: ["user:1", "char:2"] },
    hpDelta: { type: "integer", minimum: -100, maximum: 100 },
    value: { anyOf: [{ type: "number" }, { type: "string" }] },
  },
  required: ["targetRef"],
  additionalProperties: false,
};
const TOOLS = [{ name: "update_party", description: "record what changed for one actor", parameters: PARTY_PARAMS }];

/** The SDK hook callback shape the options map carries (the tests INVOKE it — a hook that merely exists
 *  proves nothing about what it answers). */
type HookFn = (input: { hook_event_name: string; tool_name?: string; tool_input?: unknown }) => Promise<unknown>;

function preToolUseHook(options: ReturnType<typeof terminalToolOptions>): HookFn | undefined {
  const matchers = (options?.hooks as Record<string, { hooks: HookFn[] }[]> | undefined)?.["PreToolUse"] ?? [];
  return matchers[0]?.hooks[0];
}

describe("terminalToolOptions — DECLARE", () => {
  test("mounts an in-process MCP server under the terminal namespace + a PreToolUse hook", () => {
    const options = terminalToolOptions(TOOLS, TURN);
    expect(Object.keys(options?.mcpServers ?? {})).toEqual([NS]);
    // A real SDK server instance, not a marker object — the SDK reads `.instance` to serve `tools/list`.
    expect((options?.mcpServers?.[NS] as { type?: string; instance?: unknown } | undefined)?.type).toBe("sdk");
    expect(preToolUseHook(options)).toBeTypeOf("function");
  });

  test("the per-game CONSTRAINTS survive the lift — the model is handed the enum, not a free string", () => {
    // The mount's whole value is that the DECLARED tool offers EXACTLY this game's refs. The lift is the one
    // inverse of `projectJsonSchema`; if it silently loosened, the fold would still "work" while inviting the
    // model to write to actors that do not exist. Read off the MCP registry's own map (private, so an SDK bump
    // breaks this loudly rather than letting a loosened declaration ship quietly).
    const registered = terminalToolOptions(TOOLS, TURN)?.mcpServers?.[NS] as
      | { instance?: { _registeredTools?: Record<string, { inputSchema?: { safeParse: (value: unknown) => { success: boolean } } }> } }
      | undefined;
    const schema = registered?.instance?._registeredTools?.["update_party"]?.inputSchema;
    expect(schema?.safeParse({ targetRef: "user:1", hpDelta: -3, value: "steady" }).success).toBe(true);
    // The ref ENUM bites: an actor outside this game's roster is not offerable.
    expect(schema?.safeParse({ targetRef: "ghost:9" }).success).toBe(false);
    // The bounded integer bites.
    expect(schema?.safeParse({ targetRef: "user:1", hpDelta: 5000 }).success).toBe(false);
    // The `anyOf` cell accepts BOTH member types and nothing else (the construct the whole mount hinged on).
    expect(schema?.safeParse({ targetRef: "user:1", value: 7 }).success).toBe(true);
    expect(schema?.safeParse({ targetRef: "user:1", value: true }).success).toBe(false);
  });

  test("no tools requested ⇒ NO mount (the turn stays byte-identical to a tool-less one)", () => {
    expect(terminalToolOptions([], TURN)).toBeNull();
  });

  test("one unliftable schema withholds the WHOLE mount, loudly (never a half-mounted state surface)", () => {
    const warn = vi.spyOn(logger, "warn");
    const options = terminalToolOptions(
      [
        { name: "update_party", description: "d", parameters: PARTY_PARAMS },
        { name: "update_scene", description: "d", parameters: { type: "object", properties: { at: { type: "string", format: "date" } } } },
      ],
      TURN,
    );
    expect(options).toBeNull();
    const line = warn.mock.calls.map((c) => c[0] as Record<string, unknown>).find((f) => f["event"] === "provider.terminal_tools");
    expect(line).toMatchObject({ turnId: TURN, mounted: false, unliftable: { tool: "update_scene", construct: "format" } });
  });
});

describe("the PreToolUse stop hook — STOP", () => {
  test("a terminal call gets continue:false + a HOOK deny (the pair that ends the turn at depth 0)", async () => {
    // Both halves are required by the runtime: `continue:false` alone leaves the tool loop running, and a deny
    // alone just feeds an error tool_result back to the model — which IS the second call the fold deletes.
    const hook = preToolUseHook(terminalToolOptions(TOOLS, TURN));
    const out = (await hook?.({ hook_event_name: "PreToolUse", tool_name: `${PREFIX}update_party`, tool_input: { targetRef: "user:1" } })) as {
      continue?: boolean;
      stopReason?: string;
      reason?: string;
      hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string };
    };
    expect(out.continue).toBe(false);
    expect(out.stopReason).toBeTruthy();
    expect(out.reason).toBe(out.stopReason);
    expect(out.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });
  });

  test("a REGISTRY tool call passes through untouched — its SDK-run loop is none of this hook's business", async () => {
    const hook = preToolUseHook(terminalToolOptions(TOOLS, TURN));
    expect(await hook?.({ hook_event_name: "PreToolUse", tool_name: "mcp__orbweaver__tick_clock", tool_input: {} })).toEqual({});
  });

  test("a non-PreToolUse event passes through (the hook is mounted per-event, never a catch-all veto)", async () => {
    const hook = preToolUseHook(terminalToolOptions(TOOLS, TURN));
    expect(await hook?.({ hook_event_name: "PostToolUse", tool_name: `${PREFIX}update_party` })).toEqual({});
  });
});

describe("toTerminalCall / isTerminalToolCall — CAPTURE", () => {
  test("a terminal tool_use block becomes the cross-backend ToolCallInput (prefix stripped, args as JSON)", () => {
    expect(toTerminalCall({ id: "toolu_1", name: `${PREFIX}update_party`, input: { targetRef: "user:1", hpDelta: -3 } })).toEqual({
      toolCallId: "toolu_1",
      name: "update_party",
      arguments: '{"targetRef":"user:1","hpDelta":-3}',
    });
  });

  test("an argument-less call still reports `{}` — the fold parses one shape, never a null", () => {
    expect(toTerminalCall({ id: "toolu_2", name: `${PREFIX}no_changes`, input: undefined })?.arguments).toBe("{}");
  });

  test("a foreign call is NOT ours — registry + built-in names are rejected by both predicates", () => {
    expect(toTerminalCall({ id: "t", name: "mcp__orbweaver__tick_clock", input: {} })).toBeNull();
    expect(toTerminalCall({ id: "t", name: "Bash", input: {} })).toBeNull();
    expect(isTerminalToolCall("Bash")).toBe(false);
    expect(isTerminalToolCall(`${PREFIX}update_party`)).toBe(true);
  });
});
