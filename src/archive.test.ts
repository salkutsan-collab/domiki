import { describe, expect, it } from 'vitest';
import { cleanName, normalizeProjects } from './archive';
import { defaultBounds } from './world';

const record = (extra: Record<string, unknown> = {}) => ({
  name: 'Замок',
  thumb: 'data:image/jpeg;base64,xxx',
  createdAt: 1000,
  updatedAt: 2000,
  world: { blocks: [{ x: 1, z: 1, y: 0, type: 'brick' }], bounds: defaultBounds() },
  ...extra,
});

describe('имя домика', () => {
  it('убирает лишние пробелы и обрезает длинное', () => {
    expect(cleanName('  замок   с башней ')).toBe('замок с башней');
    expect(cleanName('я'.repeat(60))).toHaveLength(40);
  });

  it('подставляет название, если поле пустое', () => {
    expect(cleanName('   ')).toBe('Домик');
  });
});

describe('разбор архива', () => {
  it('читает записи и ставит свежие первыми', () => {
    const projects = normalizeProjects({
      old: record({ name: 'Старый', updatedAt: 100 }),
      fresh: record({ name: 'Новый', updatedAt: 900 }),
    });
    expect(projects.map((p) => p.name)).toEqual(['Новый', 'Старый']);
    expect(projects[0].id).toBe('fresh');
  });

  it('пропускает битые записи, а целые оставляет', () => {
    const projects = normalizeProjects({
      good: record(),
      noWorld: { name: 'Без постройки', updatedAt: 5 },
      badType: record({ world: { blocks: [{ x: 0, z: 0, y: 0, type: 'алмаз' }], bounds: defaultBounds() } }),
      notObject: 'строка',
    });
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('good');
  });

  it('читает список кубиков, пришедший объектом с числовыми ключами', () => {
    const fromFirebase = normalizeProjects({
      one: record({
        world: { blocks: { 0: { x: 2, z: 3, y: 1, type: 'wood' } }, bounds: defaultBounds() },
      }),
    });
    expect(fromFirebase[0].world.blocks).toEqual([{ x: 2, z: 3, y: 1, type: 'wood' }]);
  });

  it('переживает пустую постройку и отсутствие картинки', () => {
    const projects = normalizeProjects({
      empty: { name: 'Пустой', updatedAt: 7, world: { bounds: defaultBounds() } },
    });
    expect(projects).toHaveLength(1);
    expect(projects[0].world.blocks).toEqual([]);
    expect(projects[0].thumb).toBe('');
  });

  it('на мусоре вместо снимка отдает пустой список', () => {
    expect(normalizeProjects(null)).toEqual([]);
    expect(normalizeProjects('строка')).toEqual([]);
  });
});
