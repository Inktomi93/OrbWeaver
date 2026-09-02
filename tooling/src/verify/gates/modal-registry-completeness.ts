// Gate: modal-registry-completeness (client-architecture-lockdown.md §6d / §16 G13) — the modal
// registry's structural walls tsc can't see. tsc forces the door Record total over MODAL_SLOT_IDS; this
// adds: (1) CO-LOCATION — a `ModalDefinition` lives only in `features/<owner>/lib/<id>-modal.{ts,tsx}`;
// (2) DUPLICATE ID — two co-located defs declaring the same `id` (a shadow def rots green while edits
//     land in the dead twin; the door assembly silently picks one name);
// (3) the PLANNED discipline — `body: { planned }` needs a non-empty reason AND no real function body
//     (a planned modal wiring a real body is dishonest);
// (4) the SINGLETON-PLACEMENT arm — the mobile-bar derivation assumes exactly ONE modal per `mobile-tab`
//     (the You sheet); two claiming it → RED (`rail.end`/`topbar.trail`/`surface` are cluster placements
//     that may repeat — `surface` carries both new-chat AND the account modal, §E-7);
// (5) the ANTI-GOD-MAP arm — a `modals={{…}}` object literal in a route file (the deleted override map);
// (6) the SURFACE-REACHABILITY arm (§E-7) — a `surface`-placed modal has NO chrome affordance deriving it
//     (it lives inside a feature surface), so it MUST have ≥1 explicit `openModal("<id>")` call site or it
//     is unreachable dead chrome. A DECLARED-PLANNED surface modal is exempt (not wired yet, by design).
// (7) UNREADABLE DEFINITION (#944, 2026-09-01) — the reader used to `continue` past any initializer that
//     was not a bare object literal, so `export const xModal: ModalDefinition = importedDefinition;` left
//     the duplicate-id, singleton-placement, planned-honesty and surface-reachability arms with NOTHING to
//     judge while the file still sat at its sanctioned `*-modal.tsx` path and every path check stayed
//     green. §6d gives the definition ONE home and sanctions no builder for modals, so an unresolvable
//     initializer FAILS CLOSED. A same-file const and an `as`/`satisfies` wrapper still resolve — both are
//     still co-located. The gate declares its MODAL POPULATION (#946) so the next shrink is loud.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readObjectLiteral, readStringValue } from "../lib/ast-read.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.{ts,tsx}`. */
const MODAL_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-modal\.tsx?$/;
const ROUTES_DIR = "/packages/client/src/routes/";
/** Placements the derivation renders as EXACTLY ONE affordance — a second claimant breaks the .find(). */
const SINGLETON_PLACEMENTS = new Set(["mobile-tab"]);
/** The placement whose modals are reached ONLY by an explicit `openModal(id)` opener (arm 6). */
const SURFACE_PLACEMENT = "surface";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A modal definition's declared `id` string literal (through any as/satisfies/paren wrapper), or undefined. */
function modalId(modal: ObjectLiteralExpression): string | undefined {
  const id = objProp(modal, "id");
  return id === undefined ? undefined : readStringValue(id);
}

/** A modal definition's `trigger.placement` string literal (through any wrapper), or undefined. */
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
  return init === undefined ? undefined : readStringValue(init);
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
  return (init === undefined ? undefined : readStringValue(init)) ?? "";
}

interface Seen {
  readonly name: string;
  readonly file: string;
}

interface ModalDef {
  readonly name: string;
  readonly path: string;
  readonly init: ObjectLiteralExpression;
}

/** A `surface`-placed modal with a real body — subject to the reachability arm (needs ≥1 opener). Keeps
 *  its own object-literal NODE so the deferred post-pass arm can still report node-anchored. */
interface SurfaceModal {
  readonly id: string;
  readonly name: string;
  readonly init: ObjectLiteralExpression;
}

/** The single-pass accumulators (bundled so the per-def check stays under the param cap). */
interface Accum {
  readonly seenIds: Map<string, Seen>;
  readonly seenSingletons: Map<string, Seen>;
  readonly surfaceModals: SurfaceModal[];
  readonly openModalCallSites: Set<string>;
  /** The #946 member tally: definitions this pass RESOLVED, and definitions it could not read. */
  members: number;
  unresolved: number;
}

/** The population's stable name — what a reader diffs run over run (#946). */
const POPULATION = "ModalDefinition";

/** Collects the id argument of every `openModal("<id>")` call — the explicit opener a `surface` modal
 *  needs. Matches a call whose callee is the bare identifier `openModal` with a first string-literal arg;
 *  ignores prop passing (`openModal={…}`) and identifier args (`openModal(commandModalId)`). */
function collectOpenModalCallSites(sf: SourceFile, sites: Set<string>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "openModal") {
      continue;
    }
    const [arg] = call.getArguments();
    const id = arg === undefined ? undefined : readStringValue(arg);
    if (id !== undefined) {
      sites.add(id);
    }
  }
}

/** Records `key` against `seen`; returns the FIRST owner if `key` is already claimed (a duplicate). */
function claim(key: string, def: ModalDef, seen: Map<string, Seen>): Seen | undefined {
  const firstOwner = seen.get(key);
  if (firstOwner === undefined) {
    seen.set(key, { name: def.name, file: rel(def.path) });
    return;
  }
  return firstOwner;
}

// Node-anchored: every arm reports a NODE directly (`ctx.report(node, {token, offset})`), never an
// explicit `Finding` — that overload bypasses `hasGateIgnore` (GATE-AUTHORING.md §1). The per-arm prose
// that used to ride the Finding's `message` field is folded into the gate's ONE `message` below; the
// dynamic identity (id/placement/name/prior claimant) moves into `token`.
function checkModalDef(def: ModalDef, ctx: GateRunCtx, acc: Accum): void {
  const id = modalId(def.init);
  const placement = triggerPlacement(def.init);
  const reason = plannedReason(def.init);
  if (id !== undefined && placement === SURFACE_PLACEMENT && reason === undefined) {
    acc.surfaceModals.push({ id, name: def.name, init: def.init });
  }
  const idOwner = id === undefined ? undefined : claim(id, def, acc.seenIds);
  if (idOwner !== undefined) {
    ctx.report(def.init, {
      token: `duplicate id "${id}" (${def.name}) — first claimed by "${idOwner.name}" (${idOwner.file})`,
      offset: 0,
    });
  }
  const singletonOwner = placement !== undefined && SINGLETON_PLACEMENTS.has(placement) ? claim(placement, def, acc.seenSingletons) : undefined;
  if (singletonOwner !== undefined) {
    ctx.report(def.init, {
      token: `duplicate singleton placement "${placement}" (${def.name}) — first claimed by "${singletonOwner.name}" (${singletonOwner.file})`,
      offset: 0,
    });
  }
  if (reason !== undefined && reason.length === 0) {
    ctx.report(def.init, { token: `planned empty reason (${def.name})`, offset: 0 });
  }
}

function checkModalDefs(sf: SourceFile, ctx: GateRunCtx, acc: Accum): void {
  const path = sf.getFilePath();
  const coLocated = MODAL_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ModalDefinition")) {
      continue;
    }
    if (!coLocated) {
      ctx.report(decl, { token: `not co-located: ${decl.getName()}`, offset: 0 });
      continue;
    }
    // FAIL CLOSED (#944): an initializer this gate cannot resolve to a co-located object literal leaves
    // every arm below with nothing to judge — that is the law being unestablishable, not a clean skip.
    const read = readObjectLiteral(decl.getInitializer());
    if (read.kind === "unresolved") {
      acc.unresolved += 1;
      ctx.report(decl, { token: `unreadable definition: ${decl.getName()} — ${read.shape}`, offset: 0 });
      continue;
    }
    acc.members += 1;
    checkModalDef({ name: decl.getName(), path, init: read.object }, ctx, acc);
  }
}

function checkRouteFile(sf: SourceFile, ctx: GateRunCtx): void {
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "modals") {
      continue;
    }
    const init = attr.getInitializer();
    if (init !== undefined && Node.isJsxExpression(init)) {
      const expr = init.getExpression();
      if (expr !== undefined && Node.isObjectLiteralExpression(expr)) {
        ctx.report(attr, { token: "modals god-map prop", offset: 0 });
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
    "a modal is dishonest: a ModalDefinition not co-located in a feature modal file, a co-located definition this gate cannot READ (an imported/builder initializer — every arm below then has nothing to judge), a duplicate id, a DECLARED-PLANNED modal with an empty reason, two modals claiming the mobile-tab singleton placement, a `surface` modal with no `openModal(id)` opener, or a route re-forming the `modals` override god-map — client-architecture-lockdown.md §6d.",
  fix: 'co-locate the definition and write it as an object literal (a same-file const and an `as`/`satisfies` wrapper read fine — an IMPORT does not); a planned modal is a non-empty reason (no function body); one modal per mobile-tab; give a `surface` modal ≥1 `openModal("<id>")` call site; a route is a thin mount — modals ride the registry.',
  run: (ctx) => {
    const acc: Accum = { seenIds: new Map(), seenSingletons: new Map(), surfaceModals: [], openModalCallSites: new Set(), members: 0, unresolved: 0 };
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(CLIENT_SRC)) {
        continue;
      }
      checkModalDefs(sf, ctx, acc);
      collectOpenModalCallSites(sf, acc.openModalCallSites);
      if (path.includes(ROUTES_DIR)) {
        checkRouteFile(sf, ctx);
      }
    }
    for (const m of acc.surfaceModals) {
      if (!acc.openModalCallSites.has(m.id)) {
        ctx.report(m.init, { token: `surface modal unreachable: "${m.id}" (${m.name})`, offset: 0 });
      }
    }
    // The SEMANTIC denominator (#946): what the six arms above actually ran over. Zero members on the real
    // tree, or a single unresolved definition, refuses the verdict rather than rendering a healthy ✓.
    ctx.scan({ population: [{ source: POPULATION, members: acc.members, unresolved: acc.unresolved }] });
  },
  mustFlag: [
    {
      files: "export const xModal: ModalDefinition = { id: 'x' };\n",
      at: "packages/client/src/features/x/lib/not-a-modal-file.ts",
      expect: { token: "not co-located: xModal" },
      why: "a ModalDefinition outside a `*-modal` file — the co-location arm",
    },
    {
      files: "export const xModal: ModalDefinition = { id: 'x', trigger: { placement: 'surface' }, body: { planned: '' } };\n",
      at: "packages/client/src/features/x/lib/x-modal.ts",
      expect: { token: "planned empty reason (xModal)" },
      why: "a DECLARED-PLANNED modal with an empty reason — the planned-reason arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-modal.ts": "export const aModal: ModalDefinition = { id: 'x', trigger: { placement: 'mobile-tab' } };\n",
        "packages/client/src/features/b/lib/b-modal.ts": "export const bModal: ModalDefinition = { id: 'y', trigger: { placement: 'mobile-tab' } };\n",
      },
      expect: { token: 'duplicate singleton placement "mobile-tab" (bModal) — first claimed by "aModal" (packages/client/src/features/a/lib/a-modal.ts)' },
      why: "two modals claiming the `mobile-tab` singleton placement — the singleton-placement arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-modal.ts": "export const aModal: ModalDefinition = { id: 'dup', trigger: { placement: 'rail.end' } };\n",
        "packages/client/src/features/b/lib/b-modal.ts": "export const bModal: ModalDefinition = { id: 'dup', trigger: { placement: 'rail.end' } };\n",
      },
      expect: { token: 'duplicate id "dup" (bModal) — first claimed by "aModal" (packages/client/src/features/a/lib/a-modal.ts)' },
      why: "two co-located ModalDefinitions declaring the SAME id — the shadow-def duplicate-id arm",
    },
    {
      files: "export const xModal: ModalDefinition = { id: 'x', trigger: { placement: 'surface' }, body: () => null };\n",
      at: "packages/client/src/features/x/lib/x-modal.tsx",
      expect: { token: 'surface modal unreachable: "x" (xModal)' },
      why: "a `surface` modal with a real body and NO openModal(id) opener — the surface-reachability arm (§E-7)",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-modal.ts": "export const aModal: ModalDefinition = { id: 'dup' as never, trigger: { placement: 'rail.end' } };\n",
        "packages/client/src/features/b/lib/b-modal.ts": "export const bModal: ModalDefinition = { id: 'dup' as never, trigger: { placement: 'rail.end' } };\n",
      },
      expect: { token: 'duplicate id "dup" (bModal) — first claimed by "aModal" (packages/client/src/features/a/lib/a-modal.ts)' },
      why: "duplicate ids written `'dup' as never` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED before hardening (readStringValue unwraps it)",
    },
    {
      files: "export const G = <AppShell modals={{ theme: 1, settings: 2 }} />;\n",
      at: "packages/client/src/routes/some-route.tsx",
      expect: { token: "modals god-map prop" },
      why: "a `modals` prop object literal in a route — the anti-god-map arm",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x-definition.ts": "export const xDef = { id: 'x', trigger: { placement: 'surface' }, body: () => null };\n",
        "packages/client/src/features/x/lib/x-modal.tsx": 'import { xDef } from "./x-definition.ts";\nexport const xModal: ModalDefinition = xDef;\n',
      },
      expect: {
        token: "unreadable definition: xModal — the identifier `xDef` (not an object literal declared in this file — an imported or re-exported definition)",
      },
      why: "THE #944 CONTROL: an IMPORTED initializer at a sanctioned `*-modal.tsx` path. The surface-reachability arm above would have RED'd this modal (no `openModal('x')` anywhere) — instead the gate returned silently, which is the audit's exact escape",
    },
  ],
  mustPass: [
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', trigger: { placement: 'rail.end' }, body: () => null };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a FULL co-located modal (function body, repeatable rail.end placement) — passes",
    },
    {
      files: "export const draftModal: ModalDefinition = { id: 'draft', trigger: { placement: 'surface' }, body: { planned: 'build pending' } };\n",
      at: "packages/client/src/features/x/lib/draft-modal.tsx",
      why: "a DECLARED-PLANNED surface modal — planned bodies are exempt from the opener requirement — passes",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x-modal.tsx":
          "export const xModal: ModalDefinition = { id: 'x', trigger: { placement: 'surface' }, body: () => null };\n",
        "packages/client/src/features/x/components/opener.tsx": "import { openModal } from '#state';\nexport const O = (): void => openModal('x');\n",
      },
      why: "a `surface` modal with a real body AND an `openModal('x')` opener call site — reachable, passes",
    },
    {
      files:
        "const themeModalDef = { id: 'theme', trigger: { placement: 'rail.end' }, body: () => null };\nexport const themeModal: ModalDefinition = themeModalDef;\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "SAME-FILE indirection — still co-located, so `readObjectLiteral` follows it and every arm judges the real definition. The declared limit this row writes down: only an import/builder fails closed",
    },
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', trigger: { placement: 'rail.end' }, body: () => null } satisfies ModalDefinition;\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a WHOLE-literal `satisfies` wrapper — the shape the plain ObjectLiteral check treated as unreadable and silently skipped before #944 (config-group-completeness's `literalInit` closed the same class on groups 2026-08-30)",
    },
  ],
};
