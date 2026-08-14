const PROGRESS = {
  preparing: 12,
  queued: 28,
  transcribing: 48,
  translating: 68,
  dubbing: 84,
  dubbed: 100,
  failed: 100,
};

const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const makeId = () => globalThis.crypto?.randomUUID?.() || `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function storedJob(job) {
  const { file, ...rest } = job;
  return { ...rest, fileName: file?.name || job.fileName || null };
}

function hasManualAudio(job) {
  return job.settings?.mode === 'manual'
    && Boolean(job.settings?.foregroundAudioFile || job.settings?.backgroundAudioFile);
}

export class QueueManager {
  constructor({ gateway, store, pollMs = 4000, concurrency = 1, onChange = () => {}, maxPolls = 900, maxConsecutiveMisses = 8 } = {}) {
    if (!gateway || !store) throw new Error('QueueManager necesita gateway y store');
    this.gateway = gateway;
    this.store = store;
    this.pollMs = pollMs;
    this.concurrency = Math.max(1, Math.min(5, concurrency));
    this.onChange = onChange;
    this.maxPolls = maxPolls;
    this.maxConsecutiveMisses = Math.max(1, Math.min(30, maxConsecutiveMisses));
    this.jobs = [];
    this.active = 0;
    this.idleWaiters = [];
  }

  async restore() {
    this.jobs = await this.store.loadAll();
    for (const job of this.jobs) {
      if (job.dubbingId && this.gateway.resumeRemoteJobs === false) {
        job.dubbingId = null;
        job.expectedDurationSec = 0;
      }
      if (job.status === 'processing' || job.status === 'preparing' || job.status === 'dubbing') {
        job.status = job.dubbingId || job.sourceType !== 'file' || hasManualAudio(job) ? 'queued' : 'needs-source';
        await this.store.put(storedJob(job));
      }
      if (job.status === 'queued' && job.sourceType === 'file' && !job.file && !job.dubbingId && !hasManualAudio(job)) {
        job.status = 'needs-source';
        await this.store.put(storedJob(job));
      }
    }
    this.emit();
    this.schedule();
    return this.jobs;
  }

  async enqueue(descriptors) {
    const jobs = descriptors.map(input => {
      const settings = clone(input.settings || {});
      return {
        id: makeId(),
        name: input.name || 'Nuevo doblaje',
        sourceType: input.sourceType || (input.file ? 'file' : 'url'),
        sourceUrl: input.sourceUrl || '',
        file: input.file || null,
        fileName: input.file?.name || input.name || null,
        settings,
        dubbingId: null,
        status: 'queued',
        progress: 0,
        providerStatus: 'queued',
        error: null,
        createdAt: new Date().toISOString(),
        targetLang: settings.targetLang,
      };
    });
    this.jobs.push(...jobs);
    for (const job of jobs) await this.persist(job);
    this.emit();
    this.schedule();
    return jobs;
  }

  async retry(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || !['failed', 'cancelled', 'needs-source'].includes(job.status)) return false;
    job.status = job.sourceType === 'file' && !job.file && !hasManualAudio(job) ? 'needs-source' : 'queued';
    job.cancelRequested = false;
    job.error = null;
    job.progress = 0;
    await this.persist(job);
    this.emit();
    this.schedule();
    return true;
  }

  async attachFile(id, file) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || job.status !== 'needs-source' || !file) return false;
    job.file = file;
    job.fileName = file.name || job.fileName || null;
    job.status = 'queued';
    job.cancelRequested = false;
    job.error = null;
    job.progress = 0;
    await this.persist(job);
    this.emit();
    this.schedule();
    return true;
  }

  async cancel(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || ['dubbed', 'failed', 'cancelled'].includes(job.status)) return false;
    job.cancelRequested = true;
    if (job.status === 'queued' || job.status === 'needs-source') {
      job.status = 'cancelled';
      job.progress = 0;
      await this.persist(job);
      this.emit();
    }
    return true;
  }

  async remove(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || ['processing', 'preparing', 'dubbing', 'translating', 'transcribing'].includes(job.status)) return false;
    this.jobs = this.jobs.filter(item => item.id !== id);
    await this.store.remove(id);
    this.emit();
    this.resolveIdle();
    return true;
  }

  async whenIdle() {
    if (this.active === 0 && !this.jobs.some(job => job.status === 'queued')) return;
    await new Promise(resolve => this.idleWaiters.push(resolve));
  }

  getItems() { return this.jobs; }

  schedule() {
    while (this.active < this.concurrency) {
      const job = this.jobs.find(item => item.status === 'queued' && !item.cancelRequested);
      if (!job) break;
      this.active += 1;
      this.run(job).finally(() => {
        this.active -= 1;
        this.schedule();
        this.resolveIdle();
      });
    }
    this.resolveIdle();
  }

  async run(job) {
    try {
      if (!job.dubbingId) {
        await this.set(job, { status: 'preparing', progress: 8, providerStatus: 'preparing' });
        const payload = { ...clone(job.settings), name: job.name, sourceUrl: job.sourceUrl, file: job.file };
        const created = await this.gateway.createDub(payload);
        if (!created?.dubbing_id) throw new Error('El gateway no devolvió un dubbing_id');
        job.dubbingId = created.dubbing_id;
        job.expectedDurationSec = Number(created.expected_duration_sec) || 0;
      }
      await this.set(job, {
        status: 'processing',
        progress: Math.max(job.progress || 0, 28),
        providerStatus: job.providerStatus || 'queued',
      });

      let misses = 0;
      const estimatedPolls = job.expectedDurationSec > 0
        ? Math.ceil(((job.expectedDurationSec * 4) + 900) * 1000 / Math.max(this.pollMs, 1))
        : 0;
      const pollLimit = Math.max(this.maxPolls, estimatedPolls);
      for (let attempt = 0; attempt < pollLimit; attempt += 1) {
        if (job.cancelRequested) {
          await this.set(job, { status: 'cancelled', progress: 0 });
          return;
        }
        await wait(this.pollMs);
        let remote;
        try {
          remote = await this.gateway.getDub(job.dubbingId);
          misses = 0;
        } catch (error) {
          misses += 1;
          if (misses >= this.maxConsecutiveMisses) throw new Error(`No se pudo consultar el doblaje: ${error.message}`);
          continue;
        }
        const remoteStatus = remote.status || 'queued';
        const progress = PROGRESS[remoteStatus] ?? Math.min(92, 30 + attempt);
        if (['failed', 'error'].includes(remoteStatus)) {
          job.dubbingId = null;
          job.expectedDurationSec = 0;
          throw new Error(remote.error || 'El proveedor marcó el doblaje como fallido');
        }
        if (remoteStatus === 'dubbed') {
          await this.set(job, { status: 'dubbed', progress: 100, providerStatus: remoteStatus, remote });
          return;
        }
        await this.set(job, { status: 'processing', progress, providerStatus: remoteStatus, remote });
      }
      throw new Error('El doblaje superó el tiempo máximo de seguimiento');
    } catch (error) {
      await this.set(job, { status: 'failed', progress: 100, error: error.message || String(error) });
    }
  }

  async set(job, patch) {
    Object.assign(job, patch);
    await this.persist(job);
    this.emit();
  }

  async persist(job) { await this.store.put(storedJob(job)); }

  emit() { this.onChange(this.jobs); }

  resolveIdle() {
    if (this.active !== 0 || this.jobs.some(job => job.status === 'queued')) return;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}

export { PROGRESS, storedJob };
