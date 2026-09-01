// Рисование полянки на canvas. Возвращает список нарисованных граней -
// по нему потом ищем, куда попал палец.

import type { Camera, Point, SideNormal, View } from './camera';
import { depthKey, project, sideCorners, topCorners, visibleSides } from './camera';
import type { Cell, Face } from './hit';
import type { Block, Bounds, Material } from './world';
import { MATERIALS } from './world';

export type Scene = {
  blocks: Block[];
  bounds: Bounds;
  camera: Camera;
  floors: number; // сколько нижних этажей видно
  xray: boolean; // просвет стен
  ghost: Cell | null; // куда встанет кубик
  ghostType: Material;
  erase: Cell | null; // какой кубик уберется
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

function drawGround(ctx: CanvasRenderingContext2D, scene: Scene, view: View, faces: Face[]) {
  const { bounds, camera } = scene;
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      const center = project(camera, bounds, x, z, 0, view);
      if (offScreen(center, view)) continue;
      const points = topCorners(camera, bounds, x, z, 0, view);
      const light = (x + z) % 2 === 0;
      polygon(ctx, points, light ? '#8fd06a' : '#84c661', '#6eaa54');
      faces.push({ points, x, z, y: -1, kind: 'ground', nx: 0, nz: 0 });
    }
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  block: Block,
  sides: SideNormal[],
  faces: Face[],
) {
  const { bounds, camera, xray } = scene;
  const palette = MATERIALS[block.type];
  const edge = xray ? 'rgba(75,81,69,.55)' : '#4b5145';

  ctx.globalAlpha = xray ? 0.42 : 1;
  sides.forEach((side) => {
    const points = sideCorners(camera, bounds, block.x, block.z, block.y, side, view);
    const fill = side.nx !== 0 ? palette.color : palette.side;
    polygon(ctx, points, fill, edge);
    faces.push({ points, x: block.x, z: block.z, y: block.y, kind: 'side', nx: side.nx, nz: side.nz });
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
  ctx.globalAlpha = 1;
  faces.push({ points: top, x: block.x, z: block.z, y: block.y, kind: 'top', nx: 0, nz: 0 });
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
  const faces: Face[] = [];
  drawSky(ctx, view);
  drawGround(ctx, scene, view, faces);

  const sides = visibleSides(scene.camera);
  const visible = scene.blocks
    .filter((block) => block.y < scene.floors)
    .sort((a, b) => depthKey(scene.camera, a.x, a.z) - depthKey(scene.camera, b.x, b.z) || a.y - b.y);
  visible.forEach((block) => drawBlock(ctx, scene, view, block, sides, faces));

  if (scene.erase) drawEraseMark(ctx, scene, view, scene.erase);
  else if (scene.ghost) drawGhost(ctx, scene, view, scene.ghost);

  return faces;
}
