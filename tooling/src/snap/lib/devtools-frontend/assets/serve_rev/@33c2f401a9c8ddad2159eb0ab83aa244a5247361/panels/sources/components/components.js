var C=Object.defineProperty;var S=(o,e)=>{for(var t in e)C(o,t,{get:e[t],enumerable:!0})};var $={};S($,{HeadersView:()=>w,HeadersViewComponent:()=>p});import*as f from"./../../../core/host/host.js";import*as m from"./../../../core/i18n/i18n.js";import*as k from"./../../../models/persistence/persistence.js";import*as E from"./../../../models/text_utils/text_utils.js";import*as c from"./../../../models/workspace/workspace.js";import"./../../../ui/components/buttons/buttons.js";import*as y from"./../../../ui/components/helpers/helpers.js";import*as b from"./../../../ui/legacy/legacy.js";import*as h from"./../../../ui/lit/lit.js";import*as s from"./../../../ui/visual_logging/visual_logging.js";var x=`:host{flex-grow:1;padding:6px}.row{display:flex;flex-direction:row;color:var(--sys-color-token-property-special);font-family:var(--monospace-font-family);font-size:var(--monospace-font-size);align-items:center;line-height:24px}.row devtools-button{line-height:1;margin-left:0.1em}.row devtools-button:nth-of-type(1){margin-left:0.8em}.padded{margin-left:2em}.separator{margin-right:0.5em;color:var(--sys-color-on-surface)}.editable{cursor:text;color:var(--sys-color-on-surface);overflow-wrap:break-word;min-height:18px;line-height:18px;min-width:0.5em;background:transparent;border:none;outline:none;display:inline-block}.editable.red{color:var(--sys-color-token-property-special)}.editable:hover,
.editable:focus{border:1px solid var(--sys-color-neutral-outline);border-radius:2px}.row .inline-button{opacity:0%;visibility:hidden;transition:opacity 200ms}.row:focus-within .inline-button:not([hidden]),
.row:hover .inline-button:not([hidden]){opacity:100%;visibility:visible}.center-wrapper{height:100%;display:flex;justify-content:center;align-items:center}.centered{margin:1em;max-width:300px;text-align:center}.error-header{font-weight:bold;margin-bottom:1em}.error-body{line-height:1.5em;color:var(--sys-color-token-subtle)}.add-block{margin-top:3px}.header-name,
.header-value{min-width:min-content}.link{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer;outline-offset:2px;padding:0}.learn-more-row{line-height:24px}
/*# sourceURL=${import.meta.resolve("./HeadersView.css")} */`;var{html:d}=h,a={addHeader:"Add a header",removeHeader:"Remove this header",removeBlock:"Remove this '`ApplyTo`'-section",errorWhenParsing:"Error when parsing ''{PH1}''.",parsingErrorExplainer:"This is most likely due to a syntax error in ''{PH1}''. Try opening this file in an external editor to fix the error or delete the file and re-create the override.",addOverrideRule:"Add override rule",learnMore:"Learn more"},L=m.i18n.registerUIStrings("panels/sources/components/HeadersView.ts",a),l=m.i18n.getLocalizedString.bind(void 0,L),v="header value",g=o=>`header-name-${o}`,w=class extends b.View.SimpleView{#t=new p;#e;constructor(e){super({title:m.i18n.lockedString("HeadersView"),viewId:"headers-view",jslog:`${s.pane("headers-view")}`}),this.#e=e,this.#e.addEventListener(c.UISourceCode.Events.WorkingCopyChanged,this.#i,this),this.#e.addEventListener(c.UISourceCode.Events.WorkingCopyCommitted,this.#n,this),this.element.appendChild(this.#t),this.#r()}async#r(){let e=await this.#e.requestContentData();this.#o(E.ContentData.ContentData.textOr(e,""))}#o(e){let t=!1,i=[];e=e||"[]";try{if(i=JSON.parse(e),!i.every(k.NetworkPersistenceManager.isHeaderOverride))throw new Error("Type mismatch after parsing")}catch{console.error("Failed to parse",this.#e.url(),"for locally overriding headers."),t=!0}this.#t.data={headerOverrides:i,uiSourceCode:this.#e,parsingError:t}}#i(){this.#o(this.#e.workingCopy())}#n(){this.#o(this.#e.workingCopy())}getComponent(){return this.#t}dispose(){this.#e.removeEventListener(c.UISourceCode.Events.WorkingCopyChanged,this.#i,this),this.#e.removeEventListener(c.UISourceCode.Events.WorkingCopyCommitted,this.#n,this)}},p=class extends HTMLElement{#t=this.attachShadow({mode:"open"});#e=[];#r=null;#o=!1;#i=null;#n="";constructor(){super(),this.#t.addEventListener("focusin",this.#u.bind(this)),this.#t.addEventListener("focusout",this.#v.bind(this)),this.#t.addEventListener("click",this.#f.bind(this)),this.#t.addEventListener("input",this.#x.bind(this)),this.#t.addEventListener("keydown",this.#c.bind(this)),this.#t.addEventListener("paste",this.#y.bind(this)),this.addEventListener("contextmenu",this.#g.bind(this))}set data(e){this.#e=e.headerOverrides,this.#r=e.uiSourceCode,this.#o=e.parsingError,y.ScheduledRender.scheduleRender(this,this.#w)}#c(e){let t=e.target;if(!t.matches(".editable"))return;let i=e;t.matches(".header-name")&&t.innerText===""&&(i.key==="Enter"||i.key==="Tab")?(e.preventDefault(),t.blur()):i.key==="Enter"?(e.preventDefault(),t.blur(),this.#p(t)):i.key==="Escape"&&(e.consume(),t.innerText=this.#n,t.blur(),this.#a(t))}#p(e){let t=Array.from(this.#t.querySelectorAll(".editable")),i=t.indexOf(e);i!==-1&&i+1<t.length&&t[i+1].focus()}#m(e){let t=window.getSelection(),i=document.createRange();i.selectNodeContents(e),t?.removeAllRanges(),t?.addRange(i)}#u(e){let t=e.target;t.matches(".editable")&&(this.#m(t),this.#n=t.innerText)}#v(e){let t=e.target;if(t.innerText===""){let r=t.closest(".row"),n=Number(r.dataset.blockIndex),u=Number(r.dataset.headerIndex);t.matches(".apply-to")?(t.innerText="*",this.#e[n].applyTo="*",this.#s()):t.matches(".header-name")&&this.#h(n,u)}window.getSelection()?.removeAllRanges(),this.#r?.commitWorkingCopy()}#g(e){if(!this.#r)return;let t=new b.ContextMenu.ContextMenu(e);t.appendApplicableItems(this.#r),t.show()}#l(e){let t=new Set(e.map(r=>r.name)),i=1;for(;t.has(g(i));)i++;return g(i)}#f(e){let t=e.target,i=t.closest(".row"),r=Number(i?.dataset.blockIndex||0),n=Number(i?.dataset.headerIndex||0);t.matches(".add-header")?(this.#e[r].headers.splice(n+1,0,{name:this.#l(this.#e[r].headers),value:v}),this.#i={blockIndex:r,headerIndex:n+1},this.#s()):t.matches(".remove-header")?this.#h(r,n):t.matches(".add-block")?(this.#e.push({applyTo:"*",headers:[{name:g(1),value:v}]}),this.#i={blockIndex:this.#e.length-1},this.#s()):t.matches(".remove-block")&&(this.#e.splice(r,1),this.#s())}#b(e,t){return!(t===0&&this.#e[e].headers.length===1&&this.#e[e].headers[t].name===g(1)&&this.#e[e].headers[t].value===v)}#h(e,t){this.#e[e].headers.splice(t,1),this.#e[e].headers.length===0&&this.#e[e].headers.push({name:this.#l(this.#e[e].headers),value:v}),this.#s()}#x(e){this.#a(e.target)}#a(e){let t=e.closest(".row"),i=Number(t.dataset.blockIndex),r=Number(t.dataset.headerIndex);e.matches(".header-name")&&(this.#e[i].headers[r].name=e.innerText,this.#s()),e.matches(".header-value")&&(this.#e[i].headers[r].value=e.innerText,this.#s()),e.matches(".apply-to")&&(this.#e[i].applyTo=e.innerText,this.#s())}#s(){this.#r?.setWorkingCopy(JSON.stringify(this.#e,null,2)),f.userMetrics.actionTaken(f.UserMetrics.Action.HeaderOverrideHeadersFileEdited)}#y(e){let t=e;if(e.preventDefault(),t.clipboardData){let i=t.clipboardData.getData("text/plain"),r=this.#t.getSelection()?.getRangeAt(0);if(!r)return;r.deleteContents();let n=document.createTextNode(i);r.insertNode(n),r.selectNodeContents(n),r.collapse(!1);let u=window.getSelection();u?.removeAllRanges(),u?.addRange(r),this.#a(e.target)}}#w(){if(!y.ScheduledRender.isScheduledRender(this))throw new Error("HeadersView render was not scheduled");if(this.#o){let e=this.#r?.name()||".headers";h.render(d`
        <style>${x}</style>
        <div class="center-wrapper">
          <div class="centered">
            <div class="error-header">${l(a.errorWhenParsing,{PH1:e})}</div>
            <div class="error-body">${l(a.parsingErrorExplainer,{PH1:e})}</div>
          </div>
        </div>
      `,this.#t,{host:this});return}if(h.render(d`
      <style>${x}</style>
      ${this.#e.map((e,t)=>d`
          ${this.#k(e.applyTo,t)}
          ${e.headers.map((i,r)=>d`
              ${this.#E(i,t,r)}
            `)}
        `)}
      <devtools-button
          .variant=${"outlined"}
          .jslogContext=${"headers-view.add-override-rule"}
          class="add-block">
        ${l(a.addOverrideRule)}
      </devtools-button>
      <div class="learn-more-row">
        <devtools-link
            href="https://goo.gle/devtools-override"
            class="link"
            jslogContext=${"learn-more"}>${l(a.learnMore)}</devtools-link>
      </div>
    `,this.#t,{host:this}),this.#i){let e=null;this.#i.headerIndex?e=this.#t.querySelector(`[data-block-index="${this.#i.blockIndex}"][data-header-index="${this.#i.headerIndex}"] .header-name`):e=this.#t.querySelector(`[data-block-index="${this.#i.blockIndex}"] .apply-to`),e&&e.focus(),this.#i=null}}#k(e,t){return d`
      <div class="row" data-block-index=${t}
           jslog=${s.treeItem(e==="*"?e:void 0).track({resize:!0})}>
        <div>${m.i18n.lockedString("Apply to")}</div>
        <div class="separator">:</div>
        ${this.#d(e,"apply-to")}
        <devtools-button
        title=${l(a.removeBlock)}
        .size=${"SMALL"}
        .iconName=${"bin"}
        .iconWidth=${"14px"}
        .iconHeight=${"14px"}
        .variant=${"icon"}
        .jslogContext=${"headers-view.remove-apply-to-section"}
        class="remove-block inline-button"
      ></devtools-button>
      </div>
    `}#E(e,t,i){return d`
      <div class="row padded" data-block-index=${t} data-header-index=${i}
           jslog=${s.treeItem(e.name).parent("headers-editor-row-parent").track({resize:!0})}>
        ${this.#d(e.name,"header-name red",!0)}
        <div class="separator">:</div>
        ${this.#d(e.value,"header-value")}
        <devtools-button
          title=${l(a.addHeader)}
          .size=${"SMALL"}
          .iconName=${"plus"}
          .variant=${"icon"}
          .jslogContext=${"headers-view.add-header"}
          class="add-header inline-button"
        ></devtools-button>
        <devtools-button
          title=${l(a.removeHeader)}
          .size=${"SMALL"}
          .iconName=${"bin"}
          .variant=${"icon"}
          ?hidden=${!this.#b(t,i)}
          .jslogContext=${"headers-view.remove-header"}
          class="remove-header inline-button"
        ></devtools-button>
      </div>
    `}#d(e,t,i){let r=i?s.key():s.value();return d`<span jslog=${r.track({change:!0,keydown:"Enter|Escape|Tab",click:!0})}
                              contenteditable="true"
                              class="editable ${t}"
                              tabindex="0"
                              .innerText=${h.Directives.live(e)}></span>`}};s.registerParentProvider("headers-editor-row-parent",o=>{for(;o.previousElementSibling?.classList?.contains("padded");)o=o.previousElementSibling;return o.previousElementSibling||void 0});customElements.define("devtools-sources-headers-view",p);export{$ as HeadersView};
//# sourceMappingURL=components.js.map
