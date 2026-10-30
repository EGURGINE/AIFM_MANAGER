import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineEvents, relevantInbox, buildEventPayload, StableScreenDetector } from '../collector/events.js';
import { collectorConfig } from '../collector/config.js';

test('FM27 defaults to its own executable and OCR; queues cannot cross leagues or versions', () => {
  const config = collectorConfig({ COLLECTOR_TOKEN: 'one' });
  assert.equal(config.version, '27'); assert.equal(config.mode, 'screen');
  assert.match(config.gameExe, /Football Manager 27/);
  assert.notEqual(config.stateKey, collectorConfig({ COLLECTOR_TOKEN: 'two' }).stateKey);
  assert.notEqual(config.stateKey, collectorConfig({ COLLECTOR_TOKEN: 'one', FM_VERSION: '26' }).stateKey);
  assert.throws(() => collectorConfig({ FM_VERSION: '27', CAPTURE_MODE: 'bridge' }), /not verified/);
  assert.throws(() => collectorConfig({ FM_EXECUTABLE: 'fm.exe' }), /absolute/);
  assert.equal(collectorConfig({ FM_VERSION: '26' }).mode, 'bridge');
});

test('bridge merges titles and opened bodies without treating unrelated events as news', () => {
  const events = combineEvents([
    { type: 'news', news: { num: 42, NewsTitleString: '이적 제안이 도착했습니다' } },
    { type: 'news_body', news: { num: 42, NewsTitleString: '이적 제안이 도착했습니다', NewsBodyString: '구단에 제안이 접수됐습니다.' } },
    { type: 'match_exit' }, { type: 'news', news: {} }
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'news_body');
  assert.ok(relevantInbox('이적 제안이 도착했습니다', events));
  assert.equal(relevantInbox('전술 화면', events), false);
  const payload = buildEventPayload(events, '받은편지함', 'session');
  assert.equal(payload.source, 'bridge');
  assert.match(payload.text, /구단에 제안/);
  assert.equal(payload.eventKey, buildEventPayload(events, '다른 화면', 'session').eventKey);
  assert.notEqual(payload.eventKey, buildEventPayload(events, '', 'new-session').eventKey);
});

test('OCR requires an inbox baseline and a stable changed screen', () => {
  const detector = new StableScreenDetector();
  assert.equal(detector.observe('바탕화면'), false);
  assert.equal(detector.observe('받은편지함 메시지 A'), false);
  assert.equal(detector.observe('받은편지함 메시지 B'), false);
  assert.equal(detector.observe('전술 화면'), false);
  assert.equal(detector.observe('받은편지함 메시지 B'), false);
  assert.equal(detector.observe('받은편지함 메시지 B'), true);
  assert.equal(detector.observe('받은편지함  메시지 B'), false);
});
