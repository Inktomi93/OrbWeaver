---
kind: spec
status: active
updated: 2026-07-03
---

# 04 — `infra/extraction`: the vendored text-extraction loader (full spec)

> **Status: COMMITTED (D49 item 5) — prescriptive design.** A NEW db-free, domain-free infra
> adapter in the `infra/storage`/`infra/image` class. ONE injected op, one error pair, one version
> constant. **This is the build's LONG POLE** (§6) — everything else proceeds against the
> passthrough loaders while pdf lands. ST evidence: extraction is CLIENT-side in ST
> (`utils.js:2029–2102`); orbweaver extracts server-side (the client is sealed/thin), so this is
> net-new infra, not a port.

---

## 1. The ONE op (contract in `@orb/contracts/extraction`)

Cross-boundary home decision: the op TYPE + result + errors live in **`@orb/contracts/extraction`**
— infra implements, `domain/databank` injects. WHY: the exact `EmbedRequest`/`EmbedResult`
precedent (`@orb/contracts/providers`) — a domain must never import `infra/*` for a type, and the
client needs the error identities to render "unsupported type" vs "extraction failed" distinctly.
REJECTED: defining the errors in `domain/databank/contract/errors.ts` (infra would have to import
a domain to throw them — an upward reach); REJECTED: infra-local types with a domain re-declaration
(the §7.4 duplicate-shape disease).

```ts
// @orb/contracts/extraction

export const DOC_FORMATS = ["pdf", "html", "markdown", "text", "docx", "epub"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export interface ExtractionMeta {
  format: DocFormat;
  extractorVersion: string; // EXTRACTOR_VERSION at run time — stamped onto documents.extractorVersion
  charCount: number; // text.length (convenience; saves a re-measure at every consumer)
  pageCount?: number; // pdf only
  title?: string; // html <title> / epub package metadata / pdf info-dict title, when present
}

export interface ExtractionResult {
  text: string; // UTF-8 clean, newlines normalized to \n, NFC-normalized (§2 rules)
  meta: ExtractionMeta;
}

/** The injected op. bytes = the original source bytes (from the CAS or the in-flight upload);
 *  mime = the DECLARED mime (the sniff belt already ran at assets.store — doc 02 §6). */
export type ExtractTextOp = (bytes: Uint8Array, mime: string) => Promise<ExtractionResult>;

/** mime maps to no loader. Thrown BEFORE any parse. User-fixable; transport maps it to a
 *  415-class error; NEVER retried; NEVER wrapped in ExtractionFailedError. */
export class UnsupportedDocTypeError extends Error {
  constructor(readonly mime: string) {
    super(`unsupported document type: ${mime}`);
    this.name = "UnsupportedDocTypeError";
  }
}

/** A supported format's loader threw (corrupt/encrypted/invalid file, or a loader bug).
 *  Carries the format + the underlying cause. Retryable only in the sense that a FUTURE
 *  extractor version may succeed (the re-extract sweep); an immediate retry is pointless. */
export class ExtractionFailedError extends Error {
  constructor(
    readonly format: DocFormat,
    options?: { cause?: unknown },
  ) {
    super(`extraction failed for format: ${format}`, options);
    this.name = "ExtractionFailedError";
  }
}
```

**Error taxonomy semantics (the load-bearing split):** `UnsupportedDocTypeError` means the CALLER
sent something the system does not do — the upload verb surfaces it before creating ANY row or CAS
blob (fail fast, nothing to clean up). `ExtractionFailedError` means the system accepted the type
and could not deliver — the upload verb also aborts row creation (extractedText is NOT NULL canon;
there is no "document without text" state — REJECTED: a text-less pending document row, which
would poison every downstream NOT NULL assumption for a corrupt-file edge case). The bytes are
NOT persisted on failure; the user re-uploads a fixed file.

**Empty-text is NOT an error:** an image-only (scanned, no OCR) PDF extracts to near-empty text.
The op returns it truthfully (`charCount` tells the story); the upload verb surfaces a
`warning`-class result, not a throw — the user decides. REJECTED: erroring on empty (guesses user
intent; OCR is out of scope and the honest result is "we found no text").

---

## 2. The per-format loader table

| Format | mime(s) | Library (vendored) | Per-format notes |
|---|---|---|---|
| `pdf` | `application/pdf` | **pdfjs-dist** (Apache-2.0) | server-side worker-less config (`disableWorker`, no DOM canvas — text content only). Per-page `getTextContent()`, items joined with spaces per line, lines per page joined `\n`, pages joined `\n\n`. `pageCount` from the document. Encrypted PDFs → `ExtractionFailedError`. No OCR (empty text is truthful, §1). THE fiddly integration — the long pole's core. |
| `html` | `text/html` | **html-to-text** (MIT) | v1 loader: script/style stripped, block elements → newlines, links → text. `title` from `<title>`. **LEAN:** if scraped-page boilerplate (nav/footer noise) measurably pollutes retrieval, add a Readability-on-jsdom article-isolation PASS in front of the same loader — criterion: retrieval-quality complaints traceable to nav text in chunks. REJECTED for v1: Readability+jsdom (a full DOM implementation vendored for a quality delta unproven at our inputs; ST uses Readability client-side where the DOM is free — server-side it is not). |
| `markdown` | `text/markdown` | passthrough | UTF-8 decode + normalization (§ rules below). Markdown syntax is KEPT verbatim (headings/lists are retrieval-useful structure; the chunker splits on the blank lines markdown already has). REJECTED: md→plaintext rendering (destroys structure the embedder can use, adds a dep). |
| `text` | `text/plain` | passthrough | UTF-8 decode + normalization. |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | **mammoth** (BSD-2-Clause) — FAST-FOLLOW | raw-text mode (`extractRawText`), paragraphs joined `\n\n`. Vendoring LEAN gate in §5. |
| `epub` | `application/epub+zip` | **jszip** (MIT) + spine walk — FAST-FOLLOW | unzip → parse OPF spine order → run each XHTML chapter through the SAME html loader → chapters joined `\n\n`. `title` from the OPF metadata. (ST uses epub.js+jszip in-browser; server-side the rendering half of epub.js is dead weight — jszip + the html loader is the same output with one fewer dep.) |

**Normalization rules (all loaders, applied to `text` before return):** decode strictly as UTF-8
(`TextDecoder('utf-8', { fatal: true })` for the text family — invalid bytes →
`ExtractionFailedError`); CRLF/CR → `\n`; unicode NFC-normalize; strip a UTF-8 BOM; collapse 3+
consecutive blank lines to one blank line (keeps the chunker's `\n\n` boundary meaningful without
rewriting content); NO trimming inside lines, NO case folding — the text is canon.

**Dispatch:** a `MIME_TO_FORMAT: Record<string, DocFormat>` lookup (exact mime match after
parameter stripping, e.g. `text/html; charset=utf-8` → `text/html`); a miss throws
`UnsupportedDocTypeError`. The format→loader dispatch is a `{ [F in DocFormat]: Loader }`
mapped-type Record (the §7.5 gold standard) — adding a `DocFormat` member without a loader is a
`tsc` error.

---

## 3. Layout + gates

```
infra/extraction/
├── index.ts        createExtractText(): ExtractTextOp   (the factory entry/compose wires)
│                   + re-exports EXTRACTOR_VERSION
├── formats.ts      MIME_TO_FORMAT + the LOADERS mapped-type Record
├── version.ts      EXTRACTOR_VERSION (§4)
├── normalize.ts    the §2 normalization pipeline (shared by all loaders)
└── loaders/
    ├── pdf.ts      html.ts      textlike.ts     (v1)
    └── docx.ts     epub.ts                      (fast-follow)
```

- **db-free + domain-free:** imports NOTHING from `@orb/db` or `domain/*`. Enforcers: dep-cruiser
  `infra-no-db` + `infra-no-domain` (the existing rules — this package is just a new subject).
- The domain receives the op via `DatabankContext.extractText` (wired at `entry/compose`); the
  domain's only compile-time dependency is `@orb/contracts/extraction`.
- **Determinism scope:** within ONE `EXTRACTOR_VERSION`, same bytes → same text (fixture golden
  tests pin it). ACROSS versions output may change — that is exactly what `extractorVersion` +
  the re-extract sweep exist for; extraction is deliberately NOT held to the kit-purity bar
  (it is infra: vendored libs evolve).

---

## 4. `EXTRACTOR_VERSION` — the re-extract trigger

```ts
// version.ts
/** Bump on ANY change that can alter extraction OUTPUT for already-supported formats:
 *  a loader-lib upgrade, a normalization change, a per-format join-rule change.
 *  Adding a NEW format does NOT require a bump (existing documents are unaffected). */
export const EXTRACTOR_VERSION = "1";
```

ONE global version, not per-format. WHY: the consumer predicate is "is this document's extraction
current?" — a single string compare; per-format versions buy finer re-extract granularity at the
cost of a version MAP stamped per row and a format-aware sweep, for an event (a loader upgrade)
that is rare and cheap to over-apply. REJECTED: per-format versions (complexity without a driving
frequency); REJECTED: hashing the extractor code (magic, unreviewable bumps). The sweep itself
(`databank-reindex` `mode:'re-extract'`) is doc 06 §4; `origin:'text'` rows stamp `"none"` and are
excluded (nothing to re-extract).

---

## 5. Vendoring vetting (the LEAN, with its criterion)

**LEAN: vendor `mammoth` (docx) and `jszip` (epub) as fast-follows; pdfjs-dist + html-to-text are
committed for v1.** The acceptance criterion per dependency (verify before the fast-follow lands,
can run in parallel with everything):

1. license is MIT/BSD/Apache-class (pdfjs Apache-2.0 ✓, html-to-text MIT ✓, mammoth BSD-2 ✓,
   jszip MIT ✓ — re-verify at the pinned version);
2. pure JS, zero native bindings (no node-gyp);
3. installed size adds < ~3 MB per package to `@orb/server`;
4. a release or maintained fork within the last 24 months.

A candidate failing the gate → the format stays unsupported (`UnsupportedDocTypeError` is the
honest fallback) rather than shipping a liability. Pinned versions + rationale land in
BUILD-PLAN §0 per the stack rule.

---

## 6. The long pole, and what proceeds in parallel

pdfjs server-side is the genuinely fiddly part (worker config, font-less text items, position-order
text assembly). Everything else in the build is INDEPENDENT of it:

- `@orb/kit/chunk` (doc 03) — zero extraction dependency.
- Schema + contracts + the embeddings/search arms (docs 02, 05) — zero.
- `domain/databank` CRUD, junctions, ingest, the chat graft (docs 06, 07) — build and
  integration-test against the **passthrough `textlike` loader** (txt/md uploads exercise the FULL
  pipeline end-to-end: CAS → extract → chunk → embed → retrieve).
- Scrapers (web) — need only the html loader, which is light.

So the dependency-critical order inside DB3 (doc 08) is: `textlike` first (unblocks everything),
`html` second (unblocks scrape-web), `pdf` last within v1. A pdf slip delays ONLY pdf uploads.

---

## 7. Test plan

- **Per-format fixture goldens:** a small committed fixture file per format → expected extracted
  text (byte-exact) + expected meta. Regenerating goldens is only legal alongside an
  `EXTRACTOR_VERSION` bump (a test asserts the pairing by snapshotting the version into the golden).
- **Error-path tests:** unknown mime → `UnsupportedDocTypeError` (and NO loader invoked); truncated
  pdf → `ExtractionFailedError` with `format:'pdf'` and a `cause`; invalid UTF-8 `text/plain` →
  `ExtractionFailedError`; encrypted pdf fixture → `ExtractionFailedError`.
- **Normalization tests:** CRLF fixture → `\n` only; BOM stripped; NFC (a decomposed-form fixture
  normalizes); 5 blank lines collapse to 1.
- **Empty-text truthfulness:** an image-only pdf fixture → `charCount` ≈ 0, NO throw.
- **Gate tests:** dep-cruiser green (`infra-no-db`/`infra-no-domain`); the LOADERS Record is
  exhaustive over `DOC_FORMATS` (tsc, not a runtime test).
