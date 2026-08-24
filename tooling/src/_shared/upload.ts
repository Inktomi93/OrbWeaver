// The ONE file-input driving vocabulary (#651) — shared because TWO probes need it: `snap --upload`
// (the plugin install/consent screen is otherwise structurally invisible to the whole rendered-probe
// fleet) and `design-audit --upload` (its census over that same surface was a FALSE CLEAN — taken with
// no bundle picked, i.e. against an empty dropzone). One boundary, one real-DOM-shape resolution, both
// tools speak it identically — the multi-consumer signal that promotes plumbing out of a single tool's
// `ops/`, same reasoning as `_shared/nav.ts`.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import type { Locator } from "@playwright/test";
import { REPO_ROOT } from "./artifacts.ts";

/** THE PATH BOUNDARY (issue #651's own hazard): `--upload` reaches real files on disk, so its reach is
 *  bounded on purpose to the two places a fixture legitimately lives — the repo tree, and the OS tmp dir
 *  (every agent scratchpad lives there). A probe that can upload ARBITRARY local files is a different,
 *  riskier tool than one that can upload a fixture; this line is what keeps it the latter. Anything
 *  outside those roots is refused LOUDLY (the exact resolved path, named) rather than silently skipped —
 *  see each caller's `--help` for the caller-facing spelling of this rule. */
function withinUploadBoundary(absPath: string): boolean {
  return [REPO_ROOT, tmpdir()].some((root) => absPath === root || absPath.startsWith(`${root}/`));
}

export type UploadPathResolution = { readonly ok: true; readonly paths: readonly string[] } | { readonly ok: false; readonly reason: string };

/** Resolve every `--upload` path against the CWD the operator typed it in (same convention as snap's
 *  `--file`, `ops/guards.ts`'s `fileTarget`), then gate each one on the boundary + existence. The FIRST
 *  failure refuses the whole step — a partially-attached multi-file upload would be a worse silent
 *  surprise than refusing up front. */
export function resolveUploadPaths(raw: readonly string[]): UploadPathResolution {
  const resolved: string[] = [];
  for (const p of raw) {
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    if (!withinUploadBoundary(abs)) {
      return { ok: false, reason: `--upload path outside the repo/scratchpad boundary: ${abs} (allowed roots: ${REPO_ROOT}, ${tmpdir()})` };
    }
    if (!existsSync(abs)) {
      return { ok: false, reason: `--upload no such file: ${abs}` };
    }
    resolved.push(abs);
  }
  return { ok: true, paths: resolved };
}

/** THE REAL-DOM-SHAPE FIX (#651's own hazard: "a dropzone is often not an `<input type=file>`"). Every
 *  upload primitive in this app (`FileDropzone`, `FileTrigger`, `FolderPicker`) covers a real, ATTACHED
 *  `<input type="file">` with non-interactive decorative chrome — the accessible pattern that keeps
 *  keyboard/SR operation genuine (Tab focuses the real input; the wrapper is `data-slot="file-dropzone"`,
 *  never the control). An operator selector routinely names that wrapper, not the input Playwright's
 *  `setInputFiles` requires — so drill to the first descendant file input when the given selector isn't
 *  one itself; a selector already ON an input passes through untouched.
 *
 *  WHAT THIS DOES NOT REACH (stated so the caller knows the count, not just the shape): a surface with NO
 *  backing `<input>` at all — the chat composer's raw drag/paste `DataTransfer` listener
 *  (`use-stray-file-drop-guard.ts`) is the one such surface in this app; every FileDropzone/FileTrigger/
 *  FolderPicker call site (character/chat/preset import, avatar upload, background upload, databank
 *  add-document, workloads import-library, and the plugin install card this row exists for) is reached. */
export async function resolveFileInputLocator(loc: Locator): Promise<Locator> {
  const isFileInput = await loc
    .evaluate((el) => {
      const node = el as unknown as { tagName: string; getAttribute: (name: string) => string | null };
      return node.tagName === "INPUT" && node.getAttribute("type") === "file";
    })
    .catch(() => false);
  if (isFileInput) {
    return loc;
  }
  const nested = loc.locator('input[type="file"]');
  return (await nested.count()) > 0 ? nested.first() : loc;
}
