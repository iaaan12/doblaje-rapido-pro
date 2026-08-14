import { LANGUAGES, languageName } from './languages.mjs';
import { createDubbingGateway } from './gateway.mjs';
import { createDemoGateway } from './demo-gateway.mjs';
import { QueueManager } from './queue.mjs';
import { createJobStore } from './storage.mjs';

const demoMode = new URLSearchParams(location.search).get('demo') === '1';
const gateway = demoMode ? createDemoGateway() : createDubbingGateway();
const store = createJobStore();
const queue = new QueueManager({ gateway, store, pollMs: demoMode ? 220 : 4000, concurrency: demoMode ? 2 : 1, onChange: renderQueue });
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { sourceMode: 'file', files: [], pendingDescriptors: [], library: [], studio: null, studioResource: null, studioLanguage: '', studioUtterances: [], studioSpeakers: [] };
let previousCompleted = 0;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatBytes(bytes = 0) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); } catch { return '—'; }
}

function showToast(message, kind = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3600);
}

function setFormError(message = '') {
  const error = $('#formError');
  error.textContent = message;
  error.hidden = !message;
}

function appendLanguageOptions(select, selected = '', preserveFirst = false) {
  if (!select) return;
  const placeholder = preserveFirst ? select.options[0] : null;
  select.replaceChildren();
  if (placeholder) { placeholder.selected = selected === ''; select.append(placeholder); }
  for (const [code, name] of LANGUAGES) {
    const option = node('option', '', name);
    option.value = code;
    option.selected = code === selected;
    select.append(option);
  }
}

function populateLanguages() {
  const source = $('#sourceLang');
  source.append(node('option', '', 'Auto-detectar'));
  for (const [code, name] of LANGUAGES) {
    const option = node('option', '', `${name} · ${code}`);
    option.value = code;
    source.append(option);
  }
  source.value = 'en';
  renderTargetPicker(['es']);
  appendLanguageOptions($('#libraryLanguage'), '', true);
  appendLanguageOptions($('#newStudioLanguage'));
}

function selectedTargets() { return $$('input[name="targetLang"]:checked').map(input => input.value); }

function renderTargetPicker(selected = selectedTargets()) {
  const picker = $('#targetPicker');
  const query = ($('#targetSearch').value || '').trim().toLowerCase();
  const selectedSet = new Set(selected);
  picker.replaceChildren();
  for (const [code, name] of LANGUAGES) {
    if (query && !`${name} ${code}`.toLowerCase().includes(query)) continue;
    const label = node('label', 'language-option');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'targetLang'; input.value = code; input.checked = selectedSet.has(code);
    input.addEventListener('change', updateSummary);
    label.append(input, node('span', '', name));
    picker.append(label);
  }
  updateSummary();
}

function updateSummary() {
  const targets = selectedTargets();
  const count = state.sourceMode === 'file' ? state.files.length : ($('#sourceUrl').value.trim() ? 1 : 0);
  $('#targetSummary').textContent = targets.length ? `${targets.length} destino${targets.length === 1 ? '' : 's'} seleccionado${targets.length === 1 ? '' : 's'} · ${targets.map(languageName).join(', ')}` : 'Seleccioná al menos un destino.';
  $('#targetSummary').classList.toggle('valid', Boolean(targets.length));
  $('#summaryFiles').textContent = count;
  $('#summaryLangs').textContent = targets.length;
  $('#summaryModel').textContent = 'Legacy v1 / Studio';
  $('#summaryEstimate').textContent = count && targets.length ? `${count * targets.length} proyecto${count * targets.length === 1 ? '' : 's'}` : '—';
}

function renderFiles() {
  const list = $('#selectedFiles');
  list.replaceChildren();
  state.files.forEach((file, index) => {
    const pill = node('div', 'file-pill');
    const remove = node('button', 'mini-button', 'Quitar');
    remove.type = 'button';
    remove.addEventListener('click', () => { state.files.splice(index, 1); renderFiles(); });
    pill.append(node('span', '', file.name), node('span', '', formatBytes(file.size)), remove);
    list.append(pill);
  });
  updateSummary();
}

function setSourceMode(mode) {
  state.sourceMode = mode;
  $$('.segment').forEach(button => button.classList.toggle('active', button.dataset.sourceMode === mode));
  $('#fileSource').hidden = mode !== 'file';
  $('#urlSource').hidden = mode !== 'url';
  updateSummary();
}

function fileInputValue(id) { return $(`#${id}`)?.files?.[0] || null; }

function currentSettings(targetLang) {
  const number = value => value === '' ? undefined : Number(value);
  return {
    targetLang,
    sourceLang: $('#sourceLang').value,
    model: 'dubbing_v1',
    numSpeakers: Number($('#numSpeakers').value || 0),
    targetAccent: $('#targetAccent').value.trim(),
    highestResolution: $('#highestResolution').checked,
    dropBackgroundAudio: $('#dropBackgroundAudio').checked,
    profanityFilter: $('#profanityFilter').checked,
    disableVoiceCloning: $('#disableVoiceCloning').checked,
    dubbingStudio: true,
    mode: $('#mode').value,
    watermark: $('#watermark').value === 'true',
    csvFps: number($('#csvFps').value),
    csvFile: fileInputValue('csvInput'),
    foregroundAudioFile: fileInputValue('foregroundAudioInput'),
    backgroundAudioFile: fileInputValue('backgroundAudioInput'),
    startTime: number($('#startTime').value),
    endTime: number($('#endTime').value),
  };
}

function validateForm() {
  const targets = selectedTargets();
  const mode = $('#mode').value;
  const manualAudio = fileInputValue('foregroundAudioInput') || fileInputValue('backgroundAudioInput');
  if (!targets.length) return 'Elegí al menos un idioma destino.';
  if (state.sourceMode === 'file' && !state.files.length && !(mode === 'manual' && manualAudio)) return 'Subí al menos un archivo de audio o video.';
  if (state.sourceMode === 'url') {
    const value = $('#sourceUrl').value.trim();
    try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { return 'Ingresá una URL http o https válida.'; }
  }
  if (mode === 'manual' && !fileInputValue('csvInput')) return 'El modo manual necesita un archivo CSV.';
  if (state.files.some(file => file.size > 2 * 1024 * 1024 * 1024)) return 'Uno de los archivos supera el límite de 2 GB.';
  const start = $('#startTime').value === '' ? null : Number($('#startTime').value);
  const end = $('#endTime').value === '' ? null : Number($('#endTime').value);
  if (start !== null && end !== null && end <= start) return 'El final debe ser mayor que el inicio.';
  return '';
}

function makeDescriptors() {
  const targets = selectedTargets();
  const baseName = $('#projectName').value.trim();
  const descriptors = [];
  const shared = { ...currentSettings(targets[0]) };
  if (state.sourceMode === 'file') {
    for (const file of state.files.length ? state.files : [null]) {
      for (const targetLang of targets) descriptors.push({ name: `${baseName || file?.name?.replace(/\.[^.]+$/, '') || 'Nuevo proyecto'} · ${languageName(targetLang)}`, file, fileName: file?.name, sourceType: 'file', settings: { ...shared, targetLang } });
    }
  } else {
    const sourceUrl = $('#sourceUrl').value.trim();
    for (const targetLang of targets) descriptors.push({ name: `${baseName || sourceUrl.split('/').pop() || 'Nuevo proyecto'} · ${languageName(targetLang)}`, sourceUrl, sourceType: 'url', settings: { ...shared, targetLang } });
  }
  return descriptors;
}

function openReview(event) {
  event.preventDefault();
  setFormError('');
  const error = validateForm();
  if (error) { setFormError(error); return; }
  state.pendingDescriptors = makeDescriptors();
  const first = state.pendingDescriptors[0];
  $('#confirmSummary').textContent = `${state.pendingDescriptors.length} proyecto${state.pendingDescriptors.length === 1 ? '' : 's'} · Legacy v1 / Studio · ${first.settings.mode === 'manual' ? 'manual' : 'automático'} · ${selectedTargets().map(languageName).join(', ')}`;
  const dialog = $('#confirmDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else if (window.confirm($('#confirmSummary').textContent)) createPendingJobs();
}

async function createPendingJobs() {
  const descriptors = state.pendingDescriptors;
  state.pendingDescriptors = [];
  $('#confirmDialog').close?.();
  try {
    await queue.enqueue(descriptors);
    showToast(`${descriptors.length} trabajo${descriptors.length === 1 ? '' : 's'} añadido${descriptors.length === 1 ? '' : 's'} a la cola.`);
    state.files = []; $('#fileInput').value = ''; renderFiles();
    switchView('create');
  } catch (error) { showToast(error.message || 'No se pudo crear la cola.', 'error'); }
}

function statusLabel(job) {
  if (job.status === 'dubbed') return 'Listo';
  if (job.status === 'failed') return 'Falló';
  if (job.status === 'cancelled') return 'Cancelado';
  if (job.status === 'needs-source') return 'Falta archivo';
  return ({ preparing: 'Preparando', processing: job.providerStatus || 'Procesando', queued: 'En cola' })[job.status] || 'Procesando';
}

function renderQueue(items = queue.getItems()) {
  const list = $('#queueList');
  const active = items.filter(job => ['queued', 'preparing', 'processing'].includes(job.status)).length;
  const finished = items.filter(job => ['dubbed', 'failed', 'cancelled'].includes(job.status)).length;
  $('#queueSummary').textContent = active ? `${active} activo${active === 1 ? '' : 's'} · ${finished} finalizado${finished === 1 ? '' : 's'}` : (finished ? `${finished} finalizado${finished === 1 ? '' : 's'}` : 'Sin trabajos activos');
  list.replaceChildren();
  if (!items.length) { const empty = node('div', 'empty-state'); empty.append(node('span', 'empty-icon', '◌'), node('strong', '', 'Tu cola está despejada'), node('p', '', 'Los próximos trabajos aparecerán acá con su progreso en vivo.')); list.append(empty); return; }
  for (const job of [...items].reverse()) {
    const row = node('article', `queue-item ${job.status === 'failed' ? 'queue-failed' : ''}`);
    const info = node('div'); info.append(node('div', 'queue-name', job.name), node('div', 'queue-meta', `${languageName(job.targetLang)} · ${job.sourceType === 'file' ? job.fileName || 'archivo' : 'URL'} · ${statusLabel(job)}`));
    const progress = node('div'); const bar = node('div', 'queue-progress'); const fill = node('span'); fill.style.width = `${job.progress || 0}%`; bar.append(fill); progress.append(bar, node('div', 'queue-state', job.error || `${job.progress || 0}%`));
    const actions = node('div', 'queue-buttons');
    if (job.status === 'dubbed') { const download = node('button', 'mini-button', 'Descargar'); download.type = 'button'; download.addEventListener('click', () => downloadJob(job)); actions.append(download); }
    if (['queued', 'preparing', 'processing'].includes(job.status)) { const cancel = node('button', 'mini-button danger', 'Cancelar'); cancel.type = 'button'; cancel.addEventListener('click', () => queue.cancel(job.id)); actions.append(cancel); }
    if (['failed', 'cancelled', 'needs-source'].includes(job.status)) { const retry = node('button', 'mini-button', 'Reintentar'); retry.type = 'button'; retry.addEventListener('click', () => queue.retry(job.id)); actions.append(retry); }
    if (['dubbed', 'failed', 'cancelled'].includes(job.status)) { const remove = node('button', 'mini-button danger', 'Quitar'); remove.type = 'button'; remove.addEventListener('click', () => queue.remove(job.id)); actions.append(remove); }
    row.append(info, progress, actions); list.append(row);
  }
  const completed = items.filter(job => job.status === 'dubbed').length;
  if (completed > previousCompleted) { previousCompleted = completed; refreshLibrary(); }
}

async function downloadJob(job) {
  try {
    const blob = await gateway.downloadDub(job.dubbingId, job.targetLang, 'media');
    const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
    const anchor = node('a'); anchor.href = url; anchor.download = `${job.name.replace(/[^\w\-]+/g, '-')}.mp4`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('Descarga iniciada.');
  } catch (error) { showToast(error.message || 'No se pudo descargar el dub.', 'error'); }
}

function normalizeRecord(record) { return { ...record, targetLang: record.target_languages?.[0] || record.target_language || '', status: record.status || 'unknown' }; }

function filteredLibrary() {
  const search = $('#librarySearch').value.trim().toLowerCase(); const status = $('#libraryStatus').value; const language = $('#libraryLanguage').value;
  return state.library.filter(record => (!search || String(record.name || '').toLowerCase().includes(search)) && (!status || record.status === status) && (!language || record.target_languages?.includes(language)));
}

function renderLibrary() {
  const grid = $('#libraryGrid'); grid.replaceChildren(); const records = filteredLibrary();
  if (!records.length) { const empty = node('div', 'empty-state'); empty.style.gridColumn = '1/-1'; empty.append(node('span', 'empty-icon', '▤'), node('strong', '', state.library.length ? 'No hay resultados con esos filtros.' : 'Todavía no hay dubs en la biblioteca.'), node('p', '', state.library.length ? 'Probá cambiar la búsqueda.' : 'Creá tu primer doblaje desde Nuevo doblaje.')); grid.append(empty); return; }
  for (const record of records) {
    const card = node('article', 'library-card'); const head = node('div', 'library-card-head'); head.append(node('h3', '', record.name || record.dubbing_id)); head.append(node('span', `status-pill ${record.status === 'failed' ? 'failed' : ''}`, record.status === 'dubbed' ? 'LISTO' : String(record.status).toUpperCase()));
    const meta = node('div', 'library-meta'); const addMeta = (label, value) => { const line = node('span'); line.append(node('span', '', label), node('b', '', value)); meta.append(line); }; addMeta('DESTINO', (record.target_languages || []).map(languageName).join(', ') || '—'); addMeta('CREADO', formatDate(record.created_at)); addMeta('DURACIÓN', record.media_metadata?.duration ? `${Math.round(record.media_metadata.duration)} s` : '—');
    const actions = node('div', 'library-actions');
    if (record.status === 'dubbed') { const dl = node('button', 'mini-button', 'Descargar'); dl.type = 'button'; dl.addEventListener('click', () => downloadJob({ name: record.name || record.dubbing_id, dubbingId: record.dubbing_id, targetLang: record.targetLang })); actions.append(dl); }
    const studio = node('button', 'mini-button', record.editable ? 'Abrir Studio' : 'Transcript'); studio.type = 'button'; studio.addEventListener('click', () => openStudio(record));
    const del = node('button', 'mini-button danger', 'Borrar'); del.type = 'button'; del.addEventListener('click', () => deleteRecord(record)); actions.append(studio, del);
    card.append(head, meta, actions); grid.append(card);
  }
}

async function refreshLibrary() {
  try {
    const response = await gateway.listDubs(); state.library = (response?.dubs || []).map(normalizeRecord); $('#libraryCount').textContent = state.library.length; renderLibrary();
    $('#connectionLabel').textContent = demoMode ? 'Modo demo local' : 'Gateway configurado'; $('#usageLabel').textContent = 'conectado';
  } catch { $('#connectionLabel').textContent = 'Gateway sin respuesta'; $('#usageLabel').textContent = 'revisar'; renderLibrary(); }
}

async function deleteRecord(record) { if (!window.confirm(`¿Borrar ${record.name || 'este dub'}?`)) return; try { await gateway.deleteDub(record.dubbing_id); showToast('Dub borrado.'); await refreshLibrary(); } catch (error) { showToast(error.message, 'error'); } }

function resourceLanguages(resource, record) { return [...new Set(resource?.target_languages?.length ? resource.target_languages : (record?.target_languages || [record?.targetLang || 'es']))]; }

function flattenSegmentMap(raw, language, output = []) {
  if (!raw) return output;
  if (Array.isArray(raw)) { raw.forEach((item, index) => flattenSegmentMap({ [`segment_${index}`]: item }, language, output)); return output; }
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const hasTiming = value.start_time !== undefined || value.start_s !== undefined || value.start !== undefined;
    if (hasTiming || value.text !== undefined || value.transcription !== undefined) {
      const translations = value.translations || {};
      output.push({ segment_id: value.segment_id || value.id || key, speaker_id: value.speaker_id || value.speaker || 'speaker_0', start_time: Number(value.start_time ?? value.start_s ?? value.start ?? 0), end_time: Number(value.end_time ?? value.end_s ?? value.end ?? 0), text: value.text ?? value.transcription ?? '', translation: value.translation ?? translations[language] ?? '', translations });
    } else if (key === language || key === 'segments') flattenSegmentMap(value, language, output);
  }
  return output;
}

function resourceClips(resource, language) {
  const map = resource?.speaker_segments || {};
  const direct = map[language] || map;
  const clips = flattenSegmentMap(direct, language);
  return clips.sort((a, b) => a.start_time - b.start_time);
}

function resourceSpeakers(resource, clips = []) {
  const tracks = resource?.speaker_tracks || {};
  const entries = Object.entries(tracks).map(([id, value]) => ({ speaker_id: value.speaker_id || id, speaker_name: value.speaker_name || value.name || id, voice_id: value.voice_id || 'track-clone', voice_stability: Number(value.voice_stability ?? 0.65), voice_similarity: Number(value.voice_similarity ?? 0.8), voice_style: Number(value.voice_style ?? 0.2) }));
  const ids = new Set(entries.map(speaker => speaker.speaker_id));
  for (const clip of clips) if (!ids.has(clip.speaker_id)) { entries.push({ speaker_id: clip.speaker_id, speaker_name: clip.speaker_id, voice_id: 'track-clone', voice_stability: 0.65, voice_similarity: 0.8, voice_style: 0.2 }); ids.add(clip.speaker_id); }
  return entries;
}

function updateStudioMeta() {
  $('#clipCount').textContent = state.studioUtterances.length;
  $('#speakerCount').textContent = state.studioSpeakers.length;
  const duration = state.studioResource?.input?.duration_secs || state.studio?.media_metadata?.duration || Math.max(0, ...state.studioUtterances.map(clip => clip.end_time || 0));
  $('#studioDuration').textContent = duration ? `${Math.round(duration)} s` : '—';
}

function renderStudioSpeakers() {
  const list = $('#speakerList'); list.replaceChildren();
  if (!state.studioSpeakers.length) { list.append(node('div', 'empty-state', 'No hay tracks de hablantes.')); return; }
  for (const [index, speaker] of state.studioSpeakers.entries()) {
    const card = node('article', 'speaker-card');
    const title = node('div', 'speaker-card-head'); title.append(node('strong', '', speaker.speaker_name || speaker.speaker_id), node('span', 'speaker-id', speaker.speaker_id)); card.append(title);
    const name = document.createElement('input'); name.value = speaker.speaker_name || ''; name.placeholder = 'Nombre del hablante';
    const voice = document.createElement('input'); voice.value = speaker.voice_id || 'track-clone'; voice.placeholder = 'voice_id / track-clone';
    const grid = node('div', 'speaker-fields'); grid.append(name, voice); card.append(grid);
    const sliders = node('div', 'speaker-sliders');
    for (const [key, label] of [['voice_stability', 'Estabilidad'], ['voice_similarity', 'Similitud'], ['voice_style', 'Estilo']]) { const wrapper = node('label'); const value = document.createElement('input'); value.type = 'range'; value.min = '0'; value.max = '1'; value.step = '0.01'; value.value = speaker[key] ?? 0.65; const caption = node('span', '', `${label} ${Number(value.value).toFixed(2)}`); value.addEventListener('input', () => { speaker[key] = Number(value.value); caption.textContent = `${label} ${Number(value.value).toFixed(2)}`; }); wrapper.append(caption, value); sliders.append(wrapper); }
    card.append(sliders);
    const save = node('button', 'mini-button', 'Guardar voz'); save.type = 'button'; save.addEventListener('click', () => saveSpeaker(index, name.value, voice.value)); const similar = node('button', 'mini-button'); similar.type = 'button'; similar.textContent = 'Voces similares'; similar.addEventListener('click', () => showSimilarVoices(index)); card.append(save, similar); list.append(card);
  }
}

function renderStudioTranscript() {
  const list = $('#transcriptList'); list.replaceChildren();
  if (!state.studioUtterances.length) { list.append(node('div', 'empty-state', 'No hay clips para este idioma.')); updateStudioMeta(); return; }
  const speakerOptions = state.studioSpeakers.map(speaker => `<option value="${speaker.speaker_id}">${speaker.speaker_name || speaker.speaker_id}</option>`).join('');
  for (const [index, clip] of state.studioUtterances.entries()) {
    const card = node('article', 'clip-card');
    const head = node('div', 'clip-card-head'); head.append(node('span', 'clip-index', `CLIP ${String(index + 1).padStart(2, '0')}`), node('span', 'clip-speaker', clip.speaker_id)); card.append(head);
    const timing = node('div', 'clip-timing'); const start = document.createElement('input'); start.type = 'number'; start.min = '0'; start.step = '0.01'; start.value = clip.start_time; const end = document.createElement('input'); end.type = 'number'; end.min = '0'; end.step = '0.01'; end.value = clip.end_time; timing.append(node('label', '', 'Desde'), start, node('label', '', 'Hasta'), end); card.append(timing);
    const speaker = document.createElement('select'); speaker.innerHTML = speakerOptions; speaker.value = clip.speaker_id; speaker.addEventListener('change', () => { clip.speaker_id = speaker.value; }); card.append(speaker);
    const text = document.createElement('textarea'); text.value = clip.text || ''; text.placeholder = 'Texto del clip'; text.addEventListener('input', () => { clip.text = text.value; }); card.append(text);
    const translation = document.createElement('textarea'); translation.value = clip.translation || ''; translation.placeholder = 'Traducción / texto objetivo'; translation.addEventListener('input', () => { clip.translation = translation.value; }); card.append(translation);
    const actions = node('div', 'clip-actions'); const save = node('button', 'mini-button', 'Guardar clip'); save.type = 'button'; save.addEventListener('click', () => saveClip(index, start.value, end.value, text.value)); const regenerate = node('button', 'mini-button accent-button', 'Regenerar'); regenerate.type = 'button'; regenerate.addEventListener('click', () => regenerateClip(index)); const remove = node('button', 'mini-button danger', 'Borrar'); remove.type = 'button'; remove.addEventListener('click', () => deleteClip(index)); actions.append(save, regenerate, remove); card.append(actions); list.append(card);
  }
  updateStudioMeta();
}

function renderStudio() { renderStudioSpeakers(); renderStudioTranscript(); }

async function loadStudio(record, language = state.studioLanguage) {
  state.studio = record;
  state.studioResource = null;
  $('#studioAccessStatus').textContent = 'Cargando recurso v1…';
  try {
    const resource = await gateway.getResource(record.dubbing_id);
    state.studioResource = resource;
    const languages = resourceLanguages(resource, record);
    state.studioLanguage = languages.includes(language) ? language : languages[0];
    const select = $('#studioLanguage'); select.replaceChildren(); languages.forEach(code => { const option = node('option', '', languageName(code)); option.value = code; select.append(option); }); select.value = state.studioLanguage;
    const clips = resourceClips(resource, state.studioLanguage); state.studioUtterances = clips; state.studioSpeakers = resourceSpeakers(resource, clips);
    $('#studioAccessStatus').textContent = `Recurso v1 · versión ${resource.version ?? '—'} · sincronizado`;
    renderStudio();
  } catch (error) {
    const languageCode = language || record.targetLang || record.target_languages?.[0] || 'es';
    state.studioLanguage = languageCode;
    const select = $('#studioLanguage'); select.replaceChildren(); const option = node('option', '', languageName(languageCode)); option.value = languageCode; select.append(option); select.value = languageCode;
    try { const response = await gateway.getTranscript(record.dubbing_id, languageCode, 'json'); const payload = response?.json || response; state.studioUtterances = (payload?.utterances || []).map((clip, index) => ({ segment_id: `transcript-${index}`, speaker_id: clip.speaker_id || 'speaker_0', start_time: Number(clip.start_s || 0), end_time: Number(clip.end_s || 0), text: clip.text || '', translation: '' })); state.studioSpeakers = resourceSpeakers(null, state.studioUtterances); renderStudio(); } catch { state.studioUtterances = []; state.studioSpeakers = []; renderStudio(); }
    $('#studioAccessStatus').textContent = `Sólo transcript · ${error.message}`;
    showToast(`Studio v1 no disponible: ${error.message}`, 'error');
  }
}

async function openStudio(record) { state.studio = record; switchView('studio'); $('#studioEmpty').hidden = true; $('#studioWorkspace').hidden = false; $('#studioTitle').textContent = record.name || record.dubbing_id; await loadStudio(record, record.targetLang || record.target_languages?.[0]); }

async function saveClip(index, start, end, text) {
  const clip = state.studioUtterances[index];
  if (!state.studioResource || clip.segment_id.startsWith('transcript-')) { showToast('Este proyecto sólo expone transcript; necesita acceso al recurso Studio v1.', 'error'); return; }
  if (Number(end) <= Number(start)) { showToast('El final del clip debe ser mayor que el inicio.', 'error'); return; }
  try { await gateway.updateSegment(state.studio.dubbing_id, clip.segment_id, state.studioLanguage, { startTime: Number(start), endTime: Number(end), text }); await loadStudio(state.studio, state.studioLanguage); showToast('Clip actualizado en Dubbing v1.'); } catch (error) { showToast(error.message, 'error'); }
}

async function regenerateClip(index) { const clip = state.studioUtterances[index]; if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } try { await gateway.redubSegments(state.studio.dubbing_id, { segments: [clip.segment_id], languages: [state.studioLanguage] }); showToast('Regeneración del clip enviada.'); await loadStudio(state.studio, state.studioLanguage); } catch (error) { showToast(error.message, 'error'); } }

async function deleteClip(index) { const clip = state.studioUtterances[index]; if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } if (!window.confirm('¿Borrar este segmento del recurso v1?')) return; try { await gateway.deleteSegment(state.studio.dubbing_id, clip.segment_id); await loadStudio(state.studio, state.studioLanguage); showToast('Segmento borrado.'); } catch (error) { showToast(error.message, 'error'); } }

async function addSegment() { if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } const speaker = state.studioSpeakers[0]?.speaker_id; const start = Math.max(0, ...state.studioUtterances.map(clip => clip.end_time || 0)); try { await gateway.createSegment(state.studio.dubbing_id, speaker, { startTime: start, endTime: start + 2, text: '' }); await loadStudio(state.studio, state.studioLanguage); showToast('Segmento creado.'); } catch (error) { showToast(error.message, 'error'); } }

async function saveSpeaker(index, name, voiceId) { const speaker = state.studioSpeakers[index]; if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } try { await gateway.updateSpeaker(state.studio.dubbing_id, speaker.speaker_id, { speakerName: name, voiceId, voiceStability: speaker.voice_stability, voiceSimilarity: speaker.voice_similarity, voiceStyle: speaker.voice_style }); await loadStudio(state.studio, state.studioLanguage); showToast('Track de voz actualizado.'); } catch (error) { showToast(error.message, 'error'); } }

async function newSpeaker() { if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } const name = window.prompt('Nombre del nuevo hablante', 'Nuevo hablante'); if (!name) return; try { await gateway.createSpeaker(state.studio.dubbing_id, { speakerName: name, voiceId: 'track-clone' }); await loadStudio(state.studio, state.studioLanguage); showToast('Hablante creado.'); } catch (error) { showToast(error.message, 'error'); } }

async function addStudioLanguage() { const language = $('#newStudioLanguage').value; if (!language || !state.studioResource) { showToast('Cargá primero un recurso Studio v1.', 'error'); return; } try { await gateway.addLanguage(state.studio.dubbing_id, language); await loadStudio(state.studio, language); showToast(`Idioma ${languageName(language)} agregado.`); } catch (error) { showToast(error.message, 'error'); } }

async function transcribeStudio() { if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } try { await gateway.transcribeSegments(state.studio.dubbing_id, state.studioUtterances.map(clip => clip.segment_id)); await loadStudio(state.studio, state.studioLanguage); showToast('Transcripción enviada.'); } catch (error) { showToast(error.message, 'error'); } }

async function redubStudio() { if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } if (!window.confirm('¿Regenerar todos los clips de este idioma?')) return; try { await gateway.redubSegments(state.studio.dubbing_id, { segments: state.studioUtterances.map(clip => clip.segment_id), languages: [state.studioLanguage] }); showToast('Regeneración del proyecto enviada.'); await loadStudio(state.studio, state.studioLanguage); } catch (error) { showToast(error.message, 'error'); } }

async function renderProject() { if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; } try { const response = await gateway.renderProject(state.studio.dubbing_id, state.studioLanguage, { renderType: $('#renderType').value, normalizeVolume: $('#normalizeVolume').checked }); showToast(`Render ${$('#renderType').value.toUpperCase()} enviado${response?.render_id ? ` · ${response.render_id.slice(0, 8)}` : ''}.`); await loadStudio(state.studio, state.studioLanguage); } catch (error) { showToast(error.message, 'error'); } }

async function showSimilarVoices(index) {
  const speaker = state.studioSpeakers[index];
  if (!state.studioResource) { showToast('No hay recurso Studio v1 disponible.', 'error'); return; }
  try {
    const response = await gateway.getSimilarVoices(state.studio.dubbing_id, speaker.speaker_id);
    const names = (response?.voices || []).slice(0, 3).map(voice => voice.name || voice.voice_id).filter(Boolean);
    showToast(names.length ? `Voces sugeridas: ${names.join(', ')}` : 'No hay voces similares disponibles.');
  } catch (error) { showToast(error.message, 'error'); }
}

function exportTranscript() {
  if (!state.studioUtterances.length) { showToast('No hay clips para exportar.', 'error'); return; }
  const csv = [['speaker', 'start_time', 'end_time', 'transcription', 'translation'], ...state.studioUtterances.map(clip => [clip.speaker_id || 'speaker_0', clip.start_time || 0, clip.end_time || 0, clip.text || '', clip.translation || ''])].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = node('a'); anchor.href = url; anchor.download = `${(state.studio?.name || 'transcript').replace(/[^\w\-]+/g, '-')}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('CSV exportado.');
}

function switchView(view) { const titles = { create: 'Nuevo doblaje', library: 'Biblioteca', studio: 'Dubbing Studio' }; $('#pageTitle').textContent = titles[view] || 'Doblaje Rápido'; $$('.view').forEach(section => { const active = section.id === `view-${view}`; section.hidden = !active; section.classList.toggle('active-view', active); }); $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view)); if (view === 'library') refreshLibrary(); }

function wireEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('.segment').forEach(button => button.addEventListener('click', () => setSourceMode(button.dataset.sourceMode)));
  $('#dropZone').addEventListener('click', () => $('#fileInput').click()); $('#dropZone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#fileInput').click(); } });
  $('#dropZone').addEventListener('dragover', event => { event.preventDefault(); $('#dropZone').classList.add('drag'); }); $('#dropZone').addEventListener('dragleave', () => $('#dropZone').classList.remove('drag')); $('#dropZone').addEventListener('drop', event => { event.preventDefault(); $('#dropZone').classList.remove('drag'); state.files = [...event.dataTransfer.files]; renderFiles(); }); $('#fileInput').addEventListener('change', event => { state.files = [...event.target.files]; renderFiles(); });
  $('#targetSearch').addEventListener('input', () => renderTargetPicker()); $('#sourceUrl').addEventListener('input', updateSummary); $('#mode').addEventListener('change', () => { $('#manualInputs').hidden = $('#mode').value !== 'manual'; updateSummary(); }); $('#dubbingForm').addEventListener('submit', openReview); $('#reviewButton').addEventListener('click', openReview);
  $('#confirmCreate').addEventListener('click', event => { event.preventDefault(); createPendingJobs(); }); $('#clearFinished').addEventListener('click', async () => { for (const job of [...queue.getItems()]) if (['dubbed', 'failed', 'cancelled'].includes(job.status)) await queue.remove(job.id); });
  $('#refreshButton').addEventListener('click', refreshLibrary); $('#newFromLibrary').addEventListener('click', () => switchView('create')); $('#librarySearch').addEventListener('input', renderLibrary); $('#libraryStatus').addEventListener('change', renderLibrary); $('#libraryLanguage').addEventListener('change', renderLibrary); $('#studioBack').addEventListener('click', () => switchView('library')); $('#studioLibraryButton').addEventListener('click', () => switchView('library')); $('#exportTranscript').addEventListener('click', exportTranscript);
  $('#studioRefresh').addEventListener('click', () => state.studio && loadStudio(state.studio, state.studioLanguage)); $('#studioLanguage').addEventListener('change', () => state.studio && loadStudio(state.studio, $('#studioLanguage').value)); $('#addStudioLanguage').addEventListener('click', addStudioLanguage); $('#transcribeStudio').addEventListener('click', transcribeStudio); $('#redubStudio').addEventListener('click', redubStudio); $('#renderButton').addEventListener('click', renderProject); $('#addSegment').addEventListener('click', addSegment); $('#newSpeaker').addEventListener('click', newSpeaker);
}

async function init() { if (demoMode) $('#demoBadge').hidden = false; populateLanguages(); wireEvents(); updateSummary(); await queue.restore(); await refreshLibrary(); }

init().catch(error => { $('#connectionLabel').textContent = 'Error de inicialización'; showToast(error.message || 'No se pudo iniciar la app.', 'error'); });
