var lt=Object.defineProperty;var c=(t,e)=>{for(var s in e)lt(t,s,{get:e[s],enumerable:!0})};var Se={};c(Se,{LinearMemoryHighlightChipList:()=>I});import"./../../../ui/kit/kit.js";import*as ie from"./../../../core/i18n/i18n.js";import*as Ie from"./../../../ui/legacy/legacy.js";import{Directives as dt,html as Me,render as ht}from"./../../../ui/lit/lit.js";import*as te from"./../../../ui/visual_logging/visual_logging.js";var Te=`.highlight-chip-list{min-height:20px;display:flex;flex-wrap:wrap;justify-content:left;align-items:center;background-color:var(--sys-color-cdt-base-container);margin:8px 0;gap:8px;row-gap:6px}.highlight-chip{background:var(--sys-color-cdt-base-container);border:1px solid var(--sys-color-divider);height:18px;border-radius:4px;flex:0 0 auto;max-width:250px;position:relative;padding:0 6px}.highlight-chip:hover{background-color:var(--sys-color-state-hover-on-subtle)}.delete-highlight-container{display:none;height:100%;position:absolute;right:0;top:0;border-radius:4px;width:24px;align-items:center;justify-content:center}.delete-highlight-button{cursor:pointer;width:13px;height:13px;border:none;background-color:transparent;display:flex;align-items:center;justify-content:center}.delete-highlight-button:hover{background-color:var(--sys-color-state-hover-on-subtle);border-radius:50%}.jump-to-highlight-button{cursor:pointer;padding:0;border:none;background:none;height:100%;align-items:center;max-width:100%;overflow:hidden}.delete-highlight-button devtools-icon{width:13px;height:13px;display:flex;align-items:center;justify-content:center;border-radius:50%}.source-code{font-family:var(--source-code-font-family);font-size:var(--source-code-font-size);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sys-color-on-surface)}.value{color:var(--sys-color-token-tag)}.separator{white-space:pre;flex-shrink:0}.highlight-chip.focused{outline:2px solid var(--sys-color-state-focus-ring);outline-offset:2px}.highlight-chip:hover > .delete-highlight-container{display:flex;background:linear-gradient(90deg,transparent 0%,rgb(241 243 244) 25%)}.highlight-chip.focused:hover > .delete-highlight-container{background:linear-gradient(90deg,transparent 0%,rgb(231 241 253) 25%)}:host-context(.theme-with-dark-background) .highlight-chip:hover > .delete-highlight-container{display:flex;background:linear-gradient(90deg,transparent 0%,rgb(41 42 45) 25%)}:host-context(.theme-with-dark-background) .highlight-chip.focused:hover > .delete-highlight-container{background:linear-gradient(90deg,transparent 0%,rgb(48 55 68) 25%)}
/*# sourceURL=${import.meta.resolve("./linearMemoryHighlightChipList.css")} */`;var se={jumpToAddress:"Jump to this memory",deleteHighlight:"Stop highlighting this memory"},ct=ie.i18n.registerUIStrings("panels/linear_memory_inspector/components/LinearMemoryHighlightChipList.ts",se),$e=ie.i18n.getLocalizedString.bind(void 0,ct),{classMap:gt}=dt,ut=(t,e,s)=>{ht(Me`
    <style>${Te}</style>
    <div class="highlight-chip-list">
      ${t.highlightInfos.map(i=>pt(i,t))}
    </div>`,s)};function pt(t,e){let s=t.name||"<anonymous>",i=t.type,r=t===e.focusedMemoryHighlight;return Me`
    <div class=${gt({focused:r,"highlight-chip":!0})}>
      <button class="jump-to-highlight-button"
              title=${$e(se.jumpToAddress)}
              jslog=${te.action("linear-memory-inspector.jump-to-highlight").track({click:!0})}
              @click=${()=>e.onJumpToAddress(t.startAddress)}>
        <span class="source-code">
          <span class="value">${s}</span>
          <span class="separator">: </span>
          <span>${i}</span>
        </span>
      </button>
      <div class="delete-highlight-container">
        <button class="delete-highlight-button" title=${$e(se.deleteHighlight)}
            jslog=${te.action("linear-memory-inspector.delete-highlight").track({click:!0})}
            @click=${()=>e.onDeleteHighlight(t)}>
          <devtools-icon name="cross" class="medium">
          </devtools-icon>
        </button>
      </div>
    </div>`}var I=class extends Ie.Widget.Widget{#n=[];#s;#i=e=>{};#t=e=>{};#e;constructor(e,s=ut){super(e,{useShadowDom:!0}),this.#e=s}set highlightInfos(e){this.#n=e,this.requestUpdate()}get highlightInfos(){return this.#n}set focusedMemoryHighlight(e){this.#s=e,this.requestUpdate()}get focusedMemoryHighlight(){return this.#s}set jumpToAddress(e){this.#i=e,this.requestUpdate()}get jumpToAddress(){return this.#i}set deleteHighlight(e){this.#t=e,this.requestUpdate()}get deleteHighlight(){return this.#t}performUpdate(){this.#e({highlightInfos:this.#n,focusedMemoryHighlight:this.#s,onJumpToAddress:this.#i,onDeleteHighlight:this.#t},void 0,this.contentElement)}};var it={};c(it,{DEFAULT_VIEW:()=>tt,LinearMemoryInspector:()=>fe});var Ve={};c(Ve,{ByteSelectedEvent:()=>L,LinearMemoryViewer:()=>B,ResizeEvent:()=>j});import*as U from"./../../../ui/lit/lit.js";import*as A from"./../../../ui/visual_logging/visual_logging.js";var Le={};c(Le,{DECIMAL_REGEXP:()=>Ae,HEXADECIMAL_REGEXP:()=>Ue,formatAddress:()=>S,parseAddress:()=>P,toHexString:()=>M});var Ue=/^0x[a-fA-F0-9]+$/,Ae=/^0$|[1-9]\d*$/;function M(t){let s=t.number.toString(16).padStart(t.pad,"0").toUpperCase();return t.prefix?"0x"+s:s}function S(t){return M({number:t,pad:8,prefix:!0})}function P(t){let e=t.match(Ue),s=t.match(Ae),i;return e&&e[0].length===t.length?i=parseInt(t,16):s&&s[0].length===t.length&&(i=parseInt(t,10)),i}var ke=`:host{flex:auto;display:flex;min-height:20px}.view{overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;background:var(--sys-color-cdt-base-container);outline:none}.row{display:flex;height:20px;align-items:center}.cell{text-align:center;border:1px solid transparent;border-radius:2px;&.focused-area{background-color:var(--sys-color-tonal-container);color:var(--sys-color-on-tonal-container)}&.selected{border-color:var(--sys-color-state-focus-ring);color:var(--sys-color-on-tonal-container);background-color:var(--sys-color-state-focus-select)}}.byte-cell{min-width:21px;color:var(--sys-color-on-surface)}.byte-group-margin{margin-left:var(--byte-group-margin)}.text-cell{min-width:14px;color:var(--sys-color-on-surface-subtle)}.address{color:var(--sys-color-state-disabled)}.address.selected{font-weight:bold;color:var(--sys-color-on-surface)}.divider{width:1px;height:inherit;background-color:var(--sys-color-divider);margin:0 4px}.highlight-area{background-color:var(--sys-color-surface-variant)}
/*# sourceURL=${import.meta.resolve("./linearMemoryViewer.css")} */`;var{render:mt,html:g}=U,L=class t extends Event{static eventName="byteselected";data;constructor(e){super(t.eventName),this.data=e}},j=class t extends Event{static eventName="resize";data;constructor(e){super(t.eventName),this.data=e}},Ee=8,m=4,B=class extends HTMLElement{#n=this.attachShadow({mode:"open"});#s=new ResizeObserver(()=>requestAnimationFrame(this.#y.bind(this)));#i=!1;#t=new Uint8Array;#e=0;#o=0;#a;#d;#l=1;#r=m;#h=!0;#c=void 0;set data(e){if(e.address<e.memoryOffset||e.address>e.memoryOffset+e.memory.length||e.address<0)throw new Error("Address is out of bounds.");if(e.memoryOffset<0)throw new Error("Memory offset has to be greater or equal to zero.");this.#t=e.memory,this.#e=e.address,this.#a=e.highlightInfo,this.#d=e.focusedMemoryHighlight,this.#o=e.memoryOffset,this.#h=e.focus,this.#u()}connectedCallback(){this.style.setProperty("--byte-group-margin",`${Ee}px`)}disconnectedCallback(){this.#i=!1,this.#s.disconnect()}#u(){this.#b(),this.#w(),this.#m(),this.#x()}#m(){if(this.#h){let e=this.#n.querySelector(".view");e&&e.focus()}}#y(){this.#u(),this.dispatchEvent(new j(this.#r*this.#l))}#b(){if(this.clientWidth===0||this.clientHeight===0||!this.shadowRoot){this.#r=m,this.#l=1;return}let e=this.shadowRoot.querySelector(".byte-cell"),s=this.shadowRoot.querySelector(".text-cell"),i=this.shadowRoot.querySelector(".divider"),r=this.shadowRoot.querySelector(".row"),o=this.shadowRoot.querySelector(".address");if(!e||!s||!i||!r||!o){this.#r=m,this.#l=1;return}let n=e.getBoundingClientRect().width,a=s.getBoundingClientRect().width,d=m*(n+a)+Ee,h=i.getBoundingClientRect().width,u=e.getBoundingClientRect().left-o.getBoundingClientRect().left,l=this.clientWidth-1-u-h;if(l<d){this.#r=m,this.#l=1;return}this.#r=Math.floor(l/d)*m,this.#l=Math.floor(this.clientHeight/r.clientHeight)}#x(){!this.#s||this.#i||(this.#s.observe(this),this.#i=!0)}#w(){let e=A.section().track({keydown:"ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown"}).context("linear-memory-inspector.viewer");mt(g`
      <style>${ke}</style>
      <div class="view" tabindex="0" @keydown=${this.#p} jslog=${e}>
        ${this.#T()}
      </div>
      `,this.#n,{host:this})}#p(e){let s=e,i;s.code==="ArrowUp"?i=this.#e-this.#r:s.code==="ArrowDown"?i=this.#e+this.#r:s.code==="ArrowLeft"?i=this.#e-1:s.code==="ArrowRight"?i=this.#e+1:s.code==="PageUp"?i=this.#e-this.#r*this.#l:s.code==="PageDown"&&(i=this.#e+this.#r*this.#l),i!==void 0&&i!==this.#c&&(this.#c=i,this.dispatchEvent(new L(i)))}#T(){let e=[];for(let s=0;s<this.#l;++s)e.push(this.#$(s));return g`${e}`}#$(e){let{startIndex:s,endIndex:i}={startIndex:e*this.#r,endIndex:(e+1)*this.#r},r={address:!0,selected:Math.floor((this.#e-this.#o)/this.#r)===e};return g`
    <div class="row">
      <span class=${U.Directives.classMap(r)}>${M({number:s+this.#o,pad:8,prefix:!1})}</span>
      <span class="divider"></span>
      ${this.#I(s,i)}
      <span class="divider"></span>
      ${this.#M(s,i)}
    </div>
    `}#I(e,s){let i=[];for(let r=e;r<s;++r){let o=r+this.#o,n=r!==e&&(r-e)%m===0,a=r===this.#e-this.#o,d=this.#g(o),h=this.#v(o),u={cell:!0,"byte-cell":!0,"byte-group-margin":n,selected:a,"highlight-area":d,"focused-area":h},l=r<this.#t.length,ee=l?g`${M({number:this.#t[r],pad:2,prefix:!1})}`:"",nt=l?this.#f.bind(this,o):"",at=A.tableCell("linear-memory-inspector.byte-cell").track({click:!0});i.push(g`<span class=${U.Directives.classMap(u)} @click=${nt} jslog=${at}>${ee}</span>`)}return g`${i}`}#M(e,s){let i=[];for(let r=e;r<s;++r){let o=r+this.#o,n=this.#g(o),a=this.#v(o),d={cell:!0,"text-cell":!0,selected:this.#e-this.#o===r,"highlight-area":n,"focused-area":a},h=r<this.#t.length,u=h?g`${this.#S(this.#t[r])}`:"",l=h?this.#f.bind(this,r+this.#o):"",ee=A.tableCell("linear-memory-inspector.text-cell").track({click:!0});i.push(g`<span class=${U.Directives.classMap(d)} @click=${l} jslog=${ee}>${u}</span>`)}return g`${i}`}#S(e){return e>=20&&e<=127?String.fromCharCode(e):"."}#f(e){this.dispatchEvent(new L(e))}#g(e){return this.#a===void 0?!1:this.#a.startAddress<=e&&e<this.#a.startAddress+this.#a.size}#v(e){return this.#d?this.#d.startAddress<=e&&e<this.#d.startAddress+this.#d.size:!1}};customElements.define("devtools-linear-memory-inspector-viewer",B);import*as Y from"./../../../core/common/common.js";import*as ve from"./../../../core/i18n/i18n.js";import*as ye from"./../../../ui/legacy/legacy.js";import{html as Ke,nothing as Ct,render as Ht}from"./../../../ui/lit/lit.js";var Ce=`@scope to (devtools-widget > *){:scope{flex:auto;display:flex}*{min-width:unset;box-sizing:content-box}.view{width:100%;display:flex;flex:1;flex-direction:column;font-family:var(--monospace-font-family);font-size:var(--monospace-font-size);padding:9px 12px 9px 7px}devtools-linear-memory-inspector-viewer{justify-content:center}devtools-linear-memory-inspector-navigator + devtools-linear-memory-inspector-viewer{margin-top:12px}.value-interpreter{display:flex}}
/*# sourceURL=${import.meta.resolve("./linearMemoryInspector.css")} */`;var Xe={};c(Xe,{DEFAULT_VIEW:()=>Ye,LinearMemoryValueInterpreter:()=>R});import"./../../../ui/kit/kit.js";import*as J from"./../../../core/i18n/i18n.js";import*as Ge from"./../../../core/platform/platform.js";import"./../../../ui/components/buttons/buttons.js";import*as N from"./../../../ui/legacy/legacy.js";import*as Lt from"./../../../ui/lit/lit.js";import*as T from"./../../../ui/visual_logging/visual_logging.js";var He=`@scope to (devtools-widget > *){:scope{flex:auto;display:flex}.value-interpreter{border:1px solid var(--sys-color-divider);background-color:var(--sys-color-cdt-base-container);overflow:hidden;width:400px}.settings-toolbar{min-height:26px;display:flex;flex-wrap:nowrap;justify-content:space-between;padding-left:var(--sys-size-3);padding-right:var(--sys-size-3);align-items:center}.settings-toolbar-button{padding:0;width:20px;height:20px;border:none;outline:none;background-color:transparent}.settings-toolbar-button.active devtools-icon{color:var(--icon-toggled)}.divider{display:block;height:1px;margin-bottom:12px;background-color:var(--sys-color-divider)}}
/*# sourceURL=${import.meta.resolve("./linearMemoryValueInterpreter.css")} */`;var qe={};c(qe,{DEFAULT_VIEW:()=>_e,ValueInterpreterDisplay:()=>C});import"./../../../ui/kit/kit.js";import*as b from"./../../../core/i18n/i18n.js";import"./../../../ui/components/buttons/buttons.js";import*as W from"./../../../ui/legacy/legacy.js";import*as yt from"./../../../ui/lit/lit.js";import*as w from"./../../../ui/visual_logging/visual_logging.js";var Re=`:host{flex:auto;display:flex}.value-types{width:100%;display:grid;grid-template-columns:auto auto 1fr;gap:4px 24px;min-height:24px;overflow:hidden;padding:2px 12px;align-items:baseline;justify-content:start}.value-type-cell{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:flex;flex-direction:column;min-height:24px}.value-type-value-with-link{display:flex;align-items:center}.value-type-cell-no-mode{grid-column:1/3}.signed-divider{width:1px;height:15px;background-color:var(--sys-color-divider);margin:0 4px}.selectable-text{user-select:text}.selectable-text::selection{background-color:var(--sys-color-tonal-container);color:currentcolor}
/*# sourceURL=${import.meta.resolve("./valueInterpreterDisplay.css")} */`;var Ne={};c(Ne,{VALUE_INTEPRETER_MAX_NUM_BYTES:()=>ne,VALUE_TYPE_MODE_LIST:()=>ae,format:()=>he,formatFloat:()=>re,formatInteger:()=>f,getDefaultValueTypeMapping:()=>v,getPointerAddress:()=>de,isNumber:()=>le,isPointer:()=>E,isValidMode:()=>D,valueTypeToLocalizedString:()=>O});import*as F from"./../../../core/i18n/i18n.js";import*as oe from"./../../../core/platform/platform.js";var k={notApplicable:"N/A"},ft=F.i18n.registerUIStrings("panels/linear_memory_inspector/components/ValueInterpreterDisplayUtils.ts",k),z=F.i18n.getLocalizedString.bind(void 0,ft),ne=8;function v(){return new Map(vt)}var vt=new Map([["Integer 8-bit","dec"],["Integer 16-bit","dec"],["Integer 32-bit","dec"],["Integer 64-bit","dec"],["Float 32-bit","dec"],["Float 64-bit","dec"],["Pointer 32-bit","hex"],["Pointer 64-bit","hex"]]),ae=["dec","hex","oct","sci"];function O(t){return F.i18n.lockedString(t)}function D(t,e){switch(t){case"Integer 8-bit":case"Integer 16-bit":case"Integer 32-bit":case"Integer 64-bit":return e==="dec"||e==="hex"||e==="oct";case"Float 32-bit":case"Float 64-bit":return e==="sci"||e==="dec";case"Pointer 32-bit":case"Pointer 64-bit":return e==="hex";default:return oe.assertNever(t,`Unknown value type: ${t}`)}}function le(t){switch(t){case"Integer 8-bit":case"Integer 16-bit":case"Integer 32-bit":case"Integer 64-bit":case"Float 32-bit":case"Float 64-bit":return!0;default:return!1}}function de(t,e,s){if(!E(t))return console.error(`Requesting address of a non-pointer type: ${t}.
`),NaN;try{let i=new DataView(e),r=s==="Little Endian";return t==="Pointer 32-bit"?i.getUint32(0,r):i.getBigUint64(0,r)}catch{return NaN}}function E(t){return t==="Pointer 32-bit"||t==="Pointer 64-bit"}function he(t){if(!t.mode)return console.error(`No known way of showing value for ${t.type}`),z(k.notApplicable);let e=new DataView(t.buffer),s=t.endianness==="Little Endian",i;try{switch(t.type){case"Integer 8-bit":return i=t.signed?e.getInt8(0):e.getUint8(0),f(i,t.mode);case"Integer 16-bit":return i=t.signed?e.getInt16(0,s):e.getUint16(0,s),f(i,t.mode);case"Integer 32-bit":return i=t.signed?e.getInt32(0,s):e.getUint32(0,s),f(i,t.mode);case"Integer 64-bit":return i=t.signed?e.getBigInt64(0,s):e.getBigUint64(0,s),f(i,t.mode);case"Float 32-bit":return i=e.getFloat32(0,s),re(i,t.mode);case"Float 64-bit":return i=e.getFloat64(0,s),re(i,t.mode);case"Pointer 32-bit":return i=e.getUint32(0,s),f(i,"hex");case"Pointer 64-bit":return i=e.getBigUint64(0,s),f(i,"hex");default:return oe.assertNever(t.type,`Unknown value type: ${t.type}`)}}catch{return z(k.notApplicable)}}function re(t,e){switch(e){case"dec":return t.toFixed(2).toString();case"sci":return t.toExponential(2).toString();default:throw new Error(`Unknown mode for floats: ${e}.`)}}function f(t,e){switch(e){case"dec":return t.toString();case"hex":return t<0?z(k.notApplicable):"0x"+t.toString(16).toUpperCase();case"oct":return t<0?z(k.notApplicable):t.toString(8);default:throw new Error(`Unknown mode for integers: ${e}.`)}}var x={unsignedValue:"`Unsigned` value",changeValueTypeMode:"Change mode",signedValue:"`Signed` value",jumpToPointer:"Jump to address",addressOutOfRange:"Address out of memory range"},bt=b.i18n.registerUIStrings("panels/linear_memory_inspector/components/ValueInterpreterDisplay.ts",x),V=b.i18n.getLocalizedString.bind(void 0,bt),{render:xt,nothing:wt,html:p}=yt,Tt=Array.from(v().keys()),_e=(t,e,s)=>{function i(n,a){return he({buffer:t.buffer,endianness:t.endianness,type:a,signed:n,mode:t.valueTypeModes.get(a)})}let r=i.bind(void 0,!0),o=i.bind(void 0,!1);xt(p`
      <style>${W.inspectorCommonStyles}</style>
      <style>${Re}</style>
      <div class="value-types">
        ${t.valueTypes.map(n=>{let a=E(n)?de(n,t.buffer,t.endianness):0,d=Number.isNaN(a)||BigInt(a)>=BigInt(t.memoryLength),h=r(n),u=o(n);return le(n)?p`
            <span class="value-type-cell selectable-text">${b.i18n.lockedString(n)}</span>
              <div>
                <select title=${V(x.changeValueTypeMode)}
                  data-mode-settings="true"
                  jslog=${w.dropDown("linear-memory-inspector.value-type-mode").track({change:!0})}
                  @change=${l=>t.onValueTypeModeChange(n,l.target.value)}>
                    ${ae.filter(l=>D(n,l)).map(l=>p`
                        <option value=${l} .selected=${t.valueTypeModes.get(n)===l}
                                jslog=${w.item(l).track({click:!0,resize:!0})}>${b.i18n.lockedString(l)}
                        </option>`)}
                </select>
              </div>
            ${$t(h,u,n,t.valueTypeModes.get(n))}`:E(n)?p`
            <span class="value-type-cell-no-mode value-type-cell selectable-text">${b.i18n.lockedString(n)}</span>
            <div class="value-type-cell">
              <div class="value-type-value-with-link" data-value="true">
              <span class="selectable-text">${u}</span>
                <devtools-button
                  data-jump="true"
                  title=${V(d?x.addressOutOfRange:x.jumpToPointer)}
                  .disabled=${d}
                  jslog=${w.action("linear-memory-inspector.jump-to-address").track({click:!0})}
                  @click=${()=>t.onJumpToAddressClicked(Number(a))}
                  .variant=${"icon_toggle"}
                  .iconName=${"open-externally"}
                  .size=${"SMALL"}>
                </devtools-button>
              </div>
            </div>`:wt})}
      </div>
    `,s)};function $t(t,e,s,i){let r=t!==e&&i!=="hex"&&i!=="oct",o=p`<span class="value-type-cell selectable-text"  title=${V(x.unsignedValue)} data-value="true">${e}</span>`;if(!r)return o;let n=s==="Integer 32-bit"||s==="Integer 64-bit",a=p`<span class="selectable-text" data-value="true" title=${V(x.signedValue)}>${t}</span>`;return n?p`
        <div class="value-type-cell">
          ${o}
          ${a}
        </div>
        `:p`
      <div class="value-type-cell" style="flex-direction: row;">
        ${o}
        <span class="signed-divider"></span>
        ${a}
      </div>
    `}var C=class extends W.Widget.Widget{#n;#s="Little Endian";#i=new ArrayBuffer(0);#t=new Set;#e=v();#o=0;#a=()=>{};#d=()=>{};constructor(e,s=_e){super(e),this.#n=s}set onValueTypeModeChange(e){this.#a=e,this.performUpdate()}get onValueTypeModeChange(){return this.#a}set onJumpToAddressClicked(e){this.#d=e,this.performUpdate()}get onJumpToAddressClicked(){return this.#d}get valueTypeModes(){return this.#e}set valueTypeModes(e){let s=v();e.forEach((i,r)=>{D(r,i)&&s.set(r,i)}),this.#e=s,this.requestUpdate()}get valueTypes(){return this.#t}set valueTypes(e){this.#t=e,this.requestUpdate()}get buffer(){return this.#i}set buffer(e){this.#i=e,this.requestUpdate()}get endianness(){return this.#s}set endianness(e){this.#s=e,this.requestUpdate()}get memoryLength(){return this.#o}set memoryLength(e){this.#o=e,this.requestUpdate()}performUpdate(){let e=Tt.filter(s=>this.#t.has(s));this.#n({buffer:this.#i,valueTypes:e,endianness:this.#s,memoryLength:this.#o,valueTypeModes:this.#e,onValueTypeModeChange:this.#a,onJumpToAddressClicked:this.#d},void 0,this.contentElement)}};var De={};c(De,{DEFAULT_VIEW:()=>Oe,ValueInterpreterSettings:()=>H});import*as ge from"./../../../core/i18n/i18n.js";import*as Be from"./../../../core/platform/platform.js";import*as ze from"./../../../ui/legacy/legacy.js";import*as It from"./../../../ui/lit/lit.js";import*as G from"./../../../ui/visual_logging/visual_logging.js";var Pe=`@scope to (devtools-widget > *){:scope{flex:auto;display:flex;min-height:20px}.settings{display:flex;flex-wrap:wrap;margin:0 12px 12px;gap:15px 45px}.value-types-selection{display:flex;flex-direction:column}.group{font-weight:bold;margin-bottom:var(--sys-size-6)}}
/*# sourceURL=${import.meta.resolve("./valueInterpreterSettings.css")} */`;var{render:Mt,html:ce}=It,Fe={otherGroup:"Other"},St=ge.i18n.registerUIStrings("panels/linear_memory_inspector/components/ValueInterpreterSettings.ts",Fe),Ut=ge.i18n.getLocalizedString.bind(void 0,St),je=new Map([["Integer",["Integer 8-bit","Integer 16-bit","Integer 32-bit","Integer 64-bit"]],["Floating point",["Float 32-bit","Float 64-bit"]],["Other",["Pointer 32-bit","Pointer 64-bit"]]]);function At(t){return t==="Other"?Ut(Fe.otherGroup):t}var Oe=(t,e,s)=>{Mt(ce`
      <style>${Pe}</style>
      <div class="settings" jslog=${G.pane("settings")}>
       ${[...je.keys()].map(i=>{let r=je.get(i)??[];return ce`
          <div class="value-types-selection">
            <span class="group">${At(i)}</span>
            ${r.map(o=>ce`
                <devtools-checkbox
                  title=${O(o)}
                  ?checked=${t.valueTypes.has(o)}
                  @change=${n=>{let a=n.target;t.onToggle(o,a.checked)}} jslog=${G.toggle().track({change:!0}).context(Be.StringUtilities.toKebabCase(o))}
                  }>${O(o)}</devtools-checkbox>
         `)}
          </div>
        `})}
      </div>
      `,s)},H=class extends ze.Widget.Widget{#n;#s=new Set;#i=()=>{};constructor(e,s=Oe){super(e),this.#n=s}get valueTypes(){return this.#s}set valueTypes(e){this.#s=e,this.requestUpdate()}get onToggle(){return this.#i}set onToggle(e){this.#i=e,this.requestUpdate()}performUpdate(){let e={valueTypes:this.#s,onToggle:this.#i};this.#n(e,void 0,this.contentElement)}};var pe={toggleValueTypeSettings:"Toggle value type settings",changeEndianness:"Change `Endianness`"},kt=J.i18n.registerUIStrings("panels/linear_memory_inspector/components/LinearMemoryValueInterpreter.ts",pe),Je=J.i18n.getLocalizedString.bind(void 0,kt),{render:Et,html:ue}=Lt,{widget:We}=N.Widget;function Vt(t,e){return ue`
    <label data-endianness-setting="true" title=${Je(pe.changeEndianness)}>
      <select
        jslog=${T.dropDown("linear-memory-inspector.endianess").track({change:!0})}
        style="border: none;"
        data-endianness="true" @change=${s=>t(s.target.value)}>
        ${["Little Endian","Big Endian"].map(s=>ue`<option value=${s} .selected=${e===s}
            jslog=${T.item(Ge.StringUtilities.toKebabCase(s)).track({click:!0,resize:!0})}>${J.i18n.lockedString(s)}</option>`)}
      </select>
    </label>
    `}var Ye=(t,e,s)=>{Et(ue`
    <style>${N.inspectorCommonStyles}</style>
    <style>${He}</style>
    <div class="value-interpreter">
      <div class="settings-toolbar">
        ${Vt(t.onEndiannessChanged,t.endianness)}
        <devtools-button data-settings="true" class="toolbar-button ${t.showSettings?"":"disabled"}"
            title=${Je(pe.toggleValueTypeSettings)} @click=${t.onSettingsToggle}
            jslog=${T.toggleSubpane("linear-memory-inspector.toggle-value-settings").track({click:!0})}
            .iconName=${"gear"}
            .toggledIconName=${"gear-filled"}
            .toggleType=${"primary-toggle"}
            .variant=${"icon_toggle"}
        ></devtools-button>
      </div>
      <span class="divider"></span>
      <div>
        ${t.showSettings?We(H,{valueTypes:t.valueTypes,onToggle:t.onValueTypeToggled}):We(C,{buffer:t.buffer,valueTypes:t.valueTypes,endianness:t.endianness,valueTypeModes:t.valueTypeModes,memoryLength:t.memoryLength,onValueTypeModeChange:t.onValueTypeModeChange,onJumpToAddressClicked:t.onJumpToAddressClicked})}
      </div>
    </div>
  `,s)},R=class extends N.Widget.Widget{#n;#s="Little Endian";#i=new ArrayBuffer(0);#t=new Set;#e=new Map;#o=0;#a=!1;#d=()=>{};#l=()=>{};#r=()=>{};#h=()=>{};constructor(e,s=Ye){super(e),this.#n=s}set buffer(e){this.#i=e,this.requestUpdate()}get buffer(){return this.#i}set valueTypes(e){this.#t=e,this.requestUpdate()}get valueTypes(){return this.#t}set valueTypeModes(e){this.#e=e,this.requestUpdate()}get valueTypeModes(){return this.#e}set endianness(e){this.#s=e,this.requestUpdate()}get endianness(){return this.#s}set memoryLength(e){this.#o=e,this.requestUpdate()}get memoryLength(){return this.#o}get onValueTypeModeChange(){return this.#d}set onValueTypeModeChange(e){this.#d=e,this.requestUpdate()}get onJumpToAddressClicked(){return this.#l}set onJumpToAddressClicked(e){this.#l=e,this.requestUpdate()}get onEndiannessChanged(){return this.#r}set onEndiannessChanged(e){this.#r=e,this.performUpdate()}get onValueTypeToggled(){return this.#h}set onValueTypeToggled(e){this.#h=e,this.performUpdate()}performUpdate(){let e={endianness:this.#s,buffer:this.#i,valueTypes:this.#t,valueTypeModes:this.#e,memoryLength:this.#o,showSettings:this.#a,onValueTypeModeChange:this.#d,onJumpToAddressClicked:this.#l,onEndiannessChanged:this.#r,onValueTypeToggled:this.#h,onSettingsToggle:this.#c.bind(this)};this.#n(e,void 0,this.contentElement)}#c(){this.#a=!this.#a,this.requestUpdate()}};var et={addressHasToBeANumberBetweenSAnd:"Address has to be a number between {PH1} and {PH2}"},Rt=ve.i18n.registerUIStrings("panels/linear_memory_inspector/components/LinearMemoryInspector.ts",et),Nt=ve.i18n.getLocalizedString.bind(void 0,Rt),{widget:Ze}=ye.Widget,me=class{#n=0;#s;constructor(e,s){if(e<0)throw new Error("Address should be a greater or equal to zero");this.#n=e,this.#s=s}valid(){return!0}reveal(){this.#s(this.#n)}},tt=(t,e,s)=>{let i=t.currentNavigatorMode==="Submitted"?S(t.address):t.currentNavigatorAddressLine,r=st(i,t.outerMemoryLength),o=Nt(et.addressHasToBeANumberBetweenSAnd,{PH1:S(0),PH2:S(t.outerMemoryLength)}),n=r?void 0:o,a=t.highlightInfo?[t.highlightInfo]:[],d=_t(a,t.address);Ht(Ke`
    <style>${Ce}</style>
    <div class="view">
      <devtools-linear-memory-inspector-navigator
        .data=${{address:i,valid:r,mode:t.currentNavigatorMode,error:n,canGoBackInHistory:t.canGoBackInHistory,canGoForwardInHistory:t.canGoForwardInHistory}}
        @refreshrequested=${t.onRefreshRequest}
        @addressinputchanged=${t.onAddressChange}
        @pagenavigation=${t.onNavigatePage}
        @historynavigation=${t.onNavigateHistory}></devtools-linear-memory-inspector-navigator>
      ${Ze(I,{highlightInfos:a,focusedMemoryHighlight:d,jumpToAddress:h=>t.onJumpToAddress(h),deleteHighlight:t.onDeleteMemoryHighlight})}
      <devtools-linear-memory-inspector-viewer
        .data=${{memory:t.memorySlice,address:t.address,memoryOffset:t.viewerStart,focus:t.currentNavigatorMode==="Submitted",highlightInfo:t.highlightInfo,focusedMemoryHighlight:d}}
        @byteselected=${t.onByteSelected}
        @resize=${t.onResize}>
      </devtools-linear-memory-inspector-viewer>
    </div>
    ${t.hideValueInspector?Ct:Ke`
    <div class="value-interpreter">
      ${Ze(R,{buffer:t.memory.slice(t.address-t.memoryOffset,t.address+ne).buffer,valueTypes:t.valueTypes,valueTypeModes:t.valueTypeModes,endianness:t.endianness,memoryLength:t.outerMemoryLength,onValueTypeModeChange:t.onValueTypeModeChanged,onJumpToAddressClicked:t.onJumpToAddress,onValueTypeToggled:t.onValueTypeToggled,onEndiannessChanged:t.onEndiannessChanged})}
    </div>`}
    `,s)};function Qe(t,e,s){let r=Math.floor(t/e)*e,o=Math.min(r+e,s);return{start:r,end:o}}function st(t,e){let s=P(t);return s!==void 0&&s>=0&&s<e}function _t(t,e){let s;for(let i of t)i.startAddress<=e&&e<i.startAddress+i.size&&(s?i.size<s.size&&(s=i):s=i);return s}var fe=class extends Y.ObjectWrapper.eventMixin(ye.Widget.Widget){#n=new Y.SimpleHistoryManager.SimpleHistoryManager(10);#s=new Uint8Array;#i=0;#t=0;#e=-1;#o;#a="Submitted";#d=`${this.#e}`;#l=4;#r=v();#h=new Set(this.#r.keys());#c="Little Endian";#u=!1;#m;constructor(e,s){super(e),this.#m=s??tt}set memory(e){this.#s=e,this.requestUpdate()}set memoryOffset(e){this.#i=e,this.requestUpdate()}set outerMemoryLength(e){this.#t=e,this.requestUpdate()}set highlightInfo(e){this.#o=e,this.requestUpdate()}set valueTypeModes(e){this.#r=e,this.requestUpdate()}set valueTypes(e){this.#h=e,this.requestUpdate()}set endianness(e){this.#c=e,this.requestUpdate()}set hideValueInspector(e){this.#u=e,this.requestUpdate()}get hideValueInspector(){return this.#u}performUpdate(){let{start:e,end:s}=Qe(this.#e,this.#l,this.#t);if(e<this.#i||s>this.#i+this.#s.length){this.dispatchEventToListeners("MemoryRequest",{start:e,end:s,address:this.#e});return}if(this.#e<this.#i||this.#e>this.#i+this.#s.length||this.#e<0)throw new Error("Address is out of bounds.");if(this.#o){if(this.#o.size<0)throw this.#o=void 0,new Error("Object size has to be greater than or equal to zero");if(this.#o.startAddress<0||this.#o.startAddress>=this.#t)throw this.#o=void 0,new Error("Object start address is out of bounds.")}let i={memory:this.#s,address:this.#e,memoryOffset:this.#i,outerMemoryLength:this.#t,valueTypes:this.#h,valueTypeModes:this.#r,endianness:this.#c,highlightInfo:this.#o,hideValueInspector:this.#u,currentNavigatorMode:this.#a,currentNavigatorAddressLine:this.#d,canGoBackInHistory:this.#n.canRollback(),canGoForwardInHistory:this.#n.canRollover(),onRefreshRequest:this.#x.bind(this),onAddressChange:this.#$.bind(this),onNavigatePage:this.#f.bind(this),onNavigateHistory:this.#S.bind(this),onJumpToAddress:this.#y.bind(this),onDeleteMemoryHighlight:this.#b.bind(this),onByteSelected:this.#w.bind(this),onResize:this.#v.bind(this),onValueTypeToggled:this.#I.bind(this),onValueTypeModeChanged:this.#M.bind(this),onEndiannessChanged:this.#T.bind(this),memorySlice:this.#s.slice(e-this.#i,s-this.#i),viewerStart:e};this.#m(i,{},this.contentElement)}#y(e){this.#a="Submitted";let s=Math.max(0,Math.min(e,this.#t-1));this.#g(s)}#b(e){this.dispatchEventToListeners("DeleteMemoryHighlight",e)}#x(){let{start:e,end:s}=Qe(this.#e,this.#l,this.#t);this.dispatchEventToListeners("MemoryRequest",{start:e,end:s,address:this.#e})}#w(e){this.#a="Submitted";let s=Math.max(0,Math.min(e.data,this.#t-1));this.#g(s)}#p(){return{valueTypes:this.#h,modes:this.#r,endianness:this.#c}}#T(e){this.#c=e,this.dispatchEventToListeners("SettingsChanged",this.#p()),this.requestUpdate()}#$(e){let{address:s,mode:i}=e.data,r=st(s,this.#t),o=P(s);if(this.#d=s,o!==void 0&&r){this.#a=i,this.#g(o);return}i==="Submitted"&&!r?this.#a="InvalidSubmit":this.#a="Edit",this.requestUpdate()}#I(e,s){let i=new Set(this.#h);s?i.add(e):i.delete(e),this.#h=i,this.dispatchEventToListeners("SettingsChanged",this.#p()),this.requestUpdate()}#M(e,s){let i=new Map(this.#r);i.set(e,s),this.#r=i,this.dispatchEventToListeners("SettingsChanged",this.#p()),this.requestUpdate()}#S(e){return e.data==="Forward"?this.#n.rollover():this.#n.rollback()}#f(e){let s=e.data==="Forward"?this.#e+this.#l:this.#e-this.#l,i=Math.max(0,Math.min(s,this.#t-1));this.#g(i)}#g(e){if(e<0||e>=this.#t){console.warn(`Specified address is out of bounds: ${e}`);return}this.address=e,this.requestUpdate()}#v(e){this.#l=e.data,this.requestUpdate()}set address(e){if(this.#e===e)return;let s=new me(e,()=>this.#g(e));this.#n.push(s),this.#e=e,this.dispatchEventToListeners("AddressChanged",this.#e),this.requestUpdate()}};var ot={};c(ot,{AddressInputChangedEvent:()=>X,HistoryNavigationEvent:()=>q,LinearMemoryNavigator:()=>Z,PageNavigationEvent:()=>_,RefreshRequestedEvent:()=>K});import"./../../../ui/kit/kit.js";import*as xe from"./../../../core/i18n/i18n.js";import"./../../../ui/components/buttons/buttons.js";import*as we from"./../../../ui/lit/lit.js";import*as Q from"./../../../ui/visual_logging/visual_logging.js";var rt=`.navigator{min-height:24px;display:flex;flex-wrap:nowrap;justify-content:space-between;overflow:hidden;align-items:center;background-color:var(--sys-color-cdt-base-container);color:var(--sys-color-on-surface)}.navigator-item{display:flex;white-space:nowrap;overflow:hidden}.address-input{height:var(--sys-size-11);padding:0 var(--sys-size-5);margin:0 var(--sys-size-3);text-align:center;align-items:center;outline:none;color:var(--sys-color-on-surface);border:var(--sys-size-1) solid var(--sys-color-neutral-outline);border-radius:var(--sys-shape-corner-extra-small);background:transparent}.address-input.invalid{color:var(--sys-color-error)}.navigator-button{display:flex;background:transparent;overflow:hidden;border:none;padding:0;outline:none;justify-content:center;align-items:center}.navigator-button:disabled devtools-icon{opacity:50%}.navigator-button:enabled:hover devtools-icon{color:var(--icon-default-hover)}.navigator-button:enabled:focus devtools-icon{color:var(--icon-default-hover)}
/*# sourceURL=${import.meta.resolve("./linearMemoryNavigator.css")} */`;var y={enterAddress:"Enter address",goBackInAddressHistory:"Go back in address history",goForwardInAddressHistory:"Go forward in address history",previousPage:"Previous page",nextPage:"Next page",refresh:"Refresh"},qt=xe.i18n.registerUIStrings("panels/linear_memory_inspector/components/LinearMemoryNavigator.ts",y),$=xe.i18n.getLocalizedString.bind(void 0,qt),{render:Pt,html:be,Directives:{ifDefined:jt}}=we,X=class t extends Event{static eventName="addressinputchanged";data;constructor(e,s){super(t.eventName),this.data={address:e,mode:s}}},_=class t extends Event{static eventName="pagenavigation";data;constructor(e){super(t.eventName,{}),this.data=e}},q=class t extends Event{static eventName="historynavigation";data;constructor(e){super(t.eventName,{}),this.data=e}},K=class t extends Event{static eventName="refreshrequested";constructor(){super(t.eventName,{})}},Z=class extends HTMLElement{#n=this.attachShadow({mode:"open"});#s="0";#i=void 0;#t=!0;#e=!1;#o=!1;set data(e){this.#s=e.address,this.#i=e.error,this.#t=e.valid,this.#e=e.canGoBackInHistory,this.#o=e.canGoForwardInHistory,this.#a();let s=this.#n.querySelector(".address-input");s&&(e.mode==="Submitted"?s.blur():e.mode==="InvalidSubmit"&&s.select())}#a(){let e=be`
      <style>${rt}</style>
      <div class="navigator">
        <div class="navigator-item">
          ${this.#r({icon:"undo",title:$(y.goBackInAddressHistory),event:new q("Backward"),enabled:this.#e,jslogContext:"linear-memory-inspector.history-back"})}
          ${this.#r({icon:"redo",title:$(y.goForwardInAddressHistory),event:new q("Forward"),enabled:this.#o,jslogContext:"linear-memory-inspector.history-forward"})}
        </div>
        <div class="navigator-item">
          ${this.#r({icon:"chevron-left",title:$(y.previousPage),event:new _("Backward"),enabled:!0,jslogContext:"linear-memory-inspector.previous-page"})}
          ${this.#d()}
          ${this.#r({icon:"chevron-right",title:$(y.nextPage),event:new _("Forward"),enabled:!0,jslogContext:"linear-memory-inspector.next-page"})}
        </div>
        ${this.#r({icon:"refresh",title:$(y.refresh),event:new K,enabled:!0,jslogContext:"linear-memory-inspector.refresh"})}
      </div>
      `;Pt(e,this.#n,{host:this})}#d(){let e={"address-input":!0,invalid:!this.#t};return be`<input
      class=${we.Directives.classMap(e)}
      data-input="true"
      .value=${this.#s}
      jslog=${Q.textField("linear-memory-inspector.address").track({change:!0})}
      title=${jt(this.#t?$(y.enterAddress):this.#i)}
      @change=${this.#l.bind(this,"Submitted")}
      @input=${this.#l.bind(this,"Edit")}
    />`}#l(e,s){let i=s.target;this.dispatchEvent(new X(i.value,e))}#r(e){return be`
      <devtools-button class="navigator-button"
        .data=${{variant:"icon",iconName:e.icon,disabled:!e.enabled}}
        jslog=${Q.action().track({click:!0,keydown:"Enter"}).context(e.jslogContext)}
        data-button=${e.event.type} title=${e.title}
        @click=${this.dispatchEvent.bind(this,e.event)}
      ></devtools-button>`}};customElements.define("devtools-linear-memory-inspector-navigator",Z);var Bt={};export{Se as LinearMemoryHighlightChipList,it as LinearMemoryInspector,Le as LinearMemoryInspectorUtils,ot as LinearMemoryNavigator,Xe as LinearMemoryValueInterpreter,Ve as LinearMemoryViewer,Bt as LinearMemoryViewerUtils,qe as ValueInterpreterDisplay,Ne as ValueInterpreterDisplayUtils,De as ValueInterpreterSettings};
//# sourceMappingURL=components.js.map
