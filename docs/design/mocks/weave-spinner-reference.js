// <weave-spinner> — proposed WebSpinner replacement: the loader IS a web being woven.
// Spokes hold, the capture spiral draws out from the hub, rests, then pays out — looping.
// Inherits currentColor like the shipped spinner; role="status" with required label.
//
// PROVENANCE (orbweaver): claude.ai/design motion review, second handoff 2026-08-14
// ("Orbweaver UI" project, templates/weave-lab/weave-spinner.js), fetched verbatim.
// REFERENCE ONLY for docs/design/weave-lab-upgrades.md §4 — never import into product code.
(() => {
if (customElements.get('weave-spinner')) return;
const TAU = Math.PI * 2, VB = 32, C = 16;
const SPOKES = 8, SPOKE_IN = 2.6, SPOKE_OUT = 13.6, SP_START = 4, SP_END = 13.5, TURNS = 2.6, SAMPLES = 96;
let spokesD = '';
for (let i = 0; i < SPOKES; i++) { const a = i / SPOKES * TAU - Math.PI / 2; spokesD += `M ${(C + Math.cos(a) * SPOKE_IN).toFixed(2)} ${(C + Math.sin(a) * SPOKE_IN).toFixed(2)} L ${(C + Math.cos(a) * SPOKE_OUT).toFixed(2)} ${(C + Math.sin(a) * SPOKE_OUT).toFixed(2)} `; }
let spiralD = '', spiralLen = 0, prev = null;
for (let i = 0; i <= SAMPLES; i++) {
  const s = i / SAMPLES, th = s * TURNS * TAU - Math.PI / 2, r = SP_START + (SP_END - SP_START) * s;
  const x = C + Math.cos(th) * r, y = C + Math.sin(th) * r;
  spiralD += (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  if (prev) spiralLen += Math.hypot(x - prev.x, y - prev.y);
  prev = { x, y };
}
const L = Math.ceil(spiralLen);
const SIZES = { sm: 14, md: 18, lg: 24, xl: 36, hero: 56 };
class WeaveSpinner extends HTMLElement {
  static get observedAttributes() { return ['size', 'label']; }
  connectedCallback() { this._render(); }
  attributeChangedCallback() { if (this.isConnected) this._render(); }
  _render() {
    const px = SIZES[this.getAttribute('size') || 'md'] || SIZES.md;
    const label = this.getAttribute('label') || 'Loading';
    this.setAttribute('role', 'status');
    this.setAttribute('aria-label', label);
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>
:host{display:inline-block;line-height:0;color:inherit}
svg{display:block;overflow:visible}
.rot{transform-origin:16px 16px;animation:wl-rot 14s linear infinite}
.spokes{opacity:.85;animation:wl-breathe 2.6s ease-in-out infinite}
.spiral{stroke-dasharray:${L};stroke-dashoffset:${L};animation:wl-weave 2.6s cubic-bezier(.45,.05,.35,.95) infinite}
.hub{animation:wl-hub 2.6s ease-in-out infinite}
@keyframes wl-rot{to{transform:rotate(360deg)}}
@keyframes wl-weave{0%{stroke-dashoffset:${L}}52%{stroke-dashoffset:0}68%{stroke-dashoffset:0}100%{stroke-dashoffset:${L}}}
@keyframes wl-breathe{0%,100%{opacity:.65}55%{opacity:.95}}
@keyframes wl-hub{0%,100%{r:1.5px}55%{r:1.9px}}
@media (prefers-reduced-motion: reduce){.rot,.spokes,.spiral,.hub{animation:none}.spiral{stroke-dashoffset:0}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
<g class="rot">
<path class="spokes" d="${spokesD.trim()}" stroke-width="0.98" opacity="0.9"></path>
<path class="spiral" d="${spiralD.trim()}" stroke-width="1.13"></path>
<circle class="hub" cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"></circle>
</g>
</svg>
<span class="sr">${label}</span>`;
  }
}
customElements.define('weave-spinner', WeaveSpinner);
})();
