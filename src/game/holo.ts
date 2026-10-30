import * as THREE from 'three'

/**
 * Additive hologram: a fresnel rim with scan-lines that crawl upwards.
 * `time.value` must be advanced by the caller every frame.
 */
export function createHoloMaterial(time: { value: number }, color: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float scan = 0.5 + 0.5 * sin(vWorld.y * 7.0 - uTime * 2.0);
        float alpha = (0.08 + fresnel * 0.8) * (0.35 + 0.65 * scan);
        gl_FragColor = vec4(uColor * 2.2, alpha);
      }
    `,
  })
}
