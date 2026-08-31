var X=Object.defineProperty;var u=(o,e)=>{for(var t in e)X(o,t,{get:e[t],enumerable:!0})};var R={};u(R,{ChangesView:()=>k,DEFAULT_VIEW:()=>H});import"./../../ui/legacy/legacy.js";import*as I from"./../../core/i18n/i18n.js";import*as _ from"./../../models/workspace_diff/workspace_diff.js";import*as n from"./../../ui/legacy/legacy.js";import*as oe from"./../../ui/lit/lit.js";import*as j from"./../../ui/visual_logging/visual_logging.js";var M={};u(M,{ChangesSidebar:()=>l,DEFAULT_VIEW:()=>F});import"./../../ui/kit/kit.js";import*as D from"./../../core/common/common.js";import*as g from"./../../core/i18n/i18n.js";import*as a from"./../../models/workspace/workspace.js";import"./../../models/workspace_diff/workspace_diff.js";import*as E from"./../../ui/legacy/legacy.js";import*as J from"./../../ui/lit/lit.js";import*as $ from"./../../ui/visual_logging/visual_logging.js";import*as L from"./../snippets/snippets.js";var x=`@scope to (devtools-widget > *){.tree-outline li{min-height:20px}devtools-icon{color:var(--icon-file-default);margin-right:var(--sys-size-4)}.tree-element-title > div{display:flex;align-items:center}.navigator-sm-script-tree-item devtools-icon,
.navigator-script-tree-item devtools-icon,
.navigator-snippet-tree-item devtools-icon{color:var(--icon-file-script)}.navigator-sm-stylesheet-tree-item devtools-icon,
.navigator-stylesheet-tree-item devtools-icon{color:var(--icon-file-styles)}.navigator-image-tree-item devtools-icon{color:var(--icon-file-image)}.navigator-font-tree-item devtools-icon{color:var(--icon-file-font)}.tree-outline li:hover:not(.selected) .selection{display:block;& devtools-icon{color:var(--icon-default-hover)}}@media (forced-colors: active){li,
  devtools-icon{forced-color-adjust:none;color:ButtonText!important}}}
/*# sourceURL=${import.meta.resolve("./changesSidebar.css")} */`;var W={sFromSourceMap:"{PH1} (from source map)"},K=g.i18n.registerUIStrings("panels/changes/ChangesSidebar.ts",W),Q=g.i18n.getLocalizedString.bind(void 0,K),{render:Y,html:v}=J,F=(o,e,t)=>{let i=s=>s.contentType().isFromSourceMap()?Q(W.sFromSourceMap,{PH1:s.displayName()}):s.url(),r=s=>L.ScriptSnippetFileSystem.isSnippetsUISourceCode(s)?"snippet":"document";Y(v`<devtools-tree
             navigation-variant
             hide-overflow .template=${v`
               <ul role="tree">
                 ${o.sourceCodes.values().map(s=>v`
                   <li
                     role="treeitem"
                     @select=${()=>o.onSelect(s)}
                     ?selected=${s===o.selectedSourceCode}>
                       <style>${x}</style>
                       <div class=${"navigator-"+s.contentType().name()+"-tree-item"}>
                         <devtools-icon name=${r(s)}></devtools-icon>
                         <span title=${i(s)}>
                           <span ?hidden=${!s.isDirty()}>*</span>
                           ${s.displayName()}
                         </span>
                       </div>
                   </li>`)}
               </ul>`}></devtools-tree>`,t,{container:{attributes:{jslog:`${$.pane("sidebar").track({resize:!0})}`}}})},l=class extends D.ObjectWrapper.eventMixin(E.Widget.Widget){#i=null;#e;#t=new Set;#s=null;constructor(e,t=F){super(e),this.#e=t}set workspaceDiff(e){this.#i&&(this.#i.modifiedUISourceCodes().forEach(this.#n.bind(this)),this.#i.removeEventListener("ModifiedStatusChanged",this.uiSourceCodeModifiedStatusChanged,this)),this.#i=e,this.#i.modifiedUISourceCodes().forEach(this.#r.bind(this)),this.#i.addEventListener("ModifiedStatusChanged",this.uiSourceCodeModifiedStatusChanged,this),this.requestUpdate()}selectedUISourceCode(){return this.#s}performUpdate(){let e={onSelect:t=>this.#o(t),sourceCodes:this.#t,selectedSourceCode:this.#s};this.#e(e,{},this.contentElement)}#o(e){this.#s=e,this.dispatchEventToListeners("SelectedUISourceCodeChanged"),this.requestUpdate()}#r(e){this.#t.add(e),e.addEventListener(a.UISourceCode.Events.TitleChanged,this.requestUpdate,this),e.addEventListener(a.UISourceCode.Events.WorkingCopyChanged,this.requestUpdate,this),e.addEventListener(a.UISourceCode.Events.WorkingCopyCommitted,this.requestUpdate,this),this.requestUpdate()}#n(e){if(e.removeEventListener(a.UISourceCode.Events.TitleChanged,this.requestUpdate,this),e.removeEventListener(a.UISourceCode.Events.WorkingCopyChanged,this.requestUpdate,this),e.removeEventListener(a.UISourceCode.Events.WorkingCopyCommitted,this.requestUpdate,this),e===this.#s){let t;for(let i of this.#t.values()){if(i===e)break;t=i}this.#t.delete(e),this.#o(t??this.#t.values().next().value??null)}else this.#t.delete(e);this.requestUpdate()}uiSourceCodeModifiedStatusChanged(e){let{isModified:t,uiSourceCode:i}=e.data;t?this.#r(i):this.#n(i),this.requestUpdate()}};var z=`[slot="main"]{flex-direction:column;display:flex}[slot="sidebar"]{overflow:auto}.diff-container{flex:1;overflow:auto;& .widget:first-child{height:100%}.combined-diff-view{padding-inline:var(--sys-size-6);padding-block:var(--sys-size-4)}}:focus.selected{background-color:var(--sys-color-tonal-container);color:var(--sys-color-on-tonal-container)}.changes-toolbar{background-color:var(--sys-color-cdt-base-container);border-top:1px solid var(--sys-color-divider)}[hidden]{display:none!important}.copy-to-prompt{margin:var(--sys-size-4);flex-grow:0!important}
/*# sourceURL=${import.meta.resolve("./changesView.css")} */`;var C={};u(C,{CombinedDiffView:()=>c});import"./../../ui/kit/kit.js";import*as V from"./../../core/common/common.js";import*as U from"./../../core/i18n/i18n.js";import*as m from"./../../models/persistence/persistence.js";import"./../../models/workspace_diff/workspace_diff.js";import"./../../ui/components/buttons/buttons.js";import*as h from"./../../ui/legacy/legacy.js";import*as f from"./../../ui/lit/lit.js";import*as q from"./../../ui/visual_logging/visual_logging.js";import*as P from"./../utils/utils.js";var T=`.combined-diff-view{display:flex;flex-direction:column;gap:var(--sys-size-5);height:100%;background-color:var(--sys-color-surface3);overflow:auto;details{flex-shrink:0;border-radius:12px;&.selected{outline:var(--sys-size-2) solid var(--sys-color-divider-on-tonal-container)}summary{background-color:var(--sys-color-surface1);border-radius:var(--sys-shape-corner-medium-small);height:var(--sys-size-12);padding:var(--sys-size-3);font:var(--sys-typescale-body5-bold);display:flex;justify-content:space-between;gap:var(--sys-size-2);&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:calc(-1 * var(--sys-size-2))}.summary-left{display:flex;align-items:center;min-width:0;flex-grow:0;.file-name-link{margin-left:var(--sys-size-5);width:100%;text-overflow:ellipsis;overflow:hidden;text-wrap-mode:nowrap;border:none;background:none;font:inherit;padding:0;&:hover{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer}&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:var(--sys-size-2)}}devtools-icon{transform:rotate(270deg)}devtools-file-source-icon{height:var(--sys-size-8);width:var(--sys-size-8);flex-shrink:0}}.summary-right{flex-shrink:0;display:flex;align-items:center;gap:var(--sys-size-2);padding-right:var(--sys-size-4);.copied{font:var(--sys-typescale-body5-regular)}}&::marker{content:''}}.diff-view-container{overflow-x:auto;background-color:var(--sys-color-cdt-base-container);border-bottom-left-radius:var(--sys-shape-corner-medium-small);border-bottom-right-radius:var(--sys-shape-corner-medium-small)}&[open]{summary{border-radius:0;border-top-left-radius:var(--sys-shape-corner-medium-small);border-top-right-radius:var(--sys-shape-corner-medium-small);devtools-icon{transform:rotate(0deg)}}}}}
/*# sourceURL=${import.meta.resolve("./combinedDiffView.css")} */`;var Z=1e3,{html:y,Directives:{classMap:ee}}=f,p={copied:"Copied to clipboard",copyFile:"Copy file {PH1} to clipboard"},te=U.i18n.registerUIStrings("panels/changes/CombinedDiffView.ts",p),w=U.i18n.getLocalizedString.bind(void 0,te);function ie(o){let{fileName:e,fileUrl:t,mimeType:i,icon:r,diff:s,copied:d,selectedFileUrl:A,onCopy:O,onFileNameClick:B}=o,G=ee({selected:A===t});return y`
    <details open class=${G}>
      <summary>
        <div class="summary-left">
          <devtools-icon class="drop-down-icon" name="arrow-drop-down"></devtools-icon>
          ${r}
          <button class="file-name-link" jslog=${q.action("jump-to-file")} @click=${()=>B(t)}>${e}</button>
        </div>
        <div class="summary-right">
          <devtools-button
            .title=${w(p.copyFile,{PH1:e})}
            .size=${"SMALL"}
            .iconName=${"copy"}
            .jslogContext=${"combined-diff-view.copy"}
            .variant=${"icon"}
            @click=${()=>O(t)}
          ></devtools-button>
          ${d?y`<span class="copied">${w(p.copied)}</span>`:f.nothing}
        </div>
      </summary>
      <div class="diff-view-container">
        <devtools-diff-view
          .data=${{diff:s,mimeType:i}}>
        </devtools-diff-view>
      </div>
    </details>
  `}var se=(o,e,t)=>{f.render(y`
      <div class="combined-diff-view">
        ${o.singleDiffViewInputs.map(i=>ie(i))}
      </div>
    `,t)},c=class extends h.Widget.Widget{ignoredUrls=[];#i;#e;#t=[];#s={};#o;#r={};constructor(e,t=se){super(e),this.registerRequiredCSS(T),this.#o=t}wasShown(){super.wasShown(),this.#e?.addEventListener("ModifiedStatusChanged",this.#d,this),this.#a()}willHide(){super.willHide(),this.#e?.removeEventListener("ModifiedStatusChanged",this.#d,this)}set workspaceDiff(e){this.#e=e,this.#a()}set selectedFileUrl(e){this.#i=e,this.requestUpdate(),this.updateComplete.then(()=>{this.#r.scrollToSelectedDiff?.()})}async#n(e){let t=this.#t.find(r=>r.url()===e);if(!t)return;let i=t.workingCopyContentData();i.isTextContent&&(h.UIUtils.copyTextToClipboard(i.text,w(p.copied)),this.#s[e]=!0,this.requestUpdate(),setTimeout(()=>{delete this.#s[e],this.requestUpdate()},Z))}#l(e){let t=this.#t.find(i=>i.url()===e);V.Revealer.reveal(t)}async#a(){if(!this.#e)return;let e=this.#t,t=this.#e.modifiedUISourceCodes();e.filter(s=>!t.includes(s)).forEach(s=>this.#e?.unsubscribeFromDiffChange(s,this.requestUpdate,this)),t.filter(s=>!e.includes(s)).forEach(s=>this.#e?.subscribeToDiffChange(s,this.requestUpdate,this)),this.#t=t,this.isShowing()&&this.requestUpdate()}async#d(){this.#e&&await this.#a()}async performUpdate(){let t=(await Promise.all(this.#t.map(async i=>{for(let s of this.ignoredUrls)if(i.url().startsWith(s))return;return{diff:(await this.#e?.requestDiff(i))?.diff??[],uiSourceCode:i}}))).filter(i=>!!i).map(({uiSourceCode:i,diff:r})=>{let s=i.fullDisplayName(),d=m.Persistence.PersistenceImpl.instance().fileSystem(i);return d&&(s=[d.project().displayName(),...m.FileSystemWorkspaceBinding.FileSystemWorkspaceBinding.relativePath(d)].join("/")),{diff:r,fileName:`${i.isDirty()?"*":""}${s}`,fileUrl:i.url(),mimeType:i.mimeType(),icon:P.PanelUtils.getIconForSourceFile(i),copied:this.#s[i.url()],selectedFileUrl:this.#i,onCopy:this.#n.bind(this),onFileNameClick:this.#l.bind(this)}});this.#o({singleDiffViewInputs:t},this.#r,this.contentElement)}};var re="https://developer.chrome.com/docs/devtools/changes",b={noChanges:"No changes yet",changesViewDescription:"On this page you can track code changes made within DevTools."},ne=I.i18n.registerUIStrings("panels/changes/ChangesView.ts",b),N=I.i18n.getLocalizedString.bind(void 0,ne),{render:ae,html:de}=oe,{widget:S}=n.Widget,H=(o,e,t)=>{ae(de`
      <style>${z}</style>
      <devtools-split-view direction=column>
        <div class=vbox slot="main">
          <devtools-widget
            ?hidden=${o.workspaceDiff.modifiedUISourceCodes().length>0}
            ${S(n.EmptyWidget.EmptyWidget,{header:N(b.noChanges),text:N(b.changesViewDescription),link:re})}>
          </devtools-widget>
          <div class=diff-container role=tabpanel ?hidden=${o.workspaceDiff.modifiedUISourceCodes().length===0}>
            ${S(c,{selectedFileUrl:o.selectedSourceCode?.url(),workspaceDiff:o.workspaceDiff})}
          </div>
        </div>
        <devtools-widget slot="sidebar" ${S(l,{workspaceDiff:o.workspaceDiff})}
          @SelectedUISourceCodeChanged=${i=>{let r=n.Widget.Widget.get(i.target);o.onSelect(r.selectedUISourceCode())}}>
        </devtools-widget>
      </devtools-split-view>`,t,{container:{attributes:{jslog:`${j.panel("changes").track({resize:!0})}`}}})},k=class o extends n.Widget.VBox{#i;#e=null;#t;constructor(e,t=H){super(e,{useShadowDom:"pure"}),this.#i=_.WorkspaceDiff.workspaceDiff(),this.#t=t,this.requestUpdate()}performUpdate(){this.#t({workspaceDiff:this.#i,selectedSourceCode:this.#e,onSelect:e=>{this.#e=e,this.requestUpdate()}},{},this.contentElement)}wasShown(){n.Context.Context.instance().setFlavor(o,this),super.wasShown(),this.requestUpdate(),this.#i.addEventListener("ModifiedStatusChanged",this.requestUpdate,this)}willHide(){super.willHide(),n.Context.Context.instance().setFlavor(o,null),this.#i.removeEventListener("ModifiedStatusChanged",this.requestUpdate,this)}};export{M as ChangesSidebar,R as ChangesView,C as CombinedDiffView};
//# sourceMappingURL=changes.js.map
