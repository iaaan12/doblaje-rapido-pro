const DEFAULT_API = 'https://xrknoioturyuuzxmuwka.supabase.co/functions/v1/elevenlabs';

function appendIf(form, key, value) {
  if (value === undefined || value === null || value === '' || value === false) return;
  form.append(key, String(value));
}

function appendFileIf(form, key, file, fallbackName) {
  if (!file) return;
  form.append(key, file, file.name || fallbackName);
}

function assertSourceUrl(value) {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { throw new Error('URL de origen inválida'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de origen inválida');
}

export function buildDubbingForm(snapshot = {}) {
  const targetLang = String(snapshot.targetLang || '').trim();
  if (!targetLang) throw new Error('Seleccioná al menos un idioma destino');
  const manualTracks = snapshot.mode === 'manual' && (snapshot.foregroundAudioFile || snapshot.backgroundAudioFile);
  if (!snapshot.file && !snapshot.sourceUrl && !manualTracks) throw new Error('Falta el archivo o la URL de origen');
  assertSourceUrl(snapshot.sourceUrl);

  const form = new FormData();
  if (snapshot.file) form.append('file', snapshot.file, snapshot.file.name || 'source-media');
  appendIf(form, 'source_url', snapshot.sourceUrl);
  appendIf(form, 'name', snapshot.name);
  appendIf(form, 'source_lang', snapshot.sourceLang);
  appendIf(form, 'target_lang', targetLang);
  appendIf(form, 'num_speakers', snapshot.numSpeakers);
  appendIf(form, 'target_accent', snapshot.targetAccent);
  appendIf(form, 'start_time', snapshot.startTime);
  appendIf(form, 'end_time', snapshot.endTime);
  appendIf(form, 'csv_fps', snapshot.csvFps);
  if (snapshot.highestResolution) form.append('highest_resolution', 'true');
  if (snapshot.dropBackgroundAudio) form.append('drop_background_audio', 'true');
  if (snapshot.profanityFilter) form.append('use_profanity_filter', 'true');
  if (snapshot.disableVoiceCloning) form.append('disable_voice_cloning', 'true');
  if (snapshot.watermark) form.append('watermark', 'true');
  form.append('dubbing_studio', 'true');
  form.append('mode', snapshot.mode === 'manual' ? 'manual' : 'automatic');
  appendFileIf(form, 'csv_file', snapshot.csvFile, 'transcript.csv');
  appendFileIf(form, 'foreground_audio_file', snapshot.foregroundAudioFile, 'foreground.wav');
  appendFileIf(form, 'background_audio_file', snapshot.backgroundAudioFile, 'background.wav');
  return form;
}

async function readBody(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('json')) return response.json();
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

function errorMessage(data, status) {
  if (typeof data === 'string' && data.trim()) return data.slice(0, 400);
  if (data?.detail) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail).slice(0, 400);
  if (data?.error) return String(data.error).slice(0, 400);
  return `El gateway respondió ${status}`;
}

export function createDubbingGateway({ baseUrl = DEFAULT_API, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible');
  const base = baseUrl.replace(/\/$/, '');

  async function request(path, options = {}) {
    const response = await fetchImpl(base + path, options);
    const data = await readBody(response);
    if (!response.ok) {
      const error = new Error(errorMessage(data, response.status));
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function requestBlob(path, options = {}) {
    const response = await fetchImpl(base + path, options);
    if (!response.ok) {
      const error = new Error(errorMessage(await readBody(response), response.status));
      error.status = response.status;
      throw error;
    }
    return response.blob();
  }

  function pathPart(value) { return encodeURIComponent(String(value)); }

  function jsonRequest(path, method, body) {
    return request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return {
    async createDub(snapshot) {
      return request('/v1/dubbing', { method: 'POST', body: buildDubbingForm(snapshot) });
    },
    async getDub(id) { return request(`/v1/dubbing/${encodeURIComponent(id)}`); },
    async listDubs(query = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') params.set(key, value);
      }
      const suffix = params.toString() ? `?${params}` : '';
      return request(`/v1/dubbing${suffix}`);
    },
    async downloadDub(id, language, format = 'media') {
      if (format !== 'media') throw new Error(`El gateway no expone todavía el formato ${format}`);
      return requestBlob(`/v1/dubbing/${pathPart(id)}/audio/${pathPart(language)}`);
    },
    async getTranscript(id, language, format = 'json') {
      const canonical = `/v1/dubbing/${pathPart(id)}/transcript/${pathPart(language)}?format_type=${pathPart(format)}`;
      try {
        return await request(canonical);
      } catch (error) {
        if (error.status !== 404 && error.status !== 405) throw error;
        return request(`/v1/dubbing/${pathPart(id)}/transcripts/${pathPart(language)}/format/${pathPart(format)}`);
      }
    },
    async deleteDub(id) { return request(`/v1/dubbing/${pathPart(id)}`, { method: 'DELETE' }); },
    async getResource(id) {
      return request(`/v1/dubbing/resource/${pathPart(id)}`);
    },
    async updateSegment(id, segmentId, language, changes = {}) {
      const body = {};
      if (changes.startTime !== undefined) body.start_time = changes.startTime;
      if (changes.endTime !== undefined) body.end_time = changes.endTime;
      if (changes.text !== undefined) body.text = changes.text;
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/segment/${pathPart(segmentId)}/${pathPart(language)}`, 'PATCH', body);
    },
    async createSpeaker(id, settings = {}) {
      const body = {};
      if (settings.speakerName !== undefined) body.speaker_name = settings.speakerName;
      if (settings.voiceId !== undefined) body.voice_id = settings.voiceId;
      if (settings.voiceStability !== undefined) body.voice_stability = settings.voiceStability;
      if (settings.voiceSimilarity !== undefined) body.voice_similarity = settings.voiceSimilarity;
      if (settings.voiceStyle !== undefined) body.voice_style = settings.voiceStyle;
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/speaker`, 'POST', body);
    },
    async updateSpeaker(id, speakerId, settings = {}) {
      const body = {};
      if (settings.speakerName !== undefined) body.speaker_name = settings.speakerName;
      if (settings.voiceId !== undefined) body.voice_id = settings.voiceId;
      if (settings.voiceStability !== undefined) body.voice_stability = settings.voiceStability;
      if (settings.voiceSimilarity !== undefined) body.voice_similarity = settings.voiceSimilarity;
      if (settings.voiceStyle !== undefined) body.voice_style = settings.voiceStyle;
      if (settings.languages !== undefined) body.languages = settings.languages;
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/speaker/${pathPart(speakerId)}`, 'PATCH', body);
    },
    async createSegment(id, speakerId, segment = {}) {
      const body = { start_time: segment.startTime, end_time: segment.endTime };
      if (segment.text !== undefined) body.text = segment.text;
      if (segment.translations !== undefined) body.translations = segment.translations;
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/speaker/${pathPart(speakerId)}/segment`, 'POST', body);
    },
    async deleteSegment(id, segmentId) {
      return request(`/v1/dubbing/resource/${pathPart(id)}/segment/${pathPart(segmentId)}`, { method: 'DELETE' });
    },
    async redubSegments(id, { segments = [], languages = null } = {}) {
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/dub`, 'POST', { segments, languages });
    },
    async renderProject(id, language, { renderType = 'mp4', normalizeVolume = false } = {}) {
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/render/${pathPart(language)}`, 'POST', {
        render_type: renderType,
        normalize_volume: Boolean(normalizeVolume),
      });
    },
    async addLanguage(id, language) {
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/language`, 'POST', { language });
    },
    async transcribeSegments(id, segments = []) {
      return jsonRequest(`/v1/dubbing/resource/${pathPart(id)}/transcribe`, 'POST', { segments });
    },
    async getSimilarVoices(id, speakerId) {
      return request(`/v1/dubbing/resource/${pathPart(id)}/speaker/${pathPart(speakerId)}/similar-voices`);
    },
  };
}

export { DEFAULT_API };
