import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { api, type LLMPreset, type ProfileConfig, type WhitelistEntry } from "../lib/api";

/**
 * ConfigurationPage — manager-mode форма (Task 6a manager-webui).
 *
 * Этап 6a — только форма с локальным `draft` и inline-валидацией. Кнопка
 * «Применить» пока показывает toast и не пишет на сервер; реальный save
 * flow (PUT /api/mandate, PUT /api/whitelist, PUT /api/profiles + apply)
 * приходит в задаче 6b.
 *
 * Layout — карточки: Профиль, Mandate, Тон+Persona, Gate+AfterHours+
 * Proactive+Тайминги, Whitelist (условно при gateLevel=whitelist),
 * Telegram, LLM, Расписание (sleep + busy slots).
 */

type Tone = NonNullable<ProfileConfig["tone"]>;
type PersonaStyle = NonNullable<ProfileConfig["personaStyle"]>;
type GateLevel = NonNullable<ProfileConfig["gateLevel"]>;
type AfterHoursPolicy = NonNullable<ProfileConfig["afterHoursPolicy"]>;

interface BusySlotDraft {
  dayOfWeek: number; // 0..6, 0 = понедельник (UI), но мапится на ISO 1..7
  startHour: number;
  endHour: number;
  reason?: string;
}

interface DraftState {
  // Профиль (read-only после создания, кроме personaNotes/age/tz)
  age: number;
  tz: string;
  personaNotes: string;
  // Manager
  tone: Tone;
  personaStyle: PersonaStyle;
  gateLevel: GateLevel;
  afterHoursPolicy: AfterHoursPolicy;
  proactiveClients: boolean;
  proactiveBoss: boolean;
  escalationTimeoutMin: number;
  digestPeriodHours: number;
  digestTime: string; // HH:MM
  mandate: string;
  whitelist: WhitelistEntry[];
  // Telegram
  botToken: string;
  // LLM
  llmPresetId: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseURL: string;
  // Расписание
  sleepFrom: number;
  sleepTo: number;
  busySchedule: BusySlotDraft[];
}

type FieldKey = keyof DraftState;
type FieldErrors = Partial<Record<FieldKey | "submit", string>>;

const TONE_OPTIONS: { value: Tone; label: string; hint: string }[] = [
  { value: "formal-вы", label: "formal-вы", hint: "всегда на «вы»" },
  { value: "friendly-ты", label: "friendly-ты", hint: "всегда на «ты»" },
  { value: "mixed-by-tier", label: "mixed-by-tier", hint: "по тиру контакта" }
];

const PERSONA_OPTIONS: { value: PersonaStyle; label: string; hint: string }[] = [
  { value: "gender-neutral-assistant", label: "нейтральный ассистент", hint: "без гендерной окраски" },
  { value: "female-secretary", label: "секретарь-женщина", hint: "женский образ" },
  { value: "male-secretary", label: "секретарь-мужчина", hint: "мужской образ" }
];

const GATE_OPTIONS: { value: GateLevel; label: string; hint: string }[] = [
  { value: "open", label: "open", hint: "отвечает всем" },
  { value: "gated", label: "gated", hint: "вежливо фильтрует незнакомцев" },
  { value: "whitelist", label: "whitelist", hint: "только белый список" }
];

const AFTER_HOURS_OPTIONS: { value: AfterHoursPolicy; label: string; hint: string }[] = [
  { value: "silent", label: "silent", hint: "молчит вне рабочих часов" },
  { value: "auto-reply", label: "auto-reply", hint: "одно авто-сообщение" },
  { value: "vip-only", label: "vip-only", hint: "VIP — обычный ответ, остальным auto-reply" }
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function hourToHHMM(h: number): string {
  return `${pad(Math.floor(h))}:${pad(Math.round((h - Math.floor(h)) * 60))}`;
}
function hhmmToHour(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) + ((m ?? 0) / 60);
}

function makeDraft(cfg: ProfileConfig | null): DraftState {
  return {
    age: cfg?.age ?? 30,
    tz: cfg?.tz ?? "Europe/Moscow",
    personaNotes: cfg?.personaNotes ?? "",
    tone: cfg?.tone ?? "mixed-by-tier",
    personaStyle: cfg?.personaStyle ?? "gender-neutral-assistant",
    gateLevel: cfg?.gateLevel ?? "gated",
    afterHoursPolicy: cfg?.afterHoursPolicy ?? "vip-only",
    proactiveClients: cfg?.proactiveClients ?? false,
    proactiveBoss: cfg?.proactiveBoss ?? false,
    escalationTimeoutMin: cfg?.escalationTimeoutMin ?? 60,
    digestPeriodHours: cfg?.digestPeriodHours ?? 24,
    digestTime: cfg?.digestTime ?? "09:00",
    mandate: "",
    whitelist: cfg?.whitelist ?? [],
    botToken: cfg?.telegram?.botToken ?? "",
    llmPresetId: cfg?.llm?.presetId ?? "",
    llmModel: cfg?.llm?.model ?? "",
    llmApiKey: cfg?.llm?.apiKey ?? "",
    llmBaseURL: cfg?.llm?.baseURL ?? "",
    sleepFrom: cfg?.sleepFrom ?? 23,
    sleepTo: cfg?.sleepTo ?? 8,
    busySchedule: (cfg?.busySchedule ?? []).map(b => ({
      dayOfWeek: b.dayOfWeek,
      startHour: b.startHour,
      endHour: b.endHour,
      reason: b.reason
    }))
  };
}

function validate(d: DraftState): FieldErrors {
  const errs: FieldErrors = {};
  if (!Number.isFinite(d.age) || d.age < 16 || d.age > 100) errs.age = "16..100";
  if (!d.tz) errs.tz = "обязательное поле";
  if (d.mandate.length > 4000) errs.mandate = "не более 4000 символов";
  if (!Number.isInteger(d.escalationTimeoutMin) || d.escalationTimeoutMin < 5 || d.escalationTimeoutMin > 1440) {
    errs.escalationTimeoutMin = "целое 5..1440";
  }
  if (!Number.isInteger(d.digestPeriodHours) || d.digestPeriodHours < 1 || d.digestPeriodHours > 168) {
    errs.digestPeriodHours = "целое 1..168";
  }
  if (!HHMM_RE.test(d.digestTime)) errs.digestTime = "формат HH:MM";
  if (d.gateLevel === "whitelist" && d.whitelist.length === 0) {
    errs.whitelist = "при gateLevel=whitelist список не может быть пустым";
  }
  if (!Number.isFinite(d.sleepFrom) || d.sleepFrom < 0 || d.sleepFrom >= 24) errs.sleepFrom = "0..23";
  if (!Number.isFinite(d.sleepTo) || d.sleepTo < 0 || d.sleepTo >= 24) errs.sleepTo = "0..23";
  if (!d.llmPresetId) errs.llmPresetId = "выбери провайдера";
  if (!d.llmModel) errs.llmModel = "укажи модель";
  for (const e of d.whitelist) {
    if (e.kind === "id" && (!Number.isInteger(e.chatId) || e.chatId < 1 || e.chatId > 9_999_999_999_999)) {
      errs.whitelist = "chatId 1..9999999999999";
      break;
    }
    if (e.kind === "username" && !USERNAME_RE.test(e.username)) {
      errs.whitelist = "username 3..32, [a-zA-Z0-9_]";
      break;
    }
  }
  return errs;
}

export function ConfigurationPage() {
  const cfg = useStore(s => s.activeConfig);
  const toast = useStore(s => s.toast);

  const [draft, setDraft] = useState<DraftState>(() => makeDraft(cfg));
  const [llmPresets, setLLMPresets] = useState<LLMPreset[]>([]);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());

  // Re-seed draft при смене активного профиля.
  useEffect(() => {
    setDraft(makeDraft(cfg));
    setTouched(new Set());
  }, [cfg?.slug]);

  // Подгружаем mandate.md отдельно (он не в config.json).
  useEffect(() => {
    if (!cfg?.slug) return;
    void api.getMandate(cfg.slug)
      .then(r => setDraft(prev => ({ ...prev, mandate: r.text })))
      .catch(() => { /* нет — оставляем пусто */ });
  }, [cfg?.slug]);

  useEffect(() => {
    void api.listLLMPresets().then(r => setLLMPresets(r.presets)).catch(() => { /* silent */ });
  }, []);

  const errors = useMemo(() => validate(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  function set<K extends FieldKey>(k: K, v: DraftState[K]) {
    setDraft(prev => ({ ...prev, [k]: v }));
    setTouched(prev => new Set(prev).add(k));
  }
  function err(k: FieldKey): string | undefined {
    return touched.has(k) ? errors[k] : undefined;
  }

  function addWhitelistEntry(kind: "id" | "username") {
    const entry: WhitelistEntry = kind === "id"
      ? { kind: "id", chatId: 0 }
      : { kind: "username", username: "" };
    set("whitelist", [...draft.whitelist, entry]);
  }
  function updateWhitelistEntry(idx: number, value: WhitelistEntry) {
    const next = draft.whitelist.slice();
    next[idx] = value;
    set("whitelist", next);
  }
  function removeWhitelistEntry(idx: number) {
    set("whitelist", draft.whitelist.filter((_, i) => i !== idx));
  }
  function addBusySlot() {
    set("busySchedule", [...draft.busySchedule, { dayOfWeek: 0, startHour: 9, endHour: 18 }]);
  }
  function updateBusySlot(idx: number, patch: Partial<BusySlotDraft>) {
    const next = draft.busySchedule.slice();
    next[idx] = { ...next[idx]!, ...patch };
    set("busySchedule", next);
  }
  function removeBusySlot(idx: number) {
    set("busySchedule", draft.busySchedule.filter((_, i) => i !== idx));
  }

  function applyDraft() {
    setTouched(new Set(Object.keys(draft) as FieldKey[]));
    if (hasErrors) {
      toast("Не все поля валидны — проверь подсветку", "error");
      return;
    }
    // TODO Task 6b: реальный save flow (mandate + whitelist + profile + apply).
    toast("Сохранение появится в задаче 6b", "info");
  }

  if (!cfg) {
    return (
      <div className="empty">
        <div className="em-icon">⚙</div>
        <div className="em-title">Профиля нет</div>
        <button
          className="btn primary"
          onClick={() => {
            window.history.pushState({}, "", "/setup/manager");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Создать профиль
        </button>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ProfileCard cfg={cfg} draft={draft} set={set} err={err} />
      <MandateCard draft={draft} set={set} err={err} />
      <ToneCard draft={draft} set={set} />
      <GateCard draft={draft} set={set} err={err} />
      {draft.gateLevel === "whitelist" && (
        <WhitelistCard
          draft={draft}
          err={err}
          onAdd={addWhitelistEntry}
          onUpdate={updateWhitelistEntry}
          onRemove={removeWhitelistEntry}
        />
      )}
      <TelegramCard cfg={cfg} draft={draft} set={set} />
      <LLMCard draft={draft} llmPresets={llmPresets} set={set} err={err} />
      <ScheduleCard
        draft={draft}
        err={err}
        set={set}
        onAddBusy={addBusySlot}
        onUpdateBusy={updateBusySlot}
        onRemoveBusy={removeBusySlot}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setDraft(makeDraft(cfg))}>
          Отменить изменения
        </button>
        <button
          className="btn primary"
          onClick={applyDraft}
          disabled={hasErrors}
        >
          Применить и перезапустить runtime
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Карточки
// ============================================================================

interface CardProps {
  draft: DraftState;
  set: <K extends FieldKey>(k: K, v: DraftState[K]) => void;
  err: (k: FieldKey) => string | undefined;
}

function ProfileCard({ cfg, draft, set, err }: { cfg: ProfileConfig } & CardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Профиль</div>
        <div className="h-meta">{cfg.slug}</div>
      </div>
      <div className="grid cols-2" style={{ marginTop: 12, gap: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Имя</label>
          <code>{cfg.name}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Возраст</label>
          <input
            className="input"
            type="number"
            min={16}
            max={100}
            value={draft.age}
            onChange={e => set("age", Number(e.target.value))}
          />
          {err("age") && <div className="hint" style={{ color: "var(--accent)" }}>{err("age")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Часовой пояс (IANA)</label>
          <input
            className="input"
            value={draft.tz}
            onChange={e => set("tz", e.target.value)}
            placeholder="Europe/Moscow"
          />
          {err("tz") && <div className="hint" style={{ color: "var(--accent)" }}>{err("tz")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Owner ID</label>
          <code>{cfg.ownerId ?? "—"}</code>
          <div className="hint">Менять через CLI: <code>--owner-id</code></div>
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Системные заметки (free-form для LLM)</label>
        <textarea
          className="textarea"
          rows={3}
          value={draft.personaNotes}
          onChange={e => set("personaNotes", e.target.value)}
          placeholder="Контекст для LLM: специализация, особенности клиентов, тон, темы..."
        />
      </div>
    </div>
  );
}

function MandateCard({ draft, set, err }: CardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Мандат</div>
        <div className="h-meta">{draft.mandate.length} / 4000</div>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Что менеджер может делать сам, что эскалирует боссу. Хранится в <code>mandate.md</code>, hot-reload в runtime.
      </p>
      <textarea
        className="textarea"
        rows={6}
        value={draft.mandate}
        onChange={e => set("mandate", e.target.value)}
        placeholder="Пример: Отвечаю на вопросы про часы работы, тарифы и доступность товара. Эскалирую: цены, скидки, индивидуальные условия, жалобы."
      />
      {err("mandate") && <div className="hint" style={{ color: "var(--accent)" }}>{err("mandate")}</div>}
    </div>
  );
}

function ToneCard({ draft, set }: CardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Тон и persona</div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Тон</label>
        <div className="grid cols-3">
          {TONE_OPTIONS.map(o => (
            <label key={o.value} className={`provider-card ${draft.tone === o.value ? "active" : ""}`} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="tone"
                value={o.value}
                checked={draft.tone === o.value}
                onChange={() => set("tone", o.value)}
                style={{ display: "none" }}
              />
              <div className="p-name">{o.label}</div>
              <div className="p-hint">{o.hint}</div>
            </label>
          ))}
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Persona-стиль</label>
        <div className="grid cols-3">
          {PERSONA_OPTIONS.map(o => (
            <label key={o.value} className={`provider-card ${draft.personaStyle === o.value ? "active" : ""}`} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="personaStyle"
                value={o.value}
                checked={draft.personaStyle === o.value}
                onChange={() => set("personaStyle", o.value)}
                style={{ display: "none" }}
              />
              <div className="p-name">{o.label}</div>
              <div className="p-hint">{o.hint}</div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function GateCard({ draft, set, err }: CardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Доступ и after-hours</div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Режим доступа (gateLevel)</label>
        <div className="grid cols-3">
          {GATE_OPTIONS.map(o => (
            <label key={o.value} className={`provider-card ${draft.gateLevel === o.value ? "active" : ""}`} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="gateLevel"
                value={o.value}
                checked={draft.gateLevel === o.value}
                onChange={() => set("gateLevel", o.value)}
                style={{ display: "none" }}
              />
              <div className="p-name">{o.label}</div>
              <div className="p-hint">{o.hint}</div>
            </label>
          ))}
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Политика после рабочих часов</label>
        <div className="grid cols-3">
          {AFTER_HOURS_OPTIONS.map(o => (
            <label key={o.value} className={`provider-card ${draft.afterHoursPolicy === o.value ? "active" : ""}`} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="afterHoursPolicy"
                value={o.value}
                checked={draft.afterHoursPolicy === o.value}
                onChange={() => set("afterHoursPolicy", o.value)}
                style={{ display: "none" }}
              />
              <div className="p-name">{o.label}</div>
              <div className="p-hint">{o.hint}</div>
            </label>
          ))}
        </div>
      </div>
      <div className="grid cols-2" style={{ marginTop: 12, gap: 12 }}>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.proactiveClients}
            onChange={e => set("proactiveClients", e.target.checked)}
          />
          <span className="track"><span className="knob" /></span>
          <span>Проактивно напоминать клиентам по обещаниям</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.proactiveBoss}
            onChange={e => set("proactiveBoss", e.target.checked)}
          />
          <span className="track"><span className="knob" /></span>
          <span>Дайджесты боссу</span>
        </label>
      </div>
      <div className="grid cols-3" style={{ marginTop: 12, gap: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Таймаут эскалации, мин</label>
          <input
            className="input"
            type="number"
            min={5}
            max={1440}
            value={draft.escalationTimeoutMin}
            onChange={e => set("escalationTimeoutMin", Number(e.target.value))}
          />
          {err("escalationTimeoutMin") && <div className="hint" style={{ color: "var(--accent)" }}>{err("escalationTimeoutMin")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Период дайджеста, ч</label>
          <input
            className="input"
            type="number"
            min={1}
            max={168}
            value={draft.digestPeriodHours}
            onChange={e => set("digestPeriodHours", Number(e.target.value))}
          />
          {err("digestPeriodHours") && <div className="hint" style={{ color: "var(--accent)" }}>{err("digestPeriodHours")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Время дайджеста (HH:MM)</label>
          <input
            className="input"
            value={draft.digestTime}
            onChange={e => set("digestTime", e.target.value)}
          />
          {err("digestTime") && <div className="hint" style={{ color: "var(--accent)" }}>{err("digestTime")}</div>}
        </div>
      </div>
    </div>
  );
}

interface WhitelistCardProps {
  draft: DraftState;
  err: (k: FieldKey) => string | undefined;
  onAdd: (kind: "id" | "username") => void;
  onUpdate: (idx: number, value: WhitelistEntry) => void;
  onRemove: (idx: number) => void;
}

function WhitelistCard({ draft, err, onAdd, onUpdate, onRemove }: WhitelistCardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Whitelist</div>
        <div className="h-meta">{draft.whitelist.length} запис{draft.whitelist.length === 1 ? "ь" : "ей"}</div>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Только эти контакты могут общаться с менеджером при <code>gateLevel=whitelist</code>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {draft.whitelist.map((entry, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="select"
              value={entry.kind}
              onChange={e => {
                const next: WhitelistEntry = e.target.value === "id"
                  ? { kind: "id", chatId: 0 }
                  : { kind: "username", username: "" };
                onUpdate(i, next);
              }}
              style={{ width: 130 }}
            >
              <option value="id">chatId</option>
              <option value="username">@username</option>
            </select>
            {entry.kind === "id" ? (
              <input
                className="input"
                type="number"
                value={entry.chatId}
                onChange={e => onUpdate(i, { kind: "id", chatId: Number(e.target.value) })}
                placeholder="123456789"
                style={{ flex: 1 }}
              />
            ) : (
              <input
                className="input"
                value={entry.username}
                onChange={e => onUpdate(i, { kind: "username", username: e.target.value.replace(/^@/, "") })}
                placeholder="alice"
                style={{ flex: 1 }}
              />
            )}
            <button className="btn ghost tiny" onClick={() => onRemove(i)} title="Удалить">×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn tiny" onClick={() => onAdd("id")}>+ chatId</button>
          <button className="btn tiny" onClick={() => onAdd("username")}>+ @username</button>
        </div>
      </div>
      {err("whitelist") && <div className="hint" style={{ color: "var(--accent)", marginTop: 8 }}>{err("whitelist")}</div>}
    </div>
  );
}

function TelegramCard({ cfg, draft, set }: { cfg: ProfileConfig } & CardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Telegram</div>
        <div className="h-meta">{cfg.mode}</div>
      </div>
      {cfg.mode === "bot" ? (
        <div className="form-row" style={{ marginTop: 12 }}>
          <label>Bot Token</label>
          <input
            className="input"
            type="password"
            value={draft.botToken}
            onChange={e => set("botToken", e.target.value)}
            placeholder="123456:ABC..."
            autoComplete="off"
          />
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          Профиль работает в режиме userbot. Меняй <code>sessionString</code> и MTProto-креды через CLI:
          <code>manager-agent --userbot-login</code>
        </p>
      )}
    </div>
  );
}

function LLMCard({ draft, llmPresets, set, err }: CardProps & { llmPresets: LLMPreset[] }) {
  const preset = llmPresets.find(p => p.id === draft.llmPresetId);
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">LLM провайдер</div>
        <div className="h-meta">{preset?.name ?? draft.llmPresetId ?? "—"}</div>
      </div>
      <div className="grid cols-2" style={{ marginTop: 12, gap: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Провайдер</label>
          <select className="select" value={draft.llmPresetId} onChange={e => set("llmPresetId", e.target.value)}>
            <option value="">— выбери —</option>
            {llmPresets.map(p => (
              <option key={p.id} value={p.id} disabled={p.disabled}>
                {p.name}{p.recommended ? " ★" : ""}{p.disabled ? " (недоступен)" : ""}
              </option>
            ))}
          </select>
          {err("llmPresetId") && <div className="hint" style={{ color: "var(--accent)" }}>{err("llmPresetId")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Модель</label>
          {preset?.models?.length ? (
            <select className="select" value={draft.llmModel} onChange={e => set("llmModel", e.target.value)}>
              <option value="">— выбери —</option>
              {preset.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              className="input"
              value={draft.llmModel}
              onChange={e => set("llmModel", e.target.value)}
              placeholder={preset?.defaultModel ?? "имя модели"}
            />
          )}
          {err("llmModel") && <div className="hint" style={{ color: "var(--accent)" }}>{err("llmModel")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>API ключ</label>
          <input
            className="input"
            type="password"
            value={draft.llmApiKey}
            onChange={e => set("llmApiKey", e.target.value)}
            placeholder={preset?.apiKeyRequired ? "обязательно" : "опционально"}
            autoComplete="off"
          />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Base URL (опционально)</label>
          <input
            className="input"
            value={draft.llmBaseURL}
            onChange={e => set("llmBaseURL", e.target.value)}
            placeholder={preset?.baseURL ?? "https://api.openai.com/v1"}
          />
        </div>
      </div>
      {preset?.hint && <div className="hint" style={{ marginTop: 8 }}>{preset.hint}</div>}
    </div>
  );
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface ScheduleCardProps {
  draft: DraftState;
  err: (k: FieldKey) => string | undefined;
  set: <K extends FieldKey>(k: K, v: DraftState[K]) => void;
  onAddBusy: () => void;
  onUpdateBusy: (idx: number, patch: Partial<BusySlotDraft>) => void;
  onRemoveBusy: (idx: number) => void;
}

function ScheduleCard({ draft, err, set, onAddBusy, onUpdateBusy, onRemoveBusy }: ScheduleCardProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Рабочее расписание</div>
      </div>
      <div className="grid cols-2" style={{ marginTop: 12, gap: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Сон с (час, 0..23)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={23}
            value={draft.sleepFrom}
            onChange={e => set("sleepFrom", Number(e.target.value))}
          />
          {err("sleepFrom") && <div className="hint" style={{ color: "var(--accent)" }}>{err("sleepFrom")}</div>}
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Сон до (час, 0..23)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={23}
            value={draft.sleepTo}
            onChange={e => set("sleepTo", Number(e.target.value))}
          />
          {err("sleepTo") && <div className="hint" style={{ color: "var(--accent)" }}>{err("sleepTo")}</div>}
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 12 }}>
        <label>Занятые слоты</label>
        <p className="hint">Дни недели (0=Пн ... 6=Вс), часы. Менеджер не отвечает в эти окна.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draft.busySchedule.map((slot, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="select"
                value={slot.dayOfWeek}
                onChange={e => onUpdateBusy(i, { dayOfWeek: Number(e.target.value) })}
                style={{ width: 80 }}
              >
                {DAY_LABELS.map((l, idx) => <option key={idx} value={idx}>{l}</option>)}
              </select>
              <input
                className="input"
                type="number"
                min={0}
                max={23}
                value={slot.startHour}
                onChange={e => onUpdateBusy(i, { startHour: Number(e.target.value) })}
                style={{ width: 80 }}
                placeholder="9"
              />
              <span>—</span>
              <input
                className="input"
                type="number"
                min={0}
                max={23}
                value={slot.endHour}
                onChange={e => onUpdateBusy(i, { endHour: Number(e.target.value) })}
                style={{ width: 80 }}
                placeholder="18"
              />
              <input
                className="input"
                value={slot.reason ?? ""}
                onChange={e => onUpdateBusy(i, { reason: e.target.value })}
                placeholder="причина (опц.)"
                style={{ flex: 1 }}
              />
              <button className="btn ghost tiny" onClick={() => onRemoveBusy(i)}>×</button>
            </div>
          ))}
          <button className="btn tiny" onClick={onAddBusy}>+ добавить слот</button>
        </div>
      </div>
    </div>
  );
}

// pad/hourToHHMM/hhmmToHour экспортируются для тестов в будущих задачах.
export { pad as _pad, hourToHHMM as _hourToHHMM, hhmmToHour as _hhmmToHour };
