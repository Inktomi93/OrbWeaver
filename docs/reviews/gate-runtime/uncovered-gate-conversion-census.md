---
kind: review
status: active
updated: 2026-09-05
---

# Uncovered gate conversion census

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). Census base:
`53bb2d35f3d7bf82bf0c5e911c705b60a35bb91a`.

> **TRANSITION MODEL SUPERSEDED (owner, 2026-09-11) AND ROSTER STALE.** Written for an ATOMIC cutover; the program now
> runs a MIXED runtime under [gate-runtime-standardization.md](../../design/gate-runtime-standardization.md), which wins
> on any conflict. The partition below counts a 255-module corpus; there are 271 modules now, and many of the 116
> "uncovered" rows have since converted. **Do not read the roster or any count here as current work** — re-derive with
> `pnpm gate:contract` and intersect. What stays durable is the PER-GATE analysis: blocker class, family and shared
> dependency, population notation, current authority, and the exact source line receipts.

This is migration evidence for the ts-morph gate-runtime replacement. It is not a production
registry. The live loader at `tooling/src/verify/lib/loader.ts:82-103` imported 255 sorted top-level gate
modules, accepted 255 descriptors, and reported zero unregistered files at the census base.

## Closed partition

| Set | Count |
| - | -: |
| First-wave visitor set | 86 |
| Resource set | 53 |
| Intersection | 0 |
| Uncovered remainder | 116 |
| **Total** | **255** |

The first-wave set excludes `fsBacked`; every resource-set descriptor declares `fsBacked: true`.
Exact set comparison therefore confirms zero overlap. The uncovered 116 gates partition as follows:

| Hook shape | Count |
| - | -: |
| Mixed `run` + visitor/file hook | 12 |
| Direct-walking node visitor | 32 |
| Run-only | 40 |
| File hook, possibly with visitor | 32 |
| **Total** | **116** |

The full corpus closes as `86 + 53 + 12 + 32 + 40 + 32 = 255`. Corpus-wide hook totals re-derived as
13 mixed, 122 node visitor, 86 run-only, and 34 file-hook descriptors. The thirteenth mixed gate is
`tooling-instrument-proof`, already contained in the resource cohort.

## Coverage and notation

The closed census used the complete top-level `tooling/src/verify/gates/*.ts` descriptor corpus. An
`ast-grep` pair rule for `fsBacked: true` scanned 255 files, skipped zero, and matched 53; literal
`rg 'fsBacked\s*:\s*true'` independently returned the same 53 files. The symbol-aware first-wave
derivation returned 86, with `missingFromDocs=[]` and `extraInDocs=[]` against the two simple-visitor
reports. The uncovered full-source pass read all 116 files: 40,921 lines and 2,263,392 bytes. It inspected
imports, complete hook bodies, population predicates, local state, tables/baselines, private scans, and
proof rows. Generated output, nested helper modules, and non-gate tooling were outside this census.

Current descriptor totals at the census base were 188 `scanRoot`, 99 `run`, 66 `begin`, 80 `finalize`,
137 `visit`, 42 `visitFile`, 53 `fsBacked`, two private `Project` constructors, 40 top-level `let`/`var`
statements, and 14 baseline-path expressions. Exactly seven gates imported
`tooling/src/verify/lib/symbol-reference.ts`.

Population notation records each gate's admitted source set over the 6,997-file harness corpus:

- `Cl` client, `Ui` UI, `Sv` server, `Db` DB, `Co` contracts, `Ki` kit, `To` tooling, `Te` tests, and
  `Sc` scripts.
- Full-root totals: `Cl1287 Ui360 Sv1466 Db42 Co104 Ki61 To940 Te2702 Sc35`.
- `P9/run` means no descriptor fence: `run` receives all 6,997 source files and derives a semantic
  population internally.
- `syn` means syntax/static-source analysis; `types` means checker, identity, definition, or type facts.
- Authority notation: `O` ordinary shared marker; `X` gate-local table, sanction, deferred row, stale arm,
  or custom marker; `MI` marker-immune; `B` baseline ratchet.
- Every row still needs population translation and byte-diff, declared fixture mode/path, and empty and
  unresolved controls. Blocker shorthand: `walk` private traversal/source lookup; `eval` free-form run;
  `state` invocation-local state; `grant` central grant migration or policy split; `reader` shared semantic
  facts; `baseline` debt/warning retirement.

## Mixed: 12

| Gate and source receipts | Population; analysis | Final authority/family | Conversion blocker |
| - | - | - | - |
| `tooling/src/verify/gates/agent-bridge-lock.ts:147,153,170,203` | `Cl1287+Te1`; syn | hard; `app-ready-signal`/agent-bridge | Visitor + exact-file `visitFile` + `evaluate`; remove descendant walks; invocation state. |
| `tooling/src/verify/gates/design-audit-rule-proof.ts:192,199,206,214` | `To1+Te38`; syn | hard; ui-audit registry/proof family | Registry/proof visitors + `evaluate`; move descendant reads to shared proof facts. |
| `tooling/src/verify/gates/no-inline-union-redecl.ts:285,302,310,346` | `Sc35+Te2702+Cl1287+Co104+Db42+Ki61+Sv1466+To685+Ui360`; types | ordinary union/respell + reviewed SDK-mirror grant + hard grant health | Required policy split; source-origin reader; invocation state/grant reconciliation. |
| `tooling/src/verify/gates/query-boundary-reservation.ts:163,169,175,202,232` | `Cl1287`; syn | ordinary boundary policy + hard duplicate/seam health | Split arms; preserve visit-file -> visitor -> evaluate order; central custom-marker reconciliation. |
| `tooling/src/verify/gates/session-channel-boundary.ts:36,43,48,60` | `Cl1287`; syn | ordinary construction + hard home health | Split construction/home-health policies; state moves to `create`. |
| `tooling/src/verify/gates/sub-floor-disclosure.ts:103,109,114,139,156` | `Cl1287+Ui360`; syn | ordinary occurrence + hard vocabulary health | Split policies; centralize `@sub-floor-ok`; file-text/comment reader. |
| `tooling/src/verify/gates/testid-liveness.ts:275,285,303,327` | `Te2702+Cl1287+Co104+Db42+Ki61+Sv1466+Ui360`; syn | ordinary dead-consumer/row + hard registry health | Split and evaluate after shared producer/consumer facts. |
| `tooling/src/verify/gates/tooling-argv-front-door.ts:74,81,87,102` | `To940`; syn | ordinary illegal reader + reviewed entry grants + hard population health | Three-way split; canonical `process.argv` origin and central grants. |
| `tooling/src/verify/gates/tooling-front-door.ts:94,101,106,112` | `To940`; syn | ordinary import boundary + reviewed root-config grants | Split authority; shared import-origin and exact config grant facts. |
| `tooling/src/verify/gates/tooling-ops-direct-invocation.ts:60,66,73,88` | `To242`; syn | hard; tooling program-entry family | Exact-file `visitFile` + evaluate; derive canonical exported entry names. |
| `tooling/src/verify/gates/tooling-shared-plumbing.ts:492,499,517,542,564` | `To940+Te348`; syn | separate hard/ordinary/reviewed policies by plumbing capability | Split Project, browser, artifact, exit/CLI, child-process, port, and clock families; remove descendant walks/tables. |
| `tooling/src/verify/gates/ui-variant-axes-stamped.ts:97,103,115,130,151` | `Ui360`; syn | hard recipe/duplicate/blindness policies + warning debt | Split arms; retire baseline into warning debt; shared variant-axis facts. |

## Direct-walking visitors: 32

| Gate and source receipts | Population; analysis; current authority | Family/shared dependency | Conversion blocker |
| - | - | - | - |
| `tooling/src/verify/gates/appearance-carrier-contract.ts:353,360,368,408` | `Cl1287+To1+Co1`; syn; O | `appearance-carrier-contract-ast` | Shared appearance graph/source lookup; state. |
| `tooling/src/verify/gates/assets-single-writer.ts:92,98,100,115` | `Sv1466`; syn; X | CAS writer fact | Descendant/source-file walk; reviewed home grant; state. |
| `tooling/src/verify/gates/assumes-single-replica.ts:103,110,115` | `Sv1369`; syn; O | module-state classifier | Per-file call/class fact; state. |
| `tooling/src/verify/gates/bus-payload-allowlist.ts:944,960,962,979,995` | `Co8`; types; MI+X | `tuple-read`/bus payload shape | Transitive payload reader; split reviewed fields from hard health; state. |
| `tooling/src/verify/gates/class-token-splice.ts:188,194,196` | `Cl1287+Ui360`; syn; O | static-value/class junction | Remove function-return descendant walk; shared static value fact. |
| `tooling/src/verify/gates/evaluate-no-scope-capture.ts:235,243,251,275` | `To940`; types; O | callback/binding-origin fact | Shared callback closure reader; unresolved receipt; state. |
| `tooling/src/verify/gates/external-id-single-writer.ts:133,139,141,158` | `Sv1466`; syn; X | external-id write provenance | Shared write/call origin; reviewed grants. |
| `tooling/src/verify/gates/firehose-import-allowlist.ts:67,73,75,96` | `Sv1466`; types; O | existing `symbol-reference` | Replace project source sweep with canonical source-origin fact. |
| `tooling/src/verify/gates/freeze-provenance-write-pairing.ts:557,567,578,622` | `Cl1287+Co104+Db42+Ki61+Sv1466+Ui360`; syn; O | freeze/write pairing | Several private walks/lookups; shared write/provenance reader; state. |
| `tooling/src/verify/gates/injected-op-caller-param.ts:140,146,154,185` | `Sv175+Ki1`; syn; X | injected-op signature/caller fact | Source sweep; reviewed exemption migration; state. |
| `tooling/src/verify/gates/macro-resolution-home.ts:146,152,154,166` | `Cl1287+Ui360`; syn; X | macro call/home | Project sweep; exact reviewed home grants. |
| `tooling/src/verify/gates/modal-body-not-placeholder.ts:49,60,62,66,69` | `Cl11`; syn; O | `ast-read` modal definition | Shared returned/object definition reader; state. |
| `tooling/src/verify/gates/no-direct-users-read.ts:65,71,73,81` | `Sv1127`; types; X | `symbol-reference` + sanctioned-home | Replace recursive call scan; central reviewed grants. |
| `tooling/src/verify/gates/no-effect-on-shared-selection.ts:148,154,156,159,162` | `Cl983`; syn; X | effect/shared-selection fact | Descendant call reader; central grants; state. |
| `tooling/src/verify/gates/no-form-state-in-useeffect.ts:31,37` | `P9`; types; O | existing `symbol-reference` | Recursive effect-body/member reader. |
| `tooling/src/verify/gates/no-interactive-role-in-features.ts:107,113,115,118,130` | `Cl607`; types; X | existing `symbol-reference` | Shared JSX/ARIA origin; central grants; state. |
| `tooling/src/verify/gates/no-raw-id.ts:24,100` | `P9`; syn; X | schema/id-brand fact | Source/project lookups; central allowlist; state. |
| `tooling/src/verify/gates/no-raw-zustand-persist.ts:130,136,141,144,168` | `Cl1287`; syn; X | Zustand persistence family | Descendant/source lookup; central factory grants; state. |
| `tooling/src/verify/gates/nullable-column-inequality.ts:282,288,290,293,294` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61+Te2702`; syn; X | `schema-read` | Shared schema/member-origin fact; grant/stale migration; state. |
| `tooling/src/verify/gates/own-tables-only.ts:346,355,358,365,381` | `Sv1030`; syn; X | domain/table ownership | Replace project sweep with shared table-origin facts; split grants/health. |
| `tooling/src/verify/gates/platform-spellings.ts:408,415,425` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61`; types; X | platform/static spelling facts | Private descendant/definition lookup; deferred rows. |
| `tooling/src/verify/gates/public-route-body-cap.ts:128,135,137,141,155` | `Sv17`; types; O | public-route/body-cap fact | Route-handler and request-body origin reader; state. |
| `tooling/src/verify/gates/query-machine-seals.ts:34,41,43,64` | `P9`; syn; X | query-machine import/home | Project source lookup; central seam grants. |
| `tooling/src/verify/gates/render-error-via-battery.ts:126,133,135,154` | `Cl1287`; syn; X | `ast-read` + sanctioned-home | JSX/static member reader; central grant migration. |
| `tooling/src/verify/gates/scrubber-home.ts:93,101,103,112` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61`; syn; X | scrubber construction/home | Descendant constructor fact; central reviewed home grants. |
| `tooling/src/verify/gates/section-factory-contribution-bundle.ts:194,203,205,210,225` | `Cl1287`; types; O | registry/section factory | Canonical factory signature/returned object fact; state. |
| `tooling/src/verify/gates/selection-store-via-factory.ts:61,69,71,83` | `Cl13`; syn; X | selection-store factory | Source/descendant lookup; central exact grants. |
| `tooling/src/verify/gates/serde-core-seal.ts:48,54,56,67` | `Sv1466`; syn; X | serde/import-origin | Project import sweep; central reviewed homes. |
| `tooling/src/verify/gates/table-scoping-class.ts:438,444,447,451,470` | `Db30`; syn; X | `schema-read` | Schema table population fact; central grants/health; state. |
| `tooling/src/verify/gates/test-no-stubs.ts:32,38,40` | `Te2702`; syn; O | assertion/callback fact | Function-body descendant walk becomes shared test fact. |
| `tooling/src/verify/gates/windowed-infinite-query.ts:100,106,108,114,143` | `Cl1287`; types; O | infinite-query/static options | Shared return/call/static-value reader; state. |
| `tooling/src/verify/gates/zustand-selector-derived.ts:160,166,168` | `Cl1287`; syn; O | Zustand selector family | Function-return descendant reader; canonical store/useShallow origin. |

## Run-only: 40

| Gate and source receipts | Population; analysis; current authority | Family/shared dependency | Conversion blocker |
| - | - | - | - |
| `tooling/src/verify/gates/asset-refs-fk-coverage.ts:226,233` | `P9/run`; types; O | `schema-read` | Run -> evaluate over shared schema/FK facts. |
| `tooling/src/verify/gates/audit-client-tests.ts:276,283` | `P9/run`; types; O | test callback/assertion reader | Private whole-project walk -> shared test facts. |
| `tooling/src/verify/gates/automation-bus-coverage.ts:43,49` | `P9/run`; syn; X | `bus-coverage` | Shared bus producer/member facts; deferred/stale grant migration. |
| `tooling/src/verify/gates/baseui-portal-container-seam.ts:164,171` | `Ui360`; types; O | `baseui-read`/static props | Run -> evaluate; shared portal/container fact. |
| `tooling/src/verify/gates/bus-coverage.ts:42,48` | `P9/run`; syn; X | `bus-coverage` | Shared bus member/emitter fact; deferred/stale rows. |
| `tooling/src/verify/gates/bus-definition-belts.ts:256,262` | `P9/run`; syn; X | bus-definition/comment facts | Central bus-family census and reviewed exemptions. |
| `tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts:586,592,593` | `Sv133`; types; X | chat authority/read graph | Shared canonical-call graph; reviewed sanctions. |
| `tooling/src/verify/gates/chrome-registry-completeness.ts:151,158` | `P9/run`; types; O | `ast-read`/`tuple-read` | Shared registry definition/consumer facts. |
| `tooling/src/verify/gates/config-group-completeness.ts:404,411` | `P9/run`; syn; X | config-group registry | Shared definition/member/consumer facts; exemptions. |
| `tooling/src/verify/gates/contract-derives-not-respells.ts:219,226` | `Co104+Db30+Sv1127`; syn; X | contract/lower-shape origin | Project sweep -> canonical declaration/origin fact; grants. |
| `tooling/src/verify/gates/contract-verb-presence.ts:333,43` | `P9/run`; types; X | `ast-read` | Shared service/verb/test-call facts; deferred rows. |
| `tooling/src/verify/gates/diagnostic-legibility.ts:154,138,163` | `To255`; types; O | diagnostic static-value fact | Gate-corpus traversal -> shared descriptor/static-string reader. |
| `tooling/src/verify/gates/domain-events-coverage.ts:36,42` | `P9/run`; syn; X | `bus-coverage` | Shared member/emitter facts; deferred/stale rows. |
| `tooling/src/verify/gates/domain-freshness-plane.ts:525,533,535` | `Db30+Sv1127`; syn; X | comment-spans/domain mutation | Shared mutation/freshness facts; deferred rows. |
| `tooling/src/verify/gates/duplicate-action-doors.ts:303,309,310` | `Cl984`; types; B+X | `trpc-doors`/ratchet | Shared call-door fact; baseline retirement or warning debt. |
| `tooling/src/verify/gates/home-tile-registry-completeness.ts:148,155` | `P9/run`; syn; X | home-tile registry | Shared definition/registration/consumer fact. |
| `tooling/src/verify/gates/json-column-write-parity.ts:676,684,686` | `Co104+Db30+Sv1127`; types; X | `schema-read` | Shared JSON-column reader/writer facts; split grants/health. |
| `tooling/src/verify/gates/knob-wire-coverage.ts:887,894` | `P9/run`; types; X | `tuple-read`/settings knob | Consolidate knob declaration/consumer facts; deferred/grant rows. |
| `tooling/src/verify/gates/lifecycle-portability.ts:482,491` | `P9/run`; syn; X | `schema-read` | Shared canon/carrier facts; deferred/grant reconciliation. |
| `tooling/src/verify/gates/message-kind-policy-coverage.ts:175,181` | `P9/run`; types; X | message policy registry | Shared tuple/policy consumer facts; deferred/stale rows. |
| `tooling/src/verify/gates/modal-registry-completeness.ts:212,219` | `P9/run`; syn; O | modal registry | Shared modal definition/registration/consumer facts. |
| `tooling/src/verify/gates/monotonic-tests.ts:196,197` | `P9/run`; syn; X | skip/annotation grammar | Move run scanner and custom marker reconciliation centrally. |
| `tooling/src/verify/gates/no-blanket-suppression.ts:440,448,449` | `P9/run`; syn; MI | suppression/grant-liveness | Hard policy; shared suppression/config-grant facts. |
| `tooling/src/verify/gates/no-hardcoded-model-prose.ts:278,284,285` | `Co9+Sv45`; syn; O | prompt/prose static-value | Whole-source string evaluation becomes shared fact. |
| `tooling/src/verify/gates/no-parallel-section-map.ts:105,320` | `P9/run`; types; O | `ast-read`/`tuple-read` | Shared registry-key/static-object fact. |
| `tooling/src/verify/gates/no-tailwind-dark-variant.ts:128,134,135` | `Cl1287+Ui360`; syn; O | `static-class-expression` | Shared class carrier/token facts. |
| `tooling/src/verify/gates/no-vanity-alias.ts:209,224,225` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61`; syn; O | import/export identity | Project import/export traversal becomes canonical origin fact. |
| `tooling/src/verify/gates/open-json-column-key-parity.ts:797,803,804` | `Sv1466+Db30`; types; X | schema/open-JSON reader | Shared key reader/writer population; deferred/stale grants. |
| `tooling/src/verify/gates/placeholder-copy-registry.ts:115,122` | `P9/run`; syn; X | `section-defs` | Shared section definitions/static placeholder facts. |
| `tooling/src/verify/gates/query-freshness-coverage.ts:488,492,499` | `Cl1287`; types; X | query/invalidation graph | Shared tRPC query/invalidation origin; sanctions/deferred rows. |
| `tooling/src/verify/gates/rpg-bus-coverage.ts:41,47` | `P9/run`; syn; X | `bus-coverage` | Shared bus facts; deferred/stale rows. |
| `tooling/src/verify/gates/schema-banned-shapes.ts:288,295` | `P9/run`; syn; hard/custom | `schema-read` | Split hard ledger-backed policies; shared schema fact. |
| `tooling/src/verify/gates/schema-branding.ts:136,143` | `P9/run`; syn; O | `schema-read` | Shared branded-PK/FK fact; fail-closed unresolved population. |
| `tooling/src/verify/gates/section-registry-completeness.ts:217,224` | `P9/run`; syn; X | `section-defs` | Shared section definition/registration/consumer facts. |
| `tooling/src/verify/gates/suppressions.ts:494,500,501` | `P9/run`; syn; B+X | ratchet/comment-spans | Baseline debt conversion/retirement; central suppression facts. |
| `tooling/src/verify/gates/surface-a11y-focus.ts:132,138` | `P9/run`; syn; X | `baseui-read` | Shared surface/focus provenance; stale exemption migration. |
| `tooling/src/verify/gates/surface-in-a-container.ts:123,129` | `P9/run`; syn; X | `baseui-read` | Shared surface/container ancestry; stale exemption migration. |
| `tooling/src/verify/gates/user-bus-coverage.ts:33,39` | `P9/run`; syn; X | `bus-coverage` | Shared bus facts; deferred/stale rows. |
| `tooling/src/verify/gates/warning-code-coverage.ts:245,246` | `P9/run`; types; X | `ast-read`/`tuple-read` | Shared warning tuple/emitter facts; deferred rows. |
| `tooling/src/verify/gates/wire-schema-vocab-one-home.ts:154,160,161` | `Sv1466+Ki61`; syn; X | JSON-schema vocabulary | Shared keyword/static-string origin; reviewed homes/stale health. |

## File-hook: 32

| Gate and source receipts | Population; analysis; current authority | Family/shared dependency | Conversion blocker |
| - | - | - | - |
| `tooling/src/verify/gates/brand-in-name-position.ts:297,305,310,326` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61+Te2702`; syn; X | branded-id/name-position | Shared declaration/type-position fact; state/grant reconciliation. |
| `tooling/src/verify/gates/caught-failure-ownership.ts:1455,1461,1462` | `Cl1287+Ui360+Sv1466+Db42+Co104+Ki61+To940`; types; X | `ast-read` caught-failure classifier | 2,376-line policy must split reusable failure facts; remove descendants. |
| `tooling/src/verify/gates/commented-code.ts:16,23,24` | 6,742 files, excluding 255 gate modules; syn; O | comment scanner | Direct `visitFile` port; explicit comments-intended posture. |
| `tooling/src/verify/gates/context-definition-shape.ts:285,295,300,314` | `Cl1287`; types; O | `registry-contracts` | Shared context-definition/static-shape facts; state. |
| `tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts:291,297,298` | `Te479`; types; O | CT assertion/live-read | Shared test-call/locator provenance instead of descendants. |
| `tooling/src/verify/gates/ct-poll-schedule-and-paint.ts:236,243,245,252,275` | `Te2702`; syn; O | CT poll schedule/paint | Shared static callback/schedule fact; state. |
| `tooling/src/verify/gates/ct-story-single-import.ts:157,163,164` | `Te516`; syn; O | CT import/declaration identity | Shared import/declaration fact; remove descendant walk. |
| `tooling/src/verify/gates/detached-work-traced.ts:563,570,571,574,586` | `Sv1466`; types; O | detached-work provenance | Shared call/definition/handler facts; state. |
| `tooling/src/verify/gates/dialog-via-composite.ts:80,89,90,93,105` | `Cl607`; syn; X | dialog import/composite | Canonical component/import origin; central allowlist. |
| `tooling/src/verify/gates/finding-overload-provenance.ts:282,292,294,300,308,317` | `To255`; syn; MI+X | finding-literal/custom marker | Hard exemption-auditor split; shared finding construction/provenance. |
| `tooling/src/verify/gates/fk-columns-indexed.ts:69,75,76,77` | `Db29`; syn; X | `schema-read` | Direct file hook can remain; central schema population/exemptions. |
| `tooling/src/verify/gates/fk-ondelete-stated.ts:72,78,79` | `Db29`; syn; O | `schema-read` | Shared references/onDelete fact; remove local descendant scan. |
| `tooling/src/verify/gates/form-factory-for-multifield.ts:240,247,248` | `Cl607`; syn; O | form control/import fact | Shared JSX control and factory-import facts. |
| `tooling/src/verify/gates/list-row-adoption.ts:154,163,164,167,202` | `Cl677`; types; X | interactive-list/ListRow | Shared callback JSX/component origin; central grants; state. |
| `tooling/src/verify/gates/no-default-props.ts:14,20,21` | `Cl1287+Ui360+Sv1466`; syn; O | React declaration fact | Shared defaultProps member detection. |
| `tooling/src/verify/gates/no-floorless-control-in-wrap.ts:263,269,274,288,291,320` | `Cl1287+Ui360`; syn; X | class/comment/base-control | Run arm plus file/visitor must become shared pitch/control facts; state/grants. |
| `tooling/src/verify/gates/no-form-reset-in-autosave.ts:109,115,116` | `Cl1287`; syn; O | form callback/call | Function-body call reader. |
| `tooling/src/verify/gates/no-legacy-react-api.ts:130,138,143,156,162` | `P9`; syn; X | React API origin | Shared React import/member/class fact; state/stale health. |
| `tooling/src/verify/gates/no-pointer-variants-in-features.ts:80,87,90,96,100,112` | `Cl983`; syn; X | static class/capability | Shared class carrier fact; central grants/state. |
| `tooling/src/verify/gates/no-test-fabrication.ts:185,191,192` | `Te2702`; syn; X | test double-cast/assertion | Shared test cast fact; retire stale baseline vocabulary. |
| `tooling/src/verify/gates/owner-scoped-reads.ts:217,223,226,232,268,276` | `Sv1466`; types; O | `tenancy-read` | Shared read-query/owner predicate fact; state. |
| `tooling/src/verify/gates/owner-scoped-upserts.ts:122,128,131,138,170,178` | `Sv1466`; types; O | `tenancy-read` | Shared conflict-target/owner fact; state. |
| `tooling/src/verify/gates/owner-scoped-writes.ts:109,115,118,125,165,173` | `Sv1466`; types; O | `tenancy-read` | Shared update/delete/owner predicate fact; state. |
| `tooling/src/verify/gates/persist-partialize-and-total-migrate.ts:71,77,78` | `Cl1287`; syn; O | Zustand persistence family | Shared persist config/static object fact. |
| `tooling/src/verify/gates/route-trpc-lifo-order.ts:108,115,116` | `Te479`; syn; O | route registration order | Shared test callback/statement-order fact. |
| `tooling/src/verify/gates/stale-draft-commit.ts:139,148,149,168,172` | `Cl1287`; syn; X | draft/live comparison | Shared condition/member origin; central grants/state. |
| `tooling/src/verify/gates/state-files.ts:167,173,174` | `Cl87`; syn; O | state export boundary | Shared export/member fact. |
| `tooling/src/verify/gates/table-explicit-primary-key.ts:46,52,53` | `Db29`; syn; X | `schema-read` | Shared table/PK fact; central sanctioned cases. |
| `tooling/src/verify/gates/test-determinism.ts:61,68,69` | `Te2590`; syn; O | `comment-spans` | Direct comment-blanked file reader; central line-adjacent waiver. |
| `tooling/src/verify/gates/tooling-size.ts:19,26,27` | `To940`; syn; O | authored-tree line counts | Direct `visitFile` port or shared authored-file metadata. |
| `tooling/src/verify/gates/types-in-contract.ts:19,25,26` | `Sv29`; syn; O | contract service declaration | Direct file declaration fact. |
| `tooling/src/verify/gates/verb-naming.ts:40,47,48` | `Sv465`; types; O | `ast-read` verb signature | Shared export/signature fact. |

## Reconciliation and final-model gaps

No source report count or classification drifted during reconciliation:

- A-M remains 17 and N-Z remains 69; together they exactly match the first-wave 86.
- Resource remains an exact 53, partitioned 29 resource-only/24 hybrid and 50 whole/3 selected.
- The two resource-gate private `Project` owners remain `dangling-refs` and
  `enforcement-registry-parity`.
- All four corpus-wide hook totals remain exact. The uncovered mixed count is 12 because the thirteenth
  mixed gate, `tooling-instrument-proof`, is resource-backed.

The remaining final-model gaps are explicit rather than hidden in gate-local machinery:

1. Every row needs exact population equivalence, including selected/file/folder/project/whole behavior,
   plus a declared fixture mode and fail-closed empty/unresolved controls.
2. Mixed-authority gates must split into one authority and severity per policy; local sanctions,
   deferred rows, custom markers, and baseline debt must move to central grants, warnings, or deletion.
3. Private descendant/project walks, free-form `run` evaluators, module state, and ad hoc parsers must be
   replaced by invocation state and shared semantic/resource facts before conversion. A row remains
   blocked when the required reader or ResourceHost fact does not yet exist.

Issue summary: the first-wave 86 and resource 53 cohorts leave exactly 116 gates. This report supplies
the complete per-gate conversion manifest: 12 mixed, 32 direct-walking visitors, 40 run-only, and 32
file-hook gates, with zero overlap and corpus totals reconciled to all 255 loaded descriptors.
