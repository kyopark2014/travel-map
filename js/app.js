import { createMeasureTool, formatDistance } from './measure.js';
import { createPathTour } from './tour.js?v=20260313-stop-bubbles';

const TRIP_START = {
  name: '신치토세공항(新千歳空港)',
  detail: 'CTS · 전체 여행 출발지 · 7C1503 도착',
  lng: 141.6925,
  lat: 42.77528,
};

const SAPPORO_HOTEL = {
  name: 'Ibis Styles Sapporo Hotel',
  lng: 141.355046,
  lat: 43.050211,
};

const ESRI_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TOPO =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const AWS_TERRARIUM =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const placeQuery = document.getElementById('place-query');
const searchForm = document.getElementById('search-form');
const coordsForm = document.getElementById('coords-form');
const latInput = document.getElementById('lat-input');
const lngInput = document.getElementById('lng-input');
const searchStatus = document.getElementById('search-status');
const searchResults = document.getElementById('search-results');
const exaggerationInput = document.getElementById('exaggeration');
const exaggerationValue = document.getElementById('exaggeration-value');
const measureToggle = document.getElementById('measure-toggle');
const measureClear = document.getElementById('measure-clear');
const measureResult = document.getElementById('measure-result');
const tourSelect = document.getElementById('tour-select');
const tourStart = document.getElementById('tour-start');
const tourStop = document.getElementById('tour-stop');
const tourStopFloat = document.getElementById('tour-stop-float');
const placePhotoCard = document.getElementById('place-photo-card');
const placePhotoImg = document.getElementById('place-photo-img');
const placePhotoHeading = document.getElementById('place-photo-heading');
const placePhotoTitle = document.getElementById('place-photo-title');
const placePhotoDetail = document.getElementById('place-photo-detail');
const placePhotoCredit = document.getElementById('place-photo-credit');
const placePhotoClose = document.getElementById('place-photo-close');
const placePhotoPrev = document.getElementById('place-photo-prev');
const placePhotoNext = document.getElementById('place-photo-next');
const placePhotoDots = document.getElementById('place-photo-dots');
const tourInfo = document.getElementById('tour-info');
const tourInfoTitle = document.getElementById('tour-info-title-text');
const tourInfoStats = document.getElementById('tour-info-stats');
const tourInfoDesc = document.getElementById('tour-info-desc');
const tourStops = document.getElementById('tour-stops');
const tourFit = document.getElementById('tour-fit');
const tourToggle = document.getElementById('tour-toggle');
const tourPanel = document.getElementById('tour-panel');
const searchToggle = document.getElementById('search-toggle');
const searchPanel = document.getElementById('search-panel');
const searchClose = document.getElementById('search-close');
const itineraryToggle = document.getElementById('itinerary-toggle');
const itineraryPanel = document.getElementById('itinerary-panel');
const itineraryClose = document.getElementById('itinerary-close');
const itineraryContent = document.getElementById('itinerary-content');
const clothingToggle = document.getElementById('clothing-toggle');
const clothingPanel = document.getElementById('clothing-panel');
const clothingClose = document.getElementById('clothing-close');
const clothingContent = document.getElementById('clothing-content');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');
const btnResetNorth = document.getElementById('btn-reset-north');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnToggle3d = document.getElementById('btn-toggle-3d');

const ITINERARY_MD_URL = 'data/hokkaido-itinerary-20261008.md';
const CLOTHING_MD_URL = 'data/hokkaido-weather-clothing-20261008.md';

let currentMarker = null;
let stopMarkers = [];
let is3d = true;
let tourData = null;
let activeTourId = null;
let exaggeration = 1.5;
/** @type {null | 'tour' | 'itinerary' | 'clothing' | 'search' | 'settings' | 'place'} */
let activeSidePanel = null;
/** @type {null | { places: Record<string, any>, attribution?: string }} */
let photoManifest = null;
let activePhotoEntry = null;
let activePhotoName = '';
let activePhotoDetail = '';
let activePhotoIndex = 0;

function syncMenuButtons() {
  tourToggle.setAttribute(
    'aria-expanded',
    activeSidePanel === 'tour' ? 'true' : 'false',
  );
  itineraryToggle.setAttribute(
    'aria-expanded',
    activeSidePanel === 'itinerary' ? 'true' : 'false',
  );
  clothingToggle.setAttribute(
    'aria-expanded',
    activeSidePanel === 'clothing' ? 'true' : 'false',
  );
  searchToggle.setAttribute(
    'aria-expanded',
    activeSidePanel === 'search' ? 'true' : 'false',
  );
  settingsToggle.setAttribute(
    'aria-expanded',
    activeSidePanel === 'settings' ? 'true' : 'false',
  );
}

function setSidePanel(panel) {
  const next = activeSidePanel === panel ? null : panel;
  activeSidePanel = next;

  if (tourPanel) tourPanel.hidden = next !== 'tour';
  if (itineraryPanel) itineraryPanel.hidden = next !== 'itinerary';
  if (clothingPanel) clothingPanel.hidden = next !== 'clothing';
  if (searchPanel) searchPanel.hidden = next !== 'search';
  if (settingsPanel) settingsPanel.hidden = next !== 'settings';
  if (placePhotoCard) placePhotoCard.hidden = next !== 'place';
  syncMenuButtons();

  if (next === 'tour' && tourData && tourSelect?.value) {
    showTour(tourSelect.value, { fit: false });
  }
  if (next === 'itinerary') {
    loadMarkdownDoc({
      loadedKey: 'itinerary',
      url: ITINERARY_MD_URL,
      contentEl: itineraryContent,
      loadingText: '일정표를 불러오는 중…',
      errorText: '일정표를 불러오지 못했습니다. 파일을 확인하세요.',
    });
  }
  if (next === 'clothing') {
    loadMarkdownDoc({
      loadedKey: 'clothing',
      url: CLOTHING_MD_URL,
      contentEl: clothingContent,
      loadingText: '복장가이드를 불러오는 중…',
      errorText: '복장가이드를 불러오지 못했습니다. 파일을 확인하세요.',
    });
  }
  if (next === 'search') {
    placeQuery.focus();
  }
  if (next === 'place') {
    renderPlacePhotoPanel();
  }
  if (next !== 'place') {
    activePhotoEntry = null;
    activePhotoName = '';
    activePhotoDetail = '';
    activePhotoIndex = 0;
  }
}

function setTourMenuOpen(open) {
  if (open) {
    if (activeSidePanel === 'tour') {
      syncMenuButtons();
      return;
    }
    activeSidePanel = null;
    setSidePanel('tour');
    return;
  }
  if (activeSidePanel === 'tour') setSidePanel(null);
}

function setSearchPanelOpen(open) {
  if (open) setSidePanel('search');
  else if (activeSidePanel === 'search') setSidePanel(null);
}

function setItineraryOpen(open) {
  if (open) setSidePanel('itinerary');
  else if (activeSidePanel === 'itinerary') setSidePanel(null);
}

function setClothingOpen(open) {
  if (open) setSidePanel('clothing');
  else if (activeSidePanel === 'clothing') setSidePanel(null);
}

function setSettingsOpen(open) {
  if (open) setSidePanel('settings');
  else if (activeSidePanel === 'settings') setSidePanel(null);
}

const markdownLoaded = {
  itinerary: false,
  clothing: false,
};

async function loadMarkdownDoc({
  loadedKey,
  url,
  contentEl,
  loadingText,
  errorText,
}) {
  if (markdownLoaded[loadedKey] || !contentEl) return;
  contentEl.innerHTML = `<p class="status">${loadingText}</p>`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markdown = await res.text();
    if (typeof marked === 'undefined') {
      contentEl.innerHTML = `<pre>${escapeHtml(markdown)}</pre>`;
    } else {
      marked.setOptions({ breaks: true, gfm: true });
      contentEl.innerHTML = marked.parse(markdown);
    }
    markdownLoaded[loadedKey] = true;
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = `<p class="status">${errorText}</p>`;
  }
}

tourToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('tour');
});

itineraryToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('itinerary');
});

clothingToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('clothing');
});

searchToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('search');
});

settingsToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('settings');
});

searchClose.addEventListener('click', () => {
  setSearchPanelOpen(false);
});

itineraryClose.addEventListener('click', () => {
  setItineraryOpen(false);
});

clothingClose.addEventListener('click', () => {
  setClothingOpen(false);
});

settingsClose.addEventListener('click', () => {
  setSettingsOpen(false);
});

placePhotoClose?.addEventListener('click', () => {
  hidePlacePhotoCard();
});

placePhotoPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
  stepPlacePhoto(-1);
});

placePhotoNext?.addEventListener('click', (e) => {
  e.stopPropagation();
  stepPlacePhoto(1);
});

placePhotoDots?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-photo-index]');
  if (!btn || !activePhotoEntry) return;
  activePhotoIndex = Number(btn.dataset.photoIndex) || 0;
  renderPlacePhotoPanel();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && activePhotoEntry && !placePhotoCard?.hidden) {
    stepPlacePhoto(-1);
    return;
  }
  if (e.key === 'ArrowRight' && activePhotoEntry && !placePhotoCard?.hidden) {
    stepPlacePhoto(1);
    return;
  }
  if (e.key !== 'Escape') return;
  setSidePanel(null);
  hidePlacePhotoCard();
});

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [ESRI_SATELLITE],
        tileSize: 256,
        attribution: 'Tiles © Esri',
      },
      topo: {
        type: 'raster',
        tiles: [ESRI_TOPO],
        tileSize: 256,
        attribution: 'Tiles © Esri',
      },
      terrarium: {
        type: 'raster-dem',
        tiles: [AWS_TERRARIUM],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
        attribution: 'AWS Terrain Tiles / Mapzen',
      },
    },
    layers: [
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
      },
      {
        id: 'topo',
        type: 'raster',
        source: 'topo',
        layout: { visibility: 'none' },
      },
    ],
    terrain: {
      source: 'terrarium',
      exaggeration: 1.5,
    },
    sky: {
      'atmosphere-blend': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0,
        1,
        5,
        0.6,
        10,
        0.2,
      ],
    },
  },
  center: [TRIP_START.lng, TRIP_START.lat],
  zoom: 13.5,
  pitch: 55,
  bearing: -30,
  maxPitch: 85,
  hash: false,
});

map.addControl(new maplibregl.ScaleControl({ maxWidth: 140 }), 'bottom-left');
map.dragRotate.enable();
map.touchZoomRotate.enableRotation();
const measure = createMeasureTool(map, {
  onUpdate({ points, totalMeters }) {
    if (!points.length) {
      measureResult.textContent = '지도를 클릭해 지점을 추가하세요.';
      return;
    }
    measureResult.textContent = `지점 ${points.length}개 · 총 ${formatDistance(totalMeters)}`;
  },
});

const tour = createPathTour(map);

async function loadPhotoManifest() {
  try {
    const res = await fetch('photos/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    photoManifest = await res.json();
  } catch (err) {
    console.warn('photo manifest load failed', err);
    photoManifest = { places: {} };
  }
}

function resolvePlacePhoto(name) {
  if (!photoManifest?.places || !name) return null;
  const places = photoManifest.places;
  if (places[name]) return places[name];
  const short = String(name).split('(')[0].trim();
  if (places[short]) return places[short];
  for (const [key, entry] of Object.entries(places)) {
    if (name.includes(key) || key.includes(short)) return entry;
  }
  return null;
}

function hidePlacePhotoCard() {
  if (activeSidePanel === 'place') {
    setSidePanel(null);
    return;
  }
  if (placePhotoCard) placePhotoCard.hidden = true;
  activePhotoEntry = null;
  activePhotoName = '';
  activePhotoDetail = '';
  activePhotoIndex = 0;
}

function renderPlacePhotoPanel() {
  if (!activePhotoEntry?.images?.length || !placePhotoImg) return;
  const images = activePhotoEntry.images;
  const idx = ((activePhotoIndex % images.length) + images.length) % images.length;
  activePhotoIndex = idx;
  const src = encodeURI(images[idx]);
  placePhotoImg.src = src;
  placePhotoImg.alt = `${activePhotoName} ${idx + 1}/${images.length}`;
  if (placePhotoHeading) placePhotoHeading.textContent = activePhotoName || '장소 사진';
  if (placePhotoDetail) {
    placePhotoDetail.textContent = activePhotoDetail || '';
    placePhotoDetail.hidden = !activePhotoDetail;
  }
  placePhotoTitle.textContent = `사진 ${idx + 1} / ${images.length}`;
  const sources = activePhotoEntry.sources || [];
  const source = sources[idx] || activePhotoEntry.source;
  placePhotoCredit.textContent = source
    ? `출처: ${String(source).replace(/^File:/, '')}`
    : photoManifest?.attribution || '';

  if (placePhotoDots) {
    placePhotoDots.innerHTML = images
      .map(
        (_, i) =>
          `<button type="button" class="place-photo-dot${i === idx ? ' active' : ''}" data-photo-index="${i}" aria-label="사진 ${i + 1}"></button>`,
      )
      .join('');
  }

  const multi = images.length > 1;
  if (placePhotoPrev) placePhotoPrev.hidden = !multi;
  if (placePhotoNext) placePhotoNext.hidden = !multi;
  if (placePhotoDots) placePhotoDots.hidden = !multi;
}

function openPlacePhotoPanel(name, detail, entry) {
  if (!entry?.images?.length) return;
  activePhotoEntry = entry;
  activePhotoName = name;
  activePhotoDetail = detail || '';
  activePhotoIndex = 0;
  if (activeSidePanel === 'place') {
    renderPlacePhotoPanel();
    return;
  }
  activeSidePanel = null;
  setSidePanel('place');
}

function stepPlacePhoto(delta) {
  if (!activePhotoEntry?.images?.length) return;
  activePhotoIndex += delta;
  renderPlacePhotoPanel();
}

function placePopupHtml(name, detail, photoName = name) {
  const entry = resolvePlacePhoto(photoName);
  const count = entry?.images?.length || 0;
  const photo = count
    ? `<img class="place-photo-thumb" src="${encodeURI(entry.images[0])}" alt="${escapeHtml(name)}" loading="lazy" /><em class="place-photo-count">사진 ${count}장 · 클릭하여 자세히 보기</em>`
    : '';
  return `<div class="place-popup-hit" role="button" tabindex="0">${
    `<strong>${escapeHtml(name)}</strong>${photo}<span>${escapeHtml(detail || '')}</span>`
  }</div>`;
}

function bindPlacePopupClick(popup, name, detail) {
  const attach = () => {
    const root = popup.getElement();
    const hit = root?.querySelector('.place-popup-hit');
    if (!hit || hit.dataset.bound === '1') return;
    hit.dataset.bound = '1';
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entry = resolvePlacePhoto(name);
      if (entry) openPlacePhotoPanel(name, detail, entry);
    };
    hit.addEventListener('click', open);
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  };
  popup.on('open', attach);
  if (popup.isOpen?.()) attach();
}

function ensurePlacePopupOpen() {
  if (!currentMarker) return;
  const popup = currentMarker.getPopup();
  if (!popup) return;
  if (!popup.isOpen()) currentMarker.togglePopup();
}

function closeStopMarkerPopups() {
  stopMarkers.forEach((marker) => {
    const popup = marker.getPopup?.();
    if (popup?.isOpen?.()) marker.togglePopup();
  });
}

function setPlaceMarker({ lng, lat, name, detail, openPopup = true }) {
  closeStopMarkerPopups();
  if (currentMarker) currentMarker.remove();

  const info = detail || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const popup = new maplibregl.Popup({
    offset: 22,
    closeButton: false,
    closeOnClick: false,
    closeOnMove: false,
    maxWidth: '280px',
    className: 'place-info-popup',
    focusAfterOpen: false,
  }).setHTML(placePopupHtml(name, info));
  bindPlacePopupClick(popup, name, info);

  currentMarker = new maplibregl.Marker({ color: '#0f6e56' })
    .setLngLat([lng, lat])
    .setPopup(popup)
    .addTo(map);

  if (openPopup) {
    currentMarker.togglePopup();
    requestAnimationFrame(() => ensurePlacePopupOpen());
  }
  latInput.value = String(lat);
  lngInput.value = String(lng);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function flyToPlace({ lng, lat, name, detail }) {
  setPlaceMarker({ lng, lat, name, detail, openPopup: true });

  const reopen = () => {
    ensurePlacePopupOpen();
  };
  map.once('moveend', reopen);
  // Safety: flyTo can be interrupted; keep bubble visible
  setTimeout(reopen, 500);
  setTimeout(reopen, 2000);

  map.flyTo({
    center: [lng, lat],
    zoom: Math.max(map.getZoom(), 14.5),
    pitch: is3d ? 62 : 0,
    essential: true,
    duration: 1800,
  });
}

function applyExaggeration(value) {
  exaggeration = value;
  exaggerationValue.textContent = `${value.toFixed(1)}×`;
  if (is3d) {
    map.setTerrain({ source: 'terrarium', exaggeration: value });
  }
}

function setBasemap(mode) {
  const showSatellite = mode === 'satellite';
  map.setLayoutProperty(
    'satellite',
    'visibility',
    showSatellite ? 'visible' : 'none',
  );
  map.setLayoutProperty('topo', 'visibility', showSatellite ? 'none' : 'visible');
  document.querySelectorAll('[data-basemap]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.basemap === mode);
  });
}

function set3dMode(next) {
  is3d = next;
  btnToggle3d.classList.toggle('active', is3d);
  btnToggle3d.textContent = is3d ? '3D' : '2D';
  if (is3d) {
    map.setTerrain({ source: 'terrarium', exaggeration });
    map.easeTo({ pitch: 62, duration: 700 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }
}

async function searchPlace(query) {
  const q = query.trim();
  if (!q) {
    searchStatus.textContent = '검색어를 입력하세요.';
    return;
  }

  searchStatus.textContent = '검색 중…';
  searchResults.innerHTML = '';

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    searchStatus.textContent = '검색에 실패했습니다. 잠시 후 다시 시도하세요.';
    return;
  }

  const data = await res.json();
  if (!data.length) {
    searchStatus.textContent = '결과를 찾지 못했습니다.';
    return;
  }

  searchStatus.textContent = `${data.length}건 결과`;
  data.forEach((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.display_name;
    button.addEventListener('click', () => {
      flyToPlace({
        lng: Number(item.lon),
        lat: Number(item.lat),
        name: item.display_name.split(',')[0],
        detail: item.display_name,
      });
    });
    li.appendChild(button);
    searchResults.appendChild(li);
  });

  const first = data[0];
  flyToPlace({
    lng: Number(first.lon),
    lat: Number(first.lat),
    name: first.display_name.split(',')[0],
    detail: first.display_name,
  });
}

function addTourLayers() {
  map.addSource('tour-route', {
    type: 'geojson',
    data: emptyCollection(),
  });
  map.addSource('tour-stops', {
    type: 'geojson',
    data: emptyCollection(),
  });

  map.addLayer({
    id: 'tour-route-glow',
    type: 'line',
    source: 'tour-route',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#4cc9f0'],
      'line-width': 10,
      'line-opacity': 0.28,
      'line-blur': 1.2,
    },
  });
  map.addLayer({
    id: 'tour-route-line',
    type: 'line',
    source: 'tour-route',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#2563eb'],
      'line-width': 4.5,
      'line-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'tour-stop-circles',
    type: 'circle',
    source: 'tour-stops',
    paint: {
      'circle-radius': 7,
      'circle-color': '#ffffff',
      'circle-stroke-width': 3,
      'circle-stroke-color': ['coalesce', ['get', 'color'], '#1d4f91'],
    },
  });
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function getRouteFeature(tourId) {
  return (
    tourData?.features.find(
      (f) => f.properties.kind === 'route' && f.properties.id === tourId,
    ) ?? null
  );
}

function getChildRoutes(route) {
  const ids = route?.properties?.child_ids;
  if (!ids?.length) return route ? [route] : [];
  return ids.map(getRouteFeature).filter(Boolean);
}

function getStopFeatures(tourId) {
  const route = getRouteFeature(tourId);
  if (route?.properties?.is_all) {
    const ids = route.properties.child_ids ?? [];
    return ids.flatMap((id) =>
      (tourData?.features ?? [])
        .filter(
          (f) => f.properties.kind === 'stop' && f.properties.tour_id === id,
        )
        .sort((a, b) => a.properties.order - b.properties.order),
    );
  }
  return (
    tourData?.features
      .filter(
        (f) => f.properties.kind === 'stop' && f.properties.tour_id === tourId,
      )
      .sort((a, b) => a.properties.order - b.properties.order) ?? []
  );
}

function getTourPathFeature(tourId) {
  const route = getRouteFeature(tourId);
  if (!route) return null;
  if (!route.properties.is_all) return route;
  const children = getChildRoutes(route);
  return {
    type: 'Feature',
    properties: route.properties,
    geometry: {
      type: 'MultiLineString',
      coordinates: children.map((c) => c.geometry.coordinates),
    },
  };
}

function clearStopMarkers() {
  stopMarkers.forEach((m) => m.remove());
  stopMarkers = [];
}

function showTour(tourId, { fit = true } = {}) {
  const route = getRouteFeature(tourId);
  if (!route) return;

  const routes = getChildRoutes(route);
  const stops = getStopFeatures(tourId);
  activeTourId = tourId;

  map.getSource('tour-route').setData({
    type: 'FeatureCollection',
    features: routes,
  });
  map.getSource('tour-stops').setData({
    type: 'FeatureCollection',
    features: stops,
  });

  clearStopMarkers();
  stops.forEach((stop) => {
    const color = stop.properties.color || '#1d4f91';
    const el = document.createElement('div');
    el.className = 'stop-marker';
    el.style.background = color;
    el.textContent = String(stop.properties.order);
    const detail = [stop.properties.time, stop.properties.detail, stop.properties.note]
      .filter(Boolean)
      .join(' · ');
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(stop.geometry.coordinates)
      .addTo(map);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tour.isRunning()) {
        tour.stop();
        syncTourButtons(false);
      }
      flyToPlace({
        lng: stop.geometry.coordinates[0],
        lat: stop.geometry.coordinates[1],
        name: stop.properties.name,
        detail,
      });
    });
    stopMarkers.push(marker);
  });

  const totalKm = routes.reduce(
    (sum, r) => sum + Number(r.properties.distance_km || 0),
    0,
  );
  tourInfo.hidden = false;
  tourInfoTitle.textContent = route.properties.name;
  const dateLine = route.properties.date ? `${route.properties.date} · ` : '';
  tourInfoStats.textContent = `${dateLine}표시 경로 = ${totalKm.toFixed(1)} km · ${routes.length} 구간 · 경유지 ${stops.length}곳`;
  tourInfoDesc.textContent = route.properties.description || '';
  tourInfoDesc.hidden = !route.properties.description;

  const metaEl = document.getElementById('tour-meta');
  if (metaEl) {
    const blocks = [];
    if (route.properties.flight) {
      blocks.push(`<div><strong>항공</strong><span>${escapeHtml(route.properties.flight)}</span></div>`);
    }
    if (route.properties.meals) {
      const m = route.properties.meals;
      if (m.summary) {
        blocks.push(`<div><strong>식사</strong><span>${escapeHtml(m.summary)}</span></div>`);
      } else {
        blocks.push(
          `<div><strong>식사</strong><span>조 ${escapeHtml(m.breakfast || '—')} · 중 ${escapeHtml(m.lunch || '—')} · 석 ${escapeHtml(m.dinner || '—')}</span></div>`,
        );
      }
    }
    if (route.properties.hotel) {
      blocks.push(`<div><strong>숙박</strong><span>${escapeHtml(route.properties.hotel)}</span></div>`);
    }
    if (route.properties.highlight) {
      blocks.push(`<div><strong>하이라이트</strong><span>${escapeHtml(route.properties.highlight)}</span></div>`);
    }
    if (route.properties.product) {
      blocks.push(`<div><strong>상품</strong><span>${escapeHtml(route.properties.product)}</span></div>`);
    }
    metaEl.hidden = blocks.length === 0;
    metaEl.innerHTML = blocks.join('');
  }

  const legend = document.getElementById('tour-legend');
  if (legend) {
    if (routes.length > 1 || route.properties.is_all) {
      legend.hidden = false;
      legend.innerHTML = routes
        .map(
          (r) =>
            `<span class="legend-item"><i style="background:${escapeHtml(r.properties.color || '#2563eb')}"></i>${escapeHtml(r.properties.day_label || r.properties.name)}</span>`,
        )
        .join('');
    } else {
      legend.hidden = false;
      legend.innerHTML = `<span class="legend-item"><i style="background:${escapeHtml(route.properties.color || '#2563eb')}"></i>${escapeHtml(route.properties.day_label || '경로')}</span>`;
    }
  }

  tourStops.innerHTML = '';
  stops.forEach((stop) => {
    const color = stop.properties.color || '#1d4f91';
    const day = stop.properties.day_label
      ? `<em>${escapeHtml(stop.properties.day_label)}</em> `
      : '';
    const time = stop.properties.time
      ? `<span class="stop-time">${escapeHtml(stop.properties.time)}</span>`
      : '';
    const note = stop.properties.note
      ? `<span class="stop-note">${escapeHtml(stop.properties.note)}</span>`
      : '';
    const li = document.createElement('li');
    const photoEntry = resolvePlacePhoto(stop.properties.name);
    const thumb = photoEntry?.images?.[0]
      ? `<img class="stop-thumb" src="${encodeURI(photoEntry.images[0])}" alt="" loading="lazy" />`
      : '';
    li.innerHTML = `
      <span class="stop-index" style="background:${escapeHtml(color)}">${stop.properties.order}</span>
      <div>
        <strong>${day}${escapeHtml(stop.properties.name)}</strong>
        ${time}
        <span>${escapeHtml(stop.properties.detail || '')}</span>
        ${note}
        ${thumb}
      </div>
    `;
    li.addEventListener('click', () => {
      if (tour.isRunning()) {
        tour.stop();
        syncTourButtons(false);
      }
      document
        .querySelectorAll('#tour-stops li.active')
        .forEach((node) => node.classList.remove('active'));
      li.classList.add('active');
      const [lng, lat] = stop.geometry.coordinates;
      flyToPlace({
        lng,
        lat,
        name: stop.properties.name,
        detail: [stop.properties.time, stop.properties.detail, stop.properties.note]
          .filter(Boolean)
          .join(' · '),
      });
    });
    tourStops.appendChild(li);
  });

  if (fit) fitTourBounds(routes, stops);
}

function fitTourBounds(routesOrRoute, stops) {
  const routes = Array.isArray(routesOrRoute)
    ? routesOrRoute
    : [routesOrRoute];
  const bounds = new maplibregl.LngLatBounds();
  routes.forEach((route) => {
    route?.geometry?.coordinates?.forEach((c) => bounds.extend(c));
  });
  stops.forEach((s) => bounds.extend(s.geometry.coordinates));
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, {
    padding: { top: 120, bottom: 80, left: 420, right: 80 },
    pitch: is3d ? 55 : 0,
    bearing: -18,
    duration: 1600,
    maxZoom: routeSelect.value === 'hokkaido-all' ? 9.5 : 12.5,
  });
}

function selectedRouteFeature() {
  return getTourPathFeature(tourSelect.value);
}

function syncTourButtons(running) {
  tourStart.hidden = running;
  tourStop.hidden = !running;
  if (tourStopFloat) tourStopFloat.hidden = !running;
}

function stopTourAndRevealPanel() {
  tour.stop();
  syncTourButtons(false);
  setTourMenuOpen(true);
}

map.on('load', async () => {
  addTourLayers();
  await loadPhotoManifest();

  setPlaceMarker({
    lng: TRIP_START.lng,
    lat: TRIP_START.lat,
    name: TRIP_START.name,
    detail: TRIP_START.detail,
  });

  try {
    const cfg = window.APP_CONFIG || {};
    const toursUrl =
      cfg.apiToursUrl ||
      `data/tours.geojson?v=20260313-hide-package-meta`;
    const res = await fetch(toursUrl, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tourData = await res.json();
    populateTourSelect();
    tourSelect.value = 'hokkaido-all';
    setTourMenuOpen(true);
  } catch (err) {
    console.error(err);
    searchStatus.textContent = '투어 경로 데이터를 불러오지 못했습니다.';
    setTourMenuOpen(true);
  }
});

function populateTourSelect() {
  const routes =
    tourData?.features.filter((f) => f.properties.kind === 'route') ?? [];
  const previous = tourSelect.value;
  tourSelect.innerHTML = '';
  routes.forEach((route) => {
    const option = document.createElement('option');
    option.value = route.properties.id;
    option.textContent = route.properties.name;
    tourSelect.appendChild(option);
  });
  if ([...tourSelect.options].some((o) => o.value === previous)) {
    tourSelect.value = previous;
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  searchPlace(placeQuery.value).catch((err) => {
    console.error(err);
    searchStatus.textContent = '검색 중 오류가 발생했습니다.';
  });
});

coordsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    searchStatus.textContent = '유효한 위도/경도를 입력하세요.';
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    searchStatus.textContent = '위도(-90~90), 경도(-180~180) 범위를 확인하세요.';
    return;
  }
  flyToPlace({
    lng,
    lat,
    name: '선택한 좌표',
    detail: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
  });
});

exaggerationInput.addEventListener('input', () => {
  applyExaggeration(Number(exaggerationInput.value));
});

document.querySelectorAll('[data-basemap]').forEach((btn) => {
  btn.addEventListener('click', () => setBasemap(btn.dataset.basemap));
});

measureToggle.addEventListener('click', () => {
  const next = !measure.isEnabled();
  measure.setEnabled(next);
  measureToggle.classList.toggle('active', next);
  measureToggle.textContent = next ? '측정 중…' : '측정 시작';
});

measureClear.addEventListener('click', () => {
  measure.clear();
});

tourSelect.addEventListener('change', () => {
  tour.stop();
  syncTourButtons(false);
  showTour(tourSelect.value, { fit: true });
});

tourFit.addEventListener('click', () => {
  const route = getRouteFeature(tourSelect.value);
  const routes = getChildRoutes(route);
  const stops = getStopFeatures(tourSelect.value);
  if (routes.length) fitTourBounds(routes, stops);
});

tourStart.addEventListener('click', () => {
  const feature = selectedRouteFeature();
  const stopFeatures = getStopFeatures(tourSelect.value);
  if (!feature && !stopFeatures.length) {
    searchStatus.textContent = '투어 경로가 없습니다.';
    return;
  }
  showTour(tourSelect.value, { fit: false });
  if (!is3d) set3dMode(true);
  syncTourButtons(true);
  setSidePanel(null);

  const stops = stopFeatures.map((s) => {
    const [lng, lat] = s.geometry.coordinates;
    const day = s.properties.day_label ? `${s.properties.day_label} · ` : '';
    return {
      lng,
      lat,
      name: s.properties.name,
      displayName: `${day}${s.properties.name}`,
      detail: [s.properties.time, s.properties.detail, s.properties.note]
        .filter(Boolean)
        .join(' · '),
      zoom: tourSelect.value === 'hokkaido-all' ? 11.2 : 13.4,
    };
  });

  tour.start(feature, {
    stops,
    zoom: tourSelect.value === 'hokkaido-all' ? 11.2 : 13.4,
    pitch: 58,
    flyMs: tourSelect.value === 'hokkaido-all' ? 2000 : 2400,
    dwellMs: tourSelect.value === 'hokkaido-all' ? 2600 : 3200,
    onArrive(stop) {
      setPlaceMarker({
        lng: stop.lng,
        lat: stop.lat,
        name: stop.name,
        detail: stop.detail,
        openPopup: true,
      });
      ensurePlacePopupOpen();
    },
    onDone() {
      syncTourButtons(false);
      setTourMenuOpen(true);
    },
  });
});

tourStop.addEventListener('click', () => {
  stopTourAndRevealPanel();
});

tourStopFloat?.addEventListener('click', () => {
  stopTourAndRevealPanel();
});

btnResetNorth.addEventListener('click', () => {
  map.easeTo({ bearing: 0, duration: 500 });
});

btnZoomIn.addEventListener('click', () => {
  map.zoomIn({ duration: 300 });
});

btnZoomOut.addEventListener('click', () => {
  map.zoomOut({ duration: 300 });
});

btnToggle3d.addEventListener('click', () => {
  set3dMode(!is3d);
});
