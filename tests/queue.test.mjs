import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueManager } from '../app/queue.mjs';

class MemoryStore {
  constructor() { this.items = new Map(); }
  async loadAll() { return [...this.items.values()]; }
  async put(item) { this.items.set(item.id, structuredClone(item)); }
  async remove(id) { this.items.delete(id); }
}

class FakeGateway {
  constructor() { this.created = []; this.polls = 0; }
  async createDub(payload) {
    this.created.push(payload);
    return { dubbing_id: `demo-${this.created.length}`, expected_duration_sec: 3 };
  }
  async getDub(id) {
    this.polls += 1;
    return this.polls < 2
      ? { dubbing_id: id, status: 'dubbing' }
      : { dubbing_id: id, status: 'dubbed', target_languages: ['es'] };
  }
}

test('queue completes a job with a frozen settings snapshot', async () => {
  const gateway = new FakeGateway();
  const store = new MemoryStore();
  const events = [];
  const queue = new QueueManager({ gateway, store, pollMs: 1, onChange: items => events.push(items) });
  const settings = { targetLang: 'es', model: 'dubbing_v2', numSpeakers: 2 };

  const [job] = await queue.enqueue([{ name: 'video.mp4', sourceType: 'url', sourceUrl: 'https://example.com/video.mp4', settings }]);
  settings.targetLang = 'fr';
  await queue.whenIdle();

  assert.equal(gateway.created[0].targetLang, 'es');
  assert.equal(job.status, 'dubbed');
  assert.equal(job.progress, 100);
  assert.ok(events.length >= 2);
  assert.equal((await store.loadAll())[0].status, 'dubbed');
});

test('queue retains a useful error when the provider fails', async () => {
  const store = new MemoryStore();
  const gateway = { createDub: async () => { throw new Error('cuota agotada'); } };
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.enqueue([{ name: 'audio.mp3', sourceType: 'url', sourceUrl: 'https://example.com/audio.mp3', settings: { targetLang: 'es' } }]);
  await queue.whenIdle();

  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'cuota agotada');
});

test('retry creates a new remote dub after a terminal provider failure', async () => {
  const store = new MemoryStore();
  let creates = 0;
  let firstAttempt = true;
  const gateway = {
    createDub: async () => ({ dubbing_id: `remote-${++creates}`, expected_duration_sec: 1 }),
    getDub: async id => firstAttempt
      ? { dubbing_id: id, status: 'failed', error: 'provider terminal failure' }
      : { dubbing_id: id, status: 'dubbed' },
  };
  const queue = new QueueManager({ gateway, store, pollMs: 1 });
  const [job] = await queue.enqueue([{
    name: 'Fallo terminal',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);
  await queue.whenIdle();
  assert.equal(job.status, 'failed');

  firstAttempt = false;
  await queue.retry(job.id);
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(job.dubbingId, 'remote-2');
  assert.equal(creates, 2);
});

test('queue resumes an existing remote dub without creating a duplicate', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  await store.put({
    id: 'local-1',
    name: 'Proyecto existente',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
    dubbingId: 'remote-existing',
    status: 'processing',
    progress: 48,
    providerStatus: 'transcribing',
    createdAt: new Date().toISOString(),
    targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.restore();
  await queue.whenIdle();

  assert.equal(gateway.created.length, 0);
  assert.ok(gateway.polls >= 1);
  assert.equal(job.dubbingId, 'remote-existing');
  assert.equal(job.status, 'dubbed');
});

test('queue keeps tracking an uploaded file after reload when the remote id exists', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  await store.put({
    id: 'local-file-1',
    name: 'Audio subido',
    sourceType: 'file',
    sourceUrl: '',
    fileName: 'audio.mp3',
    settings: { targetLang: 'es' },
    dubbingId: 'remote-file-existing',
    status: 'processing',
    progress: 48,
    providerStatus: 'transcribing',
    createdAt: new Date().toISOString(),
    targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.restore();
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(job.dubbingId, 'remote-file-existing');
  assert.equal(gateway.created.length, 0);
});

test('queue uses the provider duration estimate instead of timing out too early', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  const queue = new QueueManager({ gateway, store, pollMs: 1, maxPolls: 1 });

  const [job] = await queue.enqueue([{
    name: 'Audio largo',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(job.expectedDurationSec, 3);
  assert.equal(gateway.polls, 2);
});

test('queue keeps tracking when the gateway omits its duration estimate', async () => {
  const store = new MemoryStore();
  let polls = 0;
  const gateway = {
    createDub: async () => ({ dubbing_id: 'remote-no-estimate' }),
    getDub: async () => {
      polls += 1;
      return { status: polls > 180 ? 'dubbed' : 'dubbing' };
    },
  };
  const queue = new QueueManager({ gateway, store, pollMs: 0 });

  const [job] = await queue.enqueue([{
    name: 'Sin estimación',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(polls, 181);
});

test('queue fails immediately when creation returns no remote id', async () => {
  const store = new MemoryStore();
  let polls = 0;
  const gateway = {
    createDub: async () => ({ expected_duration_sec: 3 }),
    getDub: async () => { polls += 1; return { status: 'dubbed' }; },
  };
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.enqueue([{
    name: 'Respuesta inválida',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);
  await queue.whenIdle();

  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'El gateway no devolvió un dubbing_id');
  assert.equal(polls, 0);
});

test('queue tolerates a short gateway outage while the remote dub continues', async () => {
  const store = new MemoryStore();
  let polls = 0;
  const gateway = {
    createDub: async () => ({ dubbing_id: 'remote-transient', expected_duration_sec: 1 }),
    getDub: async () => {
      polls += 1;
      if (polls <= 3) throw new Error('gateway temporalmente no disponible');
      return { dubbing_id: 'remote-transient', status: 'dubbed', target_languages: ['es'] };
    },
  };
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.enqueue([{
    name: 'Red inestable',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(polls, 4);
});

test('queue can reattach a file that was lost during a reload', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  await store.put({
    id: 'needs-file-1',
    name: 'Archivo pendiente',
    sourceType: 'file',
    sourceUrl: '',
    fileName: 'audio.mp3',
    settings: { targetLang: 'es' },
    dubbingId: null,
    status: 'needs-source',
    progress: 0,
    providerStatus: 'queued',
    createdAt: new Date().toISOString(),
    targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });
  const [job] = await queue.restore();
  const file = new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' });

  const attached = await queue.attachFile(job.id, file);
  await queue.whenIdle();

  assert.equal(attached, true);
  assert.equal(job.status, 'dubbed');
  assert.equal(gateway.created.length, 1);
  assert.equal(gateway.created[0].file.name, 'audio.mp3');
});

test('a cancelled job can be retried instead of remaining stuck in the queue', async () => {
  const store = new MemoryStore();
  let allowComplete = false;
  const gateway = {
    createDub: async () => ({ dubbing_id: 'remote-cancelled', expected_duration_sec: 1 }),
    getDub: async () => ({ status: allowComplete ? 'dubbed' : 'dubbing' }),
  };
  const queue = new QueueManager({ gateway, store, pollMs: 1 });
  const [job] = await queue.enqueue([{
    name: 'Cancelar y reintentar',
    sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3',
    settings: { targetLang: 'es' },
  }]);

  await new Promise(resolve => setTimeout(resolve, 5));
  await queue.cancel(job.id);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(job.status, 'cancelled');

  allowComplete = true;
  await queue.retry(job.id);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(job.status, 'dubbed');
});

test('restore keeps a manual job queued when its audio track is persisted', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  await store.put({
    id: 'manual-track-1',
    name: 'Manual con pista',
    sourceType: 'file',
    fileName: null,
    settings: {
      targetLang: 'es',
      mode: 'manual',
      foregroundAudioFile: new File(['audio'], 'foreground.wav', { type: 'audio/wav' }),
      csvFile: new File(['speaker,start,end,text'], 'transcript.csv', { type: 'text/csv' }),
    },
    dubbingId: null,
    status: 'queued',
    progress: 0,
    providerStatus: 'queued',
    createdAt: new Date().toISOString(),
    targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.restore();
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(gateway.created.length, 1);
});

test('retry accepts a manual audio track without requiring a main file', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  await store.put({
    id: 'manual-retry-1', name: 'Manual retry', sourceType: 'file', fileName: null,
    settings: { targetLang: 'es', mode: 'manual', foregroundAudioFile: new File(['audio'], 'foreground.wav') },
    dubbingId: null, status: 'failed', progress: 100, providerStatus: 'failed',
    error: 'fallo previo', createdAt: new Date().toISOString(), targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });
  const [job] = await queue.restore();

  await queue.retry(job.id);
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
});

test('restore recreates URL jobs when a gateway cannot resume remote ids', async () => {
  const store = new MemoryStore();
  const gateway = new FakeGateway();
  gateway.resumeRemoteJobs = false;
  await store.put({
    id: 'demo-reload-1', name: 'Demo recargado', sourceType: 'url',
    sourceUrl: 'https://example.com/audio.mp3', settings: { targetLang: 'es' },
    dubbingId: 'demo-stale', status: 'processing', progress: 48,
    providerStatus: 'transcribing', createdAt: new Date().toISOString(), targetLang: 'es',
  });
  const queue = new QueueManager({ gateway, store, pollMs: 1 });

  const [job] = await queue.restore();
  await queue.whenIdle();

  assert.equal(job.status, 'dubbed');
  assert.equal(job.dubbingId, 'demo-1');
  assert.equal(gateway.created.length, 1);
});
