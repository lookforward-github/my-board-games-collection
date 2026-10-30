'use strict';

/* ============================================================
   Коллекция настольных игр — логика приложения
   Данные лежат в data/games.js (глобальный массив GAMES).
   ============================================================ */

const LANG_LABEL = { ru: 'русский', en: 'английский', el: 'греческий' };
const LANG_FLAG  = { ru: '',        en: '🇬🇧',        el: '🇬🇷' };

const KIND_LABEL = {
  base:            'Базовые игры',
  expansion:       'Дополнения',
  tcg:             'ККИ',
  accessory:       'Аксессуары',
  rpg:             'Ролевые системы',
  'rpg-supplement':'Материалы НРИ',
  miniatures:      'Системы миниатюр',
  'miniatures-item':'Наборы миниатюр'
};

const SUPP_LABEL = {
  rulebook:   'Книги правил',
  adventure:  'Приключения и модули',
  map:        'Карты',
  screen:     'Ширмы ведущего',
  tokens:     'Наборы фишек',
  battlemap:  'Игровые поля',
  miniatures: 'Миниатюры',
  deck:       'Колоды',
  starter:    'Стартовые наборы',
  other:      'Прочее'
};

// Порядок вывода групп материалов внутри системы
const SUPP_ORDER = ['starter','rulebook','adventure','deck','screen','tokens','map','battlemap','miniatures','other'];

const TIME_BUCKETS = [
  { id: 't30',  label: 'до 30 мин',  test: g => g.time && g.time[1] <= 30 },
  { id: 't60',  label: '30–60 мин',  test: g => g.time && g.time[1] > 30 && g.time[1] <= 60 },
  { id: 't120', label: '1–2 часа',   test: g => g.time && g.time[1] > 60 && g.time[1] <= 120 },
  { id: 't120p',label: 'более 2 ч',  test: g => g.time && g.time[1] > 120 }
];

/* Цена указана в долларах США (см. поле price в data/games.js). */
const PRICE_BUCKETS = [
  { id: 'p20',   label: 'до $20',   test: g => g.price != null && g.price < 20 },
  { id: 'p50',   label: '$20–50',   test: g => g.price != null && g.price >= 20 && g.price < 50 },
  { id: 'p100',  label: '$50–100',  test: g => g.price != null && g.price >= 50 && g.price < 100 },
  { id: 'p100p', label: 'от $100',  test: g => g.price != null && g.price >= 100 }
];

const WEIGHT_BUCKETS = [
  { id: 'w1', label: 'лёгкая',   test: g => g.weight != null && g.weight < 2 },
  { id: 'w2', label: 'средняя',  test: g => g.weight != null && g.weight >= 2 && g.weight < 3 },
  { id: 'w3', label: 'сложная',  test: g => g.weight != null && g.weight >= 3 && g.weight < 4 },
  { id: 'w4', label: 'хардкор',  test: g => g.weight != null && g.weight >= 4 }
];

/* ---------- полнота данных ----------
   Какие поля ждём от позиции, зависит от её типа: с игровых полей Pathfinder
   и промо-аксессуаров бессмысленно требовать число игроков и рейтинг BGG. */
function missingFields(g) {
  const miss = [];
  const has = (k) => g[k] != null && g[k] !== '' &&
                     !(Array.isArray(g[k]) && g[k].length === 0);

  // Цену ждём от всего, что покупается отдельной коробкой или книгой —
  // включая материалы НРИ и наборы миниатюр. Не ждём только у записей-
  // контейнеров: ролевая система и система миниатюр сами по себе не товар,
  // их стоимость складывается из материалов.
  const isPurchase = !['rpg','miniatures'].includes(g.kind);
  // Игровые параметры (игроки, время) есть только у самих игр: книга правил,
  // игровое поле или набор фишек не играются в отрыве от системы.
  const isGame = !['rpg','rpg-supplement','accessory',
                   'miniatures','miniatures-item'].includes(g.kind);

  if (!has('image'))         miss.push('обложка');
  // Ссылка может вести не только на BGG: у части игр страницы там нет,
  // и тогда достаточно ссылки на магазин или Tesera в поле url.
  if (!has('bggUrl') && !has('url')) miss.push('ссылка');
  // Оригинальное название спрашиваем только у того, что издано не только в РФ.
  if (!has('originalTitle') && !g.noOriginalTitle) miss.push('оригинальное название');
  if (!has('year'))          miss.push('год');

  if (isPurchase && !has('price')) miss.push('цена');

  if (isGame) {
    if (!has('players'))   miss.push('игроки');
    // Рейтинг, сложность и авторов ждём только от самостоятельных игр:
    // BGG считает вес по голосам, а за дополнения и промо почти не голосуют —
    // требовать у них оценку значит держать вечный «долг» в списке.
    if (g.kind === 'base') {
      if (!has('designers')) miss.push('авторы');
      if (!has('bggRating') && !has('rating')) miss.push('рейтинг');
      if (!has('weight'))    miss.push('сложность');
      // Длительность спрашиваем там же, где сложность: у дополнения своего
      // времени партии нет — оно играется внутри базовой игры.
      if (!has('time'))      miss.push('время');
    }
  }
  if (!has('categories'))    miss.push('жанры');
  return miss;
}

/* ---------- состояние ---------- */
/* По умолчанию сортируем по позиции в рейтинге BGG: сверху то, что выше
   всего стоит в общем рейтинге. Записи без ранга уходят в конец. */
const DEFAULT_SORT = 'rank';

const state = {
  view: 'games',
  q: '',
  // Тип по умолчанию не фильтруем: показываем всё, что есть на вкладке —
  // базовые игры, дополнения, ККИ и аксессуары.
  kinds: new Set(),
  categories: new Set(),
  mechanics: new Set(),
  players: 0,
  times: new Set(),
  weights: new Set(),
  langs: new Set(),
  prices: new Set(),
  openId: null,          // id открытой карточки, синхронизируется с ?game=
  sort: DEFAULT_SORT
};

const byId = new Map(GAMES.map(g => [g.id, g]));

/* Игры, которые показываем во вкладке "Настольные игры":
   всё, кроме ролевых систем и их материалов. */
const boardItems = GAMES.filter(g =>
  !['rpg','rpg-supplement','miniatures','miniatures-item'].includes(g.kind));
const rpgSystems = GAMES.filter(g => g.kind === 'rpg');
const rpgSupps   = GAMES.filter(g => g.kind === 'rpg-supplement');
// Системы миниатюр устроены так же, как ролевые: коробка-система + её наборы.
const miniSystems = GAMES.filter(g => g.kind === 'miniatures');
const miniItems   = GAMES.filter(g => g.kind === 'miniatures-item');

/* Системы, к которым относится материал. Поддерживаем и новый формат
   (systems: [...] — материал может годиться нескольким системам сразу),
   и старый одиночный system. */
function systemsOf(g) {
  if (Array.isArray(g.systems)) return g.systems;
  return g.system ? [g.system] : [];
}

/* Языки позиции. Один и тот же материал может быть на нескольких языках
   (например, карта Зова Ктулху есть и в русском, и в английском издании) —
   тогда lang хранит массив. */
function langsOf(g) {
  return Array.isArray(g.lang) ? g.lang : [g.lang];
}

/* Флажки языков для карточки; русский не помечаем — он по умолчанию. */
function langFlags(g) {
  return langsOf(g).filter(l => l !== 'ru')
    .map(l => `<span class="lang-flag" title="Язык: ${LANG_LABEL[l] || l}">${LANG_FLAG[l] || '🌐'}</span>`)
    .join('');
}

/* ---------- утилиты ---------- */
const el = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* Сколько дополнений у базовой игры */
const expansionsOf = new Map();
for (const g of GAMES) {
  if (g.kind === 'expansion' && g.parent) {
    if (!expansionsOf.has(g.parent)) expansionsOf.set(g.parent, []);
    expansionsOf.get(g.parent).push(g);
  }
}

/* Состав с учётом дополнений: если в коллекции есть допы, расширяющие
   число игроков (Космический контакт, Серп, Small World...), считаем по ним.
   Возвращает [min, max, extendedBy] — extendedBy = число доп. игроков. */
function effectivePlayers(g) {
  if (!g.players) return null;
  let [min, max] = g.players;
  const base = max;
  for (const e of (expansionsOf.get(g.id) || [])) {
    if (!e.players) continue;
    if (e.players[1] > max) max = e.players[1];
    if (e.players[0] < min) min = e.players[0];
  }
  return [min, max, max - base];
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function playersText(g) {
  const p = effectivePlayers(g);
  if (!p) return null;
  const [a, b] = p;
  return a === b ? `${a}` : `${a}–${b}`;
}

/* Лучшее число игроков с учётом дополнений: берём объединение диапазонов
   базовой игры и тех допов, что расширяют состав. bestPlayers может быть
   числом (4) или диапазоном ([4, 5]). */
function effectiveBest(g) {
  const span = (v) => (v == null ? null : (Array.isArray(v) ? v.slice() : [v, v]));
  let r = span(g.bestPlayers);
  const wide = effectivePlayers(g);
  if (wide && wide[2] > 0) {
    for (const e of (expansionsOf.get(g.id) || [])) {
      // учитываем только допы, реально расширяющие состав
      if (!e.players || !g.players) continue;
      if (e.players[1] <= g.players[1] && e.players[0] >= g.players[0]) continue;
      const eb = span(e.bestPlayers);
      if (!eb) continue;
      r = r ? [Math.min(r[0], eb[0]), Math.max(r[1], eb[1])] : eb;
    }
  }
  if (!r) return null;
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

function timeText(g) {
  if (!g.time) return null;
  const [a, b] = g.time;
  return a === b ? `${a} мин` : `${a}–${b} мин`;
}

/* ---------- фильтрация ---------- */
function matches(g) {
  if (state.q) {
    const hay = [g.title, g.originalTitle, ...(g.categories||[]), ...(g.mechanics||[]),
                 ...(g.designers||[])].join(' ').toLowerCase();
    if (!hay.includes(state.q.toLowerCase())) return false;
  }
  if (state.kinds.size && !state.kinds.has(g.kind)) return false;
  if (state.langs.size && !langsOf(g).some(l => state.langs.has(l))) return false;

  if (state.categories.size) {
    const cs = g.categories || [];
    if (![...state.categories].every(c => cs.includes(c))) return false;
  }
  if (state.mechanics.size) {
    const ms = g.mechanics || [];
    if (![...state.mechanics].every(m => ms.includes(m))) return false;
  }
  if (state.players > 0) {
    const p = effectivePlayers(g);           // с учётом дополнений
    if (!p) return false;
    if (state.players < p[0] || state.players > p[1]) return false;
  }
  if (state.times.size) {
    const ok = TIME_BUCKETS.filter(b => state.times.has(b.id)).some(b => b.test(g));
    if (!ok) return false;
  }
  if (state.weights.size) {
    const ok = WEIGHT_BUCKETS.filter(b => state.weights.has(b.id)).some(b => b.test(g));
    if (!ok) return false;
  }
  if (state.prices.size) {
    const ok = PRICE_BUCKETS.filter(b => state.prices.has(b.id)).some(b => b.test(g));
    if (!ok) return false;
  }
  return true;
}

function sortItems(items) {
  const s = state.sort;
  const arr = items.slice();
  const nz = (v, fallback) => (v == null ? fallback : v);
  // Средняя длительность — по ней сортируем честнее, чем по верхней границе.
  const avgTime = (g) => (g.time ? (g.time[0] + g.time[1]) / 2 : null);
  arr.sort((a, b) => {
    switch (s) {
      case 'year':      return nz(b.year, -9999) - nz(a.year, -9999);
      case 'yearAsc':   return nz(a.year, 9999) - nz(b.year, 9999);
      // при сортировке по рейтингу собственная оценка подменяет отсутствующий BGG
      case 'rating':    return nz(b.bggRating != null ? b.bggRating : b.rating, -1) -
                               nz(a.bggRating != null ? a.bggRating : a.rating, -1);
      // ранг: чем меньше число, тем лучше; позиции без ранга — в конец
      case 'rank':      return nz(a.bggRank, 1e9) - nz(b.bggRank, 1e9);
      case 'weight':    return nz(b.weight, -1) - nz(a.weight, -1);
      case 'weightAsc': return nz(a.weight, 1e9) - nz(b.weight, 1e9);
      case 'timeAsc':   return nz(avgTime(a), 1e9) - nz(avgTime(b), 1e9);
      case 'timeDesc':  return nz(avgTime(b), -1) - nz(avgTime(a), -1);
      case 'priceAsc':  return nz(a.price, 1e9) - nz(b.price, 1e9);
      case 'priceDesc': return nz(b.price, -1) - nz(a.price, -1);
      default:          return a.title.localeCompare(b.title, 'ru');
    }
  });
  return arr;
}

/* ---------- рендер карточек ---------- */
/* Обложка. Картинки грузятся прямо с CDN BoardGameGeek, локальных копий нет.
   Если ссылки нет или картинка не загрузилась — показываем плашку с кубиком. */
function coverHTML(g) {
  if (!g.image) return '<div class="cover is-missing"></div>';
  return `<div class="cover"><img src="${esc(g.image)}" alt="${esc(g.title)}" ` +
         `loading="lazy" decoding="async" ` +
         `onerror="this.classList.add('broken');this.parentElement.classList.add('is-missing')"></div>`;
}

function cardHTML(g) {
  const exps = expansionsOf.get(g.id) || [];
  const parts = [];

  parts.push(coverHTML(g));
  parts.push('<div class="card-head"><div>');
  parts.push(`<h4>${esc(g.title)}${g.copies > 1 ? ` <span class="exp-count">×${g.copies}</span>` : ''}</h4>`);
  if (g.originalTitle && g.originalTitle !== g.title) {
    parts.push(`<div class="orig">${esc(g.originalTitle)}</div>`);
  }
  parts.push('</div>');
  const gf = langFlags(g);
  if (gf) parts.push(gf);
  parts.push('</div>');

  if (g.kind === 'expansion') {
    const p = byId.get(g.parent);
    parts.push(`<span class="exp-badge">Дополнение${p ? ' · ' + esc(p.title) : ''}</span>`);
  } else if (g.kind === 'accessory') {
    parts.push('<span class="exp-badge">Аксессуар</span>');
  } else if (g.kind === 'tcg') {
    parts.push('<span class="exp-badge">ККИ</span>');
  }

  // Метаданные разнесены на две строки фиксированной высоты: иначе длинный
  // бейдж ссылки переносится и сдвигает всё ниже, ломая выравнивание в ряду.
  // Строка 1 — параметры партии.
  const meta = [];
  const pt = playersText(g);
  if (pt) meta.push(`<span>👥 ${pt}</span>`);
  const tt = timeText(g);
  if (tt) meta.push(`<span>⏱ ${tt}</span>`);
  parts.push(`<div class="meta meta-1">${meta.join('') || '&nbsp;'}</div>`);

  // Строка 2 — год, оценка, цена и ссылка.
  const meta2 = [];
  if (g.year) meta2.push(`<span>${g.year}</span>`);
  // Рейтинг: с BGG, либо собственная оценка (для игр, которых на BGG нет).
  if (g.bggRating) {
    meta2.push(`<span title="Рейтинг BoardGameGeek">★ ${g.bggRating.toFixed(1)}</span>`);
  } else if (g.rating != null) {
    meta2.push(`<span title="Моя оценка">☆ ${g.rating.toFixed(1)}</span>`);
  }
  if (g.price != null) meta2.push(`<span class="price">$${g.price}</span>`);
  if (g.bggUrl) {
    meta2.push(`<a class="bgg-dot" href="${esc(g.bggUrl)}" target="_blank" rel="noopener"` +
               ` title="Открыть на BoardGameGeek" onclick="event.stopPropagation()">BGG</a>`);
  } else if (g.url) {
    meta2.push(`<a class="bgg-dot" href="${esc(g.url)}" target="_blank" rel="noopener"` +
               ` title="Страница игры" onclick="event.stopPropagation()">ссылка</a>`);
  }
  parts.push(`<div class="meta meta-2">${meta2.join('') || '&nbsp;'}</div>`);

  if (g.weight != null) {
    const pct = Math.max(4, Math.min(100, (g.weight / 5) * 100));
    // класс задаёт цвет: лёгкая (<2) → средняя → сложная → хардкор (4+)
    const wCls = g.weight < 2 ? 'w1' : g.weight < 3 ? 'w2' : g.weight < 4 ? 'w3' : 'w4';
    parts.push(
      `<div class="wbar"><span>Сложность</span>` +
      `<span class="wbar-track"><span class="wbar-fill ${wCls}" style="width:${pct}%"></span></span>` +
      `<span class="wnum">${g.weight.toFixed(1)}</span></div>`
    );
  } else {
    // пустая строка-заглушка, чтобы теги ниже стояли на той же высоте
    parts.push('<div class="wbar"></div>');
  }


  const tags = (g.categories || []).slice(0, 3).map(c => `<span class="tag">${esc(c)}</span>`);
  if (exps.length) {
    tags.push(`<span class="tag" style="color:var(--accent)">+${exps.length} ${plural(exps.length,'доп','допа','допов')}</span>`);
  }
  if (tags.length) parts.push(`<div class="tags">${tags.join('')}</div>`);

  return parts.join('');
}

function renderGames() {
  const items = sortItems(boardItems.filter(matches));
  const grid = el('#grid');
  grid.innerHTML = items.map(g =>
    // div, а не button: внутри карточки лежит ссылка на BGG,
    // а вложенная в кнопку ссылка — невалидный HTML
    `<div class="card" data-id="${esc(g.id)}" role="button" tabindex="0">${cardHTML(g)}</div>`
  ).join('');

  el('#empty').hidden = items.length > 0;
  const total = boardItems.length;
  el('#count').innerHTML = items.length === total
    ? `<b>${total}</b> ${plural(total,'позиция','позиции','позиций')}`
    : `<b>${items.length}</b> из ${total}`;
}

/* ---------- рендер НРИ ---------- */
/* Карточка материала НРИ / набора миниатюр.
   Здесь намеренно нет игроков, времени, сложности и рейтинга: у книги правил
   или игрового поля этих характеристик не существует. */
function suppCardHTML(s) {
  const parts = [];
  parts.push(coverHTML(s));
  parts.push('<div class="card-head"><div>');
  parts.push(`<h4>${esc(s.title)}${s.copies > 1 ? ` <span class="exp-count">×${s.copies}</span>` : ''}</h4>`);
  if (s.originalTitle && s.originalTitle !== s.title) {
    parts.push(`<div class="orig">${esc(s.originalTitle)}</div>`);
  }
  parts.push('</div>');
  const sf = langFlags(s);
  if (sf) parts.push(sf);
  parts.push('</div>');

  const meta = [];
  if (s.supplementType) {
    meta.push(`<span class="supp-type">${esc(SUPP_LABEL[s.supplementType] || s.supplementType)}</span>`);
  }
  if (s.year) meta.push(`<span>${s.year}</span>`);
  if (s.price != null) meta.push(`<span class="price">$${s.price}</span>`);
  parts.push(`<div class="meta meta-1">${meta.join('') || '&nbsp;'}</div>`);

  const tags = [];
  if (s.universal) {
    tags.push('<span class="tag uni-tag" title="Подходит нескольким системам">∀ универсальный</span>');
  }
  // У материалов и наборов страница издателя полезнее, чем общая запись
  // игры на BGG: там состав конкретной коробки.
  const link = s.url || s.bggUrl;
  if (link) {
    tags.push(`<a class="bgg-dot" href="${esc(link)}" target="_blank" rel="noopener"` +
              ` onclick="event.stopPropagation()">${s.url ? 'ссылка' : 'BGG'}</a>`);
  }
  parts.push(`<div class="tags">${tags.join('')}</div>`);
  return parts.join('');
}

function renderSystems(systems, items, wrapSel, countSel, wordOne, wordFew, wordMany,
                       extraFor, flat, showLang = true) {
  const wrap = el(wrapSel);
  // Второй экземпляр — это вторая коробка на полке, поэтому считаем копии.
  const copiesOf = (list) => list.reduce((n, g) => n + (g.copies || 1), 0);

  const cardsHTML = (arr) => `<div class="grid sup-grid">` +
    arr.map(s => `<div class="card supp-card" data-id="${esc(s.id)}" role="button" tabindex="0">` +
                 `${suppCardHTML(s)}</div>`).join('') + `</div>`;

  // Общий рендер тела карточки: материалы, сгруппированные по типу.
  // flat — когда деление на подтипы не помогает, показываем всё одним списком.
  const bodyFor = (list) => {
    if (flat) {
      const arr = list.slice().sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      return arr.length ? `<div class="sup-group boxes-group">${cardsHTML(arr)}</div>` : '';
    }
    const groups = new Map();
    for (const s of list) {
      const t = s.supplementType || 'other';
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(s);
    }
    const ordered = SUPP_ORDER.filter(t => groups.has(t))
      .concat([...groups.keys()].filter(t => !SUPP_ORDER.includes(t)));
    return ordered.map(t => {
      const arr = groups.get(t).slice().sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      return `<div class="sup-group"><h5>${esc(SUPP_LABEL[t] || t)} · ${arr.length}</h5>` +
        cardsHTML(arr) + `</div>`;
    }).join('');
  };

  const html = systems
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    .map(sys => {
      // материал может относиться сразу к нескольким системам (systems[])
      const supps = items.filter(s => systemsOf(s).includes(sys.id));
      const langs = [...new Set(supps.flatMap(langsOf))];
      const nSupps = copiesOf(supps);
      const roster = typeof MINIATURES === 'undefined' ? []
        : MINIATURES.filter(m => m.system === sys.id);
      const figs = roster.reduce((n, m) => n + (m.count || 0), 0);
      const sub = `${nSupps} ${plural(nSupps, wordOne, wordFew, wordMany)}` +
        (figs ? ` · ${roster.length} ${plural(roster.length,'вид','вида','видов')}` +
                ` · ${figs} ${plural(figs,'фигурка','фигурки','фигурок')}` : '') +
        (showLang && langs.length ? ' · ' + langs.map(l => LANG_LABEL[l] || l).join(', ') : '');

      return `<div class="sys-card" data-sys="${esc(sys.id)}">
        <button class="sys-head">
          ${sys.image ? `<img class="sys-cover" src="${esc(sys.image)}" alt=""
             loading="lazy" onerror="this.remove()">` : ''}
          <div>
            <h3>${esc(sys.title)}</h3>
            <div class="sub">${sub}</div>
          </div>
          <span class="arrow">▶</span>
        </button>
        <div class="sys-body">${(bodyFor(supps) || '<div class="sub">Материалов пока нет.</div>') +
          (extraFor ? extraFor(sys.id) : '')}</div>
      </div>`;
    }).join('');

  // Универсальные материалы дополнительно собраны в отдельный блок сверху:
  // так видно, что подходит сразу нескольким системам.
  const uni = items.filter(s => s.universal);
  let uniHtml = '';
  if (uni.length) {
    uniHtml = `<div class="sys-card universal" data-sys="__universal">
      <button class="sys-head">
        <div>
          <h3>∀ Универсальные материалы</h3>
          <div class="sub">${copiesOf(uni)} ${plural(copiesOf(uni), wordOne, wordFew, wordMany)} ·
            подходят любой системе с боем на сетке</div>
        </div>
        <span class="arrow">▶</span>
      </button>
      <div class="sys-body">${bodyFor(uni)}</div>
    </div>`;
  }

  wrap.innerHTML = uniHtml + html;
  // Счётчик есть не у каждого раздела: в миниатюрах вместо него — заголовки блоков.
  const cnt = el(countSel);
  if (cnt) {
    const nItems = copiesOf(items);
    cnt.innerHTML =
      `<b>${systems.length}</b> ${plural(systems.length,'система','системы','систем')}, ` +
      `<b>${nItems}</b> ${plural(nItems, wordOne, wordFew, wordMany)}`;
  }
}

function renderRpg() {
  renderSystems(rpgSystems, rpgSupps, '#rpgList', '#rpgCount',
                'материал','материала','материалов');
  renderBestiary();
}

/* ---------- Бестиарий: реестр картонных фишек ----------
   Отдельный блок в разделе НРИ, рядом с универсальными материалами.
   Группируем по размеру: именно он определяет, какая подставка нужна
   и сколько места существо занимает на поле. */
const PAWN_SIZE_LABEL = {
  tiny: 'Крошечные', small: 'Небольшие', medium: 'Средние',
  large: 'Крупные', huge: 'Огромные', gargantuan: 'Громадные',
  // Ловушки, мебель, сундуки — у них нет размера существа, это не монстры.
  item: 'Предметы и препятствия'
};
const PAWN_SIZE_ORDER = ['tiny','small','medium','large','huge','gargantuan','item'];

const pawnTotal = (p) => p.sets.reduce((n, s) => n + (s.copies || 1), 0);

/* Полные названия наборов — для подсказки на бейдже: код на фишке
   короткий и не всем очевиден, а в подсказке место есть. */
const PAWN_SET_NAME = {
  'B1':     'Бестиарий (1-я ред.)',
  'B':      'Бестиарий (2-я ред.)',
  'KM':     'Kingmaker',
  'SM':     'Призыв чудовищ',
  'EE':     'Боевые столкновения',
  'Star':   'Расколотая звезда',
  'RotRL':  'Возвращение Рунных Властителей',
  // У этих двух наборов маркировки на фишках нет — коды условные.
  'Decor':  'Антураж подземелья',
  'Traps':  'Ловушки и сокровища'
};

function pawnCardHTML(p) {
  const total = pawnTotal(p);
  const sets = p.sets.map(s => {
    const name = PAWN_SET_NAME[s.code] || s.code;
    const tip = `${name}, №${s.num}` + (s.copies > 1 ? `, ${s.copies} шт.` : '');
    return `<span class="pawn-set" title="${esc(tip)}">${esc(s.code)}` +
           `${s.copies > 1 ? `<b>×${s.copies}</b>` : ''}</span>`;
  }).join('');
  const link = p.aon || p.aon1;
  const lvl = p.level != null ? `ур. ${p.level}` : (p.cr ? `CR ${esc(p.cr)}` : '');
  // Ссылку вешаем на само название: отдельная кнопка «AoN» съедала место
  // в каждой из 1214 строк ради одного и того же слова.
  const title = link
    ? `<a class="pawn-title link" href="${esc(link)}" target="_blank" rel="noopener"
         title="Статблок на Archives of Nethys">${esc(p.title)}</a>`
    : `<span class="pawn-title">${esc(p.title)}</span>`;
  return `<div class="pawn-main">
      ${title}
      ${p.aonName ? `<span class="pawn-alt">${esc(p.aonName)}</span>` : ''}
    </div>
    <span class="pawn-meta">
      ${lvl ? `<span class="pawn-lvl">${lvl}</span>` : ''}
      ${total > 1 ? `<span class="pawn-count">${total} шт.</span>` : ''}
      <span class="pawn-sets">${sets}</span>
    </span>`;
}

function renderBestiary() {
  const wrap = el('#bestiaryBody');
  if (!wrap || typeof PAWNS === 'undefined') return;
  const q = (el('#pawnSearch')?.value || '').trim().toLowerCase();
  const list = q
    ? PAWNS.filter(p => p.title.toLowerCase().includes(q) ||
                        (p.aonName || '').toLowerCase().includes(q))
    : PAWNS;

  const groups = new Map();
  for (const p of list) {
    const k = p.size || 'other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const order = PAWN_SIZE_ORDER.filter(k => groups.has(k))
    .concat(groups.has('other') ? ['other'] : []);   // без размера — в конец

  wrap.innerHTML = list.length ? order.map(k => {
    const arr = groups.get(k).slice().sort((a,b) => a.title.localeCompare(b.title, 'en'));
    const cards = arr.reduce((n,p) => n + pawnTotal(p), 0);
    return `<div class="sup-group">
      <h5>${esc(PAWN_SIZE_LABEL[k] || 'Размер не указан')} · ${arr.length}
        <span class="pawn-sub">${cards} ${plural(cards,'фишка','фишки','фишек')}</span></h5>
      <div class="pawn-list">${arr.map(p =>
        `<div class="pawn-row">${pawnCardHTML(p)}</div>`).join('')}</div>
    </div>`;
  }).join('') : '<div class="sub">Ничего не найдено.</div>';

  const totalCards = list.reduce((n,p) => n + pawnTotal(p), 0);
  el('#bestiarySub').textContent =
    `${list.length} ${plural(list.length,'существо','существа','существ')} · ` +
    `${totalCards} ${plural(totalCards,'фишка','фишки','фишек')}` +
    (q ? ' · найдено по запросу' : '');
}

function renderMini() {
  renderSystems(miniSystems, miniItems, '#miniList', '#miniCount',
                'набор','набора','наборов', rosterShellHTML, true, false);
  renderRoster();
}

/* Каркас ростера живёт внутри карточки системы: коробки и собранные из них
   фигурки — это один раздел. Тело заполняет renderRoster, чтобы поиск
   перерисовывал только список и не терял фокус. */
function rosterShellHTML(sysId) {
  if (typeof MINIATURES === 'undefined') return '';
  if (!MINIATURES.some(m => m.system === sysId)) return '';
  return `<div class="sup-group roster-group" data-roster="${esc(sysId)}">
    <input type="search" class="search pawn-search" id="miniSearch"
           placeholder="Поиск миниатюры по названию…" autocomplete="off">
    <div id="rosterBody"></div>
  </div>`;
}

/* ---------- Ростер: реестр самих фигурок ----------
   Коробки лежат в разделе выше; здесь — что из них собрано, по фракциям.
   Специфичные для системы поля живут в блоке с её именем, поэтому второй
   сеттинг добавится рядом, не ломая этот код. */
const MINI_FACTION = {
  terran:  { label: 'Терраны',  logo: 'img/mini/faction-terran.png' },
  zerg:    { label: 'Зерги',    logo: 'img/mini/faction-zerg.png' },
  protoss: { label: 'Протоссы', logo: 'img/mini/faction-protoss.png' },
  // У террейна фракции нет, поэтому и значка нет — только заголовок.
  terrain: { label: 'Террейн' }
};
const MINI_FACTION_ORDER = ['terran','zerg','protoss','terrain'];
const SLOT_LABEL = { core:'Core', elite:'Elite', support:'Support', air:'Air',
                     hero:'Hero', structure:'Structure' };
const ROLE_LABEL = {
  'damage-dealer':'Damage Dealer', tank:'Tank', lifesaver:'Lifesaver',
  tactician:'Tactician', support:'Support'
};

/* Текст правил с карты приходит с **жирными** выделениями: сначала экранируем
   всё, и только потом поднимаем маркеры в теги — иначе получим дыру в HTML. */
function rules(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function miniCardHTML(m) {
  const sys = m[m.system] || {};
  // В плитке — то, по чему фигурку узнают и по чему набирают армию:
  // картинка, слот, количество, имя и база.
  return `${m.image ? `<div class="mini-cover">
      <img src="${esc(m.image)}" alt="" loading="lazy" onerror="this.closest('.mini-cover').remove()">
      ${sys.armySlot ? `<span class="mini-slot">${esc(
        (SLOT_LABEL[sys.armySlot] || sys.armySlot).toUpperCase())}</span>` : ''}
      <span class="mini-qty">${m.count}</span>
    </div>` : ''}
    <div class="mini-body">
      <span class="mini-title">${esc(m.title)}</span>
      ${sys.baseDiameter ? `<span class="mini-base">⌀ ${esc(sys.baseDiameter)}</span>` : ''}
    </div>`;
}

/* Карточка юнита в модалке: повторяет раскладку игровой карты —
   статлиния, боевые теги, слот армии — но в оформлении сайта. */
function miniModalHTML(m) {
  const sys = m[m.system] || {};
  const st = sys.stats || {};
  const line = [
    ['SHIELD', st.shield], ['SPEED', st.speed], ['ARMOUR', st.armour], ['EVADE', st.evade],
    ['HIT POINTS', st.hitpoints], ['SIZE', st.size]
  ].filter(([, v]) => v != null);
  const parent = m.variantOf && MINIATURES.find(x => x.id === m.variantOf);
  return `<button class="close-x" id="closeX" aria-label="Закрыть">×</button>
    <div class="unit-card">
      <div class="unit-top">
        ${m.image ? `<img class="unit-art" src="${esc(m.image)}" alt=""
           onerror="this.remove()">` : ''}
        <div class="unit-id">
          <h2>${esc(m.title)}</h2>
          ${m.originalTitle ? `<div class="unit-orig">${esc(m.originalTitle)}</div>` : ''}
          <div class="unit-badges">
            ${sys.armySlot ? `<span class="unit-slot">${esc((SLOT_LABEL[sys.armySlot] || sys.armySlot).toUpperCase())}</span>` : ''}
            ${sys.combatRole ? `<span class="unit-role">${esc(
                (ROLE_LABEL[sys.combatRole] || sys.combatRole).toUpperCase())}</span>` : ''}
            ${sys.subFaction ? `<span class="unit-sub">${esc(sys.subFaction)}</span>` : ''}
            <span class="unit-qty">${m.count} ${plural(m.count,'фигурка','фигурки','фигурок')}</span>
          </div>
        </div>
      </div>

      ${sys.combatScale ? `<div class="unit-scale">
        <span class="cs-lbl">CLOSE COMBAT</span>
        <span class="cs-segs">${[1,2,3,4,5].map(i =>
          `<i class="${i === sys.combatScale ? 'on' : ''}"></i>`).join('')}</span>
        <span class="cs-lbl">RANGED COMBAT</span>
      </div>` : ''}

      ${line.length ? `<div class="unit-stats">${line.map(([k,v]) =>
        `<div class="unit-stat"><b>${esc(String(v))}</b><i>${esc(k)}</i></div>`).join('')}</div>`
        : sys.armySlot ? '<div class="unit-empty">Характеристики пока не заполнены.</div>' : ''}

      ${(sys.combatTags || []).length ? `<div class="unit-row">
        <div class="unit-label">COMBAT TAGS</div>
        <div class="unit-tags">${sys.combatTags.map(t =>
          `<span class="unit-tag">${esc(t.toUpperCase())}</span>`).join('')}</div>
      </div>` : ''}

      ${sys.supplyProfile ? `<table class="unit-supply">
        <tr><th>MODELS</th>${sys.supplyProfile.map(p =>
          `<td>${esc(String(p.models))}</td>`).join('')}</tr>
        <tr><th>SUPPLY</th>${sys.supplyProfile.map(p =>
          `<td>${esc(String(p.supply))}</td>`).join('')}</tr>
        ${sys.cost ? `<tr><th>MINERALS</th>${sys.supplyProfile.map((p, i) =>
          `<td>${sys.cost[i] == null ? '—' : esc(String(sys.cost[i]))}</td>`).join('')}</tr>` : ''}
      </table>` : ''}

      ${sys.attacks ? `<div class="unit-row">
        <div class="unit-label">ATTACKS</div>
        ${sys.attacks.map(a => `<details class="up">
          <summary class="up-head">
            <span class="up-chev">▸</span>
            <span class="up-name">${esc(a.name)}</span>
            <span class="up-kw atk">${esc(a.phase)}</span>
          </summary>
          <div class="up-body">
            <div class="up-wpn">${
              [['RNG', a.rng], ['TARGET', a.target], ['RoA', a.roa], ['HIT', a.hit],
               ['SURGE', a.surge], ['S DICE', a.sdice], ['DMG', a.dmg]].map(([k, v]) =>
                `<span><i>${k}</i><b>${esc(String(v))}</b></span>`).join('')}
              ${a.keyword && a.keyword !== '—'
                ? `<span class="wide"><i>KEYWORD</i><b>${esc(a.keyword)}</b></span>` : ''}
            </div>
          </div>
        </details>`).join('')}
      </div>` : ''}

      ${sys.actions ? `<div class="unit-row">
        <div class="unit-label">ACTIONS</div>
        ${sys.actions.map(a => `<details class="up">
          <summary class="up-head">
            <span class="up-chev">▸</span>
            <span class="up-name">${esc(a.name)}</span>
            <span class="up-kw">${esc(a.keyword)}</span>
          </summary>
          <div class="up-body">
            ${a.phase || a.cost ? `<div class="up-tags">
              ${a.phase ? `<span class="up-phase">${esc(a.phase)} PHASE</span>` : ''}
              ${a.cost ? `<span class="up-pay">${esc(a.cost)}</span>` : ''}</div>` : ''}
            <p class="up-text">${rules(a.text)}</p>
          </div>
        </details>`).join('')}
      </div>` : ''}

      ${sys.upgrades ? `<div class="unit-row">
        <div class="unit-label">UPGRADES · цена за отряд
          ${sys.upgrades.models.map(n => `${n}`).join(' / ')}
          ${plural(sys.upgrades.models[sys.upgrades.models.length-1],
                   'модель','модели','моделей')}</div>
        ${sys.upgrades.list.map(u => `<details class="up">
          <summary class="up-head">
            <span class="up-chev">▸</span>
            <span class="up-name">${esc(u.name)}</span>
            <span class="up-cost">${u.cost.join(' / ')}</span>
          </summary>
          <div class="up-body">
            <div class="up-tags">
              ${u.phase ? `<span class="up-phase">${esc(u.phase)} PHASE</span>` : ''}
              ${u.keyword ? `<span class="up-kw">${esc(u.keyword)}</span>` : ''}
              ${u.weapon ? `<span class="up-kw weapon">WEAPON</span>` : ''}
              ${u.specialist ? `<span class="up-tag">SPECIALIST</span>` : ''}
              ${u.cost_activate ? `<span class="up-pay">${esc(u.cost_activate)}</span>` : ''}
              ${u.for ? `<span class="up-for">вместо ${esc(u.for)}</span>` : ''}
            </div>
            ${u.text ? `<p class="up-text">${rules(u.text)}</p>` : ''}
            ${u.weapon ? `<div class="up-wpn">${
              [['RNG', u.weapon.rng], ['TARGET', u.weapon.target], ['RoA', u.weapon.roa],
               ['HIT', u.weapon.hit], ['SURGE', u.weapon.surge], ['S DICE', u.weapon.sdice],
               ['DMG', u.weapon.dmg]].map(([k, v]) =>
                `<span><i>${k}</i><b>${esc(String(v))}</b></span>`).join('')}
              ${u.weapon.keyword && u.weapon.keyword !== '—'
                ? `<span class="wide"><i>KEYWORD</i><b>${esc(u.weapon.keyword)}</b></span>` : ''}
            </div>` : ''}
          </div>
        </details>`).join('')}
      </div>` : ''}

      <div class="unit-foot">
        ${sys.baseDiameter ? `<span>⌀ ${esc(sys.baseDiameter)}</span>` : ''}
        ${parent ? `<span>сборка с рамки «${esc(parent.title)}»
          <button class="var-link" data-mini="${esc(parent.id)}">открыть</button></span>` : ''}
      </div>
      ${m.note ? `<div class="unit-note">${esc(m.note)}</div>` : ''}
    </div>`;
}

/* Раскрывает раздел системы, к которой относится карточка. По прямой ссылке
   он иначе остаётся свёрнутым, и после закрытия окна непонятно, куда попал.
   Прокручиваем только если раздел правда был закрыт — чтобы не дёргать фон
   при обычном клике по плитке. */
function revealSystem(ids) {
  let opened = null;
  for (const id of new Set(ids.filter(Boolean))) {
    const card = document.querySelector(`.sys-card[data-sys="${CSS.escape(id)}"]`);
    if (card && !card.classList.contains('open')) {
      card.classList.add('open');
      opened = opened || card;
    }
  }
  if (opened) opened.scrollIntoView({ block: 'start' });
}

/* fromHistory=true — открытие пришло из popstate или из адреса при загрузке,
   тогда новую запись в историю не добавляем. */
function openMiniModal(id, fromHistory) {
  const m = typeof MINIATURES === 'undefined'
    ? null : MINIATURES.find(x => x.id === id);
  if (!m) return;
  modalHistory.length = 0;
  state.openId = null;                 // модалка одна на двоих
  state.openMini = id;
  if (!fromHistory && urlSyncReady) stateToUrl(false);
  revealSystem([m.system]);
  el('#modal').innerHTML = miniModalHTML(m);
  showBackdrop(true);
}

function renderRoster() {
  const wrap = el('#rosterBody');
  if (!wrap || typeof MINIATURES === 'undefined') return;
  const sysId = wrap.closest('.roster-group')?.dataset.roster;
  const all = MINIATURES.filter(m => !sysId || m.system === sysId);
  const q = (el('#miniSearch')?.value || '').trim().toLowerCase();
  const list = q
    ? all.filter(m => m.title.toLowerCase().includes(q) ||
                      (m.originalTitle || '').toLowerCase().includes(q))
    : all;

  const groups = new Map();
  for (const m of list) {
    const f = (m[m.system] || {}).faction || 'other';
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(m);
  }
  const order = MINI_FACTION_ORDER.filter(f => groups.has(f))
    .concat([...groups.keys()].filter(f => !MINI_FACTION_ORDER.includes(f)));

  wrap.innerHTML = list.length ? order.map(f => {
    const arr = groups.get(f).slice().sort((a,b) => a.title.localeCompare(b.title,'ru'));
    const figs = arr.reduce((n,m) => n + (m.count || 0), 0);
    const info = MINI_FACTION[f] || { label: f };
    return `<div class="sup-group fac-group">
      <h4 class="fac-head">
        ${info.logo ? `<img class="fac-logo" src="${esc(info.logo)}" alt="">` : ''}
        <span class="fac-text">
          <span class="fac-name">${esc(info.label)}</span>
          <span class="pawn-sub">${arr.length} ${plural(arr.length,'вид','вида','видов')} ·
            ${figs} ${plural(figs,'фигурка','фигурки','фигурок')}</span>
        </span>
      </h4>
      <div class="mini-grid">${arr.map(m =>
        `<div class="mini-card${m.hero ? ' hero' : ''}" data-id="${esc(m.id)}"
           role="button" tabindex="0">${miniCardHTML(m)}</div>`).join('')}</div>
    </div>`;
  }).join('') : '<div class="sub">Ничего не найдено.</div>';

}

/* ---------- статистика ---------- */
function renderStats() {
  const v = el('#viewStats');
  const all = GAMES;
  const bases = all.filter(g => g.kind === 'base').length;
  const exps  = all.filter(g => g.kind === 'expansion').length;
  const rpgN  = rpgSystems.length;
  const supN  = rpgSupps.length;
  // Физические коробки: без записей-контейнеров (ролевые системы, системы
  // миниатюр), но со вторыми экземплярами — они реально стоят на полке.
  const totalCopies = all.reduce((s, g) =>
    ['rpg','miniatures'].includes(g.kind) ? s : s + (g.copies || 1), 0);
  const dupCopies = all.filter(g => (g.copies || 1) > 1).length;

  const withTime = all.filter(g => g.time);
  const avgTime = withTime.length
    ? Math.round(withTime.reduce((s,g) => s + (g.time[0]+g.time[1])/2, 0) / withTime.length) : null;
  const withW = all.filter(g => g.weight != null);
  const avgW = withW.length ? (withW.reduce((s,g)=>s+g.weight,0)/withW.length).toFixed(2) : null;

  // Стоимость: считаем только по позициям, где цена известна.
  const priced = all.filter(g => g.price != null);
  const totalPrice = priced.reduce((s,g) => s + g.price * (g.copies || 1), 0);

  const catCount = new Map();
  for (const g of all) for (const c of (g.categories||[])) catCount.set(c, (catCount.get(c)||0)+1);
  const topCats = [...catCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12);
  const maxCat = topCats.length ? topCats[0][1] : 1;

  // Считаем коробки на полке. У двуязычной записи copies — это и есть её
  // экземпляры на разных языках (2 копии = русская + английская), поэтому
  // экземпляры распределяем между языками, а не умножаем на их число.
  // Записи-контейнеры пропускаем: физически их не существует.
  const langCount = new Map();
  for (const g of all) {
    if (['rpg','miniatures'].includes(g.kind)) continue;
    const ls = langsOf(g);
    const per = (g.copies || 1) / ls.length;
    for (const l of ls) langCount.set(l, (langCount.get(l)||0) + per);
  }
  // Доли могут выйти дробными (нечётное число копий на два языка) — округляем.
  const langRows = [...langCount.entries()]
    .map(([l,n]) => [l, Math.round(n)])
    .filter(([, n]) => n > 0)
    .sort((a,b)=>b[1]-a[1]);
  const maxLang = langRows.length ? langRows[0][1] : 1;

  // До 12 включительно: в коллекции есть пати-игры на 10-24 человека,
  // на восьмёрке они бы обрезались.
  const pCount = new Map();
  for (let n = 1; n <= 12; n++) {
    pCount.set(n, all.filter(g => {
      const p = effectivePlayers(g);
      return p && n >= p[0] && n <= p[1];
    }).length);
  }
  const maxP = Math.max(...pCount.values(), 1);

  /* Круговая диаграмма на SVG: доли считаются от суммы, подписи — сбоку.
     Донат, а не полный круг: в дырке показываем общее число. */
  const PIE_COLORS = ['#d98a4a','#6aa06a','#8a7fd1','#c9a13b','#5f9ec4','#c4635f',
                      '#7fa8a0','#a87fa0','#9aa05f','#b0705a'];
  const pie = (rows, total, unitForms) => {
    const unit = Array.isArray(unitForms)
      ? plural(total, unitForms[0], unitForms[1], unitForms[2]) : unitForms;
    if (!rows.length || !total) return '';
    const R = 54, C = 62, HOLE = 30;
    let angle = -Math.PI / 2, paths = '';
    rows.forEach(([, n], i) => {
      const frac = n / total;
      const a1 = angle, a2 = angle + frac * Math.PI * 2;
      angle = a2;
      const col = PIE_COLORS[i % PIE_COLORS.length];
      if (frac >= 0.9999) {                       // единственный сегмент — просто кольцо
        paths += `<circle cx="${C}" cy="${C}" r="${(R+HOLE)/2}" fill="none"
                   stroke="${col}" stroke-width="${R-HOLE}"></circle>`;
        return;
      }
      const p = (r, a) => `${(C + r*Math.cos(a)).toFixed(2)} ${(C + r*Math.sin(a)).toFixed(2)}`;
      const big = frac > 0.5 ? 1 : 0;
      paths += `<path d="M ${p(R,a1)} A ${R} ${R} 0 ${big} 1 ${p(R,a2)}
                 L ${p(HOLE,a2)} A ${HOLE} ${HOLE} 0 ${big} 0 ${p(HOLE,a1)} Z"
                 fill="${col}"></path>`;
    });
    return `<div class="pie-wrap">
      <svg class="pie" viewBox="0 0 124 124" role="img" aria-label="Диаграмма">
        ${paths}
        <text x="62" y="59" class="pie-total">${total}</text>
        <text x="62" y="73" class="pie-unit">${esc(unit)}</text>
      </svg>
      <ul class="pie-legend">
        ${rows.map(([label, n], i) => `<li>
          <span class="dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
          <span class="pl">${esc(label)}</span>
          <span class="pv">${n} · ${Math.round(n/total*100)}%</span>
        </li>`).join('')}
      </ul>
    </div>`;
  };

  const bar = (label, n, max) =>
    `<div class="bar-row"><span class="bl">${esc(label)}</span>` +
    `<span class="bt"><span class="bf" style="width:${(n/max*100).toFixed(1)}%"></span></span>` +
    `<span class="bn">${n}</span></div>`;

  // Заполненность: сколько записей не требуют доработки.
  const complete = all.filter(g => missingFields(g).length === 0).length;
  const donePct = all.length ? Math.round(complete / all.length * 100) : 0;

  // Разбивка по типам — видно, где именно дыры.
  const byKind = ['base','expansion','tcg','accessory','rpg','rpg-supplement',
                  'miniatures','miniatures-item']
    .map(k => {
      const items = all.filter(g => g.kind === k);
      if (!items.length) return null;
      const ok = items.filter(g => missingFields(g).length === 0).length;
      return { label: KIND_LABEL[k], ok, total: items.length };
    }).filter(Boolean);

  /* Разбивки по бакетам фильтров: считаем по тем же правилам, что и фильтры,
     иначе цифры в статистике и в выдаче разошлись бы. */
  const bucketRows = (buckets, items) => buckets
    .map(b => [b.label, items.filter(b.test).length])
    .filter(([, n]) => n > 0);
  const playable  = all.filter(g => !['rpg','rpg-supplement','miniatures','miniatures-item'].includes(g.kind));
  const timeRows  = bucketRows(TIME_BUCKETS, playable.filter(g => g.time));
  const weightRows = bucketRows(WEIGHT_BUCKETS, playable.filter(g => g.weight));
  // Цена считается по экземплярам: две копии игры — две покупки, как и в языках.
  const priceItems = all.filter(g => g.price != null)
    .flatMap(g => Array((g.copies || 1)).fill(g));
  const priceRows = bucketRows(PRICE_BUCKETS, priceItems);
  const sum = rows => rows.reduce((s, [, n]) => s + n, 0);

  // Ростер миниатюр: фигурки по фракциям, включая террейн.
  const miniRows = typeof MINIATURES === 'undefined' ? [] :
    MINI_FACTION_ORDER
      .map(f => [MINI_FACTION[f].label,
                 MINIATURES.filter(m => (m[m.system] || {}).faction === f)
                           .reduce((n, m) => n + (m.count || 0), 0)])
      .filter(([, n]) => n > 0);

  // Каких полей не хватает чаще всего.
  const gapCount = new Map();
  for (const g of all) for (const f of missingFields(g)) gapCount.set(f, (gapCount.get(f)||0)+1);
  const gaps = [...gapCount.entries()].sort((a,b) => b[1]-a[1]);
  const maxGap = gaps.length ? gaps[0][1] : 1;

  v.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box"><div class="n">${totalCopies}</div><div class="l">игр на полке</div></div>
      <div class="stat-box"><div class="n">${bases}</div><div class="l">базовых игр</div></div>
      <div class="stat-box"><div class="n">${exps}</div><div class="l">дополнений</div></div>
      <div class="stat-box"><div class="n">${rpgN}</div><div class="l">ролевых систем</div></div>
      <div class="stat-box"><div class="n">${supN}</div><div class="l">материалов НРИ</div></div>
      ${priced.length ? `<div class="stat-box"><div class="n">$${totalPrice.toLocaleString('ru-RU')}</div>
        <div class="l">стоимость коллекции</div></div>` : ''}
    </div>

    <div class="panel">
      <h3>Топ жанров</h3>
      ${topCats.map(([c,n]) => bar(c, n, maxCat)).join('')}
    </div>

    <div class="panel">
      <h3>Сколько игр подойдёт для N игроков</h3>
      ${[...pCount.entries()].map(([n,c]) => bar(`${n} ${plural(n,'игрок','игрока','игроков')}`, c, maxP)).join('')}
    </div>

    <div class="pies">
      ${miniRows.length ? `<div class="panel">
        <h3>Миниатюры по фракциям</h3>
        <p class="panel-note">Все собранные фигурки</p>
        ${pie(miniRows, sum(miniRows), ['фигурка','фигурки','фигурок'])}
      </div>` : ''}

      ${langRows.length ? `<div class="panel">
        <h3>Языки</h3>
        <p class="panel-note">Все игры</p>
        ${pie(langRows.map(([l,n]) => [LANG_LABEL[l] || l, n]), sum(langRows), ['игра','игры','игр'])}
      </div>` : ''}

      ${timeRows.length ? `<div class="panel">
        <h3>Продолжительность</h3>
        <p class="panel-note">Все игры, кроме НРИ</p>
        ${pie(timeRows, sum(timeRows), ['игра','игры','игр'])}
      </div>` : ''}

      ${priceRows.length ? `<div class="panel">
        <h3>Цена</h3>
        <p class="panel-note">Все игры</p>
        ${pie(priceRows, sum(priceRows), ['игра','игры','игр'])}
      </div>` : ''}

      ${weightRows.length ? `<div class="panel">
        <h3>Сложность</h3>
        <p class="panel-note">Все игры, кроме НРИ</p>
        ${pie(weightRows, sum(weightRows), ['игра','игры','игр'])}
      </div>` : ''}
    </div>
  `;
}

/* ---------- модалка ----------
   modalHistory хранит цепочку переходов игра → дополнение → …,
   чтобы работала кнопка «назад» внутри окна. */
const modalHistory = [];

/* Пока открыта модалка, фон не прокручивается: иначе колесо уводит список
   под окном. Ширину исчезнувшего скроллбара компенсируем полем, чтобы
   страница не дёргалась вбок. */
function showBackdrop(on) {
  const b = el('#backdrop');
  if (b.classList.contains('open') === on) return;
  if (on) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = gap + 'px';
    document.body.classList.add('modal-open');
  } else {
    document.body.classList.remove('modal-open');
    document.body.style.paddingRight = '';
  }
  b.classList.toggle('open', on);
}

/* fromHistory=true — открытие вызвано popstate/загрузкой страницы:
   тогда новую запись в историю добавлять не нужно. */
function openModal(id, keepHistory, fromHistory) {
  const g = byId.get(id);
  if (!g) return;
  if (!keepHistory) { modalHistory.length = 0; modalHistory.push(id); }
  state.openId = id;
  state.openMini = null;
  revealSystem([...systemsOf(g), g.system, g.universal ? '__universal' : null]);
  if (!fromHistory && urlSyncReady) stateToUrl(false);   // новая запись в истории
  const m = el('#modal');
  const stats = [];
  // У книг правил, карт и наборов миниатюр нет ни состава игроков,
  // ни длительности партии, ни сложности — эти строки для них не выводим.
  const isPlayable = !['rpg-supplement', 'miniatures-item'].includes(g.kind);

  if (isPlayable) {
    const pt = playersText(g);
    if (pt) {
      const bp = effectiveBest(g);
      stats.push(['Игроки', pt, bp ? `лучше ${bp}` : null]);
    }
    const tt = timeText(g);
    if (tt) stats.push(['Время', tt]);
  }
  if (g.supplementType) stats.push(['Тип', SUPP_LABEL[g.supplementType] || g.supplementType]);
  if (g.year) stats.push(['Год', g.year]);
  if (isPlayable) {
    if (g.weight != null) stats.push(['Сложность', g.weight.toFixed(2) + ' / 5']);
    if (g.bggRating) stats.push(['Рейтинг BGG', g.bggRating.toFixed(1)]);
    else if (g.rating != null) stats.push(['Моя оценка', g.rating.toFixed(1)]);
    if (g.bggRank) stats.push(['Ранг BGG', '#' + g.bggRank]);
  }
  if (g.price != null) stats.push(['Цена', '$' + g.price]);
  stats.push(['Язык', langsOf(g).map(l => LANG_LABEL[l] || l).join(', ')]);
  if (g.copies > 1) stats.push(['Экземпляров', g.copies]);

  const exps = expansionsOf.get(g.id) || [];
  const parent = g.parent ? byId.get(g.parent) : null;
  const systems = systemsOf(g).map(id => byId.get(id)).filter(Boolean);
  // Самостоятельные дополнения — играются отдельно, но связаны с базовой игрой.
  const standaloneParent = g.standaloneFor ? byId.get(g.standaloneFor) : null;
  const standalones = GAMES.filter(x => x.standaloneFor === g.id);

  m.innerHTML = `
    <button class="close-x" id="closeX">×</button>
    ${modalHistory.length > 1 ? `<button class="modal-back">← назад</button>` : ''}
    <h2>${esc(g.title)}</h2>
    ${g.originalTitle && g.originalTitle !== g.title ? `<div class="m-orig">${esc(g.originalTitle)}</div>` : '<div class="m-orig"></div>'}
    ${g.image ? `<img class="m-cover" src="${esc(g.image)}" alt="${esc(g.title)}" loading="lazy"
       onerror="this.style.display='none'">` : ''}
    ${parent ? `<div class="m-sec"><h4>Дополнение к игре</h4>
      <button class="rel-link" data-go="${esc(parent.id)}">← ${esc(parent.title)}</button></div>` : ''}
    ${standaloneParent ? `<div class="m-sec"><h4>Самостоятельное дополнение к игре</h4>
      <button class="rel-link" data-go="${esc(standaloneParent.id)}">← ${esc(standaloneParent.title)}</button></div>` : ''}
    ${systems.length ? `<div class="m-sec">
      <h4>${systems.length > 1 ? 'Системы' : 'Система'}</h4>
      <div>${systems.map(s => esc(s.title)).join(', ')}${
        g.supplementType ? ' · ' + esc(SUPP_LABEL[g.supplementType]||g.supplementType) : ''}</div>
      ${g.universal ? '<div class="hint">Универсальный материал — подходит любой системе с боем на сетке.</div>' : ''}
    </div>` : ''}
    <div class="m-grid">
      ${stats.map(([l,v2,sub]) => `<div class="m-stat"><div class="lbl">${esc(l)}</div>` +
        `<div class="val">${esc(v2)}</div>` +
        (sub ? `<div class="sub-val">${esc(sub)}</div>` : '') + `</div>`).join('')}
    </div>
    ${g.designers && g.designers.length ? `<div class="m-sec"><h4>Авторы</h4><div>${g.designers.map(esc).join(', ')}</div></div>` : ''}
    ${g.publisher ? `<div class="m-sec"><h4>Издатель</h4><div>${esc(g.publisher)}</div></div>` : ''}
    ${g.categories && g.categories.length ? `<div class="m-sec"><h4>Жанры</h4><div class="tags">${g.categories.map(c=>`<span class="tag">${esc(c)}</span>`).join('')}</div></div>` : ''}
    ${g.mechanics && g.mechanics.length ? `<div class="m-sec"><h4>Механики</h4><div class="tags">${g.mechanics.map(c=>`<span class="tag">${esc(c)}</span>`).join('')}</div></div>` : ''}
    ${exps.length ? `<div class="m-sec"><h4>Дополнения в коллекции · ${exps.length}</h4>
      <div class="rel-list">${exps.map(e =>
        `<button class="rel-link" data-go="${esc(e.id)}">${esc(e.title)} ${langFlags(e)} →</button>`
      ).join('')}</div></div>` : ''}
    ${standalones.length ? `<div class="m-sec"><h4>Самостоятельные дополнения · ${standalones.length}</h4>
      <div class="rel-list">${standalones.map(e =>
        `<button class="rel-link" data-go="${esc(e.id)}">${esc(e.title)} →</button>`
      ).join('')}</div></div>` : ''}
    ${g.note ? `<div class="m-sec"><h4>Заметка</h4><div>${esc(g.note)}</div></div>` : ''}
    ${(() => { const ms = missingFields(g); return ms.length
      ? `<div class="m-sec"><h4>Не хватает данных</h4><div class="missing">⚠ ${ms.map(esc).join(', ')}</div></div>` : ''; })()}
    <div class="m-links">
      ${g.bggUrl ? `<a class="bgg-link" href="${esc(g.bggUrl)}" target="_blank" rel="noopener">
         Открыть на BoardGameGeek ↗</a>` : ''}
      ${g.url ? `<a class="bgg-link" href="${esc(g.url)}" target="_blank" rel="noopener">
         Страница товара ↗</a>` : ''}
    </div>
  `;
  showBackdrop(true);
}

function closeModal(fromHistory) {
  const wasOpen = el('#backdrop').classList.contains('open');
  showBackdrop(false);
  if (!wasOpen && !fromHistory) return;      // нечего закрывать
  modalHistory.length = 0;
  const had = state.openId || state.openMini;
  state.openId = null;
  state.openMini = null;
  // Закрытие — это новый шаг вперёд, а не откат: тогда «назад» вернёт
  // карточку, на которой пользователь остановился.
  if (!fromHistory && had && urlSyncReady) stateToUrl(false);
}

/* ---------- построение фильтров ---------- */
function buildChips(container, values, stateKey) {
  const active = state[stateKey];
  container.dataset.stateKey = stateKey;   // нужен для синхронизации с URL
  container.innerHTML = values.map(v =>
    `<button class="chip" data-val="${esc(v.id)}" aria-pressed="${active.has(v.id)}">${esc(v.label)}` +
    (v.count != null ? `<span class="cnt">${v.count}</span>` : '') + `</button>`
  ).join('');
  container.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const val = b.dataset.val;
    const set = state[stateKey];
    if (set.has(val)) { set.delete(val); b.setAttribute('aria-pressed','false'); }
    else { set.add(val); b.setAttribute('aria-pressed','true'); }
    apply();
  });
}

/* Списки жанров и механик длинные — сворачиваем их до трёх строк и вешаем
   «Показать все». Кнопку добавляем только если чипы действительно не влезают,
   иначе короткие группы («Тип», «Язык») получили бы бесполезный переключатель.
   Считать можно только после отрисовки: до неё scrollHeight равен нулю. */
const CHIPS_CLAMP_H = 90;                   // три строки чипов

function setupChipsToggle(container) {
  const wasExpanded = container.dataset.expanded === '1';
  container.classList.remove('clamped');
  const prev = container.nextElementSibling;
  if (prev && prev.classList.contains('chips-more')) prev.remove();

  if (container.scrollHeight <= CHIPS_CLAMP_H + 4) return;

  // offsetTop считается от offsetParent, а не от контейнера, поэтому берём
  // положение относительно первого чипа — иначе в счётчик попадают все.
  const top0 = container.children[0].offsetTop;
  const hidden = [...container.children]
    .filter(c => c.offsetTop - top0 >= CHIPS_CLAMP_H).length;
  if (!wasExpanded) container.classList.add('clamped');

  const btn = document.createElement('button');
  btn.className = 'chips-more';
  btn.type = 'button';
  const sync = () => {
    const clamped = container.classList.contains('clamped');
    container.dataset.expanded = clamped ? '0' : '1';
    btn.textContent = clamped
      ? `Показать все${hidden ? ` (+${hidden})` : ''}` : 'Свернуть';
  };
  sync();
  btn.addEventListener('click', () => {
    container.classList.toggle('clamped');
    sync();
  });
  container.after(btn);
}

/* Пересчитываем свёртку, когда сайдбар реально отрисован, и при изменении
   ширины: от неё зависит, сколько чипов помещается в строку. В скрытой вкладке
   (фон, свёрнутое окно) размеры равны нулю — там считать нечего, поэтому ждём
   через ResizeObserver, который сработает, как только сайдбар получит высоту. */
function initChipsToggles() {
  const filters = el('#filters');
  if (!filters) return;
  const run = () => {
    if (!filters.offsetWidth) return false;          // ещё не отрисован
    filters.querySelectorAll('.chips').forEach(setupChipsToggle);
    return true;
  };
  if (!run() && window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (run()) ro.disconnect(); });
    ro.observe(filters);
  }
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 150); });
}

function initFilters() {
  // Тип
  const kinds = ['base','expansion','tcg','accessory'].filter(k => boardItems.some(g => g.kind === k));
  buildChips(el('#fKind'), kinds.map(k => ({
    id: k, label: KIND_LABEL[k], count: boardItems.filter(g => g.kind === k).length
  })), 'kinds');

  // Жанры
  const catCount = new Map();
  for (const g of boardItems) for (const c of (g.categories||[])) catCount.set(c,(catCount.get(c)||0)+1);
  const cats = [...catCount.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'ru'));
  buildChips(el('#fCategory'), cats.map(([c,n]) => ({ id:c, label:c, count:n })), 'categories');

  // Механики (только достаточно частые, чтобы не засорять)
  const mCount = new Map();
  for (const g of boardItems) for (const m of (g.mechanics||[])) mCount.set(m,(mCount.get(m)||0)+1);
  const mechs = [...mCount.entries()].filter(([,n]) => n >= 2)
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'ru')).slice(0, 24);
  buildChips(el('#fMechanic'), mechs.map(([m,n]) => ({ id:m, label:m, count:n })), 'mechanics');

  // Время / сложность
  buildChips(el('#fTime'), TIME_BUCKETS.map(b => ({
    id: b.id, label: b.label, count: boardItems.filter(b.test).length })), 'times');
  buildChips(el('#fWeight'), WEIGHT_BUCKETS.map(b => ({
    id: b.id, label: b.label, count: boardItems.filter(b.test).length })), 'weights');

  // Цена
  buildChips(el('#fPrice'), PRICE_BUCKETS.map(b => ({
    id: b.id, label: b.label, count: boardItems.filter(b.test).length })), 'prices');

  // Языки
  const langCount = new Map();
  for (const g of boardItems) for (const l of langsOf(g)) langCount.set(l,(langCount.get(l)||0)+1);
  buildChips(el('#fLang'), [...langCount.entries()]
    .sort((a,b)=>b[1]-a[1])
    .map(([l,n]) => ({ id:l, label: LANG_LABEL[l]||l, count:n })), 'langs');
}

/* Рендер + запись состояния в URL. Вызывается вместо renderGames()
   из всех обработчиков фильтров, чтобы ссылка всегда была актуальной. */
let urlSyncReady = false;
function apply() {
  renderGames();
  if (urlSyncReady) stateToUrl(true);
}

/* ---------- состояние в адресной строке ----------
   Фильтры пишутся в query-строку, чтобы ссылку можно было переслать.
   Пустые значения не пишем, иначе URL распухает. */
const URL_KEYS = [
  ['kinds', 'kind'], ['categories', 'cat'], ['mechanics', 'mech'],
  ['times', 'time'], ['weights', 'w'], ['langs', 'lang'], ['prices', 'price']
];

function stateToUrl(replace) {
  const p = new URLSearchParams();
  if (state.view !== 'games') p.set('view', state.view);
  if (state.q) p.set('q', state.q);
  for (const [key, param] of URL_KEYS) {
    if (state[key].size) p.set(param, [...state[key]].join(','));
  }
  if (state.players > 0) p.set('players', state.players);
  if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort);
  // открытая карточка — часть адреса: тогда «назад» закрывает её,
  // а не перескакивает к предыдущей вкладке
  if (state.openId) p.set('game', state.openId);
  if (state.openMini) p.set('mini', state.openMini);

  const qs = p.toString();
  const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

function urlToState() {
  const p = new URLSearchParams(location.search);
  state.view = p.get('view') || 'games';
  state.q = p.get('q') || '';
  for (const [key, param] of URL_KEYS) {
    state[key].clear();
    const v = p.get(param);
    if (v) v.split(',').filter(Boolean).forEach(x => state[key].add(x));
  }
  state.players = Number(p.get('players')) || 0;
  state.sort = p.get('sort') || DEFAULT_SORT;
  state.openId = p.get('game') || null;
  state.openMini = p.get('mini') || null;
}

/* Синхронизирует контролы с состоянием (после разбора URL или кнопки «назад»). */
function syncControls() {
  el('#q').value = state.q;
  el('#sort').value = state.sort;
  el('#fPlayers').value = state.players;
  el('#fPlayersVal').textContent = state.players === 0
    ? 'любое' : `${state.players} ${plural(state.players,'игрок','игрока','игроков')}`;
  const map = Object.fromEntries(URL_KEYS.map(([k, ]) => [k, state[k]]));
  document.querySelectorAll('.chips').forEach(box => {
    const key = box.dataset.stateKey;
    if (!key) return;
    box.querySelectorAll('.chip').forEach(c =>
      c.setAttribute('aria-pressed', String(map[key] ? map[key].has(c.dataset.val) : false)));
  });
}

/* ---------- события ---------- */
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.view === view)));
  // На телефоне лента вкладок прокручивается: подтягиваем активную в видимую
  // часть, иначе после перехода она остаётся за краем экрана.
  const activeTab = document.querySelector(`.tab[data-view="${view}"]`);
  if (activeTab && activeTab.scrollIntoView) {
    activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  el('#viewGames').hidden = view !== 'games';
  el('#viewRpg').hidden   = view !== 'rpg';
  el('#viewMini').hidden  = view !== 'mini';
  el('#viewStats').hidden = view !== 'stats';
  el('#viewGaps').hidden  = view !== 'gaps';
  // На вкладках без фильтров убираем и саму колонку, иначе контент
  // остаётся зажатым в узкую полосу справа.
  document.querySelector('.layout').classList.toggle('no-filters', view !== 'games');
  if (view === 'stats') renderStats();
  if (view === 'gaps') renderGaps();
}

/* Позиции, которым не хватает данных. Живут вне фильтров и вкладок: это
   рабочий список «что дозаполнить», а не способ смотреть коллекцию. */
function incompleteItems() {
  return GAMES.map(g => ({ g, miss: missingFields(g) })).filter(x => x.miss.length);
}

/* Значок в шапке: появляется, только если есть что дозаполнять. */
function renderGapsBadge() {
  const n = incompleteItems().length;
  const btn = el('#gapsBtn');
  btn.hidden = !n;
  if (n) {
    el('#gapsCount').textContent = n;
    btn.title = `${n} ${plural(n,'позиция','позиции','позиций')} с неполными данными`;
  }
}

function renderGaps() {
  const items = incompleteItems();
  el('#gapsTitle').textContent = items.length
    ? `${items.length} ${plural(items.length,'позиция','позиции','позиций')} с неполными данными`
    : 'Все данные заполнены';
  el('#gapsList').innerHTML = items.length ? items.map(({g, miss}) => `
    <button class="gap-row" data-id="${esc(g.id)}">
      <span class="gap-cover">${g.image
        ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : '<span class="gap-noimg">—</span>'}</span>
      <span class="gap-main">
        <span class="gap-title">${esc(g.title)}</span>
        <span class="gap-kind">${esc(KIND_LABEL[g.kind] || g.kind)}</span>
      </span>
      <span class="gap-miss">${miss.map(f => `<span class="gap-tag">${esc(f)}</span>`).join('')}</span>
    </button>`).join('') : '<div class="empty"><div class="big">✓</div><div>Ничего дозаполнять не нужно.</div></div>';
}

/* Высота шапки уезжает, когда она переносит строки на узком экране.
   Сайдбар прилипает под неё, поэтому держим реальное значение в CSS-переменной,
   иначе фильтры сдвигаются при прокрутке. */
function trackHeaderHeight() {
  const header = el('header.top');
  if (!header) return;
  const sync = () => document.documentElement.style
    .setProperty('--header-h', Math.round(header.getBoundingClientRect().height) + 'px');
  sync();
  if (window.ResizeObserver) new ResizeObserver(sync).observe(header);
  else window.addEventListener('resize', sync);
}

function init() {
  trackHeaderHeight();
  // В шапке — физические коробки и книги: позиция, купленная дважды
  // (ru + en издание, второй экземпляр), даёт две штуки на полке.
  // Ролевые системы и системы миниатюр не считаем: это записи-контейнеры,
  // на полке им ничего не соответствует — коробки лежат в их материалах.
  const totalCopies = GAMES.reduce((s,g) =>
    ['rpg','miniatures'].includes(g.kind) ? s : s + (g.copies||1), 0);
  el('#brandSub').textContent =
    `${totalCopies} ${plural(totalCopies,'игра','игры','игр')} на полке`;

  // Состояние из ссылки читаем до построения фильтров, чтобы чипы
  // сразу отрисовались нажатыми.
  urlToState();
  initFilters();
  initChipsToggles();
  renderGapsBadge();
  syncControls();
  renderGames();
  renderRpg();
  renderMini();
  switchView(state.view);
  urlSyncReady = true;
  // ссылка вида ?game=everdell или ?mini=sc-zergling сразу открывает карточку
  if (state.openId && byId.has(state.openId)) openModal(state.openId, false, true);
  else if (state.openMini) openMiniModal(state.openMini, true);

  // Кнопки «назад/вперёд» в браузере возвращают прежний набор фильтров.
  window.addEventListener('popstate', () => {
    urlToState();
    syncControls();
    renderGames();
    switchView(state.view);
    // синхронизируем модалку с адресом: назад закрывает карточку
    // или возвращает предыдущую в цепочке дополнений
    if (state.openId && byId.has(state.openId)) {
      openModal(state.openId, false, true);
    } else if (state.openMini) {
      openMiniModal(state.openMini, true);
    } else {
      closeModal(true);
    }
  });

  el('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); apply(); });
  el('#sort').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });

  const pr = el('#fPlayers');
  pr.addEventListener('input', (e) => {
    state.players = Number(e.target.value);
    el('#fPlayersVal').textContent = state.players === 0
      ? 'любое' : `${state.players} ${plural(state.players,'игрок','игрока','игроков')}`;
    apply();
  });

  /* Сброс фильтров: используется и кнопкой в сайдбаре, и кликом по названию
     сайта. Сортировку не трогаем — это не фильтр, а способ смотреть. */
  const resetFilters = () => {
    state.q = ''; el('#q').value = '';
    state.players = 0; pr.value = 0; el('#fPlayersVal').textContent = 'любое';
    if (state.openId) { el('#backdrop').classList.remove('open'); state.openId = null; }
    ['kinds','categories','mechanics','times','weights','langs','prices'].forEach(k => state[k].clear());
    document.querySelectorAll('.chip[aria-pressed]').forEach(c =>
      c.setAttribute('aria-pressed', 'false'));
  };

  el('#resetBtn').addEventListener('click', () => { resetFilters(); apply(); });

  /* Бросок d20: пока крутится, число мельтешит, потом останавливается на
     выпавшем. 20 — критический успех, 1 — провал, у обоих своя анимация. */
  const d20 = el('#d20'), d20num = el('#d20num'), diceBtn = el('#diceBtn');
  let d20rolling = false;
  diceBtn.addEventListener('click', () => {
    if (d20rolling) return;
    d20rolling = true;
    d20.classList.remove('crit', 'fail');
    void d20.offsetWidth;                       // перезапуск анимации
    d20.classList.add('rolling');

    const roll = 1 + Math.floor(Math.random() * 20);
    const flicker = setInterval(() => {
      d20num.textContent = 1 + Math.floor(Math.random() * 20);
    }, 60);

    setTimeout(() => {
      clearInterval(flicker);
      d20num.textContent = roll;
      d20.classList.remove('rolling');
      if (roll === 20 || roll === 1) {
        void d20.offsetWidth;
        const cls = roll === 20 ? 'crit' : 'fail';
        d20.classList.add(cls);
        diceBtn.title = roll === 20 ? 'Критический успех!' : 'Критический провал…';
        setTimeout(() => { d20.classList.remove(cls); diceBtn.title = 'Бросить d20'; }, 2200);
      }
      d20rolling = false;
    }, 750);
  });

  // Название сайта работает как «домой»: вкладка игр и чистые фильтры.
  el('#brandHome').addEventListener('click', () => {
    resetFilters();
    switchView('games');
    renderGames();
    stateToUrl(false);
  });

  el('#grid').addEventListener('click', (e) => {
    // клик по ссылке BGG не должен открывать модалку
    if (e.target.closest('a')) return;
    const c = e.target.closest('.card');
    if (c) openModal(c.dataset.id);
  });

  // карточка — div с role="button", клавиатуру обрабатываем вручную
  el('#grid').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = e.target.closest('.card');
    if (c) { e.preventDefault(); openModal(c.dataset.id); }
  });

  // Раскрытие блоков-контейнеров вне списков систем: бестиарий лежит рядом
  // с #rpgList, поэтому обработчик ниже его не видит — слушаем секцию целиком.
  el('#viewRpg').addEventListener('click', (e) => {
    const h = e.target.closest('.sys-card.bestiary .sys-head');
    if (h) h.parentElement.classList.toggle('open');
  });
  el('#viewMini').addEventListener('click', (e) => {
    const mini = e.target.closest('.mini-card');
    if (mini) { openMiniModal(mini.dataset.id); return; }
  });

  el('#viewMini').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const mini = e.target.closest('.mini-card');
    if (mini) { e.preventDefault(); openMiniModal(mini.dataset.id); }
  });

  for (const sel of ['#rpgList', '#miniList']) {
    el(sel).addEventListener('click', (e) => {
      if (e.target.closest('a')) return;          // ссылка на BGG/магазин
      const card = e.target.closest('.supp-card');
      if (card) { openModal(card.dataset.id); return; }
      const h = e.target.closest('.sys-head');
      if (h) h.parentElement.classList.toggle('open');
    });
    // карточки — div с role="button", клавиатуру обрабатываем вручную
    el(sel).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.supp-card');
      if (card) { e.preventDefault(); openModal(card.dataset.id); }
    });
  }

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => { switchView(t.dataset.view); stateToUrl(false); }));

  el('#backdrop').addEventListener('click', (e) => {
    const v = e.target.closest('.var-link');
    if (v) { openMiniModal(v.dataset.mini); return; }

    // переход к родителю или дополнению прямо из модалки
    const rel = e.target.closest('.rel-link');
    if (rel) {
      modalHistory.push(rel.dataset.go);
      openModal(rel.dataset.go, true);
      return;
    }
    if (e.target.id === 'backdrop' || e.target.id === 'closeX') closeModal();
    // «← назад» внутри карточки = обычный шаг назад в истории браузера
    if (e.target.closest('.modal-back')) history.back();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  el('#filtersToggle').addEventListener('click', () => el('#filters').classList.toggle('open'));

  /* «Мне повезёт»: случайная игра из текущей выборки — то есть с учётом всех
     фильтров и поиска. Дополнения и промо пропускаем: на вечер выбирают игру,
     а не допник к ней. Если после фильтров таких нет, берём что осталось. */
  el('#luckyBtn').addEventListener('click', () => {
    const pool = boardItems.filter(matches);
    if (!pool.length) return;
    const playable = pool.filter(g => g.kind === 'base');
    const from = playable.length ? playable : pool;
    openModal(from[Math.floor(Math.random() * from.length)].id);
  });

  // Поиск по бестиарию: фильтрует список фишек, не трогая остальной раздел.
  const pawnSearch = el('#pawnSearch');
  if (pawnSearch) pawnSearch.addEventListener('input', renderBestiary);
  el('#viewMini').addEventListener('input', (e) => {
    if (e.target.id === 'miniSearch') renderRoster();
  });

  // Значок в шапке открывает список неполных записей — без фильтров и вкладок.
  el('#gapsBtn').addEventListener('click', () => {
    switchView('gaps');
    stateToUrl(true);
  });
  // Клик по строке открывает карточку позиции.
  el('#gapsList').addEventListener('click', (e) => {
    const row = e.target.closest('.gap-row');
    if (row) openModal(row.dataset.id, true);
  });


  el('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (dark ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bg-theme', next); } catch (_) {}
  });
  try {
    const saved = localStorage.getItem('bg-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', init);
