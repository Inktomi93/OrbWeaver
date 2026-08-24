// ui-audit in-page walker — segment: interactive census: tap targets (compositor hit-extent probe) + accessible names + action doors + landmark/pointer/tabindex/z-index.
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

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_INTERACTIVE = `  // ── interactive elements: tap targets + accessible names + action doors ──
  var tapTargets = [];
  var accessibleNames = [];
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
  // The accessible name as a COMPARISON KEY, not as a WCAG computation: case-folded, whitespace-collapsed,
  // and stripped of trailing punctuation, so "New chat" / "new chat" / "New chat…" are one door.
  var doorNameKey = function (name) {
    return String(name || "").replace(/\\s+/g, " ").trim().toLowerCase().replace(/[.\\u2026:;,!?]+$/, "");
  };
  var IMPLICIT_ROLES = { a: "link", button: "button", summary: "button", select: "combobox", textarea: "textbox" };
  var doorRole = function (el) {
    var explicit = el.getAttribute("role");
    if (explicit) return explicit.trim().toLowerCase();
    var tag = el.tagName.toLowerCase();
    if (tag === "input") return "input:" + String(el.getAttribute("type") || "text").toLowerCase();
    if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
    return IMPLICIT_ROLES[tag] || "generic";
  };
  var interactiveEls = document.querySelectorAll(INTERACTIVE_SELECTOR);
  var labelledbyText = function (el) {
    var attr = el.getAttribute("aria-labelledby") || "";
    var ids = attr.split(/\\s+/).filter(Boolean);
    if (ids.length === 0) return null;
    var text = ids
      .map(function (id) {
        var ref = document.getElementById(id);
        return ref ? ref.textContent || "" : "";
      })
      .join(" ")
      .trim();
    return text.length > 0 ? text : null;
  };
  var altTextOf = function (el) {
    if (el.tagName === "IMG") return el.getAttribute("alt");
    var inner = el.querySelector("img[alt]");
    return inner ? inner.getAttribute("alt") : null;
  };
  // THE HIT AREA IS NOT THE BOX (2026-08-16 — 10 of 13 "sub-target" findings in one audit were this).
  // @orb/ui Button's size="inline"/size="glyph-*" variants carry a pointer-conditional touch-target
  // ::after (packages/ui/src/primitives/button/variants.ts:16-20, :76-82), so a 25x15 border box can own
  // a 45x45 hit area. Probe what the COMPOSITOR says: sample points on the ring the ::after would cover
  // and ask elementFromPoint whether this control still owns them. The measured extent is what WCAG
  // 2.5.5/2.5.8 are about — "target size", not "border-box size".
  var HIT_PROBE_RADII = [11, 16, 22]; // half-extents probed outward: 22 → a 44px target
  // OWNERSHIP IS PER COMPOSITE, NOT PER ELEMENT (2026-08-16). A Base UI Slider's real pointer target is
  // the whole Control row (h-control-sm — 44px coarse / 32px fine; a mouse press at the row's top edge
  // 60px from the thumb moved the value 60 to 73), but the outward probe lands on
  // [data-slot=slider-indicator], a SIBLING of the thumb inside the same control. The identity/containment
  // test alone stalled the walk there and printed a fine-pointer P1 at 22px on a 32px row.
  // A hit is now ALSO owned when the nearest ancestor el and hit share offers exactly ONE control and that
  // control is el — a neighbouring button IS another offered control, so a genuine sub-target still fires.
  // DECLARED LIMIT: a lone control inside a larger non-interactive wrapper within COMPOSITE_WALK_MAX levels
  // is credited with the wrapper's extent even if the wrapper takes no pointer. That direction (under-
  // reporting one sub-target) is the deliberate trade against the measured FP class: 10 of 13 "sub-target"
  // findings in one audit were hit-area misreads.
  var COMPOSITE_WALK_MAX = 4;
  // The same "is this an offered target" filter the tap-target census itself applies (aria-hidden Base UI
  // twins, dev chrome, 1-2px plumbing) — two vocabularies here would let a phantom control veto a real
  // composite.
  function isOfferedControl(el) {
    if (!isVisible(el) || isDevChrome(el)) return false;
    if (el.closest("[aria-hidden='true']")) return false;
    var r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) > 2;
  }
  function sharedCompositeOwns(el, hit) {
    var scope = el.parentElement;
    for (var d = 0; d < COMPOSITE_WALK_MAX && scope !== null; d += 1) {
      if (scope.contains(hit)) {
        var controls = scope.querySelectorAll(INTERACTIVE_SELECTOR);
        for (var c = 0; c < controls.length; c += 1) {
          var other = controls[c];
          if (other !== el && !el.contains(other) && isOfferedControl(other)) return false;
        }
        return true;
      }
      scope = scope.parentElement;
    }
    return false;
  }
  function ownsPoint(el, x, y) {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    var hit = document.elementFromPoint(x, y);
    if (hit === null) return false;
    if (hit === el || el.contains(hit) || hit.contains(el)) return true;
    return sharedCompositeOwns(el, hit);
  }
  // Grow outward from the centre while the control still answers on all four cardinal offsets. Returns
  // the effective half-extent in px (>= the box's own, never less).
  function effectiveHalfExtent(el, rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    if (!ownsPoint(el, cx, cy)) return Math.min(rect.width, rect.height) / 2; // occluded centre: trust the box
    var best = Math.min(rect.width, rect.height) / 2;
    for (var hp = 0; hp < HIT_PROBE_RADII.length; hp += 1) {
      var r = HIT_PROBE_RADII[hp];
      if (r <= best) continue;
      if (ownsPoint(el, cx - r, cy) && ownsPoint(el, cx + r, cy) && ownsPoint(el, cx, cy - r) && ownsPoint(el, cx, cy + r)) best = r;
    }
    return best;
  }
  // A control whose HOST sits outside the visual viewport is a phantom (2026-08-16: an off-canvas detail
  // panel at x=431 on a 430px viewport supplied a whole census of "failures" nobody could touch).
  // It answers the OFFERED question, never the PAINT question — see the class table in the file header.
  function inVisualViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

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
    if (!isVisible(iel) || isDevChrome(iel)) continue;
    // Base UI mints 1-2px native-input TWINS (aria-hidden and/or tabindex=-1) behind
    // Select/Slider/Switch — hidden plumbing, not offered targets, and the measured #1 FP class
    // (a full pass once produced 52 tap-target/aria-name findings, all this shape).
    if (iel.closest("[aria-hidden='true']")) continue;
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
      var half = effectiveHalfExtent(iel, irect);
      // Report the EFFECTIVE extent as the measured size; the box only ever raises it, never lowers it.
      var effective = Math.max(Math.min(irect.width, irect.height), half * 2);
      tapTargets.push({
        selector: describe(iel),
        width: Math.max(irect.width, effective),
        height: Math.max(irect.height, effective),
      });
    }
    accessibleNames.push({
      selector: describe(iel),
      tag: iel.tagName.toLowerCase(),
      hasVisibleText: (iel.textContent || "").trim().length > 0,
      ariaLabel: iel.getAttribute("aria-label"),
      ariaLabelledbyText: labelledbyText(iel),
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
    var doorName = doorNameKey(iel.getAttribute("aria-label") || labelledbyText(iel) || (iel.textContent || "") || iel.getAttribute("title") || altTextOf(iel));
    var resolvedDoorRole = doorRole(iel);
    var programmaticGeneric = resolvedDoorRole === "generic" && String(iel.getAttribute("tabindex") || "").trim() === "-1";
    if (doorName.length > 0 && onScreen && !hiddenStub && !programmaticGeneric) {
      actionDoors.push({
        selector: describe(iel),
        role: resolvedDoorRole,
        name: doorName,
        path: doorPath(iel),
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

  var mainLandmarkPresent = document.querySelector("main, [role='main']") !== null;

  // Which target-size floor applies is pointer-conditional (see design-audit-checks.ts checkTapTarget):
  // sample the REAL pointer type this render is under so the tap-target check judges it against the
  // right WCAG floor instead of holding a fine-pointer desktop scale to the 44px touch number.
  var pointerCoarse = window.matchMedia("(pointer: coarse)").matches;

  // ── tabindex smell ────────────────────────────────────────────────────────
  var tabIndexes = [];
  var tabIndexEls = document.querySelectorAll("[tabindex]");
  for (var t = 0; t < tabIndexEls.length; t += 1) {
    var tel = tabIndexEls[t];
    if (isDevChrome(tel)) continue;
    var raw = tel.getAttribute("tabindex");
    var val = Number(raw);
    if (!Number.isNaN(val)) tabIndexes.push({ selector: describe(tel), tabIndex: val });
  }

  // ── z-index escalation (positioned elements only — z-index is inert on static) ──
  var zIndexes = [];
  for (var z = 0; z < allEls.length; z += 1) {
    var zel = allEls[z];
    var zstyle = getComputedStyle(zel);
    if (zstyle.position === "static") continue;
    var zval = Number(zstyle.zIndex);
    if (!Number.isNaN(zval) && zval > 0) zIndexes.push({ selector: describe(zel), zIndex: zval });
  }

`;
