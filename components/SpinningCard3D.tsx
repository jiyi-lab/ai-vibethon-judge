'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, Environment, Lightformer } from '@react-three/drei';
import { useRef, useMemo, Suspense, RefObject } from 'react';
import * as THREE from 'three';

const W = 2;
const H = 3;
const R = 0.14;
const DEPTH = 0.02;

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function faceGeometry(shape: THREE.Shape) {
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sizeX = bb.max.x - bb.min.x;
  const sizeY = bb.max.y - bb.min.y;
  const pos = geo.attributes.position;
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    uv.push((pos.getX(i) - bb.min.x) / sizeX, (pos.getY(i) - bb.min.y) / sizeY);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// Three.js가 useFrame에서 직접 ref를 읽음 — React re-render 없이 업데이트
function Card({ tiltRef, zTiltRef }: { tiltRef: RefObject<number>; zTiltRef: RefObject<number> }) {
  const outerRef = useRef<THREE.Group>(null);
  const ref = useRef<THREE.Group>(null);
  // 텍스처 설정은 로드 콜백 안에서 한다.
  // 훅이 돌려준 값을 바깥에서 변형하면 react-hooks/immutability 에 걸린다.
  const [front, back] = useTexture(['/card-back-Q.png', '/card-back-0624.png'], (loaded) => {
    for (const texture of Array.isArray(loaded) ? loaded : [loaded]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
    }
  });

  const { bodyGeo, faceGeo, bodyMat, frontMat, backMat } = useMemo(() => {
    const shape = roundedRectShape(W, H, R);
    const body = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false });
    body.translate(0, 0, -DEPTH / 2);
    const face = faceGeometry(shape);
    return {
      bodyGeo: body,
      faceGeo: face,
      bodyMat: new THREE.MeshStandardMaterial({ color: '#c7cad1', metalness: 1, roughness: 0.24 }),
      frontMat: new THREE.MeshStandardMaterial({ map: front, metalness: 0.15, roughness: 0.5 }),
      backMat: new THREE.MeshStandardMaterial({ map: back, metalness: 0.15, roughness: 0.5 }),
    };
  }, [front, back]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.75;
    const curX = ref.current.rotation.x;
    ref.current.rotation.x = curX + ((tiltRef.current ?? 0.12) - curX) * Math.min(1, delta * 6);
    if (outerRef.current) {
      const curZ = outerRef.current.rotation.z;
      outerRef.current.rotation.z = curZ + ((zTiltRef.current ?? -0.35) - curZ) * Math.min(1, delta * 6);
    }
  });

  const eps = DEPTH / 2 + 0.002;

  return (
    <group ref={outerRef} rotation={[0, 0, -0.35]}>
      <group ref={ref} rotation={[0.12, 0.4, 0]}>
        <mesh geometry={bodyGeo} material={bodyMat} />
        <mesh geometry={faceGeo} material={frontMat} position={[0, 0, eps]} />
        <mesh geometry={faceGeo} material={backMat} position={[0, 0, -eps]} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}

export default function SpinningCard3D({ tiltRef, zTiltRef }: { tiltRef: RefObject<number>; zTiltRef: RefObject<number> }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7.4], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-4, -1, 2]} intensity={0.5} color="#ffd9b0" />
      <Suspense fallback={null}>
        <Card tiltRef={tiltRef} zTiltRef={zTiltRef} />
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={3} position={[0, 2.5, 4]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={2} position={[-5, 0, 2]} scale={[3, 8, 1]} color="#ffd9b0" />
          <Lightformer form="rect" intensity={2} position={[5, 0, 2]} scale={[3, 8, 1]} color="#ffffff" />
          <Lightformer form="rect" intensity={1.2} position={[0, -3, 2]} scale={[8, 3, 1]} color="#ff8a3d" />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
