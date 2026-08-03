// toAgentToolServer (project-mcp, T5) — the SECOND projection. Pins: a wrapped handler routes through the
// SAME executeToolCalls pipeline (gate + parse + record all fire); a call via the MCP wrapper produces a
// byte-equal ToolCallRecord to the same call via executeToolCalls.

import type { CreateAgentToolServer, ToolCallInput } from "@orb/server/domain/tool-use";
import { createToolUseService } from "@orb/server/domain/tool-use";
import { vi } from "vitest";
import { z } from "zod";
import { createProjectMcp } from "../../../../../packages/server/src/domain/tool-use/verbs/project-mcp.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf, execOf, makeHarness } from "../_support.ts";

// The fake D47 factory: return the wrapped specs verbatim as the opaque server so the test can invoke a
// wrapped handler by name (standing in for the agent-sdk loop).
type WrappedSpecs = Parameters<CreateAgentToolServer>[0]["tools"];
function fakeFactory(): { createAgentToolServer: CreateAgentToolServer; specs: () => WrappedSpecs } {
  let captured: WrappedSpecs = [];
  return {
    createAgentToolServer: ({ tools }): WrappedSpecs => {
      captured = tools;
      return tools;
    },
    specs: (): WrappedSpecs => captured,
  };
}

const echo = (value: unknown): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value });

function invoke(specs: WrappedSpecs, name: string, args: Record<string, unknown>): ReturnType<WrappedSpecs[number]["handler"]> {
  const spec = specs.find((s) => s.name === name);
  if (spec === undefined) {
    throw new Error(`no wrapped spec ${name}`);
  }
  return spec.handler(args);
}

test("a wrapped handler routes through the SAME executeToolCalls (gate + parse + record all fire)", async () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "echo_tool", schema: z.object({ text: z.string() }), handler: (args) => echo(args) }));
  const set = svc.resolveTools(["echo_tool"]);

  const executeSpy = vi.fn(svc.executeToolCalls);
  const factory = fakeFactory();
  const records: unknown[] = [];
  createProjectMcp(executeSpy)(set, execOf(), factory, (r) => records.push(r));

  const result = await invoke(factory.specs(), "echo_tool", { text: "hi" });

  // Routed through the real execute path (parse ran: the arg round-trips; a record was produced + delivered).
  expect(executeSpy).toHaveBeenCalledOnce();
  expect(result.content[0]?.text).toBe(JSON.stringify({ text: "hi" }));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ name: "echo_tool", isError: false });
});

test("gate fires on the wrapped path: a chat-scoped ceiling with a null roster is an errors-as-data denial", async () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "gated_tool", schema: z.object({}), handler: () => echo({}), capability: { scope: "chat", action: "host" } }));
  const set = svc.resolveTools(["gated_tool"]);

  const factory = fakeFactory();
  const records: { isError: boolean }[] = [];
  // execOf's roster is null — a chat-scoped ceiling denies (DomainForbiddenError caught into data, never thrown out).
  svc.toAgentToolServer(set, execOf(), factory, (r) => records.push(r));
  const result = await invoke(factory.specs(), "gated_tool", {});

  expect(result.isError).toBe(true);
  expect(records[0]?.isError).toBe(true);
});

test("record parity: an MCP-wrapper call is byte-equal to the same call via executeToolCalls", async () => {
  const svc = createToolUseService(makeHarness().ctx);
  svc.register(defOf({ name: "echo_tool", schema: z.object({ text: z.string() }), handler: (args) => echo(args) }));
  const set = svc.resolveTools(["echo_tool"]);
  const exec = execOf();

  // The wrapper synthesizes toolCallId `mcp_<name>_1` for the first invocation — mirror it on the direct call.
  const call: ToolCallInput = { toolCallId: "mcp_echo_tool_1", name: "echo_tool", arguments: JSON.stringify({ text: "hi" }) };
  const [direct] = await svc.executeToolCalls(set, [call], exec);

  const factory = fakeFactory();
  const records: unknown[] = [];
  svc.toAgentToolServer(set, exec, factory, (r) => records.push(r));
  await invoke(factory.specs(), "echo_tool", { text: "hi" });

  expect(records[0]).toEqual(direct);
});
