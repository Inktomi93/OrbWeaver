// The regex write door (D53): a verb that stores a find pattern measures its compile once, off the event loop, and
// refuses one that costs more than the door admits, naming the script, its measured cost and the limit. A
// compile-heavy pattern within the stored length cap is the refused case; an ordinary panel pattern beside it is the
// positive control. A burst of saves shares a fixed number of probe workers. The lifts' door is `tests/server/domain/import/persistence/preset-regex-shapes.int.test.ts`.
// @subject packages/server/src/primitives/regex/compile-probe.ts
// @subject packages/server/src/domain/regex/substrate/find-door.ts
// @subject packages/server/src/domain/regex/persistence/portability-write.ts
import process from "node:process";
import type { Worker } from "node:worker_threads";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { MAX_FIND_REGEX_LENGTH } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { FIND_COMPILE_LIMIT_MS, PROBE_WORKER_NAME, PROBE_WORKERS_AT_ONCE } from "#server/primitives/regex/compile-probe.ts";

// The save pass over replies.
const AXES = { targets: ["AI_OUTPUT"], passes: ["save"] } as const;
const UNIT = "(a|b)";
const HEAD = "lamp";
// Capture groups of alternation up to the stored length cap: V8 spends most of a second compiling it, and no
// timeout can cut a compile. It is storable by length, so only the door's measurement refuses it.
const COMPILE_HEAVY = `${UNIT.repeat(Math.floor((MAX_FIND_REGEX_LENGTH - HEAD.length) / UNIT.length))}${HEAD}`;
// The shape of a real HUD panel's find: tags around lazy captures.
const PANEL = "/<hud>\\s*\\[Time: ([^\\]]*?)\\]\\s*([\\s\\S]*?)<\\/hud>/g";

function scriptInput(name: string, findRegex: string): ReturnType<typeof createRegexScriptSchema.parse> {
  return createRegexScriptSchema.parse({ name, findRegex, replaceString: "x", targets: [...AXES.targets], passes: [...AXES.passes] });
}

const REFUSAL = new RegExp(`^script "heavy" not saved: its find pattern costs \\d+ ms to compile and first run, over the ${FIND_COMPILE_LIMIT_MS} ms limit$`);

test("create stores a panel pattern and refuses a compile-heavy one by name, its cost and the limit", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);

  await expect(caller.regex.createScript({ input: scriptInput("panel", PANEL) })).resolves.toMatchObject({ name: "panel", findRegex: PANEL });
  await expect(caller.regex.createScript({ input: scriptInput("heavy", COMPILE_HEAVY) })).rejects.toMatchObject({
    cause: { message: expect.stringMatching(REFUSAL) },
  });

  expect((await caller.regex.listScripts()).map((script) => script.name)).toEqual(["panel"]);
});

test("a burst of saves runs a fixed number of probe workers at once and every save gets its verdict", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // The probe's own thread name picks its workers out of any other worker the process starts meanwhile.
  let live = 0;
  let peak = 0;
  let started = 0;
  const onWorker = (worker: Worker): void => {
    if (worker.threadName !== PROBE_WORKER_NAME) {
      return;
    }
    started += 1;
    live += 1;
    peak = Math.max(peak, live);
    worker.once("exit", () => {
      live -= 1;
    });
  };
  process.on("worker", onWorker);
  try {
    const panels = Array.from({ length: PROBE_WORKERS_AT_ONCE * 3 }, (_, index) => `panel-${String(index)}`);
    const saves = await Promise.allSettled([
      caller.regex.createScript({ input: scriptInput("heavy", COMPILE_HEAVY) }),
      ...panels.map((name) => caller.regex.createScript({ input: scriptInput(name, PANEL) })),
    ]);

    expect(saves[0]).toMatchObject({ status: "rejected", reason: { cause: { message: expect.stringMatching(REFUSAL) } } });
    expect(saves.slice(1).map((save) => save.status)).toEqual(panels.map(() => "fulfilled"));
    expect(started).toBe(panels.length + 1);
    expect(peak).toBe(PROBE_WORKERS_AT_ONCE);
    expect((await caller.regex.listScripts()).map((script) => script.name).toSorted()).toEqual(panels.toSorted());
  } finally {
    process.off("worker", onWorker);
  }
});

test("update refuses a compile-heavy find and leaves the stored script as it was", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const stored = await caller.regex.createScript({ input: scriptInput("heavy", PANEL) });

  await expect(caller.regex.updateScript({ scriptId: stored.id, input: { findRegex: COMPILE_HEAVY } })).rejects.toMatchObject({
    cause: { message: expect.stringMatching(REFUSAL) },
  });

  expect((await caller.regex.listScripts()).map((script) => script.findRegex)).toEqual([PANEL]);
});

test("a portable regex file with a compile-heavy find is refused by name; a panel file lands", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  const descriptor = root.app.portability.find((entity) => entity.kind === "regex");
  if (descriptor === undefined) {
    throw new Error("the production graph has no regex portability descriptor");
  }
  const file = (name: string, findRegex: string): { filename: string; bytes: Uint8Array } => ({
    filename: `${name}.json`,
    // A raw SillyTavern regex export: the file door reads that dialect too.
    bytes: new TextEncoder().encode(JSON.stringify({ id: name, scriptName: name, findRegex, replaceString: "x", placement: [2], disabled: false })),
  });

  await descriptor.importFile(root.ownerId, file("panel", PANEL));
  const refused = await descriptor.importFile(root.ownerId, file("heavy", COMPILE_HEAVY));

  expect(JSON.stringify(refused)).toMatch(/script \\"heavy\\" not imported: its find pattern costs \d+ ms to compile and first run/);
  const caller = await root.internalCallerFor(root.ownerId);
  expect((await caller.regex.listScripts()).map((script) => script.name)).toEqual(["panel"]);
});
