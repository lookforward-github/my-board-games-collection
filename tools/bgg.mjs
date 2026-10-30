#!/usr/bin/env node
/* Данные игры с BoardGameGeek по её id — без токена.

   XML API (xmlapi2) с 2025 года требует регистрации приложения, а поиск
   на сайте закрыт Cloudflare, поэтому id находим веб-поиском, а сюда
   передаём уже его. Используются те же JSON-эндпоинты, что и у самого
   сайта: geekitems (карточка) и dynamicinfo (рейтинг, ранг, вес, опрос
   о лучшем числе игроков).

   node tools/bgg.mjs <bggId>            — сводка для записи в games.js
   node tools/bgg.mjs <bggId> --raw      — сырые ответы обоих эндпоинтов */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const names = (list) => (list || []).map((x) => x.name);

// «Лучшее» из опроса BGG: одно число или диапазон [min, max].
function bestPlayers(poll) {
  const best = poll?.best?.[0];
  if (!best) return null;
  return best.min === best.max ? best.min : [best.min, best.max];
}

async function main() {
  const [id, flag] = process.argv.slice(2);
  if (!/^\d+$/.test(id || '')) {
    console.error('usage: node tools/bgg.mjs <bggId> [--raw]');
    process.exit(2);
  }
  const q = `objectid=${id}&objecttype=thing`;
  const [{ item }, dyn] = await Promise.all([
    getJson(`https://api.geekdo.com/api/geekitems?${q}`),
    getJson(`https://api.geekdo.com/api/dynamicinfo?${q}`),
  ]);
  if (flag === '--raw') {
    console.log(JSON.stringify({ item, dynamic: dyn.item }, null, 2));
    return;
  }

  const d = dyn.item || {};
  const L = item.links || {};
  const overall = (d.rankinfo || []).find((r) => r.subdomain === null || r.veryshortprettyname === 'Overall');
  const rank = num(overall?.rank) || null;      // у дополнений BGG отдаёт 0
  const minT = num(item.minplaytime), maxT = num(item.maxplaytime);

  const out = {
    bggId: +id,
    subtype: item.subtype,                       // boardgame | boardgameexpansion | boardgameaccessory | rpgitem ...
    name: item.name,
    alternateNames: (item.alternatenames || []).map((x) => x.name),
    year: num(item.yearpublished),
    designers: names(L.boardgamedesigner),
    publishers: names(L.boardgamepublisher),
    players: num(item.minplayers) ? [num(item.minplayers), num(item.maxplayers)] : null,
    bestPlayers: bestPlayers(d.polls?.userplayers),
    time: minT || maxT ? [minT || maxT, maxT || minT] : null,
    minAge: num(item.minage),
    weight: round2(num(d.stats?.avgweight)) || null,
    weightVotes: num(d.stats?.numweights),
    bggRating: round2(num(d.stats?.average)) || null,
    ratingVotes: num(d.stats?.usersrated),
    bggRank: rank,                                // null — «Not Ranked»
    alternateNamesRu: (item.alternatenames || []).map((x) => x.name).filter((n) => /[а-яё]/i.test(n)),
    categoriesEn: names(L.boardgamecategory),
    mechanicsEn: names(L.boardgamemechanic),
    families: names(L.boardgamefamily),
    expands: (L.expandsboardgame || []).map((x) => ({ id: +x.objectid, name: x.name })),
    expansions: (L.boardgameexpansion || []).map((x) => ({ id: +x.objectid, name: x.name })),
    bggUrl: `https://boardgamegeek.com${item.href}`,
    image: item.imageurl || null,
    description: (item.short_description || '').trim(),
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
