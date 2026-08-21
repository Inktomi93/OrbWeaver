// ui-audit in-page walker — segment: interactive census: tap targets (compositor hit-extent probe) + accessible names + action doors + landmark/pointer/tabindex/z-index.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
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
  function inVisualViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
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
    // A HIDDEN CONTROL IS NOT AUTOMATICALLY AN UNREACHABLE ONE. The shell skip link at rest is a clipped
    // 26x32 stub: no pointer can reach it, so a target-size verdict on it is a claim about nothing (it was
    // a P1 on every surface). But Base UI's Slider hands its native range input the SAME visually-hidden
    // styling and parks it inside the visible thumb — that control is fully reachable, its real target is
    // the whole control row, and the composite probe below already measures it correctly. The empirical
    // difference is hit-testing, so ask the compositor rather than the style: a hidden control that does
    // not even own its own CENTRE POINT is offered to no pointer and leaves the census. The accessible-name
    // census below keeps both — a screen-reader-only control is exactly the one that lives or dies by its name.
    var hiddenStub = isVisuallyHidden(iel) && !ownsPoint(iel, irect.left + irect.width / 2, irect.top + irect.height / 2);
    if (inVisualViewport(irect) && !hiddenStub) {
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
    if (doorName.length > 0 && inVisualViewport(irect) && !hiddenStub && !programmaticGeneric) {
      actionDoors.push({
        selector: describe(iel),
        role: resolvedDoorRole,
        name: doorName,
        path: doorPath(iel),
      });
    }
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
