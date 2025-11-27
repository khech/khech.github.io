// ============================
// Script - Gallery Filters
// ============================
(function () {
  // Элементы фильтров (span внутри h2)
  const filterButtons = document.querySelectorAll(".filter-line .filter-btn");

  // Все проекты
  const projects = document.querySelectorAll(
    ".gallery .titles, .gallery article.titles"
  );

  function getActiveFilters() {
    // Собираем только активные фильтры
    return Array.from(filterButtons)
      .filter((btn) => btn.classList.contains("active"))
      .map((btn) => btn.dataset.filter.toLowerCase());
  }

  function applyFilters() {
    const activeFilters = getActiveFilters();

    projects.forEach((project) => {
      const raw = project.dataset.tags || "";
      const projectTags = raw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      // Если ни одного фильтра не выбрано → показываем всё
      if (activeFilters.length === 0) {
        project.style.display = "";
        return;
      }

      // OR-логика: если хоть один совпадает — показываем
      const match = activeFilters.some((tag) => projectTags.includes(tag));

      project.style.display = match ? "" : "none";
    });
  }

  function onFilterClick(button) {
    // Переключаем активность
    button.classList.toggle("active");
    applyFilters();
  }

  // Навешиваем клики
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => onFilterClick(button));
  });

  // Старт — показать всё
  applyFilters();
})();

// ===========================
// Script - Touch Tiles
// ============================

(function () {
  if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) return;

  var tiles = document.querySelectorAll(".titles, .titles_sq, .titles_sq_2");

  tiles.forEach(function (tile) {
    var startX = 0;
    var startY = 0;
    var moved = false;

    tile.addEventListener(
      "touchstart",
      function (e) {
        var t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        moved = false;

        // Включаем hover МГНОВЕННО
        tile.classList.add("touch-hover");
      },
      { passive: true }
    );

    tile.addEventListener(
      "touchmove",
      function (e) {
        var t = e.touches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;

        // Движение — только запрет клика
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          // Порог = 1px = почти ноль
          moved = true;
        }
      },
      { passive: true }
    );

    tile.addEventListener("touchend", function (e) {
      var link = tile.querySelector("a");

      if (!moved && link && link.href) {
        // Настоящий тап — переход
        window.location.href = link.href;
      } else {
        // Был скролл — блокируем переход
        e.preventDefault();
        e.stopPropagation();
      }

      // Убираем hover сразу после отпускания пальца
      tile.classList.remove("touch-hover");
    });
  });
})();

// ============================
// Script - Gallery Appearing
// ============================

document.addEventListener("DOMContentLoaded", function () {
  const imgs = Array.from(document.querySelectorAll(".gallery img.tiles"));
  if (!imgs.length) return;

  // На всякий случай: убеждаемся, что пути лежат в data-src, а src очищен
  imgs.forEach((img) => {
    if (!img.dataset.src && img.src) {
      img.dataset.src = img.src;
    }
    img.removeAttribute("src");
  });

  // Разбиваем на пары: [0,1], [2,3], [4,5]...
  const pairs = [];
  for (let i = 0; i < imgs.length; i += 2) {
    pairs.push(imgs.slice(i, i + 2));
  }

  const pairLoaded = new Array(pairs.length).fill(false);
  let nextToShow = 0;

  function tryShowPairs() {
    // Показываем только подряд идущие пары сверху вниз
    while (nextToShow < pairs.length && pairLoaded[nextToShow]) {
      const pair = pairs[nextToShow];
      const delay = nextToShow * 80; // лёгкая ступенька, можно поставить 0

      setTimeout(() => {
        pair.forEach((img) => img.classList.add("tiles-visible"));
      }, delay);

      nextToShow++;
    }
  }

  // Функция: стартуем загрузку конкретной пары (назначаем src)
  function startPairLoading(pairIndex) {
    const pair = pairs[pairIndex];
    if (!pair) return;
    pair.forEach((img) => {
      if (!img.src && img.dataset.src) {
        img.src = img.dataset.src;
      }
    });
  }

  // Навешиваем обработчики на все пары сразу
  pairs.forEach((pair, pairIndex) => {
    let loadedCount = 0;

    pair.forEach((img) => {
      const onDone = () => {
        img.removeEventListener("load", onDone);
        img.removeEventListener("error", onDone);

        loadedCount++;
        if (loadedCount === pair.length) {
          // Вся пара загружена
          pairLoaded[pairIndex] = true;
          tryShowPairs();

          // Как только вторая пара (индекс 1) догрузилась —
          // запускаем загрузку всех остальных пар
          if (pairIndex === 1) {
            for (let i = 2; i < pairs.length; i++) {
              startPairLoading(i);
            }
          }
        }
      };

      img.addEventListener("load", onDone);
      img.addEventListener("error", onDone);
    });
  });

  // 1) Сразу запускаем загрузку первой пары
  startPairLoading(0);
  // 2) И сразу же — второй пары
  startPairLoading(1);
  // Остальные начнут грузиться, только когда вторая пара полностью загрузится
});
