import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginAuthorDiagnostic } from "@orb/plugin-toolchain";
import { compilePluginDirectory } from "@orb/plugin-toolchain";
import { expect, test } from "../support/tool-fixtures.ts";

async function checkMain(repoRoot: string, scratch: string, lines: readonly string[]): Promise<readonly PluginAuthorDiagnostic[]> {
  const directory = join(scratch, "plugin");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "main.ts"), `${lines.join("\n")}\n`);
  const result = await compilePluginDirectory({ pluginDirectory: directory, sdkDirectory: join(repoRoot, "packages", "plugin-sdk") });
  return result.diagnostics;
}

function byLine(diagnostics: readonly PluginAuthorDiagnostic[]): readonly (readonly [number, string])[] {
  return diagnostics.map(({ line, message }) => [line, message] as const).toSorted(([left], [right]) => left - right);
}

test("each command, surface, and action mismatch is one located author diagnostic", async ({ repoRoot, scratch }) => {
  const diagnostics = await checkMain(repoRoot, scratch, [
    "const host = orb.host(1);",
    "host.ui.register({",
    '  id: "home", anchor: "settings", title: "Home", tier: "static",',
    '  spec: { kind: "text", value: "hi" },',
    "  onAction: async ({ actionId }) => {",
    '    if (actionId === "no-such-action") {',
    '      await host.ui.openDialog("no-such-dialog");',
    "    }",
    "  },",
    "});",
    'void host.ui.setState("no-such-surface", { count: 1 });',
    "host.ui.registerCommand({",
    '  name: "roll", describe: "roll dice",',
    '  args: [{ name: "count", type: "number", required: true }, { name: "mode", type: "enum" }],',
    "  onRun: ({ values }) => {",
    "    host.log.info(String(values.undeclared));",
    '    host.log.info(String(values.count === "not-a-number"));',
    "  },",
    "});",
  ]);

  expect(byLine(diagnostics)).toEqual([
    [6, expect.stringContaining("no overlap")],
    [7, expect.stringContaining('"no-such-dialog"')],
    [11, expect.stringContaining('"no-such-surface"')],
    [14, expect.stringContaining("Property 'enumValues' is missing")],
    [16, expect.stringContaining("Property 'undeclared' does not exist")],
    [17, expect.stringContaining("no overlap")],
  ]);
});

test("correctly linked surfaces, actions, and typed command values check clean", async ({ repoRoot, scratch }) => {
  const diagnostics = await checkMain(repoRoot, scratch, [
    "const host = orb.host(1);",
    "const ui = host.ui;",
    'const PANEL = "panel";',
    "ui.register({",
    '  id: PANEL, anchor: "settings", title: "Panel", tier: "static",',
    '  spec: { kind: "stack", children: [{ kind: "text", value: { $state: "detail.title" } }, { kind: "button", actionId: "open", label: "Open" }] },',
    "  onAction: async (a) => {",
    '    if (a.actionId === "open") {',
    '      await ui.openDialog("confirm");',
    "    }",
    "  },",
    "});",
    'ui.register({ id: "confirm", anchor: "dialog", title: "Confirm", tier: "static", spec: { kind: "text", value: "Sure?" } });',
    "function publish(title: string | null): Promise<void> { return ui.setState(PANEL, { detail: title === null ? null : { title } }); }",
    "ui.registerCommand({",
    '  name: "pick", describe: "pick one",',
    '  args: [{ name: "size", type: "enum", enumValues: ["small", "large"], required: true }, { name: "count", type: "number" }],',
    "  onRun: async ({ values }) => {",
    '    const size: "small" | "large" = values.size;',
    "    const count: number = values.count ?? 1;",
    "    await publish(`${size}:${count}`);",
    "  },",
    "});",
  ]);

  expect(diagnostics).toEqual([]);
});

test("an action id outside the spec, a non-dialog target, and an unpublished binding are refused", async ({ repoRoot, scratch }) => {
  const diagnostics = await checkMain(repoRoot, scratch, [
    "const host = orb.host(1);",
    "host.ui.register({",
    '  id: "panel", anchor: "settings", title: "Panel", tier: "static",',
    '  spec: { kind: "stack", children: [{ kind: "text", value: { $state: "detail.titel" } }, { kind: "button", actionId: "open", label: "Open" }] },',
    "  onAction: async (a) => {",
    '    if (a.actionId === "opne") {',
    '      await host.ui.openDialog("panel");',
    "    }",
    "  },",
    "});",
    'host.ui.register({ id: "flank", anchor: "chat-flank", title: "Flank", tier: "static", spec: { kind: "text", value: { $state: "score" } } });',
    'void host.ui.setState("panel", { detail: { title: "x" } });',
  ]);

  expect(byLine(diagnostics)).toEqual([
    [4, expect.stringContaining('"detail.titel"')],
    [6, expect.stringContaining("no overlap")],
    [7, expect.stringContaining("settings anchor")],
    [11, expect.stringContaining('"score"')],
  ]);
});

test("state published through composed and generic types links its bound paths", async ({ repoRoot, scratch }) => {
  const surfaces = ["inter", "generic", "mapped", "indexed", "conditional"];
  const diagnostics = await checkMain(repoRoot, scratch, [
    "const host = orb.host(1);",
    ...surfaces.map(
      (id) =>
        `host.ui.register({ id: "${id}", anchor: "settings", title: "S", tier: "static", spec: { kind: "stack", children: [{ kind: "text", value: { $state: "count" } }, { kind: "text", value: { $state: "missing" } }] } });`,
    ),
    "type Base = { version: number };",
    'async function inter(state: Base & { count: number }): Promise<void> { await host.ui.setState("inter", state); }',
    'async function generic<T extends { count: number }>(state: T): Promise<void> { await host.ui.setState("generic", state); }',
    'async function mapped<T extends { count: number }>(state: Readonly<T>): Promise<void> { await host.ui.setState("mapped", state); }',
    'async function indexed<S extends { panel: { count: number } }>(all: S): Promise<void> { await host.ui.setState("indexed", all["panel"]); }',
    "type Shaped<T> = T extends string ? { count: number; label: T } : { count: number };",
    'async function conditional<T>(state: Shaped<T>): Promise<void> { await host.ui.setState("conditional", state); }',
    "void inter({ version: 1, count: 1 }); void generic({ count: 1 }); void mapped({ count: 1 });",
    'void indexed({ panel: { count: 1 } }); void conditional<string>({ count: 1, label: "x" });',
  ]);

  // Each surface's published type holds `count` and not `missing`, so only the `missing` binding is refused.
  expect(byLine(diagnostics)).toEqual(surfaces.map((id, index) => [index + 2, expect.stringContaining(`surface "${id}" binds $state "missing"`)]));
});

test("a tool-card binding reads the call record and a computed surface id stays unchecked", async ({ repoRoot, scratch }) => {
  const diagnostics = await checkMain(repoRoot, scratch, [
    "const host = orb.host(1);",
    'host.ui.register({ id: "card", anchor: "tool-card", toolName: "draw", title: "Card", tier: "static", spec: { kind: "text", value: { $state: "result.drawn" } } });',
    'function surfaceFor(room: boolean): string { return room ? "room_panel" : "card"; }',
    "void host.ui.setState(surfaceFor(true), { anything: 1 });",
  ]);

  expect(diagnostics).toEqual([]);
});
