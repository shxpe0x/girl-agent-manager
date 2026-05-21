# Implementation Plan: manager-webui

## Overview

План пересборки фронтенда `webui/src/**` под manager-mode. Каждая задача — атомарный PR с typecheck + vite build зелёные. Как в `manager-mode`-спеке: ветки `<type>/<short-kebab>`, squash-merge, всегда от master, всегда с `npm run typecheck && npm run build:webui && npm run test` зелёными перед пушем. Никаких прямых пушей в master, никаких bump'ов версии (релизный коммит — финальная задача).

## Принципы

- **Размер PR** — целевой ≤300 строк диффа. Большие задачи дробить.
- **Атомарность** — каждый PR оставляет master в рабочем состоянии: typecheck + vite build + 322 теста зелёные.
- **Совместимость** — старые профили не ломаются (legacy-поля игнорируются молча).
- **Бэкенд не трогаем** — все эндпоинты уже задеплоены `manager-mode` спекой.

Размеры: `S` ≤ 100 строк, `M` ≤ 300, `L` > 300.

## Tasks

- [ ] 1. Подготовка api.ts: добавить недостающие manager-методы
  - Files: `webui/src/lib/api.ts`
  - Estimated diff size: S
  - Description: добавить `updateMandate(slug, text)` (PUT `/api/mandate/:slug`), `getMandate(slug)` (GET), `getWhitelist(slug)` (GET `/api/whitelist/:slug`), `updateWhitelist(slug, list)` (PUT). Если какие-то уже есть — пропустить. Не трогать тип `ProfileConfig` ещё (это отдельная задача 2).
  - Acceptance: `typecheck` зелёный; новые методы возвращают типизированный ответ.
  - _Requirements: 2.4, 2.5, 4 (частично)_

- [ ] 2. Очистка типа `ProfileConfig` и удаление legacy-методов api.ts
  - Files: `webui/src/lib/api.ts`
  - Estimated diff size: S
  - Description: удалить из `ProfileConfig` поля `stage`, `communication`, `vibe`, `ignoreTendency`. Удалить методы `listStages`, `listCommunicationPresets`, `getRelationship`, `getScoreHistory` (если есть; если нет — пропустить). Удалить интерфейсы `StagePreset`, `CommunicationPreset`. Удалить экспорт `Tab` `relationship` если он живёт в api.ts (вряд ли — в store.ts).
  - Acceptance: `typecheck` падает в местах, где legacy-поля используются — это ожидаемо, чинится в задачах 3, 4.
  - _Requirements: 4.2, 4.3_

- [ ] 3. Удалить `RelationshipPage` и legacy-таб
  - Files: удалить `webui/src/pages/RelationshipPage.tsx`; модифицировать `webui/src/lib/store.ts` (тип `Tab` без `relationship`); модифицировать `webui/src/App.tsx` (убрать import + ветку рендера).
  - Estimated diff size: S
  - Description: чистое удаление компонента и всех ссылок на таб `relationship`.
  - Acceptance: `typecheck` зелёный; vite build зелёный; в `Sidebar` пункт `Отношения` ещё может остаться — чинится в задаче 5.
  - _Requirements: 4.1, 4.4_

- [ ] 4. Удалить `SetupFlow` и редиректнуть «Новый профиль» на `/setup/manager`
  - Files: удалить `webui/src/pages/SetupFlow.tsx`; модифицировать `webui/src/App.tsx` (убрать import и условный рендер `<SetupFlow />`); модифицировать `webui/src/components/Sidebar.tsx` (клик по «Новый профиль» в profile-popover делает `pushState("/setup/manager")` + `popstate`).
  - Estimated diff size: S
  - Description: больше нет двух визардов — только manager. `showSetupFlow(true)` остаётся в store как no-op (не вызываем нигде; либо снимаем поле). По умолчанию `init()` при пустом списке профилей делает `pushState("/setup/manager")` + диспатчит `popstate`.
  - Acceptance: `typecheck` зелёный; vite build зелёный; UI с пустым списком профилей открывает manager-визард.
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 5. Sidebar: новая навигация (Контакты, Инбокс, brand)
  - Files: `webui/src/components/Sidebar.tsx`
  - Estimated diff size: S
  - Description: список `ITEMS` обновлён: `assistant`, `logs`, `contacts` (path `/contacts`), `inbox` (path `/inbox`), `configuration`, `memory`, `addons`, `diagnostics`. Без `relationship`. Brand `name`: `manager-agent`. Клик на `contacts`/`inbox` делает `pushState("/contacts/" + activeSlug)` (или без slug если нет активного) + `popstate`. Клик на остальные — `setTab(id)` + `pushState("/")`.
  - Acceptance: typecheck; vite build; визуально пункты `Контакты`/`Инбокс` есть, `Отношения` нет.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.6_

- [ ] 6. ConfigurationPage: переписать под manager-поля (форма)
  - Files: `webui/src/pages/ConfigurationPage.tsx`
  - Estimated diff size: L (разбить на 6a — форма и валидация; 6b — save flow с тремя API-вызовами)
  - Description: полная переписка. Карточки: Профиль (read-only), Mandate, Тон+Persona, Gate+AfterHours+Proactive+Тайминги, Whitelist (условно), Telegram, LLM, Расписание (sleep + busy). Inline-валидация. См. `design.md` секция «ConfigurationPage».
  - Acceptance: на странице нет ни одного legacy-поля; все 7+ карточек рендерятся; невалидные значения подсвечиваются.
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7_

- [ ] 6a. ConfigurationPage: форма + локальный стейт
  - Files: `webui/src/pages/ConfigurationPage.tsx`
  - Estimated diff size: M
  - Description: переписать render с нуля по дизайну, использовать только локальный `useState` для draft + `useStore(s => s.activeConfig)` для seed. Inline-валидация полей. Save-кнопка пока вызывает только toast «todo: save» (реальный flow — в 6b).
  - Acceptance: typecheck зелёный; vite build зелёный; форма открывается на профиле и показывает manager-поля.
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7_

- [ ] 6b. ConfigurationPage: save flow (mandate + whitelist + profile + apply)
  - Files: `webui/src/pages/ConfigurationPage.tsx`
  - Estimated diff size: S
  - Description: связать кнопку «Применить» с тремя вызовами: `updateMandate`, `updateWhitelist` (если изменился), `updateProfile`, затем `applyProfile`. Toast'ы успеха/ошибки. Серверные 400-ошибки раскладываем по полям через `payload.errors`.
  - Acceptance: правка mandate сохраняется и подхватывается runtime'ом ≤5 секунд; правка `gateLevel=whitelist` без whitelist → 400 с подсветкой поля; правка `escalationTimeoutMin=2` → 400.
  - _Requirements: 2.4, 2.5, 2.7, 2.8_

- [ ] 7. Совместимость со старыми профилями: смягчить чтение
  - Files: `webui/src/pages/ConfigurationPage.tsx` (если ещё нужно), `webui/src/lib/api.ts`
  - Estimated diff size: S
  - Description: в `ProfileConfig` отметить все legacy-поля как `Record<string, unknown>` или просто игнорировать. На клиенте: при чтении конфига полностью игнорим неизвестные ключи; при сохранении отправляем только manager-поля (whitelist payload через `Pick<ProfileConfig, ...>`). Если бэкенд возвращает `cfg.tone === undefined` — UI показывает дефолт `mixed-by-tier` и сразу включает «Не сохранено» индикатор.
  - Acceptance: открытие старого профиля без `tone` не падает; UI показывает дефолты.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. App.tsx: дефолт-редирект на `/setup/manager` при пустом списке
  - Files: `webui/src/App.tsx`, `webui/src/lib/store.ts`
  - Estimated diff size: S
  - Description: после `init()`, если `profiles.length === 0` AND текущий path `/` → `pushState("/setup/manager")` + `popstate`. Это делает старый `showSetup` поведение неактуальным; поле `showSetup` в store можно оставить как no-op для совместимости, но не использовать.
  - Acceptance: пустой data-dir + открытый WebUI → визард манагера сразу.
  - _Requirements: 1.1_

- [ ] 9. Финальный чекпойнт + acceptance grep
  - Files: nothing (только проверки)
  - Estimated diff size: S
  - Description: прогнать `npm run typecheck`, `npm run build:server`, `npm run build:webui`, `npm run test`. Запустить grep:
    ```bash
    grep -rE "ignoreTendency|findStage|relationship\\.md|listStages|listCommunicationPresets|cute|alt|clingy|chatty|Тенденция игнора|Стадия отношений" webui/src/
    ```
    Должно быть пусто. Размер `dist/cli.js` ≤1.1 MB. Размер vite-bundle gzip ≤80 KB.
  - Acceptance: всё зелёное; grep пустой.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. CHANGELOG + bump до v0.5.3 + публикация
  - Files: `CHANGELOG.md`, `package.json`, `package-lock.json`
  - Estimated diff size: S
  - Description: секция `[0.5.3]` с описанием webui-пересборки. Bump до `0.5.3`. Релизный коммит `chore(release): v0.5.3` отдельным PR. После merge — тег `v0.5.3` и `npm publish` (если включён CI workflow с `NPM_TOKEN`, тег триггерит автопубликацию; иначе вручную).
  - Acceptance: `npx @shxpe/manager-agent@0.5.3` ставит свежий бандл с manager-UI.
  - _Requirements: pre-push checklist + release rules_

## Notes

- Тестов на сам UI не пишем (нет инфраструктуры под React-component-тесты в репо). Качественная проверка — typecheck + vite build + ручное smoke.
- Property webui-cleanup (grep на отсутствие legacy-маркеров) — формальная гарантия чистки.
- Каждая задача → одна ветка `<type>/<short-kebab>` и один PR ≤400 строк диффа по `git-push-rules.md`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "4"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["6a"] },
    { "id": 5, "tasks": ["6b"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8"] },
    { "id": 8, "tasks": ["9"] },
    { "id": 9, "tasks": ["10"] }
  ]
}
```
