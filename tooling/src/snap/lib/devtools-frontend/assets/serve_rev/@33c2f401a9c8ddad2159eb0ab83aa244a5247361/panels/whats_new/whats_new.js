var P=Object.defineProperty;var m=(s,t)=>{for(var e in t)P(s,e,{get:t[e],enumerable:!0})};var I={};m(I,{getReleaseNote:()=>n,setReleaseNoteForTest:()=>j});import*as S from"./../../ui/components/markdown_view/markdown_view.js";var x=!1;function j(s){p=s}function n(){if(!x){for(let{key:s,link:t}of p.markdownLinks)S.MarkdownLinksMap.markdownLinks.set(s,t);x=!0}return p}var p={version:149,header:"What\u2019s new in DevTools 149",markdownLinks:[{key:"devtools-for-agents",link:"https://developer.chrome.com/blog/new-in-devtools-149/#devtools-for-agents"},{key:"ai-assistance",link:"https://developer.chrome.com/blog/new-in-devtools-149/#ai-assistance"},{key:"css-code-completion",link:"https://developer.chrome.com/blog/new-in-devtools-149/#css-code-completion"}],videoLinks:[],link:"https://developer.chrome.com/blog/new-in-devtools-149/"};var H={};m(H,{DEVTOOLS_TIPS_THUMBNAIL:()=>R,GENERAL_THUMBNAIL:()=>C,ReleaseNoteView:()=>l,WHATS_NEW_THUMBNAIL:()=>$,getMarkdownContent:()=>A});import"./../../ui/components/markdown_view/markdown_view.js";import"./../../ui/kit/kit.js";import*as g from"./../../core/i18n/i18n.js";import*as T from"./../../third_party/marked/marked.js";import"./../../ui/components/buttons/buttons.js";import*as U from"./../../ui/helpers/helpers.js";import*as L from"./../../ui/legacy/legacy.js";import{html as v,render as O}from"./../../ui/lit/lit.js";import*as V from"./../../ui/visual_logging/visual_logging.js";var z=`@scope to (devtools-widget > *){.whatsnew{background:var(--sys-color-header-container);flex-grow:1;flex-shrink:0;display:flex;width:100%;height:100%;overflow:auto;justify-content:center}.whatsnew-content{max-width:var(--sys-size-35);padding:var(--sys-size-9) 0 0;>*{padding:0 var(--sys-size-9) var(--sys-size-9) var(--sys-size-9)}}.header{display:flex;align-items:center;font:var(--sys-typescale-headline4);&::before{content:"";width:var(--sys-size-9);height:var(--sys-size-9);transform:scale(1.6);margin:0 var(--sys-size-8) 0 var(--sys-size-4);background-image:var(--image-file-devtools);flex-shrink:0}}.feature-container{flex-grow:1;padding:0;background-color:var(--sys-color-surface);border-radius:var(--sys-shape-corner-large) var(--sys-shape-corner-large) 0 0;display:flex;flex-direction:column}.feature{background-color:var(--sys-color-surface3);padding:0 var(--sys-size-8) var(--sys-size-8);border-radius:var(--sys-shape-corner-medium);margin:0 var(--sys-size-9) var(--sys-size-9)}.video-container{margin-bottom:var(--sys-size-9);&:has(.video){--video-bottom-padding:var(--sys-size-6);overflow:auto;display:flex;flex-direction:row;gap:var(--sys-size-5);padding:var(--sys-size-9) var(--sys-size-9) var(--video-bottom-padding);margin-bottom:calc(var(--sys-size-9) - var(--video-bottom-padding));> *{min-width:auto}}}.video{align-items:center;display:flex;flex-direction:row;border-radius:var(--sys-shape-corner-medium);background-color:var(--sys-color-surface3);font:var(--sys-typescale-body5-regular);min-width:var(--sys-size-29);max-width:var(--sys-size-32);overflow:hidden;height:72px;&:hover{box-shadow:var(--sys-elevation-level3)}.thumbnail{border-radius:var(--sys-shape-corner-medium) 0 0 var(--sys-shape-corner-medium);flex-shrink:0}.thumbnail-description{--description-margin:var(--sys-size-6);margin:var(--description-margin);height:calc(100% - var(--description-margin) * 2);overflow:hidden}}devtools-link:focus .video{outline:var(--sys-size-2) solid var(--sys-color-state-focus-ring)}@media (forced-colors: active){.feature,
    .video{border:var(--sys-size-1) solid ButtonText}}}
/*# sourceURL=${import.meta.resolve("./releaseNoteView.css")} */`;var M={seeFeatures:"See all new features"},G=g.i18n.registerUIStrings("panels/whats_new/ReleaseNoteView.ts",M),q=g.i18n.getLocalizedString.bind(void 0,G),$="../../Images/whatsnew.svg",R="../../Images/devtools-tips.svg",C="../../Images/devtools-thumbnail.svg";async function A(){let s=await l.getFileContent(),t=T.Marked.lexer(s),e=[],o=Number.MAX_SAFE_INTEGER;return t.forEach(r=>{r.type==="heading"&&o>=r.depth?(e.push([r]),o=r.depth):e.length>0?e[e.length-1].push(r):e.push([r])}),e}var l=class extends L.Panel.Panel{#e;constructor(t=(e,o,r)=>{let d=e.getReleaseNote(),D=e.markdownContent;O(v`
      <style>${z}</style>
      <div class="whatsnew" jslog=${V.section().context("release-notes")}>
        <div class="whatsnew-content">
          <div class="header">
            ${d.header}
          </div>
          <div>
            <devtools-button
                  .variant=${"primary"}
                  .jslogContext=${"learn-more"}
                  @click=${()=>e.openNewTab(d.link)}
              >${q(M.seeFeatures)}</devtools-button>
          </div>

          <div class="feature-container">
            <div class="video-container">
              ${d.videoLinks.map(i=>v`
                  <devtools-link
                  href=${i.link}
                  jslogcontext="learn-more">
                    <div class="video">
                      <img class="thumbnail" src=${e.getThumbnailPath(i.type??"WhatsNew")}>
                      <div class="thumbnail-description"><span>${i.description}</span></div>
                    </div>
                </devtools-link>
                `)}
            </div>
            ${D.map(i=>v`
                  <div class="feature">
                    <devtools-markdown-view slot="content" .data=${{tokens:i}}>
                    </devtools-markdown-view>
                  </div>`)}
          </div>
        </div>
      </div>
    `,r)}){super("whats-new",!0),this.#e=t,this.requestUpdate()}static async getFileContent(){let t=new URL("./resources/WNDT.md",import.meta.url);try{return await(await fetch(t.toString())).text()}catch{throw new Error(`Markdown file ${t.toString()} not found. Make sure it is correctly listed in the relevant BUILD.gn files.`)}}async performUpdate(){let t=await A();this.#e({getReleaseNote:n,openNewTab:U.openInNewTab,markdownContent:t,getThumbnailPath:this.#t},this,this.contentElement)}#t(t){let e;switch(t){case"WhatsNew":e=$;break;case"DevtoolsTips":e=R;break;case"Other":e=C;break}return new URL(e,import.meta.url).toString()}};var B={};m(B,{HelpLateInitialization:()=>y,ReleaseNotesActionDelegate:()=>k,ReportIssueActionDelegate:()=>N,getReleaseNoteVersionSetting:()=>X,releaseNoteViewId:()=>F,releaseVersionSeen:()=>c,showReleaseNoteIfNeeded:()=>W});import*as a from"./../../core/common/common.js";import*as _ from"./../../core/host/host.js";import*as b from"./../../ui/helpers/helpers.js";import*as E from"./../../ui/legacy/legacy.js";var c="releaseNoteVersionSeen",F="release-note",h;function W(){let t=a.Settings.Settings.instance().createSetting(c,0).get(),e=n();return J(t,e.version,a.Settings.Settings.instance().moduleSetting("help.show-release-note").get())}function X(){return h||(h=a.Settings.Settings.instance().createSetting(c,0)),h}function J(s,t,e){let o=a.Settings.Settings.instance().createSetting(c,0);return s?!e||s>=t?!1:(o.set(t),E.ViewManager.ViewManager.instance().showView(F,!0),!0):(o.set(t),!1)}var u,y=class s{static instance(t={forceNew:null}){let{forceNew:e}=t;return(!u||e)&&(u=new s),u}async run(){_.InspectorFrontendHost.isUnderTest()||W()}},f,k=class s{handleAction(t,e){let o=n();return b.openInNewTab(o.link),!0}static instance(t={forceNew:null}){let{forceNew:e}=t;return(!f||e)&&(f=new s),f}},w,N=class s{handleAction(t,e){return b.openInNewTab("https://goo.gle/devtools-bug"),!0}static instance(t={forceNew:null}){let{forceNew:e}=t;return(!w||e)&&(w=new s),w}};export{I as ReleaseNoteText,H as ReleaseNoteView,B as WhatsNew};
//# sourceMappingURL=whats_new.js.map
