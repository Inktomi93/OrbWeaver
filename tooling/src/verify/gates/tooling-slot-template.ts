// Gate: tooling-slot-template (docs/architecture/core/Core-Tooling-Law.md §4.1) — the five-slot tool template.
// Arms: (A) a loose file at tooling/src/ root; (B) a tool dir missing index.ts, or missing cli.ts
// without a BASH_FRONTED_TOOLS row AND without being an ENGINE DIR — a dir some file under snap/ imports
// through `<tool>/index.ts` (owner ask 2026-09-06, #1315: Snap is the sole rendered front door, so the
// engines behind its arms own no argv door; DERIVED from snap's import specifiers, never a row); (C) a tool-root entry outside {cli.ts,index.ts,contract/,ops/,lib/}
// (+ *.sh for bash-fronted rows); (D) a subdir under _shared/ (the plumbing floor is FLAT by design);
// (E) stale BASH_FRONTED_TOOLS row (no such dir, or the dir grew a cli.ts); (F) stale CORPUS_SLOTS row
// (no such tool dir, or the named slot dir is gone). Comment posture: fs-shape only, comment-SAFE.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import type { Project } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";

const TOOLING_SRC = "tooling/src";
const SHARED = "_shared";
const TOOL_ROOT_FILES = new Set(["cli.ts", "index.ts"]);
const TOOL_SLOT_DIRS = new Set(["contract", "ops", "lib"]);

/** Tools whose ENTRYPOINT is bash (`.sh` at the tool root, no cli.ts required). Stale arm E reds a row
 *  naming a dead dir or a dir that has grown a cli.ts (the row then exempts nothing and must go). */
const BASH_FRONTED_TOOLS: ExemptionTable = {
  stack: {
    why: "the pgid/setsid/process-group choreography IS the tool (stack.sh · dev.sh · engines.sh, plus the two shells they call: multi-user-fixture.sh · vllm-setup.sh); the TS half under ops/ holds only the decisions the shell asks for. Ends if stack grows a cli.ts or the shells leave the tool root",
  },
};

/** Tools carrying ONE extra slot dir beyond `{contract,ops,lib}` because their subject is a PLUGIN CORPUS
 *  the tool loads rather than code the tool calls. Stale arm F reds a row whose tool or slot dir is gone.
 *  Deliberately keyed tool → slot name (never a bare "allow any extra dir"): the exemption names exactly
 *  which corpus is sanctioned, so a second stray dir under the same tool is still RED. */
const CORPUS_SLOTS: ExemptionTable = {
  verify: {
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
function engineTools(root: string, project: Project): ReadonlySet<string> {
  const out = new Set<string>();
  const snapDir = join(root, TOOLING_SRC, "snap") + sep;
  const srcDir = join(root, TOOLING_SRC);
  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    if (!file.startsWith(snapDir)) {
      continue;
    }
    for (const decl of sf.getImportDeclarations()) {
      const spec = decl.getModuleSpecifierValue();
      if (!spec.startsWith(".")) {
        continue;
      }
      const target = relative(srcDir, normalize(join(dirname(file), spec))).split(sep);
      const [tool, entry] = target;
      if (target.length === 2 && tool !== undefined && tool !== "snap" && tool !== SHARED && entry === "index.ts") {
        out.add(tool);
      }
    }
  }
  return out;
}

function toolDirViolations(root: string, tool: string, engines: ReadonlySet<string>): readonly FsViolation[] {
  const out: FsViolation[] = [];
  const dir = join(root, TOOLING_SRC, tool);
  const rel = `${TOOLING_SRC}/${tool}`;
  const entries = readdirSync(dir, { withFileTypes: true });
  const names = new Set(entries.map((e) => e.name));
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
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!(TOOL_SLOT_DIRS.has(e.name) || CORPUS_SLOTS[tool] !== undefined)) {
        out.push({
          file: `${rel}/${e.name}`,
          message: `"${e.name}/" is not a slot — a tool dir holds only contract/ ops/ lib/ (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
        });
      }
      continue;
    }
    if (TOOL_ROOT_FILES.has(e.name) || (bashFronted && e.name.endsWith(".sh"))) {
      continue;
    }
    out.push({
      file: `${rel}/${e.name}`,
      message: `stray tool-root file "${e.name}" — root holds only cli.ts + index.ts; code lives in ops/ or lib/, data beside its consumer (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
    });
  }
  return out;
}

function scanTree(root: string, srcDir: string, engines: ReadonlySet<string>): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      out.push({
        file: `${TOOLING_SRC}/${entry.name}`,
        message: `loose file "${entry.name}" at tooling/src root — every entry is a tool DIRECTORY or _shared/ (docs/architecture/core/Core-Tooling-Law.md §4.1)`,
      });
    } else if (entry.name === SHARED) {
      out.push(...sharedViolations(srcDir));
    } else {
      out.push(...toolDirViolations(root, entry.name, engines));
    }
  }
  return out;
}

function sharedViolations(srcDir: string): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const e of readdirSync(join(srcDir, SHARED), { withFileTypes: true })) {
    if (e.isDirectory()) {
      out.push({
        file: `${TOOLING_SRC}/${SHARED}/${e.name}`,
        message: `"_shared/${e.name}/" — the plumbing floor is FLAT modules; a subdir is a hidden drawer (docs/architecture/core/Core-Tooling-Law.md §2.4)`,
      });
    }
  }
  return out;
}

/** Arm F — the CORPUS_SLOTS stale sweep. A row whose tool dir is gone, or whose corpus dir no longer
 *  exists, exempts nothing and must be deleted. */
function staleCorpusRows(root: string): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const [tool, row] of Object.entries(CORPUS_SLOTS)) {
    const dir = join(root, TOOLING_SRC, tool);
    if (!existsSync(dir)) {
      out.push({
        file: `${TOOLING_SRC}/${tool}`,
        message: `stale CORPUS_SLOTS row "${tool}" — no such tool dir (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
      continue;
    }
    const extras = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !TOOL_SLOT_DIRS.has(e.name));
    if (extras.length === 0) {
      out.push({
        file: `${TOOLING_SRC}/${tool}`,
        message: `stale CORPUS_SLOTS row "${tool}" — the tool carries no extra slot dir any more (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    }
  }
  return out;
}

function staleBashRows(root: string): readonly FsViolation[] {
  const out: FsViolation[] = [];
  for (const [tool, row] of Object.entries(BASH_FRONTED_TOOLS)) {
    const dir = join(root, TOOLING_SRC, tool);
    if (!existsSync(dir)) {
      out.push({
        file: `${TOOLING_SRC}/${tool}`,
        message: `stale BASH_FRONTED_TOOLS row "${tool}" — no such tool dir (row why: ${row.why}). Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    } else if (existsSync(join(dir, "cli.ts"))) {
      out.push({
        file: `${TOOLING_SRC}/${tool}/cli.ts`,
        message: `BASH_FRONTED_TOOLS row "${tool}" is stale — the tool has a cli.ts now. Delete the row (docs/architecture/core/Core-Tooling-Law.md §4.1).`,
      });
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "tooling-slot-template",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.1)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a @orb/tooling tree entry violates the five-slot tool template — every tool is cli.ts + index.ts + {contract/,ops/,lib/}; _shared/ is flat plumbing; nothing else lives at a tool root (docs/architecture/core/Core-Tooling-Law.md §2.5/§4.1).",
  fix: "add the missing front door, move the stray into ops//lib/, (bash-fronted) add the BASH_FRONTED_TOOLS row with its why, or (an engine) enter it from a snap arm through its index.ts — an engine dir owns no cli.ts.",
  run: (ctx) => {
    const srcDir = join(ctx.root, TOOLING_SRC);
    if (!existsSync(srcDir)) {
      return;
    }
    for (const v of scanTree(ctx.root, srcDir, engineTools(ctx.root, ctx.project))) {
      ctx.report({ file: v.file, line: 0, column: 0, message: v.message });
    }
    // Arm E — the two-sided exemption sweep. Anchored on the real tree's _shared floor (never a row's own
    // path), so conformance mini-trees without it skip the sweep (GATE-AUTHORING §4.5).
    if (!existsSync(join(ctx.root, TOOLING_SRC, SHARED, "exit-contract.ts"))) {
      return;
    }
    for (const v of [...staleBashRows(ctx.root), ...staleCorpusRows(ctx.root)]) {
      ctx.report({ file: v.file, line: 0, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "tooling/src/enginetool/index.ts": "export const engine = 1;\n",
        "tooling/src/snap/cli.ts": "export {};\n",
        "tooling/src/snap/index.ts": "export {};\n",
        "tooling/src/snap/ops/arms/design.ts": "export const d = 1;\n",
      },
      expect: { messageIncludes: "no cli.ts" },
      why: "the engine clause's POSITIVE CONTROL: an index.ts-only dir nothing under snap imports is not an engine and still owes its argv door",
    },
    {
      files: { "tooling/src/badtool/stray.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "no index.ts" },
      why: "a tool dir with neither front door and a stray root file — the founding shape",
    },
    {
      files: { "tooling/src/loose.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "loose file" },
      why: "a loose file at tooling/src root — every entry is a tool directory",
    },
    {
      files: { "tooling/src/_shared/sub/x.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "FLAT modules" },
      why: "a subdir under _shared/ — the plumbing floor is flat by design",
    },
    {
      files: {
        "tooling/src/othertool/cli.ts": "export {};\n",
        "tooling/src/othertool/index.ts": "export {};\n",
        "tooling/src/othertool/corpus/x.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "is not a slot" },
      why: "a NON-exempt tool growing a sixth dir — the corpus carve is keyed per tool, never ambient (arm C's half of arm F)",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/enginetool/index.ts": "export const engine = 1;\n",
        "tooling/src/snap/cli.ts": "export {};\n",
        "tooling/src/snap/index.ts": "export {};\n",
        "tooling/src/snap/ops/arms/design.ts": 'import { engine } from "../../../enginetool/index.ts";\nexport const d = engine;\n',
      },
      why: "an ENGINE dir — index.ts only, entered by a snap arm through that index — owns no argv door (owner ask 2026-09-06, #1315: Snap is the sole rendered front door; the stub cli.ts files were doors kept alive for this arm alone)",
    },
    {
      files: {
        "tooling/src/goodtool/cli.ts": "export {};\n",
        "tooling/src/goodtool/index.ts": "export {};\n",
        "tooling/src/goodtool/ops/run.ts": "export const r = 1;\n",
        "tooling/src/_shared/log.ts": "export const l = 1;\n",
      },
      why: "a conforming five-slot tool + a flat _shared module — the sanctioned layout",
    },
    {
      files: {
        "tooling/src/verify/cli.ts": "export {};\n",
        "tooling/src/verify/index.ts": "export {};\n",
        "tooling/src/verify/gates/x.ts": "export const gate = 1;\n",
      },
      why: "the CORPUS_SLOTS row: verify's gates/ is the sanctioned sixth slot (docs/architecture/core/Core-Tooling-Law.md §4.3)",
    },
  ],
};
