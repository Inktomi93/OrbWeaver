// Terminal renderer for --map's atlas, shell topology, and scoped surface. Raw structured evidence stays
// in the manifest; this is the bounded sight-unseen-agent view.
import { print } from "../../_shared/artifacts.ts";
import type { MapAtlasEvidence, MapEntry, MapShellEvidence } from "../contract/map.ts";
import type { Args } from "../contract/types.ts";

const GROUP_CAP = 10;
const SURFACE_CAP = 400;
const NAME_CAP = 80;

function command(flag: string, value: string): string {
  return `pnpm snap ${flag} ${JSON.stringify(value)} --map`;
}

function printGroup(name: string, values: readonly string[], render: (value: string) => string): void {
  const shown = values.slice(0, GROUP_CAP);
  print(`  ${name} total=${String(values.length)} shown=${String(shown.length)} omitted=${String(values.length - shown.length)}`);
  for (const value of shown) {
    print(`    ${render(value)}`);
  }
}

/** The last section this SESSION printed an atlas for. Module state is correct here and only here: a
 *  session's calls all run inside the daemon's one process (ops/session-daemon-call.ts), and a one-shot
 *  run is a fresh process that never reads it. */
let lastAtlasFor: { readonly session: string; readonly section: string | null } | null = null;

function atlasTargetCount(atlas: Extract<MapAtlasEvidence, { status: "available" }>): number {
  const { capabilities } = atlas;
  return (
    capabilities.sections.length +
    capabilities.modalSlots.length +
    capabilities.configGroups.length +
    capabilities.contextTabs.length +
    capabilities.chatPositions.length
  );
}

/** WHEN the whole atlas is worth its 2.1 KB (#1372): when it was asked for, and when it is NEWS — the
 *  first map of a named session, or one taken after the section changed under it. Everything else is a
 *  reprint of what the caller's previous call already said, and it is one flag away. */
export function atlasIsNews(opts: Args, atlas: Extract<MapAtlasEvidence, { status: "available" }>): boolean {
  if (opts.atlas) {
    return true;
  }
  const session = opts.session;
  if (session === null) {
    return false;
  }
  const section = atlas.place.section;
  const previous = lastAtlasFor;
  lastAtlasFor = { session, section };
  return previous === null || previous.session !== session || previous.section !== section;
}

/** The one line that replaces the block: every count a reader needs to know whether the full list is
 *  worth a call, plus the flag that prints it. */
export function atlasSummaryLine(atlas: Extract<MapAtlasEvidence, { status: "available" }>): string {
  const { capabilities, place } = atlas;
  return `atlas: ${String(atlasTargetCount(atlas))} SPA targets (${String(capabilities.sections.length)} sections, ${String(capabilities.modalSlots.length)} modals, ${String(capabilities.configGroups.length)} settings, ${String(capabilities.contextTabs.length)} context tabs, ${String(capabilities.chatPositions.length)} chat positions) at section=${place.section ?? "(unpublished)"} — list them with --map --atlas`;
}

/** Exported for the unit pin: the module state below makes the session arm untestable through a one-shot
 *  CLI, and the decision is the whole point of the change. */
export function resetAtlasSessionMemory(): void {
  lastAtlasFor = null;
}

function printAtlas(atlas: MapAtlasEvidence | null, error: string | null): void {
  print("\n--- SPA NAV TARGETS ---");
  if (error !== null) {
    print(`  MAP INSTRUMENT ERROR: ${error}`);
    return;
  }
  if (atlas === null) {
    print("  MAP INSTRUMENT ERROR: navigation atlas produced no evidence");
    return;
  }
  if (atlas.status === "unavailable") {
    print(`  NAV TARGETS unavailable — ${atlas.reason}`);
    return;
  }
  const { capabilities, place } = atlas;
  print(`  CURRENT url=${place.url} section=${place.section ?? "(unpublished)"} chat-open=${String(place.chatOpen)} focus=${String(place.focus)}`);
  printGroup("SECTIONS", capabilities.sections, (value) => command("--goto", value));
  printGroup("MODALS", capabilities.modalSlots, (value) => command("--goto", `modal:${value}`));
  printGroup("CONFIG GROUPS", capabilities.configGroups, (value) => command("--goto", `config:${value}`));
  printGroup(
    "CONTEXT TABS",
    capabilities.contextTabNames.map((entry) => `${entry.id}\u0000${entry.label}`),
    (value) => {
      const [id, label] = value.split("\u0000");
      return `${command("--context-tab", id ?? "")}  label=${JSON.stringify(label ?? "")}`;
    },
  );
  printGroup("CHAT POSITIONS", capabilities.chatPositions, (value) => command("--open-chat", value));
  print('  LOOKUP chat       pnpm snap --open-chat "<id-or-title>" --map');
  print('  LOOKUP character  pnpm snap --open-character "<id-or-name>" --map');
  print('  SHELL controls    pnpm snap --panel "list=docked" --map | --panel "context=collapsed" --map | --focus on --map');
  print("  WORKFLOW choose a NAV TARGET, then map that settled destination; add --session <name> to continue in one browser lifetime.");
}

function rectText(shell: Extract<MapShellEvidence, { status: "available" }>["regions"][number]): string {
  const rect = shell.rect;
  return rect === null ? "none" : `${rect.x.toFixed(0)},${rect.y.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
}

function printShell(shell: MapShellEvidence | null, error: string | null): void {
  print("\n--- CURRENT SHELL / REGIONS ---");
  if (error !== null) {
    print(`  MAP INSTRUMENT ERROR: ${error}`);
    return;
  }
  if (shell === null) {
    print("  shell unavailable because the atlas instrument failed");
    return;
  }
  if (shell.status === "unavailable") {
    print(`  SHELL unavailable — ${shell.reason}`);
    return;
  }
  print(
    `  regime=${shell.regime} viewport=${String(shell.viewport.width)}x${String(shell.viewport.height)} dpr=${String(shell.viewport.devicePixelRatio)} section=${shell.section} section-label=${shell.sectionLabel ?? "(unpublished)"} content=${shell.contentIdentity ?? "(unnamed)"} chat-open=${String(shell.chatOpen)} focus=${String(shell.focus)}`,
  );
  print(`  active-tab=${shell.activeContextTab ?? "none"} relation=${shell.contextRelation}`);
  for (const region of shell.regions) {
    print(
      `  ${region.id} mounted=${String(region.mounted)} available=${region.available === null ? "n/a" : String(region.available)} mode=${region.mode ?? "n/a"} rect=${rectText(region)} position=${region.position ?? "n/a"} z=${region.zIndex ?? "n/a"} visible=${String(region.visible)} inert=${String(region.inert)} identity=${region.identity ?? "(unnamed)"}`,
    );
  }
}

function stateText(entry: MapEntry): string {
  if (entry.visibility === "hidden") {
    return `visibility=hidden inactive=${entry.inactiveReason} actionability=locator-only`;
  }
  const facts = ["visibility=visible"];
  if (entry.state.disabled !== null) {
    facts.push(`disabled=${String(entry.state.disabled)}`);
  }
  if (entry.state.current !== null) {
    facts.push(`current=${entry.state.current}`);
  }
  if (entry.state.checked !== null) {
    facts.push(`checked=${String(entry.state.checked)}`);
  }
  if (entry.state.expanded !== null) {
    facts.push(`expanded=${String(entry.state.expanded)}`);
  }
  facts.push(`actionability=${entry.actionability}`);
  return facts.join(" ");
}

function printSurface(opts: Args, entries: readonly MapEntry[] | null, error: string | null): void {
  if (entries === null && error === null) {
    return;
  }
  if (error !== null) {
    print(`\n--- SURFACE MAP (scope=${opts.mapSelector}) ---`);
    print(`  MAP capture failed: ${error}`);
    return;
  }
  const list = entries ?? [];
  const fallbackCount = list.filter((entry) => entry.source === "dom").length;
  print(`\n--- SURFACE MAP (scope=${opts.mapSelector}, ${String(list.length)} element(s), ${String(fallbackCount)} DOM fallback(s)) ---`);
  for (const entry of list.slice(0, SURFACE_CAP)) {
    const name = entry.name.length > NAME_CAP ? `${entry.name.slice(0, NAME_CAP - 1)}…` : entry.name;
    print(`  ${entry.role}  "${name}"  locator=${entry.selector}  [${entry.source}; ${stateText(entry)}]`);
  }
  if (list.length > SURFACE_CAP) {
    print(`  … +${String(list.length - SURFACE_CAP)} more — scope with --map <selector>`);
  }
  print("  NOTE: one selector engine per target — never concatenate a CSS selector with a role= selector.");
  print("  NOTE: only actionability=actionable is a current interaction handle; locator-only rows are orientation/inventory evidence.");
}

export interface MapBlockInput {
  readonly opts: Args;
  readonly atlas: MapAtlasEvidence | null;
  readonly atlasError: string | null;
  readonly shell: MapShellEvidence | null;
  readonly shellError: string | null;
  readonly entries: readonly MapEntry[] | null;
  readonly surfaceError: string | null;
}

export function printMapBlock({ opts, atlas, atlasError, shell, shellError, entries, surfaceError }: MapBlockInput): void {
  if (atlas === null && atlasError === null && shell === null && shellError === null && entries === null && surfaceError === null) {
    return;
  }
  // The atlas is the APP's inventory, not this surface's: it prints in full when it was asked for or when
  // it is news to this session, and as one line otherwise (#1372). A refusal or an instrument error is
  // never collapsed — that is the run failing to answer, and it always prints.
  if (atlas !== null && atlasError === null && atlas.status === "available" && !atlasIsNews(opts, atlas)) {
    print(`\n${atlasSummaryLine(atlas)}`);
  } else {
    printAtlas(atlas, atlasError);
  }
  printShell(shell, shellError);
  printSurface(opts, entries, surfaceError);
}
