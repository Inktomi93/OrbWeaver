// THE CHAT TWO-PLANE FAMILY (ledger D161) — the properties a declared proof row cannot express:
// the §6.2 ordinary identity triple and its dead-position alarm, the §6.4 conversion differential against
// the frozen legacy descriptor, and the bidirectional population port with its inside/outside controls.
//
// The declared rows themselves (13 catches, 8 passes, 13 refusals across the two siblings) run on the
// static `structure:policy-conformance` stage; the first test here only asserts they are readable, so a
// row that stops conforming is caught in this file too rather than only in the whole-corpus stage.
import { Project } from "ts-morph";
import { gate as reach } from "../../../../tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/chat-viewer-plane-canon-reads-health.ts";
import { CHAT_MATRIX_FILE, CHAT_QUERIES_FILE } from "../../../../tooling/src/verify/lib/chat-plane-read.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/chat-viewer-plane-family";
const READ = "packages/server/src/domain/chat/verbs/read.ts";

const QUERIES_SRC =
  "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n";

type Files = Readonly<Record<string, string>>;

function projectFor(files: Files): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

function after(files: Files): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    root: ROOT,
    project: projectFor(files),
    knownPolicies: [reach, health],
    policies: [reach, health],
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

/** The live leak shape: `listMessages` is `member`, its factory calls the floorless bulk reader. */
function leakTree(readSource: string): Files {
  return {
    [CHAT_MATRIX_FILE]: 'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
    [CHAT_QUERIES_FILE]: QUERIES_SRC,
    [READ]: readSource,
  };
}

const LEAK_READ =
  'import { loadCanonHistory } from "../persistence/queries";\n' +
  'import type { ChatService } from "../contract/service";\n' +
  'function createListMessages(): ChatService["listMessages"] {\n' +
  "  return async () => await loadCanonHistory();\n" +
  "}\n" +
  "export const x = createListMessages;\n";

test("every declared row of both siblings conforms", () => {
  expect(verifyPolicyProofs([reach, health])).toEqual([]);
});

// ── §6.2 authority proof: the ordinary identity triple, and the dead-position alarm ────────────────────

test("the ordinary reach arm produces exactly one finding, one waiver consumes it, and zero alarms remain", () => {
  const bare = after(leakTree(LEAK_READ));
  expect(bare.toolErrors).toEqual([]);
  expect(bare.authority.effectiveFindings).toHaveLength(1);
  const [finding] = bare.authority.effectiveFindings;
  expect(finding).toMatchObject({ policyId: reach.id, file: READ, token: "loadCanonHistory" });

  const waived = after(
    leakTree(
      LEAK_READ.replace(
        "  return async () => await loadCanonHistory();",
        "  // @orb-waive chat-viewer-plane-canon-reads(loadCanonHistory): the fit preview returns NUMBERS, never canon bytes.\n  return async () => await loadCanonHistory();",
      ),
    ),
  );
  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming a position the policy does not report raises the dead-position alarm", () => {
  // ONCE PER FAMILY (§6.2): the green positive above proves a marker was consumed; only moving the
  // authored position proves the position is what CONTROLS that consumption.
  const dead = after(
    leakTree(
      LEAK_READ.replace(
        "  return async () => await loadCanonHistory();",
        "  // @orb-waive chat-viewer-plane-canon-reads(loadStreamReplay): a position this policy never reports.\n  return async () => await loadCanonHistory();",
      ),
    ),
  );
  expect(dead.authority.effectiveFindings).toHaveLength(1);
  expect(dead.authority.waivedFindings).toEqual([]);
  expect(dead.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["ordinary-waiver"]);
  expect(dead.authority.authorityAlarms[0]).toMatchObject({ policyId: reach.id });
  expect(dead.authority.authorityAlarms[0]?.message).toContain("names a dead position for chat-viewer-plane-canon-reads");
});

test("the hard health arm has no waiver door at all", () => {
  const uncovered: Files = {
    [CHAT_MATRIX_FILE]:
      "// @orb-waive chat-viewer-plane-canon-reads-health(CHAT_VERB_AUTHORITY): a hard policy cannot be licensed.\n" +
      'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
    [CHAT_QUERIES_FILE]: QUERIES_SRC,
  };
  const result = after(uncovered);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.filter((finding) => finding.policyId === health.id)).toHaveLength(1);
  expect(result.authority.waivedFindings).toEqual([]);
});

// ── §2.1 population port: both differences, and both controls ──────────────────────────────────────────

test("the population port admits the same chat sources both ways, with an inside and an outside control", () => {
  // INSIDE CONTROL: an admitted chat source carries the leak and is judged.
  // OUTSIDE CONTROL: the byte-identical leak under a sibling server domain is NOT judged, so equality
  // cannot pass because both sides admitted nothing.
  const outside = "packages/server/src/domain/automation/verbs/read.ts";
  const files: Files = { ...leakTree(LEAK_READ), [outside]: LEAK_READ };
  const result = after(files);
  expect(result.toolErrors).toEqual([]);
  const owner = result.policies.find((policy) => policy.id === reach.id);
  expect(owner?.population.effectiveSourcePaths).toEqual([CHAT_QUERIES_FILE, CHAT_MATRIX_FILE, READ].toSorted());
  expect(owner?.population.effectiveSourcePaths).not.toContain(outside);
  expect(result.authority.effectiveFindings.map((finding) => finding.file)).toEqual([READ]);

  // The legacy scanRoot regex and the final `under` glob answer identically over the same candidates.
  const legacyAdmits = (path: string): boolean => /(?:^|\/)packages\/server\/src\/domain\/chat\//u.test(`/${path}`);
  const finalAdmits = new Set(owner?.population.effectiveSourcePaths ?? []);
  const candidates = Object.keys(files);
  expect(candidates.filter(legacyAdmits).filter((path) => !finalAdmits.has(path))).toEqual([]);
  expect([...finalAdmits].filter((path) => !legacyAdmits(path))).toEqual([]);
});

// ── §6.4 conversion differential over the same bytes ───────────────────────────────────────────────────
