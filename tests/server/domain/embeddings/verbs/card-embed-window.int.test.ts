// A card longer than the embedding engine's window is embedded, not refused: the provider surface clamps the text it sends
// to the engine's own window, and only a window below the card projection's cap shortens it. The card projection's cap is
// the one window-independent bound, so the content hash is a function of the card alone.
// @subject packages/server/src/domain/character/substrate/embed-text.ts
// @subject packages/inference/src/backends/openai-compat/embed.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
} from "@orb/testkit/node/composed";
import { EMBED_CLAMPED_EVENT } from "#inference/backends/http/provider-log.ts";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

const CARD_NAME = "Window keeper";
const SMALL_WINDOW_TOKENS = 512;
const LARGE_WINDOW_TOKENS = 32_768;
const LOG_SCAN_LIMIT = 500;

const WINDOWS = [
  { label: "a window below the card cap", window: SMALL_WINDOW_TOKENS, clamped: true },
  { label: "a window above the card cap", window: LARGE_WINDOW_TOKENS, clamped: false },
] as const;

test.for(WINDOWS)("a long card is embedded under $label", async ({ window, clamped }) => {
  const sent: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: (input) => {
      sent.push(input);
      return CORPUS_EMBEDDING_VECTOR;
    },
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute, logLevel: "warn" });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const encoder = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: window }, features: { detectServer: false } },
  });
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: encoder.id });
  const description = "The keeper of the orbital ledger weighs every harbor witness. ".repeat(1200);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "window-keeper", name: CARD_NAME, description }),
  });
  const loaded = await root.services.character.loadCardText(card.id);
  if (loaded === null) {
    throw new Error("the created card has no embeddable text");
  }
  // The projection's cap bites on this card whatever the engine is.
  expect(loaded.length).toBeLessThan(description.length);

  const job = await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" });
  await executeAdmitted(root, job.id);
  await expect.poll(async () => (await caller.workloads.get({ id: job.id })).status).toBe("succeeded");

  const embedded = sent.filter((input) => input.startsWith(`Name: ${CARD_NAME}`));
  expect(embedded).toHaveLength(1);
  const text = embedded[0] ?? "";
  expect(estimateTokens(text)).toBeLessThanOrEqual(safeTokenWindow(window));
  expect(text === loaded).toBe(!clamped);
  // A window below the cap embeds only the head of the card: this is the scale of that loss in the same estimate the clamp uses.
  expect(estimateTokens(text) < estimateTokens(loaded)).toBe(clamped);
  // A shortened embed is logged, once, against the card text that was cut.
  const clampLogs = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .filter((line) => line.includes(EMBED_CLAMPED_EVENT) && line.includes(`"chars":${loaded.length}`));
  expect(clampLogs).toHaveLength(clamped ? 1 : 0);
});
