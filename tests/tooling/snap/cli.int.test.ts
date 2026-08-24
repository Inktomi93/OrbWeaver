// @instrument-proof: plants a WCAG-failing low-contrast paragraph in a local mock and asserts the
// --contrast instrument REDs on it (exit 1, FAIL line) — with the readable twin as the negative control
// proving the instrument is not always-red. `--file` mode: no stack, a real headless chromium.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../support/tool-fixtures.ts";

const BAD_HTML = `<!doctype html><html><body style="background:#8a8a8a">
<p style="color:#7a7a7a;font-size:16px">barely there text</p>
</body></html>`;

const GOOD_HTML = `<!doctype html><html><body style="background:#ffffff">
<p style="color:#111111;font-size:16px">plainly readable text</p>
</body></html>`;

const BROWSER_TIMEOUT_MS = 60_000;

test("the contrast instrument REDs on a planted WCAG failure (and stays green on the readable twin)", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "bad.html": BAD_HTML, "good.html": GOOD_HTML });
  const bad = await runCli("snap", ["--file", `${root}/bad.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(bad.stdout).toContain("FAIL");
  await expect(bad).toExitWith(EXIT.violations);
  const good = await runCli("snap", ["--file", `${root}/good.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(good.stdout).toContain("PASS");
  await expect(good).toExitWith(EXIT.clean);
});

// @instrument-absence-proof: the --contrast SELECTOR matches NOTHING (the measurement population is empty),
// which must report NOT FOUND and FAIL — never "0 contrast failures, PASS". snap was the ONE instrument the
// #409 sweep left without this proof: the refusal lives in ops/contrast.ts (`NOT FOUND`, failed: true) and
// nothing pinned it, so a selector that silently stopped matching after a rename would have read as clean.
test("a --contrast selector that matches NOTHING is a refusal, never a clean zero", { timeout: BROWSER_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "good.html": GOOD_HTML });
  const res = await runCli("snap", ["--file", `${root}/good.html`, "--contrast", "section.does-not-exist", "--text", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("NOT FOUND");
  expect(res.stdout).not.toContain("PASS");
  await expect(res).toExitWith(EXIT.violations);
});

test("CLI misuse refuses before any browser boots (exit 3 posture is the parse contract)", async ({ runCli }) => {
  const res = await runCli("snap", ["--viewport", "banana", "--no-failure-evidence"]);
  expect(res.stdout).toContain("ARG ERROR");
  await expect(res).toExitWith(EXIT.misuse);
});

// ── --upload (#651) ──────────────────────────────────────────────────────────
// snap had NO file-input step, so every file-gated surface (the plugin install/consent screen,
// character/chat/preset import, avatar upload) was structurally invisible to the entire rendered-probe
// fleet — a side-eye lane had to hand-feed a live dropzone with an in-page DataTransfer via --eval to
// review it at all, and design-audit reported CLEAN on the surface it never actually rendered. Pinned
// with a real headless chromium (--file mode: no stack needed): a plain `<input type="file">`, a WRAPPED
// one (the real shape of every FileDropzone/FileTrigger/FolderPicker surface in this app — a decorative
// div covering the real input), the loud boundary refusal, and the loud not-found refusal (never a
// silent no-op).

const UPLOAD_HTML = `<!doctype html><html><body>
<input type="file" id="f" />
<div id="out">none</div>
<script>
document.getElementById('f').addEventListener('change', (e) => {
  var files = e.target.files;
  document.getElementById('out').textContent = files.length + ':' + (files[0] ? files[0].name : '');
});
</script>
</body></html>`;

// The real-DOM-shape trap this row exists to fix: a decorative wrapper (a stand-in for
// `data-slot="file-dropzone"`) covering a HIDDEN real file input — --upload must drill to it, not throw
// "not an HTMLInputElement" against the wrapper div.
const WRAPPED_UPLOAD_HTML = `<!doctype html><html><body>
<div id="wrap" data-slot="file-dropzone">
  <input type="file" id="f" hidden />
</div>
<div id="out">none</div>
<script>
document.getElementById('f').addEventListener('change', (e) => {
  var files = e.target.files;
  document.getElementById('out').textContent = files.length + ':' + (files[0] ? files[0].name : '');
});
</script>
</body></html>`;

test("--upload attaches a real file to a plain <input type=file>, with no --eval DataTransfer shim", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    [
      "--file",
      `${root}/page.html`,
      "--upload",
      `input#f=${root}/fixture.txt`,
      "--eval",
      "document.getElementById('out').textContent",
      "--no-shot",
      "--no-failure-evidence",
    ],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("1:fixture.txt");
  await expect(res).toExitWith(EXIT.clean);
});

test("--upload drills a WRAPPER selector down to the real <input type=file> it covers", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": WRAPPED_UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    [
      "--file",
      `${root}/page.html`,
      "--upload",
      `#wrap=${root}/fixture.txt`,
      "--eval",
      "document.getElementById('out').textContent",
      "--no-shot",
      "--no-failure-evidence",
    ],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("1:fixture.txt");
  await expect(res).toExitWith(EXIT.clean);
});

test("--upload refuses a path OUTSIDE the repo/scratchpad boundary — loudly, never a silent no-op", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("snap", ["--file", "/etc/hostname", "--upload", "input#f=/etc/hostname", "--no-shot", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("STEP FAILED");
  expect(res.stdout).toContain("boundary");
  await expect(res).toExitWith(EXIT.violations);
});

test("--upload against a selector that matches NOTHING is a loud step failure, never a silent no-op", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    ["--file", `${root}/page.html`, "--upload", `input#does-not-exist=${root}/fixture.txt`, "--no-shot", "--no-failure-evidence"],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("STEP FAILED");
  await expect(res).toExitWith(EXIT.violations);
});

test("--upload misuse (no '=', or an empty path list) refuses before any browser boots", async ({ runCli }) => {
  const noEq = await runCli("snap", ["--upload", "input#f", "--no-failure-evidence"]);
  expect(noEq.stdout).toContain("ARG ERROR");
  await expect(noEq).toExitWith(EXIT.misuse);

  const emptyPaths = await runCli("snap", ["--upload", "input#f=", "--no-failure-evidence"]);
  expect(emptyPaths.stdout).toContain("ARG ERROR");
  await expect(emptyPaths).toExitWith(EXIT.misuse);
});

// The selector-DIALECT twin of the fix (#651's second, smaller gap): --contrast used to hand its
// selector straight to `document.querySelectorAll`, which cannot parse Playwright engine forms
// (`text=`) — the SAME dialect --wait-for requires. It now resolves through page.locator first.
test("--contrast now accepts the SAME text= dialect --wait-for requires", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": GOOD_HTML });
  const res = await runCli("snap", ["--file", `${root}/page.html`, "--contrast", "text=plainly readable text", "--no-shot", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("PASS");
  expect(res.stdout).not.toContain("EVAL ERROR");
  await expect(res).toExitWith(EXIT.clean);
});
