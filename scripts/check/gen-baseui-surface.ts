// Generator for scripts/check/gates/baseui-surface.manifest.json — the SINGLE writer of the Base UI
// surface manifest (GATE-AUTHORING §4.8: the generator is the only thing that writes it, the file is
// committed). It walks the INSTALLED @base-ui/react type surface and emits every component namespace,
// every anatomy part, and every part's own-declared prop names, each part carrying a DISPOSITION — the
// machine half of the anatomy decision ledger (docs/architecture/core/ui-package-design.md holds the
// human half, keyed on the same `Component.Part` string).
//
// DISPOSITIONS ARE CARRIED FORWARD, NEVER RE-DERIVED. A part already adjudicated keeps its disposition and
// its `why` verbatim; a part that is NEW to this run is minted `unresolved` (RED, until a human rules) —
// except when the whole component is unwrapped by @orb/ui, where `n-a` is the only honest verdict and is
// seeded automatically. That is what makes a version bump un-landable without adjudicating the delta:
// regenerate, and every part 1.8 added arrives red.
//
//   node scripts/check/gen-baseui-surface.ts        # rewrite the manifest, print the delta
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { getWorkspace } from "../ts-workspace.ts";
import type { Disposition, InstalledPart, ManifestComponent, ManifestPart, SurfaceManifest } from "./baseui-read.ts";
import { BASE_UI_MANIFEST_REL, blindParts, readInstalledSurface, readManifest, renderedPartsByComponent, truncatedParts } from "./baseui-read.ts";

const NA_WHY =
  "no @orb/ui seal wraps this component — there is no seal for the part to appear in. Ends when a seal is added: regenerate and the parts arrive `unresolved` for adjudication.";

const root = process.cwd();
const surface = readInstalledSurface(root);
if (surface === undefined) {
  process.stderr.write("@base-ui/react is not installed under packages/ui/node_modules — cannot derive the surface.\n");
  process.exit(2);
}

const project = getWorkspace({ root });
const rendered = renderedPartsByComponent(project.getSourceFiles(), surface);
const previous = readManifest(root);

const minted: string[] = [];
const vanished: string[] = [];
const components: Record<string, ManifestComponent> = {};

for (const [name, component] of Object.entries(surface.components)) {
  const priorParts = previous?.components[name]?.parts;
  const wrapped = rendered.has(name);
  const parts: Record<string, ManifestPart> = {};
  for (const [partName, part] of Object.entries(component.parts)) {
    const key = `${name}.${partName}`;
    const prior = priorParts?.[partName];
    // `unresolved` is the ABSENCE of a ruling, not a ruling — so it is never carried forward. Re-seeding it
    // is what lets a part that has since been wired into a seal flip to `exposed` on the next regeneration.
    // (Carrying it forward made `Menu.Viewport` and `Toolbar.Group`/`Link`/`Input` stay unresolved after the
    // seals started rendering them — a ledger row stuck at "nobody has decided" about a decided thing.)
    if (prior !== undefined && prior.disposition !== "unresolved") {
      parts[partName] = { ...part, disposition: prior.disposition, why: prior.why };
      continue;
    }
    minted.push(key);
    parts[partName] = { ...part, ...seed(part, wrapped, (rendered.get(name)?.get(partName)?.length ?? 0) > 0) };
  }
  for (const priorPart of Object.keys(priorParts ?? {})) {
    if (!(priorPart in component.parts)) {
      vanished.push(`${name}.${priorPart}`);
    }
  }
  components[name] = { module: component.module, namespaced: component.namespaced, parts };
}
for (const priorComponent of Object.keys(previous === undefined ? {} : previous.components)) {
  if (!(priorComponent in surface.components)) {
    vanished.push(priorComponent);
  }
}

/** The birth disposition of a part this run has never seen before. Reality seeds the two verdicts that are
 *  FACTS (a rendered part is exposed; an unwrapped component's parts are n-a); the residue — a part of a
 *  component we DO seal that the seal does not render — is the only genuine decision, and it is minted
 *  `unresolved` so a human has to state it. */
function seed(part: InstalledPart, wrapped: boolean, isRendered: boolean): { disposition: Disposition; why: string } {
  if (part.kind !== "part") {
    return { disposition: "n-a", why: "not an anatomy part — a hook/type export has nothing to render." };
  }
  if (isRendered) {
    return { disposition: "exposed", why: "" };
  }
  return wrapped ? { disposition: "unresolved", why: "" } : { disposition: "n-a", why: NA_WHY };
}

// The reader's blindness tripwire, checked BEFORE anything is written: a manifest derived by a resolver
// that learned nothing about a part would hand every downstream gate a confident false green.
const blind = blindParts(surface);
const truncated = truncatedParts(surface);
if (blind.length > 0 || truncated.length > 0) {
  process.stderr.write("the surface reader went blind — refusing to write a manifest it cannot vouch for.\n");
  process.stderr.write(`  learned nothing about: ${blind.join(", ") || "(none)"}\n`);
  process.stderr.write(`  expansion truncated at the depth ceiling: ${truncated.join(", ") || "(none)"}\n`);
  process.exit(2);
}

const manifest: SurfaceManifest = { version: surface.version, components };
const out = join(root, BASE_UI_MANIFEST_REL);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);

const partCount = Object.values(components).reduce((n, c) => n + Object.keys(c.parts).length, 0);
const unresolved = Object.entries(components).flatMap(([n, c]) =>
  Object.entries(c.parts)
    .filter(([, p]) => p.disposition === "unresolved")
    .map(([p]) => `${n}.${p}`),
);
process.stdout.write(`@base-ui/react ${surface.version}: ${Object.keys(components).length} components, ${partCount} exports → ${out}\n`);
process.stdout.write(`minted ${minted.length}${minted.length > 0 ? `: ${minted.join(", ")}` : ""}\n`);
process.stdout.write(`vanished ${vanished.length}${vanished.length > 0 ? `: ${vanished.join(", ")}` : ""}\n`);
process.stdout.write(`unresolved ${unresolved.length}${unresolved.length > 0 ? `: ${unresolved.join(", ")}` : ""}\n`);
