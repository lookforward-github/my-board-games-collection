#!/usr/bin/env node
/* Работа с файлами данных каталога: поиск дублей, словари, проверка, добавление.

   node tools/catalog.mjs find <текст>         — есть ли уже такая позиция (id, название, оригинал)
   node tools/catalog.mjs vocab                — жанры, механики, системы, издатели с частотой
   node tools/catalog.mjs check [id ...]       — проверка всего каталога; переданные id
                                                 проверяются строже (как новые) и с отчётом
                                                 «чего не хватает» — тем же, что на сайте
   node tools/catalog.mjs add <file.json>      — дописать запись (объект или массив) в конец
                                                 data/games.js; записи с полем "system" и без
                                                 "kind" уходят в реестр data/miniatures.js

   Файлы данных — JS с массивом JSON-объектов по одному на строку; формат
   строки повторяет существующий: {"key": value, "key2": value2}. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usd, RUB_PER_USD } from './hobbygames.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  games: { path: join(ROOT, 'data/games.js'), varName: 'GAMES' },
  minis: { path: join(ROOT, 'data/miniatures.js'), varName: 'MINIATURES' },
};

// Словарь жанров — тот же, что в README («Как добавить игру»). Новый жанр
// сначала добавьте туда, иначе фильтр засорится синонимами.
export const CATEGORIES = [
  'Евро', 'Америтреш', 'Абстрактная', 'Карточная', 'Кооперативная', 'Полукооперативная',
  'Дуэльная', 'Пати-игра', 'Детективная', 'Хоррор', 'Фэнтези', 'Научная фантастика', 'Вестерн',
  'Историческая', 'Экономическая', 'Военная', 'Приключенческая', 'Выживание', 'Филлер',
  'Легаси/кампания', 'Головоломка', 'Блеф', 'На ловкость', 'Словесная', 'Детская', 'Семейная',
];
const KINDS = ['base', 'expansion', 'tcg', 'accessory', 'rpg', 'rpg-supplement', 'miniatures', 'miniatures-item'];
const SUPP_TYPES = ['rulebook', 'adventure', 'map', 'screen', 'tokens', 'battlemap', 'miniatures', 'deck', 'starter', 'other'];
const LANGS = ['ru', 'en', 'el'];

function load(which) {
  const { path, varName } = FILES[which];
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('[', src.indexOf(`const ${varName}`));
  const end = src.lastIndexOf(']');
  return { src, start, end, items: JSON.parse(src.slice(start, end + 1)) };
}

/* Сериализация в стиле файла: пробел после ':' и ',', без переносов. */
function line(v) {
  if (Array.isArray(v)) return `[${v.map(line).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${line(x)}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

/* Копия missingFields() из app.js — держите их в согласии. */
function missingFields(g) {
  const miss = [];
  const has = (k) => g[k] != null && g[k] !== '' && !(Array.isArray(g[k]) && g[k].length === 0);
  const isPurchase = !['rpg', 'miniatures'].includes(g.kind);
  const isGame = !['rpg', 'rpg-supplement', 'accessory', 'miniatures', 'miniatures-item'].includes(g.kind);
  if (!has('image')) miss.push('обложка');
  if (!has('bggUrl') && !has('url')) miss.push('ссылка');
  if (!has('originalTitle') && !g.noOriginalTitle) miss.push('оригинальное название');
  if (!has('year')) miss.push('год');
  if (isPurchase && !has('price')) miss.push('цена');
  if (isGame) {
    if (!has('players')) miss.push('игроки');
    if (g.kind === 'base') {
      if (!has('designers')) miss.push('авторы');
      if (!has('bggRating') && !has('rating')) miss.push('рейтинг');
      if (!has('weight')) miss.push('сложность');
      if (!has('time')) miss.push('время');
    }
  }
  if (!has('categories')) miss.push('жанры');
  return miss;
}

/* strict — правила для новых записей. Часть старых их нарушает осознанно
   (кириллица в id материалов Pathfinder — на них уже ведут ссылки ?game=,
   ручная сложность ниже 1 у пати-игр), поэтому весь каталог проверяется
   только на поломки: дубли, битые ссылки, значения не из списков. */
function problemsOfGame(g, ids, strict) {
  const p = [];
  const pair = (k) => g[k] != null && !(Array.isArray(g[k]) && g[k].length === 2 && g[k].every(Number.isFinite) && g[k][0] <= g[k][1]);
  if (!g.id) p.push('нет id');
  if (!g.title) p.push('нет title');
  if (!KINDS.includes(g.kind)) p.push(`kind «${g.kind}» не из списка ${KINDS.join('/')}`);
  for (const l of [].concat(g.lang ?? [])) if (!LANGS.includes(l)) p.push(`lang «${l}» не из списка ${LANGS.join('/')}`);
  if (g.lang == null) p.push('нет lang');
  if (g.kind === 'expansion' && !g.parent) p.push('у дополнения нет parent');
  for (const k of ['parent', 'standaloneFor', 'system']) if (g[k] && !ids.has(g[k])) p.push(`${k} → «${g[k]}» нет в каталоге`);
  for (const s of g.systems || []) if (!ids.has(s)) p.push(`systems → «${s}» нет в каталоге`);
  if (['rpg-supplement', 'miniatures-item'].includes(g.kind) && !SUPP_TYPES.includes(g.supplementType)) {
    p.push(`supplementType «${g.supplementType}» не из списка ${SUPP_TYPES.join('/')}`);
  }
  if (pair('players')) p.push('players — должно быть [min, max]');
  if (pair('time')) p.push('time — должно быть [min, max] в минутах');
  if (g.bggUrl && !/^https:\/\/boardgamegeek\.com\//.test(g.bggUrl)) p.push('bggUrl не на boardgamegeek.com');
  if (strict) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(g.id)) p.push(`id «${g.id}» — нужен slug из латиницы, цифр и дефисов`);
    for (const c of g.categories || []) if (!CATEGORIES.includes(c)) p.push(`жанр «${c}» не из словаря`);
    if (g.price != null && (g.price < 5 || g.price % 5)) p.push(`price ${g.price} — нужно кратно 5 и не меньше 5`);
    if (g.weight != null && !(g.weight >= 1 && g.weight <= 5)) p.push(`weight ${g.weight} вне 1..5`);
    if (g.priceRub != null && g.price !== usd(g.priceRub)) p.push(`price ${g.price} не сходится с priceRub ${g.priceRub} по курсу ${RUB_PER_USD} — ожидается ${usd(g.priceRub)}`);
  }
  return p;
}

function problemsOfMini(m, systemIds) {
  const p = [];
  if (!m.id || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) p.push(`id «${m.id}» — нужен slug из латиницы, цифр и дефисов`);
  if (!m.title) p.push('нет title');
  if (!systemIds.has(m.system)) p.push(`system «${m.system}» — нет такой системы миниатюр в games.js`);
  if (!(m.count >= 1)) p.push('count должен быть ≥ 1');
  if (m.image && !existsSync(join(ROOT, m.image))) p.push(`файла картинки ${m.image} нет`);
  if (!m[m.system]) p.push(`нет блока "${m.system}" со спецификой системы`);
  return p;
}

function check(onlyIds) {
  const games = load('games').items;
  const minis = load('minis').items;
  const ids = new Set();
  let bad = 0;
  const report = (where, id, list) => {
    if (!list.length) return;
    bad += list.length;
    console.log(`✗ ${where} ${id}:\n    ${list.join('\n    ')}`);
  };
  const dupes = (arr, where) => {
    const seen = new Set();
    for (const x of arr) {
      if (seen.has(x.id)) report(where, x.id, ['id повторяется']);
      seen.add(x.id);
    }
  };
  games.forEach((g) => ids.add(g.id));
  dupes(games, 'games.js');
  dupes(minis, 'miniatures.js');
  const strict = new Set(onlyIds);
  for (const g of games) report('games.js', g.id, problemsOfGame(g, ids, strict.has(g.id)));
  const systemIds = new Set(games.filter((g) => g.kind === 'miniatures').map((g) => g.id));
  for (const m of minis) report('miniatures.js', m.id, problemsOfMini(m, systemIds));

  for (const id of onlyIds) {
    const g = games.find((x) => x.id === id);
    const m = minis.find((x) => x.id === id);
    if (g) {
      const miss = missingFields(g);
      console.log(miss.length ? `⚠ ${id}: не хватает — ${miss.join(', ')}` : `✓ ${id}: все поля на месте`);
    } else if (m) console.log(`✓ ${id}: запись реестра миниатюр`);
    else { console.log(`✗ ${id}: такой записи нет`); bad++; }
  }
  console.log(bad ? `\nПроблем: ${bad}` : `\nOK: ${games.length} позиций, ${minis.length} миниатюр`);
  process.exitCode = bad ? 1 : 0;
}

function add(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const which of ['games', 'minis']) {
    const mine = entries.filter((e) => (which === 'minis') === (e.system != null && e.kind == null));
    if (!mine.length) continue;
    const { src, end, items } = load(which);
    const taken = new Set(items.map((x) => x.id));
    for (const e of mine) if (taken.has(e.id)) throw new Error(`id «${e.id}» уже есть в ${FILES[which].path}`);
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    // Последняя запись в файле идёт без запятой — добавляем её перед новыми.
    const head = src.slice(0, end).replace(/\s*$/, '');
    const body = mine.map((e) => `  ${line(e)}`).join(`,${eol}`);
    writeFileSync(FILES[which].path, `${head},${eol}${body}${eol}${src.slice(end)}`);
    console.log(`+ ${mine.map((e) => e.id).join(', ')} → ${FILES[which].path.slice(ROOT.length + 1)}`);
  }
}

function find(query) {
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const words = norm(query).split(' ').filter(Boolean);
  const hit = (x) => {
    const hay = norm(`${x.id} ${x.title} ${x.originalTitle || ''}`);
    return words.every((w) => hay.includes(w));
  };
  const out = [
    ...load('games').items.filter(hit).map((g) => `games.js  ${g.id} — ${g.title} [${g.kind}${g.parent ? ` → ${g.parent}` : ''}]${g.copies > 1 ? ` ×${g.copies}` : ''}`),
    ...load('minis').items.filter(hit).map((m) => `minis.js  ${m.id} — ${m.title} ×${m.count}`),
  ];
  console.log(out.length ? out.join('\n') : 'не найдено');
}

function vocab() {
  const games = load('games').items;
  const count = (fn) => {
    const c = new Map();
    for (const g of games) for (const v of [].concat(fn(g) ?? [])) c.set(v, (c.get(v) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ');
  };
  console.log(`Жанры (словарь): ${CATEGORIES.join(', ')}\n`);
  console.log(`Жанры в данных: ${count((g) => g.categories)}\n`);
  console.log(`Механики: ${count((g) => g.mechanics)}\n`);
  console.log(`Издатели: ${count((g) => g.publisher)}\n`);
  console.log('Системы НРИ и миниатюр:');
  for (const g of games.filter((x) => ['rpg', 'miniatures'].includes(x.kind))) console.log(`  ${g.id} — ${g.title} [${g.kind}]`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'find' && args.length) find(args.join(' '));
  else if (cmd === 'vocab') vocab();
  else if (cmd === 'check') check(args);
  else if (cmd === 'add' && args[0]) add(args[0]);
  else {
    console.error('usage: node tools/catalog.mjs find <текст> | vocab | check [id ...] | add <file.json>');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
