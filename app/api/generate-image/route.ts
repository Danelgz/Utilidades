import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Answer = {
  id: string;
  label: string;
  value: string;
};

type Answers = {
  style?: Answer;
  format?: Answer;
};

const styleOptions: Answer[] = [
  { id: "editorial", label: "Editorial", value: "dirección de arte editorial, composición de revista y luz cuidada" },
  { id: "photorealistic", label: "Fotorealista", value: "fotografía fotorealista, texturas naturales y luz físicamente creíble" },
  { id: "illustration", label: "Ilustración", value: "ilustración contemporánea con formas expresivas y acabado artístico" },
  { id: "3d", label: "3D pulido", value: "render 3D pulido, materiales detallados y sombras suaves" },
];

const formatOptions: Answer[] = [
  { id: "square", label: "Cuadrada", value: "formato cuadrado 1:1" },
  { id: "portrait", label: "Vertical", value: "composición vertical 9:16" },
  { id: "landscape", label: "Horizontal", value: "composición horizontal 16:9" },
  { id: "wide", label: "Panorámica", value: "composición panorámica 21:9" },
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function getNextQuestion(message: string, answers: Answers) {
  const normalized = message.trim().toLocaleLowerCase("es");

  if (normalized.length < 8) {
    return {
      type: "question" as const,
      question: "¿Qué te gustaría ver en la imagen?",
      options: [
        { id: "portrait", label: "Un retrato", value: "un retrato" },
        { id: "landscape", label: "Un paisaje", value: "un paisaje" },
        { id: "product", label: "Un producto", value: "una imagen de producto" },
        { id: "fantasy", label: "Una escena fantástica", value: "una escena fantástica" },
      ],
    };
  }

  const hasStyle = Boolean(answers.style) || includesAny(normalized, [
    "editorial", "fotoreal", "realista", "fotografía", "foto ", "ilustración", "dibujo", "acuarela",
    "anime", "cómic", "3d", "render", "cinematográ", "minimalista",
  ]);

  if (!hasStyle) {
    return { type: "question" as const, question: "¿Qué lenguaje visual encaja mejor con tu idea?", options: styleOptions };
  }

  const hasFormat = Boolean(answers.format) || includesAny(normalized, [
    "cuadrad", "vertical", "horizontal", "panorám", "9:16", "16:9", "1:1", "historia", "story", "post", "fondo de pantalla", "wallpaper",
  ]);

  if (!hasFormat) {
    return { type: "question" as const, question: "¿Dónde vas a utilizarla?", options: formatOptions };
  }

  return null;
}

function getAspectRatio(answers: Answers, message: string) {
  if (answers.format?.id === "portrait" || /vertical|9:16|story|historia/i.test(message)) return "9:16";
  if (answers.format?.id === "landscape" || /horizontal|16:9/i.test(message)) return "16:9";
  if (answers.format?.id === "wide" || /panorám|21:9/i.test(message)) return "21:9";
  return "1:1";
}

function buildImagePrompt(message: string, answers: Answers) {
  const choices = [answers.style?.value, answers.format?.value].filter(Boolean).join(". ");
  return [
    "Genera una única imagen terminada a partir de esta petición.",
    "No incluyas texto, letras, logotipos, marcas de agua añadidas por ti, marcos ni explicaciones.",
    "Prioriza una composición clara, un sujeto bien definido, iluminación coherente y detalles de alta calidad.",
    choices,
    `Petición del usuario: ${message.trim()}`,
  ].filter(Boolean).join("\n\n");
}

function getApiErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; answers?: Answers };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const answers = body.answers ?? {};

    if (!message) return NextResponse.json({ error: "Escribe una descripción para empezar." }, { status: 400 });
    if (message.length > 2_000) return NextResponse.json({ error: "La petición es demasiado larga." }, { status: 400 });

    const question = getNextQuestion(message, answers);
    if (question) return NextResponse.json(question);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en Vercel." }, { status: 503 });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: buildImagePrompt(message, answers),
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: getAspectRatio(answers, message), imageSize: "1K" },
      },
    });

    const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return NextResponse.json({ error: "Gemini no ha devuelto una imagen para esta petición." }, { status: 502 });
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    return NextResponse.json({ type: "image", imageUrl: `data:${mimeType};base64,${imagePart.inlineData.data}` });
  } catch (error) {
    console.error("Image generation failed", error);
    if (getApiErrorStatus(error) === 429) {
      return NextResponse.json(
        { error: "La clave de Gemini no tiene cuota disponible. Activa la facturaci\u00f3n o aumenta el l\u00edmite de la API para generar im\u00e1genes." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "No se ha podido generar la imagen. Prueba con otra descripción." }, { status: 500 });
  }
}
