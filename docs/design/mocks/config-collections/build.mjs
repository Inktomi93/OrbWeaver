// Config collections → CONTENT (#1725), canvas v3 — redrawn after the stickler + side-eye reviews of v2.
// Owner ruling 2026-09-05: a collection's member list leaves the LIST pane; the band is the door; the library
// opens in CONTENT; a member drills in behind a Back. Everything drawn is a verb or a field the four
// contributions declare today (tag/regex/world-info/roster *-collection.tsx); the LIST anatomy is the LIVE one
// (config-list-group.tsx SectionsBand: ghost Button sm · chevron gutter · icon · interactiveKicker · Badge).
import { writeFileSync } from "node:fs";

const CSS = `
:root { color-scheme: dark; --bg: oklch(0.158 0.006 60); --fg: oklch(0.955 0.004 75); --card: oklch(0.205 0.006 60); --raised: oklch(0.185 0.006 60); --sidebar: oklch(0.132 0.006 60); --muted: oklch(0.255 0.006 60); --muted-fg: oklch(0.74 0.008 65); --primary: oklch(0.72 0.175 52); --primary-fg: oklch(0.19 0.03 50); --border: oklch(0.99 0.005 60 / 0.08); --input-border: oklch(0.68 0.005 70); --tint: oklch(0.72 0.175 52 / 0.16); --danger: oklch(0.7 0.17 25); --canvas: oklch(0.11 0.004 60); --canvas-fg: oklch(0.8 0.006 65); }
:root[data-theme="light"] { color-scheme: light; --bg: oklch(0.98 0.004 75); --fg: oklch(0.24 0.01 60); --card: oklch(0.995 0.003 75); --raised: oklch(0.965 0.005 75); --sidebar: oklch(0.955 0.006 72); --muted: oklch(0.95 0.006 70); --muted-fg: oklch(0.44 0.01 65); --primary: oklch(0.55 0.16 50); --primary-fg: oklch(0.99 0.01 75); --border: oklch(0.2 0.01 60 / 0.12); --input-border: oklch(0.51 0.008 70); --tint: oklch(0.55 0.16 50 / 0.14); --danger: oklch(0.5 0.17 25); --canvas: oklch(0.9 0.006 72); --canvas-fg: oklch(0.35 0.01 60); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--canvas-fg); font-family: Geist, ui-sans-serif, system-ui, sans-serif; font-size: 13px; line-height: 1.45; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.mono { font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace; }
.kicker { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
.ikicker { font-family: "Geist Mono", ui-monospace, monospace; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg); }
.ico { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }
/* canvas */
.canvas { padding: 28px 32px 64px; display: flex; flex-direction: column; gap: 40px; }
.canvas-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; max-width: 1440px; }
.canvas-head h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--fg); text-wrap: balance; }
.canvas-head p { margin: 6px 0 0; max-width: 70ch; }
.tool { height: 30px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); font-size: 12.5px; font-weight: 500; }
.board { display: flex; flex-direction: column; gap: 10px; }
.board-title { display: flex; gap: 12px; align-items: baseline; }
.board-title b { font-weight: 600; color: var(--fg); font-size: 14px; }
.frame { position: relative; overflow: hidden; border: 1.25px solid var(--border); background: var(--bg); color: var(--fg); box-shadow: 0 20px 60px oklch(0 0 0 / 0.25); }
.frame.desk { width: 1440px; height: 900px; }
.frame.phone { width: 430px; height: 860px; border-radius: 22px; }
.phones { display: flex; gap: 40px; flex-wrap: wrap; }
.wrap { overflow-x: auto; }
.notes { max-width: 1440px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.note { border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--fg); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.note .k { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); }
.note p { margin: 0; color: var(--muted-fg); } .note p b { color: var(--fg); font-weight: 500; }
/* shell: rail · list · main(topbar + content) · context */
.shell { display: grid; grid-template-columns: 56px 320px minmax(0, 1fr) 384px; grid-template-rows: 48px minmax(0, 1fr); height: 100%; }
.rail { grid-row: 1 / 3; background: var(--sidebar); border-right: 1.25px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 10px 0; gap: 6px; }
.rail .g { width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center; color: var(--muted-fg); }
.rail .g .ico { width: 19px; height: 19px; }
.rail .g.on { background: var(--tint); color: var(--fg); }
.rail .end { margin-top: auto; }
.av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: oklch(0.6 0.12 60 / 0.5); color: var(--fg); font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; font-weight: 600; }
.list { grid-row: 1 / 3; background: var(--sidebar); border-right: 1.25px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.band { display: flex; justify-content: space-between; align-items: center; padding: 0 14px; height: 48px; border-bottom: 1.25px solid var(--border); flex: none; }
.band .t { font-size: 15px; font-weight: 600; }
.lsearch { margin: 10px 12px 6px; height: 32px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card); color: var(--muted-fg); padding: 0 10px; font-size: 12.5px; display: flex; align-items: center; justify-content: space-between; }
.lsearch .kbd { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; }
.shelf { padding: 10px 12px 2px; }
.shelf .kicker { display: block; }
.bands { padding: 2px 6px 6px; display: flex; flex-direction: column; gap: 1px; }
/* the ONE band kind (SectionsBand): ghost sm button · 16px chevron gutter · icon · interactiveKicker · badges */
.gband { display: flex; align-items: center; gap: 6px; width: 100%; height: 32px; padding: 0 6px; border-radius: 6px; color: var(--fg); position: relative; min-width: 0; }
.gband:hover { background: var(--muted); }
.gband .chev { width: 16px; height: 16px; color: var(--muted-fg); flex: none; transition: transform 120ms ease; }
.gband .chev.hide { visibility: hidden; }
.gband .chev.closed { transform: rotate(-90deg); }
.gband .ikicker { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gband.on { background: var(--tint); }
.gband.on::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: var(--primary); border-radius: 1px; }
.gband .n { margin-left: auto; font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; color: var(--muted-fg); font-variant-numeric: tabular-nums; }
.badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; background: oklch(0.99 0.005 60 / 0.08); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10px; color: var(--muted-fg); letter-spacing: 0.04em; white-space: nowrap; }
:root[data-theme="light"] .badge { background: oklch(0.2 0.01 60 / 0.08); }
.subs { padding: 2px 0 6px 28px; display: flex; flex-direction: column; gap: 1px; }
.subs .s { display: flex; align-items: center; justify-content: space-between; min-height: 30px; padding: 0 10px; border-radius: 5px; font-size: 13px; color: var(--muted-fg); position: relative; }
.subs .s.spy { color: var(--fg); background: var(--tint); }
.subs .s.spy::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: var(--primary); }
/* topbar over MAIN */
.topbar { grid-column: 3; grid-row: 1; display: flex; align-items: center; gap: 8px; padding: 0 12px 0 8px; border-bottom: 1.25px solid var(--border); background: var(--bg); min-width: 0; }
.topbar .lead { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); flex: none; }
.topbar .ident { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.topbar .ident .t { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar .ident .n { font-family: "Geist Mono", ui-monospace, monospace; font-size: 12px; color: var(--muted-fg); font-variant-numeric: tabular-nums; }
.topbar .trail { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted-fg); font-size: 12px; }
.chip .kbd { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; }
.ibtn { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); }
.ibtn:hover, .ibtn.on { background: var(--tint); color: var(--fg); }
/* CONTENT */
.content { grid-column: 3; grid-row: 2; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); min-width: 0; }
.cbody { padding: 18px 24px 24px; display: flex; flex-direction: column; gap: 16px; overflow: auto; flex: 1 1 auto; max-width: 760px; width: 100%; }
.cbody > * { flex: none; }
.drill { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.back { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px 0 6px; border-radius: 6px; color: var(--muted-fg); font-size: 12.5px; }
.back:hover { color: var(--fg); background: var(--muted); }
.drill .name { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drill .acts { margin-left: auto; display: flex; gap: 8px; flex: none; }
.controls { display: flex; gap: 8px; align-items: center; }
.filter { flex: 1 1 auto; max-width: 360px; height: 32px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card); color: var(--muted-fg); padding: 0 10px; font-size: 12.5px; display: flex; align-items: center; justify-content: space-between; }
.filter .kbd { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; }
.sel { height: 32px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card); padding: 0 10px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; color: var(--fg); }
.sel .v { color: var(--muted-fg); }
.btn { height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); font-size: 12.5px; font-weight: 500; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
.btn.ghost { background: transparent; }
.btn.on { background: var(--tint); border-color: var(--primary); }
.btn.danger { color: var(--danger); }
.btn .ico { width: 14px; height: 14px; stroke-width: 2; }
.insights { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.insight { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; min-height: 36px; padding: 0 12px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.insight:last-child { border-bottom: 0; }
.insight .v { font-family: "Geist Mono", ui-monospace, monospace; color: var(--muted-fg); font-variant-numeric: tabular-nums; }
.insight .door { color: var(--primary); font-size: 12px; }
.lib { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--card); }
.lrow { display: grid; grid-template-columns: var(--lead, 0px) minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 0 8px 0 12px; min-height: 44px; border-bottom: 1px solid var(--border); }
.lrow:last-child { border-bottom: 0; }
.lrow:hover { background: var(--raised); }
.lrow .lead { display: flex; align-items: center; gap: 8px; }
.lrow .open { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding: 7px 0; color: var(--fg); width: 100%; }
.lrow .ttl { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 8px; align-items: center; }
.lrow .sub { font-size: 11.5px; color: var(--muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 8px; align-items: center; }
.lrow .acts { display: flex; align-items: center; gap: 4px; }
.kebab { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); }
.kebab:hover { background: var(--muted); color: var(--fg); }
.kebab svg { width: 16px; height: 16px; fill: currentColor; }
.sw { width: 14px; height: 14px; border-radius: 4px; border: 1px solid oklch(0 0 0 / 0.2); flex: none; }
.handle { width: 16px; height: 32px; color: var(--muted-fg); display: grid; place-items: center; cursor: grab; }
.handle svg { width: 12px; height: 12px; fill: currentColor; }
.stages { display: inline-flex; gap: 3px; align-items: center; }
.stages i { width: 9px; height: 9px; border-radius: 2px; border: 1px solid var(--muted-fg); display: inline-block; opacity: 0.55; }
.stages i.on { background: var(--primary); border-color: var(--primary); opacity: 1; }
.mark { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 999px; background: var(--muted); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10px; color: var(--muted-fg); text-transform: uppercase; letter-spacing: 0.06em; }
.cb { width: 18px; height: 18px; border: 1px solid var(--input-border); border-radius: 4px; display: grid; place-items: center; background: var(--card); margin: 0 7px; }
.cb.on { background: var(--primary); border-color: var(--primary); }
.cb.on::after { content: ""; width: 9px; height: 5px; border-left: 2px solid var(--primary-fg); border-bottom: 2px solid var(--primary-fg); transform: translateY(-1px) rotate(-45deg); }
.selbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--border); background: var(--raised); }
.selbar .acts { display: flex; gap: 8px; }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px; border: 1px dashed var(--border); border-radius: 8px; max-width: 520px; }
.empty h2 { margin: 0; font-size: 16px; font-weight: 600; } .empty p { margin: 0; color: var(--muted-fg); max-width: 48ch; }
/* editors + settings */
.ed { display: flex; flex-direction: column; gap: 14px; }
.sec { display: flex; flex-direction: column; gap: 2px; }
.sec-h { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--border); }
.sec-h .k { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
.sec-h.spy .k { color: var(--fg); }
.field { display: grid; grid-template-columns: 1fr 280px; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.field .l { font-weight: 500; } .field .g { font-size: 11.5px; color: var(--muted-fg); }
.ctl { height: 32px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card); padding: 0 10px; font-size: 12.5px; color: var(--fg); display: flex; justify-content: space-between; align-items: center; }
.ctl .v { color: var(--muted-fg); }
.ta { min-height: 84px; padding: 8px 10px; line-height: 1.45; align-items: flex-start; font-family: "Geist Mono", ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; }
.seg { display: inline-flex; border: 1px solid var(--input-border); border-radius: 6px; overflow: hidden; height: 32px; justify-self: end; }
.seg span { padding: 0 12px; line-height: 30px; font-size: 12.5px; color: var(--muted-fg); }
.seg span.on { background: var(--tint); color: var(--fg); }
.switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted-fg); justify-self: end; }
.switch i { width: 28px; height: 16px; border-radius: 8px; background: var(--muted); position: relative; display: inline-block; }
.switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--muted-fg); }
.switch.on i { background: var(--primary); } .switch.on i::after { left: 14px; background: var(--primary-fg); }
.swatches { display: flex; gap: 6px; justify-self: end; }
.swatches i { width: 22px; height: 22px; border-radius: 6px; border: 1px solid oklch(0 0 0 / 0.2); }
.swatches i.on { outline: 2px solid var(--primary); outline-offset: 2px; }
/* CONTEXT (the teacher) */
.ctx { grid-column: 4; grid-row: 1 / 3; background: var(--sidebar); border-left: 2px solid var(--primary); display: flex; flex-direction: column; overflow: hidden; }
.cband { padding: 12px 12px 10px; background: var(--raised); border-bottom: 1.25px solid var(--border); display: flex; flex-direction: column; gap: 4px; min-height: 48px; justify-content: center; }
.cband .t { font-size: 15px; font-weight: 600; } .cband .gloss { font-size: 12px; color: var(--muted-fg); }
.cview { padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.cview p { margin: 0; color: var(--muted-fg); font-size: 12.5px; }
.cview p b { color: var(--fg); font-weight: 500; }
.roster { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.roster .r { display: grid; grid-template-columns: 1fr auto; gap: 8px; min-height: 32px; align-items: center; padding: 0 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
.roster .r:last-child { border-bottom: 0; }
.roster .r .v { font-family: "Geist Mono", ui-monospace, monospace; color: var(--muted-fg); font-variant-numeric: tabular-nums; }
.cempty { padding: 14px 12px; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted-fg); font-size: 12.5px; }
.ground { flex: 1 1 auto; }
.kick { display: flex; justify-content: space-between; padding: 6px 12px 4px; border-top: 1.25px solid var(--border); border-bottom: 1px solid var(--border); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); background: var(--raised); }
.kick .sel2 { color: var(--fg); }
.cells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(max-content, 1fr); gap: 4px; padding: 6px 8px 8px; background: var(--raised); }
.cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 44px; justify-content: center; border-radius: 6px; color: var(--muted-fg); font-size: 10.5px; font-weight: 500; }
.cell.on { color: var(--fg); background: var(--tint); }
/* phone */
.ph { display: flex; flex-direction: column; height: 100%; background: var(--bg); color: var(--fg); position: relative; }
.ph .top { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1.25px solid var(--border); min-height: 56px; }
.ph .top .t { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ph .top .t .n { font-family: "Geist Mono", ui-monospace, monospace; font-size: 12px; color: var(--muted-fg); margin-left: 6px; }
.ph .top .trail { display: flex; gap: 2px; }
.ph .ib { width: 44px; height: 44px; border-radius: 8px; display: grid; place-items: center; color: var(--fg); }
.ph .ib.on { background: var(--tint); }
.ph .ib .ico { width: 20px; height: 20px; stroke-width: 2; }
.ph .body { flex: 1 1 auto; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 12px 12px 16px; }
.ph .lrow { min-height: 48px; } .ph .lrow .ttl { font-size: 14px; }
.ph .gband { height: 44px; } .ph .subs .s { min-height: 40px; }
.ph .kebab, .ph .handle { width: 44px; height: 44px; }
.ph .filter { max-width: none; height: 44px; font-size: 14px; }
.ph .sel, .ph .btn { height: 44px; font-size: 14px; }
.ph .field { grid-template-columns: 1fr; gap: 6px; }
.ph .cells .cell { min-height: 48px; }
.tabbar { margin-top: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1.25px solid var(--border); background: var(--sidebar); height: 60px; }
.tabbar .tb { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 10.5px; color: var(--muted-fg); }
.tabbar .tb.on { color: var(--fg); }
.tabbar .tb .ico { width: 20px; height: 20px; }
.scrim { position: absolute; inset: 0 0 60px 0; background: oklch(0 0 0 / 0.35); }
.sheet { position: absolute; left: 0; right: 0; bottom: 60px; top: 120px; background: var(--sidebar); border-top: 2px solid var(--primary); border-radius: 14px 14px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -12px 32px oklch(0 0 0 / 0.35); }
.sheet .shead { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 0 12px; }
.sheet .ctx { border-left: 0; flex: 1 1 auto; min-height: 0; }
@media (prefers-reduced-motion: reduce) { .gband .chev { transition: none; } }
`;

const DATA = `
const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', chats: '<path d="M4 5h16v11H8l-4 4z"/>',
  chars: '<path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a2.5 2.5 0 1 0 0-5M16 15.5a5 5 0 0 1 5.5 4.5"/>',
  corpus: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>', databank: '<path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
  presets: '<path d="M4 6h16M4 12h10M4 18h6"/>', refinery: '<path d="M6 3h12l-4 8v7l-4 2v-9z"/>', analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>', palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-.9 2-2 0-1.7-1.5-2-1.5-3.5S14 13 15.5 13H17a4 4 0 0 0 4-4c0-3.5-4-6-9-6zM7.5 10.5h.01M10.5 6.5h.01M15 6.5h.01"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z"/>', jobs: '<path d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>', backup: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  plug: '<path d="M9 2v6M15 2v6M5 8h14v3a7 7 0 0 1-14 0zM12 18v4"/>', auto: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', admin: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>', ext: '<path d="M4 7h6l2-2h8v14H4zM4 7V4h5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01"/>', regex: '<path d="M17 3v10M12.7 5.5l8.6 5M12.7 10.5l8.6-5M5 17h.01"/><rect x="3" y="15" width="4" height="4" rx="1"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v15M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>', roster: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M19 12H5M12 19l-7-7 7-7"/>', chev: '<path d="M6 9l6 6 6-6"/>', info: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', check: '<path d="M4 12l5 5L20 7"/>', panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  detail: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', more: '',
};
const KEBAB = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const GRIP = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="4" cy="2.5" r="1.2"/><circle cx="8" cy="2.5" r="1.2"/><circle cx="4" cy="6" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="4" cy="9.5" r="1.2"/><circle cx="8" cy="9.5" r="1.2"/></svg>';
const svg = (k, cls = "ico") => '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>';

// material — only what the contributions carry
const TAGS = [["fantasy","oklch(0.62 0.16 300)",12],["slow burn","oklch(0.7 0.15 25)",9],["sci-fi","oklch(0.7 0.12 220)",7],["comfort","oklch(0.78 0.12 90)",6],["mystery","oklch(0.55 0.1 260)",5],["horror","oklch(0.45 0.12 15)",4],["romance","oklch(0.72 0.14 350)",4],["historical","oklch(0.66 0.1 70)",3],["found family","oklch(0.7 0.12 150)",3],["heist","oklch(0.6 0.1 40)",2],["noir","oklch(0.4 0.02 60)",2],["western","oklch(0.64 0.11 55)",1],["seafaring","oklch(0.62 0.1 200)",1],["academy","oklch(0.68 0.08 120)",1],["courtly","oklch(0.7 0.1 320)",0],["draft","oklch(0.5 0.02 60)",0],["retired","oklch(0.45 0.02 60)",0]];
const REGEX = [["Strip stage directions","/\\\\*[^*]+\\\\*/g","edited 2d ago",[1,1,0,0,0,0]],["Curly quotes","/\\"([^\\"]+)\\"/g","edited 5d ago",[0,1,1,0,0,0]],["Trim trailing whitespace","/[ \\\\t]+$/gm","edited Aug 21",[0,0,0,1,0,0]],["Collapse triple newlines","/\\\\n{3,}/g","edited Aug 19",[0,0,0,1,1,0]],["Name macro guard","/\\\\{\\\\{user\\\\}\\\\}/g","edited Aug 3",[1,0,0,0,0,1]]];
const BOOKS = [["Ashen Spire","14 entries · 3 always on",true,[["The Spire","spire, tower, ashen",true],["Warden Sabine","sabine, warden",false],["The outer stair","stair, steps, gate",false],["Ember debt","debt, ember, owed",false],["Lantern scribes","scribe, lantern",false]]],["Kohaku's shrine","6 entries",false,[["The shrine","shrine, fox",true],["Offerings","offering, prayer",false]]],["Salvage lanes","22 entries · global",true,[["Lane law","lane, salvage",true]]]];
const ROSTERS = [["Tavern night","Charlotte · Niko · Tobias Brand",3,2],["The Spire party","Sabine Veyra · Elias Thorn",2,4]];
const COLL = {
  tags: { label: "Tags", icon: "tag", count: TAGS.length, create: "New tag", overflow: ["Prune unused tags"], sort: "Most used", about: "Labels you put on characters and chats. One namespace; the count beside each tag is how many things wear it right now.", insights: [["Labelling nothing", 3, "Review"], ["In use", 14, null]] },
  regex: { label: "Regex scripts", icon: "regex", count: REGEX.length, create: "New script", importFile: "Import a regex script", bulk: "Select scripts", about: "Find-and-replace rules that run over messages. Where a script runs, and in what order, is set per scope in the details pane.", insights: [["Runs in every chat", 4, null], ["Attached to a card only", 1, "Show"]] },
  worldinfo: { label: "World info", icon: "book", count: BOOKS.length, create: "New book", importFile: "Import a world-info book", about: "Books of entries that join the prompt when their keys appear, or always. A book fires where it is attached, or everywhere if it is global.", insights: [["Global books", 2, null], ["Entries", 42, null]] },
  rosters: { label: "Rosters", icon: "roster", count: ROSTERS.length, create: "New roster", about: "Saved casts you can start a chat from again. A roster measured in hundreds is not a library; this list stays flat.", insights: [["Most recent", "Tavern night", null]] },
};
const SETTINGS = [
  ["User", [["personas","Personas","user",false],["appearance","Appearance","palette",true],["chat","Chat behavior","msg",false],["jobs","Jobs","jobs",false],["backup","Backup & Restore","backup",false]]],
  ["App", [["connections","Connections","plug",false],["automation","Automation","auto",false],["admin","Admin","admin",false]]],
  ["Collections", "coll"],
  ["Extensions", [["plugins","Plugins","ext",false]]],
];
const APPEARANCE_SECTIONS = ["Looks","Message style","Avatars","Message details","Background","Library"];
`;

const RENDER = `
function rail() {
  const g = (k, title, on) => '<div class="g' + (on ? ' on' : '') + '" title="' + title + '">' + svg(k) + '</div>';
  return '<div class="rail">' + g("home","Home") + g("chats","Chats") + g("chars","Characters") + g("corpus","Corpus") + g("databank","Databank") + g("presets","Presets") + g("refinery","Refinery") + g("analytics","Analytics") + '<div class="end g on" title="Settings">' + svg("gear") + '</div><div class="av">N</div></div>';
}
// SectionsBand, drawn from the tree: chevron gutter (invisible when the band has no rows) · icon · interactiveKicker · badges
function gband({ id, label, icon, hasRows, open, on, badge, count, act, extra }) {
  return '<button class="gband' + (on ? ' on' : '') + '" data-act="' + act + '" data-id="' + id + '"' + (on ? ' aria-current="location"' : '') + (hasRows ? ' aria-expanded="' + !!open + '"' : '') + '>' + svg("chev", "chev" + (hasRows ? (open ? '' : ' closed') : ' hide')) + svg(icon) + '<span class="ikicker">' + label + '</span>' + (badge ? '<span class="badge">' + badge + '</span>' : '') + (count != null ? '<span class="n">' + count + '</span>' : '') + '</button>';
}
function listPane(st) {
  let out = '<div class="list"><div class="band"><span class="t">Settings</span></div><div class="lsearch"><span>Search settings</span><span class="kbd">⌘K</span></div>';
  for (const [shelf, groups] of SETTINGS) {
    out += '<div class="shelf"><span class="kicker">' + shelf + '</span></div><div class="bands">';
    if (groups === "coll") {
      for (const id of ["tags","regex","worldinfo","rosters"]) { const c = COLL[id]; out += gband({ id, label: c.label, icon: c.icon, hasRows: false, on: st.view === "collection" && st.collection === id, count: c.count, act: "open" }); }
    } else {
      for (const [id, label, icon, modified] of groups) {
        const on = st.view === "settings" && st.group === id;
        out += gband({ id, label, icon, hasRows: true, open: on, on, badge: modified ? "Modified" : null, act: "settings" });
        if (on && id === "appearance") out += '<div class="subs">' + APPEARANCE_SECTIONS.map((x, i) => '<div class="s' + (i === st.spy ? ' spy' : '') + '"><span>' + x + '</span></div>').join('') + '</div>';
      }
    }
    out += '</div>';
  }
  return out + '</div>';
}
function topbar(st, phoneless) {
  let ident;
  if (st.view === "settings") ident = '<span class="t">Settings</span>';
  else { const c = COLL[st.collection]; ident = st.member == null ? '<span class="t">' + c.label + '</span><span class="n">' + c.count + '</span>' : '<span class="t">' + memberName(st) + '</span>'; }
  return '<div class="topbar"><span class="lead" aria-label="Hide the list">' + svg("panel") + '</span><div class="ident">' + ident + '</div><div class="trail"><span class="chip">Search <span class="kbd">⌘K</span></span><span class="ibtn on" aria-label="Hide details">' + svg("detail") + '</span></div></div>';
}
function memberOf(st) {
  if (st.collection === "tags") { const t = TAGS[st.member]; return { name: t[0], color: t[1], uses: t[2] }; }
  if (st.collection === "regex") { const r = REGEX[st.member]; return { name: r[0], find: r[1], stages: r[3] }; }
  if (st.collection === "worldinfo") { const b = BOOKS[st.member]; return { name: b[0], scent: b[1], global: b[2], entries: b[3] }; }
  const r = ROSTERS[st.member]; return { name: r[0], members: r[1], n: r[2], rules: r[3] };
}
function memberName(st) { const m = memberOf(st); return st.collection === "worldinfo" && st.entry != null ? m.entries[st.entry][0] : m.name; }
const kebab = '<button class="kebab" aria-label="More"><span>' + KEBAB + '</span></button>';
function controls(st, c) {
  let right = '';
  if (c.bulk) right += '<button class="btn ghost' + (st.bulk ? ' on' : '') + '" data-act="bulk">' + svg("check") + c.bulk + '</button>';
  right += '<button class="btn primary">' + svg("plus") + c.create + '</button>';
  if (c.importFile || c.overflow) right += '<button class="kebab" aria-label="More: ' + [c.importFile, ...(c.overflow ?? [])].filter(Boolean).join(', ') + '">' + KEBAB + '</button>';
  const sort = c.sort ? '<span class="sel">' + c.sort + '<span class="v">▾</span></span>' : '';
  return '<div class="controls"><div class="filter"><span>Filter ' + c.label.toLowerCase() + '</span><span class="kbd">/</span></div>' + sort + '<span style="margin-left:auto;display:inline-flex;gap:8px">' + right + '</span></div>';
}
function insights(c) { return '<div class="insights">' + c.insights.map(([k, v, door]) => '<div class="insight"><span>' + k + '</span><span class="v">' + v + '</span>' + (door ? '<button class="door">' + door + ' →</button>' : '<span></span>') + '</div>').join('') + '</div>'; }
function row({ lead, leadW, title, sub, mark, acts, act, i }) {
  return '<div class="lrow" style="--lead:' + (leadW ?? 0) + 'px">' + (lead ? '<span class="lead">' + lead + '</span>' : '<span></span>') + '<button class="open" data-act="' + act + '" data-i="' + i + '"><span class="ttl">' + title + (mark ? '<span class="mark">' + mark + '</span>' : '') + '</span>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</button><span class="acts">' + acts + '</span></div>';
}
function library(st, c) {
  let rows = '';
  if (st.collection === "tags") rows = TAGS.map((t, i) => row({ lead: '<i class="sw" style="background:' + t[1] + '"></i>', leadW: 14, title: t[0], sub: t[2] === 0 ? 'labelling nothing' : t[2] === 1 ? 'on 1 thing' : 'on ' + t[2] + ' things', acts: kebab, act: "member", i })).join('');
  else if (st.collection === "regex") rows = REGEX.map((r, i) => row({ lead: '<span class="stages" aria-label="stages">' + r[3].map((s) => '<i class="' + (s ? 'on' : '') + '"></i>').join('') + '</span>', leadW: 70, title: r[0], sub: '<span class="mono">' + r[1] + '</span><span>· ' + r[2] + '</span>', acts: st.bulk ? '<span class="cb' + (i < 2 ? ' on' : '') + '" role="checkbox" aria-checked="' + (i < 2) + '" aria-label="Select ' + r[0] + '"></span>' : kebab, act: "member", i })).join('');
  else if (st.collection === "worldinfo") rows = BOOKS.map((b, i) => row({ title: b[0], sub: b[1], mark: b[2] ? 'global' : null, acts: kebab, act: "member", i })).join('');
  else rows = ROSTERS.map((r, i) => row({ title: r[0], sub: r[1] + ' · ' + r[3] + ' rules', acts: kebab, act: "member", i })).join('');
  const bar = st.bulk && st.collection === "regex" ? '<div class="selbar"><span class="kicker">2 selected</span><span class="acts"><button class="btn ghost">Enable</button><button class="btn ghost">Disable</button><button class="btn ghost danger">Delete</button></span></div>' : '';
  return '<div class="lib">' + rows + bar + '</div>';
}
function drillHead(st, c) {
  const m = memberOf(st);
  if (st.collection === "worldinfo" && st.entry != null) return '<div class="drill"><button class="back" data-act="back">' + svg("back") + 'Back to entries</button><span class="name">' + m.entries[st.entry][0] + '</span></div>';
  let acts = '';
  if (st.collection === "worldinfo") acts = '<button class="btn ghost">Edit details</button><button class="btn ghost">Backfill</button><button class="btn primary">' + svg("plus") + 'New entry</button>';
  if (st.collection === "rosters") acts = '<button class="btn ghost">Start chat</button>';
  if (st.collection === "regex") acts = '<button class="btn ghost">Test against a sample</button>';
  return '<div class="drill"><button class="back" data-act="back">' + svg("back") + 'Back to ' + c.label.toLowerCase() + '</button><span class="name">' + m.name + '</span><span class="acts">' + acts + '</span></div>';
}
const f = (l, g, ctl) => '<div class="field"><div><div class="l">' + l + '</div>' + (g ? '<div class="g">' + g + '</div>' : '') + '</div>' + ctl + '</div>';
const txt = (v) => '<div class="ctl"><span>' + v + '</span></div>';
const sw = (on, label) => '<span class="switch' + (on ? ' on' : '') + '"><i></i>' + (label ?? (on ? 'On' : 'Off')) + '</span>';
function editor(st, c) {
  const m = memberOf(st);
  if (st.collection === "tags") {
    const sws = ["oklch(0.62 0.16 300)","oklch(0.7 0.15 25)","oklch(0.7 0.12 220)","oklch(0.78 0.12 90)","oklch(0.7 0.12 150)","oklch(0.72 0.14 350)","oklch(0.5 0.02 60)"].map((x) => '<i style="background:' + x + '"' + (x === m.color ? ' class="on"' : '') + '></i>').join('');
    return '<div class="ed">' + f("Name", "Renames it everywhere it is worn.", txt(m.name)) + f("Colour", "", '<div class="swatches">' + sws + '</div>') + f("Merge into", "Folds this tag into another: the name goes, the uses stay.", '<div class="ctl"><span class="v">Choose a tag…</span><span aria-hidden="true">▾</span></div>') + f("Worn by", "", '<div class="ctl" style="justify-content:flex-start"><span>' + (m.uses === 0 ? 'nothing yet' : m.uses + ' characters and chats') + '</span></div>') + '</div>';
  }
  if (st.collection === "regex") {
    return '<div class="ed">' + f("Name", "", txt(m.name)) + '<div class="sec"><div class="sec-h"><span class="k">Rule</span></div></div><div class="ctl ta">' + m.find + '</div><div class="ctl ta">$1</div>' + f("Stages", "Where in the pipeline it fires.", '<span class="stages" style="justify-self:end;gap:6px">' + m.stages.map((s) => '<i class="' + (s ? 'on' : '') + '" style="width:14px;height:14px"></i>').join('') + '</span>') + '<p class="cview" style="padding:0;color:var(--muted-fg)">Where this script runs, and its order in each scope, are set in the details pane.</p></div>';
  }
  if (st.collection === "worldinfo") {
    if (st.entry != null) { const e = m.entries[st.entry]; return '<div class="ed">' + f("Title", "", txt(e[0])) + f("Keys", "Comma-separated; the entry fires when one appears.", txt(e[1])) + f("Always", "In the prompt whenever the book is, keys or not.", sw(e[2])) + '<div class="sec"><div class="sec-h"><span class="k">Content</span></div></div><div class="ctl ta">The spire stands at the edge of the ash fields, its outer stair guarded night and day. Nobody climbs without a debt to settle.</div></div>'; }
    return '<div class="ed"><div class="sec"><div class="sec-h"><span class="k">Entries · ' + m.entries.length + '</span><span class="kicker">drag to reorder</span></div></div><div class="lib">' + m.entries.map((e, i) => row({ lead: '<span class="handle" aria-label="Drag to reorder">' + GRIP + '</span>', leadW: 16, title: e[0], sub: '<span class="mono">' + e[1] + '</span>', mark: e[2] ? 'always' : null, acts: kebab, act: "entry", i })).join('') + '</div></div>';
  }
  return '<div class="ed">' + f("Name", "", txt(m.name)) + '<div class="sec"><div class="sec-h"><span class="k">Members · ' + m.n + '</span></div></div><div class="lib">' + m.members.split(' · ').map((n) => '<div class="lrow"><span></span><span class="open" style="cursor:default"><span class="ttl">' + n + '</span><span class="sub">character</span></span><span></span></div>').join('') + '</div><div class="sec"><div class="sec-h"><span class="k">Rules · ' + m.rules + '</span></div></div><p class="cview" style="padding:0;color:var(--muted-fg)">Rules are edited in the roster preset; this is the saved cast.</p></div>';
}
function settingsContent(st) {
  const seg = (opts, on) => '<div class="seg">' + opts.map((o) => '<span' + (o === on ? ' class="on"' : '') + '>' + o + '</span>').join('') + '</div>';
  const sec = (k, body, spy) => '<div class="ed" style="gap:6px"><div class="sec-h' + (spy ? ' spy' : '') + '"><span class="k">' + k + '</span></div>' + body + '</div>';
  return '<div class="content"><div class="cbody">'
    + sec("Looks", f("Theme", "Shipped · picking applies it", seg(["Hearth","Mocha","Light"], "Hearth")) + f("Your themes", "imported and builder-made looks", '<div class="ctl"><span class="v">2 themes</span><span aria-hidden="true">▸</span></div>'), true)
    + sec("Message style", f("Layout", "", seg(["Bubbles","Flat","Document"], "Bubbles")) + f("Colour quoted speech", "", sw(true)))
    + sec("Avatars", f("Size", "", seg(["Small","Medium","Large"], "Medium")) + f("Shape", "", seg(["Round","Square","Rounded"], "Round")))
    + sec("Message details", f("Timestamps", "", sw(true)) + f("Token count", "", sw(false)))
    + '</div></div>';
}
function content(st) {
  if (st.view === "settings") return settingsContent(st);
  const c = COLL[st.collection];
  let body;
  if (st.empty) body = '<div class="empty"><h2>' + c.label + '</h2><p>' + c.about + ' No saved rosters yet.</p><button class="btn primary">' + svg("plus") + c.create + '</button></div>';
  else if (st.member == null) body = controls(st, c) + insights(c) + library(st, c);
  else body = drillHead(st, c) + editor(st, c);
  return '<div class="content"><div class="cbody">' + body + '</div></div>';
}
// THE TEACHER, per config-teacher-tabs.tsx: About always; Applies when the focus has a scope answer (an open
// collection member: the collection's own context arm, tags → the none EmptyState); Learn only when supplied.
const APPLIES = {
  regex: ["Where it’s attached", (m) => '<div class="roster"><div class="r"><span>Runs in every chat</span>' + sw(true) + '</div><div class="r"><span>Order in the global tier</span><span class="v">1 of 4 · drag</span></div><div class="r"><span>Sabine Veyra</span><span class="v">card opt-in</span></div><div class="r"><span>The Spire party</span><span class="v">roster rule</span></div></div>'],
  worldinfo: ["Where it fires", (m) => '<div class="roster"><div class="r"><span>Global · every chat</span>' + sw(m.global) + '</div><div class="r"><span>Sabine Veyra</span><span class="v">attached</span></div><div class="r"><span>Elias Thorn</span><span class="v">attached</span></div><div class="r"><span>Always-on entries</span><span class="v">3</span></div></div>'],
  tags: ["Applies", () => '<div class="cempty">A tag is worn, not attached. What wears it is on the tag itself.</div>'],
  rosters: null,
};
function ctx(st) {
  const cell = (k, l, on) => '<div class="cell' + (on ? ' on' : '') + '">' + svg(k) + l + '</div>';
  let title, gloss, body, tab = "About", cells;
  if (st.view === "settings") {
    title = "Appearance"; gloss = "the rows you can see";
    body = '<div class="roster">' + [["Theme","Hearth"],["Your themes","2"],["Layout","Bubbles"],["Colour quoted speech","On"],["Size","Medium"],["Shape","Round"],["Timestamps","On"],["Token count","Off"]].map(([l, v]) => '<div class="r"><span>' + l + '</span><span class="v">' + v + '</span></div>').join('') + '</div>';
    cells = cell("info", "About", true) + cell("globe", "Applies", false);
  } else {
    const c = COLL[st.collection]; const ap = APPLIES[st.collection];
    if (st.member == null) { title = c.label; gloss = "Collections"; body = '<p>' + c.about + '</p>'; cells = cell("info", "About", true); }
    else {
      const m = memberOf(st); title = memberName(st); gloss = c.label + (st.collection === "worldinfo" && st.entry != null ? " · " + m.name : "");
      if (ap) { tab = "Applies"; body = '<span class="kicker">' + ap[0] + '</span>' + ap[1](m); cells = cell("info", "About", false) + cell("globe", "Applies", true); }
      else { body = '<p><b>' + m.name + '</b> — a saved cast of ' + m.n + ' with ' + m.rules + ' rules.</p>'; cells = cell("info", "About", true); }
    }
  }
  return '<div class="ctx"><div class="cband"><div class="t">' + title + '</div><div class="gloss">' + gloss + '</div></div><div class="cview">' + body + '</div><div class="ground"></div><div class="kick"><span>Settings · <span class="sel2">' + tab + '</span></span></div><div class="cells">' + cells + '</div></div>';
}
function desk(st) { return '<div class="shell">' + rail() + listPane(st) + topbar(st) + content(st) + ctx(st) + '</div>'; }
function phone(st) {
  const c = COLL[st.collection];
  const ib = (k, act, label, on) => '<button class="ib' + (on ? ' on' : '') + '" data-act="' + act + '" aria-label="' + label + '">' + svg(k) + '</button>';
  const tab = (k, l, on) => '<div class="tb' + (on ? ' on' : '') + '">' + svg(k) + l + '</div>';
  const bar = '<div class="tabbar">' + tab("home","Home") + tab("chats","Chats") + tab("chars","Characters") + tab("gear","Settings", true) + '</div>';
  let top, body;
  if (st.level === "list") {
    top = '<div class="top">' + ib("panel", "noop", "Show the screen") + '<div class="t">Settings</div><div class="trail">' + ib("detail", "noop", "Show details") + '</div></div>';
    body = '<div class="body" style="padding:0 0 12px">' + listPane(st).replace('<div class="list">', '<div>').replace(/<div class="band">[\\s\\S]*?<\\/div><div class="lsearch">[\\s\\S]*?<\\/div>/, '') + '</div>';
  } else if (st.member == null) {
    top = '<div class="top">' + ib("back", "pop", "Back to Settings") + '<div class="t">' + c.label + '<span class="n">' + c.count + '</span></div><div class="trail">' + ib("detail", "ctx", "Show details", !!st.ctxOpen) + '</div></div>';
    body = '<div class="body">' + controls(st, c) + insights(c) + library(st, c) + '</div>';
  } else {
    top = '<div class="top">' + ib("back", "back", "Back to Settings") + '<div class="t">' + memberName(st) + '</div><div class="trail">' + ib("detail", "ctx", "Show details", !!st.ctxOpen) + '</div></div>';
    body = '<div class="body">' + (st.collection === "worldinfo" && st.entry == null ? '<div class="controls"><button class="btn ghost">Edit details</button><button class="btn primary">' + svg("plus") + 'New entry</button></div>' : '') + editor(st, c) + '</div>';
  }
  const sheet = st.ctxOpen ? '<div class="scrim" data-act="ctx"></div><div class="sheet"><div class="shead"><span class="kicker">Details</span><button class="ib" data-act="ctx" aria-label="Hide details">' + svg("x") + '</button></div>' + ctx(st) + '</div>' : '';
  return '<div class="ph">' + top + body + bar + sheet + '</div>';
}
function mount(el) {
  const st = JSON.parse(el.dataset.state);
  const draw = () => { el.innerHTML = el.classList.contains("phone") ? phone(st) : desk(st); };
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b || !el.contains(b)) return;
    const act = b.dataset.act;
    if (act === "open") { st.view = "collection"; st.group = null; st.collection = b.dataset.id; st.member = null; st.entry = null; st.bulk = false; st.empty = false; st.level = "lib"; st.ctxOpen = false; }
    else if (act === "settings") { st.view = "settings"; st.group = st.group === b.dataset.id && st.view === "settings" ? null : b.dataset.id; st.spy = 0; st.level = "lib"; }
    else if (act === "member") { st.member = Number(b.dataset.i); st.entry = null; }
    else if (act === "entry") { st.entry = Number(b.dataset.i); }
    else if (act === "back") { if (st.entry != null) st.entry = null; else st.member = null; }
    else if (act === "pop") { st.level = "list"; st.member = null; st.entry = null; st.ctxOpen = false; }
    else if (act === "bulk") { st.bulk = !st.bulk; }
    else if (act === "ctx") { st.ctxOpen = !st.ctxOpen; }
    else return;
    draw();
  });
  draw();
}
document.querySelectorAll(".frame").forEach(mount);
document.getElementById("theme").addEventListener("click", () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; });
`;

const board = (title, sub, cls, state) => `<section class="board"><div class="board-title"><b>${title}</b><span class="kicker">${sub}</span></div><div class="wrap"><div class="frame ${cls}" data-state='${JSON.stringify(state)}'></div></div></section>`;
const S = (o) => ({ view: "collection", member: null, entry: null, bulk: false, level: "lib", ...o });

const NOTES = [
  ["The ruling", "Nate, 2026-09-05: <b>the tag list under the LIST is a no-go</b> — it moves into CONTENT when you click Tags, same for regex and world info; today it is mixed and looks weird; CONTENT needs redesigning so the four are consistent. Rosters follow by default (one species, one shape)."],
  ["What moved, exactly", "Only the member rows. The LIST keeps the band you have today — the same 32px band as every settings group (icon · name · badge), minus a chevron because there is nothing left to unfold; its count is the live census. The library opens in CONTENT under the topbar, which names the screen the way it names every other section."],
  ["Decision 1 · the door", "A collection band keeps its chevron gutter empty (the tree already reserves it) and drops <b>aria-expanded</b>. That is the whole delta from a settings band — no second band kind. The band's <b>+</b> is gone: creating lives in the library's control row, one home. Import and bulk select move there too; D121's \"Import is the band affordance\" survives with a changed input, recorded."],
  ["Decision 2 · the control row", "Filter · sort (where the library has one) · create · an overflow kebab for Import and Prune. The filter is always visible; the 30-member cliff and the max-h-96 window existed because three bands shared one LIST scroll column, and that column is gone."],
  ["Decision 3 · rows", "Every row is the same ListRow as the other libraries: a leading swatch or stage glyphs, a title, a subtitle that says what the tree knows, a kebab. No drag handles on tags unless the sort is Manual; none on regex at all — script order lives per scope in the details pane, as ruled. The one real drag is a book's entries."],
  ["Decision 4 · drilling in", "A row swaps CONTENT to the member behind <b>Back to tags</b>; world info keeps its shipped second step (book → entry). No Delete in a drilled header — lifecycle stays on the row's kebab (D121). The regex and book editors carry no attach switch; that control has one home, the details pane."],
  ["The details pane", "Same teacher, same rules: About always; Applies only where the focus has a scope answer — an open script (Where it's attached), an open book (Where it fires), an open tag (worn, not attached); Learn only when a collection supplies one, and none does. On a phone the topbar's Show details opens it as a sheet with a close."],
  ["Board 1 is the tree", "Settings as it works today: one band kind for all thirteen groups, the open group's section rows with the scroll-spy, shelves as plain labels. Unchanged by this ruling, and drawn from config-list-group.tsx rather than from memory."],
  ["Still open", "Rows at pane width carry more air than at 307px; the subtitle helps but the build owes a width matrix. Touch drag for a book's entries needs a long-press. Above 30 members the tree virtualises; the biggest library today has 17."],
];

const html = `<title>Collections in CONTENT</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${CSS}</style>
<main class="canvas">
  <div class="canvas-head"><div><h1>Config collections move into CONTENT</h1><p>Clickable. Click a band, a row, a Back, the regex bulk toggle, or the phone's Show details. Each board is the same shell in a different starting state. Hearth by default; the toggle shows Light. Version 3, redrawn after the IA and UX reviews.</p></div><button class="tool" id="theme">Toggle theme</button></div>
  ${board("Arrival · Settings as it works today", "1440 × 900 · Appearance open · section rows + the scroll-spy · the teacher's at-rest roster · unchanged by this ruling", "desk", { view: "settings", group: "appearance", spy: 0, collection: "tags", member: null, entry: null, bulk: false })}
  ${board("Tags · the library", "click Tags above and you land here: the door lights, the library opens in CONTENT, the topbar names it", "desk", S({ collection: "tags" }))}
  ${board("Tags · a member, drilled in", "Back returns to the library · no lifecycle chrome in the header · the teacher's Applies says a tag is worn, not attached", "desk", S({ collection: "tags", member: 1 }))}
  ${board("Regex scripts · bulk select on", "stage glyphs lead · scent subtitle · checkboxes replace the kebab · selection bar · no handles, no row switch", "desk", S({ collection: "regex", bulk: true }))}
  ${board("Regex · a script open — Applies is Where it’s attached", "the attach switch and the per-scope order have ONE home: the details pane", "desk", S({ collection: "regex", member: 0 }))}
  ${board("World info · a book", "Edit details · Backfill · New entry · the entries are the one real drag · Applies is Where it fires (Global lives there)", "desk", S({ collection: "worldinfo", member: 0 }))}
  ${board("Rosters · empty", "the F5 empty arm, unchanged: name · blurb · one create door", "desk", S({ collection: "rosters", empty: true }))}
  <section class="board"><div class="board-title"><b>Phone · one screen at a time</b><span class="kicker">430 × 860 · the Settings list → the library → a member · Show details opens the teacher as a sheet with a close</span></div><div class="wrap"><div class="phones"><div class="frame phone" data-state='${JSON.stringify(S({ collection: "tags", level: "list" }))}'></div><div class="frame phone" data-state='${JSON.stringify(S({ collection: "tags" }))}'></div><div class="frame phone" data-state='${JSON.stringify(S({ collection: "regex", member: 0 }))}'></div><div class="frame phone" data-state='${JSON.stringify(S({ collection: "regex", member: 0, ctxOpen: true }))}'></div></div></div></section>
  <section class="board"><div class="board-title"><b>What this mock decides</b><span class="kicker">defaults — rule on them</span></div><div class="notes">${NOTES.map(([k, p]) => `<div class="note"><span class="k">${k}</span><p>${p}</p></div>`).join("")}</div></section>
</main>
<script>${DATA}${RENDER}</script>
`;
writeFileSync("canvas.html", html);
console.log("wrote canvas.html", html.length, "bytes");
