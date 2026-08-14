import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDubbingForm } from '../app/gateway.mjs';

test('buildDubbingForm maps the complete ElevenLabs legacy v1 Studio snapshot', async () => {
  const form = buildDubbingForm({
    name: 'Demo proyecto',
    targetLang: 'es',
    sourceLang: 'en',
    sourceUrl: 'https://example.com/video.mp4',
    numSpeakers: 3,
    targetAccent: 'es',
    highestResolution: true,
    dropBackgroundAudio: true,
    profanityFilter: true,
    disableVoiceCloning: true,
    watermark: true,
    mode: 'automatic',
    startTime: 12,
    endTime: 48,
  });

  assert.equal(form.get('name'), 'Demo proyecto');
  assert.equal(form.get('target_lang'), 'es');
  assert.equal(form.get('source_lang'), 'en');
  assert.equal(form.get('source_url'), 'https://example.com/video.mp4');
  assert.equal(form.get('dubbing_studio'), 'true');
  assert.equal(form.get('mode'), 'automatic');
  assert.equal(form.get('num_speakers'), '3');
  assert.equal(form.get('target_accent'), 'es');
  assert.equal(form.get('highest_resolution'), 'true');
  assert.equal(form.get('drop_background_audio'), 'true');
  assert.equal(form.get('use_profanity_filter'), 'true');
  assert.equal(form.get('disable_voice_cloning'), 'true');
  assert.equal(form.get('watermark'), 'true');
  assert.equal(form.get('start_time'), '12');
  assert.equal(form.get('end_time'), '48');
  assert.equal(form.has('model_id'), false);
});

test('buildDubbingForm supports v1 manual CSV dubbing inputs', () => {
  const form = buildDubbingForm({
    targetLang: 'es',
    file: new Blob(['source'], { type: 'video/mp4' }),
    csvFile: new Blob(['start,end,text'], { type: 'text/csv' }),
    foregroundAudioFile: new Blob(['foreground'], { type: 'audio/wav' }),
    backgroundAudioFile: new Blob(['background'], { type: 'audio/wav' }),
    mode: 'manual',
    csvFps: 24,
  });

  assert.equal(form.get('mode'), 'manual');
  assert.equal(form.get('csv_fps'), '24');
  assert.equal(form.get('dubbing_studio'), 'true');
  assert.ok(form.get('csv_file') instanceof Blob);
  assert.ok(form.get('foreground_audio_file') instanceof Blob);
  assert.ok(form.get('background_audio_file') instanceof Blob);
});

test('buildDubbingForm rejects an unsafe source URL', () => {
  assert.throws(
    () => buildDubbingForm({ targetLang: 'es', sourceUrl: 'javascript:alert(1)' }),
    /URL de origen inválida/
  );
});

test('legacy v1 resource methods use the documented paths and payloads', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    return new Response(JSON.stringify({ ok: true, version: 2, render_id: 'render-1', voices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const gateway = (await import('../app/gateway.mjs')).createDubbingGateway({ baseUrl: 'https://gateway.test', fetchImpl });

  await gateway.getResource('dub/1');
  await gateway.updateSegment('dub/1', 'segment/2', 'es', { text: 'Hola', startTime: 1, endTime: 2 });
  await gateway.createSpeaker('dub/1', { speakerName: 'Ana', voiceId: 'track-clone', voiceStability: 0.5 });
  await gateway.updateSpeaker('dub/1', 'speaker/3', { speakerName: 'Ana editada', voiceSimilarity: 0.8 });
  await gateway.createSegment('dub/1', 'speaker/3', { startTime: 2, endTime: 4, text: 'Nuevo' });
  await gateway.deleteSegment('dub/1', 'segment/2');
  await gateway.redubSegments('dub/1', { segments: ['segment/2'], languages: ['es'] });
  await gateway.renderProject('dub/1', 'es', { renderType: 'mp4', normalizeVolume: true });
  await gateway.addLanguage('dub/1', 'fr');
  await gateway.transcribeSegments('dub/1', ['segment/2']);
  await gateway.getSimilarVoices('dub/1', 'speaker/3');

  assert.deepEqual(calls.map(call => `${call.method} ${new URL(call.url).pathname}`), [
    'GET /v1/dubbing/resource/dub%2F1',
    'PATCH /v1/dubbing/resource/dub%2F1/segment/segment%2F2/es',
    'POST /v1/dubbing/resource/dub%2F1/speaker',
    'PATCH /v1/dubbing/resource/dub%2F1/speaker/speaker%2F3',
    'POST /v1/dubbing/resource/dub%2F1/speaker/speaker%2F3/segment',
    'DELETE /v1/dubbing/resource/dub%2F1/segment/segment%2F2',
    'POST /v1/dubbing/resource/dub%2F1/dub',
    'POST /v1/dubbing/resource/dub%2F1/render/es',
    'POST /v1/dubbing/resource/dub%2F1/language',
    'POST /v1/dubbing/resource/dub%2F1/transcribe',
    'GET /v1/dubbing/resource/dub%2F1/speaker/speaker%2F3/similar-voices',
  ]);
  assert.deepEqual(calls[1].body, { text: 'Hola', start_time: 1, end_time: 2 });
  assert.deepEqual(calls[6].body, { segments: ['segment/2'], languages: ['es'] });
  assert.deepEqual(calls[7].body, { render_type: 'mp4', normalize_volume: true });
  assert.deepEqual(calls[8].body, { language: 'fr' });
  assert.deepEqual(calls[9].body, { segments: ['segment/2'] });
});
