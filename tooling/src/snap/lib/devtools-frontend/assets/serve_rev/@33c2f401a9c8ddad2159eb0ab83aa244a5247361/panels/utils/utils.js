import"./../../ui/kit/kit.js";import"./../../ui/components/icon_button/icon_button.js";import*as r from"./../../core/common/common.js";import*as w from"./../../core/i18n/i18n.js";import*as b from"./../../core/sdk/sdk.js";import*as M from"./../../models/formatter/formatter.js";import*as C from"./../../models/persistence/persistence.js";import*as H from"./../../ui/components/diff_view/diff_view.js";import{Directives as U,html as u}from"./../../ui/lit/lit.js";import*as $ from"./../common/common.js";import*as P from"./../snippets/snippets.js";var{ref:W,styleMap:B,ifDefined:E}=U,f={requestContentHeadersOverridden:"Both request content and headers are overridden",requestContentOverridden:"Request content is overridden",requestHeadersOverridden:"Request headers are overridden",thirdPartyPhaseout:"Cookies for this request are blocked either because of Chrome flags or browser configuration. Learn more in the Issues panel.",resourceTypeWithThrottling:"{PH1} (throttled to {PH2})",requestFailed:"{PH1} request failed",prefetchFailed:"{PH1} prefetch request failed"},V=w.i18n.registerUIStrings("panels/utils/utils.ts",f),d=w.i18n.getLocalizedString.bind(void 0,V),N=class T{static isFailedNetworkRequest(e){if(!e)return!1;if(e.failed&&!e.statusCode||e.statusCode>=400)return!0;let t=e.signedExchangeInfo();return!!(t!==null&&t.errors||e.corsErrorStatus())}static getIconForNetworkRequest(e){let t=e.resourceType();if(T.isFailedNetworkRequest(e)){let n,a;return e.resourceType()===r.ResourceType.resourceTypes.Prefetch?(a=d(f.prefetchFailed,{PH1:t.title()}),n="warning-filled"):(a=d(f.requestFailed,{PH1:t.title()}),n="cross-circle-filled"),u`<devtools-icon
          class="icon"
          name=${n}
          title=${a}
          role=img
        ></devtools-icon>`}if(e.hasThirdPartyCookiePhaseoutIssue())return u`<devtools-icon
        class="icon"
        name="warning-filled"
        role=img
        title=${d(f.thirdPartyPhaseout)}
      ></devtools-icon>`;let c=e.hasOverriddenHeaders(),o=e.hasOverriddenContent;if(c||o){let n;return c&&o?n=d(f.requestContentHeadersOverridden):o?n=d(f.requestContentOverridden):n=d(f.requestHeadersOverridden),u`<div class="network-override-marker">
          <devtools-icon class="icon" name="document" role=img title=${n}></devtools-icon>
        </div>`}let i=r.ResourceType.ResourceType.fromMimeType(e.mimeType);if(i!==t&&i!==r.ResourceType.resourceTypes.Other&&(t===r.ResourceType.resourceTypes.Fetch||i===r.ResourceType.resourceTypes.Image||t===r.ResourceType.resourceTypes.Other&&i===r.ResourceType.resourceTypes.Script)&&(t=i),t===r.ResourceType.resourceTypes.Image)return u`<div class="image icon">
        <img
          class="image-network-icon-preview"
          title=${m(e)}
          alt=${m(e)}
          ${W(n=>{n&&e.populateImageSource(n)})}
        />
      </div>`;if(t!==r.ResourceType.resourceTypes.Manifest&&r.ResourceType.ResourceType.simplifyContentType(e.mimeType)==="application/json")return u`<devtools-icon
          class="icon" name="file-json" title=${m(e)} role=img
          style="color:var(--icon-file-script)">
        </devtools-icon>`;let{iconName:s,color:l}=T.iconDataForResourceType(t);return u`<devtools-icon
        class="icon" name=${s} title=${m(e)}
        style=${B({color:l})}>
      </devtools-icon>`;function m(n){let a=b.NetworkManager.MultitargetNetworkManager.instance().appliedRequestConditions(n);if(!a?.urlPattern)return n.resourceType().title();let p=typeof a?.conditions.title=="string"?a?.conditions.title:a?.conditions.title();return d(f.resourceTypeWithThrottling,{PH1:n.resourceType().title(),PH2:p})}}static iconDataForResourceType(e){return e.isDocument()?{iconName:"file-document"}:e.isImage()?{iconName:"file-image",color:"var(--icon-file-image)"}:e.isFont()?{iconName:"file-font"}:e.isScript()?{iconName:"file-script"}:e.isStyleSheet()?{iconName:"file-stylesheet"}:e.name()===r.ResourceType.resourceTypes.Manifest.name()?{iconName:"file-manifest"}:e.name()===r.ResourceType.resourceTypes.Wasm.name()?{iconName:"file-wasm"}:e.name()===r.ResourceType.resourceTypes.WebSocket.name()||e.name()===r.ResourceType.resourceTypes.DirectSocket.name()?{iconName:"file-websocket"}:e.name()===r.ResourceType.resourceTypes.Media.name()?{iconName:"file-media"}:e.name()===r.ResourceType.resourceTypes.Fetch.name()||e.name()===r.ResourceType.resourceTypes.XHR.name()?{iconName:"file-fetch-xhr"}:{iconName:"file-generic"}}static getIconForSourceFile(e){let t=C.Persistence.PersistenceImpl.instance().binding(e),c=C.NetworkPersistenceManager.NetworkPersistenceManager.instance(),o="document",i=!1,s=!1;t?(P.ScriptSnippetFileSystem.isSnippetsUISourceCode(t.fileSystem)&&(o="snippet"),i=!0,s=c.project()===t.fileSystem.project()):c.isActiveHeaderOverrides(e)?(i=!0,s=!0):P.ScriptSnippetFileSystem.isSnippetsUISourceCode(e)&&(o="snippet");let l=t?$.PersistenceUtils.PersistenceUtils.tooltipForUISourceCode(e):void 0;return u`<devtools-file-source-icon
        class="icon"
        name=${o} 
        title=${E(l)} 
        .data=${{contentType:e.contentType().name(),hasDotBadge:i,isDotPurple:s,iconType:o}}></devtools-file-source-icon>`}static async formatCSSChangesFromDiff(e){let t="  ",{originalLines:c,currentLines:o,rows:i}=H.DiffView.buildDiffRows(e),s=await D(c.join(`
`)),l=await D(o.join(`
`)),m="",n,a,p=!1;for(let{currentLineNumber:O,originalLineNumber:L,type:S}of i){if(S!=="deletion"&&S!=="addition")continue;let y=S==="deletion",x=y?c:o,g=y?L-1:O-1,k=x[g].trim(),{declarationIDToStyleRule:F,styleRuleIDToStyleRule:I}=y?s:l,h,R="";if(F.has(g)){h=F.get(g);let v=h.selector;v!==n&&v!==a&&(R+=`${v} {
`),R+=t,p=!0}else p&&(R=`}

`,p=!1),I.has(g)&&(h=I.get(g));let j=y?`/* ${k} */`:k;m+=R+j+`
`,y?n=h?.selector:a=h?.selector}return m.length>0&&(m+="}"),m}static highlightElement(e){e.scrollIntoViewIfNeeded(),e.animate([{offset:0,backgroundColor:"rgba(255, 255, 0, 0.2)"},{offset:.1,backgroundColor:"rgba(255, 255, 0, 0.7)"},{offset:1,backgroundColor:"transparent"}],{duration:2e3,easing:"cubic-bezier(0, 0, 0.2, 1)"})}};async function D(T){let e=await new Promise(o=>{let i=[];M.FormatterWorkerPool.formatterWorkerPool().parseCSS(T,(s,l)=>{i.push(...l),s&&o(i)})}),t=new Map,c=new Map;for(let o of e)if("styleRange"in o){let i=o.selectorText.split(`
`).pop()?.trim();if(!i)continue;let s={rule:o,selector:i};c.set(o.styleRange.startLine,s);for(let l of o.properties)t.set(l.range.startLine,s)}return{declarationIDToStyleRule:t,styleRuleIDToStyleRule:c}}export{N as PanelUtils};
//# sourceMappingURL=utils.js.map
