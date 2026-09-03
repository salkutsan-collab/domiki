// Рисование полянки на canvas. Возвращает список нарисованных граней -
// по нему потом ищем, куда попал палец.

import type { Camera, Point, SideNormal, View } from './camera';
import { depthKey, project, sideCorners, topCorners, visibleSides } from './camera';
import type { Cell, Face } from './hit';
import type { Walker } from './walkers';
import { walkerAt } from './walkers';
import type { Block, Bounds, Material } from './world';
import { MATERIALS, WATER } from './world';

export type Scene = {
  blocks: Block[];
  bounds: Bounds;
  camera: Camera;
  floors: number; // сколько нижних этажей видно
  xray: boolean; // просвет стен
  ghost: Cell | null; // куда встанет кубик
  ghostType: Material;
  erase: Cell | null; // какой кубик уберется
  walkers: Walker[];
  now: number;
  collect?: boolean; // собирать ли грани для попадания пальцем
};

const CLOUDS: [number, number, number][] = [[0.11, 0.15, 0.06], [0.84, 0.19, 0.07], [0.72, 0.08, 0.04]];
const CULL_MARGIN = 90;

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke: string, lineWidth = 1.25) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function outline(ctx: CanvasRenderingContext2D, points: Point[], stroke: string, lineWidth: number) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function offScreen(point: Point, view: View) {
  return (
    point.x < -CULL_MARGIN ||
    point.x > view.width + CULL_MARGIN ||
    point.y < -CULL_MARGIN ||
    point.y > view.height + CULL_MARGIN
  );
}

function drawSky(ctx: CanvasRenderingContext2D, view: View) {
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, '#bfeaff');
  sky.addColorStop(0.65, '#e9f8ff');
  sky.addColorStop(1, '#fff6d7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  CLOUDS.forEach(([fx, fy, fr]) => {
    const r = fr * view.width;
    ctx.beginPath();
    ctx.ellipse(fx * view.width, fy * view.height, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGround(ctx: CanvasRenderingContext2D, scene: Scene, view: View, faces: Face[] | null) {
  const { bounds, camera } = scene;
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      const center = project(camera, bounds, x, z, 0, view);
      if (offScreen(center, view)) continue;
      const points = topCorners(camera, bounds, x, z, 0, view);
      const light = (x + z) % 2 === 0;
      polygon(ctx, points, light ? '#8fd06a' : '#84c661', '#6eaa54');
      faces?.push({ points, x, z, y: -1, kind: 'ground', nx: 0, nz: 0 });
    }
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  block: Block,
  sides: SideNormal[],
  faces: Face[] | null,
) {
  const { bounds, camera, xray } = scene;
  const palette = MATERIALS[block.type];
  const wet = block.type === WATER;
  const edge = xray || wet ? 'rgba(75,81,69,.55)' : '#4b5145';

  // Сквозь воду видно дно и пловца, поэтому она всегда полупрозрачная.
  ctx.globalAlpha = xray ? 0.42 : wet ? 0.62 : 1;
  sides.forEach((side) => {
    const points = sideCorners(camera, bounds, block.x, block.z, block.y, side, view);
    const fill = side.nx !== 0 ? palette.color : palette.side;
    polygon(ctx, points, fill, edge);
    faces?.push({ points, x: block.x, z: block.z, y: block.y, kind: 'side', nx: side.nx, nz: side.nz });
  });

  const top = topCorners(camera, bounds, block.x, block.z, block.y + 1, view);
  polygon(ctx, top, palette.top, edge);
  if (block.type === 'glass') {
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    ctx.lineTo(top[2].x, top[2].y);
    ctx.stroke();
  }
  if (wet) {
    // Две коротких волны поперек клетки - чтобы вода читалась как вода.
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    [0.38, 0.62].forEach((along) => {
      const a = { x: top[0].x + (top[1].x - top[0].x) * along, y: top[0].y + (top[1].y - top[0].y) * along };
      const b = { x: top[3].x + (top[2].x - top[3].x) * along, y: top[3].y + (top[2].y - top[3].y) * along };
      ctx.beginPath();
      ctx.moveTo(a.x + (b.x - a.x) * 0.28, a.y + (b.y - a.y) * 0.28);
      ctx.lineTo(a.x + (b.x - a.x) * 0.72, a.y + (b.y - a.y) * 0.72);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  faces?.push({ points: top, x: block.x, z: block.z, y: block.y, kind: 'top', nx: 0, nz: 0 });
}

// Коробка произвольного размера в клетке - из таких собраны жители и овечки.
function drawBox(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  bounds: Bounds,
  view: View,
  place: { x: number; z: number; low: number; high: number; half: number },
  sides: SideNormal[],
  colors: { top: string; light: string; dark: string },
) {
  const { x, z, low, high, half } = place;
  sides.forEach((side) => {
    const alongX = side.nx !== 0;
    const fixed = alongX ? x + side.nx * half : z + side.nz * half;
    const from = alongX ? z - half : x - half;
    const to = alongX ? z + half : x + half;
    const corner = (edge: number, height: number) =>
      alongX
        ? project(camera, bounds, fixed, edge, height, view)
        : project(camera, bounds, edge, fixed, height, view);
    polygon(ctx, [corner(from, high), corner(to, high), corner(to, low), corner(from, low)],
      alongX ? colors.light : colors.dark, 'rgba(58,64,54,.75)');
  });
  polygon(ctx, [
    project(camera, bounds, x - half, z - half, high, view),
    project(camera, bounds, x + half, z - half, high, view),
    project(camera, bounds, x + half, z + half, high, view),
    project(camera, bounds, x - half, z + half, high, view),
  ], colors.top, 'rgba(58,64,54,.75)');
}

function shade(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16);
  const mix = (part: number) => Math.max(0, Math.min(255, Math.round(part * factor)));
  return `rgb(${mix((value >> 16) & 255)}, ${mix((value >> 8) & 255)}, ${mix(value & 255)})`;
}

// Круги по воде вокруг пловца.
function drawRipple(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  spot: { x: number; z: number; y: number },
) {
  const { bounds, camera } = scene;
  const centre = project(camera, bounds, spot.x, spot.z, spot.y + 1, view);
  const right = project(camera, bounds, spot.x + 0.42, spot.z, spot.y + 1, view);
  const radius = Math.max(4, Math.abs(right.x - centre.x));
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 2;
  [1, 0.62].forEach((scale) => {
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius * scale, radius * scale * Math.sin(camera.pitch), 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  spot: { x: number; z: number; y: number; hop: number; sink: number },
  color: string,
  sides: SideNormal[],
) {
  const { bounds, camera } = scene;
  const base = spot.y + spot.hop - spot.sink;
  if (spot.sink > 0.05) drawRipple(ctx, scene, view, spot);
  const shirt = { top: shade(color, 1.25), light: color, dark: shade(color, 0.72) };
  const skin = { top: '#ffe0bd', light: '#f6cfa4', dark: '#d8ab7d' };
  drawBox(ctx, camera, bounds, view, { x: spot.x, z: spot.z, low: base, high: base + 0.62, half: 0.19 }, sides, shirt);
  drawBox(ctx, camera, bounds, view, { x: spot.x, z: spot.z, low: base + 0.62, high: base + 1.02, half: 0.15 }, sides, skin);
}

function drawSheep(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  spot: { x: number; z: number; y: number; hop: number; sink: number },
  sides: SideNormal[],
) {
  const { bounds, camera } = scene;
  const base = spot.y + spot.hop;
  const wool = { top: '#ffffff', light: '#f2f1ea', dark: '#d9d7cc' };
  const face = { top: '#5b5750', light: '#4c4842', dark: '#3b3833' };
  drawBox(ctx, camera, bounds, view, { x: spot.x, z: spot.z, low: base + 0.12, high: base + 0.6, half: 0.26 }, sides, wool);
  drawBox(ctx, camera, bounds, view, { x: spot.x + 0.22, z: spot.z + 0.22, low: base + 0.1, high: base + 0.42, half: 0.12 }, sides, face);
}

// Имя пишем поверх всего: иначе своего человечка не найти за стеной.
function drawName(ctx: CanvasRenderingContext2D, scene: Scene, view: View, walker: Walker) {
  const spot = walkerAt(walker, scene.now);
  const head = project(scene.camera, scene.bounds, spot.x, spot.z, spot.y + spot.hop - spot.sink + 1.15, view);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(walker.name).width + 14;
  ctx.fillStyle = 'rgba(255,255,255,.86)';
  ctx.strokeStyle = 'rgba(41,77,61,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(head.x - width / 2, head.y - 11, width, 22, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#294d3d';
  ctx.fillText(walker.name, head.x, head.y + 1);
}

function drawGhost(ctx: CanvasRenderingContext2D, scene: Scene, view: View, cell: Cell) {
  const { bounds, camera, ghostType } = scene;
  const palette = MATERIALS[ghostType];
  const sides = visibleSides(camera);
  ctx.globalAlpha = 0.45;
  sides.forEach((side) => {
    const points = sideCorners(camera, bounds, cell.x, cell.z, cell.y, side, view);
    polygon(ctx, points, side.nx !== 0 ? palette.color : palette.side, 'rgba(255,255,255,.9)', 2);
  });
  const top = topCorners(camera, bounds, cell.x, cell.z, cell.y + 1, view);
  polygon(ctx, top, palette.top, 'rgba(255,255,255,.9)', 2);
  ctx.globalAlpha = 1;
  outline(ctx, top, '#ffffff', 3);
}

function drawEraseMark(ctx: CanvasRenderingContext2D, scene: Scene, view: View, cell: Cell) {
  const { bounds, camera } = scene;
  const sides = visibleSides(camera);
  ctx.globalAlpha = 0.5;
  sides.forEach((side) => {
    const points = sideCorners(camera, bounds, cell.x, cell.z, cell.y, side, view);
    polygon(ctx, points, '#ff4c4c', 'rgba(255,255,255,.9)', 2);
  });
  const top = topCorners(camera, bounds, cell.x, cell.z, cell.y + 1, view);
  polygon(ctx, top, '#ff6b6b', 'rgba(255,255,255,.9)', 2);
  ctx.globalAlpha = 1;
  outline(ctx, top, '#ffffff', 3);
}

export function drawScene(ctx: CanvasRenderingContext2D, view: View, scene: Scene): Face[] {
  const collect = scene.collect !== false;
  const faces: Face[] = [];
  const sink = collect ? faces : null;
  drawSky(ctx, view);
  drawGround(ctx, scene, view, sink);

  const sides = visibleSides(scene.camera);

  // Кубики и фигурки рисуем в одном порядке - от дальних к ближним, снизу вверх.
  // Иначе житель за стеной оказался бы нарисован поверх нее.
  type Item = { depth: number; y: number; draw: () => void };
  const items: Item[] = [];

  scene.blocks
    .filter((block) => block.y < scene.floors)
    .forEach((block) => {
      items.push({
        depth: depthKey(scene.camera, block.x, block.z),
        y: block.y,
        draw: () => drawBlock(ctx, scene, view, block, sides, sink),
      });
    });

  scene.walkers.forEach((walker) => {
    const spot = walkerAt(walker, scene.now);
    if (spot.y >= scene.floors) return;
    items.push({
      depth: depthKey(scene.camera, spot.x, spot.z),
      y: spot.y + 0.5,
      draw: () =>
        walker.kind === 'person'
          ? drawPerson(ctx, scene, view, spot, walker.color, sides)
          : drawSheep(ctx, scene, view, spot, sides),
    });
  });

  items.sort((a, b) => a.depth - b.depth || a.y - b.y).forEach((item) => item.draw());

  if (scene.erase) drawEraseMark(ctx, scene, view, scene.erase);
  else if (scene.ghost) drawGhost(ctx, scene, view, scene.ghost);

  scene.walkers
    .filter((walker) => walker.kind === 'person' && walkerAt(walker, scene.now).y < scene.floors)
    .forEach((walker) => drawName(ctx, scene, view, walker));

  return faces;
}
