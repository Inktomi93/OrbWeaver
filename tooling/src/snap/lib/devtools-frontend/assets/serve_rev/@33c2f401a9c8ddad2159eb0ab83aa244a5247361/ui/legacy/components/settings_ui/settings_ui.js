var x=Object.defineProperty;var S=(e,t)=>{for(var n in t)x(e,n,{get:t[n],enumerable:!0})};var b={};S(b,{createControlForSetting:()=>D,createSettingCheckbox:()=>y,renderControlForSetting:()=>v,renderSettingSelect:()=>$});import"./../../../components/settings/settings.js";import"./../../../../core/common/common.js";import*as u from"./../../../../core/i18n/i18n.js";import*as h from"./../../../../core/platform/platform.js";import{Directives as I,html as i,nothing as l,render as C}from"./../../../lit/lit.js";import*as c from"./../../../visual_logging/visual_logging.js";import*as r from"./../../legacy.js";var{createRef:w,ref:k}=I,s={srequiresReload:"*Requires reload",settingsChangedReloadDevTools:"Settings changed. To apply, reload DevTools."},q=u.i18n.registerUIStrings("ui/legacy/components/settings_ui/SettingsUI.ts",s),g=u.i18n.getLocalizedString.bind(void 0,q);function y(e,t,n){let o=r.UIUtils.CheckboxLabel.create(e,void 0,void 0,t.name);return o.name=e,r.UIUtils.bindCheckbox(o,t),n&&r.Tooltip.Tooltip.install(o,n),o}function $(e,t){let n=e.title(),o=e.options(),p=e.reloadRequired(),{deprecation:m}=e,f=r.ARIAUtils.nextId("labelledControl"),d=w(),U=a=>{let R=a.target;e.set(o[R.selectedIndex].value),p&&(r.InspectorView.InspectorView.instance().displayReloadRequiredWarning(g(s.settingsChangedReloadDevTools)),d.value&&d.value.classList.remove("hidden"))};return i`
    <div class=${I.classMap({"chrome-select-label":!!t})}>
      <p class="settings-select">
        <label for=${f}>
          ${n}
          ${t?i`<p>${t}</p>`:l}
          ${m?i`<devtools-setting-deprecation-warning .data=${m}></devtools-setting-deprecation-warning>`:l}
        </label>
        <select
          id=${f}
          aria-label=${n}
          .disabled=${e.disabled()}
          @change=${U}
          jslog=${c.dropDown().track({change:!0}).context(e.name)}
        >
          ${o.map(a=>a.text&&typeof a.value=="string"?i`
                <option
                  value=${a.value}
                  ?selected=${e.get()===a.value}
                  jslog=${c.item(h.StringUtilities.toKebabCase(a.value)).track({click:!0})}
                >
                  ${a.text}
                </option>
              `:l)}
        </select>
      </p>
      ${p?i`
        <p ${k(d)} class="reload-warning hidden" role="alert" aria-live="polite">
          ${g(s.srequiresReload)}
        </p>`:l}
    </div>
  `}var v=function(e,t){switch(e.type()){case"boolean":return i`<setting-checkbox .data=${{setting:e}} @change=${()=>{e.reloadRequired()&&r.InspectorView.InspectorView.instance().displayReloadRequiredWarning(g(s.settingsChangedReloadDevTools))}}></setting-checkbox>`;case"enum":return $(e,t);default:return console.error("Invalid setting type: "+e.type()),l}},D=function(e,t){let n=v(e,t);if(n===l)return null;let o=document.createDocumentFragment();return C(n,o),o.firstElementChild};export{b as SettingsUI};
//# sourceMappingURL=settings_ui.js.map
