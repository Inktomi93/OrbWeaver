import type { PluginToast, PluginToastLevel } from "@orb/contracts/plugin";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { bootShowcase, settle } from "@orb/testkit/node/showcase-guest.ts";
import { createPluginUiOutbox } from "#server/domain/plugin/index.ts";

interface ActionArgs {
  readonly actionId: string;
  readonly values: Record<string, string>;
  readonly chat: string | null;
}

interface Drive {
  readonly advance: (args: unknown) => Promise<string>;
  readonly registration: { readonly displayName?: string; readonly replayHistory?: boolean };
  readonly vars: Record<string, string>;
  readonly published: { id: string; state: Record<string, unknown> }[];
  readonly logs: { level: string; message: string }[];
  readonly act: (actionId: string, values: Record<string, string>) => Promise<void>;
  /** What the production outbox admitted so far; the floor refuses every toast after the first inside its cooldown. */
  readonly admittedToasts: () => readonly PluginToast[];
}

/** What the membrane rejects with when a host call outlives its bound. */
function hostDeadline(): Error {
  const error = new Error("chat.requestTurn exceeded 5000ms host bound");
  error.name = "PluginHostDeadlineError";
  return error;
}
interface ClockTool {
  readonly handler: (args: unknown) => Promise<string>;
  readonly displayName?: string;
  readonly replayHistory?: boolean;
}
const GRANTS = ["chat.read", "chat.variables.write", "turn.trigger", "events.subscribe", "tools.register", "ui.surface"];

// The production outbox owns the toast floor; a frozen clock keeps every later toast inside its cooldown.
const IDENTITY = { id: mintTypeId(ID_PREFIX.plugin), name: "Story Clocks", slug: "story-clocks" };

async function bootClocks(options: { vars?: Record<string, string>; requestTurn?: () => Promise<void> } = {}): Promise<Drive> {
  const vars: Record<string, string> = { ...options.vars };
  const published: Drive["published"] = [];
  const logs: Drive["logs"] = [];
  let panelAction: ((a: ActionArgs) => Promise<void>) | null = null;
  let tool: ClockTool | null = null;
  const outbox = createPluginUiOutbox(() => 0);
  const log =
    (level: string) =>
    (message: string): void => {
      logs.push({ level, message });
    };
  const host = {
    version: 1,
    grants: GRANTS,
    log: { info: log("info"), warn: log("warn"), error: log("error") },
    tools: {
      register: (registration: ClockTool): void => {
        tool = registration;
      },
    },
    events: { on: (): void => undefined },
    chat: {
      current: (): string => "chat-token",
      getVariables: (): Promise<Record<string, string>> => Promise.resolve({ ...vars }),
      applyVariableOps: (_chat: string, ops: { op: string; key: string; value?: string }[]): Promise<{ outcome: string }> => {
        for (const op of ops) {
          if (op.op === "delete") {
            delete vars[op.key];
          } else if (op.value !== undefined) {
            vars[op.key] = op.value;
          }
        }
        return Promise.resolve({ outcome: "applied" });
      },
      requestTurn: options.requestTurn ?? ((): Promise<void> => Promise.resolve()),
    },
    ui: {
      register: (surface: { id: string; onAction?: (a: ActionArgs) => Promise<void> }): void => {
        if (surface.id === "clock_panel" && surface.onAction !== undefined) {
          panelAction = surface.onAction;
        }
      },
      setState: (id: string, state: Record<string, unknown>): Promise<void> => {
        published.push({ id, state });
        return Promise.resolve();
      },
      // The outbox throws over its floor; inside a Promise executor that throw is the rejected guest promise.
      toast: (level: PluginToastLevel, message: string): Promise<void> =>
        new Promise((resolve) => {
          outbox.pushToast(IDENTITY, level, message);
          resolve();
        }),
    },
  };
  await bootShowcase("story-clocks", host);
  const act = async (actionId: string, values: Record<string, string>): Promise<void> => {
    if (panelAction === null) {
      throw new Error("story clocks registered no panel");
    }
    await panelAction({ actionId, values, chat: "chat-token" });
    await settle();
  };
  const readTool = (): ClockTool | null => tool;
  const registered = readTool();
  if (registered === null) {
    throw new Error("story clocks registered no tool");
  }
  return { vars, published, logs, act, registration: registered, advance: registered.handler, admittedToasts: () => outbox.drain(IDENTITY.id).toasts };
}

test("the model tool advertises replay and returns a readable clock result", async () => {
  const drive = await bootClocks();
  expect(drive.registration).toMatchObject({ displayName: "Advance story clock", replayHistory: true });
  expect(await drive.advance({ name: "the ritual", segments: 6 })).toBe('Started the clock "the ritual" at 1/6.');
  expect(drive.vars["clock:the_ritual"]).toBe("1/6");
});

test("the empty flank points to the actual host panel path, and the host panel does not point at itself", async () => {
  const drive = await bootClocks();
  await drive.act("clear", { name: "the ritual" });
  const summaryOf = (id: string): unknown => drive.published.findLast((published) => published.id === id)?.state["summary"];
  expect(summaryOf("clock_flank")).toBe("No clocks yet — the host starts one in This chat → Plugin controls.");
  expect(summaryOf("clock_panel")).not.toContain("Plugin controls");
});

test("a second panel action inside the toast floor still writes and refreshes the flank", async () => {
  const drive = await bootClocks();
  await drive.act("start", { name: "the ritual", segments: "6" });
  // The tick's own success toast is refused by the floor; the action must neither throw nor skip the refresh.
  await drive.act("tick", { name: "the ritual", segments: "6" });

  expect(drive.vars["clock:the_ritual"]).toBe("1/6");
  const flank = drive.published.filter(({ id }) => id === "clock_flank").at(-1);
  expect(flank?.state["line0"]).toContain("1/6");
  expect(drive.admittedToasts()).toHaveLength(1);
});

test("a filled clock whose requestTurn outlives the host bound is not logged as refused", async () => {
  const drive = await bootClocks({ vars: { "clock:the_ritual": "5/6" }, requestTurn: () => Promise.reject(hostDeadline()) });
  await drive.act("tick", { name: "the ritual", segments: "6" });

  expect(drive.logs.filter(({ level }) => level === "warn")).toEqual([]);
  expect(drive.logs.some(({ level, message }) => level === "info" && message.includes("turn started"))).toBe(true);
});
