import { useCallback, useEffect, useRef, useState } from 'react';
import { Hammer, House, Maximize2, RotateCcw, RotateCw, Save, Sparkles, TabletSmartphone, Trash2, Undo2 } from 'lucide-react';

const BOARD = 12;
const TILE_W = 52;
const TILE_H = 27;
const BLOCK_H = 34;
const MAX_HEIGHT = 7;

const materials = {
  wood: { name: 'Дерево', color: '#d58a45', top: '#efb66f', side: '#aa6130' },
  brick: { name: 'Кирпич', color: '#dd654f', top: '#f48d76', side: '#ad4638' },
  glass: { name: 'Окошко', color: '#75cce8', top: '#c2eff8', side: '#429bbd' },
  roof: { name: 'Крыша', color: '#8d5ad0', top: '#b48bea', side: '#6841a6' },
  stone: { name: 'Камень', color: '#9aa4ad', top: '#c8cfd4', side: '#737d86' },
  yellow: { name: 'Солнышко', color: '#f5c84c', top: '#ffe98c', side: '#c89424' },
} as const;

type Material = keyof typeof materials;
type Mode = 'build' | 'erase';
type Block = { x: number; z: number; y: number; type: Material };
type Point = { x: number; y: number };
type HitRegion = { polygon: Point[]; x: number; z: number; y: number; block: boolean };

const starterBlocks: Block[] = [
  { x: 1, z: 1, y: 0, type: 'yellow' },
  { x: 1, z: 1, y: 1, type: 'yellow' },
  { x: 1, z: 1, y: 2, type: 'wood' },
];

function rotatePoint(x: number, z: number, rotation: number) {
  if (rotation === 1) return { x: z, z: BOARD - 1 - x };
  if (rotation === 2) return { x: BOARD - 1 - x, z: BOARD - 1 - z };
  if (rotation === 3) return { x: BOARD - 1 - z, z: x };
  return { x, z };
}

function project(x: number, z: number, y: number, rotation: number) {
  const rotated = rotatePoint(x, z, rotation);
  return { x: 550 + (rotated.x - rotated.z) * (TILE_W / 2), y: 115 + (rotated.x + rotated.z) * (TILE_H / 2) - y * BLOCK_H };
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke = '#365640') {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

function containsPoint(point: Point, polygonPoints: Point[]) {
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const a = polygonPoints[i];
    const b = polygonPoints[j];
    const intersects = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function makeHouse(): Block[] {
  const house: Block[] = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 3; x <= 8; x += 1) {
      for (let z = 3; z <= 8; z += 1) {
        if (!(x === 3 || x === 8 || z === 3 || z === 8)) continue;
        if (z === 8 && (x === 5 || x === 6) && y < 2) continue;
        const windowBlock = y === 1 && ((z === 3 && (x === 5 || x === 6)) || (x === 3 && z === 5));
        house.push({ x, z, y, type: windowBlock ? 'glass' : 'brick' });
      }
    }
  }
  for (let x = 2; x <= 9; x += 1) for (let z = 2; z <= 9; z += 1) house.push({ x, z, y: 3, type: 'roof' });
  for (let x = 3; x <= 8; x += 1) for (let z = 3; z <= 8; z += 1) house.push({ x, z, y: 4, type: 'roof' });
  for (let x = 4; x <= 7; x += 1) for (let z = 4; z <= 7; z += 1) house.push({ x, z, y: 5, type: 'roof' });
  return house;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRegions = useRef<HitRegion[]>([]);
  const [blocks, setBlocks] = useState<Block[]>(starterBlocks);
  const [history, setHistory] = useState<Block[][]>([]);
  const [material, setMaterial] = useState<Material>('wood');
  const [mode, setMode] = useState<Mode>('build');
  const [rotation, setRotation] = useState(0);
  const [hovered, setHovered] = useState<HitRegion | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('domiki-world-v1');
      if (stored) setBlocks(JSON.parse(stored));
    } catch { /* Start fresh if storage is unavailable. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem('domiki-world-v1', JSON.stringify(blocks));
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 900);
    return () => window.clearTimeout(timer);
  }, [blocks, ready]);

  const remember = useCallback((next: Block[]) => {
    setBlocks((current) => {
      setHistory((items) => [...items.slice(-24), current]);
      return next;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#bfeaff'); sky.addColorStop(0.65, '#e9f8ff'); sky.addColorStop(1, '#fff6d7');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    [[125, 95, 64], [920, 120, 78], [790, 54, 46]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.fill(); });

    const regions: HitRegion[] = [];
    const cells = Array.from({ length: BOARD * BOARD }, (_, index) => ({ x: index % BOARD, z: Math.floor(index / BOARD) })).sort((a, b) => {
      const ra = rotatePoint(a.x, a.z, rotation); const rb = rotatePoint(b.x, b.z, rotation);
      return ra.x + ra.z - (rb.x + rb.z);
    });
    cells.forEach(({ x, z }) => {
      const p = project(x, z, 0, rotation);
      const top = [{ x: p.x, y: p.y - TILE_H / 2 }, { x: p.x + TILE_W / 2, y: p.y }, { x: p.x, y: p.y + TILE_H / 2 }, { x: p.x - TILE_W / 2, y: p.y }];
      polygon(ctx, top, (x + z) % 2 === 0 ? '#8fd06a' : '#84c661', '#6eaa54');
      regions.push({ polygon: top, x, z, y: -1, block: false });
    });

    [...blocks].sort((a, b) => {
      const ra = rotatePoint(a.x, a.z, rotation); const rb = rotatePoint(b.x, b.z, rotation);
      return ra.x + ra.z - (rb.x + rb.z) || a.y - b.y;
    }).forEach((block) => {
      const p = project(block.x, block.z, block.y, rotation); const palette = materials[block.type];
      const top = [{ x: p.x, y: p.y - TILE_H / 2 - BLOCK_H }, { x: p.x + TILE_W / 2, y: p.y - BLOCK_H }, { x: p.x, y: p.y + TILE_H / 2 - BLOCK_H }, { x: p.x - TILE_W / 2, y: p.y - BLOCK_H }];
      const left = [top[3], top[2], { x: top[2].x, y: top[2].y + BLOCK_H }, { x: top[3].x, y: top[3].y + BLOCK_H }];
      const right = [top[2], top[1], { x: top[1].x, y: top[1].y + BLOCK_H }, { x: top[2].x, y: top[2].y + BLOCK_H }];
      polygon(ctx, left, palette.side, '#4b5145'); polygon(ctx, right, palette.color, '#4b5145'); polygon(ctx, top, palette.top, '#4b5145');
      if (block.type === 'glass') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(top[3].x + 12, top[3].y + 2); ctx.lineTo(top[1].x - 12, top[1].y - 2); ctx.stroke(); }
      regions.push({ polygon: left, x: block.x, z: block.z, y: block.y, block: true });
      regions.push({ polygon: right, x: block.x, z: block.z, y: block.y, block: true });
      regions.push({ polygon: top, x: block.x, z: block.z, y: block.y, block: true });
    });

    if (hovered) {
      const p = project(hovered.x, hovered.z, hovered.y + 1, rotation);
      const top = [{ x: p.x, y: p.y - TILE_H / 2 }, { x: p.x + TILE_W / 2, y: p.y }, { x: p.x, y: p.y + TILE_H / 2 }, { x: p.x - TILE_W / 2, y: p.y }];
      ctx.fillStyle = mode === 'erase' && hovered.block ? 'rgba(255,76,76,.45)' : 'rgba(255,255,255,.42)';
      ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); top.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    }
    hitRegions.current = regions;
  }, [blocks, hovered, mode, rotation]);

  const locate = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
    return [...hitRegions.current].reverse().find((region) => containsPoint(point, region.polygon)) ?? null;
  };

  const actOnRegion = (region: HitRegion | null) => {
    if (!region) return;
    if (mode === 'erase') {
      if (region.block) {
        remember(blocks.filter((block) => !(block.x === region.x && block.z === region.z && block.y === region.y)));
        navigator.vibrate?.(12);
      }
      return;
    }
    const nextY = region.y + 1;
    if (nextY >= MAX_HEIGHT || blocks.some((block) => block.x === region.x && block.z === region.z && block.y === nextY)) return;
    remember([...blocks, { x: region.x, z: region.z, y: nextY, type: material }]);
    navigator.vibrate?.(12);
  };

  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (previous) setBlocks(previous);
      return items.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keys = Object.keys(materials) as Material[]; const materialIndex = Number(event.key) - 1;
      if (materialIndex >= 0 && materialIndex < keys.length) { setMaterial(keys[materialIndex]); setMode('build'); }
      if (event.key.toLowerCase() === 'r') setRotation((value) => (value + 1) % 4);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  const resetWorld = () => { if (window.confirm('Очистить всю полянку и начать заново?')) remember([]); };
  const buildExample = () => {
    if (blocks.length > 3 && !window.confirm('Заменить текущую постройку готовым домиком?')) return;
    remember(makeHouse()); setMode('build');
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* Fullscreen is optional on some Android browsers. */ }
  };

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-cube" aria-hidden="true">◆</span><div><p className="eyebrow">Твоя строительная полянка</p><h1>Домики</h1></div></div>
        <div className="top-actions">
          <button className="fullscreen-button" onClick={toggleFullscreen}><Maximize2 size={18} /> Во весь экран</button>
          <div className={`save-status ${saved ? 'is-saving' : ''}`} aria-live="polite"><Save size={17} /> {saved ? 'Сохранено!' : 'Всё сохранится само'}</div>
        </div>
      </header>
      <div className="rotate-tip"><TabletSmartphone size={20} /><span>Поверни планшет боком — так строить удобнее</span></div>
      <section className="workspace" aria-label="Игра Домики">
        <aside className="toolbox">
          <div className="toolbox-title"><Hammer size={20} /><span>Выбери кубик</span></div>
          <div className="materials" role="list" aria-label="Материалы">
            {(Object.entries(materials) as [Material, (typeof materials)[Material]][]).map(([key, item], index) => (
              <button key={key} className={`material ${material === key && mode === 'build' ? 'active' : ''}`} onClick={() => { setMaterial(key); setMode('build'); }} aria-pressed={material === key && mode === 'build'} title={`Клавиша ${index + 1}`}>
                <span className="material-swatch" style={{ '--swatch': item.color, '--swatch-top': item.top } as React.CSSProperties} /><span>{item.name}</span><kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
          <button className={`eraser ${mode === 'erase' ? 'active' : ''}`} onClick={() => setMode('erase')} aria-pressed={mode === 'erase'}><Trash2 size={20} /> Убрать кубик</button>
        </aside>
        <div className="play-area">
          <canvas ref={canvasRef} width={1100} height={650} aria-label="Полянка для строительства из кубиков" onPointerMove={(event) => setHovered(locate(event.clientX, event.clientY))} onPointerLeave={() => setHovered(null)} onPointerDown={(event) => actOnRegion(locate(event.clientX, event.clientY))} />
          <div className="hint-bubble"><Sparkles size={16} />{mode === 'build' ? 'Нажми на полянку или кубик, чтобы строить' : 'Нажми на верхний кубик, чтобы убрать'}</div>
          <div className="view-controls" aria-label="Поворот полянки"><button onClick={() => setRotation((rotation + 3) % 4)} aria-label="Повернуть влево"><RotateCcw size={22} /></button><span>Повернуть</span><button onClick={() => setRotation((rotation + 1) % 4)} aria-label="Повернуть вправо"><RotateCw size={22} /></button></div>
        </div>
        <aside className="actions">
          <div className="mission-card"><span className="mission-icon"><House size={26} /></span><p className="eyebrow">Идея для старта</p><h2>Построй уютный дом</h2><p>Сделай стены, добавь голубые окошки и фиолетовую крышу.</p></div>
          <button className="primary-action" onClick={buildExample}><House size={19} /> Показать домик</button>
          <button className="secondary-action" onClick={undo} disabled={!history.length}><Undo2 size={19} /> Отменить шаг</button>
          <button className="quiet-action" onClick={resetWorld}><RotateCcw size={17} /> Новая полянка</button>
          <div className="counter"><strong>{blocks.length}</strong><span>кубиков на полянке</span></div>
        </aside>
      </section>
    </main>
  );
}
