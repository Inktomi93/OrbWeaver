// Policy: chrome-registry-completeness (shell-chrome-unification.md §A/§D) — the chrome registry's
// structural walls tsc cannot see (a `ChromeEntry` is a plain object literal, not a total door Record).
// CO-LOCATION at `features/<owner>/lib/<id>-chrome.{ts,tsx}`, DUPLICATE ID across definitions, the ZONE
// arm (a zone outside `CHROME_ZONES` renders nowhere, because no consumer reads an unknown zone string),
// and the MOBILE arm (a `rail.*` widget must declare its mobile-tab-vs-You-sheet fate; `topbar.*` may).
//
// TWO INDEPENDENT DENOMINATORS, never summed: the ChromeEntry definitions the four arms judged, and the
// zone vocabulary they judged against. The vocabulary is DERIVED from the live `CHROME_ZONES` tuple
// through the shared `tupleVocabularyFact` (which resolves the sanctioned `[...RAIL_ZONES, "topbar.trail"]`
// spread), never hand-copied — the copied list had already drifted past `rail.brand` and would have
// rejected a legitimate brand-cell entry. A vocabulary that stops resolving takes its receipt to zero
// members and WITHHOLDS this policy, which is the §4.6 blindness rule expressed as the runtime's own
// refusal rather than as a finding this policy has to remember to raise.
//
// The subject is the shared `registryDefinitionFacts.chrome` provider: a `ChromeEntry[]` annotation is the assembler's
// derived list and resolves to the Array symbol, not to the canonical entry type, so the assembler stays
// out of the population by type identity rather than by matching an annotation's head text.
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` (`registryDefinitionFacts`)
// plus `lib/registry-definition-{anchor,field,home}.ts`, consumed identically by all seven members.
// `tupleVocabularyFact` is a shared PRIMITIVE this policy also reads, not a second family.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (9055cfe6a); the final population is `@client`.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `chrome-registry-completeness` descriptor at 577d03d6365832310d849aa4752459443ed4cba3, the parent of the conversion
// `f16cde889` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `9055cfe6a`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. The legacy descriptor had no `scanRoot`, so its effective population is its in-run path
// filter — run: `if (!path.includes(CLIENT_SRC)) continue` with CLIENT_SRC = "/packages/client/src/". Over the SAME
// 7,144 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it admits 1,302 and
// the final `population` admits 1,302 (the bare harness dispatch was 7,144). legacy − final = ∅. final − legacy = ∅.
// Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` rejected by both.
import type { ObjectLiteralExpression } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DEFINITION_SLOTS } from "../contract/registry-definition-home.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionStringField } from "../lib/registry-definition-field.ts";
import { isDefinitionHome } from "../lib/registry-definition-home.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

const ZONE_TUPLE = "CHROME_ZONES";
const RAIL_PREFIX = "rail.";
const MOBILE_FIELD = "mobile";

const MESSAGE =
  "a chrome widget is dishonest: a ChromeEntry whose declaration or resolved definition is not co-located at " +
  "packages/client/src/features/<owner>/lib/<id>-chrome.{ts,tsx}, a definition this policy cannot resolve to an authored " +
  `object literal, an unreadable or duplicate id, a zone outside ${ZONE_TUPLE}, or a rail.* widget missing \`${MOBILE_FIELD}\` ` +
  "— shell-chrome-unification.md §A/§D.";
const FIX =
  'co-locate the definition at features/<owner>/lib/<id>-chrome.tsx and write it as an authored object literal; give every ChromeEntry a unique id; use a real CHROME_ZONES member; declare `mobile` on every rail.* widget (topbar.* may declare it too — the You sheet projects "sheet"-curated trail widgets). For a deliberate exception, write an adjacent `@orb-waive chrome-registry-completeness(<position>): <why + end condition>` — the position is the DECLARED NAME of the widget (`railChrome`), never the zone or the `mobile` field the message names.';

interface Claim {
  readonly name: string;
  readonly file: string;
}

interface Home {
  readonly object: ObjectLiteralExpression;
  readonly path: string;
}

export const gate = defineGate({
  id: "chrome-registry-completeness",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts.chrome, tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const claimedIds = new Map<string, Claim>();
    const report = (definition: RegistryDefinitionFact, detail: string): void =>
      ctx.report.node(definition.declaration, { ...definitionAnchor(definition.declaration), message: `${MESSAGE} ${detail}`, fix: FIX });

    const resolveHome = (definition: RegistryDefinitionFact, name: string): Home | undefined => {
      const declarationPath = ctx.relativePath(definition.declaration.getSourceFile());
      if (!isDefinitionHome(declarationPath, DEFINITION_SLOTS.chrome)) {
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
      // THROWS there and would withhold the whole policy (guide §3), so the home is read totally.
      const objectPath = declarationHome(ctx, object.getSourceFile());
      if (!isDefinitionHome(objectPath, DEFINITION_SLOTS.chrome)) {
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

    const judgeZone = (definition: RegistryDefinitionFact, name: string, home: Home, zones: ReadonlySet<string>): void => {
      const zone = definitionStringField(home.object, "zone");
      if (zone === undefined || zone.kind === "unresolved") {
        report(definition, `Unreadable zone: "${name}" declares no authored string zone, so the zone and mobile arms cannot judge it.`);
        return;
      }
      if (!zones.has(zone.value)) {
        report(definition, `Unknown zone "${zone.value}": "${name}" declares a zone outside ${ZONE_TUPLE}, so no consumer will ever render it.`);
        return;
      }
      if (zone.value.startsWith(RAIL_PREFIX) && home.object.getProperty(MOBILE_FIELD) === undefined) {
        report(definition, `Missing mobile fate: "${name}" is a ${zone.value} widget and declares no \`${MOBILE_FIELD}\`.`);
      }
    };

    return {
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts.chrome);
        const vocabulary = ctx.fact(tupleVocabularyFact).read(ZONE_TUPLE);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(vocabulary) });
        if (vocabulary.kind !== "resolved") {
          return;
        }
        const zones = new Set(vocabulary.entries.map(({ value }) => value));
        for (const definition of view.definitions) {
          const name = definitionName(definition.declaration);
          const home = resolveHome(definition, name);
          if (home !== undefined && claimId(definition, name, home)) {
            judgeZone(definition, name, home, zones);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nimport { uiChrome } from "../../../../../ui/src/chrome-entries.ts";\nexport const xChrome: ChromeEntry = uiChrome;\n',
        "packages/ui/src/chrome-entries.ts": 'export const uiChrome = { id: "x" };\n',
      },
      expect: { count: 1, token: "xChrome", messageIncludes: "Definition outside its home" },
      why: "THE HOME READ IS TOTAL, and this row is the one that dies without it: `definition.object` is a RESOLUTION — the shared authored-value reader follows a cross-module const to its real declaration, which is routinely OUTSIDE this policy's `@client` population — and NOT only through a vendor `.d.ts`: an ordinary sibling-package import of a `@orb/ui` const, one hop outside `@client`, reproduces it (gate-runtime audit wave 2, finding D1). `ctx.relativePath` REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so asking it for a foreign object's home THREW and withheld the WHOLE policy — the exact failure that left `freeze-provenance-write-pairing` reporting nothing on every real-tree run while sitting at 0 conformance failures (2026-09-11, guide §3). The home is now read through `lib/declaration-home.ts`. AGAINST THE UNMODIFIED MODULE THIS ROW REDS AS A TOOL ERROR rather than as a missing finding, and that is not a mis-authored row: the planted out-of-population object makes `evaluate` THROW, which is the real-tree failure reproduced inside conformance. Membership in `ctx.files` is NOT the alternative — policy-pass.ts:316 intersects it with a scoped run's requested paths, so that spelling reads silently clean under every `--scope`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/not-a-chrome-file.ts":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "topbar.trail" };\n',
      },
      expect: { count: 1, token: "xChrome", messageIncludes: "Not co-located" },
      why: "a ChromeEntry outside a `*-chrome` file — the co-location arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/a/lib/a-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const aChrome: ChromeEntry = { id: "dup", zone: "topbar.trail" };\n',
        "packages/client/src/features/b/lib/b-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const bChrome: ChromeEntry = { id: "dup", zone: "topbar.trail" };\n',
      },
      expect: { count: 1, token: "bChrome", messageIncludes: "Duplicate id" },
      why: "two co-located ChromeEntry defs declaring the SAME id — the shadow-def duplicate-id arm, caught statically instead of by the registry's runtime throw",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "sidebar.top" as never };\n',
      },
      expect: { count: 1, token: "xChrome", messageIncludes: "Unknown zone" },
      why: "a bad zone written `'sidebar.top' as never` — judged against the DERIVED tuple (spread included), through the wrapper a plain StringLiteral reader passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/rail-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const railChrome: ChromeEntry = { id: "r", zone: "rail.nav", label: "R" };\n',
      },
      expect: { count: 1, token: "railChrome", messageIncludes: "Missing mobile fate" },
      why: "a rail.* widget with no `mobile` — the rail-mobile-required arm (§D)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-definition.ts": 'export const xDef = { id: "x", zone: "rail.nav", label: "X" };\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nimport { xDef } from "./x-definition.ts";\nexport const xChrome: ChromeEntry = xDef;\n',
      },
      expect: { count: 1, token: "xChrome", messageIncludes: "Definition outside its home" },
      why: "THE #944 CASE, judged instead of refused: the IMPORTED entry means the sanctioned `*-chrome.tsx` path holds no definition, and the rail-mobile arm it hid is no longer reached over nothing",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/rail-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\ndeclare function computeId(): string;\nexport const railChrome: ChromeEntry = { id: computeId(), zone: "rail.nav", label: "R" };\n',
      },
      expect: { count: 1, token: "railChrome", messageIncludes: "Unreadable id" },
      why: "THE UNREADABLE-ID GATE (§4.1): a widget whose `id` is a call the static readers cannot resolve produces the unreadable-id finding AND NOTHING ELSE — `claimId` returning false is what stops `judgeZone` running over a definition the duplicate-id arm already could not judge. This fixture is `rail.nav` with no `mobile` ON PURPOSE, so the count is the discriminator: run `judgeZone` regardless of `claimId` and this row goes 1 → 2 as the rail-mobile arm piles a second verdict onto one unjudgeable definition. THE ROW THAT DIES WITHOUT the `claimId(...)` conjunct at the call site",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/brand-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const brandChrome: ChromeEntry = { id: "brand", zone: "rail.brand", label: "Weave", mobile: "sheet" };\n',
      },
      why: "THE DRIFT THIS DERIVATION KILLS (#942): `rail.brand` reaches the vocabulary only through the imported RAIL_ZONES spread. A hand-copied list omitted it and rejected this legitimate brand-cell entry",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/bar-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const barChrome: ChromeEntry = { id: "b", zone: "topbar.trail", label: "B", mobile: "sheet" };\n',
      },
      why: "a topbar.* widget DECLARING `mobile` — legal since the You sheet projects sheet-curated trail widgets in their own lens (the rail-only half retired 2026-08-07, §D)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "topbar.trail", label: "X" };\n',
      },
      why: "a FULL co-located topbar.trail widget (real zone, unique id, no mobile) — passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "topbar.trail", label: "X" };\n',
        "packages/client/src/state/assemble-chrome.ts":
          'import type { ChromeEntry } from "./chrome-registry.ts";\nexport const ENTRIES: ChromeEntry[] = [];\nexport function assemble(): ChromeEntry[] {\n  const entries: ChromeEntry[] = [];\n  return entries;\n}\n',
      },
      why: "THE ASSEMBLER BOUNDARY: a `ChromeEntry[]` annotation resolves to the Array symbol, not to the canonical entry type, so the assembler's top-level list and its function-scoped local stay out of the subject by TYPE identity — the head-text match needed a hand-written exclusion for the same class",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nconst xDef = { id: "x", zone: "topbar.trail", label: "X" };\nexport const xChrome: ChromeEntry = xDef;\n',
      },
      why: "SAME-FILE indirection — the resolved literal is still in the widget's own home, so every arm judges the real entry",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/state/shadow.ts": 'interface ChromeEntry { readonly id: string }\nexport const notAnEntry: ChromeEntry = { id: "shadow" };\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "topbar.trail", label: "X" };\n',
      },
      why: "THE SHADOW CONTROL: a LOCAL type that merely shares the name is not the canonical ChromeEntry, so an uncolocated declaration annotated with it is not this policy's subject",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/rail-chrome.tsx":
          'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\n' +
          "// @orb-waive chrome-registry-completeness(railChrome): pinned identity arm; ends when this widget declares its mobile fate.\n" +
          'export const railChrome: ChromeEntry = { id: "r", zone: "rail.nav", label: "R" };\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the `Missing mobile fate` mustFlag row, which produces EXACTLY ONE finding, waived at the position this policy reports — the declared name `railChrome`, not the `mobile` field the message asks for",
    },
  ],
});
