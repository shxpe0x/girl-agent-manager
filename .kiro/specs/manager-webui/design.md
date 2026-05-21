# Design: manager-webui

## Обзор

Полная пересборка фронта `webui/src/**` под manager-mode. Никаких новых зависимостей: остаются React 18, zustand-store, custom path-router через `popstate` (паттерн заведён в `manager-mode` Task 5.6), CSS-классы из `webui/src/styles.css`. Бэкенд — без изменений.

## Архитектура UI

### Карта роутов

| Path | Компонент | Когда |
|---|---|---|
| `/setup/manager` | `SetupManagerPage` | Создание нового профиля. Также fallback при пустом списке профилей. |
| `/contacts` или `/contacts/<slug>` | `ContactsPage` | Таблица контактов. Slug в URL приоритетнее активного. |
| `/inbox` или `/inbox/<slug>` | `InboxPage` | Список тикетов и форма ответа. |
| `/` (или любой не-выше) | tab-UI с zustand `tab` | Дашборд. |

### Tab-UI (внутри `/`)

zustand `Tab`-тип обновляется:

```ts
export type Tab = "assistant" | "logs" | "configuration" | "memory" | "addons" | "diagnostics";
// removed: "relationship"
```

Дефолтный таб при загрузке: `logs` (как сейчас).

### Sidebar

```ts
const ITEMS: { id: Tab | "contacts" | "inbox"; label: string; icon: string; path?: string }[] = [
  { id: "assistant", label: "Помощник", icon: "✦" },
  { id: "logs", label: "Логи / статус", icon: "≡" },
  { id: "contacts", label: "Контакты", icon: "👥", path: "/contacts" },
  { id: "inbox", label: "Инбокс", icon: "📥", path: "/inbox" },
  { id: "configuration", label: "Конфигурация", icon: "⚙" },
  { id: "memory", label: "Память", icon: "❀" },
  { id: "addons", label: "Аддоны", icon: "◉" },
  { id: "diagnostics", label: "Диагностика", icon: "✓" }
];
```

Клик по пункту с `path` → `pushState(path + "/" + activeSlug)` + `popstate`-event. Клик без path → `setTab(id)` + `pushState("/")` для синка URL.

`brand`: `manager-agent` (вместо `girl-agent`).

«Новый профиль» в profile-popover → `pushState("/setup/manager")` + `popstate`, не `showSetupFlow`.

## Удаляемое

| Файл | Действие | Причина |
|---|---|---|
| `webui/src/pages/RelationshipPage.tsx` | удалить | Романтический скор от girl-agent. |
| `webui/src/pages/SetupFlow.tsx` | удалить | Legacy-визард с stage/communication/ignoreTendency. Заменён `SetupManagerPage`. |
| Поле `Tab` `relationship` в `store.ts` | удалить | Связано с RelationshipPage. |
| `api.listStages`, `api.listCommunicationPresets`, `api.getRelationship`, `api.getScoreHistory` (если есть) | удалить | API girl-agent. Бэкенд может их даже отдавать — фронт перестаёт дёргать. |
| Типы `StagePreset`, `CommunicationPreset` в `api.ts` | удалить | Не используются после очистки. |
| Поля `stage`, `communication`, `vibe`, `ignoreTendency` в типе `ProfileConfig` (`api.ts`) | удалить | Манагерская модель их не имеет; legacy-конфиги их игнорируют. |

## Новый/переписанный код

### `webui/src/lib/api.ts`

- Удалить упомянутые методы и типы.
- Добавить `api.updateMandate(slug, text)` (если ещё нет — есть точно метод GET, проверить PUT).
- Подтвердить, что есть `api.listContacts/patchContact` (есть из 5.7) и `api.listInbox/getTicket/replyTicket/cancelTicket` (есть из 5.8).

### `webui/src/lib/store.ts`

- Поле `tab` в типе `State` сужается до 6 значений (без `relationship`).
- Если в `init()` есть какие-то дефолты, ссылающиеся на `relationship` — снять.
- Никаких новых store-полей; URL-роутинг живёт в `App.tsx` локальным `useState` + popstate (как уже сделано для setup/contacts/inbox).

### `webui/src/App.tsx`

Имеющаяся логика трёх path-флагов (setupManager / contactsPage / inboxPage) остаётся. **Удаляется**: показ старого `SetupFlow` (там есть `showSetup && !setupManager && ...`). Теперь `showSetup === true` → `pushState("/setup/manager")` + `popstate`. Удаляется import `SetupFlow`.

В render:

```tsx
{setupManager ? <SetupManagerPage /> :
 contactsPage ? <ContactsPage /> :
 inboxPage ? <InboxPage /> :
 <div className="app-shell">...{tab === "configuration" && <ConfigurationPage />}...</div>}
```

Без ветки `tab === "relationship"`.

### `webui/src/components/Sidebar.tsx`

- Список `ITEMS` обновить (см. выше).
- Клик-хендлер `setTab(it.id)` — для tab-пунктов; `pushState(it.path + "/" + activeSlug)` для контактов и инбокса.
- profile-popover «Новый профиль» — `pushState("/setup/manager")` + `popstate`, без `showSetupFlow`.
- `brand` `name`: `manager-agent`.

### `webui/src/pages/ConfigurationPage.tsx`

Полная переписка. Структура — карточки:

```
┌── Профиль ────────────────────────────────────────────┐
│ name (read-only после создания), age, nationality, tz │
│ ownerId — read-only с подсказкой «менять через CLI»   │
└───────────────────────────────────────────────────────┘
┌── Mandate (через PUT /api/mandate/:slug) ─────────────┐
│ textarea ≤4000, кнопка [Сохранить мандат]             │
└───────────────────────────────────────────────────────┘
┌── Тон и persona ──────────────────────────────────────┐
│ tone: 3 radio                                          │
│ personaStyle: 3 radio                                  │
│ personaNotes: textarea (свободные системные заметки)   │
└───────────────────────────────────────────────────────┘
┌── Gate и after-hours ─────────────────────────────────┐
│ gateLevel: 3 radio                                     │
│ afterHoursPolicy: 3 radio                              │
│ proactiveClients toggle                                │
│ proactiveBoss toggle                                   │
│ escalationTimeoutMin (number 5..1440)                  │
│ digestPeriodHours (number 1..168)                      │
│ digestTime (HH:MM)                                     │
└───────────────────────────────────────────────────────┘
┌── Whitelist (только при gateLevel=whitelist) ─────────┐
│ список { kind: "id" | "username", value: ... }         │
│ + кнопка добавить, x для удаления                      │
│ Save — отдельный PUT /api/whitelist/:slug              │
└───────────────────────────────────────────────────────┘
┌── Telegram ───────────────────────────────────────────┐
│ mode (read-only после создания)                        │
│ если mode=bot: botToken (input password)               │
│ если mode=userbot: hint «обновляй через CLI»           │
│ proxy (опционально, как сейчас)                        │
└───────────────────────────────────────────────────────┘
┌── LLM ────────────────────────────────────────────────┐
│ presetId (select), model (input), apiKey (input)       │
│ baseURL (опционально)                                  │
└───────────────────────────────────────────────────────┘
┌── Расписание ─────────────────────────────────────────┐
│ sleepFrom (HH:MM), sleepTo (HH:MM)                     │
│ busySchedule: список интервалов                        │
│   [день недели×7] [from] [to] [reason] [×]             │
│   + кнопка добавить                                    │
└───────────────────────────────────────────────────────┘

[Применить и перезапустить runtime]   [Отмена]
```

**Save flow:**
1. Соберём `Partial<ProfileConfig>` только из manager-полей + базы.
2. `await api.updateProfile(slug, payload)` — это `PUT /api/profiles/:slug`.
3. Если в форме изменился whitelist → отдельно `await api.updateWhitelist(slug, whitelist)`.
4. Если изменился mandate → отдельно `await api.updateMandate(slug, mandate)`.
5. `await api.applyProfile(slug)` — рестарт runtime.
6. На успех — toast «Конфиг сохранён, runtime перезапущен», `refreshActive()`.

**Валидация:**
- Inline-валидация перед submit (как в SetupManagerPage).
- Серверные ошибки 400 с `payload.errors` раскладываем по полям, не теряя локальные значения.

### `webui/src/lib/api.ts` — новые методы

```ts
updateWhitelist(slug, list) → PUT /api/whitelist/:slug
updateMandate(slug, text) → PUT /api/mandate/:slug
listMandate(slug) → GET /api/mandate/:slug
listWhitelist(slug) → GET /api/whitelist/:slug
```

(Проверить, нет ли уже — может быть только GET; добавить PUT-варианты.)

## Совместимость старых профилей

`api.getProfile(slug)` возвращает то, что лежит в `config.json`. Старые профили могли иметь `stage: "tg-given-cold"`, `ignoreTendency: 35` и т.д. Стратегия:

1. При load: ConfigurationPage читает только нужные поля. Остальное игнорируется.
2. При save: payload не содержит legacy-полей вообще. Бэкенд с ними поступает как считает нужным (можно прописать в спеке `manager-webui`, что бэкенд тоже их не валидирует строго — но это outside scope, и так работает).
3. `personaNotes` остаётся — это полезный свободный контекст.

## CSS

Минимум новых стилей. Используем существующие классы (`form-row`, `select`, `input`, `textarea`, `btn`, `provider-card`, `grid cols-N`, `card`, `card-header`, `h-title`, `h-meta`, `h-actions`, `chip`, `toggle`, `track`, `knob`).

Если нужно — добавить пару классов в `styles.css` (max ~50 строк).

## Анти-цели

- **Не пересобираем `AssistantPage` / `LogsPage` / `MemoryPage` / `AddonsPage` / `DiagnosticsPage`** — они работают и так. Чистим только legacy-точки.
- **Не трогаем backend** — все эндпоинты уже задеплоены спекой `manager-mode`.
- **Не вводим React Router** — остаёмся на легковесном popstate-роутере.
- **Не пишем e2e тесты на UI** — это отдельный спек, тут только typecheck + vite build + grep-проверка.

## Property для grep-acceptance (Property webui-cleanup)

Финальный чекпойнт прогоняет:

```bash
grep -rE "ignoreTendency|findStage|relationship\\.md|listStages|listCommunicationPresets|cute|alt|clingy|chatty|Тенденция игнора|Стадия отношений" webui/src/
```

Должно быть пусто. Это формальная проверка очистки.
