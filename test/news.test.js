import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNews, validateNews, fans, newsPrompt } from '../server/news.js';
test('missing AI never returns raw OCR as a published article', async () => {
  await assert.rejects(generateNews({ text: '포털 선수단 전술 오인식', title: 'capture' }, [], { newsProvider: 'none' }), /원문은 공개하지 않고/);
});
test('unreadable sources can be skipped and malformed articles cannot publish', () => {
  assert.deepEqual(validateNews({ publishable: false }), { publishable: false });
  assert.throws(() => validateNews({ publishable: true, body: 'OCR raw' }));
  const good = { publishable: true, headline: '신임 감독 선임', body: '새 감독이 선임됐습니다. 이제 팬들의 시선은 첫 경기를 향합니다.', topic: 'appointment', eventIdentity: 'club:new-manager', facts: ['감독 선임'], comments: fans.slice(0,3).map(f => ({ name: f.name, body: '첫 경기부터 지켜봐야지.' })) };
  assert.equal(validateNews(good).headline, good.headline);
  assert.throws(() => validateNews({ ...good, comments: [{ name: 'unknown', body: 'hi' }] }));
  assert.throws(() => validateNews({ ...good, body: '포털 선수단 전술 게임 저장 게임 종료 메뉴가 기사로 잘못 생성됐습니다.' }));
  assert.match(newsPrompt({ title: '자료', text: 'test' }, { articles: [] }), /이미 작성한 같은 사건/);
});
