// ui-audit in-page walker — segment: decor censuses: nested cards, gradient text, animated img-hover, accent borders, bg patterns, icon tiles, static motion offenders.
// The two GLOW families that used to sit between accent borders and bg patterns now live in
// census-glow.ts (2026-09-01) — the pseudo-element sweep took this file past the tooling-size cap.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { interactiveTagSelector } from "../../lib/checks-interactive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** The island's role list is wider than the base vocabulary's — every ARIA composite a nested
 *  interactive island can be — but the TAG portion is the one shared tuple (#1074), so textarea/summary
 *  cannot drop out of this census while staying in the base one. */
const INTERACTIVE_ISLAND_ROLES = ["button", "link", "menuitem", "option", "tab", "switch", "checkbox", "radio"];
const INTERACTIVE_ISLAND_SELECTOR_VALUE = [...interactiveTagSelector(), ...INTERACTIVE_ISLAND_ROLES.map((role) => `[role=${role}]`)].join(",");
const INTERACTIVE_ISLAND_SELECTOR_JS = JSON.stringify(INTERACTIVE_ISLAND_SELECTOR_VALUE);

export const WALKER_CENSUS_DECOR = `  // ── nested cards (card-like = (shadow||border) && (radius||bg)) ─────────
  // CARD-NESS IS MEASURED, NEVER NAMED (2026-08-23, issue #552). \`hasBorder\` used to OR in
  // \`CARD_CLASS_RE.test(el.className)\` with CARD_CLASS_RE = /\\bcard\\b/i over the JOINED class string,
  // which matches inside the COLOUR utility \`text-card-foreground\` — so the sanctioned @orb/ui \`Card
  // nested\` arm ("drop the border entirely, step the radius one below the host's, and let the FILL
  // alone carry the distinction", packages/client/src/features/discovery/components/corpus-family-map.tsx)
  // was called bordered by NAME while its measured box read { t:0, r:0, b:0, l:0 } and boxShadow "none".
  // Every use of that arm anywhere in the app was a guaranteed finding: 8 of the 10 findings on the
  // populated corpus surface (docs/reviews/side-eye/2026-08-23-rail-corpus-populated.md §3).
  // Splitting the class LIST into tokens would not have helped — \`-\` is a non-word character, so
  // /\\bcard\\b/ matches the token \`text-card-foreground\` on its own — and a \`[data-slot^=card]\` arm is
  // worse still: the nested arm IS a card-root, so a slot signal reinstates the identical FP. Border
  // width is always computable, so the name arm bought nothing that the box does not already say.
  function isCardLike(el) {
    var s = getComputedStyle(el);
    var hasShadow = s.boxShadow !== "none" && s.boxShadow.trim() !== "";
    var hasBorder =
      Number.parseFloat(s.borderTopWidth) > 0 ||
      Number.parseFloat(s.borderRightWidth) > 0 ||
      Number.parseFloat(s.borderBottomWidth) > 0 ||
      Number.parseFloat(s.borderLeftWidth) > 0;
    var radius = Number.parseFloat(s.borderTopLeftRadius) || 0;
    var bg = parseRgb(s.backgroundColor);
    var hasBg = bg !== null && bg.a > 0.05;
    return (hasShadow || hasBorder) && (radius > 0 || hasBg);
  }
  // AN INTERACTIVE ISLAND IS NOT A NESTED CARD (2026-08-16 — 26/26 findings on home were this shape).
  // Chrome-diet CD1 SANCTIONS border+radius+bg on interactive islands and elevated surfaces
  // (.claude/skills/side-eye-design-review/reference/design-context.md:38; the density spec's own words:
  // "a grid cell IS an interactive island", docs/architecture/core/UI-Density-Law.md:134). So a button/link/
  // input/[role=button] carrying a border and a radius inside a card is the house style, not a defect.
  // The rule keeps its real target: a decorative CARD PANEL nested inside another card panel.
  var INTERACTIVE_ISLAND_SELECTOR = ${INTERACTIVE_ISLAND_SELECTOR_JS};
  function isInteractiveIsland(el) {
    if (el.matches(INTERACTIVE_ISLAND_SELECTOR)) return true;
    // ListRow's root owns the row's visual chrome but delegates the one offered action to its
    // direct child. Treat that sanctioned wrapper as its interactive island; a generic bordered
    // wrapper stays judged, so a decorative panel cannot hide behind this exception.
    if (el.getAttribute("data-slot") === "list-row-root") {
      var control = el.firstElementChild;
      if (control !== null && control.matches(INTERACTIVE_ISLAND_SELECTOR)) return true;
    }
    // A WRAPPER AROUND A CONTROL IS UNREACHABLE FROM matches()+closest() (2026-08-23, issue #552).
    // Those two see SELF and ANCESTORS only, while this line's old comment claimed "a wrapper whose
    // whole job is to host one control (the label+control field shell) rides along" — an intent the
    // implementation could not deliver, and the #544a FP: \`[data-slot=autocomplete-input-group]\`, the
    // \`border border-border rounded-control bg-input\` shell around the corpus search input, was judged
    // a decorative panel nested in the list pane.
    // The descendant arm is DELIBERATELY one level deep and shape-bounded rather than a subtree
    // \`querySelector\`: an unbounded "contains a control anywhere" test exempts every decorative panel
    // that happens to carry a CTA and eats the rule. A control SHELL is an element whose every element
    // CHILD is a control and which carries no text of its own — the field shell's exact shape (measured
    // live on :5173/corpus: the input group's only child is its 288x30 input inside a 290x32 box, with
    // no own text nodes). A panel with a heading, prose, or any non-control child stays judged.
    if (el.closest(INTERACTIVE_ISLAND_SELECTOR) !== null) return true;
    return isControlShell(el);
  }
  function isControlShell(el) {
    var kids = el.children;
    if (kids.length === 0) return false;
    for (var ci = 0; ci < kids.length; ci += 1) {
      if (!kids[ci].matches(INTERACTIVE_ISLAND_SELECTOR)) return false;
    }
    var nodes = el.childNodes;
    for (var ni = 0; ni < nodes.length; ni += 1) {
      if (nodes[ni].nodeType === 3 && (nodes[ni].nodeValue || "").trim() !== "") return false;
    }
    return true;
  }
  // A MEDIA/IDENTITY TOKEN IS NOT A PANEL (2026-08-23, issue #538 — 11 of 12 nested-card findings on the
  // corpus surface were [data-slot=avatar-stack-item]). An avatar seat carries every input of the card
  // predicate at once (a ring box-shadow, a border, a radius, an opaque fallback background), so it reads
  // as card-like by construction. The ROUND default hid the class behind the pill test (radius >= half the
  // short side); the sanctioned rounded-rect register (AvatarStack shape="rounded" — the hearth-hero
  // portrait treatment) has no such cover, which is why a whole surface's findings were one component.
  // Excluded by the slot's KIND, not by a page-specific allowlist: an avatar-family slot, an [role=img],
  // or an actual image element is a picture of something, never a decorative panel nested in a panel. A
  // media CARD (a bordered wrapper AROUND an image) is untouched — the wrapper is not the image.
  var AVATAR_SLOT_RE = /^avatar(-|$)/;
  var MEDIA_TAGS = { IMG: 1, PICTURE: 1, VIDEO: 1, CANVAS: 1 };
  function isMediaToken(el) {
    if (MEDIA_TAGS[el.tagName] === 1) return true;
    if (el.getAttribute("role") === "img") return true;
    var mediaSlot = el.getAttribute("data-slot") || "";
    return AVATAR_SLOT_RE.test(mediaSlot);
  }
  function isExcludedCardContext(el) {
    var s = getComputedStyle(el);
    if (s.position === "absolute" || s.position === "fixed") return true;
    if (isInteractiveIsland(el)) return true;
    if (isMediaToken(el)) return true;
    // A PILL is a chip, not a panel. Fully-rounded geometry (radius >= half the short side) is the
    // badge/avatar/tag shape — the rule's real target is a bordered PANEL nested in a bordered panel,
    // and a "Dormant" status pill inside a card is house vocabulary, not a card-in-card.
    var pillRect = el.getBoundingClientRect();
    var pillRadius = Number.parseFloat(s.borderTopLeftRadius) || 0;
    if (pillRadius >= Math.min(pillRect.width, pillRect.height) / 2) return true;
    if (el.matches(OVERLAY_SURFACE_SELECTOR)) return true;
    var text = (el.textContent || "").trim();
    var rect = el.getBoundingClientRect();
    if (text.length < 10 && rect.width < 50 && rect.height < 30) return true;
    return false;
  }
  // THE OUTER HALF OF THE PAIR NEEDS A BOX, NOT AN EDGE (2026-08-23, issue #559). \`isCardLike\` accepts a
  // SINGLE border side, because one side is enough to say "this thing draws an edge" for the INNER card —
  // and it must stay that way there. But the same predicate was asked of the ANCESTOR too, so a shell pane
  // — an \`<aside>\` whose whole box evidence is one divider border against its neighbour, radius 0, no
  // shadow — counted as the OUTER card, and every real card that happened to live inside any pane got a
  // "nesting" partner it never had visually. A divider LINE is not a container EDGE; nothing is nested
  // inside a line. So the outer role additionally requires box evidence a divider cannot fake: a shadow, a
  // radius, or borders on at least TWO sides (two sides is the minimum that begins to enclose). MEASURED,
  // never named — the same discipline as the #552 card-ness fix; no slot/class arm, because the pane and
  // the card are the same markup vocabulary and only the drawn box tells them apart.
  function hasEnclosingBox(el) {
    var s = getComputedStyle(el);
    if (s.boxShadow !== "none" && s.boxShadow.trim() !== "") return true;
    if ((Number.parseFloat(s.borderTopLeftRadius) || 0) > 0) return true;
    var sides = 0;
    if (Number.parseFloat(s.borderTopWidth) > 0) sides += 1;
    if (Number.parseFloat(s.borderRightWidth) > 0) sides += 1;
    if (Number.parseFloat(s.borderBottomWidth) > 0) sides += 1;
    if (Number.parseFloat(s.borderLeftWidth) > 0) sides += 1;
    return sides >= 2;
  }
  var cardEls = [];
  var outerEls = [];
  for (var c = 0; c < allEls.length; c += 1) {
    var cel = allEls[c];
    if (!isVisible(cel) || !isCardLike(cel) || isExcludedCardContext(cel)) continue;
    cardEls.push(cel);
    if (hasEnclosingBox(cel)) outerEls.push(cel);
  }
  var nestedSet = [];
  for (var n = 0; n < cardEls.length; n += 1) {
    var cand2 = cardEls[n];
    var p = cand2.parentElement;
    while (p) {
      if (outerEls.indexOf(p) !== -1) {
        nestedSet.push(cand2);
        break;
      }
      p = p.parentElement;
    }
  }
  var innermost = nestedSet.filter(function (el1) {
    return !nestedSet.some(function (el2) {
      return el2 !== el1 && el1.contains(el2);
    });
  });
  var nestedCards = innermost.map(function (el) {
    return { selector: describe(el), isNested: true };
  });

  // ── gradient text (background-clip:text + transparent color) ────────────
  var gradientTexts = [];
  for (var g = 0; g < textEls.length; g += 1) {
    var gel = textEls[g];
    var gs = getComputedStyle(gel);
    var clip = gs.webkitBackgroundClip || gs.backgroundClip;
    var gbg = gs.backgroundImage;
    var gcolorParsed = parseRgb(gs.color);
    var isTransparentColor = gs.color === "transparent" || (gcolorParsed !== null && gcolorParsed.a === 0);
    if (clip === "text" && gbg && gbg.indexOf("gradient") !== -1 && isTransparentColor) {
      gradientTexts.push({ selector: describe(gel), hasGradientText: true });
    }
  }

  // ── animated <img> on interaction state (statically detectable) ──────────
  // BOTH STATE MECHANISMS, ONE PREDICATE (2026-09-01, docs/design/state-paint-census.md). This scan
  // was the IDENTICAL bare \`/:hover/i\` string test hover-walker.ts carried — blind to a Base UI
  // data-attribute-driven img transform (\`data-highlighted:scale-105\`, or an authored
  // \`[data-selected] img { transform: … }\`), and, being un-anchored, also matched the \`:hover\`
  // INSIDE an escaped Tailwind class name. Zero live img hovers ride the attribute channel today —
  // the owner's standing ruling is "we dont build things just for what we have today", and the
  // shared predicate (ops/walker/state-paint.ts) costs this scan nothing.
  // THE HOUSE MEDIA-ZOOM IDIOM PUTS THE CLASS ON THE WRAPPER, NOT THE IMG (#1075, orb-ui audit F3).
  // media-tile-grid's cover span carries \`group-hover:scale-105\`; the <img> inside it carries no
  // transform class of its own. A same-element-only class read is blind to the idiom this codebase
  // actually authors, so the scan walks the img's own class list AND its near ancestors — bounded, like
  // the interactive-island wrapper walk (census-decor.ts's \`isInteractiveIsland\`), so a decorative
  // grandparent far up the tree cannot false-positive an unrelated img.
  var IMG_HOVER_WRAPPER_DEPTH = 3;
  var animatedImgHovers = [];
  for (var h = 0; h < imgEls.length; h += 1) {
    var himg = imgEls[h];
    var hoverAnimated = false;
    for (var hanc = himg, hlevels = 0; hanc && hlevels <= IMG_HOVER_WRAPPER_DEPTH && !hoverAnimated; hanc = hanc.parentElement, hlevels += 1) {
      var hcls = typeof hanc.className === "string" ? hanc.className.split(/\\s+/) : [];
      if (hcls.some(function (c) { return STATE_VARIANT_TRANSFORM_RE.test(c); })) hoverAnimated = true;
    }
    if (hoverAnimated) {
      animatedImgHovers.push({ selector: describe(himg), hasHoverAnimation: true });
    }
  }
  try {
    for (var s2 = 0; s2 < document.styleSheets.length; s2 += 1) {
      var rules;
      try {
        rules = document.styleSheets[s2].cssRules;
      } catch (e) {
        continue;
      }
      for (var r = 0; r < rules.length; r += 1) {
        var rule = rules[r];
        if (!rule.selectorText) continue;
        if (!(hasStateHover(rule.selectorText) || stateAttrAnywhere(rule.selectorText))) continue;
        if (!HOVER_TRANSFORM_RE.test(rule.cssText)) continue;
        // THE SELECTOR TEXT NAMES THE WRAPPER, NOT THE IMG (#1075): a \`/img/i\` substring test over
        // \`rule.selectorText\` never matched the media-tile idiom's compiled group-hover selector, which
        // names only the wrapper's class. Bind the selector to the LIVE DOM instead: does it match an
        // <img>, or does a matched element CONTAIN one — the exact wrapper-carries-the-class shape.
        var matchesImg = false;
        try {
          var matched = document.querySelectorAll(rule.selectorText);
          for (var mi = 0; mi < matched.length && !matchesImg; mi += 1) {
            if (matched[mi].tagName === "IMG" || matched[mi].querySelector("img") !== null) matchesImg = true;
          }
        } catch (e3) {
          continue; // unparseable selector text (an unescaped Tailwind variant colon, etc.)
        }
        if (matchesImg) {
          animatedImgHovers.push({ selector: rule.selectorText, hasHoverAnimation: true });
        }
      }
    }
  } catch (e) {
    /* cross-origin stylesheet — skip */
  }

  // ── accent borders MOVED to ops/walker/census-accent.ts (2026-09-05, #1103) ──
  // The family grew a second collection channel — a \`::before\`/\`::after\` bar pinned to one edge, which
  // is how this codebase actually paints an accent edge — and the pseudo sweep took this file past the
  // tooling-size cap, exactly as the glow families did in 2026-09-01. WALKER_CENSUS_ACCENT declares
  // \`accentBorders\` and runs immediately after this segment (ops/walker.ts), so the composed IIFE's
  // scope is unchanged and WALKER_RETURNS still reads the one array.

  // ── decorative bg patterns: stripes + grid-line fields (impeccable
  //    repeating-stripes-gradient / codex-grid-background) ──────────────────
  var bgPatterns = [];
  var BG_PATTERN_CAP = 50;
  for (var bp = 0; bp < allEls.length; bp += 1) {
    var bpel = allEls[bp];
    if (!isVisible(bpel)) continue;
    var bpStyle = getComputedStyle(bpel);
    var bpImg = bpStyle.backgroundImage || "";
    if (bpImg === "none") continue;
    var isStripe = bpImg.indexOf("repeating-linear-gradient") !== -1;
    var linearCount = (bpImg.match(/(?:^|[^-])linear-gradient\\(/g) || []).length;
    var sizeMatch = /^\\s*([\\d.]+)px\\s+([\\d.]+)px/.exec(bpStyle.backgroundSize || "");
    var isGrid = !isStripe && linearCount >= 2 && !!sizeMatch && Number(sizeMatch[1]) <= 200 && Number(sizeMatch[2]) <= 200;
    if (!isStripe && !isGrid) continue;
    var bpRect = bpel.getBoundingClientRect();
    capPush("bgPatterns", bgPatterns, BG_PATTERN_CAP, {
      selector: describe(bpel),
      kind: isStripe ? "stripe" : "grid",
      backgroundSize: bpStyle.backgroundSize || "",
      width: bpRect.width,
      height: bpRect.height,
    });
  }

  // ── icon tile stacked above a heading (impeccable icon-tile-stack) ───────
  var iconTiles = [];
  var headingEls = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
  for (var ht = 0; ht < headingEls.length; ht += 1) {
    var hel = headingEls[ht];
    if (!isVisible(hel) || isDevChrome(hel)) continue;
    var sibEl = hel.previousElementSibling;
    if (!sibEl || HEADING_TAGS[sibEl.tagName.toLowerCase()] === 1 || !isVisible(sibEl)) continue;
    var sibStyle = getComputedStyle(sibEl);
    var sibRect = sibEl.getBoundingClientRect();
    var sibBg = parseRgb(sibStyle.backgroundColor);
    var iconChild = sibEl.querySelector("svg,i[class*='icon'],span[class*='icon']");
    iconTiles.push({
      headingTag: hel.tagName.toLowerCase(),
      headingText: (hel.textContent || "").trim().slice(0, 60),
      headingTop: hel.getBoundingClientRect().top,
      siblingSelector: describe(sibEl),
      siblingWidth: sibRect.width,
      siblingHeight: sibRect.height,
      siblingBottom: sibRect.bottom,
      siblingBgAlpha: sibBg ? sibBg.a : 0,
      siblingHasBgImage: !!(sibStyle.backgroundImage && sibStyle.backgroundImage !== "none"),
      siblingBorderWidth: Number.parseFloat(sibStyle.borderTopWidth) || 0,
      siblingRadiusPx: Number.parseFloat(sibStyle.borderTopLeftRadius) || 0,
      hasIconChild: !!iconChild,
      iconChildWidth: iconChild ? iconChild.getBoundingClientRect().width : 0,
    });
  }

  // ── static motion offenders (impeccable bounce-easing / layout-transition).
  //    Overshoot-bezier extraction is a bounded numeric FACT filter (the
  //    nestedCards precedent); rule/severity/exemption verdicts stay in checks. ──
  var motionStatics = [];
  var LAYOUT_PROP_RE = /^(width|height|max-width|max-height|min-width|min-height|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?)$/;
  var BOUNCE_NAME_RE = /bounce|elastic|wobble|jiggle|spring/i;
  var BEZIER_RE = /cubic-bezier\\(\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*\\)/g;
  var MOTION_STATIC_CAP = 100;
  for (var ms = 0; ms < allEls.length; ms += 1) {
    var msel = allEls[ms];
    if (!isVisible(msel)) continue;
    var msStyle = getComputedStyle(msel);
    var an = msStyle.animationName || "none";
    if (an !== "none" && BOUNCE_NAME_RE.test(an)) {
      capPush("motionStatics", motionStatics, MOTION_STATIC_CAP, { selector: describe(msel), kind: "bounce-name", value: an, panelExempt: false });
      continue;
    }
    var tfAll = (msStyle.transitionTimingFunction || "") + " " + (msStyle.animationTimingFunction || "");
    if (tfAll.indexOf("cubic-bezier") !== -1) {
      var bm;
      BEZIER_RE.lastIndex = 0;
      while ((bm = BEZIER_RE.exec(tfAll)) !== null) {
        var y1 = Number.parseFloat(bm[2]);
        var y2 = Number.parseFloat(bm[4]);
        if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) {
          capPush("motionStatics", motionStatics, MOTION_STATIC_CAP, { selector: describe(msel), kind: "overshoot-bezier", value: bm[0], panelExempt: false });
          break;
        }
      }
    }
    var tp = msStyle.transitionProperty || "";
    if (tp !== "all" && tp !== "none" && tp !== "") {
      var durs = (msStyle.transitionDuration || "").split(",");
      var props = tp.split(",");
      var layoutHits = [];
      for (var tpi = 0; tpi < props.length; tpi += 1) {
        var prop = props[tpi].trim().toLowerCase();
        if (!LAYOUT_PROP_RE.test(prop)) continue;
        var dur = Number.parseFloat((durs[tpi] || durs[0] || "0").trim()) || 0;
        if (dur > 0) layoutHits.push(prop);
      }
      if (layoutHits.length > 0) {
        capPush("motionStatics", motionStatics, MOTION_STATIC_CAP, {
          selector: describe(msel),
          kind: "layout-transition",
          value: layoutHits.join(", "),
          panelExempt: !!msel.closest(PANEL_EXEMPT_SEL),
        });
      }
    }
  }

`;
