// Pins that EVERY grit plugin actually FIRES on a violation — the grit twin of the dep-cruiser +
// check-gates self-tests. A grit whose pattern compiles but silently matches nothing (the
// `export interface` / `if ($x) $_` snippet class — both shipped dead and were fixed 2026-06-27) passes
// `pnpm check` green while enforcing zero. This test is what catches that.
//
// The universe is DERIVED from tools/grit/*.grit on disk (the source of truth), so three drifts FAIL here:
//   1. a grit added to disk but NOT registered in biome.json plugins[]  → "registered" test fails
//   2. a grit added without a fixture below                              → "has a fixture" test fails
//   3. a grit whose pattern matches nothing                             → "fires" test fails
//
// Each grit runs in isolation: a minimal biome config enabling ONLY that one plugin (recommended:false,
// so the ONLY diagnostics possible are its own) over a fixture written at the path the grit's $filename
// guard anchors on. biome's plugin diagnostics carry category "plugin"; ≥1 of those == the grit fired.
// Fixtures live under the OS tmpdir (never under tests/ — that path would trip the grits' own
// tests/tooling/scripts exemptions and produce false negatives).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "..", "..");
const GRIT_DIR = join(ROOT, "tools", "grit");
const BIOME = join(ROOT, "node_modules", ".bin", "biome");
const GRIT_EXT_RE = /\.grit$/u;
const LEADING_PATH_RE = /^.*\//u;

// Every grit plugin on disk (basename, no extension) — the source of truth for "what grits exist".
const GRITS: string[] = readdirSync(GRIT_DIR)
  .filter((f) => f.endsWith(".grit"))
  .map((f) => f.replace(GRIT_EXT_RE, ""))
  .sort();

// The plugins biome.json actually registers (basenames).
function readBiomePlugins(): string[] {
  const cfg = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8")) as { plugins?: string[] };
  return (cfg.plugins ?? []).map((p) => p.replace(LEADING_PATH_RE, "").replace(GRIT_EXT_RE, ""));
}
const BIOME_PLUGINS: string[] = readBiomePlugins();

// A known-violating fixture per grit, written at a path that satisfies the grit's $filename guard.
// Several deliberately exercise the FRAGILE arm: no-inline-types uses an `export interface` (the form
// that silently no-matched before the fix), no-if-is-group uses `if (isGroup) {…}` (likewise). If those
// arms regress to a dead snippet, this fixture stops firing and the test goes red.
const FIXTURES: Record<string, { path: string; src: string }> = {
  "no-await-db-in-loop": {
    path: "f.ts",
    src: "export async function f(ids: string[], db: { select: () => unknown }) {\n  for (const id of ids) {\n    await db.select();\n  }\n}\n",
  },
  "no-chat-trpc-in-surface": {
    path: "packages/client/src/features/chat/surfaces/s.ts",
    src: "export const o = trpc.chat.send.mutationOptions();\n",
  },
  "no-color-literals": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = () => <div className="text-[#fff000]" />;\n',
  },
  "no-context-returntype": {
    path: "context.ts",
    src: "export type C = ReturnType<() => number>;\n",
  },
  "no-decorators": {
    path: "f.ts",
    src: "function dec() {}\nexport class A {\n  @dec foo() {\n    return 1;\n  }\n}\n",
  },
  "no-direct-useform": {
    path: "f.ts",
    src: "export const x = useForm({});\n",
  },
  "no-form-state-in-useeffect": {
    path: "f.ts",
    src: "export function C(form: { state: { values: unknown } }) {\n  useEffect(() => {}, [form.state.values]);\n}\n",
  },
  "no-if-is-group": {
    path: "f.ts",
    src: "export function f(isGroup: boolean) {\n  if (isGroup) {\n    return 1;\n  }\n  return 0;\n}\n",
  },
  "no-inline-optimistic-in-surface": {
    path: "packages/client/src/features/chat/surfaces/s.ts",
    src: "export const X = (queryClient: { cancelQueries: (a: unknown) => void }) => {\n  queryClient.cancelQueries({});\n};\n",
  },
  "no-inline-types": {
    path: "packages/server/src/domain/foo/verbs/v.ts",
    src: "export interface Leak {\n  a: number;\n}\n",
  },
  "no-layout-context-props": {
    // an @orb/ui path — the gate scopes to packages/{client,ui}/src (the container model covers both).
    path: "packages/ui/src/primitives/card/card.tsx",
    src: "export const C = () => <div compact />;\n",
  },
  "no-loose-id-cast": {
    path: "f.ts",
    src: "declare const x: unknown;\nexport const a = x as never;\n",
  },
  "no-mint-via-cast": {
    path: "f.ts",
    // token assembled so THIS file's source carries no literal unseeded-id call (the test-determinism
    // gate scans every line of tests/, comments included); the WRITTEN fixture resolves to the real call.
    src: `export const a = castId(crypto.${["random", "UUID"].join("")}());\n`,
  },
  "no-raw-clock": {
    path: "f.ts",
    // assembled likewise so this file carries no literal ambient-clock call for the test-determinism gate.
    src: `export const t = ${["Date", "now"].join(".")}();\n`,
  },
  "no-raw-id": {
    path: "f.ts",
    src: "export const s = z.object({ chatId: z.string() });\n",
  },
  "no-raw-intl-time": {
    path: "f.ts",
    src: 'export const f = Intl.DateTimeFormat("en");\n',
  },
  "no-raw-spacing-in-features": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = () => <div className="flex gap-3" />;\n',
  },
  "no-raw-typography-in-features": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = () => <p className="text-sm" />;\n',
  },
  "no-raw-z-index": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = () => <div className="z-50" />;\n',
  },
  "persistence-no-in-memory-state": {
    path: "packages/server/src/domain/foo/persistence/p.ts",
    src: "export const m = new Map();\n",
  },
  "no-untrusted-html-in-main-dom": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    // biome-ignore lint/security/noSecrets: a JSX fixture string (dangerouslySetInnerHTML), not a secret.
    src: "export const C = (s: string) => <div dangerouslySetInnerHTML={{ __html: s }} />;\n",
  },
  "no-external-media-without-gate": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = (u: string) => <img src={u} alt="" />;\n',
  },
  "theme-override-only-via-scope": {
    path: "packages/client/src/features/x/surfaces/c.tsx",
    src: 'export const C = () => <div style={{ "--color-primary": "red" }} />;\n',
  },
};

function pluginDiagnostics(file: string, configPath: string): number {
  let out: string;
  try {
    out = execFileSync(BIOME, ["lint", file, "--config-path", configPath, "--reporter=json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // biome exits non-zero when diagnostics exist — the JSON report is on stdout.
    out = (err as { stdout?: string }).stdout ?? "";
  }
  const parsed = JSON.parse(out) as { diagnostics?: { category?: string }[] };
  return (parsed.diagnostics ?? []).filter((d) => d.category === "plugin").length;
}

let tmp = "";
const fired = new Set<string>();

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "orb-grit-"));
  for (const g of GRITS) {
    const fixture = FIXTURES[g];
    if (fixture === undefined) {
      continue; // the "has a fixture" test reports this; nothing to run.
    }
    const dir = join(tmp, g);
    const cfg = join(dir, "biome.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      cfg,
      JSON.stringify({
        $schema: "https://biomejs.dev/schemas/2.5.1/schema.json",
        root: true,
        linter: { enabled: true, rules: { recommended: false } },
        plugins: [join(GRIT_DIR, `${g}.grit`)],
      }),
    );
    const file = join(dir, fixture.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, fixture.src);
    if (pluginDiagnostics(file, cfg) > 0) {
      fired.add(g);
    }
  }
}, 120_000);

afterAll(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("discovers a non-trivial set of grit plugins on disk (not silently empty)", () => {
  expect(GRITS.length).toBeGreaterThan(10);
});

test("every grit on disk is registered in biome.json plugins[] (anti-drift)", () => {
  const unregistered = GRITS.filter((g) => !BIOME_PLUGINS.includes(g));
  expect(unregistered).toEqual([]);
});

test("every registered biome plugin exists on disk (no dangling registration)", () => {
  const dangling = BIOME_PLUGINS.filter((p) => !GRITS.includes(p));
  expect(dangling).toEqual([]);
});

test("every grit on disk has a self-test fixture (anti-drift)", () => {
  const missing = GRITS.filter((g) => FIXTURES[g] === undefined);
  expect(missing).toEqual([]);
});

test.each(GRITS)("grit %s fires on its fixture (compiles AND matches — not silently dead)", (g) => {
  expect(fired.has(g)).toBe(true);
});
