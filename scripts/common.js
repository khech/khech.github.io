// ============================
// Script - Выравнивание двух картинок по одной высоте
// ============================
function layoutImagePairs() {
  const rows = document.querySelectorAll(
    ".project-section.split.images-row .section-body"
  );

  rows.forEach((row) => {
    const imgs = row.querySelectorAll(".image-block img");
    if (imgs.length !== 2) return;

    const [img1, img2] = imgs;

    // Мобилка: сбрасываем всё и выходим
    if (window.innerWidth <= 768) {
      imgs.forEach((img) => {
        img.style.width = "";
        img.style.height = "";
      });
      return;
    }

    // Ждём, пока картинки реально загрузятся
    if (!img1.naturalWidth || !img2.naturalWidth) {
      img1.addEventListener("load", layoutImagePairs, { once: true });
      img2.addEventListener("load", layoutImagePairs, { once: true });
      return;
    }

    const styles = getComputedStyle(row);
    const gap = parseFloat(styles.columnGap || styles.gap || 0);
    const W = row.clientWidth;

    const k1 = img1.naturalWidth / img1.naturalHeight;
    const k2 = img2.naturalWidth / img2.naturalHeight;

    // Высота H, при которой обе картинки:
    // 1) имеют одинаковую высоту
    // 2) плюс gap занимают всю ширину контейнера
    const H = (W - gap) / (k1 + k2);
    const w1 = H * k1;
    const w2 = H * k2;

    img1.style.height = img2.style.height = H + "px";
    img1.style.width = w1 + "px";
    img2.style.width = w2 + "px";
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
