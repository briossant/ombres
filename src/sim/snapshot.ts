// Snapshot JSON de la simulation (rafraîchissement du PC). Les tableaux typés sont
// encodés en base64 (RLE pour les masques et la grille, très compressibles).
// Le territoire (owner, level) et tout l'état interne sont exacts : une simulation
// restaurée continue à l'identique. Seules les données cosmétiques de transition
// (prevOwner, changedAt) repartent à zéro.

import type { SimSnapshot } from './types.ts'
import type { Bird, Internal, Stats, World } from './state.ts'
import { MAX_SLOTS } from './state.ts'
import { markAllDirty, rleDecode, rleEncode } from './territory.ts'

// ─── base64 sans dépendance (navigateur et Node) ───────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INV = (() => {
  const t = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

type B64Codec = { btoa?: (s: string) => string; atob?: (s: string) => string }
const codec = globalThis as unknown as B64Codec

export function bytesToBase64(bytes: Uint8Array): string {
  if (codec.btoa) {
    // voie rapide (navigateur, Node ≥ 16) : chaîne binaire par tranches, puis btoa
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[])
    return codec.btoa(bin)
  }
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

export function base64ToBytes(s: string): Uint8Array {
  if (codec.atob) {
    const bin = codec.atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  const clean = s.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  let buf = 0
  let bits = 0
  for (let i = 0; i < clean.length; i++) {
    const v = B64_INV[clean.charCodeAt(i)]!
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buf >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

// ─── Empaquetage générique ─────────────────────────────────────────────────

type Packed = null | boolean | number | string | Packed[] | { [k: string]: Packed }

function pack(v: unknown): Packed {
  if (v === undefined || v === null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) }
  if (typeof v === 'boolean' || typeof v === 'string') return v
  if (v instanceof Uint8Array) {
    const rle = rleEncode(v)
    return rle.length < v.length ? { $u8r: bytesToBase64(rle), n: v.length } : { $u8: bytesToBase64(v) }
  }
  if (v instanceof Int32Array) return { $i32: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  if (v instanceof Float32Array) return { $f32: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  if (v instanceof Float64Array) return { $f64: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  if (Array.isArray(v)) return v.map(pack)
  if (typeof v === 'object') {
    const out: { [k: string]: Packed } = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = pack(x)
    return out
  }
  return null
}

function copyBytes(b: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(b.length)
  new Uint8Array(buf).set(b)
  return buf
}

function unpack(p: unknown): unknown {
  if (p === null || typeof p !== 'object') return p
  if (Array.isArray(p)) return p.map(unpack)
  const o = p as Record<string, unknown>
  if (typeof o.$n === 'string') return Number(o.$n)
  if (typeof o.$u8r === 'string') return rleDecode(base64ToBytes(o.$u8r), o.n as number)
  if (typeof o.$u8 === 'string') return Uint8Array.from(base64ToBytes(o.$u8))
  if (typeof o.$i32 === 'string') return new Int32Array(copyBytes(base64ToBytes(o.$i32)))
  if (typeof o.$f32 === 'string') return new Float32Array(copyBytes(base64ToBytes(o.$f32)))
  if (typeof o.$f64 === 'string') return new Float64Array(copyBytes(base64ToBytes(o.$f64)))
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(o)) out[k] = unpack(x)
  return out
}

// ─── Monde ─────────────────────────────────────────────────────────────────

export function encodeWorld(world: World): SimSnapshot {
  const st = world.state
  const data = {
    state: {
      tick: st.tick,
      time: st.time,
      sun: st.sun,
      arena: st.arena,
      birds: st.birds,
      crownSlot: st.crownSlot,
      timeScaleHint: st.timeScaleHint,
      stats: st.stats,
      over: st.over,
      night: { active: st.night.active, dirX: st.night.dirX, dirY: st.night.dirY, s: st.night.s },
      grid: { owner: st.grid.owner, level: st.grid.level, counts: st.grid.counts, version: st.grid.version },
    },
    internal: world.internal,
  }
  return { version: 1, config: JSON.parse(JSON.stringify(st.config)), data: pack(data) as Record<string, unknown> }
}

interface DecodedState {
  tick: number
  time: number
  sun: World['state']['sun']
  arena: World['state']['arena']
  birds: Bird[]
  crownSlot: number
  timeScaleHint: number
  stats: (Stats | null)[]
  over: boolean
  night: { active: boolean; dirX: number; dirY: number; s: number }
  grid: { owner: Uint8Array; level: Uint8Array; counts: Int32Array; version: number }
}

/** Écrase l'état d'un monde fraîchement créé (même config) par celui du snapshot. */
export function decodeWorld(world: World, snap: SimSnapshot): void {
  if (snap.version !== 1) throw new Error(`snapshot de version inconnue : ${String(snap.version)}`)
  const d = unpack(snap.data) as { state: DecodedState; internal: Internal }
  const st = world.state
  const s = d.state
  st.tick = s.tick
  st.time = s.time
  Object.assign(st.sun, s.sun)
  Object.assign(st.arena, s.arena)
  st.birds.length = 0
  st.bySlot.fill(undefined)
  for (const b of s.birds) {
    st.birds.push(b)
    st.bySlot[b.slot] = b
  }
  st.crownSlot = s.crownSlot
  st.timeScaleHint = s.timeScaleHint
  for (let i = 0; i < MAX_SLOTS; i++) st.stats[i] = s.stats[i] ?? undefined
  st.over = s.over
  st.night.active = s.night.active
  st.night.dirX = s.night.dirX
  st.night.dirY = s.night.dirY
  st.night.s = s.night.s
  const g = st.grid
  g.owner.set(s.grid.owner)
  g.level.set(s.grid.level)
  g.counts.set(s.grid.counts)
  g.version = s.grid.version
  g.prevOwner.set(s.grid.owner)
  g.changedAt.fill(-1000)
  world.internal = d.internal
  const I = world.internal
  for (let k = 0; k < g.frozen.length; k++) g.frozen[k] = I.towerMask[k]! | I.nightMask[k]!
  g.frozenVersion++
  markAllDirty(g)
}
