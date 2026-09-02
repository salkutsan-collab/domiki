// Как ходят жители и овечки.
//
// Житель стоит на клетке, если сама клетка пустая, а под ногами кубик (или трава).
// Шагает в соседнюю клетку на своем уровне, на кубик выше или на кубик ниже -
// так он входит в дом через дверной проем и поднимается по ступенькам на крышу.
// Овечка проще: только по траве, ничего не перешагивает.

import type { Camera, Point, View } from './camera';
import { depthKey, project } from './camera';
import type { Block, Bounds, Person, Sheep } from './world';
import { insideBounds } from './world';

export type Spot = { x: number; z: number; y: number };
export type Occupied = Set<string>;

export type Walker = {
  id: string;
  kind: 'person' | 'sheep';
  name: string;
  color: string;
  from: Spot;
  to: Spot;
  startedAt: number;
  arriveAt: number;
};

const STEP_PERSON = 850; // сколько миллисекунд занимает один шаг
const STEP_SHEEP = 1300;
const REST_PERSON = 900; // и сколько потом можно постоять
const REST_SHEEP = 2200;

const NEIGHBOURS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

export function cellKey(x: number, z: number, y: number) {
  return `${x},${z},${y}`;
}

export function occupied(blocks: Block[]): Occupied {
  return new Set(blocks.map((block) => cellKey(block.x, block.z, block.y)));
}

export function canStand(taken: Occupied, bounds: Bounds, x: number, z: number, y: number) {
  if (!insideBounds(bounds, x, z)) return false;
  if (y < 0) return false;
  if (taken.has(cellKey(x, z, y))) return false;
  return y === 0 || taken.has(cellKey(x, z, y - 1));
}

// Куда можно шагнуть с этого места. Человек умеет вверх и вниз на один кубик,
// овечка - только по ровной траве.
export function stepOptions(taken: Occupied, bounds: Bounds, at: Spot, climbs: boolean): Spot[] {
  const levels = climbs ? [at.y, at.y + 1, at.y - 1] : [0];
  const options: Spot[] = [];
  NEIGHBOURS.forEach(({ dx, dz }) => {
    const x = at.x + dx;
    const z = at.z + dz;
    for (const y of levels) {
      // Через потолок не пролезть: чтобы подняться, над головой должно быть пусто.
      if (y > at.y && taken.has(cellKey(at.x, at.z, at.y + 1))) continue;
      if (canStand(taken, bounds, x, z, y)) {
        options.push({ x, z, y });
        break;
      }
    }
  });
  return options;
}

// Ближайшее место, где можно стоять: ставим фигурку туда, куда ткнули пальцем.
export function landingSpot(taken: Occupied, bounds: Bounds, x: number, z: number, climbs: boolean) {
  const levels = climbs ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [0];
  for (const y of levels) {
    if (canStand(taken, bounds, x, z, y)) return { x, z, y };
  }
  return null;
}

export function makeWalker(
  kind: 'person' | 'sheep',
  id: string,
  name: string,
  color: string,
  at: Spot,
  now: number,
): Walker {
  return { id, kind, name, color, from: at, to: at, startedAt: now, arriveAt: now };
}

export function walkersFor(world: { people: Person[]; sheep: Sheep[] }, now: number): Walker[] {
  const people = world.people.map((person) =>
    makeWalker('person', person.id, person.name, person.color, { x: person.x, z: person.z, y: person.y }, now),
  );
  const sheep = world.sheep.map((one) =>
    makeWalker('sheep', one.id, '', '#ffffff', { x: one.x, z: one.z, y: 0 }, now),
  );
  return [...people, ...sheep];
}

// Один шаг жизни. Пока идет - ничего не меняем; дошел - выбираем, куда дальше.
export function advance(
  walker: Walker,
  taken: Occupied,
  bounds: Bounds,
  now: number,
  roll = Math.random(),
): Walker {
  if (now < walker.arriveAt) return walker;

  const climbs = walker.kind === 'person';
  const stepTime = climbs ? STEP_PERSON : STEP_SHEEP;
  const restTime = climbs ? REST_PERSON : REST_SHEEP;
  const standing = walker.to;

  // Если под фигуркой построили кубик или ее замуровали - переставим на ближайшее место.
  if (!canStand(taken, bounds, standing.x, standing.z, standing.y)) {
    const rescued = landingSpot(taken, bounds, standing.x, standing.z, climbs);
    if (rescued) {
      return { ...walker, from: rescued, to: rescued, startedAt: now, arriveAt: now + restTime };
    }
    return { ...walker, from: standing, to: standing, startedAt: now, arriveAt: now + restTime };
  }

  const options = stepOptions(taken, bounds, standing, climbs);
  // Иногда просто постоять - так живее, чем бесконечная беготня.
  if (!options.length || roll < 0.18) {
    return { ...walker, from: standing, to: standing, startedAt: now, arriveAt: now + restTime };
  }

  const pick = options[Math.min(options.length - 1, Math.floor(((roll - 0.18) / 0.82) * options.length))];
  return { ...walker, from: standing, to: pick, startedAt: now, arriveAt: now + stepTime };
}

// Где фигурка прямо сейчас: плавно между «откуда» и «куда».
export function walkerAt(walker: Walker, now: number) {
  const span = walker.arriveAt - walker.startedAt;
  const done = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - walker.startedAt) / span));
  const eased = done * done * (3 - 2 * done);
  return {
    x: walker.from.x + (walker.to.x - walker.from.x) * eased,
    z: walker.from.z + (walker.to.z - walker.from.z) * eased,
    y: walker.from.y + (walker.to.y - walker.from.y) * eased,
    // Пока шагает - чуть подпрыгивает.
    hop: walker.from.x === walker.to.x && walker.from.z === walker.to.z ? 0 : Math.sin(done * Math.PI) * 0.12,
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
    const body = project(camera, bounds, spot.x, spot.z, spot.y + spot.hop + 0.4, view);
    if (Math.hypot(body.x - point.x, body.y - point.y) > radius) return;
    const depth = depthKey(camera, spot.x, spot.z);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = walker;
    }
  });
  return best;
}
