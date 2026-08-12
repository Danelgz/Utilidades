import { createGoogle } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const clarificationOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});

const studySchema = z.object({
  kind: z.enum(["clarification", "quiz"]),
  title: z.string(),
  summary: z.string(),
  clarification: z.object({
    question: z.string(),
    options: z.array(clarificationOptionSchema).min(2).max(4),
  }).nullable(),
  questions: z.array(z.object({
    id: z.string(),
    prompt: z.string(),
    options: z.array(z.object({ id: z.string(), text: z.string() })).length(4),
    correctOptionId: z.string(),
    hint: z.string(),
    explanation: z.string(),
  })).max(12),
});

type StudyOutput = z.infer<typeof studySchema>;

function getStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function buildPrompt(message: string, answers: string) {
  return `Eres un diseñador experto de evaluaciones para estudiantes. Tu trabajo es transformar apuntes visuales y grabaciones de voz en un test de preguntas tipo test en español.

Reglas de calidad:
- Basa cada pregunta exclusivamente en la información de los archivos enviados. Si el material no permite saber algo, no lo inventes.
- Lee texto manuscrito o impreso en imágenes y entiende el contenido hablado en los audios.
- Si falta una decisión importante para diseñar un buen test, responde con kind="clarification" y una sola pregunta con 2 a 4 opciones. Pregunta por el nivel, número de preguntas, dificultad, tema o enfoque solo si realmente hace falta.
- Si ya hay suficiente información, responde con kind="quiz" y genera entre 6 y 12 preguntas, equilibradas y útiles para recordar conceptos.
- Cada pregunta debe tener exactamente 4 opciones, una única respuesta correcta, una pista breve y una explicación de corrección.
- La pista no puede revelar directamente la respuesta.
- Devuelve únicamente el objeto estructurado solicitado, sin markdown ni texto adicional.

Petición del estudiante:
${message || "Convierte estos apuntes en un test claro y variado."}

Respuestas previas a tus aclaraciones:
${answers || "Ninguna"}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const message = typeof formData.get("message") === "string" ? String(formData.get("message")) : "";
    const answers = typeof formData.get("answers") === "string" ? String(formData.get("answers")) : "";
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "Añade al menos una foto o un audio con tus apuntes." }, { status: 400 });
    }
    if (files.length > 12) {
      return NextResponse.json({ error: "Puedes enviar hasta 12 archivos por test." }, { status: 400 });
    }

    const supportedFiles = files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("audio/"));
    if (supportedFiles.length !== files.length) {
      return NextResponse.json({ error: "Solo se admiten imágenes y audios." }, { status: 415 });
    }

    const fileParts = [];
    let totalBytes = 0;
    for (const file of supportedFiles) {
      totalBytes += file.size;
      if (file.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Cada archivo debe ocupar menos de 8 MB." }, { status: 413 });
      }
      const data = new Uint8Array(await file.arrayBuffer());
      fileParts.push({ type: "file" as const, data, mediaType: file.type });
    }
    if (totalBytes > 18 * 1024 * 1024) {
      return NextResponse.json({ error: "El conjunto de archivos no puede superar 18 MB." }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en Vercel para analizar tus apuntes." }, { status: 503 });
    }

    const google = createGoogle({ apiKey });
    const result = await generateText({
      model: google("gemini-3.6-flash"),
      messages: [{
        role: "user",
        content: [{ type: "text", text: buildPrompt(message, answers) }, ...fileParts],
      }],
      output: Output.object({
        name: "StudyTestOrClarification",
        description: "Una aclaración o un test de preguntas tipo test basado en apuntes multimodales.",
        schema: studySchema,
      }),
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "medium" },
        },
      },
    });

    const output = result.output as StudyOutput;
    if (output.kind === "clarification") {
      return NextResponse.json({
        ...output,
        questions: [],
      });
    }

    return NextResponse.json({
      ...output,
      clarification: null,
      questions: output.questions.map((question, index) => ({ ...question, id: question.id || `q-${index + 1}` })),
    });
  } catch (error) {
    console.error("Study generation failed", error);
    if (getStatus(error) === 429) {
      return NextResponse.json({ error: "La clave de Gemini no tiene cuota disponible para analizar apuntes. Activa la facturación o usa una clave con cuota." }, { status: 429 });
    }
    return NextResponse.json({ error: "No se ha podido crear el test. Revisa los archivos e inténtalo de nuevo." }, { status: 500 });
  }
}
