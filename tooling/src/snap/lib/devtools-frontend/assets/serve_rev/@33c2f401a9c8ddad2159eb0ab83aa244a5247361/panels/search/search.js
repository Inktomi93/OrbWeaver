var Z=Object.defineProperty;var F=(i,e)=>{for(var t in e)Z(i,t,{get:e[t],enumerable:!0})};var j={};F(j,{DEFAULT_VIEW:()=>z,SearchResultsPane:()=>S,lineSegmentForMatch:()=>V,matchesExpandedByDefault:()=>W,matchesShownAtOnce:()=>H});import*as P from"./../../core/common/common.js";import*as L from"./../../core/i18n/i18n.js";import*as q from"./../../core/platform/platform.js";import*as w from"./../../models/text_utils/text_utils.js";import*as C from"./../../ui/legacy/legacy.js";import{html as y,render as ee}from"./../../ui/lit/lit.js";var D=`:host{padding:0;margin:0;overflow-y:auto}.tree-outline{padding:0}.tree-outline ol{padding:0}.tree-outline li{height:16px}li.search-result{cursor:pointer;font-size:12px;margin-top:8px;padding:2px 0 2px 4px;overflow-wrap:normal;white-space:pre}li.search-result .tree-element-title{display:flex;width:100%}li.search-result:hover{background-color:var(--sys-color-state-hover-on-subtle)}li.search-result .search-result-file-name{color:var(--sys-color-on-surface);flex:1 1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}li.search-result .search-result-matches-count{color:var(--sys-color-token-subtle);margin:0 8px}li.search-result.expanded .search-result-matches-count{display:none}li.show-more-matches{color:var(--sys-color-on-surface);cursor:pointer;margin:8px 0 0 -4px}li.show-more-matches:hover{text-decoration:underline}li.search-match{margin:2px 0;overflow-wrap:normal;white-space:pre}li.search-match .tree-element-title{display:flex}li.search-match.selected:focus-visible{background:var(--sys-color-tonal-container)}li.search-match::before{display:none}li.search-match .search-match-line-number{color:var(--sys-color-token-subtle);text-align:right;vertical-align:top;word-break:normal;padding:2px 4px 2px 6px;margin-right:5px}.tree-outline .devtools-link{text-decoration:none;display:block;flex:auto}li.search-match .search-match-content{color:var(--sys-color-on-surface)}ol.children.expanded{padding-bottom:4px}li.search-match .link-style.search-match-link{overflow:hidden;text-overflow:ellipsis;margin-left:9px;text-align:left}.search-result-qualifier{color:var(--sys-color-token-subtle)}.search-result-dash{color:var(--sys-color-surface-variant);margin:0 4px}
/*# sourceURL=${import.meta.resolve("./searchResultsPane.css")} */`;var $={matchesCountS:"Matches Count {PH1}",lineS:"Line {PH1}",showDMore:"Show {PH1} more"},te=L.i18n.registerUIStrings("panels/search/SearchResultsPane.ts",$),R=L.i18n.getLocalizedString.bind(void 0,te),{ifExpanded:se}=C.TreeOutline,z=(i,e,t)=>{let{results:o,matches:s,expandedResults:c,onSelectMatch:g,onExpandSearchResult:l,onShowMoreMatches:n}=i,d=(h,{detail:{expanded:p}})=>{p?(c.add(h),l(h)):c.delete(h)};ee(y`
    <devtools-tree hide-overflow .template=${y`
      <ul role="tree">
        ${o.map(h=>y`
          <li @expand=${p=>d(h,p)}
              role="treeitem"
              class="search-result"
              ?open=${c.has(h)}>
            <style>${D}</style>
            ${ie(h)}
            <ul role="group">
              ${se(oe(h,s,g,n))}
            </ul>
          </li>`)}
      </ul>
    `}></devtools-tree>`,t)},ie=i=>y`
    <span class="search-result-file-name">${i.label()}
      <span class="search-result-dash">${"\u2014"}</span>
      <span class="search-result-qualifier">${i.description()}</span>
    </span>
    <span class="search-result-matches-count"
        aria-label=${R($.matchesCountS,{PH1:i.matchesCount()})}>
        ${i.matchesCount()}
    </span>`,oe=(i,e,t,o)=>{let s=e.get(i)??[],c=i.matchesCount()-s.length;return y`
      ${s.map(({lineContent:g,matchRanges:l,resultLabel:n},d)=>y`
        <li role="treeitem" class="search-match" @click=${()=>t(i,d)}
          @keydown=${h=>{h.key==="Enter"&&t(i,d)}}
        >
          <button class="devtools-link text-button link-style search-match-link"
                  jslog="Link; context: search-match; track: click" role="link" tabindex="0"
                  @click=${()=>void P.Revealer.reveal(i.matchRevealable(d))}>
            <span class="search-match-line-number"
                aria-label=${typeof n=="number"&&!isNaN(n)?R($.lineS,{PH1:n}):n}>
              ${n}
            </span>
            <span class="search-match-content" aria-label="${g} line"
                  ${C.TreeOutline.TreeSearch.highlight(l,void 0)}>
              ${g}
            </span>
          </button>
        </li>`)}
      ${c>0?y`
        <li role="treeitem" class="show-more-matches" @click=${()=>o(i)}>
          ${R($.showDMore,{PH1:c})}
        </li>`:""}`},S=class extends C.Widget.VBox{#o=null;#t=[];#n=!1;#r=new WeakSet;#s=new WeakMap;#a;constructor(e,t=z){super(e,{useShadowDom:!0}),this.#a=t}get searchResults(){return this.#t}set searchResults(e){if(this.#t!==e){if(this.#t.length!==e.length)this.#n=!0;else if(this.#t.length===e.length){for(let t=0;t<this.#t.length;++t)if(this.#t[t]!==e[t]){this.#n=!0;break}}this.#n&&(this.#t=e,this.requestUpdate())}}get searchConfig(){return this.#o}set searchConfig(e){this.#o=e,this.requestUpdate()}showAllMatches(){for(let e of this.#t){let t=this.#s.get(e)?.length??0;this.#h(e,t,e.matchesCount()),this.#r.add(e)}this.requestUpdate()}collapseAllResults(){this.#r=new WeakSet,this.requestUpdate()}#i(e){let t=Math.min(e.matchesCount(),H);this.#h(e,0,t),this.requestUpdate()}#h(e,t,o){if(!this.#o)return;let s=this.#o.queries(),c=[];for(let l=0;l<s.length;++l)c.push(q.StringUtilities.createSearchRegex(s[l],!this.#o.ignoreCase(),this.#o.isRegex()));let g=this.#s.get(e)??[];if(this.#s.set(e,g),!(g.length>=o))for(let l=t;l<o;++l){let n=e.matchLineContent(l),d=[],h=e.matchColumn(l),p=e.matchLength(l);if(h!==void 0&&p!==void 0){let{matchRange:m,lineSegment:U}=V(n,new w.TextRange.SourceRange(h,p));n=U,d=[m]}else{n=n.trim();for(let m=0;m<c.length;++m)d=d.concat(this.#l(n,c[m]));({lineSegment:n,matchRanges:d}=re(n,d))}let v=e.matchLabel(l);g.push({lineContent:n,matchRanges:d,resultLabel:v})}}performUpdate(){if(this.#n){let e=0;for(let t of this.#t)this.#r.has(t)&&(e+=this.#s.get(t)?.length??0);for(let t of this.#t)e<W&&!this.#r.has(t)&&(this.#r.add(t),this.#i(t),e+=this.#s.get(t)?.length??0);this.#n=!1}this.#a({results:this.#t,matches:this.#s,expandedResults:this.#r,onSelectMatch:(e,t)=>{P.Revealer.reveal(e.matchRevealable(t))},onExpandSearchResult:this.#i.bind(this),onShowMoreMatches:this.#m.bind(this)},{},this.contentElement)}#l(e,t){t.lastIndex=0;let o,s=[];for(;t.lastIndex<e.length&&(o=t.exec(e));)s.push(new w.TextRange.SourceRange(o.index,o[0].length));return s}#m(e){let t=this.#s.get(e)?.length??0;this.#h(e,t,e.matchesCount()),this.requestUpdate()}},W=200,H=20,K={prefixLength:25,maxLength:1e3};function V(i,e,t=K){let o={...K,...t},s=i.trimStart(),c=i.length-s.length,g=Math.min(e.offset,c),l=Math.max(g,e.offset-o.prefixLength),n=Math.min(i.length,l+o.maxLength),d=l>g?"\u2026":"",h=d+i.substring(l,n),p=e.offset-l+d.length,v=Math.min(e.length,h.length-p),m=new w.TextRange.SourceRange(p,v);return{lineSegment:h,matchRange:m}}function re(i,e){let t=0,o=e;o.length>0&&o[0].offset>20&&(t=15);let s=i.substring(t,1e3+t);return t&&(o=o.map(c=>new w.TextRange.SourceRange(c.offset-t+1,c.length)),s="\u2026"+s),{lineSegment:s,matchRanges:o}}var ae={};var Q={};F(Q,{DEFAULT_VIEW:()=>_,SearchView:()=>E});import"./../../ui/legacy/legacy.js";import"./../../ui/kit/kit.js";import*as b from"./../../core/common/common.js";import*as O from"./../../core/host/host.js";import*as A from"./../../core/i18n/i18n.js";import*as k from"./../../models/workspace/workspace.js";import"./../../ui/components/buttons/buttons.js";import*as u from"./../../ui/legacy/legacy.js";import{Directives as ne,html as T,render as he}from"./../../ui/lit/lit.js";import*as f from"./../../ui/visual_logging/visual_logging.js";var N=`.search-drawer-header{flex-shrink:0;overflow:hidden;display:inline-flex;min-width:150px;.search-container{border-bottom:1px solid var(--sys-color-divider);display:flex;align-items:center;flex-grow:1}.toolbar-item-search{flex-grow:1;box-shadow:inset 0 0 0 2px transparent;box-sizing:border-box;height:var(--sys-size-9);margin-left:var(--sys-size-3);padding:0 var(--sys-size-2) 0 var(--sys-size-5);border-radius:100px;position:relative;display:flex;align-items:center;background-color:var(--sys-color-cdt-base);&:has(input:focus){box-shadow:inset 0 0 0 2px var(--sys-color-state-focus-ring)}&:has(input:hover)::before{content:"";box-sizing:inherit;height:100%;width:100%;position:absolute;border-radius:100px;left:0;background-color:var(--sys-color-state-hover-on-subtle)}& > devtools-icon{color:var(--sys-color-on-surface-subtle);width:var(--sys-size-8);height:var(--sys-size-8);margin-right:var(--sys-size-3)}& > devtools-button:last-child{margin-right:var(--sys-size-4)}}.search-toolbar-input{appearance:none;color:var(--sys-color-on-surface);background-color:transparent;border:0;z-index:1;flex:1;&::placeholder{color:var(--sys-color-on-surface-subtle)}&:placeholder-shown + .clear-button{display:none}&::-webkit-search-cancel-button{display:none}}}.search-toolbar{background-color:var(--sys-color-cdt-base-container);border-bottom:1px solid var(--sys-color-divider)}.search-toolbar-summary{background-color:var(--sys-color-cdt-base-container);border-top:1px solid var(--sys-color-divider);padding-left:5px;flex:0 0 19px;display:flex;padding-right:5px}.search-results:has(.empty-state) + .search-toolbar-summary{display:none}.search-toolbar-summary .search-message{padding-top:2px;padding-left:1ex;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.search-results{overflow-y:auto;display:flex;flex:auto}.search-results > div{flex:auto}
/*# sourceURL=${import.meta.resolve("./searchView.css")} */`;var r={find:"Find",enableCaseSensitive:"Enable case sensitive search",disableCaseSensitive:"Disable case sensitive search",enableRegularExpression:"Enable regular expressions",disableRegularExpression:"Disable regular expressions",refresh:"Refresh",clearInput:"Clear",clear:"Clear search",indexing:"Indexing\u2026",searching:"Searching\u2026",indexingInterrupted:"Indexing interrupted.",foundMatchingLineInFile:"Found 1 matching line in 1 file.",foundDMatchingLinesInFile:"Found {PH1} matching lines in 1 file.",foundDMatchingLinesInDFiles:"Found {PH1} matching lines in {PH2} files.",noMatchesFound:"No matches found",nothingMatchedTheQuery:"Nothing matched your search query",searchFinished:"Search finished.",searchInterrupted:"Search interrupted.",typeAndPressSToSearch:"Type and press {PH1} to search",noSearchResult:"No search results"},le=A.i18n.registerUIStrings("panels/search/SearchView.ts",r),a=A.i18n.getLocalizedString.bind(void 0,le),{ref:ce,live:de}=ne,{widget:B,widgetRef:ge}=u.Widget,_=(i,e,t)=>{let{query:o,matchCase:s,isRegex:c,searchConfig:g,searchMessage:l,searchResults:n,searchResultsMessage:d,progress:h,onQueryChange:p,onQueryKeyDown:v,onPanelKeyDown:m,onClearSearchInput:U,onToggleRegex:G,onToggleMatchCase:J,onRefresh:X,onClearSearch:Y}=i,M="",I="";o?h?M=a(r.searching):n.length||(M=a(r.noMatchesFound),I=a(r.nothingMatchedTheQuery)):(M=a(r.noSearchResult),I=a(r.typeAndPressSToSearch,{PH1:u.KeyboardShortcut.KeyboardShortcut.shortcutToString(u.KeyboardShortcut.Keys.Enter)})),he(T`
      <style>${u.inspectorCommonStyles}</style>
      <style>${N}</style>
      <div class="search-drawer-header" @keydown=${m}>
        <div class="search-container">
          <div class="toolbar-item-search">
            <devtools-icon name="search"></devtools-icon>
            <input type="text"
                class="search-toolbar-input"
                placeholder=${a(r.find)}
                jslog=${f.textField().track({change:!0,keydown:"ArrowUp|ArrowDown|Enter"})}
                aria-label=${a(r.find)}
                size="100" results="0"
                .value=${de(o)}
                @keydown=${v}
                @input=${x=>p(x.target.value)}
                ${ce(x=>{e.focusSearchInput=()=>{x instanceof HTMLInputElement&&(x.focus(),x.select())}})}>
            <devtools-button class="clear-button" tabindex="-1"
                @click=${U}
                .data=${{variant:"icon",iconName:"cross-circle-filled",jslogContext:"clear-input",size:"SMALL",title:a(r.clearInput)}}
            ></devtools-button>
            <devtools-button @click=${G} .data=${{variant:"icon_toggle",iconName:"regular-expression",toggledIconName:"regular-expression",toggleType:"primary-toggle",size:"SMALL",toggled:c,title:a(c?r.disableRegularExpression:r.enableRegularExpression),jslogContext:"regular-expression"}}
              class="regex-button"
            ></devtools-button>
            <devtools-button @click=${J} .data=${{variant:"icon_toggle",iconName:"match-case",toggledIconName:"match-case",toggleType:"primary-toggle",size:"SMALL",toggled:s,title:a(s?r.disableCaseSensitive:r.enableCaseSensitive),jslogContext:"match-case"}}
              class="match-case-button"
            ></devtools-button>
          </div>
        </div>
        <devtools-toolbar class="search-toolbar" jslog=${f.toolbar()}>
          <devtools-button title=${a(r.refresh)} @click=${X}
              .data=${{variant:"toolbar",iconName:"refresh",jslogContext:"search.refresh"}}></devtools-button>
          <devtools-button title=${a(r.clear)} @click=${Y}
              .data=${{variant:"toolbar",iconName:"clear",jslogContext:"search.clear"}}></devtools-button>
        </devtools-toolbar>
      </div>
      <div class="search-results" @keydown=${m}>
        ${n.length?T`<devtools-widget ${B(S,{searchResults:n,searchConfig:g})}
            ${ge(S,x=>{e.showAllMatches=()=>void x.showAllMatches(),e.collapseAllResults=()=>void x.collapseAllResults()})}>
            </devtools-widget>`:B(u.EmptyWidget.EmptyWidget,{header:M,text:I})}
      </div>
      <div class="search-toolbar-summary" @keydown=${m}>
        <div class="search-message">${l}</div>
        <div class="flex-centered">
          ${h?T`
            <devtools-progress .title=${h.title??""}
                               .worked=${h.worked} .totalWork=${h.totalWork}>
            </devtools-progress>`:""}
        </div>
        <div class="search-message">${d}</div>
      </div>`,t,{container:{attributes:{jslog:`${f.panel("search").track({resize:!0})}`}}})},E=class extends u.Widget.VBox{#o;#t=()=>{};#n=()=>{};#r=()=>{};#s;#a;#i;#h;#l;#m;#b;#p;#e;#d;#f=!1;#x=!1;#g="";#u="";#S;#c;#y=[];constructor(e,t=_){super({useShadowDom:"pure"}),this.#o=t,this.setMinimumSize(0,40),this.#s=!1,this.#a=1,this.#d="",this.#i=0,this.#h=0,this.#l=0,this.#m=null,this.#b=null,this.#p=null,this.#e=null,this.#S=b.Settings.Settings.instance().createLocalSetting(e+"-search-config",new k.SearchConfig.SearchConfig("",!0,!1).toPlainObject()),this.performUpdate(),this.#H(),this.performUpdate(),this.#c=null}performUpdate(){let e={query:this.#d,matchCase:this.#f,isRegex:this.#x,searchConfig:this.#b,searchMessage:this.#g,searchResults:this.#y.filter(s=>s.matchesCount()),searchResultsMessage:this.#u,progress:this.#e,onQueryChange:s=>{this.#d=s},onQueryKeyDown:this.#z.bind(this),onPanelKeyDown:this.#W.bind(this),onClearSearchInput:this.#k.bind(this),onToggleRegex:this.#L.bind(this),onToggleMatchCase:this.#T.bind(this),onRefresh:this.#v.bind(this),onClearSearch:this.#V.bind(this)},t=this,o={set focusSearchInput(s){t.#t=s},set showAllMatches(s){t.#n=s},set collapseAllResults(s){t.#r=s}};this.#o(e,o,this.contentElement)}#L(){this.#x=!this.#x,this.performUpdate()}#T(){this.#f=!this.#f,this.performUpdate()}#w(){return new k.SearchConfig.SearchConfig(this.#d,!this.#f,this.#x)}toggle(e,t){this.#d=e,this.requestUpdate(),this.updateComplete.then(()=>{this.focus()}),this.#C(),t?this.#v():this.#$()}createScope(){throw new Error("Not implemented")}#C(){this.#c=this.createScope()}#M(){if(!this.#e)return;let e=!this.#e.canceled;if(this.#e=null,this.#s=!1,this.#g=e?"":a(r.indexingInterrupted),e||(this.#p=null),this.performUpdate(),!this.#p)return;let t=this.#p;this.#p=null,this.#F(t)}#$(){this.#s=!0,this.#e&&(this.#e.done=!0),this.#e=new b.Progress.ProgressProxy(new b.Progress.Progress,this.#M.bind(this),this.requestUpdate.bind(this)),this.#g=a(r.indexing),this.performUpdate(),this.#c&&this.#c.performIndexing(this.#e)}#k(){this.#d="",this.requestUpdate(),this.#P(),this.focus()}#E(e,t){if(!(e!==this.#a||!this.#e)){if(this.#e?.canceled){this.#M();return}this.#y.push(t),this.#K(t),this.requestUpdate()}}#A(e,t){e!==this.#a||!this.#e||(this.#e=null,this.#q(t),u.ARIAUtils.LiveAnnouncer.alert(this.#g+" "+this.#u))}#F(e){this.#b=e,this.#e&&(this.#e.done=!0),this.#e=new b.Progress.ProgressProxy(new b.Progress.Progress,void 0,this.requestUpdate.bind(this)),this.#D(),this.#c&&this.#c.performSearch(e,this.#e,this.#E.bind(this,this.#a),this.#A.bind(this,this.#a))}#U(){this.#I(),this.#y=[],this.#g="",this.#u="",this.performUpdate()}#I(){this.#e&&!this.#s&&(this.#e.canceled=!0),this.#c&&this.#c.stopSearch()}#D(){this.#i=0,this.#h=0,this.#y=[],this.#l=0,this.#m||(this.#m=new u.EmptyWidget.EmptyWidget(a(r.searching),"")),this.#g=a(r.searching),this.performUpdate(),this.#R()}#R(){this.#i&&this.#h?this.#i===1&&this.#l===1?this.#u=a(r.foundMatchingLineInFile):this.#i>1&&this.#l===1?this.#u=a(r.foundDMatchingLinesInFile,{PH1:this.#i}):this.#u=a(r.foundDMatchingLinesInDFiles,{PH1:this.#i,PH2:this.#l}):this.#u="",this.performUpdate()}#K(e){let t=e.matchesCount();this.#i+=t,this.#h++,t&&this.#l++,this.#R()}#q(e){this.#g=a(e?r.searchFinished:r.searchInterrupted),this.requestUpdate()}focus(){this.#t()}willHide(){super.willHide(),this.#I()}#z(e){switch(this.#P(),e.keyCode){case u.KeyboardShortcut.Keys.Enter.code:this.#v();break}}#W(e){let t=O.Platform.isMac(),o=t&&e.metaKey&&!e.ctrlKey&&e.altKey&&e.code==="BracketRight",s=!t&&e.ctrlKey&&!e.metaKey&&e.shiftKey&&e.code==="BracketRight",c=t&&e.metaKey&&!e.ctrlKey&&e.altKey&&e.code==="BracketLeft",g=!t&&e.ctrlKey&&!e.metaKey&&e.shiftKey&&e.code==="BracketLeft";o||s?(this.#n(),f.logKeyDown(e.currentTarget,e,"show-all-matches")):(c||g)&&(this.#r(),f.logKeyDown(e.currentTarget,e,"collapse-all-results"))}#P(){this.#S.set(this.#w().toPlainObject())}#H(){let e=k.SearchConfig.SearchConfig.fromPlainObject(this.#S.get());this.#d=e.query(),this.#f=!e.ignoreCase(),this.#x=e.isRegex(),this.requestUpdate()}#v(){let e=this.#w();e.query()?.length&&(this.#U(),++this.#a,this.#C(),this.#s||this.#$(),this.#p=e)}#V(){this.#U(),this.#k()}};export{j as SearchResultsPane,ae as SearchScope,Q as SearchView};
//# sourceMappingURL=search.js.map
