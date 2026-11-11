// A catch that never reads its error and answers null or nothing runs as the native `orb/no-blind-catch` rule; these
// controls drive the configured rule through the real flat config, so a positive goes red when the rule is off.

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
    "a modeled value is not a null answer",
    "export function parse(text: string): Result {\n  try {\n    return { ok: true, value: decode(text) };\n  } catch {\n    return { ok: false };\n  }\n}\n",
    0,
  ],
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
