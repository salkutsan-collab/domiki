// Общий архив домиков. Лежит в той же базе Firebase, что и трекер наклеек,
// но в своей «комнате» - данные игры и наклеек не пересекаются. Ветка выбрана
// внутри rooms не случайно: правила базы разрешают запись только там, и так
// ничего не надо менять в консоли Firebase.
//
// Что важно понимать: ключи Firebase на страницах всегда открыты, это не пароль.
// Записи закрыты правилом «только для вошедших», вход анонимный. Для домашнего
// архива кубиков этого достаточно, секретов внутри нет.

import type { Database } from 'firebase/database';
import type { World } from './world';
import { readWorld } from './world';

const FIREBASE = {
  apiKey: 'AIzaSyC0seRz8-2XV0BmKtWP1P0p6E85i16p514',
  authDomain: 'dima-707.firebaseapp.com',
  databaseURL: 'https://dima-707-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'dima-707',
};

const ROOM = 'rooms/domiki-family-4k7m2p9x';
const CACHE_KEY = 'domiki-archive-cache-v1';

// Домики лежат в ячейках 01-40. Так правила базы могут ограничить их число:
// посчитать записи правила не умеют, а проверить имя ячейки - умеют.
const SLOT_COUNT = 40;
export const MAX_PROJECTS = SLOT_COUNT;
export const MAX_BLOCKS = 5000;
export const MAX_THUMB = 40000;
const CACHE_LIMIT = 12;

const SLOT_SHAPE = /^(0[1-9]|[1-3][0-9]|40)$/;

export function isSlot(value: string) {
  return SLOT_SHAPE.test(value);
}

export function freeSlots(usedIds: string[]) {
  const used = new Set(usedIds);
  const free: string[] = [];
  for (let index = 1; index <= SLOT_COUNT; index += 1) {
    const slot = String(index).padStart(2, '0');
    if (!used.has(slot)) free.push(slot);
  }
  return free;
}

// Ячейку берем случайную из свободных: если двое сохраняют в одну секунду,
// они вряд ли попадут в одну ячейку и не перезапишут друг друга.
export function pickSlot(usedIds: string[], roll = Math.random()) {
  const free = freeSlots(usedIds);
  if (!free.length) throw new Error(`в архиве уже ${SLOT_COUNT} домиков, убери лишние`);
  return free[Math.min(free.length - 1, Math.floor(roll * free.length))];
}

export type SavedProject = {
  id: string;
  name: string;
  thumb: string;
  createdAt: number;
  updatedAt: number;
  world: World;
};

export type ArchiveStatus = 'connecting' | 'online' | 'offline' | 'error';

export function cleanName(name: string) {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  return trimmed || 'Домик';
}

// Снимок ветки архива -> список домиков, свежие сверху. Битые записи пропускаем.
export function normalizeProjects(raw: unknown): SavedProject[] {
  if (!raw || typeof raw !== 'object') return [];
  const projects: SavedProject[] = [];
  Object.entries(raw as Record<string, unknown>).forEach(([id, value]) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const world = readWorld(record.world);
    if (!world) return;
    const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0;
    projects.push({
      id,
      name: cleanName(typeof record.name === 'string' ? record.name : ''),
      thumb: typeof record.thumb === 'string' ? record.thumb : '',
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : updatedAt,
      updatedAt,
      world,
    });
  });
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readCache(): SavedProject[] {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? normalizeProjects(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

function writeCache(projects: SavedProject[]) {
  try {
    const slice = projects.slice(0, CACHE_LIMIT);
    const asRecord: Record<string, unknown> = {};
    slice.forEach((project) => {
      asRecord[project.id] = {
        name: project.name,
        thumb: project.thumb,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        world: project.world,
      };
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(asRecord));
  } catch { /* Кеш - удобство, без него архив просто требует связи. */ }
}

// Firebase подгружаем отдельным куском и только когда он нужен - иначе игра
// открывалась бы вдвое дольше из-за библиотеки, которая нужна лишь для архива.
type Wired = {
  db: Database;
  authError: string;
  onValue: typeof import('firebase/database').onValue;
  ref: typeof import('firebase/database').ref;
  set: typeof import('firebase/database').set;
  remove: typeof import('firebase/database').remove;
};

let wired: Promise<Wired> | null = null;

function connect(): Promise<Wired> {
  if (!wired) {
    wired = (async () => {
      const [{ initializeApp }, { getAuth, signInAnonymously }, db] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/database'),
      ]);
      const app = initializeApp(FIREBASE);
      let authError = '';
      await signInAnonymously(getAuth(app)).catch((error: { message?: string }) => {
        authError = error.message ?? 'анонимный вход не разрешен';
      });
      return {
        db: db.getDatabase(app),
        authError,
        onValue: db.onValue,
        ref: db.ref,
        set: db.set,
        remove: db.remove,
      };
    })();
  }
  return wired;
}

export type ArchiveHandlers = {
  onProjects: (projects: SavedProject[]) => void;
  onStatus: (status: ArchiveStatus, message?: string) => void;
};

// Подписка на архив. Возвращает отписку.
export function watchArchive({ onProjects, onStatus }: ArchiveHandlers) {
  const cached = readCache();
  if (cached.length) onProjects(cached);
  onStatus('connecting');

  let stopped = false;
  let stopProjects = () => {};
  let stopConnection = () => {};

  (async () => {
    try {
      const fb = await connect();
      if (stopped) return;
      if (fb.authError) onStatus('error', fb.authError);
      stopConnection = fb.onValue(fb.ref(fb.db, '.info/connected'), (snapshot) => {
        if (!fb.authError) onStatus(snapshot.val() ? 'online' : 'offline');
      });
      stopProjects = fb.onValue(
        fb.ref(fb.db, `${ROOM}/projects`),
        (snapshot) => {
          const projects = normalizeProjects(snapshot.val());
          writeCache(projects);
          onProjects(projects);
        },
        (error) => onStatus('error', error.message),
      );
    } catch (error) {
      onStatus('error', error instanceof Error ? error.message : 'база недоступна');
    }
  })();

  return () => {
    stopped = true;
    stopProjects();
    stopConnection();
  };
}

export type SaveRequest = {
  id?: string;
  name: string;
  world: World;
  thumb: string;
  createdAt?: number;
  usedIds: string[];
};

export async function saveProject({ id, name, world, thumb, createdAt, usedIds }: SaveRequest) {
  const slot = id && isSlot(id) ? id : pickSlot(usedIds);
  const fb = await connect();
  const now = Date.now();
  await fb.set(fb.ref(fb.db, `${ROOM}/projects/${slot}`), {
    name: cleanName(name),
    // Слишком большую картинку база не примет - лучше домик без картинки, чем отказ.
    thumb: thumb.length <= MAX_THUMB ? thumb : '',
    world,
    createdAt: createdAt ?? now,
    updatedAt: now,
  });
  return slot;
}

export async function deleteProject(id: string) {
  const fb = await connect();
  await fb.remove(fb.ref(fb.db, `${ROOM}/projects/${id}`));
}

// Какой домик сейчас открыт - помним между заходами, чтобы «Сохранить» обновляло его.
const OPEN_KEY = 'domiki-open-project-v1';

export type OpenMark = { id: string; name: string; createdAt: number };

export function readOpenMark(): OpenMark | null {
  try {
    const stored = localStorage.getItem(OPEN_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored) as Record<string, unknown>;
    if (typeof data.id !== 'string' || typeof data.name !== 'string') return null;
    return { id: data.id, name: data.name, createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0 };
  } catch {
    return null;
  }
}

export function writeOpenMark(mark: OpenMark | null) {
  try {
    if (mark) localStorage.setItem(OPEN_KEY, JSON.stringify(mark));
    else localStorage.removeItem(OPEN_KEY);
  } catch { /* Без хранилища просто не помним, какой домик открыт. */ }
}
