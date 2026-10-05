import { expect, test } from "../support/fixtures.ts";
import { bootShowcase, settle } from "../support/showcase-guest.ts";

type Handler = (args: unknown) => Promise<string>;
type PageAction = (a: { actionId: string; values: Record<string, string> }) => Promise<void>;

interface Drive {
  readonly registrations: ReadonlyMap<string, { readonly displayName?: string; readonly replayHistory?: boolean }>;
  readonly kv: Map<string, string>;
  readonly published: Record<string, unknown>[];
  readonly draw: (count?: number) => Promise<{ cards: string[]; dealt: number; summary: string }>;
  readonly pageAction: (actionId: string) => Promise<void>;
}

const GRANTS = ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"];

/** `toast` follows the real outbox's floor: the first lands, every later one throws. */
async function bootDeck(seedKv: Record<string, string> = {}): Promise<Drive> {
  const kv = new Map(Object.entries(seedKv));
  const published: Record<string, unknown>[] = [];
  const tools = new Map<string, Handler>();
  const registrations = new Map<string, { readonly displayName?: string; readonly replayHistory?: boolean }>();
  let page: PageAction | null = null;
  let toasts = 0;
  const host = {
    version: 1,
    grants: GRANTS,
    log: { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
    ids: { mint: (): string => "seed-for-the-test" },
    storage: {
      get: (key: string): Promise<string | null> => Promise.resolve(kv.get(key) ?? null),
      delete: (key: string): Promise<void> => {
        kv.delete(key);
        return Promise.resolve();
      },
      compareAndSet: (key: string, expected: string | null, next: string): Promise<{ applied: boolean; current: string | null }> => {
        const current = kv.get(key) ?? null;
        if (current !== expected) {
          return Promise.resolve({ applied: false, current });
        }
        kv.set(key, next);
        return Promise.resolve({ applied: true, current: next });
      },
    },
    tools: {
      register: (tool: { name: string; handler: Handler; displayName?: string; replayHistory?: boolean }): void => {
        tools.set(tool.name, tool.handler);
        registrations.set(tool.name, tool);
      },
    },
    macros: { register: (): void => undefined },
    pubsub: { emit: (): Promise<void> => Promise.resolve() },
    ui: {
      register: (surface: { id: string; onAction?: PageAction }): void => {
        if (surface.id === "deck_page" && surface.onAction !== undefined) {
          page = surface.onAction;
        }
      },
      registerCommand: (): void => undefined,
      setState: (id: string, state: Record<string, unknown>): Promise<void> => {
        if (id === "deck_page") {
          published.push(state);
        }
        return Promise.resolve();
      },
      toast: (): Promise<void> => {
        toasts += 1;
        return toasts > 1 ? Promise.reject(new Error("plugin host: ui.toast is limited to one notice")) : Promise.resolve();
      },
    },
  };
  await bootShowcase("oracle-deck", host);
  return {
    registrations,
    kv,
    published,
    draw: async (count = 1): Promise<{ cards: string[]; dealt: number; summary: string }> => {
      const handler = tools.get("draw");
      if (handler === undefined) {
        throw new Error("no draw tool");
      }
      return JSON.parse(await handler({ count })) as { cards: string[]; dealt: number; summary: string };
    },
    pageAction: async (actionId: string): Promise<void> => {
      if (page === null) {
        throw new Error("no deck page");
      }
      await page({ actionId, values: {} });
      await settle();
    },
  };
}

test("activation publishes the page from the session that survived", async () => {
  const drive = await bootDeck({ session: JSON.stringify({ seed: "kept", dealt: 4 }) });

  const state = drive.published.at(-1);
  expect(state?.["dealt"]).toBe(4);
  expect(state?.["commitmentRows"]).toHaveLength(1);
  expect(String(state?.["dealtList"]).split(", ")).toHaveLength(4);
});

test("a deck with no session shows no commitment row and no cards", async () => {
  const drive = await bootDeck();

  const state = drive.published.at(-1);
  expect(state?.["commitmentRows"]).toEqual([]);
  expect(state?.["last"]).toBe("");
  expect(state?.["dealtList"]).toBe("");
});

test("a model draw republishes the page with the card it dealt", async () => {
  const drive = await bootDeck();
  const result = await drive.draw(2);
  expect(drive.registrations.get("draw")).toMatchObject({ displayName: "Draw oracle cards", replayHistory: true });
  expect(drive.registrations.get("reveal")).toMatchObject({ displayName: "Reveal oracle deck", replayHistory: true });
  expect(result.summary).toBe(`Drew ${result.cards.join(", ")}.`);

  const state = drive.published.at(-1);
  expect(state?.["dealt"]).toBe(2);
  expect(String(state?.["last"])).toContain(result.cards[1] ?? "missing");
  expect(String(state?.["dealtList"])).toContain(result.cards[0] ?? "missing");
  expect(state?.["commitmentRows"]).toHaveLength(1);
});

test("a page draw inside the toast floor still republishes the page", async () => {
  const drive = await bootDeck();
  await drive.pageAction("draw_one");
  await drive.pageAction("draw_one");

  expect(drive.published.at(-1)?.["dealt"]).toBe(2);
});
