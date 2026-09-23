// The generated-file renderers: deterministic bytes, relative links that resolve from the file's own
// folder, and the plan-slug derivation for live and archived plan paths.
import type { WorkItem } from "../../../../tooling/src/doc/index.ts";
import { isGeneratedPath, planSlugOf, renderAdrIndex, renderPlanIndex, renderTasks, renderWorkIndex } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 1,
    path: "docs/work/0001-a.md",
    title: "A",
    kind: "work",
    state: "open",
    updated: "2026-09-23",
    priority: null,
    area: null,
    lane: null,
    blocked: null,
    plan: null,
    evidence: null,
    reviewed: null,
    ...overrides,
  };
}

test("the ADR index sorts by id, links by basename and names a superseder", () => {
  const rendered = renderAdrIndex([
    { path: "docs/adr/0170-later.md", title: "Later", kind: "adr", status: "active", supersededBy: null },
    { path: "docs/adr/0164-first.md", title: "First", kind: "adr", status: "superseded", supersededBy: "docs/adr/0170-later.md" },
  ]);
  expect(rendered).toContain("---\nkind: index\nstatus: active\n---\n");
  expect(rendered).toContain("| D164 | [First](0164-first.md) | superseded by [0170-later.md](0170-later.md) |\n| D170 | [Later](0170-later.md) | active |");
  expect(renderAdrIndex([])).toBe(renderAdrIndex([]));
});

test("the plan index links relative to docs/plans, archived plans included", () => {
  const rendered = renderPlanIndex([
    { path: "docs/plans/archive/2026-09-01-old/design.md", title: "Old", kind: "plan", status: "archived", supersededBy: null },
    { path: "docs/plans/live/design.md", title: "Live", kind: "plan", status: "active", supersededBy: null },
  ]);
  expect(rendered).toContain("| [Old](archive/2026-09-01-old/design.md) | archived |\n| [Live](live/design.md) | active |");
});

test("the work index groups by state with the state's companion in parentheses and names empty groups", () => {
  const rendered = renderWorkIndex([
    item({ id: 2, path: "docs/work/0002-b.md", title: "B", state: "doing", lane: "cb-x", priority: "P1" }),
    item({ id: 1, state: "blocked", blocked: "on 2", plan: "p" }),
    item({ id: 3, path: "docs/work/0003-c.md", title: "C", state: "done", evidence: "abcdef1234567890" }),
  ]);
  expect(rendered).toContain("## Open\n\nNone.\n");
  expect(rendered).toContain("## Doing\n\n- [0002](0002-b.md) P1 B (cb-x)\n");
  expect(rendered).toContain("## Blocked\n\n- [0001](0001-a.md) triage A `p` (on 2)\n");
  expect(rendered).toContain("## Done\n\n- [0003](0003-c.md) triage C (abcdef123456)\n");
});

test("a plan's tasks.md ticks done items and links relative to the plan folder, archived or live", () => {
  const live = renderTasks("Plan", "docs/plans/p/", [
    item({ id: 1, plan: "p" }),
    item({ id: 2, path: "docs/work/0002-b.md", title: "B", state: "done", evidence: "abc1234", plan: "p" }),
  ]);
  expect(live).toContain("# Plan: tasks\n");
  expect(live).toContain("- [ ] [0001](../../work/0001-a.md) triage A `p`\n- [x] [0002](../../work/0002-b.md) triage B `p` (abc1234)\n");
  const archived = renderTasks("Plan", "docs/plans/archive/2026-09-01-p/", [
    item({ id: 1, path: "docs/plans/archive/2026-09-01-p/0001-a.md", plan: "p", state: "done", evidence: "abc1234" }),
  ]);
  expect(archived).toContain("- [x] [0001](0001-a.md) triage A `p` (abc1234)\n");
  expect(renderTasks("Plan", "docs/plans/p/", [])).toContain("None yet.\n");
});

test("plan slugs derive from live and archived paths; generated paths are recognised", () => {
  expect(planSlugOf("docs/plans/doc-system/design.md")).toBe("doc-system");
  expect(planSlugOf("docs/plans/archive/2026-09-01-doc-system/design.md")).toBe("doc-system");
  expect(planSlugOf("docs/plans/README.md")).toBeNull();
  expect(planSlugOf("docs/adr/0164-x.md")).toBeNull();
  expect(isGeneratedPath("docs/plans/doc-system/tasks.md")).toBe(true);
  expect(isGeneratedPath("docs/law/README.md")).toBe(true);
  expect(isGeneratedPath("docs/plans/doc-system/design.md")).toBe(false);
});
