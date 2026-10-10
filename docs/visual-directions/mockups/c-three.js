// Direction C: true 3D, orthographic tactical camera (three.js). Cells are
// extruded boxes, walls are tall boxes, ramps are wedges, lights are real point
// lights with shadow maps so height blocks light physically. Tokens are
// cylinders / boxes with billboarded initials + HP arcs; the flier floats above
// a shadow decal on a tether.
import * as THREE from 'three';
import * as S from './scene.js';
import { chip, drawLegend, drawToken, hpText } from './common2d.js';

const view = S.getView();
const gl = document.getElementById('gl');
const W = gl.width,
  H = gl.height;
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color(S.palette.backdrop);

const U = 1; // one cell = 1 unit; one 5 ft step = STEP units
const STEP = 0.5;
const BASE = 2.5; // how far the floor slab extends below elevation 0 (so pits have walls)

// --- camera: fixed tactical isometric-ish angle, orthographic so distant tiles stay the same size ---
const aspect = W / H;
const half = 7.6;
const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 100);
const center = new THREE.Vector3(S.COLS / 2, 0, S.ROWS / 2 + 0.4);
const az = (Math.PI / 4) * 0.55,
  el = THREE.MathUtils.degToRad(42);
camera.position.set(
  center.x + Math.sin(az) * 30 * Math.cos(el),
  center.y + Math.sin(el) * 30,
  center.z + Math.cos(az) * 30 * Math.cos(el),
);
camera.lookAt(center);
camera.updateMatrixWorld();

// --- materials ---
const matFloor = (e) =>
  new THREE.MeshStandardMaterial({
    color: e < 0 ? S.palette.pit[Math.min(1, -e - 1)] : e >= 3 ? S.palette.floorHigh : S.palette.floor[e],
    roughness: 0.78,
    metalness: 0.35,
  });
const matSide = new THREE.MeshStandardMaterial({ color: '#1f242a', roughness: 0.85, metalness: 0.3 });
const matWall = new THREE.MeshStandardMaterial({ color: S.palette.wall, roughness: 0.7, metalness: 0.4 });
const matHazard = new THREE.MeshStandardMaterial({
  color: S.palette.hazard,
  roughness: 0.6,
  emissive: '#3a2e00',
});

const lighting = S.computeLighting();
const cellCenter = (r, c, e) => new THREE.Vector3(c + 0.5, e * STEP, r + 0.5);

// --- cells ---
for (let r = 0; r < S.ROWS; r++) {
  for (let c = 0; c < S.COLS; c++) {
    const e = S.elevAt(r, c);
    const ramp = S.rampAt(r, c);
    if (ramp) {
      // wedge: a box sheared by rotating a thin slab — simplest is an extruded triangle profile
      const hi = ramp.from * STEP,
        lo = ramp.to * STEP;
      const shape = new THREE.Shape();
      shape.moveTo(0, -BASE);
      shape.lineTo(1, -BASE);
      shape.lineTo(1, lo);
      shape.lineTo(0, hi);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, [matFloor(1), matSide]);
      // shape x = along row (north→south), extrude depth = along column
      mesh.rotation.y = -Math.PI / 2;
      mesh.position.set(c, 0, r);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      continue;
    }
    const height = e * STEP + BASE;
    const geo = new THREE.BoxGeometry(U, height, U);
    const mesh = new THREE.Mesh(geo, [matSide, matSide, matFloor(e), matSide, matSide, matSide]);
    mesh.position.set(c + 0.5, -BASE + height / 2, r + 0.5);
    mesh.receiveShadow = true;
    mesh.castShadow = e > 0;
    scene.add(mesh);
    // grid lines on the top face
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(U, U)),
      new THREE.LineBasicMaterial({ color: '#aabed2', transparent: true, opacity: 0.35 }),
    );
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(c + 0.5, e * STEP + 0.004, r + 0.5);
    scene.add(edges);
    // hazard strip on pit rims
    if (
      e >= 0 &&
      [S.elevAt(r + 1, c), S.elevAt(r - 1, c), S.elevAt(r, c + 1), S.elevAt(r, c - 1)].some((n) => n < 0)
    ) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(U, 0.02, U), matHazard);
      strip.scale.set(0.98, 1, 0.98);
      strip.position.set(c + 0.5, e * STEP + 0.005, r + 0.5);
      strip.material = matHazard.clone();
      strip.material.transparent = true;
      strip.material.opacity = 0.35;
      scene.add(strip);
    }
  }
}
// walls
for (const w of S.walls) {
  const e = S.elevAt(w.r, w.c);
  const h = 2.2;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(U, h, U), matWall);
  mesh.position.set(w.c + 0.5, e * STEP + h / 2, w.r + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
// terrain
for (const t of S.terrain) {
  const e = S.elevAt(t.r, t.c);
  if (t.kind === 'crate') {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.55, 0.7),
      new THREE.MeshStandardMaterial({ color: '#6a5a3a', roughness: 0.9 }),
    );
    m.position.set(t.c + 0.5, e * STEP + 0.275, t.r + 0.5);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  } else {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: '#3f7d3a', roughness: 0.9 }),
    );
    m.position.set(t.c + 0.5, e * STEP + 0.25, t.r + 0.5);
    m.castShadow = true;
    scene.add(m);
  }
}

// --- lights: real point lights with shadows; DM reveal = faint ambient so dark areas stay legible ---
scene.add(new THREE.AmbientLight('#8fa6c0', view === 'dm' ? 0.75 : 0.03));
if (view === 'dm') scene.add(new THREE.HemisphereLight('#aebfd2', '#1a1d22', 0.35));
for (const l of S.lights) {
  if (!l.on) continue;
  const at = l.at ?? S.tokenById(l.attachedTo);
  const e = S.elevAt(at.r, at.c) + (at.altitude ?? 0);
  const pl = new THREE.PointLight(l.color, 26, l.dim + 0.6, 1.6);
  pl.position.set(at.c + 0.5, e * STEP + 0.9, at.r + 0.5);
  pl.castShadow = true;
  pl.shadow.mapSize.set(1024, 1024);
  pl.shadow.bias = -0.004;
  scene.add(pl);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: l.color }),
  );
  bulb.position.copy(pl.position);
  scene.add(bulb);
}

// --- tokens: body mesh in 3D, identity/HP drawn on the 2D overlay at the projected position ---
const overlay = document.getElementById('overlay').getContext('2d');
const project = (v) => {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
};
const tokenSprites = [];
for (const t of S.tokens) {
  const lv = lighting.get(`${t.r},${t.c}`).level;
  if (view === 'player' && lv === 'dark') continue;
  const e = S.elevAt(t.r, t.c);
  const alt = (t.altitude ?? 0) * STEP;
  const body =
    t.side === 'party'
      ? new THREE.Mesh(
          new THREE.CylinderGeometry(0.33, 0.36, 0.5, 24),
          new THREE.MeshStandardMaterial({
            color: t.color,
            roughness: 0.5,
            metalness: 0.2,
            emissive: t.color,
            emissiveIntensity: lv === 'dark' ? 0.12 : 0.05,
          }),
        )
      : new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.5, 0.62),
          new THREE.MeshStandardMaterial({
            color: t.color,
            roughness: 0.5,
            metalness: 0.2,
            emissive: t.color,
            emissiveIntensity: lv === 'dark' ? 0.12 : 0.05,
          }),
        );
  body.position.set(t.c + 0.5, e * STEP + alt + 0.25, t.r + 0.5);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  // side ring on the floor (or at altitude)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({ color: t.side === 'party' ? S.palette.ally : S.palette.enemy }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(t.c + 0.5, e * STEP + alt + 0.03, t.r + 0.5);
  scene.add(ring);
  if (t.selected) {
    const sel = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.03, 8, 40),
      new THREE.MeshBasicMaterial({ color: S.palette.selected }),
    );
    sel.rotation.x = Math.PI / 2;
    sel.position.set(t.c + 0.5, e * STEP + alt + 0.03, t.r + 0.5);
    scene.add(sel);
  }
  if (t.active) {
    const act = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.045, 8, 40),
      new THREE.MeshBasicMaterial({ color: S.palette.active }),
    );
    act.rotation.x = Math.PI / 2;
    act.position.set(t.c + 0.5, e * STEP + alt + 0.03, t.r + 0.5);
    scene.add(act);
  }
  if (t.altitude) {
    // ground shadow decal + tether with ticks
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 24),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.55 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(t.c + 0.5, e * STEP + 0.01, t.r + 0.5);
    scene.add(decal);
    const pts = [
      new THREE.Vector3(t.c + 0.5, e * STEP + 0.02, t.r + 0.5),
      new THREE.Vector3(t.c + 0.5, e * STEP + alt, t.r + 0.5),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.12, gapSize: 0.08 }),
    );
    line.computeLineDistances();
    scene.add(line);
    for (let s = 1; s <= t.altitude; s++) {
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.02, 0.02),
        new THREE.MeshBasicMaterial({ color: '#9fd0ff' }),
      );
      tick.position.set(t.c + 0.5, e * STEP + s * STEP, t.r + 0.5);
      scene.add(tick);
    }
  }
  tokenSprites.push({
    t,
    lv,
    head: new THREE.Vector3(t.c + 0.5, e * STEP + alt + 0.5, t.r + 0.5),
    foot: new THREE.Vector3(t.c + 0.5, e * STEP + alt, t.r + 0.5),
  });
}

// height chips & light labels: 3D anchor points projected onto the overlay
const labels = [];
for (const reg of S.heightRegions())
  labels.push({
    p: cellCenter(reg.label.r, reg.label.c, reg.elev).add(new THREE.Vector3(0, 0.02, -0.25)),
    text: S.ftLabel(reg.elev),
    bg: reg.elev > 0 ? 'rgba(255,255,255,0.88)' : 'rgba(20,30,50,0.9)',
    fg: reg.elev > 0 ? '#111' : '#9fd0ff',
    size: 12,
  });
labels.push({
  p: cellCenter(5, 11, 0.6).add(new THREE.Vector3(0.5, 0, 0)),
  text: 'ramp +5 ft → 0',
  size: 11,
  bold: false,
});
if (view === 'dm') {
  for (const l of S.lights.filter((l) => l.at))
    labels.push({
      p: cellCenter(l.at.r, l.at.c, S.elevAt(l.at.r, l.at.c)).add(new THREE.Vector3(0, 0, 0.45)),
      text: `${l.name} ${l.on ? 'ON' : 'OFF'} · ${l.bright * 5}/${l.dim * 5} ft`,
      size: 10,
      bold: false,
    });
  labels.push({
    p: cellCenter(11.4, 10.5, 0),
    text: 'light group "hangar" — OFF (generator)',
    size: 11,
    bold: false,
    fg: '#bfe3ff',
  });
}

function draw() {
  renderer.render(scene, camera);
  overlay.clearRect(0, 0, W, H);
  // hangar group outline (DM)
  if (view === 'dm') {
    const corners = [
      [6, 7],
      [6, 14],
      [12, 14],
      [12, 7],
    ].map(([r, c]) => project(new THREE.Vector3(c, 0.02, r)));
    overlay.save();
    overlay.setLineDash([8, 6]);
    overlay.strokeStyle = 'rgba(191,227,255,0.6)';
    overlay.lineWidth = 2;
    overlay.beginPath();
    corners.forEach((p, i) => (i ? overlay.lineTo(p.x, p.y) : overlay.moveTo(p.x, p.y)));
    overlay.closePath();
    overlay.stroke();
    overlay.restore();
  }
  for (const lb of labels) {
    const p = project(lb.p);
    chip(overlay, p.x, p.y, lb.text, { size: lb.size, bg: lb.bg, fg: lb.fg, bold: lb.bold });
  }
  // token identity: a 2D token face drawn over the 3D body so initials/HP stay crisp and TV-readable
  const d = 46;
  for (const s of tokenSprites.sort((a, b) => project(a.head).y - project(b.head).y)) {
    const p = project(s.head);
    drawToken(overlay, p.x, p.y - d * 0.15, d, s.t, {
      alpha: s.lv === 'dark' ? 0.6 : 1,
      hidden: s.lv === 'dark',
    });
    if (s.t.altitude)
      chip(overlay, p.x, p.y - d * 0.15 - d / 2 - 12, `▲ ${s.t.altitude * 5} ft`, {
        size: 12,
        bg: 'rgba(120,200,255,0.92)',
        fg: '#06182a',
      });
    const e = S.elevAt(s.t.r, s.t.c);
    if (e !== 0 && !s.t.altitude)
      chip(overlay, p.x, p.y - d * 0.15 + d / 2 + 11, `on ${S.ftLabel(e)}`, { size: 10, bold: false });
    else if (view === 'dm') hpText(overlay, p.x, p.y - d * 0.15 + d / 2 + 11, s.t, 10);
    if (s.t.id === 'HK') {
      overlay.fillStyle = '#ffb366';
      overlay.beginPath();
      overlay.arc(p.x + d / 2 - 2, p.y - d * 0.15 - d / 2 + 2, 6, 0, Math.PI * 2);
      overlay.fill();
      overlay.strokeStyle = '#000';
      overlay.stroke();
    }
  }
  drawLegend(
    overlay,
    W,
    H,
    'C — True 3D orthographic (three.js)',
    'extruded cells + real point lights with shadow maps · height physically blocks light · wedge ramps · flier on a tether · locked tactical camera',
    view,
  );
}
draw();
document.title = 'C ready';
