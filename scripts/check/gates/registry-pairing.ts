// Gate: registry-pairing (docs/architecture/core/UI-Gates-and-Lessons.md §11.5 + design-enforcement.md
// §3.1 — "check:registry-pairing"; promotes the behavioral rail-slots test to a Tier-A structural gate).
// The RAIL registry (features/**/lib/rail-slots.ts) and its sibling MODAL_SLOTS bodies
// (features/**/lib/modal-slots.tsx) must be a BIJECTION on modal ids: every rail/topbar/avatar modal
// TRIGGER has a body, and every body has a reachable trigger. A missing body = "the panel won't open"
// (shipped green in neo, §11.5); an orphan body = a modal no affordance can reach. The type layer forces
// most of this (`Record<ModalSlotId, ModalDef>` + SectionId-typed ids), but an entry MISSING from the
// runtime array is NOT a tsc error — this gate pins that runtime coverage. The companion vitest test
// (tests/client/features/app-shell/lib/rail-slots.test.ts) keeps the checks an AST can't do (SectionId
// full-coverage of RAIL_SECTIONS; that each body's `render` is actually callable).
//
// SHAPE (fixture-able per feature-dir pair, the `__g_*` self-test pattern): for every `**/lib/rail-slots.ts`
// it reads the sibling `**/lib/modal-slots.tsx`, extracts modal TRIGGER ids (object literals with
// `kind: "modal"` → their `id` string — RAIL_ACTIONS/ACCOUNT_ACTION/COMMAND_ACTION all match) and BODY ids
// (the `MODAL_SLOTS` object's keys), and asserts the two sets are equal.
import type { ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const RAIL_SUFFIX = "/lib/rail-slots.ts";
const MODAL_BASENAME = "/lib/modal-slots.tsx";

/** `packages/...`-relative path for a violation location. */
function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The string value of a named string-literal property (`id: "theme"` → "theme"), or undefined. */
function stringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** Every `{ kind: "modal", id: "…" }` literal in rail-slots.ts — the modal triggers (rail + topbar + avatar). */
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

/** The keys of the `MODAL_SLOTS` object in modal-slots.tsx — the modal bodies. */
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

export const registryPairing: Check = {
  name: "registry-pairing",
  run: ({ project }): Violation[] => scanRegistryPairing(project),
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 (c) — a cross-FILE PAIRING scan via `run`) ───────────────
// registry-pairing is a cross-file bijection check (each rail-slots.ts vs its SIBLING modal-slots.tsx,
// looked up by path) — not a per-node predicate — so it ports as a `run` descriptor reusing the exact
// pairing logic over the SAME shared project. No begin/finalize (each pair is judged inside `run`). A
// synthetic tree with no rail-slots.ts is naturally vacuous. Distinct per-id messages → per-occurrence
// overrides. Findings byte-identical to the legacy Check. Kept ALONGSIDE the legacy Check.
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
