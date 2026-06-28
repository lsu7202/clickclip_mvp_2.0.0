# ClickClip 2.0.0

대본 → 장면 분할 → 자막1/자막2 · TTS · 미디어 → **CapCut draft** 내보내기.
명세 단일 진실원천: [specs/2.0.0_master_spec.md](specs/2.0.0_master_spec.md).

## 구성 (도커 3컨테이너)
| 서비스 | 스택 | 포트 | 컨벤션 |
|---|---|---|---|
| frontend | React + Vite | 5173 | camelCase |
| backend | Node + Express (+ffmpeg) | 4000 | camelCase, snake↔camel 경계 변환 |
| ai_server | FastAPI (+ffmpeg) | 8000 | snake_case (wire와 동일) |

이름 흔들림 차단: 변환은 **두 경계에서만** — 프론트 API 클라이언트(`src/api/client.js`),
백엔드 미들웨어(`src/middleware/caseConvert.js`). AI 서버는 변환 0.

## 실행
```bash
cp .env.example .env      # 키 채우기 (Gemini/Typecast/fal/Giphy/SerpAPI/GCP)
docker compose up --build
```
- 프론트: http://localhost:5173
- 백엔드 헬스: http://localhost:4000/health
- AI 헬스: http://localhost:8000/health

## 사용자 리소스 (Finder로 직접 관리, bind mount)
| 폴더 | 내용 |
|---|---|
| `resources/my_templates` | 프레임 오버레이 `<name>.png` (알파 필수, jpeg 불가) |
| `resources/my_samples` | AI 참조 이미지 |
| `resources/my_styles` | 스타일 프리셋 `<name>.txt`(프롬프트) + `<name>.jpg`(예시) 짝 |
| `resources/my_voices` | 보이스 미리듣기 `<voice_id>.mp3` |
| `resources/capcut_template` | 골든 draft 스켈레톤(`draft_info.json`/`draft_meta_info.json`) — export 필수 |
| `resources/fonts` | 자막 폰트 |
| `resources/gcp` | `credentials.json` (Video Intelligence 샷 감지용) |

생성 산출물: `data/workspace`(에셋), `data/capcut_drafts`(export 결과).

## 코딩 전 재검증 필요 (§6.7 / §9.3)
- Typecast with-timestamps 응답 스키마(키명) — `ai_server/app/services/typecast.py` 방어적 파싱 중.
- Gemini `response_schema` 형식(dict vs Schema) — `ai_server/app/services/gemini.py`.
- CapCut 골든 스켈레톤 트랙/세그먼트 형태 — `backend/src/lib/capcut/draftBuilder.js` (복제-변형 방식).
