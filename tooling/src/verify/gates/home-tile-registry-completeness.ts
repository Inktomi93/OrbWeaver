// Policy: home-tile-registry-completeness (docs/history/design/home-section-spec.md §7) — the HOME-TILE
// seam's structural walls tsc cannot see. Unlike the section/config registries there is no total door
// `Record` to lean on: a tile is an open-ended contribution, so every wall here is this policy's.
//
// (1) CO-LOCATION — a `HomeTileContribution` lives only at
//     `packages/client/src/features/<owner>/lib/<name>-tile.{ts,tsx}`, judged on the DECLARATION and again
//     on the RESOLVED definition, so an imported initializer is a tile whose home holds no definition
//     rather than an unjudgeable blob (the #944 case);
// (2) DUPLICATE ID — two tiles claiming one `id`. The registry's own throw is a RUNTIME catch at door
//     construction; this is the static one, and it names both owners;
// (3) DORMANT HONESTY (the H7 arm) — a `body: { dormant }` needs a non-empty `reason` AND a non-empty
//     `teaser` (a doorway that names nothing is an IOU), and it must NOT also declare an `action`, because
//     a doorway has no controls and a tile carrying both is a fake feature wearing a Dormant badge.
//
// THE ANTI-GOD-MAP ARM IS RETIRED HERE, with its successor named. Legacy carried a fourth arm flagging a
// `createContributorRegistry("home-tiles", …)` call outside the door, and its header justified the overlap
// as catching "the shape G8's file allowlist would miss". That premise died when
// `registry-assembly-at-door-only` converted: its door is now POPULATION algebra (`@client` notUnder
// `packages/client/src/main.tsx` + `packages/client/src/**/compose/**`), it judges the callee by resolved
// origin through `lib/project-home-origin.ts` rather than by spelling, it REPORTS the unreadable case
// instead of passing it, and its subject is every registry mint rather than the `home-tiles` one. That is
// a strictly stronger detector over a strictly wider subject through the same door, so carrying the arm
// here would ship two findings and two waiver positions for one site (guide §8.3 MERGE, §5b.1 smallest
// complete contract). The successor proof is a committed `runPolicyPass` pin on the retired fixture in
// `tests/tooling/verify/gates/registry-family.test.ts`.
//
// THE DORMANT ARM'S DECLARED LIMIT, carried from legacy unchanged: the arm engages only when `body`
// resolves to an authored object literal. A `body: () => null` (every live tile) and a `body` built by a
// call are not dormant doorways and are not accused — the dormant question does not arise for a body that
// is a renderer. An imported `body` const DOES resolve (the shared authored-value reader follows stable
// aliases), so the only bodies outside the arm's reach are the ones that cannot be dormant.
//
// THE FAIL-CLOSED ARMS ARE NEW, and they are the conversion's value. Legacy skipped a declaration whose
// initializer was not a direct object literal (`if (init === undefined || !isObjectLiteralExpression(init))
// continue`), so an imported or builder-produced tile passed every wall in silence; and it matched its
// subject on the annotation's TEXT (`typeNode.getText().startsWith("HomeTileContribution")`), so a local
// type that merely shares the name was accused. Both are now decided by the shared fact's canonical TYPE
// identity, and an unresolvable definition is REPORTED.
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` (`registryDefinitionFacts`,
// one provider per definition kind) plus `lib/registry-definition-{anchor,field,home}.ts`, consumed
// identically by all seven members, so the co-location law and the finding anchor cannot drift apart.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (68c8f42d6); the final population is `@client`.
import type { ObjectLiteralExpression } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DEFINITION_SLOTS } from "../contract/registry-definition-home.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionObjectField, definitionStringField } from "../lib/registry-definition-field.ts";
import { isDefinitionHome } from "../lib/registry-definition-home.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";

const ACTION_FIELD = "action";
const BODY_FIELD = "body";
const DORMANT_FIELD = "dormant";
/** The two things a dormant doorway owes its reader, in the order the tile renders them. */
const DOORWAY_FIELDS = ["reason", "teaser"] as const;

const MESSAGE =
  "a home tile is dishonest: a HomeTileContribution whose declaration or resolved definition is not " +
  "co-located at packages/client/src/features/<owner>/lib/<name>-tile.{ts,tsx}, a definition this policy " +
  "cannot resolve to an authored object literal, an unreadable or duplicate id, or a DORMANT doorway with " +
  "an empty reason or teaser or one that also declares an action — docs/history/design/home-section-spec.md §7.";
const FIX =
  "co-locate the tile at features/<owner>/lib/<name>-tile.tsx and write it as an authored object literal; give every tile a unique id; give a dormant doorway a real reason AND a real teaser and no action (a doorway has no controls). For a deliberate exception, write an adjacent `@orb-waive home-tile-registry-completeness(<position>): <why + end condition>` — the position is the DECLARED NAME of the tile (`buddyDormantTile`), never the `reason`/`teaser`/`action` field the message names.";

interface Claim {
  readonly name: string;
  readonly file: string;
}

interface Home {
  readonly object: ObjectLiteralExpression;
  readonly path: string;
}

/** The `body: { dormant: {…} }` doorway literal when the body IS the dormant arm, else undefined. A body
 *  the authored-value reader refuses is a renderer, not a doorway (see the declared limit in the header). */
function dormantDoorway(object: ObjectLiteralExpression): ObjectLiteralExpression | undefined {
  const body = definitionObjectField(object, BODY_FIELD);
  if (body === undefined || body.kind === "unresolved") {
    return;
  }
  const dormant = definitionObjectField(body.value, DORMANT_FIELD);
  return dormant === undefined || dormant.kind === "unresolved" ? undefined : dormant.value;
}

/** Every way one doorway is dishonest, named together. ONE finding per definition, because every arm in
 *  this family anchors on the declared NAME: two findings on one tile would share a carrier AND a position
 *  token, which makes every marker `over-broad` and leaves the tile unwaivable (guide §4.2). */
function doorwayFaults(doorway: ObjectLiteralExpression, object: ObjectLiteralExpression): readonly string[] {
  const faults: string[] = [];
  for (const field of DOORWAY_FIELDS) {
    const value = definitionStringField(doorway, field);
    if (value === undefined) {
      faults.push(`declares no \`${field}\``);
    } else if (value.kind === "unresolved") {
      faults.push(`declares a \`${field}\` this policy cannot read as an authored string (${value.reason}: ${value.detail})`);
    } else if (value.value.length === 0) {
      faults.push(`declares an empty \`${field}\``);
    }
  }
  if (object.getProperty(ACTION_FIELD) !== undefined) {
    faults.push(`declares an \`${ACTION_FIELD}\`, and a doorway has no controls`);
  }
  return faults;
}

export const gate = defineGate({
  id: "home-tile-registry-completeness",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts["home-tile"]],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const claimedIds = new Map<string, Claim>();
    const report = (definition: RegistryDefinitionFact, detail: string): void =>
      ctx.report.node(definition.declaration, { ...definitionAnchor(definition.declaration), message: `${MESSAGE} ${detail}`, fix: FIX });

    const resolveHome = (definition: RegistryDefinitionFact, name: string): Home | undefined => {
      const declarationPath = ctx.relativePath(definition.declaration.getSourceFile());
      if (!isDefinitionHome(declarationPath, DEFINITION_SLOTS.tile)) {
        report(definition, `Not co-located: "${name}" is declared at ${declarationPath}.`);
        return;
      }
      if (definition.object.kind === "unresolved") {
        report(definition, `Unreadable definition: "${name}" — ${definition.object.reason}: ${definition.object.detail}.`);
        return;
      }
      const object = definition.object.value;
      // The authored object is a RESOLUTION — the shared reader follows a cross-module const to its real
      // declaration, which is routinely outside this policy's `@client` population. `ctx.relativePath`
      // THROWS there and would withhold the whole policy (guide §12.3), so the home is read totally.
      const objectPath = declarationHome(ctx, object.getSourceFile());
      if (!isDefinitionHome(objectPath, DEFINITION_SLOTS.tile)) {
        report(definition, `Definition outside its home: "${name}" resolves to an object literal declared at ${objectPath}.`);
        return;
      }
      return { object, path: objectPath };
    };

    const claimId = (definition: RegistryDefinitionFact, name: string, home: Home): boolean => {
      const id = definitionStringField(home.object, "id");
      if (id === undefined || id.kind === "unresolved") {
        report(definition, `Unreadable id: "${name}" declares no authored string id, so the duplicate-id arm cannot judge it.`);
        return false;
      }
      const owner = claimedIds.get(id.value);
      if (owner === undefined) {
        claimedIds.set(id.value, { name, file: home.path });
        return true;
      }
      report(definition, `Duplicate id "${id.value}": "${name}" repeats the id first claimed by "${owner.name}" (${owner.file}).`);
      return true;
    };

    const judgeDormant = (definition: RegistryDefinitionFact, name: string, home: Home): void => {
      const doorway = dormantDoorway(home.object);
      if (doorway === undefined) {
        return;
      }
      const faults = doorwayFaults(doorway, home.object);
      if (faults.length > 0) {
        report(definition, `Dishonest dormant doorway: "${name}" ${faults.join(", and ")}.`);
      }
    };

    return {
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts["home-tile"]);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        for (const definition of view.definitions) {
          const name = definitionName(definition.declaration);
          const home = resolveHome(definition, name);
          if (home !== undefined && claimId(definition, name, home)) {
            judgeDormant(definition, name, home);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/not-a-tile-file.ts":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const strayTile: HomeTileContribution = { id: "x", body: () => null };\n',
      },
      expect: { count: 1, token: "strayTile", messageIncludes: "Not co-located" },
      why: "THE FOUNDING ROW: a HomeTileContribution outside a `*-tile` file — the co-location arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const xTile: HomeTileContribution = { id: "x", body: { dormant: { reason: "", teaser: "Soon." } } };\n',
      },
      expect: { count: 1, token: "xTile", messageIncludes: "empty `reason`" },
      why: "a dormant doorway that names nothing that must land first — the tracked-citation arm (H7)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const xTile: HomeTileContribution = { id: "x", body: { dormant: { reason: "domain/x is absent" } } };\n',
      },
      expect: { count: 1, token: "xTile", messageIncludes: "declares no `teaser`" },
      why: "a dormant doorway with no user-facing promise — the teaser arm (H7)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const xTile: HomeTileContribution = { id: "x", action: null, body: { dormant: { reason: "domain/x is absent", teaser: "Soon, and here is what." } } };\n',
      },
      expect: { count: 1, token: "xTile", messageIncludes: "a doorway has no controls" },
      why: "a doorway wearing a control — the no-fake-feature arm (H7)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const aTile: HomeTileContribution = { id: "dup", body: () => null };\n',
        "packages/client/src/features/b/lib/b-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const bTile: HomeTileContribution = { id: "dup", body: () => null };\n',
      },
      expect: { count: 1, token: "bTile", messageIncludes: 'Duplicate id "dup"' },
      why: "two co-located tiles declaring the SAME id — the shadow-contribution arm, caught statically instead of by the registry's runtime throw at door construction",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-definition.ts": 'export const aDef = { id: "a", body: { dormant: { reason: "r", teaser: "t" } } };\n',
        "packages/client/src/features/a/lib/a-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nimport { aDef } from "./a-definition.ts";\nexport const aTile: HomeTileContribution = aDef;\n',
      },
      expect: { count: 1, token: "aTile", messageIncludes: "Definition outside its home" },
      why: "THE #944 CASE, judged instead of silently skipped: the IMPORTED initializer means the sanctioned `*-tile.tsx` path holds no definition, and every honesty arm it hid was being reached over nothing. LEGACY PASSED THIS — `if (!Node.isObjectLiteralExpression(init)) continue` — which is the fail-open this conversion closes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nimport { uiTile } from "../../../../../ui/src/home-tiles.ts";\nexport const xTile: HomeTileContribution = uiTile;\n',
        "packages/ui/src/home-tiles.ts": 'export const uiTile = { id: "x", body: () => null };\n',
      },
      expect: { count: 1, token: "xTile", messageIncludes: "Definition outside its home" },
      why: "THE HOME READ IS TOTAL, and this row is the one that dies without it: `definition.object` is a RESOLUTION, and the shared authored-value reader follows a cross-module const to a declaration one hop OUTSIDE this policy's `@client` population. `ctx.relativePath` REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so asking it for a foreign object's home THROWS and withholds the WHOLE policy — the failure that left `freeze-provenance-write-pairing` reporting nothing on every real-tree run at 0 conformance failures (guide §12.3). The home is read through `lib/declaration-home.ts`; against a module using `ctx.relativePath` there this row reds as a TOOL ERROR rather than as a missing finding, which is the real-tree failure reproduced inside conformance",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\ndeclare const built: { id: string };\nexport const xTile: HomeTileContribution = built;\n',
      },
      expect: { count: 1, token: "xTile", messageIncludes: "Unreadable definition" },
      why: "THE FAIL-CLOSED ARM: a tile whose initializer resolves to no authored object literal at all (an ambient binding, the shape a builder call takes) is REPORTED, not skipped. Legacy `continue`d past exactly this, so a tile could carry any id and any dormant body without being judged",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/chat/lib/home-recents-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const chatRecentsTile: HomeTileContribution = { id: "chat.recents", action: null, body: () => null };\n',
      },
      why: "a FULL co-located tile with a real renderer body and a trailing action — passes. It is also the row that dies if the DORMANT TRIGGER is cut: with `dormantDoorway` forced to treat every tile as a doorway, this live tile has no reason/teaser and an action, and reds",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/home/lib/buddy-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const buddyDormantTile: HomeTileContribution = { id: "buddy", body: { dormant: { reason: "Not started yet, and there is no date to promise.", teaser: "Your companion." } } };\n',
      },
      why: "THE FOUNDING LEGAL DOORWAY (the live `buddy-tile.tsx` shape): a real reason, a real teaser, no controls — passes. It is the row that dies if the `action`, `reason` or `teaser` clause is cut open",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nconst xDef = { id: "x", body: () => null };\nexport const xTile: HomeTileContribution = xDef;\n',
      },
      why: "SAME-FILE indirection — the resolved literal is still in the tile's own home, so every arm judges the real definition. THE RESOLVED-HOME FENCE'S FALSE BRANCH: cutting the second `isDefinitionHome` open reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const aTile: HomeTileContribution = { id: "a", body: () => null };\n',
        "packages/client/src/features/b/lib/stray.ts":
          'interface HomeTileContribution {\n  readonly id: string;\n}\nexport const bTile: HomeTileContribution = { id: "a", body: () => null };\n',
      },
      why: "THE SHADOW CONTROL: `bTile` is annotated with a LOCAL type that merely shares the name, so it is neither an uncolocated tile nor an id collision. LEGACY ACCUSED IT — it matched the annotation's TEXT — so this row is the conversion's identity upgrade, and it dies the moment the subject stops being canonical type identity",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/compose/home-tiles.ts":
          'import type { HomeTileContribution } from "../state/home-tile-contracts.ts";\nexport const HOME_TILE_CONTRIBUTIONS: readonly HomeTileContribution[] = [];\n',
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\nexport const xTile: HomeTileContribution = { id: "x", body: () => null };\n',
      },
      why: "THE DOOR BOUNDARY: the composition root's `readonly HomeTileContribution[]` assembly list resolves to the Array symbol, not to the canonical contribution type, so the door stays out of the subject by TYPE identity rather than by a path exclusion — the live `compose/home-tiles.ts` shape",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/home-tile-contracts.ts": "export interface HomeTileContribution { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-tile.tsx":
          'import type { HomeTileContribution } from "../../../state/home-tile-contracts.ts";\n' +
          "// @orb-waive home-tile-registry-completeness(xTile): pinned identity arm; ends when this doorway declares its teaser.\n" +
          'export const xTile: HomeTileContribution = { id: "x", body: { dormant: { reason: "domain/x is absent" } } };\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the `declares no \\`teaser\\`` mustFlag row, which produces EXACTLY ONE finding, waived by the one central marker at the position this policy actually reports — the declared name `xTile`, not the `teaser` field the message names",
    },
  ],
});
