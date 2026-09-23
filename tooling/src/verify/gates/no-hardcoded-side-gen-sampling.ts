// The side-gen sampling ladder seal: a side-generation call site resolves its posture through the ONE
// ladder (`resolveSideGenSampling` folding the `SIDE_GEN_POSTURES` floor under the caller's preset params),
// never a buried constant — a literal is a value the user's own generation params can never override. The
// KEY vocabulary is the subject BY DESIGN (an untyped `{ temperature: 0.3 }` options bag has no contextual
// type to key on, and it is the exact shape the burn-down removed). What the shared readers add is the
// VALUE: a number one binding hop away is the same buried constant, unless it derives from the CATALOG.
//
// FAMILY `no-hardcoded-side-gen-sampling` — a declared SINGLETON. Its verdict is a VOCABULARY judgement with
// an object-level corroboration rule (`maxTokens` is a sampling knob only beside an unambiguous one), which
// nothing else in the corpus computes. It consumes `_shared/reference-fact.ts` (static numbers, module origin)
// and `lib/property-assignment-name.ts`; a shared reader is not a family (guide §2).
//
// POPULATION PORT: byte-identical, legacy at `0d83d99f1^` — that `scanRoot` admitted
// `packages/server/src/domain/**` and `packages/server/src/entry/**` minus every `*.test.ts`/`*.test.tsx`
// basename, with `infra/` deliberately outside. The final `SIDE_GEN_POPULATION` is that set, and BOTH of its
// clauses now own a mustPass row (the `infra/` wire translator, and a co-located spec).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-hardcoded-side-gen-sampling` descriptor at ef22519578607c76a03196f343fb025520c796a5, the parent of the
// conversion `0d83d99f1` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,186 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 1,229 and final `population` admits 1,229. legacy − final = ∅. final − legacy = ∅. Controls:
// inside `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStaticNumber, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { propertyAssignmentName } from "../lib/property-assignment-name.ts";

/** The knobs that name a sampling posture and NOTHING else. */
const UNAMBIGUOUS_SAMPLING_KEYS = new Set(["temperature", "maxOutputTokens", "topP"]);
/** `maxTokens` is SHARED VOCABULARY: it is the summarize seam's output cap AND the canon-window budget
 *  `ResolveCanonWindow` takes (`chat/contract/context.ts`). Which word names which concept is not decided
 *  here (AGENTS.md §3 → docs/design/vocabulary-map.md), so the policy asks the OBJECT to corroborate:
 *  `maxTokens` is a sampling knob when its own literal also carries an unambiguous one. A lone
 *  `{ maxTokens }` is a DECLARED LIMIT with its row — the live `rpg/verbs/game/resync-from-story.ts`
 *  transcript budget is exactly that shape, and accusing it would be a confident false positive. */
const AMBIGUOUS_SAMPLING_KEYS = new Set(["maxTokens"]);
const SAMPLING_KEYS = new Set([...UNAMBIGUOUS_SAMPLING_KEYS, ...AMBIGUOUS_SAMPLING_KEYS]);

/** The two homes that OWN side-gen floor data: the `SIDE_GEN_POSTURES` catalog and the pure ladder. A value
 *  derived from either is the sanctioned rung, not a buried constant. */
const CATALOG_HOMES = ["/packages/contracts/src/preset/", "/packages/kit/src/side-gen-posture/"];

const MESSAGE =
  "hardcoded side-gen sampling value — a side-generation call must resolve its posture through the ladder " +
  "(resolveSideGenSampling + SIDE_GEN_POSTURES from @orb/contracts/preset), never a buried constant (the " +
  "user's preset params could never override it).";

const FIX =
  "read the floor from SIDE_GEN_POSTURES.<kind> and fold it through resolveSideGenSampling(floor, presetParams); " +
  "pass the resolved posture to the seam as-is. A deliberate site is waived " +
  "with `@orb-waive no-hardcoded-side-gen-sampling(<position>): <reason>` on the line above, where " +
  "<position> is the hardcoded sampling param's own key name (e.g. `temperature`, `maxOutputTokens`, `topP`).";

/** Legacy `scanRoot` admitted `packages/server/src/domain/**` and `packages/server/src/entry/**` minus every
 *  `*.test.ts`/`*.test.tsx` basename; `infra/` is deliberately outside — it is the wire/usage-accounting
 *  layer that legitimately names these fields. */
const SIDE_GEN_POPULATION = {
  in: ["@server"],
  under: ["packages/server/src/domain/**", "packages/server/src/entry/**"],
  notNamed: ["*.test.ts", "*.test.tsx"],
} as const;

/** Does the object literal this property belongs to carry an UNAMBIGUOUS sampling knob? That is the
 *  corroboration the shared `maxTokens` word needs before it can be read as a generation cap. */
function inSamplingBag(property: MorphNode): boolean {
  const bag = property.getParent();
  if (!Node.isObjectLiteralExpression(bag)) {
    return false;
  }
  return bag.getProperties().some((sibling) => {
    const name = propertyAssignmentName(sibling);
    return name !== null && UNAMBIGUOUS_SAMPLING_KEYS.has(name);
  });
}

/** Does this value DERIVE from the catalog? A named export of the preset catalog or the pure ladder is the
 *  sanctioned rung even when it resolves to a number; anything else that resolves to a number is authored
 *  at the call site or one hop away, which is exactly what the ladder replaced. */
function derivesFromCatalog(initializer: MorphNode): boolean {
  const origin = resolveModuleMemberOrigin(initializer);
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project") {
    return false;
  }
  const path = origin.value.canonical.sourceFile.getFilePath().replaceAll("\\", "/");
  return CATALOG_HOMES.some((home) => path.includes(home));
}

export const gate = defineGate({
  id: "no-hardcoded-side-gen-sampling",
  family: "no-hardcoded-side-gen-sampling",
  authority: "ordinary",
  severity: "error",
  population: SIDE_GEN_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          const name = Node.isPropertyAssignment(node) ? propertyAssignmentName(node) : null;
          if (name === null || !SAMPLING_KEYS.has(name) || !Node.isPropertyAssignment(node)) {
            return;
          }
          if (AMBIGUOUS_SAMPLING_KEYS.has(name) && !inSamplingBag(node)) {
            return;
          }
          const initializer = node.getInitializer();
          if (initializer === undefined || readStaticNumber(initializer).kind !== "resolved" || derivesFromCatalog(initializer)) {
            return;
          }
          const nameNode = node.getNameNode();
          ctx.report.node(nameNode, { token: name, offset: nameNode.getText().indexOf(name) });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/thing.ts": "export const opts = { temperature: 0.3, maxTokens: 24 };\n" },
      expect: { count: 2, token: "temperature" },
      why: "the founding shape — hardcoded `temperature` + `maxTokens` at a domain side-gen call site, on an options bag with no contextual type at all, which is why the KEY vocabulary is the subject",
    },
    {
      mode: "types",
      files: { "packages/server/src/entry/compose/thing.ts": "export const opts = { maxOutputTokens: 1024 };\n" },
      expect: { count: 1, token: "maxOutputTokens" },
      why: "the ladder's own output vocabulary (`maxOutputTokens`) hardcoded at a compose seam — the same defect on the other side of the field-name mapping",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/signed.ts": "export const opts = { temperature: -1 };\n" },
      expect: { count: 1, token: "temperature" },
      why: "a UNARY-SIGNED number is still an authored constant — the shared numeric reader carries the sign so the literal-node check cannot be dodged with a minus",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/hoisted.ts": "const ARBITER_TEMPERATURE = 0.3;\nexport const opts = { temperature: ARBITER_TEMPERATURE };\n",
      },
      expect: { count: 1, token: "temperature" },
      why: "THE HOISTED CONSTANT — a floor value authored in the server tree and named locally is exactly the buried constant the ladder replaced. The legacy numeric-literal-node check answered 'not my subject' to a binding, which is one extraction away from every site",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/computed-key.ts": 'export const opts = { ["topP"]: 0.9 };\n' },
      expect: { count: 1, token: "topP" },
      why: 'a COMPUTED key names the same knob — `getName()` answered `["topP"]` and the legacy comparison said no',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/rpg/verbs/game/window.ts":
          "const RPG_RESYNC_MAX_TOKENS = 24000;\ndeclare function resolveCanonWindow(chatId: string, opts: { readonly maxTokens: number }): Promise<readonly string[]>;\nexport const read = async (chatId: string): Promise<readonly string[]> => resolveCanonWindow(chatId, { maxTokens: RPG_RESYNC_MAX_TOKENS });\n",
      },
      why: "THE SHARED-WORD CONTROL — `maxTokens` also names the CANON-WINDOW budget (`ResolveCanonWindow`), which is a transcript size, not a generation cap. A lone `{ maxTokens }` carries no unambiguous sampling sibling to corroborate it, so it is out of subject; the live `resync-from-story.ts` deep-read is exactly this shape and the value-following widening would otherwise have accused it",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/preset/index.ts": "export const SIDE_GEN_POSTURES = { arbiter: { temperature: 0.2 } };\n",
        "packages/server/src/domain/chat/verbs/catalog.ts":
          'import { SIDE_GEN_POSTURES } from "../../../../../contracts/src/preset/index.ts";\nexport const p = SIDE_GEN_POSTURES.arbiter;\n',
      },
      why: "reading the catalog floor is the sanctioned rung — there is no authored number at the call site at all",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/preset/index.ts": "export const ARBITER_TEMPERATURE = 0.2;\n",
        "packages/server/src/domain/chat/verbs/catalog-scalar.ts":
          'import { ARBITER_TEMPERATURE } from "../../../../../contracts/src/preset/index.ts";\nexport const opts = { temperature: ARBITER_TEMPERATURE };\n',
      },
      why: "THE CATALOG COUNTERFACTUAL that makes the hoisted-constant arm safe: the same shape, the same resolved number, differing only in WHERE the value is declared. A floor named by the catalog home is data; one named in the server tree is a buried constant. Deleting the catalog-home check turns this row red",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/resolved.ts":
          "declare function resolveSideGenSampling(floor: unknown, params?: unknown): { readonly temperature?: number };\ndeclare const floor: unknown;\nexport const opts = { temperature: resolveSideGenSampling(floor).temperature };\n",
      },
      why: "a value the ladder RESOLVED is a member read of a call result — the shared reader refuses it, so the sanctioned fold is never mistaken for a literal",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/other-knob.ts": 'export const opts = { model: "x", topK: 40 };\n' },
      why: "`topK` is not in the ladder vocabulary — an unrelated numeric knob is out of subject, which is what keeps a key-scoped policy from becoming a numeric-literal ban",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/waived.ts":
          "// @orb-waive no-hardcoded-side-gen-sampling(temperature): a provider handshake probe that must pin a deterministic value; ends when the probe rides the ladder's own floor.\nexport const opts = { temperature: 0 };\n",
      },
      why: "the ONE central positioned waiver naming the exact reported knob — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/side-gen-posture/floor.ts": "export const SUMMARIZE_TEMPERATURE = 0.3;\n",
        "packages/server/src/domain/chat/memory/summarize.ts":
          'import { SUMMARIZE_TEMPERATURE } from "../../../../../kit/src/side-gen-posture/floor.ts";\nexport const opts = { temperature: SUMMARIZE_TEMPERATURE };\n',
      },
      why: "THE SECOND `CATALOG_HOMES` ENTRY, which no row exercised (w9 :262, #2046). `packages/kit/src/side-gen-posture/` is the PURE LADDER's home — the other half of the sanctioned rung beside the preset catalog — and a floor named there is data, not a buried constant. A declared list entry no row derives from is the entry a future re-home deletes silently, so each home now owns a row: dropping this one reds this row and dropping the preset one reds the `catalog-scalar.ts` row above",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/anchor.ts": 'export const opts = { model: "x", topK: 40 };\n',
        "packages/server/src/infra/providers/backends/wire.ts": "export const body = { temperature: 0.3, topP: 0.9 };\n",
      },
      why: "THE POPULATION FENCE, `under` half — the same authored sampling literals inside `packages/server/src/infra/**`, beside an in-population anchor. `infra/` is the WIRE and usage-accounting layer: it legitimately names these fields because it is TRANSLATING a resolved posture onto a provider body, not choosing one. The ladder seal binds the callers (`domain/`, `entry/`), which is why the population is those two subtrees rather than `@server`. Widening `under` to all of `packages/server/src/**` reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/anchor.ts": 'export const opts = { model: "x", topK: 40 };\n',
        "packages/server/src/domain/chat/verbs/posture.test.ts": "export const opts = { temperature: 0.3 };\n",
      },
      why: "THE POPULATION FENCE, `notNamed` half — the same literal in a co-located spec, beside an in-population anchor. A test that asserts what the ladder RESOLVES to must be free to spell the expected posture; the seal is about what a production call site may author. Dropping the `*.test.ts`/`*.test.tsx` exclusion reds this row (w9 :262, #2046)",
    },
  ],
});
