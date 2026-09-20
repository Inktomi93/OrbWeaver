// The PROVIDER axis — registry ROWS, data. OpenRouter, Anthropic, OpenAI, vLLM, LM Studio, Ollama, the BYO
// row: each is a `ProviderDef` parsed through ONE schema — the built-ins from `builtin-providers.ts`, a plugin's
// from its manifest, an admin's from `provider_rows`. Most rows are `wire: openai-compat` + a `features`
// block and need ZERO code; adding a provider is a JSON edit + the table test, never a `Record` entry.
//
// The id is HALF OF THE CREDENTIAL AAD (`${userId}|${provider}`), which is why built-ins are bare and
// runtime rows are namespaced (`plugin:<name>/<id>`): a plugin row can never shadow a built-in id and
// inherit its sealed rows (F8/F9, §5.9-1). A rename orphans the credentials sealed under the old id by
// construction; the pane says so.

import { z } from "zod";
import type { ChatApi } from "./apis.ts";
import { BUILTIN_PROVIDER_ROWS } from "./builtin-providers.ts";
import type { ProviderDef } from "./provider-schema.ts";
import { isPluginProviderId, providerDefSchema } from "./provider-schema.ts";
import type { Task } from "./tasks.ts";
import { WIRE_DEFS } from "./wires.ts";

/** A built-in row's id is bare — a plugin row's is namespaced. The parse refuses the other spelling in each
 *  place so the two populations can never cross (§5.9-1 (a)/(b)). */
export const builtinProviderDefSchema = providerDefSchema.refine((row) => !isPluginProviderId(row.id), {
  message: "a built-in provider id is bare, never plugin:-namespaced",
  path: ["id"],
});

/** The shipped rows, parsed ONCE at module load through the same schema a plugin or admin row goes
 *  through. A malformed row is a boot failure, not a runtime surprise. */
export const BUILTIN_PROVIDERS: readonly ProviderDef[] = z.array(builtinProviderDefSchema).parse(BUILTIN_PROVIDER_ROWS);

const BUILTIN_BY_ID: ReadonlyMap<string, ProviderDef> = new Map(BUILTIN_PROVIDERS.map((row) => [row.id, row]));

export function builtinProvider(id: string): ProviderDef | undefined {
  return BUILTIN_BY_ID.get(id);
}

/** The apis a provider's rows may pick — the ONE coherence home (no `assertCoherent` matrix, no client
 *  mirror): the picker offers this, the write validates against it, resolve re-checks it. */
export function coherentApis(provider: ProviderDef): readonly ChatApi[] {
  return provider.apis;
}

/** Provider-level: what the PICKER may offer — the wire's ceiling ∩ the row's narrowing (F5). */
export function providerTasks(provider: ProviderDef): readonly Task[] {
  const wire: readonly Task[] = WIRE_DEFS[provider.wire].serves;
  return provider.serves === undefined ? wire : wire.filter((task) => provider.serves?.includes(task) === true);
}
