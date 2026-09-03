// Как ходят жители и овечки.
//
// Житель стоит на клетке, если сама клетка пустая, а под ногами кубик (или трава).
// Шагает в соседнюю клетку на своем уровне, на кубик выше или на кубик ниже -
// так он входит в дом через дверной проем и поднимается по ступенькам на крышу.
// В воде житель плавает: держится на поверхности пруда и выбирается на берег.
// Овечка проще: только по ровной траве, в воду не заходит и никуда не забирается.

import type { Camera, Point, View } from './camera';
import { depthKey, project } from './camera';
import type { Block, Bounds, Person, Sheep } from './world';
import { WATER, insideBounds } from './world';

export type Spot = { x: number; z: number; y: number };

// Клетки полянки разделены на две карты: твердое и вода. Разница в том,
// что сквозь твердое не пройти, а в воде можно плыть.
export type Terrain = { solid: Set<string>; water: Set<string> };

export type Walker = {
  id: string;
  kind: 'person' | 'sheep';
  name: string;
  color: string;
  from: Spot;
  to: Spot;
  fromWater: boolean;
  toWater: boolean;
  startedAt: number;
  arriveAt: number;
};

const STEP_PERSON = 850; // сколько миллисекунд занимает один шаг
const STEP_SHEEP = 1300;
const STEP_SWIM = 1150; // в воде медленнее, чем по траве
const REST_PERSON = 900; // и сколько потом можно постоять
const REST_SHEEP = 2200;

export const SINK = 0.45; // насколько пловец погружается в воду

const NEIGHBOURS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

export function cellKey(x: number, z: number, y: number) {
  return `${x},${z},${y}`;
}

export function terrain(blocks: Block[]): Terrain {
  const solid = new Set<string>();
  const water = new Set<string>();
  blocks.forEach((block) => {
    const key = cellKey(block.x, block.z, block.y);
    if (block.type === WATER) water.add(key);
    else solid.add(key);
  });
  return { solid, water };
}

export function isWater(land: Terrain, x: number, z: number, y: number) {
  return land.water.has(cellKey(x, z, y));
}

// Стоять можно на пустой клетке, под которой твердый кубик или трава.
// Вода опоры не дает: над прудом не постоишь, в него плюхаешься.
export function canStand(land: Terrain, bounds: Bounds, x: number, z: number, y: number) {
  if (!insideBounds(bounds, x, z) || y < 0) return false;
  const here = cellKey(x, z, y);
  if (land.solid.has(here) || land.water.has(here)) return false;
  return y === 0 || land.solid.has(cellKey(x, z, y - 1));
}

// Плавают только по поверхности: над головой должно быть открытое небо,
// а не следующий слой воды и не кубик. Под воду житель не ныряет.
export function canSwim(land: Terrain, bounds: Bounds, x: number, z: number, y: number) {
  if (!insideBounds(bounds, x, z) || y < 0) return false;
  if (!land.water.has(cellKey(x, z, y))) return false;
  const above = cellKey(x, z, y + 1);
  return !land.solid.has(above) && !land.water.has(above);
}

export function canBe(land: Terrain, bounds: Bounds, x: number, z: number, y: number, swims: boolean) {
  return canStand(land, bounds, x, z, y) || (swims && canSwim(land, bounds, x, z, y));
}

// Куда можно шагнуть с этого места. Человек умеет вверх и вниз на один кубик
// и плавает; овечка - только по ровной траве.
export function stepOptions(land: Terrain, bounds: Bounds, at: Spot, climbs: boolean): Spot[] {
  const levels = climbs ? [at.y, at.y + 1, at.y - 1] : [0];
  const options: Spot[] = [];
  NEIGHBOURS.forEach(({ dx, dz }) => {
    const x = at.x + dx;
    const z = at.z + dz;
    for (const y of levels) {
      // Через потолок не пролезть: чтобы подняться, над головой должно быть пусто.
      if (y > at.y && land.solid.has(cellKey(at.x, at.z, at.y + 1))) continue;
      if (canBe(land, bounds, x, z, y, climbs)) {
        options.push({ x, z, y });
        break;
      }
    }
  });
  return options;
}

// Ближайшее место, где фигурка может быть: ставим ее туда, куда ткнули пальцем.
export function landingSpot(land: Terrain, bounds: Bounds, x: number, z: number, climbs: boolean) {
  const levels = climbs ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [0];
  for (const y of levels) {
    if (canBe(land, bounds, x, z, y, climbs)) return { x, z, y };
  }
  return null;
}

export function makeWalker(
  kind: 'person' | 'sheep',
  id: string,
  name: string,
  color: string,
  at: Spot,
  wet: boolean,
  now: number,
): Walker {
  return {
    id,
    kind,
    name,
    color,
    from: at,
    to: at,
    fromWater: wet,
    toWater: wet,
    startedAt: now,
    arriveAt: now,
  };
}

export function walkersFor(
  world: { people: Person[]; sheep: Sheep[] },
  land: Terrain,
  now: number,
): Walker[] {
  const people = world.people.map((person) => {
    const at = { x: person.x, z: person.z, y: person.y };
    return makeWalker('person', person.id, person.name, person.color, at, isWater(land, at.x, at.z, at.y), now);
  });
  const sheep = world.sheep.map((one) =>
    makeWalker('sheep', one.id, '', '#ffffff', { x: one.x, z: one.z, y: 0 }, false, now),
  );
  return [...people, ...sheep];
}

// Один шаг жизни. Пока идет - ничего не меняем; дошел - выбираем, куда дальше.
export function advance(
  walker: Walker,
  land: Terrain,
  bounds: Bounds,
  now: number,
  roll = Math.random(),
): Walker {
  if (now < walker.arriveAt) return walker;

  const climbs = walker.kind === 'person';
  const restTime = climbs ? REST_PERSON : REST_SHEEP;
  const standing = walker.to;
  const wet = (spot: Spot) => isWater(land, spot.x, spot.z, spot.y);
  const wait = (at: Spot) => ({
    ...walker,
    from: at,
    to: at,
    fromWater: wet(at),
    toWater: wet(at),
    startedAt: now,
    arriveAt: now + restTime,
  });

  // Если под фигуркой построили кубик, ее замуровали или пруд осушили -
  // переставим на ближайшее подходящее место.
  if (!canBe(land, bounds, standing.x, standing.z, standing.y, climbs)) {
    const rescued = landingSpot(land, bounds, standing.x, standing.z, climbs);
    return wait(rescued ?? standing);
  }

  const options = stepOptions(land, bounds, standing, climbs);
  // Иногда просто постоять - так живее, чем бесконечная беготня.
  if (!options.length || roll < 0.18) return wait(standing);

  const pick = options[Math.min(options.length - 1, Math.floor(((roll - 0.18) / 0.82) * options.length))];
  const toWater = wet(pick);
  const fromWater = wet(standing);
  return {
    ...walker,
    from: standing,
    to: pick,
    fromWater,
    toWater,
    startedAt: now,
    arriveAt: now + (toWater || fromWater ? STEP_SWIM : climbs ? STEP_PERSON : STEP_SHEEP),
  };
}

// Где фигурка прямо сейчас: плавно между «откуда» и «куда».
export function walkerAt(walker: Walker, now: number) {
  const span = walker.arriveAt - walker.startedAt;
  const done = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - walker.startedAt) / span));
  const eased = done * done * (3 - 2 * done);
  const still = walker.from.x === walker.to.x && walker.from.z === walker.to.z;
  const sink = (walker.fromWater ? SINK : 0) + ((walker.toWater ? SINK : 0) - (walker.fromWater ? SINK : 0)) * eased;
  // На воде фигурка покачивается, на суше подпрыгивает в шаге.
  const bob = sink > 0 ? Math.sin((now + walker.startedAt) / 520) * 0.05 : 0;
  return {
    x: walker.from.x + (walker.to.x - walker.from.x) * eased,
    z: walker.from.z + (walker.to.z - walker.from.z) * eased,
    y: walker.from.y + (walker.to.y - walker.from.y) * eased,
    hop: still || sink > 0 ? bob : Math.sin(done * Math.PI) * 0.12,
    sink,
  };
}

// В кого ткнули пальцем. Берем ближнюю к смотрящему фигурку рядом с точкой.
export function pickWalker(
  walkers: Walker[],
  camera: Camera,
  bounds: Bounds,
  view: View,
  point: Point,
  now: number,
  radius = 26,
): Walker | null {
  let best: Walker | null = null;
  let bestDepth = -Infinity;
  walkers.forEach((walker) => {
    const spot = walkerAt(walker, now);
    const body = project(camera, bounds, spot.x, spot.z, spot.y + spot.hop - spot.sink + 0.4, view);
    if (Math.hypot(body.x - point.x, body.y - point.y) > radius) return;
    const depth = depthKey(camera, spot.x, spot.z);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = walker;
    }
  });
  return best;
}
