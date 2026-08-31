// The Characters CONTENT landing (#864) — four artboards from shared fragments. Material is ONLY what
// character.list carries today (name · handle · avatar · starred · lastChattedAt · createdAt · elevatorPitch)
// and its server sorts (recent · starred · newest). Tokens: packages/ui/src/styles/theme.css (Hearth).
import { writeFileSync } from "node:fs";

const CSS = `
    :root, .t-dark { --bg: oklch(0.158 0.006 60); --fg: oklch(0.955 0.004 75); --card: oklch(0.205 0.006 60); --raised: oklch(0.185 0.006 60); --muted: oklch(0.255 0.006 60); --muted-fg: oklch(0.74 0.008 65); --primary: oklch(0.72 0.175 52); --primary-fg: oklch(0.19 0.03 50); --border: oklch(0.99 0.005 60 / 0.08); --input: oklch(0.99 0.005 60 / 0.12); --ember: oklch(0.72 0.175 52 / 0.16); --star: oklch(0.82 0.16 100); }
    .t-light { --bg: oklch(0.98 0.004 75); --fg: oklch(0.24 0.01 60); --card: oklch(0.995 0.003 75); --raised: oklch(0.965 0.005 75); --muted: oklch(0.95 0.006 70); --muted-fg: oklch(0.44 0.01 65); --primary: oklch(0.55 0.16 50); --primary-fg: oklch(0.99 0.01 75); --border: oklch(0.2 0.01 60 / 0.12); --input: oklch(0.2 0.01 60 / 0.16); --ember: oklch(0.55 0.16 50 / 0.14); --star: oklch(0.62 0.14 95); }
    * { box-sizing: border-box; }
    body { margin: 0; }
    a { color: var(--primary); } a:hover { color: var(--fg); }
    .root { font-family: Geist, ui-sans-serif, system-ui, sans-serif; font-size: 13px; line-height: 1.45; color: var(--fg); background: var(--bg); }
    .mono { font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace; }
    .pane { display: flex; flex-direction: column; gap: 28px; padding: 28px 32px; overflow: hidden; background: var(--bg); border: 1.25px solid var(--border); }
    .lead { display: flex; flex-direction: column; gap: 6px; max-width: 60ch; }
    .h { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; text-wrap: balance; }
    .gloss { font-size: 13px; color: var(--muted-fg); }
    .gloss b { color: var(--fg); font-weight: 500; }
    .shelf { display: flex; flex-direction: column; gap: 10px; }
    .shelf-h { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .eyebrow { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
    .link { font-size: 12px; color: var(--muted-fg); }
    .faces { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 14px; }
    .faces.wide { grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); }
    .face { display: flex; flex-direction: column; gap: 8px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; font-family: inherit; cursor: pointer; border-radius: 10px; position: relative; }
    .face:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .art { aspect-ratio: 3 / 4; border-radius: 10px; background: var(--muted); display: grid; place-items: end start; padding: 8px; overflow: hidden; position: relative; }
    .art .ini { font-family: "Geist Mono", ui-monospace, monospace; font-size: 22px; font-weight: 600; color: var(--fg); opacity: 0.55; }
    .art.p1 { background: linear-gradient(165deg, oklch(0.52 0.1 300 / 0.85), oklch(0.26 0.05 285)); }
    .art.p2 { background: linear-gradient(165deg, oklch(0.55 0.1 200 / 0.85), oklch(0.25 0.04 220)); }
    .art.p3 { background: linear-gradient(165deg, oklch(0.62 0.12 60 / 0.85), oklch(0.28 0.05 50)); }
    .art.p4 { background: linear-gradient(165deg, oklch(0.55 0.09 150 / 0.85), oklch(0.25 0.04 160)); }
    .art.p5 { background: linear-gradient(165deg, oklch(0.6 0.11 20 / 0.85), oklch(0.27 0.05 15)); }
    .art.p6 { background: linear-gradient(165deg, oklch(0.5 0.06 250 / 0.85), oklch(0.24 0.03 240)); }
    .star { position: absolute; top: 8px; right: 8px; width: 14px; height: 14px; fill: var(--star); }
    .face .nm { font-weight: 500; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; }
    .face .cap { font-size: 11.5px; color: var(--muted-fg); line-height: 1.35; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .face .when { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); }
    .doors { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { height: 30px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); font-family: inherit; font-size: 13px; font-weight: 500; line-height: 28px; cursor: pointer; white-space: nowrap; }
    .btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
    .btn.ghost { background: transparent; }
    .mobile .btn { height: 40px; line-height: 38px; }
    .foot { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .hint { padding: 10px 12px; border: 1px dashed var(--border); border-radius: 8px; font-size: 12.5px; color: var(--muted-fg); max-width: 60ch; }
    .hint b { color: var(--fg); font-weight: 500; }
    .mobile .h { font-size: 20px; }
    .mobile .faces { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .mobile .pane { padding: 20px 16px; gap: 22px; }
`;
const STAR = `<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6 5.9 21l1.5-6.8L2.2 9.5l6.9-.7z"></path></svg>`;
const face = ([ini, name, cap, when, p, starred], mode = "") => `
        <button class="face" type="button" aria-label="${name}"><div class="art ${p}">${starred ? STAR : ""}<span class="ini">${ini}</span></div><div class="nm">${name}</div>${when ? `<div class="when">${when}</div>` : ""}${cap ? `<div class="cap">${cap}</div>` : ""}</button>`;

const RECENT = [["SV", "Sabine Veyra", "Warden of the outer stair; wary, precise, owes a debt.", "chatted 3h ago · 4 chats", "p1", true], ["ET", "Elias Thorn", "A scribe who talks to lanterns.", "chatted yesterday · 2 chats", "p2", false], ["KH", "Kohaku", "Shrine fox, bored of prayers.", "chatted 2d ago · 7 chats", "p3", true], ["NK", "Niko", "Courier. Never late, never early.", "chatted 5d ago · 1 chat", "p4", false]];
const STARRED = [["SV", "Sabine Veyra", "", "", "p1", true], ["KH", "Kohaku", "", "", "p3", true], ["CH", "Charlotte", "", "", "p5", true], ["JF", "JFC", "", "", "p6", true], ["MR", "Marisol Reyes", "", "", "p2", true], ["OD", "Odalys", "", "", "p4", true]];
const NEWEST = [["AV", "Avel the Quiet", "Added Aug 29", "", "p6", false], ["TB", "Tobias Brand", "Added Aug 27", "", "p5", false], ["LN", "Lin", "Added Aug 25", "", "p2", false]];
const SEED = [["SV", "Sabine Veyra", "Warden of the outer stair; wary, precise, owes a debt.", "", "p1", false], ["ET", "Elias Thorn", "A scribe who talks to lanterns.", "", "p2", false], ["KH", "Kohaku", "Shrine fox, bored of prayers.", "", "p3", false], ["NK", "Niko", "Courier. Never late, never early.", "", "p4", false], ["CH", "Charlotte", "Keeps a tavern and everyone's secrets.", "", "p5", false], ["JF", "JFC", "An assistant with opinions about fonts.", "", "p6", false], ["MR", "Marisol Reyes", "Salvage pilot, three ships behind on rent.", "", "p2", false], ["OD", "Odalys", "A cartographer of places that moved.", "", "p4", false], ["AV", "Avel the Quiet", "Says four words a day. Chooses them.", "", "p6", false], ["TB", "Tobias Brand", "Retired duelist, undefeated, unbearable.", "", "p5", false]];

function doc(body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap">
  <style>${CSS}</style>
</helmet>
${body}
</x-dc>
<script data-dc-script data-props='{"dark":{"editor":"boolean","default":true,"section":"Theme"}}'>
class Component extends DCLogic { renderVals() { return { theme: (this.props.dark ?? true) ? "t-dark" : "t-light" }; } }
</script>
</body>
</html>
`;
}

// list DOCKED (917×750): the New door is the LIST band's (#520) — the landing points at it by label, never a second door
function docked() {
  return doc(`
<div class="root {{theme}}" style="width: 917px; height: 750px;">
  <div class="pane" style="width: 917px; height: 750px;">
    <div class="lead"><div class="h">Pick up where you left off</div><div class="gloss">Your library, by who you were talking to. Open anyone to read or edit them; <b>New</b> at the top of the list makes someone new.</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Recently chatted</span><span class="link">sorted by last chat</span></div><div class="faces">${RECENT.map((f) => face(f)).join("")}</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Starred · 6</span><span class="link">show all starred in the list</span></div><div class="faces">${STARRED.slice(0, 5).map((f) => face(f)).join("")}</div></div>
    <div class="foot"><span class="gloss">3 added this week — <b>Avel the Quiet</b>, <b>Tobias Brand</b>, <b>Lin</b>.</span><span class="link">Import a card</span></div>
  </div>
</div>`);
}

// list COLLAPSED (1224×750): the band's door is off screen, so the landing OWNS the doors (#520's collapsed arm)
function collapsed() {
  return doc(`
<div class="root {{theme}}" style="width: 1224px; height: 750px;">
  <div class="pane" style="width: 1224px; height: 750px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;">
      <div class="lead"><div class="h">Pick up where you left off</div><div class="gloss">Your library, by who you were talking to. The list is tucked away — everything you need is here.</div></div>
      <div class="doors"><button class="btn primary" type="button">New character</button><button class="btn" type="button">Import a card</button></div>
    </div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Recently chatted</span><span class="link">sorted by last chat</span></div><div class="faces wide">${RECENT.map((f) => face(f)).join("")}</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Starred · 6</span><span class="link">show the list, starred first</span></div><div class="faces wide">${STARRED.map((f) => face(f)).join("")}</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Just added</span></div><div class="faces wide">${NEWEST.map((f) => face(f)).join("")}</div></div>
  </div>
</div>`);
}

// FRESH INSTALL (917×750): the seeded ten, nothing chatted, nothing starred — the empty shelves are ABSENT, not empty
function fresh() {
  return doc(`
<div class="root {{theme}}" style="width: 917px; height: 750px;">
  <div class="pane" style="width: 917px; height: 750px;">
    <div class="lead"><div class="h">Meet your characters</div><div class="gloss">Ten characters shipped with Orbweaver to talk to, take apart, or use as a starting point. Star the ones you like and they gather here; <b>New</b> at the top of the list makes your own.</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Shipped with Orbweaver · 10</span></div><div class="faces">${SEED.map((f) => face(f)).join("")}</div></div>
    <div class="hint">Once you've chatted with someone, <b>Recently chatted</b> takes this spot — the shelves appear when they have something to show, never as empty rooms.</div>
  </div>
</div>`);
}

// PHONE (430×860): reachable only with the list hidden (the section root is the LIST on a phone) — the doors are here
function phone() {
  return doc(`
<div class="root {{theme}} mobile" style="width: 430px; height: 860px;">
  <div class="pane mobile" style="width: 430px; height: 860px;">
    <div class="lead"><div class="h">Pick up where you left off</div></div>
    <div class="doors"><button class="btn primary" type="button">New character</button><button class="btn" type="button">Import</button></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Recently chatted</span></div><div class="faces">${RECENT.slice(0, 3).map((f) => face(f)).join("")}</div></div>
    <div class="shelf"><div class="shelf-h"><span class="eyebrow">Starred · 6</span><span class="link">all</span></div><div class="faces">${STARRED.slice(0, 3).map((f) => face(f)).join("")}</div></div>
    <div class="foot"><span class="gloss">3 added this week.</span><span class="link">Show the list</span></div>
  </div>
</div>`);
}

const files = { "Main.dc.html": docked(), "ListCollapsed.dc.html": collapsed(), "FreshInstall.dc.html": fresh(), "Phone.dc.html": phone() };
for (const [n, s] of Object.entries(files)) writeFileSync(n, s);
writeFileSync("canvas.json", JSON.stringify({
  artboards: [
    { file: "Main.dc.html", x: 0, y: 0, w: 917, h: 750, title: "Docked list · 1280" },
    { file: "ListCollapsed.dc.html", x: 1000, y: 0, w: 1224, h: 750, title: "List collapsed · owns the doors" },
    { file: "FreshInstall.dc.html", x: 0, y: 880, w: 917, h: 750, title: "Fresh install · the seeded ten" },
    { file: "Phone.dc.html", x: 1000, y: 880, w: 430, h: 860, title: "Phone · list hidden" },
  ],
  annotations: [
    { id: "material", x: 1000, y: 1780, w: 520, text: "Everything drawn exists on character.list today — name, handle, avatar, starred, lastChattedAt, createdAt, elevatorPitch, the recent / starred / newest sorts — plus two the owner ruled onto the wire (#865): the chat count on each face, and a closed provenance verdict (shipped · imported · authored) that names the fresh-install shelf. Faces reuse the Chats home tile's shelf (Avatar + promoted name + gloss). One New door (#520): the band's when the list is docked, the landing's when it is collapsed. The library count stays in the list pane (#518)." },
  ],
  launch: { view: "canvas" },
}, null, 2));
console.log("wrote", Object.keys(files).length, "artboards + canvas.json");
