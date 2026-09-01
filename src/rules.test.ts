// Проверка правил базы Firebase (firebase-rules.json) без обращения к настоящей базе.
// targaryen - тот же язык правил, что и на сервере: он ловит и опечатки, и запрещенные
// методы, и, главное, показывает, что правила пускают игру и не пускают мусор.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const targaryen = require('targaryen') as any;

const rules = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-rules.json'), 'utf8'));
const database = targaryen.database(rules, {});

const ARCHIVE = 'rooms/domiki-family-4k7m2p9x/projects';
const STICKERS = 'rooms/panini-wc26-7fq3k9mz/stickers';
const kid = { uid: 'anon-1' };
const guest = null;

const canWrite = (path: string, value: unknown, auth: unknown = kid) =>
  database.as(auth).write(path, value).allowed as boolean;
const canRead = (path: string, auth: unknown = kid) => database.as(auth).read(path).allowed as boolean;

const bounds = { minX: 0, maxX: 11, minZ: 0, maxZ: 11 };
const house = (extra: Record<string, unknown> = {}) => ({
  name: 'Замок',
  thumb: `data:image/jpeg;base64,${'A'.repeat(500)}`,
  createdAt: 1788000000000,
  updatedAt: 1788000000001,
  world: { bounds, blocks: { 0: { x: 1, z: 1, y: 0, type: 'brick' } } },
  ...extra,
});
const withBlocks = (blocks: Record<string, unknown>) => house({ world: { bounds, blocks } });

describe('правила базы: сама игра', () => {
  it('текст правил разобран без ошибок', () => {
    expect(() => targaryen.ruleset(rules)).not.toThrow();
  });

  it('домик сохраняется в свободную ячейку', () => {
    expect(canWrite(`${ARCHIVE}/01`, house())).toBe(true);
    expect(canWrite(`${ARCHIVE}/40`, house())).toBe(true);
  });

  it('домик без картинки и пустая постройка тоже проходят', () => {
    expect(canWrite(`${ARCHIVE}/02`, house({ thumb: '' }))).toBe(true);
    expect(
      canWrite(`${ARCHIVE}/03`, { name: 'Пусто', thumb: '', createdAt: 1, updatedAt: 2, world: { bounds } }),
    ).toBe(true);
  });

  it('домик можно убрать и прочитать архив', () => {
    expect(canWrite(`${ARCHIVE}/01`, null)).toBe(true);
    expect(canRead(ARCHIVE)).toBe(true);
  });
});

describe('правила базы: без входа ничего нельзя', () => {
  it('не пускает ни читать, ни писать', () => {
    expect(canWrite(`${ARCHIVE}/01`, house(), guest)).toBe(false);
    expect(canRead(ARCHIVE, guest)).toBe(false);
  });
});

describe('правила базы: базу не забить мусором', () => {
  it('ячеек только сорок, и только с правильным именем', () => {
    expect(canWrite(`${ARCHIVE}/41`, house())).toBe(false);
    expect(canWrite(`${ARCHIVE}/00`, house())).toBe(false);
    expect(canWrite(`${ARCHIVE}/-P0Tkb8Ut7FDGdiG1vSQ`, house())).toBe(false);
  });

  it('картинка не больше 40 КБ, название не длиннее 40 знаков', () => {
    expect(canWrite(`${ARCHIVE}/01`, house({ thumb: 'B'.repeat(40001) }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, house({ name: 'я'.repeat(41) }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, house({ name: '' }))).toBe(false);
  });

  it('лишние поля не проходят ни в записи, ни в кубике', () => {
    expect(canWrite(`${ARCHIVE}/01`, house({ svalka: 'A'.repeat(100000) }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 0: { x: 1, z: 1, y: 0, type: 'brick', gruz: 'D'.repeat(9000) } }))).toBe(false);
  });

  it('кубики только под числовыми ключами и не больше десяти тысяч', () => {
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ svalka: { x: 1, z: 1, y: 0, type: 'brick' } }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 12345: { x: 1, z: 1, y: 0, type: 'brick' } }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 9999: { x: 1, z: 1, y: 0, type: 'brick' } }))).toBe(true);
  });

  it('координаты и материал в разумных пределах', () => {
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 0: { x: 1, z: 1, y: 999, type: 'brick' } }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 0: { x: 99999, z: 1, y: 0, type: 'brick' } }))).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, withBlocks({ 0: { x: 1, z: 1, y: 0, type: 'C'.repeat(5000) } }))).toBe(false);
  });

  it('мимо ветки архива и без обязательных полей - отказ', () => {
    expect(canWrite('rooms/domiki-family-4k7m2p9x/svalka', { a: 1 })).toBe(false);
    expect(canWrite(`${ARCHIVE}/01`, { name: 'Только имя' })).toBe(false);
  });
});

describe('правила базы: трекер наклеек работает как раньше', () => {
  it('вошедший читает и пишет наклейки, чужой - нет', () => {
    expect(canWrite(`${STICKERS}/12`, true)).toBe(true);
    expect(canRead(STICKERS)).toBe(true);
    expect(canWrite(`${STICKERS}/12`, true, guest)).toBe(false);
  });
});
