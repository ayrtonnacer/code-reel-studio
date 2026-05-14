import React, { useRef, useLayoutEffect } from "react";

export interface SilkCanvasProps {
  frame: number;
  fps: number;
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
}

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Exact fragment shader from react-bits Silk
const FRAG = `
precision highp float;
varying vec2 vUv;

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
  float rnd     = noise(gl_FragCoord.xy);
  vec2  uv      = rotateUvs(vUv * uScale, uRotation);
  vec2  tex     = uv * uScale;
  float tOffset = uSpeed * uTime;

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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

interface GLState {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  uTime: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  uSpeed: WebGLUniformLocation;
  uScale: WebGLUniformLocation;
  uRotation: WebGLUniformLocation;
  uNoiseIntensity: WebGLUniformLocation;
}

const SilkCanvas: React.FC<SilkCanvasProps> = ({
  frame,
  fps,
  speed = 5,
  scale = 1,
  color = "#7B7481",
  noiseIntensity = 1.5,
  rotation = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);

  // Runs synchronously after every React commit — before the browser paints.
  // This guarantees the WebGL frame is ready when modern-screenshot calls
  // canvas.toDataURL() during export (after flushSync + requestAnimationFrame).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // One-time GL initialization
    if (!glRef.current) {
      const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
      if (!gl) return;

      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };

      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      const posLoc = gl.getAttribLocation(prog, "aPosition");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      glRef.current = {
        gl,
        prog,
        uTime:          gl.getUniformLocation(prog, "uTime")!,
        uColor:         gl.getUniformLocation(prog, "uColor")!,
        uSpeed:         gl.getUniformLocation(prog, "uSpeed")!,
        uScale:         gl.getUniformLocation(prog, "uScale")!,
        uRotation:      gl.getUniformLocation(prog, "uRotation")!,
        uNoiseIntensity: gl.getUniformLocation(prog, "uNoiseIntensity")!,
      };
    }

    const { gl, uTime, uColor, uSpeed, uScale, uRotation, uNoiseIntensity } = glRef.current;
    const [r, g, b] = hexToRgb(color);

    gl.uniform3f(uColor, r, g, b);
    gl.uniform1f(uSpeed, speed);
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uRotation, rotation);
    gl.uniform1f(uNoiseIntensity, noiseIntensity);
    // Deterministic time: identical frame → identical silk state in preview and export
    gl.uniform1f(uTime, (frame / fps) * 0.1);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Block until GPU commits — required before toDataURL() in export capture
    gl.finish();
  });

  return (
    <canvas
      ref={canvasRef}
      width={1080}
      height={1920}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
      }}
    />
  );
};

export default SilkCanvas;
