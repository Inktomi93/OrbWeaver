var _i=Object.defineProperty;var G=(t,e)=>{for(var s in e)_i(t,s,{get:e[s],enumerable:!0})};import"./../../ui/kit/kit.js";import*as N from"./../../core/common/common.js";import*as x from"./../../core/host/host.js";import*as Rt from"./../../core/i18n/i18n.js";import*as Vi from"./../../core/platform/platform.js";import*as R from"./../../core/root/root.js";import*as y from"./../../core/sdk/sdk.js";import*as h from"./../../models/ai_assistance/ai_assistance.js";import*as cs from"./../../models/annotations/annotations.js";import*as Et from"./../../models/badges/badges.js";import*as we from"./../../models/greendev/greendev.js";import*as Ee from"./../../models/workspace/workspace.js";import"./../../ui/components/buttons/buttons.js";import*as Bi from"./../../ui/components/snackbars/snackbars.js";import*as qi from"./../../ui/helpers/helpers.js";import*as g from"./../../ui/legacy/legacy.js";import*as _ from"./../../ui/lit/lit.js";import*as st from"./../../ui/visual_logging/visual_logging.js";import*as tt from"./../lighthouse/lighthouse.js";import*as Hi from"./../network/forward/forward.js";import*as be from"./../network/network.js";import*as Pe from"./../timeline/timeline.js";var gs=`.toolbar-container{display:flex;flex-wrap:wrap;background-color:var(--sys-color-cdt-base-container);border-bottom:1px solid var(--sys-color-divider);flex:0 0 auto;justify-content:space-between}.ai-assistance-view-container{display:flex;flex-direction:column;width:100%;height:100%;align-items:center;overflow:hidden;& .fill-panel{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}devtools-split-view{width:100%;height:100%}}.toolbar-feedback-link{color:var(--sys-color-primary);margin:0 var(--sys-size-3);height:auto;font-size:var(--sys-typescale-body4-size)}
/*# sourceURL=${import.meta.resolve("././aiAssistancePanel.css")} */`;import*as xe from"./../../core/sdk/sdk.js";import*as ot from"./../../ui/lit/lit.js";import*as Ut from"./../common/common.js";import*as hs from"./../../core/common/common.js";import*as ps from"./../../core/platform/platform.js";import*as Dt from"./../../models/ai_assistance/ai_assistance.js";import*as ms from"./../../models/logs/logs.js";import*as us from"./../../ui/components/markdown_view/markdown_view.js";import*as Gi from"./../../ui/lit/lit.js";var{html:Pt}=Gi,K=class extends us.MarkdownView.MarkdownInsightRenderer{#i(e,s){return Pt`<devtools-link @click=${i=>{i.preventDefault(),i.stopPropagation(),hs.Revealer.reveal(e)}}>${ps.StringUtilities.trimEndWithMaxLength(s,100)}</devtools-link>`}#t(e,s){if(e.startsWith("#req-")){let i=ms.NetworkLog.NetworkLog.instance().requests().find(o=>o.requestId()===e.substring(5));return i?this.#i(i,i.url()):Pt`${s}`}if(e.startsWith("#file-")){let i=Dt.ContextSelectionAgent.ContextSelectionAgent.getUISourceCodes().find(o=>Dt.ContextSelectionAgent.ContextSelectionAgent.uiSourceCodeId.get(o)===Number(e.substring(6)));return i?this.#i(i,i.name()):Pt`${s}`}return null}templateForToken(e){if(e.type==="link"){let s=this.#t(e.href,e.text);if(s)return s}if(e.type==="code"){let s=e.text.split(`
`);s[0]?.trim()==="css"&&(e.lang="css",e.text=s.slice(1).join(`
`))}if(e.type==="codespan"){let s=e.text.match(/^\[(.*)\]\((.+)\)$/);if(s?.[2]){let i=this.#t(s[2],s[1]);if(i)return i}}return super.templateForToken(e)}};var{html:Ki}=ot.StaticHtml,{until:Ji}=ot.Directives,it=class extends K{mainFrameId;constructor(e=""){super(),this.mainFrameId=e}templateForToken(e){if(e.type==="link"&&e.href.startsWith("#")){let s=this.#i(e.href);if(s){let i=s.type==="path"?this.#s(s.path,e.text):this.#t(s.nodeId,e.text);return Ki`<span>${Ji(i.then(o=>o||e.text),e.text)}</span>`}}return super.templateForToken(e)}#i(e){if(e.startsWith("#path-"))return{type:"path",path:e.replace("#path-","")};if(e.startsWith("#1,HTML"))return{type:"path",path:e.slice(1)};let s="";if(e.startsWith("#node-")?s=e.replace("#node-",""):e.startsWith("#")&&(s=e.slice(1)),s.trim()!==""){let i=Number(s);if(Number.isInteger(i))return{type:"node",nodeId:i}}return null}async#t(e,s){if(e===void 0)return;let o=xe.TargetManager.TargetManager.instance().primaryPageTarget()?.model(xe.DOMModel.DOMModel);if(!o)return;let r=(await o.pushNodesByBackendIdsToFrontend(new Set([e])))?.get(e);return!r||r.frameId()!==this.mainFrameId?void 0:Ut.DOMLinkifier.Linkifier.instance().linkify(r,{textContent:s})}async#s(e,s){let o=xe.TargetManager.TargetManager.instance().primaryPageTarget()?.model(xe.DOMModel.DOMModel);if(!o)return;let a=await o.pushNodeByPathToFrontend(e);if(!a)return;let r=o.nodeForId(a);return r?Ut.DOMLinkifier.Linkifier.instance().linkify(r,{textContent:s}):void 0}};import"./../../ui/components/spinners/spinners.js";import*as kt from"./../../core/host/host.js";import*as ci from"./../../core/i18n/i18n.js";import*as di from"./../../core/root/root.js";import*as Zt from"./../../models/ai_assistance/ai_assistance.js";import"./../../ui/components/buttons/buttons.js";import*as gi from"./../../ui/legacy/legacy.js";import{Directives as Ho,html as Le,nothing as _o,render as Go}from"./../../ui/lit/lit.js";var Ss={};G(Ss,{PatchSuggestionState:()=>M,PatchWidget:()=>Fe,isAiAssistancePatchingEnabled:()=>fe});import"./../../ui/legacy/legacy.js";import"./../../ui/components/markdown_view/markdown_view.js";import"./../../ui/components/spinners/spinners.js";import"./../../ui/kit/kit.js";import*as ue from"./../../core/common/common.js";import*as Ne from"./../../core/host/host.js";import*as ws from"./../../core/i18n/i18n.js";import*as xs from"./../../core/platform/platform.js";import*as ct from"./../../core/root/root.js";import*as ze from"./../../models/ai_assistance/ai_assistance.js";import*as ee from"./../../models/persistence/persistence.js";import*as X from"./../../models/workspace/workspace.js";import*as zt from"./../../models/workspace_diff/workspace_diff.js";import"./../../ui/components/buttons/buttons.js";import*as Ce from"./../../ui/legacy/legacy.js";import{Directives as lt,html as P,nothing as me,render as Zi}from"./../../ui/lit/lit.js";import*as ke from"./../../ui/visual_logging/visual_logging.js";import*as ks from"./../changes/changes.js";import*as Cs from"./../common/common.js";import"./../../ui/kit/kit.js";import*as at from"./../../core/common/common.js";import*as vs from"./../../core/host/host.js";import*as ys from"./../../core/i18n/i18n.js";import*as Nt from"./../../core/root/root.js";import*as bs from"./../../models/geometry/geometry.js";import*as ie from"./../../models/persistence/persistence.js";import*as pe from"./../../models/workspace/workspace.js";import"./../../ui/components/buttons/buttons.js";import*as rt from"./../../ui/legacy/legacy.js";import{html as Ue,nothing as Ft,render as Yi}from"./../../ui/lit/lit.js";var fs=`@scope to (devtools-widget > *){:scope{width:100%;box-shadow:none}.dialog-header{margin:var(--sys-size-6) var(--sys-size-8) var(--sys-size-5);font:var(--sys-typescale-headline5)}.buttons{margin:var(--sys-size-6) var(--sys-size-8) var(--sys-size-8);display:flex;justify-content:flex-start;gap:var(--sys-size-5)}.main-content{color:var(--sys-color-on-surface-subtle);margin:0 var(--sys-size-8);line-height:18px}.add-folder-button{margin-left:auto}ul{list-style-type:none;padding:0;margin:var(--sys-size-6) 0 var(--sys-size-4) 0;max-height:var(--sys-size-20);overflow-y:auto}li{display:flex;align-items:center;color:var(--sys-color-on-surface-subtle);border-radius:0 var(--sys-shape-corner-full) var(--sys-shape-corner-full) 0;height:var(--sys-size-10);margin:0 var(--sys-size-8);padding-left:var(--sys-size-9)}li:hover, li.selected{background-color:var(--sys-color-state-hover-on-subtle)}li:focus{background-color:var(--app-color-navigation-drawer-background-selected)}.folder-icon{color:var(--icon-file-default);margin-right:var(--sys-size-4)}li.selected .folder-icon{color:var(--icon-file-authored)}.select-project-root{margin-bottom:var(--sys-size-6)}.theme-with-dark-background, :host-context(.theme-with-dark-background){li:focus{color:var(--app-color-navigation-drawer-label-selected);background-color:var(--app-color-navigation-drawer-background-selected);& .folder-icon{color:var(--app-color-navigation-drawer-label-selected)}}}.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
/*# sourceURL=${import.meta.resolve("././selectWorkspaceDialog.css")} */`;var W={selectFolder:"Select folder",selectFolderAccessibleLabel:"Select a folder to apply changes",cancel:"Cancel",select:"Select",addFolder:"Add folder",selectProjectRoot:"Source code from the selected folder is sent to Google. This data may be seen by human reviewers to improve this feature.",selectProjectRootNoLogging:"Source code from the selected folder is sent to Google. This data will not be used to improve Google\u2019s AI models. Your organization may change these settings at any time."},J=ys.i18n.lockedString,Qi=(t,e,s)=>{let i=t.folders.length>0;Yi(Ue`
      <style>${fs}</style>
      <h2 class="dialog-header">${J(W.selectFolder)}</h2>
      <div class="main-content">
        <div class="select-project-root">${t.selectProjectRootText}</div>
        ${t.showAutomaticWorkspaceNudge?Ue`
          <!-- Hardcoding, because there is no 'getFormatLocalizedString' equivalent for 'lockedString' -->
          <div>
            Tip: provide a
            <devtools-link
              class="devtools-link"
              href="https://goo.gle/devtools-automatic-workspace-folders"
              jslogcontext="automatic-workspaces-documentation"
            >com.chrome.devtools.json</devtools-link>
            file to automatically connect your project to DevTools.
          </div>
        `:Ft}
      </div>
      ${i?Ue`
        <ul role="listbox" aria-label=${J(W.selectFolder)}
          aria-activedescendant=${t.folders.length>0?`option-${t.selectedIndex}`:""}>
          ${t.folders.map((o,a)=>{let r=`option-${a}`;return Ue`
              <li
                id=${r}
                @mousedown=${()=>t.onProjectSelected(a)}
                @keydown=${t.onListItemKeyDown}
                class=${a===t.selectedIndex?"selected":""}
                aria-selected=${a===t.selectedIndex?"true":"false"}
                title=${o.path}
                role="option"
                tabindex=${a===t.selectedIndex?"0":"-1"}
              >
                <devtools-icon class="folder-icon" name="folder"></devtools-icon>
                <span class="ellipsis">${o.name}</span>
              </li>`})}
        </ul>
      `:Ft}
      <div class="buttons">
        <devtools-button
          title=${J(W.cancel)}
          aria-label="Cancel"
          .jslogContext=${"cancel"}
          @click=${t.onCancelButtonClick}
          .variant=${"outlined"}>${J(W.cancel)}</devtools-button>
        <devtools-button
          class="add-folder-button"
          title=${J(W.addFolder)}
          aria-label="Add folder"
          .iconName=${"plus"}
          .jslogContext=${"add-folder"}
          @click=${t.onAddFolderButtonClick}
          .variant=${i?"tonal":"primary"}>${J(W.addFolder)}</devtools-button>
        ${i?Ue`
          <devtools-button
            title=${J(W.select)}
            aria-label="Select"
            @click=${t.onSelectButtonClick}
            .jslogContext=${"select"}
            .variant=${"primary"}>${J(W.select)}</devtools-button>
        `:Ft}
      </div>
    `,s)},nt=class t extends rt.Widget.VBox{#i;#t=pe.Workspace.WorkspaceImpl.instance();#s=0;#a;#n;#r=ie.AutomaticFileSystemManager.AutomaticFileSystemManager.instance();#o=[];constructor(e,s){super(),this.#a=e.onProjectSelected,this.#n=e.dialog,this.#g(),e.currentProject&&(this.#s=Math.max(0,this.#o.findIndex(i=>i.project===e.currentProject))),this.#i=s??Qi,this.requestUpdate(),this.updateComplete.then(()=>{this.contentElement?.querySelector(".selected")?.focus()})}wasShown(){super.wasShown(),this.#t.addEventListener(pe.Workspace.Events.ProjectAdded,this.#d,this),this.#t.addEventListener(pe.Workspace.Events.ProjectRemoved,this.#c,this)}willHide(){super.willHide(),this.#t.removeEventListener(pe.Workspace.Events.ProjectAdded,this.#d,this),this.#t.removeEventListener(pe.Workspace.Events.ProjectRemoved,this.#c,this)}#p(e){switch(e.key){case"ArrowDown":{e.preventDefault(),this.#s=Math.min(this.#s+1,this.#o.length-1);let s=this.contentElement.querySelectorAll("li")[this.#s];s?.scrollIntoView({block:"nearest",inline:"nearest"}),s?.focus({preventScroll:!0}),this.requestUpdate();break}case"ArrowUp":{e.preventDefault(),this.#s=Math.max(this.#s-1,0);let s=this.contentElement.querySelectorAll("li")[this.#s];s?.scrollIntoView({block:"nearest",inline:"nearest"}),s?.focus({preventScroll:!0}),this.requestUpdate();break}case"Enter":e.preventDefault(),this.#e();break}}#e(){let e=this.#o[this.#s];e.project?(this.#n.hide(),this.#a(e.project)):this.#h()}performUpdate(){let e=Nt.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue!==Nt.Runtime.GenAiEnterprisePolicyValue.ALLOW_WITHOUT_LOGGING,s={folders:this.#o,selectedIndex:this.#s,selectProjectRootText:J(e?W.selectProjectRoot:W.selectProjectRootNoLogging),showAutomaticWorkspaceNudge:this.#r.automaticFileSystem===null&&this.#r.availability==="available",onProjectSelected:i=>{this.#s=i,this.requestUpdate()},onSelectButtonClick:this.#e.bind(this),onCancelButtonClick:()=>{this.#n.hide()},onAddFolderButtonClick:()=>{this.#m()},onListItemKeyDown:this.#p.bind(this)};this.#i(s,void 0,this.contentElement)}async#m(){await ie.IsolatedFileSystemManager.IsolatedFileSystemManager.instance().addFileSystem(),this.contentElement?.querySelector('[aria-label="Select"]')?.shadowRoot?.querySelector("button")?.focus()}async#h(){await this.#r.connectAutomaticFileSystem(!0)||this.#n.hide()}#g(){this.#o=[];let e=this.#r.automaticFileSystem;e&&this.#o.push({name:at.ParsedURL.ParsedURL.extractName(e.root),path:e.root,automaticFileSystem:e});let s=this.#t.projectsForType(pe.Workspace.projectTypes.FileSystem).filter(i=>i instanceof ie.FileSystemWorkspaceBinding.FileSystem&&i.fileSystem().type()===ie.PlatformFileSystem.PlatformFileSystemType.WORKSPACE_PROJECT);for(let i of s){if(e&&i===this.#t.projectForFileSystemRoot(e.root)){this.#o[0].project=i;continue}this.#o.push({name:at.ParsedURL.ParsedURL.encodedPathToRawPathString(i.displayName()),path:at.ParsedURL.ParsedURL.urlToRawPathString(i.id(),vs.Platform.isWin()),project:i})}}#d(e){let s=e.data,i=this.#r.automaticFileSystem;if(i&&s===this.#t.projectForFileSystemRoot(i.root)){this.#n.hide(),this.#a(s);return}this.#g();let o=this.#o.findIndex(a=>a.project===s);o!==-1&&(this.#s=o),this.requestUpdate(),this.updateComplete.then(()=>{this.contentElement?.querySelector(".selected")?.scrollIntoView()})}#c(){let e=this.#s>=0&&this.#s<this.#o.length?this.#o[this.#s].project:null;if(this.#g(),e){let s=this.#o.findIndex(i=>i.project===e);this.#s=s===-1?Math.min(this.#o.length-1,this.#s):s}else this.#s=0;this.requestUpdate()}static show(e,s){let i=new rt.Dialog.Dialog("select-workspace");i.setAriaLabel(W.selectFolderAccessibleLabel),i.setMaxContentSize(new bs.Size(384,340)),i.setSizeBehavior("SetExactWidthMaxHeight"),i.setDimmed(!0),new t({dialog:i,onProjectSelected:e,currentProject:s}).show(i.contentElement),i.show()}};var T={unsavedChanges:"Unsaved changes",applyingToWorkspace:"Applying to workspace\u2026",applyToWorkspace:"Apply to workspace",change:"Change",changeRootFolder:"Change project root folder",cancel:"Cancel",discard:"Discard",saveAll:"Save all",savedToDisk:"Saved to disk",codeDisclaimer:"Use code snippets with caution",applyToWorkspaceTooltip:"Source code from the selected folder is sent to Google to generate code suggestions.",applyToWorkspaceTooltipNoLogging:"Source code from the selected folder is sent to Google to generate code suggestions. This data will not be used to improve Google\u2019s AI models.",learnMore:"Learn more",freDisclaimerHeader:"Apply changes directly to your project\u2019s source code",freDisclaimerTextAiWontAlwaysGetItRight:"This feature uses AI and won\u2019t always get it right",freDisclaimerTextPrivacy:"To generate code suggestions, source code from the selected folder is sent to Google. This data may be seen by human reviewers to improve this feature.",freDisclaimerTextPrivacyNoLogging:"To generate code suggestions, source code from the selected folder is sent to Google. This data will not be used to improve Google\u2019s AI models. Your organization may change these settings at any time.",freDisclaimerTextUseWithCaution:"Use generated code snippets with caution",viewUploadedFiles:"View data sent to Google",opensInNewTab:"(opens in a new tab)",genericErrorMessage:"Changes couldn\u2019t be applied to your workspace."},A=ws.i18n.lockedString,Xi="https://support.google.com/legal/answer/13505487",{widget:eo}=Ce.Widget,M;(function(t){t.INITIAL="initial",t.LOADING="loading",t.SUCCESS="success",t.ERROR="error"})(M||(M={}));var oe;(function(t){t.NONE="none",t.REGULAR="regular",t.AUTOMATIC_DISCONNECTED="automaticDisconnected",t.AUTOMATIC_CONNECTED="automaticConnected"})(oe||(oe={}));var to=(t,e,s)=>{if(!t.changeSummary&&t.patchSuggestionState===M.INITIAL)return;e.changeRef=e.changeRef??lt.createRef(),e.summaryRef=e.summaryRef??lt.createRef();function i(){return t.sources?P`<devtools-link
          class="link"
          title="${T.viewUploadedFiles} ${T.opensInNewTab}"
          href="data:text/plain;charset=utf-8,${encodeURIComponent(t.sources)}"
          jslogcontext="files-used-in-patching">
          ${T.viewUploadedFiles}
        </devtools-link>`:me}function o(){return t.savedToDisk?P`
            <devtools-icon class="green-bright-icon summary-badge" name="check-circle"></devtools-icon>
            <span class="header-text">
              ${A(T.savedToDisk)}
            </span>
          `:t.patchSuggestionState===M.SUCCESS?P`
            <devtools-icon class="on-tonal-icon summary-badge" name="difference"></devtools-icon>
            <span class="header-text">
              ${A(`File changes in ${t.projectName}`)}
            </span>
            <devtools-icon
              class="arrow"
              name="chevron-down"
            ></devtools-icon>
          `:P`
          <devtools-icon class="on-tonal-icon summary-badge" name="pen-spark"></devtools-icon>
          <span class="header-text">
            ${A(T.unsavedChanges)}
          </span>
          <devtools-icon
            class="arrow"
            name="chevron-down"
          ></devtools-icon>
        `}function a(){return!t.changeSummary&&t.patchSuggestionState===M.INITIAL||t.savedToDisk?me:t.patchSuggestionState===M.SUCCESS?P`${eo(ks.CombinedDiffView.CombinedDiffView,{workspaceDiff:t.workspaceDiff,ignoredUrls:["inspector://"]})}`:P`<devtools-code-block
          .code=${t.changeSummary??""}
          .codeLang=${"css"}
          .displayNotice=${!0}
        ></devtools-code-block>
        ${t.patchSuggestionState===M.ERROR?P`<div class="error-container">
              <devtools-icon name="cross-circle-filled"></devtools-icon>${A(T.genericErrorMessage)} ${i()}
            </div>`:me}`}function r(){if(t.savedToDisk)return me;if(t.patchSuggestionState===M.SUCCESS)return P`
          <div class="footer">
            <div class="left-side">
              <devtools-link class="link disclaimer-link" href="https://support.google.com/legal/answer/13505487" jslogcontext="code-disclaimer">
                ${A(T.codeDisclaimer)}
              </devtools-link>
              ${i()}
            </div>
            <div class="save-or-discard-buttons">
              <devtools-button
                @click=${t.onDiscard}
                .jslogContext=${"patch-widget.discard"}
                .variant=${"outlined"}>
                  ${A(T.discard)}
              </devtools-button>
              <devtools-button
                @click=${t.onSaveAll}
                .jslogContext=${"patch-widget.save-all"}
                .variant=${"primary"}>
                  ${A(T.saveAll)}
              </devtools-button>
            </div>
          </div>
          `;let n=t.projectType===oe.AUTOMATIC_DISCONNECTED?"folder-off":t.projectType===oe.AUTOMATIC_CONNECTED?"folder-asterisk":"folder";return P`
        <div class="footer">
          ${t.projectName?P`
            <div class="change-workspace" jslog=${ke.section("patch-widget.workspace")}>
                <devtools-icon .name=${n}></devtools-icon>
                <span class="folder-name" title=${t.projectPath}>${t.projectName}</span>
              ${t.onChangeWorkspaceClick?P`
                <devtools-button
                  @click=${t.onChangeWorkspaceClick}
                  .jslogContext=${"change-workspace"}
                  .variant=${"text"}
                  .title=${A(T.changeRootFolder)}
                  .disabled=${t.patchSuggestionState===M.LOADING}
                  ${lt.ref(e.changeRef)}
                >${A(T.change)}</devtools-button>
              `:me}
            </div>
          `:me}
          <div class="apply-to-workspace-container" aria-live="polite">
            ${t.patchSuggestionState===M.LOADING?P`
              <div class="loading-text-container" jslog=${ke.section("patch-widget.apply-to-workspace-loading")}>
                <devtools-spinner></devtools-spinner>
                <span>
                  ${A(T.applyingToWorkspace)}
                </span>
              </div>
            `:P`
                <devtools-button
                @click=${t.onApplyToWorkspace}
                .jslogContext=${"patch-widget.apply-to-workspace"}
                .variant=${"outlined"}>
                ${A(T.applyToWorkspace)}
              </devtools-button>
            `}
            ${t.patchSuggestionState===M.LOADING?P`<devtools-button
              @click=${t.onCancel}
              .jslogContext=${"cancel"}
              .variant=${"outlined"}>
              ${A(T.cancel)}
            </devtools-button>`:me}
            <devtools-button
              aria-details="info-tooltip"
              .jslogContext=${"patch-widget.info-tooltip-trigger"}
              .iconName=${"info"}
              .variant=${"icon"}
            ></devtools-button>
            <devtools-tooltip
                id="info-tooltip"
                variant="rich"
              >
             <div class="info-tooltip-container">
               ${t.applyToWorkspaceTooltipText}
               <button
                 class="link tooltip-link"
                 role="link"
                 jslog=${ke.link("open-ai-settings").track({click:!0})}
                 @click=${t.onLearnMoreTooltipClick}
               >${A(T.learnMore)}</button>
             </div>
            </devtools-tooltip>
          </div>
        </div>`}let p=t.savedToDisk?P`
          <div class="change-summary saved-to-disk" role="status" aria-live="polite">
            <div class="header-container">
             ${o()}
             </div>
          </div>`:P`
          <details class="change-summary" jslog=${ke.section("patch-widget")}>
            <summary class="header-container" ${lt.ref(e.summaryRef)}>
              ${o()}
            </summary>
            ${a()}
            ${r()}
          </details>
        `;Zi(p,s)},Fe=class extends Ce.Widget.Widget{changeSummary="";changeManager;#i=ue.Settings.Settings.instance().createSetting("ai-assistance-patching-fre-completed",!1);#t=ue.Settings.Settings.instance().createSetting("ai-assistance-patching-selected-project-id","");#s;#a={};#n;#r;#o;#p;#e;#m;#h=M.INITIAL;#g=zt.WorkspaceDiff.workspaceDiff();#d=X.Workspace.WorkspaceImpl.instance();#c=ee.AutomaticFileSystemManager.AutomaticFileSystemManager.instance().automaticFileSystem;#u=!1;#f=null;constructor(e,s=to,i){super(e),this.#n=i?.aidaClient??new Ne.AidaClient.AidaClient,this.#m=ct.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue!==ct.Runtime.GenAiEnterprisePolicyValue.ALLOW_WITHOUT_LOGGING,this.#s=s,this.requestUpdate()}#b(){Ce.ViewManager.ViewManager.instance().showView("chrome-ai")}#v(){return this.#o?{projectName:ue.ParsedURL.ParsedURL.encodedPathToRawPathString(this.#o.displayName()),projectPath:ue.ParsedURL.ParsedURL.urlToRawPathString(this.#o.id(),Ne.Platform.isWin())}:this.#c?{projectName:ue.ParsedURL.ParsedURL.extractName(this.#c.root),projectPath:this.#c.root}:{projectName:"",projectPath:xs.DevToolsPath.EmptyRawPathString}}#w(){let e=this.#c?this.#d.projectForFileSystemRoot(this.#c.root):null;return this.#d.projectsForType(X.Workspace.projectTypes.FileSystem).filter(i=>i instanceof ee.FileSystemWorkspaceBinding.FileSystem&&i.fileSystem().type()===ee.PlatformFileSystem.PlatformFileSystemType.WORKSPACE_PROJECT).filter(i=>i!==e).length>0}#C(e){return this.#c&&this.#c.root===e?this.#o?oe.AUTOMATIC_CONNECTED:oe.AUTOMATIC_DISCONNECTED:this.#o?oe.NONE:oe.REGULAR}performUpdate(){let{projectName:e,projectPath:s}=this.#v();this.#s({workspaceDiff:this.#g,changeSummary:this.changeSummary,patchSuggestionState:this.#h,sources:this.#p,projectName:e,projectPath:s,projectType:this.#C(s),savedToDisk:this.#e,applyToWorkspaceTooltipText:this.#m?A(T.applyToWorkspaceTooltip):A(T.applyToWorkspaceTooltipNoLogging),onLearnMoreTooltipClick:this.#b.bind(this),onApplyToWorkspace:this.#U.bind(this),onCancel:()=>{this.#r?.abort()},onDiscard:this.#T.bind(this),onSaveAll:this.#A.bind(this),onChangeWorkspaceClick:this.#w()?this.#S.bind(this,{applyPatch:!1}):void 0},this.#a,this.contentElement)}wasShown(){super.wasShown(),this.#M(),fe()&&(this.#d.addEventListener(X.Workspace.Events.ProjectAdded,this.#R,this),this.#d.addEventListener(X.Workspace.Events.ProjectRemoved,this.#E,this))}willHide(){super.willHide(),this.#u=!1,fe()&&(this.#d.removeEventListener(X.Workspace.Events.ProjectAdded,this.#R,this),this.#d.removeEventListener(X.Workspace.Events.ProjectRemoved,this.#E,this))}async#l(){if(this.#i.get())return!0;let s=ze.AiUtils.getIconName(),i=await Cs.FreDialog.show({header:{iconName:s,text:A(T.freDisclaimerHeader)},reminderItems:[{iconName:"psychiatry",content:A(T.freDisclaimerTextAiWontAlwaysGetItRight)},{iconName:"google",content:this.#m?A(T.freDisclaimerTextPrivacy):A(T.freDisclaimerTextPrivacyNoLogging)},{iconName:"warning",content:P`<devtools-link
            href=${Xi}
            class="link devtools-link"
            jslogcontext="code-snippets-explainer.patch-widget"
          >${A(T.freDisclaimerTextUseWithCaution)}</devtools-link>`}],onLearnMoreClick:()=>{Ce.ViewManager.ViewManager.instance().showView("chrome-ai")},ariaLabel:A(T.freDisclaimerHeader),learnMoreButtonText:A(T.learnMore)});return i&&this.#i.set(!0),i}#M(){let e=this.#c?this.#d.projectForFileSystemRoot(this.#c.root):this.#d.project(this.#t.get());e?this.#o=e:(this.#o=void 0,this.#t.set("")),this.requestUpdate()}#R(e){let s=e.data;this.#u&&this.#c&&s===this.#d.projectForFileSystemRoot(this.#c.root)?(this.#u=!1,this.#o=s,this.#k()):this.#o===void 0&&this.#M()}#E(){this.#o&&!this.#d.project(this.#o.id())&&(this.#t.set(""),this.#o=void 0,this.requestUpdate())}#S(e={applyPatch:!1}){let s=i=>{this.#o=i,this.#t.set(i.id()),e.applyPatch?this.#k():(this.requestUpdate(),this.updateComplete.then(()=>{this.contentElement?.querySelector(".apply-to-workspace-container devtools-button")?.shadowRoot?.querySelector("button")?.focus()}))};nt.show(s,this.#o)}async#U(){!fe()||!await this.#l()||(this.#o?await this.#k():this.#c?(this.#u=!0,await ee.AutomaticFileSystemManager.AutomaticFileSystemManager.instance().connectAutomaticFileSystem(!0)):this.#S({applyPatch:!0}))}get#I(){return this.#g.modifiedUISourceCodes().filter(e=>!e.url().startsWith("inspector://"))}async#k(){let e=this.changeSummary;if(!e)throw new Error("Change summary does not exist");this.#h=M.LOADING,this.#f=null,this.requestUpdate();let{response:s,processedFiles:i}=await this.#L(e);s&&"rpcId"in s&&s.rpcId&&(this.#f=s.rpcId);let o=this.#I.length>0;s?.type==="answer"&&o?this.#h=M.SUCCESS:s?.type==="error"&&s.error==="abort"?this.#h=M.INITIAL:this.#h=M.ERROR,this.#p=`Filenames in ${this.#o?.displayName()}.
Files:
${i.map(a=>`* ${a}`).join(`
`)}`,this.requestUpdate(),this.#h===M.SUCCESS&&this.updateComplete.then(()=>{this.#a.summaryRef?.value?.focus()})}#T(){for(let e of this.#I)e.resetWorkingCopy();this.#h=M.INITIAL,this.#p=void 0,this.changeManager?.popStashedChanges(),this.#x("NEGATIVE"),this.requestUpdate(),this.updateComplete.then(()=>{this.#a.changeRef?.value?.focus()})}#A(){for(let e of this.#I)e.commitWorkingCopy();this.changeManager?.stashChanges().then(()=>{this.changeManager?.dropStashedChanges()}),this.#e=!0,this.#x("POSITIVE"),this.requestUpdate()}#x(e){this.#f&&this.#n.registerClientEvent({corresponding_aida_rpc_global_id:this.#f,disable_user_content_logging:!0,do_conversation_client_event:{user_feedback:{sentiment:e}}})}async#L(e){if(!this.#o)throw new Error("Project does not exist");this.#r=new AbortController;let s=new ze.PatchAgent.PatchAgent({aidaClient:this.#n,serverSideLoggingEnabled:!1,project:this.#o}),{responses:i,processedFiles:o}=await s.applyChanges(e,{signal:this.#r.signal});return{response:i.at(-1),processedFiles:o}}};function fe(){return!!ct.Runtime.hostConfig.devToolsFreestyler?.patching}window.aiAssistanceTestPatchPrompt=async(t,e,s)=>{if(!fe())return;let i=zt.WorkspaceDiff.workspaceDiff(),a=X.Workspace.WorkspaceImpl.instance().projectsForType(X.Workspace.projectTypes.FileSystem).filter(n=>n instanceof ee.FileSystemWorkspaceBinding.FileSystem&&n.fileSystem().type()===ee.PlatformFileSystem.PlatformFileSystemType.WORKSPACE_PROJECT).find(n=>n.displayName()===t);if(!a)throw new Error("project not found");let r=new Ne.AidaClient.AidaClient,p=new ze.PatchAgent.PatchAgent({aidaClient:r,serverSideLoggingEnabled:!1,project:a});try{let n=[],{processedFiles:u,responses:v}=await p.applyChanges(e);if(v.at(-1)?.type==="error")return{error:"failed to patch",debugInfo:{responses:v,processedFiles:u}};for(let U of u){let ge=s.find(he=>he.path===U);if(!ge){n.push(`Patched ${U} that was not expected`);break}let De=await p.agentProject.readFile(U);if(!De)throw new Error(`${U} has no content`);for(let he of ge.matches)De.match(new RegExp(he,"gm"))||n.push({message:`Did not match ${he} in ${U}`,file:U,content:De});for(let he of ge.doesNotMatch||[])De.match(new RegExp(he,"gm"))&&n.push({message:`Unexpectedly matched ${he} in ${U}`,file:U,content:De})}return{assertionFailures:n,debugInfo:{responses:v,processedFiles:u}}}finally{i.modifiedUISourceCodes().forEach(n=>{n.resetWorkingCopy()})}};var Rs={};G(Rs,{ChatInput:()=>Se,DEFAULT_VIEW:()=>Ms});import"./../../ui/components/tooltips/tooltips.js";import*as gt from"./../../core/i18n/i18n.js";import*as V from"./../../core/sdk/sdk.js";import*as E from"./../../models/ai_assistance/ai_assistance.js";import*as Ls from"./../common/common.js";import*as jt from"./../utils/utils.js";import"./../../ui/components/buttons/buttons.js";import*as $s from"./../../ui/components/input/input.js";import*as Ot from"./../../ui/components/snackbars/snackbars.js";import*as ae from"./../../ui/legacy/legacy.js";import*as D from"./../../ui/lit/lit.js";import*as ne from"./../../ui/visual_logging/visual_logging.js";var Ts=`*{box-sizing:border-box;margin:0;padding:0}:host{display:flex;flex-direction:column}.input-form{display:flex;flex-direction:column;padding:0 var(--sys-size-5) var(--sys-size-5) var(--sys-size-5);max-width:var(--sys-size-36);background-color:var(--sys-color-cdt-base-container);width:100%}.chat-readonly-container{display:flex;width:100%;max-width:var(--sys-size-36);justify-content:center;align-items:center;background-color:var(--sys-color-surface3);font:var(--sys-typescale-body4-regular);padding:var(--sys-size-5) 0;border-radius:var(--sys-shape-corner-medium-small);margin-bottom:var(--sys-size-5);color:var(--sys-color-on-surface-subtle)}.chat-input-container{width:100%;display:flex;position:relative;flex-direction:column;border:1px solid var(--sys-color-neutral-outline);border-radius:var(--sys-shape-corner-small);&:focus-within{outline:1px solid var(--sys-color-primary);border-color:var(--sys-color-primary)}&.disabled{background-color:var(--sys-color-state-disabled-container);border-color:transparent;& .chat-input-disclaimer{border-color:var(--sys-color-state-disabled)}}&.single-line-layout{flex-direction:row;justify-content:space-between;.chat-input{flex-shrink:1;padding:var(--sys-size-4)}.chat-input-actions{flex-shrink:0;padding-block:0;align-items:flex-end;padding-bottom:var(--sys-size-1)}}& .image-input-container{margin:var(--sys-size-3) var(--sys-size-4) 0;max-width:100%;width:fit-content;position:relative;devtools-button{position:absolute;top:calc(-1 * var(--sys-size-2));right:calc(-1 * var(--sys-size-3));border-radius:var(--sys-shape-corner-full);border:1px solid var(--sys-color-neutral-outline);background-color:var(--sys-color-cdt-base-container)}img{max-height:var(--sys-size-18);max-width:100%;border:1px solid var(--sys-color-neutral-outline);border-radius:var(--sys-shape-corner-small)}.loading{margin:var(--sys-size-4) 0;display:inline-flex;justify-content:center;align-items:center;height:var(--sys-size-18);width:var(--sys-size-19);background-color:var(--sys-color-surface3);border-radius:var(--sys-shape-corner-small);border:1px solid var(--sys-color-neutral-outline);devtools-spinner{color:var(--sys-color-state-disabled)}}}& .chat-input-disclaimer-container{display:flex;align-items:center;padding-right:var(--sys-size-3);flex-shrink:0}& .chat-input-disclaimer{display:flex;justify-content:center;align-items:center;font:var(--sys-typescale-body5-regular);border-right:1px solid var(--sys-color-divider);padding-right:8px;&.hide-divider{border-right:none}}@container --chat-ui-container (width < 400px){& .chat-input-disclaimer-container{display:none}}}.chat-input{scrollbar-width:none;field-sizing:content;resize:none;width:100%;max-height:84px;border:0;border-radius:var(--sys-shape-corner-small);font:var(--sys-typescale-body4-regular);line-height:18px;min-height:var(--sys-size-11);color:var(--sys-color-on-surface);background-color:var(--sys-color-cdt-base-container);padding:var(--sys-size-4) var(--sys-size-4) var(--sys-size-3) var(--sys-size-4);&::placeholder{opacity:60%}&:focus-visible{outline:0}&:disabled{color:var(--sys-color-state-disabled);background-color:transparent;border-color:transparent;&::placeholder{color:var(--sys-color-on-surface-subtle);opacity:100%}}}.chat-input-actions{display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding-left:var(--sys-size-4);padding-right:var(--sys-size-2);gap:var(--sys-size-6);padding-bottom:var(--sys-size-2);& .chat-input-actions-left{flex:1 1 0;min-width:0}& .chat-input-actions-right{flex-shrink:0;display:flex;& .start-new-chat-button{padding-bottom:var(--sys-size-2);padding-right:var(--sys-size-3)}}}.chat-inline-button{padding-left:3px}.select-element{display:flex;gap:var(--sys-size-3);align-items:center;.resource-link{display:flex;background-color:var(--sys-color-cdt-base-container);align-items:center;cursor:pointer;padding:var(--sys-size-2) var(--sys-size-3);font:var(--sys-typescale-body5-regular);border:var(--sys-size-1) solid var(--sys-color-divider);border-radius:var(--sys-shape-corner-extra-small);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;line-height:1;& .title{vertical-align:middle;padding-right:var(--sys-size-2);font:var(--sys-typescale-body5-regular);overflow:hidden;text-overflow:ellipsis}& .remove-context,
    & .add-context{vertical-align:middle}&:focus-visible{outline:2px solid var(--sys-color-state-focus-ring)}devtools-icon,
    devtools-file-source-icon{display:inline-flex;vertical-align:middle;min-width:var(--sys-size-7);min-height:var(--sys-size-7)}&.disabled{border-style:dashed;border-color:var(--sys-color-neutral-outline);color:var(--sys-color-on-surface-light);devtools-icon,
      devtools-file-source-icon{--override-file-source-icon-color:var(
          --sys-color-on-surface-light-graphics
        );color:var(--sys-color-on-surface-light-graphics)!important}.title{color:var(--sys-color-on-surface-light);font-style:italic}}.network-override-marker{position:relative;float:left}.network-override-marker::before{content:var(--image-file-empty);width:var(--sys-size-4);height:var(--sys-size-4);border-radius:50%;outline:var(--sys-size-1) solid var(--icon-gap-focus-selected);left:11px;position:absolute;top:13px;z-index:1;background-color:var(--sys-color-purple-bright)}.image.icon{display:inline-flex;justify-content:center;align-items:center;vertical-align:middle;margin-right:var(--sys-size-3);img{max-width:var(--sys-size-7);max-height:var(--sys-size-7)}}}}.link{color:var(--text-link);text-decoration:underline;cursor:pointer}button.link{border:none;background:none;font:inherit;&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:0;border-radius:var(--sys-shape-corner-extra-small)}}.floaty{font:var(--sys-typescale-body4);color:var(--sys-color-on-surface);user-select:none;padding:0;margin:0;list-style-type:none;display:flex;flex-flow:row wrap;align-items:flex-end;gap:var(--sys-size-2);margin-bottom:var(--sys-size-2);li{background:var(--sys-color-surface3);border-radius:var(--sys-shape-corner-small);border:1px solid var(--sys-color-neutral-outline);padding:var(--sys-size-2) var(--sys-size-3);display:flex;flex-direction:row;align-items:center;gap:var(--sys-size-2);min-height:var(--sys-size-8)}.context-item{display:flex;flex-direction:row;align-items:center;gap:var(--sys-size-2)}.open-floaty{padding:0;border:none;margin-bottom:1px}}.chat-input-footer{display:flex;justify-content:center;padding-block:var(--sys-size-3);font:var(--sys-typescale-body5-regular);border-top:1px solid var(--sys-color-divider);text-wrap:balance;text-align:center;width:100%;&:not(.is-read-only){display:none;border:none;@container --chat-ui-container (width < 400px){display:flex}}}
/*# sourceURL=${import.meta.resolve("././components/chatInput.css")} */`;var{html:$,Directives:{createRef:so,ref:io}}=D,{widget:oo}=ae.Widget,je={inputTextAriaDescription:"You can also use one of the suggested prompts above to start your conversation",revealContextDescription:"Reveal the selected context item in DevTools",learnAbout:"Learn about AI in DevTools"},S={sendButtonTitle:"Send",startNewChat:"Start new chat",cancelButtonTitle:"Cancel",selectAnElement:"Select an element",takeScreenshotButtonTitle:"Take screenshot",removeImageInputButtonTitle:"Remove image input",addImageButtonTitle:"Add image",pastConversation:"You're viewing a past conversation.",screenshotFailureMessage:"Failed to take a screenshot. Please try again.",uploadImageFailureMessage:"Failed to upload image. Please try again.",addContext:"Add item for context",removeContextElement:"Remove element from context",removeContextRequest:"Remove request from context",removeContextFile:"Remove file from context",removeContextPerfInsight:"Remove performance insight from context",removeContext:"Remove from context"},ao=gt.i18n.registerUIStrings("panels/ai_assistance/components/ChatInput.ts",je),dt=gt.i18n.getLocalizedString.bind(void 0,ao),k=gt.i18n.lockedString,no=80,ro="image/jpeg",As=100,lo="relevant-data-link-chat",co="relevant-data-link-footer";function Is(t){return t instanceof E.FileAgent.FileContext?k(S.removeContextFile):t instanceof E.StylingAgent.NodeContext?k(S.removeContextElement):t instanceof E.NetworkAgent.RequestContext?k(S.removeContextRequest):t instanceof E.PerformanceAgent.PerformanceTraceContext?k(S.removeContextPerfInsight):k(S.removeContext)}var Ms=(t,e,s)=>{let i=D.Directives.classMap({"chat-input-container":!0,"single-line-layout":!t.context,disabled:t.isTextInputDisabled}),o=a=>{let r=D.Directives.classMap({"chat-input-disclaimer":!0,"hide-divider":!t.isLoading&&t.blockedByCrossOrigin});return $`
      <div class=${r}>
        <button
          class="link"
          role="link"
          aria-details=${a}
          jslog=${ne.link("open-ai-settings").track({click:!0})}
          @click=${p=>{p.preventDefault(),ae.ViewManager.ViewManager.instance().showView("chrome-ai")}}
        >${k("Relevant data")}</button>&nbsp;${k("is sent to Google")}
        <devtools-tooltip
          id=${a}
          variant="rich"
        ><div class="info-tooltip-container">
          ${t.disclaimerText}
          <button
            class="link tooltip-link"
            role="link"
            jslog=${ne.link("open-ai-settings").track({click:!0})}
            @click=${()=>{ae.ViewManager.ViewManager.instance().showView("chrome-ai")}}>${dt(je.learnAbout)}
          </button>
        </div></devtools-tooltip>
      </div>
    `};D.render($`
    <style>${$s.textInputStyles}</style>
    <style>${Ts}</style>
    ${t.isReadOnly?$`
        <div
          class="chat-readonly-container"
          jslog=${ne.section("read-only")}
        >
          <span>${k(S.pastConversation)}</span>
          <devtools-button
            aria-label=${k(S.startNewChat)}
            class="chat-inline-button"
            @click=${t.onNewConversation}
            .data=${{variant:"text",title:k(S.startNewChat),jslogContext:"start-new-chat"}}
          >${k(S.startNewChat)}</devtools-button>
        </div>`:$`
        <form class="input-form" @submit=${t.onSubmit}>
          <div class=${i}>
            ${t.multimodalInputEnabled&&t.imageInput&&!t.isTextInputDisabled?$`
                <div class="image-input-container">
                  <devtools-button
                    aria-label=${k(S.removeImageInputButtonTitle)}
                    @click=${t.onRemoveImageInput}
                    .data=${{variant:"icon",size:"MICRO",iconName:"cross",title:k(S.removeImageInputButtonTitle)}}
                  ></devtools-button>
                  ${t.imageInput.isLoading?$`
                      <div class="loading">
                        <devtools-spinner></devtools-spinner>
                      </div>`:$`
                      <img src="data:${t.imageInput.mimeType};base64, ${t.imageInput.data}" alt="Image input" />`}
                </div>`:D.nothing}
            <textarea
              class="chat-input"
              .disabled=${t.isTextInputDisabled}
              wrap="hard"
              maxlength="10000"
              @keydown=${t.onTextAreaKeyDown}
              @paste=${t.onImagePaste}
              @dragover=${t.onImageDragOver}
              @drop=${t.onImageDrop}
              @input=${a=>{t.onTextInputChange(a.target.value)}}
              placeholder=${t.inputPlaceholder}
              jslog=${ne.textField("query").track({change:!0,keydown:"Enter"})}
              aria-description=${dt(je.inputTextAriaDescription)}
              ${io(t.textAreaRef)}
            ></textarea>
            <div class="chat-input-actions">
              <div class="chat-input-actions-left">
                ${t.context?$`
                    <div class="select-element">
                      ${t.conversationType==="freestyler"?$`
                          <devtools-button
                            .data=${{variant:"icon_toggle",size:"SMALL",iconName:"select-element",toggledIconName:"select-element",toggleType:"primary-toggle",toggled:t.inspectElementToggled,title:k(S.selectAnElement),jslogContext:"select-element",disabled:t.isTextInputDisabled}}
                            @click=${t.onInspectElementClick}
                          ></devtools-button>`:D.nothing}
                      <div
                        class=${D.Directives.classMap({"resource-link":!0,disabled:!t.isContextSelected})}
                      >
                        ${t.context instanceof E.StylingAgent.NodeContext?$`
                              <devtools-widget
                                class="title"
                                ${oo(Ls.DOMLinkifier.DOMNodeLink,{node:t.context.getItem(),options:{disabled:!t.isContextSelected,hiddenClassList:t.context.getItem().classNames().filter(a=>a.startsWith(E.Injected.AI_ASSISTANCE_CSS_CLASS_NAME)),ariaDescription:dt(je.revealContextDescription)}})}
                              ></devtools-widget>`:$`
                          ${t.context instanceof E.NetworkAgent.RequestContext?jt.PanelUtils.getIconForNetworkRequest(t.context.getItem()):t.context instanceof E.FileAgent.FileContext?jt.PanelUtils.getIconForSourceFile(t.context.getItem()):t.context instanceof E.AccessibilityAgent.AccessibilityContext?$`<devtools-icon class="icon" name="performance" title="Lighthouse"></devtools-icon>`:t.context instanceof E.PerformanceAgent.PerformanceTraceContext?$`<devtools-icon class="icon" name="performance" title="Performance"></devtools-icon>`:D.nothing}
                            <span
                              role="button"
                              class="title"
                              tabindex="0"
                              @click=${t.onContextClick}
                              @keydown=${a=>{(a.key==="Enter"||a.key===" ")&&t.onContextClick()}}
                              aria-description=${dt(je.revealContextDescription)}
                            >${t.context.getTitle()}</span>`}
                        ${t.isContextSelected&&t.onContextRemoved?$`
                                  <devtools-button
                                    title=${Is(t.context)}
                                    aria-label=${Is(t.context)}
                                    class="remove-context"
                                    .iconName=${"cross"}
                                    .size=${"MICRO"}
                                    .jslogContext=${"context-removed"}
                                    .variant=${"icon"}
                                    @click=${t.onContextRemoved}></devtools-button>`:D.nothing}
                      ${!t.isContextSelected&&t.onContextAdd?$`
                                    <devtools-button
                                      title=${k(S.addContext)}
                                      aria-label=${k(S.addContext)}
                                      class="add-context"
                                      .iconName=${"plus"}
                                      .size=${"MICRO"}
                                      .jslogContext=${"context-added"}
                                      .variant=${"icon"}
                                      @click=${t.onContextAdd}></devtools-button>`:D.nothing}
                      </div>
                    </div>`:D.nothing}
              </div>
              <div class="chat-input-actions-right">
                <div class="chat-input-disclaimer-container">
                  ${o(lo)}
                </div>
                ${t.multimodalInputEnabled&&!t.blockedByCrossOrigin?$`
                    ${t.uploadImageInputEnabled?$`
                        <devtools-button
                          class="chat-input-button"
                          aria-label=${k(S.addImageButtonTitle)}
                          @click=${t.onImageUpload}
                          .data=${{variant:"icon",size:"REGULAR",disabled:t.isTextInputDisabled||t.imageInput?.isLoading,iconName:"add-photo",title:k(S.addImageButtonTitle),jslogContext:"upload-image"}}
                        ></devtools-button>`:D.nothing}
                    <devtools-button
                      class="chat-input-button"
                      aria-label=${k(S.takeScreenshotButtonTitle)}
                      @click=${t.onTakeScreenshot}
                      .data=${{variant:"icon",size:"REGULAR",disabled:t.isTextInputDisabled||t.imageInput?.isLoading,iconName:"photo-camera",title:k(S.takeScreenshotButtonTitle),jslogContext:"take-screenshot"}}
                    ></devtools-button>`:D.nothing}
                ${t.isLoading?$`
                    <devtools-button
                      class="chat-input-button"
                      aria-label=${k(S.cancelButtonTitle)}
                      @click=${t.onCancel}
                      .data=${{variant:"icon",size:"REGULAR",iconName:"record-stop",title:k(S.cancelButtonTitle),jslogContext:"stop"}}
                    ></devtools-button>`:t.blockedByCrossOrigin?$`
                      <devtools-button
                        class="start-new-chat-button"
                        aria-label=${k(S.startNewChat)}
                        @click=${t.onNewConversation}
                        .data=${{variant:"outlined",size:"SMALL",title:k(S.startNewChat),jslogContext:"start-new-chat"}}
                      >${k(S.startNewChat)}</devtools-button>`:$`
                      <devtools-button
                        class="chat-input-button"
                        aria-label=${k(S.sendButtonTitle)}
                        .data=${{type:"submit",variant:"icon",size:"REGULAR",disabled:t.isTextInputDisabled||t.isTextInputEmpty||t.imageInput?.isLoading,iconName:"send",title:k(S.sendButtonTitle),jslogContext:"send"}}
                      ></devtools-button>`}
              </div>
            </div>
          </div>
        </form>`}
    <footer
      class=${D.Directives.classMap({"chat-input-footer":!0,"is-read-only":t.isReadOnly})}
      jslog=${ne.section("footer")}
    >
      ${o(co)}
    </footer>
  `,s)},Se=class extends ae.Widget.Widget{isLoading=!1;blockedByCrossOrigin=!1;isTextInputDisabled=!1;inputPlaceholder="";context=null;isContextSelected=!1;inspectElementToggled=!1;disclaimerText="";conversationType="freestyler";multimodalInputEnabled=!1;uploadImageInputEnabled=!1;isReadOnly=!1;#i=so();#t;#s=-1;#a="";setInputValue(e){this.#i.value&&(this.#i.value.value=e,this.#i.value.setSelectionRange(e.length,e.length)),this.performUpdate()}#n(){return!this.#i.value?.value?.trim()}onTextSubmit=()=>{};onContextClick=()=>{};onInspectElementClick=()=>{};onCancelClick=()=>{};onNewConversation=()=>{};onContextRemoved=null;onContextAdd=null;#r(e){let s=E.AiHistoryStorage.AiHistoryStorage.instance().getRecentPrompts();s.length&&(e===-1?(this.#s===-1&&(this.#a=this.#i.value?.value||""),this.#s<s.length-1&&(this.#s++,this.setInputValue(s[this.#s]))):this.#s>0?(this.#s--,this.setInputValue(s[this.#s])):this.#s===0&&(this.#s=-1,this.setInputValue(this.#a)))}async#o(){let e=V.TargetManager.TargetManager.instance().primaryPageTarget();if(!e)throw new Error("Could not find main target");let s=e.model(V.ScreenCaptureModel.ScreenCaptureModel);if(!s)throw new Error("Could not find model");let i=setTimeout(()=>{this.#t={isLoading:!0},this.performUpdate()},As),o=await s.captureScreenshot("jpeg",no,"fromViewport");clearTimeout(i),o?(this.#t={isLoading:!1,data:o,mimeType:ro,inputType:"screenshot"},this.performUpdate(),this.updateComplete.then(()=>{this.focusTextInput()})):(this.#t=void 0,this.performUpdate(),Ot.Snackbar.Snackbar.show({message:k(S.screenshotFailureMessage)}))}targetAdded(e){}targetRemoved(e){}#p(){this.#t=void 0,this.performUpdate(),this.updateComplete.then(()=>{this.focusTextInput()})}#e(e,s){if(this.conversationType!=="freestyler")return;let i=e?.files;if(!i||i.length===0)return;let o=Array.from(i).find(a=>a.type.startsWith("image/"));o&&(s.preventDefault(),this.#d(o))}#m=e=>{this.#e(e.clipboardData,e)};#h=e=>{this.conversationType==="freestyler"&&e.preventDefault()};#g=e=>{this.#e(e.dataTransfer,e)};async#d(e){let s=setTimeout(()=>{this.#t={isLoading:!0},this.performUpdate()},As);try{let i=new FileReader,o=await new Promise((p,n)=>{i.onload=()=>{typeof i.result=="string"?p(i.result):n(new Error("FileReader result was not a string."))},i.readAsDataURL(e)}),a=o.indexOf(","),r=o.substring(a+1);this.#t={isLoading:!1,data:r,mimeType:e.type,inputType:"uploaded-image"}}catch{this.#t=void 0,Ot.Snackbar.Snackbar.show({message:k(S.uploadImageFailureMessage)})}clearTimeout(s),this.performUpdate(),this.updateComplete.then(()=>{this.focusTextInput()})}#c;constructor(e,s){super(e),this.#c=s??Ms}wasShown(){super.wasShown(),V.TargetManager.TargetManager.instance().addModelListener(V.ResourceTreeModel.ResourceTreeModel,V.ResourceTreeModel.Events.PrimaryPageChanged,this.#u,this)}willHide(){super.willHide(),V.TargetManager.TargetManager.instance().removeModelListener(V.ResourceTreeModel.ResourceTreeModel,V.ResourceTreeModel.Events.PrimaryPageChanged,this.#u,this)}#u(){this.#t=void 0,this.performUpdate()}performUpdate(){this.#c({inputPlaceholder:this.inputPlaceholder,isLoading:this.isLoading,blockedByCrossOrigin:this.blockedByCrossOrigin,isTextInputDisabled:this.isTextInputDisabled,context:this.context,isContextSelected:this.isContextSelected,inspectElementToggled:this.inspectElementToggled,isTextInputEmpty:this.#n(),disclaimerText:this.disclaimerText,conversationType:this.conversationType,multimodalInputEnabled:this.multimodalInputEnabled,imageInput:this.#t,uploadImageInputEnabled:this.uploadImageInputEnabled,isReadOnly:this.isReadOnly,textAreaRef:this.#i,onContextClick:this.onContextClick,onInspectElementClick:this.onInspectElementClick,onImagePaste:this.#m,onNewConversation:this.onNewConversation,onTextInputChange:()=>{this.requestUpdate()},onTakeScreenshot:this.#o.bind(this),onRemoveImageInput:this.#p.bind(this),onSubmit:this.onSubmit,onTextAreaKeyDown:this.onTextAreaKeyDown,onCancel:this.onCancel,onImageUpload:this.onImageUpload,onImageDragOver:this.#h,onImageDrop:this.#g,onContextRemoved:this.onContextRemoved,onContextAdd:this.onContextAdd},void 0,this.contentElement)}focusTextInput(){this.#i.value?.focus()}onSubmit=e=>{if(e.preventDefault(),this.#t?.isLoading)return;let s=!this.#t?.isLoading&&this.#t?.data?{inlineData:{data:this.#t.data,mimeType:this.#t.mimeType}}:void 0;this.onTextSubmit(this.#i.value?.value??"",s,this.#t?.inputType),this.#t=void 0,this.#s=-1,this.#a="",this.setInputValue("")};onTextAreaKeyDown=e=>{if(!(!e.target||!(e.target instanceof HTMLTextAreaElement))){if(e.key==="ArrowUp"){let{value:s,selectionStart:i,selectionEnd:o}=e.target;i===o&&s.lastIndexOf(`
`,i-1)===-1&&(e.preventDefault(),this.#r(-1));return}if(e.key==="ArrowDown"){let{selectionEnd:s,selectionStart:i,value:o}=e.target;i===s&&o.indexOf(`
`,s)===-1&&(e.preventDefault(),this.#r(1));return}if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){if(e.preventDefault(),!e.target?.value||this.#t?.isLoading)return;let s=!this.#t?.isLoading&&this.#t?.data?{inlineData:{data:this.#t.data,mimeType:this.#t.mimeType}}:void 0;this.onTextSubmit(e.target.value,s,this.#t?.inputType),this.#t=void 0,this.#s=-1,this.#a="",this.setInputValue("")}}};onCancel=e=>{e.preventDefault(),this.isLoading&&this.onCancelClick()};onImageUpload=e=>{e.stopPropagation(),ae.UIUtils.createFileSelectorElement(this.#d.bind(this),".jpeg,.jpg,.png").click()}};var Qs={};G(Qs,{ChatMessage:()=>He,DEFAULT_VIEW:()=>Gs,getDeduplicatedWidgetsMessage:()=>ut,getWidgetSignature:()=>Js,renderStep:()=>qe,titleForStep:()=>le});import"./../../ui/components/markdown_view/markdown_view.js";import"./../../ui/kit/kit.js";import*as ye from"./../../core/common/common.js";import"./../../core/host/host.js";import*as vt from"./../../core/i18n/i18n.js";import*as Ht from"./../../core/platform/platform.js";import*as yt from"./../../core/root/root.js";import*as Ae from"./../../core/sdk/sdk.js";import*as ce from"./../../models/ai_assistance/ai_assistance.js";import*as Bs from"./../../models/computed_style/computed_style.js";import*as C from"./../../models/trace/trace.js";import*as _t from"./../common/common.js";import*as qs from"./../../services/trace_bounds/trace_bounds.js";import*as Hs from"./../../third_party/marked/marked.js";import"./../../ui/components/buttons/buttons.js";import*as Vt from"./../../ui/components/input/input.js";import*as _s from"./../../ui/helpers/helpers.js";import*as Gt from"./../../ui/legacy/legacy.js";import*as d from"./../../ui/lit/lit.js";import*as B from"./../../ui/visual_logging/visual_logging.js";import*as de from"./../elements/elements.js";import*as bt from"./../timeline/components/components.js";import*as f from"./../timeline/components/insights/insights.js";import*as Y from"./../timeline/timeline.js";import*as Ie from"./../timeline/utils/utils.js";import{PanelUtils as vo}from"./../utils/utils.js";var Oe=`@scope to (devtools-widget > *){.ai-assistance-feedback-row{font-family:var(--default-font-family);width:100%;display:flex;justify-content:flex-start;align-items:center;margin-block:calc(-1 * var(--sys-size-3));margin-top:var(--sys-size-5);overflow:hidden;mask-image:linear-gradient(to right,var(--ref-palette-neutral0) calc(100% - var(--sys-size-15)),transparent 100%);&.not-v2{gap:var(--sys-size-8)}.action-buttons{display:flex;align-items:center;gap:var(--sys-size-2);padding:var(--sys-size-4) 0}.vertical-separator{height:16px;width:1px;vertical-align:top;margin:0 var(--sys-size-2);background:var(--sys-color-divider);display:inline-block}.suggestions-container{overflow:hidden;position:relative;display:flex;.suggestions-scroll-container{display:flex;overflow:auto hidden;scrollbar-width:none;gap:var(--sys-size-3);padding:var(--sys-size-3)}.scroll-button-container{position:absolute;top:0;height:100%;display:flex;align-items:center;width:var(--sys-size-15);z-index:999}.scroll-button-container.hidden{display:none}.scroll-button-container.left{left:0;background:linear-gradient(90deg,var(--sys-color-cdt-base-container) 0%,var(--sys-color-cdt-base-container) 50%,transparent)}.scroll-button-container.right{right:0;background:linear-gradient(90deg,transparent,var(--sys-color-cdt-base-container) 50%);justify-content:flex-end}}}.feedback-form{display:flex;flex-direction:column;gap:var(--sys-size-5);margin-top:var(--sys-size-4);background-color:var(--sys-color-surface3);padding:var(--sys-size-6);border-radius:var(--sys-shape-corner-medium-small);max-width:var(--sys-size-32);.feedback-input{height:var(--sys-size-11);padding:0 var(--sys-size-5);background-color:var(--sys-color-surface3);width:auto}.feedback-input::placeholder{color:var(--sys-color-on-surface-subtle);font:var(--sys-typescale-body4-regular)}.feedback-header{display:flex;justify-content:space-between;align-items:center}.feedback-title{margin:0;font:var(--sys-typescale-body3-medium)}.feedback-disclaimer{padding:0 var(--sys-size-4)}}.user-query-wrapper{display:flex;justify-content:flex-end;padding:0 var(--sys-size-5);align-items:center}.chat-message{user-select:text;cursor:initial;display:flex;flex-direction:column;gap:var(--sys-size-5);width:100%;padding:var(--sys-size-7) var(--sys-size-5);font-size:12px;word-break:normal;overflow-wrap:anywhere;border-bottom:var(--sys-size-1) solid var(--sys-color-divider);&.query.ai-v2{width:fit-content;max-width:80%;text-align:left;padding:var(--sys-size-4) var(--sys-size-6);font:var(--sys-typescale-body4-regular);border-radius:var(--sys-shape-corner-medium) var(--sys-shape-corner-extra-small) var(--sys-shape-corner-medium) var(--sys-shape-corner-medium);background-color:var(--sys-color-surface5);color:var(--sys-color-on-surface);&.is-first-message{margin-top:var(--sys-size-6)}}&.ai-v2{border-bottom:none}.ai-css-change{margin:var(--sys-size-6) 0}&:not(.ai-v2) .answer-body-wrapper{display:flex;flex-direction:column;gap:var(--sys-size-5);width:100%}&.ai-v2 .answer-body-wrapper{@container(min-width: 700px){padding-left:35px}}&.is-last-message{border-bottom:0}.message-info{display:flex;align-items:center;height:var(--sys-size-11);gap:var(--sys-size-4);font:var(--sys-typescale-body4-bold);h2{font:var(--sys-typescale-body4-bold)}}.actions{display:flex;flex-direction:column;gap:var(--sys-size-8);max-width:100%}.aborted{color:var(--sys-color-on-surface-subtle)}.image-link{width:fit-content;border-radius:var(--sys-shape-corner-small);outline-offset:var(--sys-size-2);img{max-height:var(--sys-size-20);max-width:100%;border-radius:var(--sys-shape-corner-small);border:1px solid var(--sys-color-neutral-outline);width:fit-content;vertical-align:bottom}}.unavailable-image{margin:var(--sys-size-4) 0;display:inline-flex;justify-content:center;align-items:center;height:var(--sys-size-17);width:var(--sys-size-18);background-color:var(--sys-color-surface3);border-radius:var(--sys-shape-corner-small);border:1px solid var(--sys-color-neutral-outline);devtools-icon{color:var(--sys-color-state-disabled)}}}.indicator{color:var(--sys-color-green-bright)}.summary{display:grid;grid-template-columns:auto 1fr auto;padding:var(--sys-size-3);line-height:var(--sys-size-9);cursor:default;gap:var(--sys-size-3);justify-content:center;align-items:center;.title{margin:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font:var(--sys-typescale-body4-regular);.paused{font:var(--sys-typescale-body4-bold)}}}.step-code{display:flex;flex-direction:column;gap:var(--sys-size-2)}.js-code-output{devtools-code-block{--code-block-max-code-height:50px}}.context-details{devtools-code-block{--code-block-max-code-height:80px}}.step{width:fit-content;background-color:var(--sys-color-surface3);border-radius:16px;position:relative;&.empty{pointer-events:none;.arrow{display:none}}&:not(&[open]):hover::after{content:'';height:100%;width:100%;border-radius:inherit;position:absolute;top:0;left:0;pointer-events:none;background-color:var(--sys-color-state-hover-on-subtle)}&.paused{.indicator{color:var(--sys-color-on-surface-subtle)}}&.canceled{.summary{color:var(--sys-color-state-disabled);text-decoration:line-through}.indicator{color:var(--sys-color-state-disabled)}}devtools-markdown-view{--code-background-color:var(--sys-color-surface1)}devtools-icon{vertical-align:bottom}devtools-spinner{width:var(--sys-size-9);height:var(--sys-size-9);padding:var(--sys-size-2)}&[open]{width:auto;summary{margin-bottom:var(--sys-size-2)}.summary .title{white-space:normal;overflow:unset}.summary .arrow{transform:rotate(180deg)}}summary::marker{content:''}summary{border-radius:16px;&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:var(--sys-size-2)}}.step-details{padding:0 var(--sys-size-5) var(--sys-size-4) var(--sys-size-12);display:flex;flex-direction:column;gap:var(--sys-size-6);devtools-code-block{--code-block-background-color:var(--sys-color-surface1)}}}.error-step{color:var(--sys-color-error)}.side-effect-confirmation{display:flex;flex-direction:column;gap:var(--sys-size-5);padding-bottom:var(--sys-size-4)}.side-effect-buttons-container{display:flex;gap:var(--sys-size-4)}.walkthrough-toggle-container{display:flex;gap:var(--sys-size-2);align-items:center;&.has-widgets{gap:var(--sys-size-6)}.chevron{color:var(--sys-color-primary);width:var(--sys-size-8);height:var(--sys-size-8);margin-left:var(--sys-size-2)}}.computed-styles-widget{display:block;width:fit-content}.styling-preview-widget{width:100%;min-height:100px}.main-widgets-wrapper{display:flex;flex-direction:column;gap:var(--sys-size-5)}.step-widgets-wrapper{display:flex;flex-direction:column;align-items:flex-start;gap:var(--sys-size-5)}.widget-header{display:flex;justify-content:space-between;height:var(--sys-size-11);align-items:center;background:var(--sys-color-surface5);padding:var(--sys-size-2) var(--sys-size-4);border-top-left-radius:var(--sys-shape-corner-small);border-top-right-radius:var(--sys-shape-corner-small);.widget-name{font:var(--sys-typescale-body4-regular);margin:0;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.computed-style-title-wrapper{display:flex;align-items:center;justify-content:flex-start;gap:var(--sys-size-3)}.computed-style-title-prefix{flex-shrink:0}.widget-reveal-container{padding:0;background:none;border-radius:0}}.widget-reveal-button{display:flex;align-items:center;devtools-icon{margin-left:var(--sys-size-3);color:var(--sys-color-primary);width:var(--sys-size-8);height:var(--sys-size-8)}}.widget-and-revealer-container{width:100%;min-width:var(--sys-size-30);max-width:var(--sys-size-33)}.widget-reveal-container{background:var(--sys-color-surface5);border-bottom-right-radius:var(--sys-shape-corner-small);border-bottom-left-radius:var(--sys-shape-corner-small);padding:0 var(--sys-size-4) var(--sys-size-4) 0}.revealer-only .widget-reveal-container{background:none;border-radius:unset}.widget-content-container{padding:var(--sys-size-4) var(--sys-size-5);border-top-left-radius:var(--sys-shape-corner-medium);border-top-right-radius:var(--sys-shape-corner-medium);overflow-x:auto;background-color:var(--sys-color-surface3);--override-computed-style-property-white-space:normal;.widget-header+&{border-top-left-radius:0;border-top-right-radius:0}.widget-header+&:last-child{border-bottom-left-radius:var(--sys-shape-corner-medium);border-bottom-right-radius:var(--sys-shape-corner-medium)}}.network-request-preview{display:flex;flex-direction:column;gap:var(--sys-size-4);margin-bottom:var(--sys-size-5);padding-bottom:var(--sys-size-5);border-bottom:1px solid var(--sys-color-divider);.network-request-header{display:flex;align-items:center;gap:var(--sys-size-5);.network-request-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background-color:var(--sys-color-surface1);border-radius:var(--sys-shape-corner-small);border:1px solid var(--sys-color-divider);overflow:hidden;img{max-width:100%;max-height:100%;object-fit:contain}devtools-icon{width:20px;height:20px}}.network-request-details{display:flex;flex-direction:column;overflow:hidden;.network-request-name{font:var(--sys-typescale-body4-bold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.network-request-size{font:var(--sys-typescale-body4-regular);color:var(--sys-color-on-surface-subtle)}}}}}
/*# sourceURL=${import.meta.resolve("././components/chatMessage.css")} */`;var Es={};G(Es,{getButtonLabel:()=>We});function go(t,e){if(t.length<=e)return{truncatedText:t,moreCharacters:0};let s=t.lastIndexOf(" ",e),i=t.indexOf(" ",e),o=e;if(s===-1&&i===-1)o=e;else if(s===-1)o=i;else if(i===-1)o=s;else{let p=e-s,n=i-e;o=p<=n?s:i}let a=t,r=0;return o<t.length&&(a=t.slice(0,o),r=t.length-o),{truncatedText:a,moreCharacters:r}}function We(t){let e="";if(t.isLoading&&!t.isExpanded&&t.stepTitle)e=t.stepTitle;else{let r=t.isExpanded?"Hide":"Show",p=t.hasWidgets?"AI walkthrough":"thinking";e=`${r} ${p}`}if(t.isLoading)return`Loading: ${e}`;let s=50,{truncatedText:i,moreCharacters:o}=go(t.prompt,s),a=o>0?` (and ${o} more characters)`:"";return`${e} for prompt ${i}${a}`}var Os={};G(Os,{DEFAULT_VIEW:()=>js,WalkthroughView:()=>ve,walkthroughCloseTitle:()=>mt,walkthroughTitle:()=>pt});import*as ht from"./../../core/i18n/i18n.js";import*as Fs from"./../../models/ai_assistance/ai_assistance.js";import"./../../ui/components/buttons/buttons.js";import*as Ns from"./../../ui/components/input/input.js";import*as zs from"./../../ui/legacy/legacy.js";import*as Te from"./../../ui/lit/lit.js";import*as Be from"./../../ui/visual_logging/visual_logging.js";var Ps=`@scope (devtools-widget){.walkthrough-view{height:100%;background-color:var(--sys-color-cdt-base-container);overflow:hidden;display:flex;flex-direction:column}}@scope (devtools-widget > *){.walkthrough-header{display:flex;justify-content:space-between;align-items:center;padding:0 8px;height:35px;border-bottom:1px solid var(--sys-color-divider);flex-shrink:0}.walkthrough-title{font-size:11px;font-weight:500;color:var(--sys-color-on-surface)}.steps-container{flex:1;overflow-y:auto}.steps-scroll-content{padding:var(--sys-size-6);display:flex;flex-direction:column;gap:var(--sys-size-6)}.walkthrough-step{display:flex;gap:var(--sys-size-6);align-items:flex-start;justify-content:flex-start;flex-shrink:0;.step-number{font:var(--sys-typescale-body4-regular);color:var(--sys-color-on-surface-subtle);padding-top:var(--sys-size-4);flex-grow:0;flex-shrink:0}}.step-wrapper{display:flex;flex-direction:column;gap:var(--sys-size-5);min-width:0;width:100%}.step-container{display:flex;gap:var(--sys-size-5);align-items:flex-start}.step-icon{color:var(--sys-color-on-surface-subtle);width:var(--sys-size-8);height:var(--sys-size-8);flex-shrink:0;margin-top:var(--sys-size-2)}.step-content{flex:1;font-size:11px;color:var(--sys-color-on-surface);line-height:1.4}.empty-state{display:flex;align-items:center;justify-content:center;flex:1;color:var(--sys-color-on-surface-subtle);font-size:11px}.inline-wrapper{display:flex;align-items:flex-start;gap:var(--sys-size-2);justify-content:flex-start;.inline-icon{display:block;margin-top:var(--sys-size-2)}}.walkthrough-inline{border-radius:var(--sys-shape-corner-full);overflow:hidden;width:fit-content;max-width:100%;&[open]{border-radius:var(--sys-size-5);width:auto;background-color:var(--sys-color-surface2);margin-left:calc(var(--sys-size-6) / 2);flex-grow:1}}.walkthrough-inline > summary{display:flex;align-items:center;cursor:pointer;background-color:transparent;height:var(--sys-size-11);font:var(--sys-typescale-body4-regular);font-weight:var(--ref-typeface-weight-medium);user-select:none;list-style:none;justify-content:flex-start;gap:var(--sys-size-4);color:var(--sys-color-primary);padding:0 var(--sys-size-6);overflow:hidden;devtools-icon{color:var(--sys-color-primary)}&[data-has-widgets]{background:var(--sys-color-tonal-container);color:var(--sys-color-on-tonal-container);border-radius:var(--sys-shape-corner-full);margin-left:var(--sys-size-6);devtools-icon{color:var(--sys-color-on-tonal-container)}}> .walkthrough-inline-title{font:var(--sys-typescale-body4-regular);font-weight:var(--ref-typeface-weight-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:calc(-1 * var(--sys-size-2))}}.walkthrough-inline[open] > summary{border-radius:var(--sys-shape-corner-medium-small);border-bottom-right-radius:0;border-bottom-left-radius:0;background:var(--sys-color-surface5);color:var(--sys-color-on-surface);&[data-has-widgets]{margin-left:0}> devtools-icon[name='chevron-right']{transform:rotate(270deg)}}.walkthrough-inline > summary::-webkit-details-marker{display:none}.walkthrough-inline > summary:hover{background-color:var(--sys-color-state-hover-on-subtle)}.walkthrough-inline .steps-container{padding:var(--sys-size-6);border-top:1px solid var(--sys-color-divider);background-color:transparent}.walkthrough-inline > summary > devtools-icon[name='chevron-right']{width:var(--sys-size-8);height:var(--sys-size-8);transition:transform 0.2s;margin-left:auto}.walkthrough-inline .step{background-color:var(--sys-color-surface5)}}
/*# sourceURL=${import.meta.resolve("././components/walkthroughView.css")} */`;var Ve=ht.i18n.lockedString,{html:re,render:ho,Directives:po}=Te,{ref:Ds}=po,Us=2,te={close:"Close",title:"Agent walkthrough",showThinking:"Show thinking",showAgentWalkthrough:"Show agent walkthrough",hideThinking:"Hide thinking",hideAgentWalkthrough:"Hide agent walkthrough",inProgress:"In progress"},mo=ht.i18n.registerUIStrings("panels/ai_assistance/components/WalkthroughView.ts",te),Wt=ht.i18n.getLocalizedString.bind(void 0,mo);function pt(t){return t.isLoading?le(t.lastStep):t.hasWidgets?Ve(te.showAgentWalkthrough):Ve(te.showThinking)}function mt(t){return t.isInlined?Wt(te.title):t.hasWidgets?Ve(te.hideAgentWalkthrough):Ve(te.hideThinking)}function uo(t,e,s){let i=s.at(-1);if(!t.isInlined||!i)return Te.nothing;function o(p){let n=p.target.open;t.message&&(n?t.onOpen(t.message):t.onToggle(n,t.message))}let a=s.some(p=>p.widgets?.length),r=Fs.AiUtils.getIconName();return re`
    <div class="inline-wrapper" ?data-open=${t.isExpanded} jslog=${Be.section("walkthrough-container")}>
      <span class="inline-icon">
        ${t.isLoading?re`<devtools-spinner aria-label=${Ve(te.inProgress)}></devtools-spinner>`:re`<devtools-icon name=${r}></devtools-icon>`}
      </span>
      <details class="walkthrough-inline" ?open=${t.isExpanded} @toggle=${o} jslog=${Be.expand("walkthrough").track({click:!0})}>
        <summary
          ?data-has-widgets=${!t.isLoading&&a}
          aria-label=${We({isExpanded:t.isExpanded,isLoading:t.isLoading,hasWidgets:a,prompt:t.prompt,stepTitle:le(i)})}
        >
          <h2 class="walkthrough-inline-title">
            ${t.isExpanded?mt({hasWidgets:a,isInlined:!0}):pt({isLoading:t.isLoading,lastStep:i,hasWidgets:a})}
          </h2>
          <devtools-icon name="chevron-right"></devtools-icon>
        </summary>

        ${e}
      </details>
    </div>
  `}function fo(t,e,s){return t.isInlined?Te.nothing:re`
    <div class="walkthrough-view" jslog=${Be.section("walkthrough-container")}>
      <div class="walkthrough-header">
         <h2 class="walkthrough-title">${Wt(te.title)}</h2>
         <devtools-button
          .data=${{variant:"toolbar",iconName:"cross",title:Wt(te.close),jslogContext:"close-walkthrough"}}
          @click=${()=>{t.message&&t.onToggle(!1,t.message)}}
        ></devtools-button>
      </div>
      ${e}
      ${s===0?re`
        <div class="empty-state">
          <p>No walkthrough steps available yet.</p>
        </div>
      `:Te.nothing}
    </div>
  `}var js=(t,e,s)=>{let i=t.message?.parts.filter(r=>r.type==="step")?.map(r=>r.step)??[],o=i.filter(r=>!r.requestApproval),a=o.length>0?re`
    <div class="steps-container" @scroll=${t.handleScroll} ${Ds(r=>{e.scrollContainer=r})}>
      <div class="steps-scroll-content" ${Ds(r=>{e.stepsContainer=r})}>
        ${o.map((r,p)=>re`
          <div class="walkthrough-step">
            <span class="step-number">${p+1}</span>
            <div class="step-wrapper">
              ${qe({step:r,isLoading:t.isLoading,markdownRenderer:t.markdownRenderer,isLast:p===o.length-1})}
            </div>
          </div>
        `)}
      </div>
    </div>
  `:Te.nothing;ho(re`
    <style>
      ${Ns.textInputStyles}
      ${Oe}
      ${Ps}
    </style>
    ${t.isInlined?uo(t,a,i):fo(t,a,o.length)}`,s)},ve=class extends zs.Widget.Widget{#i;#t=null;#s=!1;#a=null;#n=()=>{};#r=()=>{};#o=!1;#p=!1;#e="";#m=!0;#h=!1;#g={};#d=new ResizeObserver(()=>this.#f());#c=0;constructor(e,s=js){super(e),this.#i=s,this.setMinimumSize(330,0)}wasShown(){super.wasShown(),this.#u()}willHide(){super.willHide(),this.#d.disconnect()}#u(){this.#g.stepsContainer&&this.#d.observe(this.#g.stepsContainer)}#f(){let e=this.#g.stepsContainer?.offsetWidth??0;if(e!==this.#c){this.#c=e;return}!this.#m||!this.#s||this.scrollToBottom()}scrollToBottom(){this.#g.stepsContainer&&(this.#h=!0,window.requestAnimationFrame(()=>{let e=this.#g.stepsContainer?.lastElementChild;e&&e.scrollIntoView({behavior:"smooth",block:"end"})}))}#b=e=>{if(!(!e.target||!(e.target instanceof HTMLElement))){if(this.#h){e.target.scrollTop+e.target.clientHeight+Us>=e.target.scrollHeight&&(this.#h=!1);return}this.#m=e.target.scrollTop+e.target.clientHeight+Us>=e.target.scrollHeight}};set isLoading(e){this.#s=e,this.requestUpdate()}get isLoading(){return this.#s}get markdownRenderer(){return this.#a}set markdownRenderer(e){this.#a=e,this.requestUpdate()}get message(){return this.#t}get onOpen(){return this.#r}set onOpen(e){this.#r=e,this.requestUpdate()}set message(e){this.#t=e,this.requestUpdate()}set onToggle(e){this.#n=e,this.requestUpdate()}set isInlined(e){this.#o=e,this.requestUpdate()}set isExpanded(e){this.#p=e,this.requestUpdate()}get prompt(){return this.#e}set prompt(e){this.#e=e,this.requestUpdate()}performUpdate(){if(!this.#a)return;let e=this.#t?ut(this.#t):null;this.#i({isLoading:this.#s,markdownRenderer:this.#a,onToggle:this.#n,onOpen:this.#r,isInlined:this.#o,isExpanded:this.#p,prompt:this.#e,message:e,handleScroll:this.#b},this.#g,this.contentElement),this.#u(),this.#m&&this.#s&&this.scrollToBottom()}};var{html:c,Directives:{ref:ft,ifDefined:Bt}}=d,m=vt.i18n.lockedString,{widget:q}=Gt.Widget,yo="https://crbug.com/508304827",Ws=1,bo=11,l={thumbsUp:"Good response",thumbsDown:"Bad response",provideFeedbackPlaceholder:"Provide additional feedback",disclaimer:"Submitted feedback will also include your conversation",submit:"Submit",whyThisRating:"Why did you choose this rating? (optional)",close:"Close",report:"Report legal issue",scrollToNext:"Scroll to next suggestions",scrollToPrevious:"Scroll to previous suggestions",copyResponse:"Copy response",systemError:"Something unforeseen happened and I can no longer continue. Try your request again and see if that resolves the issue. If this keeps happening, update Chrome to the latest version.",maxStepsError:"Seems like I am stuck with the investigation. It would be better if you start over.",crossOriginError:"I have selected the new context but you will have to start a new chat.",stoppedResponse:"You stopped this response",confirmActionRequestApproval:"Continue",declineActionRequestApproval:"Cancel",ai:"AI",gemini:"Gemini",investigating:"Investigating",paused:"Paused",codeExecuted:"Code executed",codeToExecute:"Code to execute",dataReturned:"Data returned",completed:"Completed",inProgress:"In progress",aborted:"Aborted",imageInputSentToTheModel:"Image input sent to the model",openImageInNewTab:"Open image in a new tab",imageUnavailable:"Image unavailable",reveal:"Reveal",revealTrace:"Reveal trace",revealComputedStyles:"Reveal computed styles",revealCoreWebVitals:"Reveal Core Web Vitals",revealStyleProperties:"Reveal style properties",revealLcpBreakdown:"Reveal LCP breakdown",revealLcpDiscovery:"Reveal LCP discovery",revealClsCulprits:"Reveal layout shift culprits",revealRenderBlockingBreakdown:"Reveal render-blocking requests",revealLcpElement:"Reveal LCP element",revealPerformanceSummary:"Reveal performance summary",revealBottomUpTree:"Reveal bottom-up thread activity",revealNetworkDependencyTree:"Reveal network dependency tree",revealThirdParties:"Reveal 3rd parties",coreVitals:"Core Web Vitals",lcpBreakdown:"LCP breakdown",lcpDiscovery:"LCP discovery",clsCulprits:"Layout shift culprits",renderBlockingBreakdown:"Render-blocking requests",networkDependencyTree:"Network dependency tree",thirdParties:"3rd parties",lcpElement:"LCP element",performanceSummary:"Performance summary",exportForAgents:"Copy to coding agent",bottomUpTree:"Bottom-up thread activity",revealForcedReflow:"Reveal forced reflow",forcedReflow:"Forced reflow",revealCache:"Reveal efficient cache lifetimes",cache:"Efficient cache lifetimes",revealInpBreakdown:"Reveal INP breakdown",inpBreakdown:"INP breakdown",revealDocumentLatency:"Reveal document latency",documentLatency:"Document latency",revealDomSize:"Reveal DOM size",domSize:"DOM size",revealDuplicateJavaScript:"Reveal duplicated JavaScript",duplicateJavaScript:"Duplicated JavaScript",revealImageDelivery:"Reveal image delivery",imageDelivery:"Image delivery",revealFontDisplay:"Reveal font display",fontDisplay:"Font display",revealSlowCssSelector:"Reveal slow CSS selectors",slowCssSelector:"Slow CSS selectors",revealLegacyJavaScript:"Reveal legacy JavaScript",legacyJavaScript:"Legacy JavaScript",revealViewport:"Reveal viewport optimization",viewport:"Viewport optimization",revealModernHttp:"Reveal modern HTTP usage",modernHttp:"Modern HTTP usage",revealCharacterSet:"Reveal character set declaration",characterSet:"Character set declaration"},Gs=(t,e,s)=>{let i=!!yt.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled,o=t.message;if(o.entity==="user"){let n=o.imageInput&&"inlineData"in o.imageInput?Oo(o.imageInput.inlineData):d.nothing,u=d.Directives.classMap({"chat-message":!0,query:!0,"is-last-message":t.isLastMessage,"is-first-message":t.isFirstMessage,"ai-v2":i}),v=d.Directives.classMap({"user-query-wrapper":i});d.render(c`
      <style>${Vt.textInputStyles}</style>
      <style>${Oe}</style>
      <div class=${v}>
        <section class=${u} jslog=${B.section("question")}>
          ${n}
          <div class="message-content">${qt(o.text,t.markdownRenderer)}</div>
        </section>
      </div>
    `,s);return}let a=o.parts.filter(n=>n.type==="step").map(n=>n.step),r=ce.AiUtils.getIconName(),p=d.Directives.classMap({"chat-message":!0,answer:!0,"is-last-message":t.isLastMessage,"is-first-message":t.isFirstMessage,"ai-v2":i});d.render(c`
    <style>${Vt.textInputStyles}</style>
    <style>${Oe}</style>
    <section class=${p} jslog=${B.section("answer")}>
      ${i?d.nothing:c`
        <div class="message-info">
          <devtools-icon name=${r}></devtools-icon>
          <div class="message-name">
            <h2>${ce.AiUtils.isGeminiBranding()?m(l.gemini):m(l.ai)}</h2>
          </div>
        </div>`}
      ${i?So(t,a):d.nothing}
      <div class="answer-body-wrapper">
        ${d.Directives.repeat(o.parts,(n,u)=>u,(n,u)=>{let v=u===o.parts.length-1;return n.type==="answer"?c`<p>${qt(n.text,t.markdownRenderer,{animate:!t.isReadOnly&&t.isLoading&&v&&t.isLastMessage})}</p>`:n.type==="widget"?c`${d.Directives.until(Ys(n.widgets,{wrapperClass:"main-widgets-wrapper"}))}`:!i&&n.type==="step"?qe({step:n.step,isLoading:t.isLoading,markdownRenderer:t.markdownRenderer,isLast:v}):d.nothing})}
        ${jo(o)}
        ${t.shouldShowCSSChangeSummary&&i&&t.changeSummary?c`
          <devtools-code-block
            .code=${t.changeSummary}
            .codeLang=${"css"}
            .displayLimit=${bo}
            .displayNotice=${!0}
            class="ai-css-change"
          ></devtools-code-block>
        `:d.nothing}
        ${t.showActions?Wo(t,e):d.nothing}
      </div>
      ${i?To(t,a):d.nothing}
    </section>
  `,s)};function qt(t,e,{animate:s,ref:i}={}){let o=[];try{o=Hs.Marked.lexer(t);for(let a of o)e.renderToken(a)}catch{return c`${t}`}return c`<devtools-markdown-view
    .data=${{tokens:o,renderer:e,animationEnabled:s}}
    ${i?ft(i):d.nothing}>
  </devtools-markdown-view>`}function le(t){return t.title??`${m(l.investigating)}\u2026`}function wo(t){let e=t.requestApproval?c`<span class="paused">${m(l.paused)}: </span>`:d.nothing;return c`<h3 class="title" aria-label=${le(t)}>${e}${le(t)}</h3>`}function xo(t){if(!t.code&&!t.output)return d.nothing;let e=t.output&&!t.canceled?m(l.codeExecuted):m(l.codeToExecute),s=t.code?c`<div class="action-result">
      <devtools-code-block
        .code=${t.code.trim()}
        .codeLang=${"js"}
        .displayNotice=${!t.output}
        .header=${e}
        .showCopyButton=${!0}
      ></devtools-code-block>
  </div>`:d.nothing,i=t.output?c`<div class="js-code-output">
    <devtools-code-block
      .code=${t.output}
      .codeLang=${"js"}
      .displayNotice=${!0}
      .header=${m(l.dataReturned)}
      .showCopyButton=${!1}
    ></devtools-code-block>
  </div>`:d.nothing;return c`<div class="step-code">${s}${i}</div>`}function ko({step:t,markdownRenderer:e,isLast:s}){let i=s&&t.requestApproval?zo(t):d.nothing,o=t.thought?c`<p>${qt(t.thought,e)}</p>`:d.nothing,a=t.contextDetails?c`${d.Directives.repeat(t.contextDetails,r=>c`<div class="context-details">
      <devtools-code-block
        .code=${r.text}
        .codeLang=${r.codeLang||""}
        .displayNotice=${!1}
        .header=${r.title}
        .showCopyButton=${!0}
      ></devtools-code-block>
    </div>`)}`:d.nothing;return c`<div class="step-details">
    ${o}
    ${xo(t)}
    ${i}
    ${a}
  </div>`}function Co(t,e){let{message:s,walkthrough:i}=t,o=e.at(-1);if(i.isInlined||!o)return d.nothing;let a=e.some(ge=>ge.widgets?.length),r=i.isExpanded&&t.message.id===t.walkthrough.activeSidebarMessage?.id,p=r?mt({hasWidgets:a}):pt({isLoading:t.isLoading,hasWidgets:a,lastStep:o}),n=a&&!t.isLoading?"tonal":"text",u=ce.AiUtils.getIconName(),v=d.Directives.classMap({"walkthrough-toggle-container":!0,"has-widgets":a&&!t.isLoading}),U=We({isExpanded:r,isLoading:t.isLoading,hasWidgets:a,prompt:t.prompt,stepTitle:le(o)});return c`
    <div class=${v}>
      ${t.isLoading?c`<devtools-spinner></devtools-spinner>`:c`<devtools-icon name=${u}></devtools-icon>`}
      <devtools-button
        .variant=${n}
        .size=${"SMALL"}
        .title=${o.isLoading?le(o):p}
        .accessibleLabel=${U}
        .jslogContext=${i.isExpanded?"ai-hide-walkthrough-sidebar":"ai-show-walkthrough-sidebar"}
        data-show-walkthrough
        @click=${()=>{i.activeSidebarMessage?.id===t.message.id&&i.isExpanded?i.onToggle(!1,s):i.onOpen(s)}}>${p}<devtools-icon class="chevron" .name=${r?"cross":"chevron-right"}></devtools-icon>
      </devtools-button>
    </div>
  `}function So(t,e){if(!e.at(-1))return d.nothing;let i=t.walkthrough.isInlined?d.nothing:Co(t,e),o=t.walkthrough.isInlined?t.walkthrough.inlineExpandedMessages.some(r=>r.id===t.message.id):t.walkthrough.isExpanded&&t.walkthrough.activeSidebarMessage?.id===t.message.id,a=t.walkthrough.isInlined?c`
    <div class="walkthrough-container">
      ${q(ve,{message:t.message,isLoading:t.isLoading&&t.isLastMessage,markdownRenderer:t.markdownRenderer,isInlined:!0,isExpanded:o,prompt:t.prompt,onToggle:t.walkthrough.onToggle,onOpen:t.walkthrough.onOpen})}
    </div>
  `:d.nothing;return c`
    ${i}
    ${a}
  `}function To(t,e){let s=e.filter(i=>i.requestApproval);return s.length===0?d.nothing:c`
    ${s.map(i=>c`
      <div class="side-effect-container">
        ${qe({step:i,isLoading:t.isLoading,markdownRenderer:t.markdownRenderer,isLast:!0})}
      </div> `)}
  `}function Ao({step:t,isLoading:e,isLast:s}){if(e&&s&&!t.requestApproval)return c`<devtools-spinner aria-label=${m(l.inProgress)}></devtools-spinner>`;let i="checkmark",o=m(l.completed),a="button";return s&&t.requestApproval?(a=void 0,o=m(l.paused),i="pause-circle"):t.canceled&&(o=m(l.aborted),i="cross"),c`<devtools-icon
      class="indicator"
      role=${Bt(a)}
      aria-label=${Bt(o)}
      .name=${i}
    ></devtools-icon>`}function qe({step:t,isLoading:e,markdownRenderer:s,isLast:i}){let o=d.Directives.classMap({step:!0,empty:!t.thought&&!t.code&&!t.contextDetails&&!t.requestApproval,paused:!!t.requestApproval,canceled:!!t.canceled});return c`
    <details class=${o}
      jslog=${B.expand("step").track({click:!0})}
      .open=${!!t.requestApproval}>
      <summary>
        <div class="summary">
          ${Ao({step:t,isLoading:e,isLast:i})}
          ${wo(t)}
          <devtools-icon
            class="arrow"
            name="chevron-down"
          ></devtools-icon>
        </div>
      </summary>
      ${ko({step:t,markdownRenderer:s,isLast:i})}
    </details>
    ${d.Directives.until(Ys(t.widgets,{wrapperClass:"step-widgets-wrapper"}))}
    `}var Vs=new Map;async function Ks(t){let e=Vs.get(t);if(e)return e;let s=Ae.TargetManager.TargetManager.instance().primaryPageTarget();if(!s)return null;let o=await new Ae.DOMModel.DeferredDOMNode(s,t).resolvePromise();return o&&Vs.set(t,o),o}async function Io(t){let e=await Ks(t.data.backendNodeId);if(!e)return null;let s=new Bs.ComputedStyleModel.ComputedStyle(e,t.data.computedStyles),i=null;try{i=new RegExp(t.data.properties.join("|"),"i")}catch{return null}return{renderedWidget:c`<devtools-widget
      class="computed-styles-widget" ${q(de.ComputedStyleWidget.ComputedStyleWidget,{nodeStyle:s,matchedStyles:t.data.matchedCascade,propertyTraces:null,allowUserControl:!1,filterText:i,enableNarrowViewResizing:!1})}></devtools-widget>`,revealable:new de.ElementsPanel.NodeComputedStyles(e),accessibleRevealLabel:m(l.revealComputedStyles),title:c`
      <span class="computed-style-title-wrapper">
        <span class="computed-style-title-prefix">Computed styles</span>
        <span class="style-class-wrapper">
          (<devtools-widget
            ${q(_t.DOMLinkifier.DOMNodeLink,{node:e})}
          ></devtools-widget>)
        </span>
      </span>`,jslogContext:"computed-styles"}}async function Lo(t){return{renderedWidget:c`<devtools-widget class="core-vitals-widget" ${q(bt.CWVMetrics.CWVMetrics,{data:t.data,skipBottomBorder:!0})}>
  </devtools-widget>`,revealable:new Ie.Helpers.RevealableCoreVitals(t.data.insightSetKey),accessibleRevealLabel:m(l.revealCoreWebVitals),title:m(l.coreVitals),jslogContext:"core-web-vitals"}}async function $o(t){let e=await Ks(t.data.backendNodeId);if(!e)return null;let s=null;try{s=t.data.selector?new RegExp(t.data.selector):null}catch{return null}return{renderedWidget:c`<devtools-widget
      class="styling-preview-widget"
      ${q(de.StandaloneStylesContainer.StandaloneStylesContainer,{domNode:e,filter:s})}>
  </devtools-widget>`,revealable:e,accessibleRevealLabel:m(l.revealStyleProperties),title:c`<devtools-widget
      ${q(_t.DOMLinkifier.DOMNodeLink,{node:e})}
    ></devtools-widget>`,jslogContext:"standalone-styles"}}var Mo={[C.Insights.Types.InsightKeys.LCP_BREAKDOWN]:{component:f.LCPBreakdown.LCPBreakdown,accessibleLabel:l.revealLcpBreakdown,title:l.lcpBreakdown,jslog:"lcp-breakdown-widget"},[C.Insights.Types.InsightKeys.RENDER_BLOCKING]:{component:f.RenderBlocking.RenderBlocking,accessibleLabel:l.revealRenderBlockingBreakdown,title:l.renderBlockingBreakdown,jslog:"render-blocking-widget"},[C.Insights.Types.InsightKeys.LCP_DISCOVERY]:{component:f.LCPDiscovery.LCPDiscovery,accessibleLabel:l.revealLcpDiscovery,title:l.lcpDiscovery,jslog:"lcp-discovery-widget"},[C.Insights.Types.InsightKeys.CLS_CULPRITS]:{component:f.CLSCulprits.CLSCulprits,accessibleLabel:l.revealClsCulprits,title:l.clsCulprits,jslog:"cls-culprits-widget"},[C.Insights.Types.InsightKeys.NETWORK_DEPENDENCY_TREE]:{component:f.NetworkDependencyTree.NetworkDependencyTree,accessibleLabel:l.revealNetworkDependencyTree,title:l.networkDependencyTree,jslog:"network-dependency-tree-widget"},[C.Insights.Types.InsightKeys.THIRD_PARTIES]:{component:f.ThirdParties.ThirdParties,accessibleLabel:l.revealThirdParties,title:l.thirdParties,jslog:"third-parties-widget"},[C.Insights.Types.InsightKeys.FORCED_REFLOW]:{component:f.ForcedReflow.ForcedReflow,accessibleLabel:l.revealForcedReflow,title:l.forcedReflow,jslog:"forced-reflow-widget"},[C.Insights.Types.InsightKeys.CACHE]:{component:f.Cache.Cache,accessibleLabel:l.revealCache,title:l.cache,jslog:"cache-widget"},[C.Insights.Types.InsightKeys.INP_BREAKDOWN]:{component:f.INPBreakdown.INPBreakdown,accessibleLabel:l.revealInpBreakdown,title:l.inpBreakdown,jslog:"inp-breakdown-widget"},[C.Insights.Types.InsightKeys.DOCUMENT_LATENCY]:{component:f.DocumentLatency.DocumentLatency,accessibleLabel:l.revealDocumentLatency,title:l.documentLatency,jslog:"document-latency-widget"},[C.Insights.Types.InsightKeys.DOM_SIZE]:{component:f.DOMSize.DOMSize,accessibleLabel:l.revealDomSize,title:l.domSize,jslog:"dom-size-widget"},[C.Insights.Types.InsightKeys.DUPLICATE_JAVASCRIPT]:{component:f.DuplicatedJavaScript.DuplicatedJavaScript,accessibleLabel:l.revealDuplicateJavaScript,title:l.duplicateJavaScript,jslog:"duplicate-javascript-widget"},[C.Insights.Types.InsightKeys.IMAGE_DELIVERY]:{component:f.ImageDelivery.ImageDelivery,accessibleLabel:l.revealImageDelivery,title:l.imageDelivery,jslog:"image-delivery-widget"},[C.Insights.Types.InsightKeys.FONT_DISPLAY]:{component:f.FontDisplay.FontDisplay,accessibleLabel:l.revealFontDisplay,title:l.fontDisplay,jslog:"font-display-widget"},[C.Insights.Types.InsightKeys.SLOW_CSS_SELECTOR]:{component:f.SlowCSSSelector.SlowCSSSelector,accessibleLabel:l.revealSlowCssSelector,title:l.slowCssSelector,jslog:"slow-css-selector-widget"},[C.Insights.Types.InsightKeys.LEGACY_JAVASCRIPT]:{component:f.LegacyJavaScript.LegacyJavaScript,accessibleLabel:l.revealLegacyJavaScript,title:l.legacyJavaScript,jslog:"legacy-javascript-widget"},[C.Insights.Types.InsightKeys.VIEWPORT]:{component:f.Viewport.Viewport,accessibleLabel:l.revealViewport,title:l.viewport,jslog:"viewport-widget"},[C.Insights.Types.InsightKeys.MODERN_HTTP]:{component:f.ModernHTTP.ModernHTTP,accessibleLabel:l.revealModernHttp,title:l.modernHttp,jslog:"modern-http-widget"},[C.Insights.Types.InsightKeys.CHARACTER_SET]:{component:f.CharacterSet.CharacterSet,accessibleLabel:l.revealCharacterSet,title:l.characterSet,jslog:"character-set-widget"}};function Ro(t,e,s,i,o,a){return{renderedWidget:c`<devtools-widget
    class=${s}
    ${q(t,{model:e,minimal:!0,bounds:a??null})}></devtools-widget>`,revealable:new Ie.Helpers.RevealableInsight(e),accessibleRevealLabel:m(i),title:m(o),jslogContext:s}}async function Eo(t){let e=t.data.insight,s=t.data.insightData,i=Mo[e];if(!i)return null;let o;if(e===C.Insights.Types.InsightKeys.CLS_CULPRITS){let a=qs.TraceBounds.BoundsManager.instance().state()?.micro.entireTraceBounds;if(!a)return null;o=a}return Ro(i.component,s,i.jslog,i.accessibleLabel,i.title,o)}async function Po(t){let e=ce.AIQueries.AIQueries.mainThreadActivityBottomUp(t.data.bounds,t.data.parsedTrace);if(!e)return null;let s=e.events,i=C.Helpers.Timing.microToMilli(t.data.bounds.min),o=C.Helpers.Timing.microToMilli(t.data.bounds.max);return{renderedWidget:c`<devtools-widget
      class="bottom-up-timeline-tree-widget"
      ${q(Y.TimelineTreeView.BottomUpTimelineTreeView,{selectedEvents:s,parsedTrace:t.data.parsedTrace,startTime:i,endTime:o,compactMode:!0,maxLinkLength:15,maxRows:10})}></devtools-widget>`,revealable:new Ie.Helpers.RevealableBottomUpProfile(t.data.bounds),accessibleRevealLabel:m(l.revealBottomUpTree),title:m(l.bottomUpTree),jslogContext:"bottom-up"}}function Do(t){if(t===null)return d.nothing;function e(){t!==null&&ye.Revealer.reveal(t?.revealable)}let s=d.Directives.classMap({"widget-and-revealer-container":!0,"revealer-only":t.renderedWidget===null}),i=c`
    <devtools-button class="widget-reveal-button"
      .variant=${"text"}
      .accessibleLabel=${t.accessibleRevealLabel}
      .jslogContext=${"reveal"}
      @click=${e}
    >
      ${t.customRevealTitle??m(l.reveal)}
      <devtools-icon name='tab-move'></devtools-icon>
    </devtools-button>
  `;return c`
    <div class=${s} jslog=${Bt(t.jslogContext?B.section(t.jslogContext):void 0)}>
      ${t.title?c`
        <div class="widget-header">
          <h4 class="widget-name">${t.title}</h4>
          <div class="widget-reveal-container">
            ${i}
          </div>
        </div>
      `:d.nothing}
      ${t.renderedWidget?c`
        <div class="widget-content-container">
          ${t.renderedWidget}
        </div>`:d.nothing}
      ${t.title?d.nothing:c`
        <div class="widget-reveal-container">
          ${i}
        </div>
      `}
    </div>
    `}async function Uo(t){let e=m(l.revealTrace);return{renderedWidget:null,title:null,revealable:new Y.TimelinePanel.ParsedTraceRevealable(t.data.parsedTrace),customRevealTitle:e,accessibleRevealLabel:e,jslogContext:"performance-trace"}}function Fo(t){let e=t.url.split("/").pop()||t.url,s=vt.ByteUtilities.bytesToString(t.size),i=ye.ResourceType.resourceTypes[t.resourceType],{iconName:o,color:a}=vo.iconDataForResourceType(i),r=t.imageContent?.asImagePreviewUrl()??t.url;return c`
    <div class="network-request-preview">
      <div class="network-request-header">
        <div class="network-request-icon">
          ${i.isImage()?c`<img src=${r} alt=${e} />`:c`<devtools-icon name=${o} style=${d.Directives.styleMap({color:a??""})}></devtools-icon>`}
        </div>        <div class="network-request-details">
          <div class="network-request-name" title=${t.url}>${e}</div>
          <div class="network-request-size">${s}</div>
        </div>
      </div>
    </div>
  `}async function No(t){let e=t.data.root;if(!(e instanceof Ae.DOMModel.DOMNodeSnapshot))return null;let s=t.data.networkRequest;return{renderedWidget:c`
    ${s?Fo(s):d.nothing}
    <devtools-widget class="dom-tree-widget" ${q(de.ElementsTreeOutline.DOMTreeWidget,{maxTreeDepth:2,enableContextMenu:!1,showComments:!1,showAIButton:!1,disableEdits:!0,expandRoot:!0,rootDOMNode:e,visibleWidth:400,wrap:!0,maxRows:10})}></devtools-widget>
  `,revealable:new Ae.DOMModel.DeferredDOMNode(e.domModel().target(),e.backendNodeId()),accessibleRevealLabel:m(l.revealLcpElement),title:m(l.lcpElement),jslogContext:"dom-snapshot"}}function Js(t){switch(t.name){case"COMPUTED_STYLES":return`${t.name}:${t.data.backendNodeId}`;case"CORE_VITALS":return`${t.name}:${t.data.insightSetKey}`;case"STYLE_PROPERTIES":return`${t.name}:${t.data.backendNodeId}:${t.data.selector??""}`;case"DOM_TREE":return`${t.name}:${t.data.root.backendNodeId()}`;case"PERFORMANCE_TRACE":return`${t.name}`;case"PERF_INSIGHT":return`${t.name}:${t.data.insight}:${t.data.insightData.insightKey}:${t.data.insightData.navigation?.args?.data?.navigationId??"no-nav-id"}`;case"TIMELINE_RANGE_SUMMARY":return`${t.name}:${t.data.track}:${t.data.bounds.min}-${t.data.bounds.max}`;case"BOTTOM_UP_TREE":return`${t.name}:${t.data.bounds.min}-${t.data.bounds.max}`;default:Ht.assertNever(t,"Unknown AiWidget name")}}function ut(t){let e=new Set,s=o=>o.filter(a=>{let r=Js(a);return e.has(r)?!1:(e.add(r),!0)}),i=t.parts.map(o=>o.type==="widget"?{...o,widgets:s(o.widgets)}:o.type==="step"&&o.step.widgets?{...o,step:{...o.step,widgets:s(o.step.widgets)}}:o);return{...t,parts:i}}async function Ys(t,e={}){if(!yt.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled||!t||t.length===0)return d.nothing;let s=await Promise.all(t.map(async i=>{let o=null;switch(i.name){case"COMPUTED_STYLES":o=await Io(i);break;case"CORE_VITALS":o=await Lo(i);break;case"STYLE_PROPERTIES":o=await $o(i);break;case"DOM_TREE":o=await No(i);break;case"PERFORMANCE_TRACE":o=await Uo(i);break;case"PERF_INSIGHT":o=await Eo(i);break;case"TIMELINE_RANGE_SUMMARY":o=await Vo(i);break;case"BOTTOM_UP_TREE":o=await Po(i);break;default:Ht.assertNever(i,"Unknown AiWidget name")}return Do(o)}));return e.wrapperClass?c`<div class=${e.wrapperClass}>${s}</div>`:c`${s}`}function zo(t){return t.requestApproval?c`<div
    class="side-effect-confirmation"
    jslog=${B.section("side-effect-confirmation")}
  >
    ${t.requestApproval.description?c`<p>${t.requestApproval.description}</p>`:d.nothing}
    <div class="side-effect-buttons-container">
      <devtools-button
        .data=${{variant:"outlined",jslogContext:"decline-execute-code"}}
        @click=${()=>t.requestApproval?.onAnswer(!1)}
      >${m(l.declineActionRequestApproval)}</devtools-button>
      <devtools-button
        .data=${{variant:"primary",jslogContext:"accept-execute-code",iconName:"play"}}
        @click=${()=>t.requestApproval?.onAnswer(!0)}
      >${m(l.confirmActionRequestApproval)}</devtools-button>
    </div>
  </div>`:d.nothing}function jo(t){if(t.error){let e;switch(t.error){case"unknown":case"block":e=l.systemError;break;case"max-steps":e=l.maxStepsError;break;case"cross-origin":e=l.crossOriginError;break;case"abort":return c`<p class="aborted" jslog=${B.section("aborted")}>${m(l.stoppedResponse)}</p>`}return c`<p class="error" jslog=${B.section("error")}>${m(e)}</p>`}return d.nothing}function Oo(t){if(t.data===ce.AiConversation.NOT_FOUND_IMAGE_DATA)return c`<div class="unavailable-image" title=${l.imageUnavailable}>
      <devtools-icon name='file-image'></devtools-icon>
    </div>`;let e=`data:${t.mimeType};base64,${t.data}`;return c`<devtools-link
      class="image-link" title=${l.openImageInNewTab}
      href=${e}
    >
      <img src=${e} alt=${l.imageInputSentToTheModel} />
    </devtools-link>`}function Wo(t,e){let s=yt.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled,i=d.Directives.classMap({"ai-assistance-feedback-row":!0,"not-v2":!s});return c`
    <div class=${i}>
      <div class="action-buttons">
        ${t.showRateButtons?c`
          <devtools-button
            .data=${{variant:"icon",size:"SMALL",iconName:"thumb-up",toggledIconName:"thumb-up-filled",toggled:t.currentRating==="POSITIVE",toggleType:"primary-toggle",title:m(l.thumbsUp),jslogContext:"thumbs-up"}}
            @click=${()=>t.onRatingClick("POSITIVE")}
          ></devtools-button>
          <devtools-button
            .data=${{variant:"icon",size:"SMALL",iconName:"thumb-down",toggledIconName:"thumb-down-filled",toggled:t.currentRating==="NEGATIVE",toggleType:"primary-toggle",title:m(l.thumbsDown),jslogContext:"thumbs-down"}}
            @click=${()=>t.onRatingClick("NEGATIVE")}
          ></devtools-button>
          ${s?d.nothing:c`<div class="vertical-separator"></div>`}
        `:d.nothing}
        <devtools-button
          .data=${{variant:"icon",size:"SMALL",title:m(l.report),iconName:"report",jslogContext:"report"}}
          @click=${t.onReportClick}
        ></devtools-button>
        ${s?d.nothing:c`
          <div class="vertical-separator"></div>
          <devtools-button
            .data=${{variant:"icon",size:"SMALL",title:m(l.copyResponse),iconName:"copy",jslogContext:"copy-ai-response"}}
            aria-label=${m(l.copyResponse)}
            @click=${t.onCopyResponseClick}></devtools-button>
        `}
        ${t.onExportClick&&s&&t.isLastMessage?c`
          <devtools-button
            class="export-for-agents-button"
            .jslogContext=${"ai-export-for-agents"}
            .variant=${"outlined"}
            .iconName=${"copy"}
            aria-label=${m(l.exportForAgents)}
            @click=${t.onExportClick}
          >${m(l.exportForAgents)}</devtools-button>
          ${t.suggestions?c`<div class="vertical-separator"></div>`:d.nothing}
        `:d.nothing}
      </div>
      ${t.suggestions?c`<div class="suggestions-container">
        <div class="scroll-button-container left hidden" ${ft(o=>{e.suggestionsLeftScrollButtonContainer=o})}>
          <devtools-button
            class='scroll-button'
            .data=${{variant:"icon",size:"SMALL",iconName:"chevron-left",title:m(l.scrollToPrevious),jslogContext:"chevron-left"}}
            @click=${()=>t.scrollSuggestionsScrollContainer("left")}
          ></devtools-button>
        </div>
        <div class="suggestions-scroll-container" @scroll=${t.onSuggestionsScrollOrResize} ${ft(o=>{e.suggestionsScrollContainer=o})}>
          ${t.suggestions.map(o=>c`<devtools-button
            class='suggestion'
            .data=${{variant:"outlined",title:o,jslogContext:"suggestion"}}
            @click=${()=>t.onSuggestionClick(o)}
          >${o}</devtools-button>`)}
        </div>
        <div class="scroll-button-container right hidden" ${ft(o=>{e.suggestionsRightScrollButtonContainer=o})}>
          <devtools-button
            class='scroll-button'
            .data=${{variant:"icon",size:"SMALL",iconName:"chevron-right",title:m(l.scrollToNext),jslogContext:"chevron-right"}}
            @click=${()=>t.scrollSuggestionsScrollContainer("right")}
          ></devtools-button>
        </div>
      </div>`:d.nothing}
    </div>
    ${t.isShowingFeedbackForm?c`
      <form class="feedback-form" @submit=${t.onSubmit}>
        <div class="feedback-header">
          <h4 class="feedback-title">${m(l.whyThisRating)}</h4>
          <devtools-button
            aria-label=${m(l.close)}
            @click=${t.onClose}
            .data=${{variant:"icon",iconName:"cross",size:"SMALL",title:m(l.close),jslogContext:"close"}}
          ></devtools-button>
        </div>
        <input
          type="text"
          class="devtools-text-input feedback-input"
          @input=${o=>t.onInputChange(o.target.value)}
          placeholder=${m(l.provideFeedbackPlaceholder)}
          jslog=${B.textField("feedback").track({keydown:"Enter"})}
        >
        <span class="feedback-disclaimer">${m(l.disclaimer)}</span>
        <div>
          <devtools-button
          aria-label=${m(l.submit)}
          .data=${{type:"submit",disabled:t.isSubmitButtonDisabled,variant:"outlined",size:"SMALL",title:m(l.submit),jslogContext:"send"}}
          >${m(l.submit)}</devtools-button>
        </div>
      </div>
    </form>
    `:d.nothing}
  `}var He=class extends Gt.Widget.Widget{message={entity:"user",text:"",id:""};isLoading=!1;isReadOnly=!1;prompt="";canShowFeedbackForm=!1;isLastMessage=!1;isFirstMessage=!1;shouldShowCSSChangeSummary=!1;markdownRenderer;onSuggestionClick=()=>{};onFeedbackSubmit=()=>{};onCopyResponseClick=()=>{};onExportClick=()=>{};changeSummary;walkthrough={onOpen:()=>{},onToggle:()=>{},isInlined:!1,isExpanded:!1,activeSidebarMessage:null,inlineExpandedMessages:[]};#i=new ResizeObserver(()=>this.#g());#t=new ye.Throttler.Throttler(100);#s="";#a;#n=!1;#r=!0;#o;#p={};#e=!1;constructor(e,s){super(e),this.#o=s??Gs}wasShown(){super.wasShown(),this.performUpdate(),this.#h()}performUpdate(){let e=this.message.entity==="model"?ut(this.message):this.message;this.#o({message:e,isLoading:this.isLoading,isReadOnly:this.isReadOnly,canShowFeedbackForm:this.canShowFeedbackForm,markdownRenderer:this.markdownRenderer,isLastMessage:this.isLastMessage,isFirstMessage:this.isFirstMessage,prompt:this.prompt,shouldShowCSSChangeSummary:this.shouldShowCSSChangeSummary,onSuggestionClick:this.onSuggestionClick,onRatingClick:this.#c.bind(this),onReportClick:()=>_s.openInNewTab(yo),onCopyResponseClick:()=>{this.message.entity==="model"&&this.onCopyResponseClick(this.message)},onExportClick:this.onExportClick,scrollSuggestionsScrollContainer:this.#d.bind(this),onSuggestionsScrollOrResize:this.#g.bind(this),onSubmit:this.#f.bind(this),onClose:this.#u.bind(this),onInputChange:this.#m.bind(this),isSubmitButtonDisabled:this.#r,showActions:!(this.isLastMessage&&this.isLoading),showRateButtons:this.message.entity==="model"&&!!this.message.rpcId,suggestions:this.isLastMessage&&this.message.entity==="model"&&!this.isReadOnly&&this.message.parts.at(-1)?.type==="answer"?this.message.parts.at(-1).suggestions:void 0,currentRating:this.#a,isShowingFeedbackForm:this.#n,onFeedbackSubmit:this.onFeedbackSubmit,changeSummary:this.changeSummary,walkthrough:this.walkthrough},this.#p,this.contentElement),this.#p.suggestionsScrollContainer&&!this.#e&&(this.#i.observe(this.#p.suggestionsScrollContainer),this.#e=!0)}#m(e){this.#s=e;let s=!e;s!==this.#r&&(this.#r=s,this.performUpdate())}#h=()=>{let e=this.#p.suggestionsScrollContainer,s=this.#p.suggestionsLeftScrollButtonContainer,i=this.#p.suggestionsRightScrollButtonContainer;if(!e||!s||!i)return;let o=e.scrollLeft>Ws,a=e.scrollLeft+e.offsetWidth+Ws<e.scrollWidth;s.classList.toggle("hidden",!o),i.classList.toggle("hidden",!a)};willHide(){super.willHide(),this.#i.disconnect(),this.#e=!1}#g(){this.#t.schedule(()=>(this.#h(),Promise.resolve()))}#d(e){let s=this.#p.suggestionsScrollContainer;s&&s.scroll({top:0,left:e==="left"?s.scrollLeft-s.clientWidth:s.scrollLeft+s.clientWidth,behavior:"smooth"})}#c(e){if(this.#a===e){this.#a=void 0,this.#n=!1,this.#r=!0,this.message.entity==="model"&&this.message.rpcId&&this.onFeedbackSubmit(this.message.rpcId,"SENTIMENT_UNSPECIFIED"),this.performUpdate();return}this.#a=e,this.#n=this.canShowFeedbackForm,this.message.entity==="model"&&this.message.rpcId&&this.onFeedbackSubmit(this.message.rpcId,e),this.performUpdate()}#u(){this.#n=!1,this.#r=!0,this.performUpdate()}#f(e){e.preventDefault();let s=this.#s;!this.#a||!s||(this.message.entity==="model"&&this.message.rpcId&&this.onFeedbackSubmit(this.message.rpcId,this.#a,s),this.#n=!1,this.#r=!0,this.performUpdate())}};async function Vo(t){let{bounds:e,parsedTrace:s,track:i}=t.data,o=[];if(i==="main"){let v=Y.TimelinePanel.TimelinePanel.instance().getFlameChart().getMainDataProvider(),U=v.timelineData().groups.find(ge=>ge.name.startsWith("Main \u2014 "));U&&(o=v.groupTreeEvents(U)??[])}let a=Array.from(o);a.sort((u,v)=>u.ts-v.ts);let r=new Y.ThirdPartyTreeView.ThirdPartyTreeViewWidget,p=C.EntityMapper.EntityMapper.getOrCreate(s);return r.model={selectedEvents:a,parsedTrace:s,entityMapper:p},r.activeSelection=Y.TimelineSelection.selectionFromRangeMicroSeconds(e.min,e.max),r.refreshTree(!0),{renderedWidget:c`
    <devtools-widget
      ${q(bt.TimelineRangeSummaryView.TimelineRangeSummaryView,{data:{parsedTrace:s,events:o,isInAIWidget:!0,startTime:C.Helpers.Timing.microToMilli(e.min),endTime:C.Helpers.Timing.microToMilli(e.max),thirdPartyTreeTemplate:c`${q(Y.ThirdPartyTreeView.ThirdPartyTreeViewWidget,{maxRows:10,isInAIWidget:!0,model:{selectedEvents:r.selectedEvents??null,parsedTrace:s,entityMapper:r.entityMapper()},activeSelection:{bounds:e},onBottomUpButtonClicked:u=>{ye.Revealer.reveal(new Ie.Helpers.RevealableBottomUpProfile(e,u??void 0))}})}`}})}
    ></devtools-widget>`,revealable:new Ie.Helpers.RevealableTimeRange(e),accessibleRevealLabel:m(l.revealPerformanceSummary),title:m(l.performanceSummary),jslogContext:"timeline-range-summary"}}var Zs=`*{box-sizing:border-box;margin:0;padding:0}:host{width:100%;height:100%;user-select:text;display:flex;flex-direction:column;background-color:var(--sys-color-cdt-base-container)}.chat-ui{width:100%;height:100%;max-height:100%;display:flex;flex-direction:column;container-type:size;container-name:--chat-ui-container}.info-tooltip-container{max-width:var(--sys-size-28);padding:var(--sys-size-4) var(--sys-size-5)}.tooltip-link{display:block;margin-top:var(--sys-size-4);color:var(--sys-color-primary);padding-left:0}.chat-cancel-context-button{padding-bottom:3px;padding-right:var(--sys-size-3)}.messages-container{flex-grow:1;width:100%;max-width:var(--sys-size-36);@container (width > 688px){--half-scrollbar-width:calc((100cqw - 100%) / 2);margin-left:var(--half-scrollbar-width);margin-right:calc(-1 * var(--half-scrollbar-width))}}.link{color:var(--text-link);text-decoration:underline;cursor:pointer}button.link{border:none;background:none;font:inherit;&:focus-visible{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring);outline-offset:0;border-radius:var(--sys-shape-corner-extra-small)}}.select-an-element-text{margin-left:2px}main{overflow:hidden auto;display:flex;flex-direction:column;align-items:center;height:100%;container-type:size;scrollbar-width:thin;transform:translateZ(1px);scroll-timeline:--scroll-timeline y}.empty-state-container{flex-grow:1;display:grid;align-items:center;justify-content:center;font:var(--sys-typescale-headline4);gap:var(--sys-size-8);padding:var(--sys-size-4);max-width:var(--sys-size-33);@container (width > 688px){--half-scrollbar-width:calc((100cqw - 100%) / 2);margin-left:var(--half-scrollbar-width);margin-right:calc(-1 * var(--half-scrollbar-width))}.header{display:flex;flex-direction:column;width:100%;align-items:center;justify-content:center;align-self:end;gap:var(--sys-size-5);.icon{display:flex;justify-content:center;align-items:center;height:var(--sys-size-14);width:var(--sys-size-14);border-radius:var(--sys-shape-corner-small);background:linear-gradient(135deg,var(--sys-color-gradient-primary),var(--sys-color-gradient-tertiary))}h1{font:var(--sys-typescale-headline4)}p{text-align:center;font:var(--sys-typescale-body4-regular)}}.empty-state-content{display:flex;flex-direction:column;gap:var(--sys-size-5);align-items:center;justify-content:center;align-self:start}}.gemini{.empty-state-container{padding:var(--sys-size-8)}.empty-state-container .icon{display:none}.empty-state-container .header{align-items:flex-start;line-height:var(--sys-size-4)}.empty-state-content{align-items:flex-start}.empty-state-container .greeting{font-size:var(--sys-size-10);color:var(--sys-color-primary)}.empty-state-container .cta{font-size:var(--sys-size-10)}main{align-items:flex-start}}.change-summary{background-color:var(--sys-color-surface3);border-radius:var(--sys-shape-corner-medium-small);position:relative;margin:0 var(--sys-size-5) var(--sys-size-7) var(--sys-size-5);padding:0 var(--sys-size-5);&.saved-to-disk{pointer-events:none}& .header-container{display:flex;align-items:center;gap:var(--sys-size-3);height:var(--sys-size-14);padding-left:var(--sys-size-3);devtools-spinner{width:var(--sys-size-6);height:var(--sys-size-6);margin-left:var(--sys-size-3);margin-right:var(--sys-size-3)}& devtools-icon.summary-badge{width:var(--sys-size-8);height:var(--sys-size-8)}& .green-bright-icon{color:var(--sys-color-green-bright)}& .on-tonal-icon{color:var(--sys-color-on-tonal-container)}& .header-text{font:var(--sys-typescale-body4);color:var(--sys-color-on-surface);white-space:nowrap;overflow-x:hidden;text-overflow:ellipsis}& .arrow{margin-left:auto}&::marker{content:''}}&:not(.saved-to-disk, &[open]):hover::after{content:'';height:100%;width:100%;border-radius:inherit;position:absolute;top:0;left:0;pointer-events:none;background-color:var(--sys-color-state-hover-on-subtle)}&[open]:not(.saved-to-disk){&::details-content{height:fit-content;padding:var(--sys-size-2) 0;border-radius:inherit}summary .arrow{transform:rotate(180deg)}}devtools-code-block{margin-bottom:var(--sys-size-5);--code-block-background-color:var(--sys-color-surface1)}.error-container{display:flex;align-items:center;gap:var(--sys-size-3);color:var(--sys-color-error)}.footer{display:flex;flex-flow:row wrap;justify-content:space-between;margin:var(--sys-size-5) 0 var(--sys-size-5) var(--sys-size-2);gap:var(--sys-size-6) var(--sys-size-5);.disclaimer-link{align-self:center}.left-side{flex-grow:1;display:flex;align-self:center;gap:var(--sys-size-3)}.save-or-discard-buttons{flex-grow:1;display:flex;justify-content:flex-end;gap:var(--sys-size-3)}.change-workspace{display:flex;flex-direction:row;align-items:center;gap:var(--sys-size-3);min-width:var(--sys-size-22);flex:1 1 40%;.folder-name{white-space:nowrap;overflow-x:hidden;text-overflow:ellipsis}}.loading-text-container{margin-right:var(--sys-size-3);display:flex;justify-content:center;align-items:center;gap:var(--sys-size-3)}.apply-to-workspace-container{display:flex;align-items:center;gap:var(--sys-size-3);min-width:fit-content;justify-content:flex-end;flex-grow:1;flex-shrink:1;devtools-icon{width:18px;height:18px;margin-left:var(--sys-size-2)}}}}@keyframes reveal{0%,
  99%{opacity:100%}100%{opacity:0%}}.sticky{position:sticky;bottom:0;z-index:9999}.chat-input-widget{width:100%;max-width:var(--sys-size-36);background-color:var(--sys-color-cdt-base-container);box-shadow:0 1px var(--sys-color-cdt-base-container);@container (width > 688px){--half-scrollbar-width:calc((100cqw - 100%) / 2);margin-left:var(--half-scrollbar-width);margin-right:calc(-1 * var(--half-scrollbar-width))}@container (height < 224px){margin-top:var(--sys-size-4);margin-bottom:var(--sys-size-4);position:static}@container --chat-ui-container (width < 400px){padding-bottom:var(--sys-size-1)}}
/*# sourceURL=${import.meta.resolve("././components/chatView.css")} */`;var ai={};G(ai,{DEFAULT_VIEW:()=>oi,ExportForAgentsDialog:()=>_e});import"./../../ui/components/spinners/spinners.js";import*as ti from"./../../core/host/host.js";import*as Kt from"./../../core/i18n/i18n.js";import"./../../ui/components/buttons/buttons.js";import*as si from"./../../ui/components/snackbars/snackbars.js";import*as xt from"./../../ui/legacy/legacy.js";import*as Jt from"./../../ui/lit/lit.js";import*as ii from"./../../ui/visual_logging/visual_logging.js";var Xs=`@scope to (devtools-widget > *){:scope{width:100%;box-shadow:none;padding:var(--sys-size-8);background-color:var(--sys-color-surface);border-radius:var(--sys-shape-corner-medium)}.export-for-agents-dialog{width:var(--sys-size-33);max-width:100%}.export-for-agents-dialog header{margin-bottom:var(--sys-size-6);h1{font:var(--sys-typescale-headline5);margin:0;color:var(--sys-color-on-surface)}}.export-for-agents-dialog .state-selection{display:flex;gap:var(--sys-size-5);margin:var(--sys-size-7) 0}.export-for-agents-dialog .state-selection label{display:flex;align-items:center;gap:var(--sys-size-2);cursor:pointer;font:var(--sys-typescale-body3-regular);input{margin-bottom:0}}.export-for-agents-dialog textarea{width:100%;min-height:var(--sys-size-30);max-height:var(--sys-size-34);resize:none;padding:var(--sys-size-5);box-sizing:border-box;font-family:var(--monospace-font-family);font-size:var(--monospace-font-size);background-color:var(--sys-color-surface5);color:var(--sys-color-on-surface);border-radius:var(--sys-shape-corner-small);border:none}main{position:relative}.prompt-loading{position:absolute;padding:var(--sys-size-5);display:flex;align-items:center;justify-content:flex-start;gap:var(--sys-size-5)}.export-for-agents-dialog .disclaimer{margin-top:var(--sys-size-5);font:var(--sys-typescale-body4-regular);color:var(--sys-color-on-surface-subtle)}.export-for-agents-dialog footer{display:flex;justify-content:flex-end;margin-top:var(--sys-size-6)}.export-for-agents-dialog .right-buttons{display:flex;gap:var(--sys-size-5)}}
/*# sourceURL=${import.meta.resolve("././components/exportForAgentsDialog.css")} */`;var{html:wt,render:Bo}=Jt,F={exportForAgents:"Copy to coding agent",copyToClipboard:"Copy to clipboard",copiedToClipboard:"Copied to clipboard",asPrompt:"As prompt",asMarkdown:"As markdown",saveAsMarkdown:"Save as\u2026",generatingSummary:"Generating summary\u2026",disclaimer:"This is an experimental AI feature and won\u2019t always get it right. Double check this text before pasting into another tool."},qo=Kt.i18n.registerUIStrings("panels/ai_assistance/components/ExportForAgentsDialog.ts",F),z=Kt.i18n.getLocalizedString.bind(void 0,qo),ei="prompt",oi=(t,e,s)=>{let i=t.state.activeType==="prompt",o=z(i?F.copyToClipboard:F.saveAsMarkdown),a=i?t.state.promptText:t.state.conversationText;Bo(wt`
    <style>${Xs}</style>
    <div class="export-for-agents-dialog" jslog=${ii.dialog("ai-export-for-agents")}>
      <header>
        <h1 id="export-for-agents-dialog-title" tabindex="-1">
          ${z(F.exportForAgents)}
        </h1>
      </header>
      <div class="state-selection" role="radiogroup" aria-labelledby="export-for-agents-dialog-title">
        <label>
          <input
            type="radio"
            value="prompt"
            name="export-state"
            .checked=${i}
            autofocus
            aria-label=${z(F.asPrompt)}
            @change=${()=>t.onStateChange("prompt")}
          >
          ${z(F.asPrompt)}
        </label>
        <label>
          <input
            type="radio"
            value="conversation"
            name="export-state"
            .checked=${!i}
            aria-label=${z(F.asMarkdown)}
            @change=${()=>t.onStateChange("conversation")}
          >
          ${z(F.asMarkdown)}
        </label>
      </div>
      <main>
        ${i&&t.state.isPromptLoading?wt`
          <span class="prompt-loading">
            <devtools-spinner></devtools-spinner>
            ${z(F.generatingSummary)}
          </span>
          `:Jt.nothing}
        ${i?wt`<textarea class="prompt" readonly .value=${t.state.isPromptLoading?"":a}></textarea>`:wt`<textarea class="conversation" readonly .value=${a}></textarea>`}
      </main>
      <div class="disclaimer">${z(F.disclaimer)}</div>
      <footer>
        <div class="right-buttons">
          <devtools-button
            @click=${t.onButtonClick}
            .jslogContext=${t.jslogContext}
            .variant=${"primary"}
            .disabled=${i&&t.state.isPromptLoading}
            .accessibleLabel=${o}
          >
            ${o}
          </devtools-button>
        </div>
      </footer>
    </div>
  `,s)},_e=class t extends xt.Widget.VBox{static#i=ei;#t;#s;#a;#n;constructor(e,s=oi){super(),this.#s=e.dialog,this.#a={activeType:t.#i,promptText:typeof e.promptText=="string"?e.promptText:"",conversationText:e.markdownText,isPromptLoading:typeof e.promptText!="string"},this.#n=e.onConversationSaveAs,this.#t=s,typeof e.promptText!="string"&&e.promptText.then(i=>{this.#a.promptText=i,this.#a.isPromptLoading=!1,this.requestUpdate()}),this.requestUpdate()}static clearPersistedViewState(){t.#i=ei}#r=e=>{this.#a.activeType=e,t.#i=e,this.requestUpdate()};performUpdate(){let e,s="";switch(this.#a.activeType){case"prompt":s="ai-export-for-agents.copy-to-clipboard",e=o=>{o.preventDefault(),ti.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(this.#a.promptText),si.Snackbar.Snackbar.show({message:z(F.copiedToClipboard)}).setAttribute("aria-label",z(F.copiedToClipboard)),this.#s.hide()};break;case"conversation":s="ai-export-for-agents.save-as-markdown",e=()=>{this.#s.hide(),this.#n()};break}let i={onButtonClick:e,state:this.#a,onStateChange:this.#r,jslogContext:s};this.#t(i,void 0,this.contentElement)}static show({promptText:e,markdownText:s,onConversationSaveAs:i}){let o=new xt.Dialog.Dialog;o.setAriaLabel(z(F.exportForAgents)),o.setOutsideClickCallback(r=>{r.consume(!0),o.hide()}),o.addCloseButton(),o.setSizeBehavior("MeasureContent"),o.setDimmed(!0);let a=new t({dialog:o,promptText:e,markdownText:s,onConversationSaveAs:i});a.show(o.contentElement),a.updateComplete.then(()=>{o.show()})}};var{ref:Yt,repeat:Ko,classMap:ni}=Ho,{widget:Qt}=gi.Widget,ri={emptyStateText:"How can I help you?",emptyStateTextGemini:"Where should we start?"},li=ci.i18n.lockedString,Jo=1;function Yo(t,e){let s=t.filter(o=>o.entity==="model"),i=s.at(-1);if(i)return e&&t.at(-1)===i?s.at(-2):i}var Qo=(t,e,s)=>{let i=!!di.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled,o=ni({"chat-ui":!0,gemini:Zt.AiUtils.isGeminiBranding(),"ai-v2":i}),a=ni({"chat-input-widget":!0,sticky:!t.isReadOnly}),r=!i&&!t.isLoading,p=Yo(t.messages,t.isLoading);Go(Le`
      <style>${Zs}</style>
      <div class=${o}>
        <main @scroll=${t.handleScroll} ${Yt(n=>{e.mainElement=n})}>
          ${t.messages.length>0?Le`
            <div class="messages-container" ${Yt(t.handleMessageContainerRef)}>
              ${Ko(t.messages,n=>n.id,(n,u)=>{let v=u>0?t.messages[u-1]:null,U=n.entity==="model"&&v?.entity==="user"?v.text:"";return Qt(He,{message:n,isLoading:t.isLoading&&u===t.messages.length-1,isReadOnly:t.isReadOnly,canShowFeedbackForm:t.canShowFeedbackForm,markdownRenderer:t.markdownRenderer,isLastMessage:u===t.messages.length-1,isFirstMessage:u===0,prompt:U,shouldShowCSSChangeSummary:n.id===p?.id,onSuggestionClick:t.handleSuggestionClick,onFeedbackSubmit:t.onFeedbackSubmit,onCopyResponseClick:t.onCopyResponseClick,onExportClick:t.exportForAgentsClick,changeSummary:t.changeSummary,walkthrough:{...t.walkthrough}})})}
              ${r?Qt(Fe,{changeSummary:t.changeSummary??"",changeManager:t.changeManager}):_o}
            </div>
          `:Le`
            <div class="empty-state-container">
              <div class="header">
                <div class="icon">
                  <devtools-icon
                    name="smart-assistant"
                  ></devtools-icon>
                </div>
                ${Zt.AiUtils.isGeminiBranding()?Le`
                    <h1 class='greeting'>Hello</h1>
                    <p class='cta'>${li(ri.emptyStateTextGemini)}</p>
                  `:Le`<h1>${li(ri.emptyStateText)}</h1>`}
              </div>
              <div class="empty-state-content">
                ${t.emptyStateSuggestions.map(({title:n,jslogContext:u})=>Le`<devtools-button
                    class="suggestion"
                    @click=${()=>t.handleSuggestionClick(n)}
                    .data=${{variant:"outlined",size:"REGULAR",title:n,jslogContext:u??"suggestion",disabled:t.isTextInputDisabled}}
                  >${n}</devtools-button>`)}
              </div>
            </div>
          `}
          <devtools-widget class=${a} ${Qt(Se,{isLoading:t.isLoading,blockedByCrossOrigin:t.blockedByCrossOrigin,isTextInputDisabled:t.isTextInputDisabled,inputPlaceholder:t.inputPlaceholder,disclaimerText:t.disclaimerText,context:t.context,isContextSelected:t.isContextSelected,inspectElementToggled:t.inspectElementToggled,multimodalInputEnabled:t.multimodalInputEnabled??!1,conversationType:t.conversationType,uploadImageInputEnabled:t.uploadImageInputEnabled??!1,isReadOnly:t.isReadOnly,onContextClick:t.onContextClick,onInspectElementClick:t.onInspectElementClick,onTextSubmit:t.onTextSubmit,onCancelClick:t.onCancelClick,onNewConversation:t.onNewConversation,onContextRemoved:t.onContextRemoved,onContextAdd:t.onContextAdd})} ${Yt(n=>{e.input=n})}></devtools-widget>
        </main>
      </div>
    `,s)},Ge=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#t;#s;#a;#n={};#r=new ResizeObserver(()=>this.#h());#o=!0;#p=!1;#e;#m=null;constructor(e,s=Qo){super(),this.#s=e,this.#e=s}set props(e){this.#s=e,this.#v()}connectedCallback(){this.#v(),this.#a&&this.#r.observe(this.#a)}disconnectedCallback(){this.#r.disconnect()}focusTextInput(){let e=this.#i.querySelector(".chat-input");e&&e.focus()}setInputValue(e){this.#n.input?.getWidget()?.setInputValue(e)}restoreScrollPosition(){this.#t!==void 0&&this.#n.mainElement&&this.#g(this.#t)}scrollToBottom(){this.#n.mainElement&&this.#g(this.#n.mainElement.scrollHeight)}#h(){this.#o&&this.#n.mainElement&&this.#o&&this.#g(this.#n.mainElement.scrollHeight)}#g(e){this.#n.mainElement&&(this.#t=e,this.#p=!0,this.#n.mainElement.scrollTop=e)}#d=e=>{this.#a=e,e?this.#r.observe(e):(this.#o=!0,this.#r.disconnect())};#c=e=>{if(!(!e.target||!(e.target instanceof HTMLElement))){if(this.#p){this.#p=!1;return}this.#t=e.target.scrollTop,this.#o=e.target.scrollTop+e.target.clientHeight+Jo>e.target.scrollHeight}};#u=e=>{this.#n.input?.getWidget()?.setInputValue(e),this.#v(),this.focusTextInput(),kt.userMetrics.actionTaken(kt.UserMetrics.Action.AiAssistanceDynamicSuggestionClicked)};async#f(){let e=this.#s.conversationMarkdown.replace(/\*\*Export Timestamp \(UTC\):\*\* .*\n\n/,"");if(this.#m?.markdown===e)return this.#m.summary;try{let s=await this.#s.generateConversationSummary(this.#s.conversationMarkdown);return this.#m={markdown:e,summary:s},s}catch(s){return console.error(s),"Failed to generate summary."}}async#b(){let e=this.#f();_e.show({promptText:e,markdownText:this.#s.conversationMarkdown,onConversationSaveAs:this.#s.onExportConversation??(async()=>{})})}#v(){this.#e({...this.#s,handleScroll:this.#c,handleSuggestionClick:this.#u,handleMessageContainerRef:this.#d,exportForAgentsClick:this.#b.bind(this)},this.#n,this.#i)}};customElements.define("devtools-ai-chat-view",Ge);var fi={};G(fi,{DEFAULT_VIEW:()=>ui,DisabledWidget:()=>Qe});import"./../../core/host/host.js";import*as Xt from"./../../core/i18n/i18n.js";import*as pi from"./../../core/root/root.js";import*as Ke from"./../../ui/i18n/i18n.js";import*as $e from"./../../ui/legacy/legacy.js";import{html as Ye,render as Zo}from"./../../ui/lit/lit.js";import*as mi from"./../../ui/visual_logging/visual_logging.js";var hi=`@scope to (devtools-widget > *){.disabled-view{display:flex;max-width:var(--sys-size-34);border-radius:var(--sys-shape-corner-small);box-shadow:var(--sys-elevation-level3);background-color:var(--app-color-card-background);font:var(--sys-typescale-body4-regular);text-wrap:pretty;padding:var(--sys-size-6) var(--sys-size-8);margin:var(--sys-size-4);line-height:var(--sys-size-9);.disabled-view-icon-container{flex-shrink:0;border-radius:var(--sys-shape-corner-extra-small);width:var(--sys-size-9);height:var(--sys-size-9);background:linear-gradient(135deg,var(--sys-color-gradient-primary),var(--sys-color-gradient-tertiary));margin-right:var(--sys-size-5);devtools-icon{margin:var(--sys-size-2);width:var(--sys-size-8);height:var(--sys-size-8)}}}.link{color:var(--text-link);text-decoration:underline;cursor:pointer}}
/*# sourceURL=${import.meta.resolve("././components/disabledWidget.css")} */`;var se={notLoggedIn:"This feature is only available when you are signed into Chrome with your Google account",offline:"Check your internet connection and try again",settingsLink:"AI assistance in Settings",turnOnForStyles:"Turn on {PH1} to get help with understanding CSS styles",turnOnForStylesAndRequests:"Turn on {PH1} to get help with styles and network requests",turnOnForStylesRequestsAndFiles:"Turn on {PH1} to get help with styles, network requests, and files",turnOnForStylesRequestsPerformanceAndFiles:"Turn on {PH1} to get help with styles, network requests, performance, and files",notAvailableInIncognitoMode:"AI assistance is not available in Incognito mode or Guest mode"},Je=Xt.i18n.registerUIStrings("panels/ai_assistance/components/DisabledWidget.ts",se),Ct=Xt.i18n.getLocalizedString.bind(void 0,Je);function Xo(t){switch(t){case"no-account-email":case"sync-is-paused":return Ye`${Ct(se.notLoggedIn)}`;case"no-internet":return Ye`${Ct(se.offline)}`}}function ea(t){if(t.isOffTheRecord)return Ye`${Ct(se.notAvailableInIncognitoMode)}`;let e=document.createElement("span");e.textContent=Ct(se.settingsLink),e.classList.add("link"),$e.ARIAUtils.markAsLink(e),e.addEventListener("click",()=>{$e.ViewManager.ViewManager.instance().showView("chrome-ai")}),e.setAttribute("jslog",`${mi.action("open-ai-settings").track({click:!0})}`);let s;return t.devToolsAiAssistancePerformanceAgent?.enabled?s=Ke.getFormatLocalizedString(Je,se.turnOnForStylesRequestsPerformanceAndFiles,{PH1:e}):t.devToolsAiAssistanceFileAgent?.enabled?s=Ke.getFormatLocalizedString(Je,se.turnOnForStylesRequestsAndFiles,{PH1:e}):t.devToolsAiAssistanceNetworkAgent?.enabled?s=Ke.getFormatLocalizedString(Je,se.turnOnForStylesAndRequests,{PH1:e}):s=Ke.getFormatLocalizedString(Je,se.turnOnForStyles,{PH1:e}),Ye`${s}`}var ui=(t,e,s)=>{Zo(Ye`
      <style>
        ${hi}
      </style>
      <div class="disabled-view">
        <div class="disabled-view-icon-container">
          <devtools-icon name="smart-assistant"></devtools-icon>
        </div>
        <div>
          ${t.aidaAvailability==="available"?ea(t.hostConfig):Xo(t.aidaAvailability)}
        </div>
      </div>
    `,s)},Qe=class extends $e.Widget.Widget{aidaAvailability="no-account-email";#i;constructor(e,s=ui){super(e),this.#i=s}wasShown(){super.wasShown(),this.requestUpdate()}performUpdate(){let e=pi.Runtime.hostConfig;this.#i({aidaAvailability:this.aidaAvailability,hostConfig:e},{},this.contentElement)}};var Ci={};G(Ci,{DEFAULT_VIEW:()=>ki,ExploreWidget:()=>Ze});import*as wi from"./../../core/i18n/i18n.js";import*as xi from"./../../core/root/root.js";import*as j from"./../../ui/legacy/legacy.js";import{html as es,render as ta}from"./../../ui/lit/lit.js";import*as ts from"./../../ui/visual_logging/visual_logging.js";var vi=`@scope to (devtools-widget > *){.ai-assistance-explore-container{&,
    *{box-sizing:border-box;margin:0;padding:0}width:100%;height:fit-content;display:flex;flex-direction:column;align-items:center;margin:auto 0;font:var(--sys-typescale-headline4);gap:var(--sys-size-8);padding:var(--sys-size-3);overflow:auto;scrollbar-gutter:stable both-edges;.link{padding:0;margin:0 3px}.header{flex-shrink:0;display:flex;flex-direction:column;width:100%;align-items:center;justify-content:center;justify-self:center;gap:var(--sys-size-4);.icon{display:flex;justify-content:center;align-items:center;height:var(--sys-size-14);width:var(--sys-size-14);border-radius:var(--sys-shape-corner-small);background:linear-gradient(135deg,var(--sys-color-gradient-primary),var(--sys-color-gradient-tertiary))}h1{font:var(--sys-typescale-headline4)}p{text-align:center;font:var(--sys-typescale-body4-regular)}.link{font:var(--sys-typescale-body4-regular)}}.content{flex-shrink:0;display:flex;flex-direction:column;gap:var(--sys-size-5);align-items:center;justify-content:center;justify-self:center}.feature-card{display:flex;padding:var(--sys-size-4) var(--sys-size-6);gap:10px;background-color:var(--sys-color-surface2);border-radius:var(--sys-shape-corner-medium-small);width:100%;align-items:center;.feature-card-icon{min-width:var(--sys-size-12);min-height:var(--sys-size-12);display:flex;justify-content:center;align-items:center;background-color:var(--sys-color-tonal-container);border-radius:var(--sys-shape-corner-full);devtools-icon{width:18px;height:18px}}.feature-card-content{h3{font:var(--sys-typescale-body3-medium)}p{font:var(--sys-typescale-body4-regular);line-height:18px}}}}.ai-assistance-explore-footer{flex-shrink:0;width:100%;display:flex;justify-content:center;align-items:center;padding-block:var(--sys-size-3);font:var(--sys-typescale-body5-regular);border-top:1px solid var(--sys-color-divider);text-wrap:balance;text-align:center;p{margin:0;padding:0}}}
/*# sourceURL=${import.meta.resolve("././components/exploreWidget.css")} */`;var yi={Explore:"Explore AI assistance",learnAbout:"Learn about AI in DevTools"},bi=wi.i18n.lockedString,ki=(t,e,s)=>{function i(o){return es`Open
     <button
       class="link"
       role="link"
       jslog=${ts.link(o.jslogContext).track({click:!0})}
       @click=${o.onClick}
     >${o.panelName}</button>
     ${o.text}`}ta(es`
      <style>
        ${vi}
      </style>
      <div class="ai-assistance-explore-container">
        <div class="header">
          <div class="icon">
            <devtools-icon name="smart-assistant"></devtools-icon>
          </div>
          <h1>${bi(yi.Explore)}</h1>
          <p>
            To chat about an item, right-click and select${" "}
            <strong>Ask AI</strong>.
            <button
              class="link"
              role="link"
              jslog=${ts.link("open-ai-settings").track({click:!0})}
              @click=${()=>{j.ViewManager.ViewManager.instance().showView("chrome-ai")}}
            >${bi(yi.learnAbout)}
            </button>
          </p>
        </div>
        <div class="content">
          ${t.featureCards.map(o=>es`
              <div class="feature-card">
                <div class="feature-card-icon">
                  <devtools-icon name=${o.icon}></devtools-icon>
                </div>
                <div class="feature-card-content">
                  <h3>${o.heading}</h3>
                  <p>${i(o)}</p>
                </div>
              </div>
            `)}
        </div>
      </div>
    `,s)},Ze=class extends j.Widget.Widget{#i;constructor(e,s=ki){super(e),this.#i=s}wasShown(){super.wasShown(),this.requestUpdate()}performUpdate(){let e=xi.Runtime.hostConfig,s=[];e.devToolsFreestyler?.enabled&&j.ViewManager.ViewManager.instance().hasView("elements")&&s.push({icon:"brush-2",heading:"CSS styles",jslogContext:"open-elements-panel",onClick:()=>{j.ViewManager.ViewManager.instance().showView("elements")},panelName:"Elements",text:"to ask about CSS styles"}),e.devToolsAiAssistanceNetworkAgent?.enabled&&j.ViewManager.ViewManager.instance().hasView("network")&&s.push({icon:"arrow-up-down",heading:"Network",jslogContext:"open-network-panel",onClick:()=>{j.ViewManager.ViewManager.instance().showView("network")},panelName:"Network",text:"to ask about a request's details"}),e.devToolsAiAssistanceFileAgent?.enabled&&j.ViewManager.ViewManager.instance().hasView("sources")&&s.push({icon:"document",heading:"Files",jslogContext:"open-sources-panel",onClick:()=>{j.ViewManager.ViewManager.instance().showView("sources")},panelName:"Sources",text:"to ask about a file's content"}),e.devToolsAiAssistancePerformanceAgent?.enabled&&j.ViewManager.ViewManager.instance().hasView("timeline")&&s.push({icon:"performance",heading:"Performance",jslogContext:"open-performance-panel",onClick:()=>{j.ViewManager.ViewManager.instance().showView("timeline")},panelName:"Performance",text:"to ask about a trace item"}),this.#i({featureCards:s},{},this.contentElement)}};var Ii={};G(Ii,{DEFAULT_VIEW:()=>Ai,OptInChangeDialog:()=>Xe});import*as is from"./../../core/i18n/i18n.js";import*as ss from"./../../core/root/root.js";import"./../../ui/components/buttons/buttons.js";import*as St from"./../../ui/legacy/legacy.js";import*as sa from"./../../ui/lit/lit.js";import*as Ti from"./../../ui/visual_logging/visual_logging.js";var Si=`@scope to (devtools-widget > *){:scope{width:100%;box-shadow:none;padding:var(--sys-size-8);background-color:var(--sys-color-surface);border-radius:var(--sys-shape-corner-medium)}.opt-in-change-dialog{width:var(--sys-size-33);max-width:100%}header{display:flex;flex-direction:row;align-items:center;gap:var(--sys-size-8);margin-bottom:var(--sys-size-8);h1{margin:0;color:var(--sys-color-on-surface);font:var(--sys-typescale-headline5)}.header-icon-container{background:linear-gradient(135deg,var(--sys-color-gradient-primary),var(--sys-color-gradient-tertiary));border-radius:var(--sys-size-4);height:var(--sys-size-14);width:var(--sys-size-14);display:flex;align-items:center;justify-content:center;devtools-icon{width:var(--sys-size-9);height:var(--sys-size-9)}}}main{background-color:var(--sys-color-surface4);border-radius:var(--sys-shape-corner-medium-small);padding:var(--sys-size-8);display:flex;flex-direction:column;gap:var(--sys-size-6);margin-bottom:var(--sys-size-8);.item{display:flex;flex-direction:row;align-items:center;gap:var(--sys-size-8);devtools-icon{width:var(--sys-size-8);height:var(--sys-size-8);flex-shrink:0;color:var(--sys-color-on-surface-subtle)}.text{font:var(--sys-typescale-body4);color:var(--sys-color-on-surface)}}}footer{display:flex;flex-direction:row;align-items:center;justify-content:flex-end;.right-buttons{display:flex;gap:var(--sys-size-5)}}}
/*# sourceURL=${import.meta.resolve("././components/optInChangeDialog.css")} */`;var{html:ia,render:oa}=sa,H={title:"AI assistance just got better",integrationPoint:"AI assistance is now integrated with Application and Lighthouse panels, and pulls context from data sources simultaneously",widgetPoint:"Use widgets to verify results or jump to source data for select debugging cases",privacyDisclaimer:"Chat messages, data accessible for this site via DevTools panels and Web APIs, and items you select such as network requests, files, and performance traces are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",privacyDisclaimerEnterpriseNoLogging:"Chat messages, data accessible for this site via DevTools panels and Web APIs, and items you select such as network requests, files, and performance traces are sent to Google. The content submitted to and generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",manageSettings:"Manage in settings",gotIt:"Got it"},aa=is.i18n.registerUIStrings("panels/ai_assistance/components/OptInChangeDialog.ts",H),Q=is.i18n.getLocalizedString.bind(void 0,aa),Ai=(t,e,s)=>{let i=t.loggingEnabled?Q(H.privacyDisclaimer):Q(H.privacyDisclaimerEnterpriseNoLogging);oa(ia`
    <style>${Si}</style>
    <div class="opt-in-change-dialog" jslog=${Ti.dialog("ai-v2-opt-in-change-dialog")}>
      <header>
        <div class="header-icon-container">
          <devtools-icon name="smart-assistant" role="presentation"></devtools-icon>
        </div>
        <h1 tabindex="-1">
          ${Q(H.title)}
        </h1>
      </header>
      <main>
        <div class="item">
          <devtools-icon name="lightbulb-spark" role="presentation"></devtools-icon>
          <div class="text">${Q(H.integrationPoint)}</div>
        </div>
        <div class="item">
          <devtools-icon name="flowsheet" role="presentation"></devtools-icon>
          <div class="text">${Q(H.widgetPoint)}</div>
        </div>
        <div class="item">
          <devtools-icon name="google" role="presentation"></devtools-icon>
          <div class="text">${i}</div>
        </div>
      </main>
      <footer>
        <div class="right-buttons">
          <devtools-button
            @click=${t.onManageSettings}
            .jslogContext=${"ai-assistance-v2-opt-in.manage-settings"}
            .variant=${"outlined"}
            .accessibleLabel=${Q(H.manageSettings)}
          >
            ${Q(H.manageSettings)}
          </devtools-button>
          <devtools-button
            @click=${t.onGotIt}
            .jslogContext=${"ai-assistance-v2-opt-in.got-it"}
            .variant=${"primary"}
            .accessibleLabel=${Q(H.gotIt)}
          >
            ${Q(H.gotIt)}
          </devtools-button>
        </div>
      </footer>
    </div>
  `,s)},Xe=class t extends St.Widget.VBox{#i;#t;#s;constructor(e,s=Ai){super(),this.#t=e.onGotIt,this.#s=e.onManageSettings,this.#i=s,this.requestUpdate()}performUpdate(){let e=ss.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue!==ss.Runtime.GenAiEnterprisePolicyValue.ALLOW_WITHOUT_LOGGING,s={onGotIt:this.#t,onManageSettings:this.#s,loggingEnabled:e};this.#i(s,void 0,this.contentElement)}focusTitle(){this.contentElement.querySelector("h1")?.focus()}static show(e){let s=new St.Dialog.Dialog;s.setAriaLabel(Q(H.title)),s.setOutsideClickCallback(o=>o.consume(!0)),s.setCloseOnEscape(!1),s.setSizeBehavior("MeasureContent"),s.setDimmed(!0);let i=new t({onGotIt:()=>{s.hide(),e.onGotIt()},onManageSettings:()=>{s.hide(),e.onManageSettings()}});i.show(s.contentElement),i.updateComplete.then(()=>{s.show(),i.focusTitle()})}};import*as Li from"./../../core/common/common.js";import*as Me from"./../../core/sdk/sdk.js";import*as $i from"./../../models/trace/trace.js";import*as Tt from"./../../ui/lit/lit.js";import*as Mi from"./../common/common.js";var{html:os}=Tt.StaticHtml,{until:na}=Tt.Directives,et=class extends K{mainFrameId;lookupEvent;constructor(e="",s=()=>null){super(),this.mainFrameId=e,this.lookupEvent=s}templateForToken(e){if(e.type==="link"&&e.href.startsWith("#")){if(e.href.startsWith("#node-")){let a=Number(e.href.replace("#node-",""));return os`<span>${na(this.#i(a,e.text).then(r=>r||e.text),e.text)}</span>`}let s=this.lookupEvent(e.href.slice(1));if(!s)return os`${e.text}`;let i=e.text,o="";return $i.Types.Events.isSyntheticNetworkRequest(s)?o=s.args.data.url:i+=` (${s.name})`,os`<a href="#" draggable=false .title=${o} @click=${a=>{a.stopPropagation(),Li.Revealer.reveal(new Me.TraceObject.RevealableEvent(s))}}>${i}</a>`}return super.templateForToken(e)}async#i(e,s){if(e===void 0)return;let o=Me.TargetManager.TargetManager.instance().primaryPageTarget()?.model(Me.DOMModel.DOMModel);if(!o)return;let r=(await o.pushNodesByBackendIdsToFrontend(new Set([e])))?.get(e);return!r||r.frameId()!==this.mainFrameId?void 0:Mi.DOMLinkifier.Linkifier.instance().linkify(r,{textContent:s})}};import*as It from"./../../core/sdk/sdk.js";import*as Ei from"./../../third_party/marked/marked.js";import*as Lt from"./../../ui/lit/lit.js";import*as Pi from"./../common/common.js";var{html:O}=Lt.StaticHtml,{until:Ri}=Lt.Directives,At=class t extends K{mainFrameId;constructor(e=""){super(),this.mainFrameId=e}#i(e){if(!Array.isArray(e)||e.length===0||typeof e[0]!="object"||e[0]===null)return null;let s=Object.keys(e[0]);if(!["Problem","Element","NodeId","Details"].every(a=>s.includes(a)))return null;let o=s.indexOf("Problem");if(o>-1){let a=s.splice(o,1);s.unshift(...a)}return O`
      <table style="width: 100%;">
        <thead>
          <tr>
            ${s.map(a=>O`<th style="text-align: left;">${a==="NodeId"?"":a}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${e.flatMap(a=>O`
            <tr>
              ${s.map(r=>r==="NodeId"?O`<td>${this.#s(a[r])}</td>`:r==="Details"?O`<td><a href="#" @click=${this.#t}>Details</a></td>`:O`<td>${a[r]}</td>`)}
            </tr>
            <tr class="details-row" style="display: none;">
              <td colspan=${s.length} style="background-color: #f0f0f0; padding: 1em;">
                <devtools-markdown-view .data=${{tokens:Ei.Marked.lexer(a.Details),renderer:new t(this.mainFrameId)}}></devtools-markdown-view>
              </td>
            </tr>
          `)}
        </tbody>
      </table>
      <br><div>To investigate these problems, please click one of the provided links (above), to set as context, and ask me further questions about the problem.</div>
    `}templateForToken(e){if(e.type==="code")try{let s=JSON.parse(e.text),i=this.#i(s);if(i)return i}catch{}if(e.type==="link"&&e.href.startsWith("#")){let s;if(e.href.startsWith("#node-")?s=Number(e.href.replace("#node-","")):e.href.startsWith("#")&&(s=Number(e.href.replace("#",""))),s)return O`<span>${Ri(this.#n(s,e.text).then(i=>i||e.text),e.text)}</span>`}return super.templateForToken(e)}#t(e){e.preventDefault();let s=e.target,i=s.closest("tr");if(!i)return;let o=i.nextElementSibling;o?.classList.contains("details-row")&&(o.style.display==="none"?(o.style.display="table-row",s.textContent="Hide"):(o.style.display="none",s.textContent="Details"))}#s(e){if(e.indexOf(",")===-1){let i=Number(e);return isNaN(i)?O`${e}`:this.#a(i)}let s=e.split(",").map(i=>i.trim()).filter(Boolean);return O`${s.map(i=>{let o=Number(i);return isNaN(o)?O`<div>${i}</div>`:O`<div>${this.#a(o)}</div>`})}`}#a(e){let s="link";return O`<span>${Ri(this.#n(e,s).then(i=>i||s),s)}</span>`}async#n(e,s){if(e===void 0)return;let o=It.TargetManager.TargetManager.instance().primaryPageTarget()?.model(It.DOMModel.DOMModel);if(!o)return;let r=(await o.pushNodesByBackendIdsToFrontend(new Set([e])))?.get(e);return!r||r.frameId()!==this.mainFrameId?void 0:Pi.DOMLinkifier.Linkifier.instance().linkify(r,{textContent:s})}};var Fi={};G(Fi,{saveToDisk:()=>ns});import*as Di from"./../../core/platform/platform.js";import*as Ui from"./../../models/text_utils/text_utils.js";import*as as from"./../../models/workspace/workspace.js";async function ns(t){let e=t.getConversationMarkdown(),s=new Ui.ContentData.ContentData(e,!1,"text/markdown"),i=Di.StringUtilities.toSnakeCase(t.title||""),o="devtools_",a=".md",r=64-o.length-a.length,p=i||"conversation";p.length>r&&(p=p.substring(0,r));let n=`${o}${p}${a}`;await as.FileManager.FileManager.instance().save(n,s,!0),as.FileManager.FileManager.instance().close(n)}var{html:Z}=_,{widget:rs}=g.Widget,ra="https://crbug.com/364805393",la="https://developer.chrome.com/docs/devtools/ai-assistance",ca=700,da=400,I={newChat:"New chat",help:"Help",settings:"Settings",sendFeedback:"Send feedback",newChatCreated:"New chat created",chatDeleted:"Chat deleted",history:"History",deleteChat:"Delete local chat",clearChatHistory:"Clear local chats",exportConversation:"Export conversation",noPastConversations:"No past conversations",followTheSteps:"Follow the steps above to ask a question",inputDisclaimerForEmptyState:"This is an experimental AI feature and won't always get it right.",responseCopiedToClipboard:"Response copied to clipboard"},b={answerLoading:"Answer loading",answerReady:"Answer ready",analyzingData:"Analyzing data",crossOriginError:"To talk about data from another origin, start a new chat",inputPlaceholderForStyling:"Ask a question about the selected element",inputPlaceholderForNetwork:"Ask a question about the selected network request",inputPlaceholderForFile:"Ask a question about the selected file",inputPlaceholderForPerformanceWithNoRecording:"Record a performance trace and select an item to ask a question",inputPlaceholderForStylingNoContext:"Select an element to ask a question",inputPlaceholderForNetworkNoContext:"Select a network request to ask a question",inputPlaceholderForFileNoContext:"Select a file to ask a question",inputPlaceholderForPerformanceTrace:"Ask a question about the selected performance trace",inputPlaceholderForPerformanceTraceNoContext:"Record or select a performance trace to ask a question",inputPlaceholderForNoContext:"Ask AI Assistance",inputPlaceholderForNoContextBranded:"Ask Gemini",inputDisclaimerForStyling:"Chat messages and any data the inspected page can access via Web APIs are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForStylingEnterpriseNoLogging:"Chat messages and any data the inspected page can access via Web APIs are sent to Google. The content you submit and that is generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForNetwork:"Chat messages and the selected network request are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForNetworkEnterpriseNoLogging:"Chat messages and the selected network request are sent to Google. The content you submit and that is generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForFile:"Chat messages and the selected file are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won't always get it right.",inputDisclaimerForFileEnterpriseNoLogging:"Chat messages and the selected file are sent to Google. The content you submit and that is generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForPerformance:"Chat messages and trace data from your performance trace are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won't always get it right.",inputDisclaimerForPerformanceEnterpriseNoLogging:"Chat messages and data from your performance trace are sent to Google. The content you submit and that is generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForNoContext:"Chat messages, any data the inspected page can see using Web APIs, and the items you select such as files, network requests, and performance traces are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForNoContextEnterpriseNoLogging:"Chat messages, any data the inspected page can see using Web APIs, and the items you select such as files, network requests, and performance traces are sent to Google. This data will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputPlaceholderForAccessibility:"Ask a question about the selected Lighthouse report",inputPlaceholderForAccessibilityNoContext:"Generate a Lighthouse report to ask a question",inputDisclaimerForAccessibility:"Chat messages and the selected Lighthouse report are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerForAccessibilityEnterpriseNoLogging:"Chat messages and the selected Lighthouse report are sent to Google. The content you submit and that is generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerV2:"Chat messages, data accessible for this site via DevTools panels and Web APIs, and items you select such as network requests, files, and performance traces are sent to Google and may be seen by human reviewers to improve this feature. This is an experimental AI feature and won\u2019t always get it right.",inputDisclaimerEnterpriseNoLoggingV2:"Chat messages, data accessible for this site via DevTools panels and Web APIs, and items you select such as network requests, files, and performance traces are sent to Google. The content submitted to and generated by this feature will not be used to improve Google\u2019s AI models. This is an experimental AI feature and won\u2019t always get it right."},ga=Rt.i18n.registerUIStrings("panels/ai_assistance/AiAssistancePanel.ts",I),L=Rt.i18n.getLocalizedString.bind(void 0,ga),w=Rt.i18n.lockedString;function $t(t){return t&&(we.Prototypes.instance().isEnabled("emulationCapabilities")||t.nodeType()===Node.ELEMENT_NODE)?t:null}async function ha(t){let e=t?.selectedContext;if(e){let s=await e.getSuggestions();if(s)return s}if(!t?.type||t.isReadOnly)return[];switch(t.type){case"freestyler":return[{title:"What can you help me with?",jslogContext:"styling-default"},{title:"Why isn\u2019t this element visible?",jslogContext:"styling-default"},{title:we.Prototypes.instance().isEnabled("emulationCapabilities")?"Are there display issues on this page for people using an Android phone?":"How do I center this element?",jslogContext:"styling-default"}];case"drjones-file":return[{title:"What does this script do?",jslogContext:"file-default"},{title:"Is the script optimized for performance?",jslogContext:"file-default"},{title:"Does the script handle user input safely?",jslogContext:"file-default"}];case"accessibility":return[{title:"How can I fix accessibility issues on my page?",jslogContext:"accessibility-default"},{title:"What accessibility issues exist on my page?",jslogContext:"accessibility-default"}];case"drjones-network-request":return[{title:"Why is this network request taking so long?",jslogContext:"network-default"},{title:"Are there any security headers present?",jslogContext:"network-default"},{title:"Why is the request failing?",jslogContext:"network-default"}];case"drjones-performance-full":return[{title:"What performance issues exist with my page?",jslogContext:"performance-default"}];case"breakpoint":return[{title:"Why did the code pause here?"},{title:"What function does this breakpoint belong to?"},{title:"Why is this error thrown?"}];case"none":return[{title:"What can you help me with?",jslogContext:"empty"},{title:"What performance issues exist on the page?",jslogContext:"empty"},{title:"What are the slowest network requests on this page?",jslogContext:"empty"}];default:Vi.assertNever(t.type,"Unknown conversation type")}}function pa(t){let e=t?.selectedContext;if(e instanceof h.PerformanceAgent.PerformanceTraceContext){if(!e.external){let s=e.getItem();return new et(s.parsedTrace.data.Meta.mainFrameId,s.lookupEvent.bind(s))}}else{if(t?.type==="drjones-performance-full")return new et;if(we.Prototypes.instance().isEnabled("emulationCapabilities")&&t?.type==="freestyler"&&y.TargetManager.TargetManager.instance().primaryPageTarget()?.model(y.DOMModel.DOMModel)){let o=y.TargetManager.TargetManager.instance().primaryPageTarget()?.model(y.DOMModel.DOMModel)?.target().model(y.ResourceTreeModel.ResourceTreeModel)?.mainFrame?.id;return new At(o)}else if(t?.type==="accessibility"){let o=y.TargetManager.TargetManager.instance().primaryPageTarget()?.model(y.DOMModel.DOMModel)?.target().model(y.ResourceTreeModel.ResourceTreeModel)?.mainFrame?.id;return new it(o)}}return new K}function Ni(t){let e=!!R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled;return Z`
    <div class="toolbar-container" role="toolbar" jslog=${st.toolbar()}>
      <devtools-toolbar class="freestyler-left-toolbar" role="presentation">
      ${t.showChatActions?Z`<devtools-button
          title=${L(I.newChat)}
          aria-label=${L(I.newChat)}
          .iconName=${"plus"}
          .jslogContext=${"freestyler.new-chat"}
          .variant=${"toolbar"}
          @click=${t.onNewChatClick}></devtools-button>
        <div class="toolbar-divider"></div>
        <devtools-menu-button
          title=${L(I.history)}
          aria-label=${L(I.history)}
          .iconName=${"history"}
          .jslogContext=${"freestyler.history"}
          .populateMenuCall=${t.populateHistoryMenu}
        ></devtools-menu-button>`:_.nothing}
        ${t.showActiveConversationActions?Z`
          <devtools-button
              title=${L(I.deleteChat)}
              aria-label=${L(I.deleteChat)}
              .iconName=${"bin"}
              .jslogContext=${"freestyler.delete"}
              .variant=${"toolbar"}
              @click=${t.onDeleteClick}>
          </devtools-button>
          ${e?_.nothing:Z`
            <devtools-button
              title=${L(I.exportConversation)}
              aria-label=${L(I.exportConversation)}
              .iconName=${"download"}
              .disabled=${t.isLoading}
              .jslogContext=${"export-ai-conversation"}
              .variant=${"toolbar"}
              @click=${t.onExportConversationClick}>
            </devtools-button>
            `}`:_.nothing}
      </devtools-toolbar>
      <devtools-toolbar class="freestyler-right-toolbar" role="presentation">
        <devtools-link
          class="toolbar-feedback-link"
          title=${L(I.sendFeedback)}
          href=${ra}
          jslogcontext=${"freestyler.send-feedback"}
        >${L(I.sendFeedback)}</devtools-link>
        <div class="toolbar-divider"></div>
        <devtools-button
          title=${L(I.help)}
          aria-label=${L(I.help)}
          .iconName=${"help"}
          .jslogContext=${"freestyler.help"}
          .variant=${"toolbar"}
          @click=${t.onHelpClick}></devtools-button>
        <devtools-button
          title=${L(I.settings)}
          aria-label=${L(I.settings)}
          .iconName=${"gear"}
          .jslogContext=${"freestyler.settings"}
          .variant=${"toolbar"}
          @click=${t.onSettingsClick}></devtools-button>
      </devtools-toolbar>
    </div>
  `}function zi(t,e,s){function i(){switch(t.state){case"chat-view":return Z`<devtools-ai-chat-view
          .props=${t.props}
          ${_.Directives.ref(o=>{!o||!(o instanceof Ge)||(e.chatView=o)})}
        ></devtools-ai-chat-view>`;case"explore-view":return Z`<devtools-widget class="fill-panel" ${rs(Ze)}>
                    </devtools-widget>`;case"disabled-view":return Z`<devtools-widget class="fill-panel" ${rs(Qe,t.props)}>
                    </devtools-widget>`}}if(R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled||we.Prototypes.instance().isEnabled("breakpointDebuggerAgent")){let o=t.state==="chat-view"&&t.props.walkthrough.isExpanded,a=!1;if(t.state==="chat-view"){let r=t.props.messages.at(-1);r&&t.props.walkthrough.activeSidebarMessage?.id===r.id&&(a=!0)}_.render(Z`
      ${Ni(t)}
      <div class="ai-assistance-view-container">
        <devtools-split-view
          name="ai-assistance-split-view-state"
          direction="column"
          sidebar-position="second"
          sidebar-visibility=${o&&!t.props.walkthrough.isInlined?"visible":"hidden"}
          sidebar-initial-size=${da}
        >
          <div slot="main" class="main-view">
            ${i()}
          </div>
          ${o?Z`
            <devtools-widget slot="sidebar" ${rs(ve,{message:t.props.walkthrough.activeSidebarMessage,isLoading:t.props.isLoading&&a,markdownRenderer:t.props.markdownRenderer,onToggle:t.props.walkthrough.onToggle})}></devtools-widget>`:_.nothing}
        </devtools-split-view>
      </div>
    `,s)}else _.render(Z`
      ${Ni(t)}
      <div class="ai-assistance-view-container">${i()}</div>
    `,s)}function ji(t){return t?new h.StylingAgent.NodeContext(t):null}function ma(t){return t?new h.FileAgent.FileContext(t):null}function ua(t){return t?new h.BreakpointDebuggerAgent.BreakpointContext(t):null}function Oi(t){return t?new h.AccessibilityAgent.AccessibilityContext(t.report):null}function fa(t){if(!t)return null;let e=be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator();return new h.NetworkAgent.RequestContext(t,e)}function va(t){return t?new h.PerformanceAgent.PerformanceTraceContext(t):null}var ls,Mt=class t extends g.Panel.Panel{view;static panelName="freestyler";#i;#t;#s;#a={};#n=wa();#r;#o=new h.ChangeManager.ChangeManager;#p=new N.Mutex.Mutex;#e;#m=null;#h=null;#g=null;#d=null;#c=null;#u=null;#f=[];#b=!1;#v;#w=null;#C=new AbortController;#l={isInlined:!1,isExpanded:!1,activeSidebarMessage:null,inlineExpandedMessages:[]};constructor(e=zi,{aidaClient:s,aidaAvailability:i}){super(t.panelName),this.view=e,this.registerRequiredCSS(gs),this.#r=this.#I(),this.#t=s,this.#v=i,g.ActionRegistry.ActionRegistry.instance().hasAction("elements.toggle-element-search")&&(this.#i=g.ActionRegistry.ActionRegistry.instance().getAction("elements.toggle-element-search")),h.AiHistoryStorage.AiHistoryStorage.instance().addEventListener("AiHistoryDeleted",this.#le,this)}#M(){return{isLoading:this.#b,showChatActions:this.#X(),showActiveConversationActions:!!(this.#e&&!this.#e.isEmpty),onNewChatClick:this.#N.bind(this),populateHistoryMenu:this.#re.bind(this),onDeleteClick:this.#ce.bind(this),onExportConversationClick:this.#_.bind(this),onHelpClick:()=>{qi.openInNewTab(la)},onSettingsClick:()=>{g.ViewManager.ViewManager.instance().showView("chrome-ai")}}}async#R(){let e=R.Runtime.hostConfig.aidaAvailability?.blockedByAge===!0;if(this.#v!=="available"||!this.#r?.getIfNotDisabled()||e)return{state:"disabled-view",props:{aidaAvailability:this.#v}};if(this.#e){let s=await ha(this.#e),i=pa(this.#e),o=null;return Re()&&this.#$(this.#x())&&(o=this.#ae.bind(this)),{state:"chat-view",props:{blockedByCrossOrigin:this.#e.isBlockedByOrigin,isLoading:this.#b,messages:this.#f,context:this.#e.selectedContext??this.#$(this.#x()),isContextSelected:!!this.#e.selectedContext,conversationType:this.#e.type,isReadOnly:this.#e.isReadOnly??!1,changeSummary:this.#J(),inspectElementToggled:this.#i?.toggled()??!1,canShowFeedbackForm:this.#n,multimodalInputEnabled:ds()&&this.#e.type==="freestyler",isTextInputDisabled:this.#Z(),emptyStateSuggestions:s,inputPlaceholder:this.#ee(),disclaimerText:this.#te(),onExportConversation:this.#_.bind(this),changeManager:this.#o,uploadImageInputEnabled:ba()&&this.#e.type==="freestyler",markdownRenderer:i,conversationMarkdown:this.#e.getConversationMarkdown(),generateConversationSummary:async a=>(this.#s||(this.#s=new h.ConversationSummaryAgent.ConversationSummaryAgent({aidaClient:this.#t,serverSideLoggingEnabled:this.#n})),await this.#s.summarizeConversation(a)),onTextSubmit:async(a,r,p)=>{let n=()=>{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceQuerySubmitted),this.#j(a,r,p)},u=R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled,v=N.Settings.Settings.instance().moduleSetting("ai-assistance-v2-opt-in-change-dialog-seen");if(u&&!v.get()){Xe.show({onGotIt:()=>{v.set(!0),n()},onManageSettings:()=>{v.set(!0),this.#a.chatView?.setInputValue(a),g.ViewManager.ViewManager.instance().showView("chrome-ai")}});return}n()},onInspectElementClick:this.#Q.bind(this),onFeedbackSubmit:this.#se.bind(this),onCancelClick:this.#z.bind(this),onContextClick:this.#ie.bind(this),onNewConversation:this.#N.bind(this),onCopyResponseClick:this.#Y.bind(this),onContextRemoved:Re()?this.#oe.bind(this):null,onContextAdd:o,walkthrough:{onToggle:this.#U.bind(this),onOpen:this.#S.bind(this),isExpanded:this.#l.isExpanded,isInlined:this.#l.isInlined,activeSidebarMessage:this.#l.activeSidebarMessage,inlineExpandedMessages:this.#l.inlineExpandedMessages}}}}return{state:"explore-view"}}onResize(){super.onResize(),R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled&&this.#E()}#E(){let e=this.contentElement.offsetWidth<ca;if(e!==this.#l.isInlined){if(this.#l.isInlined=e,!this.#l.isExpanded){this.#l.activeSidebarMessage=null,this.#l.inlineExpandedMessages=[],this.requestUpdate();return}e?this.#l.inlineExpandedMessages=this.#l.activeSidebarMessage?[this.#l.activeSidebarMessage]:[]:this.#l.activeSidebarMessage=this.#l.inlineExpandedMessages.at(-1)??null,this.requestUpdate()}}#S(e){this.#l.inlineExpandedMessages.some(s=>s.id===e.id)||this.#l.inlineExpandedMessages.push(e),this.#l.activeSidebarMessage=e,this.#l.isExpanded=!0,this.requestUpdate()}#U(e,s){if(e){this.#S(s);return}this.#l.inlineExpandedMessages=this.#l.inlineExpandedMessages.filter(i=>i.id!==s.id),this.#l.isInlined?(this.#l.isExpanded=this.#l.inlineExpandedMessages.length>0,this.#l.activeSidebarMessage?.id===s.id&&(this.#l.activeSidebarMessage=this.#l.inlineExpandedMessages.at(-1)??null)):(this.#l.isExpanded=!1,this.#l.activeSidebarMessage=null),this.requestUpdate()}#I(){try{return N.Settings.moduleSetting("ai-assistance-enabled")}catch{return}}static async instance(e={forceNew:null}){let{forceNew:s}=e;if(!ls||s){let i=new x.AidaClient.AidaClient,o=await x.AidaClient.AidaClient.checkAccessPreconditions();ls=new t(zi,{aidaClient:i,aidaAvailability:o})}return ls}#k(){let e=g.Context.Context.instance().flavor(Pe.TimelinePanel.TimelinePanel);e!==this.#w&&(this.#w?.removeEventListener("IsViewingTrace",this.requestUpdate,this),this.#w=e,this.#w&&this.#w.addEventListener("IsViewingTrace",this.requestUpdate,this))}async#T(){return await Pe.TimelinePanel.TimelinePanel.executeRecordAndReload()}async#A(e){return await tt.LighthousePanel.LighthousePanel.executeLighthouseRecording({isAIControlled:!0,...e})}#x(){let{hostConfig:e}=R.Runtime,s=g.ViewManager.ViewManager.instance(),i=s.isViewVisible("elements"),o=s.isViewVisible("network"),a=s.isViewVisible("sources"),r=s.isViewVisible("timeline"),p=s.isViewVisible("lighthouse"),n;return i&&e.devToolsFreestyler?.enabled?n="freestyler":o&&e.devToolsAiAssistanceNetworkAgent?.enabled?n="drjones-network-request":a&&this.#e?.type==="breakpoint"?n="breakpoint":a&&e.devToolsAiAssistanceFileAgent?.enabled?n="drjones-file":r&&e.devToolsAiAssistancePerformanceAgent?.enabled?n="drjones-performance-full":p&&e.devToolsAiAssistanceAccessibilityAgent?.enabled&&(n="accessibility"),Re()&&!n?"none":n}#L(){if(this.#b){this.requestUpdate();return}if(this.#e&&!this.#e.isEmpty){this.requestUpdate();return}let e=this.#x();if(this.#e?.type===e){this.requestUpdate();return}let s=e?new h.AiConversation.AiConversation({type:e,data:[],isReadOnly:!1,aidaClient:this.#t,changeManager:this.#o,isExternal:!1,performanceRecordAndReload:this.#T.bind(this),onInspectElement:this.#D.bind(this),networkTimeCalculator:be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator(),lighthouseRecording:this.#A.bind(this)}):void 0;this.#y(s)}#y(e){if(this.#e!==e){if(this.#z(),this.#f=[],this.#b=!1,this.#e?.archiveConversation(),!e){let s=this.#x();s&&(e=new h.AiConversation.AiConversation({type:s,data:[],isReadOnly:!1,aidaClient:this.#t,changeManager:this.#o,isExternal:!1,performanceRecordAndReload:this.#T.bind(this),onInspectElement:this.#D.bind(this),networkTimeCalculator:be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator(),lighthouseRecording:this.#A.bind(this)}))}this.#e=e}if(this.#e)if(this.#e.isEmpty&&Re()){let s=this.#$(this.#x());this.#e.setContext(s)}else{let s=this.#$(this.#e.type);(s||!Re())&&this.#e.setContext(s)}this.requestUpdate()}async handleBreakpointConversation(e,s){let i=new h.BreakpointDebuggerAgent.BreakpointContext(e);this.#c=i;let o=new h.AiConversation.AiConversation({type:"breakpoint",data:[],isReadOnly:!1,aidaClient:this.#t,changeManager:this.#o,isExternal:!1,performanceRecordAndReload:this.#T.bind(this),onInspectElement:this.#D.bind(this),networkTimeCalculator:be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator(),lighthouseRecording:this.#A.bind(this)});this.#y(o),this.#e?.setContext(i),this.requestUpdate(),await g.ViewManager.ViewManager.instance().showView(t.panelName);let a=s?`debug the error "${s}" using breakpoint debugging agent`:"debug the error using breakpoint debugging agent";await this.#j(a)}wasShown(){super.wasShown(),this.#a.chatView?.restoreScrollPosition(),this.#a.chatView?.focusTextInput(),this.#F(),this.#h=ji($t(g.Context.Context.instance().flavor(y.DOMModel.DOMNode))),this.#d=fa(g.Context.Context.instance().flavor(y.NetworkRequest.NetworkRequest)),this.#g=va(g.Context.Context.instance().flavor(h.AIContext.AgentFocus)),this.#m=ma(g.Context.Context.instance().flavor(Ee.UISourceCode.UISourceCode)),this.#c=ua(g.Context.Context.instance().flavor(Ee.UISourceCode.UILocation)),this.#u=Oi(g.Context.Context.instance().flavor(tt.LighthousePanel.ActiveLighthouseReport)),this.#y(this.#e),this.#r?.addChangeListener(this.requestUpdate,this),x.AidaClient.HostConfigTracker.instance().addEventListener("aidaAvailabilityChanged",this.#F),this.#i?.addEventListener("Toggled",this.requestUpdate,this),g.Context.Context.instance().addFlavorChangeListener(y.DOMModel.DOMNode,this.#O),g.Context.Context.instance().addFlavorChangeListener(y.NetworkRequest.NetworkRequest,this.#W),g.Context.Context.instance().addFlavorChangeListener(h.AIContext.AgentFocus,this.#V),g.Context.Context.instance().addFlavorChangeListener(Ee.UISourceCode.UISourceCode,this.#B),g.Context.Context.instance().addFlavorChangeListener(Ee.UISourceCode.UILocation,this.#K),g.Context.Context.instance().addFlavorChangeListener(tt.LighthousePanel.ActiveLighthouseReport,this.#q),g.ViewManager.ViewManager.instance().addEventListener("ViewVisibilityChanged",this.#L,this),y.TargetManager.TargetManager.instance().addModelListener(y.DOMModel.DOMModel,y.DOMModel.Events.AttrModified,this.#P,this),y.TargetManager.TargetManager.instance().addModelListener(y.DOMModel.DOMModel,y.DOMModel.Events.AttrRemoved,this.#P,this),g.Context.Context.instance().addFlavorChangeListener(Pe.TimelinePanel.TimelinePanel,this.#k,this),this.#k(),this.#L(),x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistancePanelOpened)}willHide(){super.willHide(),this.#r?.removeChangeListener(this.requestUpdate,this),x.AidaClient.HostConfigTracker.instance().removeEventListener("aidaAvailabilityChanged",this.#F),this.#i?.removeEventListener("Toggled",this.requestUpdate,this),g.Context.Context.instance().removeFlavorChangeListener(y.DOMModel.DOMNode,this.#O),g.Context.Context.instance().removeFlavorChangeListener(y.NetworkRequest.NetworkRequest,this.#W),g.Context.Context.instance().removeFlavorChangeListener(h.AIContext.AgentFocus,this.#V),g.Context.Context.instance().removeFlavorChangeListener(Ee.UISourceCode.UISourceCode,this.#B),g.Context.Context.instance().removeFlavorChangeListener(tt.LighthousePanel.ActiveLighthouseReport,this.#q),g.ViewManager.ViewManager.instance().removeEventListener("ViewVisibilityChanged",this.#L,this),g.Context.Context.instance().removeFlavorChangeListener(Pe.TimelinePanel.TimelinePanel,this.#k,this),y.TargetManager.TargetManager.instance().removeModelListener(y.DOMModel.DOMModel,y.DOMModel.Events.AttrModified,this.#P,this),y.TargetManager.TargetManager.instance().removeModelListener(y.DOMModel.DOMModel,y.DOMModel.Events.AttrRemoved,this.#P,this),this.#w&&(this.#w.removeEventListener("IsViewingTrace",this.requestUpdate,this),this.#w=null)}#F=async()=>{let e=await x.AidaClient.AidaClient.checkAccessPreconditions();e!==this.#v&&(this.#v=e,this.requestUpdate())};#O=e=>{this.#h?.getItem()!==e.data&&(this.#h=ji($t(e.data)),this.#y(this.#e))};#P=e=>{this.#h?.getItem()===e.data.node&&(e.data.name==="class"||e.data.name==="id")&&this.requestUpdate()};#W=e=>{if(this.#d?.getItem()!==e.data){if(e.data){let s=be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator();this.#d=new h.NetworkAgent.RequestContext(e.data,s)}else this.#d=null;this.#y(this.#e)}};#V=e=>{this.#g?.getItem()!==e.data&&(this.#g=e.data?new h.PerformanceAgent.PerformanceTraceContext(e.data):null,this.#y(this.#e))};#B=e=>{let s=e.data;!s||this.#m?.getItem()===s||(this.#m=new h.FileAgent.FileContext(e.data),this.#y(this.#e))};#K=e=>{let s=e.data;!s||this.#c?.getItem()===s||(this.#c=new h.BreakpointDebuggerAgent.BreakpointContext(s),this.#y(this.#e))};#q=e=>{let s=e.data;this.#u?.getItem()!==s?.report&&(this.#u=Oi(s),this.#y(this.#e))};#J(){if(!fe()||!this.#e||this.#e?.isReadOnly)return;let e=!!R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled;return this.#o.formatChangesForPatching(this.#e.id,!e)}async performUpdate(){let e={...this.#M(),...await this.#R()};this.view(e,this.#a,this.contentElement)}#Y(e){let s=ya(e);s&&(x.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(s),Bi.Snackbar.Snackbar.show({message:L(I.responseCopiedToClipboard)}))}#Q(){g.Context.Context.instance().setFlavor(N.ReturnToPanel.ReturnToPanelFlavor,new N.ReturnToPanel.ReturnToPanelFlavor(this.panelName)),this.#i?.execute()}#Z(){return!!(this.#e&&this.#e.isBlockedByOrigin||!this.#e||!this.#e.selectedContext&&!Re())}#X(){let e=this.#r?.getIfNotDisabled(),s=R.Runtime.hostConfig.aidaAvailability?.blockedByAge===!0;return!(!e||s||this.#v==="no-account-email"||this.#v==="sync-is-paused")}#ee(){if(!this.#e)return L(I.followTheSteps);if(this.#e&&this.#e.isBlockedByOrigin)return w(b.crossOriginError);switch(this.#e.type){case"freestyler":return this.#e.selectedContext?w(b.inputPlaceholderForStyling):w(b.inputPlaceholderForStylingNoContext);case"drjones-file":return this.#e.selectedContext?w(b.inputPlaceholderForFile):w(b.inputPlaceholderForFileNoContext);case"drjones-network-request":return this.#e.selectedContext?w(b.inputPlaceholderForNetwork):w(b.inputPlaceholderForNetworkNoContext);case"drjones-performance-full":return g.Context.Context.instance().flavor(Pe.TimelinePanel.TimelinePanel)?.hasActiveTrace()?this.#e.selectedContext?w(b.inputPlaceholderForPerformanceTrace):w(b.inputPlaceholderForPerformanceTraceNoContext):w(b.inputPlaceholderForPerformanceWithNoRecording);case"breakpoint":return w(b.inputPlaceholderForNoContext);case"accessibility":return this.#e.selectedContext?w(b.inputPlaceholderForAccessibility):w(b.inputPlaceholderForAccessibilityNoContext);case"none":return h.AiUtils.isGeminiBranding()?w(b.inputPlaceholderForNoContextBranded):w(b.inputPlaceholderForNoContext)}}#te(){if(!this.#e||this.#e.isReadOnly)return L(I.inputDisclaimerForEmptyState);let e=R.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue!==R.Runtime.GenAiEnterprisePolicyValue.ALLOW_WITHOUT_LOGGING;if(R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled)return w(e?b.inputDisclaimerV2:b.inputDisclaimerEnterpriseNoLoggingV2);switch(this.#e.type){case"freestyler":return w(e?b.inputDisclaimerForStyling:b.inputDisclaimerForStylingEnterpriseNoLogging);case"drjones-file":return w(e?b.inputDisclaimerForFile:b.inputDisclaimerForFileEnterpriseNoLogging);case"drjones-network-request":return w(e?b.inputDisclaimerForNetwork:b.inputDisclaimerForNetworkEnterpriseNoLogging);case"drjones-performance-full":return w(e?b.inputDisclaimerForPerformance:b.inputDisclaimerForPerformanceEnterpriseNoLogging);case"accessibility":return w(e?b.inputDisclaimerForAccessibility:b.inputDisclaimerForAccessibilityEnterpriseNoLogging);case"breakpoint":case"none":return w(e?b.inputDisclaimerForNoContext:b.inputDisclaimerForNoContextEnterpriseNoLogging)}}#se(e,s,i){this.#t.registerClientEvent({corresponding_aida_rpc_global_id:e,disable_user_content_logging:!this.#n,do_conversation_client_event:{user_feedback:{sentiment:s,user_input:{comment:i}}}})}#ie(){if(!this.#e)return;let e=this.#e.selectedContext;if(e instanceof h.NetworkAgent.RequestContext){let s=Hi.UIRequestLocation.UIRequestLocation.tab(e.getItem(),"headers-component");return N.Revealer.reveal(s)}if(e instanceof h.FileAgent.FileContext)return N.Revealer.reveal(e.getItem().uiLocation(0,0));if(e instanceof h.PerformanceAgent.PerformanceTraceContext){let s=e.getItem();if(s.callTree){let i=s.callTree.selectedNode?.event??s.callTree.rootNode.event,o=new y.TraceObject.RevealableEvent(i);return N.Revealer.reveal(o)}if(s.insight)return N.Revealer.reveal(s.insight)}}#oe(){this.#e?.setContext(null),this.requestUpdate()}#ae(){this.#e?.setContext(this.#$(this.#x())),this.requestUpdate()}#ne(){let e=!!R.Runtime.hostConfig.aidaAvailability?.enabled,s=!!R.Runtime.hostConfig.aidaAvailability?.blockedByAge,i=this.#v==="available",o=!!this.#r?.getIfNotDisabled();return e&&i&&o&&!s}async handleAction(e,s){if(this.#b&&!s?.prompt){this.#a.chatView?.focusTextInput();return}let i;switch(e){case"freestyler.elements-floating-button":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromElementsPanelFloatingButton),i="freestyler";break}case"freestyler.element-panel-context":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromElementsPanel),i="freestyler";break}case"drjones.network-floating-button":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromNetworkPanelFloatingButton),i="drjones-network-request";break}case"drjones.network-panel-context":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromNetworkPanel),i="drjones-network-request";break}case"drjones.performance-panel-context":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromPerformancePanelCallTree),i="drjones-performance-full";break}case"drjones.sources-floating-button":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromSourcesPanelFloatingButton),i="drjones-file";break}case"drjones.sources-panel-context":{x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceOpenedFromSourcesPanel),i="drjones-file";break}}if(!i)return;let o=this.#e;(!this.#e||this.#e.type!==i||this.#e.isEmpty)&&(o=new h.AiConversation.AiConversation({type:i,data:[],isReadOnly:!1,aidaClient:this.#t,changeManager:this.#o,isExternal:!1,performanceRecordAndReload:this.#T.bind(this),onInspectElement:this.#D.bind(this),networkTimeCalculator:be.NetworkPanel.NetworkPanel.instance().networkLogView.timeCalculator(),lighthouseRecording:this.#A.bind(this)})),this.#y(o);let a=s?.prompt;if(a&&typeof a=="string"){if(!this.#ne())return;x.userMetrics.actionTaken(x.UserMetrics.Action.AiAssistanceQuerySubmitted),this.#e&&this.#e.isBlockedByOrigin&&this.#N(),await this.#j(a)}else this.#a.chatView?.focusTextInput()}#re(e){let s=h.AiHistoryStorage.AiHistoryStorage.instance().getHistory().map(o=>h.AiConversation.AiConversation.fromSerializedConversation(o));for(let o of s.reverse())o.isEmpty||!o.title||e.defaultSection().appendCheckboxItem(o.title,()=>{this.#de(o)},{checked:this.#e?.id===o.id,jslogContext:"freestyler.history-item"});let i=e.defaultSection().items.length===0;i&&e.defaultSection().appendItem(L(I.noPastConversations),()=>{},{disabled:!0}),e.footerSection().appendItem(L(I.clearChatHistory),()=>{h.AiHistoryStorage.AiHistoryStorage.instance().deleteAll()},{disabled:i})}#le(){this.#y()}#H(){this.#l.isExpanded=!1,this.#l.activeSidebarMessage=null,this.#l.inlineExpandedMessages=[]}#ce(){this.#e&&(this.#H(),h.AiHistoryStorage.AiHistoryStorage.instance().deleteHistoryEntry(this.#e.id),this.#y(),g.ARIAUtils.LiveAnnouncer.alert(L(I.chatDeleted)))}async#_(){if(this.#e)return await ns(this.#e)}async#de(e){this.#e?.id!==e.id&&(this.#y(e),await this.#G(e.history))}#N(){this.#y(),this.#H(),g.ARIAUtils.LiveAnnouncer.alert(L(I.newChatCreated)),cs.AnnotationRepository.annotationsEnabled()&&cs.AnnotationRepository.instance().deleteAllAnnotations()}#z(){this.#C.abort(),this.#C=new AbortController}#$(e){switch(e){case"freestyler":return this.#h;case"drjones-file":return this.#m;case"drjones-network-request":return this.#d;case"drjones-performance-full":return this.#g;case"breakpoint":return this.#c;case"accessibility":return this.#u;case"none":case void 0:return null}}#ge=e=>{e instanceof h.FileAgent.FileContext?this.#m=e:e instanceof h.StylingAgent.NodeContext?this.#h=e:e instanceof h.NetworkAgent.RequestContext?this.#d=e:e instanceof h.PerformanceAgent.PerformanceTraceContext?this.#g=e:e instanceof h.BreakpointDebuggerAgent.BreakpointContext?this.#c=e:e instanceof h.AccessibilityAgent.AccessibilityContext&&(this.#u=e),st.logFunctionCall(`context-change-${this.#e?.type}`),this.requestUpdate()};async#D(){if(!this.#i)return null;let e=new Promise(s=>{let i=r=>{r.data&&(s($t(r.data)),a())},o=r=>{r.data||window.setTimeout(()=>{s($t(g.Context.Context.instance().flavor(y.DOMModel.DOMNode))),a()},50)},a=()=>{g.Context.Context.instance().removeFlavorChangeListener(y.DOMModel.DOMNode,i),this.#i?.removeEventListener("Toggled",o)};g.Context.Context.instance().addFlavorChangeListener(y.DOMModel.DOMNode,i),this.#i?.addEventListener("Toggled",o),this.#C.signal.addEventListener("abort",()=>{s(null),a()},{once:!0})});this.#i.execute();try{return await e}finally{this.#i.toggled()&&this.#i.execute()}}async#j(e,s,i){if(!this.#e)return;this.#z();let o=this.#C.signal;this.#e.isEmpty&&Et.UserBadges.instance().recordAction(Et.BadgeAction.STARTED_AI_CONVERSATION);let a=we.Prototypes.instance().isEnabled("emulationCapabilities"),r,p=this.#e.getPendingMultimodalInput();a&&p?r=p:ds()&&s&&i&&(r={input:s,id:crypto.randomUUID(),type:i}),st.logFunctionCall(`start-conversation-${this.#e.type}`,"ui"),await this.#G(this.#e.run(e,{signal:o,multimodalInput:r}))}async#G(e){let s=await this.#p.acquire();try{let a=function(){let n=i.parts.at(-1);n?.type==="step"&&n.step===o||i.parts.push({type:"step",step:o})},i={entity:"model",parts:[],id:crypto.randomUUID()},o={isLoading:!0};this.#b=!0;let r=!1,p=!1;for await(let n of e){switch(o.requestApproval=void 0,n.type){case"user-query":{this.#f.push({entity:"user",text:n.query,imageInput:n.imageInput,id:crypto.randomUUID()}),i={entity:"model",parts:[],id:crypto.randomUUID()},this.#f.push(i),(this.#l.isExpanded&&!this.#l.isInlined||we.Prototypes.instance().isEnabled("breakpointDebuggerAgent")&&this.#e?.type==="breakpoint")&&this.#S(i);break}case"querying":{o={isLoading:!0},i.parts.length||a();break}case"context":{o.title=w(b.analyzingData),o.contextDetails=n.details,o.widgets=n.widgets,o.isLoading=!1,a();break}case"title":{o.title=n.title,a();break}case"thought":{o.isLoading=!1,o.thought=n.thought,a();break}case"suggestions":{let u=i.parts.at(-1);u?.type==="answer"?u.suggestions=n.suggestions:i.parts.push({type:"answer",text:"",suggestions:n.suggestions});break}case"side-effect":{o.isLoading=!1,o.code??=n.code,o.requestApproval={description:n.description,onAnswer:u=>{n.confirm(u),o.requestApproval=void 0,this.requestUpdate()}},a();break}case"action":{o.isLoading=!1,o.code??=n.code,o.output??=n.output,o.canceled=n.canceled,o.widgets??=n.widgets,a();break}case"answer":{i.rpcId=n.rpcId;let u=i.parts.at(-1);if(u?.type==="answer")u.text=n.text,n.suggestions&&(u.suggestions=n.suggestions);else{let v={type:"answer",text:n.text};n.suggestions&&(v.suggestions=n.suggestions),i.parts.push(v)}if(n.widgets&&R.Runtime.hostConfig.devToolsAiAssistanceV2?.enabled&&i.parts.push({type:"widget",widgets:n.widgets}),i.parts.length>1){let v=i.parts[0];v.type==="step"&&v.step.isLoading&&!v.step.thought&&!v.step.code&&!v.step.contextDetails&&i.parts.shift()}o.isLoading=!1;break}case"error":{i.error=n.error;let u=i.parts.at(-1);if(u?.type==="step"){let v=u.step;n.error==="abort"?v.canceled=!0:v.isLoading&&i.parts.pop()}n.error==="block"&&i.parts.at(-1)?.type==="answer"&&i.parts.pop();break}case"context-change":{this.#ge(n.context),o.isLoading=!1,o.widgets=n.widgets,a(),o={isLoading:!0};break}}if(!this.#e?.isReadOnly)switch(this.requestUpdate(),(n.type==="context"||n.type==="side-effect")&&this.#a.chatView?.scrollToBottom(),n.type){case"context":g.ARIAUtils.LiveAnnouncer.status(w(b.analyzingData));break;case"answer":!n.complete&&!r?(r=!0,g.ARIAUtils.LiveAnnouncer.status(w(b.answerLoading))):n.complete&&!p&&(p=!0,g.ARIAUtils.LiveAnnouncer.status(w(b.answerReady)))}}this.#b=!1,this.requestUpdate()}finally{s()}}};function ya(t){let e=["## AI"];for(let s of t.parts)if(s.type==="answer")e.push(`### Answer

${s.text}`);else if(s.type==="step"){let i=s.step;i.title&&e.push(`### ${i.title}`),i.contextDetails&&e.push(h.AiConversation.generateContextDetailsMarkdown(i.contextDetails)),i.thought&&e.push(i.thought),i.code&&e.push(`**Code executed:**
\`\`\`
${i.code.trim()}
\`\`\``),i.output&&e.push(`**Data returned:**
\`\`\`
${i.output}
\`\`\``)}return e.join(`

`)}var Wi=class{handleAction(e,s,i){switch(s){case"freestyler.elements-floating-button":case"freestyler.element-panel-context":case"freestyler.main-menu":case"drjones.network-floating-button":case"drjones.network-panel-context":case"drjones.performance-panel-context":case"drjones.sources-floating-button":case"drjones.sources-panel-context":return(async()=>{let o=g.ViewManager.ViewManager.instance().view(Mt.panelName);if(!o)return;await g.ViewManager.ViewManager.instance().showView(Mt.panelName);let a=g.InspectorView.InspectorView.instance().totalSize()/4;g.InspectorView.InspectorView.instance().drawerSize()<a&&g.InspectorView.InspectorView.instance().setDrawerSize(a),(await o.widget()).handleAction(s,i)})(),!0}return!1}};function ba(){return ds()&&!!R.Runtime.hostConfig.devToolsFreestyler?.multimodalUploadInput}function ds(){return!!R.Runtime.hostConfig.devToolsFreestyler?.multimodal}function Re(){return!!R.Runtime.hostConfig.devToolsAiAssistanceContextSelectionAgent?.enabled}function wa(){return!R.Runtime.hostConfig.aidaAvailability?.disallowLogging}export{it as AccessibilityAgentMarkdownRenderer,Wi as ActionDelegate,Mt as AiAssistancePanel,Rs as ChatInput,Qs as ChatMessage,Ge as ChatView,fi as DisabledWidget,Ci as ExploreWidget,Fi as ExportConversation,ai as ExportForAgentsDialog,K as MarkdownRendererWithCodeBlock,Ii as OptInChangeDialog,Ss as PatchWidget,Qi as SELECT_WORKSPACE_DIALOG_DEFAULT_VIEW,nt as SelectWorkspaceDialog,Es as WalkthroughUtils,Os as WalkthroughView,Yo as getCSSChangeSummaryMessage,ya as getResponseMarkdown};
//# sourceMappingURL=ai_assistance.js.map
