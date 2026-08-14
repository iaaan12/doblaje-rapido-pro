# Doblaje Rápido Pro

Workbench personal para crear y administrar proyectos de ElevenLabs Dubbing v1 con el gateway configurado en `app/gateway.mjs`.

## Incluye

- Dubbing v1 + Dubbing Studio como único modelo de creación; no hay ruta v2 en la UI.
- Modos automático y manual v1, con CSV, foreground audio, background audio y FPS.
- Subida de archivos o URL de origen.
- Configuración avanzada v1: hablantes, acento, recorte, resolución, fondo, profanidades, clonación y watermark.
- Cola con snapshot de configuración, progreso, cancelación local, reintento y persistencia de metadatos.
- Biblioteca con búsqueda, filtros, metadatos, descarga y borrado.
- Dubbing Studio v1: segmentos editables, tiempos, traducción, regeneración por clip/proyecto, speakers, idiomas y render MP4/AAC/MP3/WAV/AAF/tracks ZIP/clips ZIP.
- Exportación CSV y fallback de transcript cuando el workspace no tiene acceso al recurso editable.
- Modo demo seguro para verificar el flujo sin crear trabajos reales.
- Servidor estático local con headers básicos y rutas inexistentes `404`.

## Ejecutar

```bash
npm start
```

Abrir `http://localhost:3000`.

Para probar el flujo completo sin consumir créditos:

```text
http://localhost:3000/?demo=1
```

## Tests

```bash
npm test
```

Los tests cubren el mapeo del formulario del gateway, validación de URLs, snapshot de configuración de la cola, finalización y errores del proveedor.

## Integración real

La UI no contiene una API key de ElevenLabs. Las operaciones reales pasan por la Edge Function de Supabase definida como `DEFAULT_API` en `app/gateway.mjs`. El gateway es el punto donde deben mantenerse los nombres de campos y rutas del proxy.

La creación v1 envía siempre `dubbing_studio=true`, no envía `model_id` y usa `mode=automatic|manual`. Las descargas de media usan `/v1/dubbing/:id/audio/:language`; los transcriptos prueban primero la ruta oficial singular con `format_type` y mantienen fallback para el proxy plural existente.

El listado real del gateway fue verificado con respuesta JSON. El recurso editable v1 responde `401` si el workspace no está habilitado para la closed beta de Dubbing Studio; la interfaz lo muestra y conserva la vista de transcript. Cuando ElevenLabs habilite ese permiso, las operaciones de Studio ya están cableadas en el adaptador.

La matriz de rutas v1 está documentada en `docs/elevenlabs-v1-contract.md`.

## Estructura

```text
index.html          shell de la aplicación
styles.css          sistema visual responsive
app/main.mjs        interacción y vistas
app/gateway.mjs     adaptador del proveedor
app/queue.mjs       máquina de estados de la cola
app/storage.mjs     IndexedDB con fallback local
app/demo-gateway.mjs transporte fake para QA
app/languages.mjs   catálogo de idiomas
tests/              tests Node nativos
```
