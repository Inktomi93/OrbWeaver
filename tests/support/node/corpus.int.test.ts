// @subject tests/support/node/corpus.ts
import "@orb/testkit/node/composed-real.ts";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReferentialIntegrity, closeDb, createDb, detachWal, sessions, userCredentials, users } from "@orb/db";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createCas } from "@orb/server/infra/storage/cas";
import { parseCorpusWire } from "@orb/testkit/iso/corpus.ts";
import { createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture } from "@orb/testkit/node/corpus.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/oidc-issuer.ts";
import { eq, isNotNull, sql } from "drizzle-orm";

const OWNER_PASSWORD = "synthetic-capsule-owner-password";
const PROVIDER_KEY = "synthetic-capsule-provider-key";
const CLONE_MARKER = 123;

test("a completed migrated capsule closes its real producers before cloning scrubbed independent DB and CAS bytes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-completed-corpus-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom and preserves the completed ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  const key = randomBytes(32);
  const capsule = ownership.use(
    await createCorpusCapsule({
      directory: join(parent, "capsule root"),
      server: { authConfig: { ...authConfigFromEnv(), mode: "local" }, providerFetch: execution.execute, secretBoxKey: key, temporaryParentDir: parent },
      seed: { ownerPassword: OWNER_PASSWORD, log: () => undefined },
      privateCredential: { provider: "custom-openai", key: PROVIDER_KEY, metadata: { auth: "endpoint" } },
    }),
  );
  expect(await readdir(parent)).toEqual(["capsule root"]);
  expect(capsule.privateCaptures.oidc.ownerId).toBe(capsule.privateCaptures.baseline.ownerId);
  expect(capsule.privateCaptures.recall.traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)).toBe(true);
  expect(capsule.privateCaptures.recall.memory.speakers.length).toBeGreaterThan(0);
  const source = await createDb(capsule.layout.databaseUrl);
  let sourceMarker: Awaited<ReturnType<typeof source.all>>;
  try {
    await assertReferentialIntegrity(source);
    sourceMarker = await source.all(sql`PRAGMA user_version`);
    expect((await source.select({ id: sessions.id }).from(sessions)).length).toBeGreaterThan(0);
    expect((await source.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
    expect((await source.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash))).length).toBeGreaterThan(0);
    expect((await detachWal(source)).sole).toBe(true);
  } finally {
    closeDb(source);
  }
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(parent, "stage clone")));
  const loaded = loadCorpusFixture(fixture.layout.root);
  expect(loaded.wire).toEqual(capsule.wire);
  const published = await readFile(join(fixture.layout.root, "corpus.json"), "utf8");
  const portable = parseCorpusWire(published);
  expect(portable.reads["chat.getChat"].map(({ output }) => output.id)).toEqual([
    capsule.privateCaptures.baseline.identities.soloChatId,
    capsule.privateCaptures.baseline.identities.groupChatId,
  ]);
  expect(portable.oidc?.confirmation.chatId).toBe(capsule.privateCaptures.oidc.wire.confirmation.chatId);
  expect(portable.auth.signedInMe).toEqual(capsule.wire.auth.signedInMe);
  const privateValues = [
    OWNER_PASSWORD,
    PROVIDER_KEY,
    key.toString("hex"),
    NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET,
    capsule.privateCaptures.credential.row.ciphertext,
    capsule.privateCaptures.oidc.pending.secretHash,
    ...capsule.privateCaptures.oidc.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce]),
    ...capsule.privateCaptures.oidc.ownerSessions.map((row) => row.tokenHash),
    ...capsule.privateCaptures.oidc.joinerSessions.map((row) => row.tokenHash),
  ].filter((value) => value !== null);
  expect(privateValues.some((value) => published.includes(value))).toBe(false);
  const clone = await createDb(fixture.layout.databaseUrl);
  try {
    await assertReferentialIntegrity(clone);
    expect((await clone.select({ id: sessions.id }).from(sessions)).length).toBe(0);
    expect((await clone.select({ id: userCredentials.id }).from(userCredentials)).length).toBe(0);
    expect((await clone.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash))).length).toBe(0);
    expect((await clone.select({ id: users.id }).from(users).where(eq(users.id, capsule.privateCaptures.oidc.ownerId))).length).toBe(1);
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
    expect((await unchanged.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
  } finally {
    closeDb(unchanged);
  }
  await fixture[Symbol.asyncDispose]();
  await expect(access(fixture.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  await access(capsule.layout.root);
  await capsule[Symbol.asyncDispose]();
  await expect(access(capsule.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
});
