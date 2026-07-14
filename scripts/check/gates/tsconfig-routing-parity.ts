// Gate: tsconfig-routing-parity (TSC-INCREMENTAL-PERFILE.md §2.2) — keeps the file→tsconfig routing
// algebra (scripts/verify/selection.ts `staticPrograms`) honest against the compilers' ground truth, so
// `verify --file/--changed` never type-checks a file against the wrong program (or skips it). For every
// root file R of program P we assert `staticPrograms(R)` contains P (forward) and its mirror.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import process from "node:process";
import { staticPrograms } from "../../verify/selection.ts";
import type { GateDescriptor } from "../contract.ts";

// The tsgo binary always lives in the REAL repo's node_modules (process.cwd() when `pnpm check`/conformance
// runs). A conformance temp-dir `root` has no node_modules, so resolve the bin from cwd but keep cwd on
// `root` so the resolved `files` paths are rooted THERE. Fall back to PATH `tsgo` if cwd has no copy.
function tsgoBin(): string {
  const fromCwd = join(process.cwd(), "node_modules", ".bin", "tsgo");
  return existsSync(fromCwd) ? fromCwd : "tsgo";
}

const GRAPH = "tsconfig.json";
// The programs this gate reconciles: the root graph + every package config. A conformance tree carries a
// subset; absent configs are skipped via an existence probe.
const CANDIDATE_TSCONFIGS: readonly string[] = [
  GRAPH,
  "packages/ui/tsconfig.json",
  "packages/client/tsconfig.json",
  "packages/server/tsconfig.json",
  "packages/db/tsconfig.json",
  "packages/kit/tsconfig.json",
  "packages/contracts/tsconfig.json",
];

const TS_SRC_RE = /\.(?:ts|tsx|mts|cts)$/u;
const D_TS_RE = /\.d\.ts$/u;

type ShowConfig = { readonly files?: readonly string[] };

/** A program's ROOT set: the repo-relative TS SOURCE files the config's include/files resolves to (via
 *  `tsgo --showConfig`), MINUS .d.ts (reset.d.ts/ambient — not routed by the algebra). The config file's
 *  directory is the base the `files` entries are relative to. undefined ⇒ tsgo/config failure. */
function programRoots(root: string, cfg: string): ReadonlySet<string> | undefined {
  const res = spawnSync(tsgoBin(), ["--showConfig", "-p", cfg], {
    cwd: root,
    encoding: "utf8",
  });
  if (typeof res.stdout !== "string" || res.status !== 0) {
    return;
  }
  let parsed: ShowConfig;
  try {
    parsed = JSON.parse(res.stdout) as ShowConfig;
  } catch {
    return;
  }
  const cfgDir = join(root, cfg, "..");
  const roots = new Set<string>();
  for (const entry of parsed.files ?? []) {
    const abs = isAbsolute(entry) ? entry : join(cfgDir, entry);
    const rel = relative(root, abs);
    if (rel.startsWith("..") || rel.includes("node_modules/")) {
      continue;
    }
    if (D_TS_RE.test(rel) || !TS_SRC_RE.test(rel)) {
      continue;
    }
    roots.add(rel);
  }
  return roots;
}

/** The tsconfig programs that actually EXIST under root (real repo = the 7; a conformance tree = its subset). */
function presentConfigs(root: string): readonly string[] {
  return CANDIDATE_TSCONFIGS.filter((c) => existsSync(join(root, c)));
}

type RootSets = {
  /** cfg → the set of repo-relative TS source files that program ROOTS (include/files, pre-closure). */
  readonly byConfig: ReadonlyMap<string, ReadonlySet<string>>;
  /** the union of every program's root set — the universe of files to reconcile. */
  readonly universe: ReadonlySet<string>;
  /** a tsgo/config failure occurred for ≥1 program (⇒ tool error, not a clean parity verdict). */
  readonly toolError: string | undefined;
};

function measure(root: string): RootSets {
  const byConfig = new Map<string, ReadonlySet<string>>();
  const universe = new Set<string>();
  let toolError: string | undefined;
  for (const cfg of presentConfigs(root)) {
    const roots = programRoots(root, cfg);
    if (roots === undefined) {
      toolError = `tsgo --showConfig failed for ${cfg}`;
      continue;
    }
    byConfig.set(cfg, roots);
    for (const rel of roots) {
      universe.add(rel);
    }
  }
  return { byConfig, universe, toolError };
}

type Divergence = { readonly file: string; readonly message: string };

/** Reconcile each program's ROOT set against `staticPrograms` (rules 1–4), both directions. */
function reconcile(m: RootSets): readonly Divergence[] {
  const out: Divergence[] = [];
  const present = new Set(m.byConfig.keys());
  for (const rel of m.universe) {
    const predicted = new Set(staticPrograms(rel));
    // FORWARD: every program that ROOTS rel must be predicted by the algebra.
    for (const [cfg, roots] of m.byConfig) {
      if (roots.has(rel) && !predicted.has(cfg)) {
        out.push({
          file: rel,
          message: `program ${cfg} ROOTS this file (tsgo --showConfig) but staticPrograms routes it to {${[...predicted].join(", ") || "∅"}} — the routing algebra is wrong (scripts/verify/selection.ts).`,
        });
      }
    }
    // MIRROR: every program the algebra routes rel to (that EXISTS here) must actually root it.
    for (const cfg of predicted) {
      if (present.has(cfg) && m.byConfig.get(cfg)?.has(rel) !== true) {
        out.push({
          file: rel,
          message: `staticPrograms routes this file to ${cfg} but that program does NOT root it (tsgo --showConfig) — the routing algebra is wrong (scripts/verify/selection.ts).`,
        });
      }
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "tsconfig-routing-parity",
  docRow: "TSC-INCREMENTAL-PERFILE.md §2.2 (parity gate)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the file→tsconfig routing algebra (scripts/verify/selection.ts `staticPrograms`) disagrees with a program's REAL root membership (tsgo --showConfig). A wrong route type-checks a file against the wrong program (or skips it) at `verify --file/--changed` → a FALSE GREEN. TSC-INCREMENTAL-PERFILE.md §2.2.",
  fix: "correct `staticPrograms` in scripts/verify/selection.ts so its predicted program set matches the config's resolved include/files (mirror packages/*/tsconfig.json and tsconfig.json).",
  run: (ctx) => {
    const m = measure(ctx.root);
    if (m.toolError !== undefined) {
      // A tsgo/config failure means the checker can't measure — a TOOL error, not a parity verdict; surface
      // it as a file-level finding so the run reds loudly rather than passing vacuously.
      ctx.report({ file: GRAPH, line: 0, column: 0, message: m.toolError });
      return;
    }
    for (const d of reconcile(m)) {
      ctx.report({ file: d.file, line: 0, column: 0, message: d.message });
    }
  },
  mustFlag: [
    {
      // A MISROUTE the string algebra can't see: server's include reaches back into client/src, so tsgo's
      // resolved `files` for the server program ROOTS packages/client/src/a.ts. `staticPrograms` (rule 1)
      // routes a packages/<pkg>/src file to packages/<pkg>/tsconfig ONLY → it predicts {client}, MISSING
      // server. The FORWARD arm reds: "server ROOTS this file but staticPrograms routes it to {client}".
      // Same class as the ct-data-providers / tests-ui bugs (a config include diverging from the algebra).
      files: {
        "tsconfig.base.json":
          '{ "compilerOptions": { "noEmit": true, "strict": true, "target": "es2025", "lib": ["es2025"], "module": "esnext", "moduleResolution": "bundler" } }\n',
        "packages/client/tsconfig.json":
          '{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["es2025", "dom"] }, "include": ["src"] }\n',
        "packages/server/tsconfig.json":
          '{ "extends": "../../tsconfig.base.json", "include": ["src", "../client/src"] }\n',
        "packages/client/src/a.ts": "export const a = 1;\n",
        "packages/server/src/b.ts": "export const b = 2;\n",
      },
      expect: { messageIncludes: "ROOTS this file" },
      why: "packages/client/src/a.ts is rooted by BOTH client and server (a reach-back include) but staticPrograms predicts only {client} — the forward arm must red (a config include diverging from the routing algebra)",
    },
  ],
  mustPass: [
    {
      // A well-formed tree: each package config roots exactly its own src, as staticPrograms routes it →
      // algebra and real root membership agree → no divergence.
      files: {
        "tsconfig.base.json":
          '{ "compilerOptions": { "noEmit": true, "strict": true, "target": "es2025", "lib": ["es2025"], "module": "esnext", "moduleResolution": "bundler" } }\n',
        "packages/client/tsconfig.json":
          '{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["es2025", "dom"] }, "include": ["src"] }\n',
        "packages/server/tsconfig.json":
          '{ "extends": "../../tsconfig.base.json", "include": ["src"] }\n',
        "packages/client/src/a.ts": "export const a = 1;\n",
        "packages/server/src/b.ts": "export const b = 2;\n",
      },
      why: "each config roots exactly its own src as staticPrograms routes it — algebra and real membership agree, so the gate stays green",
    },
  ],
};
