// Fire-and-forget work with an invisible failure runs as the native `orb/detached-work-traced` rule; these controls
// drive the configured rule through the real flat config, and pin the declared opener tuple to the tracing module.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import type { CallExpression } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import tseslint from "typescript-eslint";
import { ROOT_SPAN_OPENERS, TRACING_MODULE } from "../../../../tooling/src/verify/contract/detached-work.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The first case loads the whole flat config, which dwarfs every later one.
const CONFIG_LOAD_TIMEOUT_MS = scaledBudget(60_000);

const RULE = "orb/detached-work-traced";
const SERVER = "packages/server/src/domain/chat/verbs/probe.ts";
const INFERENCE = "packages/inference/src/backends/probe.ts";
const CLIENT = "packages/client/src/features/chat/probe.ts";

const eslints = new Map<string, ESLint>();

async function messages(root: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  let eslint = eslints.get(root);
  if (eslint === undefined) {
    eslint = new ESLint({ cwd: root });
    eslints.set(root, eslint);
  }
  const config = await eslint.calculateConfigForFile(filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config.rules?.[RULE] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

type Row = readonly [name: string, source: string, count: number, path?: string];

function rows(table: readonly Row[]): void {
  for (const [name, source, count, path] of table) {
    test(
      `${RULE} ${name}`,
      async ({ repoRoot }) => {
        const found = await messages(repoRoot, source, path ?? SERVER);
        expect(found).toHaveLength(count);
        expect(found.every(({ ruleId }) => ruleId === RULE)).toBe(true);
      },
      CONFIG_LOAD_TIMEOUT_MS,
    );
  }
}

const WAIVER = `// eslint-disable-next-line ${RULE} -- the stream is already closed, so nothing is left to trace. Ends if cancel becomes user-visible.\n`;

rows([
  // A1: statement-position work whose rejection is discarded and that opens no root.
  ["A1 the founding shape", "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n", 1],
  ["A1 without the void", "export function fire(ctx: C): void {\n  ctx.save().catch(() => {});\n}\n", 1],
  ["A1 then with a discarding second argument", "export function fire(ctx: C): void {\n  ctx.save().then(undefined, () => null);\n}\n", 1],
  ["A1 reaches the inference package", "export function dispose(model: M): void {\n  void model.dispose().catch(() => undefined);\n}\n", 1, INFERENCE],
  [
    "A1 every literal spelling of a promise link is the same read",
    [
      "export function fire(ctx: C): void {",
      "  const link = 'catch' as const;",
      "  let typedLink: 'catch' = 'catch';",
      "  void ctx.save()['catch'](() => undefined);",
      "  void ctx.save()?.['then'](undefined, () => undefined);",
      "  void ctx.save()[('catch')](() => undefined);",
      "  void ctx.save()[link](() => undefined);",
      "  void ctx.save()[typedLink](() => undefined);",
      "  void ctx.save()[(('ca' + 'tch') as 'catch')](() => undefined);",
      "  void ctx.save()['ca' + 'tch'](() => undefined);",
      "  void ctx.save()['th' + 'en'](undefined, () => undefined);",
      "}",
      "",
    ].join("\n"),
    8,
  ],
  [
    "A1 a bare marker comment is inert text",
    "export function tear(res: R): void {\n  // @swallowed-ok\n  void res.body.cancel().catch(() => undefined);\n}\n",
    1,
  ],
  [
    "A1 a directive covers its own next line only",
    `export function tear(a: R, b: R): void {\n  ${WAIVER}  void a.cancel().catch(() => undefined);\n  void b.cancel().catch(() => undefined);\n}\n`,
    1,
  ],
  // A2a: a catch inside an opener callback that does not rethrow seals the span ok.
  [
    "A2a a swallowing catch inside a supervised operation",
    "export function fire(deps: D): void {\n  superviseDetached(id, NAME, {}, async () => {\n    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n    }\n  });\n}\n",
    1,
  ],
  [
    "A2a the settled opener is an opener",
    "export async function fire(deps: D): Promise<void> {\n  await superviseSettled(id, NAME, {}, async () => {\n    try {\n      await deps.build();\n    } catch {}\n  });\n}\n",
    1,
  ],
  // A2b: a discarding rejection handler nested inside an opener callback blinds the span.
  [
    "A2b a discard moved inside the callback",
    "export function enqueue(w: W): void {\n  void withRequestSpan(id, NAME, {}, async () => {\n    await w.start(a).catch(() => undefined);\n  }).catch(() => undefined);\n}\n",
    1,
  ],
  [
    "a promise kept in a collection nothing reads is still invisible",
    "export function make(): void {\n  const kept = new Set<Promise<number>>();\n  const stop = (w: W): void => {\n    const stopped = w.terminate();\n    kept.add(stopped);\n    void stopped.catch(() => undefined);\n  };\n  void stop;\n}\n",
    1,
  ],
  [
    "a kept collection whose only read is a voided allSettled is still invisible",
    "export function make(): void {\n  const kept = new Set<Promise<number>>();\n  const stop = (w: W): void => {\n    const stopped = w.terminate();\n    kept.add(stopped);\n    void stopped.catch(() => undefined);\n  };\n  const dispose = (): void => {\n    void Promise.allSettled([...kept]);\n  };\n  void stop;\n  void dispose;\n}\n",
    1,
  ],
  [
    "a pushed array handed to a voided allSettled is still invisible",
    "export function make(): void {\n  const started: Promise<void>[] = [];\n  const start = (w: W): void => {\n    const work = w.run();\n    started.push(work);\n    void work.catch(() => undefined);\n  };\n  const settle = (): void => {\n    void Promise.allSettled(started);\n  };\n  void start;\n  void settle;\n}\n",
    1,
  ],
  [
    "a map joined by a bare-statement Promise.all over values is still invisible",
    "export function make(): void {\n  const jobs = new Map<string, Promise<void>>();\n  const start = (w: W, key: string): void => {\n    const job = w.run();\n    jobs.set(key, job);\n    void job.catch(() => undefined);\n  };\n  const settle = (): void => {\n    Promise.all(jobs.values());\n  };\n  void start;\n  void settle;\n}\n",
    1,
  ],
  [
    "a bound promise that is never kept is still invisible",
    "export function stop(w: W): void {\n  const stopped = w.terminate();\n  void stopped.catch(() => undefined);\n}\n",
    1,
  ],
]);

rows([
  [
    "a promise added to a collection that disposal spreads into allSettled is retained",
    "export function make(): void {\n  const terminations = new Set<Promise<number>>();\n  const terminate = (w: W): void => {\n    const stopped = w.terminate();\n    terminations.add(stopped);\n    void stopped.catch(() => undefined);\n  };\n  const dispose = async (): Promise<void> => {\n    await Promise.allSettled([...terminations]);\n  };\n  void terminate;\n  void dispose;\n}\n",
    0,
  ],
  [
    "a promise pushed to an array that is iterated is retained",
    "export function make(): void {\n  const started: Promise<void>[] = [];\n  const start = (w: W): void => {\n    const work = w.run();\n    started.push(work);\n    work.catch(() => {});\n  };\n  const settle = async (): Promise<void> => {\n    for (const item of started) {\n      await item.catch(() => undefined);\n    }\n  };\n  void start;\n  void settle;\n}\n",
    0,
  ],
  [
    "a promise stored in a map that is awaited through values is retained",
    "export function make(): void {\n  const jobs = new Map<string, Promise<void>>();\n  const start = (w: W, key: string): void => {\n    const job = w.run();\n    jobs.set(key, job);\n    void job.then(() => undefined, () => undefined);\n  };\n  const settle = async (): Promise<void> => {\n    await Promise.all(jobs.values());\n  };\n  void start;\n  void settle;\n}\n",
    0,
  ],
  ["supervised detach passes", "export function fire(ctx: C): void {\n  superviseDetached(id, NAME, {}, () => ctx.rpg.onTurnAborted(c, t, r));\n}\n", 0],
  [
    "an inference caller passes through the injected supervisor",
    "export function dispose(superviseDetached: D, model: M): void {\n  superviseDetached(id, NAME, {}, () => model.dispose());\n}\n",
    0,
    INFERENCE,
  ],
  [
    "a warn then rethrow passes",
    "export function fire(deps: D): void {\n  superviseDetached(id, NAME, {}, async () => {\n    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n      throw err;\n    }\n  });\n}\n",
    0,
  ],
  [
    "the outer absorber on the opener call is the correct shape",
    "export function fire(deps: D): void {\n  void withRequestSpan(id, NAME, {}, async () => {\n    await deps.build();\n  }).catch(() => undefined);\n}\n",
    0,
  ],
  [
    "a handler that logs is already visible",
    "export function boot(s: S): void {\n  void s.drain().catch((err: unknown) => log.error({ err }, 'drain failed'));\n}\n",
    0,
  ],
  ["a bare void with no handler is loud", "export function boot(deps: D): void {\n  void reapOnce(deps);\n}\n", 0],
  [
    "an absorber nested inside an argument is not statement position",
    "export function on(refs: R[]): void {\n  void (async (): Promise<void> => {\n    await Promise.all(refs.map((h) => invoke(h).catch(() => undefined)));\n  })();\n}\n",
    0,
  ],
  [
    "an absorbed promise assigned to a variable is a held value",
    "export function serialize(): void {\n  const tail = next.catch(() => undefined);\n  chains.set(id, tail);\n}\n",
    0,
  ],
  [
    "a swallowing catch outside any span is ordinary error handling",
    "export function run(deps: D): void {\n  try {\n    deps.build();\n  } catch (err) {\n    log.warn({ err });\n  }\n}\n",
    0,
  ],
  ["a dynamic promise link is a declared limit", "export function fire(ctx: C, link: string): void {\n  void ctx.save()[link](() => undefined);\n}\n", 0],
  [
    "the client has no request-span ring to be invisible on",
    "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
    0,
    CLIENT,
  ],
  [
    "a directive with its reason waives the one finding",
    `export function tear(res: R): void {\n  ${WAIVER}  void res.body.cancel().catch(() => undefined);\n}\n`,
    0,
  ],
  [
    "a directive above the inner try waives the inner catch and leaves the rethrowing outer one alone",
    [
      "export function fire(deps: D): void {",
      "  void withRequestSpan(id, NAME, {}, async () => {",
      "    try {",
      "      await deps.build();",
      "    } catch (err) {",
      `      ${WAIVER.trimEnd()}`,
      "      try {",
      "        await deps.emit(w);",
      "      } catch (emitErr) {",
      "        void emitErr;",
      "      }",
      "      throw err;",
      "    }",
      "  }).catch(() => undefined);",
      "}",
      "",
    ].join("\n"),
    0,
  ],
]);

test(
  `${RULE} a directive that waives nothing is itself reported`,
  async ({ repoRoot }) => {
    expect(await messages(repoRoot, `${WAIVER}export function ok(): void {}\n`, SERVER)).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  },
  CONFIG_LOAD_TIMEOUT_MS,
);

// ── the declared opener tuple against the tracing module ─────────────────────────────────────────────────
// An exported tracing function that opens `startActiveSpan(..., { root: true })`, directly or through another
// opener, is an opener. The derivation reads the real module text, so adding an opener there without declaring
// it (or leaving a declared name behind) reds here.
function derivedOpeners(source: string): readonly string[] {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile("tracing.ts", source);
  const exported = file.getFunctions().filter((fn) => fn.isExported() && fn.getName() !== undefined);
  const opened = new Set<string>();
  const callsOf = (fn: (typeof exported)[number]): CallExpression[] => fn.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const fn of exported) {
    const detaches = callsOf(fn).some(
      (call) =>
        call.getExpression().getText().endsWith("startActiveSpan") &&
        call.getArguments().some((argument) => {
          const options = argument.asKind(SyntaxKind.ObjectLiteralExpression);
          return options?.getProperty("root")?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.getText() === "true";
        }),
    );
    if (detaches) {
      opened.add(fn.getNameOrThrow());
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const fn of exported) {
      const name = fn.getNameOrThrow();
      if (!opened.has(name) && callsOf(fn).some((call) => opened.has(call.getExpression().getText()))) {
        opened.add(name);
        grew = true;
      }
    }
  }
  return [...opened].toSorted();
}

const declared = [...ROOT_SPAN_OPENERS].toSorted();
const tracingSource = (root: string): string => readFileSync(join(root, TRACING_MODULE), "utf8");

test("the declared openers are exactly the tracing module's detached-root exports", ({ repoRoot }) => {
  expect(derivedOpeners(tracingSource(repoRoot))).toEqual(declared);
});

test("an undeclared opener planted in the tracing module is caught", ({ repoRoot }) => {
  const planted =
    `${tracingSource(repoRoot)}\nexport function plantedRoot(): void {\n  tracer.startActiveSpan("x", { root: true }, () => undefined);\n}\n` +
    "export function plantedWrapper(): void {\n  superviseDetached(id, NAME, {}, () => undefined);\n}\n";
  expect(derivedOpeners(planted)).toEqual([...declared, "plantedRoot", "plantedWrapper"].toSorted());
});

test("a declared opener that stops detaching is caught", ({ repoRoot }) => {
  const parented = tracingSource(repoRoot).replace("root: true }, async (root)", "root: false }, async (root)");
  expect(parented).not.toBe(tracingSource(repoRoot));
  expect(derivedOpeners(parented)).toEqual([]);
});
