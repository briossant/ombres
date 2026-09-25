// Prototype d'oiseau géant procédural (esprit ptérosaure blanc d'Arzach) — CC0 / propriété du projet.
// Génère un THREE.SkinnedMesh (corps loft + cou en S + tête à long bec + crête + ailes-membranes à 3 os + queue + pattes)
// et renvoie { mesh, bones, pose(params) } pour l'animation procédurale (battement, repli en piqué, inclinaison).
// Axes : +Z = avant, +Y = haut, +X = droite. Échelle : ~1 unité = 1 m, envergure ≈ 7.5.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function createBird({ span = 3.7, seed = 0 } = {}) {
  const pos = [], nrm = [], idx = [], skinI = [], skinW = [];
  // ---------- squelette
  const B = {}; const bones = [];
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) B[parent].add(b); B[name] = b; bones.push(b); return b; };
  mk('root', null, 0, 0, 0);
  mk('spine', 'root', 0, 0, 0.2);
  mk('neck1', 'spine', 0, 0.12, 0.55); mk('neck2', 'neck1', 0, 0.22, 0.35); mk('head', 'neck2', 0, 0.12, 0.35);
  mk('tail1', 'root', 0, 0, -0.7); mk('tail2', 'tail1', 0, -0.02, -0.6);
  for (const s of [1, -1]) { const L = s > 0 ? 'R' : 'L';
    mk('shoulder' + L, 'spine', 0.22 * s, 0.1, 0.1);
    mk('elbow' + L, 'shoulder' + L, 1.05 * s * span / 3.7, 0.05, 0.12);
    mk('wrist' + L, 'elbow' + L, 0.95 * s * span / 3.7, 0.0, 0.18);
    mk('tip' + L, 'wrist' + L, 1.45 * s * span / 3.7, -0.02, -0.55);
    mk('leg' + L, 'root', 0.12 * s, -0.12, -0.35);
  }
  const bi = n => bones.indexOf(B[n]);
  const rootInv = new THREE.Matrix4(); B.root.updateMatrixWorld(true);
  const wp = n => new THREE.Vector3().setFromMatrixPosition(B[n].matrixWorld);

  // ---------- helpers géométrie
  function pushV(p, n, bIdx, bW) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); skinI.push(...bIdx); skinW.push(...bW); return pos.length / 3 - 1; }
  // loft : centres c(t), rayons rx(t), ry(t), rotation 'up' constante, weights(t)
  function loft(N, M, center, rx, ry, weights, capStart = true, capEnd = true) {
    const base = pos.length / 3; const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) { const t = i / N; const c = center(t); const c2 = center(Math.min(1, t + 1e-3)), c1 = center(Math.max(0, t - 1e-3));
      const T = c2.clone().sub(c1).normalize(); const X = new THREE.Vector3().crossVectors(up, T).normalize(); const Y = new THREE.Vector3().crossVectors(T, X).normalize();
      const [bI, bW] = weights(t);
      for (let j = 0; j < M; j++) { const a = j / M * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
        const p = c.clone().addScaledVector(X, ca * rx(t)).addScaledVector(Y, sa * ry(t));
        const n = X.clone().multiplyScalar(ca * ry(t)).addScaledVector(Y, sa * rx(t)).normalize(); pushV(p, n, bI, bW); } }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = base + i * M + j, b = base + i * M + (j + 1) % M, c = a + M, d = b + M; idx.push(a, b, c, b, d, c); }
    if (capStart) { const c = pushV(center(0), new THREE.Vector3(0, 0, -1), ...weights(0)); for (let j = 0; j < M; j++) idx.push(c, base + j, base + (j + 1) % M); }
    if (capEnd) { const o = base + N * M; const c = pushV(center(1), new THREE.Vector3(0, 0, 1), ...weights(1)); for (let j = 0; j < M; j++) idx.push(c, o + (j + 1) % M, o + j); }
  }
  const W1 = n => [[bi(n), 0, 0, 0], [1, 0, 0, 0]];
  const W2 = (a, b, t) => [[bi(a), bi(b), 0, 0], [1 - t, t, 0, 0]];

  // ---------- corps + queue (loft unique) : z de -1.9 (bout de queue) à 0.75 (poitrail)
  loft(40, 14,
    t => new THREE.Vector3(0, 0.03 * Math.sin(t * Math.PI), lerp(-1.9, 0.75, t)),
    t => 0.02 + 0.26 * smooth(0.0, 0.62, t) * (1 - 0.55 * smooth(0.75, 1.0, t)),
    t => 0.02 + 0.30 * smooth(0.05, 0.62, t) * (1 - 0.45 * smooth(0.78, 1.0, t)),
    t => t < 0.25 ? W2('tail2', 'tail1', t / 0.25) : t < 0.5 ? W2('tail1', 'root', (t - 0.25) / 0.25) : W2('root', 'spine', Math.min(1, (t - 0.5) / 0.4)));
  // ---------- cou en S + tête + bec (loft)
  const neckC = t => { const z = lerp(0.55, 1.75, t); const y = 0.1 + 0.55 * Math.sin(t * Math.PI * 0.9) - 0.12 * t; return new THREE.Vector3(0, y, z); };
  loft(24, 10, neckC, t => 0.14 * (1 - 0.45 * t), t => 0.16 * (1 - 0.4 * t),
    t => t < 0.5 ? W2('spine', 'neck1', t * 2) : W2('neck1', 'neck2', (t - 0.5) * 2), false, false);
  const hc = neckC(1);
  loft(22, 10, t => new THREE.Vector3(0, hc.y + 0.02 - 0.06 * t * t, hc.z + lerp(-0.08, 1.25, t)),
    t => (0.1 * (1 - smooth(0.25, 1, t)) + 0.006) * (t < 0.12 ? 0.8 + t * 1.6 : 1),
    t => (0.13 * (1 - smooth(0.2, 1, t)) + 0.008),
    t => W1('head'));
  // crête (lame vers l'arrière)
  loft(10, 6, t => new THREE.Vector3(0, hc.y + 0.1 + 0.18 * t, hc.z - 0.05 - 0.75 * t), t => 0.025 * (1 - t) + 0.004, t => 0.07 * (1 - t) + 0.006, t => W1('head'));

  // ---------- ailes-membranes (double face, épaisseur au bord d'attaque)
  B.root.updateMatrixWorld(true);
  for (const s of [1, -1]) { const L = s > 0 ? 'R' : 'L';
    const P = ['shoulder', 'elbow', 'wrist', 'tip'].map(n => wp(n + L));
    const NS = 36; const lead = [], trail = [], wts = [];
    for (let i = 0; i <= NS; i++) { const u = i / NS; // paramètre le long de l'envergure
      const seg = u < 0.3 ? 0 : u < 0.55 ? 1 : 2; const lu = seg === 0 ? u / 0.3 : seg === 1 ? (u - 0.3) / 0.25 : (u - 0.55) / 0.45;
      const le = P[seg].clone().lerp(P[seg + 1], lu); le.y += 0.04 * Math.sin(u * Math.PI);
      // bord de fuite : festonné, corde max près du corps (0.95), pointe fine
      const chord = lerp(1.05, 0.08, Math.pow(u, 1.25)) * (1 - 0.12 * Math.pow(Math.sin(u * Math.PI * 3), 2) * (u > 0.3 ? 1 : 0));
      const te = le.clone().add(new THREE.Vector3(0.12 * s * u, -0.02, -chord));
      lead.push(le); trail.push(te);
      // poids : segment k piloté par l'os k ; mélange symétrique (50/50 pile sur l'articulation) sur ±h autour de chaque articulation
      const names = ['shoulder' + L, 'elbow' + L, 'wrist' + L]; const J = [0.3, 0.55], h = 0.07;
      let wI = [bi(names[seg]), 0, 0, 0], wW = [1, 0, 0, 0];
      for (let k = 0; k < 2; k++) if (Math.abs(u - J[k]) < h) { const t = smooth(0, 1, (u - (J[k] - h)) / (2 * h)); wI = [bi(names[k]), bi(names[k + 1]), 0, 0]; wW = [1 - t, t, 0, 0]; }
      wts.push([wI, wW]);
    }
    const R = 5; // 5 rangées de la corde
    for (const side of [1, -1]) { const base = pos.length / 3;
      for (let i = 0; i <= NS; i++) for (let r = 0; r <= R; r++) { const c = r / R;
        const p = lead[i].clone().lerp(trail[i], c); p.y += side * 0.03 * (1 - c) * (1 - i / NS * 0.7); p.y -= 0.05 * Math.sin(c * Math.PI) * (1 - i / NS); // cambrure
        pushV(p, new THREE.Vector3(0, side, 0), ...wts[i]); }
      for (let i = 0; i < NS; i++) for (let r = 0; r < R; r++) { const a = base + i * (R + 1) + r, b = a + 1, c = a + R + 1, d = c + 1;
        if ((side * s) > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
    }
    // pattes repliées vers l'arrière
    const lp = wp('leg' + L);
    loft(8, 6, t => new THREE.Vector3(lp.x + 0.04 * s * t, lp.y - 0.1 * t, lp.z - 0.7 * t), t => 0.05 * (1 - 0.6 * t), t => 0.05 * (1 - 0.6 * t), t => W1('leg' + L));
  }
  // ---------- assemblage
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshToonMaterial({ color: 0xf3ecdc }));
  mesh.add(B.root); mesh.bind(new THREE.Skeleton(bones));
  const rest = Object.fromEntries(bones.map(b => [b.name, b.quaternion.clone()]));
  // ---------- pose procédurale
  // flap: phase (rad), amp 0..1 ; fold: 0 (déployé) .. 1 (replié piqué) ; bank: roulis (rad) ; neck: -1..1 regard
  function pose({ phase = 0, amp = 0.6, fold = 0, bank = 0, pitch = 0, neck = 0 } = {}) {
    for (const b of bones) b.quaternion.copy(rest[b.name]);
    const e = new THREE.Euler();
    for (const s of [1, -1]) { const L = s > 0 ? 'R' : 'L';
      const f = Math.sin(phase), f2 = Math.sin(phase - 0.7), f3 = Math.sin(phase - 1.3); // onde qui se propage vers la pointe
      const dih = -bank * 0.35 * s; // aile basse côté virage
      B['shoulder' + L].quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(0, s * fold * 0.55, s * (amp * 0.65 * f * (1 - fold) + 0.08 - 0.12 * fold + dih) * -1)));
      B['elbow' + L].quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(0, s * fold * 0.75, -s * amp * 0.35 * f2 * (1 - fold))));
      B['wrist' + L].quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(0, s * fold * 0.6, -s * amp * 0.3 * f3 * (1 - fold))));
    }
    B.root.quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(pitch, 0, bank)));
    B.neck1.quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(-0.25 * fold, neck * 0.4, 0)));
    B.tail1.quaternion.multiply(new THREE.Quaternion().setFromEuler(e.set(0.1 * Math.sin(phase * 0.5), 0, 0)));
  }
  return { mesh, bones: B, pose };
}
