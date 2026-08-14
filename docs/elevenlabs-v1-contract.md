# Contrato usado: ElevenLabs Dubbing v1

La app usa el flujo legacy v1. Dubbing Studio es una opción explícita porque requiere acceso adicional del workspace. No se selecciona ni se envía Dubbing v2.

## Creación y consulta

| Operación | Método | Ruta |
| --- | --- | --- |
| Crear dub | POST multipart | `/v1/dubbing` |
| Obtener estado | GET | `/v1/dubbing/:dubbing_id` |
| Listar | GET | `/v1/dubbing` |
| Descargar media | GET | `/v1/dubbing/:dubbing_id/audio/:language` |
| Transcript | GET | `/v1/dubbing/:dubbing_id/transcripts/:language/format/:format` |
| Borrar dub | DELETE | `/v1/dubbing/:dubbing_id` |

## Dubbing Studio v1

| Operación | Método | Ruta |
| --- | --- | --- |
| Obtener recurso | GET | `/v1/dubbing/resource/:dubbing_id` |
| Editar segmento | PATCH | `/v1/dubbing/resource/:dubbing_id/segment/:segment_id/:language` |
| Crear segmento | POST | `/v1/dubbing/resource/:dubbing_id/speaker/:speaker_id/segment` |
| Borrar segmento | DELETE | `/v1/dubbing/resource/:dubbing_id/segment/:segment_id` |
| Crear speaker | POST | `/v1/dubbing/resource/:dubbing_id/speaker` |
| Editar speaker | PATCH | `/v1/dubbing/resource/:dubbing_id/speaker/:speaker_id` |
| Voces similares | GET | `/v1/dubbing/resource/:dubbing_id/speaker/:speaker_id/similar-voices` |
| Regenerar | POST | `/v1/dubbing/resource/:dubbing_id/dub` |
| Agregar idioma | POST | `/v1/dubbing/resource/:dubbing_id/language` |
| Transcribir segmentos | POST | `/v1/dubbing/resource/:dubbing_id/transcribe` |
| Renderizar | POST | `/v1/dubbing/resource/:dubbing_id/render/:language` |

## Campos relevantes

La creación envía los nombres multipart documentados por v1: `file`, `source_url`, `name`, `source_lang`, `target_lang`, `target_accent`, `num_speakers`, `start_time`, `end_time`, `highest_resolution`, `drop_background_audio`, `use_profanity_filter`, `watermark`, `disable_voice_cloning`, `dubbing_studio`, `mode`, `csv_fps`, `csv_file`, `foreground_audio_file` y `background_audio_file`. Los campos vacíos se omiten; `source_lang` queda vacío por defecto y `dubbing_studio` sólo se envía al activar Studio.

## Verificación realizada

- `GET /v1/dubbing` respondió JSON desde el gateway configurado.
- `GET /v1/dubbing/resource/:id` respondió el error de autorización del workspace. La edición de recursos Studio no puede certificarse mientras ese permiso externo no exista.
- El adaptador cubre las rutas y payloads de Studio con tests Node; la UI degrada a transcript de sólo lectura cuando el recurso editable no está disponible.
