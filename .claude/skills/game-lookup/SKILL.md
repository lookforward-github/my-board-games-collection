---
name: game-lookup
description: Найти данные одной настольной игры, дополнения, ККИ, аксессуара или материала НРИ на BoardGameGeek и hobbygames.ru и собрать из них запись для data/games.js — с ценой с Hobby Games, обложкой, жанрами и механиками по словарю каталога. Вызывается из скилла add-game; сам файлы данных не меняет, а возвращает JSON записи.
---

# Сбор данных одной позиции

Результат — объект записи для `data/games.js` (поля — в `data/schema.md`)
плюс список источников и сомнений. Файлы данных не трогай: запись
добавляет `add-game`.

## 1. Найди издание на Hobby Games

```bash
node tools/hobbygames.mjs search "<название по-русски>"
node tools/hobbygames.mjs product <url товара>
```

- В выдаче много похожего — выбери точное совпадение: не делюкс вместо
  обычного, не дополнение вместо базы, не «Подарочное издание».
- `product` даёт `priceRub`, `price` (уже по курсу 100 ₽/$ и с
  округлением), `image` (обложка магазина), `makers` (русский издатель
  и автор оригинала), `inStock`.
- Нет на Hobby Games — попробуй hobbyworld.ru, lavkaigr.ru, mosigra.ru,
  trideviatoe.ru (веб-поиском или WebFetch). Рубли пересчитай так же:
  `max(5, round(руб / 100 / 5) * 5)`. Источник цены укажи в `note`.
- Зарубежное издание без русского: цена в валюте издателя — `priceUsd`
  или `priceEur` (евро → доллары по 1.162, как у Archon), `price` —
  доллары с тем же округлением.

## 2. Найди игру на BoardGameGeek

Поиск BGG закрыт (Cloudflare, XML API требует токен), поэтому id ищи
по цепочке, пока не найдёшь ссылку `boardgamegeek.com/boardgame/<id>`
(или `boardgameexpansion/<id>`):

1. Пользователь прислал ссылку на BGG — id в ней.
2. Статья в Википедии об игре — во внешних ссылках есть BGG:
   `curl -s "https://en.wikipedia.org/wiki/<Название>_(board_game)" | grep -o 'boardgamegeek.com/boardgame/[0-9]*'`.
3. WebSearch `<оригинальное название> <год> boardgamegeek`; ссылки на
   обзоры и видео (`/thread/`, `/video/`) id игры не содержат — нужна
   именно `/boardgame/<id>/`.
4. Встроенный браузер: в нём поиск BGG открывается, Cloudflare пропускает.

Затем:

```bash
node tools/bgg.mjs <id>
```

Проверь совпадение: год, издатели (`publishers` должен содержать
русского издателя из `makers`, если издание русское), `alternateNamesRu`.
У переизданий и делюксов на BGG бывают отдельные записи — бери ту, что
соответствует коробке. Если записи нет — в `url` ссылка на магазин или
tesera.ru, в `note` — «На BoardGameGeek отсутствует».

## 3. Собери запись

Поля и откуда их брать:

| Поле | Источник и правило |
|---|---|
| `id` | транслит оригинального названия в kebab-case: `sea-salt-paper`; дополнение — `<id базы>-<суффикс>` |
| `title` | название на коробке; у русского издания — как на Hobby Games, без «Настольная игра» |
| `originalTitle` | `name` с BGG; для игр без зарубежного издания — `"noOriginalTitle": true` |
| `kind` | `base` / `expansion` (+ `parent`) / `tcg` / `accessory` / `rpg-supplement` / `miniatures-item`; BGG `subtype: boardgameexpansion` → `expansion` |
| `lang` | `ru` для русского издания, иначе язык коробки |
| `year` | `year` с BGG (год оригинала); год русского издания — в `note` |
| `designers` | полные имена с BGG: `["Bruno Cathala", "Théo Rivière"]` |
| `publisher` | русский издатель для `ru` (из `makers`), иначе оригинальный |
| `players` | `players` с BGG — честный состав коробки, и у дополнений тоже |
| `bestPlayers` | `bestPlayers` с BGG, если опрос есть |
| `time` | `time` с BGG — **только у `base`/`tcg`** |
| `weight` | `weight` с BGG, два знака — **только у `base`/`tcg`**, если `weightVotes` > 0 |
| `bggRating` | `bggRating` с BGG, если `ratingVotes` ≥ 10 |
| `bggRank` | `bggRank`, если не `null` |
| `categories` | 2–4 жанра строго из словаря (`node tools/catalog.mjs vocab`, первая строка); соответствия — в [mapping.md](mapping.md) |
| `mechanics` | 2–5 механик по-русски; сначала из уже используемых в каталоге, соответствия — в [mapping.md](mapping.md) |
| `bggId`, `bggUrl` | с BGG |
| `image` | русское издание — `image` с Hobby Games; иначе `image` с BGG |
| `url` | страница товара на Hobby Games (или другом магазине) |
| `price`, `priceRub` | из шага 1 |
| `note` | по-русски, одна-две фразы: издание и издатель, откуда взято необычное, чего нет на BGG |

Порядок ключей — как в последних записях каталога: `id, title, kind, lang,
originalTitle, year, designers, publisher, players, bestPlayers, time,
weight, bggRating, bggRank, categories, mechanics, bggId, bggUrl, image,
url, price, priceRub, note`. Пустые поля не пиши вовсе (не `null`).

Особые случаи:
- **Самостоятельное дополнение** (играется без базы, но совместимо):
  `kind: base` и `"standaloneFor": "<id основной игры>"`.
- **Материал НРИ:** `kind: rpg-supplement`, `systems: [...]` (id систем —
  в `vocab`), `supplementType` (`rulebook`, `adventure`, `map`, `screen`,
  `tokens`, `battlemap`, `miniatures`, `deck`, `starter`, `other`);
  годится D&D 5e, Pathfinder и Pathfinder 2e сразу — `universal: true`.
  Игроков, времени и сложности у материалов нет.
- **Набор миниатюр:** `kind: miniatures-item`, `"system": "<id системы>"`,
  `supplementType` (`starter`, `miniatures`, `other`), состав коробки —
  в `note`. Данные и цена — с сайта издателя (для StarCraft —
  archon-studio.com).
- **Нет на BGG ни рейтинга, ни веса** у базовой игры — спроси
  пользователя про свою оценку (`rating`, 1–10), вес можно взять у
  близкой игры с пометкой в `note` (так сделано у «Мафии», «Brain
  Breaker»).

## 4. Верни результат

```
ЗАПИСЬ:
{ ...объект... }
ИСТОЧНИКИ: BGG <id> (<url>), Hobby Games <url> — <цена ₽>
СОМНЕНИЯ: <что выбрано не наверняка и почему; «нет», если всё сошлось>
```
