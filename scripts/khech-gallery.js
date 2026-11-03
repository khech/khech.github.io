// Khech-Gallery: native scrolling, bounded repetitions, layout expansion.
const gallery = document.querySelector('#gallery');
const ribbon = document.querySelector('#ribbon');
const ribbonCaption = document.querySelector('#ribbon-caption');
const ribbonTitle = document.querySelector('#ribbon-title');
const ribbonYear = document.querySelector('#ribbon-year');
const viewer = document.querySelector('#viewer');
const viewerImage = document.querySelector('#viewer-image');
const viewNav = document.querySelector('#viewer-views');
const viewerInfo = document.querySelector('#viewer-info');
const reducedMotion = typeof window.matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
// Safari can retain :focus-visible through a touch-opened modal. Track the
// actual input so touch has no focus ring while keyboard navigation keeps one.
document.documentElement.dataset.input = 'pointer';
document.addEventListener('pointerdown', () => {
  document.documentElement.dataset.input = 'pointer';
}, true);
document.addEventListener('keydown', event => {
  if (['Tab', 'Enter', ' ', 'Escape'].includes(event.key) || event.key.startsWith('Arrow')) {
    document.documentElement.dataset.input = 'keyboard';
  }
}, true);
const SIZE_SCALE = { S: .65, M: 1, L: 1.3 };
const RIBBON_BASE_EDGE = 120, RIBBON_FOCUS_SCALE = 1.8, RIBBON_GAP = 18;
const SCROLL_RUNWAY = 65536; // Modest native scroll space; recentered only when idle.
const PORTRAIT_EDGE_PITCH = .35; // Trial minimum spacing toward the viewport ends.
let middleRepeat = 2, poolOrigin = 0;
let scrollIdleTimer = 0, touchHeld = false;
let allWorks = [], works = [], items = [], axis = 'x', cycle = 0, viewport = 0;
let mode = 'center', hovered = -1, active = -1, lastTime = 0;
let openedFrom = null, savedScroll = 0, resizeFrame = 0;
let hasViewerHistory = false, rebuilding = false;
let layoutWidth = 0, layoutHeight = 0, ribbonState = null, savedReturnState = null;
let fittedViewer = { width: 0, height: 0, infoWidth: 0, infoHeight: 0 };
let controlAnimations = [];
let mousePosition = null;
let viewerAnimation = null, viewerWork = null, viewerView = null, closingViewer = false, viewerSequence = 0;
const selectedViews = new Map();
const scrollPosition = () => axis === 'x' ? gallery.scrollLeft : gallery.scrollTop;
const ribbonFocusScale = () => RIBBON_FOCUS_SCALE * (axis === 'x' ? 1.1 : 1);
function setScroll(value) { if (axis === 'x') gallery.scrollLeft = value; else gallery.scrollTop = value; }
function nearest(position) {
  let best = 0, distance = Infinity;
  items.forEach((item, i) => { const d = Math.abs(item.center - position); if (d < distance) { distance = d; best = i; } });
  return best;
}
function makeRibbon(state = {}) {
  rebuilding = true;
  layoutWidth = gallery.clientWidth; layoutHeight = gallery.clientHeight;
  axis = layoutWidth >= layoutHeight ? 'x' : 'y';
  // State indices and fractions always use oldest-to-newest catalogue order.
  const chronologicalIndex = state.index ?? Math.max(0, works.length - 3);
  const initialIndex = axis === 'x' ? chronologicalIndex : works.length - 1 - chronologicalIndex;
  const fraction = (state.fraction || 0) * (axis === 'x' ? 1 : -1);
  const displayWorks = axis === 'x' ? works : [...works].reverse();
  gallery.dataset.axis = axis;
  viewport = axis === 'x' ? layoutWidth : layoutHeight;
  const heightScale = axis === 'x' ? Math.min(1, layoutHeight / 700) : 1;
  // Fluid landscape size, plus the artist's extra 10% for every landscape window.
  // Equivalent to clamp(120px, calc(84px + 6vh), 180px); portrait keeps its calibration.
  const baseEdge = axis === 'x'
    ? Math.max(RIBBON_BASE_EDGE, Math.min(180, 84 + layoutHeight * .06))
    : RIBBON_BASE_EDGE;
  let cursor = 0;
  const shapes = displayWorks.map(work => {
    const ratio = work.width / work.height;
    const longEdge = baseEdge * (SIZE_SCALE[work.sizeCategory] ?? 1) * heightScale * (axis === 'x' ? 1.32 : 1);
    const width = longEdge * Math.min(1, ratio);
    const height = longEdge / Math.max(1, ratio);
    const length = axis === 'x' ? width : height;
    const shape = { width, height, length, center: cursor + length / 2 };
    cursor += length + RIBBON_GAP;
    return shape;
  });
  cycle = cursor;
  if (!works.length) {
    ribbon.replaceChildren(); items = []; active = -1; hovered = -1;
    ribbonCaption.hidden = true;
    ribbon.style.width = '100%'; ribbon.style.height = '100%';
    gallery.scrollLeft = 0; gallery.scrollTop = 0;
    ribbonState = null; rebuilding = false;
    return;
  }
  const coverage = axis === 'y' ? viewport / PORTRAIT_EDGE_PITCH : viewport;
  const repeats = Math.max(5, 2 * Math.ceil(coverage / (2 * cycle)) + 3);
  middleRepeat = Math.floor(repeats / 2);
  poolOrigin = (Math.floor(SCROLL_RUNWAY / (2 * cycle)) - middleRepeat) * cycle;
  ribbon.replaceChildren(); items = [];
  ribbon.style.width = axis === 'x' ? `${SCROLL_RUNWAY}px` : '100%';
  ribbon.style.height = axis === 'y' ? `${SCROLL_RUNWAY}px` : '100%';
  for (let repeat = 0; repeat < repeats; repeat++) {
    displayWorks.forEach((work, index) => {
      const shape = shapes[index], button = document.createElement('button'), image = new Image();
      const itemIndex = items.length;
      button.className = 'artwork'; button.type = 'button'; button.dataset.index = itemIndex;
      button.dataset.workId = work.id;
      button.dataset.size = work.sizeCategory ?? 'unknown';
      button.setAttribute('aria-label', websiteTitle(work) || work.id);
      button.tabIndex = repeat === middleRepeat ? 0 : -1;
      button.style.width = `${shape.width}px`; button.style.height = `${shape.height}px`;
      const view = currentView(work);
      image.src = view.preview; image.alt = websiteTitle(work) || work.id;
      image.width = view.width; image.height = view.height; image.decoding = 'async'; image.draggable = false;
      button.dataset.viewId = view.id;
      button.append(image); ribbon.append(button);
      const item = { ...shape, center: poolOrigin + shape.center + repeat * cycle, work, button, scale: 1 };
      fitRibbonShade(item, view);
      items.push(item);
      button.addEventListener('click', () => openWork(itemIndex));
      button.addEventListener('focus', () => {
        if (document.documentElement.dataset.input !== 'keyboard' || !button.matches(':focus-visible') || viewer.open || rebuilding) return;
        mode = 'keyboard'; hovered = itemIndex;
        setScroll(items[itemIndex].center - viewport / 2);
      });
    });
  }
  const index = middleRepeat * works.length + initialIndex;
  const neighbour = index + (fraction >= 0 ? 1 : -1);
  const pitch = Math.abs(items[neighbour].center - items[index].center);
  const anchor = items[index].center + fraction * pitch;
  active = index; hovered = -1; mode = 'center';
  if (state.selectedId) {
    const candidates = items.map((item, i) => ({ item, i })).filter(({ item }) => item.work.id === state.selectedId);
    active = candidates.reduce((best, next) => Math.abs(next.item.center - anchor) < Math.abs(best.item.center - anchor) ? next : best).i;
  }
  items[active].scale = ribbonFocusScale();
  gallery.scrollLeft = 0; gallery.scrollTop = 0;
  setScroll(anchor - viewport / 2);
  rebuilding = false;
  // Apply positions synchronously, including while the modal pauses animation.
  renderRibbon(0, true);
  if (axis === 'x') gallery.scrollTop = 0; else gallery.scrollLeft = 0;
}
function captureRibbonState() {
  if (!items.length) return null;
  const center = scrollPosition() + viewport / 2, index = nearest(center);
  const neighbour = Math.max(0, Math.min(items.length - 1, index + (center >= items[index].center ? 1 : -1)));
  const pitch = Math.abs(items[neighbour].center - items[index].center) || 1;
  return { index: works.findIndex(work => work.id === items[index].work.id),
    fraction: (center - items[index].center) / pitch * (axis === 'x' ? 1 : -1), selectedId: items[active]?.work.id };
}
function recycle() {
  const center = scrollPosition() + viewport / 2;
  const relative = (center - poolOrigin) / cycle;
  if (relative >= middleRepeat - .5 && relative <= middleRepeat + 1.5) return;
  const cycles = Math.round(relative - middleRepeat - .5);
  const shift = cycles * cycle, steps = cycles * works.length;
  const oldScales = items.map(item => item.scale);
  // Move repeated copies, never the native scroll position. Writing scrollTop
  // during a held swipe or momentum can interrupt the browser's gesture.
  poolOrigin += shift;
  items.forEach((item, i) => { item.center += shift; item.scale = oldScales[i + steps] ?? 1; });
  if (hovered >= 0) { hovered -= steps; if (hovered < 0 || hovered >= items.length) hovered = -1; }
  active -= steps;
  if (active < 0 || active >= items.length) active = nearest(center);
}
function recenterRunway() {
  if (touchHeld || viewer.open || !items.length) return;
  const position = scrollPosition();
  if (position > SCROLL_RUNWAY * .2 && position < SCROLL_RUNWAY * .8) return;
  const shift = Math.round((SCROLL_RUNWAY / 2 - position - viewport / 2) / cycle) * cycle;
  poolOrigin += shift;
  items.forEach(item => { item.center += shift; });
  setScroll(position + shift);
  renderRibbon(0, true);
}
function scheduleRunwayReset() {
  clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(recenterRunway, 180);
}
gallery.addEventListener('scroll', scheduleRunwayReset, { passive: true });
gallery.addEventListener('touchstart', () => { touchHeld = true; clearTimeout(scrollIdleTimer); }, { passive: true });
function endTouch() { touchHeld = false; scheduleRunwayReset(); }
addEventListener('touchend', endTouch, { passive: true });
addEventListener('touchcancel', endTouch, { passive: true });
function displayRibbonPosition(position, center) {
  if (axis !== 'y') return position;
  const distance = position - center, clear = viewport * .22;
  const edge = Math.max(0, Math.abs(distance) - clear);
  // One smooth, monotonic mapping: unchanged centre, progressively tighter
  // spacing near the ends. Logical scroll/selection coordinates stay intact.
  const compressed = edge * (PORTRAIT_EDGE_PITCH + (1 - PORTRAIT_EDGE_PITCH) / (1 + edge / (viewport * .2)));
  return center + Math.sign(distance) * (Math.min(Math.abs(distance), clear) + compressed);
}
function fitRibbonShade(item, view) {
  const width = Math.min(item.width, item.height * view.width / view.height);
  item.photoHeight = width * view.height / view.width;
  item.button.style.setProperty('--depth-photo-inset', ((item.height - item.photoHeight) / 2) + 'px ' + ((item.width - width) / 2) + 'px');
}
function shadeRibbonOverlaps() {
  items.forEach(item => { item.contactOpacity = 0; });
  if (axis === 'y') items.forEach((item, i) => {
    for (const front of [items[i - 1], items[i + 1]]) {
      if (!front || front.depth <= item.depth) continue;
      const overlap = (item.photoHeight * item.scale + front.photoHeight * front.scale) / 2 - Math.abs(item.displayCenter - front.displayCenter);
      if (overlap > 0) front.contactOpacity = Math.max(front.contactOpacity, Math.min(1, overlap / 18));
    }
  });
  items.forEach(item => item.button.style.setProperty('--contact-opacity', String(item.contactOpacity)));
}
function renderRibbonCaption() {
  const item = items[active];
  ribbonCaption.hidden = !item;
  if (!item) return;
  const view = currentView(item.work);
  // Match the image's floating-point render geometry without layout rounding.
  const unscaledWidth = Math.min(item.width, item.height * view.width / view.height);
  const width = unscaledWidth * item.scale;
  const height = width * view.height / view.width;
  // Labels share native scrolling with the image, including between JS frames.
  const center = item.displayCenter;
  const photo = {
    left: axis === 'x' ? center - width / 2 : layoutWidth / 2 - width / 2,
    top: axis === 'x' ? layoutHeight / 2 - height / 2 : center - height / 2,
    width, height,
  };
  if (ribbonCaption.dataset.workId !== item.work.id) {
    ribbonCaption.dataset.workId = item.work.id;
    ribbonTitle.textContent = websiteTitle(item.work);
    ribbonYear.textContent = item.work.year || '';
    ribbonTitle.hidden = !websiteTitle(item.work);
    ribbonYear.hidden = !item.work.year;
  }
  ribbonCaption.dataset.axis = axis;
  const gap = 16;
  // Reserve the final enlarged width from the first frame, avoiding reflow.
  const focusedPhotoWidth = unscaledWidth * ribbonFocusScale();
  const titleWidth = axis === 'x' ? Math.max(180, focusedPhotoWidth)
    : Math.min(160, Math.max(0, (layoutWidth - focusedPhotoWidth) / 2 - gap - 20));
  ribbonTitle.style.width = `${titleWidth}px`;
  const titleX = axis === 'x' ? photo.left : photo.left - gap - titleWidth;
  const titleY = axis === 'x' ? photo.top - gap : photo.top;
  const yearX = photo.left + photo.width + (axis === 'x' ? 0 : gap);
  const yearY = photo.top + photo.height + (axis === 'x' ? gap : 0);
  ribbonTitle.style.transform = `translate3d(${titleX}px, ${titleY}px, 0)${axis === 'x' ? ' translateY(-100%)' : ''}`;
  ribbonYear.style.transform = `translate3d(${yearX}px, ${yearY}px, 0) ${axis === 'x' ? 'translateX(-100%)' : 'translateY(-100%)'}`;
}
function renderRibbon(dt, preserveSelection = false) {
    recycle();
    const center = scrollPosition() + viewport / 2;
    if (!preserveSelection) active = hovered >= 0 ? hovered : nearest(center);
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 85);
    let extra = 0;
    const layout = items.map((item, i) => {
      const target = i === active ? ribbonFocusScale() : 1;
      item.scale += (target - item.scale) * blend;
      const addition = item.length * (item.scale - 1);
      const entry = { before: extra, addition };
      extra += addition;
      return entry;
    });
    // Each expansion adds half its space on either side of that work.
    // A fixed symmetric origin keeps neighbour motion monotonic when hover
    // changes; moving an origin between works creates an overshoot and rebound.
    const anchorExtra = extra / 2;
    items.forEach((item, i) => {
      const logicalPosition = item.center + layout[i].before + layout[i].addition / 2 - anchorExtra;
      const position = displayRibbonPosition(logicalPosition, center);
      item.displayCenter = position;
      item.depth = axis === 'y' ? Math.max(1, 10000 - Math.round(Math.abs(logicalPosition - center))) : 0;
      item.button.style.zIndex = axis === 'y' ? String(item.depth) : '';
      item.button.style.transform = axis === 'x'
        ? `translate3d(${position - item.width / 2}px, -50%, 0) scale(${item.scale})`
        : `translate3d(-50%, ${position - item.height / 2}px, 0) scale(${item.scale})`;
      item.button.dataset.active = String(i === active);
    });
    // Hit-test the rendered ribbon even when the pointer has not moved: native
    // scrolling, inertia and cycle recycling can bring another work under it.
    shadeRibbonOverlaps();
    renderRibbonCaption();
    ribbonState = captureRibbonState();
    updateMouseSelection();
}
function frame(time) {
  const dt = Math.min(40, time - (lastTime || time)); lastTime = time;
  if (items.length) {
    if (gallery.clientWidth !== layoutWidth || gallery.clientHeight !== layoutHeight) queueLayout();
    else if (!viewer.open) renderRibbon(dt);
  }
  requestAnimationFrame(frame);
}
gallery.addEventListener('wheel', event => {
  if (viewer.open || event.ctrlKey || axis !== 'x') return;
  // Horizontal trackpad gestures retain browser behaviour. Map an ordinary
  // vertical wheel to the horizontal native scroll container.
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewport : 1;
    gallery.scrollLeft += event.deltaY * unit;
  }
}, { passive: false });
function updateMouseSelection() {
  if (mode !== 'mouse' || !mousePosition || viewer.open) return;
  const coordinate = axis === 'x' ? mousePosition.x : mousePosition.y;
  let nearestIndex = -1, nearestDistance = Infinity, projected = -1;
  for (let index = 0; index < items.length; index++) {
    const bounds = items[index].button.getBoundingClientRect();
    const start = axis === 'x' ? bounds.left : bounds.top;
    const end = axis === 'x' ? bounds.right : bounds.bottom;
    // Ignore the cross-axis distance: the image's projected column/row is
    // selectable even when the pointer is above, below, or beside the ribbon.
    if (coordinate >= start && coordinate <= end) {
      if (axis === 'x') { hovered = index; return; }
      if (projected < 0 || items[index].depth > items[projected].depth) projected = index;
    }
    const distance = Math.abs(coordinate - (start + end) / 2);
    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
  }
  if (projected >= 0) { hovered = projected; return; }
  // Preserve selection through gaps to avoid a centre-selection rebound.
  if (hovered < 0) hovered = nearestIndex;
}
gallery.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || viewer.open) return;
  mode = 'mouse';
  mousePosition = { x: event.clientX, y: event.clientY };
  updateMouseSelection();
});
gallery.addEventListener('pointerleave', () => { mousePosition = null; hovered = -1; mode = 'center'; });
gallery.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse') { mousePosition = null; mode = 'center'; hovered = -1; }
});
gallery.addEventListener('keydown', event => {
  if (!items.length) return;
  const next = ['ArrowRight', 'ArrowDown'].includes(event.key);
  const previous = ['ArrowLeft', 'ArrowUp'].includes(event.key);
  if (!next && !previous) return;
  event.preventDefault();
  mode = 'center'; hovered = -1;
  const index = Math.max(0, Math.min(items.length - 1, nearest(scrollPosition() + viewport / 2) + (next ? 1 : -1)));
  gallery.scrollTo({ [axis === 'x' ? 'left' : 'top']: items[index].center - viewport / 2, behavior: 'instant' });
});
function websiteTitle(work) {
  return work.displayTitle || work.title || '';
}
function currentView(work) {
  return work.views?.[selectedViews.get(work.id) || 0] || work;
}
function ribbonPhotoRect(button, view) {
  const box = button.getBoundingClientRect();
  const ratio = view.width / view.height;
  const width = Math.min(box.width, box.height * ratio);
  const height = width / ratio;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}
function renderWorkInfo() {
  const title = document.querySelector('#viewer-title');
  title.textContent = websiteTitle(viewerWork);
  title.hidden = !websiteTitle(viewerWork);
  document.querySelector('#viewer-series').textContent = viewerWork.series || '';
  const rows = [
    [viewerWork.year, viewerWork.location].filter(Boolean).join(' · '),
    viewerWork.dimensionsCm?.length ? viewerWork.dimensionsCm.join('×') + ' cm' : ''
  ].filter(Boolean);
  const metadata = document.querySelector('#viewer-meta');
  metadata.replaceChildren();
  rows.forEach(value => { const row = document.createElement('p'); row.textContent = value; metadata.append(row); });
  const price = viewerWork.price == null ? '' : String(viewerWork.price).trim();
  if (viewerWork.sold || price) {
    const saleRow = document.createElement('p');
    saleRow.className = 'viewer-price' + (viewerWork.sold ? ' is-sold' : '');
    saleRow.textContent = viewerWork.sold ? 'sold' : price;
    metadata.append(saleRow);
  }
}
function fitViewerImage() {
  if (!viewerView) return;
  const width = viewer.clientWidth, height = viewer.clientHeight;
  const portrait = height > width;
  viewer.dataset.viewsLayout = portrait ? 'bottom' : 'side';
  viewer.dataset.infoLayout = portrait ? 'top' : 'side';
  const padding = getComputedStyle(viewer);
  const left = parseFloat(padding.paddingLeft), right = parseFloat(padding.paddingRight);
  const top = parseFloat(padding.paddingTop), bottom = parseFloat(padding.paddingBottom);
  const availableWidth = width - left - right, availableHeight = height - top - bottom;
  viewerInfo.style.width = 'max-content';
  viewerInfo.style.maxWidth = `${availableWidth}px`;
  const infoWidth = viewerInfo.offsetWidth, infoHeight = viewerInfo.offsetHeight;
  viewNav.style.maxHeight = `${availableHeight}px`;
  viewNav.style.maxWidth = `${availableWidth}px`;
  const navWidth = viewNav.hidden ? 0 : viewNav.offsetWidth;
  const navHeight = viewNav.hidden ? 0 : viewNav.offsetHeight;
  const below = !viewNav.hidden && portrait ? navHeight + 24 : 0;
  const ratio = viewerView.width / viewerView.height;
  let imageWidth, imageHeight, imageLeft, imageTop;
  if (portrait) {
    const above = infoHeight + 32;
    imageWidth = Math.min(availableWidth, Math.max(1, availableHeight - above - below) * ratio);
    imageHeight = imageWidth / ratio;
    const compositionTop = top + Math.max(0, (availableHeight - above - imageHeight - below) / 2);
    imageLeft = left + (availableWidth - imageWidth) / 2;
    imageTop = compositionTop + above;
    viewerInfo.style.left = `${left}px`;
    viewerInfo.style.top = `${compositionTop}px`;
  } else {
    const leftControls = !viewNav.hidden ? navWidth + 56 : 0;
    const rightControls = infoWidth + 44;
    // Use identical landscape composition for every input/device type.
    const reserved = 2 * Math.max(leftControls, rightControls);
    imageWidth = Math.min(Math.max(1, availableWidth - reserved), Math.max(1, availableHeight) * ratio);
    imageHeight = imageWidth / ratio;
    imageLeft = left + (availableWidth - imageWidth) / 2;
    imageTop = top + Math.max(0, (availableHeight - imageHeight) / 2);
    viewerInfo.style.left = `${imageLeft + imageWidth + 44}px`;
    viewerInfo.style.top = `${Math.max(top, Math.min(imageTop + imageHeight - infoHeight - 24, height - bottom - infoHeight))}px`;
  }
  viewerImage.style.width = `${imageWidth}px`; viewerImage.style.height = `${imageHeight}px`;
  viewerImage.style.left = `${imageLeft}px`; viewerImage.style.top = `${imageTop}px`;
  if (!viewNav.hidden) {
    viewNav.style.left = portrait
      ? `${Math.max(left, Math.min(imageLeft + imageWidth / 2 - navWidth / 2, width - right - navWidth))}px`
      : `${Math.max(left, imageLeft - navWidth - 56)}px`;
    viewNav.style.top = portrait
      ? `${imageTop + imageHeight + 24}px`
      : `${Math.max(top, Math.min(imageTop + (imageHeight - navHeight) / 2, height - bottom - navHeight))}px`;
  }
  fittedViewer = { width, height, infoWidth: viewerInfo.offsetWidth, infoHeight: viewerInfo.offsetHeight };
}
function thumbnailTransform(thumbnail, full) {
  const x = thumbnail.left + thumbnail.width / 2 - full.left - full.width / 2;
  const y = thumbnail.top + thumbnail.height / 2 - full.top - full.height / 2;
  return `translate(${x}px, ${y}px) scale(${thumbnail.width / full.width})`;
}
function showViewerPhoto(view, animate = false) {
  const sequence = ++viewerSequence;
  viewerAnimation?.cancel(); viewerAnimation = null;
  viewerView = view;
  viewerImage.src = view.preview;
  viewerImage.dataset.viewId = view.id;
  viewerImage.alt = websiteTitle(viewerWork) || viewerWork.id;
  fitViewerImage();
  if (animate && !reducedMotion.matches) {
    viewerAnimation = viewerImage.animate([
      { opacity: .7, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }
    ], { duration: 160, easing: 'ease-out', fill: 'both' });
  }
  const detailedImage = new Image();
  detailedImage.src = view.image;
  detailedImage.decode().then(() => {
    if (viewer.open && sequence === viewerSequence && !closingViewer) viewerImage.src = detailedImage.src;
  }).catch(() => {});
}
function chooseView(index) {
  if (!viewerWork || closingViewer) return;
  const view = viewerWork.views[index];
  if (!view) return;
  selectedViews.set(viewerWork.id, index);
  // All repeated copies represent one work. Keep their slots unchanged and
  // fit the chosen photograph inside them, preserving its own proportions.
  items.forEach(item => {
    if (item.work.id !== viewerWork.id) return;
    const image = item.button.firstElementChild;
    image.src = view.preview; image.width = view.width; image.height = view.height;
    item.button.dataset.viewId = view.id;
    fitRibbonShade(item, view);
  });
  [...viewNav.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  showViewerPhoto(view, true);
}
function renderViewThumbnails() {
  const views = viewerWork.views || [];
  const multiple = views.length > 1;
  viewNav.hidden = !multiple;
  viewNav.replaceChildren();
  if (!multiple) return;
  views.forEach((view, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'view-thumb';
    button.setAttribute('aria-label', index === 0 ? 'Основной вид' : `Ракурс ${index + 1}`);
    button.setAttribute('aria-pressed', String(index === (selectedViews.get(viewerWork.id) || 0)));
    const image = new Image(); image.src = view.preview; image.alt = ''; image.draggable = false;
    button.append(image); button.addEventListener('click', () => chooseView(index));
    viewNav.append(button);
  });
}
function fadeViewerControls(visible) {
  const elements = [viewerInfo, viewNav].filter(element => !element.hidden);
  const starts = elements.map(element => visible ? 0 : Number(getComputedStyle(element).opacity));
  controlAnimations.forEach(animation => animation.cancel());
  controlAnimations = [];
  if (reducedMotion.matches) return;
  controlAnimations = elements.map((element, index) => element.animate([
    { opacity: starts[index] }, { opacity: visible ? 1 : 0 }
  ], { duration: visible ? 220 : 160, easing: visible ? 'ease-out' : 'ease-in', fill: 'both' }));
}
function openWork(index) {
  if (viewer.open || closingViewer) return;
  viewerTouch = null; suppressViewerClickUntil = 0;
  viewerWheelTotal = 0;
  setMenu(null);
  openedFrom = items[index].button; savedScroll = scrollPosition();
  savedReturnState = captureRibbonState();
  viewerWork = items[index].work;
  const view = currentView(viewerWork);
  const origin = ribbonPhotoRect(openedFrom, view);
  renderWorkInfo();
  renderViewThumbnails();
  viewer.classList.remove('is-closing');
  viewer.showModal();
  showViewerPhoto(view);
  const destination = viewerImage.getBoundingClientRect();
  if (!reducedMotion.matches) {
    viewerAnimation = viewerImage.animate([
      { transform: thumbnailTransform(origin, destination) }, { transform: 'none' }
    ], { duration: 420, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both' });
  }
  fadeViewerControls(true);
  history.pushState({ artViewer: true }, '', location.href);
  hasViewerHistory = true;
}
async function dismissViewer() {
  if (!viewer.open || closingViewer) return;
  closingViewer = true;
  const currentTransform = getComputedStyle(viewerImage).transform;
  viewerAnimation?.cancel();
  const full = viewerImage.getBoundingClientRect();
  viewer.classList.add('is-closing');
  fadeViewerControls(false);
  if (!reducedMotion.matches && openedFrom?.isConnected) {
    viewerAnimation = viewerImage.animate([
      { transform: currentTransform },
      { transform: thumbnailTransform(ribbonPhotoRect(openedFrom, currentView(viewerWork)), full) }
    ], { duration: 220, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'both' });
    await viewerAnimation.finished.catch(() => {});
  }
  viewer.close();
  controlAnimations.forEach(animation => animation.cancel()); controlAnimations = [];
  viewerAnimation?.cancel(); viewerAnimation = null;
  viewer.classList.remove('is-closing');
  viewerWork = null; viewerView = null; closingViewer = false; savedReturnState = null;
  setScroll(savedScroll);
  openedFrom?.focus({ preventScroll: true });
  setScroll(savedScroll);
}
function requestClose() {
  if (closingViewer) return;
  if (hasViewerHistory) history.back(); else dismissViewer();
}
function stepViewer(direction) {
  if (!viewer.open || closingViewer || works.length < 2) return;
  const index = works.findIndex(work => work.id === viewerWork.id);
  const next = (index + direction * (axis === 'x' ? 1 : -1) + works.length) % works.length;
  viewerWork = works[next];
  // Keep the ribbon and closing animation aligned with the displayed work.
  const itemIndex = nearest(scrollPosition() + viewport / 2);
  const candidates = items.filter(item => item.work.id === viewerWork.id);
  const target = candidates.reduce((best, item) =>
    Math.abs(item.center - items[itemIndex].center) < Math.abs(best.center - items[itemIndex].center) ? item : best
  );
  openedFrom = target.button;
  setScroll(target.center - viewport / 2);
  mode = 'center'; mousePosition = null; hovered = -1;
  renderRibbon(0, true);
  savedScroll = scrollPosition();
  savedReturnState = captureRibbonState();
  renderWorkInfo();
  renderViewThumbnails();
  showViewerPhoto(currentView(viewerWork));
}
let viewerTouch = null, suppressViewerClickUntil = 0;
let viewerWheelTotal = 0;
viewer.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const next = ['ArrowRight', 'ArrowDown'].includes(event.key);
  const previous = ['ArrowLeft', 'ArrowUp'].includes(event.key);
  if (!next && !previous) return;
  event.preventDefault();
  stepViewer(next ? 1 : -1);
});
viewer.addEventListener('touchstart', event => {
  viewerTouch = event.touches.length === 1 && !event.target.closest('#viewer-views, #viewer-info, button')
    ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}, { passive: true });
viewer.addEventListener('touchmove', event => {
  if (event.touches.length !== 1) viewerTouch = null;
  if (!viewerTouch) return;
  const dx = event.touches[0].clientX - viewerTouch.x;
  const dy = event.touches[0].clientY - viewerTouch.y;
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) event.preventDefault();
}, { passive: false });
viewer.addEventListener('touchend', event => {
  const start = viewerTouch;
  viewerTouch = null;
  if (!start || event.touches.length || !event.changedTouches.length) return;
  const dx = event.changedTouches[0].clientX - start.x;
  const dy = event.changedTouches[0].clientY - start.y;
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
  suppressViewerClickUntil = performance.now() + 500;
  stepViewer(dx < 0 ? -1 : 1);
}, { passive: true });
viewer.addEventListener('touchcancel', () => { viewerTouch = null; }, { passive: true });
viewer.addEventListener('wheel', event => {
  if (!viewer.open || closingViewer || event.ctrlKey || event.target.closest('#viewer-views')) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewer.clientHeight : 1;
  // Accumulate tiny trackpad deltas without a time-based navigation lock.
  if (Math.sign(delta) !== Math.sign(viewerWheelTotal)) viewerWheelTotal = 0;
  viewerWheelTotal += delta * unit;
  if (Math.abs(viewerWheelTotal) < 40) return;
  stepViewer(Math.sign(viewerWheelTotal));
  viewerWheelTotal = 0;
}, { passive: false });
viewer.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
viewer.addEventListener('click', event => {
  if (performance.now() < suppressViewerClickUntil) { event.preventDefault(); return; }
  if (!event.target.closest('#viewer-image, #viewer-info, button')) requestClose();
});
addEventListener('popstate', () => { hasViewerHistory = false; dismissViewer(); });
function flushLayout() {
  resizeFrame = 0;
  if (!items.length || !gallery.clientWidth || !gallery.clientHeight) return;
  const ribbonChanged = gallery.clientWidth !== layoutWidth || gallery.clientHeight !== layoutHeight;
  if (ribbonChanged) {
    // Use the last rendered logical anchor, not native scroll values that the
    // browser may already have clamped midway through an orientation change.
    makeRibbon((viewer.open ? savedReturnState : ribbonState) || {});
    if (viewer.open) {
      savedScroll = scrollPosition();
      const workIndex = works.findIndex(work => work.id === viewerWork.id);
      const displayIndex = axis === 'x' ? workIndex : works.length - 1 - workIndex;
      openedFrom = items[middleRepeat * works.length + displayIndex].button;
    }
  }
  if (viewer.open && (ribbonChanged || viewer.clientWidth !== fittedViewer.width || viewer.clientHeight !== fittedViewer.height || viewerInfo.offsetWidth !== fittedViewer.infoWidth || viewerInfo.offsetHeight !== fittedViewer.infoHeight)) {
    viewerAnimation?.cancel(); viewerAnimation = null;
    fitViewerImage();
  }
}
function queueLayout() {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(flushLayout);
}
addEventListener('resize', queueLayout);
addEventListener('orientationchange', queueLayout);
window.visualViewport?.addEventListener('resize', queueLayout);
if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(queueLayout);
  [gallery, viewer, viewerInfo].forEach(element => observer.observe(element));
}
const themeToggle = document.querySelector('#theme-toggle');
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Включить светлый фон' : 'Включить тёмный фон');
}
applyTheme(document.documentElement.dataset.theme === 'dark');
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme !== 'dark');
});
// Menu state never pauses the ribbon animation or native scrolling.
const artMenu = document.querySelector('#art-menu');
const menuFilters = document.querySelector('#menu-filters');
const menuContacts = document.querySelector('#menu-contacts');
const menuAbout = document.querySelector('#menu-about');
const about = document.querySelector('#about');
const filterOptions = document.querySelector('#filter-options');
const contactOptions = document.querySelector('#contact-options');
const menuStatus = document.querySelector('#menu-status');
let openMenu = null, availableOnly = false, copySequence = 0;
let selectedSeries = 'all';
const selectedSizes = new Set(['L', 'M', 'S']);
artMenu.addEventListener('wheel', event => {
  if (viewer.open || event.ctrlKey) return;
  // Fixed navigation is a sibling of the scroll container. Forward wheel
  // input so its text and choices do not create dead areas in the ribbon.
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewport : 1;
  const delta = axis === 'x' && Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  setScroll(scrollPosition() + delta * unit);
}, { passive: false });
function setMenu(name) {
  openMenu = name;
  artMenu.dataset.open = name || '';
  menuFilters.setAttribute('aria-expanded', String(name === 'filters'));
  menuContacts.setAttribute('aria-expanded', String(name === 'contacts'));
  filterOptions.hidden = name !== 'filters';
  contactOptions.hidden = name !== 'contacts';
  menuStatus.textContent = '';
}
menuFilters.addEventListener('click', () => setMenu(openMenu === 'filters' ? null : 'filters'));
menuContacts.addEventListener('click', () => setMenu(openMenu === 'contacts' ? null : 'contacts'));
let closingAbout = false;
async function dismissAbout() {
  if (!about.open || closingAbout) return;
  closingAbout = true;
  const backdrop = getComputedStyle(about, '::backdrop');
  about.style.setProperty('--about-veil-opacity', backdrop.opacity);
  about.style.setProperty('--about-blur', backdrop.backdropFilter || backdrop.webkitBackdropFilter);
  about.style.setProperty('--about-text-opacity', getComputedStyle(about.querySelector('.about-text')).opacity);
  about.classList.add('is-closing');
  if (!reducedMotion.matches) {
    await Promise.all(about.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  }
  about.close();
  about.classList.remove('is-closing');
  closingAbout = false;
}
menuAbout.addEventListener('click', () => {
  setMenu(null);
  about.showModal();
});
about.addEventListener('click', event => {
  if (event.target.closest('a')) return;
  event.preventDefault();
  event.stopPropagation();
  dismissAbout();
});
about.addEventListener('cancel', event => { event.preventDefault(); dismissAbout(); });
document.addEventListener('click', event => {
  if (!openMenu || artMenu.contains(event.target)) return;
  // The outside tap dismisses navigation; it does not also open a painting.
  setMenu(null); event.preventDefault(); event.stopPropagation();
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openMenu) {
    const opener = openMenu === 'filters' ? menuFilters : menuContacts;
    setMenu(null); opener.focus({ preventScroll: true }); event.preventDefault();
  }
});
function applyFilters() {
  const oldState = captureRibbonState();
  const oldCenterId = oldState ? works[oldState.index]?.id : null;
  works = allWorks.filter(work =>
    (!availableOnly || (!work.sold && work.price != null && String(work.price).trim() !== '')) &&
    (selectedSizes.has(work.sizeCategory) || (work.sizeCategory == null && selectedSizes.size === 3))
    && (selectedSeries === 'all' || work.series === selectedSeries)
  );
  const index = works.findIndex(work => work.id === oldCenterId);
  mousePosition = null;
  const selectedId = works.some(work => work.id === oldState?.selectedId) ? oldState.selectedId : null;
  makeRibbon(index >= 0 ? { ...oldState, index, selectedId } : {});
}
filterOptions.addEventListener('click', event => {
  const seriesButton = event.target.closest('[data-series]');
  if (seriesButton) {
    selectedSeries = seriesButton.dataset.series;
    filterOptions.querySelectorAll('[data-series]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.series === selectedSeries)));
    applyFilters();
    return;
  }
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  const value = button.dataset.filter;
  if (value === 'available') availableOnly = !availableOnly;
  else if (selectedSizes.has(value)) selectedSizes.delete(value);
  else selectedSizes.add(value);
  button.setAttribute('aria-pressed', String(value === 'available' ? availableOnly : selectedSizes.has(value)));
  applyFilters();
});
function copyEmailFallback() {
  // LAN HTTP is not a secure context, so navigator.clipboard is unavailable.
  const field = document.createElement('textarea');
  field.value = 'arsekh@gmail.com'; field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;pointer-events:none';
  document.body.append(field); field.focus({ preventScroll: true }); field.select();
  field.setSelectionRange(0, field.value.length);
  const copied = document.execCommand('copy'); field.remove();
  document.querySelector('#contact-email').focus({ preventScroll: true });
  return copied;
}
document.querySelector('#contact-email').addEventListener('click', async () => {
  const sequence = ++copySequence;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText('arsekh@gmail.com'); copied = true;
    } else copied = copyEmailFallback();
  } catch { copied = copyEmailFallback(); }
  if (sequence === copySequence && openMenu === 'contacts') menuStatus.textContent = copied ? 'email copied' : 'select and copy: arsekh@gmail.com';
});

try {
  const response = await fetch('/images/khech-gallery/works.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Gallery data: ${response.status}`);
  allWorks = await response.json();
  works = allWorks;
  if (!works.length) throw new Error('Gallery is empty');
  applyFilters();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error); document.querySelector('#gallery-error').hidden = false;
}
