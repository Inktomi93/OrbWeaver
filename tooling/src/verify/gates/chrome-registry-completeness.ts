// Gate: chrome-registry-completeness (shell-chrome-unification.md §A/§D) — the chrome registry's
// structural walls tsc can't see (a `ChromeEntry` is a plain object literal, not a total door Record, so
// tsc catches nothing here on its own). Mirrors `modal-registry-completeness`: (1) CO-LOCATION — a
// `ChromeEntry` lives only in `features/<owner>/lib/<id>-chrome.tsx`; (2) DUPLICATE ID — two co-located
// defs declaring the same `id` (the contributor registry's own dupe-id throw is a RUNTIME catch; this is
// the static one, so a violation is caught at `pnpm check`, before it ever executes); (3) the ZONE arm —
// `zone` must be one of `CHROME_ZONES` (a typo'd zone silently renders nowhere, since no consumer reads an
// unknown zone string). THE ZONE VOCABULARY IS DERIVED, NEVER COPIED (#942): it is read out of the live
// `CHROME_ZONES` tuple through `lib/tuple-read.ts`, which resolves the sanctioned `[...RAIL_ZONES,
// "topbar.trail"]` spread; the hand-copied second list this gate used to hold had already drifted — it
// omitted `rail.brand` and would have REJECTED a legitimate brand-cell entry. A vocabulary that resolves to
// nothing while the tuple's home is loaded is the §4.6 blindness RED, never a silent pass.
//
// (4) UNREADABLE DEFINITION (#944/#946, 2026-09-01) — the discovery used to `continue` past any initializer
// that was not a bare object literal, so `export const xChrome: ChromeEntry = importedEntry;` left the
// duplicate-id, zone and rail-mobile arms with nothing to judge while the file still sat at its sanctioned
// `*-chrome.tsx` path and every path check stayed green. §A/§D give the definition ONE home and sanction no
// builder, so an unresolvable initializer FAILS CLOSED. A same-file const and an `as`/`satisfies` wrapper
// still resolve — both are still co-located. The gate also declares its ENTRY POPULATION beside the zone
// vocabulary, so a shrinking subject cannot hide behind a healthy file count. The SUBJECT is TOP-LEVEL
// `ChromeEntry`-annotated variable declarations: an ARRAY annotation (`ChromeEntry[]`) is the assembler's
// derivation, never a definition, and is excluded by matching the annotation HEAD exactly.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readObjectLiteral, readStringValue } from "../lib/ast-read.ts";
import { readTupleVocabulary } from "../lib/tuple-read.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located chrome-widget definition file: `features/<owner>/lib/<id>-chrome.tsx`. */
const CHROME_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-chrome\.tsx?$/;
/** The zone tuple's own home — the §4.6 blindness ANCHOR. Present in the fileset ⇒ the vocabulary MUST
 *  resolve; a conformance mini-project that plants no tuple simply has no zone axis to judge. */
const ZONE_TUPLE = "CHROME_ZONES";
const ZONE_TUPLE_HOME = "packages/client/src/state/chrome-registry.ts";
const GATE_SELF = "tooling/src/verify/gates/chrome-registry-completeness.ts";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

function chromeId(entry: ObjectLiteralExpression): string | undefined {
  const id = objProp(entry, "id");
  return id === undefined ? undefined : readStringValue(id);
}

function chromeZone(entry: ObjectLiteralExpression): string | undefined {
  const zone = objProp(entry, "zone");
  return zone === undefined ? undefined : readStringValue(zone);
}

interface Seen {
  readonly name: string;
  readonly file: string;
}

interface ChromeDef {
  readonly name: string;
  readonly path: string;
  readonly init: ObjectLiteralExpression;
}

// Node-anchored: every arm reports the OBJECT LITERAL directly (`ctx.report(node, {token, offset})`), never
// an explicit `Finding` — that overload bypasses `hasGateIgnore` (GATE-AUTHORING.md §1). The per-arm prose
// that used to ride the Finding's `message` field is folded into the gate's ONE `message` below; the
// dynamic identity (id / zone / name / prior claimant) moves into `token`.
function checkChromeEntry(def: ChromeDef, ctx: GateRunCtx, seenIds: Map<string, Seen>, zones: ReadonlySet<string>): void {
  const id = chromeId(def.init);
  if (id !== undefined) {
    const firstOwner = seenIds.get(id);
    if (firstOwner === undefined) {
      seenIds.set(id, { name: def.name, file: rel(def.path) });
    } else {
      ctx.report(def.init, {
        token: `duplicate id "${id}" (${def.name}) — first claimed by "${firstOwner.name}" (${firstOwner.file})`,
        offset: 0,
      });
    }
  }
  const zone = chromeZone(def.init);
  // The zone arm judges only against a RESOLVED vocabulary: an empty one means the tuple is not in this
  // fileset at all (a mini-project), and accusing every zone there would be a false positive. The case that
  // matters — an empty vocabulary while the tuple's home IS loaded — is the blindness RED in `run`.
  if (zone !== undefined && zones.size > 0 && !zones.has(zone)) {
    ctx.report(def.init, { token: `zone "${zone}" (${def.name})`, offset: 0 });
  }
  // The mobile-curation axis: a rail.* widget MUST declare its mobile-tab-vs-You-sheet fate
  // (`mobile: "tab"|"sheet"`); a topbar.* widget MAY.
  //
  // ⚑ THE RAIL-ONLY HALF IS RETIRED (2026-08-07), and the premise is what died: this gate used to RED a
  // topbar widget that declared `mobile`, reasoning "there is no mobile bar for it". There is now a mobile
  // HOME for it — the You sheet projects `topbar.trail` widgets curated `"sheet"` in their own sheet lens
  // (you-sheet.tsx), which is how the notifications inbox leaves a 320px topbar whose row is spent saying
  // where you are (side-eye 2026-08-07 P2). A phone-fate declaration is chrome-wide vocabulary now.
  // It stays OPTIONAL on topbar.*: the default (stay on the row) is the right one for a section's own
  // controls, and forcing every trail widget to spell it would be ceremony, not a decision.
  const hasMobile = def.init.getProperty("mobile") !== undefined;
  if (zone !== undefined && zone.startsWith("rail.") && !hasMobile) {
    ctx.report(def.init, { token: `missing mobile (${def.name}, zone "${zone}")`, offset: 0 });
  }
}

/** Is this annotation a `ChromeEntry` DEFINITION (bare or generic)? `ChromeEntry[]` is the assembler's
 *  derived list, not a definition — a loose `startsWith` prefix would swallow that whole class. */
function isChromeAnnotation(typeText: string): boolean {
  return typeText === "ChromeEntry" || typeText.startsWith("ChromeEntry<");
}

/** The per-pass member tally behind the #946 population receipt. */
interface EntryTally {
  members: number;
  unresolved: number;
}

function checkChromeDefs(
  sf: SourceFile,
  ctx: GateRunCtx,
  seenIds: Map<string, Seen>,
  scan: { readonly zones: ReadonlySet<string>; readonly tally: EntryTally },
): void {
  const path = sf.getFilePath();
  const coLocated = CHROME_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    if (!isChromeAnnotation(decl.getTypeNode()?.getText() ?? "")) {
      continue;
    }
    if (!coLocated) {
      ctx.report(decl, { token: `not co-located: ${decl.getName()}`, offset: 0 });
      continue;
    }
    // FAIL CLOSED (#944): an initializer this gate cannot resolve to a co-located object literal leaves the
    // dup-id, zone and rail-mobile arms nothing to judge — the law being unestablishable, not a clean skip.
    const read = readObjectLiteral(decl.getInitializer());
    if (read.kind === "unresolved") {
      scan.tally.unresolved += 1;
      ctx.report(decl, { token: `unreadable definition: ${decl.getName()} — ${read.shape}`, offset: 0 });
      continue;
    }
    scan.tally.members += 1;
    checkChromeEntry({ name: decl.getName(), path, init: read.object }, ctx, seenIds, scan.zones);
  }
}

export const gate: GateDescriptor = {
  name: "chrome-registry-completeness",
  docRow: "shell-chrome-unification.md §A/§D",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a chrome widget is dishonest: a ChromeEntry not co-located in a feature chrome file, a co-located definition this gate cannot READ (an imported/builder initializer — every arm below then has nothing to judge), a duplicate id across defs, a zone outside CHROME_ZONES, or a rail.* widget missing `mobile` — shell-chrome-unification.md §A/§D.",
  fix: 'co-locate the definition at features/<owner>/lib/<id>-chrome.tsx and write it as an object literal (a same-file const and an `as`/`satisfies` wrapper read fine — an IMPORT does not); give every ChromeEntry a unique id; use a real CHROME_ZONES member; declare `mobile` on every rail.* widget (topbar.* may declare it too — the You sheet projects `"sheet"`-curated trail widgets).',
  run: (ctx) => {
    const seenIds = new Map<string, Seen>();
    const vocabulary = readTupleVocabulary(ctx.project, ZONE_TUPLE);
    const tally: EntryTally = { members: 0, unresolved: 0 };
    ctx.scan({
      unit: `zone vocabulary [${ZONE_TUPLE}=${vocabulary.members.size} from ${vocabulary.sources.length === 0 ? "<none>" : vocabulary.sources.join("+")}]`,
      candidates: vocabulary.sources.length,
      scanned: vocabulary.sources.length,
    });
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkChromeDefs(sf, ctx, seenIds, { zones: vocabulary.members, tally });
    }
    // The SUBJECT's own denominator (#946), beside the zone VOCABULARY's above: they are two different
    // populations that shrink independently — a healthy zone tuple says nothing about how many entries the
    // dup-id / zone / rail-mobile arms actually ran over.
    ctx.scan({ population: [{ source: "ChromeEntry", members: tally.members, unresolved: tally.unresolved }] });
    // §4.6 blindness tripwire: the zone axis is DERIVED, so a rename/refactor that stops resolving it would
    // silently retire the zone arm. If the tuple's home is in the fileset the vocabulary must be non-empty.
    if (vocabulary.members.size === 0 && ctx.project.getSourceFile(`${ctx.root}/${ZONE_TUPLE_HOME}`) !== undefined) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${ZONE_TUPLE_HOME} is loaded but ${ZONE_TUPLE} resolved to ZERO zones — the zone arm is a silent no-op. Repoint the derivation in tooling/src/verify/lib/tuple-read.ts / this gate.`,
      });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/not-a-chrome-file.ts": "export const xChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail' };\n",
      },
      expect: { token: "not co-located: xChrome" },
      why: "a ChromeEntry outside a `*-chrome` file — the co-location arm",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/a/lib/a-chrome.tsx": "export const aChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
        "packages/client/src/features/b/lib/b-chrome.tsx": "export const bChrome: ChromeEntry = { id: 'dup', zone: 'topbar.trail' };\n",
      },
      expect: { token: 'duplicate id "dup" (bChrome) — first claimed by "aChrome" (packages/client/src/features/a/lib/a-chrome.tsx)' },
      why: "two co-located ChromeEntry defs declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx": "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' };\n",
      },
      expect: { token: 'zone "sidebar.top" (xChrome)' },
      why: "a zone string outside the DERIVED CHROME_ZONES — the zone arm, judged against the real tuple (spread included) rather than a hand-copied list",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx": "export const xChrome: ChromeEntry = { id: 'x', zone: 'sidebar.top' as never };\n",
      },
      expect: { token: 'zone "sidebar.top" (xChrome)' },
      why: "a bad zone written `'sidebar.top' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader passed before hardening",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/rail-chrome.tsx":
          "export const railChrome: ChromeEntry = { id: 'r', zone: 'rail.nav', label: 'R', behavior: { kind: 'widget', body: () => null } };\n",
      },
      expect: { token: 'missing mobile (railChrome, zone "rail.nav")' },
      why: "a rail.* widget with no `mobile` — the rail-mobile-required arm (§D)",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const SHELL_ZONES = [...RAIL_ZONES] as const;\n',
      },
      expect: { messageIncludes: "resolved to ZERO zones" },
      why: "THE §4.6 BLINDNESS TRIPWIRE: the tuple's home is loaded but nothing named CHROME_ZONES resolves (a rename) — the zone arm has silently retired, which must be RED and not a ✓ over an empty vocabulary",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-definition.ts":
          "export const xDef = { id: 'x', zone: 'rail.nav', label: 'X', behavior: { kind: 'widget', body: () => null } };\n",
        "packages/client/src/features/x/lib/x-chrome.tsx": 'import { xDef } from "./x-definition.ts";\nexport const xChrome: ChromeEntry = xDef;\n',
      },
      expect: {
        token: "unreadable definition: xChrome — the identifier `xDef` (not an object literal declared in this file — an imported or re-exported definition)",
      },
      why: "THE #944 CONTROL (the audit's exact fixture): an IMPORTED `ChromeEntry` with `zone: 'rail.nav'` and NO `mobile`. The rail-mobile arm would have RED'd it; before the fail-closed arm the discovery returned silently at a sanctioned `*-chrome.tsx` path, so every co-location and zone check stayed green over nothing",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/brand-chrome.tsx":
          "export const brandChrome: ChromeEntry = { id: 'brand', zone: 'rail.brand', label: 'Weave', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      },
      why: "THE DRIFT THIS FIX KILLS (#942): `rail.brand` is a live zone that reaches the vocabulary only through the imported RAIL_ZONES spread. The hand-copied list omitted it, so this legitimate brand-cell entry was REJECTED; derived, it passes.",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/bar-chrome.tsx":
          "export const barChrome: ChromeEntry = { id: 'b', zone: 'topbar.trail', label: 'B', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      },
      why: "a topbar.* widget declaring `mobile` — LEGAL since the You sheet projects `sheet`-curated trail widgets in their own lens (the rail-only half retired 2026-08-07, §D)",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          "export const xChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail', label: 'X', behavior: { kind: 'widget', body: () => null } };\n",
      },
      why: "a FULL co-located topbar.trail widget (real zone, unique id, no mobile) — passes",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/nav-chrome.tsx":
          "export const navChrome: ChromeEntry = { id: 'nav', zone: 'rail.nav', label: 'Nav', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      },
      why: "a `rail.nav` widget declaring `mobile` — a real CHROME_ZONES member with the required rail axis (§E-1/§D)",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/end-chrome.tsx":
          "export const endChrome: ChromeEntry = { id: 'end', zone: 'rail.end', label: 'End', mobile: 'sheet', behavior: { kind: 'widget', body: () => null } };\n",
      },
      why: "a `rail.end` widget declaring `mobile` — a real CHROME_ZONES member with the required rail axis (§E-1/§D)",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/state/assemble-chrome.ts":
          "function sectionEntry(): ChromeEntry {\n  return { id: 'a', zone: 'rail.nav', label: 'A', mobile: 'tab', behavior: { kind: 'widget', body: () => null } };\n}\nexport function assemble(): ChromeEntry[] {\n  const entries: ChromeEntry[] = [sectionEntry()];\n  return entries;\n}\n",
      },
      why: "THE ASSEMBLER BOUNDARY: `state/assemble-chrome.ts` DERIVES entries (a `ChromeEntry` return type and a function-scoped `ChromeEntry[]` local) rather than declaring co-located defs — the subject is TOP-LEVEL `ChromeEntry`-typed variable declarations only, and this row pins that the derivation stays silent instead of being read as an uncolocated def",
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/state/assemble-chrome.ts": "export const ENTRIES: ChromeEntry[] = [];\n",
      },
      why: 'THE ASSEMBLER BOUNDARY\'S TOP-LEVEL HALF (#944): a `ChromeEntry[]` ARRAY annotation at module scope is a derived list, not a definition. The old `startsWith("ChromeEntry")` subject would have read it as an uncolocated def AND then failed closed on its array initializer — two false accusations; matching the annotation HEAD exactly keeps the assembler out of the subject',
    },
    {
      files: {
        "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
        "packages/client/src/state/chrome-registry.ts":
          'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
        "packages/client/src/features/x/lib/x-chrome.tsx":
          "const xDef = { id: 'x', zone: 'topbar.trail', label: 'X', behavior: { kind: 'widget', body: () => null } };\nexport const xChrome: ChromeEntry = xDef;\n",
      },
      why: "SAME-FILE indirection — still co-located, so `readObjectLiteral` follows it and every arm judges the real entry. The declared limit this row writes down: only an import/builder fails closed, never a local const",
    },
  ],
};
