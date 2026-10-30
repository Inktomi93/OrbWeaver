import { readFile } from "node:fs/promises";
import { parseSurfaceProviderEvidence } from "../iso/surface-data.ts";
import { CORPUS_REFINERY_REPLY_NAMES, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL } from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";
import { createSurfaceProvider } from "./surface-provider.ts";

test("the owned peer serves only the maintained refinery schemas and refuses other structured output", async ({ importStagingDir }) => {
  await using peer = await createSurfaceProvider(importStagingDir);
  for (const name of CORPUS_REFINERY_REPLY_NAMES) {
    const response = await peer.transport.fetch(`${peer.baseUrl}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: CORPUS_TEXT_MODEL, stream: false, ["response_format"]: { type: "json_schema", ["json_schema"]: { name } } }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(JSON.stringify(CORPUS_STRUCTURED_REPLIES.get(name)));
  }
  for (const body of [
    { model: CORPUS_TEXT_MODEL, stream: true, ["response_format"]: { type: "json_schema", ["json_schema"]: { name: "card_answer" } } },
    { model: CORPUS_TEXT_MODEL, stream: true, ["response_format"]: { type: "json_object" } },
    { model: "foreign-model", stream: false, ["response_format"]: { type: "json_schema", ["json_schema"]: { name: CORPUS_REFINERY_REPLY_NAMES[0] } } },
  ]) {
    await expect(peer.transport.fetch(`${peer.baseUrl}/chat/completions`, { method: "POST", body: JSON.stringify(body) })).rejects.toThrow("unscripted");
  }
  expect(parseSurfaceProviderEvidence(await readFile(peer.requestEvidencePath, "utf8")).map(({ structuredSchema }) => structuredSchema)).toEqual([
    ...CORPUS_REFINERY_REPLY_NAMES,
  ]);
});
