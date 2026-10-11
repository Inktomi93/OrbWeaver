// ui-audit in-page walker — segment: interactive census: tap targets (compositor hit-extent probe) + accessible names + action doors + control silhouette + landmark/pointer.
// The post-reveal NAVIGABILITY censuses (tabindex, unreachable hint, z-index) are the segment immediately
// after this one, `census-interactive-navigability.ts` — same scope, same IIFE, split at the tooling cap.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT EACH CENSUS FAMILY NEEDS FROM THE VIEWPORT (#653 — the classification the next author will
// otherwise re-derive wrong, which is how this segment came to report a false clean)
//
// The question is never "is this element on screen"; it is "can the fact this rule judges be READ
// while the element is off screen". Three classes, and only the PAINT class is genuinely
// viewport-bound:
//
//   class      what it reads                         off-screen?   families
//   ────────── ───────────────────────────────────── ───────────── ───────────────────────────────
//   GEOMETRY   getBoundingClientRect / computed      YES — a box    accessibleNames, tabIndexes,
//              style only. Layout is resolved for    is resolved    zIndexes, headings, texts,
//              the WHOLE document, not for the       everywhere.    textStyles, overflows,
//              visible part of it.                                  clippedOverflows, images
//   PAINT      document.elementFromPoint / a pixel   NO — hit       tapTargets (the ::after
//              sample. Both are viewport-coordinate  testing and    hit-extent probe), the
//              APIs: outside 0..innerWidth/Height    screenshots    unresolved-backdrop pixel
//              they answer null, and null reads as   only exist     sampler (ops/pixels.ts),
//              "nothing there", never as "I could    inside the     occluderOf
//              not look".                            viewport.
//   OFFERED    is this control reachable by a        NO — an        actionDoors, controlAspects
//              pointer AT ALL (the 2026-08-16        off-CANVAS     (they inherit the tap-target
//              off-canvas phantom class).            panel is not   census's offered-control
//                                                    offered.       vocabulary on purpose)
//
// THE BUG THIS TABLE EXISTS TO PREVENT: `inVisualViewport` was minted for the OFFERED question — a
// detail panel parked at x=431 on a 430px viewport supplied a whole census of failures nobody could
// touch — and was then applied as if it answered the PAINT question too. It does not. "Off screen
// right now" and "unreachable" are different facts: a control 1,500px down an inner scroller is
// fully offered, fully paintable, and simply not scrolled to. Skipping it silently made every
// below-the-fold control invisible to three rule families at once, and the run still printed
// `findings=0` — a scan that structurally could not see the surface reads exactly like a scan that
// found nothing wrong.
//
// THE SCROLLER IS ALMOST NEVER THE DOCUMENT. Measured on the surface that named this row (the chat
// "This chat" context tab at 430x932): `document.scrollingElement.scrollHeight === window.innerHeight`
// — there is NO document scroll at all — while the tab panel is an inner scroller of clientHeight 515
// over scrollHeight 2261, holding ~20 sized controls at top 1073..2374. A scroll-and-stitch fix that
// drove `window.scrollTo` would have moved nothing and reported the same false clean. So the reveal
// below is `Element.scrollIntoView`, which the browser resolves by scrolling EVERY scrollable ancestor
// — inner scrollers, nested scrollers, and the document — rather than a scroll axis this code picks.
//
// THE FIX IS TO SCROLL, NOT TO RELAX. A PAINT-class fact measured off-screen would be a FALSE
// MEASUREMENT, not a recovered one (a control whose 44px touch floor lives in a pointer-conditional
// `::after` reads as its 16px border box if you skip the compositor probe). So the sweep below
// brings each un-censused control INTO the viewport, measures it there under the real arm, and
// restores every scroll position it touched before the later segments read geometry. Whatever is
// still outside after that is counted and PUBLISHED as `censusReach` — a family that reports
// nothing owes its denominator (the same law that makes a `scanRoot: () => false` gate declare
// `ctx.scan`).
//
// DECLARED LIMITS, both genuine (they are facts about the DOM, not work deferred):
//   • A VIRTUALIZED list's off-screen rows are NOT IN THE DOM. Nothing can censuse a node that does
//     not exist, and scrolling one recycles the same nodes rather than adding new ones — so the
//     reveal sweep sees each recycled node once (it is de-duplicated by identity) and the rows that
//     never mounted are not counted at all, because they cannot be enumerated.
//   • `document.querySelectorAll` snapshots a STATIC NodeList. A node the app unmounts mid-sweep
//     collapses to a 0x0 box and drops out through the existing sub-2px plumbing filter; a node the
//     app mounts mid-sweep is not in the list and is not censused.
//   • The reveal budget (REVEAL_SCROLL_BUDGET) bounds a pathological surface. Exhausting it sets
//     `budgetExhausted`, which the runner prints — an exhausted budget is a refusal, not a clean run.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { IMPLICIT_INTERACTIVE_ROLES_JS } from "../../lib/checks-interactive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_INTERACTIVE = `  // ── interactive elements: tap targets + accessible names + action doors ──
  // THE TWO-ARM REVEAL CONTRACT (#1077): ROW_REVEAL/subtitleReveal is opacity-0 at fine rest, ALWAYS-ON
  // at coarse (\`pointer-coarse:opacity-100\`) — coarse covers itself, so the gap is fine-only.
  // \`restHiddenRevealFine\` feeds census-collision.ts's \`reveal-coverage\` EXCLUDED row (#2468 — it was a
  // WITHHELD row until the fine-rest regime was named there), never a silent drop.
  var pointerCoarse = window.matchMedia("(pointer: coarse)").matches;
  var restHiddenRevealFine = 0;
  var tapTargets = [];
  var accessibleNames = [];
  // The name-text source, the native-label / labelledby / alt resolvers and the ONE spec-ordered
  // comparison key all live in the PRECEDING segment (ops/walker/accessible-name.ts) — same function
  // scope. \`accNameOwnText\` moved there at #1324 so snap's surface map could compose the key without
  // composing this census: two homes for one accessible name is what put \`aria-label\` ahead of
  // \`aria-labelledby\` in both of them.
  // issue #252 — the RUNTIME half of the dual-home detector. The static gate (duplicate-action-doors)
  // censuses tRPC call sites per rail section and is blind by construction to a REGISTRY-RENDERED action:
  // one call site behind N rendered slots, which is exactly how the founding "new chat lives in three
  // places" complaint escapes it. This census is the other lens: the same (role, accessible name) offered
  // more than once on one rendered plane. Both together close the class — the static arm catches one verb
  // under N different labels, this arm catches one label rendered N times from one verb.
  var actionDoors = [];
  // PER-DATUM REPETITION IS THE WHOLE FALSE-POSITIVE CLASS: twelve "Open" buttons in a chat list are twelve
  // different chats, not twelve doors to one action. The discriminator is STRUCTURAL PATH, not a twin-sibling
  // count — a twin count keyed on tag+class calls two bare wrapper divs a list (measured: it swallowed every
  // door on a three-door stage). Per-datum instances are rendered by ONE piece of code, so their paths from
  // the root are IDENTICAL; genuinely separate homes (a hero CTA, a rail button, a topbar glyph) are reached
  // by DIFFERENT paths. So the door carries its path and the Node side groups on distinctness — the same
  // structural-signature grouping the repeated-container-text census already uses, one level up.
  // Positional nth-of-type is deliberately absent: it is what would make two list rows look like two homes.
  var DOOR_PATH_MAX = 12;
  var structuralSig = function (el) {
    var cls = String(el.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).sort().join(".");
    var slot = el.getAttribute("data-slot");
    return el.tagName.toLowerCase() + (slot ? "@" + slot : "") + (cls ? "." + cls : "");
  };
  var doorPath = function (el) {
    var parts = [];
    var levels = 0;
    for (var anc = el; anc && anc !== document.body && levels < DOOR_PATH_MAX; anc = anc.parentElement, levels += 1) {
      parts.push(structuralSig(anc));
    }
    return parts.join("<");
  };
  // SIBLING ROWS OF ONE LIST ARE ONE HOME, HOWEVER THEIR SUBTREES DIVERGE (issue #851). The path
  // signature above assumes per-datum rows render an IDENTICAL chain, and a row that renders a
  // conditional wrapper breaks that assumption: measured on the transcript at --mobile, two message rows
  // reached their "More message actions" button through div@theme-scope and div@message-content-column
  // respectively, and the Node side read the two paths as two homes. Desktop hid it only because the
  // reveal cluster is hover-gated there, so exactly one row's door was ever offered at once — i.e. the
  // rule was set to fire on every virtualized list the moment a coarse pointer made the rows' actions
  // permanent, which is where the lens is most load-bearing.
  //
  // The discriminator is the LIST, not the path: a door reached through item I of container C is
  // per-datum by construction, whatever shape I renders inside. So the walker publishes the identity of
  // the (container, item) pair it found and lets lib/checks-quality.ts fold sibling items into one home
  // while keeping two doors INSIDE one item distinct (an action offered twice in one card is a real
  // finding). Identity, not signature: two sibling <li> have the same signature, and collapsing on that
  // would fold two genuinely different lists that happen to look alike.
  var LIST_ITEM_ROLES = { listitem: 1, option: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, row: 1, treeitem: 1, tab: 1, gridcell: 1 };
  var LIST_ITEM_TAGS = { li: 1, tr: 1, option: 1 };
  // A LIST ITEM by its own declaration only. data-index is the virtualizer's row stamp (@tanstack/virtual
  // writes it on every rendered row), which is how a role-less virtualized list still resolves.
  var isListItemEl = function (el) {
    if (LIST_ITEM_ROLES[String(el.getAttribute("role") || "").trim().toLowerCase()]) return true;
    if (LIST_ITEM_TAGS[el.tagName.toLowerCase()]) return true;
    return el.hasAttribute("data-index");
  };
  // Per-run element identities. A small array + indexOf, not a Map: this runs a handful of times per door
  // and the walker string stays ES5-shaped for the oldest engine that ever evaluates it.
  var doorElementIds = [];
  var doorElementId = function (el) {
    var at = doorElementIds.indexOf(el);
    if (at < 0) {
      at = doorElementIds.length;
      doorElementIds.push(el);
    }
    return "e" + at;
  };
  // Deeper than DOOR_PATH_MAX on purpose: the path signature is deliberately shallow (a fingerprint),
  // but the list ancestor is a FACT about where the door lives and a transcript row nests further than 12.
  var LIST_ANCESTOR_MAX = 32;
  var doorListHome = function (el) {
    var levels = 0;
    for (var anc = el; anc && anc !== document.body && levels < LIST_ANCESTOR_MAX; anc = anc.parentElement, levels += 1) {
      if (!isListItemEl(anc)) continue;
      var parent = anc.parentElement;
      if (!parent) continue;
      // A list needs SIBLINGS: one lone <li> is not a repeated datum, and treating it as one would hand a
      // genuine second home a free pass.
      var siblingItems = 0;
      for (var sib = 0; sib < parent.children.length; sib += 1) {
        if (isListItemEl(parent.children[sib])) siblingItems += 1;
      }
      if (siblingItems >= 2) return { list: doorElementId(parent), item: doorElementId(anc) };
    }
    return null;
  };
  // A TOOLBAR CELL'S HOME (#1705). The RULING and its rationale live on checkDuplicateDoorPopulations
  // (lib/checks-quality.ts); this publishes only the fact. The nearest \`role="toolbar"\` ancestor decides —
  // toolbars do not nest here — under the same "a set needs SIBLINGS" guard doorListHome carries: one lone
  // control under a toolbar role is not a switcher and must not get a free pass.
  var doorToolbarHome = function (el) {
    var levels = 0;
    for (var anc = el; anc && anc !== document.body && levels < LIST_ANCESTOR_MAX; anc = anc.parentElement, levels += 1) {
      if (String(anc.getAttribute("role") || "").trim().toLowerCase() !== "toolbar") continue;
      var cells = 0;
      for (var tc = 0; tc < anc.children.length; tc += 1) {
        if (anc.children[tc].matches(INTERACTIVE_SELECTOR) || anc.children[tc].querySelector(INTERACTIVE_SELECTOR) !== null) cells += 1;
      }
      return cells >= 2 ? doorElementId(anc) : null;
    }
    return null;
  };
  // The accessible name as a COMPARISON KEY, not as a WCAG computation: case-folded, whitespace-collapsed,
  // and stripped of trailing punctuation, so "New chat" / "new chat" / "New chat…" are one door.
  var doorNameKey = function (name) {
    return String(name || "").replace(/\\s+/g, " ").trim().toLowerCase().replace(/[.\\u2026:;,!?]+$/, "");
  };
  var IMPLICIT_ROLES = ${IMPLICIT_INTERACTIVE_ROLES_JS};
  var doorRole = function (el) {
    var explicit = el.getAttribute("role");
    if (explicit) return explicit.trim().toLowerCase();
    var tag = el.tagName.toLowerCase();
    if (tag === "input") return "input:" + String(el.getAttribute("type") || "text").toLowerCase();
    if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
    return IMPLICIT_ROLES[tag] || "generic";
  };
  var interactiveEls = document.querySelectorAll(INTERACTIVE_SELECTOR);
  // The compositor hit-extent probe — ownsPoint / measureHitExtent / probeFrameFits /
  // inVisualViewport and the ancestor-credit vocabulary — is the PRECEDING segment
  // (ops/walker/hit-extent.ts, split out at #797 for the tooling line cap). Same function scope.

  // ── REACH (#653): the census's own denominator, and the sweep that earns it ──────────────────────
  // "nothing found" and "nothing looked at" must never render identically, so every control that is
  // OFFERED but not currently painted is either brought into view and measured for real, or counted
  // here with its reason. ops/run.ts publishes these numbers on the RESULT line.
  var REVEAL_SCROLL_BUDGET = 400;
  var censusReach = {
    offered: 0,
    onScreen: 0,
    revealed: 0,
    revealScrolls: 0,
    skippedOffViewport: 0,
    recentred: 0,
    frameTruncated: 0,
    scrollersRestored: 0,
    revealBudget: REVEAL_SCROLL_BUDGET,
    budgetExhausted: false,
  };
  // Every scroll position the sweep may disturb, snapshotted BEFORE it starts. The later segments read
  // VIEWPORT-coordinate geometry (the text samples' boxes feed ops/pixels.ts, which screenshots the page
  // after the walk), so a sweep that left the surface scrolled would silently re-point every one of them
  // at the wrong pixels. Restored in reverse so an outer scroller cannot re-offset an inner one.
  var scrollRestore = [];
  var scrollRoot = document.scrollingElement;
  if (scrollRoot) scrollRestore.push({ el: scrollRoot, top: scrollRoot.scrollTop, left: scrollRoot.scrollLeft });
  for (var sc = 0; sc < allEls.length; sc += 1) {
    var scEl = allEls[sc];
    if (scEl === scrollRoot) continue;
    if (scEl.scrollHeight > scEl.clientHeight || scEl.scrollWidth > scEl.clientWidth) {
      scrollRestore.push({ el: scEl, top: scEl.scrollTop, left: scEl.scrollLeft });
    }
  }
  // Bring el into the viewport by scrolling whatever ancestors own it. \`scrollIntoView\` is deliberate:
  // it resolves the ancestor chain itself, which is what reaches an inner scroller (the surface that
  // named #653 has NO document scroll). Returns whether the control is actually visible afterwards — a
  // fixed off-canvas panel scrolls nowhere, and that control stays correctly uncensused.
  function revealIntoViewport(el) {
    if (censusReach.revealScrolls >= REVEAL_SCROLL_BUDGET) {
      censusReach.budgetExhausted = true;
      return false;
    }
    censusReach.revealScrolls += 1;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    } catch (e) {
      // Older engines reject the options object; the boolean form still centres nothing but does scroll.
      el.scrollIntoView(true);
    }
    return inVisualViewport(el.getBoundingClientRect());
  }
  for (var m2 = 0; m2 < interactiveEls.length; m2 += 1) {
    var iel = interactiveEls[m2];
    if (!pointerCoarse && !isOperable(iel) && isOpacityOnlyHidden(iel)) restHiddenRevealFine += 1;
    if (!isOperable(iel) || isDevChrome(iel)) continue;
    // Base UI mints 1-2px native-input TWINS (aria-hidden and/or tabindex=-1) behind
    // Select/Slider/Switch — hidden plumbing, not offered targets, and the measured #1 FP class
    // (a full pass once produced 52 tap-target/aria-name findings, all this shape).
    var irect = iel.getBoundingClientRect();
    if (Math.min(irect.width, irect.height) <= 2) continue;
    // THE REVEAL (#653). This control is offered; if it is simply not scrolled to, scroll to it and
    // re-read the box, because everything below this line is PAINT-class and only answers in-viewport.
    censusReach.offered += 1;
    var onScreen = inVisualViewport(irect);
    if (onScreen) {
      censusReach.onScreen += 1;
    } else if (revealIntoViewport(iel)) {
      irect = iel.getBoundingClientRect();
      onScreen = true;
      censusReach.revealed += 1;
    } else {
      censusReach.skippedOffViewport += 1;
    }
    // THE PROBE FRAME (#797). Intersecting the viewport is not the same as being MEASURABLE in it: the
    // outward hit probe needs its whole +/-22px ring to exist, and a control straddling an edge answers
    // \`null\` on the points that fell off — which the extent walk reads as "not owned" and collapses to
    // the bare border box. That is how a 44x44 checkbox on the Settings→Plugins pane minted a P1 that
    // vanished at --viewport 1280x2200 with an identical element census. So RE-CENTRE first (the same
    // scrollIntoView the reveal uses, which resolves every scrollable ancestor), and only refuse where
    // no scroll can produce a frame.
    if (onScreen && !probeFrameFits(irect)) {
      censusReach.recentred += 1;
      if (revealIntoViewport(iel)) irect = iel.getBoundingClientRect();
    }
    // A HIDDEN CONTROL IS NOT AUTOMATICALLY AN UNREACHABLE ONE. The shell skip link at rest is a clipped
    // 26x32 stub: no pointer can reach it, so a target-size verdict on it is a claim about nothing (it was
    // a P1 on every surface). But Base UI's Slider hands its native range input the SAME visually-hidden
    // styling and parks it inside the visible thumb — that control is fully reachable, its real target is
    // the whole control row, and the composite probe below already measures it correctly. The empirical
    // difference is hit-testing, so ask the compositor rather than the style: a hidden control that does
    // not even own its own CENTRE POINT is offered to no pointer and leaves the census. The accessible-name
    // census below keeps both — a screen-reader-only control is exactly the one that lives or dies by its name.
    var hiddenStub = isVisuallyHidden(iel) && !ownsPoint(iel, irect.left + irect.width / 2, irect.top + irect.height / 2);
    if (onScreen && !hiddenStub) {
      var extent = measureHitExtent(iel, irect);
      // Report the EFFECTIVE extent as the measured size; the box only ever raises it, never lowers it.
      var effective = Math.max(Math.min(irect.width, irect.height), extent.half * 2);
      // A LOWER BOUND UNDER THE WIDEST FLOOR IS NOT A VERDICT (#797). The probe ring was clipped by a
      // viewport edge with no in-frame radius having genuinely failed, so this number is "at least this",
      // never "this" — and a sub-target finding minted from it is the phantom P1 class. The CONTROL still
      // rides in the census (dropping it would trade a false positive for a false clean); the FLAG is what
      // lib/checks-a11y.ts withholds the verdict on, and the counter is what makes that legible on the run.
      var lowerBound = extent.truncated && effective < HIT_PROBE_MAX * 2;
      if (lowerBound) censusReach.frameTruncated += 1;
      tapTargets.push({
        targetId: targetIdentity(iel),
        ancestorTargetIds: interactiveAncestorIdentities(iel),
        authoredTarget: authoredTargetClaim(iel),
        authoredHome: authoredTargetHome(iel),
        selector: describe(iel),
        width: Math.max(irect.width, effective),
        height: Math.max(irect.height, effective),
        extentTruncated: lowerBound,
        // THE AUTHOR'S RULING, RENDERED (#1381). A priced sub-floor decision lived only in a source
        // comment (the @orb-waive sub-floor-disclosure waiver), which this walker cannot read, so cold audits re-filed the same P1
        // every time. The control declares it on the DOM instead; Node decides what the declaration
        // MEANS (checks-a11y.ts excludes it at fine pointer only) — the walker just carries the fact.
        ruledTargetFloor: iel.getAttribute("data-target-floor"),
      });
    }
    accessibleNames.push({
      selector: describe(iel),
      tag: iel.tagName.toLowerCase(),
      hasVisibleText: accNameOwnText(iel).length > 0,
      ariaLabel: iel.getAttribute("aria-label"),
      ariaLabelledbyText: labelledbyText(iel),
      nativeLabelText: nativeLabelText(iel),
      title: iel.getAttribute("title"),
      altText: altTextOf(iel),
    });

    // A DOOR is an offered, NAMED, non-per-datum control. Unnamed controls are the aria-name rule's
    // finding, not this one, and an off-screen or clipped-stub control is offered to nobody. A generic
    // tabindex=-1 node is programmatic focus plumbing, not an offered action: keep it in accessibleNames
    // and tabIndexes above, but do not let inherited descendant text turn nested modal/command wrappers
    // into duplicate generic doors (issue #370). This excludes role="generic" whether implicit OR
    // explicit — doorRole does not distinguish the two — so only non-generic roles and any tabindex
    // other than -1 remain judged.
    // THE NAME IS NOT COMPOSED HERE ANY MORE (#1324). This chain put \`aria-label\` ahead of
    // \`aria-labelledby\` — the reverse of accname 1.2 (2B precedes 2C) — and read raw \`textContent\` for
    // the content step, so a planted pair sharing an aria-label under different labelledby targets was
    // filed a duplicate door and a real duplicate under one labelledby was missed. \`accessibleNameOf\`
    // (ops/walker/accessible-name.ts) is the ONE spec-ordered key; \`doorNameKey\` still folds it to a
    // COMPARISON key (case, whitespace, trailing punctuation) — a comparison, never a WCAG computation.
    var doorName = doorNameKey(accessibleNameOf(iel));
    var resolvedDoorRole = doorRole(iel);
    var programmaticGeneric = resolvedDoorRole === "generic" && String(iel.getAttribute("tabindex") || "").trim() === "-1";
    if (doorName.length > 0 && onScreen && !hiddenStub && !programmaticGeneric) {
      var doorHome = doorListHome(iel);
      actionDoors.push({
        selector: describe(iel),
        role: resolvedDoorRole,
        name: doorName,
        path: doorPath(iel),
        listKey: doorHome ? doorHome.list : null,
        itemKey: doorHome ? doorHome.item : null,
        toolbarKey: doorToolbarHome(iel),
      });
    }
  }

  // ── control silhouette (#430): the rendered box of every EXPLICITLY-ROLED visible element ──
  // Facts only. WHICH roles owe a directional silhouette is a Node-side table (lib/checks-a11y.ts
  // CONTROL_SILHOUETTES) — censusing on the bare presence of a role attribute is what keeps the two from
  // drifting: adding a role to the verdict table needs no edit here, so the walker can never be silently
  // blind to a role the checks think they cover.
  // The offered-control filters are the tap-target census's own vocabulary (aria-hidden Base UI twins,
  // dev chrome, sr-only stubs, 1-2px plumbing, off-viewport phantoms) — two vocabularies would let a
  // phantom mint a shape finding nobody can see.
  var controlAspects = [];
  var roledEls = document.querySelectorAll("[role]");
  for (var ca = 0; ca < roledEls.length; ca += 1) {
    var cel = roledEls[ca];
    if (!isVisible(cel) || isDevChrome(cel)) continue;
    if (cel.closest("[aria-hidden='true']")) continue;
    if (isVisuallyHidden(cel)) continue;
    var crect = cel.getBoundingClientRect();
    if (Math.min(crect.width, crect.height) <= 2) continue;
    // Same reveal as the tap-target census (#653). The silhouette question is GEOMETRY-class and would
    // answer off screen, but this census deliberately shares the tap-target census's offered-control
    // vocabulary — two vocabularies would let a phantom mint a shape finding nobody can see — so it
    // shares the reveal too rather than growing a second, quietly divergent viewport rule.
    if (!inVisualViewport(crect)) {
      if (!revealIntoViewport(cel)) continue;
      crect = cel.getBoundingClientRect();
    }
    // A box read while something is animating is a frame, not a design. getAnimations() covers CSS
    // transitions and animations alike; a finished transition is removed from the list, so this reports
    // in-flight only. Guarded for the (headless-old / jsdom) case where the API is absent.
    var running = false;
    if (typeof cel.getAnimations === "function") {
      var anims = cel.getAnimations();
      for (var cn = 0; cn < anims.length; cn += 1) {
        if (anims[cn].playState === "running") { running = true; break; }
      }
    }
    controlAspects.push({
      selector: describe(cel),
      role: String(cel.getAttribute("role") || "").trim().toLowerCase(),
      width: crect.width,
      height: crect.height,
      animating: running,
    });
  }

  // ── RESTORE (#653) — the sweep is over; put every scroller back where the page had it ────────────
  // This must run BEFORE any later segment reads geometry: the text census's viewport boxes were taken
  // at the original scroll offset and ops/pixels.ts screenshots the page after the walk to settle
  // unresolved backdrops, so a surface left scrolled would re-point every one of those samples at the
  // wrong pixels. Reverse order: restoring an outer scroller after an inner one cannot re-offset it.
  for (var sr = scrollRestore.length - 1; sr >= 0; sr -= 1) {
    var slot = scrollRestore[sr];
    slot.el.scrollTop = slot.top;
    slot.el.scrollLeft = slot.left;
    censusReach.scrollersRestored += 1;
  }

  var mainLandmarkPresent = false;
  var mainLandmarks = document.querySelectorAll("main, [role='main']");
  for (var ml = 0; ml < mainLandmarks.length; ml += 1) {
    if (isVisible(mainLandmarks[ml])) { mainLandmarkPresent = true; break; }
  }

`;
