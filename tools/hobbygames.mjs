#!/usr/bin/env node
/* Поиск и карточка товара на hobbygames.ru — источник цены и русской обложки.

   Оба ответа берутся из разметки schema.org (JSON-LD), которую магазин
   кладёт в страницу: она стабильнее вёрстки.

   node tools/hobbygames.mjs search <запрос>   — товары из выдачи поиска
   node tools/hobbygames.mjs product <url>     — цена, наличие, обложка, производитель

   Цена в долларах считается по курсу RUB_PER_USD и округляется до 5 долларов
   (минимум $5) — так же, как у остальных позиций каталога. */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const BASE = 'https://hobbygames.ru';
export const RUB_PER_USD = 100;

export const usd = (rub) => Math.max(5, Math.round(rub / RUB_PER_USD / 5) * 5);

async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const v = JSON.parse(m[1]);
      out.push(...(Array.isArray(v) ? v : [v]));
    } catch { /* битый блок — пропускаем */ }
  }
  return out;
}

// Ссылки на картинки в JSON-LD бывают относительными: "/data/…" или "data/…".
const absImage = (src) => {
  if (!src) return null;
  if (/^https?:/.test(src)) return src;
  return `${BASE}/image/${src.replace(/^\/+/, '')}`;
};

const productOf = (p) => ({
  name: p.name,
  url: p.url || p.offers?.url,
  priceRub: p.offers?.price != null ? +p.offers.price : null,
  price: p.offers?.price != null ? usd(+p.offers.price) : null,
  inStock: /InStock/.test(p.offers?.availability || ''),
  image: absImage(p.image),
});

async function search(query) {
  const html = await getHtml(`${BASE}/catalog/search?keyword=${encodeURIComponent(query)}`);
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node['@type'] === 'Product') found.push(productOf(node));
    for (const v of Object.values(node)) if (typeof v === 'object') walk(v);
  };
  jsonLd(html).forEach(walk);
  const seen = new Set();
  return found.filter((p) => p.url && !seen.has(p.url) && seen.add(p.url));
}

async function product(url) {
  const html = await getHtml(url);
  const p = jsonLd(html).find((x) => x['@type'] === 'Product');
  if (!p) throw new Error('на странице нет разметки Product');
  const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  // «Производитель» в характеристиках: русский издатель и автор оригинала.
  const text = html.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
  const makers = [...text.matchAll(/Производитель\|[| ]*([^|]{2,60})/g)].map((m) => m[1].trim());
  const year = text.match(/Год выпуска:\|[| ]*(\d{4})/)?.[1];
  return {
    ...productOf(p),
    url,
    image: og || absImage(p.image),
    makers: [...new Set(makers)],
    year: year ? +year : null,
  };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ');
  if (cmd === 'search' && arg) console.log(JSON.stringify(await search(arg), null, 2));
  else if (cmd === 'product' && arg) console.log(JSON.stringify(await product(arg), null, 2));
  else {
    console.error('usage: node tools/hobbygames.mjs search <запрос> | product <url>');
    process.exit(2);
  }
}

// Запуск из командной строки; при импорте из catalog.mjs нужны только usd и курс.
if (process.argv[1]?.endsWith('hobbygames.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
