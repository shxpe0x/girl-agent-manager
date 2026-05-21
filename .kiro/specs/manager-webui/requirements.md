# Requirements: manager-webui

## Введение

`manager-webui` — это полная пересборка фронтенда WebUI под manager-mode. Бэкенд-эндпоинты `/api/profiles`, `/api/mandate`, `/api/whitelist`, `/api/contacts`, `/api/inbox` уже задеплоены в спеке `manager-mode` (Tasks 5.1-5.5). Спека `manager-mode` сосредоточилась на серверной части и трёх страницах фронта (`/setup/manager`, `/contacts/:slug`, `/inbox/:slug`), но **не тронула** старый legacy-UI: `SetupFlow.tsx`, `ConfigurationPage.tsx`, `RelationshipPage.tsx`, `Sidebar.tsx`. В этих файлах остались поля от girl-agent — стадии отношений, communication-пресеты, тенденция игнора, vibe, релейшеншип-скор. Это создаёт впечатление «недопиленного» продукта: визард создаёт менеджера правильно, но дальше пользователь видит ползунок «Тенденция игнора», 5 пресетов общения и страницу «Отношения».

Цель: убрать всё legacy и собрать единый UI, отражающий manager-mode-модель данных. Все изменения только во фронтенде (`webui/src/**`) — серверные эндпоинты не меняются.

---

## Глоссарий

- **Legacy-поля** — поля `ProfileConfig`, оставшиеся от girl-agent: `stage`, `communication`, `vibe`, `ignoreTendency`, `personaNotes` (как «персона девушки»). Часть из них уже формально отсутствует в манагерском дизайне (`stage` — заглушка, `communication` — 1 «manager-default» пресет), но всё ещё рендерится в UI.
- **Manager-поля** — поля, заведённые спекой manager-mode: `tone`, `personaStyle`, `gateLevel`, `whitelist`, `afterHoursPolicy`, `proactiveClients`, `proactiveBoss`, `mandate`, `escalationTimeoutMin`, `digestPeriodHours`, `digestTime`, `ownerId`.
- **Tab** — пункт сайдбара/таб в zustand-стейте: `assistant`, `logs`, `relationship`, `configuration`, `memory`, `addons`, `diagnostics`. Будет переработан.

---

## Requirements

### Requirement 1: Дефолтный визард ведёт в manager-flow

**User Story:** Как пользователь, открывший пустой WebUI без профилей, я хочу попасть в manager-визард, чтобы не тратить время на legacy-форму girl-agent.

#### Acceptance Criteria

1. WHEN пользователь открывает WebUI без профилей THEN UI SHALL автоматически редиректить на `/setup/manager` (либо встроенно показывать `SetupManagerPage`, минуя `SetupFlow`).
2. WHEN пользователь нажимает «Новый профиль» в `Sidebar` profile-popover THEN UI SHALL открывать `/setup/manager`, не легаси-визард.
3. THE UI SHALL NOT отображать `SetupFlow.tsx` ни в каких сценариях (компонент удаляется или становится no-op заглушкой с редиректом).
4. THE `/setup/manager` визард SHALL остаться функциональным (продолжает работать — это спека `manager-mode` Task 5.6).

### Requirement 2: ConfigurationPage отражает manager-поля

**User Story:** Как владелец работающего менеджера, я хочу из дашборда менять mandate, тон, gate, расписание дайджестов и whitelist без рестарта.

#### Acceptance Criteria

1. WHEN пользователь открывает таб `Configuration` THEN UI SHALL отрисовать форму со следующими полями (все hot-reload через существующий `subscribeConfig`):
   - `mandate` (textarea, ≤4000) — через `PUT /api/mandate/:slug`
   - `tone` (3 значения: `formal-вы` / `friendly-ты` / `mixed-by-tier`) — через `PUT /api/profiles/:slug`
   - `personaStyle` (3 значения: `gender-neutral-assistant` / `female-secretary` / `male-secretary`)
   - `gateLevel` (3 значения: `open` / `gated` / `whitelist`)
   - `afterHoursPolicy` (3 значения: `silent` / `auto-reply` / `vip-only`)
   - `proactiveClients`, `proactiveBoss` (toggle)
   - `escalationTimeoutMin` (5..1440), `digestPeriodHours` (1..168), `digestTime` (HH:MM)
   - блок Whitelist (отдельная карточка, появляется только при `gateLevel=whitelist`) — через `PUT /api/whitelist/:slug`
   - блок Telegram (`mode`, `botToken` для бот-режима, hint «измени через CLI» для userbot)
   - блок LLM (`presetId`, `model`, `apiKey`)
   - блок WorkSchedule (`sleepFrom`, `sleepTo` HH:MM; `busySchedule` — список интервалов с днями недели и time-window)
2. THE UI SHALL NOT отображать ни одного из legacy-полей: stage / 5 communication-пресетов / vibe / ignoreTendency / persona-notes-как-девушка.
3. THE поле `personaNotes` SHALL остаться в виде «системные заметки для LLM» (manager-нейтральная подпись) — оно полезно как свободный контекст.
4. WHEN пользователь правит mandate и жмёт Save THEN UI SHALL отправить `PUT /api/mandate/:slug` отдельно от `PUT /api/profiles/:slug` (mandate хранится в `mandate.md`, не в `config.json`).
5. WHEN пользователь правит whitelist и жмёт Save THEN UI SHALL отправить `PUT /api/whitelist/:slug` отдельно (валидируется в Task 5.3).
6. WHEN пользователь меняет `gateLevel` с/на `whitelist` THEN UI SHALL показать/скрыть Whitelist-карточку без перезагрузки страницы.
7. WHEN сохранение упало с 400 (валидация) THEN UI SHALL показать поле-уровневые ошибки из `payload.errors`, не теряя остальные значения.
8. THE UI SHALL автоматически рестартить runtime после успешного `PUT /api/profiles/:slug` (через существующий `api.applyProfile`).

### Requirement 3: Sidebar убирает Relationship и добавляет Contacts/Inbox

**User Story:** Как пользователь, я хочу видеть в сайдбаре навигацию по менеджеру (контакты, инбокс), а не «Отношения».

#### Acceptance Criteria

1. THE Sidebar SHALL отображать пункты: `Помощник` (assistant), `Логи / статус` (logs), `Контакты` (contacts → `/contacts/<slug>`), `Инбокс` (inbox → `/inbox/<slug>`), `Конфигурация` (configuration), `Память` (memory), `Аддоны` (addons), `Диагностика` (diagnostics).
2. THE Sidebar SHALL NOT отображать пункт `Отношения` (`relationship`).
3. WHEN пользователь нажимает `Контакты` THEN UI SHALL push'ать `/contacts/<slug>` в history и переключаться на `ContactsPage` (через существующий popstate-роутер).
4. WHEN пользователь нажимает `Инбокс` THEN UI SHALL push'ать `/inbox/<slug>` и переключаться на `InboxPage`.
5. THE Sidebar `brand` SHALL отображать `manager-agent` вместо `girl-agent`.

### Requirement 4: Удаление RelationshipPage и legacy-API из api.ts

**User Story:** Как разработчик, я хочу чтобы фронт не дёргал API girl-agent, иначе мёртвый код тянет dist и вводит в заблуждение.

#### Acceptance Criteria

1. THE `webui/src/pages/RelationshipPage.tsx` SHALL быть удалён.
2. THE `webui/src/lib/api.ts` SHALL NOT содержать `listStages`, `listCommunicationPresets`, `getRelationship`, `getScoreHistory` (или другие романтические эндпоинты).
3. THE `webui/src/lib/api.ts` SHALL NOT содержать legacy-поля в типе `ProfileConfig`: `stage`, `communication`, `vibe`, `ignoreTendency` (поле `personaNotes` остаётся).
4. THE `webui/src/lib/store.ts` SHALL NOT содержать таб `relationship`. Тип `Tab` обновляется.
5. WHEN frontend бандл собирается через `vite build` THEN bundle size SHALL уменьшиться или остаться примерно прежним (≤270 KB raw, ≤80 KB gzip — текущий baseline 261 KB).

### Requirement 5: TabRouting путей и таб-переключений

**User Story:** Как пользователь, я хочу одинакового поведения навигации: и сайдбар, и URL дают тот же экран.

#### Acceptance Criteria

1. WHEN URL `/contacts/<slug>` THEN UI SHALL отрендерить `ContactsPage`, и в стейте `tab` останется любым (URL имеет приоритет).
2. WHEN URL `/inbox/<slug>` THEN UI SHALL отрендерить `InboxPage`.
3. WHEN URL `/setup/manager` THEN UI SHALL отрендерить `SetupManagerPage`.
4. WHEN URL `/` THEN UI SHALL отрендерить таб-UI согласно `tab` в zustand-стейте (`logs` по умолчанию).
5. WHEN пользователь делает `back/forward` в браузере THEN UI SHALL правильно подхватить URL через `popstate`-listener (как сейчас).
6. THE сайдбар при клике на «Контакты» / «Инбокс» SHALL делать `pushState` на соответствующий URL и диспатчить `popstate`-event для синка.

### Requirement 6: Совместимость с существующими профилями

**User Story:** Как существующий пользователь форка, я не хочу сломать профили, которые уже создавались через старый `SetupFlow` или вообще через CLI.

#### Acceptance Criteria

1. WHEN UI открывает профиль, у которого `cfg.tone` / `cfg.personaStyle` / `cfg.gateLevel` отсутствуют THEN UI SHALL отображать сейфовые дефолты (`mixed-by-tier` / `gender-neutral-assistant` / `gated`) и предлагать сохранить актуальные значения.
2. WHEN UI обнаруживает легаси-поля (`cfg.stage`, `cfg.communication`, `cfg.ignoreTendency`, `cfg.vibe`) в загруженном конфиге THEN UI SHALL их игнорировать, не показывать пользователю и не отправлять обратно в `PUT /api/profiles/:slug` (бэкенд тоже не должен их валидировать строго — только пропустить).
3. WHEN пользователь сохраняет конфиг через manager-Configuration THEN отправляемый payload SHALL содержать только manager-поля плюс универсальные (`name`, `age`, `nationality`, `tz`, `mode`, `llm`, `telegram`, `privacy`, `personaNotes`, `sleepFrom/sleepTo`, `busySchedule`, `ownerId`).

### Requirement 7: Тестируемость

**User Story:** Как мейнтейнер, я хочу убедиться, что фронт-перерисовка не сломала существующие 322 теста и что критичные UI-флоу покрыты.

#### Acceptance Criteria

1. THE `npm run test` SHALL оставаться зелёным (≥322 теста).
2. THE `npm run typecheck` SHALL оставаться зелёным.
3. THE `npm run build:webui` SHALL собирать вivite без warning'ов.
4. THE `npm run build:server` SHALL давать `dist/cli.js` ≤1.1 MB.
5. THE acceptance-проверка через `grep` SHALL подтвердить отсутствие в `webui/src/**` строк: `ignoreTendency`, `findStage`, `relationship.md`, `cute|alt|clingy|chatty`, `Тенденция игнора`, `Стадия отношений`. Грепы — часть финального чекпойнта.
