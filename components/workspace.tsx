"use client";

import type { User } from "firebase/auth";
import { ImageGenerator } from "./image-generator";

type WorkspaceProps = { user: User; onSignOut: () => Promise<void> };

export function Workspace({ user, onSignOut }: WorkspaceProps) {
  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="brand-lockup"><span className="brand-symbol">U</span><span>Utilidades</span></div>
        <nav className="workspace-nav" aria-label="Menú principal">
          <p className="nav-label">Herramientas</p>
          <a className="nav-item active" href="#generar-fotos" aria-current="page"><span className="nav-icon">✦</span>Generar fotos</a>
          <span className="nav-item disabled" aria-disabled="true"><span className="nav-icon">＋</span>Más utilidades<small>Pronto</small></span>
        </nav>
        <div className="sidebar-bottom">
          <div className="account-chip">
            <div className="account-avatar">{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</div>
            <div><strong>{user.displayName || "Tu cuenta"}</strong><span>{user.email}</span></div>
          </div>
          <button className="signout-button" type="button" onClick={onSignOut}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="workspace-content" id="generar-fotos"><ImageGenerator /></div>
    </main>
  );
}
