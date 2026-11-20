// @subject packages/contracts/src/inference/builtin-providers.ts
// @subject packages/inference/src/capability/sources/curated/loader.ts
// The generation floor's sampler set is empty and a stated set replaces it, so a built-in chat row reaches a sampler
// only through a source that states one. Every built-in row names where its samplers come from, keyed by the row
// table's own ids so a new row fails to compile until it says, and each case proves that source through the
// production resolve: a provider row for any model, a catalog list's supported parameters, a model family's row, or
// none because the wire exposes no sampler knob.
import { BUILTIN_PROVIDERS, WIRE_DEFS } from "@orb/contracts/inference";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { BUILTIN_PROVIDER_ROWS } from "#contracts/inference/builtin-providers.ts";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY, RUNTIME_TOKEN } from "../roles/runtime.fixtures.ts";

type BuiltinProviderId = (typeof BUILTIN_PROVIDER_ROWS)[number]["id"];

/** Where a row's samplers come from. `family` names a model id its family row covers; `emptyOnPurpose` names a family
 *  that states an empty set with the reason; `waitsOn` marks a family that states no ranges yet, with the ruling. */
type SamplerSource =
  | { readonly kind: "provider-row" }
  | { readonly kind: "catalog"; readonly listed: (model: string, parameters: readonly string[]) => unknown }
  | {
      readonly kind: "family";
      readonly model: string;
      readonly emptyOnPurpose?: { readonly model: string; readonly why: string };
      readonly waitsOn?: string;
    }
  | { readonly kind: "none-by-wire"; readonly why: string }
  | { readonly kind: "no-chat" };

const PLAIN_MODEL = "vendor/plain-model";
const LISTED_PARAMETERS = ["max_tokens", "temperature", "min_p"] as const;
const LISTED_KNOBS = ["temperature", "minP"];

const SOURCES = {
  google: { kind: "family", model: "gemini-2.5-flash" },
  // OpenRouter's catalog states each model's `supported_parameters` (advertised/openrouter.ts).
  openrouter: {
    kind: "catalog",
    listed: (model, parameters) => ({
      data: [{ id: model, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] }, ["supported_parameters"]: parameters }],
    }),
  },
  // curated/anthropic.ts states only the temperature and top_p exclusivity on the direct wire: "no ranges ship until a
  // dated measured/anthropic.ts entry". Its case pins that, so the measured entry rewrites it on purpose.
  anthropic: { kind: "family", model: "claude-sonnet-4-5", waitsOn: "direct Anthropic states no ranges until a measured entry (D68)" },
  // curated/anthropic.ts: the Claude runtime exposes no sampler knob.
  "claude-sub": { kind: "none-by-wire", why: "the Claude runtime exposes no sampler knob" },
  openai: {
    kind: "family",
    model: "gpt-4.1",
    emptyOnPurpose: { model: "gpt-5", why: "the gpt-5 family refuses temperature and the other samplers" },
  },
  nanogpt: { kind: "provider-row" },
  literouter: { kind: "provider-row" },
  // curated/deepseek.ts states the ranges the service's own range errors gave, for its direct ids.
  deepseek: { kind: "family", model: "deepseek-flash" },
  vllm: { kind: "provider-row" },
  "lm-studio": { kind: "provider-row" },
  ollama: { kind: "provider-row" },
  "llama-cpp": { kind: "provider-row" },
  koboldcpp: { kind: "provider-row" },
  "custom-openai": { kind: "provider-row" },
  "local-light": { kind: "no-chat" },
} as const satisfies Record<BuiltinProviderId, SamplerSource>;

const SOURCE_OF: Readonly<Record<string, SamplerSource>> = SOURCES;
// LiteRouter's list states a model's parameters on most rows, so it has the catalog arm too.
const LITEROUTER_CATALOG: SamplerSource = {
  kind: "catalog",
  listed: (model, parameters) => ({ data: [{ id: model, type: "chat", variant: "full-context", ["supported_parameters"]: parameters }] }),
};

const ROWS = BUILTIN_PROVIDERS.map((row) => ({ id: row.id, row, source: SOURCE_OF[row.id] }));

function keyFor(auth: (typeof BUILTIN_PROVIDERS)[number]["auth"]): { readonly key?: string } {
  if (auth === "apiKey") {
    return { key: RUNTIME_KEY };
  }
  return auth === "oauthToken" ? { key: RUNTIME_TOKEN } : {};
}

const EMPTY_LIST = { object: "list", data: [], models: [] };

async function samplersOf(row: (typeof BUILTIN_PROVIDERS)[number], model: string, list: unknown = EMPTY_LIST): Promise<readonly string[]> {
  await using root = await createRuntimeRoot({ providerFetch: () => Promise.resolve(Response.json(list)) });
  const principal = await root.principalFor(root.ownerId);
  const { key } = keyFor(row.auth);
  const credential = key === undefined ? null : await root.services.credentials.add({ principal, provider: row.id, key });
  const baseUrl = row.auth === "endpoint" ? RUNTIME_ENDPOINT : null;
  const created = await root.services.connection.create({ principal, providerId: row.id, credentialId: credential?.id ?? null, baseUrl, model });
  const { capability } = await root.services.connection.capabilities({ principal, connectionId: created.id, signal: new AbortController().signal });
  const sampling = capability.kind === "generation" ? capability.generation.sampling : {};
  // `exclusive` pairs knobs a model rejects together; it names no knob the model takes.
  return Object.keys(sampling).filter((knob) => knob !== "exclusive");
}

test("every built-in row states its sampler source, and only a row that serves no chat says no-chat", () => {
  expect(ROWS.filter(({ source }) => source === undefined).map(({ id }) => id)).toEqual([]);
  const chatless = ROWS.filter(({ row }) => !(row.serves ?? WIRE_DEFS[row.wire].serves).includes("chat")).map(({ id }) => id);
  expect(ROWS.filter(({ source }) => source?.kind === "no-chat").map(({ id }) => id)).toEqual(chatless);
});

forEachNonEmpty(
  ROWS.filter(({ source }) => source?.kind === "provider-row"),
  "provider rows",
  ({ id, row }) => {
    test(`${id} states samplers for a model nothing else describes`, async () => {
      expect(await samplersOf(row, PLAIN_MODEL)).not.toEqual([]);
    });
  },
);

type Listed = Extract<SamplerSource, { kind: "catalog" }>["listed"];
const catalogOf = (source: SamplerSource | undefined): Listed[] => (source?.kind === "catalog" ? [source.listed] : []);

forEachNonEmpty(
  ROWS.flatMap(({ id, row, source }) =>
    [...catalogOf(source), ...(id === "literouter" ? catalogOf(LITEROUTER_CATALOG) : [])].map((listed) => ({ id, row, listed })),
  ),
  "catalog rows",
  ({ id, row, listed }) => {
    test(`${id} takes a model's samplers from the parameters its list states`, async () => {
      expect((await samplersOf(row, PLAIN_MODEL, listed(PLAIN_MODEL, LISTED_PARAMETERS))).toSorted()).toEqual(LISTED_KNOBS.toSorted());
    });
  },
);

const FAMILY_ROWS = ROWS.flatMap(({ id, row, source }) => (source?.kind === "family" ? [{ id, row, source }] : []));

forEachNonEmpty(
  FAMILY_ROWS.filter(({ source }) => source.waitsOn === undefined),
  "family rows",
  ({ id, row, source }) => {
    test(`${id} states samplers for a model its family row covers`, async () => {
      expect(await samplersOf(row, source.model)).not.toEqual([]);
    });
  },
);

forEachNonEmpty(
  FAMILY_ROWS.flatMap(({ id, row, source }) => (source.emptyOnPurpose === undefined ? [] : [{ id, row, ...source.emptyOnPurpose }])),
  "families that refuse samplers",
  ({ id, row, model, why }) => {
    test(`${id} states no sampler for ${model}, whose family refuses them`, async () => {
      expect(await samplersOf(row, model), why).toEqual([]);
    });
  },
);

forEachNonEmpty(
  FAMILY_ROWS.flatMap(({ row, source }) => (source.waitsOn === undefined ? [] : [{ row, model: source.model, waitsOn: source.waitsOn }])),
  "families waiting on a ruling",
  ({ row, model, waitsOn }) => {
    test(waitsOn, async () => {
      expect(await samplersOf(row, model)).toEqual([]);
    });
  },
);

forEachNonEmpty(
  ROWS.flatMap(({ id, row, source }) => (source?.kind === "none-by-wire" ? [{ id, row, why: source.why }] : [])),
  "rows with no sampler knob",
  ({ id, row, why }) => {
    test(`${id} takes no sampler because the wire has no knob for one`, async () => {
      expect(await samplersOf(row, PLAIN_MODEL), why).toEqual([]);
    });
  },
);
