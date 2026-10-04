// Regenerate only shipped card and avatar vectors through the production runtime and card projection.
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILT_IN_EMBED_DIMS } from "@orb/contracts/inference";
import { APP_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { createDb, runMigrations, settings } from "@orb/db";
import { readSeedAvatar } from "@orb/default-content";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildCardEmbedText, DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "@orb/server/entry/compose";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "packages/default-content/embeddings.json");
const scratch = await mkdtemp(join(tmpdir(), "orb-seed-vectors-"));
// Native database extensions may create sidecars relative to cwd; keep them inside the disposable run.
process.chdir(scratch);
const db = await createDb(pathToFileURL(join(scratch, "seed.sqlite")).href);
await runMigrations(db, join(root, "packages/db/src/migrations"));
await db.insert(settings).values({ key: "app", value: { corpusAutoindex: false, schemaVersion: APP_SETTINGS_SCHEMA_VERSION }, updatedAt: Date.now() });
const built = await createServices({
  db,
  now: Date.now,
  ownerId: undefined,
  secretBoxKey: null,
  sessionSecret: null,
  casDir: join(scratch, "cas"),
  variantDir: join(scratch, "variants"),
  serverRestart: UNSUPERVISED_RESTART,
  share: NO_SHARE_RELAY,
  providerSeams: { localLight: { cacheDir: process.argv[2], device: "cpu", embedDtype: "q8", allowRemoteModels: false } },
});
const rows: { kind: string; source: string; hash: string; model: string; dim: number; vector: number[] }[] = [];
const hash = (content: string | Uint8Array): string => createHash("sha256").update(content).digest("hex");
function add(
  kind: string,
  source: string,
  content: string | Uint8Array,
  result: { readonly model: string; readonly vectors: readonly (Float32Array | null)[] },
): void {
  const vector = result.vectors[0];
  if (vector === null || vector === undefined || vector.length !== BUILT_IN_EMBED_DIMS || !vector.every(Number.isFinite)) {
    throw new Error(`No complete seed vector for ${source}`);
  }
  rows.push({ kind, source, hash: hash(content), model: result.model, dim: vector.length, vector: [...vector] });
  process.stdout.write(`${kind} ${source} ${result.model} ${vector.length}\n`);
}
try {
  const ownerId = await built.sessions.ensureUser(castId<Handle>("seed-vector-author"));
  const roles = await built.roleClientsFor(ownerId);
  const encoder = await roles.resolved("embed");
  const user = await built.sessions.loadUserById(ownerId);
  if (encoder === null || user === null) {
    throw new Error("The isolated seed account has no local encoder");
  }
  await built.services.connection.setBinding({
    principal: { ...user, userId: ownerId, via: "fallback" },
    task: "imageEmbed",
    connectionId: encoder.connectionId,
  });
  for (const card of DEFAULT_CHARACTER_CARDS) {
    const text = buildCardEmbedText({
      name: card.input.name,
      description: card.input.description ?? null,
      personality: card.input.personality ?? null,
      scenario: card.input.scenario ?? null,
      greetings: card.input.greetings ?? [],
    });
    add("card-text", card.input.handle, text, await roles.embed(text));
  }
  const avatars = [...DEFAULT_CHARACTER_CARDS.map((card) => card.input.handle), castId<CharacterHandle>("persona-you")];
  for (const handle of avatars) {
    const avatar = await readSeedAvatar(handle);
    if (avatar === null) {
      throw new Error(`Missing shipped avatar ${handle}`);
    }
    add("image-raw", handle, avatar.bytes, await roles.imageEmbed({ kind: "image", input: avatar.bytes }));
  }
  await writeFile(output, `${JSON.stringify(rows)}\n`);
  process.stdout.write(`Wrote ${rows.length} vectors to ${output}\n`);
} finally {
  await built.runtime.localLight.close();
  await rm(scratch, { recursive: true, force: true });
}
