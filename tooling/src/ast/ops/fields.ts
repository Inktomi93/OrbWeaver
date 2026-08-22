// contract-field-liveness: contracts fields DECLARED but never POPULATED (informational).
import type { Project } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit } from "../lib/emit.ts";
import { modelProjectedSchemas } from "../lib/field-seeds.ts";
import { CONTRACTS_SRC, contractFieldsOf, fieldHit, fieldIndexes } from "../lib/fields.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";

/** Contract fields no producer ever populates. INFORMATIONAL — read the call sites (and remember the
 *  template-literal blind spot) before acting. Optional scope = a contracts path or a field-name substring;
 *  bare = every field in `packages/contracts/src`. Never exits non-zero on findings. */
export function cmdContractFieldLiveness(project: Project, arg: string, flags: Flags): void {
  const files = scanCorpus(project, { scope: CONTRACTS_SRC, label: "path:packages/contracts/src" });
  const all = files.flatMap(contractFieldsOf);
  const fields = arg === "" ? all : all.filter((f) => f.name.includes(arg) || f.node.getSourceFile().getFilePath().includes(arg));
  noteUnits("contract fields", fields.length);
  if (fields.length === 0) {
    exitToolError(
      `ast contract-field-liveness: scope "${arg}" matched no contract field — pass a field-name substring (maxPatternSize), a contracts path (contracts/src/chat), or run bare for all ${all.length}.`,
    );
  }
  const { produced, consumed } = fieldIndexes(project);
  const modelProjected = modelProjectedSchemas(project);
  const hits: Hit[] = [];
  const fenced = new Set<string>();
  let fencedHits = 0;
  for (const field of fields) {
    const hit = fieldHit(field, produced, consumed);
    if (hit === undefined) {
      continue;
    }
    if (modelProjected.has(field.owner)) {
      fenced.add(field.owner);
      fencedHits += 1;
      continue;
    }
    hits.push(hit);
  }
  const fencedOwners = [...fenced].sort();
  print(
    `contract-field-liveness is an INFORMATIONAL lens — it NEVER gates. A field here is one NO producer spells outside its own declaration; two classes are separated by whether anything SPELLS its name as a read. BLIND SPOTS, stated: a TEMPLATE-LITERAL producer is invisible (TanStack Form's \`name={\\\`sections[\${i}].field\\\`}\` is a real write path no key index can see — the PLAIN \`name="field"\` attribute and \`setFieldValue("a.b", v)\` ARE indexed), a SAME-NAMED field anywhere hides a finding (this lens under-reports, never over-), reader attribution is NAME-matched and never type-resolved (a same-named property on another shape reads as a consumer), brand phantom-symbols are skipped as computed names, and a \`{ ...spread }\` producer names no key. TESTS ARE NOT PRODUCERS (the \`testonly\`/\`regkeys\` rule): a field only a fixture constructs is exactly the RepetitionDetection shape, so it is REPORTED, not absolved. The fence is the DECLARATION SITE, never a package — \`contracts\` legitimately holds pure builders (the audit's wrong package-fence produced 27 false hits). A wire-INPUT-only schema (a tRPC \`.input()\`, a plugin-guest DTO) is still REPORTED: fencing by router input would fence most of contracts. Prototype + the two real findings: docs/history/reviews/misc/2026-08-18-silent-reader-audit.md §5; the 70-hit read that shaped the producer index: docs/reviews/misc/2026-08-19-lens-triage-210.md. (${fields.length} field(s) examined over ${files.length} contracts file(s).)`,
  );
  print(
    fencedOwners.length === 0
      ? "MODEL-PROJECTED FENCE: 0 hit(s) excluded — no examined field belongs to a schema this repo projects to a model."
      : `MODEL-PROJECTED FENCE: ${fencedHits} hit(s) EXCLUDED (not counted below) across ${fencedOwners.length} schema(s) whose keys a MODEL writes — projected via projectJsonSchema/z.toJSONSchema or registered as a tool \`argsSchema\`, so no on-tree producer exists by construction: ${fencedOwners.join(", ")}.`,
  );
  emit(hits, flags, `contract-field-liveness ${arg === "" ? "(all contract fields)" : arg}`);
}
