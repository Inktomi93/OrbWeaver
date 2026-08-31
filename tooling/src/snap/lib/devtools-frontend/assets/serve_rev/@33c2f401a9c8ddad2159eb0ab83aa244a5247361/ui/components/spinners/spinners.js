var c=Object.defineProperty;var l=(n,e)=>{for(var t in e)c(n,t,{get:e[t],enumerable:!0})};var a={};l(a,{Spinner:()=>i});import{html as r,render as d}from"./../../lit/lit.js";var s=`:host{overflow:hidden;width:var(--sys-size-7);height:var(--sys-size-7);display:inline-block;font-size:0;letter-spacing:0;white-space:nowrap}:host([active]){animation:spinner-container-animation 1.5s linear infinite}.indeterminate-spinner{animation:indeterminate-spinner-animation 5332ms cubic-bezier(0.4,0,0.2,1) infinite both;height:100%;width:100%;.left-circle{height:100%;width:50%;display:inline-block;position:relative;overflow:hidden;& > svg{position:absolute;width:200%;animation:indeterminate-left-circle-spinner-animation 1333ms cubic-bezier(0.4,0,0.2,1) infinite both}}.center-circle{height:100%;width:5%;display:inline-block;position:absolute;overflow:hidden;top:0;left:47.5%;box-sizing:border-box;& > svg{position:absolute;width:2000%;left:-900%;transform:rotate(180deg)}}.right-circle{height:100%;width:50%;display:inline-block;position:relative;overflow:hidden;& > svg{position:absolute;width:200%;left:-100%;animation:indeterminate-right-circle-spinner-animation 1333ms cubic-bezier(0.4,0,0.2,1) infinite both}}}.inactive-spinner circle{stroke:var(--sys-color-state-disabled);stroke-width:var(--sys-size-6);fill:transparent}.indeterminate-spinner circle{stroke:var(--sys-color-primary);stroke-width:var(--sys-size-6);fill:transparent;stroke-dasharray:290px;stroke-dashoffset:150px}@keyframes spinner-container-animation{100%{transform:rotate(360deg)}}@keyframes indeterminate-spinner-animation{12.5%{transform:rotate(135deg)}25%{transform:rotate(270deg)}37.5%{transform:rotate(405deg)}50%{transform:rotate(540deg)}62.5%{transform:rotate(675deg)}75%{transform:rotate(810deg)}87.5%{transform:rotate(945deg)}100%{transform:rotate(1080deg)}}@keyframes indeterminate-left-circle-spinner-animation{0%{transform:rotate(265deg)}50%{transform:rotate(130deg)}100%{transform:rotate(265deg)}}@keyframes indeterminate-right-circle-spinner-animation{0%{transform:rotate(-265deg)}50%{transform:rotate(-130deg)}100%{transform:rotate(-265deg)}}
/*# sourceURL=${import.meta.resolve("./spinner.css")} */`;var i=class extends HTMLElement{static observedAttributes=["active"];#t=this.attachShadow({mode:"open"});constructor(e){super(),this.active=e?.active??!0}attributeChangedCallback(e,t,o){t!==o&&e==="active"&&this.#e()}get active(){return this.hasAttribute("active")}set active(e){this.toggleAttribute("active",e)}connectedCallback(){this.#e()}#e(){let e=this.active?r`
      <div class="indeterminate-spinner">
        <div class="left-circle">
          <svg viewBox="0 0 100 100">
            <circle cx="50%" cy="50%" r="2.75rem"></circle></svg>
        </div>
        <div class="center-circle">
          <svg viewBox="0 0 100 100">
            <circle cx="50%" cy="50%" r="2.75rem"></circle></svg>
        </div>
        <div class="right-circle">
          <svg viewBox="0 0 100 100">
            <circle cx="50%" cy="50%" r="2.75rem"></circle></svg>
        </div>
      </div>
    `:r`
      <div class="inactive-spinner">
        <svg viewBox="0 0 100 100">
          <circle cx="50%" cy="50%" r="2.75rem"></circle>
        </svg>
      </div>
    `;d(r`
      <style>
        ${s}
      </style>
      ${e}
    `,this.#t,{host:this})}};customElements.define("devtools-spinner",i);export{a as Spinner};
//# sourceMappingURL=spinners.js.map
