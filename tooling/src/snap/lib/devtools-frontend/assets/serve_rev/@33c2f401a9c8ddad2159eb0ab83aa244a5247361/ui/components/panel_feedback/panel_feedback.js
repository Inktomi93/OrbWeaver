var R=Object.defineProperty;var c=(i,e)=>{for(var t in e)R(i,t,{get:e[t],enumerable:!0})};var S={};c(S,{FeedbackButton:()=>n});import*as b from"./../../../core/host/host.js";import*as h from"./../../../core/i18n/i18n.js";import*as w from"./../../../core/platform/platform.js";import*as p from"./../helpers/helpers.js";import{html as F,render as C}from"./../../lit/lit.js";import"./../buttons/buttons.js";var $={feedback:"Feedback"},E=h.i18n.registerUIStrings("ui/components/panel_feedback/FeedbackButton.ts",$),H=h.i18n.getLocalizedString.bind(void 0,E),n=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#e={feedbackUrl:w.DevToolsPath.EmptyUrlString};set data(e){this.#e=e,p.ScheduledRender.scheduleRender(this,this.#o)}#t(){b.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(this.#e.feedbackUrl)}#o(){if(!p.ScheduledRender.isScheduledRender(this))throw new Error("FeedbackButton render was not scheduled");C(F`
      <devtools-button
          @click=${this.#t}
          .iconName=${"review"}
          .variant=${"outlined"}
          .jslogContext=${"feedback"}
      >${H($.feedback)}</devtools-button>
      `,this.#i,{host:this})}};customElements.define("devtools-feedback-button",n);var L={};c(L,{PanelFeedback:()=>r});import"./../../kit/kit.js";import*as k from"./../../../core/i18n/i18n.js";import*as m from"./../../../core/platform/platform.js";import*as v from"./../helpers/helpers.js";import{html as P,render as I}from"./../../lit/lit.js";var y=`:host{display:block}.preview{padding:12px 16px;border:1px solid var(--sys-color-divider);color:var(--sys-color-on-surface);font-size:13px;line-height:20px;border-radius:12px;margin:42px 0;letter-spacing:0.01em}h2{color:var(--sys-color-primary);font-size:13px;line-height:20px;letter-spacing:0.01em;margin:9px 0 14px;display:flex;align-items:center;gap:5px;font-weight:normal}h3{font-size:13px;line-height:20px;letter-spacing:0.04em;color:var(--sys-color-on-surface);margin-bottom:2px;font-weight:normal}.preview p{margin-bottom:24px}.thumbnail{height:92px}.video{display:flex;flex-flow:row wrap;gap:20px}devtools-link{color:var(--sys-color-primary);text-decoration-line:underline}devtools-link.quick-start-link{font-size:14px;line-height:22px;letter-spacing:0.04em}.video-description{min-width:min-content;flex-basis:min-content;flex-grow:1}@media (forced-colors: active){devtools-link{color:linktext}}
/*# sourceURL=${import.meta.resolve("./panelFeedback.css")} */`;var o={previewText:"Our team is actively working on this feature and we would love to know what you think.",previewTextFeedbackLink:"Send us your feedback.",previewFeature:"Preview feature",videoAndDocumentation:"Video and documentation"},_=k.i18n.registerUIStrings("ui/components/panel_feedback/PanelFeedback.ts",o),s=k.i18n.getLocalizedString.bind(void 0,_),M=new URL("../../../Images/preview_feature_video_thumbnail.svg",import.meta.url).toString(),r=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#e={feedbackUrl:m.DevToolsPath.EmptyUrlString,quickStartUrl:m.DevToolsPath.EmptyUrlString,quickStartLinkText:""};set data(e){this.#e=e,v.ScheduledRender.scheduleRender(this,this.#t)}#t(){if(!v.ScheduledRender.isScheduledRender(this))throw new Error("PanelFeedback render was not scheduled");I(P`
      <style>${y}</style>
      <div class="preview">
        <h2 class="flex">
          <devtools-icon name="experiment" class="extra-large" style="color: var(--icon-primary);"></devtools-icon> ${s(o.previewFeature)}
        </h2>
        <p>${s(o.previewText)} <devtools-link href=${this.#e.feedbackUrl} .jslogContext=${"feedback"}>${s(o.previewTextFeedbackLink)}</devtools-link></p>
        <div class="video">
          <div class="thumbnail">
            <img src=${M} role="presentation" />
          </div>
          <div class="video-description">
            <h3>${s(o.videoAndDocumentation)}</h3>
            <devtools-link class="quick-start-link" href=${this.#e.quickStartUrl} jslogcontext="css-overview.quick-start">${this.#e.quickStartLinkText}</devtools-link>
          </div>
        </div>
      </div>
      `,this.#i,{host:this})}};customElements.define("devtools-panel-feedback",r);var T={};c(T,{PreviewToggle:()=>d});import"./../../kit/kit.js";import"./../../legacy/legacy.js";import*as u from"./../../../core/i18n/i18n.js";import*as g from"./../../../core/root/root.js";import{html as l,nothing as f,render as q}from"./../../lit/lit.js";var U=`:host{display:block}.container{display:flex;flex-wrap:wrap;padding:4px}.feedback,
.learn-more{display:flex;align-items:center}.helper{flex-basis:100%;text-align:center;font-style:italic}.spacer{flex:1}.devtools-link{color:var(--sys-color-primary);text-decoration-line:underline;margin:0 4px}.feedback .devtools-link{color:var(--sys-color-token-subtle)}
/*# sourceURL=${import.meta.resolve("./previewToggle.css")} */`;var a={previewTextFeedbackLink:"Send us your feedback.",shortFeedbackLink:"Send feedback",learnMoreLink:"Learn More"},z=u.i18n.registerUIStrings("ui/components/panel_feedback/PreviewToggle.ts",a),x=u.i18n.getLocalizedString.bind(void 0,z),d=class extends HTMLElement{#i=this.attachShadow({mode:"open"});#e="";#t=null;#o=null;#s;#n="";#r;set data(e){this.#e=e.name,this.#t=e.helperText,this.#o=e.feedbackURL,this.#s=e.learnMoreURL,this.#n=e.experiment,this.#r=e.onChangeCallback,this.#l()}#l(){let e=this.#n&&g.Runtime.experiments.isEnabled(this.#n);q(l`
      <style>${U}</style>
      <div class="container">
          <devtools-checkbox
            ?checked=${e}
            @change=${this.#a}
            aria-label=${this.#e} >
            <devtools-icon name="experiment" class="medium">
          </devtools-icon>${this.#e}
          </devtools-checkbox>
        <div class="spacer"></div>
        ${this.#o&&!this.#t?l`<div class="feedback"><devtools-link class="devtools-link" href=${this.#o} jslogContext=${"feedback"}>${x(a.shortFeedbackLink)}</devtools-link></div>`:f}
        ${this.#s?l`<div class="learn-more"><devtools-link class="devtools-link" href=${this.#s} jslogContext=${"learn-more"}>${x(a.learnMoreLink)}</devtools-link></div>`:f}
        <div class="helper">
          ${this.#t&&this.#o?l`<p>${this.#t} <devtools-link class="devtools-link" href=${this.#o} jslogContext=${"feedback"}>${x(a.previewTextFeedbackLink)}</devtools-link></p>`:f}
        </div>
      </div>`,this.#i,{host:this})}#a(e){let t=e.target.checked;this.#n&&g.Runtime.experiments.setEnabled(this.#n,t),this.#r?.(t)}};customElements.define("devtools-preview-toggle",d);export{S as FeedbackButton,L as PanelFeedback,T as PreviewToggle};
//# sourceMappingURL=panel_feedback.js.map
