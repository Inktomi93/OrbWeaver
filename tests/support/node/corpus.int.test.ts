// @subject tests/support/node/corpus.ts
// The capsule's own claim on the clone-boundary producer set: real producers close before a scrubbed, independent DB and CAS clone. Per-producer facts live in their suites: corpus-auth, -chat-imagery, -connection, -image-variants, -knowledge, -knowledge-variants, -library-clone, -library-views, -notifications, -plugin, -rpg, -rpg-flight, -rpg-provider, -sdk-sessions, -search, -search-publication, -stats-settings.
// The native clone's module graph belongs to import time, not the case's execution budget.
import "@orb/tooling/snap";
import { access, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createCharacterSchema } from "@orb/contracts/character";
import {
  assertReferentialIntegrity,
  chatHandoffResumptions,
  chatLocks,
  closeDb,
  createDb,
  detachWal,
  messages,
  pendingTurns,
  sessions,
  userCredentials,
  users,
} from "@orb/db";
import { createCas } from "@orb/server/infra/storage/cas";
import { eq, isNotNull, sql } from "drizzle-orm";
import { parseCorpusWire } from "../iso/corpus.ts";
import { createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture } from "./corpus.ts";
import { createCorpusRecipe, CORPUS_OWNER_PASSWORD as OWNER_PASSWORD, CORPUS_PROVIDER_KEY as PROVIDER_KEY } from "./corpus-recipe.ts";
import { seedUserCredential } from "./factories/credentials.ts";
import { expect, test } from "./fixtures.ts";
import { NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
import { createServerHarness } from "./server.ts";

const CLONE_MARKER = 123;

/** Descriptors this process still holds under `root`. /proc is Linux-only, so other platforms report none. */
async function openDescriptorsUnder(root: string): Promise<string[]> {
  if (process.platform !== "linux") {
    return [];
  }
  const ownedRoot = await realpath(root);
  const targets = await Promise.all(
    (await readdir("/proc/self/fd")).map(async (descriptor) => {
      try {
        return await readlink(`/proc/self/fd/${descriptor}`);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    }),
  );
  return targets.filter((path): path is string => path?.startsWith(`${ownedRoot}/`) === true);
}

// Alone the small capsule takes 3 to 4.4 s, but inside the four-worker testkit run it crossed the 5 s default.
test("a completed migrated capsule closes its real producers before cloning scrubbed independent DB and CAS bytes", { tags: ["slow"] }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-completed-corpus-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const { options, key, clock, ids } = await createCorpusRecipe(parent);
  const capsule = ownership.use(
    await createCorpusCapsule({
      directory: join(parent, "capsule root"),
      ...options,
      producers: "clone-boundary",
    }),
  );
  expect(capsule.replay).toEqual({ version: 1, nowMs: clock.now(), idCursor: ids.snapshot() });
  expect(await readdir(parent)).toEqual(["capsule root"]);
  // Closed producers: no descriptor, lock, pending turn or handoff outlives the capsule, and its WAL detaches alone.
  // The positive control: the lifecycle producer really held its room's lock while its turn ran.
  const held = capsule.privateCaptures.chatLifecycle.held;
  expect(held.during?.locks.map((row) => row.chatId)).toEqual([held.room.chat.id]);
  expect(await openDescriptorsUnder(capsule.layout.root)).toEqual([]);
  const source = await createDb(capsule.layout.databaseUrl);
  let sourceMarker: Awaited<ReturnType<typeof source.all>>;
  let sourceMessages: (typeof messages.$inferSelect)[];
  let sourceUsers: (typeof users.$inferSelect)[];
  let sourceSessions: (typeof sessions.$inferSelect)[];
  try {
    await assertReferentialIntegrity(source);
    sourceMarker = await source.all(sql`PRAGMA user_version`);
    sourceMessages = await source.select().from(messages).orderBy(messages.id);
    sourceUsers = await source.select().from(users).orderBy(users.id);
    sourceSessions = await source.select().from(sessions).orderBy(sessions.id);
    expect(sourceMessages.length).toBeGreaterThan(0);
    expect(sourceSessions.length).toBeGreaterThan(0);
    expect((await source.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
    expect(sourceUsers.some((row) => row.passwordHash !== null)).toBe(true);
    expect(await source.select().from(chatLocks)).toEqual([]);
    expect(await source.select().from(pendingTurns)).toEqual([]);
    expect(await source.select().from(chatHandoffResumptions)).toEqual([]);
    expect((await detachWal(source)).sole).toBe(true);
  } finally {
    closeDb(source);
  }
  {
    await using echoRoot = await createServerHarness({ secretBoxKey: key });
    const principal = await echoRoot.principalFor(echoRoot.ownerId);
    await seedUserCredential(echoRoot, { principal, provider: "custom-openai", key: PROVIDER_KEY });
    const caller = await echoRoot.internalCallerFor(echoRoot.ownerId);
    const card = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "publication-echo", name: PROVIDER_KEY, description: "A publication boundary witness." }),
    });
    const output = await caller.character.list(undefined);
    expect(output.items.find((item) => item.id === card.id)?.name).toBe(PROVIDER_KEY);
    const original = capsule.wire.reads["character.list"];
    const rejected = join(parent, "refused clone");
    try {
      // Intervene only at publication with genuine routed bytes; the captured source graph remains untouched.
      Object.assign(capsule.wire.reads, { "character.list": [{ input: undefined, output }] });
      expect(() => capsule.publishWire()).toThrow("Corpus publication contains private material");
      await expect(prepareCorpusFixture(capsule, rejected)).rejects.toThrow("Corpus publication contains private material");
      await expect(access(rejected)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      Object.assign(capsule.wire.reads, { "character.list": original });
    }
  }
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(parent, "stage clone")));
  const loaded = loadCorpusFixture(fixture.layout.root);
  expect(loaded.wire).toEqual(capsule.wire);
  const published = await readFile(join(fixture.layout.root, "corpus.json"), "utf8");
  expect(capsule.publishWire()).toBe(published);
  expect(parseCorpusWire(published)).toEqual(loaded.wire);
  // Built from the captures, not from the refusal list `publishWire` already checks, so a secret dropped from that list fails here.
  const { credential, oidc, chatLifecycle } = capsule.privateCaptures;
  const privateValues = [
    OWNER_PASSWORD,
    PROVIDER_KEY,
    key.toString("hex"),
    NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET,
    credential.row.ciphertext,
    credential.row.iv,
    credential.row.tag,
    oidc.pending.secretHash,
    ...oidc.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce]),
    ...[...oidc.ownerSessions, ...oidc.joinerSessions].map((row) => row.tokenHash),
    ...[chatLifecycle.held, chatLifecycle.aborted, chatLifecycle.handoff].map(({ invite }) => invite.tokenHash),
  ].filter((value) => value !== null);
  expect(privateValues.filter((value) => published.includes(value))).toEqual([]);
  const clone = await createDb(fixture.layout.databaseUrl);
  try {
    await assertReferentialIntegrity(clone);
    expect(await clone.select().from(messages).orderBy(messages.id)).toEqual(sourceMessages);
    // Scrubbed: the clone carries no credential, session or password hash, and keeps the owner's row.
    expect(await clone.select({ id: sessions.id }).from(sessions)).toEqual([]);
    expect(await clone.select({ id: userCredentials.id }).from(userCredentials)).toEqual([]);
    expect(await clone.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash))).toEqual([]);
    expect(await clone.select({ id: users.id }).from(users).where(eq(users.id, capsule.privateCaptures.oidc.ownerId))).toHaveLength(1);
    // A physical clone control changes metadata only; it never fabricates domain canon or another graph.
    await clone.run(sql.raw(`PRAGMA user_version = ${CLONE_MARKER}`));
    expect(await clone.all(sql`PRAGMA user_version`)).not.toEqual(sourceMarker);
  } finally {
    closeDb(clone);
  }
  const ownerId = capsule.privateCaptures.baseline.ownerId;
  const hash = capsule.privateCaptures.libraries.asset.hash;
  const sourceCas = createCas(capsule.layout.assets);
  const cloneCas = createCas(fixture.layout.assets);
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  expect(await cloneCas.read(ownerId, hash)).toEqual(await sourceCas.read(ownerId, hash));
  await cloneCas.remove(ownerId, hash);
  expect(await cloneCas.exists(ownerId, hash)).toBe(false);
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  const unchanged = await createDb(capsule.layout.databaseUrl);
  try {
    expect(await unchanged.all(sql`PRAGMA user_version`)).toEqual(sourceMarker);
    expect(await unchanged.select().from(users).orderBy(users.id)).toEqual(sourceUsers);
    expect(await unchanged.select().from(sessions).orderBy(sessions.id)).toEqual(sourceSessions);
  } finally {
    closeDb(unchanged);
  }
  await fixture[Symbol.asyncDispose]();
  await expect(access(fixture.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  await access(capsule.layout.root);
  await capsule[Symbol.asyncDispose]();
  await expect(access(capsule.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
});
