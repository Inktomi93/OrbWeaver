// scripts/probes/rpg-drive — the RPG headless DRIVE KIT (R-OBS piece 2; dev tooling, the KISS carve-out). Boots
// the REAL composed service graph with the flight recorder ON (`rpgTrace: true`) over the `pnpm seed:demo` db,
// creates a LITE game on a fresh chat through the REAL verbs, drives a scripted lite turn (scene write → dice
// roll → swipe/abort) against the REAL engine, and ASSERTS on the recorder's per-turn trace stream. A poor-man's
// differential oracle for agent playtests: "did the engine do what I scripted, and is it observable?"
//
// WHY lite + the direct tool-path verbs (not a model-driven `send`): pre-U0 the capability-synthesis hop is
// unbuilt, so `createGame` refuses every FULL game (10 §RC-A) — lite soft-gates and is the drivable mode today
// (the queue row's "agent playtests of lite v1"). The tool DISPATCHER trace (a model-emitted tool call through
// the recurse loop) is proven by tests/server/domain/rpg/tools + trace-instrumentation.int; this kit drives the
// owning VERBS directly, so it exercises + asserts the STAGING + BUS half of the recorder over the LIVE graph.
//
// DEV-ONLY (structurally): refuses NODE_ENV=production. Reads the db `DATABASE_URL` points at (run `pnpm
// seed:demo` first). snap --isolated-compatible: hermetic (its own chat + game; no shared fixture state), and a
// throwaway db copy under DATABASE_URL keeps it repeatable. Run: `pnpm tsx scripts/probes/rpg-drive.ts`.

import { dirname, join } from "node:path";
import process from "node:process";
import type { Principal } from "@orb/contracts/identity";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import { characters, createDb, preCloseHousekeeping, users } from "@orb/db";
import type { CharacterId, ChatId, ChatTurnId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RpgTraceRecord } from "@orb/server/domain/rpg";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { eq } from "drizzle-orm";

const DRIVE_SESSION_SECRET = "orbweaver-rpg-drive-session-secret-do-not-ship";
const TURN_ID = castId<ChatTurnId>("chatturn_rpgdrive000000000001");

/** Throw with a clear message on a failed drive assertion (a non-zero exit for a CI/agent harness). */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`rpg-drive assertion failed: ${message}`);
  }
}

/** The owner + one of its characters — the host + the chat's founding cast (seeded by `pnpm seed:demo`). */
async function resolveSeededActors(db: Awaited<ReturnType<typeof createDb>>): Promise<{ owner: Principal; characterId: CharacterId }> {
  const ownerRows = await db.select({ id: users.id, handle: users.handle }).from(users).where(eq(users.role, "owner")).limit(1);
  const ownerRow = ownerRows[0];
  if (ownerRow === undefined) {
    throw new Error("rpg-drive: no owner user — run `pnpm seed:demo` first");
  }
  const owner: Principal = { userId: castId<UserId>(ownerRow.id), role: "owner", handle: castId<Handle>(ownerRow.handle), externalId: null, via: "fallback" };
  const charRows = await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, owner.userId)).limit(1);
  const charRow = charRows[0];
  if (charRow === undefined) {
    throw new Error("rpg-drive: the owner has no characters — run `pnpm seed:demo` first");
  }
  return { owner, characterId: castId<CharacterId>(charRow.id) };
}

/** A one-line phase histogram of a trace slice. */
function summarize(records: readonly RpgTraceRecord[]): string {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.event.phase, (counts.get(record.event.phase) ?? 0) + 1);
  }
  return [...counts.entries()].map(([phase, n]) => `${phase}×${n}`).join(" ");
}

async function main(): Promise<void> {
  const log = (msg: string): void => {
    process.stdout.write(`[rpg-drive] ${msg}\n`);
  };
  if (env.NODE_ENV === "production") {
    process.stderr.write("[rpg-drive] REFUSING: NODE_ENV=production — this is dev tooling.\n");
    process.exitCode = 1;
    return;
  }

  const now = (): number => Date.now();
  const db = await createDb(env.DATABASE_URL);
  const { owner, characterId } = await resolveSeededActors(db);

  const built = await createServices({
    db,
    now,
    ownerId: owner.userId,
    secretBoxKey: null,
    casDir: env.ASSETS_DIR,
    variantDir: join(dirname(env.ASSETS_DIR), "variants"),
    sessionSecret: env.SESSION_SECRET ?? DRIVE_SESSION_SECRET,
    vllmDisabled: true,
    repoRoot: process.cwd(),
    holder: "rpg-drive",
    rpgTrace: true,
  });
  const recorder = built.rpgTrace;
  assert(recorder !== null, "the flight recorder is wired (rpgTrace: true)");
  if (recorder === null) {
    return;
  }
  const { rpg, chat } = built.services;

  // create-game: a fresh chat becomes a LITE table (soft capability arm — no tool-capable model required).
  const started = await chat.startChat({ principal: owner, characterIds: [characterId], opening: "first-message", title: "RPG drive (lite)" });
  const chatId: ChatId = started.chat.id;
  const config = rpgGameConfigSchema.parse({ genres: ["Fantasy"], tones: ["Heroic"], difficulty: "normal", rating: "sfw", gm: { kind: "standalone" } });
  await rpg.createGame({ caller: owner, chatId, config, mode: "lite" });
  log(`created a lite game on chat ${chatId}`);

  // send/roll: drive the lite tool-path verbs directly (the model-driven dispatcher path is proven by the int
  // tests) — a scene write stages + emits a bus event, a dice roll is a pure server roll.
  await rpg.patchSnapshot({ caller: owner, chatId, turnId: TURN_ID, location: "The Sunken Crypt", recentEvent: "The party descends the black stair." });
  const roll = await rpg.rollDice({ caller: owner, chatId, notation: "2d6" });
  log(`rolled 2d6 → ${roll.total}`);

  // swipe: abort the turn — the staging clears (a swiped scene write never sticks) and the recorder logs it.
  await rpg.onTurnAborted(chatId, TURN_ID, "user");

  // Assert on the traces: the live-composed recorder captured this turn's staging lifecycle + bus emits.
  const chatTrace = recorder.recent({ chatId });
  const turnTrace = recorder.recent({ turnId: TURN_ID });
  log(`recorder(chat)  ${chatTrace.length} events — ${summarize(chatTrace)}`);
  log(`recorder(turn)  ${turnTrace.length} events — ${summarize(turnTrace)}`);

  assert(
    chatTrace.some((r) => r.event.phase === "bus"),
    "createGame's bus emit was teed into the trace over the LIVE composed graph",
  );
  assert(
    turnTrace.some((r) => r.event.phase === "staging" && r.event.op === "begin"),
    "the staging accumulator marked the turn (begin), captured in the trace",
  );
  assert(
    turnTrace.some((r) => r.event.phase === "staging" && r.event.op === "set-state"),
    "the scene write staged snapshot state (set-state), captured in the trace",
  );
  assert(
    turnTrace.some((r) => r.event.phase === "staging" && r.event.op === "clear"),
    "the swipe cleared the turn's staging (abort), captured in the trace",
  );

  log("DRIVE OK — the live-composed flight recorder captured the scripted lite turn's engine effects.");
  await preCloseHousekeeping(db);
}

main().catch((err: unknown) => {
  process.stderr.write(`[rpg-drive] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
});
