import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * A tube whose centre line, radius and texture coordinates are rewritten
 * every frame. Used for the snake body and the hair strands.
 */
export class TubeMesh {
  readonly geometry = new THREE.BufferGeometry()

  private readonly radial: number
  private readonly maxRings: number
  private readonly positions: Float32Array
  private readonly normals: Float32Array
  private readonly uvs: Float32Array
  private readonly tangent = new THREE.Vector3()
  private readonly side = new THREE.Vector3()
  private readonly up = new THREE.Vector3()

  constructor(maxRings: number, radial: number) {
    this.maxRings = maxRings
    this.radial = radial
    const verts = maxRings * (radial + 1)
    this.positions = new Float32Array(verts * 3)
    this.normals = new Float32Array(verts * 3)
    this.uvs = new Float32Array(verts * 2)

    const index = new Uint16Array((maxRings - 1) * radial * 6)
    let k = 0
    for (let i = 0; i < maxRings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j
        const b = a + radial + 1
        index[k++] = a
        index[k++] = a + 1
        index[k++] = b
        index[k++] = a + 1
        index[k++] = b + 1
        index[k++] = b
      }
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.setDrawRange(0, 0)
  }

  /**
   * @param flatten vertical squash of the cross-section (1 = round)
   */
  update(
    points: THREE.Vector3[],
    radii: ArrayLike<number>,
    vs: ArrayLike<number>,
    count: number,
    flatten = 1,
  ) {
    const n = Math.min(count, this.maxRings)
    const { positions, normals, uvs, radial, tangent, side, up } = this

    for (let i = 0; i < n; i++) {
      const prev = points[Math.max(i - 1, 0)]
      const next = points[Math.min(i + 1, n - 1)]
      tangent.subVectors(next, prev)
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1)
      tangent.normalize()
      side.crossVectors(UP, tangent)
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
      side.normalize()
      up.crossVectors(tangent, side)

      const c = points[i]
      const r = radii[i]
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const v = i * (radial + 1) + j

        positions[v * 3] = c.x + (side.x * cos + up.x * sin * flatten) * r
        positions[v * 3 + 1] = c.y + (side.y * cos + up.y * sin * flatten) * r
        positions[v * 3 + 2] = c.z + (side.z * cos + up.z * sin * flatten) * r

        // Ellipse normal: (cos / 1, sin / flatten).
        const nx = side.x * cos + (up.x * sin) / flatten
        const ny = side.y * cos + (up.y * sin) / flatten
        const nz = side.z * cos + (up.z * sin) / flatten
        const len = Math.hypot(nx, ny, nz) || 1
        normals[v * 3] = nx / len
        normals[v * 3 + 1] = ny / len
        normals[v * 3 + 2] = nz / len

        uvs[v * 2] = j / radial
        uvs[v * 2 + 1] = vs[i]
      }
    }

    this.geometry.setDrawRange(0, Math.max(0, n - 1) * radial * 6)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.normal.needsUpdate = true
    this.geometry.attributes.uv.needsUpdate = true
  }
}
