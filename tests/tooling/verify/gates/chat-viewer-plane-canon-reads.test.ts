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
