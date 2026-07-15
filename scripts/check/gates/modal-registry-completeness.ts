// Gate: modal-registry-completeness (client-architecture-lockdown.md §6d / §16 G13) — the modal
// registry's structural walls tsc can't see. tsc forces the door Record total over MODAL_SLOT_IDS; this
// adds: (1) CO-LOCATION — a `ModalDefinition` lives only in `features/<owner>/lib/<id>-modal.{ts,tsx}`;
// (2) DUPLICATE ID — two co-located defs declaring the same `id` (a shadow def rots green while edits
//     land in the dead twin; the door assembly silently picks one name);
// (3) the PLANNED discipline — `body: { planned }` needs a non-empty reason AND no real function body
//     (a planned modal wiring a real body is dishonest);
// (4) the SINGLETON-PLACEMENT arm — the rail/topbar/mobile-bar derivation assumes exactly ONE modal per
//     `avatar`/`topbar-command`/`mobile-tab`; two claiming a singleton placement → RED (`rail-footer`/
//     `content` may repeat);
// (5) the ANTI-GOD-MAP arm — a `modals={{…}}` object literal in a route file (the deleted override map).
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.{ts,tsx}`. */
const MODAL_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-modal\.tsx?$/;
const ROUTES_DIR = "/packages/client/src/routes/";
/** Placements the derivation renders as EXACTLY ONE affordance — a second claimant breaks the .find(). */
const SINGLETON_PLACEMENTS = new Set(["avatar", "topbar-command", "mobile-tab"]);

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A modal definition's declared `id` string literal, or undefined. */
function modalId(modal: ObjectLiteralExpression): string | undefined {
  const id = objProp(modal, "id");
  return id !== undefined && Node.isStringLiteral(id) ? id.getLiteralText() : undefined;
}

/** A modal definition's `trigger.placement` string literal, or undefined. */
function triggerPlacement(modal: ObjectLiteralExpression): string | undefined {
  const trigger = objProp(modal, "trigger");
  if (trigger === undefined || !Node.isObjectLiteralExpression(trigger)) {
    return;
  }
  const placement = trigger.getProperty("placement");
  if (placement === undefined || !Node.isPropertyAssignment(placement)) {
    return;
  }
  const init = placement.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** The `body: { planned }` reason if the body is the planned arm (empty string when planned but no
 *  string reason); undefined when `body` is a real function. */
function plannedReason(modal: ObjectLiteralExpression): string | undefined {
  const body = objProp(modal, "body");
  if (body === undefined || !Node.isObjectLiteralExpression(body)) {
    return;
  }
  const planned = body.getProperty("planned");
  if (planned === undefined || !Node.isPropertyAssignment(planned)) {
    return;
  }
  const init = planned.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : "";
}

type Seen = { readonly name: string; readonly file: string };

type ModalDef = {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly init: ObjectLiteralExpression;
};

/** Records `key` against `seen`; returns the FIRST owner if `key` is already claimed (a duplicate). */
function claim(key: string, def: ModalDef, seen: Map<string, Seen>): Seen | undefined {
  const firstOwner = seen.get(key);
  if (firstOwner === undefined) {
    seen.set(key, { name: def.name, file: rel(def.path) });
    return;
  }
  return firstOwner;
}

function checkModalDef(
  def: ModalDef,
  out: Violation[],
  seenIds: Map<string, Seen>,
  seenSingletons: Map<string, Seen>,
): void {
  const id = modalId(def.init);
  const idOwner = id === undefined ? undefined : claim(id, def, seenIds);
  if (idOwner !== undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `ModalDefinition "${def.name}" declares id "${id}", already claimed by "${idOwner.name}" (${idOwner.file}) — two definitions for one id is a shadow def that rots green — client-architecture-lockdown.md §16 G13.`,
    });
  }
  const placement = triggerPlacement(def.init);
  const singletonOwner =
    placement !== undefined && SINGLETON_PLACEMENTS.has(placement)
      ? claim(placement, def, seenSingletons)
      : undefined;
  if (singletonOwner !== undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `ModalDefinition "${def.name}" claims the singleton placement "${placement}", already claimed by "${singletonOwner.name}" (${singletonOwner.file}) — the rail/topbar/mobile-bar derivation renders exactly ONE affordance per avatar/topbar-command/mobile-tab — client-architecture-lockdown.md §6d.`,
    });
  }
  const reason = plannedReason(def.init);
  if (reason !== undefined && reason.length === 0) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `planned modal "${def.name}" has an empty \`body.planned\` reason — the DECLARED-PLANNED arm needs the tracked reason — client-architecture-lockdown.md §6d.`,
    });
  }
}

function checkModalDefs(
  sf: SourceFile,
  out: Violation[],
  seenIds: Map<string, Seen>,
  seenSingletons: Map<string, Seen>,
): void {
  const path = sf.getFilePath();
  const coLocated = MODAL_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ModalDefinition")) {
      continue;
    }
    const line = decl.getStartLineNumber();
    if (!coLocated) {
      out.push({
        file: rel(path),
        line,
        message: `ModalDefinition "${decl.getName()}" is not co-located — a modal definition lives only in a feature's lib modal file (features/*/lib/*-modal.tsx; G13 keys on location) — client-architecture-lockdown.md §6d.`,
      });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    checkModalDef({ name: decl.getName(), path, line, init }, out, seenIds, seenSingletons);
  }
}

function checkRouteFile(sf: SourceFile, out: Violation[]): void {
  const rp = rel(sf.getFilePath());
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "modals") {
      continue;
    }
    const init = attr.getInitializer();
    if (init !== undefined && Node.isJsxExpression(init)) {
      const expr = init.getExpression();
      if (expr !== undefined && Node.isObjectLiteralExpression(expr)) {
        out.push({
          file: rp,
          line: attr.getStartLineNumber(),
          message:
            "a `modals` prop object-literal map in a route file — the override god-map the lockdown killed. " +
            "Modals ride the registry (assembled at the main.tsx door); a route is a thin mount — " +
            "client-architecture-lockdown.md §7.",
        });
      }
    }
  }
}

export const gate: GateDescriptor = {
  name: "modal-registry-completeness",
  docRow: "client-architecture-lockdown.md §6d / §16 G13",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a modal is dishonest: a ModalDefinition not co-located in a feature modal file, a duplicate id, a DECLARED-PLANNED modal with an empty reason, two modals claiming a singleton placement (avatar/topbar-command/mobile-tab), or a route re-forming the `modals` override god-map — client-architecture-lockdown.md §6d.",
  fix: "co-locate the definition; a planned modal is a non-empty reason (no function body); one modal per avatar/topbar-command/mobile-tab; a route is a thin mount — modals ride the registry.",
  run: (ctx) => {
    const out: Violation[] = [];
    const seenIds = new Map<string, Seen>();
    const seenSingletons = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkModalDefs(sf, out, seenIds, seenSingletons);
      if (path.includes(ROUTES_DIR)) {
        checkRouteFile(sf, out);
      }
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: "export const xModal: ModalDefinition = { id: 'x' };\n",
      at: "packages/client/src/features/x/lib/not-a-modal-file.ts",
      expect: { messageIncludes: "not co-located" },
      why: "a ModalDefinition outside a `*-modal` file — the co-location arm",
    },
    {
      files:
        "export const xModal: ModalDefinition = { id: 'x', trigger: { placement: 'content' }, body: { planned: '' } };\n",
      at: "packages/client/src/features/x/lib/x-modal.ts",
      expect: { messageIncludes: "empty" },
      why: "a DECLARED-PLANNED modal with an empty reason — the planned-reason arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-modal.ts":
          "export const aModal: ModalDefinition = { id: 'x', trigger: { placement: 'avatar' } };\n",
        "packages/client/src/features/b/lib/b-modal.ts":
          "export const bModal: ModalDefinition = { id: 'y', trigger: { placement: 'avatar' } };\n",
      },
      expect: { messageIncludes: "singleton placement" },
      why: "two modals claiming the `avatar` singleton placement — the singleton-placement arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-modal.ts":
          "export const aModal: ModalDefinition = { id: 'dup', trigger: { placement: 'content' } };\n",
        "packages/client/src/features/b/lib/b-modal.ts":
          "export const bModal: ModalDefinition = { id: 'dup', trigger: { placement: 'content' } };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located ModalDefinitions declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: "export const G = <AppShell modals={{ theme: 1, settings: 2 }} />;\n",
      at: "packages/client/src/routes/some-route.tsx",
      expect: { messageIncludes: "god-map" },
      why: "a `modals` prop object literal in a route — the anti-god-map arm",
    },
  ],
  mustPass: [
    {
      files:
        "export const themeModal: ModalDefinition = { id: 'theme', trigger: { placement: 'rail-footer' }, body: () => null };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a FULL co-located modal (function body, repeatable rail-footer placement) — passes",
    },
    {
      files:
        "export const draftModal: ModalDefinition = { id: 'draft', trigger: { placement: 'content' }, body: { planned: 'build pending' } };\n",
      at: "packages/client/src/features/x/lib/draft-modal.tsx",
      why: "a DECLARED-PLANNED modal — non-empty reason, no function body — passes",
    },
  ],
};
