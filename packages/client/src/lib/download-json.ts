// One Blob→objectURL→click JSON exporter (UI-Arch §2.1 `lib/download-json`; carried from neo,
// where the export flow was TRIPLED and two copies revoked the object URL synchronously — the
// exact bug that voids the download in some browsers). D54: `file-saver` is dead; the native
// anchor-click is the 2026 answer. One helper, async revoke, no third copy ever again.

// DOM access rides `globalThis` with self-contained structural types (the view-transition.ts
// pattern): the node typecheck lane follows the lib barrel into this file and has no `dom` lib.
interface Anchorish {
  href: string;
  download: string;
  click: () => void;
}
interface DownloadGlobals {
  readonly document?: {
    readonly createElement: (tag: "a") => Anchorish;
    readonly body: { appendChild: (n: Anchorish) => void; removeChild: (n: Anchorish) => void };
  };
}

const JSON_INDENT = 2;
const REVOKE_DELAY_MS = 100;
const FILENAME_MAX_LEN = 64;
const NON_SLUG_RE = /[^a-z0-9]+/gu;
const EDGE_DASH_RE = /^-+|-+$/gu;

function clickAnchor(href: string, download?: string): void {
  const doc = (globalThis as DownloadGlobals).document;
  if (doc === undefined) {
    return; // no DOM (a non-browser caller) — nothing to click
  }
  const anchor = doc.createElement("a");
  anchor.href = href;
  if (download !== undefined) {
    anchor.download = download;
  }
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
}

/** Serialize `payload` as pretty-printed JSON and download it as `filename`. Pure client work. */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, JSON_INDENT)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  clickAnchor(url, filename);
  // Revoke async so the click can finalize — a synchronous revoke voids the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

/** Download text the SERVER produced, verbatim. Distinct from `downloadJson` (which serializes a
 *  client-side payload and would re-format the bytes): a portable file's bytes are the serde's, so a
 *  file shared one-at-a-time is byte-identical to the same file inside a backup zip. */
export function downloadTextFile(filename: string, text: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  clickAnchor(url, filename);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

/** Download a same-origin URL (the session cookie rides the GET; the server's Content-Disposition
 *  names the file). For server-streamed downloads (the export registrar) — distinct from
 *  `downloadJson`, which serializes a client-side payload. */
export function downloadUrl(href: string, filename?: string): void {
  clickAnchor(href, filename);
}

/** Display name → a safe download filename token. Client-side filename use ONLY — the server's
 *  `slugifyHandle` (the import pairing key) is identity-bearing and deliberately separate. */
export function slugifyFilename(name: string, fallback: string): string {
  const slug = name.toLowerCase().replace(NON_SLUG_RE, "-").replace(EDGE_DASH_RE, "").slice(0, FILENAME_MAX_LEN);
  return slug === "" ? fallback : slug;
}
