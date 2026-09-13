# Travel Map

MapLibre GL JS + WebGL로 위성·지형을 브라우저에서 직접 렌더링하는 정적 웹 앱입니다. 한일 또는 일한 번역도 함께 제공합니다.


## 시스템 구성

전체 구성은 아래와 같습니다.

<img width="800" alt="image" src="https://github.com/user-attachments/assets/cbd78036-fa6f-48e4-bfbf-bd75de195736" />


| 계층 | 구성 |
|------|------|
| 클라이언트 | Browser · MapLibre GL JS (위성·DEM·투어·측정 UI) |
| 정적 호스팅 | CloudFront (OAI) → S3 `web/` (`index.html`, `css/`, `js/`, `data/`, `photos/`) |
| API | HTTP API Gateway `api-travel-map` → Lambda `lambda-api-travel-map` (`GET /health`, `GET /tours`, `POST /transcribe`, `POST /speak`) |
| 외부 | Esri (위성/Topo) · AWS Terrain Tiles (Terrarium DEM) · Nominatim (지오코딩) · Bedrock Voxtral (음성 통역) · Amazon Polly (일본어 TTS) |

## 기능

- **3D 지형**: Esri 위성 영상 + Mapzen/AWS Terrain Tiles(Terrarium DEM)
- **위치 입력**: 장소명 검색(Nominatim) / 위·경도 직접 입력
- **지형 조작**: 회전·기울기(NavigationControl), 고도 배율 슬라이더, 2D/3D 전환
- **거리 측정**: 지도 클릭으로 경로 거리 계산
- **투어 경로 표시**: 드롭다운에서 선택 시 경로·경유지 표시 후 카메라 둘러보기
- **일본 홋카이도 여행 (전체)** — 2026.10.08~10.11 3박 4일, 날짜별 색 표시
- **1일차 10/8** — 신치토세 → 스스키노 → ibis Styles 삿포로
- **2일차 10/9** — 이비스 스타일스 삿포로 출발 → 오도리·시계탑·도청사 → 시로이 코이비토 → 다나카 주조 → 오타루 → 시카노유
- **3일차 10/10** — 호텔 시카노유 출발 → 도야 유람선 · 쇼와신잔 · 사이로 · 지옥계곡 · 세키스이테이
- **4일차 10/11** — 노보리베츠 세키스이테이 출발 → 다테 지다이무라 → 신치토세 → 인천
- **일한 통역** — 일본어 음성을 한국어로 실시간 번역 (Bedrock Voxtral)
- **한일 통역** — 한국어 push-to-talk → 일본어·한글 발음 번역 + Polly 음성 재생

## 초기 위치

첫 화면은 투어 메뉴가 열린 상태로 **신치토세공항(新千歳空港)** 에서 시작합니다. (전체 여행 출발지)

| 항목 | 값 |
|------|-----|
| 이름 | 신치토세공항(新千歳空港) |
| 위도 | `42.77528` |
| 경도 | `141.6925` |
| MapLibre center | `[141.6925, 42.77528]` |

## 상세 구현

3D 화면은 **브라우저**에서 MapLibre GL JS가 WebGL로 그립니다. Lambda(`lambda-api-travel-map`)는 **투어 경로 GeoJSON을 JSON으로 내려주는 얇은 API**이며, 타일·고도·카메라 연산은 모두 클라이언트(`js/app.js`, `js/tour.js`, `js/measure.js`)에서 처리합니다.

### 브라우저에서 3D 지형을 그리는 방식

1. **지도 초기화** — `maplibregl.Map`에 Esri 위성·Topo 래스터 타일과 AWS Terrarium DEM(`raster-dem`, `encoding: 'terrarium'`)을 등록하고, `terrain: { source: 'terrarium', exaggeration }`으로 메시를 올립니다. 초기 `pitch`·`bearing`으로 기울어진 3D 시점을 만듭니다.
2. **타일 로딩** — 보이는 영역에 맞춰 Esri에서 베이스맵 PNG, S3 `elevation-tiles-prod`에서 고도 타일을 가져와 GPU에서 합성합니다. (Lambda·API Gateway와 무관)
3. **2D/3D·고도 배율** — UI 슬라이더와 3D 토글이 `map.setTerrain()` / `map.easeTo({ pitch })`를 바꿉니다. 측정 도구는 클릭 좌표로 GeoJSON 라인을 올려 Haversine 거리를 표시합니다.
4. **투어 시각화** — `GET /tours`(또는 로컬 `data/tours.geojson`)로 받은 FeatureCollection에서 `kind: route` / `kind: stop`을 골라 `tour-route`·`tour-stops` 소스에 line/circle 레이어를 그립니다. **투어 재생**은 `createPathTour(map)`이 경유지 순서대로 `map.flyTo`로 카메라만 이동시키며, 지형 위를 따라가는 연출입니다.

### API 사용 흐름 (HTTP API Gateway → Lambda)

배포 시 `installer.py`가 Lambda ZIP(`lambda-api/` + 번들 `tours.geojson`)을 올리고, HTTP API `api-travel-map`을 **Lambda 프록시 통합**으로 연결합니다. 엔드포인트와 역할은 다음과 같습니다.

| 메서드·경로 | Lambda 동작 | 프론트 사용처 |
|-------------|-------------|----------------|
| `GET /health` | `{ status, service, region, voxtralModelId, … }` JSON | 모니터링·헬스 확인 |
| `GET /tours` | 패키징된 `tours.geojson` 전체를 JSON 응답 (CORS `*`) | 지도 투어 드롭다운·경로 레이어 |
| `POST /transcribe` | WAV(base64) → Bedrock Voxtral (`direction`: `ja2ko` \| `ko2ja`) | 일한 / 한일 통역 패널 |
| `POST /speak` | 일본어 텍스트 → Amazon Polly MP3(base64) | 한일 결과 스피커 버튼 |
| `OPTIONS` | CORS preflight | 브라우저 cross-origin `fetch` |

프론트는 `index.html`이 로드하는 `js/config.js`의 `window.APP_CONFIG`를 사용합니다.

```javascript
// js/config.js (installer 생성)
window.APP_CONFIG = {
  apiToursUrl: "…/tours",
  apiTranscribeUrl: "…/transcribe",
  apiSpeakUrl: "…/speak",
  // …
};
```

```javascript
// js/app.js (지도 load 이후)
const cfg = window.APP_CONFIG || {};
const toursUrl = cfg.apiToursUrl || 'data/tours.geojson?...';
const res = await fetch(toursUrl, { cache: 'no-store' });
tourData = await res.json();
```

- **배포 환경**: CloudFront/S3에서 정적 앱을 열고, 투어·통역 API는 API Gateway 도메인으로 `fetch`합니다.
- **로컬 개발**: `config.js`에 API URL이 없거나 서버만 띄운 경우 **`data/tours.geojson` 폴백**으로 3D·투어 UI를 검증할 수 있습니다. 통역은 API URL이 필요합니다.

지오코딩(Nominatim)·위성/DEM 타일(Esri·AWS)은 **브라우저가 각 공급자에 직접 요청**하며, Lambda 경유하지 않습니다.

### 일한번역

메뉴 **일한** 패널입니다. 일본어를 말하면 한국어 번역만 쌓입니다.

**STT / 음성 모델**

| 항목 | 값 |
|------|-----|
| 제공 | Amazon Bedrock `Converse` (오디오 입력) |
| 모델 ID | `mistral.voxtral-small-24b-2507` (Mistral **Voxtral Small 24B**) |
| 역할 | 일본어 음성을 듣고 **바로 한국어 번역문** 생성 (별도 Transcribe/Whisper 없음) |
| 환경변수 | Lambda `VOXTRAL_MODEL_ID` (기본값 위 모델) |

Amazon Transcribe가 아니라 **멀티모달 음성·언어 모델(Voxtral)** 이 STT+번역을 한 호출로 처리합니다.

**흐름**

1. 마이크 토글로 녹음 시작 (약 6초 세그먼트 연속)
2. 브라우저에서 WAV로 변환 후 `POST /transcribe` (`direction: "ja2ko"`)
3. Lambda가 Bedrock **Voxtral**에 오디오+프롬프트를 한 번에 넘겨 **한국어만** 반환
4. `js/translate-db.js`(sql.js + IndexedDB)에 `direction=ja2ko`로 저장·표시

**프론트 요청**

```javascript
// js/app.js — submitTranslateAudio (일한)
await fetch(cfg.apiTranscribeUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    audio: audioBase64,
    format: 'wav',
    direction: 'ja2ko',
    language: 'ja',
    targetLanguage: 'ko',
  }),
});
// 응답: { korean, text, modelId: "mistral.voxtral-small-24b-2507", … }
```

**Lambda (1단계: 음성 → 한국어)**

```python
# lambda-api/lambda_function.py
VOXTRAL_MODEL_ID = os.environ.get(
    "VOXTRAL_MODEL_ID", "mistral.voxtral-small-24b-2507"
)

def _speech_to_korean(audio_bytes, audio_format):
    prompt = (
        "この音声は日本語です。内容を理解し、自然な韓国語に翻訳してください。"
        "出力は韓国語（ハングル）の翻訳文のみ。"
    )
    # Bedrock Converse: content에 audio + text
    korean = _converse_audio(audio_bytes, audio_format, prompt)
    return korean, VOXTRAL_MODEL_ID
```

### 한일번역

메뉴 **한일** 패널입니다. 마이크를 **누르고 있는 동안만** 듣고, 손을 떼면 번역합니다.

**STT / 음성·번역 모델**

| 항목 | 값 |
|------|-----|
| STT 모델 | 동일 — Amazon Bedrock **Voxtral Small 24B** (`mistral.voxtral-small-24b-2507`) |
| STT 역할 | 한국어 음성을 **한글 원문**으로 받아쓰기 (`_converse_audio`) |
| 번역 모델 | 동일 Voxtral — 텍스트만 전달 (`_converse_text`)해 일본어 + 한글 발음 생성 |
| TTS | Amazon Polly `Kazuha` (neural, `ja-JP`) — STT와 별개 |

한일도 Transcribe를 쓰지 않고, **1호출 STT(오디오) → 2호출 번역(텍스트)** 로 같은 Voxtral을 재사용합니다.

**흐름**

1. push-to-talk (`pointerdown` / `pointerup`)로 녹음
2. `POST /transcribe` (`direction: "ko2ja"`)
3. Lambda **2단계**: Voxtral 한국어 STT → Voxtral 일본어·발음 번역
4. UI 순서: **한국어 → 일본어 → 발음**, 스피커로 `POST /speak` (Polly, 자동 재생 없음)
5. SQLite에 `direction=ko2ja`로 이력 저장

**프론트 (누르고 말하기)**

```javascript
// js/app.js — 한일 전용
translateKojaRecord.addEventListener('pointerdown', (e) => {
  startKojaPushToTalk(e);  // getUserMedia + MediaRecorder
});
translateKojaRecord.addEventListener('pointerup', (e) => {
  endKojaPushToTalk(e);    // stop → submitTranslateAudio(direction: 'ko2ja')
});
```

**Lambda (STT → JA + 발음)**

```python
# lambda-api/lambda_function.py
def _speech_ko_then_ja(audio_bytes, audio_format):
    # 1) STT: Voxtral + audio → 한국어 원문
    korean = _converse_audio(audio_bytes, audio_format, stt_prompt)
    # 2) 번역: 동일 Voxtral + text → 일본어·발음
    raw = _converse_text(
        "JA: <일본어>\\n발음: <한글 발음>\\n\\n" + korean
    )
    japanese, pronunciation = _parse_ja_and_pronunciation(raw)
    return korean, japanese, pronunciation, VOXTRAL_MODEL_ID
```

**Polly 재생 (TTS, STT와 별도)**

```python
# POST /speak
polly.synthesize_speech(
    Text=japanese_text,
    OutputFormat="mp3",
    VoiceId="Kazuha",       # neural; 실패 시 Takumi standard 폴백
    LanguageCode="ja-JP",
)
# 응답: { audio: "<base64 mp3>", voice, engine, … }
```

```javascript
// js/app.js — 스피커 버튼
const res = await fetch(cfg.apiSpeakUrl, {
  method: 'POST',
  body: JSON.stringify({ text: japanese, language: 'ja' }),
});
const { audio } = await res.json();
new Audio(`data:audio/mpeg;base64,${audio}`).play();
```

## 실행 방법

로컬 HTTP 서버로 열어주세요 (`file://` 에서는 GeoJSON fetch가 막힐 수 있습니다).

```bash
git clone https://github.com/kyopark2014/travel-map.git
cd travel-map
python3 -m http.server 8080
```

브라우저에서 <http://localhost:8080> 접속.

또는:

```bash
npx --yes serve .
```

## 타일 / 데이터 출처

| 용도 | 소스 |
|------|------|
| 위성 베이스맵 | [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) |
| 지형(Topo) 베이스맵 | Esri World Topo Map |
| 고도 DEM | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, 구 Mapzen) |
| 지오코딩 | [Nominatim](https://nominatim.openstreetmap.org/) (사용 시 User-Agent·요청 빈도 제한 준수) |
| 투어 경로 | `data/tours.geojson` (홋카이도 1일 코스 등) |

DEM 소스는 **`encoding: 'terrarium'`** 이 필수입니다. 기본 Mapbox Terrain-RGB 인코딩과 다르면 고도가 깨집니다.

## 배포 (S3 + CloudFront + Lambda)

`project_name` = **travel-map**

```bash
cd travel-map
python3 installer.py              # 전체 (S3, Lambda API, CloudFront, 정적 업로드)
python3 installer.py --web-only   # 정적 웹만 재업로드 + CloudFront invalidate
python3 uninstaller.py -y         # 리소스 삭제
```

| 리소스 | 이름 |
|--------|------|
| S3 | `storage-for-travel-map-{account}-{region}` (`web/` 정적) |
| CloudFront | comment `CloudFront-S3-for-travel-map` |
| Lambda | `lambda-api-travel-map` (`/health`, `/tours`, `/transcribe`, `/speak`) |
| HTTP API | `api-travel-map` |

배포 결과는 `config.json`에 저장되고, 프론트용 `js/config.js`가 생성됩니다.

## 프로젝트 구조

```
travel-map/
  index.html
  css/styles.css
  js/app.js
  js/translate-db.js   # 통역 이력 (sql.js + IndexedDB)
  js/measure.js
  js/tour.js
  data/tours.geojson
  docs/architecture.svg
  lambda-api/
  installer.py / uninstaller.py
  README.md
```

### 참고

- Esri / AWS 공개 타일은 데모·개인 실험용으로 적합합니다. 상용·대량 트래픽에는 ToS 확인 또는 자체 타일/프록시를 검토하세요.
- 투어 경로 좌표는 시연용 근사치이며 실제 도로/철도 노선과 다를 수 있습니다.


### 실행 결과 

투어 선택시 아래와 같이 전체 여행 경로를 확인할 수 있습니다.

<img width="398" height="546" alt="image" src="https://github.com/user-attachments/assets/d819b025-358c-4ded-a607-bf3e32b1641c" />

여행지를 선택하면 아래와 같이 위치에 말풍선을 보여줍니다.

<img width="272" height="228" alt="image" src="https://github.com/user-attachments/assets/283c32de-4b5b-4e21-a076-fe408da459e9" />

말풍선을 선택하면 해당 여행지에 대한 상세정보를 확인할 수 있습니다.

<img width="409" height="454" alt="image" src="https://github.com/user-attachments/assets/3ecce74f-b918-4412-8d71-8c61b66fe040" />

일정표를 누르면 전체 여행 일정표를 확인할 수 있습니다.

<img width="406" height="644" alt="image" src="https://github.com/user-attachments/assets/bd55c378-edd0-453d-ba33-5ff8d6295f59" />

복장을 선택하면 여행기간에 주의할 복장과 날씨에 대한 정보를 확인할 수 있습니다.

<img width="413" height="658" alt="image" src="https://github.com/user-attachments/assets/d1ba37ec-9af6-4a88-ab26-a73fc13a96b7" />

전체화면에서 보여주는 여행정보는 아래와 같습니다.

<img width="1424" height="744" alt="image" src="https://github.com/user-attachments/assets/6a2ac2ec-2b6b-4111-89ee-73c413312405" />
