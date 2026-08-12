# Utilidades

Aplicación Next.js preparada para Firebase Authentication y Vercel.

## Configuración local

1. Copia `.env.example` a `.env.local`.
2. Completa la configuración de tu aplicación web de Firebase.
3. En Firebase Authentication, habilita los proveedores Google y Correo electrónico/contraseña.
4. Ejecuta `npm run dev`.

La configuración `NEXT_PUBLIC_FIREBASE_*` no son secretos; la configuración web de Firebase se usa en el navegador. `GEMINI_API_KEY` es privada y solo debe existir en Vercel y `.env.local`.

## Convertir apuntes en test

La herramienta admite varias imágenes, archivos de audio, cámara y grabación desde el navegador. Gemini analiza las fuentes, puede pedir una aclaración y devuelve un test estructurado con navegación libre, pistas de medio punto, corrección y repetición.
