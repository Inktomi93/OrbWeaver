// Self-test for `pnpm ast subset-callers` (tooling/src/ast/ops/subset-callers.ts) — the STALE-DOOR lens
// (#546, minted from #539). PLANTED CONTROLS BOTH DIRECTIONS are the whole point: a genuine strict subset
// must FLAG, and same-key / disjoint / partially-overlapping callers must NOT — a lens that flags any
// difference is noise, and one that flags nothing is a false clean. The refusal arms are pinned too: a
// spread, a computed key, an unfollowable argument and a missing argument each leave their site UNJUDGED
// with a stated reason, never silently folded into "the doors agree".
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { SubsetAudit } from "../../../../tooling/src/ast/index.ts";
import { collectSubsetCallers } from "../../../../tooling/src/ast/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const VERB = "sendTurn";

/** An in-memory workspace holding `files` (repo-relative path → source), audited for `VERB`. */
function auditOf(files: Record<string, string>): SubsetAudit {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return collectSubsetCallers(project.getSourceFiles(), VERB);
}

/** The flagged sites' key sets, one string per finding — the shape every assertion below reads. */
function flagged(audit: SubsetAudit): string[] {
  return audit.findings.map((f) => (f.site.keys ?? []).join(","));
}

describe("ast subset-callers lens (the stale-door class)", () => {
  test("THE FOUNDING SHAPE: a caller passing a strict SUBSET is flagged, and names the keys it dropped", () => {
    // #539 verbatim in miniature: the surviving door carries guided steer + the response nudge; the stale
    // one passes only the speaker. Structurally identical calls — invisible to cpd, respell and every gate.
    const audit = auditOf({
      "packages/client/src/features/chat/components/speak-as-select.tsx": "export const A = () => sendTurn({ chatId, speakerCharacterId });\n",
      "packages/client/src/features/chat/components/composer.tsx": "export const B = () => sendTurn({ chatId, speakerCharacterId, guided, responseNudge });\n",
    });

    expect(audit.sites).toHaveLength(2);
    expect(audit.resolved).toBe(2);
    expect(audit.findings).toHaveLength(1);
    const finding = audit.findings[0];
    expect(finding?.site.keys).toEqual(["chatId", "speakerCharacterId"]);
    expect(finding?.missing).toEqual(["guided", "responseNudge"]);
    // The finding NAMES the door to diff against — a bare "you're missing keys" sends the reader hunting.
    expect(finding?.supersets).toHaveLength(1);
    expect(finding?.supersets[0]?.keys).toEqual(["chatId", "guided", "responseNudge", "speakerCharacterId"]);
  });

  test("NEGATIVE CONTROL — the same keys in a different ORDER, and a string-literal spelling, are not a subset", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ chatId, guided });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ guided, chatId });\n",
      "packages/client/src/c.ts": 'export const C = () => sendTurn({ "chatId": 1, guided: 2 });\n',
    });
    expect(audit.resolved).toBe(3);
    expect(flagged(audit)).toEqual([]);
  });

  test("NEGATIVE CONTROL — DISJOINT key sets are not a subset (two different calls, not one stale door)", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ chatId });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ draftId });\n",
    });
    expect(audit.resolved).toBe(2);
    expect(flagged(audit)).toEqual([]);
  });

  test("NEGATIVE CONTROL — a PARTIAL overlap in both directions is a different class and is not reported", () => {
    // {a,b} vs {b,c}: neither contains the other, so neither is the stale door — flagging one would accuse
    // an innocent site, which is exactly how a lens trains its readers to ignore it.
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ chatId, guided });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ guided, nudge });\n",
    });
    expect(flagged(audit)).toEqual([]);
  });

  test("an EMPTY object literal is never flagged — every other site would trivially superset it", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({});\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ chatId, guided });\n",
    });
    expect(audit.resolved).toBe(2);
    expect(flagged(audit)).toEqual([]);
  });

  test("a SPREAD leaves its site UNJUDGED with a stated reason — and never makes a sibling look stale", () => {
    // The permissive direction is the dangerous one: `{...base}` may carry every key, so treating the
    // literal keys as the whole set would flag the honest caller beside it as a subset. It is REFUSED.
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ ...base, chatId });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ chatId });\n",
    });
    expect(audit.sites).toHaveLength(2);
    expect(audit.resolved).toBe(1);
    expect(flagged(audit)).toEqual([]);
    const unjudged = audit.sites.filter((s) => s.keys === null);
    expect(unjudged).toHaveLength(1);
    expect(unjudged[0]?.unresolved).toContain("SPREAD");
  });

  test("a COMPUTED key leaves its site UNJUDGED — the runtime names it, not the source", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ [key]: 1, chatId });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ chatId, guided });\n",
    });
    expect(audit.resolved).toBe(1);
    expect(audit.sites.find((s) => s.keys === null)?.unresolved).toContain("COMPUTED");
  });

  test("an argument this lens cannot follow, and a call with NO argument, are each unjudged with their own reason", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = (payload) => sendTurn(payload);\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn();\n",
      "packages/client/src/c.ts": "export const C = () => sendTurn(buildPayload());\n",
    });
    expect(audit.resolved).toBe(0);
    const reasons = audit.sites.map((s) => s.unresolved ?? "");
    expect(reasons.some((r) => r.includes("ONE hop, same file"))).toBe(true);
    expect(reasons.some((r) => r.includes("no first argument"))).toBe(true);
    expect(reasons.some((r) => r.includes("not an object literal"))).toBe(true);
  });

  test("ONE HOP, SAME FILE: an identifier naming a same-file const resolves, and names the const it came through", () => {
    // Without this arm the lens is blind to the `const input = {…}; send(input)` spelling — a whole class
    // of doors reading as "no findings", which is the false clean the refusals above exist to prevent.
    const audit = auditOf({
      "packages/client/src/a.ts": "const input = { chatId, guided, nudge };\nexport const A = () => sendTurn(input);\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ chatId });\n",
    });
    expect(audit.resolved).toBe(2);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]?.missing).toEqual(["guided", "nudge"]);
    expect(audit.findings[0]?.supersets[0]?.via).toBe("input");
  });

  test("wrapped literals (`as`, `satisfies`, parens) resolve — a narrow node check would shrink the comparable set", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ chatId, guided } as TurnInput);\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn(({ chatId, guided, nudge }) satisfies TurnInput);\n",
      "packages/client/src/c.ts": "export const C = () => sendTurn({ chatId });\n",
    });
    expect(audit.resolved).toBe(3);
    // The `as`-wrapped site is itself a subset of the `satisfies`-wrapped one, and the bare `{chatId}`
    // is a subset of both — proof that BOTH wrapped literals were actually read.
    expect(flagged(audit).sort((a, b) => a.localeCompare(b))).toEqual(["chatId", "chatId,guided"]);
  });

  test("a METHOD-TAIL call site is matched, exactly as the `callers` verb matches it", () => {
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => api.sendTurn({ chatId });\n",
      "packages/client/src/b.ts": "export const B = () => sendTurn({ chatId, guided });\n",
    });
    expect(audit.sites).toHaveLength(2);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]?.missing).toEqual(["guided"]);
  });

  test("a same-name call in an unrelated file still counts — the SUBJECT is the comparison unit, by design", () => {
    // The declared limit, pinned so it is a decision and not a surprise: this lens compares every call
    // site of the NAMED symbol. Naming a shared method tail pools unrelated verbs (the banner says so).
    const audit = auditOf({
      "packages/client/src/a.ts": "export const A = () => sendTurn({ chatId });\n",
      "packages/server/src/unrelated.ts": "export const U = () => sendTurn({ chatId, somethingElse });\n",
    });
    expect(audit.findings).toHaveLength(1);
  });
});
