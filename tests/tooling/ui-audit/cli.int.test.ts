// @instrument-proof: a planted black-on-black paragraph (a 1:1 contrast defect) driven through the REAL
// cli over a file:// base must exit 1 with a `contrast` finding; the white-on-black twin must exit 0 —
// the deterministic scan cannot be a green-that-cannot-fail, and a misuse typo must never scan at all.
//
// The fixtures declare `data-app-ready` on <html> themselves so the readiness wait resolves instantly
// (a file page never runs the app; without the attribute every case burns the full 10s ceiling), and
// carry a <main> landmark so the only P1-severity finding in play is the planted one.
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { chromiumPidsOwnedBy } from "../../support/chromium-processes.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;
/** The RESULT line's node-census total — the denominator every "clean" verdict here rests on (#409). */
const CENSUS_RE = /census=(\d+)/u;
/** The REACH denominator (#653) — how many OFFERED controls the viewport-bound families measured. */
const REACHED_RE = /reached=[1-9]/u;

function page(bodyStyle: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0"><main><p style="${bodyStyle};font-size:16px;margin:24px">the reading surface under audit</p></main></body></html>`;
}

test("a planted contrast defect REDs the audit through the real cli", async ({ runCli, scratch }) => {
  const file = join(scratch, "bad.html");
  await writeFile(file, page("background:#000;color:#000"));
  const res = await runCli("ui-audit", ["/bad.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("contrast");
  await expect(res).toExitWith(1);
});

test("the passing twin exits clean — the red above is the plant, not the harness", async ({ runCli, scratch }) => {
  const file = join(scratch, "good.html");
  await writeFile(file, page("background:#000;color:#fff"));
  const res = await runCli("ui-audit", ["/good.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  // The twin proves the PLANTED CLASS is absent (no contrast finding, no P1) — a fixture page still
  // legitimately trips the P2 font census (its default face is off the token ramp), which the exit
  // verdict correctly ignores at the default --fail-on P1.
  expect(res.stdout).not.toContain("contrast");
  expect(res.stdout).toContain("p1=0");
  await expect(res).toExitWith(0);
  // ZERO HYGIENE (#409): "no P1s" is only a verdict when the walk actually censused nodes.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── control silhouette (#430, from side-eye #420) ────────────────────────────

// @instrument-proof: a planted near-square `role="switch"` (48x44 — the exact pre-#420 coarse geometry,
// aspect 1.091) driven through the REAL cli must exit 1 with a `control-aspect` finding at --fail-on P2;
// the shipped 64x44 twin (aspect 1.455) must not carry the class at all. Before this rule the detector
// was structurally blind to a control collapsing toward square, and a green audit read as a verdict.
function switchPage(trackWidthPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000"><main><span role="switch" aria-checked="true" aria-label="Color quoted speech" tabindex="0" style="display:inline-block;width:${trackWidthPx}px;height:44px;border-radius:9999px;background:#f77f20"></span></main></body></html>`;
}

test("a planted near-square role=switch REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "crescent.html"), switchPage(48));
  const res = await runCli("ui-audit", ["/crescent.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("control-aspect");
  expect(res.stdout, "the finding must name the measured aspect, not just the rule").toContain("1.09");
  await expect(res).toExitWith(1);
});

test("the shipped 64x44 twin carries no control-aspect finding — the red above is the plant", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pill.html"), switchPage(64));
  const res = await runCli("ui-audit", ["/pill.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("control-aspect");
  // The twin still legitimately trips the P2 font census (a bare fixture page's default face is off the
  // token ramp), so the exit code is not the discriminator here — the ABSENCE of the planted class is.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── the nested-card card PREDICATE (#538, from the rail-corpus lane) ─────────

// @instrument-proof: the walker's card predicate is (shadow||border) && (radius||bg), and an AVATAR
// carries all four — so a rounded-rect avatar seat inside any bordered panel minted a `nested-card`
// finding. On the corpus surface 11 of 12 nested-card findings were `[data-slot=avatar-stack-item]`.
// An avatar is a MEDIA/identity token, never a decorative PANEL, which is the rule's only real target;
// the round default hid the class behind the pill test (radius >= half the short side) and only the
// sanctioned rounded-rect register (AvatarStack `shape="rounded"`) exposed it. Both directions are
// pinned: a real panel-in-panel must still RED, or the exclusion has eaten the rule.
function panelInPanel(inner: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="border:1px solid #444;border-radius:12px;background:#111;padding:16px;width:400px">
<p style="font-size:16px">the panel that legitimately owns this region</p>
${inner}
</div></main></body></html>`;
}

const REAL_NESTED_PANEL =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a second bordered panel inside the first</p></div>';
const AVATAR_SEAT =
  '<span data-slot="avatar-stack-item" role="img" aria-label="Ada Lovelace" style="display:inline-flex;width:48px;height:48px;border-radius:8px;background:#333;border:2px solid #555"></span>';

test("a real panel nested in a panel still REDs — the exclusion did not eat the rule", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "nested-panel.html"), panelInPanel(REAL_NESTED_PANEL));
  const res = await runCli("ui-audit", ["/nested-panel.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("a rounded-rect avatar seat inside a panel is NOT a nested card", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "avatar-seat.html"), panelInPanel(AVATAR_SEAT));
  const res = await runCli("ui-audit", ["/avatar-seat.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  // ZERO HYGIENE: the absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── the nested-card NAME arm and the control-shell wrapper (#552) ───────────

// @instrument-proof: two FP classes that made `nested-card` fire on sanctioned shapes, each pinned in
// BOTH directions. (1) `hasBorder` OR'd in /\bcard\b/i over the JOINED class string, so the colour
// utility `text-card-foreground` — which the @orb/ui `Card nested` arm emits BESIDE `border-0` — read
// as a border and outranked a measured zero on all four sides (8 of 10 findings on the populated corpus
// surface). (2) `isInteractiveIsland` tested self + ancestors only, so a shell AROUND a control
// (`[data-slot=autocomplete-input-group]`) was structurally unreachable while the code comment claimed
// the case was covered. The red twins below are what keeps the fixes from eating the rule: a MEASURED
// border still REDs even when the class carries the card word, and a panel that merely happens to offer
// an action is still judged.
const CARD_WORD_BORDERLESS_PANEL =
  '<div class="text-card-foreground" style="border:0;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">the sanctioned nested arm: fill only, no border</p></div>';
const CARD_WORD_BORDERED_PANEL =
  '<div class="text-card-foreground" style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a second bordered panel inside the first</p></div>';
const CONTROL_SHELL =
  '<div style="border:1px solid #666;border-radius:6px;background:#222;width:240px;height:32px"><input aria-label="Search your corpus" style="width:236px;height:28px;border:0;background:transparent;font-size:16px"></div>';
const PANEL_WITH_AN_ACTION =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a decorative panel that also offers an action</p><button style="font-size:16px">Act on it</button></div>';

// Each case here spawns a REAL cli subprocess + browser walk (~900ms measured solo, #666) — vitest's
// 5000ms default testTimeout has no headroom left once a sibling lane's process contention slows the
// spawn, so this one hit 5077ms under load and flaked. Not reducible from the test (the walk is real
// work in the tool under audit); an explicit budget with headroom is the fix, not a blanket file raise
// that would also hide the NEXT test that creeps toward the default.
test("a borderless panel whose class merely contains the card WORD is not a nested card", { timeout: 20_000 }, async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "card-word.html"), panelInPanel(CARD_WORD_BORDERLESS_PANEL));
  const res = await runCli("ui-audit", ["/card-word.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("a MEASURED border still REDs when the class carries the card word — the name arm went, the box stayed", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "card-word-bordered.html"), panelInPanel(CARD_WORD_BORDERED_PANEL));
  const res = await runCli("ui-audit", ["/card-word-bordered.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("a shell whose only child is a control is not a nested card", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "control-shell.html"), panelInPanel(CONTROL_SHELL));
  const res = await runCli("ui-audit", ["/control-shell.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("a panel that merely CONTAINS a control is still judged — the wrapper arm stayed bounded", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "panel-with-action.html"), panelInPanel(PANEL_WITH_AN_ACTION));
  const res = await runCli("ui-audit", ["/panel-with-action.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

// ── the OUTER-card predicate: a pane divider is not a card (#559) ───────────

// @instrument-proof: `nested-card` asked the SAME question of both halves of the pair, so a shell pane —
// an <aside> whose only box evidence is ONE border side (the divider against its neighbour), radius 0, no
// shadow — satisfied the card predicate and became the OUTER card. Every real card placed inside any shell
// pane then had a "nesting" partner it never had visually: a divider line is not a container edge. Latent
// app-wide when filed (the #552 inner-arm fix hid it on the corpus surface); pinned here in BOTH directions
// — a SECOND border side is a box, so that pane goes back to being an outer card and the pair still REDs.
function shellPane(paneBoxStyle: string, inner: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><aside style="${paneBoxStyle};background:#111;padding:16px;width:400px">
<p style="font-size:16px">the shell pane's own region label</p>
${inner}
</aside></main></body></html>`;
}

const PANE_DIVIDER_BOX = "border-right:1px solid #444;border-radius:0";
const PANE_TWO_SIDED_BOX = "border-right:1px solid #444;border-left:1px solid #444;border-radius:0";
const CARD_IN_A_PANE =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a real card living inside the pane</p></div>';

test("a one-side-border shell pane is NOT the outer card of a nesting pair", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pane-divider.html"), shellPane(PANE_DIVIDER_BOX, CARD_IN_A_PANE));
  const res = await runCli("ui-audit", ["/pane-divider.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  // ZERO HYGIENE: the absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("the same pane with a SECOND border side is a box again — the pair still REDs", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pane-two-sided.html"), shellPane(PANE_TWO_SIDED_BOX, CARD_IN_A_PANE));
  const res = await runCli("ui-audit", ["/pane-two-sided.html", "--base", `file://${scratch}`, "--fail-on", "P3"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["--definitely-not-a-flag"]);
  await expect(res).toExitWith(3);
});

// ── the ISOLATED STAGE mode (#678): a lane must be able to audit its OWN branch ─────────────────────────

// @instrument-absence-proof: design-audit only ever measured whatever `--base` served, and the default is
// the dev stack — which serves MAIN, never a lane's worktree. The failure mode of a naive `--ref` is
// SILENT: an unresolvable ref falls back to the default base, the dev stack answers, and main's rows get
// filed under the branch's name — a clean audit of the wrong tree, which is worse than no audit. So a ref
// this checkout cannot name must REFUSE (misuse, exit 3) before git, before a stage and before a browser,
// and every run must publish WHICH tree it measured on the machine line.
test("an unresolvable --ref REFUSES loudly — it never falls back to auditing the dev stack", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["/", "--ref", "__orb_no_such_ref_678__"]);
  expect(res.stdout).toContain("REF REFUSED");
  expect(res.stdout, "the refusal must name the ref the operator typed").toContain("__orb_no_such_ref_678__");
  expect(res.stdout, "the refusal must say no audit happened — a caller reads exit 3 as 'nothing measured'").toContain("no audit was run");
  // The tell that no fallback audit ran: no RESULT line, no report path.
  expect(res.stdout).not.toContain("RESULT");
  await expect(res).toExitWith(3);
});

test("--base beside a stage flag is misuse — the tool never picks one of two answers to WHERE", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["/", "--isolated", "--base", "http://127.0.0.1:5173"]);
  // The MESSAGE matters, not just the code: an unknown-flag refusal is also exit 3, so asserting the code
  // alone would pass against a build that never learned the flag at all.
  expect(res.stdout).toContain("both name WHERE to audit");
  await expect(res).toExitWith(3);
});

test("--ref beside --dirty is misuse — a commit and the working tree are two different trees", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["/", "--dirty", "--ref", "HEAD"]);
  expect(res.stdout).toContain("stages the WORKING TREE");
  await expect(res).toExitWith(3);
});

test("the help states WHERE it audits, the stage flags, and the stage-db provenance limit", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["--definitely-not-a-flag"]);
  expect(res.stdout).toContain("--isolated");
  expect(res.stdout).toContain("--ref <sha|branch|tag>");
  // The limitation is INHERITED from snap's stage and must not be inherited SILENTLY: a stage's db is
  // whatever its dir holds (fresh sha = a dev-db copy, cached dir = its older state), so a corpus-dependent
  // finding — or its absence — is a claim about that db, not about the app.
  expect(res.stdout).toContain("STAGE DB:");
});

// @instrument-absence-proof: an APP ORIGIN whose app never mounted must be an INSTRUMENT ERROR, never a
// clean audit. This is the #678 receipt's own failure: on a cold isolated stage (vite still optimizing) the
// walk censused 14 nodes and printed `findings=0 … exit 0` over a planted 1:1 contrast defect the same
// command REDed on at census 332 one run later. Fourteen is not zero and one reachable control is not zero,
// so the census and reach gaps are structurally blind to it — the readiness signal is the discriminator, and
// it must NOT fire on the file:// fixtures the rest of this file drives (no app is expected there).
// A real http origin is required: the exemption is keyed on the scheme, so a file:// plant proves nothing.
function serveOnce(html: string): Promise<{ readonly base: string; readonly close: () => void }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${addr.port}`,
        close: (): void => {
          server.close();
        },
      });
    });
  });
}

/** The SHELL a half-booted app leaves behind: real nodes, real text, one control — and no readiness flag. */
const SHELL_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><p style="font-size:16px;margin:24px">loading the workspace</p>
<button style="height:48px;width:120px;font-size:16px">Retry</button></main></body></html>`;

// This case deliberately BURNS the readiness wait (the app never announces itself), so it costs the full
// selector budget on top of the browser spawn — an explicit budget, not a blanket file raise.
test("an app origin whose app never mounted is an INSTRUMENT ERROR, never a clean audit", { timeout: 30_000 }, async ({ runCli }) => {
  const before = chromiumPidsOwnedBy(process.cwd());
  const server = await serveOnce(SHELL_HTML);
  try {
    const res = await runCli("ui-audit", ["/", "--base", server.base], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("INSTRUMENT ERROR");
    expect(res.stdout, "the gap must name the readiness signal — it is a different absence from the census").toContain("readiness");
    await expect(res).toExitWith(2);
  } finally {
    server.close();
  }
  const survivors = [...chromiumPidsOwnedBy(process.cwd())].filter((pid) => !before.has(pid));
  expect(survivors).toEqual([]);
});

test("the SAME page over the SAME origin with the readiness flag audits normally — the fence is not a blanket refusal", async ({ runCli }) => {
  const server = await serveOnce(SHELL_HTML.replace("<html>", '<html data-app-ready="settled">'));
  try {
    const res = await runCli("ui-audit", ["/", "--base", server.base], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toContain("INSTRUMENT ERROR");
    expect(res.stdout).toContain("RESULT design-audit");
    await expect(res).toExitWith(0);
  } finally {
    server.close();
  }
});

// A run with no stage still says so: `stage=live` is the honest label for "whatever --base served", and it
// is what makes a PASTED receipt self-describing — the ambiguity that made #674's fix lane hand its receipt
// duty back to the orchestrator.
test("the machine line publishes WHICH tree was audited", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "good.html"), page("background:#000;color:#fff"));
  const res = await runCli("ui-audit", ["/good.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("stage=live");
});

// ── ZERO HYGIENE (#409): an empty node census is absent evidence, never "no findings — clean" ──

// @instrument-absence-proof: an EMPTY node census (a blank mount / swallowed error boundary) must report
// INSTRUMENT ERROR naming the census, never "no findings — clean".
test("a page the walk censused NOTHING on is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  // The defect class this stands for: a blank mount / swallowed error boundary renders an empty shell,
  // every check family receives an empty list, and the audit reports "no findings — clean".
  const file = join(scratch, "empty.html");
  await writeFile(file, `<!doctype html>\n<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main></main></body></html>`);
  const res = await runCli("ui-audit", ["/empty.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("census");
  await expect(res).toExitWith(2);
});

// ── --upload (#651) ──────────────────────────────────────────────────────────
// design-audit's census over the plugin install/consent screen was a FALSE CLEAN — taken against an
// EMPTY dropzone, so the surface a bundle actually populates was never rendered, let alone scanned.
// Pinned with the same shape: a fixture whose file-input `change` handler reveals a real contrast
// defect. UNUPLOADED, the route is clean (the false-clean shape). Through `--upload`, the SAME route
// REDs with a `contrast` finding — proof the walk now censuses the file-populated surface, not the pick
// screen. A boundary-refusal control (never a silent no-op) closes the loop.

// A hidden real <input type="file"> under a decorative wrapper — the same shape every FileDropzone in
// this app uses (packages/ui/src/primitives/file-dropzone/file-dropzone.tsx). `change` reveals a
// black-on-black paragraph: a defect that exists ONLY once a file has been attached.
const UPLOAD_PAGE = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000">
<main>
  <p style="color:#fff;font-size:16px;margin:24px">Drop a plugin bundle</p>
  <div id="wrap"><input type="file" id="f" hidden /></div>
</main>
<script>
document.getElementById('f').addEventListener('change', () => {
  var p = document.createElement('p');
  p.style.cssText = 'background:#000;color:#000;font-size:16px;margin:24px';
  p.textContent = 'revealed only by an upload';
  document.body.appendChild(p);
});
</script>
</body></html>`;

test("--upload populates the surface design-audit censuses — clean unuploaded, REDs through the step", async ({ runCli, scratch }) => {
  const file = join(scratch, "upload.html");
  await writeFile(file, UPLOAD_PAGE);

  // Unuploaded: the exact false-clean shape #651 named — a real defect sits behind a file pick, and a
  // census that never populates the surface reports nothing wrong.
  const clean = await runCli("ui-audit", ["/upload.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(clean.stdout).not.toContain("contrast");
  await expect(clean).toExitWith(0);

  // Through --upload: the SAME route now REDs on the SAME rule, because the walk censused the
  // file-populated DOM instead of the empty dropzone.
  const fixture = join(scratch, "fixture.txt");
  await writeFile(fixture, "hello upload");
  const uploaded = await runCli("ui-audit", ["/upload.html", "--base", `file://${scratch}`, "--upload", `#wrap=${fixture}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(uploaded.stdout).toContain("contrast");
  await expect(uploaded).toExitWith(1);
});

// ── CENSUS REACH (#653): below the fold is not unreachable, and unreachable is not silence ──────────
// @instrument-proof + @instrument-absence-proof. The interactive census required viewport intersection,
// so every control merely scrolled out of sight fell out of tapTargets, actionDoors AND controlAspects
// at once — and the run printed the same thing a clean surface prints. Measured on the surface that
// named the row (the chat "This chat" tab at 430x932): NO document scroll at all, an inner scroller of
// clientHeight 515 over scrollHeight 2261, ~20 sized controls at top 1073..2374, none censused.
//
// Three arms, because the fix has to survive all three: the defect below the fold must FIRE, a control
// nothing can reach must be COUNTED rather than dropped, and a page where NOTHING is reachable must
// refuse out loud instead of printing "no findings — clean" over three empty lists.
// The bands above and below are SIBLINGS, and a second control shares the wrapper — both deliberate.
// `ownsPoint` credits a control with any point whose owner CONTAINS it, and `sharedCompositeOwns` credits
// a LONE control with its wrapper's whole extent (the walker's own declared limit), so a bare button
// floating in a padded wrapper measures 44 no matter how short it is: a fixture without these would be a
// fence that cannot fail. The live defect has the same shape — the bands around the rule row's disclosure
// are not owned by it, and the row carries other controls.
const REACH_CONTROLS =
  '<div style="height:40px;width:413px">Nudge the pacing</div>' +
  '<button style="display:block;height:16px;width:413px;padding:0;font-size:16px">Recent activity</button>' +
  '<div style="height:40px;width:413px">Runs on every message</div>' +
  '<button style="display:block;height:48px;width:120px;font-size:16px">Run now</button>';

/** A page whose controls live ~900px down an INNER scroller — no document scroll exists, exactly like
 *  the live surface. `after` rides outside the scroller for the unreachable arm. */
function innerScrollerPage(after: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
<div style="height:400px;width:460px;overflow:auto"><div style="height:1600px"><div style="padding-top:900px">${REACH_CONTROLS}</div></div></div>
${after}
</main></body></html>`;
}

/** Fixed past the right edge: no ancestor scroll can bring it in — unreachable, not un-scrolled-to.
 *  This is the 2026-08-16 phantom class (an off-canvas detail panel at x=431 on a 430px viewport). */
const OFF_CANVAS_CONTROL = '<button style="position:fixed;inset-inline-start:300vw;top:0;width:20px;height:20px;font-size:16px">p</button>';

test("a 413x16 control below the fold of an INNER scroller REDs — three rule families were blind to it", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "below-fold.html"), innerScrollerPage(""));
  const res = await runCli("ui-audit", ["/below-fold.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "16px is under the 24px fine-pointer floor — and it is 900px down an inner scroller").toContain("tap-target");
  // The denominator is not optional: a reader of a reach-bearing run is entitled to both numbers.
  expect(res.stdout).toContain("skipped-offviewport=0");
  expect(res.stdout).toMatch(REACHED_RE);
  // The healthy 48x48 twin sits in the SAME below-fold wrapper and must stay silent — the reveal widened
  // the census, it did not lower the floor. `tap-target` appears exactly once, for the 16px control.
  expect(res.stdout.split("tap-target").length - 1, `only the 16px control may fire:\n${res.stdout}`).toBe(1);
  await expect(res).toExitWith(1);
});

test("an unreachable control is COUNTED and NAMED on the run — never silently dropped", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "off-canvas.html"), innerScrollerPage(OFF_CANVAS_CONTROL));
  const res = await runCli("ui-audit", ["/off-canvas.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "the human line must say what was skipped and why").toContain("SKIPPED");
  expect(res.stdout).toContain("skipped-offviewport=1");
  // The reachable defect in the same page still fires: counting the phantom did not mute the census.
  expect(res.stdout).toContain("tap-target");
});

// @instrument-absence-proof: a page whose ONLY offered control is unreachable has three verdict families
// resting on empty lists while the text census stays fat — so `census=` looks healthy and the run reads
// clean. That is #653 one step past where a reveal sweep can rescue it, and it must refuse.
test("a page where NO offered control can be reached is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "all-off-canvas.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><p style="font-size:16px;margin:24px">a surface with plenty of text and one unreachable control</p>
${OFF_CANVAS_CONTROL}
</main></body></html>`,
  );
  const res = await runCli("ui-audit", ["/all-off-canvas.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout, "the gap must name the reach, not the node census — they are different absences").toContain("viewport reach");
  await expect(res).toExitWith(2);
});

// ── TYPE-HIERARCHY INVERSION: an alert outweighed by what it bounds (#652) ──────────────────────────
// @instrument-proof. The fixtures below are the plugin consent screen's OWN markup at two commits, with
// the computed steps it really rendered — not a synthetic shape. BEFORE 68c5d57d2 the unrecognised-
// permissions sentence was `<Text role="alert" voice="gloss">` at 10.5px sitting in the same block as raw
// egress hostnames set in the un-voiced 15px default: the most safety-relevant sentence on the screen,
// rendered smaller than the machine strings it qualifies. AFTER, `prose` lifts the alert to 13px and the
// hostnames dropped to the 12px `datumMono` register — the guarantee now outweighs the endpoints.
//
// The rule anchors on the ALERT ROLE and nothing else, and that was a MEASURED choice: anchored instead on
// `data-voice="gloss"` (the issue's other candidate) it fired 21 times across 18 live surfaces, because a
// gloss caption under a heading or a stat figure is the ratified pattern, not an inversion. Re-measured
// with the alert anchor: ZERO findings across the same 18 surfaces. The pair below is what keeps that zero
// honest — a zero from a rule that cannot fire is not a result.
function consentBlock(alertFontPx: string, hostFontPx: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="padding:24px">
  <div><span data-voice="label" style="font-size:13px">Reach the network</span></div>
  <p role="alert" data-voice="gloss" style="font-size:${alertFontPx};margin:8px 0">This plugin asks for 2 permissions this version of Orbweaver doesn't recognise. Update Orbweaver before installing it.</p>
  <div>
    <span data-voice="label" style="font-size:13px">Hosts it can reach (2/4)</span>
    <div><div><span data-voice="${hostFontPx === "15px" ? "" : "datumMono"}" style="font-size:${hostFontPx}">api.example.com</span></div><div><span style="font-size:${hostFontPx}">cdn.example.com</span></div></div>
  </div>
</div></main></body></html>`;
}

test("an alert sentence set smaller than the endpoints it bounds is a caveat-outweighed finding", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "consent-pre.html"), consentBlock("10.5px", "15px"));
  const res = await runCli("ui-audit", ["/consent-pre.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "a 10.5px alert beside 15px hostnames inverts the reading order of a security argument").toContain("caveat-outweighed");
  expect(res.stdout, "the finding must name the measured pair, or a reader cannot act on it").toContain("10.5px alert under a 15px sibling");
  await expect(res).toExitWith(1);
});

test("the shipped twin is silent — `prose` lifted the alert above the register it bounds", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "consent-post.html"), consentBlock("13px", "12px"));
  const res = await runCli("ui-audit", ["/consent-post.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "the alert now outweighs the endpoints — flagging it would indict the fix").not.toContain("caveat-outweighed");
  // The absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// The false-positive fence, and the reason the gloss anchor was refused: the SAME size relationship in the
// ratified caption pattern — a quiet explanatory line under the heading or figure it explains — must stay
// silent. Without an alert role there is no authored claim that the small text bounds the large one.
test("a quiet caption under the figure it explains is NOT an inversion — the rule is not a caption detector", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "caption.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="padding:24px">
  <span data-voice="label" style="font-size:13px">Tokens this week</span>
  <span data-slot="stat-figure-value" data-voice="datum" style="font-size:24px">128,400</span>
  <p data-voice="gloss" style="font-size:10.5px">Counted from the last completed turn of every room you host.</p>
</div></main></body></html>`,
  );
  const res = await runCli("ui-audit", ["/caption.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "a caption under a stat figure is what a caption is for — this shape fired 21x app-wide under the gloss anchor").not.toContain(
    "caveat-outweighed",
  );
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("--upload refuses a path OUTSIDE the repo/scratchpad boundary — loudly, never a silent no-op", async ({ runCli, scratch }) => {
  const file = join(scratch, "upload.html");
  await writeFile(file, UPLOAD_PAGE);
  const res = await runCli("ui-audit", ["/upload.html", "--base", `file://${scratch}`, "--upload", "#wrap=/etc/hostname"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("ACTION FAILED");
  expect(res.stdout).toContain("boundary");
  await expect(res).toExitWith(1);
});
