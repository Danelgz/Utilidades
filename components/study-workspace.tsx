"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type AssetKind = "image" | "audio";
type StudyAsset = { id: string; file: File; kind: AssetKind; name: string; url: string };
type ClarificationOption = { id: string; label: string; description: string };
type StudyQuestion = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  hint: string;
  explanation: string;
};
type StudyResult = {
  kind: "clarification" | "quiz";
  title: string;
  summary: string;
  clarification: { question: string; options: ClarificationOption[] } | null;
  questions: StudyQuestion[];
};
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  options?: ClarificationOption[];
  assetCount?: number;
};
type View = "compose" | "quiz" | "results";
type QuizResult = { question: StudyQuestion; answer?: string; correct: boolean; points: number };

const introMessage: ChatMessage = {
  id: "intro",
  role: "assistant",
  text: "Envíame tus apuntes y convertiré el material en un test que puedas hacer a tu ritmo. Puedes subir varias fotos, grabar una explicación o combinar ambas cosas.",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function StudyWorkspace() {
  const [view, setView] = useState<View>("compose");
  const [assets, setAssets] = useState<StudyAsset[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [composer, setComposer] = useState("");
  const [answersContext, setAnswersContext] = useState("");
  const [quiz, setQuiz] = useState<StudyResult | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [helpUsed, setHelpUsed] = useState<Record<string, boolean>>({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const answeredCount = useMemo(() => Object.keys(quizAnswers).length, [quizAnswers]);
  const currentQuestion = quiz?.questions[activeQuestion];

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/") || file.type.startsWith("audio/"))
      .slice(0, Math.max(0, 12 - assets.length))
      .map((file) => ({
        id: makeId("asset"),
        file,
        kind: file.type.startsWith("image/") ? "image" as const : "audio" as const,
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    setAssets((current) => [...current, ...incoming]);
    setError("");
  }

  function removeAsset(assetId: string) {
    setAssets((current) => {
      const asset = current.find((item) => item.id === assetId);
      if (asset) URL.revokeObjectURL(asset.url);
      return current.filter((item) => item.id !== assetId);
    });
  }

  async function requestStudy(message: string, answers = answersContext) {
    if (assets.length === 0) {
      setError("Añade al menos una foto o un audio antes de crear el test.");
      return;
    }

    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("message", message);
    formData.append("answers", answers);
    assets.forEach((asset) => formData.append("files", asset.file, asset.name));

    try {
      const response = await fetch("/api/study", { method: "POST", body: formData });
      const data = (await response.json()) as StudyResult & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "No se ha podido crear el test.");

      const clarification = data.clarification;
      if (data.kind === "clarification" && clarification) {
        setMessages((current) => [...current, {
          id: makeId("assistant"),
          role: "assistant",
          text: clarification.question,
          options: clarification.options,
        }]);
      } else if (data.kind === "quiz") {
        setQuiz(data);
        setQuizAnswers({});
        setHelpUsed({});
        setActiveQuestion(0);
        setView("quiz");
        setMessages((current) => [...current, {
          id: makeId("assistant"),
          role: "assistant",
          text: `He preparado ${data.questions.length} preguntas a partir de tus apuntes. Puedes resolverlas en cualquier orden.`,
        }]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se ha podido crear el test.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (loading || (!composer.trim() && assets.length === 0)) return;
    const message = composer.trim() || "Convierte estos apuntes en un test.";
    setMessages((current) => [...current, {
      id: makeId("user"),
      role: "user",
      text: composer.trim() || "He enviado mis apuntes.",
      assetCount: assets.length,
    }]);
    setComposer("");
    await requestStudy(message);
  }

  async function handleClarification(option: ClarificationOption) {
    if (loading) return;
    const nextAnswers = `${answersContext}\n${option.label}: ${option.description}`.trim();
    setAnswersContext(nextAnswers);
    setMessages((current) => [...current, { id: makeId("user"), role: "user", text: option.label }]);
    await requestStudy("Continúa con la creación del test usando mi respuesta.", nextAnswers);
  }

  async function startRecording() {
    if (recording || loading) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `apunte-voz-${Date.now()}.webm`, { type: blob.type });
        addFilesFromArray([file]);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      setRecording(true);
      setError("");
    } catch {
      setError("No se ha podido acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function addFilesFromArray(files: File[]) {
    const incoming = files.slice(0, Math.max(0, 12 - assets.length)).map((file) => ({
      id: makeId("asset"),
      file,
      kind: "audio" as const,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setAssets((current) => [...current, ...incoming]);
  }

  function chooseAnswer(questionId: string, optionId: string) {
    setQuizAnswers((current) => ({ ...current, [questionId]: optionId }));
  }

  function toggleHelp(questionId: string) {
    setHelpUsed((current) => current[questionId] ? current : { ...current, [questionId]: true });
  }

  function submitQuiz() {
    if (!quiz) return;
    const checked = quiz.questions.map((question) => {
      const answer = quizAnswers[question.id];
      const correct = answer === question.correctOptionId;
      return { question, answer, correct, points: correct ? (helpUsed[question.id] ? 0.5 : 1) : 0 };
    });
    setResults(checked);
    setView("results");
  }

  function repeatQuiz() {
    setQuizAnswers({});
    setHelpUsed({});
    setResults([]);
    setActiveQuestion(0);
    setView("quiz");
  }

  function newStudy() {
    assets.forEach((asset) => URL.revokeObjectURL(asset.url));
    setAssets([]);
    setMessages([introMessage]);
    setAnswersContext("");
    setQuiz(null);
    setResults([]);
    setComposer("");
    setError("");
    setView("compose");
  }

  return (
    <section className="study-shell" aria-label="Convertir apuntes en test">
      <header className="study-header">
        <div>
          <p className="workspace-kicker">Laboratorio de estudio</p>
          <h1>De tus apuntes a un test que recuerdas.</h1>
          <p className="study-lede">Envía imágenes, voz o ambas. El asistente detecta lo importante, pregunta lo justo y prepara una evaluación a tu medida.</p>
        </div>
        <div className="study-header-actions">
          <span className="live-status"><span /> {view === "quiz" ? "Test abierto" : view === "results" ? "Revisión" : "Listo para empezar"}</span>
          <button className="new-study-button" type="button" onClick={newStudy}>Nuevo test</button>
        </div>
      </header>

      {view === "compose" ? (
        <div className="study-compose-layout">
          <div className="study-chat-panel">
            <div className="study-panel-head"><div><p className="panel-title">Conversación</p><p className="panel-note">Cuéntame cómo quieres estudiar.</p></div><span className="panel-count">{assets.length} fuentes</span></div>
            <div className="study-chat" aria-live="polite">
              {messages.map((message) => (
                <div className={`study-message ${message.role}`} key={message.id}>
                  <div className="study-message-bubble">{message.text}{message.assetCount ? <span className="message-asset-count">{message.assetCount} archivos adjuntos</span> : null}</div>
                  {message.options ? <div className="clarification-options">{message.options.map((option) => <button key={option.id} type="button" onClick={() => handleClarification(option)} disabled={loading}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div> : null}
                </div>
              ))}
              {loading ? <div className="study-thinking"><span /><span /><span /> Analizando tus fuentes</div> : null}
            </div>
            <div className="source-tray" aria-label="Fuentes adjuntas">
              {assets.map((asset) => <div className={`source-card ${asset.kind}`} key={asset.id}>
                {asset.kind === "image" ? <Image src={asset.url} alt={asset.name} fill unoptimized sizes="80px" /> : <div className="audio-source-mark">VOZ</div>}
                <button type="button" onClick={() => removeAsset(asset.id)} aria-label={`Quitar ${asset.name}`}>×</button>
                <span>{asset.kind === "image" ? "Foto" : "Audio"}</span>
              </div>)}
              {assets.length === 0 ? <div className="source-empty">Tus fuentes aparecerán aquí</div> : null}
            </div>
            <div className="study-composer">
              <textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Por ejemplo: crea un test difícil sobre la fotosíntesis..." rows={2} maxLength={500} disabled={loading} />
              <div className="composer-tools">
                <div className="source-actions">
                  <input ref={galleryInputRef} type="file" accept="image/*,audio/*" multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = ""; }} />
                  <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={loading || assets.length >= 12}>Añadir archivos</button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={loading || assets.length >= 12}>Cámara</button>
                  <button className={recording ? "recording" : ""} type="button" onClick={recording ? stopRecording : startRecording} disabled={loading || assets.length >= 12}>{recording ? "Parar grabación" : "Grabar audio"}</button>
                </div>
                <button className="study-send" type="button" onClick={handleSend} disabled={loading || (!composer.trim() && assets.length === 0)} aria-label="Crear test">Enviar</button>
              </div>
              <div className="composer-meta"><span>JPG, PNG, WEBP y audio</span><span>{composer.length}/500</span></div>
            </div>
            {error ? <p className="study-error" role="alert">{error}</p> : null}
          </div>
          <aside className="study-side-panel">
            <div className="side-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="side-visual-core"><span>U</span></div><p>Aprende<br />a tu manera.</p></div>
            <div className="side-feature"><span className="feature-number">01</span><div><strong>Multimodal</strong><p>Una foto de una pizarra y una explicación de voz pueden formar el mismo test.</p></div></div>
            <div className="side-feature"><span className="feature-number">02</span><div><strong>Sin orden fijo</strong><p>Salta entre preguntas, vuelve atrás y pide una pista cuando la necesites.</p></div></div>
          </aside>
        </div>
      ) : null}

      {view === "quiz" && quiz && currentQuestion ? <QuizView quiz={quiz} currentQuestion={currentQuestion} activeQuestion={activeQuestion} answeredCount={answeredCount} quizAnswers={quizAnswers} helpUsed={helpUsed} onSelectQuestion={setActiveQuestion} onChooseAnswer={chooseAnswer} onToggleHelp={toggleHelp} onPrevious={() => setActiveQuestion((current) => Math.max(0, current - 1))} onNext={() => setActiveQuestion((current) => Math.min(quiz.questions.length - 1, current + 1))} onSubmit={submitQuiz} /> : null}
      {view === "results" && quiz ? <ResultsView quiz={quiz} results={results} onRepeat={repeatQuiz} onNew={newStudy} /> : null}
    </section>
  );
}

function QuizView({ quiz, currentQuestion, activeQuestion, answeredCount, quizAnswers, helpUsed, onSelectQuestion, onChooseAnswer, onToggleHelp, onPrevious, onNext, onSubmit }: {
  quiz: StudyResult;
  currentQuestion: StudyQuestion;
  activeQuestion: number;
  answeredCount: number;
  quizAnswers: Record<string, string>;
  helpUsed: Record<string, boolean>;
  onSelectQuestion: (index: number) => void;
  onChooseAnswer: (questionId: string, optionId: string) => void;
  onToggleHelp: (questionId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const progress = Math.round((answeredCount / quiz.questions.length) * 100);
  return <div className="quiz-layout">
    <div className="quiz-main">
      <div className="quiz-topline"><div><p className="workspace-kicker">Modo estudio</p><h2>{quiz.title}</h2><p>{quiz.summary}</p></div><div className="quiz-progress"><strong>{answeredCount}/{quiz.questions.length}</strong><span>respondidas</span><div><i style={{ width: `${progress}%` }} /></div></div></div>
      <div className="quiz-question-card">
        <div className="question-card-head"><span>Pregunta {activeQuestion + 1}</span><span>{helpUsed[currentQuestion.id] ? "Pista usada · 0,5 puntos" : "1 punto"}</span></div>
        <h3>{currentQuestion.prompt}</h3>
        <div className="quiz-options">{currentQuestion.options.map((option, index) => <button className={quizAnswers[currentQuestion.id] === option.id ? "selected" : ""} type="button" key={option.id} onClick={() => onChooseAnswer(currentQuestion.id, option.id)}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option.text}</span><span className="option-check" /></button>)}</div>
        <div className="help-area">{helpUsed[currentQuestion.id] ? <div className="hint-card"><span>Pista</span><p>{currentQuestion.hint}</p></div> : <button className="help-button" type="button" onClick={() => onToggleHelp(currentQuestion.id)}>Pedir ayuda <span>La respuesta correcta valdrá 0,5</span></button>}</div>
      </div>
      <div className="quiz-controls"><button type="button" onClick={onPrevious} disabled={activeQuestion === 0}>Anterior</button><button type="button" onClick={onNext} disabled={activeQuestion === quiz.questions.length - 1}>Siguiente</button><button className="finish-button" type="button" onClick={onSubmit}>Enviar test</button></div>
    </div>
    <aside className="quiz-navigation"><div className="quiz-nav-head"><div><p className="panel-title">Tu recorrido</p><p className="panel-note">Puedes ir en cualquier orden.</p></div><span>{progress}%</span></div><div className="question-map">{quiz.questions.map((question, index) => <button className={`${index === activeQuestion ? "active " : ""}${quizAnswers[question.id] ? "answered" : ""}`} type="button" key={question.id} onClick={() => onSelectQuestion(index)}>{String(index + 1).padStart(2, "0")}</button>)}</div><div className="map-legend"><span><i className="legend-current" />Actual</span><span><i className="legend-answered" />Respondida</span><span><i />Pendiente</span></div><div className="quiz-nav-note"><strong>Un test no es una carrera.</strong><p>Usa las pistas para aprender, no solo para acertar.</p></div></aside>
  </div>;
}

function ResultsView({ quiz, results, onRepeat, onNew }: { quiz: StudyResult; results: QuizResult[]; onRepeat: () => void; onNew: () => void }) {
  const points = results.reduce((total, result) => total + result.points, 0);
  const max = quiz.questions.length;
  const percentage = Math.round((points / max) * 100);
  return <div className="results-shell"><div className="results-hero"><div><p className="workspace-kicker">Test terminado</p><h2>{percentage >= 70 ? "Buen trabajo." : "Ya tienes por dónde seguir."}</h2><p>Esta corrección te muestra qué dominas y qué merece otra vuelta.</p></div><div className="score-orbit"><strong>{points.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</strong><span>/ {max}</span><small>puntos</small></div></div><div className="results-actions"><button className="finish-button" type="button" onClick={onRepeat}>Repetir test</button><button className="results-secondary" type="button" onClick={onNew}>Crear otro test</button></div><div className="correction-list">{results.map((result, index) => <article className={`correction-item ${result.correct ? "correct" : "incorrect"}`} key={result.question.id}><div className="correction-index">{String(index + 1).padStart(2, "0")}</div><div><p>{result.question.prompt}</p><span>{result.correct ? `Correcta · ${result.points.toLocaleString("es-ES")} puntos` : result.answer ? "Incorrecta · revisa el concepto" : "Sin responder"}</span><small>{result.correct ? result.question.explanation : `Respuesta correcta: ${result.question.options.find((option) => option.id === result.question.correctOptionId)?.text || "Revisa tus apuntes"}. ${result.question.explanation}`}</small></div><strong>{result.correct ? "OK" : result.answer ? "REV" : "—"}</strong></article>)}</div></div>;
}
