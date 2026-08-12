# Utilidades

Aplicación Next.js preparada para Firebase Authentication y Vercel.

## Configuración local

1. Copia `.env.example` a `.env.local`.
2. Completa la configuración de tu aplicación web de Firebase.
3. En Firebase Authentication, habilita los proveedores Google y Correo electrónico/contraseña.
4. Ejecuta `npm run dev`.

La configuración `NEXT_PUBLIC_FIREBASE_*` no son secretos; la configuración web de Firebase se usa en el navegador. Las claves privadas, como `GEMINI_API_KEY`, deben mantenerse únicamente en variables de entorno de Vercel y en `.env.local`.
