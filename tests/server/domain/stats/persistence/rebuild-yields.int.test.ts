// A rebuild of the stats rollups reads canon in pages and leaves the event loop to the rest of the server between them:
// a library of many pages is rebuilt with no stretch of the loop held near half a second, and the rebuilt figures are
// those the library holds.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/verbs/reconcile.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const HANDLE = "long-keeper";
const SENT = "2025-07-19@12h00m01s";
// The longest hold the rest of the server waits through while one page is read and folded.
const MAX_GAP_MS = 500;
// A page larger than this holds the loop about as long as MAX_GAP_MS on a heavy library, so the rebuild must yield at
// least once per this many canon rows. The count does not move with host load, which the gap does.
const MAX_PAGE_ROWS = 1000;
// Many pages of canon, with turns about a thousand characters long, the length of a roleplay reply.
const TURNS = 12_000;
const SENTENCES_PER_TURN = 20;

function largeTranscript(): Uint8Array {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < TURNS; turn += 1) {
    const user = turn % 2 === 0;
    const text = `Turn ${String(turn)}: ${"the keeper counts the lamps on the stair. ".repeat(SENTENCES_PER_TURN)}`;
    lines.push(`{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"${text}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

test("a many-page rebuild never holds the event loop near half a second and counts every turn", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  expect(await descriptor.importFile(root.ownerId, { filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`, bytes: largeTranscript() })).toMatchObject({
    ok: true,
    created: true,
  });
  const stats = root.services.stats;

  // A chain of immediates stands for the rest of the server: a gap between two of them is time the rebuild held the
  // loop, and each page the rebuild yields after lets one of them run.
  let longestGap = 0;
  let turns = 0;
  let last = performance.now();
  let watching = true;
  const tick = (): void => {
    const now = performance.now();
    longestGap = Math.max(longestGap, now - last);
    last = now;
    turns += 1;
    if (watching) {
      setImmediate(tick);
    }
  };
  setImmediate(tick);
  const rebuilt = await stats.reconcile(root.ownerId);
  watching = false;
  longestGap = Math.max(longestGap, performance.now() - last);

  expect(rebuilt).toMatchObject({ owners: 1 });
  // Every turn lands once across the page boundaries: a skipped or repeated row at a boundary changes these counts.
  expect(await stats.overview(root.ownerId)).toMatchObject({ userTurns: TURNS / 2, assistantTurns: TURNS / 2 });
  expect(await stats.timeseries(root.ownerId)).toEqual([expect.objectContaining({ chatsCreated: 1, userTurns: TURNS / 2, assistantTurns: TURNS / 2 })]);
  expect(turns).toBeGreaterThanOrEqual(TURNS / MAX_PAGE_ROWS);
  expect(longestGap).toBeLessThan(MAX_GAP_MS);
});
