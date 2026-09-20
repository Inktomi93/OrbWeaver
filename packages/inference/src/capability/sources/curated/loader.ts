// The curated capability rows — DATA (`*.ts` row modules in ONE schema, `capabilityOverrideSchema`, checked
// at `tsc` through `satisfies` and parsed once at module load through the same zod a plugin row goes through). This is the ONLY place a curated `match.model` regex is compiled (the second regex home
// beside `families.ts`). A row matches by model regex or id list, optionally narrowed by provider / wire /
// api, because two live cells are functions of (id × wire-shape), not of id alone (`anthropicPrefill` is
// false on the CLI transport, `midConversationSystem` true only there). ALL matching rows apply, in file
// order — a later row refines an earlier one — so a family row followed by a version row composes.
//
// Adding a model is a row edit + the table test. A malformed row is a boot failure, never a runtime one.

import type { CapabilityOverride, ChatApi, ProviderId, Wire } from "@orb/contracts/inference";
import { capabilityOverrideSchema } from "@orb/contracts/inference";
import { z } from "zod";
import { anthropicRows } from "./anthropic.ts";
import { deepseekRows } from "./deepseek.ts";
import { embeddersRows } from "./embedders.ts";
import { googleRows } from "./google.ts";
import { localLightRows } from "./local-light.ts";
import { metaRows } from "./meta.ts";
import { mistralRows } from "./mistral.ts";
import { openaiRows } from "./openai.ts";
import { qwenRows } from "./qwen.ts";
import { xaiRows } from "./xai.ts";

interface CompiledRow {
  readonly row: CapabilityOverride;
  readonly model: RegExp | null;
  readonly ids: ReadonlySet<string> | null;
}

const rowsSchema = z.array(capabilityOverrideSchema);

function compile(file: string, raw: unknown): readonly CompiledRow[] {
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`curated/${file}.ts is malformed: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data.map((row) => ({
    row,
    model: row.match?.model !== undefined ? new RegExp(row.match.model, "i") : null,
    ids: row.match?.ids !== undefined ? new Set(row.match.ids) : null,
  }));
}

/** File order is composition order: family-wide rows first, then version rows, then wire-specific rows. */
const CURATED: readonly CompiledRow[] = [
  ...compile("anthropic", anthropicRows),
  ...compile("openai", openaiRows),
  ...compile("google", googleRows),
  ...compile("qwen", qwenRows),
  ...compile("meta", metaRows),
  ...compile("deepseek", deepseekRows),
  ...compile("mistral", mistralRows),
  ...compile("xai", xaiRows),
  ...compile("local-light", localLightRows),
  ...compile("embedders", embeddersRows),
];

export interface CuratedQuery {
  readonly model: string;
  readonly providerId?: ProviderId | undefined;
  readonly wire?: Wire | undefined;
  readonly api?: ChatApi | null | undefined;
}

function matches(compiled: CompiledRow, query: CuratedQuery): boolean {
  const match = compiled.row.match;
  if (match === undefined) {
    return false;
  }
  if (compiled.model !== null && !compiled.model.test(query.model)) {
    return false;
  }
  if (compiled.ids !== null && !compiled.ids.has(query.model)) {
    return false;
  }
  if (match.provider !== undefined && match.provider !== query.providerId) {
    return false;
  }
  if (match.wire !== undefined && match.wire !== query.wire) {
    return false;
  }
  if (match.api !== undefined && match.api !== (query.api ?? null)) {
    return false;
  }
  return true;
}

/** Every curated row that matches, in composition order. Empty ⇒ nothing curated for this model. */
export function curatedRows(query: CuratedQuery): readonly CapabilityOverride[] {
  return CURATED.filter((compiled) => matches(compiled, query)).map((compiled) => compiled.row);
}

/** The curated KIND for a model id, when any matching row states one (the `kindOf` fallback, §5.7). */
export function curatedKind(query: CuratedQuery): CapabilityOverride["kind"] | undefined {
  return curatedRows(query).find((row) => row.kind !== undefined)?.kind;
}

/** Every curated id list flattened — the builtin catalog for a `catalog: "builtin"` provider. */
export function curatedIdsFor(providerId: ProviderId): readonly string[] {
  const ids = new Set<string>();
  for (const compiled of CURATED) {
    if (compiled.row.match?.provider === providerId && compiled.ids !== null) {
      for (const id of compiled.ids) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}
