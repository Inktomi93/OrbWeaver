// chat-viewer-plane-canon-reads (#947) — the AUTHORITY MATRIX resolver's two-sided contract. The matrix is
// the key every verdict in this gate hangs off, and `{...BASE_AUTHORITY, listMessages:"member"}` used to
// resolve to ONE verb while staying non-empty: the blindness arm was satisfied, the gate reported a live
// matrix, and every spread-in viewer-plane verb went unjudged. Conformance pins the RESOLUTION (its rows
// cannot throw); this file pins the REFUSALS, which are the half that keeps a smaller matrix from ever
// reading as a matrix.
import { gate } from "../../../../tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const MATRIX = "packages/server/src/domain/chat/substrate/auth/matrix.ts";

function toolErrors(files: Readonly<Record<string, string>>): readonly string[] {
  const { project, root } = ctxFor({ ...files });
  const pass = runPass([gate], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return pass.toolErrors.map((error) => error.message);
}

test("a matrix spread of a CALL refuses — an unreadable matrix must never read as a smaller one", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { ...baseAuthority(), listMessages: "member" } as const;\n' })[0]).toContain(
    "unsupported CHAT_VERB_AUTHORITY expression",
  );
});

test("a matrix spread of an identifier nothing binds refuses", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { ...MISSING_BASE, listMessages: "member" } as const;\n' })[0]).toContain(
    "resolves to no local declaration or named import",
  );
});

test("a matrix composition cycle refuses instead of recursing", () => {
  expect(
    toolErrors({
      [MATRIX]: "export const OTHER = { ...CHAT_VERB_AUTHORITY };\nexport const CHAT_VERB_AUTHORITY = { ...OTHER } as const;\n",
    })[0],
  ).toContain("composition cycle");
});

test("a spread that contributes ZERO verbs refuses — an empty contribution is the silent-shrink shape", () => {
  expect(
    toolErrors({
      "packages/server/src/domain/chat/substrate/auth/base-matrix.ts": "export const BASE_AUTHORITY = {} as const;\n",
      [MATRIX]: 'import { BASE_AUTHORITY } from "./base-matrix";\nexport const CHAT_VERB_AUTHORITY = { ...BASE_AUTHORITY, listMessages: "member" } as const;\n',
    })[0],
  ).toContain("resolved to zero verbs");
});

// ── #1091: EVERY MEMBER KIND IS ANSWERED, NONE IS SKIPPED ──────────────────────────────────────────────
// The fold used to read exactly one shape — a `PropertyAssignment` whose value unwraps to a StringLiteral —
// and let every other member kind fall out of the loop with no throw and no count. Measured on the real
// tree (#1091): `getChat: MEMBER_AUTHORITY_PROBE` beside `const MEMBER_AUTHORITY_PROBE = "member" as const`
// took `CHAT_VERB_AUTHORITY` from 93 verbs to 92 with the gate still green — and a verb absent from the
// matrix is a verb `isViewerPlane` never classifies, so its factory is judged for nothing. Conformance pins
// the RESOLVED shapes (its rows cannot throw); these pin the reads AND the refusals.

function findings(files: Readonly<Record<string, string>>): readonly string[] {
  const { project, root } = ctxFor({ ...files });
  const pass = runPass([gate], { root, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(pass.toolErrors).toEqual([]);
  return (pass.gates[0]?.findings ?? []).map((finding) => finding.token ?? finding.message ?? "");
}

const QUERIES = "packages/server/src/domain/chat/persistence/queries.ts";
const READ = "packages/server/src/domain/chat/verbs/read.ts";
const QUERIES_SRC =
  "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n";
const READ_SRC =
  'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nexport const x = createListMessages;\n';

/** A tree whose `listMessages` matrix row is written in `spelling`, beside a `host` row that keeps the
 *  matrix non-empty — so a dropped member can never hide behind the blindness arm. */
function matrixTree(spelling: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { ...extra, [MATRIX]: spelling, [QUERIES]: QUERIES_SRC, [READ]: READ_SRC };
}

test("a matrix row whose VALUE is a local const still judges its verb", () => {
  const spelling =
    'const MEMBER_AUTHORITY = "member" as const;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MEMBER_AUTHORITY } as const;\n';
  expect(findings(matrixTree(spelling))).toEqual(["listMessages:loadCanonHistory"]);
});

test("a matrix row whose VALUE is an IMPORTED const still judges its verb", () => {
  const spelling = 'import { MEMBER } from "./authorities";\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MEMBER } as const;\n';
  const authorities = { "packages/server/src/domain/chat/substrate/auth/authorities.ts": 'export const MEMBER = "member" as const;\n' };
  expect(findings(matrixTree(spelling, authorities))).toEqual(["listMessages:loadCanonHistory"]);
});

test("a SHORTHAND matrix row still judges its verb", () => {
  const spelling = 'const listMessages = "member" as const;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages } as const;\n';
  expect(findings(matrixTree(spelling))).toEqual(["listMessages:loadCanonHistory"]);
});

test("a COMPUTED string-literal key names its verb, not the bracket text", () => {
  const spelling = 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", ["listMessages"]: "member" } as const;\n';
  expect(findings(matrixTree(spelling))).toEqual(["listMessages:loadCanonHistory"]);
});

test("a matrix VALUE built by a CALL refuses — an unreadable authority must never drop its verb", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: authorityFor() } as const;\n' })[0]).toContain(
    "unsupported CHAT_VERB_AUTHORITY value",
  );
});

test("a matrix VALUE identifier nothing binds refuses", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MISSING } as const;\n' })[0]).toContain(
    "resolves to no local declaration or named import",
  );
});

test("a matrix VALUE binding cycle refuses instead of recursing", () => {
  const spelling = 'const A = B;\nconst B = A;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: A } as const;\n';
  expect(toolErrors({ [MATRIX]: spelling })[0]).toContain("value binding cycle");
});

test("a SHORTHAND row nothing binds refuses", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages } as const;\n' })[0]).toContain(
    "resolves to no local declaration or named import",
  );
});

test("a COMPUTED key that is not a string literal refuses — a key this reader cannot name matches no verb", () => {
  expect(toolErrors({ [MATRIX]: 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", [verbKey]: "member" } as const;\n' })[0]).toContain(
    "computed CHAT_VERB_AUTHORITY key",
  );
});

test("a METHOD member refuses — a member kind the fold cannot answer must never be dropped", () => {
  const spelling = 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages() { return "member"; } } as const;\n';
  expect(toolErrors({ [MATRIX]: spelling })[0]).toContain("unsupported CHAT_VERB_AUTHORITY member kind MethodDeclaration");
});

test("a GETTER member refuses by its own kind", () => {
  const spelling = 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", get listMessages() { return "member"; } } as const;\n';
  expect(toolErrors({ [MATRIX]: spelling })[0]).toContain("unsupported CHAT_VERB_AUTHORITY member kind GetAccessor");
});
