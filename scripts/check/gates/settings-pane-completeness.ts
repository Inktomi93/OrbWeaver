// Gate: settings-pane-completeness (client-architecture-lockdown.md §8 / §16 G4) — the settings-pane
// registry's structural walls tsc can't see. tsc forces the door Record total over SETTINGS_CATEGORY_IDS;
// this adds: (1) CO-LOCATION — a `SettingsPaneDefinition` lives only in `features/*/lib/*-pane.{ts,tsx}`;
// (2) DUPLICATE ID — two co-located defs declaring the same `id` (a shadow def rots green while edits
//     land in the dead twin; the door assembly silently picks one name);
// (3) the PLACEHOLDER-honesty discipline — a real function `body` that renders the teaching placeholder
//     component is dishonest (mirrors `modal-body-not-placeholder`'s `<SectionPlaceholder>` check; the
//     settings twin uses the fixed `placeholder: true` flag, no reason string);
// (4) the HOST-IMPORTS-NO-PANE-BODY arm — the settings host (`settings-shell-surface.tsx`) importing any
//     `*-settings-surface` body directly instead of reading it off the registry.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located settings-pane definition file: `features/<owner>/lib/<id>-pane.{ts,tsx}`. */
const PANE_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-pane\.tsx?$/;
const SETTINGS_HOST_SUFFIX = "/features/settings/surfaces/settings-shell-surface.tsx";
const SURFACE_IMPORT_RE = /(^|\/)[^/]*-settings-surface$/;
const PLACEHOLDER_TAG = "SettingsPanePlaceholder";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A pane definition's declared `id` string literal, or undefined. */
function paneId(pane: ObjectLiteralExpression): string | undefined {
  const id = objProp(pane, "id");
  return id !== undefined && Node.isStringLiteral(id) ? id.getLiteralText() : undefined;
}

/** Does this subtree render a `<SettingsPanePlaceholder …>` (open or self-closing) JSX element — the
 *  `modal-body-not-placeholder` precedent, ported to the settings twin's component name. */
function rendersPlaceholder(node: Node): boolean {
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  return false;
}

/** A real function `body` (not the `{ placeholder: true }` arm) whose render tree mounts the teaching
 *  placeholder — the dishonest inverse: a category flagged as real that actually renders the generic
 *  empty-state copy. */
function functionBodyRendersPlaceholder(pane: ObjectLiteralExpression): boolean {
  const body = objProp(pane, "body");
  if (body === undefined || !(Node.isArrowFunction(body) || Node.isFunctionExpression(body))) {
    return false;
  }
  return rendersPlaceholder(body);
}

type Seen = { readonly name: string; readonly file: string };

type PaneDef = {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly init: ObjectLiteralExpression;
};

/** Records `key` against `seen`; returns the FIRST owner if `key` is already claimed (a duplicate). */
function claim(key: string, def: PaneDef, seen: Map<string, Seen>): Seen | undefined {
  const firstOwner = seen.get(key);
  if (firstOwner === undefined) {
    seen.set(key, { name: def.name, file: rel(def.path) });
    return;
  }
  return firstOwner;
}

function checkPaneDef(def: PaneDef, out: Violation[], seenIds: Map<string, Seen>): void {
  const id = paneId(def.init);
  const idOwner = id === undefined ? undefined : claim(id, def, seenIds);
  if (idOwner !== undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `SettingsPaneDefinition "${def.name}" declares id "${id}", already claimed by "${idOwner.name}" (${idOwner.file}) — two definitions for one id is a shadow def that rots green — client-architecture-lockdown.md §16 G4.`,
    });
  }
  if (functionBodyRendersPlaceholder(def.init)) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `SettingsPaneDefinition "${def.name}" has a real function \`body\` that renders the teaching placeholder — flag it \`body: { placeholder: true }\` instead of a silent placeholder fall-through — client-architecture-lockdown.md §8.`,
    });
  }
}

function checkPaneDefs(sf: SourceFile, out: Violation[], seenIds: Map<string, Seen>): void {
  const path = sf.getFilePath();
  const coLocated = PANE_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("SettingsPaneDefinition")) {
      continue;
    }
    const line = decl.getStartLineNumber();
    if (!coLocated) {
      out.push({
        file: rel(path),
        line,
        message: `SettingsPaneDefinition "${decl.getName()}" is not co-located — a settings-pane definition lives only in a feature's lib pane file (features/*/lib/*-pane.{ts,tsx}; G4 keys on location) — client-architecture-lockdown.md §8.`,
      });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    checkPaneDef({ name: decl.getName(), path, line, init }, out, seenIds);
  }
}

/** The settings host mounting a pane's own render surface directly (`<XSettingsSurface />`/similar JSX)
 *  instead of reading it off `useSettingsPaneRegistry()` — the de-god's whole point. */
function checkHostImportsNoPaneBody(sf: SourceFile, out: Violation[]): void {
  const rp = rel(sf.getFilePath());
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (SURFACE_IMPORT_RE.test(spec)) {
      out.push({
        file: rp,
        line: imp.getStartLineNumber(),
        message: `the settings host imports "${spec}" directly — a pane body arrives ONLY via the registry (\`registry.get(active).body()\`); a direct surface import re-forms the if-ladder — client-architecture-lockdown.md §8.`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "settings-pane-completeness",
  docRow: "client-architecture-lockdown.md §8 / §16 G4",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a settings pane is dishonest: a SettingsPaneDefinition not co-located in a feature pane file, a duplicate id, a real body silently rendering the placeholder, or the settings host importing a pane body directly instead of reading the registry — client-architecture-lockdown.md §8.",
  fix: "co-locate the definition under features/*/lib/*-pane.{ts,tsx}; flag an unbuilt pane `body: { placeholder: true }` rather than rendering the teaching copy from a real body; read `useSettingsPaneRegistry().get(active).body()` in the host instead of importing a surface.",
  run: (ctx) => {
    const out: Violation[] = [];
    const seenIds = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkPaneDefs(sf, out, seenIds);
      if (path.endsWith(SETTINGS_HOST_SUFFIX)) {
        checkHostImportsNoPaneBody(sf, out);
      }
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: "export const xPane: SettingsPaneDefinition = { id: 'x' };\n",
      at: "packages/client/src/features/x/lib/not-a-pane-file.ts",
      expect: { messageIncludes: "not co-located" },
      why: "a SettingsPaneDefinition outside a `*-pane` file — the co-location arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-pane.ts": "export const aPane: SettingsPaneDefinition = { id: 'dup' };\n",
        "packages/client/src/features/b/lib/b-pane.ts": "export const bPane: SettingsPaneDefinition = { id: 'dup' };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located SettingsPaneDefinitions declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: 'export const xPane: SettingsPaneDefinition = { id: \'x\', body: () => <SettingsPanePlaceholder title="X" description="d" /> };\n',
      at: "packages/client/src/features/x/lib/x-pane.tsx",
      expect: { messageIncludes: "teaching placeholder" },
      why: "a real function `body` silently rendering the generic placeholder instead of `{ placeholder: true }` — the placeholder-honesty arm",
    },
    {
      files: 'import { XSettingsSurface } from "./x-settings-surface";\nexport const G = XSettingsSurface;\n',
      at: "packages/client/src/features/settings/surfaces/settings-shell-surface.tsx",
      expect: { messageIncludes: "imports" },
      why: "the settings host importing a pane's own surface directly (a same-dir sibling import, the real shape) — the host-imports-no-pane-body arm",
    },
  ],
  mustPass: [
    {
      files: "export const themePane: SettingsPaneDefinition = { id: 'theme', group: \"user\", body: () => <ThemeSurface /> };\n",
      at: "packages/client/src/features/x/lib/theme-pane.tsx",
      why: "a FULL co-located pane (function body) — passes",
    },
    {
      files: "export const draftPane: SettingsPaneDefinition = { id: 'draft', body: { placeholder: true } };\n",
      at: "packages/client/src/features/x/lib/draft-pane.tsx",
      why: "a DECLARED-PLACEHOLDER pane — flagged honestly, no function body — passes",
    },
  ],
};
