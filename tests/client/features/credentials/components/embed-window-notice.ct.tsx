// @subject packages/client/src/components/connection-role-slot.tsx
import { connectionSummary, embedWindowNotice, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { BUILT_IN_EMBED_DIMS, CARD_EMBED_WINDOW_TOKENS, LOCAL_LIGHT_SEED_ROWS, SMALL_EMBED_WINDOW_TOKENS } from "@orb/contracts/inference";
import type { LocalLightModelCache } from "@orb/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const NOTICE = "[data-embed-window-notice]";
const unscripted = (): Promise<never> => Promise.reject(new Error("unscripted local-light model call"));

// The built-in encoder answers a width probe with the vector width it ships; nothing else reaches the model.
const LOCAL_LIGHT_CACHE: LocalLightModelCache = {
  embedTexts: (_model, texts) => Promise.resolve(texts.map(() => new Float32Array(BUILT_IN_EMBED_DIMS).fill(1))),
  scorePairs: unscripted,
  embedImages: unscripted,
  embedClipTexts: unscripted,
  preload: unscripted,
  loadFailed: () => false,
};

const CASES = [
  { label: "a small hosted window", bound: "hosted", window: SMALL_EMBED_WINDOW_TOKENS - 1, noticed: true },
  { label: "a hosted window one token under the card cap", bound: "hosted", window: CARD_EMBED_WINDOW_TOKENS - 1, noticed: false },
  { label: "a small window on the built-in local encoder", bound: "local", window: SMALL_EMBED_WINDOW_TOKENS - 1, noticed: false },
] as const;

for (const { label, bound, window, noticed } of CASES) {
  test(`the text embedder row ${noticed ? "says" : "does not say"} it reads a small window for ${label}`, async ({ mount, page }) => {
    const provider = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      structuredReplies: new Map(),
      chatText: (): never => {
        throw new Error("The embedder window notice must not request a chat completion");
      },
      images: [],
    });
    await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute, startJobs: false, localLightCache: LOCAL_LIGHT_CACHE });
    const caller = await root.internalCallerFor(root.ownerId);
    const declared = (dims: number): { kind: "embedding"; embedding: { dims: number; maxInputTokens: number }; features: { detectServer: false } } => ({
      kind: "embedding",
      embedding: { dims, maxInputTokens: window },
      features: { detectServer: false },
    });
    let embedder: Awaited<ReturnType<typeof caller.connection.get>>;
    if (bound === "local") {
      const row = (await caller.connection.list()).find((connection) => connection.model === LOCAL_LIGHT_SEED_ROWS[0].model);
      if (row === undefined) {
        throw new Error("The owner has no built-in text encoder");
      }
      embedder = await caller.connection.update({ connectionId: row.id, patch: { declared: declared(BUILT_IN_EMBED_DIMS) } });
    } else {
      embedder = await caller.connection.create({
        label: "Window under test",
        providerId: "custom-openai",
        credentialId: null,
        baseUrl: CORPUS_PROVIDER_ENDPOINT,
        model: CORPUS_EMBED_MODEL,
        allowBackground: true,
        declared: declared(CORPUS_EMBEDDING_VECTOR.length),
      });
    }
    await caller.connection.setBinding({ task: "embed", connectionId: embedder.id });
    const resolved = (await caller.connection.listBindings()).find((binding) => binding.task === "embed")?.resolved;
    if (resolved === null || resolved === undefined) {
      throw new Error("The text embedding role resolved nothing after it was bound");
    }
    await routeTrpc(page, {
      ...createShellAmbientReads(root.corpus.wire, root.ownerId),
      ...serveCorpusProcedures(caller, [
        "sessions.me",
        "search.spaceStatus",
        "workloads.list",
        "connection.list",
        "connection.listBindings",
        "connection.providersAvailable",
        "preset.list",
      ]),
    });
    await mount<typeof ModelRolesStory>("tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory", {});
    const role = ROLE_ROWS_ORDERED.find((row) => row.task === "embed");
    if (role === undefined) {
      throw new Error("The role picker has no text embedding role");
    }
    const group = page.getByRole("group", { name: role.heading, exact: true });
    // The row has drawn the binding under test, so an absent notice is an answer and not a row still loading.
    await expect(group.getByRole("combobox")).toHaveText(connectionSummary(embedder));
    // The table states the expectation; the bound capability must agree with it before the page is judged.
    const text = embedWindowNotice(resolved.capability);
    if ((text !== null) !== noticed) {
      throw new Error(`The bound capability does not hold this case's premise: its notice is ${text === null ? "absent" : "present"}`);
    }
    // Page-wide, so the picture embedder's row (another role) is read too: the text row alone carries the notice.
    await expect(page.locator(NOTICE)).toHaveText(text === null ? [] : [text]);
    await expect(group.locator(NOTICE)).toHaveCount(noticed ? 1 : 0);
  });
}
