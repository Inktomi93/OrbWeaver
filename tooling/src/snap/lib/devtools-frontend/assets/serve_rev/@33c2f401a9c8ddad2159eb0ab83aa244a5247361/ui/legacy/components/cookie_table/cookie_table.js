var D=Object.defineProperty;var E=(C,e)=>{for(var i in e)D(C,i,{get:e[i],enumerable:!0})};var B={};E(B,{CookiesTable:()=>y});import"./../data_grid/data_grid.js";import*as u from"./../../../../core/common/common.js";import*as p from"./../../../../core/i18n/i18n.js";import*as T from"./../../../../core/root/root.js";import*as v from"./../../../../core/sdk/sdk.js";import*as g from"./../../../../models/issues_manager/issues_manager.js";import*as $ from"./../../../../panels/network/forward/forward.js";import{Icon as w}from"./../../../kit/kit.js";import{Directives as U,html as m,render as P}from"./../../../lit/lit.js";import*as I from"./../../legacy.js";var S=`devtools-data-grid{flex:auto}.cookies-table devtools-icon{margin-right:4px}
/*# sourceURL=${import.meta.resolve("./cookiesTable.css")} */`;var{repeat:L,ifDefined:x}=U,n={session:"Session",name:"Name",value:"Value",size:"Size",domain:"Domain",path:"Path",secure:"Secure",partitionKeySite:"Partition Key Site",priority:"Priority",editableCookies:"Editable Cookies",cookies:"Cookies",na:"N/A",showRequestsWithThisCookie:"Show requests with this cookie",showIssueAssociatedWithThis:"Show issue associated with this cookie",sourcePortTooltip:"Shows the source port (range 1-65535) the cookie was set on. If the port is unknown, this shows -1.",sourceSchemeTooltip:"Shows the source scheme (`Secure`, `NonSecure`) the cookie was set on. If the scheme is unknown, this shows `Unset`.",timeAfter:"after {date}",timeAfterTooltip:"The expiration timestamp is {seconds}, which corresponds to a date after {date}",opaquePartitionKey:"(opaque)"},R=p.i18n.registerUIStrings("ui/legacy/components/cookie_table/CookiesTable.ts",n),a=p.i18n.getLocalizedString.bind(void 0,R),K=p.i18n.getLazilyComputedLocalizedString.bind(void 0,R),f=K(n.session),y=class extends I.Widget.VBox{#e;#t;#s;#i;lastEditedColumnId;data=[];cookies=[];#o;cookieToBlockedReasons;cookieToExemptionReason;view;selectedKey;#n;renderInline;schemeBindingEnabled;portBindingEnabled;constructor(e,i,r,t,c,d,l){super(e),l||(l=(o,V,k)=>{P(m`
          <devtools-data-grid
               name=${o.editable?a(n.editableCookies):a(n.cookies)}
               id="cookies-table"
               striped
               ?inline=${o.renderInline}
               @create=${s=>o.onCreate(s.detail)}
               @refresh=${o.onRefresh}
               @deselect=${()=>o.onSelect(void 0)}
          >
            <table>
               <tr>
                 <th id=${"name"} sortable ?disclosure=${o.editable} ?editable=${o.editable} long weight="24">
                   ${a(n.name)}
                 </th>
                 <th id=${"value"} sortable ?editable=${o.editable} long weight="34">
                   ${a(n.value)}
                 </th>
                 <th id=${"domain"} sortable weight="7" ?editable=${o.editable}>
                   ${a(n.domain)}
                 </th>
                 <th id=${"path"} sortable weight="7" ?editable=${o.editable}>
                   ${a(n.path)}
                 </th>
                 <th id=${"expires"} sortable weight="7" ?editable=${o.editable}>
                   Expires / Max-Age
                 </th>
                 <th id=${"size"} sortable align="right" weight="7">
                   ${a(n.size)}
                 </th>
                 <th id=${"http-only"} sortable align="center" weight="7" ?editable=${o.editable} type="boolean">
                   HttpOnly
                 </th>
                 <th id=${"secure"} sortable align="center" weight="7" ?editable=${o.editable} type="boolean">
                   ${a(n.secure)}
                 </th>
                 <th id=${"same-site"} sortable weight="7" ?editable=${o.editable}>
                   SameSite
                 </th>
                 <th id=${"partition-key-site"} sortable weight="7" ?editable=${o.editable}>
                   ${a(n.partitionKeySite)}
                 </th>
                 <th id=${"has-cross-site-ancestor"} sortable align="center" weight="7" ?editable=${o.editable} type="boolean">
                   Cross Site
                 </th>
                 <th id=${"priority"} sortable weight="7" ?editable=${o.editable}>
                   ${a(n.priority)}
                 </th>
                 ${o.schemeBindingEnabled?m`
                 <th id=${"source-scheme"} sortable align="center" weight="7" ?editable=${o.editable} type="string">
                   SourceScheme
                 </th>`:""}
                 ${o.portBindingEnabled?m`
                <th id=${"source-port"} sortable align="center" weight="7" ?editable=${o.editable} type="number">
                   SourcePort
                </th>`:""}
              </tr>
              ${L(this.data,s=>s.key,s=>m`
                <tr ?selected=${s.key===o.selectedKey}
                    ?inactive=${s.inactive}
                    ?dirty=${s.dirty}
                    ?highlighted=${s.flagged}
                    @edit=${b=>o.onEdit(s,b.detail.columnId,b.detail.valueBeforeEditing,b.detail.newText)}
                    @delete=${()=>o.onDelete(s)}
                    @contextmenu=${b=>o.onContextMenu(s,b.detail)}
                    @select=${()=>o.onSelect(s.key)}>
                  <td>${s.icons?.name}${s.name}</td>
                  <td>${s.value}</td>
                  <td>${s.icons?.domain}${s.domain}</td>
                  <td>${s.icons?.path}${s.path}</td>
                  <td title=${x(s.expiresTooltip)}>${s.expires}</td>
                  <td>${s.size}</td>
                  <td data-value=${!!s["http-only"]}></td>
                  <td data-value=${!!s.secure}>${s.icons?.secure}</td>
                  <td>${s.icons?.["same-site"]}${s["same-site"]}</td>
                  <td>${s["partition-key-site"]}</td>
                  <td data-value=${!!s["has-cross-site-ancestor"]}></td>
                  <td data-value=${x(s.priorityValue)}>${s.priority}</td>
                  ${o.schemeBindingEnabled?m`
                    <td title=${a(n.sourceSchemeTooltip)}>${s["source-scheme"]}</td>`:""}
                  ${o.portBindingEnabled?m`
                    <td title=${a(n.sourcePortTooltip)}>${s["source-port"]}</td>`:""}
                </tr>`)}
                ${o.editable?m`<tr placeholder><tr>`:""}
              </table>
            </devtools-data-grid>`,k,{host:k})}),this.registerRequiredCSS(S),this.element.classList.add("cookies-table"),this.#e=r,this.#t=t,this.#i=d,this.#n=!!r;let{devToolsEnableOriginBoundCookies:h}=T.Runtime.hostConfig;this.schemeBindingEnabled=!!h?.schemeBindingEnabled,this.portBindingEnabled=!!h?.portBindingEnabled,this.view=l,this.renderInline=!!i,this.#s=c,this.lastEditedColumnId=null,this.data=[],this.#o="",this.cookieToBlockedReasons=null,this.cookieToExemptionReason=null,this.requestUpdate()}set cookiesData(e){this.setCookies(e.cookies,e.cookieToBlockedReasons,e.cookieToExemptionReason)}set saveCallback(e){this.#e=e}set refreshCallback(e){this.#t=e}set selectedCallback(e){this.#s=e}set deleteCallback(e){this.#i=e}set editable(e){this.#n=e}set inline(e){this.renderInline=e,this.requestUpdate()}setCookies(e,i,r){this.cookieToBlockedReasons=i||null,this.cookieToExemptionReason=r||null,this.cookies=e;let t=this.data.find(d=>d.key===this.selectedKey),c=this.cookies.find(d=>d.key()===this.selectedKey);this.data=e.sort((d,l)=>d.name().localeCompare(l.name())).map(this.createCookieData.bind(this)),t&&this.lastEditedColumnId&&!c&&(t.inactive=!0,this.data.push(t)),this.requestUpdate()}set cookieDomain(e){this.#o=e}selectedCookie(){return this.cookies.find(e=>e.key()===this.selectedKey)||null}willHide(){super.willHide(),this.lastEditedColumnId=null}performUpdate(){let e={data:this.data,selectedKey:this.selectedKey,editable:this.#n,renderInline:this.renderInline,schemeBindingEnabled:this.schemeBindingEnabled,portBindingEnabled:this.portBindingEnabled,onEdit:this.onUpdateCookie.bind(this),onCreate:this.onCreateCookie.bind(this),onRefresh:this.refresh.bind(this),onDelete:this.onDeleteCookie.bind(this),onSelect:this.onSelect.bind(this),onContextMenu:this.populateContextMenu.bind(this)},i={};this.view(e,i,this.element)}onSelect(e){this.selectedKey=e,this.#s?.(this.selectedCookie())}onDeleteCookie(e){let i=this.cookies.find(r=>r.key()===e.key);i&&this.#i&&this.#i(i,()=>this.refresh())}onUpdateCookie(e,i,r,t){let c=this.cookies.find(l=>l.key()===e.key);if(!c)return;let d={...e,[i]:t};if(!this.isValidCookieData(d)){d.dirty=!0,this.requestUpdate();return}this.lastEditedColumnId=i,this.saveCookie(d,c)}onCreateCookie(e){this.setDefaults(e),this.isValidCookieData(e)?this.saveCookie(e):(e.dirty=!0,this.requestUpdate())}setDefaults(e){e.name===void 0&&(e.name=""),e.value===void 0&&(e.value=""),e.domain===void 0&&(e.domain=this.#o),e.path===void 0&&(e.path="/"),e.expires===void 0&&(e.expires=f()),e["partition-key"]===void 0&&(e["partition-key"]="")}saveCookie(e,i){if(!this.#e)return;let r=this.createCookieFromData(e);this.#e(r,i??null).then(t=>{t||(e.dirty=!0),this.refresh()})}createCookieFromData(e){let i=new v.Cookie.Cookie(e.name||"",e.value||"",null,e.priority);for(let r of["domain","path","http-only","secure","same-site","source-scheme"])r in e&&i.addAttribute(r,e[r]);return e.expires&&e.expires!==f()&&i.addAttribute("expires",new Date(e.expires).toUTCString()),"source-port"in e&&i.addAttribute("source-port",Number.parseInt(e["source-port"]||"",10)||void 0),e["partition-key-site"]&&i.setPartitionKey(e["partition-key-site"],!!(e["has-cross-site-ancestor"]&&e["has-cross-site-ancestor"])),i.setSize(e.name.length+e.value.length),i}createCookieData(e){let r=e.type()===0,t={name:e.name(),value:e.value()};for(let l of["http-only","secure","same-site","source-scheme","source-port"])e.hasAttribute(l)&&(t[l]=String(e.getAttribute(l)??!0));t.domain=e.domain()||(r?a(n.na):""),t.path=e.path()||(r?a(n.na):""),t.expires=e.maxAge()?p.TimeUtilities.secondsToString(Math.floor(e.maxAge())):e.expires()<0?f():e.expires()>864e13?a(n.timeAfter,{date:new Date(864e13).toISOString()}):e.expires()>0?new Date(e.expires()).toISOString():r?a(n.na):f(),e.expires()>864e13&&(t.expiresTooltip=a(n.timeAfterTooltip,{seconds:e.expires(),date:new Date(864e13).toISOString()})),t["partition-key-site"]=e.partitionKeyOpaque()?a(n.opaquePartitionKey).toString():e.topLevelSite(),t["has-cross-site-ancestor"]=e.hasCrossSiteAncestor()?"true":"",t.size=String(e.size()),t.priority=e.priority(),t.priorityValue=["Low","Medium","High"].indexOf(e.priority());let c=this.cookieToBlockedReasons?.get(e)||[];for(let l of c){t.flagged=!0;let h=l.attribute||"name";t.icons=t.icons||{},h in t.icons?t.icons[h]&&(t.icons[h].title+=`
`+l.uiString):(t.icons[h]=new w,h==="name"&&g.RelatedIssue.hasThirdPartyPhaseoutCookieIssue(e)?(t.icons[h].name="warning-filled",t.icons[h].onclick=()=>g.RelatedIssue.reveal(e),t.icons[h].style.cursor="pointer"):t.icons[h].name="info",t.icons[h].classList.add("small"),t.icons[h].title=l.uiString)}let d=this.cookieToExemptionReason?.get(e)?.uiString;return d&&(t.icons=t.icons||{},t.flagged=!0,t.icons.name=new w,t.icons.name.name="info",t.icons.name.classList.add("small"),t.icons.name.title=d),t.key=e.key(),t}isValidCookieData(e){return(!!e.name||!!e.value)&&this.isValidDomain(e.domain)&&this.isValidPath(e.path)&&this.isValidDate(e.expires)&&this.isValidPartitionKey(e["partition-key-site"])}isValidDomain(e){if(!e)return!0;let i=u.ParsedURL.ParsedURL.fromString("http://"+e);return i!==null&&i.domain()===e}isValidPath(e){if(!e)return!0;let i=u.ParsedURL.ParsedURL.fromString("http://example.com"+e);return i!==null&&i.path===e}isValidDate(e){return!e||e===f()||!isNaN(Date.parse(e))}isValidPartitionKey(e){return e?u.ParsedURL.ParsedURL.fromString(e)!==null:!0}refresh(){this.#t&&this.#t()}populateContextMenu(e,i){let r=this.cookies.find(c=>c.key()===e.key);if(!r)return;let t=r;i.revealSection().appendItem(a(n.showRequestsWithThisCookie),()=>{let c=$.UIFilter.UIRequestFilter.filters([{filterType:$.UIFilter.FilterType.CookieDomain,filterValue:t.domain()},{filterType:$.UIFilter.FilterType.CookieName,filterValue:t.name()}]);u.Revealer.reveal(c)},{jslogContext:"show-requests-with-this-cookie"}),g.RelatedIssue.hasIssues(t)&&i.revealSection().appendItem(a(n.showIssueAssociatedWithThis),()=>{g.RelatedIssue.reveal(t)},{jslogContext:"show-issue-associated-with-this"})}};export{B as CookiesTable};
//# sourceMappingURL=cookie_table.js.map
