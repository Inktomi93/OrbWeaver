// registerPluginTool — the RUNTIME registrar (plugin-design PL-A / PL-B / PL-C). Proves: a guest tool lands
// in the ONE registry + resolves + executes through the SAME pipeline; the guest's raw JSON Schema is lifted
// and ENFORCED (bad args → errors-as-data); an unsupported schema construct is an activation-fatal refusal
// (PL-B); a collision is activation-fatal (`ToolNameCollisionError`, not boot-fatal); the ceiling runs as the
// INSTALLING principal (PL-C — the installer's role in THIS chat, not the turn caller's membership); and
// unregister leaves no ghost tool. #677 adds the PER-INSTALLER partition: the same namespaced name is held once
// per installing user, so the collision is scoped to one shelf and a deactivation touches only that shelf.

import type { Can, ParticipantRole } from "@orb/contracts/identity";
import type { InvocationChat } from "@orb/contracts/plugin";
import { PLUGIN_TOOL_WIRE_NAME_MAX } from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { JsonSchemaLiftError } from "@orb/kit/json-schema";
import { can as realCan } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { z } from "zod";
import { TOOL_NAME_RE } from "../../../../../packages/server/src/domain/tool-use/contract/params.ts";
import type { PluginToolSpec, ToolCallRecord, ToolExecutionContext } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { createToolUseService, ToolNameCollisionError } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { defOf, execOf } from "../_support.ts";

type Service = ReturnType<typeof createToolUseService>;

const INSTALLER = makePrincipal(castId("user_installer"), { handle: castId("installer") });
const STRANGER = makePrincipal(castId("user_stranger"), { handle: castId("stranger") });

const allowAll: Can = (() => undefined) as Can;

/** A tool-use service with the given `can` (defaults to allow-all). */
function serviceWith(can: Can = allowAll): Service {
  return createToolUseService({ can, clock: (): number => FROZEN_AT_MS });
}

/** A minimal valid plugin tool spec; `invoke` echoes the args JSON it received (the round-trip probe). The
 *  default `resolveInstallerRole` reports the installer as the chat's HOST (the permissive case — every PL-C
 *  test below overrides it, since that op IS the ceiling). */
function specOf(over: Partial<PluginToolSpec> = {}): PluginToolSpec {
  return {
    name: "plugin_mood_report",
    description: "report the mood",
    parameters: { type: "object", properties: { tag: { type: "string", minLength: 1 } }, required: ["tag"], additionalProperties: false },
    installer: INSTALLER,
    invoke: (argsJson: string): Promise<string> => Promise.resolve(`echo:${argsJson}`),
    resolveInstallerRole: (): Promise<ParticipantRole | null> => Promise.resolve("host"),
    ...over,
  };
}

/** Resolve + execute one call against `name`, returning its record. Resolved as the INSTALLER (#677 —
 *  `resolveTools` is driver-scoped, and every spec here is installed by {@link INSTALLER} unless it says
 *  otherwise); `driver` overrides that for the cross-installer pins. */
async function runOne(
  service: Service,
  name: string,
  args: unknown,
  over: { readonly exec?: ToolExecutionContext; readonly driver?: UserId } = {},
): Promise<ToolCallRecord | undefined> {
  const exec = over.exec ?? execOf();
  const set = service.resolveTools(over.driver ?? INSTALLER.userId, [name]);
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

// PL-C is a ceiling over the INSTALLER, and the ONLY honest source for that is the installer's present role in
// the invocation chat. It used to be `can(installer, …, exec.membership)` — a pure verdict over the TURN CALLER's
// membership — which meant (a) the read admission could never deny (`decideChat("read")` returns unconditionally)
// and (b) `canWrite` was taken from whoever was host of the room the tool ran in. These pins are written
// against the REAL `can` seam so no stubbed `can` can make them pass vacuously.
describe("PL-C: the invocation ceiling is the INSTALLER's role in THIS chat", () => {
  const hostCallerExec = execOf({ chatId: castId("chat_x"), membership: { role: "host" } });

  test("a chat the installer is not a present member of is DENIED — even when the CALLER is its host", async () => {
    const service = serviceWith(realCan);
    let invoked = false;
    const invoke = (): Promise<string> => {
      invoked = true;
      return Promise.resolve("x");
    };
    // The installer is a stranger to chat_x (no participant row); the turn caller is its host.
    service.registerPluginTool(specOf({ name: "plugin_denied", installer: STRANGER, invoke, resolveInstallerRole: () => Promise.resolve(null) }));
    // Driven by STRANGER — the entry lives on THEIR shelf (#677), and the PL-C ceiling is what denies it.
    const rec = await runOne(service, "plugin_denied", { tag: "calm" }, { exec: hostCallerExec, driver: STRANGER.userId });
    expect(rec?.isError).toBe(true);
    expect(rec?.result).toContain("not permitted");
    expect(invoked).toBe(false);
  });

  test("a MEMBER installer gets a READ-ONLY scope while the CALLER is host (canWrite is never the caller's)", async () => {
    // THE EXPLOIT PIN. Pre-fix `canWrite` was `can(installer,"host",{membership: exec.membership})` = "is the CALLER
    // host", so a plugin installed by user A ran with host write authority inside user B's room the moment B's
    // own turn called it — unlocking applyVariableOps / worldInfo.upsertEntry / requestTurn / imagery there.
    const service = serviceWith(realCan);
    let seen: InvocationChat | null | undefined;
    const invoke = (_argsJson: string, chat: InvocationChat | null): Promise<string> => {
      seen = chat;
      return Promise.resolve("ok");
    };
    service.registerPluginTool(specOf({ name: "plugin_member", installer: INSTALLER, invoke, resolveInstallerRole: () => Promise.resolve("member") }));
    const rec = await runOne(service, "plugin_member", { tag: "calm" }, { exec: hostCallerExec });
    expect(rec?.isError).toBe(false);
    expect(seen?.chatId).toBe("chat_x");
    expect(seen?.canWrite).toBe(false);
  });

  test("a HOST installer gets the write scope even when the CALLER is only a member", async () => {
    // The mirror: the caller's role is irrelevant in BOTH directions — the plugin's effects are the
    // installer's authority, which is what makes the membrane's host-authority gates meaningful.
    const service = serviceWith(realCan);
    let seen: InvocationChat | null | undefined;
    const invoke = (_argsJson: string, chat: InvocationChat | null): Promise<string> => {
      seen = chat;
      return Promise.resolve("ok");
    };
    service.registerPluginTool(specOf({ name: "plugin_host", installer: INSTALLER, invoke, resolveInstallerRole: () => Promise.resolve("host") }));
    const rec = await runOne(service, "plugin_host", { tag: "calm" }, { exec: execOf({ chatId: castId("chat_x"), membership: { role: "member" } }) });
    expect(rec?.isError).toBe(false);
    expect(seen?.canWrite).toBe(true);
  });

  test("the installer's role is resolved for THE INVOCATION CHAT, per call", async () => {
    // The op takes the chatId precisely so one registration cannot carry a role resolved elsewhere: the same
    // tool is host in chat_x and a non-member in chat_y.
    const service = serviceWith(realCan);
    const scopes: (InvocationChat | null)[] = [];
    const invoke = (_argsJson: string, chat: InvocationChat | null): Promise<string> => {
      scopes.push(chat);
      return Promise.resolve("ok");
    };
    const asked: string[] = [];
    service.registerPluginTool(
      specOf({
        name: "plugin_per_chat",
        invoke,
        resolveInstallerRole: (chatId): Promise<ParticipantRole | null> => {
          asked.push(chatId);
          return Promise.resolve(chatId === "chat_x" ? "host" : null);
        },
      }),
    );
    const okRec = await runOne(service, "plugin_per_chat", { tag: "a" }, { exec: execOf({ chatId: castId("chat_x"), membership: { role: "member" } }) });
    const deniedRec = await runOne(service, "plugin_per_chat", { tag: "b" }, { exec: execOf({ chatId: castId("chat_y"), membership: { role: "host" } }) });
    expect(okRec?.isError).toBe(false);
    expect(deniedRec?.isError).toBe(true);
    expect(asked).toEqual(["chat_x", "chat_y"]);
    expect(scopes).toEqual([{ chatId: "chat_x", canWrite: true, automationDepth: 0 }]);
  });

  // D146 / #648 — THE CEILING RE-PROVEN THROUGH THE NEW PATH. The membrane review's whole argument for why the
  // wrong-principal bug was survivable was that NOTHING attaches or invokes a plugin tool outside a turn; the
  // `run_tool` automation arm removes that shield, and it invokes with a DIFFERENT exec shape from every
  // pre-existing caller: `turnId: null` (a rule dispatch is not a turn) and `membership: null` (fail-closed — the
  // arm deliberately does not hand over anyone's membership). A ceiling that quietly depended on either field
  // being populated would go silent on exactly this path, which is why these two pins exist rather than an
  // assumption that the turn-shaped pins above still cover it.
  const automationExec = execOf({ chatId: castId("chat_x"), membership: null, turnId: null });

  test("the ceiling still DENIES on the automation exec shape — a null membership does not soften it", async () => {
    const service = serviceWith(realCan);
    let invoked = false;
    const invoke = (): Promise<string> => {
      invoked = true;
      return Promise.resolve("x");
    };
    // The installer is not a present member of the chat the rule fires in. Nothing about `membership: null` may be
    // read as "no membership to check" — the ceiling's input is the INSTALLER's row read, and it says no.
    service.registerPluginTool(specOf({ name: "plugin_auto_denied", invoke, resolveInstallerRole: () => Promise.resolve(null) }));
    const rec = await runOne(service, "plugin_auto_denied", { tag: "calm" }, { exec: automationExec });
    expect(rec?.isError).toBe(true);
    expect(rec?.result).toContain("not permitted");
    expect(invoked).toBe(false);
  });

  test("on the automation exec shape a MEMBER installer still gets a read-only scope (canWrite is not inherited from nothing)", async () => {
    const service = serviceWith(realCan);
    let seen: InvocationChat | null | undefined;
    const invoke = (_argsJson: string, chat: InvocationChat | null): Promise<string> => {
      seen = chat;
      return Promise.resolve("ok");
    };
    service.registerPluginTool(specOf({ name: "plugin_auto_member", invoke, resolveInstallerRole: () => Promise.resolve("member") }));
    const rec = await runOne(service, "plugin_auto_member", { tag: "calm" }, { exec: automationExec });
    expect(rec?.isError).toBe(false);
    // The write half stays LOCKED. With no membership in scope at all, a ceiling that had been reading the caller's
    // role would have had to either crash or default — it does neither, because it never reads it.
    expect(seen).toEqual({ chatId: "chat_x", canWrite: false, automationDepth: 0 });
  });

  test("a non-chat consumer still gets a null scope (no chat, no ceiling to run)", async () => {
    const service = serviceWith(realCan);
    let seen: InvocationChat | null | undefined = { chatId: castId("chat_unset"), canWrite: true, automationDepth: 0 };
    const invoke = (_argsJson: string, chat: InvocationChat | null): Promise<string> => {
      seen = chat;
      return Promise.resolve("ok");
    };
    service.registerPluginTool(specOf({ name: "plugin_nochat", invoke }));
    const rec = await runOne(service, "plugin_nochat", { tag: "calm" });
    expect(rec?.isError).toBe(false);
    expect(seen).toBeNull();
  });
});

// #677 — THE PER-INSTALLER PARTITION. `plugins` is unique per (owner, slug), so two users installing the same
// plugin is the NORMAL case (the seeded examples install for everyone), and the namespaced tool name they both
// produce is byte-identical. A registry keyed by NAME ALONE therefore let the first user to ENABLE squat the
// name for the whole process: every other user's activation caught a `ToolNameCollisionError` and landed
// `errored`. These pins are written at the SERVICE surface (the affordance an installer has) rather than over
// the key derivation, so they stay true of any partition shape.
describe("#677: the same tool name may be held once PER INSTALLER", () => {
  test("two users installing the SAME slug both register — first-to-enable does not squat the name", () => {
    const service = serviceWith();
    service.registerPluginTool(specOf({ installer: INSTALLER }));
    expect(() => service.registerPluginTool(specOf({ installer: STRANGER }))).not.toThrow();
  });

  test("both installers may direct-drive their OWN copy of the shared name", () => {
    const service = serviceWith();
    service.registerPluginTool(specOf({ installer: INSTALLER }));
    service.registerPluginTool(specOf({ installer: STRANGER }));
    expect(service.isToolDrivableBy("plugin_mood_report", INSTALLER.userId)).toBe(true);
    expect(service.isToolDrivableBy("plugin_mood_report", STRANGER.userId)).toBe(true);
  });

  test("a SECOND registration by the SAME installer is still activation-fatal", () => {
    const service = serviceWith();
    service.registerPluginTool(specOf({ installer: INSTALLER }));
    expect(() => service.registerPluginTool(specOf({ installer: INSTALLER }))).toThrow(ToolNameCollisionError);
  });

  test("one installer's deactivation leaves the OTHER installer's copy resolvable", () => {
    const service = serviceWith();
    const mine = service.registerPluginTool(specOf({ installer: INSTALLER }));
    service.registerPluginTool(specOf({ installer: STRANGER }));
    mine.unregister();
    expect(service.isToolDrivableBy("plugin_mood_report", INSTALLER.userId)).toBe(false);
    expect(service.isToolDrivableBy("plugin_mood_report", STRANGER.userId)).toBe(true);
    // …and the survivor still RESOLVES, not merely "is drivable": the two answers come from different reads.
    expect(() => service.resolveTools(STRANGER.userId, ["plugin_mood_report"])).not.toThrow();
    expect(() => service.resolveTools(INSTALLER.userId, ["plugin_mood_report"])).toThrow();
  });

  test("a contributor may NOT take a first-party name, even on its own shelf", () => {
    // The one cross-partition rule the per-owner keying still needs. `resolveTools` prefers the driver's own
    // shelf, so admitting this would silently replace a builtin for the installing user — capability confusion,
    // and it is what keeps the two-step lookup free of any precedence question.
    const service = serviceWith();
    service.register(
      defOf({
        name: "plugin_mood_report",
        schema: z.object({}),
        handler: (): Promise<{ ok: true; value: unknown }> => Promise.resolve({ ok: true, value: 1 }),
      }),
    );
    expect(() => service.registerPluginTool(specOf())).toThrow(ToolNameCollisionError);
  });
});

// #1803 — `TOOL_NAME_RE`'s bound IS `PLUGIN_TOOL_WIRE_NAME_MAX` (`@orb/contracts/plugin`), the number the
// manifest/membrane byte-budget boundaries are sized against. Contracts cannot import server (the cake), so
// this exact-value pin is the tie back — if either side's cap ever moves without the other, this test is the
// one thing that catches it before the boundaries silently stop matching the registry they were sized for.
test("#1803: the registry's TOOL_NAME_RE bound equals the contracts wire-mint budget constant", () => {
  const maxLen = TOOL_NAME_RE.source.match(/\{0,(\d+)\}/)?.[1];
  expect(maxLen).toBeDefined();
  expect(1 + Number(maxLen)).toBe(PLUGIN_TOOL_WIRE_NAME_MAX);
});

// A LENGTH failure at this registrar is now BACKSTOP-ONLY (#1803): the manifest/membrane boundaries bound
// slug + guest-local name so a real plugin mint can never reach here over-length. This pin proves the
// backstop still fires — and says LENGTH, never bare "collision" — for a caller that bypasses those
// boundaries (a hand-built spec, exactly what a test does).
test("#1803: an over-length name is refused at the registry backstop with a message naming the failure", () => {
  const service = serviceWith();
  const overLong = `a${"a".repeat(PLUGIN_TOOL_WIRE_NAME_MAX)}`; // one byte over TOOL_NAME_RE's cap
  expect(() => service.registerPluginTool(specOf({ name: overLong }))).toThrow(ToolNameCollisionError);
  expect(() => service.registerPluginTool(specOf({ name: overLong }))).toThrow(/charset\/length/);
});

test("unregister removes the tool — no ghost after deactivation", () => {
  const service = serviceWith();
  const handle = service.registerPluginTool(specOf());
  handle.unregister();
  // resolveTools throws for an unknown name (attach-time wiring surface) — the tool is gone.
  expect(() => service.resolveTools(INSTALLER.userId, ["plugin_mood_report"])).toThrow();
});
