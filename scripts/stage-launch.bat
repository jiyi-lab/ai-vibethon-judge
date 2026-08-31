@echo off
rem 무대 스크린 런처 — 더블클릭 한 번으로 끝 (8/22, "언락 지워" 요청).
rem
rem 하는 일: 크롬을 자동재생 허용 + 전체화면(키오스크)으로 띄운다.
rem   - 자동재생 정책을 끄므로 클릭/키 입력 없이 효과음이 바로 난다
rem   - 별도 프로필(%TEMP%\al-stage)을 쓰는 이유: 크롬이 이미 떠 있으면
rem     플래그가 무시되는데, 프로필을 분리하면 새 프로세스로 떠서 항상 적용된다
rem   - 종료: Alt+F4
rem
rem 리허설용으로 다른 주소를 쓰려면 아래 URL 만 바꾸면 된다.

set URL=https://animal-league-nine.vercel.app

start "" chrome --kiosk --autoplay-policy=no-user-gesture-required --no-first-run --user-data-dir=%TEMP%\al-stage "%URL%"
