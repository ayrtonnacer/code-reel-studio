/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useRef, useMemo, useLayoutEffect } from "react";
import { Color } from "three";

const hexToNormalizedRGB = (hex: string): [number, number, number] => {
  hex = hex.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
};

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

interface SilkPlaneProps {
  uniforms: Record<string, { value: unknown }>;
  controlledTimeRef: React.MutableRefObject<number | undefined>;
}

const SilkPlane = forwardRef<THREE.Mesh, SilkPlaneProps>(function SilkPlane(
  { uniforms, controlledTimeRef },
  ref
) {
  const meshRef = ref as React.MutableRefObject<THREE.Mesh>;
  const { viewport } = useThree();

  useLayoutEffect(() => {
    if (meshRef.current) {
      meshRef.current.scale.set(viewport.width, viewport.height, 1);
    }
  }, [meshRef, viewport]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    if (controlledTimeRef.current !== undefined) {
      // Export mode: deterministic time driven by Remotion frame
      mat.uniforms.uTime.value = controlledTimeRef.current * 0.1;
    } else {
      // Live preview mode: accumulate delta
      mat.uniforms.uTime.value += 0.1 * delta;
    }
  });

  return (
    <mesh ref={ref as React.Ref<THREE.Mesh>}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
});
SilkPlane.displayName = "SilkPlane";

export interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  /** When provided (e.g. frame/fps from Remotion), animation is deterministic — required for correct export. */
  time?: number;
}

const Silk: React.FC<SilkProps> = ({
  speed = 5,
  scale = 1,
  color = "#7B7481",
  noiseIntensity = 1.5,
  rotation = 0,
  time,
}) => {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Keep a ref of the controlled time so useFrame always reads the latest value
  // without needing to re-register the callback on every render.
  const controlledTimeRef = useRef<number | undefined>(time);
  controlledTimeRef.current = time;

  const uniforms = useMemo(
    () => ({
      uSpeed: { value: speed },
      uScale: { value: scale },
      uNoiseIntensity: { value: noiseIntensity },
      uColor: { value: new Color(...hexToNormalizedRGB(color)) },
      uRotation: { value: rotation },
      uTime: { value: 0 },
    }),
    // Re-create uniforms when visual props change (color, speed, etc.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speed, scale, noiseIntensity, color, rotation]
  );

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="always"
      gl={{
        // Required so canvas.toDataURL() works for frame capture during export.
        // Without this, WebGL clears the buffer after each frame and toDataURL returns blank.
        preserveDrawingBuffer: true,
      }}
    >
      <SilkPlane ref={meshRef} uniforms={uniforms} controlledTimeRef={controlledTimeRef} />
    </Canvas>
  );
};

export default Silk;
