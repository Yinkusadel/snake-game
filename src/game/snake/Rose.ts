import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * A single rose built from layered cupped petals, merged into one geometry.
 * Inner petals are darker (vertex colours), outer petals open wider. The
 * rose sits at the origin and faces +Y; scale it for size.
 */
export function createRoseGeometry(): THREE.BufferGeometry {
  const layers = [
    { count: 3, radius: 0.03, tilt: 0.1, size: 0.07, shade: 0.5, y: 0.04 },
    { count: 5, radius: 0.055, tilt: 0.35, size: 0.09, shade: 0.68, y: 0.025 },
    { count: 7, radius: 0.085, tilt: 0.7, size: 0.11, shade: 0.84, y: 0.008 },
    { count: 9, radius: 0.115, tilt: 1.05, size: 0.125, shade: 1, y: -0.01 },
  ]

  const petal = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  const holder = new THREE.Object3D()
  holder.rotation.order = 'YXZ'
  const parts: THREE.BufferGeometry[] = []
  let twist = 0

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const a = (i / layer.count) * Math.PI * 2 + twist
      holder.position.set(Math.cos(a) * layer.radius, layer.y, Math.sin(a) * layer.radius)
      holder.rotation.set(layer.tilt, Math.PI / 2 - a, 0)
      holder.scale.set(layer.size, layer.size * 0.85, layer.size * 0.45)
      holder.updateMatrix()

      const g = petal.clone()
      g.applyMatrix4(holder.matrix)
      const colors = new Float32Array(g.attributes.position.count * 3).fill(layer.shade)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      parts.push(g)
    }
    twist += GOLDEN_ANGLE
  }
  petal.dispose()

  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

export function createLeafGeometry(): THREE.BufferGeometry {
  const leaf = new THREE.SphereGeometry(1, 10, 6)
  leaf.scale(0.07, 0.015, 0.2)
  leaf.translate(0, 0, 0.2)
  return leaf
}
