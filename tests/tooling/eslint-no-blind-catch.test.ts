// A catch clause or a promise rejection handler that never reads its error and answers a constant or nothing runs as the
// native `orb/no-blind-catch` rule; these controls drive the configured rule through the real flat config, so a positive
// goes red when the rule is off.

import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";
import { scaledBudget } from "./_load-budget.ts";

// The first case loads the whole flat config, which dwarfs every later one.
const CONFIG_LOAD_TIMEOUT_MS = scaledBudget(60_000);

const RULE = "orb/no-blind-catch";
const SERVER = "packages/server/src/domain/chat/verbs/probe.ts";
const INFERENCE = "packages/inference/src/backends/probe.ts";
const DB = "packages/db/src/probe.ts";
const CLIENT = "packages/client/src/features/app-shell/probe.tsx";
const KIT = "packages/kit/src/probe.ts";
const CONTRACTS = "packages/contracts/src/probe.ts";
const UI = "packages/ui/src/primitives/probe.tsx";
// Spliced into a probe source so the linted text holds a template expression without one in this file.
const INTERPOLATION_SIGN = "$";

const eslints = new Map<string, ESLint>();

async function messages(root: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  let eslint = eslints.get(root);
  if (eslint === undefined) {
    eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root });
    eslints.set(root, eslint);
  }
  const config = await resolvedConfig(eslint, filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

type Row = readonly [name: string, source: string, count: number, path?: string];

function rows(table: readonly Row[]): void {
  for (const [name, source, count, path] of table) {
    test(
      `${RULE} ${name}`,
      async ({ repoRoot }) => {
        const found = await messages(repoRoot, source, path ?? SERVER);
        expect(found.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: count }, () => RULE));
      },
      CONFIG_LOAD_TIMEOUT_MS,
    );
  }
}

const tryLoad = (catchClause: string): string =>
  `export async function load(db: D): Promise<Row | null> {\n  try {\n    return await db.read();\n  } ${catchClause}\n}\n`;

rows([
  // Positive controls: the error is never examined and the catch answers null or nothing.
  ["a binding-less catch that returns null", tryLoad("catch {\n    return null;\n  }"), 1],
  ["an ignored binding that returns null", tryLoad("catch (error) {\n    return null;\n  }"), 1],
  ["a bare return answers nothing", tryLoad("catch {\n    return;\n  }"), 1],
  ["return undefined answers nothing", tryLoad("catch {\n    return undefined;\n  }"), 1],
  ["an empty body falls through", "export async function load(db: D): Promise<void> {\n  try {\n    await db.read();\n  } catch {}\n}\n", 1],
  [
    "a body that assigns a fallback falls through",
    "export async function load(db: D): Promise<Row | null> {\n  let row: Row | null;\n  try {\n    row = await db.read();\n  } catch {\n    row = null;\n  }\n  return row;\n}\n",
    1,
  ],
  ["void on the error is not a read", tryLoad("catch (error) {\n    void error;\n    return null;\n  }"), 1],
  ["a bare expression statement is not a read", tryLoad("catch (error) {\n    error;\n    return null;\n  }"), 1],
  ["a rename nothing reads is not a read", tryLoad("catch (error) {\n    const cause = error;\n    return null;\n  }"), 1],
  ["a rename discarded with void is not a read", tryLoad("catch (error) {\n    const cause = error;\n    void cause;\n    return null;\n  }"), 1],
  [
    "continue answers nothing",
    "export async function each(db: D): Promise<void> {\n  for (const id of ids) {\n    try {\n      await db.read(id);\n    } catch {\n      continue;\n    }\n  }\n}\n",
    1,
  ],
  ["an if with no else falls through", tryLoad("catch {\n    if (flag) {\n      throw new Error('x');\n    }\n  }"), 1],
  ["the rule reaches the inference package", tryLoad("catch {\n    return null;\n  }"), 1, INFERENCE],
  ["the rule reaches the db package", tryLoad("catch {\n    return null;\n  }"), 1, DB],
  ["an empty destructure binds nothing to read", tryLoad("catch ({}) {\n    return null;\n  }"), 1],
  ["a destructured field nothing reads is not a read", tryLoad("catch ({ message: _m }) {\n    return null;\n  }"), 1],
  ["Promise.resolve(null) answers nothing", tryLoad("catch {\n    return Promise.resolve(null);\n  }"), 1],
  ["an awaited empty resolve answers nothing", tryLoad("catch {\n    return await Promise.resolve();\n  }"), 1],
  [
    "a nested break leaves the switch with no answer",
    tryLoad("catch {\n    switch (mode) {\n      case 1:\n        if (flag) break;\n        return first;\n      default:\n        return second;\n    }\n  }"),
    1,
  ],
  [
    "a nested continue leaves the catch with no answer",
    "export async function each(db: D): Promise<Row | null> {\n  for (const id of ids) {\n    try {\n      return await db.read(id);\n    } catch {\n      if (flag) continue;\n      return fallback;\n    }\n  }\n  return first;\n}\n",
    1,
  ],
  // A constant answer hides a fault as well as null does, however the constant is spelled.
  ["false is a constant answer", tryLoad("catch {\n    return false;\n  }"), 1],
  ["true is a constant answer", tryLoad("catch (error) {\n    return true;\n  }"), 1],
  ["a number is a constant answer", tryLoad("catch {\n    return 0;\n  }"), 1],
  ["a negative number is a constant answer", tryLoad("catch {\n    return -1;\n  }"), 1],
  ["a string is a constant answer", tryLoad("catch {\n    return 'unreachable';\n  }"), 1],
  ["a template with no expression is a constant answer", tryLoad("catch {\n    return `no encoder bound`;\n  }"), 1],
  ["an empty list is a constant answer", tryLoad("catch {\n    return [];\n  }"), 1],
  ["a list of literals is a constant answer", tryLoad("catch {\n    return ['none', 0, null];\n  }"), 1],
  ["an object of literals is a constant answer", tryLoad("catch {\n    return { ok: false, reason: 'unreachable', items: [] };\n  }"), 1],
  ["an empty object is a constant answer", tryLoad("catch {\n    return {};\n  }"), 1],
  ["as const keeps a constant constant", tryLoad("catch {\n    return { ok: false } as const;\n  }"), 1],
  ["satisfies keeps a constant constant", tryLoad("catch {\n    return [] satisfies readonly Row[];\n  }"), 1],
  ["Promise.resolve of a literal is a constant answer", tryLoad("catch {\n    return Promise.resolve(false);\n  }"), 1],
  ["an awaited resolve of a list is a constant answer", tryLoad("catch {\n    return await Promise.resolve([]);\n  }"), 1],
  [
    "a const that names a literal is a constant answer",
    "const UNREACHABLE = 'unreachable';\nexport async function probe(db: D): Promise<string> {\n  try {\n    return await db.read();\n  } catch {\n    return UNREACHABLE;\n  }\n}\n",
    1,
  ],
  ["an unread binding with a constant answer", tryLoad("catch (error) {\n    return [];\n  }"), 1],
  ["void on the error does not read it before a constant", tryLoad("catch (error) {\n    void error;\n    return false;\n  }"), 1],
  ["a constant answer on one branch of two", tryLoad("catch {\n    if (flag) {\n      return fallback;\n    }\n    return false;\n  }"), 1],
  ["a conditional between two constants is a constant answer", tryLoad("catch {\n    return flag ? false : null;\n  }"), 1],
  // A use that cannot reach a decision is no read: a closure nothing runs, a bare truthiness test, a nullish rename.
  ["a closure nothing calls does not read the error", tryLoad("catch (error) {\n    const later = () => error;\n    return null;\n  }"), 1],
  [
    "a declared closure nothing calls does not read the error",
    tryLoad("catch (error) {\n    function later() {\n      return error;\n    }\n    return false;\n  }"),
    1,
  ],
  ["a truthiness test does not read the error", tryLoad("catch (error) {\n    if (error) {\n      note();\n    }\n    return false;\n  }"), 1],
  ["a negated test does not read the error", tryLoad("catch (error) {\n    return !error ? null : [];\n  }"), 1],
  ["a nullish rename nothing reads", tryLoad("catch (error) {\n    const cause = error ?? null;\n    return null;\n  }"), 1],
  ["the left of && is only a test", tryLoad("catch (error) {\n    const seen = error && true;\n    return seen ? [] : null;\n  }"), 1],
  // The promise spelling: a rejection handler that never reads its error and answers a constant or nothing.
  ["a rejection handler that answers false", "export const load = (db: D) => db.read().catch(() => false);\n", 1],
  ["a rejection handler that answers an empty list", "export const load = (db: D) => db.read().catch(() => []);\n", 1],
  ["a rejection handler with an unread binding", "export const load = (db: D) => db.read().catch((error) => null);\n", 1],
  ["a rejection handler with an empty body", "export const load = (db: D) => db.read().catch(() => {});\n", 1],
  ["a rejection handler block that answers a constant", "export const load = (db: D) => db.read().catch(() => {\n  return 'unreachable';\n});\n", 1],
  ["a function rejection handler", "export const load = (db: D) => db.read().catch(function () {\n  return false;\n});\n", 1],
  ["a then rejection handler", "export const load = (db: D) => db.read().then(() => true, () => false);\n", 1],
  ["void on a handler's error is not a read", "export const load = (db: D) => db.read().catch((error) => {\n  void error;\n  return [];\n});\n", 1],
  ["an optional chain to catch is still a rejection handler", "export const load = (db: D) => db.read?.().catch(() => false);\n", 1],
  ["a promise from a call whose name ends in Schema", "export const load = () => loadSchema().catch(() => null);\n", 1],
  ["an async parse on a schema answers a promise", "export const load = (input: I) => rowSchema.parseAsync(input).catch(() => null);\n", 1],
  [
    "a side branch on a promise nothing else reads",
    "export function load(id: string): void {\n  const created = fetchModel(id);\n  void created.then(\n    () => failed.delete(id),\n    () => {\n      failed.add(id);\n    },\n  );\n}\n",
    1,
  ],
  [
    "a side branch that answers a value is judged on its answer",
    "export function load(id: string): Promise<M> {\n  const created = fetchModel(id);\n  void created.catch(() => false);\n  return created;\n}\n",
    1,
  ],
  // The rule reaches every browser-shipped package too.
  ["the rule reaches the client package", tryLoad("catch {\n    return false;\n  }"), 1, CLIENT],
  ["the rule reaches the kit package", tryLoad("catch {\n    return false;\n  }"), 1, KIT],
  ["the rule reaches the contracts package", tryLoad("catch {\n    return false;\n  }"), 1, CONTRACTS],
  ["the rule reaches the ui package", tryLoad("catch {\n    return false;\n  }"), 1, UI],
  // Negative controls: the error is read and decides the answer, or the catch answers with a throw or a value.
  [
    "a class predicate with a rethrow",
    tryLoad("catch (error) {\n    if (!(error instanceof NotFoundError)) {\n      throw error;\n    }\n    return null;\n  }"),
    0,
  ],
  ["a log and a rethrow", tryLoad("catch (error) {\n    log.warn({ err: error }, 'read failed');\n    throw error;\n  }"), 0],
  [
    "a ruled site that logs the error",
    "export async function refresh(): Promise<void> {\n  try {\n    await rebuild();\n  } catch (error) {\n    log.warn({ err: error }, 'rebuild failed');\n    stale = true;\n  }\n}\n",
    0,
  ],
  [
    "a rename that is itself read",
    tryLoad("catch (error) {\n    const cause = error;\n    log.warn({ err: cause }, 'read failed');\n    return null;\n  }"),
    0,
  ],
  ["a binding-less catch that throws a typed error", tryLoad("catch {\n    throw new ReadFailedError();\n  }"), 0],
  [
    "a modeled value built from state the catch did not invent is an answer",
    "export function parse(text: string): Result {\n  try {\n    return { ok: true, value: decode(text) };\n  } catch {\n    return { ok: false, value: fallback };\n  }\n}\n",
    0,
  ],
  ["a modeled value that carries the error", tryLoad("catch (error) {\n    return { ok: false, error };\n  }"), 0],
  ["a template that interpolates state", tryLoad(`catch {\n    return \`retry ${INTERPOLATION_SIGN}{attempt}\`;\n  }`), 0],
  ["an array of state", tryLoad("catch {\n    return [cached];\n  }"), 0],
  ["a const whose initializer is computed", tryLoad("catch {\n    const last = cache.get(key);\n    return last;\n  }"), 0],
  [
    "a closure that runs reads the error",
    tryLoad("catch (error) {\n    const describe = () => String(error);\n    log.warn(describe());\n    return null;\n  }"),
    0,
  ],
  ["a closure handed to a call reads the error", tryLoad("catch (error) {\n    return fail(() => error);\n  }"), 0],
  ["a nullish value that reaches a call reads the error", tryLoad("catch (error) {\n    log.warn({ err: error ?? 'unknown' });\n    return null;\n  }"), 0],
  [
    "a test beside a read reads the error",
    tryLoad("catch (error) {\n    if (error && isAbort(error)) {\n      return false;\n    }\n    throw error;\n  }"),
    0,
  ],
  // The promise spelling: a rejection handler is judged as a catch clause is.
  ["a rejection handler that reads its error", "export const load = (db: D) => db.read().catch((error) => fail(error));\n", 0],
  ["a rejection handler that answers state", "export const load = (db: D) => db.read().catch(() => fallback);\n", 0],
  ["a rejection handler that throws a typed error", "export const load = (db: D) => db.read().catch(() => {\n  throw new ReadFailedError();\n});\n", 0],
  ["a named rejection handler is judged where it is declared", "export const load = (db: D) => db.read().catch(onReadFailure);\n", 0],
  [
    "a then rejection handler that decides by class",
    "export const load = (db: D) => db.read().then(\n  () => true,\n  (error) => {\n    if (!isAbort(error)) throw error;\n    return false;\n  },\n);\n",
    0,
  ],
  ["a fulfilment handler is not a rejection handler", "export const load = (db: D) => db.read().then(() => false);\n", 0],
  // A side branch that answers nothing while the same promise reaches another reader hides no fault: that reader gets
  // the rejection.
  [
    "a queue tail whose link reaches the caller",
    "export function enqueue(run: R): Promise<void> {\n  const link = tail.then(run);\n  tail = link.then(\n    () => undefined,\n    () => undefined,\n  );\n  return link;\n}\n",
    0,
  ],
  [
    "a bookkeeping branch beside the kept promise",
    "export function load(id: string): Promise<M> {\n  const created = fetchModel(id);\n  entries.set(id, { promise: created });\n  void created.then(\n    () => failed.delete(id),\n    () => {\n      failed.add(id);\n    },\n  );\n  return created;\n}\n",
    0,
  ],
  ["a schema fallback value is not a handler", "export const field = schema.catch(null);\n", 0],
  // A zod schema's `.catch(fn)` runs only for that schema's own validation issues.
  ["a schema fallback callback on a named schema", "export const field = selectionSchema.catch(() => {\n  note();\n  return { fields: [] };\n});\n", 0],
  ["a schema fallback callback on a z chain", "export const field = z.array(z.string()).catch(() => []);\n", 0],
  ["a schema fallback callback on a shape field", "export const field = signalsSchema.shape.score.nullable().catch(() => null);\n", 0],
  ["a null return inside a nested function is not the catch's answer", tryLoad("catch {\n    throw wrap(() => {\n      return null;\n    });\n  }"), 0],
  [
    "a switch whose every case answers with a value",
    tryLoad("catch {\n    switch (mode) {\n      case 1:\n      case 2:\n        return first;\n      default:\n        return second;\n    }\n  }"),
    0,
  ],
  [
    "a nested try whose branches both answer",
    tryLoad("catch {\n    try {\n      return await db.retry();\n    } catch (inner) {\n      throw inner;\n    }\n  }"),
    0,
  ],
  ["a destructured field that is read", tryLoad("catch ({ code }) {\n    return code === 'ENOENT' ? null : fail(code);\n  }"), 0],
  [
    "a case that falls through into one that answers",
    tryLoad("catch {\n    switch (mode) {\n      case 1:\n        note();\n      default:\n        return second;\n    }\n  }"),
    0,
  ],
  [
    "a break that stays inside the catch's own loop",
    tryLoad("catch {\n    for (const item of items) {\n      if (item.ok) break;\n    }\n    throw new ReadFailedError();\n  }"),
    0,
  ],
]);
