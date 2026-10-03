// The STRUCTURED STATE ROUND's schema on real servers (item 0511).
//
// Builds the production response schema (`stateRoundChangesSchema` over the cheap round's wire tools), prints what
// Anthropic's structured-outputs compiler counts (platform.claude.com/docs/en/build-with-claude/structured-outputs,
// "Schema complexity limits": <=24 optional parameters, <=16 union-typed parameters per request), and optionally:
//   PROBE_LIVE=1     sends it as `response_format` to OpenRouter, both as projected and strict-compatible (what the
//                    hosted openai-compat batch sends), and writes each reply to results/;
//   PROBE_OLLAMA=url posts it as Ollama `/api/chat` `format` (stream off, the structured batch's request) and prints
//                    the raw reply, which is what the recorded test fixture holds.
//
// The tool list is re-spelled from `buildToolRoundWireTools` (compose/rpg.ts, private): the same projection of
// `rpgExtractionSchema`, constrained by the same refs, described by the same prose.
//
//   node scripts/probes/rpg-extraction/structured-state-round.ts
//   PROBE_LIVE=1 PROBE_MODELS=anthropic/claude-sonnet-5.5 node scripts/probes/rpg-extraction/structured-state-round.ts
//   PROBE_OLLAMA=http://127.0.0.1:28211 node scripts/probes/rpg-extraction/structured-state-round.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrubWireSchema, structuredSchemaComplexity } from "@orb/contracts/inference";
import { resolveProseText } from "@orb/contracts/prose";
import type { ExtractionRefs, RpgStateRoundTool } from "@orb/contracts/rpg";
import {
  buildRpgToolDescriptions,
  constrainExtractionSchema,
  RPG_NO_CHANGES_TOOL,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  stateRoundChangesSchema,
  structuredChangesToToolCalls,
} from "@orb/contracts/rpg";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { readEnvKey } from "../openrouter/_kit.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const OLLAMA_MODEL = process.env["PROBE_OLLAMA_MODEL"] ?? "qwen2.5:0.5b";

const config = rpgGameConfigSchema.parse({});
const refs: ExtractionRefs = {
  actorRefs: ["player", "Mira", "Corvin"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};
const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs);

function wireTools(): RpgStateRoundTool[] {
  const props = (constrained as { properties?: Record<string, { items?: Record<string, unknown> }> }).properties;
  const item = (field: string): Record<string, unknown> => props?.[field]?.items ?? { type: "object" };
  const descriptions = buildRpgToolDescriptions({ config, refs, prose: {} });
  const d = (name: string): string => descriptions.get(name) ?? "";
  return [
    { name: "update_party", description: d("update_party"), parameters: item("party") },
    { name: "update_inventory", description: d("update_inventory"), parameters: item("inventory") },
    { name: "update_scene", description: d("update_scene"), parameters: (props?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" } },
    { name: "upsert_quest", description: d("upsert_quest"), parameters: item("quests") },
    { name: "add_journal_entry", description: d("add_journal_entry"), parameters: item("journal") },
    {
      name: RPG_NO_CHANGES_TOOL,
      description: resolveProseText("rpg.extract.tool.noChanges", {}),
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

const tools = wireTools();
const schema = stateRoundChangesSchema(constrained, tools);
const strictSchema = scrubWireSchema(schema, "strict-compatible").schema;
console.log(
  JSON.stringify(
    {
      asProjected: structuredSchemaComplexity(schema),
      strictCompatible: structuredSchemaComplexity(strictSchema),
      perTool: tools.map((tool) => ({ tool: tool.name, ...structuredSchemaComplexity(tool.parameters) })),
      bytes: JSON.stringify(schema).length,
    },
    null,
    2,
  ),
);

const system = [
  resolveProseText("rpg.extract.toolRoundHeader", {}),
  [resolveProseText("rpg.extract.structuredRoundFrame", {}), ...tools.map((tool) => `${tool.name}: ${tool.description}`)].join("\n"),
].join("\n\n");
const user =
  'CURRENT STATE:\n{"location":"the chapel","presentCharacters":[],"actorState":[]}\n\nLATEST BEAT:\nMira: Corvin\'s blade catches my arm as we flee the chapel — I\'m bleeding. We duck into the cave by the river as dusk falls.';

function decode(text: string): unknown {
  try {
    return structuredChangesToToolCalls(JSON.parse(text));
  } catch {
    return null;
  }
}

if (process.env["PROBE_OLLAMA"] !== undefined) {
  const res = await fetch(`${process.env["PROBE_OLLAMA"]}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      format: schema,
      options: { temperature: 0, ["num_ctx"]: 8192 },
    }),
  });
  const raw = await res.text();
  const content = (JSON.parse(raw) as { message?: { content?: string } }).message?.content ?? "";
  console.log(JSON.stringify({ status: res.status, contentType: res.headers.get("content-type"), raw, decoded: decode(content) }, null, 2));
}

if (process.env["PROBE_LIVE"] === "1") {
  const key = readEnvKey("OPENROUTER_PROBE_KEY");
  const models = (process.env["PROBE_MODELS"] ?? "anthropic/claude-sonnet-5.5").split(",");
  fs.mkdirSync(path.join(DIR, "results"), { recursive: true });
  const shapes = { "strict-compatible": strictSchema, "as-projected": schema } as const;
  for (const model of models) {
    for (const [shape, sent] of Object.entries(shapes)) {
      const res = await fetch(OR_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          provider: { order: ["Anthropic"], allow_fallbacks: false },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_schema", json_schema: { name: "rpg_state_changes", schema: sent, strict: true } },
        }),
      });
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const changes = decode(body.choices?.[0]?.message?.content ?? "");
      const file = path.join(DIR, "results", `structured-state-round-${model.replaceAll("/", "_")}-${shape}.json`);
      fs.writeFileSync(file, `${JSON.stringify({ model, shape, status: res.status, response: body, changes }, null, 2)}\n`);
      console.log(JSON.stringify({ model, shape, status: res.status, decoded: changes !== null, file }));
    }
  }
}

