// Real admission, funded imagery and native cookie routes author this private output family; capture never writes canon.
import { createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import { extractedPromptSchema, generatedPictureSchema, generationProvenanceSchema } from "@orb/contracts/imagery";
import { assets, imageryGenerations } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { readSessionCookie } from "@orb/server/entry/auth";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { seedCorpusAccount } from "./corpus-auth.ts";
import type { CorpusImageWire } from "./corpus-image-wire.ts";
import { CORPUS_VARIANT_EDIT_MODEL, CORPUS_VARIANT_IMAGE_MODEL, CORPUS_VARIANT_KEY, CORPUS_VARIANT_TEXT_MODEL } from "./corpus-image-wire.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import type { TrpcCapture } from "./corpus-read.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { seedUserConnectionRows } from "./factories/rows/connection.ts";
import { seedUserCredential } from "./factories/rows/credentials.ts";
import { seedIndexedAsset } from "./factories/rows/embedding-generation.ts";
import { captureImageryGenerationRows, seedImageryGenerations } from "./factories/rows/imagery.ts";
import type { TrpcInput, TrpcProcedurePath } from "./route-trpc.ts";
import type { ServerTestHarness } from "./server.ts";

const CORPUS_VARIANT_PASSWORD = "synthetic-image-variant-reader-password";
export const CORPUS_VARIANT_FREE_PROMPT = "A private native free-picture witness.";
export const CORPUS_VARIANT_OVERRIDE = "A literal avatar-reference portrait witness.";
export const CORPUS_VARIANT_EDIT_INSTRUCTION = "Turn the native traveller's coat green.";
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Cohort = Awaited<ReturnType<typeof seedImageryGenerations>>;
interface NativeAuth {
  readonly origin: string;
  readonly cookie: string;
  readonly token: NonNullable<ReturnType<typeof readSessionCookie>>;
}
interface Effects {
  readonly assets: readonly (typeof assets.$inferSelect)[];
  readonly generations: readonly (typeof imageryGenerations.$inferSelect)[];
  readonly posts: readonly string[];
}
interface CorpusImageVariants {
  readonly bindings: {
    readonly before: Awaited<ReturnType<Caller["connection"]["listBindings"]>>;
    readonly after: Awaited<ReturnType<Caller["connection"]["listBindings"]>>;
  };
  readonly credential: Awaited<ReturnType<typeof seedUserCredential>>;
  readonly connections: readonly Awaited<ReturnType<typeof seedUserConnectionRows>>[];
  readonly ownerId: ServerTestHarness["ownerId"];
  readonly memberId: ServerTestHarness["ownerId"];
  readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly skips: readonly {
    readonly asset: typeof assets.$inferSelect;
    readonly first: Awaited<ReturnType<typeof seedIndexedAsset>>;
    readonly repeated: Awaited<ReturnType<typeof seedIndexedAsset>>;
    readonly forced: Awaited<ReturnType<typeof seedIndexedAsset>>;
  }[];
  readonly skipPostsBefore: readonly string[];
  readonly skipPostsAfter: readonly string[];
  readonly previews: {
    readonly extracted: TrpcCapture<"imagery.extractPrompt">;
    readonly captioned: TrpcCapture<"imagery.extractPrompt">;
  };
  readonly free: Cohort;
  readonly captioned: Cohort;
  readonly warning: Cohort;
  readonly edited: {
    readonly read: TrpcCapture<"imagery.editImage">;
    readonly picture: z.output<typeof generatedPictureSchema>;
    readonly generations: Cohort["generations"];
  };
  readonly provenance: readonly TrpcCapture<"imagery.readProvenance">[];
  readonly nullProvenance: readonly TrpcCapture<"imagery.readProvenance">[];
  readonly refusals: readonly { readonly status: number; readonly code: string; readonly message: string }[];
  readonly beforeRefusals: Effects;
  readonly afterRefusals: Effects;
  readonly rows: Cohort["generations"];
  readonly assetRows: readonly (typeof assets.$inferSelect)[];
  readonly physical: { readonly images: CorpusImageWire["images"]; readonly captions: CorpusImageWire["captions"]; readonly remaining: number };
  readonly secrets: readonly string[];
}

async function login(root: ServerTestHarness, handle: Handle, password: string, origin: string): Promise<NativeAuth> {
  const response = await fetch(new URL("/api/auth/login", origin), {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle, password }),
  });
  await response.arrayBuffer();
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (response.status !== 200 || cookie === undefined) {
    throw new Error(`native image variant login did not supply its real cookie (${response.status})`);
  }
  const token = readSessionCookie(new Headers({ cookie }), "http");
  if (token === null) {
    throw new Error("native image variant login lost its canonical token");
  }
  const admitted = await fetch(new URL("/api/trpc/sessions.me", origin), { headers: { cookie } });
  const viewer = await output(admitted, viewerViewSchema);
  if (viewer.handle !== handle) {
    throw new Error("native image variant cookie admitted a different row principal");
  }
  await root.settleBackground();
  return { origin, cookie, token };
}

async function request<P extends TrpcProcedurePath>(auth: NativeAuth, path: P, input: TrpcInput<P>, mutation: boolean): Promise<Response> {
  const url = new URL(`/api/trpc/${path}`, auth.origin);
  if (!mutation) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  return await fetch(url, {
    method: mutation ? "POST" : "GET",
    headers: { cookie: auth.cookie, [CSRF_HEADER]: "1", "content-type": "application/json" },
    ...(mutation ? { body: JSON.stringify(input) } : {}),
  });
}

async function output<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
  if (!response.ok) {
    throw new Error(`native image variant operation refused (${response.status})`, { cause: await response.json() });
  }
  const envelope = z.object({ result: z.object({ data: z.json() }) }).parse(await response.json());
  return schema.parse(envelope.result.data);
}

async function provenance(auth: NativeAuth, assetId: TrpcInput<"imagery.readProvenance">["assetId"]): Promise<TrpcCapture<"imagery.readProvenance">> {
  const input = { assetId };
  return { input, output: await output(await request(auth, "imagery.readProvenance", input, false), generationProvenanceSchema.nullable()) };
}

/** The same production root resolves every role, reads owned sources, stores bytes and gates native reads. */
export async function seedCorpusImageVariants(root: ServerTestHarness, wire: CorpusImageWire, ownerPassword: string): Promise<CorpusImageVariants> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const previous = await caller.connection.listBindings();
  const credential = await seedUserCredential(root, { principal, provider: "custom-openai", key: CORPUS_VARIANT_KEY });
  const connectionBase = {
    principal,
    providerId: "custom-openai",
    credentialId: credential.row.id,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    allowBackground: true,
  } as const;
  const image = await seedUserConnectionRows(root, {
    ...connectionBase,
    model: CORPUS_VARIANT_IMAGE_MODEL,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  const edit = await seedUserConnectionRows(root, {
    ...connectionBase,
    model: CORPUS_VARIANT_EDIT_MODEL,
    declared: {
      kind: "generation",
      generation: { imageEdit: true, context: { window: 32_000 }, output: { modalities: ["image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  const text = await seedUserConnectionRows(root, {
    ...connectionBase,
    model: CORPUS_VARIANT_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
    },
  });
  const embed = await seedUserConnectionRows(root, {
    ...connectionBase,
    model: CORPUS_EMBED_MODEL,
    declared: {
      kind: "embedding",
      embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"] },
      features: { detectServer: false },
    },
  });
  const member = await seedCorpusAccount(root);
  const foreign = await seedCorpusAccount(root);
  await caller.admin.resetPassword({ userId: member.userId, password: CORPUS_VARIANT_PASSWORD });
  await caller.admin.resetPassword({ userId: foreign.userId, password: CORPUS_VARIANT_PASSWORD });
  const address = await root.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  const ownerAuth = await login(root, principal.handle, ownerPassword, origin);
  const memberAuth = await login(root, member.handle, CORPUS_VARIANT_PASSWORD, origin);
  const foreignAuth = await login(root, foreign.handle, CORPUS_VARIANT_PASSWORD, origin);
  const memberPrincipal = member;
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "image-variant-witness",
      name: "Image variant witness",
      description: "A traveller in a blue coat beside an orbital loom.",
    }),
  });
  const unseated = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "image-unseated-witness",
      name: "Unseated witness",
      description: "A host-owned witness not seated in this room.",
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  await caller.chat.commitMessage({ chatId: room.chat.id, content: "The traveller witnesses the orbital loom.", timeZone: UTC_TIME_ZONE });
  const invite = await root.services.chat.createInvite({ principal, chatId: room.chat.id, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: memberPrincipal, inviteId: invite.invite.id });
  const effects = async (): Promise<Effects> => ({
    assets: await root.db.select().from(assets).orderBy(assets.id),
    generations: await root.db.select().from(imageryGenerations).orderBy(imageryGenerations.id),
    posts: [...wire.posts],
  });
  let captured: Omit<CorpusImageVariants, "bindings">;
  try {
    await caller.connection.setBinding({ task: "imageEmbed", connectionId: embed.id });
    await root.settleBackground();
    const skipPostsBefore = [...wire.posts];
    const square = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
    const sliver = await sharp(Buffer.from(square)).resize({ width: 8, height: 64, fit: "fill" }).png().toBuffer();
    const skips: CorpusImageVariants["skips"][number][] = [];
    for (const bytes of [square, sliver]) {
      const stored = await root.app.assets.store({ principal, bytes, mime: "image/png", kind: "avatar", enforceMagic: true });
      await root.settleBackground();
      const first = await seedIndexedAsset(root, [stored.assetId, { force: true }]);
      const repeated = await seedIndexedAsset(root, [stored.assetId, { force: false }]);
      const forced = await seedIndexedAsset(root, [stored.assetId, { force: true }]);
      const asset = await root.db.select().from(assets).where(eq(assets.id, stored.assetId)).get();
      if (asset === undefined) {
        throw new Error("real image admission left no owned asset row");
      }
      skips.push({ asset, first, repeated, forced });
    }
    const skipPostsAfter = [...wire.posts];
    const avatar = skips[1];
    if (avatar === undefined) {
      throw new Error("real short-edge admission lost its avatar");
    }
    await root.services.character.update({ principal, characterId: character.id, input: { avatarAssetId: avatar.asset.id } });
    await caller.connection.setBinding({ task: "summarize", connectionId: text.id });
    await caller.connection.setBinding({ task: "generateImage", connectionId: image.id });
    const extractedInput = { chatId: room.chat.id, mode: "scenario", timeZone: UTC_TIME_ZONE } satisfies TrpcInput<"imagery.extractPrompt">;
    const extracted = {
      input: extractedInput,
      output: await output(await request(ownerAuth, "imagery.extractPrompt", extractedInput, true), extractedPromptSchema),
    };
    const captionInput = {
      chatId: room.chat.id,
      mode: "character_multimodal",
      subjectCharacterId: character.id,
      timeZone: UTC_TIME_ZONE,
    } satisfies TrpcInput<"imagery.extractPrompt">;
    const captionedPreview = {
      input: captionInput,
      output: await output(await request(memberAuth, "imagery.extractPrompt", captionInput, true), extractedPromptSchema),
    };
    const free = await seedImageryGenerations(root, {
      caller: principal,
      mode: "free",
      prompt: `  ${CORPUS_VARIANT_FREE_PROMPT}  `,
      n: 1,
    });
    const captioned = await seedImageryGenerations(root, {
      caller: principal,
      mode: "character_multimodal",
      subjectCharacterId: character.id,
      reuse: "never",
      n: 1,
    });
    const warning = await seedImageryGenerations(root, {
      caller: principal,
      mode: "character",
      subjectCharacterId: character.id,
      prompt: CORPUS_VARIANT_OVERRIDE,
      useAvatarReference: true,
      n: 1,
    });
    const source = free.picture.images[0];
    if (source === undefined) {
      throw new Error("native generation produced no edit source");
    }
    const editInput = {
      sourceAssetId: source.assetId,
      instruction: CORPUS_VARIANT_EDIT_INSTRUCTION,
      n: 1,
      chatId: room.chat.id,
    } satisfies TrpcInput<"imagery.editImage">;
    await root.settleBackground();
    const beforeRefusals = await effects();
    const responses = [
      await request(ownerAuth, "imagery.editImage", editInput, true),
      await request(memberAuth, "imagery.editImage", editInput, true),
      await request(foreignAuth, "imagery.editImage", editInput, true),
      await request(foreignAuth, "imagery.extractPrompt", captionInput, true),
      await request(memberAuth, "imagery.extractPrompt", { ...captionInput, subjectCharacterId: unseated.id }, true),
    ];
    const refusalSchema = z.object({ error: z.object({ message: z.string(), data: z.object({ code: z.string() }) }) });
    const refusals: CorpusImageVariants["refusals"][number][] = [];
    for (const response of responses) {
      const parsed = refusalSchema.parse(await response.json()).error;
      refusals.push({ status: response.status, code: parsed.data.code, message: parsed.message });
    }
    await root.settleBackground();
    const afterRefusals = await effects();
    await caller.connection.setBinding({ task: "generateImage", connectionId: edit.id });
    const picture = await output(await request(ownerAuth, "imagery.editImage", editInput, true), generatedPictureSchema);
    const edited = { read: { input: editInput, output: picture }, picture, generations: await captureImageryGenerationRows(root.db, picture) };
    const all = [...free.generations, ...captioned.generations, ...warning.generations, ...edited.generations];
    const provenances = await Promise.all(all.map((row) => provenance(ownerAuth, row.assetId)));
    const nullProvenance = [
      await provenance(ownerAuth, avatar.asset.id),
      await provenance(memberAuth, source.assetId),
      await provenance(foreignAuth, source.assetId),
    ];
    const assetRows = await root.db
      .select()
      .from(assets)
      .where(inArray(assets.id, [...skips.map(({ asset }) => asset.id), ...all.map((row) => row.assetId)]))
      .orderBy(assets.id);
    await root.settleBackground();
    captured = {
      credential,
      connections: [image, edit, text, embed],
      ownerId: root.ownerId,
      memberId: member.userId,
      character,
      room,
      skips,
      skipPostsBefore,
      skipPostsAfter,
      previews: { extracted, captioned: captionedPreview },
      free,
      captioned,
      warning,
      edited,
      provenance: provenances,
      nullProvenance,
      refusals,
      beforeRefusals,
      afterRefusals,
      rows: all.toSorted((left, right) => left.id.localeCompare(right.id)),
      assetRows,
      physical: { images: [...wire.images], captions: [...wire.captions], remaining: wire.remaining() },
      secrets: [
        CORPUS_VARIANT_KEY,
        CORPUS_VARIANT_PASSWORD,
        ownerPassword,
        invite.token,
        ...[ownerAuth, memberAuth, foreignAuth].flatMap(({ cookie, token }) => [cookie, token]),
        credential.row.ciphertext,
        credential.row.iv,
        credential.row.tag,
      ],
    };
  } finally {
    for (const task of ["summarize", "generateImage", "imageEmbed"] as const) {
      await caller.connection.setBinding({ task, connectionId: previous.find((view) => view.task === task)?.binding?.connectionId ?? null });
    }
    await root.settleBackground();
  }
  return { ...captured, bindings: { before: previous, after: await caller.connection.listBindings() } };
}
