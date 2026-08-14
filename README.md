# 🎬 Doblaje Rápido Pro

Aplicación web para doblaje automático de videos y audios usando el servicio ElevenLabs Dubbing. Cola de múltiples archivos, todas las opciones de doblaje, y descarga directa del resultado.

## Características

- **Cola de doblaje** — añade múltiples videos/audios y se procesan en secuencia automáticamente
- **Doblaje desde archivo o URL** — arrastra archivos o pega una URL directa
- **13 idiomas** de origen (con auto-detección) y destino
- **Opciones completas del API de dubbing**:
  - `num_speakers` (auto o 1-7)
  - `remove_background_noise` — eliminar ruido de fondo
  - `watermark` — marca de agua
  - `dubbing_studio` — doblaje editable
  - `use_proxy` — re-doblar un dubbing existente como base
- **Dubs existentes** — lista, descarga y borra dubbings previos
- **Progreso en vivo** por cada item de la cola (subiendo → transcribiendo → traduciendo → doblando → listo)
- Descarga individual con nombre original + idioma

## Uso

```bash
node server.mjs
```

Abrir `http://localhost:3000`

O simplemente abrir `index.html` en cualquier navegador.

## Configuración

La URL del proxy de doblaje está en la constante `API` al inicio del script en `index.html`. Cambiarla si se usa otro endpoint compatible con el API de ElevenLabs Dubbing.

## Notas

- Dependencia cero — HTML + JS vanilla + un mini servidor estático (opcional, sirve como fallback de CORS)
- Los archivos se suben directamente al servicio de doblaje; la app es 100% local
