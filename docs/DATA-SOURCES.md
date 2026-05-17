# 데이터 출처 마스터 — KOSIS · SGIS · 외부 통계 ↔ 21개 농촌다움 지표

> 농촌다움 지표 21개(공통 11 + 남양주 자율 10) 각각이 어떤 API/출처와 산식으로 구성되는지를 정리한 마스터 매핑.  
> `fetch_kosis.py` / `fetch_sgis.py` 에 새 테이블 추가 전, 또는 manual 입력 채우기 전 이 문서 참조.

**최종 갱신**: 2026.05  
**검증 환경**: KOSIS Open API v3, SGIS Open API v3

---

## 1. 데이터 출처 개요

| 출처 | 접근 방식 | 우리 활용 범위 |
|------|----------|---------------|
| **KOSIS Open API** | apiKey (단일) | 시군구별 주민등록인구·세대수 (월간 갱신) |
| **SGIS Open API** | ServiceID + SecretKey → AccessToken (4시간) | 시군구별 총조사 통계 (노령화·사업체·농가·주택 등) |
| **manual (수동 입력)** | `region-meta.json` 편집 | KOSIS·SGIS에 없는 항목 (재정자립도·국가유산 등) |

각 raw 필드는 `source` 메타로 출처 추적:
```jsonc
"raw": {
  "population": { "value": 728126, "year": "202604", "source": "kosis:DT_1B040A3" },
  "aging_idx":  { "value": 31.5,   "year": "2023",   "source": "sgis:main_stats" },
  "W3_fiscal_independence": { "value": 38.6, "year": "2024", "source": "manual:지방재정365" }
}
```

---

## 2. Tier 분류

| Tier | 정의 | 출처 |
|------|------|------|
| **1** | KOSIS API로 즉시 수집 가능 | KOSIS `DT_1B040A3`, `DT_1B040B3` |
| **2** | SGIS API로 수집 가능 (자격증명 활성화 필요) | SGIS 통계 API |
| **3** | 외부 출처 (Excel 다운로드 또는 별도 API) — manual 입력 | 지방재정365·문화재청 등 |

---

## 3. 21개 지표 × 출처 매핑 마스터

### 공통지표 11개

| 키 | 지표명 | 카테고리 | 단위 | 산식 분해 | 출처 후보 | Tier | 비고 |
|----|--------|----------|------|----------|----------|------|------|
| **L1** | 인구증가율 | 삶터 | % | (현재-전년)/전년×100 | KOSIS `DT_1B040A3` × 13개월 | **1** | ✅ 자동 계산 (`computed.L1_pop_growth_rate`) |
| **L2** | 노령화지수 | 삶터 | — | 65세↑/14세↓×100 | SGIS `population.json` (aging_idx) | **2** | SGIS 권한 활성화 후 자동 |
| **L3** | 인구순이동률 | 삶터 | ‰ | (전입-전출)/총인구×1000 | KOSIS 시군구 별도 표 검색 필요 | **3** | manual 입력 |
| **L4** | 생활SOC 충족지수 | 삶터 | % | 보유SOC/전체×100 | 행안부 생활SOC 통계 | **3** | manual + GIS 분석 |
| **W1** | 고용률 | 일터 | % | 취업자/생산가능×100 | KOSIS 지역별 고용조사 | **3** | manual 입력 |
| **W2** | 사업체수 | 일터 | 개 | 전산업 사업체 합계 | SGIS `company.json` | **2** | SGIS 권한 활성화 후 |
| **W3** | 재정자립도 | 일터 | % | (지방세+세외)/예산×100 | 지방재정365 | **3** | manual 입력 |
| **W4** | GRDP | 일터 | 억원 | 시군구별 GRDP | 통계청 시군구 지역내총생산 표 | **3** | KOSIS Excel 다운 후 manual |
| **R1** | 농촌환경 보전율 | 쉼터 | % | 보전지역/전체×100 | 국토부 토지이용현황도 | **3** | GIS 직접 분석 |
| **R2** | 토지이용 다양성 | 쉼터 | H (Shannon) | -Σ(pi×ln pi) | NGII 연속지적도 | **3** | GIS 직접 분석 |
| **R3** | 녹지율 | 쉼터 | % | 녹지면적/전체×100 | 환경부 토지피복도 | **3** | GIS 직접 분석 |

### 남양주 자율지표 10개 (8 + 신규 2)

| 키 | 지표명 | 카테고리 | 단위 | 산식 / 정의 | 출처 후보 | Tier | 비고 |
|----|--------|----------|------|------------|----------|------|------|
| **L5** | 귀촌인 증감률 | 삶터 | % | 2개년 귀촌자 변화 | 귀농어귀촌통계 | **3** | manual 입력 |
| **L6** | 3년 귀촌 유지율 | 삶터 | % | 3년 후 잔존 비율 | 별도 추적조사 | **3** | manual 입력 |
| **W5** | 농업 세대교체 수준 | 일터 | % | 청년 농가경영주 비율 | SGIS `farmhousehold.json` + 농업총조사 | **2** | SGIS 활성화 후 일부 자동 |
| **W6** | 청년 귀농 유입 비율 | 일터 | % | 40세↓ 귀농자/전체 | 농림부 귀농 통계 | **3** | manual 입력 |
| **W7** | 친환경 인증 농가 비율 | 일터 | % | 인증농가/전체농가 | 농산물품질관리원 | **3** | manual 입력 |
| **R4** | 인구 1천명당 체험 프로그램 | 쉼터 | 건/천명 | 프로그램수/(인구÷1000) | 농림부 / 시군 자료 | **3** | manual 입력 |
| **R5** | 양호수질 하천 비율 | 쉼터 | % | 1·2급 하천/전체 | 환경부 수질측정망 | **3** | manual 입력 |
| **R6** | 수변·생태쉼터 면적 | 쉼터 | ㎡/천명 | 조성면적/(인구÷1000) | 시군 공원녹지 자료 | **3** | manual 입력 |
| **R8** | 국가유산 (신규) | 쉼터 | 개 | 지정유산 수 | 문화재청 국가유산포털 | **3** | manual 입력 |
| **W8** | 서비스판매 종사자 (신규) | 일터 | 명 | 도소매(G) + 숙박음식(I) 종사자 | SGIS `company.json` + class_code | **2** | SGIS 활성화 후 자동 |

---

## 4. KOSIS Open API — 활성 테이블

### 4-1. `DT_1B040A3` 시군구별 주민등록인구

| 항목 | 값 |
|------|---|
| orgId | 101 |
| 주기 | 월(M), 최신 13개월 (현재 + 12개월 전) |
| 차원 | C1 = 행정구역코드 (5자리) |
| ITM_IDs | T20=총인구수, T21=남자, T22=여자 |
| 파라미터 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=13` |
| 산출 | `raw.population`, `raw.population_prev` → `computed.L1_pop_growth_rate` |

### 4-2. `DT_1B040B3` 시군구별 주민등록세대수

| 항목 | 값 |
|------|---|
| orgId | 101 |
| 주기 | 월(M), 최신 1개월 |
| ITM_IDs | T1=세대수 |
| 파라미터 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=1` |
| 산출 | `raw.households` |

---

## 5. KOSIS API 제약 사항

| tblId | 표 이름 | 검증 결과 (2026-05) |
|-------|---------|--------------------|
| DT_1B26001 | 시군구/성/연령별 이동자수 | C1=시도, C2=성별, C3=연령. **시군구 breakdown 없음** |
| DT_1C81 | 시도별 지역내총생산 | 1512행, 경기 시군구 0행. 시도 단위만 |
| DT_1B81A21 | 합계출산율 | C1=KOSIS 내부 시도코드, 시군구 없음 |
| DT_1IN1502 | 인구통계 노령화지수 | `objL1=ALL&itmId=ALL` → ERR 31 (40,000셀 초과) → SGIS aging_idx로 대체 |
| DT_1K51003 | 전국사업체조사 시군구 | ERR 31 → SGIS `company.json`으로 대체 |
| DT_1B040M1 | 행정구역(읍면동)별 인구 | ERR 31. 시도 코드 형식 미확인 |
| DT_1ET2002 (귀농귀촌) 외 | 다수 ID | ERR 21 (해당 표 없음) |

→ 시군구 통계는 KOSIS 웹 → Excel 다운 → manual 입력, 또는 **SGIS API 활용**.

---

## 6. SGIS Open API — 활용 계획

### 6-1. 인증

```
GET https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json
    ?consumer_key=<Service ID>&consumer_secret=<Secret Key>
→ { result: { accessToken: "...", accessTimeout: "..." }, errCd: 0 }
```

AccessToken 유효기간 **4시간**. 스크립트 실행 시 매번 신규 발급 (메모리 보관).

### 6-2. 통계 API endpoint (시군구 단위)

| key | endpoint | 산출 raw 필드 | 우리 지표 |
|-----|----------|--------------|----------|
| `main_stats` | `stats/population.json` | tot_ppltn, avg_age, ppltn_dnsty, **aged_child_idx**, tot_house, corp_cnt, tot_family | L2 노령화지수 |
| `company_all` | `stats/company.json` | all_corp_cnt, all_tot_worker | W2 사업체수 |
| `company_wholesale` | `stats/company.json` (`class_code=G`) | wholesale_corp_cnt, wholesale_tot_worker | W8 일부 |
| `company_hospitality` | `stats/company.json` (`class_code=I`) | hospitality_corp_cnt, hospitality_tot_worker | W8 일부 |
| `farm` | `stats/farmhousehold.json` | farm_cnt, farm_population | W5 입력 |
| `house` | `stats/house.json` | house_cnt | L4 보조 |
| `forestry` | `stats/forestryhousehold.json` | forestry_cnt, forestry_population | 농촌성 보조 |
| `fishery` | `stats/fisheryhousehold.json` | fishery_cnt, fishery_population | 농촌성 보조 |
| `household_member` | `stats/householdmember.json` | avg_family_member_cnt | 가구 보조 |

**호출 패턴**: `adm_cd='41'&low_search='1'` → 경기도 시군구 한 번에 (15시군 = 1회 호출).

**응답 구조**:
```jsonc
{
  "id": "API_XXXX",
  "result": [
    { "adm_cd": "41360", "adm_nm": "남양주시", ...stats }
  ],
  "errCd": 0,
  "errMsg": "Success"
}
```

### 6-3. 현재 상태 ✅ 정상 작동

- 자격증명 (Service ID·Secret Key) 활성화 완료
- **9개 endpoint 중 8개 성공** (어가 통계는 일부 시군에 데이터 없음 — 내륙 지역 제외, 10/15 시군 매핑)
- `python fetch_sgis.py` 실행 시 시군당 평균 16개 raw 필드 수집

### 6-4. SGIS 코드 체계 ⚠️

SGIS는 **KOSIS 내부 분류코드** 사용 (행안부 표준 코드와 다름):

| 우리 city_id | 행안부 표준 (KOSIS DT_*) | SGIS 코드 |
|------------|------------------------|----------|
| (시도) 경기도 | 41 | **31** |
| pyeongtaek | 41220 | 31070 |
| namyangju | 41360 | 31130 |
| yongin | 41460 | **31191, 31192, 31193** (3개 분구 합산) |
| icheon | 41500 | 31210 |
| anseong | 41550 | 31220 |
| hwaseong | 41590 | 31240 |
| gwangju | 41610 | 31250 |
| yangju | 41630 | 31260 |
| pocheon | 41650 | 31270 |
| yeoju | 41670 | 31280 |
| gapyeong | 41820 | 31570 |
| yangpyeong | 41830 | 31580 |
| osan | 41370 | 31140 |
| hanam | 41450 | 31180 |
| dongducheon | 41250 | 31080 |

**용인시 분구 처리**: 카운트류(사업체수·농가수 등)는 3개 분구 합산, 비율/평균류(평균나이·노령화지수)는 단순 평균.

매핑은 `scripts/lib_meta.py` 의 `SGIS_SIGUN_CODES` / `SGIS_CODE_TO_CITY` 참조.

### 6-5. 인증 루프 (`-401` 토큰 만료)

`SgisClient.call()` 내부에서 자동 처리:
1. 응답 `errCd == -401` 감지
2. `authenticate()` 재호출 → 새 토큰
3. 동일 요청 1회 재시도
4. 안전장치: 최대 10회 재발급 후 RuntimeError

### 6-4. 산업분류 코드 (SGIS class_code)

SGIS의 산업분류는 KSIC 표준 따름. W8 (서비스판매 종사자) 계산용:
- `G` = 도매 및 소매업
- `I` = 숙박 및 음식점업
- 합계 = W8 서비스판매 종사자 (산식: `wholesale_tot_worker + hospitality_tot_worker`)

전체 산업분류 트리는 `industrycode.json` API로 조회 가능.

---

## 7. 외부 출처 (Tier 3 — manual 입력)

KOSIS·SGIS API로 접근 불가능. `region-meta.json`의 `manual` 층에 사용자가 직접 입력.

| 지표 | 출처 | URL |
|------|------|-----|
| W3 재정자립도 | 행안부 지방재정365 | https://lofin.mois.go.kr/ |
| L4 생활SOC | 행안부 생활SOC 통계 | https://www.mois.go.kr/ |
| W7 친환경 인증 농가 | 국립농산물품질관리원 | https://www.naqs.go.kr/ |
| R4 농촌 체험 프로그램 | 농림축산식품부 / 시군 자료 | https://www.welchon.com/ |
| R5 양호수질 하천 비율 | 환경부 수질측정망 | https://water.nier.go.kr/ |
| R6 수변·생태쉼터 면적 | 각 시군 공원녹지 자료 | 시군 자료 |
| R1~R3 환경·토지 지표 | 환경부 EGIS / 국토부 NGII | https://egis.me.go.kr/ |
| **R8 국가유산** | 문화재청 국가유산포털 | https://www.heritage.go.kr/ |
| L3 인구순이동률 | KOSIS Excel 다운 (시군구별) | https://kosis.kr/ |
| W4 GRDP | KOSIS Excel 다운 (시군구별 지역내총생산) | https://kosis.kr/ |
| L5/L6/W6 귀농귀촌 | 농림부 / KOSIS Excel | https://kosis.kr/ |

---

## 8. 산식 자동 계산 — `compute_indicators()` (`scripts/lib_meta.py`)

| computed key | 산식 | 필요 raw 필드 | 단위 |
|-------------|------|--------------|------|
| `L1_pop_growth_rate` | (현재-전년)/전년×100 | `population`, `population_prev` (KOSIS) | % |
| `L2_aging_index` | 65세↑/0-14세×100 (SGIS 직접) | `aged_child_idx` (SGIS) | — |
| `L3_net_migration_rate` | (전입-전출)/인구×1000 | `inflow`, `outflow`, `population` | ‰ |
| `W2_business_count` | 전산업 사업체 합계 | `corp_cnt` (SGIS) | 개 |
| `W8_service_sales_workers` | 도소매(G) 종사자 + 숙박음식(I) 종사자 | `wholesale_tot_worker`, `hospitality_tot_worker` | 명 |

새 산식 추가 시 `scripts/lib_meta.py`의 `compute_indicators()` 에 분기 추가.  
필요한 raw 필드가 모두 존재할 때만 계산되며, 누락 시 해당 computed 키는 생성되지 않음 (UI는 자동 hide).

---

## 9. region-meta.json 3-layer 스키마

```jsonc
{
  "_meta": {
    "source":     "kosis_api + sgis_api + manual",
    "fetched_at": "2026-05-17T...",
    "schema":     "3-layer (raw / computed / manual)",
    "tables":     { /* 각 KOSIS/SGIS 호출별 status */ },
    "coverage":   { "sigun": 15, "dong": 0 }
  },
  "sigun": {
    "namyangju": {
      "raw":      { /* KOSIS·SGIS API 원본 — 각 필드에 source 메타 */ },
      "computed": { /* 산식 계산값 — raw로부터 결정론적 */ },
      "manual":   { /* 사용자 직접 입력값 — 스크립트가 보존 */ }
    }
  }
}
```

### 협업 규칙
- **두 스크립트(`fetch_kosis.py`, `fetch_sgis.py`)**는 각자 자기 source 만 갱신:
  - KOSIS 실행 → `source='kosis:*'`인 raw 필드만 덮어씀, SGIS raw·manual 보존
  - SGIS 실행 → `source='sgis:*'`인 raw 필드만 덮어씀, KOSIS raw·manual 보존
- `compute_indicators()`는 매 실행 시 raw 전체 기반으로 재계산 (출처 무관)

### manual 입력 예시
```jsonc
"manual": {
  "W3_fiscal_independence": {
    "value": 38.6,
    "year": "2024",
    "source": "manual:지방재정365",
    "updated_by": "your_name",
    "updated_at": "2026-05-17"
  },
  "R8_heritage_count": {
    "value": 12,
    "year": "2025",
    "source": "manual:문화재청"
  }
}
```

---

## 10. 와이어프레임 0518 — 4슬라이드 데이터 매핑

| 슬라이드 | 유형 | 필요 지표 | 데이터 출처 |
|---------|------|----------|------------|
| 1 | 정주환경 보완형 | L4 생활SOC + 의료시설 by 읍면 | manual + SGIS health (별도) |
| 2 | 스마트농업 육성형 | W7 친환경 농가 + W5 농업 세대교체 시계열 | manual + SGIS `farm` |
| 3 | 문화관광 활용형 | R5 수변·생태쉼터 + **R8 국가유산** | manual (환경부 + 문화재청) |
| 4 | 산업물류 연계형 | **W8 서비스판매 종사자** + 교통 접근성 | **SGIS `company` G+I** + 외부 |

→ SGIS 활성화 후 슬라이드 2·4 의 핵심 데이터 자동 수집 가능.

---

## 11. 향후 추가 우선순위

| 우선순위 | 항목 | 작업 |
|---------|------|------|
| ★★★ | SGIS 통계 권한 활성화 확인 | `fetch_sgis.py` 재실행 — L2·W2·W8·W5(부분) 즉시 해결 |
| ★★★ | W3 재정자립도 | 지방재정365 다운 → manual 입력 (15시군 × 1년) |
| ★★ | W4 GRDP 시군구 | KOSIS 웹 Excel 다운 → manual 입력 |
| ★★ | L3 인구순이동률 | KOSIS 시군구 별표 검색 (또는 manual) |
| ★ | R8 국가유산 | 문화재청 데이터 → manual 입력 |
| ★ | L5/L6/W6 귀농귀촌 | KOSIS Excel 다운 → manual 입력 |

---

*신규 KOSIS·SGIS 테이블 추가 절차는 [`scripts/README.md`](../scripts/README.md) 참조.*
