// Verify owns schema population, provider receipt and discovery withholding, not schema extraction.
import type { CallExpression, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SchemaIdentityModel } from "../../floor/code-facts/schema-identity-contract.ts";
import type { SchemaFact } from "../../floor/code-facts/schema-model-contract.ts";
import type { SchemaDataProjection, SchemaProjectedModel } from "../../floor/code-facts/schema-projection-contract.ts";
import { queryForCalls, schemaTableCall, unresolvedDiscovery } from "../../floor/code-facts/schema-query.ts";
import type { GateFact } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import type { SchemaQuery } from "../contract/schema-fact.ts";

/** The provider receipt states the denominator this collector actually MEASURED — the authored schema
 *  sources it walked — and nothing about what the census FOUND.
 *
 *  WHY NOT THE CENSUS: it was `members: <tables + columns + foreign keys + indexes>` plus an `unresolved`
 *  flag raised for a `missing`/`unresolved` fact, until 2026-09-11. `factReceiptFailures`
 *  (`lib/policy-pass.ts:641`) refuses a fact receipt with `members === 0` (`:631`) or `unresolved > 0`
 *  (`:635`) and `withholdFactDependents` (`:679`) drops every consumer BEFORE `evaluate` (`:821-822`), so a
 *  schema tree that declares no table — or one the reader could not follow — preempted the very policies
 *  that exist to report it. Both numbers are this fact's own MODELLED VALUE (`SchemaFact.status` plus the
 *  `SchemaFactReceipt` the fact PUBLISHES to consumers, which is a different object from this receipt), and
 *  both already have fail-closed owners: every ordinary consumer calls `recordReadySchemaFact`, which throws
 *  on any non-`ready` status, and `freeze-provenance-write-pairing-health` (hard/error) REPORTS a schema
 *  tree that no longer declares its guarded table. That arm — blindness mode B — was recorded as BLOCKED in
 *  that module's header for exactly this reason (#1962); it is enabled in the same commit as this line.
 *
 *  WHY THE CONSUMER CAN OWN THIS AND THE PROVIDER CANNOT — the ordering, which is the non-obvious fact the
 *  whole rule rests on: `evaluateRuns` (`lib/policy-pass.ts:721-733`) runs a policy's `evaluate`, THEN
 *  collects its receipts, THEN judges them. A consumer therefore REPORTS FIRST and refuses after, so one
 *  cause yields a finding OR a refusal by the consumer's own choice. `finishFactRuns` (`:668-686`) does the
 *  reverse for a provider — it judges the receipt before any consumer runs — so a provider receipting its
 *  census can only ever preempt. Same shape, opposite order, and that is the entire asymmetry.
 *
 *  WHAT THE REFUSAL STILL BITES: a population admitting zero authored paths — the provider genuinely could
 *  not look, which no consumer can distinguish from a schema tree that honestly declares nothing. That
 *  refusal is per-provider and fires one phase EARLIER, at population. Same ruling, same reason as
 *  `bus-fact.ts#PROVIDER_RECEIPT_SOURCE` (#1955) and `registry-fact.ts` (#1953).
 *
 *  WHAT THE RUNTIME DOES NOT BACKSTOP, so a reviewer must: `policyReceiptFailures` has no "policy produced
 *  no semantic receipt" arm (`factReceiptFailures` does), so a consumer that declares this fact, reads it and
 *  files NO receipt renders a clean verdict over an EMPTY census — measured, and pinned as the fail-open
 *  shape in `tests/tooling/verify/lib/schema-fact.test.ts`. What keeps THIS provider's guarantee universal is
 *  the shared helper: all 18 consumers call `recordReadySchemaFact`, which throws on any non-`ready` status
 *  and files the census receipt. A new consumer that skips it inherits no blindness door. */
const PROVIDER_RECEIPT_SOURCE = "drizzle-schema-sources";

/** THE ONE HOME for this family's §5b.5 POPULATION-PORT delta, so no member re-derives it and no member
 *  claims it byte-identical when it is not.
 *
 *  Every consumer declares THIS constant rather than re-spelling the globs — which is also what guide
 *  §4.5b's third structural gap asks for, since nothing checks that a provider's population is a subset of
 *  its consumers' and a consumer that narrowed below the provider would be handed nodes it may not NAME.
 *
 *  Against the legacy descriptors this population is an INTENTIONAL WIDENING BY EXACTLY ONE PATH, and it is
 *  lossless. The legacy schema gates scoped either by `floor/code-facts/schema-read.ts`'s `isSchemaFile`
 *  (`/^packages\/db\/src\/schema\/[^/]+\.ts$/` MINUS the barrel) or by the regex
 *  `/\/packages\/db\/src\/schema\//` (barrel included); `under: ["packages/db/src/schema/**"]` admits both
 *  plus any nested directory. Measured 2026-09-12 on the tracked tree: the directory holds 30 files and
 *  ZERO nested paths, and the ONE path the `isSchemaFile` form excluded —
 *  `packages/db/src/schema/index.ts`, the re-export barrel — carries ZERO `sqliteTable(` calls against 97
 *  across the other 29 files (that 97 is the positive control proving the search reached the directory).
 *  So the added path contributes no table, no column and no finding to any member. */
export const DRIZZLE_SCHEMA_POPULATION = {
  in: ["@db"],
  under: ["packages/db/src/schema/**"],
} as const;

export const drizzleSchemaFact = defineFact({
  id: "drizzle-schema",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const calls: { declaration: VariableDeclaration; call: CallExpression }[] = [];
    let discoveryError: unknown;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!Node.isVariableDeclaration(node) || discoveryError !== undefined) {
              return;
            }
            // @orb-waive caught-failure-ownership(error): FK resolution error: surfaced as a structured tool-error in the schema-fact report; the broken FK is excluded from the fact census
            try {
              const call = schemaTableCall(node, sourceFile);
              if (call !== null) {
                calls.push({ declaration: node, call });
              }
            } catch (error) {
              discoveryError = error;
            }
          },
        },
      ],
      finish: (): SchemaQuery => {
        const query = discoveryError === undefined ? queryForCalls(ctx, calls) : unresolvedDiscovery(ctx, discoveryError);
        ctx.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: ctx.files.length });
        return query;
      },
    };
  },
});

/** Type-free consumers retain the complete extractor's census, while its native DB world owns extraction. */
export const drizzleSchemaIdentityFact = defineFact({
  id: "drizzle-schema-identities",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  resources: [],
  create: (ctx) => {
    if (ctx.nativeTypes === undefined) {
      throw new Error("native schema identity context is unavailable");
    }
    ctx.nativeTypes.request({ kind: "schema-identities", nodes: ctx.files });
    return {
      finish: (): SchemaFact<SchemaIdentityModel> => {
        if (ctx.nativeTypes === undefined) {
          throw new Error("native schema identity context is unavailable");
        }
        const fact = ctx.nativeTypes.schemaIdentity(ctx.files);
        ctx.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: ctx.files.length });
        return fact;
      },
    };
  },
});

/** Type-free catalog consumers do not request extra selected-Type observations. */
export const drizzleSchemaDataFact = schemaDataFact("drizzle-schema-data");
/** JSON vocabulary requests bind the actual canonical override Type inside its native catalog owner. */
export const drizzleSchemaVocabularyFact = schemaDataFact("drizzle-schema-vocabulary", { typeVocabulary: true });

function schemaDataFact(id: string, projection: SchemaDataProjection = {}): GateFact<SchemaFact<SchemaProjectedModel>> {
  return defineFact({
    id,
    population: DRIZZLE_SCHEMA_POPULATION,
    analysis: "types",
    resources: [],
    create: (ctx) => {
      if (ctx.nativeTypes === undefined) {
        throw new Error("native full schema data context is unavailable");
      }
      ctx.nativeTypes.request({
        kind: "schema-data",
        nodes: ctx.files,
        ...(projection.typeVocabulary === true || projection.builderConfig === true ? { projection } : {}),
      });
      return {
        finish: (): SchemaFact<SchemaProjectedModel> => {
          if (ctx.nativeTypes === undefined) {
            throw new Error("native full schema data context is unavailable");
          }
          const fact = ctx.nativeTypes.schemaData(ctx.files, projection);
          ctx.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: ctx.files.length });
          return fact;
        },
      };
    },
  });
}
