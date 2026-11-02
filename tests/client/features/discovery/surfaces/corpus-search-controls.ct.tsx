// @subject packages/client/src/features/discovery/surfaces/corpus-list-surface.tsx
// The Corpus omnibox sends the rerank ask the owner makes, and offers it only when a Rerank model can serve it.

import { modelIdSchema } from "@orb/contracts/inference";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { CORPUS_SEARCH_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import type { CorpusSearchControlsStory } from "./_search-controls-stories.tsx";

const STORY = "tests/client/features/discovery/surfaces/_search-controls-stories/CorpusSearchControlsStory";
const RERANK_MODEL = modelIdSchema.parse("ledger/native-reranker");
const SERVED = [
  "sessions.me",
  "connection.list",
  "connection.listBindings",
  "search.suggest",
  "search.spaceStatus",
  "workloads.list",
  "discovery.browseCharacters",
  "discovery.characterFacets",
  "discovery.catalog",
] as const;

/** The intercept that records the rerank each search request carried and lets the server answer it. */
function recordRerank(asked: (boolean | undefined)[]): (input: { readonly rerank?: boolean | undefined } | undefined) => undefined {
  return (input): undefined => {
    asked.push(input?.rerank);
  };
}

test.use({ hasTouch: false, isMobile: false });

/** The corpus harness over a local provider wire that also answers the reranker; nothing leaves the machine. */
async function seededHarness(withReranker: boolean): Promise<Awaited<ReturnType<typeof createCorpusHarness>>> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, RERANK_MODEL],
    embedding: () => CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = await createCorpusHarness(undefined, {
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname !== "/v1/rerank") {
        return await wire.execute(request);
      }
      return Response.json({ results: [{ index: 0, ["relevance_score"]: 1 }] });
    },
  });
  const principal = await root.principalFor(root.ownerId);
  if (!withReranker) {
    // The local-light seed binds a Rerank model by default; clear it to reach the unset state.
    await root.services.connection.setBinding({ principal, task: "rerank", connectionId: null });
  } else {
    const reranker = await root.services.connection.create({
      principal,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: RERANK_MODEL,
      allowBackground: true,
      declared: {
        kind: "rerank",
        rerank: { maxInputTokens: 8192, input: ["text"], instructionAware: false },
        features: { detectServer: false, rerankPath: "/rerank" },
      },
    });
    await root.services.connection.setBinding({ principal, task: "rerank", connectionId: reranker.id });
  }
  return root;
}

test("switching rerank on makes the next search carry rerank and shows it was requested", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(true);
  const caller = await root.internalCallerFor(root.ownerId);
  const asked: (boolean | undefined)[] = [];
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["search.search"], recordRerank(asked)),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "orbital ledger", targetId: "characters" });
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked.every((value) => value !== true)).toBe(true);
  const rerankSwitch = component.getByRole("switch");
  await expect(rerankSwitch).toBeEnabled();
  await rerankSwitch.click();
  await expect.poll(() => asked.at(-1)).toBe(true);
  await component.getByText("How search works").click();
  await expect(component.getByText(/Rerank: requested/u)).toBeVisible();
});

test("without a Rerank model the switch is off and says why", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(false);
  const caller = await root.internalCallerFor(root.ownerId);
  const asked: (boolean | undefined)[] = [];
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["search.search"], recordRerank(asked)),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "orbital ledger", targetId: "characters" });
  const rerankSwitch = component.getByRole("switch");
  await expect(rerankSwitch).toBeDisabled();
  await expect(rerankSwitch).toHaveAccessibleDescription(/Rerank model/u);
  expect(asked.every((value) => value !== true)).toBe(true);
});

interface SentSearch {
  readonly query: string;
  readonly rerank: boolean | undefined;
}

/** The intercept that records each search request's query and rerank, and lets the server answer it. */
function recordSearch(sent: SentSearch[]): (input: { readonly query: string; readonly rerank?: boolean | undefined } | undefined) => undefined {
  return (input): undefined => {
    if (input !== undefined) {
      sent.push({ query: input.query, rerank: input.rerank });
    }
  };
}

test("typing with rerank on settles to one reranked search, not one per keystroke", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(true);
  const caller = await root.internalCallerFor(root.ownerId);
  const sent: SentSearch[] = [];
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["search.search"], recordSearch(sent)),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "", targetId: "characters", rerank: true });
  await expect(component.getByRole("switch")).toBeChecked();
  const text = "orbital ledger";
  await component.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true }).pressSequentially(text, { delay: 40 });
  await expect.poll(() => sent.at(-1)?.query).toBe(text);
  await expect(component.getByText("How search works")).toBeVisible();
  const reranked = sent.filter((search) => search.rerank === true);
  expect(sent.every((search) => search.rerank === true)).toBe(true);
  expect(reranked.length).toBeLessThanOrEqual(2);
});

test("a failed search gives way to the next query's results without a Retry", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(true);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["search.search"], (input) => (input.query === "orbital" ? trpcError({ code: "BAD_REQUEST" }) : undefined)),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "orbital", targetId: "characters" });
  await expect(component.getByText("Couldn't load the search.", { exact: true })).toBeVisible();
  await component.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true }).press("End");
  await component.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true }).pressSequentially(" ledger");
  await expect(component.getByText("How search works")).toBeVisible();
  await expect(component.getByText("Couldn't load the search.", { exact: true })).toHaveCount(0);
});

test("a revisited query that failed reads again instead of re-throwing its cached error", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(true);
  const caller = await root.internalCallerFor(root.ownerId);
  const asked: string[] = [];
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["search.search"], (input) => {
      asked.push(input.query);
      return input.query === "orb" && asked.filter((query) => query === "orb").length === 1 ? trpcError({ code: "BAD_REQUEST" }) : undefined;
    }),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "orb", targetId: "characters" });
  const field = component.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true });
  await expect(component.getByText("Couldn't load the search.", { exact: true })).toBeVisible();
  await field.press("End");
  await field.pressSequentially("ital");
  await expect(component.getByText("How search works")).toBeVisible();
  await field.fill("orb");
  await expect.poll(() => asked.filter((query) => query === "orb").length).toBe(2);
  await expect(component.getByText("Couldn't load the search.", { exact: true })).toHaveCount(0);
  await expect(component.getByText("How search works")).toBeVisible();
});

test("a stored rerank ask waits for the Rerank model read instead of searching twice", async ({ mount, page, corpus }) => {
  await using root = await seededHarness(true);
  const caller = await root.internalCallerFor(root.ownerId);
  const sent: SentSearch[] = [];
  const held = holdCorpusProcedure(caller, "connection.listBindings");
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(
      caller,
      SERVED.filter((path) => path !== "connection.listBindings"),
    ),
    ...held.routes,
    ...serveCorpusProcedures(caller, ["search.search"], recordSearch(sent)),
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "orbital ledger", targetId: "characters", rerank: true });
  await held.requested;
  expect(sent).toEqual([]);
  held.release();
  await expect(component.getByText("How search works")).toBeVisible();
  expect(sent).toEqual([{ query: "orbital ledger", rerank: true }]);
});
