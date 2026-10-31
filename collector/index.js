import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint, combineEvents, relevantInbox, buildEventPayload, StableScreenDetector, isInbox } from './events.js';
import { collectorConfig } from './config.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const { version, gameExe, mode, server, token, stateKey } = collectorConfig();
const local = join(root, '.state', stateKey);
mkdirSync(local, { recursive: true });
const storePath = join(local, 'state.json');
let state;
try { state = JSON.parse(readFileSync(storePath, 'utf8')); } catch { state = {}; }
state = { seq: null, epoch: randomUUID(), pending: [], seen: [], queue: null, lastUpload: 0, ...state };
const bridge = (process.env.BRIDGE_URL || 'http://127.0.0.1:47831').replace(/\/$/, '');
const interval = Math.max(2000, Number(process.env.POLL_MS) || 3000);
const cooldown = Math.max(5000, Number(process.env.CAPTURE_COOLDOWN_MS) || 15000);
const exec = promisify(execFile);
const screenDetector = new StableScreenDetector();
let stopping = false;
let previousStatus = '';
let pendingChanged = 0;
function status(message) { if (message !== previousStatus) { console.log(`[${new Date().toLocaleTimeString()}] ${message}`); previousStatus = message; } }
function save() { writeFileSync(storePath + '.tmp', JSON.stringify(state)); renameSync(storePath + '.tmp', storePath); }
async function getBridge(path) {
  const result = await fetch(`${bridge}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!result.ok) throw new Error(`Bridge HTTP ${result.status}`);
  return result.json();
}
async function capture(withOcr = false) {
  const output = join(local, 'latest.png');
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'Capture-FM.ps1'), '-OutputPath', output, '-GameExecutable', gameExe, ...(withOcr ? ['-WithOcr'] : [])], { windowsHide: true, timeout: 25000, maxBuffer: 1000000 });
    const data = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    if (!data.ok) { status(data.reason === 'fm_not_running' ? `FM${version} 실행을 기다리는 중 · ${gameExe}` : '선택한 FM 창이 앞에 있을 때만 캡처합니다.'); return null; }
    return { image: readFileSync(output).toString('base64'), text: data.text || '', ocrError: data.ocrError || '' };
  } finally { if (existsSync(output)) unlinkSync(output); }
}
async function upload() {
  if (!state.queue) return;
  const response = await fetch(`${server}/api/collector/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(state.queue.payload), signal: AbortSignal.timeout(240000)
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) { status('연결 키가 해제되었거나 잘못되었습니다. 수집기를 종료합니다.'); stopping = true; return; }
    if ([400, 413, 415].includes(response.status)) { state.queue = null; save(); status(`잘못된 캡처를 건너뜁니다: ${result.error}`); return; }
    if (response.status === 429) { state.lastUpload = Date.now() + 60000; save(); }
    if (response.status === 503) { state.lastUpload = Date.now() + 60000; save(); }
    throw new Error(result.error || `Upload HTTP ${response.status}`);
  }
  state.seen = [...new Set([...state.seen, ...state.queue.keys])].slice(-1500);
  const sent = new Set(state.queue.keys);
  state.pending = state.pending.filter(e => !sent.has(fingerprint(e)));
  state.queue = null; state.lastUpload = Date.now(); save();
  status(result.warning || '새 FM 소식과 화면을 리그 피드에 올렸습니다.');
}
async function tickBridge() {
  const result = await getBridge(`/events?since=${state.seq ?? 0}`);
  if (!Number.isFinite(result.seq) || !Array.isArray(result.events)) throw new Error('Unsupported bridge event format');
  if (state.seq === null && process.env.CAPTURE_BACKLOG !== 'true') { state.seq = result.seq; save(); status('브리지 연결됨. 지금부터 새 메시지·날짜 변경을 감시합니다.'); return; }
  if (state.seq !== null && result.seq < state.seq) { state.seq = null; state.pending = []; state.seen = []; state.epoch = randomUUID(); save(); status('FM 재시작 감지. 새 이벤트 기준점을 설정합니다.'); return; }
  state.seq = result.seq;
  const merged = combineEvents(result.events);
  const newEvents = merged.filter(e => !state.seen.includes(fingerprint(e)));
  if (newEvents.length) {
    const pending = new Map(state.pending.map(e => [e.key, e]));
    for (const event of newEvents) pending.set(event.key, event);
    state.pending = [...pending.values()].slice(-50); pendingChanged = Date.now(); save();
  }
  if (!state.pending.length) { status('브리지 연결됨. 받은편지함 갱신을 기다리는 중'); return; }
  if (Date.now() - pendingChanged < 1800 || Date.now() - state.lastUpload < cooldown) return;
  const screen = await getBridge('/screen?max=8000');
  const text = typeof screen.text === 'string' ? screen.text : '';
  if (!relevantInbox(text, state.pending)) { status(`새 이벤트 ${state.pending.length}건 대기 중 · FM 받은편지함을 열면 캡처합니다.`); return; }
  const shot = await capture();
  if (!shot) return;
  state.queue = { keys: state.pending.map(e => fingerprint(e)), payload: { ...buildEventPayload(state.pending, text, state.epoch), image: shot.image } };
  save(); await upload();
}
async function tickScreen() {
  if (Date.now() - state.lastUpload < cooldown) return;
  const shot = await capture(true);
  if (!shot) return;
  if (shot.ocrError) { status('Windows OCR를 사용할 수 없습니다. 한국어/영어 OCR 언어팩 또는 FM 브리지가 필요합니다.'); return; }
  const initial = screenDetector.baseline === null;
  if (!screenDetector.observe(shot.text)) {
    status(!isInbox(shot.text) ? 'FM 화면 판독됨 · 메시지 목록이 보이는 화면을 기다립니다.' : initial ? '메시지 목록 인식 완료 · 현재 화면을 기준으로 다음 변화를 감시합니다.' : '메시지 목록 감시 중 · 내용이 안정적으로 바뀌면 캡처합니다.');
    return;
  }
  const key = fingerprint(shot.text.replace(/\s+/g, ' ').trim());
  if (state.seen.includes(key)) return;
  state.queue = { keys: [key], payload: { eventKey: `screen:${state.epoch}:${key}`, title: 'FM 받은편지함 화면이 갱신됐습니다.', text: shot.text.slice(0, 14000), image: shot.image, source: 'screen', eventType: 'screen_change' } };
  save(); await upload();
}
if (process.platform !== 'win32') { console.error('This collector requires Windows. The web server supports Windows/Linux.'); process.exit(1); }
if (!token) { console.error('collector/.env에 리그의 COLLECTOR_TOKEN을 설정해 주세요.'); process.exit(1); }
if (!['bridge', 'screen', 'auto'].includes(mode)) { console.error('CAPTURE_MODE는 bridge, screen, auto 중 하나여야 합니다.'); process.exit(1); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; save(); });
console.log(`TOUCHLINE FM${version} collector · ${mode} mode · 종료: Ctrl+C · 지정된 FM 창만 캡처합니다.`);
while (!stopping) {
  try {
    if (state.queue) { if (Date.now() - state.lastUpload >= cooldown) await upload(); }
    else if (mode === 'screen') await tickScreen();
    else {
      try { await tickBridge(); }
      catch (error) { if (mode === 'auto' && !state.queue) await tickScreen(); else throw error; }
    }
  } catch (error) { status(`연결 대기: ${error.message}. 다음 주기에 재시도합니다.`); }
  if (!stopping) await new Promise(resolve => setTimeout(resolve, interval));
}
