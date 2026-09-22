// viewgap: `*View`/`*Summary` FIELDS no client file reads (the field-level `clientgap`).

import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { ContractField, Flags, ViewFieldCandidate } from "../contract/types.ts";
import { emit, narrate } from "../lib/emit.ts";
import { fieldIndexes } from "../lib/fields.ts";
import { exitToolError, noteScope, noteUnits, SKIP_DECLARATION_FILES, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { isTestPath } from "../lib/root.ts";
import { CLIENT_SRC, collectViewFieldCandidates, VIEW_OWNER_HOMES, viewFieldsOf, viewGapHit } from "../lib/view-fields.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** The reader corpus, counted: `packages/client/src` production files. It is a DENOMINATOR, not a scope —
 *  the lens's scan seam counts the OWNER files, and a reader corpus of zero would make every field read as
 *  a gap. Zero here is the blindness tripwire, not a clean sweep. */
function clientReaderCorpus(project: SourceCorpus): number {
  return project.getSourceFiles().filter((sf) => {
    const fp = sf.getFilePath();
    return fp.includes(CLIENT_SRC) && !isTestPath(fp) && !fp.endsWith(".d.ts");
  }).length;
}

/** The STALE side of the `@view-server-only` marker: a tag on a field a client file now DOES read, so the
 *  exemption states nothing. Printed and exit-1 so the marker cannot rot into a permanent lie. */
function printStaleViewMarkers(candidates: readonly ViewFieldCandidate[], flags: Flags): void {
  const stale = candidates.filter((c) => c.exempt && c.clientReaders.length > 0).map(viewGapHit);
  if (stale.length === 0) {
    return;
  }
  narrate(
    flags,
    `viewgap: ${stale.length} STALE \`@view-server-only:\` marker(s) — a file under packages/client/src spells this field now, so the exemption states nothing. Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    narrate(flags, `  ! ${h.file}:${h.line}  [stale-view-server-only]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** Narrow the examined set by the optional scope arg: a field-name substring or an owner-file path. */
function scopedFields(all: readonly ContractField[], arg: string): ContractField[] {
  if (arg === "") {
    return [...all];
  }
  return all.filter((f) => f.name.includes(arg) || f.owner.includes(arg) || f.node.getSourceFile().getFilePath().includes(arg));
}

/** `*View`/`*Summary` fields the client never reads — the tier-6 write↔read pairing (a server-projected
 *  field the UI never renders). Optional scope = a field name / owner name / owner-file path substring;
 *  bare = every view field in `packages/contracts/src` + `packages/server/src`. A deliberate server-only
 *  field carries `// @view-server-only: <reason>`; a marker on a now-client-read field exits 1. */
export function cmdViewGap(project: SourceCorpus, arg: string, flags: Flags): void {
  const files = scanCorpus(project, {
    scope: [...VIEW_OWNER_HOMES],
    label: "path:packages/{contracts,server}/src",
    skip: [SKIP_TEST_FILES, SKIP_DECLARATION_FILES],
  });
  const all = files.flatMap(viewFieldsOf);
  const fields = scopedFields(all, arg);
  noteUnits("view fields", fields.length);
  if (fields.length === 0) {
    exitToolError(
      `ast viewgap: scope "${arg}" matched no \`*View\`/\`*Summary\` field — pass a field name (ttftMs), an owner name (MessageView), an owner-file path (contracts/src/chat), or run bare for all ${all.length}.`,
    );
  }
  const readers = clientReaderCorpus(project);
  noteScope(`client-readers:${readers}`);
  if (readers === 0) {
    exitToolError(
      `ast viewgap: the READER corpus is EMPTY — zero production files under ${CLIENT_SRC} were loaded, so every field would read as unread. This is a broken run (a corpus/glob failure), never a clean sweep.`,
    );
  }
  const candidates = collectViewFieldCandidates(fields, fieldIndexes(project).consumed);
  printStaleViewMarkers(candidates, flags);
  const gaps = candidates.filter((c) => c.clientReaders.length === 0);
  const exempt = gaps.filter((c) => c.exempt).length;
  const owners = new Set(fields.map((f) => f.owner)).size;
  const declaring = new Set(fields.map((f) => f.node.getSourceFile().getFilePath())).size;
  narrate(
    flags,
    `viewgap is a CANDIDATE lens — the field-level half of \`clientgap\`, and it NEVER gates. A hit is a \`*View\`/\`*Summary\` field NO file under packages/client/src spells as a read. READS are the sibling lens's own index (all three property shapes \`x.foo\` / \`x?.foo\` / \`x["foo"]\` plus object destructuring, tests excluded), so the two lenses cannot disagree about what a read is — and they are NAME-matched, never type-resolved, so ANY client file spelling the name absolves the field: this lens UNDER-reports and a hit is strong while a clean run is weak. BLIND SPOTS, stated: a \`{ ...view }\` spread or a whole-object pass to a generic renderer names no key; a computed/template key read is invisible; the reader corpus is packages/client/src ONLY (a field rendered by an @orb/ui primitive under another prop name is out of reach). "Unwired ≠ worthless" (CLAUDE.md "Build the full shape"): a hit is an INTENT question — wire it, mark it, or delete it — never a delete signal. Keep a deliberate one with \`// @view-server-only: <reason>\` on the field; a marker on a field the client now reads is STALE and exits 1 (two-sided). DENOMINATORS: ${fields.length} field(s) across ${owners} owner(s) declared in ${declaring} file(s) (of ${files.length} scanned under packages/{contracts,server}/src), read against ${readers} client production file(s).${exempt === 0 ? "" : ` (${exempt} gap(s) exempted by a reasoned marker.)`}`,
  );
  emit(gaps.filter((c) => !c.exempt).map(viewGapHit), flags, `viewgap ${arg === "" ? "(all *View/*Summary fields)" : arg}`);
}
