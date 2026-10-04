import { expect, test } from "../support/fixtures.ts";
import { bootShowcase, settle } from "../support/showcase-guest.ts";

interface ActionArgs {
  readonly actionId: string;
  readonly values: Record<string, string>;
  readonly chat: string | null;
}

interface Drive {
  readonly vars: Record<string, string>;
  readonly published: { id: string; state: Record<string, unknown> }[];
  readonly logs: { level: string; message: string }[];
  readonly act: (actionId: string, values: Record<string, string>) => Promise<void>;
}

const HOST_BOUND = "chat.requestTurn exceeded 5000ms host bound";
const GRANTS = ["chat.read", "chat.variables.write", "turn.trigger", "events.subscribe", "tools.register", "ui.surface"];

/** The real outbox's toast floor, reduced to its behaviour: the first toast lands, every later one throws. */
async function bootClocks(options: { vars?: Record<string, string>; requestTurn?: () => Promise<void> } = {}): Promise<Drive> {
  const vars: Record<string, string> = { ...options.vars };
  const published: Drive["published"] = [];
  const logs: Drive["logs"] = [];
  let panelAction: ((a: ActionArgs) => Promise<void>) | null = null;
  let toasts = 0;
  const log =
    (level: string) =>
    (message: string): void => {
      logs.push({ level, message });
    };
  const host = {
    version: 1,
    grants: GRANTS,
    log: { info: log("info"), warn: log("warn"), error: log("error") },
    tools: { register: (): void => undefined },
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
      toast: (): Promise<void> => {
        toasts += 1;
        return toasts > 1 ? Promise.reject(new Error("plugin host: ui.toast is limited to one notice")) : Promise.resolve();
      },
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
  return { vars, published, logs, act };
}

test("a second panel action inside the toast floor still writes and refreshes the flank", async () => {
  const drive = await bootClocks();
  await drive.act("start", { name: "the ritual", segments: "6" });
  // The tick's own success toast is refused by the floor; the action must neither throw nor skip the refresh.
  await drive.act("tick", { name: "the ritual", segments: "6" });

  expect(drive.vars["clock:the_ritual"]).toBe("1/6");
  const flank = drive.published.filter(({ id }) => id === "clock_flank").at(-1);
  expect(flank?.state["line0"]).toContain("1/6");
});

test("a filled clock whose requestTurn outlives the host bound is not logged as refused", async () => {
  const drive = await bootClocks({ vars: { "clock:the_ritual": "5/6" }, requestTurn: () => Promise.reject(new Error(HOST_BOUND)) });
  await drive.act("tick", { name: "the ritual", segments: "6" });

  expect(drive.logs.filter(({ level }) => level === "warn")).toEqual([]);
  expect(drive.logs.some(({ level, message }) => level === "info" && message.includes("turn started"))).toBe(true);
});
