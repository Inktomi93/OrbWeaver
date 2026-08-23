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
import type { ObjectLiteralExpression, SourceFile, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { readStringValue } from "../lib/ast-read.ts";

/** A NODE-anchored hit — never a `{file,line,message}` Finding literal (finding-overload-provenance): the
 *  node carries its own position, and `token` folds the per-occurrence detail the gate's static `message`
 *  can't. */
interface Hit {
  readonly node: TsMorphNode;
  readonly token: string;
}

const CLIENT_SRC = "/packages/client/src/";
/** A co-located section definition file: `features/<owner>/lib/<id>-section.{ts,tsx}`. */
const SECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-section\.tsx?$/;
const ROUTES_DIR = "/packages/client/src/routes/";

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

function checkSectionDefs(sf: SourceFile, out: Violation[], hits: Hit[], seenIds: Map<string, SeenId>): void {
  const path = sf.getFilePath();
  const coLocated = SECTION_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("SectionDefinition")) {
      continue;
    }
    if (!coLocated) {
      hits.push({ node: decl, token: `${decl.getName()}-not-co-located` });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    checkDuplicateId({ name: decl.getName(), path, line: decl.getStartLineNumber(), id: sectionId(init) }, seenIds, out);
    const reason = plannedReason(init);
    if (reason === undefined) {
      continue;
    }
    if (reason.length === 0) {
      hits.push({ node: decl, token: `${decl.getName()}-empty-planned-reason` });
    }
    if (wiresRealBody(init)) {
      hits.push({ node: decl, token: `${decl.getName()}-planned-wires-real-body` });
    }
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

export const gate: GateDescriptor = {
  name: "section-registry-completeness",
  docRow: "client-architecture-lockdown.md §6 / §16 G1",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a section is dishonest: a SectionDefinition not co-located in a feature section file, a DECLARED-PLANNED section with an empty reason or a real body, or a route re-forming the god-map (a `sections` object-literal map / a non-auth feature import outside app-root) — client-architecture-lockdown.md §6.",
  fix: "co-locate the definition; a planned section is a non-empty reason + no body (context kind none); a route is a thin mount — sections ride the registry, only app-root composes features.",
  run: (ctx) => {
    const out: Violation[] = [];
    const hits: Hit[] = [];
    const seenIds = new Map<string, SeenId>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkSectionDefs(sf, out, hits, seenIds);
      if (path.includes(ROUTES_DIR)) {
        checkRouteFile(sf, hits);
      }
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    for (const hit of hits) {
      ctx.report(hit.node, { token: hit.token, offset: 0 });
    }
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
  ],
};
