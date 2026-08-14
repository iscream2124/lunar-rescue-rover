# LUNA-12: 달 과학 탐사

브라우저에서 바로 플레이하는 3D 달 과학 탐사 로버 게임입니다. 다섯 현상을 찾아가 과학 장비로 조사하고, 관측 결과를 `탐사 도감`에 기록합니다. 빌드·백엔드·실행 중 네트워크 요청 없이 GitHub Pages에서 동작합니다.

## 실행

```bash
npm start
# http://localhost:4187
```

ES modules 보안 정책 때문에 `index.html`을 파일로 직접 열지 말고 정적 서버를 사용하세요.

## 조작

- `WASD` / 방향키: 주행·조향
- `Space`: 제동
- `Shift`: 30 m/s 부스트(일반 최고 속도 24 m/s)
- 목표 구역에서 `E` 길게 누르기: 현장별 과학 조사·장비 전개
- `C` 또는 HUD의 **탐사 도감**: 발견 기록 열기/닫기
- `H`: 조작 안내
- 모바일/터치: 화면 방향 패드, 행동 버튼, `BOOST` 버튼

각 임무 시작 전 과학 브리핑 카드가 현상, 현장 과제, 참고 출처를 안내합니다. 카드나 탐사 도감이 열려 있는 동안 주행 입력과 임무 시간은 일시 정지됩니다.

시작 화면은 전체 목표와 첫 분화구 목표, 키보드·모바일 조작을 한눈에 안내합니다. 주행은 실제 달 로버 성능을 모사하지 않는 **아케이드 탐사 모드**이며, 고속에서는 조향이 완만해집니다.

## 사운드

외부 음원 없이 Web Audio API로 모터·표토 주행음과 조사/시추/장비 전개/도감 해제/완료 효과음을 합성합니다. 오디오 컨텍스트는 자동 재생 정책을 지키기 위해 시작 또는 이어하기 버튼을 누른 순간에만 만들어집니다. HUD의 `소리 켜짐/꺼짐` 버튼으로 음소거할 수 있으며, 이 선호는 캠페인 저장과 별도인 `luna12-audio-muted`에 저장되어 탐사를 초기화해도 유지됩니다. Web Audio를 지원하지 않는 환경에서는 게임이 무음으로 정상 동작합니다.

## 5단계 과학 임무

1. **충돌 분화구 발견** — 신선한 분화구의 함몰부·융기 테두리·분출물을 파노라마/LiDAR로 조사
2. **영구 음영 지역과 물얼음** — 극지 콜드 트랩에 진입해 레이더·열 조사
3. **표토와 충돌 교란(임팩트 가드닝)** — 반복 충돌로 부서지고 섞인 표토의 층상 코어 시추
4. **월진과 달 내부** — 안정된 지반에 지진계를 전개해 내부 구조 관측 준비
5. **달 뒷면 통신** — 전파 가시선이 막히는 뒷면 탐사를 위한 중계 비콘 전개

조사를 끝내면 관측 결과가 탐사 도감에 해제됩니다. 최종 화면은 다섯 발견을 함께 요약합니다. 진행 상황과 도감은 버전이 명시된 `localStorage` 키 `luna12-science-save-v2`에 저장되며, 이전 3단계 저장 데이터는 불러오지 않습니다. 배터리 소진 시 비상 전력으로 현재 목표 근처의 안전 지점에 복귀합니다.

## 과학 출처와 정확성

설명은 과장 없이 NASA의 공개 자료를 짧게 요약했습니다. 출처 링크는 선택적으로 새 탭에서 열리며 게임 실행 중 해당 페이지의 콘텐츠를 가져오지 않습니다.

- [NASA Science — Moon Craters](https://science.nasa.gov/moon/lunar-craters/)
- [NASA Science — LCROSS](https://science.nasa.gov/mission/lcross/)
- [NASA Science — Moon Composition](https://science.nasa.gov/moon/composition/)
- [NASA Science — Apollo Samples, LRO, and Moonquakes](https://science.nasa.gov/solar-system/moon/nasas-apollo-samples-lro-help-scientists-forecast-moonquakes/)
- [NASA NTRS — Lunar far-side communication satellites](https://ntrs.nasa.gov/citations/19680015886)

## 개발/검증 훅

브라우저 콘솔에서 `window.__LUNA12__`를 사용할 수 있습니다. 디버그 이동은 주행 시간을 줄일 뿐, 정상 플레이를 자동 완료하지 않습니다.

- `getState()` — 5단계 임무, 브리핑/도감, 발견 수를 포함한 직렬화 가능한 현재 상태
- `getMissions()` — 제목, 설명, 좌표, 행동, 출처가 포함된 임무 데이터 사본
- `getRoverDebug()` — 6개 휠, 144개 그라우저, 회전·조향·서스펜션과 렌더링 설정
- `getAudioDebug()` — 오디오 지원/초기화/음소거/컨텍스트 상태
- `teleportToObjective()` — 현재 목표 근처로 이동(자동 완료하지 않음)
- `performObjective()` — 목표 범위 안에서 정상 검증을 거쳐 현재 행동 완료
- `continueBriefing()` — 현재 브리핑 닫기
- `openCodex()` / `closeCodex()` — 탐사 도감 테스트
- `setBattery(number)` — 배터리/비상 복귀 테스트
- `reset()` — 저장·임무·도감 초기화

## 기술/자산

원본 게임 코드, 절차적 달 지형과 별, 현상별 현장 소품, 6륜 로커-보기 로버 모델 및 반응형 UI로 구성됩니다. 로버는 공유 지오메트리 기반 휠/그라우저, 가동 조향·서스펜션, 절차적 금박 텍스처, 태양전지판, 고이득 안테나와 과학 장비를 런타임에 생성합니다. 분화구 조사 말뚝, 음영 콜드 트랩, 코어 표지, 전개형 지진계와 중계 안테나도 Three.js 기본 도형으로 생성됩니다.

외부 이미지·폰트·음원은 사용하지 않으며 Three.js r160 ES module만 로컬에 포함했습니다. 자세한 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.
