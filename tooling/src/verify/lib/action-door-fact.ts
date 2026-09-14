// The ONE walk behind the `action-doors` family: which tRPC MUTATION doors exist, and which RAIL PLANE each
// one sits on. Both siblings read it — `duplicate-action-doors` (reviewed-grant, the door verdict) and
// `duplicate-action-doors-health` (hard, the two §4.6 blindness tripwires) — so the census and the tripwires
// can never disagree about what was measured. It is the family's canonical shared declaration.
//
// "WHICH VERB IS THIS SITE?" IS NOT DECIDED HERE. The creation-site grammar lives at
// `tooling/src/_shared/trpc-doors.ts` (`mutationProcedureOf`) and is SHARED with the `ast subset-callers`
// lens, which compares the PAYLOADS the doors this fact counts pass. Two spellings of "what is a door"
// would let the census and the lens disagree; there is one.
//
// THE VOCABULARY IS RESOLVED, NOT READ FLAT (#947): `SECTION_IDS` is read through `lib/tuple-read.ts`, so
// `[...CORE_SECTION_IDS, "home"]` contributes every id. A direct-element reader would leave the imported
// section planes out of the vocabulary — their definitions would stop being recognised as rail sections and
// every duplicate door on them would regroup under a feature directory, silently, with the vocabulary still
// non-empty and the blindness tripwire still satisfied.
//
// EMPTINESS IS NEVER THIS READER'S VERDICT. An absent `SECTION_IDS` declaration yields an EMPTY vocabulary
// and an empty plane map; `duplicate-action-doors-health` turns that into its tripwire. An UNSUPPORTED tuple
// shape throws out of `tuple-read.ts` and withholds both consumers, which is the same posture the legacy
// descriptor had.
import type { Node, SourceFile, VariableDeclaration } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { mutationProcedureOf } from "../../_shared/trpc-doors.ts";
import { defineFact } from "../contract/fact.ts";
import { readStringValue } from "./ast-read.ts";
import type { TupleVocabulary } from "./tuple-read.ts";
import { readTupleDeclaration } from "./tuple-read.ts";

/** The section VOCABULARY's ONE home (`no-parallel-section-map`'s sanctioned tuple) — read, never respelled. */
export const SECTION_IDS_HOME = "packages/client/src/state/section-ids.ts";
/** A co-located rail-section definition: `features/<owner>/lib/<id>-section.tsx`. */
const SECTION_FILE_RE = /^packages\/client\/src\/features\/([^/]+)\/lib\/[^/]+-section\.tsx$/u;
const FEATURE_DIR_RE = /^packages\/client\/src\/features\/([^/]+)\//u;
/** Fewer doors than this on one plane is not a duplication at all — the class definition, never a budget. */
export const MIN_DOORS = 2;

/** One door: the component file that wires the verb, and the creation site a finding anchors on. */
interface ActionDoorSite {
  readonly file: string;
  readonly node: Node;
}

/** One `<plane>::<procedure>` pair and every distinct component file that invokes it. The pair key is the
 *  grant SUBJECT and is unchanged from the retired ledger's row key, because the `ast subset-callers` lens
 *  joins on its procedure tail (`ast/ops/subset-callers.ts`). */
interface ActionDoorPair {
  readonly key: string;
  readonly doors: readonly ActionDoorSite[];
}

interface ActionDoorCensus {
  /** The resolved `SECTION_IDS` vocabulary, with the declaration manifest a receipt prints. */
  readonly vocabulary: TupleVocabulary;
  /** feature directory → the rail SectionId it owns. */
  readonly planes: ReadonlyMap<string, string>;
  /** Every pair, in stable key order — including the ones below the duplication floor, because the floor is
   *  the CONSUMER's class definition and a reader that pre-filtered would hide its own denominator. */
  readonly pairs: readonly ActionDoorPair[];
  /** Every door site censused — the family's admitted denominator. */
  readonly doorCount: number;
}

/** A `SectionDefinition` object literal carries BOTH an `id` and a `rail` field; `rail` is what separates a
 *  RAIL section from a settings-section contribution living in the same `lib/` with the same filename shape. */
function railSectionId(object: Node): string | undefined {
  const idProperty = MorphNode.isObjectLiteralExpression(object) && object.getProperty("rail") !== undefined ? object.getProperty("id") : undefined;
  return idProperty !== undefined && MorphNode.isPropertyAssignment(idProperty) ? readStringValue(idProperty.getInitializer() ?? idProperty) : undefined;
}

/** The `SECTION_IDS` tuple, resolved through the sanctioned spreads of local/imported sibling tuples. An
 *  absent declaration is an EMPTY vocabulary, which is the health sibling's tripwire, never a pass. */
function readVocabulary(declaration: VariableDeclaration | undefined): TupleVocabulary {
  if (declaration === undefined || declaration.getInitializer() === undefined) {
    return { members: new Set<string>(), entries: [], sources: [] };
  }
  return readTupleDeclaration(declaration);
}

/** One candidate rail-section definition, held until the vocabulary is known. */
interface SectionCandidate {
  readonly owner: string;
  readonly id: string;
}

export const actionDoorFact = defineFact({
  id: "action-door-census",
  // The doors live under `features/`; the vocabulary home and the sibling tuples its spreads resolve through
  // live under `state/`. Both consumers declare the SAME expression on purpose: a consumer narrower than its
  // provider is handed nodes it may not NAME, which is the `ctx.relativePath` throw (guide §3).
  population: { in: ["@client"], under: ["packages/client/src/features/**", "packages/client/src/state/**"] },
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const doors: { readonly key: string; readonly site: ActionDoorSite }[] = [];
    const rawDoors: { readonly file: string; readonly owner: string; readonly procedure: string; readonly node: Node }[] = [];
    const sections: SectionCandidate[] = [];
    let sectionIds: VariableDeclaration | undefined;

    const relative = (sourceFile: SourceFile): string => ctx.relativePath(sourceFile);

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!MorphNode.isCallExpression(node)) {
              return;
            }
            const file = relative(sourceFile);
            const owner = FEATURE_DIR_RE.exec(file)?.[1];
            if (owner === undefined) {
              return;
            }
            const procedure = mutationProcedureOf(node);
            if (procedure !== undefined) {
              rawDoors.push({ file, owner, procedure, node });
            }
          },
        },
        {
          kinds: [SyntaxKind.ObjectLiteralExpression],
          visit: (node, sourceFile) => {
            const owner = SECTION_FILE_RE.exec(relative(sourceFile))?.[1];
            const id = owner === undefined ? undefined : railSectionId(node);
            if (owner !== undefined && id !== undefined) {
              sections.push({ owner, id });
            }
          },
        },
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (MorphNode.isVariableDeclaration(node) && node.getName() === "SECTION_IDS" && relative(sourceFile) === SECTION_IDS_HOME) {
              sectionIds = node;
            }
          },
        },
      ],
      finish: (): ActionDoorCensus => {
        const vocabulary = readVocabulary(sectionIds);
        const planes = new Map<string, string>();
        for (const candidate of sections) {
          if (vocabulary.members.has(candidate.id) && !planes.has(candidate.owner)) {
            planes.set(candidate.owner, candidate.id);
          }
        }
        for (const raw of rawDoors) {
          // A feature with no rail section of its own is still ONE plane — its own subtree.
          const plane = planes.get(raw.owner) ?? `feature:${raw.owner}`;
          doors.push({ key: `${plane}::${raw.procedure}`, site: { file: raw.file, node: raw.node } });
        }
        const byKey = new Map<string, Map<string, ActionDoorSite>>();
        for (const door of doors) {
          const sites = byKey.get(door.key) ?? new Map<string, ActionDoorSite>();
          // THE UNIT IS THE COMPONENT, not the call: one file wiring the same verb twice is one door,
          // because a user sees one affordance. The FIRST creation site in walk order is its anchor.
          if (!sites.has(door.site.file)) {
            sites.set(door.site.file, door.site);
          }
          byKey.set(door.key, sites);
        }
        const pairs = [...byKey]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, sites]) => ({
            key,
            doors: [...sites.values()].toSorted((left, right) => left.file.localeCompare(right.file)),
          }));
        // THE DENOMINATOR IS THE WALK, NOT ITS RESULT. A receipt of `doors.length` would REFUSE on a corpus
        // with zero doors — and withhold `duplicate-action-doors-health`, whose whole job is to accuse that
        // state. The door count is the DOOR policy's own denominator and is receipted there.
        ctx.receipt({ kind: "population", source: "action-door-census", members: ctx.files.length, unresolved: 0 });
        return { vocabulary, planes, pairs, doorCount: doors.length };
      },
    };
  },
});
