// contract-field-liveness: contracts fields DECLARED but never POPULATED (informational).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { FieldHitClass } from "../contract/fields.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, narrate } from "../lib/emit.ts";
import { modelProjectedSchemas } from "../lib/field-seeds.ts";
import { CONTRACTS_SRC, contractFieldsOf, fieldClass, fieldHit, fieldIndexes, isCompositionAlias } from "../lib/fields.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** Contract fields no producer ever populates. INFORMATIONAL — read the call sites (and remember the
 *  template-literal blind spot) before acting. Optional scope = a contracts path or a field-name substring;
 *  bare = every field in `packages/contracts/src`. Never exits non-zero on findings. */
export function cmdContractFieldLiveness(project: SourceCorpus, arg: string, flags: Flags): void {
  const files = scanCorpus(project, { scope: CONTRACTS_SRC, label: "path:packages/contracts/src" });
  const all = files.flatMap(contractFieldsOf);
  const fields = arg === "" ? all : all.filter((f) => f.name.includes(arg) || f.node.getSourceFile().getFilePath().includes(arg));
  noteUnits("contract fields", fields.length);
  if (fields.length === 0) {
    exitToolError(
      `ast contract-field-liveness: scope "${arg}" matched no contract field — pass a field-name substring (maxPatternSize), a contracts path (contracts/src/chat), or run bare for all ${all.length}.`,
    );
  }
  const indexes = fieldIndexes(project);
  const modelProjected = modelProjectedSchemas(project);
  const hits: Hit[] = [];
  const fenced = new Set<string>();
  const classes = new Map<FieldHitClass, number>();
  let fencedHits = 0;
  let aliasFenced = 0;
  for (const field of fields) {
    const hit = fieldHit(field, indexes);
    if (hit === undefined) {
      continue;
    }
    // The #879 composition-alias fence sits HERE, beside the model-projection fence, so its exclusion is a
    // printed COUNT rather than a silent swallow inside the collector.
    if (isCompositionAlias(field, indexes)) {
      aliasFenced += 1;
      continue;
    }
    if (modelProjected.has(field.owner)) {
      fenced.add(field.owner);
      fencedHits += 1;
      continue;
    }
    const cls = fieldClass(field, indexes);
    classes.set(cls, (classes.get(cls) ?? 0) + 1);
    hits.push(hit);
  }
  const tally = [...classes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cls, n]) => `${cls}=${n}`);
  const fencedOwners = [...fenced].sort();
  narrate(
    flags,
    `contract-field-liveness is an INFORMATIONAL lens — it NEVER gates. A field here is one NO producer spells outside its own declaration; two classes are separated by whether anything SPELLS its name as a read. BLIND SPOTS, stated: a TEMPLATE-LITERAL producer is invisible (TanStack Form's \`name={\\\`sections[\${i}].field\\\`}\` is a real write path no key index can see — the PLAIN \`name="field"\` attribute and \`setFieldValue("a.b", v)\` ARE indexed), a SAME-NAMED field anywhere hides a finding (this lens under-reports, never over-), reader attribution is NAME-matched and never type-resolved (a same-named property on another shape reads as a consumer), brand phantom-symbols are skipped as computed names, and a \`{ ...spread }\` producer names no key. TESTS ARE NOT PRODUCERS (the \`testonly\`/\`regkeys\` rule): a field only a fixture constructs is exactly the RepetitionDetection shape, so it is REPORTED, not absolved. The fence is the DECLARATION SITE, never a package — \`contracts\` legitimately holds pure builders (the audit's wrong package-fence produced 27 false hits). A wire-INPUT-only schema (a tRPC \`.input\`, a plugin-guest DTO) is still REPORTED: fencing by router input would fence most of contracts. Prototype + the two real findings: 2026-08-18 §5; the 70-hit read that shaped the producer index: 2026-08-19 (${fields.length} field(s) examined over ${files.length} contracts file(s).)`,
  );
  narrate(
    flags,
    fencedOwners.length === 0
      ? "MODEL-PROJECTED FENCE: 0 hit(s) excluded — no examined field belongs to a schema this repo projects to a model."
      : `MODEL-PROJECTED FENCE: ${fencedHits} hit(s) EXCLUDED (not counted below) across ${fencedOwners.length} schema(s) whose keys a MODEL writes — projected via projectJsonSchema/z.toJSONSchema or registered as a tool \`argsSchema\`, so no on-tree producer exists by construction: ${fencedOwners.join(", ")}.`,
  );
  narrate(
    flags,
    `SCHEMA-COMPOSITION-ALIAS FENCE (#879): ${aliasFenced} hit(s) EXCLUDED (not counted below) — a declared schema REUSED under another wire name (the live shape is preset's \`thresholdPct: generationKnobSchemas.compactionThresholdPct\`), whose own name has no producer BY CONSTRUCTION. Owner-matched, so an ordinary \`dims: block.dims\` pass-through is NOT absolved (tooling/src/ast/lib/fields.ts).`,
  );
  narrate(
    flags,
    `HIT CLASSES (#879 — derived, never declared; only \`unclassified\` is worth a human read): ${tally.length === 0 ? "none (no hit survived the fences)" : tally.join(" · ")}. ` +
      "`template-key` = a corpus template literal brackets the name, so the producer BUILDS the key and no key index can see it; " +
      "`guest` = the plugin key space, whose producer is a guest; `foreign-format` = an ST / character-card schema, produced by a foreign file. " +
      "A `dormant-cited` class is DELIBERATELY ABSENT — nothing in contracts EXPRESSES dormancy, so those hits stay `unclassified` rather than " +
      "wear a label inferred from prose (tooling/src/ast/lib/fields.ts).",
  );
  emit(hits, flags, `contract-field-liveness ${arg === "" ? "(all contract fields)" : arg}`);
}
