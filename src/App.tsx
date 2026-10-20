import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "./components/Button";
import { Tag } from "./components/Status";
import { navGroups } from "./data/fleet";
import { cn } from "./lib/cn";
import { Foundations } from "./gallery/Foundations";
import { Controls } from "./gallery/Controls";
import { DataDisplay } from "./gallery/DataDisplay";
import { Surfaces } from "./gallery/Surfaces";
import { Compositions } from "./gallery/Compositions";

type Theme = "dark" | "light";

const allSectionIds = navGroups.flatMap((group) => group.items.map((item) => item.id));

function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem("hlao-dashboard-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Local storage can be unavailable in a locked-down local shell.
  }
  return "dark";
}

function useActiveSection(): string {
  const [active, setActive] = useState(allSectionIds[0] ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
    );

    const elements = allSectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return active;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const active = useActiveSection();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("hlao-dashboard-theme", theme);
    } catch {
      // The theme still applies for this session.
    }
  }, [theme]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="HLAO dashboard design primitives, back to top">
          <svg className="brand__mark" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="currentColor" />
            <rect x="6" y="6" width="6" height="6" fill="var(--accent)" />
            <path d="M9 0v4M9 14v4M0 9h4M14 9h4" stroke="currentColor" />
          </svg>
          <span className="brand__name">HLAO</span>
          <span className="brand__divider" aria-hidden="true" />
          <span className="brand__sub">Dashboard / Design</span>
        </a>

        <div className="topbar__right">
          <span className="conn" title="Design specimen — no supervisor connection">
            <span className="lamp lamp--accent" />
            <span className="conn__label">Instance default</span>
            <span className="conn__sep">/</span>
            <span className="conn__dim">wire 2.5</span>
          </span>
          <IconButton
            className="theme-toggle"
            variant="ghost"
            size="sm"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="icon" /> : <Moon className="icon" />}
          </IconButton>
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar">
          <nav className="nav" aria-label="Design system sections">
            {navGroups.map((group) => (
              <div key={group.title}>
                <div className="nav__title">{group.title}</div>
                <div className="nav__list">
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      className={cn("nav__item", active === item.id && "nav__item--active")}
                      href={`#${item.id}`}
                    >
                      <span className="nav__num">{item.index}</span>
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="sidebar__foot">
            <span className="sidebar__foot-row">
              <span className="lamp lamp--accent" />
              Design primitives 0.1
            </span>
            <span>Instance default</span>
            <span>Home ~/.hlao</span>
            <span>Wire 2.5 / local IPC</span>
            <span>No business logic</span>
          </div>
        </aside>

        <main className="main">
          <section className="hero" id="top">
            <div className="eyebrow">
              <span>HLAO / Client surface</span>
              <span className="eyebrow__sep">/</span>
              <span className="eyebrow__dim">Design primitives 0.1</span>
              <span className="eyebrow__sep">/</span>
              <span className="eyebrow__dim">2026-10-20</span>
            </div>
            <h1 className="hero__title">
              A console for agents
              <br />
              <em>you can see.</em>
            </h1>
            <p className="lede">
              Design primitives for a local client that observes a live fleet of agent sessions.
              Flat surfaces, square corners, one cyan signal. The seams stay visible: state is read,
              never invented. This page is the specimen, not the wired client.
            </p>
            <div className="hero__meta">
              <Tag>Flat</Tag>
              <Tag>0px radius</Tag>
              <Tag>1px rules</Tag>
              <Tag>Tabular data</Tag>
              <Tag>Specimen only</Tag>
              <Tag tone="accent">
                <span className="hero__swatch" />
                #6CD2FF
              </Tag>
            </div>
          </section>

          <Foundations />
          <Controls />
          <DataDisplay />
          <Surfaces />
          <Compositions />

          <footer className="footer">
            <span>HLAO dashboard · design primitives 0.1</span>
            <span>
              <span className="footer__accent">#6CD2FF</span> · flat · 0px radius · 1px rules
            </span>
            <span>No business logic · wire major 2</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
