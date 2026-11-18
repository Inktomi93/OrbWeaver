// @subject packages/inference/src/backends/openai-compat/think-tags.ts
// The stream-time reasoning split: a preset's tag pair is expressible whether it is XML-shaped or literal
// (`[thinking]`/`[/thinking]`), and the split still declines a row with a native reasoning channel.
import { expect, test } from "@orb/testkit/node";
import { thinkTagMiddleware } from "#inference/backends/openai-compat/think-tags.ts";

const XML_PAIR = { prefix: "<think>", suffix: "</think>" } as const;
const BRACKET_PAIR = { prefix: "[thinking]", suffix: "[/thinking]" } as const;

type Middleware = ReturnType<typeof thinkTagMiddleware>[number];
type WrapStream = NonNullable<Middleware["wrapStream"]>;
type Model = Parameters<WrapStream>[0]["model"];
type Chunks = readonly [string, string];

const NEVER_GENERATES = (): Promise<never> => Promise.reject(new Error("the split is a stream transform; this fixture never generates"));

// Two deltas put the opening tag across a chunk boundary, the case the post-hoc split never handled.
function modelStreaming([opening, rest]: Chunks): Model {
  return {
    specificationVersion: "v4",
    provider: "fixture",
    modelId: "fixture",
    supportedUrls: {},
    doGenerate: NEVER_GENERATES,
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text-0" });
            controller.enqueue({ type: "text-delta", id: "text-0", delta: opening });
            controller.enqueue({ type: "text-delta", id: "text-0", delta: rest });
            controller.enqueue({ type: "text-end", id: "text-0" });
            controller.close();
          },
        }),
      }),
  };
}

interface Split {
  readonly reasoning: string;
  readonly text: string;
}

async function splitThrough(tags: { readonly prefix: string; readonly suffix: string }, chunks: Chunks): Promise<Split> {
  const model = modelStreaming(chunks);
  const middleware = thinkTagMiddleware({ reasoningKeys: undefined, tags });
  const [first] = middleware;
  if (middleware.length !== 1 || first?.wrapStream === undefined) {
    throw new Error("the tag pair produced no stream split");
  }
  const wrapped = await first.wrapStream({ doGenerate: NEVER_GENERATES, doStream: () => model.doStream({ prompt: [] }), params: { prompt: [] }, model });
  let reasoning = "";
  let text = "";
  for await (const chunk of wrapped.stream) {
    if (chunk.type === "reasoning-delta") {
      reasoning += chunk.delta;
    } else if (chunk.type === "text-delta") {
      text += chunk.delta;
    }
  }
  return { reasoning, text };
}

test("a literal bracket tag pair splits at stream time", async () => {
  expect(await splitThrough(BRACKET_PAIR, ["[thin", "king]hidden[/thinking]visible"])).toEqual({ reasoning: "hidden", text: "visible" });
});

test("an XML tag pair still splits over a chunk boundary", async () => {
  expect(await splitThrough(XML_PAIR, ["<thi", "nk>hidden</think>visible"])).toEqual({ reasoning: "hidden", text: "visible" });
});

test("a native reasoning channel gets no middleware, so the split cannot double-count", () => {
  expect(thinkTagMiddleware({ reasoningKeys: ["reasoning_content"], tags: BRACKET_PAIR })).toEqual([]);
});

test("a pair the middleware cannot carry falls back to the post-hoc split", () => {
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "", suffix: "[/thinking]" } })).toEqual([]);
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "[thinking]", suffix: "" } })).toEqual([]);
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "|||", suffix: "|||" } })).toEqual([]);
  // An XML opening with a mismatched closing tag is not a pair the preset spelled, so it is never mapped literally.
  expect(thinkTagMiddleware({ reasoningKeys: undefined, tags: { prefix: "<think>", suffix: "</other>" } })).toEqual([]);
});

test("a tag name keeps the characters its XML spelling allows", async () => {
  expect(await splitThrough({ prefix: "<think-2>", suffix: "</think-2>" }, ["<think-", "2>hidden</think-2>visible"])).toEqual({
    reasoning: "hidden",
    text: "visible",
  });
});
