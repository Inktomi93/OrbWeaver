// @instrument-proof: a planted black-on-black paragraph (a 1:1 contrast defect) driven through the REAL
// cli over a file:// base must exit 1 with a `contrast` finding; the white-on-black twin must exit 0 —
// the deterministic scan cannot be a green-that-cannot-fail, and a misuse typo must never scan at all.
//
// The fixtures declare `data-app-ready` on <html> themselves so the readiness wait resolves instantly
// (a file page never runs the app; without the attribute every case burns the full 10s ceiling), and
// carry a <main> landmark so the only P1-severity finding in play is the planted one.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;
/** The RESULT line's node-census total — the denominator every "clean" verdict here rests on (#409). */
const CENSUS_RE = /census=(\d+)/u;

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

test("a borderless panel whose class merely contains the card WORD is not a nested card", async ({ runCli, scratch }) => {
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

test("--upload refuses a path OUTSIDE the repo/scratchpad boundary — loudly, never a silent no-op", async ({ runCli, scratch }) => {
  const file = join(scratch, "upload.html");
  await writeFile(file, UPLOAD_PAGE);
  const res = await runCli("ui-audit", ["/upload.html", "--base", `file://${scratch}`, "--upload", "#wrap=/etc/hostname"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("ACTION FAILED");
  expect(res.stdout).toContain("boundary");
  await expect(res).toExitWith(1);
});
