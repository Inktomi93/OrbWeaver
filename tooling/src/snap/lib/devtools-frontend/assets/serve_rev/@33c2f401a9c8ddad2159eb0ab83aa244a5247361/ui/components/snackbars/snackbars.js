var g=Object.defineProperty;var v=(e,t)=>{for(var i in t)g(e,i,{get:t[i],enumerable:!0})};var d={};v(d,{DEFAULT_AUTO_DISMISS_MS:()=>m,Snackbar:()=>n});import*as c from"./../../../core/i18n/i18n.js";import*as r from"./../../visual_logging/visual_logging.js";import*as b from"./../../legacy/legacy.js";import*as s from"./../../lit/lit.js";import"./../buttons/buttons.js";var u=`:host{position:fixed;bottom:var(--sys-size-5);left:var(--sys-size-5);z-index:9999;max-width:calc(100% - 2 * var(--sys-size-5));.container{display:flex;align-items:center;overflow:hidden;width:var(--sys-size-31);padding:var(--sys-size-6);background:var(--sys-color-inverse-surface);box-shadow:var(--sys-elevation-level3);border-radius:var(--sys-shape-corner-small);font:var(--sys-typescale-body4-medium);animation:slideIn 100ms cubic-bezier(0,0,0.3,1);box-sizing:border-box;max-width:100%;&.closable{padding:var(--sys-size-5) var(--sys-size-5) var(--sys-size-5) var(--sys-size-6);&.long-action{padding:var(--sys-size-5) var(--sys-size-6) var(--sys-size-6) var(--sys-size-6)}}&.long-action{flex-direction:column;align-items:flex-start;.long-action-container{margin-left:auto}}.label-container{display:flex;width:100%;align-items:center;gap:var(--sys-size-5);.message{width:100%;color:var(--sys-color-inverse-on-surface);flex:1 0 0;text-wrap:pretty;user-select:text}}devtools-button.dismiss{padding:3px}}}@keyframes slideIn{from{transform:translateY(var(--sys-size-5));opacity:0%}to{opacity:100%}}
/*# sourceURL=${import.meta.resolve("./snackbar.css")} */`;var{html:a}=s,l={dismiss:"Dismiss"},f=c.i18n.registerUIStrings("ui/components/snackbars/Snackbar.ts",l),h=c.i18n.getLocalizedString.bind(void 0,f),m=5e3,y=15,n=class e extends HTMLElement{#n=this.attachShadow({mode:"open"});#o;#t=null;#s=!1;#i;static snackbarQueue=[];get dismissTimeout(){return this.hasAttribute("dismiss-timeout")?Number(this.getAttribute("dismiss-timeout")):m}set dismissTimeout(t){this.setAttribute("dismiss-timeout",t.toString())}get message(){return this.getAttribute("message")}set message(t){this.setAttribute("message",t)}get closable(){return this.hasAttribute("closable")}set closable(t){this.toggleAttribute("closable",t)}get actionButtonLabel(){return this.getAttribute("action-button-label")}set actionButtonLabel(t){this.setAttribute("action-button-label",t)}get actionButtonTitle(){return this.getAttribute("action-button-title")}set actionButtonTitle(t){this.setAttribute("action-button-title",t)}set actionButtonClickHandler(t){this.#i=t}constructor(t,i){super(),this.message=t.message,this.#o=i||b.InspectorView.InspectorView.instance().element,t.closable&&(this.closable=t.closable),t.actionProperties&&(this.actionButtonLabel=t.actionProperties.label,this.#i=t.actionProperties.onClick,t.actionProperties.title&&(this.actionButtonTitle=t.actionProperties.title))}static show(t,i){let o=new e(t,i);return e.snackbarQueue.push(o),e.snackbarQueue.length===1&&o.#a(),o}#a(){this.#o.appendChild(this),this.#t&&window.clearTimeout(this.#t),this.closable||(this.#t=window.setTimeout(()=>{this.#e()},this.dismissTimeout))}#e(){if(this.#t&&window.clearTimeout(this.#t),this.remove(),e.snackbarQueue.shift(),e.snackbarQueue.length>0){let t=e.snackbarQueue[0];t&&t.#a()}}#r(t){this.#i&&(t.preventDefault(),this.#i(),this.#e())}connectedCallback(){this.actionButtonLabel&&(this.#s=this.actionButtonLabel.length>y),this.role="alert";let t=s.Directives.classMap({container:!0,"long-action":!!this.#s,closable:!!this.closable}),i=this.actionButtonLabel?a`<devtools-button
        class="snackbar-button"
        @click=${this.#r}
        jslog=${r.action("snackbar.action").track({click:!0})}
        .variant=${"text"}
        .title=${this.actionButtonTitle??""}
        .inverseColorTheme=${!0}
    >${this.actionButtonLabel}</devtools-button>`:s.nothing,o=this.closable?a`<devtools-button
        class="dismiss snackbar-button"
        @click=${this.#e}
        jslog=${r.action("snackbar.dismiss").track({click:!0})}
        aria-label=${h(l.dismiss)}
        .iconName=${"cross"}
        .variant=${"icon"}
        .title=${h(l.dismiss)}
        .inverseColorTheme=${!0}
    ></devtools-button>`:s.nothing;s.render(a`
        <style>${u}</style>
        <div class=${t}>
            <div class="label-container">
                <div class="message">${this.message}</div>
                ${this.#s?s.nothing:i}
                ${o}
            </div>
            ${this.#s?a`<div class="long-action-container">${i}</div>`:s.nothing}
        </div>
    `,this.#n,{host:this})}};customElements.define("devtools-snackbar",n);export{d as Snackbar};
//# sourceMappingURL=snackbars.js.map
