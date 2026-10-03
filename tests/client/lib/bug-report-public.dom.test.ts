// The production "Report a bug" outputs. A report goes to a PUBLIC issue, so the pins that matter are the
// canary ones: seed every input the page holds with chat, persona and card text, keys, tokens, hosts and paths,
// run the real ring and the real builder, and prove none of it reaches the summary, the issue link or the
// downloaded bundle — while the user's own words, which they typed for this, do.

import { readFileSync } from "node:fs";
import type { BugReportDiagnostics } from "@orb/contracts/diagnostics";
import { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import { beforeEach, describe } from "vitest";
import { parse } from "yaml";
import type { PublicBugReportInput } from "../../../packages/client/src/lib/bug-report-public.ts";
import {
  BUG_REPORT_ISSUE_FIELDS,
  BUG_REPORT_ISSUE_TEMPLATE,
  BUG_REPORT_ISSUE_URL_MAX,
  browserNameOf,
  buildPublicBugReport,
  osNameOf,
  publicBugReportIssueUrl,
} from "../../../packages/client/src/lib/bug-report-public.ts";
import { __resetSafeErrorRing, recordSafeError, safeErrorRing } from "../../../packages/client/src/lib/safe-error-ring.ts";
import { expect, test } from "../../support/fixtures.ts";

const ORIGIN = "http://192.0.2.10:8788";
const NOW = 1_790_000_000_000;
const MINUTE = 60_000;
const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const CANARIES = {
  chat: "canarychatline the lantern-keeper whispered",
  persona: "canarypersonatext with a long backstory",
  card: "canarycardtext from the character description",
  apiKey: "sk-or-v1-canaryapikey0123456789abcdef",
  session: "canarySessionToken_Q3n-x9Zk2pLmA8rT0vWy",
  host: "canary-host.example",
  homePath: "/home/canaryuser/orbweaver",
  invite: "canaryinvitetoken0123",
} as const;

const USER_TEXT = "The roster pane painted empty after I renamed a character.";

function canaryError(): Error {
  const error = new TypeError(`${CANARIES.chat} ${CANARIES.persona} ${CANARIES.apiKey}`);
  error.stack = [
    `TypeError: ${CANARIES.card}`,
    `    at renderRow (${ORIGIN}/assets/index-abc123.js:12:345)`,
    `    at track (https://${CANARIES.host}/t.js:1:1)`,
    `    at load (file://${CANARIES.homePath}/x.ts:2:2)`,
  ].join("\n");
  return error;
}

/** Seed the REAL ring the way the browser would: console arguments carrying chat and persona text and a
 *  credential, an uncaught Error and a rejection, all on a page whose path carries an invite token. */
function seedRing(): void {
  const context = { at: NOW - MINUTE, origin: ORIGIN, pathname: `/chats/${CANARIES.invite}` };
  recordSafeError("console", [`Failed to render ${CANARIES.chat}`, { persona: CANARIES.persona, cookie: CANARIES.session }], context);
  recordSafeError("uncaught", [canaryError()], context);
  recordSafeError("rejection", [CANARIES.card], context);
}

const DIAGNOSTICS: BugReportDiagnostics = {
  runtime: { node: "v26.3.0", platform: "linux", arch: "x64", authMode: "local" },
  serverErrors: {
    kind: "included",
    held: 3,
    records: [{ at: NOW - MINUTE, source: "chat bus", event: null, errorType: "LibsqlError", code: "SQLITE_BUSY", procedure: "chat.send" }],
  },
};

function input(overrides: Partial<PublicBugReportInput> = {}): PublicBugReportInput {
  return {
    whatHappened: USER_TEXT,
    when: "~5 minutes ago",
    window: resolveEvidenceWindow(NOW, 5),
    server: { version: { version: "0.9.0", commit: "a".repeat(40), short: "a".repeat(12), source: "container", channel: "stable" }, diagnostics: DIAGNOSTICS },
    browser: {
      userAgent: CHROME_UA,
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      maxTouchPoints: 0,
      pointerCoarse: false,
      prefersReducedMotion: false,
    },
    pathname: `/chats/${CANARIES.invite}?code=${CANARIES.session}`,
    browserErrors: safeErrorRing(),
    ...overrides,
  };
}

/** Every output a report produces, as the strings that leave the page. */
function outputsOf(report: ReturnType<typeof buildPublicBugReport>): readonly string[] {
  const { url } = publicBugReportIssueUrl(report);
  return [report.title, report.summary, report.diagnostics, JSON.stringify(report.bundle), url, decodeURIComponent(url.replaceAll("+", " "))];
}

beforeEach(() => {
  __resetSafeErrorRing();
});

describe("buildPublicBugReport — nothing private leaves the page", () => {
  test("no seeded canary reaches the summary, the issue link or the bundle", () => {
    seedRing();
    const outputs = outputsOf(buildPublicBugReport(input()));
    for (const output of outputs) {
      for (const [name, canary] of Object.entries(CANARIES)) {
        expect(output, name).not.toContain(canary);
      }
      expect(output).not.toContain("canaryuser");
    }
  });

  test("positive control: the user's words and the safe facts DO arrive", () => {
    seedRing();
    const report = buildPublicBugReport(input());
    expect(report.summary).toContain(USER_TEXT);
    expect(report.title).toBe(`bug: ${USER_TEXT}`);
    expect(report.summary).toContain("v0.9.0");
    expect(report.summary).toContain("Node v26.3.0 on linux/x64");
    expect(report.summary).toContain("Chrome 149 on Linux");
    expect(report.summary).toContain("renderRow@/assets/index-abc123.js:12:345");
    expect(report.summary).toContain("chat bus, LibsqlError, SQLITE_BUSY, chat.send");
    expect(report.bundle.page.section).toBe("chats");
    expect(report.bundle.browserErrors.records).toHaveLength(3);
  });

  test("errors outside the window the user picked are left out", () => {
    recordSafeError("uncaught", [new TypeError("x")], { at: NOW - 30 * MINUTE, origin: ORIGIN, pathname: "/" });
    expect(buildPublicBugReport(input()).bundle.browserErrors).toEqual({ records: [], held: 1, dropped: 0 });
  });

  test("a non-owner's report says the server errors are the owner's, and a silent server says it did not answer", () => {
    expect(buildPublicBugReport(input({ server: { version: null, diagnostics: { ...DIAGNOSTICS, serverErrors: { kind: "owner-only" } } } })).summary).toContain(
      "only the server's owner can include these",
    );
    const silent = buildPublicBugReport(input({ server: { version: null, diagnostics: null } }));
    expect(silent.bundle.serverErrors.kind).toBe("unavailable");
    expect(silent.summary).toContain("the server did not answer");
  });
});

describe("publicBugReportIssueUrl — the size limit", () => {
  test("a report that fits opens the app form with both fields filled exactly", () => {
    const report = buildPublicBugReport(input());
    const { url, truncated } = publicBugReportIssueUrl(report);
    expect(truncated).toBe(false);
    expect(url.length).toBeLessThanOrEqual(BUG_REPORT_ISSUE_URL_MAX);
    const params = new URL(url).searchParams;
    expect(params.get("template")).toBe(BUG_REPORT_ISSUE_TEMPLATE);
    expect(params.get(BUG_REPORT_ISSUE_FIELDS.whatHappened)).toBe(USER_TEXT);
    expect(params.get(BUG_REPORT_ISSUE_FIELDS.diagnostics)).toBe(report.diagnostics);
  });

  test("a report too long for a link is cut to fit, says so in the issue, and the clipboard summary stays whole", () => {
    const long = `${"The scene froze while the card rendered. ".repeat(400)}END-OF-REPORT`;
    seedRing();
    const report = buildPublicBugReport(input({ whatHappened: long }));
    const { url, truncated } = publicBugReportIssueUrl(report);
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(BUG_REPORT_ISSUE_URL_MAX);
    const sent = new URL(url).searchParams.get(BUG_REPORT_ISSUE_FIELDS.whatHappened) ?? "";
    expect(sent).toContain("The full report is on your clipboard.");
    expect(long.startsWith(sent.slice(0, sent.indexOf("\n\n[Cut")))).toBe(true);
    expect(sent).not.toContain("END-OF-REPORT");
    expect(report.summary).toContain("END-OF-REPORT");
  });

  test("the cut stays under the limit for any length the user can type", () => {
    for (const length of [3500, 3900, 4100, 20_000]) {
      const report = buildPublicBugReport(input({ whatHappened: "ü".repeat(length) }));
      expect(publicBugReportIssueUrl(report).url.length, String(length)).toBeLessThanOrEqual(BUG_REPORT_ISSUE_URL_MAX);
    }
  });
});

test("the issue form the link names exists, and its field ids are the ones the link fills", () => {
  const form = parse(readFileSync(new URL(`../../../.github/ISSUE_TEMPLATE/${BUG_REPORT_ISSUE_TEMPLATE}`, import.meta.url), "utf8")) as {
    readonly body: readonly { readonly id?: string }[];
  };
  const ids = form.body.map((field) => field.id).filter((id): id is string => id !== undefined);
  expect(ids).toEqual([BUG_REPORT_ISSUE_FIELDS.whatHappened, BUG_REPORT_ISSUE_FIELDS.diagnostics]);
});

test("browser and OS names come from a closed list", () => {
  expect(browserNameOf(CHROME_UA)).toBe("Chrome 149");
  expect(osNameOf(CHROME_UA)).toBe("Linux");
  expect(browserNameOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Firefox 140");
  expect(osNameOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Windows");
  expect(
    browserNameOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
  ).toBe("Safari 18");
  expect(osNameOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("iOS");
  expect(browserNameOf("curl/8.0")).toBe("Other browser");
});
