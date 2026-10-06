ZNAYA 1.0 — Release Candidate 1
Етап 6: QA + hardening

Какво е заключено в RC1:
- единен ZNAYA App Shell;
- Create → Library → Study → Review → Subjects → Progress → Settings;
- интерактивни типове въпроси, включително „Свързване“;
- постоянен Puter credit indicator във всеки изглед;
- Puter.js е единственият AI доставчик;
- няма видими AI provider/model/API-key настройки;
- backup/import и управление на локалните данни;
- PWA/service-worker cache с версия znaya-1.0.0-rc1;
- legacy BioHim URL адресите отварят ZNAYA;
- съвместимост със старите localStorage данни на BioHim 4.4.

Puter кредити:
ZNAYA чете puter.auth.getMonthlyUsage().allowanceInfo. За познат и лесен за четене индикатор оставащият дял от месечната квота се нормализира към скала 0–1000. Например 80.58% оставаща квота се показва като 805,8 / 1000. Индикаторът се обновява при зареждане, връщане към таба, възстановяване на мрежата и след AI генериране.

Старт локално:
- npm start
- или START_ZNAYA.bat / START_ZNAYA.ps1

Health check:
- GET /api/health
- очаквана версия: 1.0.0-rc1
