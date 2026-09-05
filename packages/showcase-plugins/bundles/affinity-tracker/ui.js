// Affinity Tracker — THE SCRIPTED (Tier-C) HALF. This file runs in YOUR BROWSER, inside a QuickJS-WASM
// interpreter in a Web Worker, and it is what makes a plugin surface feel like part of the app instead of a
// form that posts to a server.
//
// WHAT THE TIER BUYS, in one sentence: `main.js` pays a network round-trip for every click, and this file pays
// none. Type a letter in the filter below and the list narrows in the same frame — no request, no spinner, no
// server. That is the whole point, and the rule that makes it true is simple: DO YOUR READS AT STARTUP, then
// compute locally.
//
// WHAT YOU HAVE HERE, and nothing else:
//   orb.ui(1).render(surfaceId, tree)  — publish a WHOLE tree; the app diffs and draws it with house controls
//   orb.ui(1).onEvent(handler)         — clicks and field edits arrive here, locally
//   orb.ui(1).host.<ns>.<fn>(…)        — a small READ-ONLY-ish subset of the host, relayed and RE-CHECKED
//   orb.ui(1).log / .clock / .random   — the same injected seams the server guest gets
//
// WHAT YOU DO NOT HAVE, deliberately: the DOM, `fetch`, `Date`, `Math.random`, and every host function that
// WRITES to a room. Those live on the server half — where the host can gate them against your grants and the
// room's authority — and a scripted surface reaches them by asking `main.js` to act, never by acting itself.
//
// THE THREE RULES THAT KEEP A SCRIPTED SURFACE ALIVE:
//  1. RENDER SOMETHING, THEN KEEP RENDERING. A surface with no published tree draws NOTHING (that is the
//     silence law: a broken plugin costs a room nothing but its own absence). So publish once at startup, even
//     if it is only "loading nothing yet", and re-publish after every state change.
//  2. NEVER BLOCK. There is a wall-clock deadline enforced from OUTSIDE this interpreter — if a handler does
//     not settle in time, the whole worker is terminated and your surface disappears. An infinite loop is not
//     a slow surface, it is a dead one.
//  3. HOST CALLS ARE THE EXPENSIVE THING. Each one is a real request. Batch them at startup; a handler that
//     calls the host on every keystroke has thrown away the only advantage this tier has.

const ui = orb.ui(1);

/** The surface this file draws. It must match a `tier: "scripted"` registration in `main.js` — the host drops
 *  a render for any id the plugin did not register. */
const SURFACE = "affinity_browser";

/** How many rooms the list shows before it stops (the vocabulary caps rendered rows at 64 anyway; keeping our
 *  own smaller bound means the list stays readable rather than merely legal). */
const MAX_ROWS = 20;

/** Everything this surface knows. Loaded ONCE at startup, then never re-fetched — the filter below is a pure
 *  function of this array and the query string. */
let readings = [];
let query = "";
let loaded = false;

/** Sort by warmth, descending — the interesting rooms first. Stable enough for a display list. */
function byScore(a, b) {
  return b.score - a.score;
}

/** The whole tree, rebuilt from local state. Retained-mode: we hand over the COMPLETE surface every time and
 *  the app works out what changed, so there is no patching to get wrong. */
function draw() {
  const needle = query.trim().toLowerCase();
  const matches = readings
    .filter((row) => needle === "" || row.label.toLowerCase().includes(needle))
    .sort(byScore)
    .slice(0, MAX_ROWS);

  const children = [
    {
      kind: "text",
      voice: "gloss",
      value: "Your warmth readings, filtered as you type. Nothing here leaves your browser — the list was loaded once and every keystroke is computed locally.",
    },
    { kind: "textField", name: "q", label: "Filter rooms", value: query, placeholder: "Type to narrow the list" },
  ];

  if (!loaded) {
    children.push({ kind: "text", voice: "gloss", value: "Loading your readings…" });
  } else if (readings.length === 0) {
    children.push({ kind: "text", voice: "gloss", value: "No readings yet. The tracker takes one every few messages once a room gets going." });
  } else if (matches.length === 0) {
    children.push({ kind: "text", voice: "gloss", value: `Nothing matches “${query}”.` });
  } else {
    children.push({ kind: "keyValue", rows: matches.map((row) => ({ key: row.label, value: `${row.score} / 10` })) });
    children.push({ kind: "text", voice: "label", value: `${matches.length} of ${readings.length} rooms` });
  }

  ui.render(SURFACE, { kind: "stack", gap: "field", children });
}

/** Load every reading ONCE. `storage.list`/`storage.get` are relayed to the server and re-checked against this
 *  plugin's own grants there — but they happen exactly here, at startup, and never again. */
async function load() {
  try {
    const keys = await ui.host.storage.list("score:");
    // In parallel: the host caps concurrent calls, and a handful of rooms is well inside it.
    const values = await Promise.all(keys.map((key) => ui.host.storage.get(key)));
    readings = keys.map((key, index) => ({ label: key.slice("score:".length), score: Number(values[index]) })).filter((row) => Number.isFinite(row.score));
  } catch (err) {
    // A failed read is not a reason to vanish — draw the empty state and say so in the log.
    ui.log.warn(`could not load readings: ${String(err)}`);
    readings = [];
  }
  loaded = true;
  draw();
}

// EVENTS ARRIVE LOCALLY. No network, no await, no host call — just state and a redraw. This handler is the
// entire "zero network on keystroke" claim, and it is three lines because that is all it should ever be.
ui.onEvent((event) => {
  if (event.event.type === "field" && event.event.name === "q") {
    query = event.event.value;
    draw();
  }
});

// Draw IMMEDIATELY (rule 1) so the surface exists while the read is still in flight, then again when it lands.
// The load is deliberately NOT awaited at top level: startup has its own budget, and holding it open on a
// network round-trip is how a plugin turns a slow connection into a surface that never appears. `load` handles
// its own failures, so there is nothing here for a rejection to escape from.
draw();
void load();
