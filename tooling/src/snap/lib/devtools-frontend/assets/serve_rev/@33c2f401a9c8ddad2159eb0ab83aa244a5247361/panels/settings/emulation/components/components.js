var C=Object.defineProperty;var E=(m,e)=>{for(var i in e)C(m,i,{get:e[i],enumerable:!0})};var S={};E(S,{ALL_PROTOCOL_FORM_FACTORS:()=>y,ClientHintsChangeEvent:()=>h,ClientHintsSubmitEvent:()=>x,UserAgentClientHintsForm:()=>w});import"./../../../../ui/kit/kit.js";import"./../../../../ui/legacy/legacy.js";import*as A from"./../../../../core/i18n/i18n.js";import*as F from"./../../../../core/platform/platform.js";import"./../../../../ui/components/buttons/buttons.js";import*as V from"./../../../../ui/components/input/input.js";import*as b from"./../../../../ui/lit/lit.js";import*as d from"./../../../../ui/visual_logging/visual_logging.js";import*as $ from"./../utils/utils.js";var k=`.root{color:var(--sys-color-on-surface);width:100%}.tree-title{font-weight:700;display:flex;align-items:center;& > [aria-controls="form-container"]{margin-left:var(--sys-size-2);padding-right:var(--sys-size-3);& > [name="triangle-right"],
    & > [name="triangle-down"]{vertical-align:bottom}&[aria-expanded="true"] > [name="triangle-right"]{display:none}&[aria-expanded="false"] > [name="triangle-down"]{display:none}}}.form-container{display:grid;grid-template-columns:1fr 1fr 1fr auto;align-items:center;gap:8px 10px;padding:0 10px}.full-row{grid-column:1/5}.form-factors-checkbox-group{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 10px}.form-factor-checkbox-label{display:flex;align-items:center;gap:6px;white-space:nowrap}hr.section-separator{grid-column:1/5;border:none;margin-top:1px}.half-row{grid-column:span 2}.mobile-checkbox-container{display:flex}.device-model-input{grid-column:1/4}.input-field{color:var(--sys-color-on-surface);padding:3px 6px;border-radius:2px;border:1px solid var(--sys-color-neutral-outline);background-color:var(--sys-color-cdt-base-container);font-size:inherit;height:18px}.input-field::placeholder{color:var(--sys-color-on-surface-subtle)}.input-field:focus{border:1px solid var(--sys-color-state-focus-ring);outline-style:none}.add-container{cursor:pointer;display:flex;align-items:center;gap:6px}.add-icon{margin-right:5px}.brand-row{display:flex;align-items:center;gap:10px;justify-content:space-between}.brand-row > input{width:100%}.info-icon{margin-left:5px;margin-right:1px;height:var(--sys-size-8);width:var(--sys-size-8)}.link,
.devtools-link{color:var(--sys-color-primary);text-decoration:underline;cursor:pointer;outline-offset:2px;font-weight:400}devtools-icon + .link{margin-inline-start:2px}.hide-container{display:none}.input-field-label-container{display:flex;flex-direction:column;gap:10px}@media (forced-colors: active){.input-field{border:1px solid}.tree-title[aria-disabled="true"]{color:GrayText}}
/*# sourceURL=${import.meta.resolve("./userAgentClientHintsForm.css")} */`;var{html:u}=b,t={title:"User agent client hints",useragent:"User agent (Sec-CH-UA)",fullVersionList:"Full version list (Sec-CH-UA-Full-Version-List)",brandProperties:"User agent properties",brandName:"Brand",brandNameAriaLabel:"Brand {PH1}",significantBrandVersionPlaceholder:"Significant version (e.g. 87)",brandVersionPlaceholder:"Version (e.g. 87.0.4280.88)",brandVersionAriaLabel:"Version {PH1}",addBrand:"Add Brand",brandUserAgentDelete:"Delete brand from user agent section",brandFullVersionListDelete:"Delete brand from full version list",formFactorsTitle:"Form Factors (Sec-CH-UA-Form-Factors)",formFactorsGroupAriaLabel:"Available Form Factors",formFactorDesktop:"Desktop",formFactorAutomotive:"Automotive",formFactorMobile:"Mobile",formFactorTablet:"Tablet",formFactorXR:"XR",formFactorEInk:"EInk",formFactorWatch:"Watch",fullBrowserVersion:"Full browser version (Sec-CH-UA-Full-Version)",fullBrowserVersionPlaceholder:"Full browser version (e.g. 87.0.4280.88)",platformLabel:"Platform (Sec-CH-UA-Platform / Sec-CH-UA-Platform-Version)",platformProperties:"Platform properties",platformVersion:"Platform version",platformPlaceholder:"Platform (e.g. Android)",architecture:"Architecture (Sec-CH-UA-Arch)",architecturePlaceholder:"Architecture (e.g. x86)",deviceProperties:"Device properties",deviceModel:"Device model (Sec-CH-UA-Model)",mobileCheckboxLabel:"Mobile",update:"Update",notRepresentable:"Not representable as structured headers string.",userAgentClientHintsInfo:"User agent client hints are an alternative to the user agent string that identify the browser and the device in a more structured way with better privacy accounting.",addedBrand:"Added brand row",deletedBrand:"Deleted brand row",learnMore:"Learn more"},P=A.i18n.registerUIStrings("panels/settings/emulation/components/UserAgentClientHintsForm.ts",t),r=A.i18n.getLocalizedString.bind(void 0,P),h=class m extends Event{static eventName="clienthintschange";constructor(){super(m.eventName)}},x=class m extends Event{static eventName="clienthintssubmit";detail;constructor(e){super(m.eventName),this.detail={value:e}}},L={brands:[{brand:"",version:""}],fullVersionList:[{brand:"",version:""}],fullVersion:"",platform:"",platformVersion:"",architecture:"",model:"",mobile:!1,formFactors:[]},y=[t.formFactorDesktop,t.formFactorAutomotive,t.formFactorMobile,t.formFactorTablet,t.formFactorXR,t.formFactorEInk,t.formFactorWatch],w=class extends HTMLElement{#f=this.attachShadow({mode:"open"});#r=!1;#a=!1;#e=L;#s=!1;#o=!1;#i="";set value(e){let{metaData:i=L,showMobileCheckbox:a=!1,showSubmitButton:n=!1}=e;this.#e={...this.#e,...i},this.#s=a,this.#o=n,this.#t()}get value(){return{metaData:this.#e}}set disabled(e){this.#a=e,this.#r=!1,this.#t()}get disabled(){return this.#a}#m=e=>{(e.code==="Space"||e.code==="Enter"||e.code==="ArrowLeft"||e.code==="ArrowRight")&&(e.consume(!0),this.#l(e.code))};#l=e=>{this.#a||e==="ArrowLeft"&&!this.#r||e==="ArrowRight"&&this.#r||(this.#r=!this.#r,this.#t())};#d=(e,i,a)=>{let n=this.#e.brands?.map((s,o)=>{if(o===i){let{brand:l,version:p}=s;return a==="brandName"?{brand:e,version:p}:{brand:l,version:e}}return s});this.#e={...this.#e,brands:n},this.dispatchEvent(new h),this.#t()};#c=(e,i,a)=>{let n=this.#e.fullVersionList?.map((s,o)=>{if(o===i){let{brand:l,version:p}=s;return a==="brandName"?{brand:e,version:p}:{brand:l,version:e}}return s});this.#e={...this.#e,fullVersionList:n},this.dispatchEvent(new h),this.#t()};#b=e=>{let{brands:i=[]}=this.#e;i.splice(e,1),this.#e={...this.#e,brands:i},this.dispatchEvent(new h),this.#i=r(t.deletedBrand),this.#t();let a=this.shadowRoot?.getElementById(`ua-brand-${e+1}-input`);a||(a=this.shadowRoot?.getElementById("add-brand-button")),a?.focus()};#g=e=>{let{fullVersionList:i=[]}=this.#e;i.splice(e,1),this.#e={...this.#e,fullVersionList:i},this.dispatchEvent(new h),this.#i=r(t.deletedBrand),this.#t();let a=this.shadowRoot?.getElementById(`fvl-brand-${e+1}-input`);a||(a=this.shadowRoot?.getElementById("add-fvl-brand-button")),a?.focus()};#u=()=>{let{brands:e}=this.#e;this.#e={...this.#e,brands:[...Array.isArray(e)?e:[],{brand:"",version:""}]},this.dispatchEvent(new h),this.#i=r(t.addedBrand),this.#t();let i=this.shadowRoot?.querySelectorAll(".ua-brand-name-input");if(i){let a=Array.from(i).pop();a&&a.focus()}};#v=e=>{(e.code==="Space"||e.code==="Enter")&&(e.preventDefault(),this.#u())};#h=()=>{let{fullVersionList:e}=this.#e;this.#e={...this.#e,fullVersionList:[...Array.isArray(e)?e:[],{brand:"",version:""}]},this.dispatchEvent(new h),this.#i=r(t.addedBrand),this.#t();let i=this.shadowRoot?.querySelectorAll(".fvl-brand-name-input");if(i){let a=Array.from(i).pop();a&&a.focus()}};#$=e=>{(e.code==="Space"||e.code==="Enter")&&(e.preventDefault(),this.#h())};#x=(e,i)=>{let a=[...this.#e.formFactors||[]];i?a.includes(e)||a.push(e):a=a.filter(n=>n!==e),this.#e={...this.#e,formFactors:a},this.dispatchEvent(new h),this.#t()};#n=(e,i)=>{e in this.#e&&(this.#e={...this.#e,[e]:i},this.#t()),this.dispatchEvent(new h)};#w=e=>{e.preventDefault(),this.#o&&(this.dispatchEvent(new x(this.#e)),this.#t())};#p(e,i,a,n){return u`
      <label class="full-row label input-field-label-container">
        ${e}
        <input
          class="input-field"
          type="text"
          @input=${o=>{let l=o.target.value;this.#n(n,l)}}
          .value=${a}
          placeholder=${i}
          jslog=${d.textField().track({change:!0}).context(F.StringUtilities.toKebabCase(n))}
          />
      </label>
    `}#F(){let{platform:e,platformVersion:i}=this.#e,a=s=>{let o=s.target.value;this.#n("platform",o)},n=s=>{let o=s.target.value;this.#n("platformVersion",o)};return u`
      <span class="full-row label">${r(t.platformLabel)}</span>
      <div class="full-row brand-row" aria-label=${r(t.platformProperties)} role="group">
        <input
          class="input-field half-row"
          type="text"
          @input=${a}
          .value=${e}
          placeholder=${r(t.platformPlaceholder)}
          aria-label=${r(t.platformLabel)}
          jslog=${d.textField("platform").track({change:!0})}
        />
        <input
          class="input-field half-row"
          type="text"
          @input=${n}
          .value=${i}
          placeholder=${r(t.platformVersion)}
          aria-label=${r(t.platformVersion)}
          jslog=${d.textField("platform-version").track({change:!0})}
        />
      </div>
    `}#y(){let{model:e,mobile:i}=this.#e,a=o=>{let l=o.target.value;this.#n("model",l)},n=o=>{let l=o.target.checked;this.#n("mobile",l)},s=this.#s?u`
      <label class="mobile-checkbox-container">
        <input type="checkbox" @input=${n} .checked=${i}
          jslog=${d.toggle("mobile").track({click:!0})}
        />
        ${r(t.mobileCheckboxLabel)}
      </label>
    `:b.nothing;return u`
      <span class="full-row label">${r(t.deviceModel)}</span>
      <div class="full-row brand-row" aria-label=${r(t.deviceProperties)} role="group">
        <input
          class="input-field ${this.#s?"device-model-input":"full-row"}"
          type="text"
          @input=${a}
          .value=${e}
          placeholder=${r(t.deviceModel)}
          jslog=${d.textField("model").track({change:!0})}
        />
        ${s}
      </div>
    `}#A(){let{brands:e=[{brand:"",version:""}]}=this.#e,i=e.map((a,n)=>{let{brand:s,version:o}=a,l=()=>{this.#b(n)},p=c=>{(c.code==="Space"||c.code==="Enter")&&(c.preventDefault(),l())},g=c=>{let f=c.target.value;this.#d(f,n,"brandName")},v=c=>{let f=c.target.value;this.#d(f,n,"brandVersion")};return u`
        <div class="full-row brand-row" aria-label=${r(t.brandProperties)} role="group">
          <input
            class="input-field ua-brand-name-input"
            type="text"
            @input=${g}
            .value=${s}
            id="ua-brand-${n+1}-input"
            placeholder=${r(t.brandName)}
            aria-label=${r(t.brandNameAriaLabel,{PH1:n+1})}
            jslog=${d.textField("brand-name").track({change:!0})}
          />
          <input
            class="input-field"
            type="text"
            @input=${v}
            .value=${o}
            placeholder=${r(t.significantBrandVersionPlaceholder)}
            aria-label=${r(t.brandVersionAriaLabel,{PH1:n+1})}
            jslog=${d.textField("brand-version").track({change:!0})}
          />
          <devtools-icon name="bin"
            title=${r(t.brandUserAgentDelete)}
            class="medium delete-icon"
            tabindex="0"
            role="button"
            @click=${l}
            @keypress=${p}
            aria-label=${r(t.brandUserAgentDelete)}
          >
          </devtools-icon>
        </div>
      `});return u`
      <span class="full-row label">${r(t.useragent)}</span>
      ${i}
      <div
        class="add-container full-row"
        role="button"
        tabindex="0"
        id="add-brand-button"
        aria-label=${r(t.addBrand)}
        @click=${this.#u}
        @keypress=${this.#v}
      >
        <devtools-icon
          aria-hidden="true" name="plus" class="medium">
        </devtools-icon>
        ${r(t.addBrand)}
      </div>
    `}#k(){let{fullVersionList:e=[{brand:"",version:""}]}=this.#e,i=e.map((a,n)=>{let{brand:s,version:o}=a,l=()=>{this.#g(n)},p=c=>{(c.code==="Space"||c.code==="Enter")&&(c.preventDefault(),l())},g=c=>{let f=c.target.value;this.#c(f,n,"brandName")},v=c=>{let f=c.target.value;this.#c(f,n,"brandVersion")};return u`
        <div
          class="full-row brand-row"
          aria-label=${r(t.brandProperties)}
          jslog=${d.section("full-version")}
          role="group">
          <input
            class="input-field fvl-brand-name-input"
            type="text"
            @input=${g}
            .value=${s}
            id="fvl-brand-${n+1}-input"
            placeholder=${r(t.brandName)}
            aria-label=${r(t.brandNameAriaLabel,{PH1:n+1})}
            jslog=${d.textField("brand-name").track({change:!0})}
          />
          <input
            class="input-field"
            type="text"
            @input=${v}
            .value=${o}
            placeholder=${r(t.brandVersionPlaceholder)}
            aria-label=${r(t.brandVersionAriaLabel,{PH1:n+1})}
            jslog=${d.textField("brand-version").track({change:!0})}
          />
          <devtools-icon name="bin" 
            title=${r(t.brandFullVersionListDelete)}
            class="medium delete-icon"
            tabindex="0"
            role="button"
            @click=${l}
            @keypress=${p}
            aria-label=${r(t.brandFullVersionListDelete)}
          >
          </devtools-icon>
        </div>
      `});return u`
      <span class="full-row label">${r(t.fullVersionList)}</span>
      ${i}
      <div
        class="add-container full-row"
        role="button"
        tabindex="0"
        id="add-fvl-brand-button"
        aria-label=${r(t.addBrand)}
        @click=${this.#h}
        @keypress=${this.#$}
      >
        <devtools-icon name="plus" class="medium"
          aria-hidden="true">
        </devtools-icon>
        ${r(t.addBrand)}
      </div>
    `}#L(){let e=y.map(i=>{let a=this.#e.formFactors?.includes(i)||!1,n=`formFactor${i}`,s=r(t[n]);return u`
        <label class="form-factor-checkbox-label">
          <input
            type="checkbox"
            .checked=${a}
            value=${i}
            jslog=${d.toggle(F.StringUtilities.toKebabCase(i)).track({click:!0})}
            @change=${o=>this.#x(i,o.target.checked)}
          />
          ${s}
        </label>
      `});return u`
      <span class="full-row label" jslog=${d.sectionHeader("form-factors")}>
        ${r(t.formFactorsTitle)}
      </span>
      <div class="full-row form-factors-checkbox-group" role="group" aria-label=${r(t.formFactorsGroupAriaLabel)}>
        ${e}
      </div>
    `}#t(){let{fullVersion:e,architecture:i}=this.#e,a=this.#A(),n=this.#k(),s=this.#p(r(t.fullBrowserVersion),r(t.fullBrowserVersionPlaceholder),e||"","fullVersion"),o=this.#L(),l=this.#F(),p=this.#p(r(t.architecture),r(t.architecturePlaceholder),i,"architecture"),g=this.#y(),v=this.#o?u`
      <devtools-button
        .variant=${"outlined"}
        .type=${"submit"}
      >
        ${r(t.update)}
      </devtools-button>
    `:b.nothing,c=u`
      <style>${V.checkboxStyles}</style>
      <style>${k}</style>
      <section class="root">
        <div class="tree-title">
          <div
            role=button
            @click=${this.#l}
            tabindex=${this.#a?"-1":"0"}
            @keydown=${this.#m}
            aria-expanded=${this.#r}
            aria-controls=form-container
            aria-disabled=${this.#a}
            aria-label=${r(t.title)}
            jslog=${d.toggleSubpane().track({click:!0})}>
            <devtools-icon name=triangle-right></devtools-icon>
            <devtools-icon name=triangle-down></devtools-icon>
            ${r(t.title)}
          </div>
          <devtools-icon tabindex=${this.#a?"-1":"0"} class=info-icon name=info aria-label=${r(t.userAgentClientHintsInfo)} title=${r(t.userAgentClientHintsInfo)}></devtools-icon>
          <devtools-link
           tabindex=${this.#a?"-1":"0"}
           href="https://web.dev/user-agent-client-hints/"
           class="link"
           aria-label=${r(t.learnMore)}
           jslogcontext="learn-more"
          >
            ${r(t.learnMore)}
          </devtools-link>
        </div>
        <form
          id="form-container"
          class="form-container ${this.#r?"":"hide-container"}"
          @submit=${this.#w}
        >
          ${a}
          <hr class="section-separator">
          ${n}
          <hr class="section-separator">
          ${s}
          <hr class="section-separator">
          ${o}
          <hr class="section-separator">
          ${l}
          <hr class="section-separator">
          ${p}
          <hr class="section-separator">
          ${g}
          ${v}
        </form>
        <div aria-live="polite" aria-label=${this.#i}></div>
      </section>
    `;b.render(c,this.#f,{host:this})}validate=()=>{for(let[e,i]of Object.entries(this.#e))if(e==="brands"||e==="fullVersionList"){if(!this.#e.brands?.every(({brand:n,version:s})=>{let o=$.UserAgentMetadata.validateAsStructuredHeadersString(n,r(t.notRepresentable)),l=$.UserAgentMetadata.validateAsStructuredHeadersString(s,r(t.notRepresentable));return o.valid&&l.valid}))return{valid:!1,errorMessage:r(t.notRepresentable)}}else if(e==="formFactors"){let a=i;if(a)for(let n of a){if(!y.includes(n))return{valid:!1,errorMessage:r(t.notRepresentable)+` (Invalid form factor: ${n})`};let s=$.UserAgentMetadata.validateAsStructuredHeadersString(n,r(t.notRepresentable));if(!s.valid)return s}}else{let a=$.UserAgentMetadata.validateAsStructuredHeadersString(i,r(t.notRepresentable));if(!a.valid)return a}return{valid:!0}}};customElements.define("devtools-user-agent-client-hints-form",w);export{S as UserAgentClientHintsForm};
//# sourceMappingURL=components.js.map
