import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import type { Tab } from "../lib/store";

/**
 * Пункт сайдбара. Tab-пункты переключают `tab` в zustand. Path-пункты
 * (Контакты, Инбокс) — делают `pushState` на конкретный URL и диспатчат
 * popstate, чтобы App.tsx переключился на нужную страницу.
 */
type NavItem =
  | { kind: "tab"; id: Tab; label: string; icon: string }
  | { kind: "path"; id: string; label: string; icon: string; path: (slug: string | null) => string };

const ITEMS: NavItem[] = [
  { kind: "tab", id: "assistant", label: "Помощник", icon: "✦" },
  { kind: "tab", id: "logs", label: "Логи / статус", icon: "≡" },
  {
    kind: "path",
    id: "contacts",
    label: "Контакты",
    icon: "👥",
    path: slug => slug ? `/contacts/${encodeURIComponent(slug)}` : "/contacts"
  },
  {
    kind: "path",
    id: "inbox",
    label: "Инбокс",
    icon: "📥",
    path: slug => slug ? `/inbox/${encodeURIComponent(slug)}` : "/inbox"
  },
  { kind: "tab", id: "configuration", label: "Конфигурация", icon: "⚙" },
  { kind: "tab", id: "memory", label: "Память", icon: "❀" },
  { kind: "tab", id: "addons", label: "Аддоны", icon: "◉" },
  { kind: "tab", id: "diagnostics", label: "Диагностика", icon: "✓" }
];

function pushPath(path: string) {
  if (typeof window !== "undefined") {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function Sidebar() {
  const profiles = useStore(s => s.profiles);
  const activeSlug = useStore(s => s.activeSlug);
  const activeConfig = useStore(s => s.activeConfig);
  const tab = useStore(s => s.tab);
  const setTab = useStore(s => s.setTab);
  const selectProfile = useStore(s => s.selectProfile);
  const toggleTheme = useStore(s => s.toggleTheme);
  const theme = useStore(s => s.theme);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  useEffect(() => {
    function onPop() {
      setCurrentPath(window.location.pathname);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const active = profiles.find(p => p.slug === activeSlug) ?? null;

  const initial = (active?.name?.trim()?.[0] ?? "?").toUpperCase();
  const stateClass = active?.status === "running" ? "running"
    : active?.status === "paused" ? "paused"
    : active?.status === "error" ? "error"
    : "";

  // Определяем активность path-пункта по текущему URL.
  function isPathActive(itemId: string): boolean {
    if (itemId === "contacts") return /^\/contacts(\/|$)/.test(currentPath);
    if (itemId === "inbox") return /^\/inbox(\/|$)/.test(currentPath);
    return false;
  }

  function handleClick(it: NavItem) {
    if (it.kind === "tab") {
      // При переходе на таб гарантируем, что мы на корне `/`.
      if (currentPath !== "/") pushPath("/");
      setTab(it.id);
    } else {
      pushPath(it.path(activeSlug));
    }
  }

  return (
    <>
      <div className="sidebar-brand">
        <div className="logo" />
        <div className="name">manager-agent</div>
        <div className="ver">webui</div>
      </div>

      <div style={{ position: "relative" }}>
        <div className="profile-picker" onClick={() => setPickerOpen(!pickerOpen)}>
          <div className="pp-avatar">{initial}</div>
          <div className="pp-info">
            <div className="pp-name">{active?.name ?? "Создать профиль"}</div>
            <div className="pp-meta">
              <span className={`pp-dot ${stateClass}`} />
              {active ? `${active.age}, ${active.mode}, ${stateLabel(active.status)}` : "нет профилей"}
            </div>
          </div>
          <span style={{ color: "var(--ga-text-faint)", fontSize: 11 }}>⇅</span>
        </div>
        {pickerOpen && (
          <div className="profile-popover">
            {profiles.map(p => (
              <div
                key={p.slug}
                className={`profile-popover-item ${p.slug === activeSlug ? "active" : ""}`}
                onClick={() => { void selectProfile(p.slug); setPickerOpen(false); }}
              >
                <div className="pp-avatar">{(p.name?.[0] ?? "?").toUpperCase()}</div>
                <div className="pp-info">
                  <div className="pp-name">{p.name}</div>
                  <div className="pp-meta">
                    <span className={`pp-dot ${p.status === "running" ? "running" : p.status === "error" ? "error" : ""}`} />
                    {p.age}, {p.mode}
                  </div>
                </div>
              </div>
            ))}
            <div
              className="profile-popover-item"
              onClick={() => { setPickerOpen(false); pushPath("/setup/manager"); }}
            >
              <div className="pp-avatar" style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--ga-text-dim)" }}>+</div>
              <div className="pp-info">
                <div className="pp-name">Новый профиль</div>
                <div className="pp-meta">manager-визард</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="nav">
        {ITEMS.map(it => {
          const onCorePath = currentPath === "/" || currentPath === "";
          const active = it.kind === "tab"
            ? onCorePath && tab === it.id
            : isPathActive(it.id);
          return (
            <div
              key={it.id}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={() => handleClick(it)}
            >
              <span className="icon">{it.icon}</span>
              {it.label}
            </div>
          );
        })}
      </div>

      <div className="sidebar-foot">
        <div className="nav">
          <div className="nav-item" onClick={toggleTheme}>
            <span className="icon">{theme === "dark" ? "☾" : "☀"}</span>
            {theme === "dark" ? "Тёмная тема" : "Светлая тема"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ga-text-faint)", padding: "2px 8px" }}>
          {activeConfig?.slug ? `slug: ${activeConfig.slug}` : "нет активного профиля"}
        </div>
      </div>
    </>
  );
}

function stateLabel(s: string): string {
  switch (s) {
    case "running": return "работает";
    case "paused": return "пауза";
    case "error": return "ошибка";
    case "stopped":
    default: return "остановлен";
  }
}
