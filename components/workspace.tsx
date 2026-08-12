"use client";

import type { User } from "firebase/auth";

type WorkspaceProps = { user: User; onSignOut: () => Promise<void> };

export function Workspace({ user, onSignOut }: WorkspaceProps) {
  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="brand-lockup"><span className="brand-symbol">U</span><span>Utilidades</span></div>
        <nav className="workspace-nav" aria-label="Menú principal">
          <p className="nav-label">Herramientas</p>
          <span className="nav-item active" aria-current="page"><span className="nav-icon">•</span>Inicio</span>
          <span className="nav-item disabled" aria-disabled="true"><span className="nav-icon">+</span>Más utilidades<small>Pronto</small></span>
        </nav>
        <div className="sidebar-bottom">
          <div className="account-chip">
            <div className="account-avatar">{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</div>
            <div><strong>{user.displayName || "Tu cuenta"}</strong><span>{user.email}</span></div>
          </div>
          <button className="signout-button" type="button" onClick={onSignOut}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="workspace-content">
        <section className="workspace-empty" aria-labelledby="workspace-title">
          <p className="workspace-kicker">Espacio de trabajo</p>
          <h1 id="workspace-title">¿Qué quieres añadir a Utilidades?</h1>
          <p className="workspace-empty-copy">La base está lista. Aquí construiremos la próxima herramienta cuando la elijas.</p>
          <div className="workspace-empty-line" aria-hidden="true" />
          <span className="workspace-empty-index">U / 01</span>
        </section>
      </div>
    </main>
  );
}
