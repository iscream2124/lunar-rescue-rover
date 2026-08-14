# LUNA-12: 그림자 분화구

브라우저에서 바로 플레이하는 독립 3D 달 탐사 로버 게임 MVP입니다. 빌드·백엔드·실행 중 네트워크 요청 없이 GitHub Pages에서 동작합니다.

## 실행

```bash
npm start
# http://localhost:4187
```

ES modules 보안 정책 때문에 `index.html`을 파일로 직접 열지 말고 정적 서버를 사용하세요.

## 조작

- `WASD` / 방향키: 주행·조향
- `Space`: 제동
- 목표 구역에서 `E` 길게 누르기: 스캔, 시추, 비콘 설치
- 모바일/터치: 화면 방향 패드와 행동 버튼
- `H`: 조작 안내

## 임무

스캔 구역 진입·얼음 신호 스캔 → 표본 시추 → 중계점 비콘 설치의 3단계입니다. 진행 상황은 `localStorage`의 `luna12-save-v1` 키에 저장됩니다. 배터리 소진 시 비상 전력으로 현재 목표 근처의 안전 지점에 복귀합니다.

## 개발/검증 훅

브라우저 콘솔에서 `window.__LUNA12__`를 사용할 수 있습니다.

- `getState()` — 직렬화 가능한 현재 상태
- `teleportToObjective()` — 현재 목표 근처로 이동 (자동 완료하지 않음)
- `performObjective()` — 목표 범위 안에서 현재 행동을 완료
- `setBattery(number)` — 배터리 테스트
- `reset()` — 저장 및 진행 초기화

## 기술/자산

원본 게임 코드, 절차적 로우폴리 지형, 별, 로버 모델 및 UI로 구성됩니다. 외부 이미지·폰트·음원은 사용하지 않습니다. Three.js r160 ES module만 로컬에 포함했습니다. 자세한 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.
