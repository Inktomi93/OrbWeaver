import { resolvedScrubSet } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchGoogleModels, listGoogleModels } from "../../../packages/inference/src/catalog/google.ts";
import { expect, test } from "../../support/fixtures.ts";

const KEY = "native-catalog-test-key";
const dial = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  secret: KEY,
  secrets: resolvedScrubSet({ credential: { secret: KEY }, transport: null }),
  label: "Google models",
};

test("native catalog paginates, normalizes names, preserves advertised limits and excludes unsupported methods", async () => {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetchImpl: typeof fetch = (url, init) => {
    urls.push(String(url));
    headers.push(new Headers(init?.headers));
    return Promise.resolve(
      Response.json(
        urls.length === 1
          ? {
              models: [
                {
                  name: "models/gemini-3-flash-preview",
                  displayName: "Gemini Flash",
                  inputTokenLimit: 1_048_576,
                  outputTokenLimit: 65_536,
                  supportedGenerationMethods: ["generateContent"],
                },
                { name: "models/live-only", supportedGenerationMethods: ["bidiGenerateContent"] },
              ],
              nextPageToken: "next-page",
            }
          : { models: [{ name: "models/gemini-embedding-2", inputTokenLimit: 8192, supportedGenerationMethods: ["embedContent"] }] },
      ),
    );
  };
  const rows = await fetchGoogleModels(dial, fetchImpl);
  expect(rows.map((row) => [row.id, row.kind])).toEqual([
    ["gemini-3-flash-preview", "generation"],
    ["gemini-embedding-2", "embedding"],
  ]);
  expect(rows[0]).toMatchObject({ name: "Gemini Flash", contextLength: 1_048_576, maxCompletionTokens: 65_536, promptPrice: null, inputModalities: [] });
  expect(new URL(urls[1] ?? "https://invalid").searchParams.get("pageToken")).toBe("next-page");
  expect(headers.every((header) => header.get("x-goog-api-key") === KEY)).toBe(true);
  expect(urls.every((url) => !url.includes(KEY))).toBe(true);
});

test("native discovery owns scrubbed failure and never converts a bad key into an empty success", async () => {
  const listing = await listGoogleModels(dial, () => Promise.resolve(Response.json({ error: { message: `bad key ${KEY}` } }, { status: 403 })));
  expect(listing).toMatchObject({ listed: false });
  expect(JSON.stringify(listing)).not.toContain(KEY);
});

test("native discovery refuses a cyclic page sequence", async () => {
  await expect(fetchGoogleModels(dial, () => Promise.resolve(Response.json({ models: [], nextPageToken: "same" })))).rejects.toMatchObject({ kind: "invalid" });
});
