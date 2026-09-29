import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { PLUGIN_AUTHOR_SUPPORT } from "./support.generated.ts";
import type { PluginAuthorSupportFormat } from "./support-model.ts";

function code(value: string): string {
  return `\`${value}\``;
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "None" : values.map(code).join("<br>");
}

function renderMarkdown(): string {
  const lines = [
    "# Orbweaver plugin author support",
    "",
    "This file is generated from Orbweaver's executable plugin contracts. Run `orb-plugin support --check <path>` to verify it.",
    "",
    "## Runtime worlds",
    "",
    "| World | Execution | SDK | Entry point | DOM | Host calls | Local helpers |",
    "| - | - | - | - | - | - | - |",
    ...Object.values(PLUGIN_AUTHOR_SUPPORT.runtimes).map(
      (runtime) =>
        `| ${code(runtime.world)} | ${code(runtime.execution)} | ${code(runtime.sdkEntry)} | ${code(runtime.entrypoint)} | ${runtime.dom ? "Yes" : "No"} | ${list(runtime.hostFunctions)} | ${list(runtime.localHelpers)} |`,
    ),
    "",
    "## Capabilities and host calls",
    "",
    "| Capability | Main | Scripted UI | Frame bridge |",
    "| - | - | - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.capabilities.map(
      ({ capability, functions }) => `| ${code(capability)} | ${list(functions.main)} | ${list(functions.ui)} | ${list(functions.frame)} |`,
    ),
    "",
    "## Event hooks",
    "",
    "| Bus | Hook | World |",
    "| - | - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.hooks.events.chat.map(({ name, world }) => `| ${code("chat")} | ${code(name)} | ${code(world)} |`),
    ...PLUGIN_AUTHOR_SUPPORT.hooks.events.domain.map(({ name, world }) => `| ${code("domain")} | ${code(name)} | ${code(world)} |`),
    "",
    "## Prompt transform points",
    "",
    "| Point | World |",
    "| - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.hooks.promptTransforms.map(({ name, world }) => `| ${code(name)} | ${code(world)} |`),
    "",
    "## Surface mounts",
    "",
    "| Anchor | Allowed tiers | Registration world |",
    "| - | - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.ui.surfaces.map(({ anchor, tiers, registrationWorld }) => `| ${code(anchor)} | ${list(tiers)} | ${code(registrationWorld)} |`),
    "",
    "## Surface tiers",
    "",
    "| Tier | Registrar | Registration world | Execution world |",
    "| - | - | - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.ui.tiers.map(
      ({ tier, registrar, registrationWorld, executionWorld }) =>
        `| ${code(tier)} | ${code(registrar)} | ${code(registrationWorld)} | ${code(executionWorld)} |`,
    ),
    "",
    "## Composer placements",
    "",
    "| Target | Registration world |",
    "| - | - |",
    ...PLUGIN_AUTHOR_SUPPORT.ui.commandPlacements.map(({ target, registrationWorld }) => `| ${code(target)} | ${code(registrationWorld)} |`),
    "",
  ];
  return lines.join("\n");
}

/** Render the checked author support map in a deterministic machine or guide format. */
export function renderPluginAuthorSupport(format: PluginAuthorSupportFormat): string {
  return format === "json" ? `${JSON.stringify(PLUGIN_AUTHOR_SUPPORT, null, 2)}\n` : renderMarkdown();
}

/** Write one generated support guide atomically. */
export async function writePluginAuthorSupportGuide(path: string, format: PluginAuthorSupportFormat): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, renderPluginAuthorSupport(format));
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Return whether a generated support guide exists and exactly matches the current registry. */
export async function pluginAuthorSupportGuideIsCurrent(path: string, format: PluginAuthorSupportFormat): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")) === renderPluginAuthorSupport(format);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
