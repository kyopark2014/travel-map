import { createMeasureTool, formatDistance } from './measure.js';
import { createPathTour } from './tour.js?v=20260313-stop-bubbles';
import {
  initTranslateDb,
  insertTranslation,
  listTranslations,
} from './translate-db.js';

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
const placePhotoStage = document.querySelector('.place-photo-stage');
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
const tourClose = document.getElementById('tour-close');
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
const translateToggle = document.getElementById('translate-toggle');
const translatePanel = document.getElementById('translate-panel');
const translateClose = document.getElementById('translate-close');
const translateRecord = document.getElementById('translate-record');
const translateStatus = document.getElementById('translate-status');
const translateLog = document.getElementById('translate-log');
const translateKojaToggle = document.getElementById('translate-koja-toggle');
const translateKojaPanel = document.getElementById('translate-koja-panel');
const translateKojaClose = document.getElementById('translate-koja-close');
const translateKojaRecord = document.getElementById('translate-koja-record');
const translateKojaStatus = document.getElementById('translate-koja-status');
const translateKojaLog = document.getElementById('translate-koja-log');
const translateKojaModeMic = document.getElementById('translate-koja-mode-mic');
const translateKojaModeKeyboard = document.getElementById(
  'translate-koja-mode-keyboard',
);
const translateKojaHint = document.getElementById('translate-koja-hint');
const translateKojaMicWrap = document.getElementById('translate-koja-mic-wrap');
const translateKojaKeyboard = document.getElementById('translate-koja-keyboard');
const translateKojaInput = document.getElementById('translate-koja-input');
const translateKojaSubmit = document.getElementById('translate-koja-submit');
const btnResetNorth = document.getElementById('btn-reset-north');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnToggleBasemap = document.getElementById('btn-toggle-basemap');
const btnToggle3d = document.getElementById('btn-toggle-3d');
const btnCurrentLocation = document.getElementById('btn-current-location');

const ITINERARY_MD_URL = 'data/hokkaido-itinerary-20261008.md';
const CLOTHING_MD_URL = 'data/hokkaido-weather-clothing-20261008.md';

let currentMarker = null;
let stopMarkers = [];
let is3d = true;
let currentBasemap = 'satellite';
let tourData = null;
let activeTourId = null;
let exaggeration = 1.5;
/** @type {null | 'tour' | 'itinerary' | 'clothing' | 'search' | 'settings' | 'place' | 'translate' | 'translate-koja'} */
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
  translateToggle?.setAttribute(
    'aria-expanded',
    activeSidePanel === 'translate' ? 'true' : 'false',
  );
  translateKojaToggle?.setAttribute(
    'aria-expanded',
    activeSidePanel === 'translate-koja' ? 'true' : 'false',
  );
}

function setSidePanel(panel) {
  const prev = activeSidePanel;
  const next = activeSidePanel === panel ? null : panel;
  activeSidePanel = next;

  if (tourPanel) tourPanel.hidden = next !== 'tour';
  if (itineraryPanel) itineraryPanel.hidden = next !== 'itinerary';
  if (clothingPanel) clothingPanel.hidden = next !== 'clothing';
  if (searchPanel) searchPanel.hidden = next !== 'search';
  if (settingsPanel) settingsPanel.hidden = next !== 'settings';
  if (translatePanel) translatePanel.hidden = next !== 'translate';
  if (translateKojaPanel) translateKojaPanel.hidden = next !== 'translate-koja';
  if (placePhotoCard) placePhotoCard.hidden = next !== 'place';
  syncMenuButtons();

  const leavingTranslate =
    (prev === 'translate' || prev === 'translate-koja') &&
    next !== 'translate' &&
    next !== 'translate-koja';
  const switchingTranslate =
    (prev === 'translate' && next === 'translate-koja') ||
    (prev === 'translate-koja' && next === 'translate');
  if (leavingTranslate || switchingTranslate) {
    kojaHoldActive = false;
    kojaPointerId = null;
    translateListening = false;
    stopTranslateRecording({ silent: true, releaseStream: true }).catch(() => {});
  }

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
  if (next === 'translate') {
    activeTranslateDirection = 'ja2ko';
    loadTranslateHistory('ja2ko').catch((err) => console.error(err));
  }
  if (next === 'translate-koja') {
    activeTranslateDirection = 'ko2ja';
    setKojaInputMode(kojaInputMode);
    loadTranslateHistory('ko2ja').catch((err) => console.error(err));
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

function setTranslateOpen(open) {
  if (open) setSidePanel('translate');
  else if (activeSidePanel === 'translate') setSidePanel(null);
}

function setTranslateKojaOpen(open) {
  if (open) setSidePanel('translate-koja');
  else if (activeSidePanel === 'translate-koja') setSidePanel(null);
}

const markdownLoaded = {
  itinerary: false,
  clothing: false,
};

/** GitHub Flavored Markdown heading id (github-slugger style). */
function githubHeadingSlug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function enhanceMarkdownAnchors(contentEl) {
  if (!contentEl) return;
  const used = new Map();
  contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const base = githubHeadingSlug(heading.textContent || '') || 'section';
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    heading.id = id;
  });

  if (contentEl.dataset.tocBound === '1') return;
  contentEl.dataset.tocBound = '1';
  contentEl.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || !contentEl.contains(link)) return;
    const raw = link.getAttribute('href') || '';
    if (raw === '#' || raw.length < 2) return;
    e.preventDefault();
    let id = raw.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    const target =
      contentEl.querySelector(`#${CSS.escape(id)}`) ||
      document.getElementById(id);
    if (!target || !contentEl.contains(target)) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

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
      enhanceMarkdownAnchors(contentEl);
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

translateToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('translate');
});

translateKojaToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidePanel('translate-koja');
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

translateClose?.addEventListener('click', () => {
  setTranslateOpen(false);
});

translateKojaClose?.addEventListener('click', () => {
  setTranslateKojaOpen(false);
});

/* ---------- Speech translate: 일한 (ja2ko) / 한일 (ko2ja + Polly) ---------- */
const TRANSLATE_SEGMENT_MS = 6000;
/** @type {'ja2ko' | 'ko2ja'} */
let activeTranslateDirection = 'ja2ko';
/** @type {'mic' | 'keyboard'} */
let kojaInputMode = 'mic';
let translateMediaStream = null;
let translateRecorder = null;
let translateChunks = [];
let translateSegmentTimer = null;
let translateListening = false;
let translateBusy = false;
let translatePendingRestart = false;
/** @type {HTMLAudioElement | null} */
let translateSpeakAudio = null;

function translateUi(direction = activeTranslateDirection) {
  if (direction === 'ko2ja') {
    return {
      direction: 'ko2ja',
      record: translateKojaRecord,
      status: translateKojaStatus,
      log: translateKojaLog,
    };
  }
  return {
    direction: 'ja2ko',
    record: translateRecord,
    status: translateStatus,
    log: translateLog,
  };
}

function setTranslateStatus(message, direction = activeTranslateDirection) {
  const ui = translateUi(direction);
  if (ui.status) ui.status.textContent = message;
}

function setTranslateListeningUi(listening) {
  translateListening = listening;
  const ui = translateUi();
  if (!ui.record) return;
  ui.record.classList.toggle('recording', listening);
  if (ui.direction === 'ko2ja') {
    ui.record.setAttribute(
      'aria-label',
      listening ? '말하는 중 (손을 떼면 번역)' : '누르고 말하기',
    );
    ui.record.title = listening ? '손을 떼면 번역' : '누르고 말하기';
    return;
  }
  ui.record.setAttribute(
    'aria-label',
    listening ? '실시간 통역 중지' : '실시간 통역 시작',
  );
  ui.record.title = listening ? '통역 중지' : '통역 시작';
}

function renderTranslateEmpty(direction = activeTranslateDirection) {
  const ui = translateUi(direction);
  if (!ui.log) return;
  const hint =
    direction === 'ko2ja'
      ? '마이크를 누른 채 말하면, 손을 뗀 뒤 일본어·발음이 여기에 쌓입니다. 마이크 버튼으로 들을 수 있습니다.'
      : '통역 결과가 여기에 쌓입니다. 스크롤로 이전 내용을 볼 수 있습니다.';
  ui.log.innerHTML = `<p class="translate-empty">${hint}</p>`;
}

function clearKojaSelection(except = null) {
  translateKojaLog?.querySelectorAll('.translate-segment.selected').forEach((el) => {
    if (el !== except) el.classList.remove('selected');
  });
}

const SPEAK_ICON =
  '<svg class="speak-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

function normalizeKojaFields({ korean = '', japanese = '', pronunciation = '' }) {
  let ja = String(japanese || '').trim();
  let pron = String(pronunciation || '').trim();
  const ko = String(korean || '').trim();

  const splitPron = (value) => {
    const m = String(value || '').match(
      /([\s\S]*?)(?:\n|^|\s)(?:발음|發音)\s*[:：]\s*([\s\S]+)$/m,
    );
    if (!m) return { text: String(value || '').trim(), pron: '' };
    return { text: m[1].trim(), pron: m[2].trim() };
  };

  const fromJa = splitPron(ja);
  if (fromJa.pron) {
    ja = fromJa.text;
    if (!pron) pron = fromJa.pron;
  }

  pron = pron
    .replace(/^(?:발음|發音|Pron(?:unciation)?)\s*[:：]\s*/i, '')
    .trim();

  // Remove duplicate pronunciation lines from Japanese body
  if (pron) {
    ja = ja
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        const bare = line.replace(/^(?:발음|發音)\s*[:：]\s*/i, '').trim();
        return bare !== pron && line !== `발음: ${pron}` && line !== `발음：${pron}`;
      })
      .join('\n')
      .trim();
  }

  return { korean: ko, japanese: ja, pronunciation: pron };
}

function appendTranslateSegment(
  { direction = 'ja2ko', korean, japanese, pronunciation, createdAt },
  { scroll = true, prepend = false } = {},
) {
  const ui = translateUi(direction);
  if (!ui.log) return;
  const empty = ui.log.querySelector('.translate-empty');
  if (empty) empty.remove();

  const card = document.createElement('article');
  card.className =
    direction === 'ko2ja'
      ? 'translate-segment translate-bilingual'
      : 'translate-segment';

  if (direction === 'ko2ja') {
    const normalized = normalizeKojaFields({
      korean,
      japanese,
      pronunciation,
    });
    const jaText = normalized.japanese;
    const pronText = normalized.pronunciation;
    const koText = normalized.korean;

    const ko = document.createElement('p');
    ko.className = 'translate-ko';
    ko.textContent = koText || '(한국어 원문 없음)';
    card.append(ko);

    const row = document.createElement('div');
    row.className = 'translate-ja-row';

    const block = document.createElement('div');
    block.className = 'translate-ja-block';
    const ja = document.createElement('p');
    ja.className = 'translate-ja';
    ja.textContent = jaText || '(일본어 번역 없음)';
    const pron = document.createElement('p');
    pron.className = 'translate-pronunciation';
    pron.textContent = pronText;
    if (!pronText) pron.hidden = true;
    block.append(ja, pron);

    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'speak-btn';
    speakBtn.title = '일본어 듣기 (Amazon Polly)';
    speakBtn.setAttribute('aria-label', '일본어 듣기');
    speakBtn.disabled = !jaText;
    speakBtn.innerHTML = SPEAK_ICON;
    speakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.add('selected');
      clearKojaSelection(card);
      speakJapanese(jaText, speakBtn).catch((err) => console.error(err));
    });

    row.append(block, speakBtn);
    card.append(row);

    card.addEventListener('click', () => {
      card.classList.add('selected');
      clearKojaSelection(card);
    });
    card.dataset.japanese = jaText;
    card.dataset.pronunciation = pronText;

    if (prepend) ui.log.prepend(card);
    else ui.log.appendChild(card);
    if (scroll) ui.log.scrollTop = ui.log.scrollHeight;
    return { speakBtn, japanese: jaText };
  }

  const ko = document.createElement('p');
  ko.className = 'translate-ko';
  ko.textContent = korean || '(한국어 번역 없음)';
  card.append(ko);

  if (prepend) ui.log.prepend(card);
  else ui.log.appendChild(card);
  if (scroll) ui.log.scrollTop = ui.log.scrollHeight;
  return null;
}

async function loadTranslateHistory(direction = activeTranslateDirection) {
  const ui = translateUi(direction);
  try {
    await initTranslateDb();
    const rows = await listTranslations({ direction, limit: 500 });
    if (!ui.log) return;
    if (!rows.length) {
      renderTranslateEmpty(direction);
      return;
    }
    ui.log.innerHTML = '';
    rows.forEach((row) => {
      appendTranslateSegment(
        {
          direction,
          korean: row.korean,
          japanese: row.japanese,
          pronunciation: row.pronunciation,
          createdAt: row.createdAt,
        },
        { scroll: false },
      );
    });
    ui.log.scrollTop = ui.log.scrollHeight;
  } catch (err) {
    console.error(err);
    renderTranslateEmpty(direction);
    setTranslateStatus('이전 통역 기록을 불러오지 못했습니다.', direction);
  }
}

async function saveAndShowTranslation({
  direction = 'ja2ko',
  korean,
  japanese = '',
  pronunciation = '',
  modelId,
}) {
  let ko = String(korean || '').trim();
  let ja = String(japanese || '').trim();
  let pron = String(pronunciation || '').trim();
  if (direction === 'ko2ja') {
    const normalized = normalizeKojaFields({
      korean: ko,
      japanese: ja,
      pronunciation: pron,
    });
    ko = normalized.korean;
    ja = normalized.japanese;
    pron = normalized.pronunciation;
  }
  if (direction === 'ja2ko' && !ko) return null;
  if (direction === 'ko2ja' && !ko && !ja) return null;
  try {
    await insertTranslation({
      direction,
      korean: ko,
      japanese: ja,
      pronunciation: pron,
      modelId,
    });
  } catch (err) {
    console.error(err);
  }
  const shown = appendTranslateSegment({
    direction,
    korean: ko,
    japanese: ja,
    pronunciation: pron,
  });
  return {
    korean: ko,
    japanese: ja,
    pronunciation: pron,
    speakBtn: shown?.speakBtn || null,
  };
}

async function speakJapanese(text, button) {
  const value = String(text || '').trim();
  if (!value) {
    setTranslateStatus('읽을 일본어가 없습니다.', 'ko2ja');
    return;
  }
  const cfg = window.APP_CONFIG || {};
  const url =
    cfg.apiSpeakUrl ||
    (cfg.apiGatewayUrl
      ? `${String(cfg.apiGatewayUrl).replace(/\/$/, '')}/speak`
      : '');
  if (!url) {
    setTranslateStatus(
      '음성 API가 없습니다. installer로 배포한 뒤 이용해 주세요.',
      'ko2ja',
    );
    return;
  }

  if (button) button.disabled = true;
  setTranslateStatus('Amazon Polly로 읽는 중…', 'ko2ja');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value, language: 'ja' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTranslateStatus(
        data.detail || data.error || `음성 합성 실패 (HTTP ${res.status})`,
        'ko2ja',
      );
      return;
    }
    const audioB64 = data.audio || '';
    if (!audioB64) {
      setTranslateStatus('음성 데이터가 비어 있습니다.', 'ko2ja');
      return;
    }
    if (translateSpeakAudio) {
      translateSpeakAudio.pause();
      translateSpeakAudio = null;
    }
    const audio = new Audio(`data:audio/mpeg;base64,${audioB64}`);
    translateSpeakAudio = audio;
    await audio.play();
    setTranslateStatus('일본어를 재생했습니다.', 'ko2ja');
  } catch (err) {
    console.error(err);
    setTranslateStatus('일본어 재생 중 오류가 발생했습니다.', 'ko2ja');
  } finally {
    if (button) button.disabled = !value;
  }
}

function encodeWavFromAudioBuffer(audioBuffer) {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const length = decoded.length;
    const mono = audioCtx.createBuffer(1, length, decoded.sampleRate);
    const out = mono.getChannelData(0);
    const channelCount = decoded.numberOfChannels;
    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      for (let c = 0; c < channelCount; c += 1) {
        sum += decoded.getChannelData(c)[i];
      }
      out[i] = sum / channelCount;
    }
    return encodeWavFromAudioBuffer(mono);
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

function pickRecorderMimeType() {
  const mimeCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return (
    mimeCandidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || ''
  );
}

function clearTranslateSegmentTimer() {
  if (translateSegmentTimer) {
    clearTimeout(translateSegmentTimer);
    translateSegmentTimer = null;
  }
}

async function stopTranslateRecording({ silent = false, releaseStream = true } = {}) {
  clearTranslateSegmentTimer();
  const recorder = translateRecorder;
  translateRecorder = null;
  if (recorder && recorder.state !== 'inactive') {
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }
  if (releaseStream && translateMediaStream) {
    translateMediaStream.getTracks().forEach((t) => t.stop());
    translateMediaStream = null;
  }
  if (releaseStream) setTranslateListeningUi(false);
  if (!silent && releaseStream) {
    setTranslateStatus(listeningStoppedMessage());
  }
}

function listeningStoppedMessage() {
  return '통역을 중지했습니다. 스크롤로 이전 번역을 볼 수 있습니다.';
}

async function beginTranslateSegment() {
  if (!translateListening || !translateMediaStream) return;
  if (translateRecorder && translateRecorder.state !== 'inactive') return;

  const mimeType = pickRecorderMimeType();
  const isKojaHold = activeTranslateDirection === 'ko2ja';
  translateChunks = [];
  try {
    translateRecorder = mimeType
      ? new MediaRecorder(translateMediaStream, { mimeType })
      : new MediaRecorder(translateMediaStream);
  } catch (err) {
    console.error(err);
    setTranslateStatus('녹음을 시작할 수 없습니다.');
    await stopTranslateRecording({ silent: true });
    return;
  }

  const recordedMime = translateRecorder.mimeType || mimeType || 'audio/webm';
  translateRecorder.addEventListener('dataavailable', (e) => {
    if (e.data?.size) translateChunks.push(e.data);
  });
  translateRecorder.addEventListener('stop', () => {
    const recorded = new Blob(translateChunks, { type: recordedMime });
    translateChunks = [];
    if (isKojaHold) {
      if (recorded.size > 800) {
        submitTranslateAudio(recorded, { continueListening: false }).catch(
          (err) => {
            console.error(err);
            setTranslateStatus(
              '음성 변환 중 오류가 발생했습니다.',
              'ko2ja',
            );
          },
        );
      } else {
        setTranslateStatus(
          '말이 거의 감지되지 않았습니다. 마이크를 누른 채 다시 말해 주세요.',
          'ko2ja',
        );
      }
      return;
    }
    const shouldContinue = translateListening;
    if (recorded.size > 800) {
      submitTranslateAudio(recorded, { continueListening: shouldContinue }).catch(
        (err) => {
          console.error(err);
          setTranslateStatus('음성 변환 중 오류가 발생했습니다.');
          if (shouldContinue) scheduleNextTranslateSegment();
        },
      );
    } else if (shouldContinue) {
      scheduleNextTranslateSegment();
    }
  });

  translateRecorder.start(200);
  setTranslateStatus(
    isKojaHold
      ? '듣는 중… 한국어로 말씀해 주세요. (손을 떼면 번역)'
      : '듣는 중… 일본어로 말씀해 주세요.',
  );
  clearTranslateSegmentTimer();
  if (!isKojaHold) {
    translateSegmentTimer = setTimeout(() => {
      rotateTranslateSegment().catch((err) => console.error(err));
    }, TRANSLATE_SEGMENT_MS);
  }
}

async function rotateTranslateSegment() {
  if (!translateListening) return;
  if (activeTranslateDirection === 'ko2ja') return;
  const recorder = translateRecorder;
  if (!recorder || recorder.state === 'inactive') {
    await beginTranslateSegment();
    return;
  }
  // Keep mic stream; only cut the current segment.
  translateRecorder = null;
  clearTranslateSegmentTimer();
  await new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
    try {
      recorder.stop();
    } catch {
      resolve();
    }
  });
}

function scheduleNextTranslateSegment() {
  if (!translateListening) return;
  if (activeTranslateDirection === 'ko2ja') return;
  if (translateBusy) {
    translatePendingRestart = true;
    return;
  }
  beginTranslateSegment().catch((err) => console.error(err));
}

async function startTranslateListening(direction) {
  if (direction === 'ja2ko' || direction === 'ko2ja') {
    activeTranslateDirection = direction;
  }
  if (direction === 'ko2ja') {
    // 한일은 push-to-talk 전용
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setTranslateStatus('이 브라우저는 마이크 녹음을 지원하지 않습니다.');
    return;
  }
  if (translateListening) {
    await stopTranslateRecording({ releaseStream: true });
    return;
  }

  setTranslateStatus('마이크 권한을 요청하는 중…');
  try {
    translateMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
  } catch (err) {
    console.error(err);
    setTranslateStatus('마이크 권한이 필요합니다. 브라우저 설정을 확인해 주세요.');
    return;
  }

  setTranslateListeningUi(true);
  await beginTranslateSegment();
}

/** @type {number | null} */
let kojaPointerId = null;
let kojaHoldActive = false;

async function startKojaPushToTalk(event) {
  if (kojaInputMode !== 'mic') return;
  if (translateBusy || kojaHoldActive) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  activeTranslateDirection = 'ko2ja';
  if (!navigator.mediaDevices?.getUserMedia) {
    setTranslateStatus(
      '이 브라우저는 마이크 녹음을 지원하지 않습니다.',
      'ko2ja',
    );
    return;
  }

  kojaHoldActive = true;
  kojaPointerId = event.pointerId;
  try {
    translateKojaRecord?.setPointerCapture?.(event.pointerId);
  } catch {
    /* ignore */
  }

  setTranslateStatus('마이크 권한을 요청하는 중…', 'ko2ja');
  try {
    if (!translateMediaStream) {
      translateMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
    }
  } catch (err) {
    console.error(err);
    kojaHoldActive = false;
    kojaPointerId = null;
    setTranslateStatus(
      '마이크 권한이 필요합니다. 브라우저 설정을 확인해 주세요.',
      'ko2ja',
    );
    return;
  }

  if (!kojaHoldActive) {
    // Released before mic ready
    await stopTranslateRecording({ silent: true, releaseStream: true });
    return;
  }

  setTranslateListeningUi(true);
  await beginTranslateSegment();
}

async function endKojaPushToTalk(event) {
  if (!kojaHoldActive) return;
  if (
    event &&
    kojaPointerId != null &&
    event.pointerId != null &&
    event.pointerId !== kojaPointerId
  ) {
    return;
  }
  kojaHoldActive = false;
  kojaPointerId = null;
  translateListening = false;
  clearTranslateSegmentTimer();
  const recorder = translateRecorder;
  translateRecorder = null;
  setTranslateListeningUi(false);

  if (recorder && recorder.state !== 'inactive') {
    setTranslateStatus('한국어 → 일본어 번역 중…', 'ko2ja');
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  } else {
    setTranslateStatus(
      '마이크를 누른 채 말한 뒤 손을 떼 주세요.',
      'ko2ja',
    );
  }

  if (translateMediaStream) {
    translateMediaStream.getTracks().forEach((t) => t.stop());
    translateMediaStream = null;
  }
}

async function submitTranslateAudio(blob, { continueListening = false } = {}) {
  const direction = activeTranslateDirection;
  const cfg = window.APP_CONFIG || {};
  const url =
    cfg.apiTranscribeUrl ||
    (cfg.apiGatewayUrl
      ? `${String(cfg.apiGatewayUrl).replace(/\/$/, '')}/transcribe`
      : '');
  if (!url) {
    setTranslateStatus('변환 API가 없습니다. installer로 배포한 뒤 이용해 주세요.');
    if (continueListening) scheduleNextTranslateSegment();
    return;
  }

  translateBusy = true;
  setTranslateStatus(
    direction === 'ko2ja'
      ? '한국어 받아쓰기 → 일본어·발음 번역 중…'
      : '한국어로 번역하는 중…',
  );
  try {
    let wavBlob;
    try {
      wavBlob = await blobToWav(blob);
    } catch (err) {
      console.error(err);
      setTranslateStatus(
        direction === 'ko2ja'
          ? '오디오 변환에 실패했습니다. 다시 눌러 말해 주세요.'
          : '오디오 변환에 실패했습니다. 계속 듣는 중…',
      );
      return;
    }

    const audioBase64 = await blobToBase64(wavBlob);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: audioBase64,
        format: 'wav',
        direction,
        language: direction === 'ko2ja' ? 'ko' : 'ja',
        targetLanguage: direction === 'ko2ja' ? 'ja' : 'ko',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTranslateStatus(
        data.detail || data.error || `변환 실패 (HTTP ${res.status})`,
      );
      return;
    }

    if (direction === 'ko2ja') {
      const korean = (data.korean || '').trim();
      const japanese = (data.japanese || data.text || '').trim();
      const pronunciation = (data.pronunciation || '').trim();
      if (korean || japanese) {
        await saveAndShowTranslation({
          direction: 'ko2ja',
          korean,
          japanese,
          pronunciation,
          modelId: data.modelId,
        });
        setTranslateStatus(
          '번역 완료. 스피커 버튼을 눌러 일본어를 들으세요.',
          'ko2ja',
        );
      } else {
        setTranslateStatus(
          '음성을 인식하지 못했습니다. 다시 눌러 말해 주세요.',
          'ko2ja',
        );
      }
      return;
    }

    const korean = (data.korean || data.text || '').trim();
    if (korean) {
      await saveAndShowTranslation({
        direction: 'ja2ko',
        korean,
        modelId: data.modelId,
      });
      setTranslateStatus(
        continueListening
          ? '번역 반영됨. 계속 듣는 중…'
          : '번역이 완료되었습니다.',
      );
    } else {
      setTranslateStatus(
        continueListening
          ? '이번 구간은 말이 감지되지 않았습니다. 계속 듣는 중…'
          : '음성을 인식하지 못했습니다.',
      );
    }
  } finally {
    translateBusy = false;
    if (continueListening || translatePendingRestart) {
      translatePendingRestart = false;
      scheduleNextTranslateSegment();
    }
  }
}

translateRecord?.addEventListener('click', () => {
  startTranslateListening('ja2ko').catch((err) => {
    console.error(err);
    setTranslateStatus('통역 중 오류가 발생했습니다.', 'ja2ko');
  });
});

if (translateKojaRecord) {
  translateKojaRecord.classList.add('hold-mode');
  translateKojaRecord.addEventListener('pointerdown', (e) => {
    if (kojaInputMode !== 'mic') return;
    e.preventDefault();
    startKojaPushToTalk(e).catch((err) => {
      console.error(err);
      setTranslateStatus('통역 중 오류가 발생했습니다.', 'ko2ja');
    });
  });
  translateKojaRecord.addEventListener('pointerup', (e) => {
    if (kojaInputMode !== 'mic') return;
    e.preventDefault();
    endKojaPushToTalk(e).catch((err) => console.error(err));
  });
  translateKojaRecord.addEventListener('pointercancel', (e) => {
    endKojaPushToTalk(e).catch((err) => console.error(err));
  });
  translateKojaRecord.addEventListener('lostpointercapture', (e) => {
    endKojaPushToTalk(e).catch((err) => console.error(err));
  });
  translateKojaRecord.addEventListener('contextmenu', (e) => e.preventDefault());
}

function setKojaInputMode(mode) {
  kojaInputMode = mode === 'keyboard' ? 'keyboard' : 'mic';
  const isMic = kojaInputMode === 'mic';

  translateKojaModeMic?.classList.toggle('active', isMic);
  translateKojaModeKeyboard?.classList.toggle('active', !isMic);
  translateKojaModeMic?.setAttribute('aria-pressed', isMic ? 'true' : 'false');
  translateKojaModeKeyboard?.setAttribute(
    'aria-pressed',
    isMic ? 'false' : 'true',
  );

  if (translateKojaMicWrap) translateKojaMicWrap.hidden = !isMic;
  if (translateKojaKeyboard) translateKojaKeyboard.hidden = isMic;

  if (translateKojaHint) {
    translateKojaHint.innerHTML = isMic
      ? '마이크를 <strong>누르고 있는 동안</strong>만 한국어를 듣습니다. 손을 떼면 일본어로 번역하고, 스피커로 들을 수 있습니다.'
      : '한국어를 입력한 뒤 <strong>번역</strong>을 누르면 일본어와 발음이 표시됩니다. 스피커로 들을 수 있습니다.';
  }

  if (!isMic) {
    kojaHoldActive = false;
    kojaPointerId = null;
    translateListening = false;
    stopTranslateRecording({ silent: true, releaseStream: true }).catch(() => {});
    setTranslateStatus('한국어를 입력한 뒤 번역을 누르세요.', 'ko2ja');
    queueMicrotask(() => translateKojaInput?.focus());
  } else {
    setTranslateStatus('마이크를 누른 채 말하고, 떼면 번역됩니다.', 'ko2ja');
  }
}

async function submitKojaKeyboardText() {
  const text = String(translateKojaInput?.value || '').trim();
  if (!text) {
    setTranslateStatus('번역할 한국어를 입력해 주세요.', 'ko2ja');
    translateKojaInput?.focus();
    return;
  }
  if (translateBusy) return;

  const cfg = window.APP_CONFIG || {};
  const url =
    cfg.apiTranscribeUrl ||
    (cfg.apiGatewayUrl
      ? `${String(cfg.apiGatewayUrl).replace(/\/$/, '')}/transcribe`
      : '');
  if (!url) {
    setTranslateStatus(
      '변환 API가 없습니다. installer로 배포한 뒤 이용해 주세요.',
      'ko2ja',
    );
    return;
  }

  translateBusy = true;
  activeTranslateDirection = 'ko2ja';
  if (translateKojaSubmit) translateKojaSubmit.disabled = true;
  setTranslateStatus('일본어·발음으로 번역 중…', 'ko2ja');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction: 'ko2ja',
        text,
        language: 'ko',
        targetLanguage: 'ja',
        inputMode: 'keyboard',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTranslateStatus(
        data.detail || data.error || `변환 실패 (HTTP ${res.status})`,
        'ko2ja',
      );
      return;
    }

    const korean = (data.korean || text).trim();
    const japanese = (data.japanese || data.text || '').trim();
    const pronunciation = (data.pronunciation || '').trim();
    if (korean || japanese) {
      await saveAndShowTranslation({
        direction: 'ko2ja',
        korean,
        japanese,
        pronunciation,
        modelId: data.modelId,
      });
      if (translateKojaInput) translateKojaInput.value = '';
      setTranslateStatus(
        '번역 완료. 스피커 버튼을 눌러 일본어를 들으세요.',
        'ko2ja',
      );
    } else {
      setTranslateStatus('번역 결과가 비어 있습니다.', 'ko2ja');
    }
  } catch (err) {
    console.error(err);
    setTranslateStatus('번역 중 오류가 발생했습니다.', 'ko2ja');
  } finally {
    translateBusy = false;
    if (translateKojaSubmit) translateKojaSubmit.disabled = false;
    translateKojaInput?.focus();
  }
}

translateKojaModeMic?.addEventListener('click', () => {
  setKojaInputMode('mic');
});
translateKojaModeKeyboard?.addEventListener('click', () => {
  setKojaInputMode('keyboard');
});
translateKojaKeyboard?.addEventListener('submit', (e) => {
  e.preventDefault();
  submitKojaKeyboardText().catch((err) => console.error(err));
});
translateKojaInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitKojaKeyboardText().catch((err) => console.error(err));
  }
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

/** Suppress image click after a swipe so it doesn't advance twice. */
let placePhotoSwipeConsumed = false;
const PLACE_PHOTO_SWIPE_THRESHOLD_PX = 40;

placePhotoImg?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (placePhotoSwipeConsumed) {
    placePhotoSwipeConsumed = false;
    return;
  }
  if (!activePhotoEntry?.images || activePhotoEntry.images.length < 2) return;
  stepPlacePhoto(1);
});

placePhotoDots?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-photo-index]');
  if (!btn || !activePhotoEntry) return;
  activePhotoIndex = Number(btn.dataset.photoIndex) || 0;
  renderPlacePhotoPanel();
});

(function bindPlacePhotoSwipe() {
  if (!placePhotoStage) return;

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const canSwipe = () =>
    Boolean(activePhotoEntry?.images && activePhotoEntry.images.length > 1);

  placePhotoStage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.place-photo-nav')) return;
    if (!canSwipe()) return;
    tracking = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    placePhotoSwipeConsumed = false;
    try {
      placePhotoStage.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  placePhotoStage.addEventListener('pointerup', (e) => {
    if (!tracking || e.pointerId !== pointerId) return;
    tracking = false;
    pointerId = null;
    if (!canSwipe()) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < PLACE_PHOTO_SWIPE_THRESHOLD_PX || absX <= absY * 1.15) return;

    // 왼쪽으로 스와이프 → 다음, 오른쪽 → 이전
    placePhotoSwipeConsumed = true;
    stepPlacePhoto(dx < 0 ? 1 : -1);
  });

  placePhotoStage.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    tracking = false;
    pointerId = null;
  });
})();

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
  const thumbSrc =
    count > 0
      ? entry.images[Math.floor(Math.random() * count)]
      : null;
  const photo = thumbSrc
    ? `<img class="place-photo-thumb" src="${encodeURI(thumbSrc)}" alt="${escapeHtml(name)}" loading="lazy" /><em class="place-photo-count">사진 ${count}장 · 클릭하여 자세히 보기</em>`
    : '';
  return `
    <div class="place-popup">
      <div class="place-popup-head">
        <strong>${escapeHtml(name)}</strong>
        <button type="button" class="place-popup-close link-btn">닫기</button>
      </div>
      <div class="place-popup-hit" role="button" tabindex="0">
        ${photo}
        <span>${escapeHtml(detail || '')}</span>
      </div>
    </div>`;
}

function closePlacePopup() {
  if (!currentMarker) return;
  const popup = currentMarker.getPopup();
  if (popup?.isOpen?.()) currentMarker.togglePopup();
}

function bindPlacePopupClick(popup, name, detail) {
  const attach = () => {
    const root = popup.getElement();
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.querySelector('.place-popup-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePlacePopup();
    });

    const hit = root.querySelector('.place-popup-hit');
    if (!hit) return;
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entry = resolvePlacePhoto(name);
      if (!entry) return;
      closePlacePopup();
      openPlacePhotoPanel(name, detail, entry);
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
  // Close tour (and other) side panels so the map bubble is front and center
  setSidePanel(null);

  setPlaceMarker({ lng, lat, name, detail, openPopup: true });

  const reopen = () => {
    ensurePlacePopupOpen();
  };
  map.once('moveend', reopen);
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
  currentBasemap = showSatellite ? 'satellite' : 'topo';
  map.setLayoutProperty(
    'satellite',
    'visibility',
    showSatellite ? 'visible' : 'none',
  );
  map.setLayoutProperty('topo', 'visibility', showSatellite ? 'none' : 'visible');
  document.querySelectorAll('[data-basemap]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.basemap === currentBasemap);
  });
  if (btnToggleBasemap) {
    btnToggleBasemap.textContent = showSatellite ? '위성' : '지형';
    btnToggleBasemap.classList.toggle('active', showSatellite);
    btnToggleBasemap.title = showSatellite
      ? '지형 지도로 전환'
      : '위성 영상으로 전환';
  }
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

  const extendCoords = (coords, depth = 0) => {
    if (!Array.isArray(coords) || depth > 3) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      bounds.extend(coords);
      return;
    }
    coords.forEach((c) => extendCoords(c, depth + 1));
  };

  routes.forEach((route) => extendCoords(route?.geometry?.coordinates));
  stops.forEach((s) => extendCoords(s?.geometry?.coordinates));
  if (bounds.isEmpty()) {
    console.warn('[tour] fitTourBounds: empty bounds', {
      tourId: tourSelect?.value,
      routeCount: routes.length,
      stopCount: stops?.length ?? 0,
    });
    return;
  }

  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const panelOpen = activeSidePanel === 'tour' && !tourPanel?.hidden;
  map.fitBounds(bounds, {
    padding: narrow
      ? { top: 80, bottom: 40, left: 24, right: 24 }
      : panelOpen
        ? { top: 120, bottom: 80, left: 420, right: 80 }
        : { top: 100, bottom: 80, left: 80, right: 80 },
    pitch: is3d ? 55 : 0,
    bearing: -18,
    duration: 1600,
    maxZoom: tourSelect.value === 'hokkaido-all' ? 9.5 : 12.5,
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
  closePlacePopup();
  closeStopMarkerPopups();
  setTourMenuOpen(false);
  if (routes.length) fitTourBounds(routes, stops);
});

tourClose?.addEventListener('click', () => {
  setTourMenuOpen(false);
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

btnToggleBasemap?.addEventListener('click', () => {
  setBasemap(currentBasemap === 'satellite' ? 'topo' : 'satellite');
});

async function reverseGeocode(lat, lng) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}

async function goToCurrentLocation() {
  if (!navigator.geolocation) {
    searchStatus.textContent = '이 브라우저는 현재 위치를 지원하지 않습니다.';
    setSidePanel('search');
    return;
  }

  btnCurrentLocation?.classList.add('active');
  btnCurrentLocation && (btnCurrentLocation.disabled = true);
  searchStatus.textContent = '현재 위치를 확인하는 중…';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy || 0);
      const address = await reverseGeocode(lat, lng);
      const name = address ? address.split(',')[0].trim() : '현재 위치';
      const detail = [
        address || null,
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        accuracy ? `정확도 약 ${accuracy}m` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      if (tour.isRunning()) {
        tour.stop();
        syncTourButtons(false);
      }
      flyToPlace({ lng, lat, name, detail });
      searchStatus.textContent = `현재 위치: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      btnCurrentLocation?.classList.remove('active');
      if (btnCurrentLocation) btnCurrentLocation.disabled = false;
    },
    (err) => {
      const messages = {
        1: '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.',
        2: '현재 위치를 확인할 수 없습니다.',
        3: '위치 확인 시간이 초과되었습니다.',
      };
      searchStatus.textContent =
        messages[err.code] || '현재 위치를 가져오지 못했습니다.';
      setSidePanel('search');
      btnCurrentLocation?.classList.remove('active');
      if (btnCurrentLocation) btnCurrentLocation.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    },
  );
}

btnCurrentLocation?.addEventListener('click', () => {
  goToCurrentLocation();
});
