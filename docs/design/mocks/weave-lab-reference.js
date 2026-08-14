// Weave Lab engine — proposed motion upgrades over the fixed web-weave fork.
// <weave-lab> web component. Adds: silk spring physics (pluck + ripple + wind),
// prey-response spider AI (alert → sprint → inspect → return), full-character gait
// (burst locomotion, idle twitches, inspect taps), strand-out ride, tempo scaling,
// weave-settled event, FPS meter. All timeline/geometry constants match the fixed fork.
//
// PROVENANCE (orbweaver): claude.ai/design motion review, second handoff 2026-08-14
// ("Orbweaver UI" project, templates/weave-lab/weave-lab.js), fetched verbatim.
// REFERENCE ONLY for docs/design/weave-lab-upgrades.md — never import into product code.
// NOTE the §amendment it carries: rayInfo splits frame-hit vs rect-hit; rect-bounded
// radii OVERSHOOT (+14) past the edge instead of terminating inside the box.
(() => {
if (customElements.get('weave-lab')) return;
const TAU = Math.PI * 2, HALF = 0.5, EPS = 1e-9;
const sinHash = (a, b, s = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + s) * 43758.545; return n - Math.floor(n); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutQuad = (p) => p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
const easeOutCubic = (p) => 1 - (1 - p) ** 3;
const smooth01 = (p) => p * p * (3 - 2 * p);
const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
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
const EDGE_MARGIN = 7, SPIRAL_EDGE_FRAC = 0.94;
const STRAND_OUT_MS = 1800, STRAND_OUT_DELAY = 250, SO_OVERSHOOT = 80, SO_RISE = 0.26, SO_MIN_Y = 40, SO_SAG = 16, SO_SAMPLES = 30;
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
  const leftA = at(ANCHORS.left), bottomA = at(ANCHORS.bottom), rightA = at(ANCHORS.right);
  const F0 = T.frame[0], FW = T.frame[1] - T.frame[0];
  const fAt = (a, b) => [F0 + FW * a, F0 + FW * b];
  // she lays the frame herself — bottom→left→bl corner, walks back, bottom→right→br, rides the bridge home
  const edgeDefs = [[bottomA, leftA, 0, 0.18], [leftA, bl, 0.18, 0.36], [bottomA, rightA, 0.48, 0.66], [rightA, br, 0.66, 0.84]];
  const framePolys = [bridgePts];
  const edgePts = edgeDefs.map(([a, b, s0, s1]) => { const pts = sagLine(a, b, FRAME_SAG_PX, FRAME_SAMPLES); framePolys.push(pts); const [t0, t1] = fAt(s0, s1); strands.push({ kind: 'frame', pts, t0, t1, width: W_FRAME }); return pts; });
  const m = EDGE_MARGIN;
  const rectSegs = [[{ x: m, y: m }, { x: width - m, y: m }], [{ x: width - m, y: m }, { x: width - m, y: height - m }], [{ x: width - m, y: height - m }, { x: m, y: height - m }], [{ x: m, y: height - m }, { x: m, y: m }]];
  const rayInfo = (angle) => {
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    let f = Number.POSITIVE_INFINITY, r = Number.POSITIVE_INFINITY;
    for (const poly of framePolys) for (let i = 0; i < poly.length - 1; i++) { const t = raySegment(hub, d, poly[i], poly[i + 1]); if (t !== null && t < f) f = t; }
    for (const [a, b] of rectSegs) { const t = raySegment(hub, d, a, b); if (t !== null && t < r) r = t; }
    if (!Number.isFinite(f)) f = Math.max(width, height);
    if (!Number.isFinite(r)) r = Math.max(width, height);
    return { len: Math.min(f, r), frame: f, rect: r };
  };
  const rayLen = (angle) => rayInfo(angle).len;
  const angles = [];
  for (let i = 0; i < RADIUS_COUNT; i++) angles.push(i / RADIUS_COUNT * TAU + (sinHash(i, CH_RADIUS_ANGLE, seed) - HALF) * RADIUS_ANGLE_JITTER);
  const layingOrder = [];
  for (let k = 0; k < RADIUS_COUNT / 2; k++) layingOrder.push(k, k + RADIUS_COUNT / 2);
  const radiusSlice = (T.radii[1] - T.radii[0]) / RADIUS_COUNT;
  const radii = [], radiusZips = [];
  layingOrder.forEach((angleIndex, orderIndex) => {
    const angle = angles[angleIndex];
    const info = rayInfo(angle);
    // terminate on sagged silk; when the BOX bounds the ray, overshoot past the edge so the crop reads as an offscreen anchor — never a floating tip
    const len = info.rect < info.frame ? info.rect + 14 : info.len * RADIUS_TIP_INSET;
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
      r = Math.min(r, rayLen(th) * SPIRAL_EDGE_FRAC);
      pts.push({ x: hub.x + Math.cos(th) * r, y: hub.y + Math.sin(th) * r });
      vt.push(t0 + (t1 - t0) * s);
    }
    return { kind, pts, vt, t0, t1, width: strokeWidth };
  };
  const aux = spiral({ kind: 'aux', t0: T.aux[0], t1: T.aux[1], thFrom: SPIRAL_PHASE, thTo: SPIRAL_PHASE + AUX_TURNS * TAU, rFrom: freeZoneRadius * AUX_INNER_FRAC, rTo: reach * RIM_FRAC, strokeWidth: W_AUX });
  const capture = spiral({ kind: 'capture', t0: T.capture[0], t1: T.capture[1], thFrom: SPIRAL_PHASE + AUX_TURNS * TAU, thTo: SPIRAL_PHASE + AUX_TURNS * TAU - CAPTURE_TURNS * TAU, rFrom: reach * RIM_FRAC, rTo: freeZoneRadius * CAPTURE_STOP_FRAC, strokeWidth: W_CAPTURE });
  strands.push(aux, capture);
  for (const s of strands) { let L = 0; for (let i = 0; i < s.pts.length - 1; i++) { const dx = s.pts[i + 1].x - s.pts[i].x, dy = s.pts[i + 1].y - s.pts[i].y; L += Math.hypot(dx, dy); } s.len = L; }
  const dew = [];
  for (let i = DEW_EDGE_SKIP; i < capture.pts.length - DEW_INNER_SKIP; i += DEW_STRIDE) {
    if (sinHash(i, CH_DEW_PICK, seed) > DEW_CUTOFF) { const p = capture.pts[i]; dew.push({ x: p.x, y: p.y, r: DEW_R_BASE + sinHash(i, CH_DEW_R, seed) * DEW_R_JITTER, phase: sinHash(i, CH_DEW_PHASE, seed) * TAU, speed: DEW_SPEED_BASE + sinHash(i, CH_DEW_SPEED, seed) * DEW_SPEED_JITTER }); }
  }
  const itinerary = [];
  itinerary.push({ t0: BRIDGE_WALK_START, t1: T.drop[0], pts: bridgePts, from: 0, to: bridgeMidI / (bridgePts.length - 1) });
  itinerary.push({ t0: T.drop[0], t1: T.drop[1], pts: dropTop, from: 0, to: 1 });
  itinerary.push({ t0: T.anchorDrop[0], t1: T.anchorDrop[1], pts: dropBottom, from: 0, to: 1 });
  const fLeg = (s0, s1, pts, from, to) => { const [t0, t1] = fAt(s0, s1); itinerary.push({ t0, t1, pts, from, to }); };
  fLeg(0, 0.18, edgePts[0], 0, 1); fLeg(0.18, 0.36, edgePts[1], 0, 1);
  fLeg(0.36, 0.42, edgePts[1], 1, 0); fLeg(0.42, 0.48, edgePts[0], 1, 0);
  fLeg(0.48, 0.66, edgePts[2], 0, 1); fLeg(0.66, 0.84, edgePts[3], 0, 1);
  fLeg(0.84, 0.93, bridgePts, 1, bridgeMidI / (bridgePts.length - 1));
  fLeg(0.93, 1, dropTop, 0, 1);
  radii.forEach((strand, i) => { itinerary.push({ t0: strand.t0, t1: strand.t1, pts: strand.pts, from: 0, to: 1 }); itinerary.push({ t0: strand.t1, t1: radiusZips[i], pts: strand.pts, from: 1, to: 0 }); });
  itinerary.push({ t0: aux.t0, t1: aux.t1, pts: aux.pts, from: 0, to: 1, tip: 'aux' });
  itinerary.push({ t0: capture.t0, t1: capture.t1, pts: capture.pts, from: 0, to: 1, tip: 'capture' });
  itinerary.push({ t0: T.capture[1], t1: T.rest, pts: [capture.pts.at(-1), hub], from: 0, to: 1 });
  return { strands, radii, aux, capture, dew, itinerary, hub, reach };
}
function buildStrandOut(web, width, height) {
  const end = { x: width + SO_OVERSHOOT, y: Math.max(web.hub.y - SO_RISE * height, SO_MIN_Y) };
  return sagLine(web.hub, end, SO_SAG, SO_SAMPLES);
}
// ---- spider ----
const SPIDER_SCALE = 1.15, LEG_BASE_ANGLES = [0.38, 0.8, 1.9, 2.35]; // orb-weaver grouping: I/II forward, III/IV back, gap at the flank
const LEG_LEN = [1.12, 0.95, 0.85, 1.05]; // legs I and IV longest, III shortest (araneid proportions)
const LEG_S1 = 5.6, LEG_S2 = 4.6, LEG_S3 = 2.6, LEG_KNEE = 0.62, LEG_TARSUS_BEND = 0.5, LEG_SHOULDER_X = 2, LEG_UW = 1.25, LEG_LW = 0.95, LEG_TW = 0.7;
const HEAD_X = 2.2, HEAD_R = 2.4, ABD_X = -3.2, ABD_RX = 4.4, ABD_RY = 3.4, ORB_MARK_R = 1.15;
const BREATHE_HZ = 12e-4, BREATHE_AMP = 0.04, REST_BOB_PX = 0.9, REST_BOB_HZ = 9e-4, HEAD_DOWN = Math.PI / 2;
const HEADING_MIN_MOVE_SQ = 0.05;
const CHARACTER = {
  calm:   { burst: 0,    gaitHz: 0.012, gaitAmp: 0.2,  turnRate: 0.18, twitch: false, sprint: 0.16, inspectMs: 500 },
  lively: { burst: 0.35, gaitHz: 0.016, gaitAmp: 0.26, turnRate: 0.24, twitch: true,  sprint: 0.24, inspectMs: 750 },
  full:   { burst: 0.55, gaitHz: 0.02,  gaitAmp: 0.3,  turnRate: 0.3,  twitch: true,  sprint: 0.3,  inspectMs: 950 }
};
// burst locomotion: forward-only speed pulses (derivative stays positive)
const burstEase = (p, a) => p - a * Math.sin(TAU * 2 * p) / (TAU * 2);
function spiderLegPosition(web, leg, t, ch) {
  const p = clamp01((t - leg.t0) / (leg.t1 - leg.t0));
  if (leg.tip !== undefined) { const strand = leg.tip === 'aux' ? web.aux : web.capture; return pointAtFraction(strand.pts, p); }
  const f = leg.from + (leg.to - leg.from) * burstEase(easeInOutQuad(p), ch.burst);
  return pointAtFraction(leg.pts, f);
}
function weavingPose(scene, tracker, ch) {
  const { web, t } = scene;
  for (const leg of web.itinerary) {
    if (t >= leg.t0 && t <= leg.t1) {
      const pos = spiderLegPosition(web, leg, t, ch);
      let angle = tracker.prev !== null ? tracker.prev.angle : HEAD_DOWN;
      if (tracker.prev !== null) {
        const dx = pos.x - tracker.prev.x, dy = pos.y - tracker.prev.y;
        if (dx * dx + dy * dy > HEADING_MIN_MOVE_SQ) angle += wrapAngle(Math.atan2(dy, dx) - angle) * ch.turnRate;
      }
      tracker.prev = { x: pos.x, y: pos.y, angle };
      return { ...pos, angle, moving: true, tap: 0 };
    }
  }
  if (tracker.prev !== null && t > BRIDGE_WALK_START) return { x: tracker.prev.x, y: tracker.prev.y, angle: tracker.prev.angle, moving: false, tap: 0 };
  return null;
}
function drawSpiderBody(ctx, palette, pose, now, mood) {
  ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle); ctx.scale(SPIDER_SCALE, SPIDER_SCALE); ctx.lineCap = 'round';
  const amp = pose.moving ? mood.gaitAmp : mood.rest;
  for (const side of [-1, 1]) LEG_BASE_ANGLES.forEach((base, i) => {
    const tetra = ((i % 2) + (side > 0 ? 0 : 1)) % 2 * Math.PI; // alternating-tetrapod gait: L1/R2/L3/R4 vs the rest
    let wob = Math.sin(now * mood.gaitHz + tetra + i * 0.3) * amp;
    if (pose.tap > 0 && i < 2) wob += Math.sin(now * 0.03 + side * 2) * 0.28 * pose.tap; // front-leg tapping while inspecting
    if (mood.twitchPhase > 0 && i === 1 && side === 1) wob += Math.sin(mood.twitchPhase * Math.PI) * 0.5; // idle leg lift
    const ls = LEG_LEN[i];
    const hip = (base + wob) * side;
    const kx = LEG_SHOULDER_X + Math.cos(hip) * LEG_S1 * ls, ky = Math.sin(hip) * LEG_S1 * ls;
    const shin = hip + LEG_KNEE * side;
    const fx = kx + Math.cos(shin) * LEG_S2 * ls, fy = ky + Math.sin(shin) * LEG_S2 * ls;
    const tar = shin + LEG_TARSUS_BEND * side;
    ctx.strokeStyle = palette.spiderBody; ctx.lineWidth = LEG_UW; ctx.beginPath(); ctx.moveTo(LEG_SHOULDER_X, 0); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = palette.spiderBand; ctx.lineWidth = LEG_LW; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.lineWidth = LEG_TW; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(tar) * LEG_S3 * ls, fy + Math.sin(tar) * LEG_S3 * ls); ctx.stroke();
  });
  let breathe = pose.moving ? 1 : 1 + Math.sin(now * BREATHE_HZ) * BREATHE_AMP;
  if (mood.twitchPhase > 0) breathe += Math.sin(mood.twitchPhase * Math.PI * 3) * 0.05; // abdomen shiver
  ctx.fillStyle = palette.spiderBody; ctx.beginPath(); ctx.arc(HEAD_X, 0, HEAD_R, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-0.4, 0, 1.3, 0, TAU); ctx.fill(); // pedicel joining cephalothorax to abdomen
  ctx.save(); ctx.scale(breathe, breathe);
  ctx.beginPath(); ctx.ellipse(ABD_X, 0, ABD_RX, ABD_RY, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ABD_X - 2.6, 0, 2.2, 2.5, 0, 0, TAU); ctx.fill(); // teardrop tail
  ctx.fillStyle = palette.spiderBand; ctx.beginPath(); ctx.arc(ABD_X, 0, ORB_MARK_R, 0, TAU); ctx.fill();
  ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(ABD_X - 1.4, 1.6, 0.55, 0, TAU); ctx.arc(ABD_X - 1.4, -1.6, 0.55, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.55; // flank speckles
  ctx.restore(); ctx.restore();
}
// ---- render ----
const SWAY_X_PX = 2.1, SWAY_Y_PX = 1.5, SWAY_X_HZ = 6e-4, SWAY_Y_HZ = 5e-4, SWAY_X_WL = 0.012, SWAY_Y_WL = 9e-3;
const FRESH_MS = 300, FRESH_BOOST = 0.5, ALPHA_BASE = 0.6, ALPHA_SET = 0.25, AUX_ALPHA = 0.38, AUX_CONSUMED = 0.92, CAPTURE_ALPHA = 0.8, CAPTURE_GLOW_BLUR = 3;
const BF_UNTIL_FRAC = 0.72, BF_ALPHA = 0.25, BF_AMP = 6, BF_HZ = 4e-3, BF_PHASE = 0.5;
const GLINT_PERIOD = 9e3, GLINT_HALF_RAD = 0.3, GLINT_ALPHA = 0.5, GLINT_W = 1.1, GLINT_GLOW_W = 2.86, GLINT_GLOW_A = 0.5, GLINT_MIN = 0.05;
const DEW_CONDENSE_MS = 900, DEW_TW_FLOOR = 0.35, DEW_TW_GAIN = 0.65, DEW_TW_HZ = 1e-3, DEW_ALPHA = 0.9, DEW_HALO_SCALE = 2.4, DEW_HALO_A = 0.25;
const SO_ALPHA = 0.9, SO_WIDTH = 1.5, SO_BLUR = 7;
// pluck wave: transverse damped traveling wave along the strand
const PLUCK_LIFE = 1500, PLUCK_DECAY = 380, PLUCK_SPREAD = 42, PLUCK_HZ = 0.05, PLUCK_K = 0.16;
function pluckOffset(strand, si, plucks, now) {
  let d = 0;
  for (const q of plucks) {
    const age = now - q.t0;
    if (age < 0 || age > PLUCK_LIFE) continue;
    const dist = Math.abs(si - q.s0) * strand.len;
    d += q.amp * Math.exp(-age / PLUCK_DECAY) * Math.exp(-dist / PLUCK_SPREAD) * Math.sin(age * PLUCK_HZ - dist * PLUCK_K);
  }
  return d;
}
function spiralUpTo(strand, t) {
  if (t >= strand.t1) return strand.pts.length - 1;
  if (t <= strand.t0) return -1;
  return Math.floor((t - strand.t0) / (strand.t1 - strand.t0) * (strand.vt.length - 1));
}
function strandFrame(strand, t, still, captureProgress) {
  if (strand.kind === 'aux') return { alpha: AUX_ALPHA * (1 - AUX_CONSUMED * captureProgress), upTo: spiralUpTo(strand, t), width: strand.width };
  if (strand.kind === 'capture') return { alpha: CAPTURE_ALPHA, upTo: spiralUpTo(strand, t), width: strand.width };
  const raw = t <= strand.t0 ? 0 : t >= strand.t1 ? 1 : easeOutCubic((t - strand.t0) / (strand.t1 - strand.t0));
  if (raw === 0) return null;
  const fresh = still ? 0 : clamp01(1 - (t - strand.t1) / FRESH_MS);
  return { alpha: ALPHA_BASE + ALPHA_SET * (1 - fresh), upTo: Math.round(raw * (strand.pts.length - 1)), width: strand.width + fresh * FRESH_BOOST };
}
class WeaveLab extends HTMLElement {
  static get observedAttributes() { return ['state', 'seed', 'hub', 'dim', 'spider', 'run', 'tempo', 'wind', 'character', 'fps', 'interactive']; }
  connectedCallback() {
    if (!this._canvas) {
      this.style.cssText = 'position:absolute;inset:0;display:block;overflow:hidden';
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      this.appendChild(c); this._canvas = c;
      this._probe = document.createElement('span'); this._probe.style.display = 'none'; this.appendChild(this._probe);
      this._fpsEl = document.createElement('div');
      this._fpsEl.style.cssText = 'position:absolute;top:8px;right:10px;font:10px/1 monospace;opacity:.55;letter-spacing:.08em;pointer-events:none;display:none';
      this.appendChild(this._fpsEl);
      this.addEventListener('pointermove', (e) => this._pointer(e, 4.5));
      this.addEventListener('pointerdown', (e) => this._pointer(e, 10));
      this.addEventListener('pointerleave', () => { this._lastHit = null; });
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
    const off = (v) => v === 'false' || v === 'off' || v === '0';
    return {
      state: this._attr('state') || 'settled',
      seed: Number(this._attr('seed')) || 7,
      hub: { x: hub[0], y: hub[1] },
      dim: this._attr('dim') !== null ? Number(this._attr('dim')) : 1,
      spider: !off(this._attr('spider')),
      tempo: Number(this._attr('tempo')) || 1,
      wind: clamp01(Number(this._attr('wind')) || 0),
      ch: CHARACTER[this._attr('character')] || CHARACTER.full,
      fps: this._attr('fps') === 'on',
      interactive: this._attr('interactive') === 'on'
    };
  }
  _rebuild() {
    const w = this.clientWidth, h = this.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this._canvas.width = Math.max(1, Math.round(w * dpr)); this._canvas.height = Math.max(1, Math.round(h * dpr));
    this._dpr = dpr; this._w = w; this._h = h;
    this._web = buildWeb({ width: w, height: h, hub: this._cfgv.hub, seed: this._cfgv.seed });
    this._strandOut = this._cfgv.state === 'strand-out' ? { pts: buildStrandOut(this._web, w, h), t0: performance.now() + STRAND_OUT_DELAY } : null;
  }
  _restart() {
    cancelAnimationFrame(this._raf);
    this._cfgv = this._cfg();
    this.style.pointerEvents = this._cfgv.interactive ? 'auto' : 'none';
    this.setAttribute('aria-hidden', this._cfgv.interactive ? 'false' : 'true');
    const resolve = (expr) => { this._probe.style.color = expr; return getComputedStyle(this._probe).color; };
    this._palette = {
      silk: resolve('color-mix(in oklab, var(--color-foreground) 62%, transparent)'),
      silkBright: resolve('color-mix(in oklab, var(--color-primary) 55%, var(--color-foreground))'),
      glow: resolve('var(--color-primary)'),
      dew: resolve('color-mix(in oklab, var(--color-sky-star) 70%, var(--color-primary))'),
      spiderBody: resolve('color-mix(in oklab, var(--color-foreground) 55%, var(--color-primary))'),
      spiderBand: resolve('var(--color-primary)')
    };
    this._tracker = { prev: null };
    this._plucks = new Map(); this._shiver = 0; this._lastHit = null;
    this._ai = { mode: 'rest', x: 0, y: 0, angle: HEAD_DOWN, until: 0, target: null, init: false };
    this._settledFired = false;
    this._clock0 = performance.now(); this._lastNow = this._clock0;
    this._fpsAvg = 60; this._fpsAt = 0;
    this._still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this._fpsEl.style.display = this._cfgv.fps && !this._still ? 'block' : 'none';
    this._fpsEl.style.color = this._palette.silkBright;
    this._rebuild();
    const loop = (now) => { this._frame(now); if (!this._still) this._raf = requestAnimationFrame(loop); };
    this._raf = requestAnimationFrame(loop);
  }
  _timelineT(now) {
    const c = this._cfgv;
    if (this._still) return c.state === 'partial' ? T.radii[1] + 1 : T.rest + DEW_CONDENSE_MS;
    if (c.state === 'weaving') return (now - this._clock0) * c.tempo;
    if (c.state === 'partial') return T.radii[1] + 1;
    return T.rest + (now - this._clock0);
  }
  _sway(p, now, extra) {
    if (now === null) return p;
    const c = this._cfgv;
    const gust = 1 + (Math.sin(now * 3e-4) * 0.5 + Math.sin(now * 7.3e-4 + p.x * 0.002) * 0.5) * c.wind;
    const k = (1 + c.wind * 2.6 + this._shiver * 2.2) * gust + (extra || 0);
    return { x: p.x + Math.sin(now * SWAY_X_HZ + p.y * SWAY_X_WL) * SWAY_X_PX * k, y: p.y + Math.cos(now * SWAY_Y_HZ + p.x * SWAY_Y_WL) * SWAY_Y_PX * k };
  }
  _strandPt(strand, i, now) {
    const p = this._sway(strand.pts[i], now);
    const plucks = this._plucks.get(strand);
    if (!plucks || plucks.length === 0) return p;
    const si = i / (strand.pts.length - 1);
    const off = pluckOffset(strand, si, plucks, now === null ? performance.now() : now);
    if (off === 0) return p;
    const a = strand.pts[Math.max(0, i - 1)], b = strand.pts[Math.min(strand.pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return { x: p.x + (-dy / L) * off, y: p.y + (dx / L) * off };
  }
  _pointer(e, amp) {
    const c = this._cfgv;
    if (!c.interactive || this._still || !this._web) return;
    const t = this._timelineT(performance.now());
    if (c.state === 'weaving' && t < T.settle) return; // she's busy building
    const r = this.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (this._lastHit && Math.hypot(px - this._lastHit.x, py - this._lastHit.y) < 18 && amp < 6) return;
    const now = performance.now();
    for (const strand of this._web.strands) {
      if (strand.kind === 'bridge') continue;
      const pts = strand.pts;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i].x - px, dy = pts[i].y - py;
        if (dx * dx + dy * dy < 110) {
          let list = this._plucks.get(strand);
          if (!list) { list = []; this._plucks.set(strand, list); }
          list.push({ s0: i / (pts.length - 1), t0: now, amp });
          if (list.length > 6) list.shift();
          this._shiver = Math.min(1, this._shiver + 0.5);
          this._lastHit = { x: px, y: py };
          this._disturb(pts[i], now);
          return;
        }
      }
    }
  }
  _disturb(p, now) {
    const ai = this._ai, c = this._cfgv;
    if (!c.spider || c.state === 'weaving' || c.state === 'strand-out') return;
    if (Math.hypot(p.x - this._web.hub.x, p.y - this._web.hub.y) < 24) return; // don't chase her own doorstep
    ai.target = { x: p.x, y: p.y };
    if (ai.mode === 'rest' || ai.mode === 'inspect' || ai.mode === 'return') { ai.mode = 'alert'; ai.until = now + 170; } // freeze first — real spiders read the vibration
  }
  _aiPose(now, dt, ch) {
    const ai = this._ai, hub = this._web.hub;
    if (!ai.init) { ai.x = hub.x; ai.y = hub.y; ai.init = true; }
    const face = (tx, ty, rate) => { const target = Math.atan2(ty - ai.y, tx - ai.x); ai.angle += wrapAngle(target - ai.angle) * rate; };
    const step = (tx, ty, speed) => {
      const d = Math.hypot(tx - ai.x, ty - ai.y);
      if (d < 5) return true;
      const burst = 0.55 + 0.85 * Math.abs(Math.sin(now * 0.012)); // scurry in bursts
      const v = Math.min(d, speed * burst * dt);
      ai.x += (tx - ai.x) / d * v; ai.y += (ty - ai.y) / d * v;
      face(tx, ty, 0.35);
      return false;
    };
    if (ai.mode === 'alert') { face(ai.target.x, ai.target.y, 0.3); if (now >= ai.until) ai.mode = 'sprint'; return { x: ai.x, y: ai.y, angle: ai.angle, moving: false, tap: 0 }; }
    if (ai.mode === 'sprint') { if (step(ai.target.x, ai.target.y, ch.sprint)) { ai.mode = 'inspect'; ai.until = now + ch.inspectMs; } return { x: ai.x, y: ai.y, angle: ai.angle, moving: ai.mode === 'sprint', tap: 0 }; }
    if (ai.mode === 'inspect') { if (now >= ai.until) ai.mode = 'return'; return { x: ai.x, y: ai.y, angle: ai.angle, moving: false, tap: 1 }; }
    if (ai.mode === 'return') { if (step(hub.x, hub.y, ch.sprint * 0.45)) { ai.mode = 'rest'; ai.angle = HEAD_DOWN; } return { x: ai.x, y: ai.y, angle: ai.angle, moving: ai.mode === 'return', tap: 0 }; }
    // rest: sit at hub, breathe, bob
    ai.x = hub.x; ai.y = hub.y;
    ai.angle += wrapAngle(HEAD_DOWN - ai.angle) * 0.1;
    const bob = this._still ? 0 : Math.sin(now * REST_BOB_HZ) * REST_BOB_PX;
    return { x: ai.x, y: ai.y + bob, angle: ai.angle, moving: false, tap: 0 };
  }
  _pose(now, t, dt, ch) {
    const c = this._cfgv;
    if (this._strandOut !== null) {
      const p = clamp01((now - this._strandOut.t0) / STRAND_OUT_MS);
      if (p >= 1) return null; // she's gone
      const pos = pointAtFraction(this._strandOut.pts, easeOutCubic(p));
      const a = this._strandOut.pts[0], b = this._strandOut.pts[10];
      return { ...pos, angle: Math.atan2(b.y - a.y, b.x - a.x), moving: true, tap: 0 };
    }
    if (c.state === 'weaving' && t < T.rest) return weavingPose({ web: this._web, t }, this._tracker, ch);
    return this._aiPose(now, dt, ch);
  }
  _frame(now) {
    if (!this._web) return;
    const c = this._cfgv, dt = Math.min(50, now - this._lastNow);
    this._lastNow = now;
    this._shiver *= Math.exp(-dt / 650);
    const t = this._timelineT(now);
    if (c.state === 'weaving' && !this._settledFired && t >= T.settle) { this._settledFired = true; this.dispatchEvent(new CustomEvent('weave-settled', { bubbles: true, composed: true })); }
    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._w, this._h);
    ctx.lineCap = 'round';
    const still = this._still, sway = still ? null : now;
    const web = this._web, palette = this._palette, dim = c.dim;
    const captureProgress = clamp01((t - T.capture[0]) / (T.capture[1] - T.capture[0]));
    const floatWindow = T.bridge[1] * BF_UNTIL_FRAC;
    for (const strand of web.strands) {
      const frame = strandFrame(strand, t, still, captureProgress);
      if (frame === null || frame.upTo < 1) continue;
      ctx.globalAlpha = frame.alpha * dim; ctx.strokeStyle = palette.silk; ctx.lineWidth = frame.width;
      if (strand.kind === 'capture') { ctx.shadowColor = palette.glow; ctx.shadowBlur = CAPTURE_GLOW_BLUR; }
      const sn = still ? null : strand.kind === 'bridge' && t < floatWindow ? null : now;
      ctx.beginPath();
      const n = Math.min(frame.upTo, strand.pts.length - 1);
      for (let i = 0; i <= n; i++) { const p = this._strandPt(strand, i, sn); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (strand.kind === 'bridge' && !still && t < floatWindow) {
        const settleFrac = t / floatWindow;
        ctx.globalAlpha = BF_ALPHA * dim; ctx.beginPath();
        for (let i = 0; i <= frame.upTo; i++) { const p = strand.pts[i]; const w = Math.sin(now * BF_HZ + i * BF_PHASE) * BF_AMP * (1 - settleFrac); if (i === 0) ctx.moveTo(p.x, p.y + w); else ctx.lineTo(p.x, p.y + w); }
        ctx.stroke();
      }
    }
    const settled = t >= T.settle;
    if (settled && !still) {
      const sweep = now / GLINT_PERIOD % 1 * TAU;
      for (const strand of [web.capture, ...web.radii]) {
        const pts = strand.pts;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = this._strandPt(strand, i, sway), b = this._strandPt(strand, i + 1, sway);
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
    if (settled) {
      const born = c.state === 'weaving' ? clamp01((t - T.settle) / DEW_CONDENSE_MS) : 1;
      for (const drop of web.dew) {
        const p = this._sway(drop, sway);
        const twinkle = still ? 0.8 : DEW_TW_FLOOR + DEW_TW_GAIN * Math.sin(now * DEW_TW_HZ * drop.speed + drop.phase) ** 2;
        ctx.fillStyle = palette.dew;
        ctx.globalAlpha = born * twinkle * DEW_ALPHA * dim; ctx.beginPath(); ctx.arc(p.x, p.y, drop.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = born * twinkle * DEW_HALO_A * dim; ctx.beginPath(); ctx.arc(p.x, p.y, drop.r * DEW_HALO_SCALE, 0, TAU); ctx.fill();
      }
    }
    if (this._strandOut !== null) {
      const age = now - this._strandOut.t0;
      const p = still ? 1 : clamp01(age / STRAND_OUT_MS);
      const fade = still ? 1 : clamp01(1 - (age - STRAND_OUT_MS) / 900); // slack silk lets go after she's gone
      const upTo = Math.round(easeOutCubic(p) * (this._strandOut.pts.length - 1));
      if (upTo >= 1 && fade > 0) {
        ctx.globalAlpha = SO_ALPHA * fade * dim; ctx.strokeStyle = palette.silkBright; ctx.lineWidth = SO_WIDTH;
        ctx.shadowColor = palette.glow; ctx.shadowBlur = SO_BLUR;
        ctx.beginPath();
        for (let i = 0; i <= upTo; i++) { const q = this._strandOut.pts[i]; if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    if (c.spider) {
      const pose = this._pose(now, t, dt, c.ch);
      if (pose !== null) {
        const sp = still ? pose : { ...pose, ...this._sway(pose, now) };
        // idle twitch schedule: hash-picked windows every few seconds at rest
        let twitchPhase = 0;
        if (c.ch.twitch && !pose.moving && pose.tap === 0) {
          const slot = Math.floor(now / 2600);
          if (sinHash(slot, 5, c.seed) > 0.55) { const ph = (now % 2600) / 2600; if (ph > 0.8) twitchPhase = (ph - 0.8) / 0.2; }
        }
        ctx.globalAlpha = dim;
        drawSpiderBody(ctx, palette, sp, now, {
          gaitHz: this._ai.mode === 'sprint' ? 0.034 : c.ch.gaitHz,
          gaitAmp: this._ai.mode === 'sprint' ? 0.36 : c.ch.gaitAmp,
          rest: 0.05, twitch: c.ch.twitch, twitchPhase
        });
      }
    }
    ctx.globalAlpha = 1;
    if (c.fps && !still) {
      this._fpsAvg += (1000 / Math.max(1, dt) - this._fpsAvg) * 0.08;
      if (now - this._fpsAt > 400) { this._fpsAt = now; this._fpsEl.textContent = Math.round(this._fpsAvg) + ' FPS'; }
    }
  }
}
customElements.define('weave-lab', WeaveLab);
})();
