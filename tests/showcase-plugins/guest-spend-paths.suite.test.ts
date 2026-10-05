// The released Affinity Tracker and Keepsake Camera `main.js` bytes, run in a bare `node:vm` context under the
// realm's own `AMBIENT_STUBS` over a fake `orb.host(1)`: what each spend path hands the host, and what the
// person is told when that host call fails.

import { join } from "node:path";
import vm from "node:vm";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { AMBIENT_STUBS, HOST_FN_DEADLINE_MS, PLUGIN_QUIET_PROMPT_MAX_CHARS } from "@orb/server/infra/plugin-host";
import { budget } from "@orb/tooling/_shared/load-budget";
import { unzipSync } from "fflate";
import { expect, test } from "../support/tool-fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
// One author build per plugin; the release compiler is the slow part (see authoring.suite.test.ts).
const BUILD_TIMEOUT = budget(30_000);
const SETTLE_TICKS = 24;

async function releasedMain(slug: string): Promise<string> {
  const built = await packPluginDirectory({
    pluginDirectory: join(REPO_ROOT, "packages", "showcase-plugins", "bundles", slug),
    sdkDirectory: join(REPO_ROOT, "packages", "plugin-sdk"),
  });
  if (built.diagnostics.length > 0 || built.bundle === null) {
    throw new Error(`${slug} author build failed: ${built.diagnostics.map(({ message }) => message).join("; ")}`);
  }
  const main = unzipSync(built.bundle)["main.js"];
  if (main === undefined) {
    throw new Error(`${slug} release bundle has no main.js`);
  }
  return new TextDecoder().decode(main);
}

async function settle(): Promise<void> {
  for (let i = 0; i < SETTLE_TICKS; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function boot(source: string, host: Record<string, unknown>): void {
  const ctx = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, ctx);
  ctx["orb"] = { host: (): Record<string, unknown> => host };
  vm.runInContext(source, ctx, { filename: "plugin-guest.js" });
}

function memoryStorage(): Record<string, unknown> {
  const kv = new Map<string, string>();
  return {
    get: (key: string): Promise<string | null> => Promise.resolve(kv.get(key) ?? null),
    set: (key: string, value: string): Promise<void> => {
      kv.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Promise<void> => {
      kv.delete(key);
      return Promise.resolve();
    },
    list: (prefix: string): Promise<string[]> => Promise.resolve([...kv.keys()].filter((key) => key.startsWith(prefix))),
    compareAndSet: (key: string, expected: string | null, next: string): Promise<{ applied: boolean; current: string | null }> => {
      const current = kv.get(key) ?? null;
      if (current !== expected) {
        return Promise.resolve({ applied: false, current });
      }
      kv.set(key, next);
      return Promise.resolve({ applied: true, current: next });
    },
  };
}

const quietLog = { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

interface View {
  readonly authorDisplayName: string;
  readonly content: string;
}

/** A roleplay-length window: every reply alone is a third of the host cap. */
function longScene(count: number): View[] {
  return Array.from({ length: count }, (_, i) => ({
    authorDisplayName: i % 2 === 0 ? "Wren" : "You",
    content: `beat-${String(i).padStart(2, "0")} ${"The lantern light pools on the floorboards. ".repeat(70)}`,
  }));
}

test("Affinity Tracker takes a reading in a long roleplay chat: newest lines first, the prompt under the host cap", { timeout: BUILD_TIMEOUT }, async () => {
  const source = await releasedMain("affinity-tracker");
  const scene = longScene(12);
  const prompts: string[] = [];
  const logs: string[] = [];
  let onCommit: ((fact: { chatId: string }) => Promise<void>) | undefined;
  boot(source, {
    grants: ["chat.read", "storage.kv", "notify", "llm.quiet", "events.subscribe"],
    log: { info: (line: string): void => void logs.push(line), warn: (line: string): void => void logs.push(line), error: quietLog.error },
    storage: memoryStorage(),
    events: {
      on: (_name: string, handler: typeof onCommit): void => {
        onCommit = handler;
      },
    },
    chat: {
      current: (): string => "chat-handle",
      listMessages: (): Promise<View[]> => Promise.resolve(scene),
    },
    llm: {
      // The membrane's refusal, at the membrane's own cap.
      quiet: (prompt: string): Promise<string> => {
        prompts.push(prompt);
        return prompt.length > PLUGIN_QUIET_PROMPT_MAX_CHARS
          ? Promise.reject(new Error(`plugin host: llm.quiet prompt exceeds the ${PLUGIN_QUIET_PROMPT_MAX_CHARS}-character cap`))
          : Promise.resolve("7");
      },
    },
    notifications: { post: (): Promise<void> => Promise.resolve() },
  });
  if (onCommit === undefined) {
    throw new Error("affinity tracker subscribed to nothing");
  }
  for (let i = 0; i < 8; i++) {
    await onCommit({ chatId: "c1" });
  }
  await settle();

  expect(prompts).toHaveLength(1);
  const sent = prompts[0] ?? "";
  expect(sent.length).toBeLessThanOrEqual(PLUGIN_QUIET_PROMPT_MAX_CHARS);
  expect(logs).toContain("affinity reading for c1: 7");
  // The newest beats are the ones kept, in reading order; the oldest fall off the front.
  expect(sent).toContain("Wren: beat-10");
  expect(sent).toContain("You: beat-11");
  expect(sent.indexOf("beat-10")).toBeLessThan(sent.indexOf("beat-11"));
  expect(sent).not.toContain("beat-00");
});

interface Toast {
  readonly level: string;
  readonly message: string;
}

/** Run `/plugin keepsake-camera snapshot` against an image pipeline that rejects with `failure` after
 *  `elapsedMs` of (fake) wall clock — or, with `failure` null, paints and then has the album's first storage
 *  write throw — and return what the person was told. */
async function snapshotToasts(source: string, failure: Error | null, elapsedMs: number): Promise<Toast[]> {
  const toasts: Toast[] = [];
  let now = 1_700_000_000_000;
  let onRun: ((a: { values: Record<string, unknown> }) => Promise<void>) | undefined;
  const storage = memoryStorage();
  boot(source, {
    grants: ["chat.read", "storage.kv", "imagery.generate", "ui.surface"],
    log: quietLog,
    clock: { nowEpochMs: (): number => now },
    storage: failure === null ? { ...storage, compareAndSet: (): Promise<never> => Promise.reject(new Error("storage unavailable")) } : storage,
    chat: {
      current: (): string => "chat-handle",
      listMessages: (): Promise<View[]> => Promise.resolve(longScene(3)),
    },
    imagery: {
      generatePicture: (): Promise<{ assetId: string }> => {
        now += elapsedMs;
        return failure === null ? Promise.resolve({ assetId: "asset-1" }) : Promise.reject(failure);
      },
    },
    ui: {
      register: (): void => undefined,
      registerCommand: (command: { onRun: typeof onRun }): void => {
        onRun = command.onRun;
      },
      setState: (): Promise<void> => Promise.resolve(),
      toast: (level: string, message: string): Promise<void> => {
        toasts.push({ level, message });
        return Promise.resolve();
      },
    },
  });
  if (onRun === undefined) {
    throw new Error("keepsake camera registered no command");
  }
  await onRun({ values: {} });
  await settle();
  return toasts;
}

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

// Asserts the CLASSIFICATION (one toast, its level, and that each failure gets its own sentence), not the copy.
test("Keepsake Camera reports 'still developing' only when the host call ran out its deadline", { timeout: BUILD_TIMEOUT }, async () => {
  const source = await releasedMain("keepsake-camera");

  const [timedOut, unconfigured, refused, unknown] = await Promise.all([
    snapshotToasts(source, new Error(`imagery.generatePicture exceeded ${HOST_FN_DEADLINE_MS}ms host bound`), HOST_FN_DEADLINE_MS),
    snapshotToasts(source, named("ImageryNotConfiguredError", "imagery: no generateImage role is configured for this caller"), 40),
    snapshotToasts(
      source,
      named(
        "ProviderError",
        "openrouter generateImage (google/gemini-3.8-flash): No endpoints found that support the requested output modalities: text, image",
      ),
      900,
    ),
    // An unrecognized failure that came back fast is still a failure, never a postcard on its way.
    snapshotToasts(source, new Error("something else"), 40),
  ]);

  expect([timedOut, unconfigured, refused, unknown].map((toasts) => toasts.map(({ level }) => level))).toEqual([["info"], ["warn"], ["error"], ["error"]]);
  const sentences = [timedOut, unconfigured, refused, unknown].map((toasts) => toasts[0]?.message);
  expect(new Set(sentences).size).toBe(sentences.length);
});

test("Keepsake Camera never reports a painted postcard as unpainted when only the album save fails", { timeout: BUILD_TIMEOUT }, async () => {
  const source = await releasedMain("keepsake-camera");
  const [savedFailed, unknown] = await Promise.all([snapshotToasts(source, null, 40), snapshotToasts(source, new Error("something else"), 40)]);
  expect(savedFailed.map(({ level }) => level)).toEqual(["warn"]);
  // Its own sentence, never the "nothing was painted" one a real paint failure gets.
  expect(savedFailed[0]?.message).not.toBe(unknown[0]?.message);
});
