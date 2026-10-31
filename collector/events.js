import { createHash } from 'node:crypto';
export const fingerprint = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function isInbox(text = '') {
  if (/받은\s*편지함|메시지함|\binbox\b|NewsTitleString|NewsBodyString/i.test(text)) return true;
  // FM27 labels this panel "메시지". Require list controls as well, since
  // its navigation link is present on unrelated screens. OCR can read 메 as 에.
  return /[메에매]시지|\bmessages\b/i.test(text)
    && /읽지\s*않음|\bunread\b/i.test(text)
    && /업무\s*\(|신규|\btasks\b|\bnew\b/i.test(text);
}
export function normalizeEvent(event) {
  if (!event || !['news', 'news_body', 'day_change'].includes(event.type)) return null;
  if (event.type === 'day_change') return { key: `day:${fingerprint(event)}`, type: event.type, title: '게임 내 날짜가 변경됐습니다.', text: '' };
  const news = event.news || {};
  const title = String(news.NewsTitleString || '').trim();
  const text = String(news.NewsBodyString || '').trim();
  if (!title && !text) return null;
  return { key: `news:${news.num ?? news.ids ?? fingerprint(title)}`, type: event.type, title: title || text.slice(0, 100), text };
}
export function combineEvents(events) {
  const merged = new Map();
  for (const raw of events) {
    const item = normalizeEvent(raw);
    if (!item) continue;
    const existing = merged.get(item.key);
    if (!existing || item.text.length >= existing.text.length) merged.set(item.key, item);
  }
  return [...merged.values()];
}
export function relevantInbox(screen, events) {
  const squash = value => String(value || '').replace(/\s+/g, '').toLowerCase();
  const current = squash(screen);
  return isInbox(screen) || events.some(e => e.title.length >= 5 && current.includes(squash(e.title)));
}
export function buildEventPayload(events, screen, epoch) {
  const news = events.filter(e => e.type !== 'day_change');
  const title = news.length === 1 ? news[0].title.slice(0, 140) : news.length ? `받은편지함에 새 소식 ${news.length}건` : '새로운 하루의 받은편지함';
  const details = news.map(e => `제목: ${e.title}${e.text ? `\n본문: ${e.text}` : '\n(본문은 아직 열지 않음)'}`).join('\n\n');
  return {
    eventKey: `bridge:${epoch}:${fingerprint(events.map(e => [e.key, e.title, e.text]))}`,
    title, text: `[브리지에서 감지한 새 소식]\n${details || '게임 날짜 변경 이벤트가 발생했습니다.'}\n\n[현재 보이는 화면의 참고 자료 — 이전에 선택한 메시지가 포함될 수 있으므로 새 소식의 사실은 위 이벤트를 기준으로 판단]\n${screen.slice(0, 6500)}`.slice(0, 14000),
    eventType: news.some(e => e.type === 'news_body') ? 'news_body' : news.length ? 'news' : 'day_change', source: 'bridge'
  };
}

export class StableScreenDetector {
  constructor({ captureInitial = false } = {}) { this.baseline = null; this.candidate = null; this.repeats = 0; this.captureInitial = captureInitial; }
  observe(text) {
    if (!isInbox(text)) { this.candidate = null; this.repeats = 0; return false; }
    const normalized = text.replace(/\s+/g, ' ').trim();
    const hash = fingerprint(normalized);
    if (this.baseline === null) {
      if (!this.captureInitial) { this.baseline = hash; return false; }
      this.baseline = '';
    }
    if (hash === this.baseline) { this.candidate = null; this.repeats = 0; return false; }
    if (hash !== this.candidate) { this.candidate = hash; this.repeats = 1; return false; }
    if (++this.repeats < 2) return false;
    this.baseline = hash; this.candidate = null; this.repeats = 0; return true;
  }
}
