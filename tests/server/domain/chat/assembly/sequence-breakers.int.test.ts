// @subject packages/server/src/domain/chat/assembly/sampler-names.ts
// The DRY sequence breakers a real turn sends are literal strings: every macro rendered against the room as the prompt
// renders it, a one-macro name broken into its words beside the whole name, every input form split out, repeats
// dropped. The server compares strings and knows no `{{char}}`, so an unrendered breaker never breaks anything.

import { createCharacterSchema } from "@orb/contracts/character";
import type { DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import { wireOf } from "../scenario-physical.ts";

const CHARACTER = "Mary Jane Watson";
// A list entry, the same macro twice, a speaker tag, SillyTavern's JSON array string and text-generation-webui's
// quoted comma form.
const BREAKERS = ["\n", "{{char}}", "{{user}}:", '["*", "\\""]', "{{char}}", '"-", "~"'];
const LITERAL = ["\n", CHARACTER, "Mary", "Jane", "Watson", `${DEFAULT_PERSONA_NAME}:`, "*", '"', "-", "~"];
const DRY = { min: 0, max: 5 };

/** The corpus connection's own declaration with the DRY samplers stated, so the breakers ride the top level as the
 *  llama.cpp and KoboldCpp rows spell them, or with the vLLM envelope declared instead. */
function declared(features: EndpointFeatures): DeclaredCapability {
  return {
    kind: "generation",
    generation: {
      input: ["text", "image"],
      context: { window: 32_000 },
      output: { structured: true },
      ...(features.samplerEnvelope === undefined ? { sampling: { temperature: { min: 0, max: 2 }, dryMultiplier: DRY, drySequenceBreakers: true } } : {}),
    },
    features: { detectServer: false, structuredMode: "guided-decoding", ...features },
  };
}

async function room(): Promise<ChatRoot> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return await createChatRoot({
    memoryEnabled: false,
    characters: [createCharacterSchema.parse({ handle: "mj", name: CHARACTER, description: "A photographer." })],
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { dryMultiplier: 0.8, drySequenceBreakers: BREAKERS } },
    providerFetch: (input, init) => physical.execute(new Request(input, init)),
  });
}

/** The first chat-completions body the room's turn sent, on its chat connection declared as given. */
async function turnBody(h: ChatRoot, features: EndpointFeatures): Promise<Record<string, unknown>> {
  const bindings = await h.root.services.connection.listBindings({ signal: new AbortController().signal, principal: h.owner });
  const connectionId = bindings.find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the composed room has no chat connection");
  }
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { declared: declared(features) } });
  const sent = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Hello." }));
  return z.record(z.string(), z.unknown()).parse(sent.bodies[0]);
}

test("a breaker list with {{char}}, {{user}} and a JSON array entry rides the top level as resolved literals with the name's words", async () => {
  await using h = await room();
  const body = await turnBody(h, {});
  expect(body["dry_sequence_breakers"]).toEqual(LITERAL);
});

test("the vLLM envelope carries the same resolved literals", async () => {
  await using h = await room();
  const body = await turnBody(h, { samplerEnvelope: "vllm-xargs" });
  expect(body["vllm_xargs"]).toMatchObject({ ["dry_sequence_breakers"]: LITERAL });
  expect(body).not.toHaveProperty("dry_sequence_breakers");
});
