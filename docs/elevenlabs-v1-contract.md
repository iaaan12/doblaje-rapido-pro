# Contrato usado: ElevenLabs Dubbing v1

La app fuerza el flujo legacy v1 + Dubbing Studio. No se selecciona ni se envía Dubbing v2.

## Creación y consulta

| Operación | Método | Ruta |
| --- | --- | --- |
| Crear dub | POST multipart | `/v1/dubbing` |
| Obtener estado | GET | `/v1/dubbing/:dubbing_id` |
| Listar | GET | `/v1/dubbing` |
| Descargar media | GET | `/v1/dubbing/:dubbing_id/audio/:language` |
| Transcript | GET | `/v1/dubbing/:dubbing_id/transcript/:language?format_type=json` |
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

La creación envía los nombres multipart documentados por v1: `file`, `source_url`, `name`, `source_lang`, `target_lang`, `target_accent`, `num_speakers`, `start_time`, `end_time`, `highest_resolution`, `drop_background_audio`, `use_profanity_filter`, `watermark`, `disable_voice_cloning`, `dubbing_studio`, `mode`, `csv_fps`, `csv_file`, `foreground_audio_file` y `background_audio_file`.

## Verificación realizada

- `GET /v1/dubbing` respondió JSON desde el gateway configurado.
- `GET /v1/dubbing/resource/:id` respondió el error de autorización de closed beta del workspace, por lo que no se creó ni modificó ningún proyecto real.
- El adaptador y el demo cubren las rutas y payloads de Studio con tests Node y E2E de navegador.
