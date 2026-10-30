# Соответствие BGG → словарь каталога

Актуальный список того, что уже используется, — `node tools/catalog.mjs vocab`.
Таблицы ниже — подсказка, а не замена здравому смыслу: жанр выбирается по
тому, чем игра является, а не механически по тегам BGG.

## Жанры (`categories`) — только из словаря

| BGG category / признак | Жанр каталога |
|---|---|
| Economic | Экономическая |
| Fantasy, Mythology | Фэнтези |
| Science Fiction, Space Exploration | Научная фантастика |
| Horror, Zombies | Хоррор |
| Adventure, Exploration | Приключенческая |
| Wargame, Civil War, World War II, Napoleonic | Военная |
| Ancient, Medieval, Renaissance, American West (историческая тема) | Историческая |
| American West | Вестерн |
| Card Game (карты — основа игры) | Карточная |
| Abstract Strategy | Абстрактная |
| Party Game, Humor | Пати-игра |
| Deduction, Murder/Mystery | Детективная |
| Bluffing | Блеф |
| Word Game | Словесная |
| Puzzle | Головоломка |
| Action / Dexterity | На ловкость |
| Children's Game | Детская |
| Mechanic «Cooperative Game» | Кооперативная |
| Mechanic «Semi-Cooperative Game» | Полукооперативная |
| Ровно 2 игрока, противостояние | Дуэльная |
| Mechanic «Legacy Game», «Campaign / Battle Card Driven», сценарии | Легаси/кампания |
| Survival-тема (выживание персонажей) | Выживание |
| Короткая (≤ 30 мин) лёгкая игра | Филлер |
| Подтип BGG «Family» в `rankinfo`, лёгкая игра для всех | Семейная |
| Евро-подход: мало конфликта, очки победы, BGG subdomain «Strategy» | Евро |
| Тематичная, кубики, конфликт, BGG subdomain «Thematic» | Америтреш |

## Механики (`mechanics`) — сначала из уже используемых

| BGG mechanic | Механика каталога |
|---|---|
| Dice Rolling | Броски кубиков |
| Hand Management | Управление рукой |
| Area Majority / Influence, Area Control | Контроль территории |
| Variable Player Powers | Асимметричные роли |
| Open Drafting, Closed Drafting, Card Drafting | Драфт |
| Set Collection | Сет-коллекция |
| Modular Board | Модульное поле |
| Deck, Bag, and Pool Building | Колодостроение |
| Scenario / Mission / Campaign Game | Сценарии |
| Deduction | Дедукция |
| Cooperative Game | Кооперативная игра |
| Voting | Голосование |
| Hidden Roles | Скрытые роли |
| Area Movement | Перемещение по областям |
| Team-Based Game | Командная игра |
| Tile Placement | Тайлы |
| Action Points | Очки действий |
| Role Playing | Отыгрыш роли |
| Simultaneous Action Selection | Одновременный выбор |
| Player Elimination | Выбывание игроков |
| Negotiation | Переговоры |
| Solo / Solitaire Game | Соло-режим |
| Take That | Тэйк-зэт |
| Engine Building | Комбо-движок |
| Point to Point Movement | Перемещение точка-точка |
| Tech Trees / Tech Tracks | Древо технологий |
| Worker Placement | Размещение рабочих |
| Storytelling, Narrative Choice | Сторителлинг |
| Grid Movement | Перемещение по сетке |
| Collectible Components | Коллекционная колода |
| Bluffing (как механика) | Блеф |
| One vs. All, Team vs. One | Один против всех |
| Command Cards, Action Queue | Карты приказов |
| Measurement Movement, Line of Sight | Измерение расстояний |
| Legacy Game | Легаси |
| Trading | Торговля |
| Push Your Luck | Пуш-ёр-лак |
| Auction / Bidding (любой вид) | Аукцион |
| Programmed Movement | Программирование действий |
| Network and Route Building | Строительство маршрутов |
| Pattern Building | Построение узоров |
| Race | Гонка |
| Communication Limits | Ограничение коммуникации |
| Hidden Movement | Скрытое перемещение |
| Traitor Game | Предатель |
| Real-Time | На время |
| Tug of War | Перетягивание каната |
| Rondel | Рондель |
| Pick-up and Deliver | Сбор и доставка |
| Contracts | Контракты |
| Enclosure, Pattern Recognition, Memory | Построение узоров / Игры на память |
| Events | События |
| Character progression (RPG-подобный рост) | Развитие персонажа |
| Mobile app required / app-driven | Приложение |

Не переносить: служебные механики BGG без смысла для фильтра — «Turn Order:
…», «Score-and-Reset Game», «Sudden Death Ending», «End Game Bonuses»,
«Variable Set-up», «Melding and Splaying» (если нет русского аналога в
списке — пропусти, не выдумывай).
