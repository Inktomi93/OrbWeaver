// Proposed-fix fork of @orb/ui web-weave (geometry/spider/render), as a dependency-free
// web component <fixed-web-weave>. Fixes: sagged-boundary radius termination, aspect-ratio
// containment, spider itinerary/heading, per-segment glint alpha + unified sway.
//
// PROVENANCE (orbweaver): produced by the claude.ai/design motion review 2026-08-14
// ("Orbweaver UI" project, templates/motion-review/fixed-weave.js), fetched verbatim.
// REFERENCE ONLY — read-only evidence for docs/design/web-weave-motion-fixes.md; the real
// fixes land in packages/ui/src/art/web-weave/ pure modules with their own tests. Never
// import or vendor this file into product code.
(() => {
if (customElements.get('fixed-web-weave')) return;
const TAU = Math.PI * 2, HALF = 0.5, EPS = 1e-9;
const sinHash = (a, b, s = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + s) * 43758.545; return n - Math.floor(n); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutQuad = (p) => p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
const smooth01 = (p) => p * p * (3 - 2 * p);
function sagLine(a, b, sag, n) { const pts = [], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y }); } return pts; }
function pointAtFraction(pts, f) { const x = f * (pts.length - 1), i = Math.min(Math.max(Math.floor(x), 0), pts.length - 2), r = x - i, a = pts[i], b = pts[i + 1]; return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r }; }
const SC = 1.6, ms = (m) => Math.round(m * SC);
const T = { bridge: [ms(0), ms(900)], drop: [ms(900), ms(1250)], anchorDrop: [ms(1250), ms(1650)], frame: [ms(1650), ms(2400)], radii: [ms(2400), ms(4600)], aux: [ms(4600), ms(5600)], capture: [ms(5600), ms(7600)], settle: ms(7600), rest: ms(8020) };
const BRIDGE_WALK_START = ms(550), BRIDGE_CATCH_LEAD = ms(250);
const RADIUS_COUNT = 16, CAPTURE_TURNS = 9, AUX_TURNS = 4.4, FREE_ZONE_FRAC = 0.16, AUX_INNER_FRAC = 1.15, RIM_FRAC = 0.86, CAPTURE_STOP_FRAC = 1.35;
const SHAPE_ROUND = 0.62, SHAPE_FRAME = 0.38, SPIRAL_WOBBLE = 0.012, RADIUS_ANGLE_JITTER = 0.16;
const BRIDGE_SAG_FRAC = 0.045, FRAME_SAG_PX = 4, RADIUS_SAG_MAX_PX = 6, RADIUS_SAG_PER_PX = 0.012;
const W_BRIDGE = 1.15, W_FRAME = 1, W_RADIUS = 0.95, W_AUX = 0.55, W_CAPTURE = 0.8, W_DROP = 1.1;
const BRIDGE_SAMPLES = 48, DROP_SAMPLES = 16, FRAME_SAMPLES = 20, RADIUS_SAMPLES = 22, SPIRAL_STEP_RAD = 0.11, SPIRAL_MIN_STEPS = 24;
const DEW_STRIDE = 5, DEW_EDGE_SKIP = 6, DEW_INNER_SKIP = 4, DEW_CUTOFF = 0.72, DEW_R_BASE = 0.9, DEW_R_JITTER = 1.3, DEW_SPEED_BASE = 0.6, DEW_SPEED_JITTER = 0.9;
const RADIUS_LAY_FRAC = 0.68, RADIUS_TIP_INSET = 0.995, SPIRAL_PHASE = 0.3;
const DROP_TOP_SAG_PX = 2, DROP_BOTTOM_SAG_PX = 5, DROP_BOTTOM_EXTRA = 8;
const ANCHORS = { bridgeLeft: { x: -0.06, dy: -0.3 }, bridgeRight: { x: 1.06, dy: -0.33 }, right: { x: 1.08, dy: 0.3 }, bottom: { x: 0.58, dy: 0.72 }, left: { x: -0.08, dy: 0.34 } };
const CH_RADIUS_ANGLE = 3, CH_AUX_WOBBLE = 11, CH_CAPTURE_WOBBLE = 13, CH_DEW_PICK = 21, CH_DEW_R = 22, CH_DEW_PHASE = 23, CH_DEW_SPEED = 24;
// FIX 2: hard containment — radii + spirals never cross the host box minus this margin.
const EDGE_MARGIN = 7, SPIRAL_EDGE_FRAC = 0.94;
function raySegment(p, d, a, b) { const den = d.x * (b.y - a.y) - d.y * (b.x - a.x); if (Math.abs(den) < EPS) return null; const qx = a.x - p.x, qy = a.y - p.y; const t = (qx * (b.y - a.y) - qy * (b.x - a.x)) / den; const u = (qx * d.y - qy * d.x) / den; return t > 0 && u >= 0 && u <= 1 ? t : null; }
function buildWeb({ width, height, hub: hubFrac, seed }) {
  const hub = { x: hubFrac.x * width, y: hubFrac.y * height };
  const at = (a) => ({ x: a.x * width, y: hub.y + a.dy * height });
  const bl = at(ANCHORS.bridgeLeft), br = at(ANCHORS.bridgeRight);
  const strands = [];
  const bridgePts = sagLine(bl, br, BRIDGE_SAG_FRAC * height, BRIDGE_SAMPLES);
  strands.push({ kind: 'bridge', pts: bridgePts, t0: T.bridge[0], t1: T.bridge[1] - BRIDGE_CATCH_LEAD, width: W_BRIDGE });
  let bridgeMid = bridgePts[0], bridgeMidI = 0;
  bridgePts.forEach((p, i) => { if (Math.abs(p.x - hub.x) < Math.abs(bridgeMid.x - hub.x)) { bridgeMid = p; bridgeMidI = i; } });
  const dropTop = sagLine(bridgeMid, hub, DROP_TOP_SAG_PX, DROP_SAMPLES);
  const dropBottom = sagLine(hub, at(ANCHORS.bottom), DROP_BOTTOM_SAG_PX, DROP_SAMPLES + DROP_BOTTOM_EXTRA);
  strands.push({ kind: 'frame', pts: dropTop, t0: T.drop[0], t1: T.drop[1], width: W_DROP });
  strands.push({ kind: 'frame', pts: dropBottom, t0: T.anchorDrop[0], t1: T.anchorDrop[1], width: W_DROP });
  const edges = [[bl, at(ANCHORS.left)], [at(ANCHORS.left), at(ANCHORS.bottom)], [at(ANCHORS.bottom), at(ANCHORS.right)], [at(ANCHORS.right), br]];
  const frameSlice = (T.frame[1] - T.frame[0]) / edges.length;
  const framePolys = [bridgePts];
  edges.forEach(([a, b], i) => { const pts = sagLine(a, b, FRAME_SAG_PX, FRAME_SAMPLES); framePolys.push(pts); strands.push({ kind: 'frame', pts, t0: T.frame[0] + i * frameSlice, t1: T.frame[0] + (i + 1) * frameSlice, width: W_FRAME }); });
  // FIX 1 + 2: cast rays against the SAGGED silk polylines (so tips land on the drawn
  // strands, not the ideal polygon) AND against the inset host rect (containment).
  const m = EDGE_MARGIN;
  const rectSegs = [[{ x: m, y: m }, { x: width - m, y: m }], [{ x: width - m, y: m }, { x: width - m, y: height - m }], [{ x: width - m, y: height - m }, { x: m, y: height - m }], [{ x: m, y: height - m }, { x: m, y: m }]];
  const rayLen = (angle) => {
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    let best = Number.POSITIVE_INFINITY;
    for (const poly of framePolys) for (let i = 0; i < poly.length - 1; i++) { const t = raySegment(hub, d, poly[i], poly[i + 1]); if (t !== null && t < best) best = t; }
    for (const [a, b] of rectSegs) { const t = raySegment(hub, d, a, b); if (t !== null && t < best) best = t; }
    return Number.isFinite(best) ? best : Math.max(width, height);
  };
  const angles = [];
  for (let i = 0; i < RADIUS_COUNT; i++) angles.push(i / RADIUS_COUNT * TAU + (sinHash(i, CH_RADIUS_ANGLE, seed) - HALF) * RADIUS_ANGLE_JITTER);
  const layingOrder = [];
  for (let k = 0; k < RADIUS_COUNT / 2; k++) layingOrder.push(k, k + RADIUS_COUNT / 2);
  const radiusSlice = (T.radii[1] - T.radii[0]) / RADIUS_COUNT;
  const radii = [], radiusZips = [];
  layingOrder.forEach((angleIndex, orderIndex) => {
    const angle = angles[angleIndex];
    const len = rayLen(angle) * RADIUS_TIP_INSET;
    const end = { x: hub.x + Math.cos(angle) * len, y: hub.y + Math.sin(angle) * len };
    const t0 = T.radii[0] + orderIndex * radiusSlice;
    const strand = { kind: 'radius', pts: sagLine(hub, end, Math.min(RADIUS_SAG_MAX_PX, len * RADIUS_SAG_PER_PX), RADIUS_SAMPLES), t0, t1: t0 + radiusSlice * RADIUS_LAY_FRAC, width: W_RADIUS };
    strands.push(strand); radii.push(strand); radiusZips.push(t0 + radiusSlice);
  });
  const reach = angles.reduce((s, a) => s + rayLen(a), 0) / RADIUS_COUNT;
  const freeZoneRadius = reach * FREE_ZONE_FRAC;
  const shape = (angle) => SHAPE_ROUND + SHAPE_FRAME * (rayLen(angle) / reach);
  const spiral = ({ kind, t0, t1, thFrom, thTo, rFrom, rTo, strokeWidth }) => {
    const pts = [], vt = [];
    const steps = Math.max(SPIRAL_MIN_STEPS, Math.round(Math.abs(thTo - thFrom) / SPIRAL_STEP_RAD));
    const channel = kind === 'aux' ? CH_AUX_WOBBLE : CH_CAPTURE_WOBBLE;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps, th = thFrom + (thTo - thFrom) * s;
      let r = (rFrom + (rTo - rFrom) * s) * shape(th) * (1 + (sinHash(i, channel, seed) - HALF) * SPIRAL_WOBBLE);
      r = Math.min(r, rayLen(th) * SPIRAL_EDGE_FRAC); // FIX 2: per-angle clamp, never off-box
      pts.push({ x: hub.x + Math.cos(th) * r, y: hub.y + Math.sin(th) * r });
      vt.push(t0 + (t1 - t0) * s);
    }
    return { kind, pts, vt, t0, t1, width: strokeWidth };
  };
  const aux = spiral({ kind: 'aux', t0: T.aux[0], t1: T.aux[1], thFrom: SPIRAL_PHASE, thTo: SPIRAL_PHASE + AUX_TURNS * TAU, rFrom: freeZoneRadius * AUX_INNER_FRAC, rTo: reach * RIM_FRAC, strokeWidth: W_AUX });
  const capture = spiral({ kind: 'capture', t0: T.capture[0], t1: T.capture[1], thFrom: SPIRAL_PHASE + AUX_TURNS * TAU, thTo: SPIRAL_PHASE + AUX_TURNS * TAU - CAPTURE_TURNS * TAU, rFrom: reach * RIM_FRAC, rTo: freeZoneRadius * CAPTURE_STOP_FRAC, strokeWidth: W_CAPTURE });
  strands.push(aux, capture);
  const dew = [];
  for (let i = DEW_EDGE_SKIP; i < capture.pts.length - DEW_INNER_SKIP; i += DEW_STRIDE) {
    if (sinHash(i, CH_DEW_PICK, seed) > DEW_CUTOFF) { const p = capture.pts[i]; dew.push({ x: p.x, y: p.y, r: DEW_R_BASE + sinHash(i, CH_DEW_R, seed) * DEW_R_JITTER, phase: sinHash(i, CH_DEW_PHASE, seed) * TAU, speed: DEW_SPEED_BASE + sinHash(i, CH_DEW_SPEED, seed) * DEW_SPEED_JITTER }); }
  }
  // FIX 3a: contiguous itinerary — bridge walk hands off exactly at the drop beat.
  const itinerary = [];
  itinerary.push({ t0: BRIDGE_WALK_START, t1: T.drop[0], pts: bridgePts, from: 0, to: bridgeMidI / (bridgePts.length - 1) });
  itinerary.push({ t0: T.drop[0], t1: T.drop[1], pts: dropTop, from: 0, to: 1 });
  itinerary.push({ t0: T.anchorDrop[0], t1: T.anchorDrop[1], pts: dropBottom, from: 0, to: 1 });
  itinerary.push({ t0: T.frame[0], t1: T.frame[1], pts: dropBottom, from: 1, to: 0 });
  radii.forEach((strand, i) => { itinerary.push({ t0: strand.t0, t1: strand.t1, pts: strand.pts, from: 0, to: 1 }); itinerary.push({ t0: strand.t1, t1: radiusZips[i], pts: strand.pts, from: 1, to: 0 }); });
  itinerary.push({ t0: aux.t0, t1: aux.t1, pts: aux.pts, from: 0, to: 1, tip: 'aux' });
  itinerary.push({ t0: capture.t0, t1: capture.t1, pts: capture.pts, from: 0, to: 1, tip: 'capture' });
  itinerary.push({ t0: T.capture[1], t1: T.rest, pts: [capture.pts.at(-1), hub], from: 0, to: 1 });
  return { strands, radii, aux, capture, dew, itinerary, hub, reach };
}
// ---- spider ----
const SPIDER_SCALE = 1.15, LEG_BASE_ANGLES = [0.42, 0.85, 1.55, 2.05];
const GAIT_HZ = 0.012, GAIT_LEG_PHASE = 1.57, GAIT_SIDE_PHASE = 0.9, GAIT_MOVING_AMP = 0.2, GAIT_RESTING_AMP = 0.05;
const LEG_S1 = 6.2, LEG_S2 = 5.6, LEG_KNEE = 0.62, LEG_SHOULDER_X = 2, LEG_UW = 1.15, LEG_LW = 1;
const HEAD_X = 2.2, HEAD_R = 2.4, ABD_X = -3.2, ABD_RX = 4.4, ABD_RY = 3.4, ORB_MARK_R = 1.15;
const BREATHE_HZ = 12e-4, BREATHE_AMP = 0.04, REST_BOB_PX = 0.9, REST_BOB_HZ = 9e-4, HEAD_DOWN = Math.PI / 2;
const HEADING_MIN_MOVE_SQ = 0.05, HEADING_TURN_RATE = 0.22; // FIX 3c: smoothed heading
const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
function spiderLegPosition(web, leg, t) {
  const p = clamp01((t - leg.t0) / (leg.t1 - leg.t0));
  if (leg.tip !== undefined) { const strand = leg.tip === 'aux' ? web.aux : web.capture; return pointAtFraction(strand.pts, p); } // FIX 3d: continuous, not stepwise
  const f = leg.from + (leg.to - leg.from) * easeInOutQuad(p); // FIX 3b: no lurch
  return pointAtFraction(leg.pts, f);
}
function spiderPose(scene, tracker) {
  const { web, state, t, now, still } = scene;
  if (state === 'partial') return { x: web.hub.x, y: web.hub.y, angle: HEAD_DOWN, moving: false };
  if (state !== 'weaving' || t >= T.rest) { const bob = still ? 0 : Math.sin(now * REST_BOB_HZ) * REST_BOB_PX; return { x: web.hub.x, y: web.hub.y + bob, angle: HEAD_DOWN, moving: false }; }
  for (const leg of web.itinerary) {
    if (t >= leg.t0 && t <= leg.t1) {
      const pos = spiderLegPosition(web, leg, t);
      let angle = tracker.prev !== null ? tracker.prev.angle : HEAD_DOWN;
      if (tracker.prev !== null) {
        const dx = pos.x - tracker.prev.x, dy = pos.y - tracker.prev.y;
        if (dx * dx + dy * dy > HEADING_MIN_MOVE_SQ) angle += wrapAngle(Math.atan2(dy, dx) - angle) * HEADING_TURN_RATE;
      }
      tracker.prev = { x: pos.x, y: pos.y, angle };
      return { ...pos, angle, moving: true };
    }
  }
  if (tracker.prev !== null && t > BRIDGE_WALK_START) return { x: tracker.prev.x, y: tracker.prev.y, angle: tracker.prev.angle, moving: false }; // FIX 3e: never vanish mid-weave
  return null;
}
function drawSpiderBody(ctx, palette, pose, now) {
  ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle); ctx.scale(SPIDER_SCALE, SPIDER_SCALE); ctx.lineCap = 'round';
  for (const side of [-1, 1]) LEG_BASE_ANGLES.forEach((base, i) => {
    const wob = Math.sin(now * GAIT_HZ + i * GAIT_LEG_PHASE + (side > 0 ? 0 : GAIT_SIDE_PHASE)) * (pose.moving ? GAIT_MOVING_AMP : GAIT_RESTING_AMP);
    const hip = (base + wob) * side;
    const kx = LEG_SHOULDER_X + Math.cos(hip) * LEG_S1, ky = Math.sin(hip) * LEG_S1;
    const shin = hip + LEG_KNEE * side;
    ctx.strokeStyle = palette.spiderBody; ctx.lineWidth = LEG_UW; ctx.beginPath(); ctx.moveTo(LEG_SHOULDER_X, 0); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = palette.spiderBand; ctx.lineWidth = LEG_LW; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(shin) * LEG_S2, ky + Math.sin(shin) * LEG_S2); ctx.stroke();
  });
  const breathe = pose.moving ? 1 : 1 + Math.sin(now * BREATHE_HZ) * BREATHE_AMP;
  ctx.fillStyle = palette.spiderBody; ctx.beginPath(); ctx.arc(HEAD_X, 0, HEAD_R, 0, TAU); ctx.fill();
  ctx.save(); ctx.scale(breathe, breathe);
  ctx.beginPath(); ctx.ellipse(ABD_X, 0, ABD_RX, ABD_RY, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = palette.spiderBand; ctx.beginPath(); ctx.arc(ABD_X, 0, ORB_MARK_R, 0, TAU); ctx.fill();
  ctx.restore(); ctx.restore();
}
// ---- render ----
const SWAY_X_PX = 2.1, SWAY_Y_PX = 1.5, SWAY_X_HZ = 6e-4, SWAY_Y_HZ = 5e-4, SWAY_X_WL = 0.012, SWAY_Y_WL = 9e-3;
const FRESH_MS = 300, FRESH_BOOST = 0.5, ALPHA_BASE = 0.6, ALPHA_SET = 0.25, AUX_ALPHA = 0.38, AUX_CONSUMED = 0.92, CAPTURE_ALPHA = 0.8, CAPTURE_GLOW_BLUR = 3;
const BF_UNTIL_FRAC = 0.72, BF_ALPHA = 0.25, BF_AMP = 6, BF_HZ = 4e-3, BF_PHASE = 0.5;
const GLINT_PERIOD = 9e3, GLINT_HALF_RAD = 0.3, GLINT_ALPHA = 0.5, GLINT_W = 1.1, GLINT_GLOW_W = 2.86, GLINT_GLOW_A = 0.5, GLINT_MIN = 0.05;
const DEW_CONDENSE_MS = 900, DEW_TW_FLOOR = 0.35, DEW_TW_GAIN = 0.65, DEW_TW_HZ = 1e-3, DEW_ALPHA = 0.9, DEW_HALO_SCALE = 2.4, DEW_HALO_A = 0.25;
// FIX 4b: ONE sway field applied to strands, glint, dew AND spider — nothing floats off the silk.
const swayPt = (p, now) => now === null ? p : { x: p.x + Math.sin(now * SWAY_X_HZ + p.y * SWAY_X_WL) * SWAY_X_PX, y: p.y + Math.cos(now * SWAY_Y_HZ + p.x * SWAY_Y_WL) * SWAY_Y_PX };
function drawPolyline(ctx, pts, upTo, swayNow) {
  ctx.beginPath();
  const n = Math.min(upTo, pts.length - 1);
  for (let i = 0; i <= n; i++) { const p = swayPt(pts[i], swayNow); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
  ctx.stroke();
}
function spiralUpTo(strand, t) {
  const vt = strand.vt;
  if (t >= strand.t1) return strand.pts.length - 1;
  if (t <= strand.t0) return -1;
  return Math.floor((t - strand.t0) / (strand.t1 - strand.t0) * (vt.length - 1));
}
function strandFrame(strand, t, still, captureProgress) {
  if (strand.kind === 'aux') return { alpha: AUX_ALPHA * (1 - AUX_CONSUMED * captureProgress), upTo: spiralUpTo(strand, t), width: strand.width };
  if (strand.kind === 'capture') return { alpha: CAPTURE_ALPHA, upTo: spiralUpTo(strand, t), width: strand.width };
  const raw = t <= strand.t0 ? 0 : t >= strand.t1 ? 1 : 1 - (1 - (t - strand.t0) / (strand.t1 - strand.t0)) ** 3;
  if (raw === 0) return null;
  const fresh = still ? 0 : clamp01(1 - (t - strand.t1) / FRESH_MS);
  return { alpha: ALPHA_BASE + ALPHA_SET * (1 - fresh), upTo: Math.round(raw * (strand.pts.length - 1)), width: strand.width + fresh * FRESH_BOOST };
}
function drawStrands(ctx, input) {
  const { web, t, now, palette, dim, still } = input;
  const captureProgress = clamp01((t - T.capture[0]) / (T.capture[1] - T.capture[0]));
  const floatWindow = T.bridge[1] * BF_UNTIL_FRAC;
  for (const strand of web.strands) {
    const frame = strandFrame(strand, t, still, captureProgress);
    if (frame === null || frame.upTo < 1) continue;
    ctx.globalAlpha = frame.alpha * dim; ctx.strokeStyle = palette.silk; ctx.lineWidth = frame.width;
    if (strand.kind === 'capture') { ctx.shadowColor = palette.glow; ctx.shadowBlur = CAPTURE_GLOW_BLUR; }
    const sway = still ? null : strand.kind === 'bridge' && t < floatWindow ? null : now; // bridge joins the sway once settled
    drawPolyline(ctx, strand.pts, frame.upTo, sway);
    ctx.shadowBlur = 0;
    if (strand.kind === 'bridge' && !still && t < floatWindow) {
      const settleFrac = t / floatWindow;
      ctx.globalAlpha = BF_ALPHA * dim; ctx.beginPath();
      for (let i = 0; i <= frame.upTo; i++) { const p = strand.pts[i]; const w = Math.sin(now * BF_HZ + i * BF_PHASE) * BF_AMP * (1 - settleFrac); if (i === 0) ctx.moveTo(p.x, p.y + w); else ctx.lineTo(p.x, p.y + w); }
      ctx.stroke();
    }
  }
}
// FIX 4a: per-segment alpha at stroke time (shipped code batches a whole run into one path
// while mutating globalAlpha mid-build — only the last value applies → popping).
function drawGlint(ctx, input) {
  const { web, now, palette, dim } = input;
  const sweep = now / GLINT_PERIOD % 1 * TAU;
  ctx.lineCap = 'round';
  for (const strand of [web.capture, ...web.radii]) {
    const pts = strand.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = swayPt(pts[i], now), b = swayPt(pts[i + 1], now);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      let d = Math.abs((((Math.atan2(my - web.hub.y, mx - web.hub.x) - sweep) % TAU) + TAU) % TAU);
      if (d > Math.PI) d = TAU - d;
      if (d >= GLINT_HALF_RAD) continue;
      const lit = smooth01(1 - d / GLINT_HALF_RAD);
      if (lit < GLINT_MIN) continue;
      ctx.strokeStyle = palette.glow; ctx.lineWidth = GLINT_GLOW_W; ctx.globalAlpha = GLINT_ALPHA * GLINT_GLOW_A * lit * dim;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = palette.silkBright; ctx.lineWidth = GLINT_W; ctx.globalAlpha = GLINT_ALPHA * lit * dim;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
}
function drawDew(ctx, input) {
  const { web, state, t, now, palette, dim, still } = input;
  const born = state === 'weaving' ? clamp01((t - T.settle) / DEW_CONDENSE_MS) : 1;
  for (const drop of web.dew) {
    const p = swayPt(drop, still ? null : now); // FIX 4b: dew rides the swaying silk
    const twinkle = still ? 0.8 : DEW_TW_FLOOR + DEW_TW_GAIN * Math.sin(now * DEW_TW_HZ * drop.speed + drop.phase) ** 2;
    ctx.fillStyle = palette.dew;
    ctx.globalAlpha = born * twinkle * DEW_ALPHA * dim; ctx.beginPath(); ctx.arc(p.x, p.y, drop.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = born * twinkle * DEW_HALO_A * dim; ctx.beginPath(); ctx.arc(p.x, p.y, drop.r * DEW_HALO_SCALE, 0, TAU); ctx.fill();
  }
}
function renderFrame(ctx, input, tracker) {
  const settled = input.t >= T.settle;
  ctx.lineCap = 'round'; ctx.globalAlpha = 1;
  drawStrands(ctx, input);
  if (settled && !input.still) drawGlint(ctx, input);
  if (settled) drawDew(ctx, input);
  if (input.spider) {
    const pose = spiderPose(input, tracker);
    if (pose !== null) {
      const p = input.still ? pose : { ...pose, ...swayPt(pose, input.now) }; // FIX 4b: spider rides the sway too
      ctx.globalAlpha = input.dim;
      drawSpiderBody(ctx, input.palette, p, input.now);
    }
  }
  ctx.globalAlpha = 1;
}
// ---- component ----
const PALETTE_EXPR = {
  silk: 'color-mix(in oklab, var(--color-foreground) 62%, transparent)',
  silkBright: 'color-mix(in oklab, var(--color-primary) 55%, var(--color-foreground))',
  glow: 'var(--color-primary)',
  dew: 'color-mix(in oklab, var(--color-sky-star) 70%, var(--color-primary))',
  spiderBody: 'color-mix(in oklab, var(--color-foreground) 55%, var(--color-primary))',
  spiderBand: 'var(--color-primary)'
};
const PARTIAL_T = T.radii[1] + 1, MAX_DPR = 2;
class FixedWebWeave extends HTMLElement {
  static get observedAttributes() { return ['state', 'seed', 'hub', 'dim', 'spider', 'run']; }
  connectedCallback() {
    if (!this._canvas) {
      this.style.cssText = 'position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none';
      this.setAttribute('aria-hidden', 'true');
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      this.appendChild(c); this._canvas = c;
      this._probe = document.createElement('span'); this._probe.style.display = 'none'; this.appendChild(this._probe);
    }
    this._restart();
    this._ro = new ResizeObserver(() => this._rebuild());
    this._ro.observe(this);
  }
  disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro?.disconnect(); }
  attributeChangedCallback() { if (this.isConnected && this._canvas) this._restart(); }
  _attr(n) { const v = this.getAttribute(n); return v !== null && v !== '' ? v : this[n] != null ? String(this[n]) : null; }
  _cfg() {
    const hub = (this._attr('hub') || '0.5,0.42').split(',').map(Number);
    const sp = this._attr('spider');
    return {
      state: this._attr('state') || 'settled',
      seed: Number(this._attr('seed')) || 7,
      hub: { x: hub[0], y: hub[1] },
      dim: this._attr('dim') !== null ? Number(this._attr('dim')) : 1,
      spider: !(sp === 'false' || sp === 'off' || sp === '0')
    };
  }
  _rebuild() {
    const w = this.clientWidth, h = this.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    this._canvas.width = Math.max(1, Math.round(w * dpr)); this._canvas.height = Math.max(1, Math.round(h * dpr));
    this._dpr = dpr; this._w = w; this._h = h;
    this._web = buildWeb({ width: w, height: h, hub: this._cfgv.hub, seed: this._cfgv.seed });
  }
  _restart() {
    cancelAnimationFrame(this._raf);
    this._cfgv = this._cfg();
    const resolve = (expr) => { this._probe.style.color = expr; return getComputedStyle(this._probe).color; };
    this._palette = Object.fromEntries(Object.entries(PALETTE_EXPR).map(([k, e]) => [k, resolve(e)]));
    this._tracker = { prev: null };
    this._clock0 = performance.now();
    this._still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this._rebuild();
    const loop = (now) => {
      if (this._web) {
        const c = this._cfgv;
        const t = this._still ? (c.state === 'partial' ? PARTIAL_T : T.rest + DEW_CONDENSE_MS)
          : c.state === 'weaving' ? now - this._clock0
          : c.state === 'partial' ? PARTIAL_T
          : T.rest + (now - this._clock0);
        const ctx = this._canvas.getContext('2d');
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.clearRect(0, 0, this._w, this._h);
        renderFrame(ctx, { web: this._web, state: c.state, t, now, palette: this._palette, dim: c.dim, still: this._still, spider: c.spider }, this._tracker);
      }
      if (!this._still) this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}
customElements.define('fixed-web-weave', FixedWebWeave);
})();
