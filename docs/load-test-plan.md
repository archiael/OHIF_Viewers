# 사내 개발 웹서버 부하 테스트 계획서

## 테스트 아키텍처

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│   부하 생성기  │────▶│  사내 개발 웹서버       │────▶│  사내 PACS 서버       │
│  (k6/Locust)  │◀────│  :3000 (Webpack/Nginx) │◀────│  :8083 (DICOMweb)    │
│              │     │  - React SPA 서빙       │     │  - FastAPI 백엔드     │
│              │     │  - API Proxy           │     │  - DICOM 데이터 응답   │
└──────────────┘     └───────────────────────┘     └──────────────────────┘
```

---

## 1단계: 테스트 대상 식별 및 트래픽 패턴 분석

### 1.1 웹서버가 처리하는 요청 유형 분류

| 카테고리 | 경로 패턴 | 특성 |
|----------|----------|------|
| **정적 자산** | `/`, `/*.js`, `/*.css`, `/*.wasm` | SPA 번들, WASM 코덱 등 |
| **인증 API** | `/v1/oauth/*` | 로그인, 세션 검증 (프록시) |
| **Study 목록** | `/dicomweb/studies` | QIDO-RS 검색 (프록시) |
| **시리즈 메타** | `/dicomweb/studies/{id}/series` | 시리즈 정보 (프록시) |
| **이미지 로딩** | `/dicomweb/studies/{id}/series/{id}/instances/{id}/frames/{n}` | WADO-RS 픽셀 데이터 (프록시, 대용량) |
| **SR 저장** | `/api/v1/dicom/sr` | Structured Report 저장 (프록시) |

### 1.2 실제 사용자 워크플로우 정의

**시나리오 A - Study 목록 조회**:
1. 로그인 (`POST /v1/oauth/login`)
2. Study 목록 조회 (`GET /dicomweb/studies?...`)

**시나리오 B - 영상 열람 (핵심)**:
1. 로그인
2. Study 선택 → 시리즈 메타데이터 로드
3. 인스턴스 메타데이터 로드
4. 이미지 프레임 동시 다운로드 (150개 병렬 요청)

**시나리오 C - MPR 볼륨 로딩**:
1. 시나리오 B + 볼륨 전체 슬라이스 로딩
2. HTJ2K Level 2 디코딩 (1/4 해상도)
3. 수백 개의 프레임 요청이 동시 발생

---

## 2단계: 테스트 도구 선택

### 추천: **k6** (Grafana k6)

| 기준 | k6 | Locust | Artillery | JMeter |
|------|-----|--------|-----------|--------|
| HTTP/2 지원 | ✅ | ❌ | ✅ | ✅ |
| 바이너리 응답 처리 | ✅ | ✅ | ❌ | ✅ |
| 스크립팅 편의성 | JS (ES6) | Python | YAML/JS | GUI/XML |
| 리소스 효율 | ★★★★★ | ★★★ | ★★★★ | ★★ |
| 분산 테스트 | ✅ | ✅ | ✅ | ✅ |

**k6 선택 이유**:
- Go 기반으로 적은 리소스로 많은 VU(Virtual User) 생성 가능
- JavaScript로 시나리오 작성 (OHIF 프로젝트와 같은 언어)
- 바이너리 응답(DICOM 프레임) 처리 가능
- 실시간 메트릭 대시보드 연동 용이

### 설치
```bash
# macOS
brew install k6

# Linux (apt)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

---

## 3단계: 병목 지점 분리 테스트 전략

### 핵심 원칙: 계층별 분리 테스트

부하 테스트에서 병목을 정확히 파악하려면, **각 계층을 독립적으로 테스트**한 후 통합 테스트를 수행해야 합니다.

### 3.1 Layer 1 — 정적 자산 서빙 성능 (웹서버 단독)

**목적**: 웹서버의 순수 파일 서빙 능력 측정 (PACS 서버 무관)

```javascript
// k6-static-assets.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 50 },   // Sustained load
    { duration: '1m', target: 100 },  // Peak
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% 요청이 500ms 이내
    http_req_failed: ['rate<0.01'],    // 에러율 1% 미만
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // SPA 메인 페이지
  const indexRes = http.get(`${BASE_URL}/`);
  check(indexRes, { 'index 200': (r) => r.status === 200 });

  // JS 번들 (가장 큰 정적 자산)
  const bundleRes = http.get(`${BASE_URL}/app.bundle.js`);
  check(bundleRes, { 'bundle 200': (r) => r.status === 200 });

  // WASM 코덱 파일
  const wasmRes = http.get(`${BASE_URL}/decoders/`);

  sleep(1);
}
```

```bash
k6 run -e BASE_URL=http://your-dev-server:3000 k6-static-assets.js
```

**측정 지표**:
- 응답 시간 (p50, p95, p99)
- 처리량 (req/s)
- 에러율
- 전송 바이트 수

### 3.2 Layer 2 — 프록시 패스스루 성능 (웹서버 → PACS)

**목적**: 프록시의 오버헤드 측정

```javascript
// k6-proxy-passthrough.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '3m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:study_list}': ['p(95)<2000'],
    'http_req_duration{name:series_meta}': ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STUDY_UID = __ENV.STUDY_UID || '1.2.3.4.5';  // 테스트용 Study UID

export default function () {
  // 인증 (세션 획득)
  const loginRes = http.post(`${BASE_URL}/v1/oauth/login`, JSON.stringify({
    username: __ENV.USERNAME,
    password: __ENV.PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  });

  const sessionToken = loginRes.json('token') || '';

  const headers = {
    'Authorization': `Bearer ${sessionToken}`,
    'Accept': 'application/dicom+json',
  };

  group('Study 목록 조회', () => {
    const res = http.get(
      `${BASE_URL}/dicomweb/studies?limit=25&offset=0`,
      { headers, tags: { name: 'study_list' } }
    );
    check(res, { 'study list 200': (r) => r.status === 200 });
  });

  group('시리즈 메타데이터', () => {
    const res = http.get(
      `${BASE_URL}/dicomweb/studies/${STUDY_UID}/series`,
      { headers, tags: { name: 'series_meta' } }
    );
    check(res, { 'series meta 200': (r) => r.status === 200 });
  });

  sleep(2);
}
```

**핵심**: 동일한 요청을 PACS 서버에 직접 보낸 결과와 비교하여 프록시 오버헤드를 산출합니다.

```bash
# 웹서버 경유
k6 run -e BASE_URL=http://dev-server:3000 k6-proxy-passthrough.js

# PACS 직접 (비교용)
k6 run -e BASE_URL=http://pacs-server:8083 k6-proxy-passthrough.js
```

### 3.3 Layer 3 — 이미지 로딩 시뮬레이션 (핵심 시나리오)

**목적**: 실제 영상 열람 시의 대량 병렬 요청 처리 능력 측정

```javascript
// k6-image-loading.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  scenarios: {
    image_viewers: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 5 },    // 동시 5명
        { duration: '5m', target: 10 },   // 동시 10명
        { duration: '3m', target: 20 },   // 동시 20명 (스트레스)
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:frame}': ['p(95)<3000'],
    'http_req_duration{name:metadata}': ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STUDY_UID = __ENV.STUDY_UID;
const SERIES_UID = __ENV.SERIES_UID;

// 테스트할 인스턴스 UID 목록 (사전에 준비)
const INSTANCE_UIDS = new SharedArray('instances', function () {
  return JSON.parse(open('./test-instance-uids.json'));
});

export default function () {
  // 1. 로그인
  const loginRes = http.post(`${BASE_URL}/v1/oauth/login`, JSON.stringify({
    username: __ENV.USERNAME,
    password: __ENV.PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  const token = loginRes.json('token') || '';
  const headers = { 'Authorization': `Bearer ${token}` };

  // 2. 메타데이터 로드
  group('metadata', () => {
    http.get(
      `${BASE_URL}/dicomweb/studies/${STUDY_UID}/series/${SERIES_UID}/metadata`,
      { headers, tags: { name: 'metadata' } }
    );
  });

  // 3. 이미지 프레임 병렬 로딩 (실제 뷰어 동작 시뮬레이션)
  group('frame_loading', () => {
    // OHIF는 maxNumRequests.interaction = 150 병렬 요청
    // k6에서는 batch로 병렬 요청 시뮬레이션
    const batchSize = 20; // 한 번에 20개씩 요청

    for (let i = 0; i < Math.min(INSTANCE_UIDS.length, 100); i += batchSize) {
      const requests = [];
      for (let j = i; j < Math.min(i + batchSize, INSTANCE_UIDS.length); j++) {
        requests.push({
          method: 'GET',
          url: `${BASE_URL}/dicomweb/studies/${STUDY_UID}/series/${SERIES_UID}/instances/${INSTANCE_UIDS[j]}/frames/1`,
          params: {
            headers: {
              ...headers,
              'Accept': 'multipart/related; type="application/octet-stream"',
            },
            tags: { name: 'frame' },
          },
        });
      }

      const responses = http.batch(requests);
      responses.forEach((res) => {
        check(res, { 'frame 200': (r) => r.status === 200 });
      });
    }
  });

  sleep(5); // 사용자가 영상을 보는 시간
}
```

---

## 4단계: 테스트 실행 순서

### Phase 1 — 베이스라인 측정 (1일)

| 순서 | 테스트 | VU | 목적 |
|------|--------|-----|------|
| 1 | 정적 자산 (Layer 1) | 1→100 | 웹서버 순수 서빙 한계 |
| 2 | PACS 직접 요청 | 1→50 | PACS 서버 베이스라인 |
| 3 | 프록시 경유 (Layer 2) | 1→50 | 프록시 오버헤드 산출 |

### Phase 2 — 시나리오 테스트 (1일)

| 순서 | 테스트 | VU | 목적 |
|------|--------|-----|------|
| 4 | Study 목록만 | 1→30 | 검색 API 부하 |
| 5 | 이미지 로딩 (Layer 3) | 1→20 | 대용량 전송 부하 |
| 6 | 혼합 시나리오 | 1→30 | 실제 사용 패턴 |

### Phase 3 — 스트레스 & 한계 테스트 (1일)

| 순서 | 테스트 | VU | 목적 |
|------|--------|-----|------|
| 7 | 스파이크 테스트 | 0→100→0 | 급격한 부하 대응 |
| 8 | 소크 테스트 | 20 (1시간) | 장시간 안정성 |
| 9 | 브레이크포인트 | 1→∞ | 한계점 도달 |

---

## 5단계: 모니터링 구성

### 5.1 웹서버 측 모니터링

```bash
# 실시간 리소스 모니터링
# CPU, Memory, Network, Disk I/O
htop                          # 프로세스 모니터링
iotop                         # 디스크 I/O
nethogs                       # 네트워크 프로세스별
ss -tlnp                      # 연결 상태
watch -n1 'ss -s'             # 소켓 통계 (TIME_WAIT 누적 감시)
```

**핵심 모니터링 항목**:

| 항목 | 임계값 | 확인 방법 |
|------|--------|----------|
| CPU 사용률 | < 80% | `top`, `mpstat` |
| 메모리 사용 | < 85% | `free -h`, `vmstat` |
| 열린 파일/소켓 수 | < ulimit | `lsof -p <PID> \| wc -l` |
| TCP TIME_WAIT | < 10,000 | `ss -s` |
| 네트워크 대역폭 | < 80% | `iftop`, `nload` |
| Node.js 이벤트 루프 지연 | < 100ms | 커스텀 미들웨어 |

### 5.2 PACS 서버 측 모니터링 (참고)

- FastAPI 응답 시간 로그
- 동시 연결 수
- DICOMweb 쿼리 실행 시간

### 5.3 k6 결과를 대시보드로 시각화

```bash
# InfluxDB + Grafana 연동
k6 run --out influxdb=http://localhost:8086/k6 script.js

# 또는 k6 Cloud (SaaS)
k6 cloud script.js

# 또는 CSV 출력
k6 run --out csv=results.csv script.js
```

---

## 6단계: 테스트 데이터 준비

### 6.1 테스트 계정

```bash
# 부하 테스트 전용 계정 생성 (PACS 서버에서)
# 동시 로그인 제한이 없는 테스트 계정 필요
# 예: loadtest_user_01 ~ loadtest_user_20
```

### 6.2 테스트 Study 데이터

```bash
# PACS에 테스트용 Study를 미리 업로드
# 다양한 크기의 Study 준비:
# - Small: 단일 시리즈, 50 슬라이스 (CT/MR)
# - Medium: 단일 시리즈, 200 슬라이스
# - Large: 다중 시리즈, 500+ 슬라이스
# - US: 초음파 3D 볼륨
```

### 6.3 인스턴스 UID 목록 추출

```bash
# PACS에서 테스트 Study의 인스턴스 UID를 추출하여 JSON 파일로 저장
curl "http://pacs-server:8083/dicomweb/studies/{STUDY_UID}/series/{SERIES_UID}/instances" \
  -H "Accept: application/dicom+json" \
  | jq '[.[].["00080018"].Value[0]]' > test-instance-uids.json
```

---

## 7단계: 결과 분석 및 보고

### 7.1 핵심 성능 지표 (KPI)

| 지표 | 목표값 | 설명 |
|------|--------|------|
| **동시 사용자 수** | ≥ 10명 | 동시 영상 열람 |
| **Study 목록 응답 시간** | p95 < 2초 | 검색 화면 |
| **이미지 프레임 응답 시간** | p95 < 3초 | 개별 프레임 |
| **전체 Study 로딩 시간** | < 30초 (200슬라이스) | 첫 화면 표시까지 |
| **에러율** | < 1% | HTTP 4xx/5xx |
| **처리량** | ≥ 500 req/s | 전체 시스템 |

### 7.2 병목 판별 기준

```
웹서버 CPU > 80%        → 웹서버 스케일업/아웃 필요
웹서버 메모리 > 85%      → 메모리 증설 또는 캐시 조정
프록시 오버헤드 > 100ms  → 프록시 설정 최적화 (keepalive, 버퍼)
PACS 응답 > 2초         → PACS 서버 병목 (별도 분석 필요)
TIME_WAIT > 10K         → 커넥션 풀링/keepalive 설정
네트워크 포화            → 대역폭 증설 또는 압축 적용
```

### 7.3 보고서 템플릿

```markdown
# 부하 테스트 결과 보고서

## 테스트 환경
- 웹서버: [스펙]
- PACS: [스펙]
- 네트워크: [대역폭]
- 테스트 일시: YYYY-MM-DD

## 요약
- 최대 동시 사용자: N명
- 임계점: N명 (응답 시간 급등)
- 주요 병목: [식별된 병목]

## 상세 결과
### Layer 1 (정적 자산)
### Layer 2 (프록시)
### Layer 3 (이미지 로딩)
### 혼합 시나리오

## 개선 권고사항
1. ...
2. ...
```

---

## 8단계: 일반적인 최적화 방향 (참고)

테스트 후 병목이 발견될 경우 적용할 수 있는 최적화:

### 웹서버 (개발 서버 → 프로덕션 전환)

```bash
# 개발 서버(webpack-dev-server)는 부하 테스트에 부적합
# 프로덕션 빌드 후 Nginx로 서빙 권장

yarn build
# → dist/ 디렉토리를 Nginx로 서빙
```

### Nginx 최적화 (프로덕션)

```nginx
# 프록시 성능 최적화 예시
upstream pacs_backend {
    server 192.168.0.202:8083;
    keepalive 64;                    # 커넥션 풀링
}

server {
    # 정적 자산 캐싱
    location ~* \.(js|css|wasm|png|jpg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 프록시 버퍼링
    location /dicomweb/ {
        proxy_pass http://pacs_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";      # keepalive 활성화
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
}
```

---

## 주의사항

1. **개발 서버 vs 프로덕션 서버**: `webpack-dev-server`는 개발 용도이므로, 실제 배포 환경을 대상으로 테스트하는 것이 의미 있습니다. 개발 서버 자체를 테스트하는 경우 결과가 프로덕션과 크게 다를 수 있습니다.

2. **네트워크 격리**: 부하 생성기와 테스트 대상이 같은 네트워크에 있어야 네트워크 지연이 결과에 영향을 미치지 않습니다.

3. **PACS 서버 영향**: 부하 테스트가 PACS 서버에도 부하를 줄 수 있으므로, 다른 사용자에게 영향이 없는 시간대에 수행하세요.

4. **점진적 증가**: VU를 급격히 늘리지 말고 단계적으로 증가시켜 정확한 임계점을 파악하세요.

5. **반복 실행**: 신뢰할 수 있는 결과를 위해 동일 테스트를 최소 3회 반복하세요.

---

**작성일**: 2026-03-16
**대상**: OHIF 기반 mView-WebV2 사내 개발 웹서버
