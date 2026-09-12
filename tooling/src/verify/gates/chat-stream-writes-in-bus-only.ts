// Policy: chat-stream-writes-in-bus-only (UI-Gates-and-Lessons.md §11.1) — `chatStream` is the stream
// store's WRITE api. Turn slots are driven by bus events through `applyChatBusEvent` alone; components read
// with `useTurnSlot`/`useTurnPhase`. A module that takes the write handle has a second writer into the turn
// surface, which is the drift §11.1 exists to stop.
//
// AUTHORITY IS reviewed-grant. The bus's own writer is a recurring repository PERMISSION — `data/bus/` IS
// the applier — so it is SCANNED, reds like any other module, and is licensed by one exact
// `(subject, operation)` row in `lib/reviewed-grants.ts` with rename/deletion liveness. The legacy predicate
// SUBTRACTED `data/bus/**` and `main.tsx` from the corpus instead, which the final law forbids: a subtracted
// home carries its exemption silently through a move. `main.tsx` takes no write handle on this tree, so it
// gets no row at all — an unexercised permission is not representable as a grant (a row consumed zero times
// is STALE), and the day it needs one it will red and be reviewed.
//
// The legacy `chat-stream-writes-in-bus-only` descriptor (6a79781359a51916bffaac9edbc42c883b8aee5a)
// subtracted `data/bus/**`/`main.tsx` from the scanned population before this conversion moved that
// exemption onto the reviewed-grant table.
//
// IDENTITY, NOT SPELLING. The legacy check was `moduleSpecifier === "#state"` plus a specifier named
// `chatStream`, so the same handle reached through any other resolved specifier — the package-internal
// alias, a relative path, a re-export barrel — was invisible, and a same-named export of another module
// red. The subject is the symbol declared in `state/chat-stream.ts`, resolved through the shared
// module-origin reader; that home is located in the population and receipted, so its rename REFUSES.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ProjectHomeDeclaration } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const HANDLE = "chatStream";
const OPERATION = "chat-stream-write-handle";
const STREAM_HOME: ProjectHomeDeclaration = { path: "packages/client/src/state/chat-stream.ts", names: [HANDLE] };

const MESSAGE =
  "the `chatStream` WRITE api is taken outside data/bus/ — turn slots are driven by bus events through " +
  "`applyChatBusEvent` only, and components read via `useTurnSlot`/`useTurnPhase`. A second writer into the " +
  "turn surface is the drift UI-Gates-and-Lessons.md §11.1 exists to stop.";
const UNREADABLE =
  "this module names `chatStream` through a binding the shared readers cannot place, so whether it is the stream store's write api CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "raise a bus event and let data/bus/ apply it (or read with useTurnSlot/useTurnPhase); the bus applier itself is licensed by an exact reviewed grant.";

/** The two doors the write handle enters a module through: a named import specifier (whose `getName()` IS
 *  the export name, alias or not) and a namespace/computed member read of the same export. A bare identifier
 *  visitor over the nine authored roots would resolve nothing new — a local binding of the handle can only
 *  come from one of these two doors in the same file — and would cost a whole-corpus identifier walk. */
function candidateNode(node: MorphNode): MorphNode | null {
  let candidate: MorphNode | null = null;
  if (Node.isImportSpecifier(node) && node.getName() === HANDLE) {
    candidate = node;
  }
  if (Node.isPropertyAccessExpression(node) && node.getName() === HANDLE) {
    candidate = node;
  }
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    const named = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    candidate = named && argument.getLiteralText() === HANDLE ? node : null;
  }
  return candidate;
}

const HOME_PROOF = {
  "packages/client/src/state/chat-stream.ts": "export const chatStream = {\n  push(): void {},\n};\n",
};

export const gate = defineGate({
  id: "chat-stream-writes-in-bus-only",
  family: "chat-stream-writes-in-bus-only",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate admitted every authored file except the two sanctioned homes and test/spec files.
  // The homes become grants; the test/spec exclusion stays POPULATION, because a spec exercising the write
  // api is a different subject, not a licensed exception.
  population: { in: ["@authored"], notNamed: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: { readonly node: MorphNode; readonly subject: string }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile): void => {
            const candidate = candidateNode(node);
            if (candidate !== null) {
              candidates.push({ node: candidate, subject: ctx.relativePath(sourceFile) });
            }
          },
        },
      ],
      evaluate: (): void => {
        const home = locateProjectHome(ctx.files, ctx.relativePath, STREAM_HOME);
        // ZERO members is a REFUSAL: the write api this policy fences was renamed or moved, so no verdict
        // about "who holds it" can be honest.
        ctx.receipt({ kind: "population", source: STREAM_HOME.path, members: home.members, unresolved: home.unresolved });
        if (home.sourceFile === undefined) {
          return;
        }
        const findings: ReviewedGrantCandidate[] = [];
        for (const { node, subject } of candidates) {
          const verdict = classifyProjectHomeOrigin(node, home);
          if (verdict !== "other") {
            findings.push({
              node,
              subject,
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              token: HANDLE,
              offset: Math.max(node.getText().lastIndexOf(HANDLE), 0),
            });
          }
        }
        reportReviewedGrantCandidates(ctx.report, findings, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/features/chat/components/turn.tsx":
          'import { chatStream } from "../../../state/chat-stream.ts";\nexport const push = (): void => chatStream.push();\n',
      },
      expect: { count: 1, token: HANDLE },
      why: "the founding shape: a component takes the write handle instead of raising a bus event",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/data/bus/chat-bus-writes.ts":
          'import { chatStream } from "../../state/chat-stream.ts";\nexport const apply = (): void => chatStream.push();\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the bus applier reds like any other module and is licensed by an exact grant row, so a SECOND bus file taking the handle is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/state/index.ts": 'export { chatStream } from "./chat-stream.ts";\n',
        "packages/client/src/features/chat/components/turn.tsx":
          'import { chatStream as stream } from "../../../state/index.ts";\nexport const push = (): void => stream.push();\n',
      },
      expect: { count: 1 },
      why: "THE RE-EXPORT + ALIAS RED: the handle reached through the state barrel under another local name is the same symbol. The legacy check required the literal `#state` specifier AND the literal name, so both halves of this spelling walked past it",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/features/chat/components/turn.tsx":
          'import * as state from "../../../state/chat-stream.ts";\nexport const push = (): void => state.chatStream.push();\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE RED: no import specifier of that name exists at all, so the legacy door check was offered nothing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/state/index.ts": "export declare const useTurnSlot: () => unknown;\n",
        "packages/client/src/features/chat/components/turn.tsx":
          'import { useTurnSlot } from "../../../state/index.ts";\nexport const read = (): unknown => useTurnSlot();\n',
      },
      why: "the sanctioned shape: a component READS the turn slot and never touches the write api",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/features/chat/lib/local.ts": "const chatStream = {\n  push(): void {},\n};\nexport const push = (): void => chatStream.push();\n",
      },
      why: "A LOCAL BINDING of the same name proves a DIFFERENT identity — the name is not the handle, the declaration is",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/features/chat/lib/other.ts":
          'import { chatStream } from "./other-stream.ts";\nexport const push = (): void => chatStream.push();\n',
        "packages/client/src/features/chat/lib/other-stream.ts": "export const chatStream = {\n  push(): void {},\n};\n",
      },
      why: "SAME NAME, DIFFERENT MODULE: another module's `chatStream` is not the turn surface's write api, and only the canonical declaring file separates them",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "tests/client/state/chat-stream.test.ts":
          'import { chatStream } from "../../../packages/client/src/state/chat-stream.ts";\nexport const push = (): void => chatStream.push();\n',
      },
      why: "THE POPULATION, not a permission: a `.test.ts` exercising the write api is a different subject and is excluded by `notNamed` — the legacy predicate said the same thing with a regex",
    },
  ],
});
