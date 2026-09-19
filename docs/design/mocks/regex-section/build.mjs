// The room's Regex section (DESIGN.md) — one clickable canvas from one renderer. Owner steer
// 2026-09-05: a collapsible in the This-chat tab like Injections/Overrides, control what applies here, editing
// stays in Config. Tokens: theme.css (Hearth + Light); the shell grid; the This-chat tab's DisclosureSection
// grammar (interactiveKicker trigger + count chip). Tier switch = HERE; row switch = EVERYWHERE.
import { writeFileSync } from "node:fs";

const CSS = `
:root { color-scheme: dark; --bg: oklch(0.158 0.006 60); --fg: oklch(0.955 0.004 75); --card: oklch(0.205 0.006 60); --raised: oklch(0.185 0.006 60); --sidebar: oklch(0.132 0.006 60); --muted: oklch(0.255 0.006 60); --muted-fg: oklch(0.74 0.008 65); --primary: oklch(0.72 0.175 52); --primary-fg: oklch(0.19 0.03 50); --border: oklch(0.99 0.005 60 / 0.08); --input-border: oklch(0.68 0.005 70); --tint: oklch(0.72 0.175 52 / 0.16); --danger: oklch(0.7 0.17 25); --canvas: oklch(0.11 0.004 60); --canvas-fg: oklch(0.8 0.006 65); --bubble: oklch(0.225 0.008 60); }
:root[data-theme="light"] { color-scheme: light; --bg: oklch(0.98 0.004 75); --fg: oklch(0.24 0.01 60); --card: oklch(0.995 0.003 75); --raised: oklch(0.965 0.005 75); --sidebar: oklch(0.955 0.006 72); --muted: oklch(0.95 0.006 70); --muted-fg: oklch(0.44 0.01 65); --primary: oklch(0.55 0.16 50); --primary-fg: oklch(0.99 0.01 75); --border: oklch(0.2 0.01 60 / 0.12); --input-border: oklch(0.51 0.008 70); --tint: oklch(0.55 0.16 50 / 0.14); --danger: oklch(0.5 0.17 25); --canvas: oklch(0.9 0.006 72); --canvas-fg: oklch(0.35 0.01 60); --bubble: oklch(0.955 0.006 72); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--canvas-fg); font-family: Geist, ui-sans-serif, system-ui, sans-serif; font-size: 13px; line-height: 1.45; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.mono { font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace; }
.kicker { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); }
.ikicker { font-family: "Geist Mono", ui-monospace, monospace; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg); }
.ico { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }
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
/* shell */
.shell { display: grid; grid-template-columns: 56px 320px minmax(0, 1fr) 384px; grid-template-rows: 48px minmax(0, 1fr); height: 100%; }
.rail { grid-row: 1 / 3; background: var(--sidebar); border-right: 1.25px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 10px 0; gap: 6px; }
.rail .g { width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center; color: var(--muted-fg); }
.rail .g .ico { width: 19px; height: 19px; }
.rail .g.on { background: var(--tint); color: var(--fg); }
.rail .end { margin-top: auto; }
.av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: oklch(0.6 0.12 60 / 0.5); color: var(--fg); font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; font-weight: 600; flex: none; }
.av.sm { width: 24px; height: 24px; font-size: 9px; }
.list { grid-row: 1 / 3; background: var(--sidebar); border-right: 1.25px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.band { display: flex; justify-content: space-between; align-items: center; padding: 0 14px; height: 48px; border-bottom: 1.25px solid var(--border); flex: none; gap: 8px; }
.band .t { font-size: 15px; font-weight: 600; } .band .n { font-family: "Geist Mono", ui-monospace, monospace; font-size: 12px; color: var(--muted-fg); }
.lsearch { margin: 10px 12px 6px; height: 32px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card); color: var(--muted-fg); padding: 0 10px; font-size: 12.5px; display: flex; align-items: center; justify-content: space-between; }
.crow { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 0 12px; min-height: 52px; border-bottom: 1px solid var(--border); }
.crow .ttl { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crow .sub { font-size: 11.5px; color: var(--muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crow .when { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); }
.crow.on { background: var(--tint); }
.topbar { grid-column: 3; grid-row: 1; display: flex; align-items: center; gap: 8px; padding: 0 12px 0 8px; border-bottom: 1.25px solid var(--border); background: var(--bg); min-width: 0; }
.topbar .lead { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); flex: none; }
.topbar .ident { display: flex; align-items: center; gap: 8px; min-width: 0; }
.topbar .ident .t { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar .trail { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted-fg); font-size: 12px; }
.ibtn { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); }
.ibtn.on { background: var(--tint); color: var(--fg); }
.content { grid-column: 3; grid-row: 2; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); min-width: 0; }
.transcript { flex: 1 1 auto; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; gap: 18px; padding: 24px 40px; max-width: 760px; width: 100%; margin: 0 auto; }
.msg { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 8px; align-items: start; }
.msg .who { display: flex; gap: 8px; align-items: baseline; font-weight: 600; } .msg .who .when { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); font-weight: 400; }
.msg .bubble { margin-top: 4px; padding: 10px 14px; border-radius: 12px; background: var(--bubble); color: var(--fg); line-height: 1.5; max-width: 62ch; }
.msg .bubble em { color: var(--muted-fg); }
.composer { padding: 12px 40px 20px; max-width: 760px; width: 100%; margin: 0 auto; }
.composer .box { display: flex; align-items: center; gap: 8px; border: 1px solid var(--input-border); border-radius: 12px; background: var(--card); padding: 10px 12px; color: var(--muted-fg); min-height: 48px; }
.composer .box .send { margin-left: auto; width: 32px; height: 32px; border-radius: 8px; background: var(--primary); color: var(--primary-fg); display: grid; place-items: center; }
/* CONTEXT */
.ctx { grid-column: 4; grid-row: 1 / 3; background: var(--sidebar); border-left: 2px solid var(--primary); display: flex; flex-direction: column; overflow: hidden; }
.cband { padding: 10px 12px; background: var(--raised); border-bottom: 1.25px solid var(--border); display: flex; flex-direction: column; gap: 4px; min-height: 48px; justify-content: center; }
.cband .t { font-size: 15px; font-weight: 600; } .cband .gloss { font-size: 12px; color: var(--muted-fg); display: flex; gap: 6px; flex-wrap: wrap; }
.cview { flex: 1 1 auto; overflow: auto; display: flex; flex-direction: column; }
.disc { border-bottom: 1px solid var(--border); }
.disc .trig { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 0 12px; }
.disc .trig .ikicker { font-size: 12px; }
.disc .trig .cnt { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); background: oklch(0.99 0.005 60 / 0.08); border-radius: 4px; padding: 1px 6px; }
:root[data-theme="light"] .disc .trig .cnt { background: oklch(0.2 0.01 60 / 0.08); }
.disc .trig .chev { margin-left: auto; width: 16px; height: 16px; color: var(--muted-fg); transition: transform 120ms ease; }
.disc .trig .chev.closed { transform: rotate(-90deg); }
.disc .body { padding: 2px 12px 14px; display: flex; flex-direction: column; gap: 12px; }
.intro { font-size: 12px; color: var(--muted-fg); margin: 0; }
.intro b { color: var(--fg); font-weight: 500; }
.srow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 32px; }
.srow .l { font-weight: 500; }
.switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted-fg); }
.switch i { width: 44px; height: 26px; border-radius: 13px; background: var(--muted); border: 1px solid var(--input-border); position: relative; display: inline-block; flex: none; }
.switch i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--muted-fg); }
.switch.on i { background: var(--primary); border-color: var(--primary); } .switch.on i::after { left: 21px; background: var(--primary-fg); }
.levers { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
.lever { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 30px; }
.lever .l { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lever .l .n { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); margin-left: 4px; }
.lever.master { grid-column: 1 / -1; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 2px; } .lever.master .l { font-weight: 600; font-size: 13px; }
.legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10.5px; color: var(--muted-fg); padding: 2px 0; }
.legend span { display: inline-flex; gap: 4px; align-items: center; } .legend i { width: 7px; height: 7px; border-radius: 2px; background: var(--primary); display: inline-block; }
.offmark { display: inline-flex; align-items: center; height: 16px; padding: 0 5px; border-radius: 4px; background: var(--muted); font-family: "Geist Mono", ui-monospace, monospace; font-size: 9.5px; color: var(--fg); text-transform: uppercase; letter-spacing: 0.06em; }
.notyours { color: var(--muted-fg); }
.tier { display: flex; flex-direction: column; gap: 2px; }
.tier .th { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 0 4px; border-bottom: 1px solid var(--border); }
.tier .th .k { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.tier .th .k .kicker { color: var(--fg); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tier .th .k .cnt { font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; color: var(--muted-fg); }
.tier .prov { font-size: 11px; color: var(--muted-fg); padding: 2px 0 0; }
.tier.off .th .k .kicker { color: var(--muted-fg); }
.rows { display: flex; flex-direction: column; }
.rrow { display: grid; grid-template-columns: 14px 16px minmax(0, 1fr) auto 28px; gap: 6px; align-items: center; min-height: 42px; padding: 2px 0; border-bottom: 1px solid var(--border); }
.rrow:last-child { border-bottom: 0; }
.rrow .grip { width: 16px; height: 24px; color: var(--muted-fg); display: grid; place-items: center; cursor: grab; }
.rrow .grip svg { width: 12px; height: 12px; fill: currentColor; }
.rrow .rank { font-family: "Geist Mono", ui-monospace, monospace; font-size: 11px; color: var(--muted-fg); text-align: right; font-variant-numeric: tabular-nums; }
.rrow .main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.rrow .nm { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 6px; align-items: center; }
.rrow .sc { font-size: 11px; color: var(--muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 6px; align-items: center; }
.rrow.off .nm { color: var(--muted-fg); } .rrow.off .stages i.on { background: var(--muted-fg); border-color: var(--muted-fg); }
.stages { display: inline-flex; gap: 2px; align-items: center; }
.stages i { width: 7px; height: 7px; border-radius: 2px; border: 1px solid var(--muted-fg); display: inline-block; opacity: 0.55; }
.stages i.on { background: var(--primary); border-color: var(--primary); opacity: 1; }
.plus1 { display: inline-flex; align-items: center; height: 16px; padding: 0 5px; border-radius: 999px; background: var(--muted); font-family: "Geist Mono", ui-monospace, monospace; font-size: 9.5px; color: var(--muted-fg); }
.kebab { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; color: var(--muted-fg); }
.kebab svg { width: 16px; height: 16px; fill: currentColor; }
.btn { height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); font-size: 12.5px; font-weight: 500; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
.btn.ghost { background: transparent; }
.btn .ico { width: 14px; height: 14px; stroke-width: 2; }
.ground { flex: 1 1 auto; }
.kick { display: flex; justify-content: space-between; padding: 6px 12px 4px; border-top: 1.25px solid var(--border); border-bottom: 1px solid var(--border); font-family: "Geist Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-fg); background: var(--raised); }
.kick .sel2 { color: var(--fg); }
.cells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(max-content, 1fr); gap: 4px; padding: 6px 8px 8px; background: var(--raised); }
.cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 44px; justify-content: center; border-radius: 6px; color: var(--muted-fg); font-size: 10.5px; font-weight: 500; }
.cell.on { color: var(--fg); background: var(--tint); }
.toast { position: absolute; right: 12px; bottom: 96px; max-width: 360px; background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; gap: 14px; align-items: center; box-shadow: 0 12px 32px oklch(0 0 0 / 0.35); font-size: 12.5px; }
.toast .undo { color: var(--primary); font-weight: 600; }
.memberline { font-size: 12px; color: var(--muted-fg); padding: 6px 10px; border: 1px dashed var(--border); border-radius: 6px; }
/* phone */
.ph { display: flex; flex-direction: column; height: 100%; background: var(--bg); color: var(--fg); position: relative; }
.ph .top { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1.25px solid var(--border); min-height: 56px; }
.ph .top .t { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ph .ib { width: 44px; height: 44px; border-radius: 8px; display: grid; place-items: center; color: var(--fg); }
.ph .ib .ico { width: 20px; height: 20px; stroke-width: 2; }
.ph .cview { padding-bottom: 8px; }
.ph .disc .trig { min-height: 48px; } .ph .rrow { min-height: 48px; } .ph .srow { min-height: 44px; } .ph .kebab { width: 44px; height: 44px; }
.ph .switch i { width: 52px; height: 32px; border-radius: 16px; } .ph .switch i::after { width: 24px; height: 24px; } .ph .switch.on i::after { left: 25px; }
.ph .toast { right: 12px; left: 12px; bottom: 72px; max-width: none; }
.tabbar { margin-top: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1.25px solid var(--border); background: var(--sidebar); height: 60px; }
.tabbar .tb { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 10.5px; color: var(--muted-fg); }
.tabbar .tb.on { color: var(--fg); } .tabbar .tb .ico { width: 20px; height: 20px; }
.scrim { position: absolute; inset: 0 0 60px 0; background: oklch(0 0 0 / 0.35); }
.sheet { position: absolute; left: 0; right: 0; bottom: 60px; top: 140px; background: var(--sidebar); border-top: 2px solid var(--primary); border-radius: 14px 14px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -12px 32px oklch(0 0 0 / 0.35); }
.sheet .shead { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 0 12px; }
.sheet .sbody { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.pick { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 48px; padding: 0 4px; border-bottom: 1px solid var(--border); }
.pick .cb { width: 18px; height: 18px; border: 1px solid var(--input-border); border-radius: 4px; background: var(--card); }
.pick .cb.on { background: var(--primary); border-color: var(--primary); }
`;

const DATA = `
const I = { home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', chats:'<path d="M4 5h16v11H8l-4 4z"/>', chars:'<path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a2.5 2.5 0 1 0 0-5M16 15.5a5 5 0 0 1 5.5 4.5"/>', corpus:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>', databank:'<path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>', presets:'<path d="M4 6h16M4 12h10M4 18h6"/>', refinery:'<path d="M6 3h12l-4 8v7l-4 2v-9z"/>', analytics:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>', chev:'<path d="M6 9l6 6 6-6"/>', panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>', detail:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>', back:'<path d="M19 12H5M12 19l-7-7 7-7"/>', plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>', users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>', info:'<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01"/>', eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>', send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>', clip:'<path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.3 3.3 0 0 1 4.7 4.7L10 18.4a1.7 1.7 0 0 1-2.4-2.4L16 7.6"/>' };
const KEBAB = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const GRIP = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="4" cy="2.5" r="1.2"/><circle cx="8" cy="2.5" r="1.2"/><circle cx="4" cy="6" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="4" cy="9.5" r="1.2"/><circle cx="8" cy="9.5" r="1.2"/></svg>';
const svg = (k, cls = "ico") => '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>';
// The effective set for the room "Midnight Run" (Alice · Bo, preset Noir), in run order, deduped:
// tiers: everywhere · preset · alice · bo · chat. A script may list a second tier it is also attached at.
const SCRIPTS = [
  { id: "strip-ooc", name: "Strip OOC", scent: "\\\\(OOC:[^)]*\\\\)", when: "edited 3d ago", stages: [1,1,0,0,0,0], tier: "everywhere", on: true },
  { id: "emdash", name: "Em-dash killer", scent: "—", when: "edited 2w ago", stages: [0,1,1,0,0,0], tier: "everywhere", on: true },
  { id: "hedges", name: "Trim trailing hedges", scent: "\\\\b(perhaps|maybe)\\\\b", when: "edited 1d ago", stages: [0,0,0,1,0,0], tier: "preset", on: true },
  { id: "alice-ital", name: "Alice italics", scent: "\\\\*([^*]+)\\\\*", when: "edited 5d ago", stages: [0,0,0,0,0,1], tier: "alice", on: true },
  { id: "bo-shout", name: "Bo shouting", scent: "[A-Z]{4,}", when: "edited 5d ago", stages: [0,1,0,0,0,0], tier: "everywhere", on: true, also: "From Bo", order: 3 },
  { id: "redact", name: "Redact the address", scent: "221B", when: "edited 12m ago", stages: [1,0,0,1,0,0], tier: "chat", on: true, elsewhere: false },
  { id: "old-host", name: "Sailor slang", scent: "\\bmatey\\b", when: "", stages: [1,0,0,0,0,0], tier: "chat", on: true, notYours: true },
];
const TIERS = [
  { id: "everywhere", kicker: "Everywhere", lever: "Everywhere", prov: "Your global scripts." },
  { id: "preset", kicker: "From the preset · Noir", lever: "Preset · Noir", prov: "Came with the preset." },
  { id: "alice", kicker: "From Alice", lever: "Alice", prov: "Came with Alice’s card." },
  { id: "bo", kicker: "From Bo", lever: "Bo", prov: "Came with Bo’s card." },
  { id: "chat", kicker: "This chat", lever: "This chat", prov: "Attached here. Drag to reorder." },
];
const DISPLAY = [
  { id: "d-ital", name: "Italic thoughts", scent: "\\*([^*]+)\\*", who: "yours", on: true },
  { id: "d-host", name: "Bo shouting", scent: "[A-Z]{4,}", who: "the host’s", on: true, hostOnly: true },
];
const STAGE_NAMES = ["input", "reply", "lore", "history", "reasoning", "display"];
const SECTIONS = ["Field overrides · 1 set", "Injections · 2", "Documents · 1", "Lorebooks · 2"];
const SECTIONS_AFTER = ["Macro picks", "Host controls"];
`;

const RENDER = `
function rail() { const g = (k, t, on) => '<div class="g' + (on ? ' on' : '') + '" title="' + t + '">' + svg(k) + '</div>'; return '<div class="rail">' + g("home","Home") + g("chats","Chats",true) + g("chars","Characters") + g("corpus","Corpus") + g("databank","Databank") + g("presets","Presets") + g("refinery","Refinery") + g("analytics","Analytics") + '<div class="end g" title="Settings">' + svg("gear") + '</div><div class="av">N</div></div>'; }
function chatList() {
  const row = (ini, t, sub, when, on) => '<div class="crow' + (on ? ' on' : '') + '"><span class="av">' + ini + '</span><span><div class="ttl">' + t + '</div><div class="sub">' + sub + '</div></span><span class="when">' + when + '</span></div>';
  return '<div class="list"><div class="band"><span class="t">Chats</span><span class="n">12</span><span style="margin-left:auto" class="btn primary">' + svg("plus") + 'New</span></div><div class="lsearch"><span>Search chats</span></div>' + row("MR","Midnight Run","Alice, Bo","2m",true) + row("R","Rooftop","Bo","1h") + row("LW","Long Way Down","Alice","yest.") + row("TN","Tavern night","Charlotte, Niko, Tobias","Aug 30") + '</div>';
}
function topbar() { return '<div class="topbar"><span class="lead">' + svg("panel") + '</span><div class="ident"><span class="t">Midnight Run</span><span class="chip">Alice · Bo</span></div><div class="trail"><span class="chip">Search <span class="mono" style="font-size:10.5px">⌘K</span></span><span class="ibtn on" aria-label="Hide details">' + svg("detail") + '</span></div></div>'; }
function room() {
  const m = (ini, who, when, txt) => '<div class="msg"><span class="av">' + ini + '</span><div><div class="who">' + who + '<span class="when">' + when + '</span></div><div class="bubble">' + txt + '</div></div></div>';
  return '<div class="content"><div class="transcript">' + m("A","Alice","14:02","The rain hadn’t stopped since Tuesday. She put the glass down without drinking from it.") + m("B","Bo","14:03","<em>(OOC: keep it under 200 words)</em> Then say it plain.") + m("A","Alice","14:03","“Plain, then. He’s dead and you knew.”") + '</div><div class="composer"><div class="box">' + svg("clip") + '<span>Message Alice and Bo…</span><span class="send">' + svg("send") + '</span></div></div></div>';
}
function sw(on, label, act, id, disabled) { return '<button class="switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '"' + (disabled ? ' aria-disabled="true"' : '') + ' data-act="' + act + '" data-id="' + id + '" aria-label="' + label + '"><i></i></button>'; }
function regexBody(st) {
  const host = st.role === "host";
  const S = st.scripts;
  let out = '';
  if (host) {
    out += '<p class="intro">Prompt rules apply from the next reply; the switches below say <b>where they run here</b>. A row’s own switch is the script’s — <b>off everywhere</b>. What you see on screen is the last group.</p>';
    out += '<div class="levers"><div class="lever master"><span class="l">Run regex in this chat</span>' + sw(st.master, "Run regex in this chat", "master", "") + '</div>' + TIERS.map((t) => { const n = S.filter((s) => s.tier === t.id && s.on).length; return '<div class="lever"><span class="l">' + t.lever + '<span class="n">' + n + '</span></span>' + sw(st.tiers[t.id] !== false, t.lever + " — in this chat", "tier", t.id, !st.master) + '</div>'; }).join('') + '</div>';
    out += '<div class="legend">' + STAGE_NAMES.map((n) => '<span><i></i>' + n + '</span>').join('') + '</div>';
  } else {
    out += '<div class="memberline">The host’s regex applies to this room. Only the host can change it.</div>';
  }
  let rank = 0;
  for (const t of TIERS) {
    if (!host && t.id !== "chat") continue;
    const rows = S.filter((s) => s.tier === t.id);
    const tierOn = st.tiers[t.id] !== false && st.master;
    const cnt = rows.filter((s) => s.on && tierOn).length;
    out += '<div class="tier' + (tierOn ? '' : ' off') + '"><div class="th"><span class="k"><span class="kicker">' + t.kicker + '</span><span class="cnt">· ' + cnt + (tierOn ? '' : ' · off here') + '</span></span><span class="prov" style="padding:0">' + (host ? t.prov : '') + '</span></div><div class="rows">';
    if (rows.length === 0) out += '<div class="rrow"><span></span><span></span><span class="sc">Nothing from here.</span><span></span><span></span></div>';
    for (const s of rows) {
      const runs = s.on && tierOn; if (runs) rank += 1;
      const stagesHtml = '<span class="stages" aria-label="' + s.stages.map((x, i) => x ? STAGE_NAMES[i] : null).filter(Boolean).join(', ') + '">' + s.stages.map((x, i) => '<i class="' + (x ? 'on' : '') + '" title="' + STAGE_NAMES[i] + '"></i>').join('') + '</span>';
      const nameCell = '<span class="main"><span class="nm">' + s.name + (s.also ? '<span class="plus1" title="also attached: ' + s.also + '">+1</span>' : '') + (s.notYours ? '<span class="offmark notyours">previous host</span>' : '') + (!s.on ? '<span class="offmark">off</span>' : '') + '</span><span class="sc">' + stagesHtml + '<span class="mono">' + s.scent + '</span></span></span>';
      const rowSwitch = host && !s.notYours ? sw(s.on, s.name + ' — everywhere', "row", s.id) : '<span></span>';
      const menu = host ? (s.notYours ? '<button class="kebab" aria-label="More for ' + s.name + ': not yours — ask the previous host">' + KEBAB + '</button>' : '<button class="kebab" aria-label="More for ' + s.name + ': Open in library' + (t.id === "chat" ? ', Detach from this chat' : '') + '">' + KEBAB + '</button>') : '<span></span>';
      out += '<div class="rrow' + (runs ? '' : ' off') + '">' + (t.id === "chat" && host && !s.notYours ? '<span class="grip" aria-label="Drag to reorder">' + GRIP + '</span>' : '<span></span>') + '<span class="rank">' + (runs ? rank : '—') + '</span>' + nameCell + rowSwitch + menu + '</div>';
    }
    out += '</div>' + (t.id === "chat" && host ? '<div style="padding-top:6px"><button class="btn ghost" data-act="picker">' + svg("plus") + 'Attach a script</button></div>' : '') + '</div>';
  }
  if (host) {
    out += '<div class="tier"><div class="th" style="border-bottom:0"><span class="k"><span class="kicker">On screen</span><span class="cnt">· ' + DISPLAY.filter((d) => d.on && (!d.hostOnly || st.broadcast)).length + '</span></span></div><p class="intro" style="margin-top:2px">Display scripts change what <b>you</b> see, now. Yours come from your library; the host can broadcast theirs.</p><div class="rows">' + DISPLAY.filter((d) => !d.hostOnly || st.broadcast).map((d) => '<div class="rrow' + (d.on ? '' : ' off') + '"><span></span><span class="rank">' + (d.who === "yours" ? '' : '') + '</span><span class="main"><span class="nm">' + d.name + (d.on ? '' : '<span class="offmark">off</span>') + '</span><span class="sc"><span class="mono">' + d.scent + '</span><span>· ' + d.who + '</span></span></span>' + (d.who === "yours" ? sw(d.on, d.name + ' — everywhere', "disp", d.id) : '<span></span>') + '<button class="kebab" aria-label="More for ' + d.name + ': Open in library">' + KEBAB + '</button></div>').join('') + '</div><div class="srow" style="padding-top:6px"><span class="l" style="font-weight:400">Show my display scripts to everyone</span>' + sw(st.broadcast, "Show my display scripts to everyone", "broadcast", "") + '</div></div>';
  }
  return out;
}
function ctx(st) {
  const disc = (label, open, body, act) => '<div class="disc"><button class="trig" data-act="' + (act || 'noop') + '"><span class="ikicker">' + label.split(' · ')[0] + '</span>' + (label.includes(' · ') ? '<span class="cnt">' + label.split(' · ')[1] + '</span>' : '') + svg("chev", "chev" + (open ? '' : ' closed')) + '</button>' + (open ? '<div class="body">' + body + '</div>' : '') + '</div>';
  const inForce = st.scripts.filter((s) => s.on && st.tiers[s.tier] !== false && st.master).length;
  const cell = (k, l, on) => '<div class="cell' + (on ? ' on' : '') + '">' + svg(k) + l + '</div>';
  let body = '';
  for (const s of SECTIONS) body += disc(s, false, '');
  body += disc('Regex · ' + (st.role === "host" ? (st.master ? inForce : 'off') : st.scripts.filter((s) => s.tier === "chat" && s.on).length), st.open, regexBody(st), "toggle");
  for (const s of (st.role === "host" ? SECTIONS_AFTER : ["Macro picks"])) body += disc(s, false, '');
  return '<div class="ctx"><div class="cband"><div class="t">Midnight Run</div><div class="gloss"><span>Alice · Bo</span><span>·</span><span>memory</span><span>·</span><span>Noir preset</span></div></div><div class="cview">' + body + '</div><div class="kick"><span>Chat · <span class="sel2">This chat</span></span></div><div class="cells">' + cell("users", "Members") + cell("info", "This chat", true) + cell("eye", "Preview") + '</div></div>';
}
function toast(st) { return st.toast ? '<div class="toast" role="status"><span>' + st.toast + '</span><button class="undo" data-act="undo">Undo</button></div>' : ''; }
function desk(st) { return '<div class="shell">' + rail() + chatList() + topbar() + room() + ctx(st) + '</div>' + toast(st); }
function phone(st) {
  const ib = (k, act, label) => '<button class="ib" data-act="' + act + '" aria-label="' + label + '">' + svg(k) + '</button>';
  const tab = (k, l, on) => '<div class="tb' + (on ? ' on' : '') + '">' + svg(k) + l + '</div>';
  const bar = '<div class="tabbar">' + tab("home","Home") + tab("chats","Chats", true) + tab("chars","Characters") + tab("gear","Settings") + '</div>';
  const c = ctx(st).replace('<div class="ctx">', '<div class="ctx" style="border-left:0;flex:1 1 auto;min-height:0">');
  const sheet = st.picker ? '<div class="scrim" data-act="picker"></div><div class="sheet"><div class="shead"><span class="ikicker" style="font-size:12px">Attach a script</span><button class="ib" data-act="picker" aria-label="Close">' + svg("x") + '</button></div><div class="sbody"><div class="lsearch" style="margin:0"><span>Filter your scripts</span></div>' + [["Curly quotes", "already attached everywhere", false, true], ["Collapse triple newlines", "not attached", false, false], ["Name macro guard", "attached to Alice", false, true], ["Fix ellipsis", "not attached", true, false]].map(([n, s, on, dis]) => '<div class="pick"><span class="cb' + (on ? ' on' : '') + '"' + (dis ? ' style="opacity:.4"' : '') + '></span><span><div style="font-weight:500">' + n + '</div><div class="sc" style="font-size:11px;color:var(--muted-fg)">' + s + '</div></span><span></span></div>').join('') + '<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px"><button class="btn ghost" data-act="picker">Cancel</button><button class="btn primary" data-act="picker">Attach to this chat</button></div></div></div>' : '';
  return '<div class="ph"><div class="top">' + ib("back", "noop", "Back to Midnight Run") + '<div class="t">This chat</div><div class="trail"></div></div>' + c + bar + sheet + toast(st) + '</div>';
}
function mount(el) {
  const st = JSON.parse(el.dataset.state);
  st.scripts = SCRIPTS.map((x) => ({ ...x })); for (const [id, on] of Object.entries(st.rowsOff ?? {})) { const r = st.scripts.find((x) => x.id === id); if (r) r.on = on; }
  const draw = () => { el.innerHTML = el.classList.contains("phone") ? phone(st) : desk(st); };
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b || !el.contains(b)) return;
    if (b.getAttribute("aria-disabled") === "true") return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === "toggle") st.open = !st.open;
    else if (act === "master") { st.master = !st.master; st.toast = null; }
    else if (act === "tier") { st.tiers[id] = st.tiers[id] === false ? true : false; st.toast = null; }
    else if (act === "row") { const s = st.scripts.find((x) => x.id === id); s.on = !s.on; const local = s.tier === "chat" && s.elsewhere === false; st.toast = local ? null : (s.on ? 'Turned ' + s.name + ' on everywhere' : 'Turned ' + s.name + ' off everywhere'); st.lastRow = id; }
    else if (act === "disp") { const d = DISPLAY.find((x) => x.id === id); d.on = !d.on; }
    else if (act === "undo") { const s = st.scripts.find((x) => x.id === st.lastRow); if (s) s.on = !s.on; st.toast = null; }
    else if (act === "broadcast") st.broadcast = !st.broadcast;
    else if (act === "picker") st.picker = !st.picker;
    else return;
    draw();
  });
  draw();
}
document.querySelectorAll(".frame").forEach(mount);
document.getElementById("theme").addEventListener("click", () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; });
`;

const board = (title, sub, cls, state) => `<section class="board"><div class="board-title"><b>${title}</b><span class="kicker">${sub}</span></div><div class="wrap"><div class="frame ${cls}" data-state='${JSON.stringify(state)}'></div></div></section>`;
const base = (o) => ({ role: "host", open: true, master: true, tiers: {}, broadcast: false, picker: false, toast: null, ...o });
const NOTES = [
  ["The steer", "Nate: <b>a collapsible thing like Injections or Overrides</b> where you control the regex applied from one spot; the main editing home stays in Config. SillyTavern's panel (a dropdown under its Extensions tab) is the bar: everything that applies, in run order, with its switch, one screen."],
  ["Where", "A <b>Regex</b> disclosure in the room's This-chat tab, sibling of Injections and Lorebooks, closed by default with its count. Not a tab (automation's Rules was retired from a tab into a section here), not a drawer over the transcript you are judging, not Config (four acts per bisect step)."],
  ["Two switches, two scopes (v2: every tier has one, incl. Everywhere; the strip is the first thing you see)", "<b>A tier switch means here</b>: this chat stops using the preset's, a character's, or its own scripts. <b>A row switch means everywhere</b>: it is the script's own on/off, the same as SillyTavern's, and the row says so; a flip that reaches beyond this chat gets a toast with Undo. SillyTavern's two levels are both global; ours gives the debugger a local lever first."],
  ["Run order is the visual order", "Everywhere, then the preset, then each present character in roster order, then Only here, each numbered through. A script attached in two tiers appears once, at its earliest tier, with a +1 chip: what the resolver does, made visible. The four tier groups are plain sections, so all four levers are visible after one tap."],
  ["What the room may change", "The master, the tier switches, any row's on/off, and its own tier: attach (the picker that already exists), detach, drag order. Nothing else: no moving a script between tiers, no reordering another tier from here. Those are one-home operations and live in Config; the row's menu says <b>Open in library</b>."],
  ["Two legs, two rosters (v2)", "The tier groups list PROMPT participation — the only leg the tier switches and the master reach (the display leg is attachment-blind by the 2026-08-02 ruling). <b>On screen</b> is its own roster: your display scripts from your library, plus the host’s when broadcast is on, each with the script’s own switch. Flipping a display script repaints now; the rest apply from the next reply."],
  ["Members", "The effective set resolves under the host's identity, so a member sees Only here read-only and one line. Nothing about the host's library leaks."],
  ["Vocabulary (v2)", "Everywhere and This chat are the Documents rack’s own scope words in the same pane; Attach a script and Detach from this chat follow the lorebook grammar; Open in library is new and gets a map row. Off rows keep full contrast and wear an OFF mark; ranks belong only to rows that run."],
  ["Not adopted", "SillyTavern's default-off consent gates (our import already lifts card scripts into your library; default-off would ship them silently dead), its named enable-sets (parked: bulk select in the library covers it), a per-chat mute of an inherited script (a second kind of off on one row), strikethrough as the only off signal."],
  ["Cost", "One new read (the effective set with provenance, host-gated), two small per-chat flags with no migration, and a section that mounts a picker and an order editor the tree already ships but never wired. The room-fan bug for members' lists (#1733) lands first."],
];
const html = `<title>Regex in This Chat</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${CSS}</style>
<main class="canvas">
  <div class="canvas-head"><div><h1>Regex, in one place: the room's This-chat section</h1><p>Clickable. Flip the master, a tier switch, or a row switch; open the Regex disclosure; on the phone tap Add to this chat. Each board is the same room in a different starting state. Hearth by default; the toggle shows Light.</p></div><button class="tool" id="theme">Toggle theme</button></div>
  ${board("Host · the room, Regex open", "1440 × 900 · the lever strip (master + one switch per tier) is the first thing · seven scripts in run order · Bo shouting deduped to Everywhere (+1) · the On screen roster last", "desk", base({}))}
  ${board("Host · after two flips", "the preset tier turned off HERE (rows stay readable, ranks drop out) · Em-dash killer turned off EVERYWHERE (toast with Undo) · a previous host’s script marked, not yours to switch", "desk", base({ tiers: { preset: false }, toast: "Turned Em-dash killer off everywhere", lastRow: "emdash", rowsOff: { emdash: false } }))}
  ${board("Member · the same room", "Only here, read-only; one line; nothing of the host's library", "desk", base({ role: "member" }))}
  <section class="board"><div class="board-title"><b>Phone · the This-chat panel is a full screen</b><span class="kicker">430 × 860 · Regex open · Add to this chat opens the picker as a sheet</span></div><div class="wrap"><div class="phones"><div class="frame phone" data-state='${JSON.stringify(base({}))}'></div><div class="frame phone" data-state='${JSON.stringify(base({ picker: true }))}'></div></div></div></section>
  <section class="board"><div class="board-title"><b>What this mock decides</b><span class="kicker">defaults — rule on them</span></div><div class="notes">${NOTES.map(([k, p]) => `<div class="note"><span class="k">${k}</span><p>${p}</p></div>`).join("")}</div></section>
</main>
<script>${DATA}${RENDER}

</script>
`;
writeFileSync("canvas.html", html);
console.log("wrote canvas.html", html.length, "bytes");
