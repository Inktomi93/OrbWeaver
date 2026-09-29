// Pocket Arcade — the ESCAPE-HATCH archetype of an Orbweaver plugin (`ui.frame`).
//
// WHAT IT DOES. A complete, playable 2048 in the room's side panel — something to fidget with while the
// narrator types. Nothing here talks to the model, the room, or the host: it is pure pixels, and that is the
// point of the archetype.
//
// WHEN TO REACH FOR THE FRAME, and when not to — the decision this file exists to teach:
//   * The DECLARATIVE plane (`ui.register`, every other seeded example) is the DEFAULT: house components,
//     free theming, free a11y, free layout. If your surface is panels, fields, lists, cards, grids — it is
//     expressible there, and the house rule is that what CAN ship in the vocabulary MUST.
//   * The FRAME (`ui.registerFrame`) exists for ARBITRARY PIXELS the vocabulary cannot spell: canvas games,
//     bespoke visualizations, animated scenes. You hand the host a DOCUMENT (html + css, verbatim) and it is
//     served into an isolated iframe. This game is a grid of divs no vocabulary node draws — hatch material.
//
// WHAT A FRAME ACTUALLY GETS, honestly (the consent line the `ui.frame` capability shows says the same):
//   * An OPAQUE-ORIGIN document: `sandbox allow-scripts`, never `allow-same-origin`. No cookies, no
//     localStorage (state lives in JS memory and resets on remount — this game says so in its footer), no
//     app DOM, no sibling frames.
//   * NO NETWORK: `default-src 'none'`, no `connect-src` — fetch/XHR/WebSocket are refused by the document's
//     own response policy. (The one channel no CSP directive closes is WebRTC — which is why this tier has
//     its own capability and its own consent sentence instead of riding `ui.surface`.)
//   * NO HOST CALLS: there is no `orb` in a frame. A frame that needs host data does not exist yet — design
//     your frame self-contained, or split the data half into a declarative surface beside it.
//   * TWO THEME TOKENS, injected: `--sandbox-bg` and `--sandbox-fg` (plus the app's font), re-resolved when
//     the person's theme changes. Everything below is mixed from those two with `color-mix`, so the game
//     lands in ANY theme — light, dark, custom — without shipping a palette.
//
// SIZE BOUNDS: html ≤ 64 000 chars, css ≤ 16 000, at most 8 frames per plugin. An invalid registration is
// REFUSED and logged (the surface is simply absent) — never activation-fatal.

const host = orb.host(1);

// ── the document ───────────────────────────────────────────────────────────────────────────────────────────
// One self-contained page: markup + game script. Kept dependency-free and backtick-free (it lives inside a
// template literal). The inline <script> is legal INSIDE the frame document — the isolation is the response
// CSP of the frame's own route, not a markup filter.

const GAME_HTML = `
<div id="wrap">
  <div id="bar">
    <div id="score-box"><span id="score-label">score</span><span id="score">0</span></div>
    <div id="best-box"><span id="score-label">best</span><span id="best">0</span></div>
    <button id="new" type="button">New game</button>
  </div>
  <div id="board" tabindex="0" aria-label="2048 board — use the arrow keys"></div>
  <div id="pad">
    <button data-d="up" type="button">▲</button>
    <div id="pad-mid">
      <button data-d="left" type="button">◀</button>
      <button data-d="down" type="button">▼</button>
      <button data-d="right" type="button">▶</button>
    </div>
  </div>
  <p id="hint">Arrows or the pad. Join the numbers. The board forgets when you leave — an isolated frame keeps nothing.</p>
</div>
<script>
/* @orb-frame-script */
</script>
`;

// The stylesheet: everything derives from the TWO injected theme vars, so the game re-skins itself with the
// app (a light theme gets a light board; a custom accent shifts the whole ramp). `color-mix` runs in the
// frame's own engine — no token machinery needed on this side.
const GAME_CSS = `
#wrap { display: flex; flex-direction: column; gap: 10px; padding: 4px; }
#bar { display: flex; gap: 8px; align-items: stretch; }
#score-box, #best-box {
  flex: 1; display: flex; flex-direction: column; align-items: center; padding: 4px 8px;
  border-radius: 8px; background: color-mix(in oklab, var(--sandbox-fg) 8%, var(--sandbox-bg));
}
#score-label { font-size: 10px; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.08em; }
#score, #best { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
#new {
  padding: 4px 12px; border-radius: 8px; border: 1px solid color-mix(in oklab, var(--sandbox-fg) 25%, var(--sandbox-bg));
  background: transparent; color: var(--sandbox-fg); font: inherit; cursor: pointer;
}
#new:hover { background: color-mix(in oklab, var(--sandbox-fg) 10%, var(--sandbox-bg)); }
#board {
  position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 6px;
  border-radius: 10px; background: color-mix(in oklab, var(--sandbox-fg) 12%, var(--sandbox-bg));
  outline: none; touch-action: none;
}
#board:focus-visible { box-shadow: 0 0 0 2px color-mix(in oklab, var(--sandbox-fg) 45%, var(--sandbox-bg)); }
.cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums;
  background: color-mix(in oklab, var(--sandbox-fg) 5%, var(--sandbox-bg));
}
.t2    { background: color-mix(in oklab, var(--sandbox-fg) 14%, var(--sandbox-bg)); }
.t4    { background: color-mix(in oklab, var(--sandbox-fg) 20%, var(--sandbox-bg)); }
.t8    { background: color-mix(in oklab, var(--sandbox-fg) 28%, var(--sandbox-bg)); }
.t16   { background: color-mix(in oklab, var(--sandbox-fg) 36%, var(--sandbox-bg)); }
.t32   { background: color-mix(in oklab, var(--sandbox-fg) 46%, var(--sandbox-bg)); color: var(--sandbox-bg); }
.t64   { background: color-mix(in oklab, var(--sandbox-fg) 56%, var(--sandbox-bg)); color: var(--sandbox-bg); }
.t128  { background: color-mix(in oklab, var(--sandbox-fg) 66%, var(--sandbox-bg)); color: var(--sandbox-bg); font-size: 14px; }
.t256  { background: color-mix(in oklab, var(--sandbox-fg) 74%, var(--sandbox-bg)); color: var(--sandbox-bg); font-size: 14px; }
.t512  { background: color-mix(in oklab, var(--sandbox-fg) 82%, var(--sandbox-bg)); color: var(--sandbox-bg); font-size: 14px; }
.t1024 { background: color-mix(in oklab, var(--sandbox-fg) 90%, var(--sandbox-bg)); color: var(--sandbox-bg); font-size: 12px; }
.t2048 { background: var(--sandbox-fg); color: var(--sandbox-bg); font-size: 12px; }
#board.over .cell { opacity: 0.4; }
#over-note {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-weight: 700; text-align: center; padding: 8px;
}
#pad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
#pad-mid { display: flex; gap: 4px; }
#pad button {
  width: 42px; height: 34px; border-radius: 8px; border: 1px solid color-mix(in oklab, var(--sandbox-fg) 25%, var(--sandbox-bg));
  background: transparent; color: var(--sandbox-fg); font: inherit; cursor: pointer;
}
#pad button:hover { background: color-mix(in oklab, var(--sandbox-fg) 10%, var(--sandbox-bg)); }
#hint { font-size: 11px; opacity: 0.6; margin: 0; }
`;

// ── the registration ───────────────────────────────────────────────────────────────────────────────────────
// `registerFrame` is a DIFFERENT function from `register`, gated by a DIFFERENT capability (`ui.frame`, not
// `ui.surface`) — deliberately: the membrane gates per FUNCTION, and a tier that needs a louder consent line
// needs its own door. Same feature-detect idiom as every registration: an ungranted call throws, and a throw
// at activation takes the whole plugin down.
//
// Anchors a frame may take today: `settings`, `chat-flank`, `tool-card`. The flank is this game's home — a
// side-panel toy is exactly flank-shaped. (`message-footer` is refused permanently: one document per
// transcript row is a cost no toy justifies.)
if (host.grants.includes("ui.frame")) {
  host.ui.registerFrame({
    id: "arcade_2048",
    anchor: "chat-flank",
    title: "2048",
    html: GAME_HTML,
    css: GAME_CSS,
  });
  host.log.info("pocket arcade ready — 2048 at the chat flank");
} else {
  host.log.warn("pocket arcade is dormant: the ui.frame capability is not granted (Settings → Plugins)");
}
