# Схема данных библиотеки

Файл `games.js` объявляет глобальный массив `GAMES`. Каждый элемент:

```js
{
  id: "everdell",              // уникальный slug, обязателен
  title: "Эверделл",           // название как на коробке (RU или оригинал)
  originalTitle: "Everdell",   // оригинальное название, опционально
  kind: "base",                // base | expansion | tcg | accessory |
                               // rpg | rpg-supplement | miniatures | miniatures-item
  parent: null,                // id родителя для expansion / rpg-supplement
  systems: [],                 // id систем НРИ, которым подходит материал
                               // (может быть несколько: универсальные поля,
                               // фишки и карты годятся нескольким системам)
  universal: false,            // true — универсальный материал: показывается
                               // в каждой подходящей системе и в общем блоке
  supplementType: null,        // rulebook | adventure | map | screen | tokens | battlemap | miniatures | deck
  lang: "ru",                  // ru | en | el, либо массив ["ru","en"] —
                               // один материал в двух языковых изданиях
  year: 2018,
  designers: ["James A. Wilson"],
  players: [1, 4],             // [min, max] — как в самой коробке.
                               // У дополнений тоже заполняется: если доп
                               // расширяет состав, сайт сам покажет у базовой
                               // игры увеличенный диапазон.
  bestPlayers: 3,              // число или диапазон [4, 5]; или null.
                               // У дополнений тоже учитывается: если доп
                               // расширяет состав, лучшее число у базовой
                               // игры расширится вместе с ним.
  time: [40, 80],              // [min, max] в минутах
  weight: 2.8,                 // сложность 1..5, или null
  bggRating: 8.0,              // рейтинг BoardGameGeek, или null
  rating: null,                // своя оценка 1..10 — для игр, которых нет на BGG
  bggRank: 43,                 // или null
  categories: ["Евро", "Фэнтези"],
  mechanics: ["Размещение рабочих", "Тэблоу-билдинг"],
  copies: 1,                   // сколько экземпляров (для "х2")
  price: 60,                   // цена в USD (округлена до десятков)
  priceRub: 4990,              // исходная цена в рублях, если считали из неё
  bggId: 199792,               // id на BoardGameGeek
  bggUrl: "https://boardgamegeek.com/boardgame/199792/everdell",
  url: null,                   // ссылка на магазин/Tesera, если страницы на BGG нет
  publisher: null,             // издатель, если он важен для опознания
  noOriginalTitle: false,      // true — у игры нет зарубежного издания
  image: "https://cf.geekdo-images.com/...",  // обложка с CDN BGG (не копируем к себе)
  standaloneFor: null,         // id игры, к которой это самостоятельное дополнение
  note: ""                     // произвольная заметка
}
```

Обязательны только `id`, `title`, `kind`, `lang`. Остальное — null/опущено,
если неизвестно; UI корректно отрисует отсутствующие поля.

## Как дополнять

Добавьте объект в конец массива в `games.js`. Никакой сборки не нужно —
просто перезагрузите страницу. Для дополнения укажите `kind: "expansion"`
и `parent` с id базовой игры. Для материалов НРИ — `kind: "rpg-supplement"`,
`system` с id системы и `supplementType`.
