// The provider-row SCHEMA + id brand — split from the registry (`providers.ts`) so the shipped row module can
// `satisfies` the input shape without importing the registry that parses it (no cycle). See `providers.ts`
// for the doctrine (rows are data, the id is half the credential AAD, namespaced plugin ids).

import type { Branded } from "@orb/kit/ids";
import { z } from "zod";
import type { ChatApi } from "./apis.ts";
import { CHAT_APIS } from "./apis.ts";
import { endpointFeaturesSchema } from "./features.ts";
import type { Task } from "./tasks.ts";
import { TASKS } from "./tasks.ts";
import type { Wire } from "./wires.ts";
import { WIRE_DEFS, WIRES } from "./wires.ts";

/** Built-ins are bare `[a-z0-9-]+`; runtime rows are `plugin:<name>/<id>`. */
export const PROVIDER_ID = /^(?:[a-z0-9-]+|plugin:[a-z0-9-]+\/[a-z0-9-]+)$/;
const PLUGIN_PROVIDER_ID = /^plugin:([a-z0-9-]+)\/[a-z0-9-]+$/;

/** A registry id — branded so a bare string never flows where a validated provider id is expected.
 *  Validated at the producer against the registry, NO SQL CHECK (a plugin row is runtime data — a CHECK
 *  would be the closed-`BACKEND_KEYS` mistake again; §5.3c class 2). */
export type ProviderId = Branded<"ProviderId">;
export const providerIdSchema: z.ZodType<ProviderId, string> = z
  .string()
  .regex(PROVIDER_ID, "a provider id is bare [a-z0-9-]+ (built-in) or plugin:<name>/<id>") as unknown as z.ZodType<ProviderId, string>;

export function isPluginProviderId(id: string): boolean {
  return PLUGIN_PROVIDER_ID.test(id);
}

/** The plugin NAME segment of a namespaced id, or `undefined` for a built-in id. */
export function pluginNameOfProviderId(id: string): string | undefined {
  return PLUGIN_PROVIDER_ID.exec(id)?.[1];
}

/** WHICH TRANSPORT PACKAGE speaks the `openai-compat` wire — nothing else. A server's quirks are `features`. */
export const DIALECTS = ["openai-compatible", "openrouter"] as const;
export type Dialect = (typeof DIALECTS)[number];

/** How a row authenticates. `endpoint` = a base URL + an OPTIONAL bearer (vLLM `--api-key`, LM Studio, a
 *  proxied Ollama); `oauthToken` = a pasted `claude setup-token`; `none` = in-process. */
export const PROVIDER_AUTHS = ["apiKey", "oauthToken", "endpoint", "none"] as const;
export type ProviderAuth = (typeof PROVIDER_AUTHS)[number];

/** Where a row's model list comes from. `url` = `GET <baseUrl>/v1/models` (the provider's fixed URL for a
 *  hosted row, the CONNECTION's for an endpoint row) with the typed-id fallback when it fails or lists
 *  nothing; `builtin` = the in-process runtime's bundled list. There is no "user types an id" strategy —
 *  typing is `url`'s fallback and the pane says so. */
export const CATALOG_STRATEGIES = ["url", "builtin"] as const;
export type CatalogStrategy = (typeof CATALOG_STRATEGIES)[number];

interface RowIssue {
  readonly path: string[];
  readonly message: string;
}

interface RawRow {
  readonly wire: Wire;
  readonly dialect?: Dialect | undefined;
  readonly auth: ProviderAuth;
  readonly baseUrl?: string | undefined;
  readonly apis: readonly ChatApi[];
  readonly serves?: readonly Task[] | undefined;
}

/** `apis` ⊆ the wire's apis, `serves` ⊆ the wire's ceiling. */
function wireIssues(row: RawRow): RowIssue[] {
  const wire = WIRE_DEFS[row.wire];
  return [
    ...row.apis.filter((api) => !wire.apis.includes(api)).map((api) => ({ path: ["apis"], message: `api "${api}" is not spoken by the "${row.wire}" wire` })),
    ...(row.serves ?? [])
      .filter((task) => !wire.serves.includes(task))
      .map((task) => ({ path: ["serves"], message: `task "${task}" is not served by the "${row.wire}" wire` })),
  ];
}

/** A dialect names the openai-compat transport package and exists nowhere else. */
function dialectIssues(row: RawRow): RowIssue[] {
  if (row.wire === "openai-compat" && row.dialect === undefined) {
    return [{ path: ["dialect"], message: "an openai-compat row names its transport package" }];
  }
  if (row.wire !== "openai-compat" && row.dialect !== undefined) {
    return [{ path: ["dialect"], message: `dialect is an openai-compat concern; the "${row.wire}" wire has one converter` }];
  }
  return [];
}

/** An endpoint row takes its URL from the connection; a hosted HTTP row carries its fixed URL; the agent-sdk
 *  wire is a SUBPROCESS, not an HTTP host — its `oauthToken` row has no base URL (the runtime dials Anthropic
 *  itself), so the hosted rule is keyed on the wire. */
function baseUrlIssues(row: RawRow): RowIssue[] {
  if (row.auth === "endpoint" && row.baseUrl !== undefined) {
    return [{ path: ["baseUrl"], message: "an endpoint row takes its base URL from the connection" }];
  }
  if (row.wire === "agent-sdk") {
    return row.baseUrl === undefined ? [] : [{ path: ["baseUrl"], message: "the agent-sdk wire is a subprocess and carries no base URL" }];
  }
  if (row.auth !== "endpoint" && row.auth !== "none" && row.baseUrl === undefined) {
    return [{ path: ["baseUrl"], message: "a hosted row carries its fixed base URL" }];
  }
  return [];
}

export const providerDefSchema = z
  .object({
    id: providerIdSchema,
    label: z.string().min(1),
    wire: z.enum(WIRES),
    dialect: z.enum(DIALECTS).optional(),
    /** Shipped defaults for this provider's servers; a connection overrides any field in `declared.features`. */
    features: endpointFeaturesSchema.optional(),
    auth: z.enum(PROVIDER_AUTHS),
    /** Fixed for hosted rows; ABSENT ⇒ the connection supplies it (`auth: endpoint`). */
    baseUrl: z.url().optional(),
    /** ⊆ `WIRE_DEFS[wire].apis`, checked below. */
    apis: z.array(z.enum(CHAT_APIS)),
    /** ⊆ `WIRE_DEFS[wire].serves`; ABSENT ⇒ the whole wire set. Hosted rows NARROW it (OpenAI has no
     *  `/rerank`). Never widens the wire — pinned. */
    serves: z.array(z.enum(TASKS)).optional(),
    catalog: z.enum(CATALOG_STRATEGIES),
    metered: z.boolean(),
    docsUrl: z.url().optional(),
  })
  .superRefine((row, ctx) => {
    for (const issue of [...wireIssues(row), ...dialectIssues(row), ...baseUrlIssues(row)]) {
      ctx.addIssue({ code: "custom", ...issue });
    }
  });
export type ProviderDef = z.infer<typeof providerDefSchema>;
/** The AUTHORING shape (`z.input`) the built-in row module `satisfies`. */
export type ProviderDefInput = z.input<typeof providerDefSchema>;
