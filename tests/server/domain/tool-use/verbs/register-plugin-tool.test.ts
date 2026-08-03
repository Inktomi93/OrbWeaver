// registerPluginTool — the RUNTIME registrar (plugin-design PL-A / PL-B / PL-C). Proves: a guest tool lands
// in the ONE registry + resolves + executes through the SAME pipeline; the guest's raw JSON Schema is lifted
// and ENFORCED (bad args → errors-as-data); an unsupported schema construct is an activation-fatal refusal
// (PL-B); a collision is activation-fatal (`ToolNameCollisionError`, not boot-fatal); the ceiling runs as the
// INSTALLING principal (PL-C — a chat the installer can't read → denied); and unregister leaves no ghost tool.

import type { Can, ChatRoster, Principal } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import { castId } from "@orb/kit/ids";
import { JsonSchemaLiftError } from "@orb/kit/json-schema";
import type { PluginToolSpec, ToolCallRecord } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { createToolUseService, ToolNameCollisionError } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { execOf } from "../_support.ts";

type Service = ReturnType<typeof createToolUseService>;

const INSTALLER = makePrincipal(castId("user_installer"), { handle: castId("installer") });
const ROSTER: ChatRoster = { role: "host" };
const CHAT_EXEC = execOf({ chatId: castId("chat_x"), roster: ROSTER });

const allowAll: Can = (() => undefined) as Can;

/** A tool-use service with the given `can` (defaults to allow-all). */
function serviceWith(can: Can = allowAll): Service {
  return createToolUseService({ can, clock: (): number => FROZEN_AT_MS });
}

/** A minimal valid plugin tool spec; `invoke` echoes the args JSON it received (the round-trip probe). */
function specOf(over: Partial<PluginToolSpec> = {}): PluginToolSpec {
  return {
    name: "plugin_mood_report",
    description: "report the mood",
    parameters: { type: "object", properties: { tag: { type: "string", minLength: 1 } }, required: ["tag"], additionalProperties: false },
    installer: INSTALLER,
    invoke: (argsJson: string): Promise<string> => Promise.resolve(`echo:${argsJson}`),
    ...over,
  };
}

/** Resolve + execute one call against `name`, returning its record. */
async function runOne(service: Service, name: string, args: unknown, exec = execOf()): Promise<ToolCallRecord | undefined> {
  const set = service.resolveTools([name]);
  const records = await service.executeToolCalls(set, [{ toolCallId: "c1", name, arguments: JSON.stringify(args) }], exec);
  return records[0];
}

test("a registered plugin tool executes through the one pipeline; the guest string is the verbatim result", async () => {
  const service = serviceWith();
  service.registerPluginTool(specOf());
  const record = await runOne(service, "plugin_mood_report", { tag: "calm" });
  expect(record?.isError).toBe(false);
  // The guest's returned string flows back verbatim — not double-JSON-encoded.
  expect(record?.result).toBe('echo:{"tag":"calm"}');
});

test("the lifted schema is ENFORCED — malformed guest args are errors-as-data, never reach the guest", async () => {
  const service = serviceWith();
  let invoked = false;
  const invoke = (): Promise<string> => {
    invoked = true;
    return Promise.resolve("x");
  };
  service.registerPluginTool(specOf({ invoke }));
  // `tag` is required + minLength 1 — an empty object violates it.
  const record = await runOne(service, "plugin_mood_report", {});
  expect(record?.isError).toBe(true);
  expect(invoked).toBe(false);
});

test("PL-B: an unsupported schema construct is an activation-fatal refusal (JsonSchemaLiftError)", () => {
  const service = serviceWith();
  const bad = specOf({ parameters: { type: "object", properties: { x: { type: "string", format: "email" } } } });
  expect(() => service.registerPluginTool(bad)).toThrow(JsonSchemaLiftError);
});

test("a name collision is activation-fatal (ToolNameCollisionError), never last-write-wins", () => {
  const service = serviceWith();
  service.registerPluginTool(specOf());
  expect(() => service.registerPluginTool(specOf())).toThrow(ToolNameCollisionError);
});

test("PL-C: the ceiling runs as the INSTALLING principal — a chat the installer can't read is denied", async () => {
  // A `can` that allows read ONLY for the installer's own id — proves the gate uses the installer, not the
  // turn caller (execOf's default principal is `user_host`, a different id).
  const can: Can = ((principal: Principal, action: string): void => {
    if (action === "read" && principal.userId !== INSTALLER.userId) {
      throw new DomainForbiddenError("not a participant");
    }
  }) as Can;
  const service = serviceWith(can);

  // Installer CAN read → the tool runs.
  service.registerPluginTool(specOf({ name: "plugin_ok", installer: INSTALLER }));
  const okRec = await runOne(service, "plugin_ok", { tag: "calm" }, CHAT_EXEC);
  expect(okRec?.isError).toBe(false);

  // A DIFFERENT installer the `can` denies read → the same call is denied (errors-as-data), guest not run.
  const stranger = makePrincipal(castId("user_stranger"), { handle: castId("stranger") });
  let strangerInvoked = false;
  const invoke = (): Promise<string> => {
    strangerInvoked = true;
    return Promise.resolve("x");
  };
  service.registerPluginTool(specOf({ name: "plugin_denied", installer: stranger, invoke }));
  const deniedRec = await runOne(service, "plugin_denied", { tag: "calm" }, CHAT_EXEC);
  expect(deniedRec?.isError).toBe(true);
  expect(deniedRec?.result).toContain("not permitted");
  expect(strangerInvoked).toBe(false);
});

test("unregister removes the tool — no ghost after deactivation", () => {
  const service = serviceWith();
  const handle = service.registerPluginTool(specOf());
  handle.unregister();
  // resolveTools throws for an unknown name (attach-time wiring surface) — the tool is gone.
  expect(() => service.resolveTools(["plugin_mood_report"])).toThrow();
});
