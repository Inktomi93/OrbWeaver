// Gate: test-presence (core/Spine-Testing.md §5) — required tests on the surfaces where an untested
// change silently breaks behavior: every domain verbs/*.ts → .test/.int.test; every domain
// persistence/*.ts → .int.test; every domain contract/*.ts w/ zod → .contract.test; every infra/ or
// foundation/ file with runtime logic (exported function/class/arrow-const) → .test/.int.test (pure-type
// files + index.ts barrels exempt). Tests live at the mirror path (tests/server/<rest>).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { codeTextForScan } from "../comment-spans.ts";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const DOMAIN_DIR = "/packages/server/src/domain/";
const SERVER_SRC = "/packages/server/src/";
const CONTRACTS_SRC = "/packages/contracts/src/";
const EXT_RE = /\.tsx?$/u;

const MSG = {
  verb: "verb has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  persistence: "persistence file has no .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  contract: "contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  sharedContract: "shared contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  infra:
    "infra/foundation file with runtime logic has no test — security belts/adapters/dispatchers get a .test.ts or .int.test.ts at their mirror (core/Spine-Testing.md §5). Pure-type + index files are exempt.",
  runner:
    "workloads runner with real logic has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5). A D58 no-op stub (reports + returns `{ deferred: true }`, no `ctx.env` call) is exempt until it's filled in.",
} as const;

function serverSrcRel(path: string): string | undefined {
  const parts = path.split(SERVER_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function contractsSrcRel(path: string): string | undefined {
  const parts = path.split(CONTRACTS_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function hasTest(root: string, pkg: string, rel: string, kinds: readonly string[]): boolean {
  const base = rel.replace(EXT_RE, "");
  return kinds.some((kind) => existsSync(join(root, "tests", pkg, `${base}${kind}`)));
}

// Read from CODE, never file text (issue #117/#132): a contract file whose comment SPELLS `z.object(` while
// declaring none demands a `.contract.test.ts` that has nothing to assert, and a runner whose comment quotes
// `deferred: true` is silently EXEMPTED from needing a test at all — comment-blindness in both directions.
const SCHEMA_NEEDLES: readonly string[] = ["z.object(", "z.enum(", "z.discriminatedUnion("];

function hasSchema(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => SCHEMA_NEEDLES.some((needle) => raw.includes(needle)));
  return SCHEMA_NEEDLES.some((needle) => text.includes(needle));
}

// A workloads runner is a D58 no-op STUB (inert — the kind exists so `RUNNERS`/exhaustive-dispatch stay
// green, but the real pass lands in a later wave) when its body only reports + returns the `DeferredResult`
// and never touches its injected env. There is no behavior to regress, so it's exempt UNTIL filled in:
// adding a real `ctx.env.*` call drops the exemption and the gate then demands a test. Detected on SOURCE
// SHAPE, not a static list, so the 16 current stubs need no per-file allowlist and can't go stale.
const DEFERRED_RESULT = "deferred: true";
const ENV_CALL = "ctx.env";

function isDeferredStubRunner(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => raw.includes(DEFERRED_RESULT));
  return text.includes(DEFERRED_RESULT) && !text.includes(ENV_CALL);
}

// A file carries runtime LOGIC (vs only types/data) if it exports a function, a class, or a const bound
// to an arrow/function expression. Pure type/interface files and pure data tuples need no behavioral test.
function hasCallableExport(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported())) {
    return true;
  }
  if (sf.getClasses().some((c) => c.isExported())) {
    return true;
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        return true;
      }
    }
  }
  return false;
}

function missing(pkg: string, rel: string, message: string): Violation {
  return { file: `packages/${pkg}/src/${rel}`, line: 0, message };
}

function pushDomain(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (rel.includes("/verbs/") && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.verb));
  }
  if (rel.includes("/persistence/") && !hasTest(root, "server", rel, [".int.test.ts"])) {
    out.push(missing("server", rel, MSG.persistence));
  }
  if (rel.includes("/contract/") && hasSchema(sf) && !hasTest(root, "server", rel, [".contract.test.ts"])) {
    out.push(missing("server", rel, MSG.contract));
  }
  if (rel.includes("/workloads/runners/") && !isDeferredStubRunner(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.runner));
  }
}

function pushInfra(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  const inTier = rel.startsWith("infra/") || rel.startsWith("foundation/");
  if (inTier && hasCallableExport(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.infra));
  }
}

function pushContracts(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (hasSchema(sf) && !hasTest(root, "contracts", rel, [".contract.test.ts"])) {
    out.push(missing("contracts", rel, MSG.sharedContract));
  }
}

/** The fs+AST scan shared by the legacy Check and the single-pass `run` descriptor: each server/contracts
 *  source file's presence-gated surface must have its mirror test (existsSync). */
function scanTestPresence(root: string, project: Project): Violation[] {
  const violations: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    const isIndex = sf.getBaseName() === "index.ts";
    const serverRel = serverSrcRel(sf.getFilePath());
    if (serverRel !== undefined) {
      // Server barrels (domain/infra `index.ts`) are pure re-exports — exempt. A contracts `index.ts` is
      // NOT a barrel (the domain's schemas co-locate there), so it is checked below.
      if (isIndex) {
        continue;
      }
      if (sf.getFilePath().includes(DOMAIN_DIR)) {
        pushDomain(root, serverRel, sf, violations);
      } else {
        pushInfra(root, serverRel, sf, violations);
      }
      continue;
    }
    // Contracts arm: a schema-bearing file is presence-gated whether or not it is named `index.ts` — the
    // contracts convention co-locates the domain's zod schemas in `index.ts`, so a blanket barrel-skip
    // silently exempted whole domains. A pure-type/re-export `index.ts` carries no schema → still exempt.
    const contractsRel = contractsSrcRel(sf.getFilePath());
    if (contractsRel !== undefined) {
      pushContracts(root, contractsRel, sf, violations);
    }
  }
  return violations;
}

// test-presence reconciles server/contracts source (AST — schema/callable detection) against its
// mirror tests (existsSync of tests/<mirror>).
export const gate: GateDescriptor = {
  name: "test-presence",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a presence-gated source file has no mirror test — a domain verb / persistence / contract-schema / infra-runtime-logic file must carry its test at tests/<mirror> (core/Spine-Testing.md §5).",
  fix: "add the required test at the mirror path (tests/server/<rest> or tests/contracts/<rest>) — a .test/.int.test/.contract.test per the surface.",
  run: (ctx) => {
    for (const v of scanTestPresence(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n",
      },
      expect: { messageIncludes: "verb has no test" },
      why: "a domain verb file with no mirror .test/.int.test — an untested behavioral surface (§5)",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/chat-store.ts": "export const createChatStore = 1;\n",
      },
      expect: { messageIncludes: "persistence file has no .int.test" },
      why: "a domain persistence file with no mirror .int.test — the persistence arm (distinct message)",
    },
    {
      files: {
        "packages/server/src/domain/chat/contract/schema.ts": "export const S = z.object({});\n",
      },
      expect: { messageIncludes: "contract schema has no .contract.test" },
      why: "a domain contract file WITH a zod schema and no mirror .contract.test — the contract arm",
    },
    {
      files: {
        "packages/server/src/infra/providers/backends/agent-sdk/env-firewall.ts": "export function firewall(): void {}\n",
      },
      expect: { messageIncludes: "infra/foundation file with runtime logic has no test" },
      why: "an infra/ file with a callable export (runtime logic) and no mirror test — the infra arm (PD-blindspot)",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/recall.ts": "export const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
      },
      expect: { messageIncludes: "workloads runner with real logic has no test" },
      why: "a workloads runner that touches ctx.env (real logic, NOT a D58 stub) with no mirror test — the runner arm",
    },
    {
      files: {
        "packages/contracts/src/chat/index.ts": "export const S = z.object({});\n",
      },
      expect: { messageIncludes: "shared contract schema has no .contract.test" },
      why: "a shared @orb/contracts schema-bearing file (even index.ts) with no mirror .contract.test — the contracts arm",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/regrown.ts":
          "// Not a D58 stub any more — it used to return { deferred: true } and now does the real pass.\nexport const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
      },
      expect: { messageIncludes: "workloads runner with real logic has no test" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction — the dangerous one. A runner whose COMMENT quotes `deferred: true` reads as an exempt D58 stub to a file-text scan and silently drops its test requirement; the code says otherwise, so it must still RED",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n",
        "tests/server/domain/chat/verbs/start-chat.test.ts": "export const t = 1;\n",
      },
      why: "the verb file has its mirror .test.ts — presence satisfied, passes",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/stub.ts": "export const run = () => ({ deferred: true });\n",
      },
      why: "a D58 no-op stub runner (deferred: true, never touches ctx.env) — exempt until filled in, passes",
    },
    {
      files: {
        "packages/server/src/domain/chat/contract/prose.ts":
          '// The wire shape for this lives in packages/contracts — z.object({ id }) is declared there, not here.\nexport const LABEL = "x";\n',
      },
      why: "COMMENT POSTURE (issue #117/#132), false-POSITIVE direction: a contract-dir file whose COMMENT spells `z.object(` declares no schema, so demanding a .contract.test.ts would demand a test with nothing to assert",
    },
  ],
};
