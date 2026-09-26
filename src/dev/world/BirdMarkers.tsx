// Marqueurs d'oiseaux MINIMAUX pour la page de lookdev du monde (les vrais oiseaux
// sont faits par l'agent birds). Ils servent aussi de test de l'API NPR telle
// qu'un agent tiers l'utilise : createNprMaterial (famille oiseau, accent couleur
// joueur, idOffset) + shadowCasters.add avec la MÊME déformation (battement).
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { gameView, lerpBird } from '../../host/view.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { birdId, createNprMaterial, shadowCasters, type CasterHandle, type NprMaterial, type VertexDeform } from '../../host/render/npr/index.ts'

function part(g: THREE.BufferGeometry, accent: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  geo.deleteAttribute('uv')
  const pos = geo.attributes.position as THREE.BufferAttribute
  const acc = new Float32Array(pos.count)
  const ido = new Float32Array(pos.count)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    acc[i] = accent(v)
    ido[i] = acc[i]! > 0.5 ? 40 : 0
  }
  geo.setAttribute('accent', new THREE.BufferAttribute(acc, 1))
  geo.setAttribute('idOffset', new THREE.BufferAttribute(ido, 1))
  return geo
}

function birdGeometry(): THREE.BufferGeometry {
  const none = () => 0
  const wing = (side: number) => {
    const g = new THREE.BoxGeometry(5.0, 0.16, 1.5, 10, 1, 2)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 2.5 // 0..5
      const taper = 1 - 0.68 * (x / 5)
      p.setXYZ(i, side * (x + 0.55), p.getY(i) * taper + 0.35 + x * 0.04, p.getZ(i) * taper - x * 0.22 + 0.2)
    }
    g.computeVertexNormals()
    return part(g, (q) => (Math.abs(q.x) > 3.1 && Math.abs(q.x) < 3.9 ? 1 : 0))
  }
  const body = part(new THREE.SphereGeometry(1, 16, 10).scale(0.62, 0.5, 2.3), none)
  const head = part(new THREE.SphereGeometry(0.42, 10, 8).translate(0, 0.35, 2.55), none)
  const beak = part(new THREE.ConeGeometry(0.18, 1.6, 8).rotateX(Math.PI / 2).translate(0, 0.32, 3.5), none)
  const tail = part(new THREE.SphereGeometry(1, 10, 6).scale(0.9, 0.08, 1.1).translate(0, 0.05, -2.6), none)
  const rider = part(new THREE.SphereGeometry(0.34, 8, 6).scale(1, 1.5, 1).translate(0, 0.85, 0.3), (q) => (q.y < 0.75 ? 1 : 0))
  const g = mergeGeometries([body, head, beak, tail, rider, wing(1), wing(-1)])!
  g.computeBoundingSphere()
  return g
}

/** Battement d'ailes partagé entre le matériau visible et le caster d'ombre. */
function flightDeform(): VertexDeform {
  return {
    uniforms: { uFlap: { value: 0 }, uFold: { value: 0 } },
    pars: /* glsl */ `uniform float uFlap, uFold;`,
    main: /* glsl */ `
      float span = max(abs(transformed.x) - 0.55, 0.0);
      float lift = sin(uFlap) * span * span * 0.045 * (1.0 - uFold);
      transformed.y += lift;
      transformed.x *= 1.0 - 0.5 * uFold * smoothstep(0.5, 5.0, span);
      transformed.z -= uFold * span * 0.35;
      objectNormal = normalize(objectNormal + vec3(-sign(transformed.x) * cos(uFlap) * span * 0.018, 0.0, 0.0));
    `,
  }
}

interface Marker {
  mesh: THREE.Mesh
  mat: NprMaterial
  deform: VertexDeform
  caster: CasterHandle
}

export function BirdMarkers() {
  const geometry = useMemo(() => birdGeometry(), [])
  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = []
    for (let slot = 0; slot < 12; slot++) {
      const deform = flightDeform()
      const color = PLAYER_COLORS[gameView.players[slot]?.colorIndex ?? slot]!.hex
      const mat = createNprMaterial({
        objectId: birdId(slot),
        vertexIdOffset: true,
        family: 'bird',
        albedo: '#EDEDDF',
        accentColor: color,
        hatch: 'belly',
        hatchScale: 1.2,
        shadowBias: 'bird',
        deform,
      })
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.rotation.order = 'YXZ'
      mesh.visible = false
      mesh.name = `bird-marker-${slot}`
      const caster = shadowCasters.add(mesh, { owner: slot + 1, strength: 1, deform })
      out.push({ mesh, mat, deform, caster })
    }
    return out
  }, [geometry])
  useEffect(
    () => () => {
      for (const m of markers) {
        m.caster.dispose()
        m.mat.dispose()
      }
      geometry.dispose()
    },
    [markers, geometry],
  )

  useFrame((state) => {
    const sim = gameView.sim
    for (const m of markers) m.mesh.visible = false
    if (!sim) return
    const t = state.clock.elapsedTime
    for (const b of sim.birds) {
      const m = markers[b.slot]
      if (!m) continue
      m.mesh.visible = true
      const x = lerpBird(b.slot, 'x')
      const y = lerpBird(b.slot, 'y')
      const z = lerpBird(b.slot, 'z')
      m.mesh.position.set(x, z, -y)
      m.mesh.rotation.y = b.heading + Math.PI / 2
      m.mesh.rotation.z = THREE.MathUtils.clamp(-b.turnRate * 0.45, -0.87, 0.87)
      m.mesh.rotation.x = THREE.MathUtils.clamp(-b.vz * 0.03, -0.5, 0.5)
      const u = m.deform.uniforms as { uFlap: { value: number }; uFold: { value: number } }
      const climbing = b.vz > 1
      u.uFlap.value = t * (climbing ? 12 : 3.8) + b.slot * 1.7
      u.uFold.value = b.dive !== 'none' || b.vz < -6 ? 1 : 0
      m.caster.setStrength(b.strong ? 1 : 0.6)
      m.mat.uniforms.uHidden.value = b.hidden ? 1 : 0
    }
  })

  return (
    <group name="bird-markers">
      {markers.map((m) => (
        <primitive key={m.mesh.name} object={m.mesh} />
      ))}
    </group>
  )
}
