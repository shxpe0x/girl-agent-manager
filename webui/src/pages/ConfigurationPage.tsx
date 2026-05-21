import { useStore } from "../lib/store";

/**
 * ConfigurationPage — временная заглушка после удаления legacy-полей
 * (Task 2-4 manager-webui). Полная manager-форма (mandate / tone /
 * personaStyle / gateLevel / afterHoursPolicy / proactive / whitelist /
 * timing / Telegram / LLM / расписание) пишется в Task 6.
 *
 * Пока — кратко показываем, что из конфига сейчас активно, и предлагаем
 * перейти в WebUI-визард `/setup/manager` для пересоздания профиля или
 * править `data/<slug>/config.json` руками.
 */

export function ConfigurationPage() {
  const cfg = useStore(s => s.activeConfig);

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

  const tier = cfg.tone ?? "mixed-by-tier";
  const persona = cfg.personaStyle ?? "gender-neutral-assistant";
  const gate = cfg.gateLevel ?? "gated";
  const afterHours = cfg.afterHoursPolicy ?? "vip-only";

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="card-header">
        <div className="h-title">Конфигурация менеджера</div>
        <div className="h-meta">{cfg.slug}</div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Полнофункциональная форма редактирования manager-полей в работе
        (Task 6 спеки <code>manager-webui</code>). Пока редактируй через CLI
        или WebUI-визард <code>/setup/manager</code>.
      </p>
      <div className="grid cols-2" style={{ marginTop: 16, gap: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Тон</label>
          <code>{tier}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Persona-стиль</label>
          <code>{persona}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Gate</label>
          <code>{gate}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>After-hours</label>
          <code>{afterHours}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Owner ID</label>
          <code>{cfg.ownerId ?? "—"}</code>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Часовой пояс</label>
          <code>{cfg.tz}</code>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button
          className="btn"
          onClick={() => {
            window.history.pushState({}, "", `/contacts/${cfg.slug}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Контакты
        </button>
        <button
          className="btn"
          onClick={() => {
            window.history.pushState({}, "", `/inbox/${cfg.slug}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Инбокс
        </button>
      </div>
    </div>
  );
}
