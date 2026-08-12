"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type Answer = { id: string; label: string; value: string };
type Answers = { style?: Answer; format?: Answer };
type Message =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "question"; text: string; options: Answer[] }
  | { id: string; role: "assistant"; kind: "image"; imageUrl: string };
type ApiResponse =
  | { type: "question"; question: string; options: Answer[] }
  | { type: "image"; imageUrl: string }
  | { error: string };

const initialMessage: Message = {
  id: "intro",
  role: "assistant",
  kind: "question",
  text: "Describe la imagen que quieres crear. Solo te pediré una elección si ayuda a definirla mejor.",
  options: [],
};

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ImageGenerator() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [prompt, setPrompt] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const latestImage = useMemo(
    () => [...messages].reverse().find((message) => message.kind === "image"),
    [messages],
  );

  async function requestImage(message: string, nextAnswers: Answers) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, answers: nextAnswers }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || "error" in data) throw new Error("error" in data ? data.error : "No se ha podido completar la petición.");

      if (data.type === "question") {
        setMessages((current) => [...current, { id: messageId(), role: "assistant", kind: "question", text: data.question, options: data.options }]);
      } else {
        setMessages((current) => [...current, { id: messageId(), role: "assistant", kind: "image", imageUrl: data.imageUrl }]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se ha podido generar la imagen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || loading) return;

    setPrompt("");
    setCurrentPrompt(nextPrompt);
    setAnswers({});
    setMessages((current) => [...current, { id: messageId(), role: "user", kind: "text", text: nextPrompt }]);
    await requestImage(nextPrompt, {});
  }

  async function handleOption(option: Answer) {
    if (loading || !currentPrompt) return;
    const isStyle = ["editorial", "photorealistic", "illustration", "3d"].includes(option.id);
    const isSubject = ["portrait", "landscape", "product", "fantasy"].includes(option.id)
      && !answers.style
      && !answers.format
      && currentPrompt.trim().length < 8;
    const nextPrompt = isSubject ? `${currentPrompt}, ${option.value}` : currentPrompt;
    const nextAnswers: Answers = isSubject
      ? answers
      : isStyle
        ? { ...answers, style: option }
        : { ...answers, format: option };
    if (isSubject) setCurrentPrompt(nextPrompt);
    setAnswers(nextAnswers);
    setMessages((current) => [...current, { id: messageId(), role: "user", kind: "text", text: option.label }]);
    await requestImage(nextPrompt, nextAnswers);
  }

  function clearConversation() {
    setMessages([initialMessage]);
    setPrompt("");
    setCurrentPrompt("");
    setAnswers({});
    setError("");
  }

  return (
    <section className="generator-shell" aria-label="Generar fotos">
      <div className="generator-topbar">
        <div>
          <p className="workspace-kicker">Estudio visual</p>
          <h1>Generar fotos</h1>
        </div>
        <button className="quiet-button" type="button" onClick={clearConversation} disabled={loading}>Nueva creación</button>
      </div>

      <div className="generator-layout">
        <div className="conversation-panel">
          <div className="conversation-header">
            <div>
              <p className="panel-title">Dirección creativa</p>
              <p className="panel-note">Describe, elige y deja que la imagen hable.</p>
            </div>
            <span className={`status-dot ${loading ? "is-loading" : ""}`} aria-label={loading ? "Generando" : "Listo"} />
          </div>

          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                {message.kind === "text" ? <div className="user-message">{message.text}</div> : null}
                {message.kind === "question" ? (
                  <div className="question-message">
                    <p>{message.text}</p>
                    {message.options.length > 0 ? (
                      <div className="choice-grid">
                        {message.options.map((option) => (
                          <button key={option.id} type="button" onClick={() => handleOption(option)} disabled={loading}>
                            <span>{option.label}</span><span className="choice-arrow" aria-hidden="true">↗</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {message.kind === "image" ? (
                  <div className="generated-inline-image">
                    <div className="inline-image-frame">
                      <Image src={message.imageUrl} alt="Imagen generada" fill unoptimized sizes="(max-width: 820px) 100vw, 66vw" />
                    </div>
                    <a className="download-link" href={message.imageUrl} download="utilidades-generacion.png">Descargar imagen <span aria-hidden="true">↗</span></a>
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? <div className="loading-line"><span /> Interpretando tu idea</div> : null}
          </div>

          <form className="prompt-form" onSubmit={handleSubmit}>
            <label htmlFor="image-prompt">¿Qué quieres crear?</label>
            <div className="prompt-input-wrap">
              <textarea id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Una casa brutalista junto al mar, al amanecer…" rows={2} maxLength={2_000} disabled={loading} />
              <button className="send-button" type="submit" aria-label="Generar imagen" disabled={loading || !prompt.trim()}><span aria-hidden="true">↑</span></button>
            </div>
            <div className="prompt-footnote"><span>Gemini Image</span><span>{prompt.length}/2000</span></div>
          </form>
          {error ? <p className="generation-error" role="alert">{error}</p> : null}
        </div>

        <aside className="preview-panel">
          <div className="preview-heading"><p className="panel-title">Lienzo</p><span>{latestImage ? "Última creación" : "Esperando una idea"}</span></div>
          <div className={`preview-canvas ${latestImage ? "has-image" : ""}`}>
            {latestImage?.kind === "image" ? <Image src={latestImage.imageUrl} alt="Última imagen generada" fill unoptimized sizes="(max-width: 820px) 100vw, 34vw" /> : (
              <div className="empty-canvas"><div className="crosshair" aria-hidden="true"><span /><span /></div><p>Tu imagen aparecerá aquí</p><span>Las respuestas del estudio son visuales.</span></div>
            )}
          </div>
          <div className="preview-footer"><span>1K · PNG</span><span className="preview-mark">U / 01</span></div>
        </aside>
      </div>
    </section>
  );
}
