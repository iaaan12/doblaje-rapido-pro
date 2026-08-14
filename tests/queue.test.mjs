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
