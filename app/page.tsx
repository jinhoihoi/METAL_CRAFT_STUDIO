"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';

export default function MasterCraftStudioPro() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false); 
  
  // 실무 수치 (mm) 기반 파라미터
  const [params, setParams] = useState({
    height: 180,      // 전체 높이 (mm)
    topR: 30,         // 상단 반지름 (mm)
    neckR: 15,        // 목 반지름 (mm)
    bellyR: 60,       // 몸통 반지름 (mm)
    baseR: 20,        // 하단 반지름 (mm)
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

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(150, 150, 300); // 실무 수치에 맞춰 카메라 거리 조정
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const safeR = (r: number) => Math.max(r, 0.001);
    const h2 = params.height / 2;

    // Y축 가변 높이가 적용된 정밀 곡선 설계
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(safeR(params.baseR), -h2, 0),
      new THREE.Vector3(safeR(params.bellyR) * 2, -h2 * 0.3, 0), // 몸통 위치 비율 조정
      new THREE.Vector3(safeR(params.neckR), h2 * 0.5, 0),      // 목 위치 비율 조정
      new THREE.Vector3(safeR(params.topR), h2, 0)
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

    if (params.hWires > 0) {
      for (let i = 0; i <= params.hWires; i++) {
          const pt = curve.getPoint(i / params.hWires);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(safeR(pt.x), params.thickness / 6, 8, 64), wireMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = pt.y;
          vesselGroup.add(ring);
      }
    }

    if (params.vWires > 0) {
      for (let j = 0; j < params.vWires; j++) {
        const angle = (j / params.vWires) * Math.PI * 2;
        const vPoints = points.map(pt => new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle)));
        vesselGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vPoints), 64, params.thickness / 8, 8, false), wireMat));
      }
    }

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
    mainLight.position.set(params.height, params.height, params.height);
    scene.add(mainLight);

    const animate = () => {
      const id = requestAnimationFrame(animate);
      controls.update(); renderer.render(scene, camera);
      return id;
    };
    const animationId = animate();
    return () => { cancelAnimationFrame(animationId); mountRef.current?.removeChild(renderer.domElement); };
  }, [mounted, params]);

  const exportSVG = () => {
    if (!cameraRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cam = cameraRef.current;
    
    let svgPaths = "";
    const safeR = (r: number) => Math.max(r, 0.001);
    const h2 = params.height / 2;
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(safeR(params.baseR), -h2, 0),
      new THREE.Vector3(safeR(params.bellyR) * 2, -h2 * 0.3, 0),
      new THREE.Vector3(safeR(params.neckR), h2 * 0.5, 0),
      new THREE.Vector3(safeR(params.topR), h2, 0)
    );
    const curvePoints = curve.getPoints(60);

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

    for (let i = 0; i <= params.hWires; i++) {
      const pt = curve.getPoint(i / params.hWires);
      const ringPoints: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const rad = (a / 64) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(pt.x * Math.cos(rad), pt.y, pt.x * Math.sin(rad)));
      }
      svgPaths += drawPath(ringPoints);
    }

    for (let j = 0; j < params.vWires; j++) {
      const angle = (j / params.vWires) * Math.PI * 2;
      const vPoints = curvePoints.map(pt => new THREE.Vector3(pt.x * Math.cos(angle), pt.y, pt.x * Math.sin(angle)));
      svgPaths += drawPath(vPoints);
    }

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
    link.download = `hojin-vessel-${params.height}mm.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setIsExportOpen(false);
  };

  const handleExport = (type: string) => {
    if (type === 'PNG' && rendererRef.current) {
        const link = document.createElement('a');
        link.download = `hojin-vessel-${params.height}mm.png`;
        link.href = rendererRef.current.domElement.toDataURL();
        link.click();
    } else if (type === 'OBJ' && sceneRef.current) {
        const result = new OBJExporter().parse(sceneRef.current);
        const link = document.createElement('a');
        link.download = `hojin-vessel-${params.height}mm.obj`;
        link.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
        link.click();
    } else if (type === 'SVG') {
        exportSVG();
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
        <h2 style={{ fontSize: '0.9rem', letterSpacing: '1.5px', marginBottom: '25px', fontWeight: '900', borderBottom: '2px solid #000', paddingBottom: '12px' }}>METAL CRAFT STUDIO PRO</h2>
        
        <Section title="PHYSICAL DIMENSIONS (mm)">
          <InputSlider label="Total Height" val={params.height} min={50} max={1000} onChange={v => setParams(p => ({...p, height: v}))} />
          <InputSlider label="Top Radius" val={params.topR} min={5} max={300} onChange={v => setParams(p => ({...p, topR: v}))} />
          <InputSlider label="Neck Radius" val={params.neckR} min={5} max={300} onChange={v => setParams(p => ({...p, neckR: v}))} />
          <InputSlider label="Belly Radius" val={params.bellyR} min={10} max={500} onChange={v => setParams(p => ({...p, bellyR: v}))} />
          <InputSlider label="Base Radius" val={params.baseR} min={5} max={300} onChange={v => setParams(p => ({...p, baseR: v}))} />
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

const btnStyle = (bg: string, col: string, border = 'none') => ({ width: '100%', padding: '14px', border: border, backgroundColor: bg, color: col, cursor: 'pointer', fontWeight: 'bold', borderRadius: '10px', fontSize: '0.7rem', fontFamily: 'Arial' });
const menuBtnStyle = { width: '100%', padding: '15px', border: 'none', borderBottom: '1px solid #f0f0f0', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.65rem', textAlign: 'left' as const, color: '#333', fontFamily: 'Arial' };
function InputSlider({ label, val, min, max, step = 1, onChange }: any) { return ( <div style={{ marginBottom: '16px' }}> <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}> <span style={{ fontSize: '0.65rem', color: '#555', fontWeight: '500' }}>{label}</span> <input type="number" value={val} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} style={{ width: '50px', border: '1px solid #ddd', fontSize: '0.65rem', textAlign: 'right', padding: '3px 6px', borderRadius: '4px', fontFamily: 'Arial' }} /> </div> <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#000' }} /> </div> ); }
function Section({ title, children }: any) { return <div style={{ marginBottom: '32px', borderBottom: '1px solid #eee', paddingBottom: '24px' }}> <label style={{ fontSize: '0.6rem', color: '#999', fontWeight: 'bold', display: 'block', marginBottom: '18px', letterSpacing: '2px', fontFamily: 'Arial' }}>{title}</label> {children} </div>; }