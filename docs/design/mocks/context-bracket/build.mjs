// Assembles the seven artboards of the context-panel canvas from shared fragments.
// Everything visual is lifted from packages/ui/src/styles/theme.css (Hearth) and the shipped rail/cell/kicker
// anatomy of rpg-hud.tsx / rpg-hud-rail.tsx / context-tabs-panel.tsx; the Waystone from charts/meter/waystone-*.
import { writeFileSync } from "node:fs";

const CSS = `
    :root, .t-dark {
      --bg: oklch(0.158 0.006 60); --fg: oklch(0.955 0.004 75); --card: oklch(0.205 0.006 60);
      --raised: oklch(0.185 0.006 60); --sidebar: oklch(0.132 0.006 60); --muted: oklch(0.255 0.006 60);
      --muted-fg: oklch(0.74 0.008 65); --primary: oklch(0.72 0.175 52); --primary-fg: oklch(0.19 0.03 50);
      --border: oklch(0.99 0.005 60 / 0.08); --input: oklch(0.99 0.005 60 / 0.12);
      --success: oklch(0.72 0.13 155); --info: oklch(0.7 0.1 232); --warning: oklch(0.79 0.13 75);
      --destructive: oklch(0.65 0.19 25); --ember: oklch(0.72 0.175 52 / 0.16); --crown: oklch(0.82 0.16 100);
      --sky-top: oklch(0.32 0.06 262); --sky-low: oklch(0.62 0.14 40); --horizon: oklch(0.28 0.01 60);
    }
    .t-light {
      --bg: oklch(0.98 0.004 75); --fg: oklch(0.24 0.01 60); --card: oklch(0.995 0.003 75);
      --raised: oklch(0.965 0.005 75); --sidebar: oklch(0.955 0.006 72); --muted: oklch(0.95 0.006 70);
      --muted-fg: oklch(0.44 0.01 65); --primary: oklch(0.55 0.16 50); --primary-fg: oklch(0.99 0.01 75);
      --border: oklch(0.2 0.01 60 / 0.12); --input: oklch(0.2 0.01 60 / 0.16);
      --success: oklch(0.47 0.12 155); --info: oklch(0.48 0.1 232); --warning: oklch(0.50 0.11 75);
      --destructive: oklch(0.50 0.19 25); --ember: oklch(0.55 0.16 50 / 0.14); --crown: oklch(0.62 0.14 95);
      --sky-top: oklch(0.55 0.08 250); --sky-low: oklch(0.8 0.1 55); --horizon: oklch(0.45 0.01 60);
    }
    body { margin: 0; }
    a { color: var(--primary); } a:hover { color: var(--fg); }
    .root { font-family: Geist, ui-sans-serif, system-ui, sans-serif; font-size: 13px; line-height: 1.45; color: var(--fg); background: var(--bg); }
    .mono { font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace; }
    .pane { position: relative; display: flex; flex-direction: column; background: var(--sidebar); border: 1.25px solid var(--border); border-left: 2px solid var(--primary); overflow: hidden; }
    .pane.mobile { border-left: 1.25px solid var(--border); }
    .band { flex: none; display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 10px; background: var(--raised); border-bottom: 1.25px solid var(--border); }
    .title { font-size: 16px; font-weight: 600; line-height: 1.25; letter-spacing: -0.005em; text-wrap: balance; }
    .gloss { font-size: 12px; color: var(--muted-fg); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--card); font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; font-weight: 500; color: var(--muted-fg); white-space: nowrap; }
    .chip.on { color: var(--fg); border-color: var(--input); }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
    .dot.idle { background: var(--muted-fg); opacity: 0.5; }
    .rail { flex: none; display: flex; flex-direction: column; }
    .rail.own { background: var(--raised); }
    .kick { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 12px 4px; border-top: 1.25px solid var(--border); border-bottom: 1px solid var(--border); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
    .rail.top .kick { border-top: 0; }
    .kick .sel { color: var(--fg); }
    .cells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(max-content, 1fr); gap: 4px; padding: 6px 8px 8px; overflow-x: auto; }
    .cell { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 44px; padding: 6px 4px 5px; border: 0; border-radius: 6px; background: transparent; color: var(--muted-fg); font-family: inherit; font-size: 10.5px; font-weight: 500; cursor: pointer; }
    .cell svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
    .cell.on { color: var(--fg); background: var(--ember); }
    .cell.on::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: -8px; height: 2px; background: var(--primary); }
    .rail.top .cell.on::after { bottom: -8px; }
    .cell:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    .rail.recede .cell { opacity: 0.85; }
    .cell.lock { opacity: 0.6; }
    .cell .lk { position: absolute; top: 4px; right: 6px; width: 9px; height: 9px; stroke-width: 2; }
    .badge { position: absolute; top: 3px; right: 6px; min-width: 14px; height: 14px; padding: 0 4px; border-radius: 7px; background: var(--primary); color: var(--primary-fg); font-family: "Geist Mono", ui-monospace, monospace; font-size: 9px; font-weight: 600; line-height: 14px; }
    .view { flex: 0 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 10px 12px; }
    .ground { flex: 1 1 auto; min-height: 0; }
    .sec { display: flex; flex-direction: column; gap: 4px; }
    .sec-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .eyebrow { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
    .act { display: flex; gap: 6px; }
    .btn { height: 26px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); font-family: inherit; font-size: 12px; font-weight: 500; line-height: 24px; white-space: nowrap; cursor: pointer; }
    .btn.ghost { background: transparent; }
    .btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
    .mobile .btn { height: 36px; line-height: 34px; font-size: 13px; }
    .row { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; }
    .mobile .row { grid-template-columns: 36px 1fr auto; padding: 8px 0; }
    .row + .row { border-top: 1px solid var(--border); }
    .av { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--muted); color: var(--fg); font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; font-weight: 600; }
    .mobile .av { width: 36px; height: 36px; }
    .av.a { background: oklch(0.55 0.09 300 / 0.5); } .av.b { background: oklch(0.55 0.1 200 / 0.5); } .av.c { background: oklch(0.6 0.12 60 / 0.5); }
    .nm { font-weight: 500; line-height: 1.2; }
    .mobile .nm { font-size: 14px; }
    .meta { font-size: 11px; color: var(--muted-fg); }
    .glyphs { display: flex; gap: 2px; color: var(--muted-fg); }
    .glyphs span { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 5px; font-size: 12px; }
    .mobile .glyphs span { width: 44px; height: 44px; }
    .talk { height: 3px; margin-top: 4px; border-radius: 2px; background: var(--muted); overflow: hidden; }
    .talk i { display: block; height: 100%; background: var(--muted-fg); }
    .cond { display: inline-flex; gap: 4px; }
    .cond span { padding: 1px 6px; border-radius: 4px; background: var(--muted); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10px; font-weight: 500; line-height: 16px; color: var(--muted-fg); }
    .cond span.w { color: var(--warning); }
    .hint { padding: 8px 10px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--muted-fg); }
    .hint b { color: var(--fg); font-weight: 500; }
    .kv { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 5px 0; align-items: baseline; }
    .kv + .kv { border-top: 1px solid var(--border); }
    .kv b { font-weight: 500; }
    .kv .v { font-family: "Geist Mono", ui-monospace, monospace; font-size: 12px; color: var(--muted-fg); }
    .kv .v em { font-style: normal; color: var(--fg); }
    .sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 6px; border: 1px solid var(--border); }
    .prose { font-size: 12.5px; line-height: 1.5; color: var(--muted-fg); max-width: 60ch; }
    .prose b { color: var(--fg); font-weight: 500; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .input { height: 30px; padding: 0 10px; border: 1px solid var(--input); border-radius: 6px; background: var(--card); color: var(--fg); font-family: inherit; font-size: 13px; line-height: 28px; }
    .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .switch i { width: 28px; height: 16px; border-radius: 8px; background: var(--muted); position: relative; }
    .switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--muted-fg); }
    .switch.on i { background: var(--primary); } .switch.on i::after { left: 14px; background: var(--primary-fg); }
    /* waystone band */
    .ws { display: grid; grid-template-columns: 84px 1fr; gap: 10px; align-items: center; }
    .ws svg { width: 84px; height: 84px; display: block; }
    .sat { display: flex; gap: 12px; align-items: flex-end; }
    .orb { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .ring { width: 36px; height: 36px; border-radius: 50%; position: relative; display: grid; place-items: center; background: conic-gradient(var(--c) calc(var(--p) * 1%), var(--muted) 0); }
    .ring::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--raised); }
    .ring.disc { background: var(--muted); } .ring.disc::after { inset: 3px; background: var(--card); }
    .ring span { position: relative; z-index: 1; font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; }
    .orb .k { font-family: "Geist Mono", ui-monospace, monospace; font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-fg); }
    .cues { display: flex; gap: 6px; flex-wrap: wrap; }
    .cue { display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 6px; border-radius: 4px; background: var(--muted); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10px; color: var(--muted-fg); }
    .cue.crown { color: var(--crown); }
    .portrait { width: 56px; height: 56px; border-radius: 8px; background: linear-gradient(160deg, oklch(0.5 0.1 300 / 0.7), oklch(0.3 0.06 280)); display: grid; place-items: center; font-family: "Geist Mono", ui-monospace, monospace; font-weight: 600; color: var(--fg); flex: none; }
    .mobile .portrait { width: 64px; height: 64px; }
    .head-row { display: flex; gap: 12px; align-items: center; }
    .stack { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .snap-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 6px 0; align-items: center; }
    .snap-row + .snap-row { border-top: 1px solid var(--border); }
`;

// single-path lucide-ish glyphs (stroke), 24-grid
const ICON = {
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a2.5 2.5 0 1 0 0-5M16 15.5a5 5 0 0 1 5.5 4.5",
  sliders: "M4 6h16M4 12h16M4 18h10M16 10v4",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  activity: "M3 12h4l2-6 4 12 2-6h6",
  crown: "M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4zM4 21h16",
  heart: "M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.4 4.4 0 0 1 8.8-1.2 4.4 4.4 0 0 1 8.8 1.2zM6 11h3l1.5-3 2 6 1.5-3h4",
  pack: "M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2",
  mask: "M4 6c0 7 3 12 8 12s8-5 8-12c-2-1.5-5-2-8-2S6 4.5 4 6zM9 10.5c.6.7 1.5 1 3 1s2.4-.3 3-1",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  book: "M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  id: "M4 5h16v14H4zM8 10a2 2 0 1 0 0 .01M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14 9h4M14 13h4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  palette: "M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 9 9 0 0 0-9-9zM7.5 12a1 1 0 1 0 0 .01M10 7.5a1 1 0 1 0 0 .01M15 7.5a1 1 0 1 0 0 .01",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
};
const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"></path></svg>`;

const META_CHAT = [
  ["members", "Members", ICON.users], ["settings", "This chat", ICON.sliders], ["preview", "Preview", ICON.eye], ["activity", "Activity", ICON.activity],
];
const GAME = [
  ["rpg.status", "Status", ICON.heart], ["rpg.inventory", "Inventory", ICON.pack], ["rpg.scene", "Scene", ICON.mask],
  ["rpg.quests", "Quests", ICON.flag], ["rpg.journal", "Journal", ICON.book], ["rpg.map", "Map", ICON.map, "lock"],
];
const META_CHAR = [
  ["overview", "Overview", ICON.id], ["links", "Links", ICON.link], ["look", "Look", ICON.palette], ["history", "History", ICON.history], ["trust", "Trust", ICON.shield],
];

// ── the WAYSTONE (charts/meter/waystone-*): VIEW 100, ring r42 w5.5, disc r35.5, marker halo at r40 ──
function waystone(hour, weather) {
  const arcs = []; // six arcs tiling 24h, gap 0.17h; drawn as stroke-dasharray segments on r=42
  const circ = 2 * Math.PI * 42;
  const seg = circ / 6, gap = circ * (0.17 / 24);
  const bands = ["night", "dawn", "morning", "afternoon", "dusk", "evening"];
  const lit = Math.floor(((hour + 2) % 24) / 4); // rough: which 4h band is current
  for (let i = 0; i < 6; i++) {
    const rot = -90 + i * 60;
    const on = i === lit;
    arcs.push(`<circle cx="50" cy="50" r="42" fill="none" stroke="${on ? "var(--primary)" : "var(--muted)"}" stroke-width="5.5" stroke-dasharray="${(seg - gap).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(${rot} 50 50)" opacity="${on ? 1 : 0.9}"></circle>`);
  }
  const ang = ((hour / 24) * 360 + 180) % 360; // 0h at bottom, 12h at top
  const rad = (ang - 90) * Math.PI / 180;
  const mx = (50 + 40 * Math.cos(rad)).toFixed(2), my = (50 + 40 * Math.sin(rad)).toFixed(2);
  const sunUp = hour >= 6 && hour <= 18;
  const t = sunUp ? (hour - 6) / 12 : ((hour + 6) % 24) / 12; // 0..1 across the sky
  const cx = (18 + 64 * t).toFixed(1), cy = (62 - 34 * Math.sin(Math.PI * t)).toFixed(1);
  const rain = weather === "storm" ? Array.from({ length: 9 }, (_, i) => `<line x1="${22 + i * 7}" y1="${28 + (i % 3) * 6}" x2="${19 + i * 7}" y2="${40 + (i % 3) * 6}" stroke="oklch(0.8 0.06 230)" stroke-width="1" opacity="0.7"></line>`).join("") : "";
  const clouds = weather === "storm" ? `<path d="M26 40a6 6 0 0 1 11-3 5 5 0 0 1 9 2H26zM50 34a5 5 0 0 1 9-2 4 4 0 0 1 8 2H50z" fill="oklch(0.6 0.03 240)" opacity="0.85"></path>` : weather === "cloudy" ? `<path d="M30 42a6 6 0 0 1 11-3 5 5 0 0 1 9 2H30z" fill="oklch(0.85 0.01 80)" opacity="0.7"></path>` : `<path d="M58 30a4 4 0 0 1 7-2 3 3 0 0 1 6 2H58z" fill="oklch(0.9 0.01 80)" opacity="0.35"></path>`;
  const bolt = weather === "storm" ? `<path d="M52 30l-5 10h5l-4 10" fill="none" stroke="oklch(0.85 0.17 95)" stroke-width="1.6" stroke-linejoin="round"></path>` : "";
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"></stop><stop offset="1" stop-color="var(--sky-low)"></stop></linearGradient>
    <clipPath id="disc"><circle cx="50" cy="50" r="34"></circle></clipPath></defs>
    ${arcs.join("")}
    <circle cx="50" cy="50" r="35.5" fill="var(--sidebar)"></circle>
    <g clip-path="url(#disc)">
      <rect x="14" y="14" width="72" height="72" fill="url(#sky)"></rect>
      ${sunUp ? `<circle cx="${cx}" cy="${cy}" r="5" fill="oklch(0.9 0.14 85)" opacity="0.95"></circle>` : `<circle cx="${cx}" cy="${cy}" r="4.2" fill="oklch(0.92 0.02 90)"></circle><circle cx="${+cx + 2.2}" cy="${+cy - 1.4}" r="3.6" fill="var(--sky-top)"></circle>`}
      ${clouds}${rain}${bolt}
      <path d="M14 66c10-4 18-8 28-6s16 8 26 6 10-4 18-6v26H14z" fill="var(--horizon)"></path>
      <path d="M60 62l4-6 4 6z" fill="var(--horizon)"></path><rect x="63" y="60" width="2" height="2" fill="var(--primary)"></rect>
    </g>
    <circle cx="50" cy="10.5" r="3.1" fill="none" stroke="oklch(0.85 0.12 80)" stroke-width="1.1"></circle>
    <path d="M50 4.5v2M50 14.5v2M44 10.5h2M54 10.5h2" stroke="oklch(0.85 0.12 80)" stroke-width="1"></path>
    <path d="M47.5 87a3.1 3.1 0 1 0 5 2.2 2.4 2.4 0 0 1-5-2.2z" fill="oklch(0.9 0.02 90)" opacity="0.9"></path>
    <circle cx="${mx}" cy="${my}" r="6.4" fill="var(--primary)" opacity="0.25"></circle>
    <circle cx="${mx}" cy="${my}" r="3.2" fill="var(--primary)" stroke="var(--sidebar)" stroke-width="1.2"></circle>
  </svg>`;
}

const cellMarkup = (listName, extraCls = "") => `
        <sc-for list="{{${listName}}}" as="c" hint-placeholder-count="4">
          <button class="{{c.cls}}${extraCls}" type="button" onClick="{{c.pick}}" aria-current="{{c.cur}}"><svg viewBox="0 0 24 24"><path d="{{c.d}}"></path></svg>{{c.label}}<sc-if value="{{c.badge}}" hint-placeholder-val="{{false}}"><span class="badge">{{c.badge}}</span></sc-if><sc-if value="{{c.locked}}" hint-placeholder-val="{{false}}"><svg class="lk" viewBox="0 0 24 24"><path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"></path></svg></sc-if></button>
        </sc-for>`;

function logic(extraState, extraVals) {
  return `
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { tab: ${JSON.stringify(extraState.tab)} }; }
  cells(list) {
    return list.map(([id, label, d, mod]) => ({
      id, label, d, badge: mod && mod !== "lock" ? mod : null,
      cls: (this.state.tab === id ? "cell on" : "cell") + (mod === "lock" ? " lock" : ""),
      cur: this.state.tab === id ? "true" : null, locked: mod === "lock",
      pick: () => this.setState({ tab: id }),
    }));
  }
  renderVals() {
    const dark = this.props.dark ?? true;
    const tab = this.state.tab;
    return { theme: dark ? "t-dark" : "t-light", ${extraVals} };
  }
}`;
}

const propsAttr = `data-props='{"dark":{"editor":"boolean","default":true,"section":"Theme"}}'`;

function doc(body, script, extraCss = "") {
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
  <style>${CSS}${extraCss}</style>
</helmet>
${body}
</x-dc>
<script data-dc-script ${propsAttr}>${script}
</script>
</body>
</html>
`;
}

// ── bodies shared by chat + rpg meta tabs ─────────────────────────────────────
const peopleCast = (mobile) => `
          <div class="sec"><div class="sec-h"><span class="eyebrow">People</span></div>
            <div class="row"><div class="av c">T</div><div><div class="nm">Traveler <span class="meta">· you · host</span></div></div><div class="glyphs"><span>♪</span></div></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Characters</span><span class="act"><button class="btn ghost" type="button">Saved rosters…</button><button class="btn" type="button">+ Add</button></span></div>
            <div class="row"><div class="av a">SV</div><div><div class="nm">Sabine Veyra</div><div class="talk"><i style="width: 50%"></i></div></div><div class="glyphs"><span>◌</span><span>›</span></div></div>
            <div class="row"><div class="av b">ET</div><div><div class="nm">Elias Thorn</div><div class="talk"><i style="width: 35%"></i></div></div><div class="glyphs"><span>◌</span><span>›</span></div></div></div>`;
const thisChat = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Rules · 2</span><span class="act"><button class="btn ghost" type="button">Edit rules</button></span></div>
            <div class="kv"><b>Reply length</b><span class="v"><em>medium</em></span></div><div class="kv"><b>Narration</b><span class="v"><em>on</em> · italic</span></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Injections · 2</span><span class="act"><button class="btn ghost" type="button">Add</button></span></div>
            <div class="kv"><b>Tone guard</b><span class="v">depth 4 · <em>on</em></span></div><div class="kv"><b>House style</b><span class="v">depth 1 · <em>on</em></span></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Overrides</span></div><div class="prose">Nothing overridden — this room runs the <b>Default</b> preset as-is.</div></div>`;
const preview = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Assembly · 1,840 tokens</span><span class="meta">Default preset</span></div>
            <div class="kv"><b>Main</b><span class="v">312</span></div><div class="kv"><b>Description</b><span class="v">421</span></div><div class="kv"><b>Personality</b><span class="v">96</span></div><div class="kv"><b>Chat history</b><span class="v">~980</span></div></div>
          <div class="hint">Order and budgets come from the preset's <b>Prompt</b> rack; this is the read.</div>`;
const activity = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Automation</span></div>
            <div class="kv"><b>Autosave</b><span class="v"><em>fired</em> · 2m ago</span></div><div class="kv"><b>Memory sweep</b><span class="v">idle</span></div></div>
          <div class="hint">Rules that ran in this room, newest first. Nothing is hidden here — an inert rule says so.</div>`;

const metaBodies = (mobile) => `
        <sc-if value="{{isMembers}}" hint-placeholder-val="{{true}}">${peopleCast(mobile)}</sc-if>
        <sc-if value="{{isSettings}}" hint-placeholder-val="{{false}}">${thisChat}</sc-if>
        <sc-if value="{{isPreview}}" hint-placeholder-val="{{false}}">${preview}</sc-if>
        <sc-if value="{{isActivity}}" hint-placeholder-val="{{false}}">${activity}</sc-if>`;

const metaVals = `meta: this.cells(META), isMembers: tab === "members", isSettings: tab === "settings", isPreview: tab === "preview", isActivity: tab === "activity"`;

// ── CHAT ROOM ────────────────────────────────────────────────────────────────
function chatRoom(mobile) {
  const w = mobile ? 430 : 384, h = mobile ? 860 : 800;
  const body = `
<div class="root {{theme}}" style="width: ${w}px; height: ${h}px;">
  <div class="pane${mobile ? " mobile" : ""}" style="width: ${w}px; height: ${h}px;">
    <div class="band">
      <div class="title">Example — Midnight Run</div>
      <div class="chips"><span class="chip on"><span class="dot"></span>3 members</span><span class="chip"><span class="dot idle"></span>Memory idle</span><span class="chip">Default preset</span></div>
    </div>
    <div class="view">${metaBodies(mobile)}</div>
    <div class="ground"></div>
    <div class="rail own foot">
      <div class="kick"><span>Chat · <span class="sel">{{selLabel}}</span></span></div>
      <div class="cells"${mobile ? ' style="padding: 8px 8px 10px"' : ""}>${cellMarkup("meta", mobile ? " tall" : "")}</div>
    </div>
  </div>
</div>`;
  const script = `const META = ${JSON.stringify(META_CHAT)};` + logic({ tab: "members" }, `${metaVals}, selLabel: (META.find(c => c[0] === tab) || META[0])[1]`);
  return doc(body, script, mobile ? ".tall { min-height: 52px; }" : "");
}

// ── RPG ROOM ─────────────────────────────────────────────────────────────────
function rpgRoom(mobile) {
  const w = mobile ? 430 : 384, h = mobile ? 860 : 800;
  const status = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Roster</span><span class="meta">initiative · round 3</span></div>
            <div class="row"><div class="av a">SV</div><div><div class="nm">Sabine Veyra</div><div class="meta">Warden 2 · VIT 14/20</div></div><div class="cond"><span class="w">bleeding</span></div></div>
            <div class="row"><div class="av b">ET</div><div><div class="nm">Elias Thorn</div><div class="meta">Scribe 1 · VIT 9/12</div></div><div class="cond"><span>lantern</span></div></div>
            <div class="row"><div class="av c">T</div><div><div class="nm">Traveler <span class="meta">· you</span></div><div class="meta">VIT 14/20 · MAN 4/10</div></div><div class="cond"><span>your turn</span></div></div></div>`;
  const inventory = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Pack · Traveler</span><span class="meta">37 gold</span></div>
            <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px;">
              <div class="hint" style="aspect-ratio: 1; padding: 4px; display: grid; place-items: center;">lantern</div><div class="hint" style="aspect-ratio: 1; padding: 4px; display: grid; place-items: center;">rope ×2</div><div class="hint" style="aspect-ratio: 1; padding: 4px; display: grid; place-items: center;">key</div><div class="hint" style="aspect-ratio: 1; padding: 4px;"></div><div class="hint" style="aspect-ratio: 1; padding: 4px;"></div>
            </div></div>`;
  const scene = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Now</span></div><div class="prose"><b>The outer stair, dusk, a storm rolling in.</b> Sabine holds the landing; Elias has the lantern. Goal: reach the bell before the rain does.</div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Last beats</span></div><div class="kv"><b>Elias takes the lantern</b><span class="v">2 turns ago</span></div><div class="kv"><b>The door gives</b><span class="v">4 turns ago</span></div></div>`;
  const quests = `<div class="sec"><div class="sec-h"><span class="eyebrow">Active</span></div><div class="kv"><b>Ring the spire bell</b><span class="v"><em>2</em>/4</span></div><div class="kv"><b>Find the warden's ledger</b><span class="v">0/3</span></div></div>`;
  const journal = `<div class="sec"><div class="sec-h"><span class="eyebrow">Record</span></div><div class="prose">The record starts when the story does. Session 1 — <b>the ashen road</b>, 14 beats.</div></div>`;
  const map = `<div class="hint"><b>Map</b> is locked until region maps land (world maps, #27). This cell opens onto this sentence for mouse, keyboard and screen reader alike — never a dead click.</div>`;
  const game = `<div class="sec"><div class="sec-h"><span class="eyebrow">Host console</span><span class="cue">host only</span></div>
            <div class="kv"><b>Mode</b><span class="v"><em>lite</em> · graduate to full</span></div><div class="kv"><b>Trackers</b><span class="v">VIT · MAN · GOLD · <em>edit</em></span></div><div class="kv"><b>Stat profile</b><span class="v">4 attributes · <em>edit</em></span></div></div>
          <div class="hint">The editor that used to sit on Status lives here — Status is a read; Game is where the host changes things.</div>`;
  const body = `
<div class="root {{theme}}" style="width: ${w}px; height: ${h}px;">
  <div class="pane${mobile ? " mobile" : ""}" style="width: ${w}px; height: ${h}px;">
    <div class="band" style="gap: 8px;">
      <div class="ws">
        ${waystone(18.6, "storm")}
        <div class="stack">
          <div class="title" style="font-size: 15px;">The Ashen Spire</div>
          <div class="gloss mono" style="font-variant-numeric: tabular-nums;">day 4 · dusk · storm</div>
          <div class="cues"><span class="cue">tool-round</span><span class="cue crown">2 veiled</span></div>
        </div>
      </div>
      <div class="sat">
        <div class="orb"><div class="ring" style="--c: var(--destructive); --p: 70;"><span>14</span></div><div class="k">VIT 14/20</div></div>
        <div class="orb"><div class="ring" style="--c: var(--info); --p: 40;"><span>4</span></div><div class="k">MAN 4/10</div></div>
        <div class="orb"><div class="ring disc"><span>37</span></div><div class="k">GOLD</div></div>
      </div>
    </div>
    <div class="rail top {{gameCls}}">
      <div class="kick"><span>Game state<sc-if value="{{gameOwns}}" hint-placeholder-val="{{true}}"> · <span class="sel">{{selLabel}}</span></sc-if></span></div>
      <div class="cells">${cellMarkup("game", mobile ? " tall" : "")}</div>
    </div>
    <div class="view">
      <sc-if value="{{isStatus}}" hint-placeholder-val="{{true}}">${status}</sc-if>
      <sc-if value="{{isInventory}}" hint-placeholder-val="{{false}}">${inventory}</sc-if>
      <sc-if value="{{isScene}}" hint-placeholder-val="{{false}}">${scene}</sc-if>
      <sc-if value="{{isQuests}}" hint-placeholder-val="{{false}}">${quests}</sc-if>
      <sc-if value="{{isJournal}}" hint-placeholder-val="{{false}}">${journal}</sc-if>
      <sc-if value="{{isMap}}" hint-placeholder-val="{{false}}">${map}</sc-if>
      <sc-if value="{{isGame}}" hint-placeholder-val="{{false}}">${game}</sc-if>
      ${metaBodies(mobile)}
    </div>
    <div class="ground"></div>
    <div class="rail foot {{metaCls}}">
      <div class="kick"><span>Chat<sc-if value="{{metaOwns}}" hint-placeholder-val="{{false}}"> · <span class="sel">{{selLabel}}</span></sc-if></span></div>
      <div class="cells"${mobile ? ' style="padding: 8px 8px 10px"' : ""}>${cellMarkup("meta", mobile ? " tall" : "")}</div>
    </div>
  </div>
</div>`;
  const metaRpg = [...META_CHAT, ["rpg.game", "Game", ICON.crown]];
  const script = `const META = ${JSON.stringify(metaRpg)}; const GAME = ${JSON.stringify(GAME)};` + logic({ tab: "rpg.status" }, `${metaVals}, game: this.cells(GAME),
      isStatus: tab === "rpg.status", isInventory: tab === "rpg.inventory", isScene: tab === "rpg.scene", isQuests: tab === "rpg.quests", isJournal: tab === "rpg.journal", isMap: tab === "rpg.map", isGame: tab === "rpg.game",
      gameOwns: GAME.some(c => c[0] === tab), metaOwns: META.some(c => c[0] === tab),
      gameCls: GAME.some(c => c[0] === tab) ? "own" : "recede", metaCls: META.some(c => c[0] === tab) ? "own" : "recede",
      selLabel: ([...GAME, ...META].find(c => c[0] === tab) || GAME[0])[1]`);
  return doc(body, script, (mobile ? ".tall { min-height: 50px; }" : "") + " .rail.top.own { background: var(--raised); }");
}

// ── CHARACTER ────────────────────────────────────────────────────────────────
function character(mobile) {
  const w = mobile ? 430 : 384, h = mobile ? 860 : 800;
  const overview = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Origin</span></div>
            <div class="kv"><b>Source</b><span class="v"><em>Example — shipped with Orbweaver</em></span></div><div class="kv"><b>Added</b><span class="v">Aug 2, 2026</span></div><div class="kv"><b>Tokens</b><span class="v"><em>1,257</em> · 1,017 permanent</span></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Activity</span></div>
            <div class="kv"><b>Last chat</b><span class="v">Example — Midnight Run · 3h</span></div><div class="kv"><b>Chats</b><span class="v"><em>1</em></span></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Tags</span><span class="act"><button class="btn ghost" type="button">Add tag</button></span></div><div class="cond"><span>fantasy</span><span>rpg-ready</span></div></div>`;
  const links = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Chats · 1</span></div><div class="row"><div class="av c">MR</div><div><div class="nm">Example — Midnight Run</div><div class="meta">host · 3h ago</div></div><div class="glyphs"><span>›</span></div></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Personas</span></div><div class="prose">No persona converted from her yet — <b>Convert to persona</b> lives in her actions.</div></div>`;
  const look = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Own look</span><span class="switch on"><i></i>carried</span></div>
            <div class="kv"><b><span class="sw" style="background: oklch(0.15 0.0105 238);"></span>Background</b><span class="v"><em>Custom</em></span></div>
            <div class="kv"><b><span class="sw" style="background: oklch(0.75 0.12 68);"></span>Accent</b><span class="v"><em>Custom</em></span></div>
            <div class="kv"><b><span class="sw" style="background: transparent;"></span>Border</b><span class="v">Inherit</span></div>
            <div class="kv"><b><span class="sw" style="background: oklch(0.85 0.1 62);"></span>Dialogue</b><span class="v"><em>Custom</em></span></div>
            <div class="kv"><b><span class="sw" style="background: oklch(0.76 0.03 240);"></span>Narration</b><span class="v"><em>Custom</em></span></div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Background</span></div><div class="hint">Drop an image, or pick one from the gallery. Art stays in the gutters — never behind prose.</div></div>`;
  const history = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Snapshots · 2</span><span class="act"><button class="btn primary" type="button">Snapshot now</button></span></div>
            <div class="snap-row"><div><div class="nm">Before the hub re-import</div><div class="meta">Aug 28 · 1,301 tokens</div></div><button class="btn ghost" type="button">Restore</button></div>
            <div class="snap-row"><div><div class="nm">First edit</div><div class="meta">Aug 2 · 1,190 tokens</div></div><button class="btn ghost" type="button">Restore</button></div></div>
          <div class="hint">A snapshot captures the whole card. Restoring makes a new snapshot first, so nothing is ever lost.</div>`;
  const trust = `
          <div class="sec"><div class="sec-h"><span class="eyebrow">Trust</span><span class="cue">source: bundled</span></div>
            <div class="prose">Cards can carry scripts and regex. <b>Sabine's carry none.</b> Anything she gains through an import shows up here first and runs only after you say so.</div></div>
          <div class="sec"><div class="sec-h"><span class="eyebrow">Scripts · 0</span></div><div class="prose">Nothing attached.</div></div>`;
  const body = `
<div class="root {{theme}}" style="width: ${w}px; height: ${h}px;">
  <div class="pane${mobile ? " mobile" : ""}" style="width: ${w}px; height: ${h}px;">
    <div class="band">
      <div class="head-row">
        <div class="portrait">SV</div>
        <div class="stack">
          <div class="title">Sabine Veyra</div>
          <div class="gloss">Warden of the outer stair · <span class="mono">@sabine</span></div>
          <div class="chips"><span class="chip on">Own look</span><span class="chip"><span class="dot"></span>1 chat</span><span class="chip">1,257 tokens</span></div>
        </div>
      </div>
    </div>
    <div class="view">
      <sc-if value="{{isOverview}}" hint-placeholder-val="{{true}}">${overview}</sc-if>
      <sc-if value="{{isLinks}}" hint-placeholder-val="{{false}}">${links}</sc-if>
      <sc-if value="{{isLook}}" hint-placeholder-val="{{false}}">${look}</sc-if>
      <sc-if value="{{isHistory}}" hint-placeholder-val="{{false}}">${history}</sc-if>
      <sc-if value="{{isTrust}}" hint-placeholder-val="{{false}}">${trust}</sc-if>
    </div>
    <div class="ground"></div>
    <div class="rail own foot">
      <div class="kick"><span>Character · <span class="sel">{{selLabel}}</span></span></div>
      <div class="cells"${mobile ? ' style="padding: 8px 8px 10px"' : ""}>${cellMarkup("meta", mobile ? " tall" : "")}</div>
    </div>
  </div>
</div>`;
  const script = `const META = ${JSON.stringify(META_CHAR)};` + logic({ tab: "overview" }, `meta: this.cells(META), isOverview: tab === "overview", isLinks: tab === "links", isLook: tab === "look", isHistory: tab === "history", isTrust: tab === "trust", selLabel: (META.find(c => c[0] === tab) || META[0])[1]`);
  return doc(body, script, mobile ? ".tall { min-height: 52px; }" : "");
}

// ── MAIN: the system sheet ───────────────────────────────────────────────────
function main() {
  const slot = (name, sub, h, tone) => `<div style="display: grid; grid-template-columns: 1fr; padding: 10px 12px; min-height: ${h}px; background: ${tone}; border-bottom: 1px solid var(--border);"><div class="eyebrow" style="color: var(--fg);">${name}</div><div class="gloss">${sub}</div></div>`;
  const body = `
<div class="root {{theme}}" style="width: 1440px; height: 900px; padding: 40px 48px; display: grid; grid-template-columns: 384px 1fr; gap: 48px; align-items: start;">
  <div>
    <div class="eyebrow" style="margin-bottom: 8px;">The bracket — one column, five slots</div>
    <div class="pane" style="width: 384px; height: 760px;">
      ${slot("Head — the artifact band", "Room: title + chips. Game: the Waystone, the when-line, the pool orbs. Character: portrait, name, chips. One slot, three contents — never a second head.", 96, "var(--raised)")}
      ${slot("Top rail — the section's lenses (optional)", "Present only when a lens applies (a game's state tabs). Applicability, not hiding: a lens with nothing to show is absent, not empty.", 78, "var(--ember)")}
      <div style="flex: 0 1 auto; padding: 10px 12px; min-height: 300px;"><div class="eyebrow" style="color: var(--fg);">Viewport — the selected view</div><div class="gloss">Scrolls internally. Sections with kickers; one job per section. A short body takes its natural height (the dead-zone rule).</div></div>
      <div style="flex: 1 1 auto; min-height: 60px; padding: 10px 12px; background: repeating-linear-gradient(135deg, transparent 0 8px, var(--border) 8px 9px);"><div class="eyebrow">Ground — the residual span</div></div>
      ${slot("Foot rail — the meta tabs, pinned", "Members · This chat · Preview · Activity (+ Game for a host). Kicker on TOP, naming the group and the selection. Same cell, same rules, every section.", 78, "var(--raised)")}
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 32px; align-content: start;">
    <div style="grid-column: 1 / -1;">
      <div class="title" style="font-size: 22px;">Context panel system</div>
      <div class="prose" style="font-size: 14px; max-width: 70ch; margin-top: 6px;">Chats, game rooms and characters share <b>one panel chrome</b>: a head that names the artifact, an optional top rail of lenses, a scrolling body, and a foot rail of meta tabs pinned where the thumb is. The game room already has this shape (decision 6, the OSRS bracket); this extends it to every section instead of forking the strip by room type.</div>
    </div>
    <div><div class="eyebrow" style="margin-bottom: 6px;">Rules that keep it one system</div>
      <div class="kv"><b>Kickers sit on top of their rail</b><span class="v">the rule IS the rail's edge</span></div>
      <div class="kv"><b>The rail that owns the selection is raised</b><span class="v">the other recedes</span></div>
      <div class="kv"><b>Icon + caption, always</b><span class="v">#208 · never glyph-only</span></div>
      <div class="kv"><b>aria-current + arrows on every rail</b><span class="v">#112 · one tab stop</span></div>
      <div class="kv"><b>A locked cell explains itself</b><span class="v">opens onto the reason</span></div>
      <div class="kv"><b>The head owns the name's budget</b><span class="v">2 lines · chips below, never beside</span></div>
    </div>
    <div><div class="eyebrow" style="margin-bottom: 6px;">How it grows</div>
      <div class="kv"><b>A new meta tab</b><span class="v">one row in the section's <em>tabs</em>, strip: meta</span></div>
      <div class="kv"><b>A new lens</b><span class="v">strip: game (or the section's own) + a <em>when</em></span></div>
      <div class="kv"><b>A plugin panel</b><span class="v">a meta tab with a page anchor</span></div>
      <div class="kv"><b>A new section</b><span class="v">a head content + a meta roster — no new chrome</span></div>
      <div class="kv"><b>Mobile</b><span class="v">the same column at 430 · 52px cells</span></div>
      <div class="kv"><b>Light theme</b><span class="v">tokens only — flip the tweak above</span></div>
    </div>
    <div style="grid-column: 1 / -1;" class="hint">What changes on the tree: <b>ContextTabsPanel</b>'s head strip retires and <b>ContextRegionHost</b>'s column becomes the one composition; the Characters section gets a head band and a five-tab meta roster (Overview · Links · Look · History · Trust — the Options junk drawer split); the room title leaves the CONTENT header row (#846). Unchanged: D62 pane mechanics, CP-1's roster, <span class="mono">contextTab</span> as the one selection seam, the Waystone.</div>
  </div>
</div>`;
  return doc(body, `class Component extends DCLogic { renderVals() { return { theme: (this.props.dark ?? true) ? "t-dark" : "t-light" }; } }`);
}

const files = {
  "Main.dc.html": main(),
  "ChatRoom.dc.html": chatRoom(false),
  "RpgRoom.dc.html": rpgRoom(false),
  "Character.dc.html": character(false),
  "ChatRoomMobile.dc.html": chatRoom(true),
  "RpgRoomMobile.dc.html": rpgRoom(true),
  "CharacterMobile.dc.html": character(true),
};
for (const [name, src] of Object.entries(files)) writeFileSync(name, src);

const canvas = {
  pages: [{ id: "desktop", name: "Desktop · 384px pane" }, { id: "mobile", name: "Phone · 430px" }],
  artboards: [
    { file: "Main.dc.html", x: 0, y: 0, w: 1440, h: 900, page: "desktop", title: "The system" },
    { file: "ChatRoom.dc.html", x: 0, y: 1040, w: 384, h: 800, page: "desktop", title: "Chat room", is_interactive: true },
    { file: "RpgRoom.dc.html", x: 480, y: 1040, w: 384, h: 800, page: "desktop", title: "Game room", is_interactive: true },
    { file: "Character.dc.html", x: 960, y: 1040, w: 384, h: 800, page: "desktop", title: "Character", is_interactive: true },
    { file: "ChatRoomMobile.dc.html", x: 0, y: 0, w: 430, h: 860, page: "mobile", title: "Chat room · phone", is_interactive: true },
    { file: "RpgRoomMobile.dc.html", x: 520, y: 0, w: 430, h: 860, page: "mobile", title: "Game room · phone", is_interactive: true },
    { file: "CharacterMobile.dc.html", x: 1040, y: 0, w: 430, h: 860, page: "mobile", title: "Character · phone", is_interactive: true },
  ],
  annotations: [
    { id: "click-the-rails", x: 0, y: 960, w: 420, text: "Click the rails — every tab switches the body. The raised rail is the one that owns the selection; the kicker names it.", page: "desktop" },
    { id: "waystone-note", x: 480, y: 1880, w: 384, text: "The Waystone is the real dial: six 24h arcs (the current one lit), the sky disc with the storm, the horizon gable, the ember hour hand at 18:40. Pools beneath it: arcs for ceilinged pools, a disc for gold (a max-less quantity never wears an arc).", page: "desktop" },
  ],
  launch: { view: "canvas", page: "desktop" },
};
writeFileSync("canvas.json", JSON.stringify(canvas, null, 2));
console.log("wrote", Object.keys(files).length, "artboards + canvas.json");
