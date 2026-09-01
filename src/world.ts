// Кубики, границы полянки и сохранение постройки.

export const MATERIALS = {
  wood: { name: 'Дерево', color: '#d58a45', top: '#efb66f', side: '#aa6130' },
  brick: { name: 'Кирпич', color: '#dd654f', top: '#f48d76', side: '#ad4638' },
  glass: { name: 'Окошко', color: '#75cce8', top: '#c2eff8', side: '#429bbd' },
  roof: { name: 'Крыша', color: '#8d5ad0', top: '#b48bea', side: '#6841a6' },
  stone: { name: 'Камень', color: '#9aa4ad', top: '#c8cfd4', side: '#737d86' },
  yellow: { name: 'Солнышко', color: '#f5c84c', top: '#ffe98c', side: '#c89424' },
} as const;

export type Material = keyof typeof MATERIALS;
export type Block = { x: number; z: number; y: number; type: Material };
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type World = { blocks: Block[]; bounds: Bounds };

export const MAX_HEIGHT = 12;
export const START_SIZE = 12;
export const MAX_SPAN = 40;
export const GROW_STEP = 4;
export const GROW_MARGIN = 1;

const STORAGE_KEY = 'domiki-world-v2';
const LEGACY_KEY = 'domiki-world-v1';

export function defaultBounds(): Bounds {
  return { minX: 0, maxX: START_SIZE - 1, minZ: 0, maxZ: START_SIZE - 1 };
}

export function boundsCenter(bounds: Bounds) {
  return { cx: (bounds.minX + bounds.maxX) / 2, cz: (bounds.minZ + bounds.maxZ) / 2 };
}

export function insideBounds(bounds: Bounds, x: number, z: number) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

// Трава прирастает, когда кубик встал у самого края - но не шире MAX_SPAN.
export function grownBounds(bounds: Bounds, x: number, z: number): Bounds {
  const next = { ...bounds };
  const spanX = () => next.maxX - next.minX + 1;
  const spanZ = () => next.maxZ - next.minZ + 1;
  if (x - next.minX <= GROW_MARGIN && spanX() + GROW_STEP <= MAX_SPAN) next.minX -= GROW_STEP;
  if (next.maxX - x <= GROW_MARGIN && spanX() + GROW_STEP <= MAX_SPAN) next.maxX += GROW_STEP;
  if (z - next.minZ <= GROW_MARGIN && spanZ() + GROW_STEP <= MAX_SPAN) next.minZ -= GROW_STEP;
  if (next.maxZ - z <= GROW_MARGIN && spanZ() + GROW_STEP <= MAX_SPAN) next.maxZ += GROW_STEP;
  return next;
}

export function blockAt(blocks: Block[], x: number, z: number, y: number) {
  return blocks.find((block) => block.x === x && block.z === z && block.y === y);
}

export function topFloor(blocks: Block[]) {
  return blocks.reduce((highest, block) => Math.max(highest, block.y + 1), 1);
}

export function starterWorld(): World {
  const bounds = defaultBounds();
  return {
    bounds,
    blocks: [
      { x: 1, z: 1, y: 0, type: 'yellow' },
      { x: 1, z: 1, y: 1, type: 'yellow' },
      { x: 1, z: 1, y: 2, type: 'wood' },
    ],
  };
}

// Готовый домик по центру полянки: стены с дверью и окошками, крыша ступенями.
export function makeHouse(bounds: Bounds): Block[] {
  const cx = Math.floor((bounds.minX + bounds.maxX) / 2);
  const cz = Math.floor((bounds.minZ + bounds.maxZ) / 2);
  const x0 = cx - 2;
  const x1 = cx + 3;
  const z0 = cz - 2;
  const z1 = cz + 3;
  const house: Block[] = [];

  for (let y = 0; y < 3; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        if (!(x === x0 || x === x1 || z === z0 || z === z1)) continue;
        const doorway = z === z1 && (x === cx || x === cx + 1) && y < 2;
        if (doorway) continue;
        const window = y === 1 && ((z === z0 && (x === cx || x === cx + 1)) || (x === x0 && z === cz));
        house.push({ x, z, y, type: window ? 'glass' : 'brick' });
      }
    }
  }

  const roofRings = [
    { y: 3, pad: 1 },
    { y: 4, pad: 0 },
    { y: 5, pad: -1 },
  ];
  roofRings.forEach(({ y, pad }) => {
    for (let x = x0 - pad; x <= x1 + pad; x += 1) {
      for (let z = z0 - pad; z <= z1 + pad; z += 1) house.push({ x, z, y, type: 'roof' });
    }
  });

  return house.filter((block) => insideBounds(bounds, block.x, block.z) && block.y < MAX_HEIGHT);
}

// Постройка, собранная готовым домиком, может выходить за траву - расширяем ее под домик.
export function boundsForBlocks(bounds: Bounds, blocks: Block[]): Bounds {
  return blocks.reduce((current, block) => grownBounds(current, block.x, block.z), bounds);
}

function isMaterial(value: unknown): value is Material {
  return typeof value === 'string' && value in MATERIALS;
}

function readBlocks(value: unknown): Block[] | null {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null;
  if (!list) return null;
  const blocks: Block[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const { x, z, y, type } = item as Record<string, unknown>;
    if (typeof x !== 'number' || typeof z !== 'number' || typeof y !== 'number') return null;
    if (!isMaterial(type)) return null;
    blocks.push({ x, z, y, type });
  }
  return blocks;
}

function readBounds(value: unknown): Bounds | null {
  if (!value || typeof value !== 'object') return null;
  const { minX, maxX, minZ, maxZ } = value as Record<string, unknown>;
  if ([minX, maxX, minZ, maxZ].some((edge) => typeof edge !== 'number')) return null;
  const bounds = { minX, maxX, minZ, maxZ } as Bounds;
  if (bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) return null;
  return bounds;
}

// Разбор записи «кубики плюс границы» - и из хранилища браузера, и из общего архива.
export function readWorld(value: unknown): World | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const blocks = readBlocks(data.blocks ?? []);
  const bounds = readBounds(data.bounds);
  if (!blocks || !bounds) return null;
  return { blocks, bounds: boundsForBlocks(bounds, blocks) };
}

// Разбор сохранения. Старый формат (просто список кубиков) переносится на полянку 12 на 12.
export function parseSaved(current: string | null, legacy: string | null): World | null {
  if (current) {
    try {
      const world = readWorld(JSON.parse(current));
      if (world) return world;
    } catch { /* Испорченное сохранение просто не читаем. */ }
  }
  if (legacy) {
    try {
      const blocks = readBlocks(JSON.parse(legacy));
      if (blocks) return { blocks, bounds: boundsForBlocks(defaultBounds(), blocks) };
    } catch { /* То же самое для старого формата. */ }
  }
  return null;
}

export function loadWorld(): World | null {
  try {
    return parseSaved(localStorage.getItem(STORAGE_KEY), localStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

export function saveWorld(world: World) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
  } catch { /* Без хранилища постройка живет только до перезагрузки. */ }
}
