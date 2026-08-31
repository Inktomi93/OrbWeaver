var d=Object.defineProperty;var n=(s,e)=>{for(var r in e)d(s,r,{get:e[r],enumerable:!0})};var c={};n(c,{Switch:()=>t,SwitchChangeEvent:()=>o});import{html as h,nothing as a,render as b}from"./../../lit/lit.js";import*as l from"./../../visual_logging/visual_logging.js";var i=`:host{position:relative;display:inline-block;width:26px;height:var(--sys-size-8)}input{opacity:0%;width:0;height:0}.slider{box-sizing:border-box;position:absolute;cursor:pointer;left:0;top:0;width:100%;height:100%;background-color:var(--sys-color-surface-variant);border:1px solid var(--sys-color-outline);border-radius:var(--sys-shape-corner-full);transition:background-color 80ms linear}.slider::before{position:absolute;content:"";height:var(--sys-size-5);width:var(--sys-size-5);border-radius:var(--sys-shape-corner-full);top:calc(50% - 4px);left:3px;background-color:var(--sys-color-outline);transition:transform 80ms linear,background-color 80ms linear,width 80ms linear,height 80ms linear,top 80ms linear,left 80ms linear}input:focus-visible + .slider{outline:2px solid var(--sys-color-state-focus-ring);outline-offset:2px}input:checked{& + .slider{background-color:var(--sys-color-primary);border:1px solid var(--sys-color-primary)}& + .slider::before{left:11px;height:var(--sys-size-6);width:var(--sys-size-6);top:calc(50% - 6px);background-color:var(--sys-color-on-primary)}}input:disabled:not(:checked){& + .slider{background-color:transparent;border-color:var(--sys-color-state-disabled)}& + .slider::before{background-color:var(--sys-color-state-disabled)}}input:disabled:checked{& + .slider{background-color:var(--sys-color-state-disabled-container);border-color:transparent}& + .slider::before{background-color:var(--sys-color-surface)}}@media (forced-colors: active){.slider::before,
  input:checked + .slider::before{background-color:ButtonText}input:disabled:not(:checked) + .slider,
  input:disabled:checked + .slider{background-color:transparent;border-color:GrayText}input:disabled:not(:checked) + .slider::before,
  input:disabled:checked + .slider::before{background-color:GrayText}}
/*# sourceURL=${import.meta.resolve("./switch.css")} */`;var o=class s extends Event{checked;static eventName="switchchange";constructor(e){super(s.eventName),this.checked=e}},t=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#e=!1;#o=!1;#r="";#t="";connectedCallback(){this.#s()}set checked(e){this.#e=e,this.#s()}get checked(){return this.#e}set disabled(e){this.#o=e,this.#s()}get disabled(){return this.#o}get jslogContext(){return this.#r}set jslogContext(e){this.#r=e,this.#s()}get label(){return this.#t}set label(e){this.#t=e,this.#s()}#a=e=>{this.#e=e.target.checked,this.dispatchEvent(new o(this.#e))};#s(){let e=this.#r&&l.toggle(this.#r).track({change:!0});b(h`
    <style>${i}</style>
    <label jslog=${e||a}>
      <input type="checkbox"
        aria-label=${this.#t||a}
        @change=${this.#a}
        ?disabled=${this.#o}
        .checked=${this.#e}
      >
      <span class="slider" @click=${r=>r.stopPropagation()}></span>
    </label>
    `,this.#i,{host:this})}};customElements.define("devtools-switch",t);export{c as Switch};
//# sourceMappingURL=switch.js.map
