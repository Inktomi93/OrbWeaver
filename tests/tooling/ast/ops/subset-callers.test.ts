// Self-test for `pnpm ast subset-callers` (tooling/src/ast/ops/subset-callers.ts) — the STALE-DOOR lens
// (#546, minted from #539). PLANTED CONTROLS BOTH DIRECTIONS are the whole point: a genuine strict subset
// must FLAG, and same-key / disjoint / partially-overlapping callers must NOT — a lens that flags any
// difference is noise, and one that flags nothing is a false clean. The refusal arms are pinned too: a
// spread, a computed key, an unfollowable argument and a missing argument each leave their site UNJUDGED
// with a stated reason, never silently folded into "the doors agree".
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { SubsetAudit, SubsetFinding } from "../../../../tooling/src/ast/index.ts";
import { collectSubsetCallers, crossClassNote, sameClassFirst } from "../../../../tooling/src/ast/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const VERB = "sendTurn";

/** An in-memory workspace holding `files` (repo-relative path → source), audited for `symbol`. */
function auditFor(files: Record<string, string>, symbol: string): SubsetAudit {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return collectSubsetCallers(project.getSourceFiles(), symbol);
}

/** The default subject — the DIRECT-call arm every legacy case below exercises. */
function auditOf(files: Record<string, string>): SubsetAudit {
  return auditFor(files, VERB);
}

/** One module-scope `createEntityMutation` hook — the client's ONE mutation factory, verbatim in miniature. */
function factory(hook: string, procedure: string): string {
  return `const ${hook} = createEntityMutation({ options: (trpc) => trpc.${procedure}.mutationOptions(), busDriven: true });\n`;
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

// The CLIENT-DOOR arm (#572). A client door names its verb only at its CREATION site
// (`createEntityMutation({ options: (trpc) => trpc.chat.generate.mutationOptions() })`) and FIRES through a
// bare `.mutate(…)` that names nothing — so before this arm the lens was structurally blind to every
// affordance a user actually clicks, and could only ever corroborate a hand-read of the duplicate-door
// census. PLANTED CONTROLS BOTH DIRECTIONS, same posture as the direct arm: a genuine client-door subset
// (the #539 shape, recreated) FLAGS; a ratified cross-plane pair (the #568 shape) does NOT; and every fire
// site the level-1 resolver cannot follow is COUNTED and NAMED rather than folded into "the doors agree".
describe("ast subset-callers lens (the CLIENT-door arm)", () => {
  test("THE #539 SHAPE ON CLIENT DOORS: two `.mutate()` doors of one verb, one passing a strict subset", () => {
    const audit = auditFor(
      {
        "packages/client/src/features/chat/hooks/use-guided-actions.ts":
          `${factory("useGuidedGenerateMutation", "chat.generate")}export function useGuidedActions() {\n` +
          "  const generate = useGuidedGenerateMutation({ trpc, invalidation });\n" +
          "  return { fireResponse: () => generate.mutate({ chatId, guided, speakerCharacterId, responseNudge }) };\n}\n",
        "packages/client/src/features/chat/components/speak-as-select.tsx":
          `${factory("useSpeakAsMutation", "chat.generate")}export function SpeakAsSelect() {\n` +
          "  const speakAs = useSpeakAsMutation({ trpc, invalidation });\n" +
          "  return () => speakAs.mutate({ chatId, speakerCharacterId });\n}\n",
      },
      "generate",
    );

    expect(audit.sites).toHaveLength(2);
    expect(audit.resolved).toBe(2);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]?.site.keys).toEqual(["chatId", "speakerCharacterId"]);
    expect(audit.findings[0]?.missing).toEqual(["guided", "responseNudge"]);
    // The finding names the RESOLUTION CHAIN, not just the file — a reader must be able to audit the hop.
    expect(audit.findings[0]?.site.door).toBe("`speakAs` ← useSpeakAsMutation → trpc.chat.generate");
    expect(audit.doors.procedures).toEqual(["chat.generate"]);
  });

  test("the verb answers to its FULL PATH as well as its bare member name", () => {
    const audit = auditFor(
      {
        "packages/client/src/features/chat/a.ts": `${factory("useA", "chat.generate")}export const A = () => useA({ trpc }).mutate({ chatId, guided });\n`,
        "packages/client/src/features/chat/b.ts": `${factory("useB", "chat.generate")}export const B = () => useB({ trpc }).mutate({ chatId });\n`,
      },
      "chat.generate",
    );
    expect(audit.resolved).toBe(2);
    expect(flagged(audit)).toEqual(["chatId"]);
  });

  test("NEGATIVE CONTROL — the #568 ratified pair (two planes, identical payloads) is NOT a finding", () => {
    // undoContinue's two doors: the composer's ✨ menu (tail assistant slot) and the transcript row's ⋯ item
    // (that row). Both pass `{chatId, messageId}` — a ratified duplication, not a stale door. A lens that
    // flagged this would teach its readers to ignore it.
    const audit = auditFor(
      {
        "packages/client/src/features/chat/hooks/use-composer-utilities.ts":
          `${factory("useUndoContinueMutation", "chat.undoContinue")}export function useComposerUtilities(chatId) {\n` +
          "  const undo = useUndoContinueMutation({ trpc, invalidation });\n" +
          "  return { undoContinue: (messageId) => undo.mutate({ chatId, messageId }) };\n}\n",
        "packages/client/src/features/chat/components/message-actions-row.tsx":
          `${factory("useRowUndoContinueMutation", "chat.undoContinue")}export function MessageActionsRow() {\n` +
          "  const undoContinue = useRowUndoContinueMutation({ trpc, invalidation });\n" +
          "  return () => undoContinue.mutate({ chatId, messageId });\n}\n",
      },
      "undoContinue",
    );
    expect(audit.sites).toHaveLength(2);
    expect(audit.resolved).toBe(2);
    expect(flagged(audit)).toEqual([]);
  });

  test("a HOOK-WRAPPED door whose payload is built conditionally is UNJUDGED — with its wrap site and chain", () => {
    // `fireContinue` picks its payload at the call: `continueTurn.mutate(guided === undefined ? A : B)`.
    // The DOOR resolves (so the site is not lost), the PAYLOAD does not — which is exactly the state that
    // must print, because reporting the sibling door as "in agreement" would be a clean nobody measured.
    const audit = auditFor(
      {
        "packages/client/src/features/chat/hooks/use-guided-actions.ts":
          `${factory("useGuidedContinueMutation", "chat.continueTurn")}export function useGuidedActions() {\n` +
          "  const continueTurn = useGuidedContinueMutation({ trpc, invalidation });\n" +
          "  return { fireContinue: () => continueTurn.mutate(guided === undefined ? { chatId, messageId } : { chatId, messageId, guided }) };\n}\n",
        "packages/client/src/features/chat/hooks/use-continue-turn.ts":
          `${factory("useContinueTurnMutation", "chat.continueTurn")}export function useContinueTurn() {\n` +
          "  const mutation = useContinueTurnMutation({ trpc, invalidation });\n" +
          "  return { continueTurn: (chatId, messageId) => mutation.mutate({ chatId, messageId }) };\n}\n",
      },
      "continueTurn",
    );
    expect(audit.sites).toHaveLength(2);
    expect(audit.resolved).toBe(1);
    const unjudged = audit.sites.filter((s) => s.keys === null);
    expect(unjudged).toHaveLength(1);
    expect(unjudged[0]?.unresolved).toContain("ConditionalExpression");
    expect(unjudged[0]?.door).toBe("`continueTurn` ← useGuidedContinueMutation → trpc.chat.continueTurn");
  });

  test("a fire site whose RECEIVER cannot be followed is counted as a declared blind spot, never as silence", () => {
    // A receiver arriving as a parameter (and, in the tree, a destructured `{ mutate }`) is outside level-1
    // resolution: it could be a door on ANY verb, so it lands in the census the banner prints — the number
    // that makes "no findings" legible as measured rather than as blindness.
    const audit = auditFor(
      {
        "packages/client/src/features/chat/hooks/use-continue-turn.ts":
          `${factory("useContinueTurnMutation", "chat.continueTurn")}export function useContinueTurn() {\n` +
          "  const mutation = useContinueTurnMutation({ trpc, invalidation });\n" +
          "  return { continueTurn: (chatId, messageId) => mutation.mutate({ chatId, messageId }) };\n}\n",
        "packages/client/src/features/chat/components/opaque.tsx": "export const Opaque = (m) => m.mutate({ chatId });\n",
      },
      "continueTurn",
    );
    expect(audit.sites).toHaveLength(1);
    expect(audit.doors.unresolvedFires).toBe(1);
    expect(audit.doors.factories).toBe(1);
  });

  test("a client door under only DIRECT supersets is marked CROSS-CLASS — the #568 noise, not the #539 class", () => {
    // The closing receipt's own shape: the two ratified `chat.undoContinue` doors agree with each other, but
    // both look like subsets of the DOMAIN verb's server-side callers, which pass `principal` — a field
    // minted at the entry seam that no wire payload can ever carry. Without the marker a triage reader reads
    // that as a stale door and retires a live affordance.
    const audit = auditFor(
      {
        "packages/client/src/features/chat/components/message-actions-row.tsx":
          `${factory("useUndoContinueMutation", "chat.undoContinue")}export function MessageActionsRow() {\n` +
          "  const undoContinue = useUndoContinueMutation({ trpc, invalidation });\n" +
          "  return () => undoContinue.mutate({ chatId, messageId });\n}\n",
        "tests/server/domain/chat/verbs/turn.int.test.ts": "export const T = () => undoContinue({ chatId, messageId, principal });\n",
      },
      "undoContinue",
    );
    expect(audit.findings).toHaveLength(1);
    const finding = audit.findings[0];
    expect(finding?.missing).toEqual(["principal"]);
    expect(crossClassNote(finding as SubsetFinding)).toContain("CROSS-CLASS");
    // …and the marker is SILENT when a client door really is a subset of another client door (#539).
    const stale = auditFor(
      {
        "packages/client/src/features/chat/a.ts": `${factory("useA", "chat.generate")}export const A = () => useA({ trpc }).mutate({ chatId, guided });\n`,
        "packages/client/src/features/chat/b.ts": `${factory("useB", "chat.generate")}export const B = () => useB({ trpc }).mutate({ chatId });\n`,
      },
      "generate",
    );
    expect(crossClassNote(stale.findings[0] as SubsetFinding)).toBe("");
  });

  test("the NAMED supersets put the SAME-CLASS door first — the #539 evidence must not hide behind `+N more`", () => {
    // The live receipt's failure mode: `generate`'s client door had FOURTEEN server-side supersets and ONE
    // sibling client door, and walk order named three server tests while eliding the only line a triage
    // reader needs. The finding was right and its evidence pointed nowhere.
    const audit = auditFor(
      {
        "packages/client/src/features/chat/hooks/use-continue-turn.ts": `${factory("useGenerateMutation", "chat.generate")}export const G = () => useGenerateMutation({ trpc }).mutate({ chatId });\n`,
        "tests/server/domain/chat/verbs/turn-a.int.test.ts": "export const A = () => generate({ chatId, principal });\n",
        "tests/server/domain/chat/verbs/turn-b.int.test.ts": "export const B = () => generate({ chatId, principal, guided });\n",
        "packages/client/src/features/chat/hooks/use-guided-actions.ts": `${factory("useGuidedGenerateMutation", "chat.generate")}export const W = () => useGuidedGenerateMutation({ trpc }).mutate({ chatId, guided });\n`,
      },
      "generate",
    );
    const clientDoorSubset = audit.findings.find((f) => f.site.door?.includes("useGenerateMutation") === true);
    expect(clientDoorSubset).toBeDefined();
    expect(sameClassFirst(clientDoorSubset as SubsetFinding)[0]?.door).toContain("useGuidedGenerateMutation");
  });

  test("a factory hook name declared against TWO different verbs is REFUSED, not guessed", () => {
    const audit = auditFor(
      {
        "packages/client/src/features/chat/a.ts": `${factory("useAmbiguous", "chat.generate")}export const A = () => 1;\n`,
        "packages/client/src/features/chat/b.ts": `${factory("useAmbiguous", "chat.swipe")}export const B = () => 1;\n`,
        "packages/client/src/features/chat/c.ts": "export const C = () => { const fire = useAmbiguous({ trpc }); return () => fire.mutate({ chatId }); };\n",
      },
      "generate",
    );
    expect(audit.sites).toHaveLength(0);
    expect(audit.doors.unresolvedFires).toBe(1);
  });
});
