// A SillyTavern date lands as one instant on every host (D290): a zone-less form is read as UTC, by rule, a form that
// carries its zone is read as written, and an epoch number is an instant. The chat import identity hashes these
// instants, so a transcript is the same chat whatever zone the importing host runs in. The storage read is the
// subject: the case reads the instant each form landed as from its row.
// The cross-zone case spawns a real Node process in another zone that loads the composed testkit door; that wall
// time is intrinsic: slow tag.
// @subject packages/server/src/primitives/serde/chat/index.ts
// @subject packages/server/src/domain/import/substrate/chat-input.ts
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createCharacterSchema } from "@orb/contracts/character";
import { chats, createDb, messages, runMigrations } from "@orb/db";
import { hostTimeZone } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, ownFileDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { z } from "zod";

const HANDLE = "lamp-keeper";
const UNDATED_FILE = `${HANDLE}/${HANDLE} - harbor.jsonl`;
const CHILD_TIMEZONE_ENV = "TZ";
const UTC_ZONE = "UTC";
const OTHER_ZONE = "America/Boise";

// SillyTavern wire text is snake_case by spec, so the lines are raw JSON text.
function headerLine(createDate?: string): string {
  const created = createDate === undefined ? "" : `,"create_date":${JSON.stringify(createDate)}`;
  return `{"character_name":"${HANDLE}","user_name":"Nate"${created}}`;
}

function messageLine(sendDate: string | number, text = "The lamp is lit."): string {
  return `{"name":"Nate","is_user":true,"is_system":false,"mes":${JSON.stringify(text)},"send_date":${JSON.stringify(sendDate)}}`;
}

function transcript(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.join("\n"));
}

async function importTranscript(root: ServerTestHarness, filename: string, bytes: Uint8Array): Promise<unknown> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  return await descriptor.importFile(root.ownerId, { filename, bytes });
}

async function withCharacter(root: ServerTestHarness): Promise<void> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
}

// SillyTavern's send_date forms: ISO with `Z` (what it writes today), the humanised month form with one- and
// two-digit day and hour across am and pm, the `@` form, an epoch number, and an ISO date with its own offset.
const SEND_DATE_FORMS = [
  { form: "ISO with Z", sendDate: "2025-07-19T18:00:01.000Z", at: Date.UTC(2025, 6, 19, 18, 0, 1) },
  { form: "humanised, one-digit day and hour, am", sendDate: "July 9, 2025 6:05am", at: Date.UTC(2025, 6, 9, 6, 5) },
  { form: "humanised, two-digit day and hour, pm", sendDate: "July 19, 2025 11:30pm", at: Date.UTC(2025, 6, 19, 23, 30) },
  { form: "humanised midnight as 12am", sendDate: "December 31, 2024 12:00am", at: Date.UTC(2024, 11, 31, 0, 0) },
  { form: "humanised noon as 12pm", sendDate: "December 31, 2024 12:15pm", at: Date.UTC(2024, 11, 31, 12, 15) },
  // The night US clocks spring forward (2am local on 9 March 2025): read in a US host zone, the hour before and the
  // hour after would sit at different offsets and 2:30 would not exist; read as UTC, all three are plain hours.
  { form: "humanised, the hour before a daylight-saving change", sendDate: "March 9, 2025 1:30am", at: Date.UTC(2025, 2, 9, 1, 30) },
  { form: "humanised, inside a host zone's skipped hour", sendDate: "March 9, 2025 2:30am", at: Date.UTC(2025, 2, 9, 2, 30) },
  { form: "humanised, the hour after a daylight-saving change", sendDate: "March 9, 2025 3:30am", at: Date.UTC(2025, 2, 9, 3, 30) },
  { form: "the @ form with milliseconds", sendDate: "2024-7-12@01h31m37s123ms", at: Date.UTC(2024, 6, 12, 1, 31, 37) },
  { form: "an epoch-milliseconds number", sendDate: 1_752_948_001_000, at: 1_752_948_001_000 },
  { form: "ISO with a non-UTC offset", sendDate: "2025-07-19T12:00:01+02:00", at: Date.UTC(2025, 6, 19, 10, 0, 1) },
] as const;

test.for(SEND_DATE_FORMS)("a send_date in $form lands as the same instant in any host zone", async ({ sendDate, at }) => {
  await using root = await createServerHarness();
  await withCharacter(root);

  expect(await importTranscript(root, UNDATED_FILE, transcript([headerLine(), messageLine(sendDate)]))).toMatchObject({ ok: true, created: true });
  expect(await root.db.select({ at: messages.createdAt }).from(messages)).toEqual([{ at }]);
});

test("a create_date in the @ form, and a filename date, land as UTC wall clocks in any host zone", async () => {
  await using root = await createServerHarness();
  await withCharacter(root);
  const header = headerLine("2025-07-19@12h00m01s");

  await importTranscript(root, UNDATED_FILE, transcript([header, messageLine(1_752_948_001_000)]));
  await importTranscript(root, `${HANDLE}/${HANDLE} - 2023-11-11@09h41m32s538ms.jsonl`, transcript([header, messageLine(1_752_948_002_000)]));

  const landed = await root.db.select({ at: chats.createdAt }).from(chats).orderBy(chats.createdAt);
  expect(landed).toEqual([{ at: Date.UTC(2023, 10, 11, 9, 41, 32) }, { at: Date.UTC(2025, 6, 19, 12, 0, 1) }]);
});

const childOutcomeSchema = z.object({ ok: z.literal(true), created: z.boolean() });

// Re-imports the transcript into the database at `url` through the production door, in `timezone`.
async function importInZone(url: string, bytes: Uint8Array, timezone: string): Promise<z.infer<typeof childOutcomeSchema>> {
  await using lifetime = new AsyncDisposableStack();
  const source = `import { createDb } from "@orb/db";
import { createServerHarness, ownFileDb } from "@orb/testkit/node/composed";
await using held = ownFileDb(await createDb(${JSON.stringify(url)}));
await using root = await createServerHarness({ db: held.db });
const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
const bytes = Uint8Array.from(Buffer.from(${JSON.stringify(Buffer.from(bytes).toString("base64"))}, "base64"));
const outcome = await descriptor.importFile(root.ownerId, { filename: ${JSON.stringify(UNDATED_FILE)}, bytes });
process.stdout.write(JSON.stringify(outcome));`;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
    env: { [CHILD_TIMEZONE_ENV]: timezone },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = Promise.withResolvers<void>();
  const completion = Promise.withResolvers<number | null>();
  child.once("error", completion.reject);
  child.once("close", (exitCode) => {
    closed.resolve();
    completion.resolve(exitCode);
  });
  lifetime.defer(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    await closed.promise;
  });
  let output = "";
  let diagnostic = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  const code = await completion.promise;
  if (code !== 0) {
    throw new Error(`the import child failed: ${diagnostic}`);
  }
  return childOutcomeSchema.parse(JSON.parse(output));
}

test("a transcript imported in one zone and imported again in another is held, and adds no room", { tags: "slow" }, async () => {
  await using resources = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "import-st-dates-"));
  resources.defer(() => rm(directory, { recursive: true, force: true }));
  const url = pathToFileURL(join(directory, "orbweaver.db")).href;
  // Every zone-less form at once, so the re-import meets each one in the other zone.
  const bytes = transcript([
    headerLine("2025-07-19@12h00m01s"),
    ...SEND_DATE_FORMS.map(({ sendDate }, turn) => messageLine(sendDate, `Turn ${String(turn)}.`)),
  ]);
  {
    await using held = ownFileDb(await createDb(url));
    await runMigrations(held.db, SHIPPED_MIGRATIONS);
    await using root = await createServerHarness({ db: held.db });
    await withCharacter(root);
    expect(await importTranscript(root, UNDATED_FILE, bytes)).toMatchObject({ ok: true, created: true });
  }

  const otherZone = hostTimeZone() === UTC_ZONE ? OTHER_ZONE : UTC_ZONE;
  expect(await importInZone(url, bytes, otherZone)).toEqual({ ok: true, created: false });

  await using held = ownFileDb(await createDb(url));
  expect(await held.db.select({ id: chats.id }).from(chats)).toHaveLength(1);
});
