// The production "Report a bug" outputs: a public summary for a GitHub issue and a downloadable JSON bundle,
// both built from inputs that already carry no free text except the user's own. Pure and DOM-free, so the
// canary tests drive the whole assembly in node.

import type { BugReportDiagnostics, BugReportServerError } from "@orb/contracts/diagnostics";
import type { EvidenceWindow } from "@orb/kit/evidence-window";
import { sliceByWindow } from "@orb/kit/evidence-window";
import type { VersionIdentity } from "@orb/kit/version-identity";
import { formatVersionIdentity, ORBWEAVER_REPO_URL } from "@orb/kit/version-identity";
import type { SafeErrorRecord, SafeErrorRingRead } from "./safe-error-ring.ts";
import { sectionOfPathname } from "./safe-error-ring.ts";

/** The issue form the link opens (`.github/ISSUE_TEMPLATE/`) and the ids of the two fields it prefills.
 *  @public Test-anchored module surface; the node suite pins them against the form file. */
export const BUG_REPORT_ISSUE_TEMPLATE = "app-report.yml";
/** @public Test-anchored module surface; the node suite pins them against the form file. */
export const BUG_REPORT_ISSUE_FIELDS = { whatHappened: "what-happened", diagnostics: "diagnostics" } as const;

/**
 * The longest issue link this builds. GitHub answers 414 to a request line near 8 KiB, and a signed-out
 * visitor is first sent to the sign-in page with the whole link encoded again inside `return_to`, which can
 * nearly double it. Half the limit keeps both paths open; the full summary always goes to the clipboard.
 *
 * @public Test-anchored module surface; the node suite asserts every link against it.
 */
export const BUG_REPORT_ISSUE_URL_MAX = 4000;

/** The bundle's self-description, so a reader of a downloaded file knows what it is. */
const BUG_REPORT_BUNDLE_FORMAT = "orbweaver-bug-report";
const BUG_REPORT_BUNDLE_FORMAT_VERSION = 1;

const TITLE_PREFIX = "bug: ";
const TITLE_MAX = 72;
const SUMMARY_ERRORS_MAX = 10;
const CUT_NOTE = "\n\n[Cut to fit the link. The full report is on your clipboard.]";
const NOT_AVAILABLE = "not available";
/** `YYYY-MM-DDT` — what `timeOfDay` cuts off an ISO stamp. */
const ISO_DATE_PREFIX_LENGTH = 11;
/** The server-errors arm when the server did not answer at all. */
const SERVER_ERRORS_UNAVAILABLE = "unavailable";

/** What the reader is told the outputs leave out, in both outputs. */
const LEFT_OUT = [
  "chat messages, prompts, personas and character cards",
  "API keys, passwords, tokens, cookies and session ids",
  "error messages, which can quote chat text (each error keeps its type and where in the app's code it happened)",
  "addresses, file paths and the page's query string",
] as const;

/** What the server said about itself, or `null` per half when it did not answer. */
export interface BugReportServerFacts {
  readonly version: VersionIdentity | null;
  readonly diagnostics: BugReportDiagnostics | null;
}

/** The browser facts a rendered defect is usually a function of. */
export interface PublicBrowserFacts {
  readonly userAgent: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  readonly maxTouchPoints: number;
  readonly pointerCoarse: boolean;
  readonly prefersReducedMotion: boolean;
}

export interface PublicBugReportInput {
  /** The user's own words — the one free-text field, included because the user typed it for this. */
  readonly whatHappened: string;
  /** The label of the "when" answer the user picked. */
  readonly when: string;
  readonly window: EvidenceWindow;
  readonly server: BugReportServerFacts;
  readonly browser: PublicBrowserFacts;
  /** The page's pathname; only its section slug is read. */
  readonly pathname: string;
  readonly browserErrors: SafeErrorRingRead;
}

/** The server-error arm of the bundle: the owner's census, the "owner only" answer, or no answer at all. */
interface ServerErrorsSection {
  readonly kind: BugReportDiagnostics["serverErrors"]["kind"] | typeof SERVER_ERRORS_UNAVAILABLE;
  readonly records: readonly BugReportServerError[];
  readonly held: number;
}

interface PublicBugReportBundle {
  readonly format: typeof BUG_REPORT_BUNDLE_FORMAT;
  readonly formatVersion: typeof BUG_REPORT_BUNDLE_FORMAT_VERSION;
  readonly createdAt: string;
  readonly whatHappened: string;
  readonly when: string;
  readonly window: EvidenceWindow;
  readonly version: VersionIdentity | null;
  readonly server: BugReportDiagnostics["runtime"] | null;
  readonly browser: PublicBrowserFacts & { readonly name: string; readonly os: string };
  readonly page: { readonly section: string | null };
  readonly browserErrors: { readonly records: readonly SafeErrorRecord[]; readonly held: number; readonly dropped: number };
  readonly serverErrors: ServerErrorsSection;
  readonly leftOut: readonly string[];
}

export interface PublicBugReport {
  readonly title: string;
  /** The whole report as markdown: the user's words, then the diagnostics. What the clipboard gets. */
  readonly summary: string;
  /** The diagnostics alone, for the issue form's own diagnostics field. */
  readonly diagnostics: string;
  readonly bundle: PublicBugReportBundle;
}

// ── browser and OS names ────────────────────────────────────────────────────────────────────────────────

/** Ordered: a Chromium fork names Chrome too, and every iOS browser names Safari, so the specific tells go first. */
const BROWSER_TELLS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "Edge", re: /Edg(?:e|A|iOS)?\/(?<major>\d+)/u },
  { name: "Opera", re: /OPR\/(?<major>\d+)/u },
  { name: "Firefox", re: /(?:Firefox|FxiOS)\/(?<major>\d+)/u },
  { name: "Chrome", re: /(?:Chrome|CriOS)\/(?<major>\d+)/u },
  { name: "Safari", re: /Version\/(?<major>\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//u },
];

const OS_TELLS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "iOS", re: /iPhone|iPad|iPod/u },
  { name: "Android", re: /Android/u },
  { name: "ChromeOS", re: /CrOS/u },
  { name: "Windows", re: /Windows/u },
  { name: "macOS", re: /Mac OS X|Macintosh/u },
  { name: "Linux", re: /Linux/u },
];

/** A browser name and major version from a user-agent string, from a closed list.
 *  @public Test-anchored module surface; the node suite pins the list. */
export function browserNameOf(userAgent: string): string {
  for (const tell of BROWSER_TELLS) {
    const major = tell.re.exec(userAgent)?.groups?.["major"];
    if (major !== undefined) {
      return `${tell.name} ${major}`;
    }
  }
  return "Other browser";
}

/** An operating-system name from a user-agent string, from a closed list.
 *  @public Test-anchored module surface; the node suite pins the list. */
export function osNameOf(userAgent: string): string {
  return OS_TELLS.find((tell) => tell.re.test(userAgent))?.name ?? "Other OS";
}

// ── the outputs ─────────────────────────────────────────────────────────────────────────────────────────

function isoSeconds(at: number): string {
  return new Date(at).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function timeOfDay(at: number): string {
  return isoSeconds(at).slice(ISO_DATE_PREFIX_LENGTH);
}

function serverErrorsSection(diagnostics: BugReportDiagnostics | null, window: EvidenceWindow): ServerErrorsSection {
  if (diagnostics === null) {
    return { kind: SERVER_ERRORS_UNAVAILABLE, records: [], held: 0 };
  }
  if (diagnostics.serverErrors.kind === "owner-only") {
    return { kind: "owner-only", records: [], held: 0 };
  }
  const slice = sliceByWindow({ source: "server", entries: diagnostics.serverErrors.records, at: (record) => record.at, window, cap: null });
  return { kind: "included", records: slice.entries, held: diagnostics.serverErrors.held };
}

function versionLine(version: VersionIdentity | null): string {
  return version === null ? NOT_AVAILABLE : `${formatVersionIdentity(version)} (${version.source}, ${version.channel} channel)`;
}

function serverLine(runtime: BugReportDiagnostics["runtime"] | null): string {
  return runtime === null
    ? `${NOT_AVAILABLE} (the server did not answer)`
    : `Node ${runtime.node} on ${runtime.platform}/${runtime.arch}, sign-in mode ${runtime.authMode}`;
}

function browserLine(browser: PublicBugReportBundle["browser"]): string {
  const touch = browser.maxTouchPoints > 0 ? "yes" : "no";
  return `${browser.name} on ${browser.os}, ${browser.viewport.width}×${browser.viewport.height} at ${browser.devicePixelRatio}x, touch screen ${touch}, coarse pointer ${browser.pointerCoarse ? "yes" : "no"}, reduced motion ${browser.prefersReducedMotion ? "yes" : "no"}`;
}

function browserErrorLine(record: SafeErrorRecord): string {
  const where = record.frames[0] === undefined ? "" : ` at ${record.frames[0]}`;
  return `  - ${timeOfDay(record.at)} ${record.source} ${record.errorType ?? "non-Error value"}${where}`;
}

function serverErrorLine(record: BugReportServerError): string {
  const facts = [record.source, record.event, record.errorType, record.code, record.procedure].filter((fact): fact is string => fact !== null);
  return `  - ${timeOfDay(record.at)} ${facts.length === 0 ? "unlabelled error" : facts.join(", ")}`;
}

function serverErrorsLines(section: ServerErrorsSection): readonly string[] {
  if (section.kind === SERVER_ERRORS_UNAVAILABLE) {
    return [`- **Server errors:** ${NOT_AVAILABLE}`];
  }
  if (section.kind === "owner-only") {
    return ["- **Server errors:** only the server's owner can include these"];
  }
  return [
    `- **Server errors in the window:** ${section.records.length} (the server holds ${section.held})`,
    ...section.records.slice(0, SUMMARY_ERRORS_MAX).map(serverErrorLine),
  ];
}

function diagnosticsMarkdown(bundle: PublicBugReportBundle, includeErrors: boolean): string {
  const browserErrors = bundle.browserErrors.records;
  const errorLines = includeErrors
    ? [
        `- **Browser errors in the window:** ${browserErrors.length} (messages left out; they can quote chat text)`,
        ...browserErrors.slice(-SUMMARY_ERRORS_MAX).map(browserErrorLine),
        ...serverErrorsLines(bundle.serverErrors),
      ]
    : ["- **Errors:** left out to fit the link; they are in the full report on your clipboard"];
  return [
    `- **When:** ${bundle.when} (reported ${bundle.createdAt})`,
    `- **Version:** ${versionLine(bundle.version)}`,
    `- **Server:** ${serverLine(bundle.server)}`,
    `- **Browser:** ${browserLine(bundle.browser)}`,
    `- **Page:** ${bundle.page.section ?? "home"}`,
    ...errorLines,
    "",
    `Left out on purpose: ${bundle.leftOut.join("; ")}.`,
  ].join("\n");
}

function titleOf(whatHappened: string): string {
  const firstLine = whatHappened.split("\n")[0]?.trim() ?? "";
  const room = TITLE_MAX - TITLE_PREFIX.length;
  return `${TITLE_PREFIX}${firstLine.length > room ? `${firstLine.slice(0, room - 1)}…` : firstLine}`;
}

/** Build both outputs from one input, in one pass. */
export function buildPublicBugReport(input: PublicBugReportInput): PublicBugReport {
  const whatHappened = input.whatHappened.trim();
  const browserErrors = sliceByWindow({
    source: "browser",
    entries: input.browserErrors.records,
    at: (record) => record.at,
    window: input.window,
    cap: null,
  });
  const bundle: PublicBugReportBundle = {
    format: BUG_REPORT_BUNDLE_FORMAT,
    formatVersion: BUG_REPORT_BUNDLE_FORMAT_VERSION,
    createdAt: isoSeconds(input.window.capturedAt),
    whatHappened,
    when: input.when,
    window: input.window,
    version: input.server.version,
    server: input.server.diagnostics?.runtime ?? null,
    browser: { ...input.browser, name: browserNameOf(input.browser.userAgent), os: osNameOf(input.browser.userAgent) },
    page: { section: sectionOfPathname(input.pathname) },
    browserErrors: { records: browserErrors.entries, held: input.browserErrors.records.length, dropped: input.browserErrors.dropped },
    serverErrors: serverErrorsSection(input.server.diagnostics, input.window),
    leftOut: LEFT_OUT,
  };
  const diagnostics = diagnosticsMarkdown(bundle, true);
  return {
    title: titleOf(whatHappened),
    summary: `### What happened\n\n${whatHappened}\n\n### Diagnostics\n\n${diagnostics}\n`,
    diagnostics,
    bundle,
  };
}

function issueUrl(title: string, whatHappened: string, diagnostics: string): string {
  const query = new URLSearchParams({
    template: BUG_REPORT_ISSUE_TEMPLATE,
    title,
    [BUG_REPORT_ISSUE_FIELDS.whatHappened]: whatHappened,
    [BUG_REPORT_ISSUE_FIELDS.diagnostics]: diagnostics,
  });
  return `${ORBWEAVER_REPO_URL}/issues/new?${query.toString()}`;
}

/** The longest prefix of `text` (plus the cut note) whose link still fits, by binary search on its length. */
function fittedText(text: string, fits: (candidate: string) => boolean): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(`${text.slice(0, mid)}${CUT_NOTE}`)) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low)}${CUT_NOTE}`;
}

/**
 * The prefilled issue link, never longer than {@link BUG_REPORT_ISSUE_URL_MAX}. When the whole report does not
 * fit, the error lines go first and then the end of the user's text, each marked in the issue itself; the
 * full summary is what the clipboard carries either way.
 */
export function publicBugReportIssueUrl(report: PublicBugReport, maxLength = BUG_REPORT_ISSUE_URL_MAX): { readonly url: string; readonly truncated: boolean } {
  const whole = issueUrl(report.title, report.bundle.whatHappened, report.diagnostics);
  if (whole.length <= maxLength) {
    return { url: whole, truncated: false };
  }
  const compact = diagnosticsMarkdown(report.bundle, false);
  const fits = (whatHappened: string): boolean => issueUrl(report.title, whatHappened, compact).length <= maxLength;
  if (fits(report.bundle.whatHappened)) {
    return { url: issueUrl(report.title, report.bundle.whatHappened, compact), truncated: true };
  }
  return { url: issueUrl(report.title, fittedText(report.bundle.whatHappened, fits), compact), truncated: true };
}
