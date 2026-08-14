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

export class QueueManager {
  constructor({ gateway, store, pollMs = 4000, concurrency = 1, onChange = () => {}, maxPolls = 180 } = {}) {
    if (!gateway || !store) throw new Error('QueueManager necesita gateway y store');
    this.gateway = gateway;
    this.store = store;
    this.pollMs = pollMs;
    this.concurrency = Math.max(1, Math.min(5, concurrency));
    this.onChange = onChange;
    this.maxPolls = maxPolls;
    this.jobs = [];
    this.active = 0;
    this.idleWaiters = [];
  }

  async restore() {
    this.jobs = await this.store.loadAll();
    for (const job of this.jobs) {
      if (job.status === 'processing' || job.status === 'preparing' || job.status === 'dubbing') {
        job.status = job.dubbingId ? 'queued' : 'needs-source';
        await this.store.put(storedJob(job));
      }
      if (job.status === 'queued' && job.sourceType === 'file' && !job.file) {
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
    job.status = job.sourceType === 'file' && !job.file ? 'needs-source' : 'queued';
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
      await this.set(job, { status: 'preparing', progress: 8, providerStatus: 'preparing' });
      const payload = { ...clone(job.settings), name: job.name, sourceUrl: job.sourceUrl, file: job.file };
      const created = await this.gateway.createDub(payload);
      job.dubbingId = created.dubbing_id;
      await this.set(job, { status: 'processing', progress: 28, providerStatus: 'queued' });

      let misses = 0;
      for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
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
          if (misses >= 3) throw new Error(`No se pudo consultar el doblaje: ${error.message}`);
          continue;
        }
        const remoteStatus = remote.status || 'queued';
        const progress = PROGRESS[remoteStatus] ?? Math.min(92, 30 + attempt);
        if (['failed', 'error'].includes(remoteStatus)) throw new Error(remote.error || 'El proveedor marcó el doblaje como fallido');
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
