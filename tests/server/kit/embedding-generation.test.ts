// kit/embedding-generation — the generation id is what every stored vector row and every search read is keyed
// on. Every corpus written before widths followed the embedder is 1024 wide, so a 1024-wide encoder must keep
// the exact id it was minted under (its vectors stay readable with no re-index), while an MRL encoder whose
// vectors the old fold cut to 1024 must get a fresh id and re-index at its own width.

import type { Capability } from "@orb/contracts/inference";
import { LOCAL_TEXT_ENCODING } from "@orb/contracts/inference";
import { stableStringify } from "@orb/kit/stable-stringify";
import { sha256Hex } from "../../../packages/server/src/kit/content-hash/index.ts";
import { connectionFingerprint, generationIdOf, vectorSpaceFingerprint } from "../../../packages/server/src/kit/embedding-generation/index.ts";
import { expect, test } from "../../support/fixtures.ts";

function connectionAt(dims: number, mrl: boolean): Parameters<typeof generationIdOf>[0]["connection"] {
  const capability: Capability = {
    kind: "embedding",
    embedding: { dims, mrl, maxInputTokens: 8192, input: ["text"], output: ["vector"], instructionAware: false },
  };
  return {
    connectionId: "user_connection_embed",
    providerId: "custom-openai",
    model: "text-embedding-3-large",
    api: "embed",
    wire: "openai-compat",
    baseUrl: "http://127.0.0.1:18703/v1",
    capability,
    features: {},
    extras: null,
    transport: null,
  };
}

/** The id formula every existing generation row was minted with. */
function mintedBeforeWidths(connection: Parameters<typeof generationIdOf>[0]["connection"]): string {
  return sha256Hex(
    stableStringify({
      ownerId: "user_owner",
      task: "embed",
      via: "embed",
      connectionId: connection.connectionId,
      fingerprint: connectionFingerprint(connection),
      space: "text-embedding-3-large",
    }),
  );
}

test("a 1024-wide encoder keeps the generation id its existing corpus was written under", () => {
  const connection = connectionAt(1024, true);
  expect(generationIdOf({ ownerId: "user_owner", task: "embed", via: "embed", connection, space: "text-embedding-3-large" })).toBe(
    mintedBeforeWidths(connection),
  );
});

test("a wider MRL encoder, whose stored vectors were cut to 1024, moves to a fresh generation at its own width", () => {
  const connection = connectionAt(3072, true);
  expect(generationIdOf({ ownerId: "user_owner", task: "embed", via: "embed", connection, space: "text-embedding-3-large" })).not.toBe(
    mintedBeforeWidths(connection),
  );
});

test("a local text recipe moves both generation and compatibility identities without changing unrelated encoder serialization", () => {
  const prior = connectionAt(1024, true);
  if (prior.capability.kind !== "embedding") {
    throw new Error("the fixture must be an embedding encoder");
  }
  const next = { ...prior, capability: { ...prior.capability, embedding: { ...prior.capability.embedding, localTextEncoding: LOCAL_TEXT_ENCODING } } };
  expect(connectionFingerprint(next)).not.toBe(connectionFingerprint(prior));
  expect(vectorSpaceFingerprint(next)).not.toBe(vectorSpaceFingerprint(prior));
  const params = { ownerId: "user_owner", task: "embed", via: "embed", space: "text-embedding-3-large" } as const;
  expect(generationIdOf({ ...params, connection: next })).not.toBe(generationIdOf({ ...params, connection: prior }));
  expect(generationIdOf({ ...params, connection: prior })).toBe(mintedBeforeWidths(prior));
});
