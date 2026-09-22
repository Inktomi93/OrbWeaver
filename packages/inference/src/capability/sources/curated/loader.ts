// The curated capability rows — DATA (`*.ts` row modules in ONE schema, `capabilityOverrideSchema`, checked
// at `tsc` through `satisfies` and parsed once at module load through the same zod a plugin row goes through).
// The compiler + matcher are shared with the measured tier (`../rows.ts` — the one place a row's `match.model`
// regex is compiled, beside `../../families.ts`). A row matches by model regex or id list, optionally narrowed
// by provider / wire / api, because two live cells are functions of (id × wire-shape), not of id alone
// (`anthropicPrefill` is false on the CLI transport, `midConversationSystem` true only there). ALL matching rows
// apply, in file order — a later row refines an earlier one — so a family row followed by a version row composes.
//
// Adding a model is a row edit + the table test. A malformed row is a boot failure, never a runtime one.

import type { CapabilityOverride, ProviderId } from "@orb/contracts/inference";
import type { CompiledRow, RowQuery } from "../rows.ts";
import { compileRows, matchingRows } from "../rows.ts";
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

/** File order is composition order: family-wide rows first, then version rows, then wire-specific rows. */
const CURATED: readonly CompiledRow[] = [
  ...compileRows("curated/anthropic.ts", anthropicRows),
  ...compileRows("curated/openai.ts", openaiRows),
  ...compileRows("curated/google.ts", googleRows),
  ...compileRows("curated/qwen.ts", qwenRows),
  ...compileRows("curated/meta.ts", metaRows),
  ...compileRows("curated/deepseek.ts", deepseekRows),
  ...compileRows("curated/mistral.ts", mistralRows),
  ...compileRows("curated/xai.ts", xaiRows),
  ...compileRows("curated/local-light.ts", localLightRows),
  ...compileRows("curated/embedders.ts", embeddersRows),
];

type CuratedQuery = RowQuery;

/** Every curated row that matches, in composition order. Empty ⇒ nothing curated for this model. */
export function curatedRows(query: CuratedQuery): readonly CapabilityOverride[] {
  return matchingRows(CURATED, query);
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
