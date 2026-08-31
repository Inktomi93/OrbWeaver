var me=Object.defineProperty;var S=(i,e)=>{for(var t in e)me(i,t,{get:e[t],enumerable:!0})};var j={};S(j,{EntriesLinkOverlay:()=>E,EntryLinkStartCreating:()=>T});import"./../../../../ui/kit/kit.js";import*as G from"./../../../../core/i18n/i18n.js";import"./../../../../models/trace/trace.js";import*as _ from"./../../../../ui/legacy/theme_support/theme_support.js";import{html as ye,render as ve}from"./../../../../ui/lit/lit.js";import*as K from"./../../../../ui/visual_logging/visual_logging.js";var F=`.connectorContainer{display:flex;width:100%;height:100%}.entry-wrapper{pointer-events:none;position:absolute;display:block;border:2px solid var(--color-text-primary);box-sizing:border-box;&.cut-off-top{border-top:none}&.cut-off-bottom{border-bottom:none}&.cut-off-right{border-right:none}&.cut-off-left{border-left:none}}.entry-is-not-source{border:2px dashed var(--color-text-primary)}.create-link-icon{pointer-events:auto;cursor:pointer;color:var(--sys-color-on-surface);width:16px;height:16px;position:absolute}
/*# sourceURL=${import.meta.resolve("./entriesLinkOverlay.css")} */`;var Y={diagram:"Links between entries"},xe=G.i18n.registerUIStrings("panels/timeline/overlays/components/EntriesLinkOverlay.ts",Y),we=G.i18n.getLocalizedString.bind(void 0,xe),T=class i extends Event{static eventName="entrylinkstartcreating";constructor(){super(i.eventName,{bubbles:!0,composed:!0})}},E=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#o;#t;#n;#r=null;#s=null;#e=null;#l=null;#c=null;#h=null;#u=null;#d=!0;#a=!0;#f=null;#y=!0;#g=!0;#p=!1;#v;constructor(e,t){super(),this.#b(),this.#o={x:e.x,y:e.y},this.#t={width:e.width,height:e.height},this.#n={x:e.x,y:e.y},this.#s=this.#i.querySelector(".connectorContainer")??null,this.#e=this.#s?.querySelector("line")??null,this.#l=this.#i.querySelector(".from-highlight-wrapper")??null,this.#c=this.#i.querySelector(".to-highlight-wrapper")??null,this.#h=this.#s?.querySelector(".entryFromConnector")??null,this.#u=this.#s?.querySelector(".entryToConnector")??null,this.#v=t,this.#b()}set canvasRect(e){e!==null&&(this.#f&&this.#f.width===e.width&&this.#f.height===e.height||(this.#f=e,this.#b()))}entryFromWrapper(){return this.#l}entryToWrapper(){return this.#c}set hideArrow(e){this.#p=e,this.#e&&(this.#e.style.display=e?"none":"block")}set fromEntryCoordinateAndDimensions(e){this.#o={x:e.x,y:e.y},this.#t={width:e.length,height:e.height},this.#w(),this.#L()}set entriesVisibility(e){this.#d=e.fromEntryVisibility,this.#a=e.toEntryVisibility,this.#L()}set toEntryCoordinateAndDimensions(e){this.#n={x:e.x,y:e.y},e.length&&e.height?this.#r={width:e.length,height:e.height}:this.#r=null,this.#w(),this.#L()}set fromEntryIsSource(e){e!==this.#y&&(this.#y=e,this.#b())}set toEntryIsSource(e){e!==this.#g&&(this.#g=e,this.#b())}#L(){if(!this.#e||!this.#l||!this.#c||!this.#h||!this.#u){console.error("one of the required Entries Link elements is missing.");return}if(this.#v==="creation_not_started"){this.#h.setAttribute("visibility","hidden"),this.#u.setAttribute("visibility","hidden"),this.#e.style.display="none";return}this.#T(),this.#k(),this.#S(),this.#A(),this.#b()}#T(){!this.#l||!this.#c||(this.#l.style.visibility=this.#d?"visible":"hidden",this.#c.style.visibility=this.#a?"visible":"hidden")}#k(){if(!this.#r||!this.#h||!this.#u)return;let e=8,t=this.#d&&!this.#p&&this.#y&&this.#t.width>=e,n=!this.#p&&this.#a&&this.#g&&this.#r?.width>=e&&!this.#p;this.#h.setAttribute("visibility",t?"visible":"hidden"),this.#u.setAttribute("visibility",n?"visible":"hidden")}#S(){if(!this.#e)return;this.#e.style.display=this.#d||this.#a?"block":"none",this.#e.setAttribute("stroke-width","2");let e=_.ThemeSupport.instance().getComputedValue("--color-text-primary");if(!this.#r||this.#d&&this.#a){this.#e.setAttribute("stroke",e);return}this.#d&&!this.#a?this.#e.setAttribute("stroke","url(#fromVisibleLineGradient)"):this.#a&&!this.#d&&this.#e.setAttribute("stroke","url(#toVisibleLineGradient)")}#A(){if(!this.#e||!this.#h||!this.#u)return;let e=this.#t.height/2,t=this.#o.x+this.#t.width,n=this.#o.y+e;this.#e.setAttribute("x1",t.toString()),this.#e.setAttribute("y1",n.toString()),this.#h.setAttribute("cx",t.toString()),this.#h.setAttribute("cy",n.toString());let s=this.#n.x,o=this.#r?this.#n.y+(this.#r?.height??0)/2:this.#n.y;this.#e.setAttribute("x2",s.toString()),this.#e.setAttribute("y2",o.toString()),this.#u.setAttribute("cx",s.toString()),this.#u.setAttribute("cy",o.toString())}#x(){if(!this.#f)return 100;let e=25,t=this.#n.x-(this.#o.x+this.#t.width),n=e*100/t;return n<100?n:100}#w(){let e=this.#i.querySelector(".create-link-box"),t=e?.querySelector(".create-link-icon")??null;if(!e||!t){console.error("creating element is missing.");return}if(this.#v!=="creation_not_started"){t.style.display="none";return}t.style.left=`${this.#o.x+this.#t.width}px`,t.style.top=`${this.#o.y}px`}#E(){this.#v="pending_to_event",this.dispatchEvent(new T)}#b(){let e=_.ThemeSupport.instance().getComputedValue("--color-text-primary");ve(ye`
          <style>${F}</style>
          <svg class="connectorContainer" width="100%" height="100%" role="region" aria-label=${we(Y.diagram)}>
            <defs>
              <linearGradient
                id="fromVisibleLineGradient"
                x1="0%" y1="0%" x2="100%" y2="0%">
                <stop
                  offset="0%"
                  stop-color=${e}
                  stop-opacity="1" />
                <stop
                  offset="${this.#x()}%"
                  stop-color=${e}
                  stop-opacity="0" />
              </linearGradient>

              <linearGradient
                id="toVisibleLineGradient"
                x1="0%" y1="0%" x2="100%" y2="0%">
                <stop
                  offset="${100-this.#x()}%"
                  stop-color=${e}
                  stop-opacity="0" />
                <stop
                  offset="100%"
                  stop-color=${e}
                  stop-opacity="1" />
              </linearGradient>
              <marker
                id="arrow"
                orient="auto"
                markerWidth="3"
                markerHeight="4"
                fill-opacity="1"
                refX="4"
                refY="2"
                visibility=${this.#a||!this.#r?"visible":"hidden"}>
                <path d="M0,0 V4 L4,2 Z" fill=${e} />
              </marker>
            </defs>
            <line
              marker-end="url(#arrow)"
              stroke-dasharray=${!this.#y||!this.#g?Le:"none"}
              visibility=${!this.#d&&!this.#a?"hidden":"visible"}
              />
            <circle class="entryFromConnector" fill="none" stroke=${e} stroke-width=${X} r=${W} />
            <circle class="entryToConnector" fill="none" stroke=${e} stroke-width=${X} r=${W} />
          </svg>
          <div class="entry-wrapper from-highlight-wrapper ${this.#y?"":"entry-is-not-source"}"></div>
          <div class="entry-wrapper to-highlight-wrapper ${this.#g?"":"entry-is-not-source"}"></div>
          <div class="create-link-box ${this.#v?"visible":"hidden"}">
            <devtools-icon
              class='create-link-icon'
              jslog=${K.action("timeline.annotations.create-entry-link").track({click:!0})}
              @click=${this.#E}
              name='arrow-right-circle'>
            </devtools-icon>
          </div>
        `,this.#i,{host:this})}},W=2,X=1,Le=4;customElements.define("devtools-entries-link-overlay",E);var oe={};S(oe,{EntryLabelChangeEvent:()=>L,EntryLabelOverlay:()=>R,EntryLabelRemoveEvent:()=>w,LabelAnnotationsConsentDialogVisibilityChange:()=>A});import"./../../../../ui/kit/kit.js";import"./../../../../ui/components/tooltips/tooltips.js";import"./../../../../ui/components/spinners/spinners.js";import*as Q from"./../../../../core/common/common.js";import*as ee from"./../../../../core/host/host.js";import*as $ from"./../../../../core/i18n/i18n.js";import*as U from"./../../../../core/platform/platform.js";import*as c from"./../../../../core/root/root.js";import*as te from"./../../../../models/ai_assistance/ai_assistance.js";import"./../../../../ui/components/buttons/buttons.js";import*as C from"./../../../../ui/components/helpers/helpers.js";import*as ie from"./../../../../ui/helpers/helpers.js";import*as N from"./../../../../ui/legacy/legacy.js";import*as ne from"./../../../../ui/legacy/theme_support/theme_support.js";import*as p from"./../../../../ui/lit/lit.js";import*as f from"./../../../../ui/visual_logging/visual_logging.js";import*as se from"./../../../common/common.js";var Z=`.label-parts-wrapper{display:flex;flex-direction:column;align-items:center}.label-button-input-wrapper{display:flex;position:relative;overflow:visible}.ai-label-button-wrapper,
.ai-label-disabled-button-wrapper,
.ai-label-loading,
.ai-label-error{position:absolute;left:100%;display:flex;transform:translateY(-3px);flex-flow:row nowrap;border:none;border-radius:var(--sys-shape-corner-large);background:var(--sys-color-surface3);box-shadow:var(--drop-shadow);align-items:center;gap:var(--sys-size-4);pointer-events:auto;transition:all var(--sys-motion-duration-medium2) var(--sys-motion-easing-emphasized);&.only-pen-wrapper{overflow:hidden;width:var(--sys-size-12);height:var(--sys-size-12)}*{transform:translateX(-2px)}}.delete-button{display:flex;pointer-events:auto;position:absolute;right:0;top:-5px;border-radius:50%;padding:0;border:none;background:var(--color-background-inverted)}.ai-label-loading,
.ai-label-error{gap:var(--sys-size-6);padding:var(--sys-size-5) var(--sys-size-8)}.ai-label-button-wrapper:focus,
.ai-label-button-wrapper:focus-within,
.ai-label-button-wrapper:hover{width:auto;height:var(--sys-size-13);padding:var(--sys-size-3) var(--sys-size-5);transform:translateY(-9px);*{transform:translateX(0)}}.ai-label-button{display:flex;align-items:center;gap:var(--sys-size-4);padding:var(--sys-size-3) var(--sys-size-5);border:1px solid var(--color-primary);border-radius:var(--sys-shape-corner-large);&.enabled{background:var(--sys-color-surface3)}&.disabled{background:var(--sys-color-surface5)}&:hover{background:var(--sys-color-state-hover-on-subtle)}}.generate-label-text{white-space:nowrap;color:var(--color-primary)}.input-field{background-color:var(--color-background-inverted);color:var(--color-background);pointer-events:auto;border-radius:var(--sys-shape-corner-extra-small);white-space:nowrap;padding:var(--sys-size-3) var(--sys-size-4);font-family:var(--default-font-family);font-size:var(--sys-typescale-body2-size);font-weight:var(--ref-typeface-weight-medium);outline:2px solid var(--color-background)}.input-field:focus,
.label-parts-wrapper:focus-within .input-field,
.input-field.fake-focus-state{background-color:var(--color-background);color:var(--color-background-inverted);outline:2px solid var(--color-background-inverted)}.connectorContainer{overflow:visible}.entry-highlight-wrapper{box-sizing:border-box;border:2px solid var(--sys-color-on-surface);&.cut-off-top{border-top:none}&.cut-off-bottom{border-bottom:none}&.cut-off-right{border-right:none}&.cut-off-left{border-left:none}}.info-tooltip-container{max-width:var(--sys-size-28);button.link{cursor:pointer;text-decoration:underline;border:none;padding:0;background:none;font:inherit;font-weight:var(--ref-typeface-weight-medium);display:block;margin-top:var(--sys-size-4);color:var(--sys-color-primary)}}
/*# sourceURL=${import.meta.resolve("./entryLabelOverlay.css")} */`;var{html:g,Directives:J}=p,b={entryLabel:"Entry label",inputTextPrompt:"Enter an annotation label",generateLabelButton:"Generate label",freDialog:"Get AI-powered annotation suggestions dialog",learnMoreAriaLabel:"Learn more about auto annotations in settings",moreInfoAriaLabel:"More information about this feature"},r={learnMore:"Learn more in settings",generateLabelSecurityDisclaimer:"The selected call stack is sent to Google. This data may be seen by human reviewers to improve this feature. This is an experimental AI feature and won't always get it right.",generateLabelSecurityDisclaimerLoggingOff:"The selected call stack is sent to Google. This data will not be used to improve Google's AI models. Your organization may change these settings at any time. This is an experimental AI feature and won't always get it right.",autoAnnotationNotAvailableDisclaimer:"Auto annotations are not available.",autoAnnotationNotAvailableOfflineDisclaimer:"Auto annotations are not available because you are offline.",freDisclaimerHeader:"Get AI-powered annotation suggestions",generatingLabel:"Generating label",generationFailed:"Generation failed",freDisclaimerAiWontAlwaysGetItRight:"This feature uses AI and won\u2019t always get it right",freDisclaimerPrivacyDataSentToGoogle:"To generate annotation suggestions, your performance trace is sent to Google. This data may be seen by human reviewers to improve this feature.",freDisclaimerPrivacyDataSentToGoogleNoLogging:"To generate annotation suggestions, your performance trace is sent to Google. This data will not be used to improve Google\u2019s AI models. Your organization may change these settings at any time.",learnMoreButton:"Learn more"},Ae=$.i18n.registerUIStrings("panels/timeline/overlays/components/EntryLabelOverlay.ts",b),y=$.i18n.getLocalizedString.bind(void 0,Ae),h=$.i18n.lockedString;function ke(){return c.Runtime.hostConfig.devToolsGeminiRebranding?.enabled?!1:!c.Runtime.hostConfig.aidaAvailability?.disallowLogging}var w=class i extends Event{static eventName="entrylabelremoveevent";constructor(){super(i.eventName)}},L=class i extends Event{newLabel;static eventName="entrylabelchangeevent";constructor(e){super(i.eventName),this.newLabel=e}},A=class i extends Event{isVisible;static eventName="labelannotationsconsentdialogvisiblitychange";constructor(e){super(i.eventName,{bubbles:!0,composed:!0}),this.isVisible=e}},R=class i extends HTMLElement{static LABEL_AND_CONNECTOR_SHIFT_LENGTH=8;static LABEL_CONNECTOR_HEIGHT=7;static MAX_LABEL_LENGTH=100;#i=this.attachShadow({mode:"open"});#o=!1;#t=!0;#n=null;#r=null;#s=null;#e=null;#l=null;#c;#h;#u=J.createRef();#d;#a=null;#f=Q.Settings.Settings.instance().createSetting("ai-annotations-enabled",!1);#y=new te.PerformanceAnnotationsAgent.PerformanceAnnotationsAgent({aidaClient:new ee.AidaClient.AidaClient,serverSideLoggingEnabled:ke()});#g=!1;#p="hidden";constructor(e,t=!1){super(),this.#m(),this.#h=t,this.#r=this.#i.querySelector(".label-parts-wrapper"),this.#e=this.#r?.querySelector(".input-field")??null,this.#l=this.#r?.querySelector(".connectorContainer")??null,this.#s=this.#r?.querySelector(".entry-highlight-wrapper")??null,this.#c=e,this.#d=c.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue===c.Runtime.GenAiEnterprisePolicyValue.ALLOW_WITHOUT_LOGGING,this.#S(e),e!==""&&this.setLabelEditabilityAndRemoveEmptyLabel(!1);let n=e===""?y(b.inputTextPrompt):e;this.#e?.setAttribute("aria-label",n),this.#k()}overrideAIAgentForTest(e){this.#y=e}entryHighlightWrapper(){return this.#s}#v(){let e=this.#e?.textContent?.trim()??"";e!==this.#c&&(this.#c=e,this.dispatchEvent(new L(this.#c)),this.#e?.dispatchEvent(new Event("change",{bubbles:!0,composed:!0}))),this.#b(),this.#m(),this.#e?.setAttribute("aria-label",e)}#L(e){if(!this.#e)return!1;let t=["Backspace","Delete","ArrowLeft","ArrowRight"];return(e.key===U.KeyboardUtilities.ENTER_KEY||e.key===U.KeyboardUtilities.ESCAPE_KEY)&&this.#t?(this.#e.blur(),this.setLabelEditabilityAndRemoveEmptyLabel(!1),!1):this.#e.textContent!==null&&this.#e.textContent.length<=i.MAX_LABEL_LENGTH||t.includes(e.key)||e.key.length===1&&e.ctrlKey?!0:(e.preventDefault(),!1)}#T(e){e.preventDefault();let t=e.clipboardData;if(!t||!this.#e)return;let n=t.getData("text").replace(/(\r\n|\n|\r)/gm,""),o=(this.#e.textContent+n).slice(0,i.MAX_LABEL_LENGTH+1);this.#e.textContent=o,this.#x()}set entryLabelVisibleHeight(e){this.#n=e,C.ScheduledRender.scheduleRender(this,this.#m),this.#t&&this.#A(),this.#S(),this.#k()}#k(){if(!this.#l){console.error("`connectorLineContainer` element is missing.");return}if(this.#h&&this.#n){let s=this.#n+i.LABEL_CONNECTOR_HEIGHT;this.#l.style.transform=`translateY(${s}px) rotate(180deg)`}let e=this.#l.querySelector("line"),t=this.#l.querySelector("circle");if(!e||!t){console.error("Some entry label elements are missing.");return}this.#l.setAttribute("width",(i.LABEL_AND_CONNECTOR_SHIFT_LENGTH*2).toString()),this.#l.setAttribute("height",i.LABEL_CONNECTOR_HEIGHT.toString()),e.setAttribute("x1","0"),e.setAttribute("y1","0"),e.setAttribute("x2",i.LABEL_AND_CONNECTOR_SHIFT_LENGTH.toString()),e.setAttribute("y2",i.LABEL_CONNECTOR_HEIGHT.toString());let n=ne.ThemeSupport.instance().getComputedValue("--color-text-primary");e.setAttribute("stroke",n),e.setAttribute("stroke-width","2"),t.setAttribute("cx",i.LABEL_AND_CONNECTOR_SHIFT_LENGTH.toString()),t.setAttribute("cy",(i.LABEL_CONNECTOR_HEIGHT+1).toString()),t.setAttribute("r","3"),t.setAttribute("fill",n)}#S(e){if(!this.#e){console.error("`labelBox`element is missing.");return}typeof e=="string"&&(this.#e.innerText=e);let t=null,n=null;this.#h?t=i.LABEL_AND_CONNECTOR_SHIFT_LENGTH:t=i.LABEL_AND_CONNECTOR_SHIFT_LENGTH*-1,this.#h&&this.#n&&(n=this.#n+i.LABEL_CONNECTOR_HEIGHT*2+this.#e?.offsetHeight);let s="";t&&(s+=`translateX(${t}px) `),n&&(s+=`translateY(${n}px)`),s.length&&(this.#e.style.transform=s)}#A(){if(!this.#e){console.error("`labelBox` element is missing.");return}this.#e.focus()}setLabelEditabilityAndRemoveEmptyLabel(e){if(this.#g&&e===!1)return;e?this.setAttribute("data-user-editing-label","true"):this.removeAttribute("data-user-editing-label"),this.#t=e,this.#m(),e&&this.#e&&(this.#x(),this.#A());let t=this.#e?.textContent?.trim()??"";!e&&t.length===0&&!this.#o&&(this.#o=!0,this.dispatchEvent(new w))}#x(){if(!this.#e)return;let e=window.getSelection(),t=document.createRange();t.selectNodeContents(this.#e),t.collapse(!1),e?.removeAllRanges(),e?.addRange(t)}set callTree(e){this.#a=e,this.#b()}async#w(){if(this.#f.get()){if(!this.#a||!this.#e)return;try{this.#p="generating_label",N.ARIAUtils.LiveAnnouncer.alert(r.generatingLabel),this.#m(),this.#A(),C.ScheduledRender.scheduleRender(this,this.#m),this.#c=await this.#y.generateAIEntryLabel(this.#a),this.dispatchEvent(new L(this.#c)),this.#e.innerText=this.#c,this.#x(),this.#b(),this.#m()}catch{this.#p="generation_failed",C.ScheduledRender.scheduleRender(this,this.#m)}}else{this.#g=!0,this.#m();let e=await this.#E();this.#g=!1,this.setLabelEditabilityAndRemoveEmptyLabel(!0),e&&await this.#w()}}async#E(){this.dispatchEvent(new A(!0));let e=await se.FreDialog.show({ariaLabel:y(b.freDialog),header:{iconName:"pen-spark",text:h(r.freDisclaimerHeader)},reminderItems:[{iconName:"psychiatry",content:h(r.freDisclaimerAiWontAlwaysGetItRight)},{iconName:"google",content:this.#d?h(r.freDisclaimerPrivacyDataSentToGoogleNoLogging):h(r.freDisclaimerPrivacyDataSentToGoogle)}],onLearnMoreClick:()=>{ie.openInNewTab("https://developer.chrome.com/docs/devtools/performance/annotations#auto-annotations")},learnMoreButtonText:r.learnMoreButton});return this.dispatchEvent(new A(!1)),e&&this.#f.set(!0),this.#f.get()}#b(){let e=!!c.Runtime.hostConfig.devToolsAiGeneratedTimelineLabels?.enabled,t=c.Runtime.hostConfig.aidaAvailability?.enterprisePolicyValue===c.Runtime.GenAiEnterprisePolicyValue.DISABLE,n=this.#a!==null,s=this.#c?.length<=0;!e||t||!n||!s?this.#p="hidden":c.Runtime.hostConfig.aidaAvailability?.enabled&&!c.Runtime.hostConfig.aidaAvailability?.blockedByAge&&!c.Runtime.hostConfig.aidaAvailability?.blockedByGeo&&navigator.onLine?this.#p="enabled":this.#p="disabled"}#C(e){return g`<devtools-tooltip
    variant="rich"
    id="info-tooltip"
    ${J.ref(this.#u)}>
      <div class="info-tooltip-container">
        ${e.textContent} ${e.includeSettingsButton?g`
          <button
            class="link tooltip-link"
            role="link"
            jslog=${f.link("open-ai-settings").track({click:!0})}
            @click=${this.#N}
            aria-label=${y(b.learnMoreAriaLabel)}
          >${h(r.learnMore)}</button>
        `:p.nothing}
      </div>
    </devtools-tooltip>`}#$(){return g`
      <span
        class="ai-label-loading">
        <devtools-spinner></devtools-spinner>
        <span class="generate-label-text">${h(r.generatingLabel)}</span>
      </span>
    `}#R(){return this.#p==="generation_failed"?g`
        <span
          class="ai-label-error">
          <devtools-icon
            class="warning extra-large"
            name="warning"
            style="color: var(--ref-palette-error50)">
          </devtools-icon>
          <span class="generate-label-text">${h(r.generationFailed)}</span>
        </span>
      `:g`
      <!-- 'preventDefault' on the AI label button to prevent the label removal on blur  -->
      <span
        class="ai-label-button-wrapper only-pen-wrapper"
        @mousedown=${e=>e.preventDefault()}>
        <button
          class="ai-label-button enabled"
          @click=${this.#w}
          jslog=${f.link("timeline.annotations.ai-generate-label").track({click:!0})}>
          <devtools-icon
            class="pen-icon extra-large"
            name="pen-spark"
            style="color: var(--icon-primary);">
          </devtools-icon>
          <span class="generate-label-text">${y(b.generateLabelButton)}</span>
        </button>
        <devtools-button
          aria-details="info-tooltip"
          class="pen-icon"
          .title=${y(b.moreInfoAriaLabel)}
          .iconName=${"info"}
          .variant=${"icon"}
          ></devtools-button>
        ${this.#C({textContent:this.#d?h(r.generateLabelSecurityDisclaimerLoggingOff):h(r.generateLabelSecurityDisclaimer),includeSettingsButton:!0})}
      </span>
    `}#N(){this.#u?.value?.hidePopover(),N.ViewManager.ViewManager.instance().showView("chrome-ai")}#I(){let e=navigator.onLine===!1;return g`
      <!-- 'preventDefault' on the AI label button to prevent the label removal on blur  -->
      <span
        class="ai-label-disabled-button-wrapper only-pen-wrapper"
        @mousedown=${t=>t.preventDefault()}>
        <button
          class="ai-label-button disabled"
          ?disabled=${!0}
          @click=${this.#w}>
          <devtools-icon
            aria-details="info-tooltip"
            class="pen-icon extra-large"
            name="pen-spark"
            style="color: var(--sys-color-state-disabled);">
          </devtools-icon>
        </button>
        ${this.#C({textContent:h(e?r.autoAnnotationNotAvailableOfflineDisclaimer:r.autoAnnotationNotAvailableDisclaimer),includeSettingsButton:!e})}
      </span>
    `}#B(e){let t=e.relatedTarget;t&&this.#i.contains(t)||this.setLabelEditabilityAndRemoveEmptyLabel(!1)}#m(){let e=p.Directives.classMap({"input-field":!0,"fake-focus-state":this.#g});p.render(g`
        <style>${Z}</style>
        <span class="label-parts-wrapper" role="region" aria-label=${y(b.entryLabel)}
          @focusout=${this.#B}
        >
          <span
            class="label-button-input-wrapper">
            <span
              class=${e}
              role="textbox"
              @focus=${()=>{this.setLabelEditabilityAndRemoveEmptyLabel(!0)}}
              @dblclick=${()=>{this.setLabelEditabilityAndRemoveEmptyLabel(!0)}}
              @keydown=${this.#L}
              @paste=${this.#T}
              @input=${this.#v}
              contenteditable=${this.#t?"plaintext-only":!1}
              jslog=${f.textField("timeline.annotations.entry-label-input").track({keydown:!0,click:!0,change:!0})}
              tabindex="0"
            ></span>
            ${this.#t&&this.#e?.innerText!==""?g`
              <button
                class="delete-button"
                @click=${()=>this.dispatchEvent(new w)}
                jslog=${f.action("timeline.annotations.delete-entry-label").track({click:!0})}>
              <devtools-icon name="cross" class="small" style="color: var(--color-background);"
              ></devtools-icon>
              </button>
            `:p.nothing}
            ${(()=>{switch(this.#p){case"hidden":return p.nothing;case"enabled":return this.#R();case"generating_label":return this.#$();case"generation_failed":return this.#R();case"disabled":return this.#I()}})()}
          </span>
          <svg class="connectorContainer">
            <line/>
            <circle/>
          </svg>
          <div class="entry-highlight-wrapper"></div>
        </span>`,this.#i,{host:this})}};customElements.define("devtools-entry-label-overlay",R);var he={};S(he,{TimeRangeLabelChangeEvent:()=>I,TimeRangeOverlay:()=>H,TimeRangeRemoveEvent:()=>B});import*as k from"./../../../../core/i18n/i18n.js";import*as V from"./../../../../core/platform/platform.js";import{html as Se,render as Te}from"./../../../../ui/lit/lit.js";import*as ae from"./../../../../ui/visual_logging/visual_logging.js";var re=`:host{display:flex;overflow:hidden;flex-direction:column;justify-content:flex-end;width:100%;height:100%;box-sizing:border-box;padding-bottom:5px;background:linear-gradient(180deg,rgb(255 125 210/0%) 0%,rgb(255 125 210/15%) 85%);border-color:var(--ref-palette-pink55);border-width:0 1px 5px;border-style:solid;pointer-events:none}.range-container{display:flex;align-items:center;flex-direction:column;text-align:center;box-sizing:border-box;pointer-events:all;user-select:none;color:var(--sys-color-pink);&.labelHidden{user-select:none;pointer-events:none;visibility:hidden}&.offScreenLeft{align-items:flex-start;text-align:left}&.offScreenRight{align-items:flex-end;text-align:right}}.label-text{width:100%;max-width:70px;min-width:fit-content;text-overflow:ellipsis;overflow:hidden;word-break:normal;overflow-wrap:anywhere;margin-bottom:3px;display:-webkit-box;white-space:break-spaces;background:var(--sys-color-cdt-base-container);line-clamp:2;-webkit-line-clamp:2;-webkit-box-orient:vertical}.duration{background:var(--sys-color-cdt-base-container)}.label-text[contenteditable='true']{outline:none;box-shadow:0 0 0 1px var(--ref-palette-pink55)}.label-text[contenteditable='false']{width:auto}
/*# sourceURL=${import.meta.resolve("./timeRangeOverlay.css")} */`;var le={timeRange:"Time range"},Ee=k.i18n.registerUIStrings("panels/timeline/overlays/components/TimeRangeOverlay.ts",le),Ce=k.i18n.getLocalizedString.bind(void 0,Ee),I=class i extends Event{newLabel;static eventName="timerangelabelchange";constructor(e){super(i.eventName),this.newLabel=e}},B=class i extends Event{static eventName="timerangeremoveevent";constructor(){super(i.eventName)}},H=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#o=null;#t=null;#n;#r=!0;#s=null;#e=null;constructor(e){if(super(),this.#a(),this.#s=this.#i.querySelector(".range-container"),this.#e=this.#s?.querySelector(".label-text")??null,this.#n=e,!this.#e){console.error("`labelBox` element is missing.");return}this.#e.innerText=e,e&&(this.#e?.setAttribute("aria-label",e),this.#h(!1))}set canvasRect(e){e!==null&&(this.#t&&this.#t.width===e.width&&this.#t.height===e.height||(this.#t=e,this.#a()))}set duration(e){e!==this.#o&&(this.#o=e,this.#a())}#l(e){if(!this.#t)return 0;let{x:t,width:n}=e,s=t+n,o=this.#t.x,u=this.#t.x+this.#t.width,a=Math.max(o,t);return Math.min(u,s)-a}updateLabelPositioning(){if(!this.#s||!this.#t||!this.#e)return;let e=9,t=this.getBoundingClientRect(),n=this.#i.activeElement===this.#e,s=this.#s.getBoundingClientRect(),o=this.#l(t)-e,a=(this.#s.querySelector(".duration")??null)?.getBoundingClientRect().width;if(!a)return;let d=o<=a&&!n&&this.#n.length>0;if(this.#s.classList.toggle("labelHidden",d),d)return;let v=(t.width-s.width)/2,m=t.x+v<this.#t.x;this.#s.classList.toggle("offScreenLeft",m);let q=this.#t.x+this.#t.width,x=t.x+v+s.width>q;this.#s.classList.toggle("offScreenRight",x),m?this.#s.style.marginLeft=`${Math.abs(this.#t.x-t.x)+e}px`:x?this.#s.style.marginRight=`${t.right-this.#t.right+e}px`:this.#s.style.margin="0px",this.#e?.innerText===""&&this.#h(!0)}#c(){if(!this.#e){console.error("`labelBox` element is missing.");return}this.#e.focus()}#h(e){if(this.#e?.innerText===""){this.#c();return}this.#r=e,this.#a(),e&&this.#c()}#u(){let e=this.#e?.textContent??"";e!==this.#n&&(this.#n=e,this.dispatchEvent(new I(this.#n)),this.#e?.setAttribute("aria-label",e))}#d(e){return e.key===V.KeyboardUtilities.ENTER_KEY||e.key===V.KeyboardUtilities.ESCAPE_KEY?(e.stopPropagation(),this.#n===""&&this.dispatchEvent(new B),this.#e?.blur(),!1):!0}#a(){let e=this.#o?k.TimeUtilities.formatMicroSecondsTime(this.#o):"";Te(Se`
          <style>${re}</style>
          <span class="range-container" role="region" aria-label=${Ce(le.timeRange)}>
            <span
             class="label-text"
             role="textbox"
             @focusout=${()=>this.#h(!1)}
             @dblclick=${()=>this.#h(!0)}
             @keydown=${this.#d}
             @keyup=${this.#u}
             contenteditable=${this.#r?"plaintext-only":!1}
             jslog=${ae.textField("timeline.annotations.time-range-label-input").track({keydown:!0,click:!0})}
            ></span>
            <span class="duration">${e}</span>
          </span>
          `,this.#i,{host:this}),this.updateLabelPositioning()}};customElements.define("devtools-time-range-overlay",H);var be={};S(be,{DEFAULT_VIEW:()=>ge,TimespanBreakdownOverlay:()=>M});import*as de from"./../../../../core/i18n/i18n.js";import*as ue from"./../../../../ui/legacy/legacy.js";import{Directives as pe,html as z,nothing as Re,render as $e}from"./../../../../ui/lit/lit.js";var ce=`@scope to (devtools-widget > *){.timespan-breakdown-overlay-section{border:solid;border-color:var(--sys-color-on-surface);border-width:4px 1px 0;align-content:flex-start;text-align:center;overflow:hidden;text-overflow:ellipsis;background-image:linear-gradient(180deg,var(--sys-color-on-primary),transparent);height:90%;box-sizing:border-box;padding-top:var(--sys-size-2);.is-below &{border-top-width:0;border-bottom-width:4px;align-content:flex-end;padding-bottom:var(--sys-size-2);padding-top:0;.timespan-breakdown-overlay-label{display:flex;flex-direction:column-reverse}}}.timeline-segment-container{display:flex;overflow:hidden;flex-direction:row;justify-content:flex-end;align-items:flex-end;width:100%;box-sizing:border-box;height:100%;max-height:100px;.timespan-breakdown-overlay-section:first-child{border-left-width:1px!important}.timespan-breakdown-overlay-section:last-child{border-right-width:1px!important}}.timeline-segment-container.is-below{align-items:flex-start}.timeline-segment-container.even-number-of-sections{.timespan-breakdown-overlay-section:nth-child(even){height:100%}.timespan-breakdown-overlay-section:nth-child(odd){border-left-width:0;border-right-width:0}}.timeline-segment-container.odd-number-of-sections{.timespan-breakdown-overlay-section:nth-child(odd){height:100%}.timespan-breakdown-overlay-section:nth-child(even){border-left-width:0;border-right-width:0}}.timespan-breakdown-overlay-label{font-family:var(--default-font-family);font-size:var(--sys-typescale-body2-size);line-height:var(--sys-typescale-body4-line-height);font-weight:var(--ref-typeface-weight-medium);color:var(--sys-color-on-surface);text-align:center;box-sizing:border-box;width:max-content;padding:0 3px;overflow:hidden;text-overflow:ellipsis;text-wrap:nowrap;.duration-text{font-size:var(--sys-typescale-body4-size);text-overflow:ellipsis;overflow:hidden;text-wrap:nowrap;display:block}.discovery-time-ms{font-weight:var(--ref-typeface-weight-bold)}&.labelHidden{user-select:none;pointer-events:none;visibility:hidden}&.labelTruncated{max-width:100%}&.offScreenLeft{text-align:left}&.offScreenRight{text-align:right}}}
/*# sourceURL=${import.meta.resolve("./timespanBreakdownOverlay.css")} */`;var Ne=(i,e)=>{let t=pe.styleMap({left:e?`${e.left}px`:void 0,width:e?`${e.width}px`:void 0});return z`
      <div class="timespan-breakdown-overlay-section" style=${t}>
        <div class="timespan-breakdown-overlay-label">
          ${i.showDuration?z`<span class="duration-text">${de.TimeUtilities.formatMicroSecondsAsMillisFixed(i.bounds.range)}</span> `:Re}
          <span class="section-label-text">${i.label}</span>
        </div>
      </div>`},ge=(i,e,t)=>{let n=pe.styleMap({left:i.left?`${i.left}px`:void 0,width:i.width?`${i.width}px`:void 0,top:i.top?`${i.top}px`:void 0,maxHeight:i.maxHeight?`${i.maxHeight}px`:void 0,position:"relative"});$e(z`
        <style>${ce}</style>
        <div style=${n} class=${i.className}>
          ${i.sections?.map((s,o)=>Ne(s,i.positions[o]))}
        </div>`,t,{container:{classes:["devtools-timespan-breakdown-overlay"]}})},M=class extends ue.Widget.Widget{#i=null;#o=null;#t=[];#n=null;#r=null;#s=null;#e=null;#l;constructor(e,t=ge){super(e),this.#l=t,this.requestUpdate()}set top(e){this.#e=e,this.requestUpdate()}set maxHeight(e){this.#s=e,this.requestUpdate()}set width(e){this.#r=e,this.requestUpdate()}set left(e){this.#n=e,this.requestUpdate()}set isBelowEntry(e){this.element.classList.toggle("is-below",e)}set canvasRect(e){this.#i&&e&&this.#i.width===e.width&&this.#i.height===e.height||(this.#i=e,this.requestUpdate())}set widths(e){e!==this.#t&&(this.#t=e,this.requestUpdate())}set sections(e){e!==this.#o&&(this.#o=e,this.requestUpdate())}checkSectionLabelPositioning(){let e=this.element.querySelectorAll(".timespan-breakdown-overlay-section");if(!e||!this.#i)return;let t=9,n=new Map;for(let o of e){let u=o.querySelector(".timespan-breakdown-overlay-label");if(!u)continue;let a=o.getBoundingClientRect(),l=u.getBoundingClientRect();n.set(o,{sectionRect:a,labelRect:l,label:u})}let s=30;for(let o of e){let u=n.get(o);if(!u)break;let{labelRect:a,sectionRect:l,label:d}=u,v=l.width<s,O=l.width-5<=a.width;if(d.classList.toggle("labelHidden",v),d.classList.toggle("labelTruncated",O),v||O)continue;let m=(l.width-a.width)/2,D=l.x+m<this.#i.x;d.classList.toggle("offScreenLeft",D);let x=this.#i.x+this.#i.width,P=l.x+m+a.width>x;if(d.classList.toggle("offScreenRight",P),D)d.style.marginLeft=`${Math.abs(this.#i.x-l.x)+t}px`;else if(P){let fe=x-a.width-l.x;d.style.marginLeft=`${fe}px`}else d.style.marginLeft=`${m}px`}}performUpdate(){let e="timeline-segment-container";this.#o&&(this.#o.length%2===0?e+=" even-number-of-sections":e+=" odd-number-of-sections"),this.#l({sections:this.#o,positions:this.#t,left:this.#n,width:this.#r,top:this.#e,maxHeight:this.#s,className:e},void 0,this.contentElement),this.checkSectionLabelPositioning()}};export{j as EntriesLinkOverlay,oe as EntryLabelOverlay,he as TimeRangeOverlay,be as TimespanBreakdownOverlay};
//# sourceMappingURL=components.js.map
