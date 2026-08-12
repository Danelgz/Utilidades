"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { FormEvent, useEffect, useState } from "react";
import { getFirebaseAuth } from "../lib/firebase";

type AuthMode = "login" | "register";

function getFirebaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "No se ha podido completar la operación. Inténtalo de nuevo.";
  }

  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "El correo o la contraseña no son correctos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con este correo.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/popup-closed-by-user":
      return "El inicio de sesión con Google se ha cancelado.";
    case "auth/operation-not-allowed":
      return "Este método de inicio de sesión aún no está habilitado en Firebase.";
    case "auth/unauthorized-domain":
      return "Este dominio aún no está autorizado en Firebase Authentication.";
    default:
      return "No se ha podido completar la operación. Inténtalo de nuevo.";
  }
}

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), setUser);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Firebase aún no está configurado.");
      return undefined;
    }
  }, []);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const auth = getFirebaseAuth();

      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (authError) {
      setError(getFirebaseErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setError("");
    setLoading(true);

    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (authError) {
      setError(getFirebaseErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setError("");
    await signOut(getFirebaseAuth());
  }

  if (user) {
    return (
      <section className="auth-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Sesión iniciada</p>
        <h1 id="welcome-title">Hola{user.displayName ? `, ${user.displayName}` : ""}.</h1>
        <p className="muted">{user.email}</p>
        <button className="button button-secondary" type="button" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Utilidades</p>
      <h1 id="auth-title">{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h1>
      <p className="muted">
        {mode === "login"
          ? "Accede para continuar."
          : "Regístrate para empezar a utilizar la aplicación."}
      </p>

      <button className="button button-google" type="button" onClick={handleGoogleAuth} disabled={loading}>
        <span className="google-mark" aria-hidden="true">G</span>
        Continuar con Google
      </button>

      <div className="divider"><span>o con correo</span></div>

      <form onSubmit={handleEmailAuth}>
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? <p className="error" role="alert">{error}</p> : null}

        <button className="button button-primary" type="submit" disabled={loading}>
          {loading ? "Procesando…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </button>
      </form>

      <p className="switch-mode">
        {mode === "login" ? "¿Aún no tienes cuenta?" : "¿Ya tienes una cuenta?"}{" "}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Regístrate" : "Inicia sesión"}
        </button>
      </p>
    </section>
  );
}
