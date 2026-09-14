// Policy: tooling-slot-template (docs/architecture/core/Core-Tooling-Law.md §4.1) — the five-slot tool template.
// Arms: (A) a loose file at tooling/src/ root; (B) a tool dir missing index.ts, or missing cli.ts
// without a BASH_FRONTED_TOOLS row AND without being an ENGINE DIR — a dir some file under snap/ imports
// through `<tool>/index.ts` (owner ask 2026-09-06, #1315: Snap is the sole rendered front door, so the
// engines behind its arms own no argv door; DERIVED from snap's import specifiers, never a row); (C) a tool-root entry outside {cli.ts,index.ts,contract/,ops/,lib/}
// (+ *.sh for bash-fronted rows); (D) a subdir under _shared/ (the plumbing floor is FLAT by design);
// (E) stale BASH_FRONTED_TOOLS row (no such dir, or the dir grew a cli.ts); (F) stale CORPUS_SLOTS row
// (no such tool dir, or the named slot dir is gone). Comment posture: fs-shape only, comment-SAFE.
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
const SHARED = "_shared";
const TOOL_ROOT_FILES = new Set(["cli.ts", "index.ts"]);
const TOOL_SLOT_DIRS = new Set(["contract", "ops", "lib"]);

/** Tools whose ENTRYPOINT is bash (`.sh` at the tool root, no cli.ts required). Stale arm E reds a row
 *  naming a dead dir or a dir that has grown a cli.ts (the row then exempts nothing and must go). */
const BASH_FRONTED_TOOLS: Readonly<Record<string, { readonly why: string }>> = {
  stack: {
    why: "the pgid/setsid/process-group choreography IS the tool (stack.sh · dev.sh · engines.sh, plus the two shells they call: multi-user-fixture.sh · vllm-setup.sh); the TS half under ops/ holds only the decisions the shell asks for. Ends if stack grows a cli.ts or the shells leave the tool root",
  },
};

/** Tools carrying ONE extra slot dir beyond `{contract,ops,lib}` because their subject is a PLUGIN CORPUS
 *  the tool loads rather than code the tool calls. Stale arm F reds a row whose tool or slot dir is gone.
 *  Deliberately keyed tool → slot name (never a bare "allow any extra dir"): the exemption names exactly
 *  which corpus is sanctioned, so a second stray dir under the same tool is still RED. */
const CORPUS_SLOTS: Readonly<Record<string, { readonly slot: string; readonly why: string }>> = {
  verify: {
    slot: "gates",
    why: "`gates/` is a 219-module DESCRIPTOR CORPUS the loader globs (it IS the registry) — not a command family (ops/) and not tool-internal helpers (lib/); docs/architecture/core/Core-Tooling-Law.md §4.3 pre-declares the path as the size-cap carve. Ends if the corpus stops being fs-discovered (a hand-written registry would make the gates ordinary lib/ modules) or the dir moves.",
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
      if (target.length === 2 && tool !== undefined && tool !== "snap" && tool !== SHARED && entry === "index.ts") {
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
  const bashFronted = tool in BASH_FRONTED_TOOLS;
  if (!names.has("index.ts")) {
    out.push({
      file: rel,
      message: `tool "${tool}" has no index.ts — the programmatic front door is mandatory (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
    });
  }
  // An ENGINE dir (index.ts entered by a snap arm) owns no argv door: Snap is the sole rendered front door.
  if (!(names.has("cli.ts") || bashFronted || (names.has("index.ts") && engines.has(tool)))) {
    out.push({
      file: rel,
      message: `tool "${tool}" has no cli.ts — the argv front door is mandatory, or a BASH_FRONTED_TOOLS row, or the dir is an ENGINE a snap arm enters through its index.ts (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
    });
  }
  for (const entry of members) {
    const name = entry.path.slice(rel.length + 1);
    if (entry.kind === "directory") {
      if (!(TOOL_SLOT_DIRS.has(name) || CORPUS_SLOTS[tool]?.slot === name)) {
        out.push({
          file: entry.path,
          message: `"${name}/" is not a slot — a tool dir holds only contract/ ops/ lib/ (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
        });
      }
      continue;
    }
    if (TOOL_ROOT_FILES.has(name) || (bashFronted && name.endsWith(".sh"))) {
      continue;
    }
    out.push({
      file: entry.path,
      message: `stray tool-root file "${name}" — root holds only cli.ts + index.ts; code lives in ops/ or lib/, data beside its consumer (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
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
        message: `loose file "${name}" at tooling/src root — every entry is a tool DIRECTORY or _shared/ (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
      });
    } else if (name === SHARED) {
      out.push(...sharedViolations(entries));
    } else {
      out.push(...toolDirViolations(entries, name, engines));
    }
  }
  return out;
}

function sharedViolations(entries: readonly ResourceTreeEntry[]): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const entry of children(entries, `${TOOLING_SRC}/${SHARED}`)) {
    if (entry.kind === "directory") {
      out.push({
        file: entry.path,
        message: `"${entry.path.slice(TOOLING_SRC.length + 1)}/" — the plumbing floor is FLAT modules; a subdir is a hidden drawer (docs/architecture/core/Core-Tooling-Law.md §2.4)`,
      });
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
        message: `stale CORPUS_SLOTS row "${tool}" — no such tool dir (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
      continue;
    }
    if (!hasPath(entries, `${dir}/${row.slot}`, "directory")) {
      out.push({
        file: entries[0]?.path ?? TOOLING_SRC,
        message: `stale CORPUS_SLOTS row "${tool}" — the declared ${row.slot}/ slot is gone (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    }
  }
  return out;
}

function staleBashRows(entries: readonly ResourceTreeEntry[]): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const [tool, row] of Object.entries(BASH_FRONTED_TOOLS)) {
    const dir = `${TOOLING_SRC}/${tool}`;
    if (!hasPath(entries, dir, "directory")) {
      out.push({
        file: entries[0]?.path ?? TOOLING_SRC,
        message: `stale BASH_FRONTED_TOOLS row "${tool}" — no such tool dir (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    } else if (hasPath(entries, `${dir}/cli.ts`, "file")) {
      out.push({
        file: `${TOOLING_SRC}/${tool}/cli.ts`,
        message: `BASH_FRONTED_TOOLS row "${tool}" is stale — the tool has a cli.ts now. Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    }
  }
  return out;
}

// Every proof includes the classified homes: liveness is part of the policy on every corpus.
const CLASSIFIED_HOMES = {
  "tooling/src/stack/index.ts": "export {};\n",
  "tooling/src/stack/stack.sh": "#!/bin/sh\n",
  "tooling/src/verify/index.ts": "export {};\n",
  "tooling/src/verify/cli.ts": "export {};\n",
  "tooling/src/verify/gates/example.ts": "export {};\n",
};

export const gate = defineGate({
  id: "tooling-slot-template",
  family: "tooling-slot-template",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "tooling-slot" }],
  message:
    "a @orb/tooling tree entry violates the five-slot tool template — every tool is cli.ts + index.ts + {contract/,ops/,lib/}; _shared/ is flat plumbing; nothing else lives at a tool root (docs/architecture/core/Core-Tooling-Law.md §2.5/§4.1).",
  fix: "add the missing front door, move the stray into ops//lib/, (bash-fronted) add the BASH_FRONTED_TOOLS row with its why, or (an engine) enter it from a snap arm through its index.ts — an engine dir owns no cli.ts.",
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("tooling-slot"));
      for (const violation of scanTree(entries, engineTools(ctx.files, ctx.relativePath))) {
        ctx.report.file(violation.file, { line: 1, column: 1, message: violation.message });
      }
      for (const violation of [...staleBashRows(entries), ...staleCorpusRows(entries)]) {
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
      files: { ...CLASSIFIED_HOMES, "tooling/src/_shared/sub/x.ts": "export const x = 1;\n" },
      expect: { count: 1, messageIncludes: "FLAT modules" },
      why: "a subdir under _shared/ — the plumbing floor is flat by design",
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
        "tooling/src/_shared/log.ts": "export const l = 1;\n",
      },
      why: "a conforming five-slot tool + a flat _shared module — the sanctioned layout",
    },
    {
      mode: "resource",
      files: {
        ...CLASSIFIED_HOMES,
        "tooling/src/verify/cli.ts": "export {};\n",
        "tooling/src/verify/index.ts": "export {};\n",
        "tooling/src/verify/gates/x.ts": "export const gate = 1;\n",
      },
      why: "the CORPUS_SLOTS row: verify's gates/ is the sanctioned sixth slot (docs/architecture/core/Core-Tooling-Law.md §4.3)",
    },
  ],
});
