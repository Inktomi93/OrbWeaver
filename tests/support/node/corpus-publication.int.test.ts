// @subject tests/support/iso/corpus.ts
// @subject tests/support/node/corpus-seed.ts
import "@orb/testkit/node/composed-real.ts";
import { randomBytes } from "node:crypto";
import { createCharacterSchema } from "@orb/contracts/character";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import type { CorpusWire } from "@orb/testkit/iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "@orb/testkit/iso/corpus.ts";
import { captureCookieAuth, captureCorpusReads } from "@orb/testkit/node/corpus-seed.ts";
import { seedUserCredential } from "@orb/testkit/node/factories/credentials.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const PRIVATE_KEY = 'native-publication-"credential"\\959';
const OWNER_PASSWORD = "native-publication-owner-password";

async function publication(root: ServerTestHarness): Promise<CorpusWire> {
  const owner = await root.principalFor(root.ownerId);
  const authentication = await captureCookieAuth(root, owner, OWNER_PASSWORD);
  const caller = await root.internalCallerFor(root.ownerId);
  const solo = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const group = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const document = await caller.databank.createFromText({ name: "Publication witness", text: "The native publication remains intact." });
  const reads = await captureCorpusReads(root, { soloChatId: solo.chat.id, groupChatId: group.chat.id, documentId: document.document.id });
  const health = healthResponseSchema.parse(await (await root.http.request("/healthz")).json());
  return hydrateCorpusWire({ auth: authentication.auth, reads, health });
}

test("schema-valid raw and JSON-escaped credential echoes from real card writers refuse portable publication", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "publication-card", name: "Public witness", description: "A native public witness." }),
  });
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(wire, secrets))).toEqual(wire);
  for (const name of [PRIVATE_KEY, JSON.stringify(PRIVATE_KEY), JSON.stringify({ echo: PRIVATE_KEY })]) {
    await caller.character.update({ characterId: card.id, input: { name } });
    const input = undefined;
    const output = await caller.character.list(input);
    expect(output.items.find((item) => item.id === card.id)?.name).toBe(name);
    const captured = { ...wire, reads: { ...wire.reads, "character.list": [{ input, output }] } };
    expect(() => serializeCorpusWire(captured, secrets)).toThrow("Corpus publication contains private material");
    expect(captured.reads["character.list"][0]?.output).toEqual(output);
  }
});

test("a real document credential echo refuses while a clean sibling retains exact captured requests", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD];
  const publicBytes = serializeCorpusWire(wire, secrets);
  const parsed = parseCorpusWire(publicBytes);
  expect(parsed).toEqual(wire);
  expect(parsed.reads["settings.getUserSettings"][0]?.input).toBeUndefined();
  expect(Object.hasOwn(parsed, "secrets")).toBe(false);
  const document = await caller.databank.createFromText({ name: "Private document witness", text: PRIVATE_KEY });
  const input = { id: document.document.id, includeText: true };
  const output = await caller.databank.get(input);
  expect(output.extractedText).toBe(PRIVATE_KEY);
  expect(() => serializeCorpusWire({ ...wire, reads: { ...wire.reads, "databank.get": [{ input, output }] } }, secrets)).toThrow(
    "Corpus publication contains private material",
  );
  const listed = { input: { cursor: null }, output: await caller.databank.list({ cursor: null }) };
  expect(() => serializeCorpusWire({ ...wire, reads: { ...wire.reads, "databank.list": [listed] } }, secrets)).toThrow(
    "Corpus request does not match its publication recipe",
  );
  // Malformed decoded input bypasses the typed call; null must not select an absent-input recipe.
  const malformed = {
    ...wire,
    reads: { ...wire.reads, "settings.getUserSettings": wire.reads["settings.getUserSettings"].map((capture) => ({ input: null, output: capture.output })) },
  };
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [malformed, secrets])).toThrow("Corpus request does not match its publication recipe");
  expect(serializeCorpusWire(wire, secrets)).toBe(publicBytes);
});

test("known native credential values cannot escape through malformed publication diagnostics", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD];
  const clean = serializeCorpusWire(wire, secrets);
  // Malformed decoded captures can reach publication without passing the typed producer API.
  for (const health of [
    { ...wire.health, [PRIVATE_KEY]: true },
    { ...wire.health, status: PRIVATE_KEY },
  ]) {
    let diagnostic = "";
    try {
      Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health }, secrets]);
    } catch (error) {
      diagnostic = String(error);
    }
    expect(diagnostic).toBe("Error: Corpus publication contains private material");
    expect(diagnostic).not.toContain(PRIVATE_KEY);
    expect(diagnostic).not.toContain(JSON.stringify(PRIVATE_KEY).slice(1, -1));
  }
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health: { ...wire.health, publicExtra: true } }, secrets])).toThrow(
    "Unrecognized key",
  );
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health: { ...wire.health, status: "invalid-public-status" } }, secrets])).toThrow(
    "Invalid discriminator value",
  );
  expect(serializeCorpusWire(wire, secrets)).toBe(clean);
});
