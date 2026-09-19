// THE FILL ARM (#1111) — the planted controls for the false clean `--contrast` used to print, and for
// every neighbour that must NOT change arms.
//
// THE DEFECT, reproduced in the first case. `--contrast` resolved every subject's foreground through
// `getComputedStyle().color`. On an element that paints only a background — a switch thumb, a swatch
// cell, a bare indicator — that is the INHERITED text colour of a node with no text, so the printed ratio
// is between a colour the element never paints and a backdrop that is its OWN fill. Measured on #1090:
// `[data-slot=switch-thumb]` read 16.26:1 before AND after its fill changed, and two side-eye reports
// quoted that number as the OFF-state loudness. The planted markup below has the same shape: an
// almost-invisible fill (~1.2:1 against the track it sits in) under an inherited white ink that reads
// ~17:1 against that fill. Pre-fix this printed `17.xx:1 PASS`; it must now print a FILL verdict that
// FAILS.
//
// IT READS NO FILE UNDER `reports/`, AND MUST NOT START. The fill arm decodes an IN-MEMORY
// `page.screenshot()` buffer, so this pin needs no artifact on disk — and since #1164 the instruments'
// fixed artifact paths are SYMLINKS into per-run slots, where a glob or a `stat` sees a link rather than
// the PNG. If a future case ever needs a written shot, open it BY PATH; never glob or stat `reports/`.
//
// IT DRIVES THE PUBLIC DOOR (`captureContrastEvidence`) rather than the fill op, deliberately: that is
// the surface a reviewer's `pnpm snap --contrast` reaches, and asserting through it is what makes this
// file a defect proof against the OLD source rather than a compile error.
import { chromium } from "@playwright/test";
import { captureContrastEvidence } from "../../../../tooling/src/snap/ops/arms/contrast.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const VIEWPORT = { width: 400, height: 240 } as const;

/** One track with several subjects parked in it. Every subject inherits WHITE ink from the body and
 *  paints (or does not paint) its own fill over a near-black track — the polarity that makes an ink
 *  reading loud and a fill reading quiet, so an arm mix-up is a visible verdict flip and never a wobble.
 *  `#quiet` and `#ring` carry the SAME fill: only the inset ring tells them apart, which is exactly the
 *  Characters Opening selected-state shape (#1132). */
const PAGE = `
  <style>
    body { margin: 0; background: #0a0a0a; color: #ffffff; font: 16px sans-serif; }
    .track { position: relative; width: 360px; height: 44px; margin: 24px; background: #0a0a0a; }
    .cell { position: absolute; top: 6px; width: 32px; height: 32px; background: #141414; }
    #quiet { left: 8px; }
    #ring { left: 56px; box-shadow: inset 0 0 0 2px #ffffff; }
    #labelled { left: 104px; font-size: 13px; }
    #iconic { left: 152px; }
    #hidden-icon { left: 200px; }
    .cell svg { width: 16px; height: 16px; margin: 8px; display: block; }
    #hidden-icon svg { opacity: 0; }
  </style>
  <div class="track">
    <div class="cell" id="quiet"></div>
    <div class="cell" id="ring"></div>
    <div class="cell" id="labelled">ab</div>
    <div class="cell" id="iconic"><svg viewBox="0 0 16 16"><rect width="16" height="16" fill="currentColor"></rect></svg></div>
    <div class="cell" id="hidden-icon"><svg viewBox="0 0 16 16"><rect width="16" height="16" fill="currentColor"></rect></svg></div>
  </div>
`;

test("a fill-only subject is measured on its FILL, not on the inherited ink that never moved", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(PAGE);

    // ── THE FALSE CLEAN, now red. Pre-fix: `17.xx:1 PASS (ui-component …)` — white ink against the
    // subject's own fill. Post-fix: the fill (#141414) against the track it sits on (#0a0a0a).
    const [quiet] = await captureContrastEvidence(page, ["#quiet"], false, VIEWPORT);
    expect(quiet?.outcome.line).toContain("FILL ");
    expect(quiet?.outcome.line).toContain("FAIL");
    expect(quiet?.outcome.line).toContain("channel fill");
    expect(quiet?.outcome.failed).toBe(true);
    expect(quiet?.evidence).toMatchObject({ status: "ok", method: "fill-sample", sampled: 1, passed: false, requiredRatio: 3 });
    expect(quiet?.evidence.ratio ?? 0).toBeLessThan(1.5);
    // The measured foreground IS the painted fill, never the inherited white ink.
    expect(quiet?.evidence.foreground).toMatchObject({ r: 20, g: 20, b: 20 });
    expect(quiet?.evidence.fillChannel).toMatchObject({ kind: "fill" });

    // ── the INSET RING (#1132): identical fill, and the 2px ring is what makes the state visible. A
    // whole-box median would call this the same 1.2:1 as its neighbour; the channel split must credit it.
    const [ring] = await captureContrastEvidence(page, ["#ring"], false, VIEWPORT);
    expect(ring?.outcome.line).toContain("FILL ");
    expect(ring?.outcome.line).toContain("PASS");
    expect(ring?.outcome.line).toContain("channel inset-edge");
    expect(ring?.evidence.fillChannel).toMatchObject({ kind: "inset-edge" });
    expect(ring?.evidence.ratio ?? 0).toBeGreaterThan(3);
    // The ring is a MINORITY of the box — the share is printed so a reviewer sees the signal is a hairline.
    expect(ring?.evidence.fillChannel?.share ?? 1).toBeLessThan(0.5);

    // ── PRECISION NEIGHBOUR 1: text keeps the INK arm, unchanged. Same fill, same inherited colour.
    const [labelled] = await captureContrastEvidence(page, ["#labelled"], false, VIEWPORT);
    expect(labelled?.outcome.line).not.toContain("FILL ");
    expect(labelled?.outcome.line).toContain("(text · font 13px");
    expect(labelled?.evidence.method).toBe("css-resolve");

    // ── PRECISION NEIGHBOUR 2: an icon-only control keeps the INK arm too. An <svg> paints with
    // `currentColor`, so `color` IS its paint — routing it to the fill arm would measure the button's
    // background and call a legible icon invisible.
    const [iconic] = await captureContrastEvidence(page, ["#iconic"], false, VIEWPORT);
    expect(iconic?.outcome.line).not.toContain("FILL ");
    expect(iconic?.outcome.line).toContain("(ui-component ·");
    expect(iconic?.evidence.method).toBe("css-resolve");

    // ── PRESENT IS NOT PAINTED, and this is the LIVE subject the issue was filed on. The real
    // `[data-slot=switch-thumb]` ALWAYS renders a Lock <svg>, held at `opacity-0` until the switch is
    // readOnly (packages/ui/src/primitives/switch/switch.tsx) — so a "does it contain an svg" carve-out
    // hands the thumb straight back to the ink arm and the 16.26:1 false clean survives the fix. An
    // unpainted icon must NOT hold a subject on the ink arm.
    const [hidden] = await captureContrastEvidence(page, ["#hidden-icon"], false, VIEWPORT);
    expect(hidden?.outcome.line).toContain("FILL ");
    expect(hidden?.outcome.line).toContain("FAIL");
    expect(hidden?.evidence.method).toBe("fill-sample");
  } finally {
    await browser.close();
  }
});

test("a fill subject with no surround left to sample gets NO VERDICT, and it FAILS the run", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    // The subject IS the viewport: there is no band outside its box to measure it against. The arm must
    // say so — a fill-polarity claim answered by a coincidental ink number is the whole defect, so
    // "I cannot measure this" has to be louder than a green line, and it counts in `contrast-fails`.
    await page.setContent(`
      <style>body { margin: 0; background: #0a0a0a; color: #ffffff; }
        #full { position: fixed; inset: 0; background: #141414; }</style>
      <div id="full"></div>
    `);
    const [full] = await captureContrastEvidence(page, ["#full"], false, VIEWPORT);
    expect(full?.outcome.failed).toBe(true);
    expect(full?.evidence).toMatchObject({ method: null, ratio: null, passed: null, sampled: 0 });
    // THE CLASS is pinned, not the reason string (#1758): a `Page.captureScreenshot` protocol error under
    // contention is an INSTRUMENT fault (status "instrument-error", ops/contrast-fill.ts retries once and
    // still failed) — a DIFFERENT, honest no-verdict reason from this fixture's real DOMAIN refusal
    // (status "refused", no surround to sample). Both are legitimate "I could not produce a verdict"
    // outcomes; only the domain class's exact wording is asserted, on the quiet-box happy path.
    expect(["refused", "instrument-error"]).toContain(full?.evidence.status);
    const domainReceipt =
      full?.evidence.status !== "refused" ||
      (full.outcome.line.includes("NO VERDICT (fill-only, undecodable)") && full.outcome.line.includes("no surround to measure against"));
    expect(domainReceipt, `a domain refusal must name the surround reason — ${full?.outcome.line}`).toBe(true);
  } finally {
    await browser.close();
  }
});

test("a page.screenshot() failure retries once, and a persisting failure is an instrument fault (#1758)", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(PAGE);
    const real = page.screenshot.bind(page);

    // A LONE transient failure — the shape a real `Protocol error (Page.captureScreenshot)` takes under
    // contention — recovers silently through the retry: the SAME domain verdict as an unpatched run.
    let calls = 0;
    page.screenshot = (async (options) => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Protocol error (Page.captureScreenshot): Target closed.");
      }
      return await real(options);
    }) as typeof page.screenshot;
    const [recovered] = await captureContrastEvidence(page, ["#quiet"], false, VIEWPORT);
    expect(calls).toBe(2);
    expect(recovered?.evidence.status).toBe("ok");
    expect(recovered?.evidence.method).toBe("fill-sample");

    // A PERSISTENT failure (both attempts) is an INSTRUMENT fault — never folded into the "undecodable"
    // domain-refusal family, so a reason-string pin on that family cannot red on this CDP message. The run
    // still FAILS (never a silent green), and the line names the real capture error.
    page.screenshot = ((): Promise<never> => Promise.reject(new Error("Protocol error (Page.captureScreenshot): Target closed."))) as typeof page.screenshot;
    const [persisted] = await captureContrastEvidence(page, ["#quiet"], false, VIEWPORT);
    expect(persisted?.evidence.status).toBe("instrument-error");
    expect(persisted?.evidence.ratio).toBeNull();
    expect(persisted?.evidence.passed).toBeNull();
    expect(persisted?.outcome.failed).toBe(true);
    expect(persisted?.outcome.line).toContain("screenshot failed twice");
    expect(persisted?.outcome.line).toContain("Protocol error (Page.captureScreenshot)");
  } finally {
    await browser.close();
  }
});

// ── THE EMPTY FIELD (#2429 item 2) ────────────────────────────────────────────────────────────────────
// THE DEFECT, reproduced below. An empty `<textarea>` renders no `textContent` and carries no `<svg>`, so
// `isFillSubject` handed the composer to the FILL arm — which measures the box against the band around it
// and never judges the one thing a person reads in an empty composer: the PLACEHOLDER. The in-page script
// had resolved that colour since the ::placeholder blind-spot fix and nothing downstream knew, so the
// reading was thrown away every run. Measured live 2026-09-19 on the chat composer over a room wallpaper:
// a fill-only line under Hearth, and under Light a band poisoned by the dev HUD one corner over.
const FIELD_PAGE = `
  <style>
    body { margin: 0; background: #0a0a0a; font: 16px sans-serif; }
    /* All four fit inside the 400x240 viewport on purpose: an off-viewport match is refused (#211), so a
       taller stack would turn a precision neighbour into an OFF-SCREEN no-verdict instead of a verdict. */
    textarea { display: block; width: 240px; height: 28px; margin: 6px; border: 0; padding: 8px;
      background: #141414; color: #ffffff; font: 16px sans-serif; }
    /* A near-invisible prompt over the field's own fill: ~1.3:1, the polarity an empty composer
       over art actually lands in. */
    #quiet-prompt::placeholder { color: #1b1b1b; }
    #loud-prompt::placeholder { color: #f5f5f5; }
  </style>
  <textarea id="quiet-prompt" placeholder="Message Aria…"></textarea>
  <textarea id="loud-prompt" placeholder="Message Aria…"></textarea>
  <textarea id="no-prompt"></textarea>
  <textarea id="typed">hello</textarea>
`;

test("an EMPTY field with a placeholder is judged on its PLACEHOLDER INK, at the text threshold", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(FIELD_PAGE);

    // Pre-fix this printed a `FILL …` line about the textarea's box. It must now be an INK verdict on the
    // placeholder colour, at 4.5:1 (placeholder text is text), and it must FAIL — the prompt is unreadable.
    const [quiet] = await captureContrastEvidence(page, ["#quiet-prompt"], false, VIEWPORT);
    expect(quiet?.outcome.line).not.toContain("FILL ");
    expect(quiet?.outcome.line).toContain("(placeholder-ink ·");
    expect(quiet?.outcome.line).toContain("FAIL");
    expect(quiet?.evidence).toMatchObject({ status: "ok", method: "css-resolve", sampled: 1, passed: false, requiredRatio: 4.5 });
    // The measured foreground is the ::placeholder colour, never the field's (invisible) text colour.
    expect(quiet?.evidence.foreground).toMatchObject({ r: 27, g: 27, b: 27 });

    // The same subject with a legible prompt PASSES — the arm reports the placeholder's real polarity
    // rather than always reddening an empty field.
    const [loud] = await captureContrastEvidence(page, ["#loud-prompt"], false, VIEWPORT);
    expect(loud?.outcome.line).toContain("(placeholder-ink ·");
    expect(loud?.outcome.line).toContain("PASS");
    expect(loud?.evidence.foreground).toMatchObject({ r: 245, g: 245, b: 245 });

    // ── PRECISION NEIGHBOUR: an empty field with NO placeholder paints no ink at all, so it keeps the
    // FILL arm — but the line says out loud that its verdict is about the BOX, never the text. A bare
    // `FILL … PASS` there reads as "the composer's contrast is fine", which nothing measured.
    const [bare] = await captureContrastEvidence(page, ["#no-prompt"], false, VIEWPORT);
    expect(bare?.outcome.line).toContain("FILL ");
    expect(bare?.outcome.line).toContain("NO INK TO JUDGE");
    expect(bare?.evidence.method).toBe("fill-sample");

    // ── PRECISION NEIGHBOUR: a field with a VALUE is ordinary text on the ink arm, unchanged.
    const [typed] = await captureContrastEvidence(page, ["#typed"], false, VIEWPORT);
    expect(typed?.outcome.line).toContain("(text · font 16px");
    expect(typed?.evidence.foreground).toMatchObject({ r: 255, g: 255, b: 255 });
  } finally {
    await browser.close();
  }
});
