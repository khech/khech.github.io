# Khech.com

Architecture, digital projects, design and paintings by Arseniy Khechinashvili.

- https://khech.com/ — выбор Studio / Art Gallery
- https://khech.com/studio/ — проекты
- https://khech.com/gallery/ — галерея

## Структура

- `index.html`, `styles/landing.css` — временная главная.
- `studio/index.html` — страница с плашками проектов.
- `projects/` — страницы проектов с сохранёнными прежними адресами.
- `gallery/index.html` — галерея.
- `scripts/khech-gallery.js`, `styles/khech-gallery.css` — взаимодействия и оформление галереи.
- `images/khech-gallery/works.json` и JPEG рядом — публичные данные и изображения работ.
- `contacts.html`, `archive.html` — существующие страницы.
- `CNAME` — домен `khech.com`.
- `_config.yml` — исключения из публикации GitHub Pages.
- `tools/preview.mjs` — локальный сервер предпросмотра.

## Работа на другом устройстве

1. В VS Code выполнить `Git: Clone` через палитру команд и вставить `https://github.com/khech/khech.github.io.git`.
2. Открыть клонированную папку. Для локального просмотра установить Node.js, если его ещё нет.
3. В терминале из корня проекта выполнить:

```text
node tools/preview.mjs
```

4. Открыть `http://127.0.0.1:4175/`. Остановить сервер: Ctrl+C.
5. Перед началом работы сделать Pull. После изменений проверить сайт, сделать Commit и Push в VS Code.

Для самого сайта не нужны npm-пакеты, установка зависимостей или отдельная сборка. HTML следует проверять через локальный сервер: галерея загружает JSON через fetch.

## Обновление картин

`tools/export-gallery.py` читает текущий архив `G:\My Drive\0-Khech-Gallery`: все 23 работы Streets (включая Mini и Teeth) и три ранее выбранные абстрактные работы. Названия, города, размеры, цены и статусы берутся из актуальных записей. Связи `series` / `parent_series` определяют основную серию; Pink and Yellow относится к Abstract Begining. Стабильные ID с `MOW` сохраняются: это код города, а не старое название серии.

Для выгрузки нужен Python с Pillow:

```text
python -m unittest discover -s tools
python tools/export-gallery.py
```

Экспорт создаёт JPEG и превью в `images/khech-gallery/`, обновляет `works.json`, сохраняет выбор обрезок Mini и проверяет неизменность исходных фотографий по SHA-256. Исходные записи и фотографии не изменяются. Локальная карта источников, отчёт о сериях и контактный лист находятся в `99_Agent/khech-gallery/` и не публикуются.

Проверка фильтров, карточек и четырёх размеров окна: запустить предпросмотр на порту 4175, затем `node tools/gallery-series-check.cjs`. Проверка использует установленный в среде Codex Playwright и локальный Chrome.

## Публикация

Репозиторий: `khech/khech.github.io`. В Settings → Pages:

- Source: **Deploy from a branch**.
- Branch: **master**.
- Folder: **/ (root)**.
- Custom domain: **khech.com**.
- **Enforce HTTPS** включён, когда доступен.

Изменения, отправленные в master, запускают публикацию. Проверять её результат во вкладке Actions (`pages build and deployment`). Домен уже подключён; перенос между регистраторами или смена DNS для этой версии не нужны.

`99_Agent/` и `docs/superpowers/` — локальные материалы, исключённые из Git. `tools/`, документация и технический шаблон исключены из генерируемого сайта через `_config.yml`. Не добавлять `.nojekyll`: в текущем способе публикации он отключил бы обработку этих исключений.

`art.html` оставлен для перехода со старого адреса на `/gallery/`.

## Состояние проверки

Перенос в Studio/Gallery проверен локально на компьютерном и мобильном размерах окна; в проверенных сценариях новых ошибок загрузки нет. Старые ошибки отдельных архивных страниц не исправлялись в этой версии. Рабочие материалы и резервная копия исходников сохранены локально, в GitHub они не загружаются.
