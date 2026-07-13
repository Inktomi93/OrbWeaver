// Gate: registry-pairing — the RAIL registry (features/**/lib/rail-slots.ts) and its sibling
// MODAL_SLOTS bodies (features/**/lib/modal-slots.tsx) must be a BIJECTION on modal ids: every
// rail/topbar/avatar modal TRIGGER has a body, and every body has a reachable trigger. A missing body
// means the panel won't open; an orphan body is a modal no affordance can reach.
import type { ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const RAIL_SUFFIX = "/lib/rail-slots.ts";
const MODAL_BASENAME = "/lib/modal-slots.tsx";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function stringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

function modalTriggerIds(sf: SourceFile): Array<{ id: string; line: number }> {
  const out: Array<{ id: string; line: number }> = [];
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    if (stringProp(obj, "kind") !== "modal") {
      continue;
    }
    const id = stringProp(obj, "id");
    if (id !== undefined) {
      out.push({ id, line: obj.getStartLineNumber() });
    }
  }
  return out;
}

function modalBodyIds(sf: SourceFile): Array<{ id: string; line: number }> {
  const decl = sf.getVariableDeclaration("MODAL_SLOTS");
  const init = decl?.getInitializer();
  if (init === undefined || !Node.isObjectLiteralExpression(init)) {
    return [];
  }
  const out: Array<{ id: string; line: number }> = [];
  for (const prop of init.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      out.push({ id: prop.getName(), line: prop.getStartLineNumber() });
    }
  }
  return out;
}

function checkPair(railSf: SourceFile, modalSf: SourceFile, out: Violation[]): void {
  const triggers = modalTriggerIds(railSf);
  const bodies = modalBodyIds(modalSf);
  const triggerSet = new Set(triggers.map((t) => t.id));
  const bodySet = new Set(bodies.map((b) => b.id));
  for (const t of triggers) {
    if (!bodySet.has(t.id)) {
      out.push({
        file: rel(railSf.getFilePath()),
        line: t.line,
        message:
          `rail modal trigger "${t.id}" has no MODAL_SLOTS body in the sibling modal-slots.tsx — ` +
          '"the panel won\'t open" (UI-Gates §11.5). Add the body, or drop the trigger.',
      });
    }
  }
  for (const b of bodies) {
    if (!triggerSet.has(b.id)) {
      out.push({
        file: rel(modalSf.getFilePath()),
        line: b.line,
        message:
          `MODAL_SLOTS body "${b.id}" has no rail/topbar/avatar trigger (a { kind: "modal", id } entry ` +
          "in rail-slots.ts) — an unreachable orphan modal (UI-Gates §11.5). Add a trigger, or drop the body.",
      });
    }
  }
}

/** The whole-tree pairing scan shared by the legacy Check and the single-pass `run` descriptor: every
 *  rail-slots.ts is checked against its sibling modal-slots.tsx for a modal-id bijection. */
function scanRegistryPairing(project: Project): Violation[] {
  const out: Violation[] = [];
  for (const railSf of project.getSourceFiles()) {
    const path = railSf.getFilePath();
    if (!path.endsWith(RAIL_SUFFIX)) {
      continue;
    }
    const modalPath = `${path.slice(0, -RAIL_SUFFIX.length)}${MODAL_BASENAME}`;
    const modalSf = project.getSourceFile(modalPath);
    if (modalSf === undefined) {
      out.push({
        file: rel(path),
        line: 0,
        message:
          "rail-slots.ts has no sibling lib/modal-slots.tsx — the rail↔modal pairing has nothing to " +
          "check against (UI-Gates §11.5).",
      });
      continue;
    }
    checkPair(railSf, modalSf, out);
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "registry-pairing",
  docRow: "UI-Gates-and-Lessons.md §11.5 (design-enforcement.md §3.1)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "the rail↔modal registries must be a BIJECTION on modal ids — every { kind: 'modal', id } trigger in rail-slots.ts needs a MODAL_SLOTS body in the sibling modal-slots.tsx, and vice versa (UI-Gates-and-Lessons.md §11.5).",
  fix: "add the missing MODAL_SLOTS body / rail trigger, or drop the orphan side, so triggers and bodies pair 1:1.",
  run: (ctx) => {
    for (const v of scanRegistryPairing(ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/lib/rail-slots.ts":
          'export const RAIL = [{ kind: "modal", id: "orphanTrigger" }];\n',
        "packages/client/src/features/x/lib/modal-slots.tsx": "export const MODAL_SLOTS = {};\n",
      },
      expect: { messageIncludes: "no MODAL_SLOTS body" },
      why: "a modal trigger with no body — 'the panel won't open' (§11.5)",
    },
    {
      files: {
        "packages/client/src/features/x/lib/rail-slots.ts": "export const RAIL = [];\n",
        "packages/client/src/features/x/lib/modal-slots.tsx":
          "export const MODAL_SLOTS = { orphanBody: {} };\n",
      },
      expect: { messageIncludes: "no rail/topbar/avatar trigger" },
      why: "an orphan MODAL_SLOTS body with no reachable trigger — an unreachable modal (§11.5)",
    },
    {
      files: {
        "packages/client/src/features/x/lib/rail-slots.ts":
          'export const RAIL = [{ kind: "modal", id: "theme" }];\n',
      },
      expect: { messageIncludes: "no sibling lib/modal-slots.tsx" },
      why: "a rail-slots.ts with no sibling modal-slots.tsx — the pairing has nothing to check against (§11.5)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/lib/rail-slots.ts":
          'export const RAIL = [{ kind: "modal", id: "theme" }];\n',
        "packages/client/src/features/x/lib/modal-slots.tsx":
          "export const MODAL_SLOTS = { theme: {} };\n",
      },
      why: "trigger and body pair 1:1 on the id — a complete bijection, passes",
    },
  ],
};
