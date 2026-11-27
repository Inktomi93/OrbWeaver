// `--text-size` is the browser's own default font size, sent to every page before it navigates. The recording cases need no
// browser; the browser case proves the page's rem moved, and the CLI case proves the RESULT line tells an enlarged run
// from a default one.
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { closeProbeSession } from "../../../../tooling/src/floor/browser/browser.ts";
import { applyTextSize, NO_TEXT_SIZE, textSizeResultValue } from "../../../../tooling/src/snap/lib/text-size.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { launchSnapSession, textSizeFor } from "../../../../tooling/src/snap/ops/session.ts";
import { scaledBudget } from "../../_load-budget.ts";

type TextSizeTarget<P extends { readonly evaluate: (expression: string) => Promise<unknown> }> = Parameters<typeof applyTextSize<P>>[0];

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const SET_FONT_SIZES = "Page.setFontSizes";
const ROOT_FONT_PX = "Number.parseFloat(getComputedStyle(document.documentElement).fontSize)";
const PAGE_HTML = `<!doctype html><html data-app-ready="settled"><body><p>text size plant</p></body></html>`;

interface Sent {
  readonly page: string;
  readonly method: string;
  readonly params: object | undefined;
}

interface StandInPage {
  readonly name: string;
  readonly evaluate: (expression: string) => Promise<unknown>;
}

/** One context over named stand-in pages that report a 16px engine default and whose CDP sessions record every send. */
function recordingTarget(names: readonly string[]): { readonly target: TextSizeTarget<StandInPage>; readonly sent: readonly Sent[] } {
  const sent: Sent[] = [];
  const pages = names.map((name): StandInPage => ({ name, evaluate: () => Promise.resolve(16) }));
  const target: TextSizeTarget<StandInPage> = {
    contexts: [
      {
        context: {
          pages: () => pages,
          newCDPSession: (page) =>
            Promise.resolve({
              send: (method: string, params?: object): Promise<unknown> => {
                sent.push({ page: page.name, method, params });
                return Promise.resolve({});
              },
            }),
        },
      },
    ],
  };
  return { target, sent };
}

test("--text-size sets every page's standard font to the multiple of its engine default, and the RESULT value names the multiple", async () => {
  const { target, sent } = recordingTarget(["first", "second"]);
  const applied = await applyTextSize(target, 2);
  expect(sent.filter((entry) => entry.method === SET_FONT_SIZES)).toEqual([
    { page: "first", method: SET_FONT_SIZES, params: { fontSizes: { standard: 32 } } },
    { page: "second", method: SET_FONT_SIZES, params: { fontSizes: { standard: 32 } } },
  ]);
  expect(applied).toEqual({ scale: 2, defaultFontPx: 16, standardFontPx: 32 });
  expect(textSizeResultValue(applied)).toBe("2x");
});

test("the engine default sends nothing and reads as default, so an enlarged run is the one that differs", async () => {
  const { target, sent } = recordingTarget(["only"]);
  const applied = await applyTextSize(target, NO_TEXT_SIZE);
  expect(sent).toEqual([]);
  expect(textSizeResultValue(applied)).toBe("default");
  expect(textSizeResultValue({ scale: 3, defaultFontPx: 16, standardFontPx: 48 })).not.toBe(textSizeResultValue(applied));
});

test.for(["0", "-1", "abc", "Infinity"])("--text-size %s is refused at parse time, never run as the default", (raw) => {
  expect(parseSnapArgs(["/", "--text-size", raw]).errors.join("\n")).toContain("--text-size expects");
});

test("--text-size 2 doubles the page's rem in a real browser, and a run without it keeps the engine default", { timeout: BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
}) => {
  const root = await plantedTree({ "page.html": PAGE_HTML });
  const rootFontPx = async (argv: readonly string[]): Promise<{ readonly px: number; readonly applied: ReturnType<typeof textSizeFor> }> => {
    const session = await launchSnapSession(parseSnapArgs(["--file", `${root}/page.html`, ...argv]));
    try {
      await session.page.goto(`file://${root}/page.html`);
      return { px: await session.page.evaluate<number>(ROOT_FONT_PX), applied: textSizeFor(session) };
    } finally {
      await closeProbeSession(session);
    }
  };
  const plain = await rootFontPx([]);
  const enlarged = await rootFontPx(["--text-size", "2"]);
  expect(plain.applied).toBeNull();
  expect(enlarged.applied?.scale).toBe(2);
  expect(enlarged.px).toBe(plain.px * 2);
});

test("a run with --text-size 2 prints text-size=2x on its RESULT line, and the control run prints text-size=default", {
  timeout: 2 * BROWSER_TIMEOUT_MS,
}, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": PAGE_HTML });
  const argv = ["--file", `${root}/page.html`, "--no-shot", "--no-deadcss", "--no-failure-evidence"];
  const plain = await runCli("snap", argv, { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(plain).toExitWith(EXIT.clean);
  expect(plain.stdout).toContain("text-size=default");
  const enlarged = await runCli("snap", [...argv, "--text-size", "2"], { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(enlarged).toExitWith(EXIT.clean);
  expect(enlarged.stdout).toContain("text-size=2x");
});
