// Gate: section-registry-completeness (client-architecture-lockdown.md §6 / §16 G1) — the section
// registry's structural walls tsc can't see. tsc forces the door Record total over SECTION_IDS; this adds:
// (1) CO-LOCATION — a `SectionDefinition` lives only in `features/<owner>/lib/<id>-section.{ts,tsx}`;
// (2) the PLANNED discipline (O1) — `content: { planned }` needs a non-empty reason AND no real body
//     (a planned section that also wires list/header/non-`none` context is the refinery bug in a badge);
// (3) the ANTI-GOD-MAP arm — a `sections={{…}}` object literal in a route file, or a non-auth feature
//     front-door import in `routes/**` outside the sanctioned composition route (app-root.tsx). The
//     `modals={{…}}` twin of arm (3) lands at M4 (when modal bodies move to the door); staged, not forgotten.
// (4) DUPLICATE ID — two co-located SectionDefinitions declaring the same `id` (a shadow def rots green
//     while edits land in the dead twin; tsc's total door Record can't see this — the door assembly just
//     picks one of the two importable names, silently orphaning the other).
//
// THE SUBJECT IS BOTH SANCTIONED AUTHORING SHAPES (#944, 2026-09-01), read through ONE shared discovery
// (lib/section-defs.ts, also used by placeholder-copy-registry so the two subjects cannot drift): the
// annotated `const` AND the FACTORY (`makeChatsSection(…): SectionDefinition`, §6b/M3). A
// variable-declaration-only reader never saw chats/characters/home/config at all — four of ten live
// sections outside every arm below. A co-located definition whose initializer is NOT resolvable to an
// object literal (an import, a builder) now FAILS CLOSED instead of `continue`ing: the co-location law
// cannot be established through it. The gate declares its SECTION POPULATION (#946) so the next shrink is loud.
import type { ObjectLiteralExpression, SourceFile, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { readStringValue } from "../lib/ast-read.ts";
import type { SectionDef } from "../lib/section-defs.ts";
import { SECTION_FILE_RE, sectionDefsIn } from "../lib/section-defs.ts";

/** A NODE-anchored hit — never a `{file,line,message}` Finding literal (finding-overload-provenance): the
 *  node carries its own position, and `token` folds the per-occurrence detail the gate's static `message`
 *  can't. */
interface Hit {
  readonly node: TsMorphNode;
  readonly token: string;
}

const CLIENT_SRC = "/packages/client/src/";
const ROUTES_DIR = "/packages/client/src/routes/";
/** The population's stable name — what a reader diffs run over run (#946). */
const POPULATION = "SectionDefinition";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A section definition's declared `id` string literal (through any as/satisfies/paren wrapper), or undefined. */
function sectionId(section: ObjectLiteralExpression): string | undefined {
  const id = objProp(section, "id");
  return id === undefined ? undefined : readStringValue(id);
}

/** A section definition's declared `content` — the planned arm if it is an object literal with `planned`. */
function plannedReason(section: ObjectLiteralExpression): string | undefined {
  const content = objProp(section, "content");
  if (content === undefined || !Node.isObjectLiteralExpression(content)) {
    return;
  }
  const planned = content.getProperty("planned");
  if (planned === undefined || !Node.isPropertyAssignment(planned)) {
    return;
  }
  const init = planned.getInitializer();
  return (init === undefined ? undefined : readStringValue(init)) ?? "";
}

/** True when a section object wires a REAL body (list/header/non-`none` context) — illegal for planned.
 *  A `context` initializer is real unless it is the literal `{ kind: "none" }` — this includes a
 *  `defineContextTabs(…)` CALL (the mint returns a `{ kind: "tabs" }` shape a plain object-literal check
 *  can't see; without this arm a planned section wired `context: defineContextTabs(…)` slips through). */
function wiresRealBody(section: ObjectLiteralExpression): boolean {
  if (section.getProperty("list") !== undefined || section.getProperty("header") !== undefined) {
    return true;
  }
  const context = objProp(section, "context");
  if (context === undefined) {
    return false;
  }
  if (Node.isCallExpression(context)) {
    return true;
  }
  if (Node.isObjectLiteralExpression(context)) {
    const kind = context.getProperty("kind");
    if (kind !== undefined && Node.isPropertyAssignment(kind)) {
      const k = kind.getInitializer();
      const kindValue = k === undefined ? undefined : readStringValue(k);
      return kindValue !== undefined && kindValue !== "none";
    }
  }
  return false;
}

interface SeenId {
  readonly name: string;
  readonly file: string;
}

interface DuplicateIdCheck {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly id: string | undefined;
}

/** Records a section def's `id` against `seenIds`; flags a second def claiming an already-owned id. */
function checkDuplicateId(check: DuplicateIdCheck, seenIds: Map<string, SeenId>, out: Violation[]): void {
  if (check.id === undefined) {
    return;
  }
  const firstOwner = seenIds.get(check.id);
  if (firstOwner === undefined) {
    seenIds.set(check.id, { name: check.name, file: rel(check.path) });
    return;
  }
  out.push({
    file: rel(check.path),
    line: check.line,
    message: `SectionDefinition "${check.name}" declares id "${check.id}", already claimed by "${firstOwner.name}" (${firstOwner.file}) — two definitions for one id is a shadow def that rots green while edits land in the dead twin — client-architecture-lockdown.md §16 G1.`,
  });
}

/** The accumulators one `run` threads through the per-file checks (bundled so no helper exceeds the
 *  param cap), plus the #946 member tally. */
interface Scan {
  readonly out: Violation[];
  readonly hits: Hit[];
  readonly seenIds: Map<string, SeenId>;
  members: number;
  unresolved: number;
}

/** Judge ONE discovered section definition — either authoring shape, `const` or factory. */
function checkSectionDef(def: SectionDef, path: string, scan: Scan): void {
  const { name } = def.site;
  if (!SECTION_FILE_RE.test(path)) {
    scan.hits.push({ node: def.node, token: `${name}-not-co-located` });
    return;
  }
  // FAIL CLOSED (#944): a co-located declaration whose definition this gate cannot read is the law being
  // unestablishable, never a silent `continue` — that is exactly how a definition moves behind an import
  // while every path check stays green. Same-file consts and as/satisfies wrappers still resolve.
  if (def.read.kind === "unresolved") {
    scan.unresolved += 1;
    scan.hits.push({ node: def.node, token: `${name}-unreadable-definition (${def.read.shape})` });
    return;
  }
  scan.members += 1;
  const init = def.read.object;
  checkDuplicateId({ name, path, line: def.site.line, id: sectionId(init) }, scan.seenIds, scan.out);
  const reason = plannedReason(init);
  if (reason === undefined) {
    return;
  }
  if (reason.length === 0) {
    scan.hits.push({ node: def.node, token: `${name}-empty-planned-reason` });
  }
  if (wiresRealBody(init)) {
    scan.hits.push({ node: def.node, token: `${name}-planned-wires-real-body` });
  }
}

function checkSectionDefs(sf: SourceFile, scan: Scan): void {
  const path = sf.getFilePath();
  for (const def of sectionDefsIn(sf)) {
    checkSectionDef(def, path, scan);
  }
}

function checkRouteFile(sf: SourceFile, hits: Hit[]): void {
  const path = sf.getFilePath();
  const rp = rel(path);
  const isAppRoot = rp.endsWith("/routes/app-root.tsx");
  // Arm (3a): a `sections={{…}}` god-map object literal in ANY route file (incl. app-root) is RED.
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "sections") {
      continue;
    }
    const init = attr.getInitializer();
    if (init !== undefined && Node.isJsxExpression(init)) {
      const expr = init.getExpression();
      if (expr !== undefined && Node.isObjectLiteralExpression(expr)) {
        hits.push({ node: attr, token: "sections-god-map" });
      }
    }
  }
  // Arm (3b): a non-auth feature front-door import in a route — legal only inside app-root (the one
  // sanctioned composition route) and #features/auth anywhere (the login surface + the beforeLoad gate).
  if (isAppRoot) {
    return;
  }
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.startsWith("#features/") && spec !== "#features/auth") {
      hits.push({ node: imp, token: `feature-front-door-import:${spec}` });
    }
  }
}

/** Drain the pass into findings, and declare the SEMANTIC denominator beside the harness's file one
 *  (#946): `members` is what the duplicate-id/planned arms actually judged, `unresolved` is denominator
 *  loss and is an instrument error, and ZERO members on the real tree means the discovery went blind. */
function reportScan(ctx: GateRunCtx, scan: Scan): void {
  for (const v of scan.out) {
    ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
  }
  for (const hit of scan.hits) {
    ctx.report(hit.node, { token: hit.token, offset: 0 });
  }
  ctx.scan({ population: [{ source: POPULATION, members: scan.members, unresolved: scan.unresolved }] });
}

export const gate: GateDescriptor = {
  name: "section-registry-completeness",
  docRow: "client-architecture-lockdown.md §6 / §16 G1",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a section is dishonest: a SectionDefinition not co-located in a feature section file, a co-located definition this gate cannot READ (an imported/builder initializer — the co-location law cannot be established through it), a DECLARED-PLANNED section with an empty reason or a real body, or a route re-forming the god-map (a `sections` object-literal map / a non-auth feature import outside app-root) — client-architecture-lockdown.md §6.",
  fix: "co-locate the definition and write it as an object literal or a `make<X>Section(): SectionDefinition` factory returning one (a same-file const and an `as`/`satisfies` wrapper read fine — an IMPORT does not); a planned section is a non-empty reason + no body (context kind none); a route is a thin mount — sections ride the registry, only app-root composes features.",
  run: (ctx) => {
    const scan: Scan = { out: [], hits: [], seenIds: new Map<string, SeenId>(), members: 0, unresolved: 0 };
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkSectionDefs(sf, scan);
      if (path.includes(ROUTES_DIR)) {
        checkRouteFile(sf, scan.hits);
      }
    }
    reportScan(ctx, scan);
  },
  mustFlag: [
    {
      files: "export const xSection: SectionDefinition = { id: 'x', content: () => null };\n",
      at: "packages/client/src/features/x/lib/not-a-section-file.ts",
      expect: { token: "xSection-not-co-located" },
      why: "a SectionDefinition outside a `*-section` file — the co-location arm",
    },
    {
      files: "export const xSection: SectionDefinition = { id: 'x', content: { planned: '' }, context: { kind: 'none' } };\n",
      at: "packages/client/src/features/x/lib/x-section.ts",
      expect: { token: "xSection-empty-planned-reason" },
      why: "a DECLARED-PLANNED section with an empty reason — the planned-reason arm (O1)",
    },
    {
      files: "export const xSection: SectionDefinition = { id: 'x', content: { planned: 'soon' }, list: () => null, context: { kind: 'none' } };\n",
      at: "packages/client/src/features/x/lib/x-section.ts",
      expect: { token: "xSection-planned-wires-real-body" },
      why: "a planned section that also wires a list — the badge-wearing half-build arm (O1)",
    },
    {
      files:
        "export const xSection: SectionDefinition = { id: 'x', content: { planned: 'soon' }, context: defineContextTabs({ useContextState: () => null, tabs: [] }) };\n",
      at: "packages/client/src/features/x/lib/x-section.ts",
      expect: { token: "xSection-planned-wires-real-body" },

      why: "a planned section wired `context: defineContextTabs(…)` — a CallExpression the plain object-literal check can't see (M3 amendment)",
    },
    {
      files: "export const G = <AppShell sections={{ chats: 1, characters: 2 }} />;\n",
      at: "packages/client/src/routes/some-route.tsx",
      expect: { token: "sections-god-map" },
      why: "a `sections` prop object literal in a route — the anti-god-map arm (3a)",
    },
    {
      files: 'import { X } from "#features/chat";\nexport const G = X;\n',
      at: "packages/client/src/routes/some-route.tsx",
      expect: { token: "feature-front-door-import:#features/chat" },
      why: "a non-auth feature import in a non-app-root route — the anti-god-map arm (3b)",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          "export const aSection: SectionDefinition = { id: 'dup', content: () => null, context: { kind: 'none' } };\n",
        "packages/client/src/features/b/lib/b-section.ts":
          "export const bSection: SectionDefinition = { id: 'dup', content: () => null, context: { kind: 'none' } };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located SectionDefinitions declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          "export const aSection: SectionDefinition = { id: 'dup' as never, content: () => null, context: { kind: 'none' } };\n",
        "packages/client/src/features/b/lib/b-section.ts":
          "export const bSection: SectionDefinition = { id: 'dup' as never, content: () => null, context: { kind: 'none' } };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "duplicate ids written `'dup' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED before hardening",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-definition.ts": "export const aDef = { id: 'dup', content: () => null, context: { kind: 'none' } };\n",
        "packages/client/src/features/a/lib/a-section.ts": 'import { aDef } from "./a-definition.ts";\nexport const aSection: SectionDefinition = aDef;\n',
      },
      expect: {
        token: "aSection-unreadable-definition (the identifier `aDef` (not an object literal declared in this file — an imported or re-exported definition))",
      },
      why: "THE #944 CONTROL: an IMPORTED initializer at a sanctioned `*-section.ts` path. Every co-location check stays green and the duplicate-id/planned arms silently returned before the fail-closed arm — the audit's exact escape shape",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.tsx":
          "export function makeASection(): SectionDefinition {\n  return { id: 'dup', content: () => null, context: { kind: 'none' } };\n}\n",
        "packages/client/src/features/b/lib/b-section.ts":
          "export const bSection: SectionDefinition = { id: 'dup', content: () => null, context: { kind: 'none' } };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "THE FACTORY CONTROL (§6b/M3): a `make<X>Section(): SectionDefinition` factory colliding with a const section's id. Four live sections (chats/characters/home/config) are authored this way and a `getVariableDeclarations()`-only reader saw NONE of them",
    },
    {
      files: "export function makeXSection(): SectionDefinition {\n  return { id: 'x', content: { planned: '' }, context: { kind: 'none' } };\n}\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { token: "makeXSection-empty-planned-reason" },
      why: "the PLANNED arm reaching a factory too — the honesty arms are the point of widening the subject, not just the duplicate-id one",
    },
  ],
  mustPass: [
    {
      files: "export const refinerySection: SectionDefinition = { id: 'refinery', content: { planned: 'build pending' }, context: { kind: 'none' } };\n",
      at: "packages/client/src/features/refinery/lib/refinery-section.ts",
      why: "the founding DECLARED-PLANNED section — non-empty reason, fully placeholder — passes (O1)",
    },
    {
      files: "export const chatsSection: SectionDefinition = { id: 'chats', content: () => null, context: { kind: 'none' } };\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      why: "a FULL co-located section (function content) — passes",
    },
    {
      files: 'import { AppShell } from "#features/app-shell";\nexport const G = AppShell;\n',
      at: "packages/client/src/routes/app-root.tsx",
      why: "app-root.tsx — the sanctioned composition route — may import feature front doors",
    },
    {
      files: "export function makeChatsSection(): SectionDefinition {\n  return { id: 'chats', content: () => null, context: { kind: 'none' } };\n}\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      why: "the factory arm's FALSE branch — a co-located factory with a unique id and a real body passes, so widening the subject is not a blanket accusation against the four live factory sections",
    },
    {
      files: "const xDef = { id: 'x', content: () => null, context: { kind: 'none' } };\nexport const xSection: SectionDefinition = xDef;\n",
      at: "packages/client/src/features/x/lib/x-section.ts",
      why: "SAME-FILE indirection — still co-located, so it resolves and is judged normally. The declared limit this row writes down: only an import/builder fails closed",
    },
  ],
};
