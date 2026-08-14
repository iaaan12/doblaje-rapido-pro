const SAMPLE_TRANSCRIPT = {
  language: 'es',
  utterances: [
    { text: 'Bienvenido a tu espacio de doblaje.', speaker_id: 'speaker_0', start_s: 0, end_s: 2.4 },
    { text: 'Editá el texto y exportá el resultado cuando quieras.', speaker_id: 'speaker_1', start_s: 2.4, end_s: 5.8 },
  ],
};

function createDemoResource(id, snapshot) {
  const language = snapshot.targetLang || 'es';
  const segments = {
    segment_0: { segment_id: 'segment_0', speaker_id: 'speaker_0', start_time: 0, end_time: 2.4, text: SAMPLE_TRANSCRIPT.utterances[0].text },
    segment_1: { segment_id: 'segment_1', speaker_id: 'speaker_1', start_time: 2.4, end_time: 5.8, text: SAMPLE_TRANSCRIPT.utterances[1].text },
  };
  return {
    id,
    version: 1,
    source_language: snapshot.sourceLang || 'en',
    target_languages: [language],
    input: { duration_secs: 5.8, is_audio: false },
    speaker_tracks: {
      speaker_0: { speaker_id: 'speaker_0', speaker_name: 'Narrador', voice_id: 'track-clone', voice_stability: 0.65, voice_similarity: 0.8, voice_style: 0.2 },
      speaker_1: { speaker_id: 'speaker_1', speaker_name: 'Voz 2', voice_id: 'clip-clone', voice_stability: 0.7, voice_similarity: 0.82, voice_style: 0.15 },
    },
    speaker_segments: { [language]: segments },
    renders: {},
  };
}

export function createDemoGateway() {
  const jobs = new Map();
  let counter = 0;
  return {
    async createDub(snapshot) {
      const id = `demo-${++counter}`;
      jobs.set(id, { id, snapshot, polls: 0, createdAt: new Date().toISOString(), resource: createDemoResource(id, snapshot) });
      return { dubbing_id: id, expected_duration_sec: 5.8 };
    },
    async getDub(id) {
      const job = jobs.get(id);
      if (!job) throw new Error('Demo: trabajo no encontrado');
      job.polls += 1;
      const status = job.polls < 2 ? 'transcribing' : job.polls < 3 ? 'dubbing' : 'dubbed';
      return { dubbing_id: id, name: job.snapshot.name, status, source_language: job.snapshot.sourceLang || 'en', target_languages: [job.snapshot.targetLang], editable: job.snapshot.dubbingStudio === true, media_metadata: { content_type: 'video/mp4', duration: 5.8 } };
    },
    async listDubs() {
      return { dubs: [...jobs.values()].map(job => ({ dubbing_id: job.id, name: job.snapshot.name, status: 'dubbed', source_language: job.snapshot.sourceLang || 'en', target_languages: [job.snapshot.targetLang], editable: Boolean(job.snapshot.dubbingStudio), created_at: job.createdAt, media_metadata: { content_type: 'video/mp4', duration: 5.8 } })), has_more: false };
    },
    async downloadDub(id, language, format = 'media') {
      return new Blob([`Demo export ${id} ${language} ${format}`], { type: 'video/mp4' });
    },
    async getTranscript(id, language) {
      const job = jobs.get(id);
      if (!job) throw new Error('Demo: trabajo no encontrado');
      const clips = Object.values(job.resource.speaker_segments[language] || {});
      return { language, utterances: clips.map(clip => ({ text: clip.text, speaker_id: clip.speaker_id, start_s: clip.start_time, end_s: clip.end_time })) };
    },
    async getResource(id) {
      const job = jobs.get(id);
      if (!job) throw new Error('Demo: recurso no encontrado');
      return structuredClone(job.resource);
    },
    async updateSegment(id, segmentId, language, changes) {
      const job = jobs.get(id); const segment = job?.resource.speaker_segments[language]?.[segmentId];
      if (!segment) throw new Error('Demo: segmento no encontrado');
      if (changes.startTime !== undefined) segment.start_time = changes.startTime;
      if (changes.endTime !== undefined) segment.end_time = changes.endTime;
      if (changes.text !== undefined) segment.text = changes.text;
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async createSpeaker(id, settings = {}) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      const speakerId = `speaker_${Object.keys(job.resource.speaker_tracks).length}`;
      job.resource.speaker_tracks[speakerId] = { speaker_id: speakerId, speaker_name: settings.speakerName || 'Nuevo hablante', voice_id: settings.voiceId || 'track-clone', voice_stability: settings.voiceStability ?? 0.65, voice_similarity: settings.voiceSimilarity ?? 0.8, voice_style: settings.voiceStyle ?? 0.2 };
      job.resource.version += 1;
      return { version: job.resource.version, speaker_id: speakerId };
    },
    async updateSpeaker(id, speakerId, settings = {}) {
      const job = jobs.get(id); const speaker = job?.resource.speaker_tracks[speakerId];
      if (!speaker) throw new Error('Demo: hablante no encontrado');
      if (settings.speakerName !== undefined) speaker.speaker_name = settings.speakerName;
      if (settings.voiceId !== undefined) speaker.voice_id = settings.voiceId;
      if (settings.voiceStability !== undefined) speaker.voice_stability = settings.voiceStability;
      if (settings.voiceSimilarity !== undefined) speaker.voice_similarity = settings.voiceSimilarity;
      if (settings.voiceStyle !== undefined) speaker.voice_style = settings.voiceStyle;
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async createSegment(id, speakerId, segment = {}) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      const language = job.resource.target_languages[0];
      const segmentId = `segment_${Object.keys(job.resource.speaker_segments[language]).length}`;
      job.resource.speaker_segments[language][segmentId] = { segment_id: segmentId, speaker_id: speakerId, start_time: segment.startTime, end_time: segment.endTime, text: segment.text || '' };
      job.resource.version += 1;
      return { version: job.resource.version, new_segment: segmentId };
    },
    async deleteSegment(id, segmentId) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      for (const language of job.resource.target_languages) delete job.resource.speaker_segments[language]?.[segmentId];
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async redubSegments(id) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async renderProject(id, language, { renderType = 'mp4' } = {}) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      const renderId = `render-${Date.now()}`;
      job.resource.renders[language] = { [renderId]: { render_id: renderId, render_type: renderType, status: 'completed' } };
      return { version: job.resource.version, render_id: renderId };
    },
    async addLanguage(id, language) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      if (!job.resource.target_languages.includes(language)) { job.resource.target_languages.push(language); job.resource.speaker_segments[language] = structuredClone(job.resource.speaker_segments[job.resource.target_languages[0]]); }
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async transcribeSegments(id) {
      const job = jobs.get(id); if (!job) throw new Error('Demo: recurso no encontrado');
      job.resource.version += 1;
      return { version: job.resource.version };
    },
    async getSimilarVoices() { return { voices: [{ voice_id: 'demo-voice', name: 'Demo Voice', category: 'premade', description: 'Voz de demostración', preview_url: '' }] }; },
    async deleteDub(id) { jobs.delete(id); return { status: 'ok' }; },
  };
}
