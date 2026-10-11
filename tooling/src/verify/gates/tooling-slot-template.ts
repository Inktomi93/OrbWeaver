// Policy: tooling-slot-template (docs/law/Core-Tooling-Law.md §4.1) — the five-slot tool template.
// Arms: (A) a loose file at tooling/src/ root; (B) a tool dir missing index.ts, or missing cli.ts
// without being an ENGINE DIR — a dir some file under snap/ imports through `<tool>/index.ts` (owner ask
// 2026-09-06, #1315: Snap is the sole rendered front door, so the engines behind its arms own no argv
// door; DERIVED from snap's import specifiers, never a row); (C) a tool-root entry outside
// {cli.ts,index.ts,contract/,ops/,lib/}; (D) a loose file directly under floor/, or a subdir inside a floor
// role folder (the floor is one level of role folders, each flat); (F) stale CORPUS_SLOTS row (no such tool dir, or the named slot dir is gone). Comment
// posture: fs-shape only, comment-SAFE.
//
// The legacy descriptor walked `tooling/src` with `existsSync`/`readdirSync` and received every harness
// candidate although it read only tooling source for the engine clause. The final hard resource policy uses
// the closed `tooling-slot` authored tree for layout and the explicit `@tooling` compiler population for Snap
// import identity. Both are whole-population inputs, so a missing/empty tooling tree refuses before evaluation.
import { dirname, join, normalize, relative, sep } from "node:path";
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const TOOLING_SRC = "tooling/src";
const FLOOR = "floor";
const TOOL_ROOT_FILES = new Set(["cli.ts", "index.ts"]);
const TOOL_SLOT_DIRS = new Set(["contract", "ops", "lib"]);

/** Tools carrying ONE extra slot dir beyond `{contract,ops,lib}` because their subject is a PLUGIN CORPUS
 *  the tool loads rather than code the tool calls. Stale arm F reds a row whose tool or slot dir is gone.
 *  Deliberately keyed tool → slot name (never a bare "allow any extra dir"): the exemption names exactly
 *  which corpus is sanctioned, so a second stray dir under the same tool is still RED. */
const CORPUS_SLOTS: Readonly<Record<string, { readonly slot: string; readonly why: string }>> = {
  verify: {
    slot: "gates",
    why: "`gates/` is a 219-module DESCRIPTOR CORPUS the loader globs (it IS the registry) — not a command family (ops/) and not tool-internal helpers (lib/); docs/law/Core-Tooling-Law.md §4.3 pre-declares the path as the size-cap carve. Ends if the corpus stops being fs-discovered (a hand-written registry would make the gates ordinary lib/ modules) or the dir moves.",
  },
};

interface FsViolation {
  readonly file: string;
  readonly message: string;
}

/** The tool dirs some module under `tooling/src/snap/` enters through `<tool>/index.ts` — the ENGINES behind
 *  Snap's arms (ui-audit, motion-audit, cpu-profile). Read from snap's own relative import specifiers resolved
 *  against the importing file, so an engine that stops being imported reverts to owing a cli.ts by itself. */
function engineTools(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string): ReadonlySet<string> {
  const out = new Set<string>();
  const snapDir = `${TOOLING_SRC}/snap/`;
  for (const sf of files) {
    const file = relativePath(sf);
    if (!file.startsWith(snapDir)) {
      continue;
    }
    for (const decl of sf.getImportDeclarations()) {
      const spec = decl.getModuleSpecifierValue();
      if (!spec.startsWith(".")) {
        continue;
      }
      const target = relative(TOOLING_SRC, normalize(join(dirname(file), spec))).split(sep);
      const [tool, entry] = target;
      if (target.length === 2 && tool !== undefined && tool !== "snap" && tool !== FLOOR && entry === "index.ts") {
        out.add(tool);
      }
    }
  }
  return out;
}

function children(entries: readonly ResourceTreeEntry[], directory: string): readonly ResourceTreeEntry[] {
  return entries.filter((entry) => dirname(entry.path) === directory);
}

function hasPath(entries: readonly ResourceTreeEntry[], path: string, kind?: ResourceTreeEntry["kind"]): boolean {
  return entries.some((entry) => entry.path === path && (kind === undefined || entry.kind === kind));
}

function toolDirViolations(entries: readonly ResourceTreeEntry[], tool: string, engines: ReadonlySet<string>): readonly FsViolation[] {
  const out: FsViolation[] = [];
  const rel = `${TOOLING_SRC}/${tool}`;
  const members = children(entries, rel);
  const names = new Set(members.map((entry) => entry.path.slice(rel.length + 1)));
  if (!names.has("index.ts")) {
    out.push({
      file: rel,
      message: `tool "${tool}" has no index.ts — the programmatic front door is mandatory (docs/law/Core-Tooling-Law.md §4.1)`,
    });
  }
  // An ENGINE dir (index.ts entered by a snap arm) owns no argv door: Snap is the sole rendered front door.
  if (!(names.has("cli.ts") || (names.has("index.ts") && engines.has(tool)))) {
    out.push({
      file: rel,
      message: `tool "${tool}" has no cli.ts — the argv front door is mandatory, or the dir is an ENGINE a snap arm enters through its index.ts (docs/law/Core-Tooling-Law.md §4.1)`,
    });
  }
  for (const entry of members) {
    const name = entry.path.slice(rel.length + 1);
    if (entry.kind === "directory") {
      if (!(TOOL_SLOT_DIRS.has(name) || CORPUS_SLOTS[tool]?.slot === name)) {
        out.push({
          file: entry.path,
          message: `"${name}/" is not a slot — a tool dir holds only contract/ ops/ lib/ (docs/law/Core-Tooling-Law.md §4.1)`,
        });
      }
      continue;
    }
    if (TOOL_ROOT_FILES.has(name)) {
      continue;
    }
    out.push({
      file: entry.path,
      message: `stray tool-root file "${name}" — root holds only cli.ts + index.ts; code lives in ops/ or lib/, data beside its consumer (docs/law/Core-Tooling-Law.md §4.1)`,
    });
  }
  return out;
}

function scanTree(entries: readonly ResourceTreeEntry[], engines: ReadonlySet<string>): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const entry of children(entries, TOOLING_SRC)) {
    const name = entry.path.slice(TOOLING_SRC.length + 1);
    if (entry.kind !== "directory") {
      out.push({
        file: entry.path,
        message: `loose file "${name}" at tooling/src root — every entry is a tool DIRECTORY or floor/ (docs/law/Core-Tooling-Law.md §4.1)`,
      });
    } else if (name === FLOOR) {
      out.push(...floorViolations(entries));
    } else {
      out.push(...toolDirViolations(entries, name, engines));
    }
  }
  return out;
}

function floorViolations(entries: readonly ResourceTreeEntry[]): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const role of children(entries, `${TOOLING_SRC}/${FLOOR}`)) {
    if (role.kind !== "directory") {
      out.push({
        file: role.path,
        message: `loose floor module "${role.path.slice(TOOLING_SRC.length + 1)}" — every floor module lives in a role folder (docs/law/Core-Tooling-Law.md §2.4)`,
      });
      continue;
    }
    for (const entry of children(entries, role.path)) {
      if (entry.kind === "directory") {
        out.push({
          file: entry.path,
          message: `"${entry.path.slice(TOOLING_SRC.length + 1)}/" — a floor role folder holds flat modules; a nested folder is a hidden drawer (docs/law/Core-Tooling-Law.md §2.4)`,
        });
      }
    }
  }
  return out;
}

/** Arm F — the CORPUS_SLOTS stale sweep. A row whose tool dir is gone, or whose corpus dir no longer
 *  exists, exempts nothing and must be deleted. */
function staleCorpusRows(entries: readonly ResourceTreeEntry[]): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const [tool, row] of Object.entries(CORPUS_SLOTS)) {
    const dir = `${TOOLING_SRC}/${tool}`;
    if (!hasPath(entries, dir, "directory")) {
      out.push({
        file: entries[0]?.path ?? TOOLING_SRC,
        message: `stale CORPUS_SLOTS row "${tool}" — no such tool dir (row why: ${row.why}). Delete the row (docs/law/Core-Tooling-Law.md §4.1).`,
      });
      continue;
    }
    if (!hasPath(entries, `${dir}/${row.slot}`, "directory")) {
      out.push({
        file: entries[0]?.path ?? TOOLING_SRC,
        message: `stale CORPUS_SLOTS row "${tool}" — the declared ${row.slot}/ slot is gone (row why: ${row.why}). Delete the row (docs/law/Core-Tooling-Law.md §4.1).`,
      });
    }
  }
  return out;
}

// Every proof includes the classified homes: liveness is part of the policy on every corpus.
const CLASSIFIED_HOMES = {
  "tooling/src/verify/index.ts": "export {};\n",
  "tooling/src/verify/cli.ts": "export {};\n",
  "tooling/src/verify/gates/example.ts": "export {};\n",
};

export const gate = defineGate({
  id: "tooling-slot-template",
  application: "implementation",
  family: "tooling-slot-template",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "tooling-slot" }],
  message:
    "a @orb/tooling tree entry violates the five-slot tool template — every tool is cli.ts + index.ts + {contract/,ops/,lib/}; floor/ is role folders of flat plumbing modules; nothing else lives at a tool root (docs/law/Core-Tooling-Law.md §2.5/§4.1).",
  fix: "add the missing front door, move the stray into ops//lib/, or (an engine) enter it from a snap arm through its index.ts — an engine dir owns no cli.ts.",
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("tooling-slot"));
      for (const violation of scanTree(entries, engineTools(ctx.files, ctx.relativePath))) {
        ctx.report.file(violation.file, { line: 1, column: 1, message: violation.message });
      }
      for (const violation of staleCorpusRows(entries)) {
        ctx.report.file(violation.file, { line: 1, column: 1, message: violation.message });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/enginetool/index.ts": "export const engine = 1;\n",
        "tooling/src/snap/cli.ts": "export {};\n",
        "tooling/src/snap/index.ts": "export {};\n",
        "tooling/src/snap/ops/arms/design.ts": "export const d = 1;\n",
      },
      expect: { count: 1, messageIncludes: "no cli.ts" },
      why: "the engine clause's POSITIVE CONTROL: an index.ts-only dir nothing under snap imports is not an engine and still owes its argv door",
    },
    {
      mode: "resource",
      files: { ...CLASSIFIED_HOMES, "tooling/src/badtool/stray.ts": "export const x = 1;\n" },
      expect: { count: 3, messageIncludes: "no index.ts" },
      why: "a tool dir with neither front door and a stray root file — the founding shape",
    },
    {
      mode: "resource",
      files: { ...CLASSIFIED_HOMES, "tooling/src/loose.ts": "export const x = 1;\n" },
      expect: { count: 1, messageIncludes: "loose file" },
      why: "a loose file at tooling/src root — every entry is a tool directory",
    },
    {
      mode: "resource",
      files: { ...CLASSIFIED_HOMES, "tooling/src/floor/process/sub/x.ts": "export const x = 1;\n" },
      expect: { count: 1, messageIncludes: "hidden drawer" },
      why: "a nested folder inside a floor role folder — each role folder is flat",
    },
    {
      mode: "resource",
      files: { ...CLASSIFIED_HOMES, "tooling/src/floor/x.ts": "export const x = 1;\n" },
      expect: { count: 1, messageIncludes: "loose floor module" },
      why: "a module directly under floor/ — every floor module names its role by its folder",
    },
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/othertool/cli.ts": "export {};\n",
        "tooling/src/othertool/index.ts": "export {};\n",
        "tooling/src/othertool/corpus/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "is not a slot" },
      why: "a NON-exempt tool growing a sixth dir — the corpus carve is keyed per tool, never ambient (arm C's half of arm F)",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/enginetool/index.ts": "export const engine = 1;\n",
        "tooling/src/snap/cli.ts": "export {};\n",
        "tooling/src/snap/index.ts": "export {};\n",
        "tooling/src/snap/ops/arms/design.ts": 'import { engine } from "../../../enginetool/index.ts";\nexport const d = engine;\n',
      },
      why: "an ENGINE dir — index.ts only, entered by a snap arm through that index — owns no argv door (owner ask 2026-09-06, #1315: Snap is the sole rendered front door; the stub cli.ts files were doors kept alive for this arm alone)",
    },
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/goodtool/cli.ts": "export {};\n",
        "tooling/src/goodtool/index.ts": "export {};\n",
        "tooling/src/goodtool/ops/run.ts": "export const r = 1;\n",
        "tooling/src/floor/cli/log.ts": "export const l = 1;\n",
      },
      why: "a conforming five-slot tool + a floor module in its role folder — the sanctioned layout",
    },
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/verify/cli.ts": "export {};\n",
        "tooling/src/verify/index.ts": "export {};\n",
        "tooling/src/verify/gates/x.ts": "export const gate = 1;\n",
      },
      why: "the CORPUS_SLOTS row: verify's gates/ is the sanctioned sixth slot (docs/law/Core-Tooling-Law.md §4.3)",
    },
  ],
});
