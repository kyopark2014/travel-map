# 3D Terrain Map

MapLibre GL JS + WebGL로 위성·지형을 브라우저에서 직접 렌더링하는 정적 웹 앱입니다.

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

## 초기 위치

첫 화면은 투어 메뉴가 열린 상태로 **신치토세공항(新千歳空港)** 에서 시작합니다. (전체 여행 출발지)

| 항목 | 값 |
|------|-----|
| 이름 | 신치토세공항(新千歳空港) |
| 위도 | `42.77528` |
| 경도 | `141.6925` |
| MapLibre center | `[141.6925, 42.77528]` |

## 실행 방법

로컬 HTTP 서버로 열어주세요 (`file://` 에서는 GeoJSON fetch가 막힐 수 있습니다).

```bash
cd map
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
cd map
python3 installer.py              # 전체 (S3, Lambda API, CloudFront, 정적 업로드)
python3 installer.py --web-only   # 정적 웹만 재업로드 + CloudFront invalidate
python3 uninstaller.py -y         # 리소스 삭제
```

| 리소스 | 이름 |
|--------|------|
| S3 | `storage-for-travel-map-{account}-{region}` (`web/` 정적) |
| CloudFront | comment `CloudFront-S3-for-travel-map` |
| Lambda | `lambda-api-travel-map` (`GET /health`, `GET /tours`) |
| HTTP API | `api-travel-map` |

배포 결과는 `config.json`에 저장되고, 프론트용 `js/config.js`가 생성됩니다.

## 프로젝트 구조

```
map/
  index.html
  css/styles.css
  js/app.js
  js/measure.js
  js/tour.js
  data/tours.geojson
  README.md
```

## 참고

- Esri / AWS 공개 타일은 데모·개인 실험용으로 적합합니다. 상용·대량 트래픽에는 ToS 확인 또는 자체 타일/프록시를 검토하세요.
- 투어 경로 좌표는 시연용 근사치이며 실제 도로/철도 노선과 다를 수 있습니다.
