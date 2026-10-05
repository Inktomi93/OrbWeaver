import { join } from "node:path";
import vm from "node:vm";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { unzipSync } from "fflate";
import { expect, test } from "../support/tool-fixtures.ts";

async function familiarGuest(missing: readonly string[] = []): Promise<{
  commit: (text: string) => Promise<void>;
  configure: (attached: boolean) => void;
  missingArticle: () => void;
  notices: { recipient: string; message: string }[];
  writes: { bookId: string; contentTemplate: string }[];
  fetches: string[];
}> {
  const root = join(import.meta.dirname, "..", "..");
  const built = await packPluginDirectory({
    pluginDirectory: join(root, "packages/showcase-plugins/bundles/research-familiar"),
    sdkDirectory: join(root, "packages/plugin-sdk"),
  });
  expect(built.diagnostics).toEqual([]);
  if (built.bundle === null) {
    throw new Error("Research Familiar did not compile");
  }
  const source = unzipSync(built.bundle)["main.js"];
  if (source === undefined) {
    throw new Error("Research Familiar has no main.js");
  }
  const kv = new Map<string, string>();
  const notices: { recipient: string; message: string }[] = [];
  const writes: { bookId: string; contentTemplate: string }[] = [];
  const fetches: string[] = [];
  let destination: string | null = null;
  let attached = false;
  let status = 200;
  let now = 1_750_000_000_000;
  let handler: ((fact: { message: { content: string } }) => Promise<void>) | undefined;
  const context = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, context);
  context["orb"] = {
    host: (): Record<string, unknown> => ({
      grants: ["events.subscribe", "storage.kv", "chat.read", "global_vars", "worldinfo.read", "worldinfo.write", "net.fetch", "notify"].filter(
        (capability) => !missing.includes(capability),
      ),
      events: {
        on: (_name: string, callback: typeof handler): void => {
          handler = callback;
        },
      },
      log: { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
      clock: { nowEpochMs: (): number => now },
      chat: { current: (): string => "admitted-room-handle" },
      variables: { get: (): Promise<string | null> => Promise.resolve(destination) },
      storage: {
        get: (key: string): Promise<string | null> => Promise.resolve(kv.get(key) ?? null),
        set: (key: string, value: string): Promise<void> => {
          kv.set(key, value);
          return Promise.resolve();
        },
      },
      notifications: {
        post: (_chat: string, recipient: string, message: string): Promise<void> => {
          notices.push({ recipient, message });
          return Promise.resolve();
        },
      },
      worldInfo: {
        listBooks: (): Promise<{ id: string; name: string }[]> => Promise.resolve(attached ? [{ id: "wib_chosen", name: "Chosen book" }] : []),
        upsertEntry: (_chat: string, entry: (typeof writes)[number]): Promise<void> => {
          writes.push(entry);
          return Promise.resolve();
        },
      },
      net: {
        fetch: (url: string): Promise<{ status: number; body: string }> => {
          fetches.push(url);
          return Promise.resolve({ status, body: JSON.stringify({ title: "Aurora", extract: "Charged particles illuminate the sky." }) });
        },
      },
    }),
  };
  vm.runInContext(new TextDecoder().decode(source), context);
  const commit = handler;
  if (commit === undefined) {
    throw new Error("Research Familiar subscribed to nothing");
  }
  return {
    commit: (text) => commit({ message: { content: text } }),
    configure: (inRoom): void => {
      destination = "wib_chosen";
      attached = inRoom;
    },
    missingArticle: (): void => {
      now += 30_000;
      status = 404;
    },
    notices,
    writes,
    fetches,
  };
}

test("missing configuration notifies only the installer once; configured attached lookup writes and a missing article stays quiet", async () => {
  const guest = await familiarGuest();
  await guest.commit("((lookup: Aurora))");
  await guest.commit("((lookup: Another term))");
  expect(guest.notices).toEqual([{ recipient: "host", message: expect.stringContaining("Choose lore book") }]);
  expect(guest.fetches).toEqual([]);
  expect(guest.writes).toEqual([]);
  guest.configure(true);
  await guest.commit("((lookup: Aurora))");
  expect(guest.writes).toEqual([expect.objectContaining({ bookId: "wib_chosen", contentTemplate: "Aurora: Charged particles illuminate the sky." })]);
  expect(guest.fetches).toHaveLength(1);
  guest.missingArticle();
  await guest.commit("((lookup: Unwritten article))");
  expect(guest.fetches).toHaveLength(2);
  expect(guest.writes).toHaveLength(1);
  expect(guest.notices).toHaveLength(1);
});

test("a required write grant error notifies once without egress, and configuration never grants attachment consent", async () => {
  const denied = await familiarGuest(["worldinfo.write"]);
  denied.configure(true);
  await denied.commit("((lookup: Aurora))");
  await denied.commit("((lookup: Another term))");
  expect(denied.notices).toEqual([{ recipient: "host", message: expect.stringContaining("worldinfo.write") }]);
  expect(denied.fetches).toEqual([]);
  expect(denied.writes).toEqual([]);
  const unattached = await familiarGuest();
  unattached.configure(false);
  await unattached.commit("((lookup: Aurora))");
  await unattached.commit("((lookup: Another term))");
  expect(unattached.fetches).toEqual([]);
  expect(unattached.writes).toEqual([]);
  expect(unattached.notices).toEqual([{ recipient: "host", message: expect.stringContaining("not attached") }]);
});
