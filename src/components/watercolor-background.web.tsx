import { useEffect, useRef } from 'react';
import { colors } from './posa-theme';
const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float opacity;
uniform float scale;
uniform vec3 color1;
uniform vec3 color2;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    value += noise(p) * amplitude;
    p = p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0) * (3.4 * scale);
  float drift = time * 0.22;
  vec2 q = vec2(
    fbm(p + vec2(drift * 0.35, -drift * 0.18)),
    fbm(p + vec2(5.2, 1.3) + vec2(-drift * 0.14, drift * 0.28))
  );
  vec2 r = vec2(
    fbm(p + 1.8 * q + vec2(1.7, 9.2) + drift * 0.09),
    fbm(p + 1.8 * q + vec2(8.3, 2.8) - drift * 0.07)
  );
  float pigment = fbm(p + 1.7 * r);
  float blend = smoothstep(0.29, 0.72, pigment);
  vec3 watercolor = mix(color1, color2, blend);
  gl_FragColor = vec4(watercolor, opacity);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function rgb(hex: string) {
  const value = hex.slice(1);
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number];
}

export default function WatercolorBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power', premultipliedAlpha: false });
    if (!canvas || !gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    if (!buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'resolution');
    const time = gl.getUniformLocation(program, 'time');
    const opacity = gl.getUniformLocation(program, 'opacity');
    const scale = gl.getUniformLocation(program, 'scale');
    const color1 = gl.getUniformLocation(program, 'color1');
    const color2 = gl.getUniformLocation(program, 'color2');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motion.matches;
    let frame = 0;
    let lastFrame = 0;

    gl.uniform1f(opacity, 0.42);
    gl.uniform1f(scale, 0.8);
    const [r1, g1, b1] = rgb(colors.background);
    const [r2, g2, b2] = rgb(colors.gradientEnd);
    gl.uniform3f(color1, r1, g1, b1);
    gl.uniform3f(color2, r2, g2, b2);

    const draw = (now: number) => {
      frame = 0;
      if (!reducedMotion && now - lastFrame < 33) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reducedMotion ? 0 : now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (frame) cancelAnimationFrame(frame);
      lastFrame = 0;
      draw(performance.now());
    };

    const onMotionChange = () => {
      reducedMotion = motion.matches;
      if (frame) cancelAnimationFrame(frame);
      lastFrame = 0;
      draw(performance.now());
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    motion.addEventListener('change', onMotionChange);
    resize();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      motion.removeEventListener('change', onMotionChange);
      if (frame) cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas
    ref={canvasRef}
    aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
  />;
}
