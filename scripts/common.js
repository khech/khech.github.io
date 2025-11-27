// ============================
// Script - Выравнивание двух медиа (img / iframe) по одной высоте
// ============================
function layoutImagePairs() {
  const rows = document.querySelectorAll(
    ".project-section.split.images-row .section-body"
  );

  rows.forEach((row) => {
    // Берём и картинки, и видео
    const media = row.querySelectorAll(".image-block img, .image-block iframe");
    if (media.length !== 2) return;

    const [el1, el2] = media;

    // Мобилка: сбрасываем всё и выходим
    if (window.innerWidth <= 768) {
      media.forEach((el) => {
        el.style.width = "";
        el.style.height = "";
      });
      return;
    }

    // Хелпер для соотношения сторон
    const getRatio = (el) => {
      const tag = el.tagName;
      if (tag === "IMG") {
        if (!el.naturalWidth || !el.naturalHeight) return null;
        return el.naturalWidth / el.naturalHeight;
      }
      if (tag === "IFRAME") {
        // берём то же соотношение, что и в CSS: aspect-ratio: 16 / 9;
        return 16 / 9;
      }
      return null;
    };

    const k1 = getRatio(el1);
    const k2 = getRatio(el2);

    // Если картинка ещё не загрузилась — ждём загрузки и пересчёта
    if (k1 == null || k2 == null) {
      media.forEach((el) => {
        if (el.tagName === "IMG" && (!el.naturalWidth || !el.naturalHeight)) {
          el.addEventListener("load", layoutImagePairs, { once: true });
        }
      });
      return;
    }

    const styles = getComputedStyle(row);
    const gap = parseFloat(styles.columnGap || styles.gap || 0);
    const W = row.clientWidth;

    // Высота H, при которой оба медиа:
    // 1) имеют одинаковую высоту
    // 2) плюс gap занимают всю ширину контейнера
    const H = (W - gap) / (k1 + k2);
    const w1 = H * k1;
    const w2 = H * k2;

    el1.style.height = el2.style.height = H + "px";
    el1.style.width = w1 + "px";
    el2.style.width = w2 + "px";
  });
}

window.addEventListener("load", layoutImagePairs);
window.addEventListener("resize", layoutImagePairs);

// ============================
// Script - Копирование в буфер обмена
// ============================

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".copyable").forEach(function (el) {
    el.addEventListener("click", function () {
      var textToCopy = el.getAttribute("data-copy") || el.textContent.trim();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(function () {
          el.classList.add("copied");
          setTimeout(function () {
            el.classList.remove("copied");
          }, 800);
        });
      } else {
        var textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
        } catch (e) {}
        document.body.removeChild(textarea);
      }
    });
  });
});
