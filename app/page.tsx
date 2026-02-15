"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';

export default function MasterCraftStudioFinal() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false); 
  
  const [params, setParams] = useState({
    topR: 6, neckR: 3, bellyR: 12, baseR: 4,      
    hWires: 40, vWires: 50, dWires: 35,           
    thickness: 0.6, tilt: 2.5,                    
    color: '#a0a0a0', metalType: 'stainless'      
  });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(60, 60, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const safeR = (r: number) => Math.max(r, 0.001);
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(safeR(params.baseR), -22, 0),
      new THREE.Vector3(safeR(params.bellyR) * 2, -6, 0),
      new THREE.Vector3(safeR(params.neckR), 12, 0),
      new THREE.Vector3(safeR(params.topR), 22, 0)
    );
    const points = curve.getPoints(120);

    const metalPresets: Record<string, { color: string, metalness: number, roughness: number }> = {
      stainless: { color: '#d1d1d1', metalness: 1.0, roughness: 0.1 },
      silver: { color: '#f8f8f8', metalness: 1.0, roughness: 0.03 },
      copper: { color: '#b87333', metalness: 1.0, roughness: 0.2 },
      brass: { color: '#c5a358', metalness: 1.0, roughness: 0.15 },
      gold: { color: '#ffd700', metalness: 1.0, roughness: 0.1 }
    };
    const currentMetal = metalPresets[params.metalType];
    const wireMat = new THREE.MeshStandardMaterial({ 
      color: params.color !== '#a0a0a0' ? params.color : currentMetal.color,
      metalness: currentMetal.metalness, roughness: currentMetal.roughness 
    });

    const vesselGroup = new THREE.Group();

    // 1. 가로 와이어 (Mesh)
    if (params.hWires > 0) {
      for (let i = 0; i <= params.hWires; i++) {
          const pt = curve.getPoint(i / params.hWires);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(safeR(pt.x), params.thickness / 6, 8, 64), wireMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = pt.y;
          vesselGroup.add(ring);
      }
    }

    // 2. 세로 와이어 (Mesh)
    if (params.vWires > 0) {
      for (let j = 0; j < params.vWires; j++) {
        const angle = (j / params.vWires) * Math.PI * 2;
        const vPoints = points.map(pt => new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle)));
        vesselGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vPoints), 64, params.thickness / 8, 8, false), wireMat));
      }
    }

    // 3. 사선 와이어 (Mesh)
    const createDiagonal = (dir: number) => {
        if (params.dWires <= 0) return;
        for (let k = 0; k < params.dWires; k++) {
            const startAngle = (k / params.dWires) * Math.PI * 2;
            const dPoints = points.map((pt, idx) => {
                const angle = startAngle + ((idx / points.length) * params.tilt * dir);
                return new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle));
            });
            vesselGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dPoints), 64, params.thickness / 12, 8, false), wireMat));
        }
    }
    createDiagonal(1); createDiagonal(-1);
    scene.add(vesselGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
    mainLight.position.set(40, 50, 60);
    scene.add(mainLight);

    const animate = () => {
      const id = requestAnimationFrame(animate);
      controls.update(); renderer.render(scene, camera);
      return id;
    };
    const animationId = animate();
    return () => { cancelAnimationFrame(animationId); mountRef.current?.removeChild(renderer.domElement); };
  }, [mounted, params]);

  // --- 정밀 단일 패스 SVG 추출 로직 ---
  const exportSVG = () => {
    if (!cameraRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cam = cameraRef.current;
    
    let svgPaths = "";
    const safeR = (r: number) => Math.max(r, 0.001);
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(safeR(params.baseR), -22, 0),
      new THREE.Vector3(safeR(params.bellyR) * 2, -6, 0),
      new THREE.Vector3(safeR(params.neckR), 12, 0),
      new THREE.Vector3(safeR(params.topR), 22, 0)
    );
    const curvePoints = curve.getPoints(60);

    // 3D 좌표를 2D 화면 좌표로 변환하는 헬퍼 함수
    const to2D = (v: THREE.Vector3) => {
      const p = v.clone().project(cam);
      return { x: (p.x * 0.5 + 0.5) * width, y: (p.y * -0.5 + 0.5) * height };
    };

    const drawPath = (points3D: THREE.Vector3[]) => {
      let d = "";
      points3D.forEach((v, i) => {
        const p2d = to2D(v);
        d += (i === 0 ? "M " : "L ") + `${p2d.x.toFixed(2)} ${p2d.y.toFixed(2)} `;
      });
      return `<path d="${d}" fill="none" stroke="black" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" />\n`;
    };

    // 1. 가로 단일 패스 추출
    for (let i = 0; i <= params.hWires; i++) {
      const pt = curve.getPoint(i / params.hWires);
      const ringPoints: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const rad = (a / 64) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(pt.x * Math.cos(rad), pt.y, pt.x * Math.sin(rad)));
      }
      svgPaths += drawPath(ringPoints);
    }

    // 2. 세로 단일 패스 추출
    for (let j = 0; j < params.vWires; j++) {
      const angle = (j / params.vWires) * Math.PI * 2;
      const vPoints = curvePoints.map(pt => new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle)));
      svgPaths += drawPath(vPoints);
    }

    // 3. 사선 단일 패스 추출 (사선 드디어 완벽 포함)
    const createDiagonalPath = (dir: number) => {
      for (let k = 0; k < params.dWires; k++) {
        const startAngle = (k / params.dWires) * Math.PI * 2;
        const dPoints = curvePoints.map((pt, idx) => {
          const angle = startAngle + ((idx / curvePoints.length) * params.tilt * dir);
          return new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle));
        });
        svgPaths += drawPath(dPoints);
      }
    };
    createDiagonalPath(1); createDiagonalPath(-1);

    const fullSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:white">${svgPaths}</svg>`;
    const blob = new Blob([fullSVG], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = 'hojin-vessel-wireframe.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
    setIsExportOpen(false);
  };

  const handleExport = (type: string) => {
    if (type === 'PNG' && rendererRef.current) {
        const link = document.createElement('a');
        link.download = 'hojin-vessel.png';
        link.href = rendererRef.current.domElement.toDataURL();
        link.click();
    } else if (type === 'OBJ' && sceneRef.current) {
        const result = new OBJExporter().parse(sceneRef.current);
        const link = document.createElement('a');
        link.download = 'hojin-vessel.obj';
        link.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
        link.click();
    } else if (type === 'SVG') {
        exportSVG(); // 정밀 단일 패스 로직 실행
    }
    setIsExportOpen(false);
  };

  if (!mounted) return null;

  return (
    <main style={{ width: '100vw', height: '100vh', backgroundColor: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'move' }} />
      <div style={{ 
        position: 'absolute', top: '20px', left: '20px', padding: '25px', 
        backgroundColor: 'rgba(255,255,255,0.98)', border: '1px solid #ddd',
        borderRadius: '16px', color: '#111', width: '380px', maxHeight: '94vh', overflowY: 'auto', zIndex: 10, fontFamily: 'Arial, sans-serif'
      }}>
        <h2 style={{ fontSize: '0.9rem', letterSpacing: '1.5px', marginBottom: '25px', fontWeight: '900', borderBottom: '2px solid #000', paddingBottom: '12px' }}>METAL CRAFT STUDIO</h2>
        
        <Section title="CRAFT MATERIALS">
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' }}>
            {['stainless', 'silver', 'copper', 'brass', 'gold'].map(m => (
              <button key={m} onClick={() => setParams(p => ({...p, metalType: m}))}
                style={{
                  flex: '0 0 auto', padding: '8px 18px', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase',
                  border: '1px solid #ddd', borderRadius: '25px', cursor: 'pointer', fontFamily: 'Arial',
                  backgroundColor: params.metalType === m ? '#000' : '#fff', color: params.metalType === m ? '#fff' : '#000'
                }}>{m}</button>
            ))}
          </div>
        </Section>

        <Section title="FORM (SILHOUETTE)">
          <InputSlider label="Top" val={params.topR} min={0} max={40} onChange={v => setParams(p => ({...p, topR: v}))} />
          <InputSlider label="Neck" val={params.neckR} min={0} max={40} onChange={v => setParams(p => ({...p, neckR: v}))} />
          <InputSlider label="Belly" val={params.bellyR} min={0} max={60} onChange={v => setParams(p => ({...p, bellyR: v}))} />
          <InputSlider label="Base" val={params.baseR} min={0} max={40} onChange={v => setParams(p => ({...p, baseR: v}))} />
        </Section>

        <Section title="WEAVING">
          <InputSlider label="Tilt Angle" val={params.tilt} min={0} max={10} step={0.1} onChange={v => setParams(p => ({...p, tilt: v}))} />
          <InputSlider label="Diagonal" val={params.dWires} min={0} max={150} onChange={v => setParams(p => ({...p, dWires: v}))} />
          <InputSlider label="Horizontal" val={params.hWires} min={0} max={150} onChange={v => setParams(p => ({...p, hWires: v}))} />
          <InputSlider label="Vertical" val={params.vWires} min={0} max={200} onChange={v => setParams(p => ({...p, vWires: v}))} />
          <InputSlider label="Thickness" val={params.thickness} min={0.01} max={5} step={0.01} onChange={v => setParams(p => ({...p, thickness: v}))} />
        </Section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setIsExportOpen(!isExportOpen)} style={btnStyle('#0071e3', '#fff')}>EXPORT {isExportOpen ? '▴' : '▾'}</button>
            {isExportOpen && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '10px', boxShadow: '0 -5px 15px rgba(0,0,0,0.1)', marginBottom: '8px', overflow: 'hidden' }}>
                {['PNG', 'OBJ', 'SVG'].map(type => (
                  <button key={type} onClick={() => handleExport(type)} style={menuBtnStyle}>{type}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }} style={btnStyle('#f5f5f7', '#111', '1px solid #ddd')}>FULLSCREEN</button>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: '30px', right: '40px', color: 'rgba(0,0,0,0.4)', fontSize: '0.55rem', fontWeight: '300', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>@Designer Hojin Chun</div>
    </main>
  );
}

// UI 컴포넌트 라이브러리 (생략 없이 유지)
const btnStyle = (bg: string, col: string, border = 'none') => ({ width: '100%', padding: '14px', border: border, backgroundColor: bg, color: col, cursor: 'pointer', fontWeight: 'bold', borderRadius: '10px', fontSize: '0.7rem', fontFamily: 'Arial' });
const menuBtnStyle = { width: '100%', padding: '15px', border: 'none', borderBottom: '1px solid #f0f0f0', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.65rem', textAlign: 'left' as const, color: '#333', fontFamily: 'Arial' };
function InputSlider({ label, val, min, max, step = 1, onChange }: any) { return ( <div style={{ marginBottom: '16px' }}> <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}> <span style={{ fontSize: '0.65rem', color: '#555', fontWeight: '500' }}>{label}</span> <input type="number" value={val} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} style={{ width: '50px', border: '1px solid #ddd', fontSize: '0.65rem', textAlign: 'right', padding: '3px 6px', borderRadius: '4px', fontFamily: 'Arial' }} /> </div> <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#000' }} /> </div> ); }
function Section({ title, children }: any) { return <div style={{ marginBottom: '32px', borderBottom: '1px solid #eee', paddingBottom: '24px' }}> <label style={{ fontSize: '0.6rem', color: '#999', fontWeight: 'bold', display: 'block', marginBottom: '18px', letterSpacing: '2px', fontFamily: 'Arial' }}>{title}</label> {children} </div>; }