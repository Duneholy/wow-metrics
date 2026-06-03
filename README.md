<div align="center">
  <img src="https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/typescript/typescript.png" alt="TypeScript" width="60" />
  <img src="https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/react/react.png" alt="React" width="60" />
  <h1>⚔️ wow_metrics</h1>
  <p><strong>Gamified Personal Management System inspired by World of Warcraft</strong></p>
</div>

<div align="center">
  
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

</div>

---

**wow_metrics** — это мощный инструмент для управления жизнью (Life Management Tool), стилизованный под интерфейс популярной MMORPG World of Warcraft. Приложение объединяет в себе управление задачами, учет финансов, контроль энергии и управление базой контактов (CRM) с элементами геймификации: получайте опыт, прокачивайте уровни и следите за запасом "Энергии".

## 🚀 Быстрый старт

Установка и запуск приложения максимально упрощены для пользователей Windows и занимают всего пару кликов.

### 1. Установка
Дважды кликните на **`Install wow_metrics.bat`** (окно не закроется само; при ошибке смотрите `install.log`).

**Node.js** ставится автоматически, если его нет на ПК (сначала `winget`, затем загрузка LTS с nodejs.org). При ошибке прав: правый клик по **`Install wow_metrics.bat`** → **Запуск от имени администратора**.
Этот скрипт:
- Проверит наличие Node.js (и автоматически попытается установить его, если он отсутствует).
- Установит все необходимые зависимости для Frontend и Backend.
- Автоматически настроит и подготовит базу данных SQLite.

*Примечание: Если скрипт сам установил Node.js, вам нужно будет закрыть консоль и запустить `install.bat` еще раз.*

### 2. Запуск приложения
Дважды кликните на **`Launch wow_metrics.bat`** (или ярлык).
Этот скрипт полностью скроет терминалы и автоматически откроет приложение в вашем любимом браузере (`http://localhost:5173`).

*(Чтобы полностью остановить трекер, запустите файл **`Stop wow_metrics.bat`**).*

**`setup.bat`** (необязательно) — собирает production-версию: один сервер на `http://localhost:4000` без Vite. Для обычной работы достаточно `install.bat` + `Launch wow_metrics.bat`.

---

## ✨ Ключевые возможности

### 📜 Журнал заданий (Quest Log)
- **Цели и Задачи (Quests):** Ставьте глобальные цели и разбивайте их на подзадачи различной сложности (Easy, Medium, Hard, Epic).
- **Геймификация:** Каждое завершенное задание приносит **XP** (Опыт). Заполняйте полоску опыта, чтобы получать новые Уровни (Levels).
- **Фокус недели (Weekly Focus):** Удобный механизм для планирования спринтов — перетаскивайте (Drag-and-Drop) 7 главных квестов на слоты текущей недели.

### ⚡ Энергия и Здоровье (Energy Bar)
- Динамическая система расчета вашей личной эффективности. Вы теряете энергию ежедневно (настраивается в профиле).
- Восполняйте энергию, отмечая выполненные привычки и тренировки ("Exercises").
- Учитываются негативные и позитивные модификаторы (Bonus & Loss), влияющие на общий энергетический тонус.

### 💰 Банк и Активы (Bank)
- Мультивалютный учет фиатных средств и финансовых активов.
- **Интеграция с биржами:** Автоматическое подтягивание актуальных и исторических цен на криптовалюты (CoinGecko API) и ценные бумаги (MOEX).
- **Расчет инфляции:** Учет обесценивания капитала на основе заданного процента инфляции.

### 🍻 Таверна / Контакты (CRM / Networking)
- Личная база контактов для нетворкинга.
- Сортировка по дате последнего контакта или дню рождения.
- Подсчет касаний (Touches) — отслеживайте, с кем вы давно не общались, и планируйте встречи ("Квесты" из Журнала заданий можно привязывать к конкретным людям).

---

## 🛠 Технологический стек

**Frontend:**
- **React 18** — библиотека для построения UI
- **Vite** — быстрый сборщик проектов
- **TypeScript** — строгая типизация
- **Vanilla CSS** — полностью кастомные стили, анимации и курсоры в духе WoW (без Tailwind).

**Backend:**
- **Node.js + Express** — серверная логика и REST API
- **Prisma ORM** — современный и безопасный ORM
- **SQLite** — легковесная файловая база данных (идеально для персонального использования)
- **Zod** — валидация схем и данных
- **Bcrypt / JWT** — авторизация и безопасность

---

## 🎨 Дизайн и Аутентичность
Весь проект пропитан атмосферой игры World of Warcraft:
- Кастомные игровые курсоры (включая анимации при наведении и перетаскивании).
- Уникальные текстуры панелей, рамочки скиллов и иконки.
- Геймифицированные шрифты (`FRIZQT`, `Morpheus`, `Skurri`).
- Темная стилистика (Dark Mode) по умолчанию.

---

## 🤝 Контрибьют
Проект находится в стадии активного развития. Если вы хотите внести свой вклад:
1. Форкните репозиторий.
2. Создайте ветку для вашей фичи (`git checkout -b feature/AmazingFeature`).
3. Закоммитьте изменения (`git commit -m 'Add some AmazingFeature'`).
4. Отправьте ветку в origin (`git push origin feature/AmazingFeature`).
5. Откройте Pull Request.

---

## 📄 Лицензия и дисклеймер

Этот проект распространяется под лицензией **MIT** — см. файл [LICENSE](LICENSE).

Визуальные материалы в стиле World of Warcraft: см. [DISCLAIMER.md](DISCLAIMER.md) (проект не связан с Blizzard Entertainment).
