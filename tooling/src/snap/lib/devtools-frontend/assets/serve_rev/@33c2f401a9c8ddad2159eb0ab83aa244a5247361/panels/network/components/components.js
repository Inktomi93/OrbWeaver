var Ye=Object.defineProperty;var H=(o,e)=>{for(var t in e)Ye(o,t,{get:e[t],enumerable:!0})};var xe={};H(xe,{CATEGORY_NAME_GENERAL:()=>_,CATEGORY_NAME_OPEN_INFO:()=>K,CATEGORY_NAME_OPTIONS:()=>B,DEFAULT_VIEW:()=>be,DirectSocketConnectionView:()=>le});import*as Se from"./../../../core/common/common.js";import*as j from"./../../../core/host/host.js";import*as u from"./../../../core/i18n/i18n.js";import*as E from"./../../../core/sdk/sdk.js";import*as W from"./../../../ui/legacy/legacy.js";import*as A from"./../../../ui/lit/lit.js";import*as C from"./../../../ui/visual_logging/visual_logging.js";var z=`.header{background-color:var(--sys-color-surface1);border-bottom:1px solid var(--sys-color-divider);border-top:1px solid var(--sys-color-divider);line-height:25px;padding:0 5px}.header::marker{font-size:11px;line-height:1}.header:focus{background-color:var(--sys-color-state-header-hover)}details[open] .header-count{display:none}details .hide-when-closed{display:none}details[open] .hide-when-closed{display:block}details summary input{vertical-align:middle}.row{display:flex;line-height:18px;padding-left:8px;gap:var(--sys-size-6);user-select:text;margin:var(--sys-size-3) 0}div.raw-headers-row{display:block}.row:first-of-type{margin-top:var(--sys-size-5)}.row:last-child{margin-bottom:var(--sys-size-5)}.header-name{color:var(--sys-color-on-surface-subtle);font:var(--sys-typescale-body5-medium);width:30%;min-width:160px;max-width:240px;flex-shrink:0;text-transform:capitalize}.header-value{word-break:break-all;display:flex;align-items:center;gap:2px;font:var(--sys-typescale-body4-regular)}.header-name,
.header-value{&::selection{color:var(--sys-color-on-tonal-container);background-color:var(--sys-color-tonal-container)}}.green-circle::before,
.red-circle::before,
.yellow-circle::before{content:'';display:inline-block;width:12px;height:12px;border-radius:6px;vertical-align:text-top;margin-right:2px}.green-circle::before{background-color:var(--sys-color-green-bright)}.red-circle::before{background-color:var(--sys-color-error-bright)}.yellow-circle::before{background-color:var(--issue-color-yellow)}.status-with-comment{color:var(--sys-color-token-subtle)}.raw-headers{font-family:var(--source-code-font-family);font-size:var(--source-code-font-size);white-space:pre-wrap;word-break:break-all}.link,
.devtools-link{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer;outline-offset:2px}.inline-icon{vertical-align:middle}.header-grid-container{display:inline-grid;grid-template-columns:156px 50px 1fr;gap:4px;width:calc(100% - 15px)}.header-grid-container div:last-child{text-align:right}.header .devtools-link{color:var(--sys-color-on-surface)}devtools-link{position:relative}devtools-link .inline-icon{padding-right:3px}.purple.dot::before{background-color:var(--sys-color-purple-bright);content:var(--image-file-empty);width:6px;height:6px;border-radius:50%;outline:1px solid var(--icon-gap-toolbar);left:9px;position:absolute;top:11px;z-index:1}summary label{display:inline-flex;align-items:center;vertical-align:middle;gap:var(--sys-size-3)}summary devtools-checkbox{margin-top:1px}
/*# sourceURL=${import.meta.resolve("./RequestHeadersView.css")} */`;var{render:Je,html:N}=A,f={general:"General",options:"Options",openInfo:"Open Info",type:"DirectSocket Type",errorMessage:"Error message",status:"Status",directSocketTypeTcp:"TCP",directSocketTypeUdpConnected:"UDP (connected)",directSocketTypeUdpBound:"UDP (bound)",directSocketStatusOpening:"Opening",directSocketStatusOpen:"Open",directSocketStatusClosed:"Closed",directSocketStatusAborted:"Aborted",joinedMulticastGroups:"joinedMulticastGroups"},Qe=u.i18n.registerUIStrings("panels/network/components/DirectSocketConnectionView.ts",f),y=u.i18n.getLocalizedString.bind(void 0,Qe);function Xe(o){switch(o){case E.NetworkRequest.DirectSocketType.TCP:return y(f.directSocketTypeTcp);case E.NetworkRequest.DirectSocketType.UDP_BOUND:return y(f.directSocketTypeUdpBound);case E.NetworkRequest.DirectSocketType.UDP_CONNECTED:return y(f.directSocketTypeUdpConnected)}}function Ze(o){switch(o){case E.NetworkRequest.DirectSocketStatus.OPENING:return y(f.directSocketStatusOpening);case E.NetworkRequest.DirectSocketStatus.OPEN:return y(f.directSocketStatusOpen);case E.NetworkRequest.DirectSocketStatus.CLOSED:return y(f.directSocketStatusClosed);case E.NetworkRequest.DirectSocketStatus.ABORTED:return y(f.directSocketStatusAborted)}}var _="general",B="options",K="open-info",be=(o,e,t)=>{function i(l){return o.openCategories.includes(l)}function r(l,g,$){return N`
        <details
          class="direct-socket-category"
          ?open=${i(l)}
          @toggle=${ae=>o.onToggleCategory(ae,l)}
          jslog=${C.sectionHeader(l).track({click:!0})}
          aria-label=${g}
        >
          <summary
            class="header"
            @keydown=${ae=>o.onSummaryKeyDown(ae,l)}
          >
            <div class="header-grid-container">
              <div>
                ${g}
              </div>
              <div class="hide-when-closed"></div>
            </div>
          </summary>
          ${$}
        </details>
      `}function s(l,g,$){return g?N`
        <div class="row">
          <div class="header-name">${l}:</div>
          <div
            class="header-value ${$?.join(" ")}"
            @copy=${()=>o.onCopyRow()}
          >${g}</div>
        </div>
      `:A.nothing}let a=o.socketInfo,d=N`
      <div jslog=${C.section(_)}>
        ${s(y(f.type),Xe(a.type))}
        ${s(y(f.status),Ze(a.status))}
        ${s(y(f.errorMessage),a.errorMessage)}
        ${s(y(f.joinedMulticastGroups),a.joinedMulticastGroups?Array.from(a.joinedMulticastGroups).join(", "):"")}
      </div>`,n=N`
      <div jslog=${C.section(B)}>
        ${s(u.i18n.lockedString("remoteAddress"),a.createOptions.remoteAddr)}
        ${s(u.i18n.lockedString("remotePort"),a.createOptions.remotePort?.toString(10))}
        ${s(u.i18n.lockedString("localAddress"),a.createOptions.localAddr)}
        ${s(u.i18n.lockedString("localPort"),a.createOptions.localPort?.toString(10))}
        ${s(u.i18n.lockedString("noDelay"),a.createOptions.noDelay?.toString())}
        ${s(u.i18n.lockedString("keepAliveDelay"),a.createOptions.keepAliveDelay?.toString(10))}
        ${s(u.i18n.lockedString("sendBufferSize"),a.createOptions.sendBufferSize?.toString(10))}
        ${s(u.i18n.lockedString("receiveBufferSize"),a.createOptions.receiveBufferSize?.toString(10))}
        ${s(u.i18n.lockedString("dnsQueryType"),a.createOptions.dnsQueryType)}
        ${s(u.i18n.lockedString("multicastTimeToLive"),a.createOptions.multicastTimeToLive?.toString(10))}
        ${s(u.i18n.lockedString("multicastLoopback"),a.createOptions.multicastLoopback?.toString())}
        ${s(u.i18n.lockedString("multicastAllowAddressSharing"),a.createOptions.multicastAllowAddressSharing?.toString())}
      </div>`,m=A.nothing;a.openInfo&&(m=N`
          <div jslog=${C.section(K)}>
            ${s(u.i18n.lockedString("remoteAddress"),a.openInfo.remoteAddr)}
            ${s(u.i18n.lockedString("remotePort"),a.openInfo?.remotePort?.toString(10))}
            ${s(u.i18n.lockedString("localAddress"),a.openInfo.localAddr)}
            ${s(u.i18n.lockedString("localPort"),a.openInfo?.localPort?.toString(10))}
          </div>`),Je(N`
    <style>${W.inspectorCommonStyles}</style>
    <style>${z}</style>
    ${r(_,y(f.general),d)}
    ${r(B,y(f.options),n)}
    ${a.openInfo?r(K,y(f.openInfo),m):A.nothing}
  `,t,{container:{attributes:{jslog:`${C.pane("connection-info").track({resize:!0})}`}}})},le=class extends W.Widget.Widget{#t;#e;constructor(e,t=be){super({useShadowDom:"pure"}),this.#t=e,this.#e=t,this.performUpdate()}wasShown(){super.wasShown(),this.#t.addEventListener(E.NetworkRequest.Events.TIMING_CHANGED,this.requestUpdate,this)}willHide(){super.willHide(),this.#t.removeEventListener(E.NetworkRequest.Events.TIMING_CHANGED,this.requestUpdate,this)}performUpdate(){if(!this.#t||!this.#t.directSocketInfo)return;let e=[_,B,K].filter(i=>this.#o(i).get(),this),t={socketInfo:this.#t.directSocketInfo,openCategories:e,onSummaryKeyDown:(i,r)=>{if(!i.target)return;let a=i.target.parentElement;if(!a)throw new Error("<details> element is not found for a <summary> element");let d;switch(i.key){case"ArrowLeft":d=!1;break;case"ArrowRight":d=!0;break;default:return}a.open!==d&&this.#i(r,d)},onToggleCategory:(i,r)=>{let s=i.target;this.#i(r,s.open)},onCopyRow:()=>{j.userMetrics.actionTaken(j.UserMetrics.Action.NetworkPanelCopyValue)}};this.#e(t,void 0,this.contentElement)}#i(e,t){this.#o(e).set(t),this.requestUpdate()}#o(e){return Se.Settings.Settings.instance().createSetting(`connection-info-${e}-category-expanded`,!0)}};var Re={};H(Re,{EditableSpan:()=>G});import*as de from"./../../../ui/components/helpers/helpers.js";import{html as et,render as tt}from"./../../../ui/lit/lit.js";import*as Ee from"./../../../ui/visual_logging/visual_logging.js";var $e=`:host{display:inline}.editable{cursor:text;overflow-wrap:anywhere;min-height:18px;line-height:18px;min-width:0.5em;background:transparent;border:none;border-radius:4px;outline:none;display:inline-block;font-family:var(--monospace-font-family);font-size:var(--monospace-font-size);&:hover{border:1px solid var(--sys-color-neutral-outline)}&:focus{border:1px solid var(--sys-color-state-focus-ring)}}.editable::selection{color:var(--sys-color-on-tonal-container);background-color:var(--sys-color-tonal-container)}
/*# sourceURL=${import.meta.resolve("./EditableSpan.css")} */`;var G=class extends HTMLElement{#t=this.attachShadow({mode:"open"});#e="";connectedCallback(){this.#t.addEventListener("focusin",this.#r.bind(this)),this.#t.addEventListener("keydown",this.#i.bind(this)),this.#t.addEventListener("input",this.#o.bind(this))}set data(e){this.#e=e.value,de.ScheduledRender.scheduleRender(this,this.#n)}get value(){return this.#t.querySelector("span")?.innerText||""}set value(e){this.#e=e;let t=this.#t.querySelector("span");t&&(t.innerText=e)}#i(e){e.key==="Enter"&&(e.preventDefault(),e.target?.blur())}#o(e){this.#e=e.target.innerText}#r(e){let t=e.target,i=window.getSelection(),r=document.createRange();r.selectNodeContents(t),i?.removeAllRanges(),i?.addRange(r)}#n(){if(!de.ScheduledRender.isScheduledRender(this))throw new Error("HeaderSectionRow render was not scheduled");tt(et`
      <style>${$e}</style>
      <span
        contenteditable="plaintext-only"
        class="editable"
        tabindex="0"
        .innerText=${this.#e}
        jslog=${Ee.value("header-editor").track({change:!0,keydown:"Enter|Escape"})}
        ></span>`,this.#t,{host:this})}focus(){requestAnimationFrame(()=>{this.#t.querySelector(".editable")?.focus()})}};customElements.define("devtools-editable-span",G);var Le={};H(Le,{EnableHeaderEditingEvent:()=>J,HeaderEditedEvent:()=>V,HeaderRemovedEvent:()=>Y,HeaderSectionRow:()=>Q,compareHeaders:()=>c,isValidHeaderName:()=>P});import"./../../../ui/kit/kit.js";import"./../../../ui/legacy/legacy.js";import*as X from"./../../../core/host/host.js";import*as Z from"./../../../core/i18n/i18n.js";import*as Te from"./../../../core/platform/platform.js";import*as De from"./../../../core/sdk/sdk.js";import*as ee from"./../../../third_party/chromium/client-variations/client-variations.js";import"./../../../ui/components/buttons/buttons.js";import*as D from"./../../../ui/components/helpers/helpers.js";import*as w from"./../../../ui/lit/lit.js";import*as ce from"./../../../ui/visual_logging/visual_logging.js";var Ce=`:host{display:block}.row{display:flex;line-height:18px;padding-left:8px;gap:var(--sys-size-6);user-select:text;margin:var(--sys-size-3) 0}.row.header-editable{font-family:var(--monospace-font-family);font-size:var(--monospace-font-size)}.header-name{font:var(--sys-typescale-body5-medium);color:var(--sys-color-on-surface-subtle);width:30%;min-width:160px;max-width:240px;flex-shrink:0;text-transform:capitalize;overflow-wrap:break-word}.header-name,
.header-value{&::selection{color:var(--sys-color-on-tonal-container);background-color:var(--sys-color-tonal-container)}}.header-name.pseudo-header{text-transform:none}.header-editable .header-name{color:var(--sys-color-token-property-special)}.row.header-deleted .header-name{color:var(--sys-color-token-subtle)}.header-value{display:flex;overflow-wrap:anywhere;margin-inline-end:14px;font:var(--sys-typescale-body4-regular)}.header-badge-text{font-variant:small-caps;font-weight:500;white-space:pre-wrap;word-break:break-all;text-transform:none}.header-badge{display:inline;background-color:var(--sys-color-error);color:var(--sys-color-on-error);border-radius:100vh;padding-left:6px;padding-right:6px}.call-to-action{background-color:var(--sys-color-neutral-container);padding:8px;border-radius:5px;margin:4px}.call-to-action-body{padding:6px 0;margin-left:9.5px;border-left:2px solid var(--issue-color-yellow);padding-left:18px;line-height:20px}.call-to-action .explanation{font-weight:bold}.call-to-action code{font-size:90%}.call-to-action .example .comment::before{content:" \u2014 "}.link,
.devtools-link{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer;outline-offset:2px}.explanation .link{font-weight:normal}.inline-icon{vertical-align:middle}.row-flex-icon{margin:2px 5px 0}.header-value code{display:block;white-space:pre-wrap;font-size:90%;color:var(--sys-color-token-subtle)}devtools-link .inline-icon{padding-right:3px}.header-highlight{background-color:var(--sys-color-yellow-container)}.header-warning{color:var(--sys-color-error)}.header-overridden{background-color:var(--sys-color-tertiary-container);border-left:3px solid var(--sys-color-tertiary);padding-left:5px}.header-deleted{background-color:var(--sys-color-surface-error);border-left:3px solid var(--sys-color-error-bright);color:var(--sys-color-token-subtle);text-decoration:line-through}.header-highlight.header-overridden{background-color:var(--sys-color-yellow-container);border-left:3px solid var(--sys-color-tertiary);padding-left:5px}.inline-button{vertical-align:middle}.row .inline-button{opacity:0%;visibility:hidden;transition:opacity 200ms;padding-left:2px}.row.header-overridden:focus-within .inline-button,
.row.header-overridden:hover .inline-button{opacity:100%;visibility:visible}.row:hover .inline-button.enable-editing{opacity:100%;visibility:visible}.flex-right{margin-left:auto}.flex-columns{flex-direction:column}
/*# sourceURL=${import.meta.resolve("./HeaderSectionRow.css")} */`;var{render:it,html:v}=w,b={activeClientExperimentVariation:"Active `client experiment variation IDs`.",activeClientExperimentVariationIds:"Active `client experiment variation IDs` that trigger server-side behavior.",decoded:"Decoded:",editHeader:"Override header",headerNamesOnlyLetters:"Header names should contain only letters, digits, hyphens or underscores",learnMore:"Learn more",learnMoreInTheIssuesTab:"Learn more in the issues tab",reloadPrompt:"Refresh the page/request for these changes to take effect",removeOverride:"Remove this header override"},ot=Z.i18n.registerUIStrings("panels/network/components/HeaderSectionRow.ts",b),T=Z.i18n.getLocalizedString.bind(void 0,ot),P=o=>/^[a-z0-9_\-]+$/i.test(o),c=(o,e)=>o?.replaceAll(/\s/g," ")===e?.replaceAll(/\s/g," "),V=class o extends Event{static eventName="headeredited";headerName;headerValue;constructor(e,t){super(o.eventName,{}),this.headerName=e,this.headerValue=t}},Y=class o extends Event{static eventName="headerremoved";headerName;headerValue;constructor(e,t){super(o.eventName,{}),this.headerName=e,this.headerValue=t}},J=class o extends Event{static eventName="enableheaderediting";constructor(){super(o.eventName,{})}},Q=class extends HTMLElement{#t=this.attachShadow({mode:"open"});#e=null;#i=!1;#o=!0;set data(e){this.#e=e.header,this.#i=this.#e.originalValue!==void 0&&this.#e.value!==this.#e.originalValue,this.#o=P(this.#e.name),D.ScheduledRender.scheduleRender(this,this.#r)}#r(){if(!D.ScheduledRender.isScheduledRender(this))throw new Error("HeaderSectionRow render was not scheduled");if(!this.#e)return;let e=w.Directives.classMap({row:!0,"header-highlight":!!this.#e.highlight,"header-overridden":!!this.#e.isOverride||this.#i,"header-editable":this.#e.valueEditable===1,"header-deleted":!!this.#e.isDeleted}),t=w.Directives.classMap({"header-name":!0,"pseudo-header":this.#e.name.startsWith(":")}),i=w.Directives.classMap({"header-value":!0,"header-warning":!!this.#e.headerValueIncorrect,"flex-columns":this.#e.name==="x-client-data"&&!this.#e.isResponseHeader}),r=this.#e.nameEditable&&this.#e.valueEditable===1,s=this.#e.nameEditable||this.#e.isDeleted||this.#i;it(v`
      <style>${Ce}</style>
      <div class=${e}>
        <div class=${t}>
          ${this.#e.headerNotSet?v`<div class="header-badge header-badge-text">${Z.i18n.lockedString("not-set")}</div> `:w.nothing}
          ${r&&!this.#o?v`<devtools-icon class="inline-icon disallowed-characters medium" title=${b.headerNamesOnlyLetters} name='cross-circle-filled'>
            </devtools-icon>`:w.nothing}
          ${r&&!this.#e.isDeleted?v`<devtools-editable-span
              @focusout=${this.#m}
              @keydown=${this.#l}
              @input=${this.#h}
              @paste=${this.#f}
              .data=${{value:this.#e.name}}
            ></devtools-editable-span>`:this.#e.name}
        </div>
        <div
          class=${i}
          @copy=${()=>X.userMetrics.actionTaken(X.UserMetrics.Action.NetworkPanelCopyValue)}
        >
          ${this.#n()}
        </div>
        ${s?v`<devtools-icon name="info" class="row-flex-icon flex-right medium" title=${b.reloadPrompt}>
          </devtools-icon>`:w.nothing}
      </div>
      ${this.#p(this.#e.blockedDetails)}
    `,this.#t,{host:this}),this.#e.highlight&&this.scrollIntoView({behavior:"auto"})}#n(){if(!this.#e)return w.nothing;if(this.#e.name==="x-client-data"&&!this.#e.isResponseHeader)return this.#u(this.#e);if(this.#e.isDeleted||this.#e.valueEditable!==1){let e=this.#e.isResponseHeader&&!this.#e.isDeleted&&this.#e.valueEditable!==2;return v`
      ${this.#e.value||""}
      ${this.#a(this.#e)}
      ${e?v`
        <devtools-button
          title=${T(b.editHeader)}
          .accessibleLabel=${T(b.editHeader)}
          .size=${"SMALL"}
          .iconName=${"edit"}
          .variant=${"icon"}
          @click=${()=>{this.dispatchEvent(new J)}}
          jslog=${ce.action("enable-header-overrides").track({click:!0})}
          class="enable-editing inline-button"
        ></devtools-button>
      `:w.nothing}
    `}return v`
      <devtools-editable-span
        @focusout=${this.#c}
        @input=${this.#s}
        @paste=${this.#s}
        @keydown=${this.#l}
        .data=${{value:this.#e.value||""}}
      ></devtools-editable-span>
      ${this.#a(this.#e)}
      <devtools-button
        title=${T(b.removeOverride)}
        .size=${"SMALL"}
        .iconName=${"bin"}
        .variant=${"icon"}
        class="remove-header inline-button"
        @click=${this.#g}
        jslog=${ce.action("remove-header-override").track({click:!0})}
      ></devtools-button>
    `}#u(e){let t=ee.parseClientVariations(e.value||""),i=ee.formatClientVariations(t,T(b.activeClientExperimentVariation),T(b.activeClientExperimentVariationIds));return v`
      <div>${e.value||""}</div>
      <div>${T(b.decoded)}</div>
      <code>${i}</code>
    `}focus(){requestAnimationFrame(()=>{this.#t.querySelector(".header-name devtools-editable-span")?.focus()})}#a(e){if(e.name==="set-cookie"&&e.setCookieBlockedReasons){let t=e.setCookieBlockedReasons.map(De.NetworkRequest.setCookieBlockedReasonToUiString).join(`
`);return v`
        <devtools-icon class="row-flex-icon medium" title=${t} name='warning-filled'>
        </devtools-icon>
      `}return w.nothing}#p(e){return e?v`
      <div class="call-to-action">
        <div class="call-to-action-body">
          <div class="explanation">${e.explanation()}</div>
          ${e.examples.map(t=>v`
            <div class="example">
              <code>${t.codeSnippet}</code> ${t.comment?v`<span class="comment"> ${t.comment()}</span>`:""}
           </div>`)} ${this.#d(e)}
        </div>
      </div>
    `:w.nothing}#d(e){return e?.reveal?v`
        <div class="devtools-link" @click=${e.reveal}>
          <devtools-icon name="issue-exclamation-filled" class="inline-icon medium">
          </devtools-icon
          >${T(b.learnMoreInTheIssuesTab)}
        </div>
      `:e?.link?v`
        <devtools-link href=${e.link.url} class="link">
          <devtools-icon name="open-externally" class="inline-icon extra-large" style="color: var(--icon-link);">
          </devtools-icon
          >${T(b.learnMore)}
        </devtools-link>
      `:w.nothing}#c(e){let t=e.target;if(!this.#e)return;let i=t.value.trim();c(i,this.#e.value?.trim())||(this.#e.value=i,this.dispatchEvent(new V(this.#e.name,i)),D.ScheduledRender.scheduleRender(this,this.#r)),window.getSelection()?.removeAllRanges(),this.#e.originalName=""}#m(e){let t=e.target;if(!this.#e)return;let i=Te.StringUtilities.toLowerCaseString(t.value.trim());i===""?t.value=this.#e.name:c(i,this.#e.name.trim())||(this.#e.name=i,this.dispatchEvent(new V(i,this.#e.value||"")),D.ScheduledRender.scheduleRender(this,this.#r)),window.getSelection()?.removeAllRanges()}#g(){if(!this.#e)return;let e=this.#t.querySelector(".header-value devtools-editable-span");this.#e.originalValue&&(e.value=this.#e?.originalValue),this.dispatchEvent(new Y(this.#e.name,this.#e.value||""))}#l(e){let t=e.target;if(e.key==="Escape"){if(e.consume(),t.matches(".header-name devtools-editable-span"))t.value=this.#e?.name||"",this.#h(e);else if(t.matches(".header-value devtools-editable-span")&&(t.value=this.#e?.value||"",this.#s(e),this.#e?.originalName)){let i=this.#t.querySelector(".header-name devtools-editable-span");i.value=this.#e.originalName,this.#e.originalName="",i.dispatchEvent(new Event("input")),i.focus();return}t.blur()}}#h(e){let t=e.target,i=P(t.value);this.#o!==i&&(this.#o=i,D.ScheduledRender.scheduleRender(this,this.#r))}#s(e){let t=e.target,i=this.#e?.originalValue!==void 0&&!c(this.#e?.originalValue||"",t.value);this.#i!==i&&(this.#i=i,this.#e&&(this.#e.highlight=!1),D.ScheduledRender.scheduleRender(this,this.#r))}#f(e){if(!e.clipboardData)return;let t=e.target,i=e.clipboardData.getData("text/plain")||"",r=i.indexOf(":");if(r<1){t.value=i,e.preventDefault(),t.dispatchEvent(new Event("input",{bubbles:!0}));return}this.#e&&(this.#e.originalName=this.#e.name);let s=i.substring(r+1,i.length).trim(),a=i.substring(0,r);t.value=a,t.dispatchEvent(new Event("input"));let d=this.#t.querySelector(".header-value devtools-editable-span");d&&(d.focus(),d.value=s,d.dispatchEvent(new Event("input"))),e.preventDefault()}};customElements.define("devtools-header-section-row",Q);var Ue={};H(Ue,{DEFAULT_VIEW:()=>Ie,RequestHeaderSection:()=>pe,requestHeadersViewStyles:()=>z});import"./../../../ui/kit/kit.js";import*as me from"./../../../core/i18n/i18n.js";import*as he from"./../../../core/platform/platform.js";import*as He from"./../../../ui/legacy/legacy.js";import*as ge from"./../../../ui/lit/lit.js";import*as Ne from"./../../../ui/visual_logging/visual_logging.js";import"./../forward/forward.js";var Oe=`@scope to (devtools-widget > *){:scope{display:block}devtools-header-section-row:last-of-type{margin-bottom:10px}devtools-header-section-row:first-of-type{margin-top:2px}.call-to-action{background-color:var(--sys-color-neutral-container);padding:8px;border-radius:5px;margin:4px}.call-to-action-body{padding:6px 0;margin-left:9.5px;border-left:2px solid var(--issue-color-yellow);padding-left:18px;line-height:20px}.call-to-action .explanation{font-weight:bold}.call-to-action code{font-size:90%}.call-to-action .example .comment::before{content:" \u2014 "}.link,
  .devtools-link{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer;outline-offset:2px}.explanation .link{font-weight:normal}.inline-icon{vertical-align:middle}@media (forced-colors: active){.link,
    .devtools-link{color:linktext;text-decoration-color:linktext}}}
/*# sourceURL=${import.meta.resolve("./RequestHeaderSection.css")} */`;var{render:rt,html:ue}=ge,q={learnMore:"Learn more",provisionalHeadersAreShownDisableCache:"Provisional headers are shown. Disable cache to see full headers.",onlyProvisionalHeadersAre:"Only provisional headers are available because this request was not sent over the network and instead was served from a local cache, which doesn\u2019t store the original request headers. Disable cache to see full request headers.",provisionalHeadersAreShown:"Provisional headers are shown."},st=me.i18n.registerUIStrings("panels/network/components/RequestHeaderSection.ts",q),te=me.i18n.getLocalizedString.bind(void 0,st),Ie=(o,e,t)=>{let i=o.headers;rt(ue`
    <style>${Oe}</style>
    ${o.isProvisionalHeaders?nt(o.isRequestCached):ge.nothing}
    ${i.map(r=>ue`
      <devtools-header-section-row
        .data=${{header:r}}
        jslog=${Ne.item("request-header").track({resize:!0})}
      ></devtools-header-section-row>
    `)}
  `,t)};function nt(o){let e,t="";return o?(e=te(q.provisionalHeadersAreShownDisableCache),t=te(q.onlyProvisionalHeadersAre)):e=te(q.provisionalHeadersAreShown),ue`
    <div class="call-to-action">
      <div class="call-to-action-body">
        <div class="explanation" title=${t}>
          <devtools-icon class="inline-icon medium" name='warning-filled'>
          </devtools-icon>
          ${e} <devtools-link href="https://developer.chrome.com/docs/devtools/network/reference/#provisional-headers" class="link">${te(q.learnMore)}</devtools-link>
        </div>
      </div>
    </div>
  `}var pe=class extends He.Widget.Widget{#t=null;#e=[];#i;constructor(e,t=Ie){super(e,{useShadowDom:!0}),this.#i=t}set toReveal(e){e&&(e.section==="Request"&&this.#e.filter(t=>t.name===e.header?.toLowerCase()).forEach(t=>{t.highlight=!0}),this.requestUpdate())}set request(e){this.#t=e,this.#e=this.#t.requestHeaders().map(t=>({name:he.StringUtilities.toLowerCaseString(t.name),value:t.value,valueEditable:2})),this.#e.sort((t,i)=>he.StringUtilities.compare(t.name,i.name)),this.requestUpdate()}performUpdate(){this.#t&&this.#i({headers:this.#e,isProvisionalHeaders:this.#t.requestHeadersText()===void 0,isRequestCached:this.#t.cached()||this.#t.cachedInMemory()},void 0,this.contentElement)}};var ze={};H(ze,{DEFAULT_VIEW:()=>Me,RequestTrustTokensView:()=>ve,statusConsideredSuccess:()=>Fe});import"./../../../ui/components/report_view/report_view.js";import"./../../../ui/kit/kit.js";import*as ye from"./../../../core/i18n/i18n.js";import*as fe from"./../../../core/sdk/sdk.js";import*as Pe from"./../../../ui/legacy/legacy.js";import*as I from"./../../../ui/lit/lit.js";import*as Ve from"./../../../ui/visual_logging/visual_logging.js";var Ae=`@scope to (devtools-widget > *){.code{font-family:var(--monospace-font-family);font-size:var(--monospace-font-size)}.issuers-list{display:flex;flex-direction:column;list-style-type:none;padding:0;margin:0}.status-icon{margin:0 0.3em 2px 0;vertical-align:middle;&.failure{color:var(--icon-error)}&.success{color:var(--icon-checkmark-green)}}}
/*# sourceURL=${import.meta.resolve("./RequestTrustTokensView.css")} */`;var{html:L,render:at}=I,h={parameters:"Parameters",type:"Type",refreshPolicy:"Refresh policy",issuers:"Issuers",topLevelOrigin:"Top level origin",issuer:"Issuer",result:"Result",status:"Status",numberOfIssuedTokens:"Number of issued tokens",success:"Success",failure:"Failure",theOperationsResultWasServedFrom:"The operations result was served from cache.",theOperationWasFulfilledLocally:"The operation was fulfilled locally, no request was sent.",theKeysForThisPSTIssuerAreUnavailable:"The keys for this PST issuer are unavailable. The issuer may need to be registered via the Chrome registration process.",aClientprovidedArgumentWas:"A client-provided argument was malformed or otherwise invalid.",eitherNoInputsForThisOperation:"Either no inputs for this operation are available or the output exceeds the operations quota.",theServersResponseWasMalformedOr:"The servers response was malformed or otherwise invalid.",theOperationFailedForAnUnknown:"The operation failed for an unknown reason.",perSiteLimit:"Per-site issuer limit reached."},lt=ye.i18n.registerUIStrings("panels/network/components/RequestTrustTokensView.ts",h),p=ye.i18n.getLocalizedString.bind(void 0,lt);function qe(o,e,t){return!e||Array.isArray(e)&&e.length===0?I.nothing:L`
    <devtools-report-key>${o}</devtools-report-key>
    <devtools-report-value class=${t?"code":""}>
      ${Array.isArray(e)?L`
        <ul class="issuers-list">
            ${e.map(i=>L`<li>${i}</li>`)}
        </ul>`:e}
    </devtools-report-value>
  `}var dt=(o,e,t)=>o?L`
    <devtools-report-section-header>${p(h.result)}</devtools-report-section-header>
    <devtools-report-key>${p(h.status)}</devtools-report-key>
    <devtools-report-value>
      <span>
        <devtools-icon class="status-icon medium ${o==="Success"?"success":"failure"}"
        name=${o==="Success"?"check-circle":"cross-circle-filled"}>
        </devtools-icon>
        <strong>${p(o==="Success"?h.success:h.failure)}</strong>
        ${e?L` ${e}`:I.nothing}
      </span>
    </devtools-report-value>
    ${qe(p(h.numberOfIssuedTokens),t)}
    <devtools-report-divider></devtools-report-divider>
    `:I.nothing,ct=o=>!o||o.length===0?I.nothing:L`
    <devtools-report-section-header jslog=${Ve.pane("trust-tokens").track({resize:!0})}>
      ${p(h.parameters)}
    </devtools-report-section-header>
    ${o.map(e=>qe(e.name,e.value,e.isCode))}
    <devtools-report-divider></devtools-report-divider>
  `,Me=(o,e,t)=>{at(L`
    <style>${Ae}</style>
    <devtools-report>
      ${ct(o.params)}
      ${dt(o.status,o.description,o.issuedTokenCount)}
    </devtools-report>
  `,t)},ve=class extends Pe.Widget.Widget{#t=null;#e;constructor(e,t=Me){super(e),this.#e=t}get request(){return this.#t}set request(e){this.#t!==e&&(this.#o(),this.#t=e,this.#i(),this.requestUpdate())}#i(){this.#t&&this.isShowing()&&this.#t.addEventListener(fe.NetworkRequest.Events.TRUST_TOKEN_RESULT_ADDED,this.requestUpdate,this)}#o(){this.#t&&this.#t.removeEventListener(fe.NetworkRequest.Events.TRUST_TOKEN_RESULT_ADDED,this.requestUpdate,this)}wasShown(){super.wasShown(),this.#i(),this.requestUpdate()}willHide(){super.willHide(),this.#o()}performUpdate(){if(!this.request)return;let e=this.request.trustTokenParams(),t=this.request.trustTokenOperationDoneEvent(),i={};e&&(i.params=[{name:p(h.type),value:e.operation.toString(),isCode:!0}],e.operation==="Redemption"&&i.params.push({name:p(h.refreshPolicy),value:e.refreshPolicy.toString(),isCode:!0}),e.issuers&&e.issuers.length>0&&i.params.push({name:p(h.issuers),value:e.issuers}),t?.topLevelOrigin&&i.params.push({name:p(h.topLevelOrigin),value:t.topLevelOrigin}),t?.issuerOrigin&&i.params.push({name:p(h.issuer),value:t.issuerOrigin})),t&&(i.status=Fe(t.status)?"Success":"Failure",i.description=ht(t.status)??void 0,i.issuedTokenCount=t.type==="Issuance"?t.issuedTokenCount:void 0),this.#e(i,void 0,this.contentElement)}};function Fe(o){return o==="Ok"||o==="AlreadyExists"||o==="FulfilledLocally"}function ht(o){switch(o){case"Ok":return null;case"AlreadyExists":return p(h.theOperationsResultWasServedFrom);case"FulfilledLocally":return p(h.theOperationWasFulfilledLocally);case"InvalidArgument":return p(h.aClientprovidedArgumentWas);case"ResourceExhausted":return p(h.eitherNoInputsForThisOperation);case"BadResponse":return p(h.theServersResponseWasMalformedOr);case"MissingIssuerKeys":return p(h.theKeysForThisPSTIssuerAreUnavailable);case"FailedPrecondition":case"ResourceLimited":case"InternalError":case"Unauthorized":case"UnknownError":return p(h.theOperationFailedForAnUnknown);case"SiteIssuerLimit":return p(h.perSiteLimit)}}var Ge={};H(Ge,{EarlyHintsHeaderSection:()=>re,RESPONSE_HEADER_SECTION_DATA_KEY:()=>ie,ResponseHeaderSection:()=>se});import*as F from"./../../../core/common/common.js";import*as x from"./../../../core/host/host.js";import*as U from"./../../../core/i18n/i18n.js";import*as S from"./../../../core/platform/platform.js";import*as ke from"./../../../models/issues_manager/issues_manager.js";import*as O from"./../../../models/persistence/persistence.js";import*as _e from"./../../../models/text_utils/text_utils.js";import"./../forward/forward.js";import*as Be from"./../../sources/sources.js";import"./../../../ui/components/buttons/buttons.js";import*as Ke from"./../../../ui/legacy/legacy.js";import{html as M,nothing as ut,render as je}from"./../../../ui/lit/lit.js";import*as ne from"./../../../ui/visual_logging/visual_logging.js";var we=`:host{display:block}devtools-header-section-row:last-of-type{margin-bottom:var(--sys-size-5)}devtools-header-section-row:first-of-type{margin-top:var(--sys-size-5)}.add-header-button{margin:-4px 0 10px 5px}
/*# sourceURL=${import.meta.resolve("./ResponseHeaderSection.css")} */`;var k={addHeader:"Add header",chooseThisOptionIfTheResourceAnd:"Choose this option if the resource and the document are served from the same site.",onlyChooseThisOptionIfAn:"Only choose this option if an arbitrary website including this resource does not impose a security risk.",thisDocumentWasBlockedFrom:"The document was blocked from loading in a popup opened by a sandboxed iframe because this document specified a cross-origin opener policy.",toEmbedThisFrameInYourDocument:"To embed this frame in your document, the response needs to enable the cross-origin embedder policy by specifying the following response header:",toUseThisResourceFromADifferent:"To use this resource from a different origin, the server needs to specify a cross-origin resource policy in the response headers:",toUseThisResourceFromADifferentOrigin:"To use this resource from a different origin, the server may relax the cross-origin resource policy response header:",toUseThisResourceFromADifferentSite:"To use this resource from a different site, the server may relax the cross-origin resource policy response header:"},We=U.i18n.registerUIStrings("panels/network/components/ResponseHeaderSection.ts",k),pt=U.i18n.getLocalizedString.bind(void 0,We),R=U.i18n.getLazilyComputedLocalizedString.bind(void 0,We),ie="ResponseHeaderSection",oe=class extends HTMLElement{shadow=this.attachShadow({mode:"open"});headerDetails=[];setHeaders(e){e.sort(function(t,i){return S.StringUtilities.compare(t.name.toLowerCase(),i.name.toLowerCase())}),this.headerDetails=e.map(t=>({name:S.StringUtilities.toLowerCaseString(t.name),value:t.value.replace(/\s/g," ")}))}highlightHeaders(e){e.toReveal?.section==="Response"&&this.headerDetails.filter(t=>c(t.name,e.toReveal?.header?.toLowerCase())).forEach(t=>{t.highlight=!0})}},re=class extends oe{#t;set data(e){this.#t=e.request,this.setHeaders(this.#t.earlyHintsHeaders),this.highlightHeaders(e),this.#e()}#e(){this.#t&&je(M`
      <style>${we}</style>
      ${this.headerDetails.map(e=>M`
        <devtools-header-section-row .data=${{header:e}}></devtools-header-section-row>
      `)}
    `,this.shadow,{host:this})}};customElements.define("devtools-early-hints-header-section",re);var se=class extends oe{#t;#e=[];#i=null;#o=[];#r=0;set data(e){this.#t=e.request,this.#r=O.NetworkPersistenceManager.NetworkPersistenceManager.isForbiddenNetworkUrl(this.#t.url())?2:0;let t=this.#t.sortedResponseHeaders.concat(this.#t.setCookieHeaders);this.setHeaders(t);let i=[];if(this.#t.wasBlocked()){let n=mt.get(this.#t.blockedReason());if(n){if(ke.RelatedIssue.hasIssueOfCategory(this.#t,"CrossOriginEmbedderPolicy")){let m=()=>{x.userMetrics.issuesPanelOpenedFrom(1),this.#t&&ke.RelatedIssue.reveal(this.#t,"CrossOriginEmbedderPolicy")};n.blockedDetails&&(n.blockedDetails.reveal=m)}i.push(n)}}function r(n,m){let l=0,g=0,$=[];for(;l<n.length&&g<m.length;)n[l].name<m[g].name?$.push({...n[l++],headerNotSet:!1}):n[l].name>m[g].name?$.push({...m[g++],headerNotSet:!0}):$.push({...m[g++],...n[l++],headerNotSet:!1});for(;l<n.length;)$.push({...n[l++],headerNotSet:!1});for(;g<m.length;)$.push({...m[g++],headerNotSet:!0});return $}this.headerDetails=r(this.headerDetails,i);let s=this.#t.blockedResponseCookies(),a=new Map(s?.map(n=>[n.cookieLine.replace(/\s/g," "),n.blockedReasons]));for(let n of this.headerDetails)if(n.name==="set-cookie"&&n.value){let m=a.get(n.value);m&&(n.setCookieBlockedReasons=m)}this.highlightHeaders(e);let d=this.#t.getAssociatedData(ie);d?this.#e=d:(this.#e=this.headerDetails.map(n=>({name:n.name,value:n.value,originalValue:n.value,valueEditable:this.#r})),this.#a()),this.#u(),this.#t.setAssociatedData(ie,this.#e),this.#s()}#n(){this.#t&&(this.#r=O.NetworkPersistenceManager.NetworkPersistenceManager.isForbiddenNetworkUrl(this.#t.url())?2:0,this.#e=this.headerDetails.map(e=>({name:e.name,value:e.value,originalValue:e.value,valueEditable:this.#r})),this.#a(),this.#t.setAssociatedData(ie,this.#e))}async#u(){if(this.#t){if(this.#i=O.NetworkPersistenceManager.NetworkPersistenceManager.instance().getHeadersUISourceCodeFromUrl(this.#t.url()),!this.#i){this.#n(),this.#s();return}try{let e=await this.#i.requestContentData().then(_e.ContentData.ContentData.contentDataOrEmpty);if(this.#o=JSON.parse(e.text||"[]"),!this.#o.every(O.NetworkPersistenceManager.isHeaderOverride))throw new Error("Type mismatch after parsing");F.Settings.Settings.instance().moduleSetting("persistence-network-overrides-enabled").get()&&this.#r===0&&(this.#r=1);for(let t of this.#e)t.valueEditable=this.#r}catch{console.error("Failed to parse",this.#i?.url()||"source code file","for locally overriding headers."),this.#n()}finally{this.#s()}}}#a(){if(!this.#t||this.#t.originalResponseHeaders.length===0)return;let e=this.#t.originalResponseHeaders.map(r=>({name:S.StringUtilities.toLowerCaseString(r.name),value:r.value.replace(/\s/g," ")}));e.sort(function(r,s){return S.StringUtilities.compare(r.name,s.name)});let t=0,i=0;for(;t<this.headerDetails.length;){let r=this.headerDetails[t].name,s=this.headerDetails[t].value||"",a=this.headerDetails[t].headerNotSet;for(;t<this.headerDetails.length-1&&this.headerDetails[t+1].name===r;)t++,s+=`, ${this.headerDetails[t].value}`;for(;i<e.length&&e[i].name<r;)i++;if(i<e.length&&e[i].name===r){let d=e[i].value;for(;i<e.length-1&&e[i+1].name===r;)i++,d+=`, ${e[i].value}`;i++,r!=="set-cookie"&&!a&&!c(s,d)&&this.#e.filter(n=>c(n.name,r)).forEach(n=>{n.isOverride=!0})}else r!=="set-cookie"&&!a&&this.#e.filter(d=>c(d.name,r)).forEach(d=>{d.isOverride=!0});t++}this.#e.filter(r=>r.name==="set-cookie").forEach(r=>{this.#t?.originalResponseHeaders.find(s=>S.StringUtilities.toLowerCaseString(s.name)==="set-cookie"&&c(s.value,r.value))===void 0&&(r.isOverride=!0)})}#p(e){let t=e.target;if(t.dataset.index===void 0)return;let i=Number(t.dataset.index);P(e.headerName)&&(this.#l(e.headerName,e.headerValue,i),x.userMetrics.actionTaken(x.UserMetrics.Action.HeaderOverrideHeaderEdited))}#d(e){let t=O.NetworkPersistenceManager.NetworkPersistenceManager.instance().rawPathFromUrl(e,!0),i=t.lastIndexOf("/");return F.ParsedURL.ParsedURL.substring(t,i+1)}#c(){this.#i?.setWorkingCopy(JSON.stringify(this.#o,null,2)),this.#i?.commitWorkingCopy()}#m(e,t,i){for(let r=this.#o.length-1;r>=0;r--){let s=this.#o[r];if(s.applyTo!==e)continue;let a=s.headers.findIndex(d=>c(d.name,t)&&c(d.value,i));if(!(a<0)){s.headers.splice(a,1),s.headers.length===0&&this.#o.splice(r,1);return}}}#g(e){let t=e.target;if(t.dataset.index===void 0||!this.#t)return;let i=Number(t.dataset.index),r=this.#d(this.#t.url());this.#m(r,e.headerName,e.headerValue),this.#c(),this.#e[i].isDeleted=!0,this.#s(),x.userMetrics.actionTaken(x.UserMetrics.Action.HeaderOverrideHeaderRemoved)}#l(e,t,i){if(!this.#t)return;this.#t.originalResponseHeaders.length===0&&(this.#t.originalResponseHeaders=this.#t.sortedResponseHeaders.map(l=>({...l})));let r=this.#e[i].name,s=this.#e[i].value;this.#e[i].name=e,this.#e[i].value=t;let a=[];e==="set-cookie"?a.push({name:e,value:t,valueEditable:this.#r}):a=this.#e.filter(l=>c(l.name,e)&&(!c(l.value,l.originalValue)||l.isOverride));let d=this.#d(this.#t.url()),n=null,[m]=this.#o.slice(-1);if(m?.applyTo===d?n=m:(n={applyTo:d,headers:[]},this.#o.push(n)),e==="set-cookie"){let l=n.headers.findIndex(g=>c(g.name,r)&&c(g.value,s));l>=0&&n.headers.splice(l,1)}else n.headers=n.headers.filter(l=>!c(l.name,e));if(!c(this.#e[i].name,r)){for(let l=0;l<n.headers.length;++l)if(c(n.headers[l].name,r)&&c(n.headers[l].value,s)){n.headers.splice(l,1);break}}for(let l of a)n.headers.push({name:l.name,value:l.value||""});n.headers.length===0&&this.#o.pop(),this.#c()}#h(){this.#e.push({name:S.StringUtilities.toLowerCaseString(U.i18n.lockedString("header-name")),value:U.i18n.lockedString("header value"),isOverride:!0,nameEditable:!0,valueEditable:1});let e=this.#e.length-1;this.#l(this.#e[e].name,this.#e[e].value||"",e),this.#s();let t=this.shadow.querySelectorAll("devtools-header-section-row"),[i]=Array.from(t).slice(-1);i?.focus(),x.userMetrics.actionTaken(x.UserMetrics.Action.HeaderOverrideHeaderAdded)}#s(){if(!this.#t)return;let e=this.#e.map((t,i)=>({...this.headerDetails[i],...t,isResponseHeader:!0}));je(M`
      <style>${we}</style>
      ${e.map((t,i)=>M`
        <devtools-header-section-row
            .data=${{header:t}}
            @headeredited=${this.#p}
            @headerremoved=${this.#g}
            @enableheaderediting=${this.#f}
            data-index=${i}
            jslog=${ne.item("response-header")}
        ></devtools-header-section-row>
      `)}
      ${this.#r===1?M`
        <devtools-button
          class="add-header-button"
          .variant=${"outlined"}
          .iconName=${"plus"}
          @click=${this.#h}
          jslog=${ne.action("add-header").track({click:!0})}>
          ${pt(k.addHeader)}
        </devtools-button>
      `:ut}
    `,this.shadow,{host:this})}async#f(){if(!this.#t)return;x.userMetrics.actionTaken(x.UserMetrics.Action.HeaderOverrideEnableEditingClicked);let e=this.#t.url(),t=O.NetworkPersistenceManager.NetworkPersistenceManager.instance();t.project()?(F.Settings.Settings.instance().moduleSetting("persistence-network-overrides-enabled").set(!0),await t.getOrCreateHeadersUISourceCodeFromUrl(e)):Ke.InspectorView.InspectorView.instance().displaySelectOverrideFolderInfobar(async()=>{await Be.SourcesNavigator.OverridesNavigatorView.instance().setupNewWorkspace(),await t.getOrCreateHeadersUISourceCodeFromUrl(e)})}};customElements.define("devtools-response-header-section",se);var mt=new Map([["coep-frame-resource-needs-coep-header",{name:S.StringUtilities.toLowerCaseString("cross-origin-embedder-policy"),value:null,blockedDetails:{explanation:R(k.toEmbedThisFrameInYourDocument),examples:[{codeSnippet:"Cross-Origin-Embedder-Policy: require-corp"}],link:{url:"https://web.dev/coop-coep/"}}}],["corp-not-same-origin-after-defaulted-to-same-origin-by-coep",{name:S.StringUtilities.toLowerCaseString("cross-origin-resource-policy"),value:null,blockedDetails:{explanation:R(k.toUseThisResourceFromADifferent),examples:[{codeSnippet:"Cross-Origin-Resource-Policy: same-site",comment:R(k.chooseThisOptionIfTheResourceAnd)},{codeSnippet:"Cross-Origin-Resource-Policy: cross-origin",comment:R(k.onlyChooseThisOptionIfAn)}],link:{url:"https://web.dev/coop-coep/"}}}],["coop-sandboxed-iframe-cannot-navigate-to-coop-page",{name:S.StringUtilities.toLowerCaseString("cross-origin-opener-policy"),value:null,headerValueIncorrect:!1,blockedDetails:{explanation:R(k.thisDocumentWasBlockedFrom),examples:[],link:{url:"https://web.dev/coop-coep/"}}}],["corp-not-same-site",{name:S.StringUtilities.toLowerCaseString("cross-origin-resource-policy"),value:null,headerValueIncorrect:!0,blockedDetails:{explanation:R(k.toUseThisResourceFromADifferentSite),examples:[{codeSnippet:"Cross-Origin-Resource-Policy: cross-origin",comment:R(k.onlyChooseThisOptionIfAn)}],link:null}}],["corp-not-same-origin",{name:S.StringUtilities.toLowerCaseString("cross-origin-resource-policy"),value:null,headerValueIncorrect:!0,blockedDetails:{explanation:R(k.toUseThisResourceFromADifferentOrigin),examples:[{codeSnippet:"Cross-Origin-Resource-Policy: same-site",comment:R(k.chooseThisOptionIfTheResourceAnd)},{codeSnippet:"Cross-Origin-Resource-Policy: cross-origin",comment:R(k.onlyChooseThisOptionIfAn)}],link:null}}]]);export{xe as DirectSocketConnectionView,Re as EditableSpan,Le as HeaderSectionRow,Ue as RequestHeaderSection,ze as RequestTrustTokensView,Ge as ResponseHeaderSection};
//# sourceMappingURL=components.js.map
