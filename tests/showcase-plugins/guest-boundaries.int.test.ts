import type { PluginHostV1, PluginSurfaceRegistration, PluginToolRegistration, PluginVariableOp } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { bootShowcase } from "@orb/testkit/node/composed";

// The VM helper receives guest functions directly, before the real host replaces them with handler refs.
type GuestTool = Omit<PluginToolRegistration, "handler"> & { readonly handler: (input: unknown) => Promise<string> };
type GuestSurface = Omit<PluginSurfaceRegistration, "onAction"> & { readonly onAction?: (action: { actionId: string }) => Promise<void> };

test("story clocks refuse non-string names and replace malformed clock values rather than ticking their coercion", async () => {
  const tools = new Map<string, GuestTool>();
  const vars: Record<string, unknown> = {};
  const writes: Extract<PluginVariableOp, { op: "set" }>[] = [];
  const registered = Promise.withResolvers<void>();
  await bootShowcase(
    "story-clocks",
    {
      grants: ["tools.register", "chat.read", "chat.variables.write"],
      log: { info: (): void => undefined },
      tools: {
        register: (registration: GuestTool): void => {
          tools.set(registration.name, registration);
          registered.resolve();
        },
      },
      chat: {
        current: (): string => "room",
        getVariables: (): Promise<typeof vars> => Promise.resolve(vars),
        applyVariableOps: (...[, ops]: Parameters<PluginHostV1["chat"]["applyVariableOps"]>): ReturnType<PluginHostV1["chat"]["applyVariableOps"]> => {
          for (const op of ops) {
            if (op.op !== "set") {
              throw new Error(`unexpected clock operation ${op.op}`);
            }
            writes.push(op);
            vars[op.key] = op.value;
          }
          return Promise.resolve({ outcome: "applied" });
        },
      },
    },
    registered.promise,
  );
  const tool = tools.get("advance_clock");
  if (tool === undefined) {
    throw new Error("story clocks registered no advance tool");
  }

  expect(await tool.handler({ name: { label: "Ritual" } })).toBe("That clock needs a speakable name.");
  expect(await tool.handler({ name: ["Ritual"] })).toBe("That clock needs a speakable name.");
  expect(writes).toEqual([]);

  // Malformed external data must not become a valid clock through Array.toString().
  vars["clock:ritual"] = ["3/6"];
  expect(await tool.handler({ name: "Ritual" })).toBe('Started the clock "ritual" at 1/6.');
  expect(vars["clock:ritual"]).toBe("1/6");

  vars["clock:ritual"] = "3/6";
  expect(await tool.handler({ name: "Ritual" })).toBe('"ritual" advances to 4/6.');
  expect(vars["clock:ritual"]).toBe("4/6");
  expect(writes.map(({ value }) => value)).toEqual(["1/6", "4/6"]);
});

test("oracle startup logs a rejected storage read and only the retire action deletes its session", async () => {
  const warnings: string[] = [];
  const deleted: string[] = [];
  const surfaces = new Map<string, GuestSurface>();
  // The guest's startup publish ends in this warning; it is the last effect the test asserts.
  const startupRefused = Promise.withResolvers<void>();
  await bootShowcase(
    "oracle-deck",
    {
      grants: ["storage.kv", "ui.surface"],
      log: {
        info: (): void => undefined,
        warn: (message: string): void => {
          warnings.push(message);
          if (message.startsWith("deck page not refreshed")) {
            startupRefused.resolve();
          }
        },
      },
      storage: {
        get: (): Promise<never> => Promise.reject(new Error("storage unavailable")),
        delete: (key: string): Promise<void> => {
          deleted.push(key);
          return Promise.resolve();
        },
      },
      ui: {
        registerCommand: (): void => undefined,
        register: (surface: GuestSurface): void => void surfaces.set(surface.id, surface),
        toast: (): Promise<void> => Promise.resolve(),
      },
    },
    startupRefused.promise,
  );
  expect(warnings).toEqual([
    "oracle deck is dormant: it needs tools.register + storage.kv granted (Settings → Plugins)",
    "deck page not refreshed: Error: storage unavailable",
  ]);
  const retire = surfaces.get("reveal_dialog")?.onAction;
  if (retire === undefined) {
    throw new Error("oracle registered no reveal action");
  }
  await retire({ actionId: "unknown" });
  expect(deleted).toEqual([]);
  await retire({ actionId: "retire" });
  expect(deleted).toEqual(["session"]);
});
