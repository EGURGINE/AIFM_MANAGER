import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { writeMatchArticle } from '../server/match.js';

let app, base, alice, bob, carol, outsider, room, otherRoom;
const directory = mkdtempSync(join(tmpdir(), 'touchline-test-'));
const database = join(directory, 'test.db');
async function request(path, { method = 'GET', body, cookie, origin, ...rest } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), ...rest
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
async function register(login) {
  const r = await request('/auth/register', { method: 'POST', body: { login, alias: login + ' 감독', password: 'correct-horse-123' } });
  assert.equal(r.status, 201);
  return { ...r.data.user, cookie: r.cookie };
}
before(async () => {
  app = createApp({ database, ollamaModel: '', joinKey: 'host-key' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
  alice = await register('alice'); bob = await register('bob'); carol = await register('carol'); outsider = await register('outsider');
  let r = await request('/rooms', { method: 'POST', cookie: alice.cookie, body: { name: '테스트 리그', season: '2026/27', club: '아스널', joinKey: 'host-key' } });
  assert.equal(r.status, 201); room = r.data.room;
  for (const member of [bob, carol]) {
    r = await request('/rooms/join', { method: 'POST', cookie: member.cookie, body: { invite: room.invite, club: '리버풀' } });
    assert.equal(r.status, 200);
  }
  r = await request('/rooms', { method: 'POST', cookie: outsider.cookie, body: { name: '별도 리그', joinKey: 'host-key' } });
  otherRoom = r.data.room;
});
after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });

test('session cookies authenticate without exposing login IDs or passwords', async () => {
  const me = await request('/me', { cookie: alice.cookie });
  assert.equal(me.status, 200); assert.equal(me.data.user.id, alice.id);
  assert.equal('login' in me.data.user, false); assert.equal('password' in me.data.user, false);
  const state = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(state.data.members.length, 3);
  assert.equal(state.data.room.invite, undefined);
  assert.ok(state.data.members.every(m => !('login' in m) && !('password' in m)));
  assert.equal((await request('/me')).status, 401);
  const login = await request('/auth/login', { method: 'POST', body: { login: 'ALICE', password: 'correct-horse-123' } });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await request('/auth/login', { method: 'POST', body: { login: 'alice', password: 'wrong-password' } })).status, 401);
});

test('room membership and host key restrict access and invitation rotation', async () => {
  assert.equal((await request('/rooms', { method: 'POST', cookie: bob.cookie, body: { name: '무단 생성' } })).status, 403);
  assert.equal((await request(`/rooms/${room.id}/state`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await request(`/rooms/${otherRoom.id}/posts`, { method: 'POST', cookie: alice.cookie, body: { body: 'intrusion' } })).status, 404);
  assert.equal((await request(`/rooms/${room.id}/invite`, { method: 'POST', cookie: bob.cookie, body: {} })).status, 403);
  const rotate = await request(`/rooms/${room.id}/invite`, { method: 'POST', cookie: alice.cookie, body: {} });
  assert.equal(rotate.status, 200); assert.notEqual(rotate.data.invite, room.invite);
  assert.equal((await request('/rooms/join', { method: 'POST', cookie: outsider.cookie, body: { invite: room.invite } })).status, 404);
  assert.equal((await request(`/rooms/${room.id}/state`, { cookie: bob.cookie })).status, 200);
});

test('posts, comments and reactions are shared, bounded, and scoped to the room', async () => {
  const text = '한글 경기 이야기 ⚽ <script>alert("x")</script>';
  const posted = await request(`/rooms/${room.id}/posts`, { method: 'POST', cookie: alice.cookie, body: { body: text, kind: 'banter' } });
  assert.equal(posted.status, 201);
  const postId = posted.data.id;
  let result = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(result.data.posts.find(p => p.id === postId).body, text);
  assert.equal((await request(`/posts/${postId}/comments`, { method: 'POST', cookie: bob.cookie, body: { body: '다음 경기에서 봅시다.' } })).status, 201);
  assert.equal((await request(`/posts/${postId}/comments`, { cookie: alice.cookie })).data.comments.length, 1);
  assert.equal((await request(`/posts/${postId}/comments`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await request(`/posts/${postId}/reaction`, { method: 'POST', cookie: outsider.cookie, body: { kind: 'fire' } })).status, 404);
  await request(`/posts/${postId}/reaction`, { method: 'POST', cookie: bob.cookie, body: { kind: 'fire' } });
  result = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(result.data.posts.find(p => p.id === postId).reactions.fire, 1);
  assert.equal(result.data.posts.find(p => p.id === postId).myReaction, 'fire');
  await request(`/posts/${postId}/reaction`, { method: 'POST', cookie: bob.cookie, body: { kind: 'fire' } });
  result = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(result.data.posts.find(p => p.id === postId).myReaction, null);
  assert.equal((await request(`/posts/${postId}`, { method: 'DELETE', cookie: bob.cookie, body: {} })).status, 403);
  assert.equal((await request(`/posts/${postId}`, { method: 'DELETE', cookie: alice.cookie, body: {} })).status, 200);
  assert.equal((await request(`/posts/${postId}/comments`, { cookie: bob.cookie })).status, 404);
});

test('DM content is visible only to the two participants, including within the same room', async () => {
  const message = '다음 경기 전술은 비밀입니다.';
  const sent = await request(`/rooms/${room.id}/messages/${bob.id}`, { method: 'POST', cookie: alice.cookie, body: { body: message } });
  assert.equal(sent.status, 201);
  const receiver = await request(`/rooms/${room.id}/messages/${alice.id}`, { cookie: bob.cookie });
  assert.equal(receiver.data.messages[0].body, message); assert.equal(receiver.data.messages[0].mine, false);
  const third = await request(`/rooms/${room.id}/messages/${alice.id}`, { cookie: carol.cookie });
  assert.deepEqual(third.data.messages, []);
  assert.equal((await request(`/rooms/${room.id}/messages/${bob.id}`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await request(`/rooms/${room.id}/messages/${outsider.id}`, { method: 'POST', cookie: alice.cookie, body: { body: 'cross-room' } })).status, 404);
  let state = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(state.data.inbox.find(m => m.id === alice.id).unread, 1);
  await request(`/rooms/${room.id}/messages/${alice.id}/read`, { method: 'POST', cookie: bob.cookie, body: {} });
  state = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  assert.equal(state.data.inbox.find(m => m.id === alice.id).unread, 0);
  const sender = await request(`/rooms/${room.id}/messages/${bob.id}`, { cookie: alice.cookie });
  assert.equal(sender.data.messages[0].read, true);
});

test('host can post factual match summaries and members cannot impersonate the match bot', async () => {
  const body = { home: '홈팀', away: '원정팀', homeScore: 2, awayScore: 1, note: '후반 역전승', gameDate: '2026.10.24' };
  assert.equal((await request(`/rooms/${room.id}/matches`, { method: 'POST', cookie: bob.cookie, body })).status, 403);
  const result = await request(`/rooms/${room.id}/matches`, { method: 'POST', cookie: alice.cookie, body });
  assert.equal(result.status, 201); assert.equal(result.data.source, 'summary');
  const state = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  const post = state.data.posts.find(p => p.id === result.data.id);
  assert.equal(post.author.alias, '매치데스크'); assert.equal(post.author.bot, true);
  assert.equal(post.match.homeScore, 2); assert.match(post.body, /후반 역전승/);
  assert.equal((await request(`/rooms/${room.id}/matches`, { method: 'POST', cookie: alice.cookie, body: { ...body, homeScore: -1 } })).status, 400);
  const spoof = await request(`/rooms/${room.id}/posts`, { method: 'POST', cookie: bob.cookie, body: { body: 'hello', kind: 'match', bot_name: 'AI' } });
  const updated = await request(`/rooms/${room.id}/state`, { cookie: bob.cookie });
  const regular = updated.data.posts.find(p => p.id === spoof.data.id);
  assert.equal(regular.kind, 'talk'); assert.equal(regular.author.bot, false);
});

test('Ollama adapter validates output, labels AI, and falls back on failure', async () => {
  const match = { home: 'A', away: 'B', homeScore: 1, awayScore: 0 };
  const config = { ollamaModel: 'local-model', ollamaUrl: 'http://localhost:11434' };
  let captured;
  const generated = await writeMatchArticle(match, config, async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ body: '홈팀의 승리.', comments: ['다음 경기는 다르다.', 123] }) } }) };
  });
  assert.equal(generated.source, 'ai'); assert.deepEqual(generated.comments, ['다음 경기는 다르다.']);
  assert.equal(captured.url, 'http://localhost:11434/api/chat');
  assert.equal(JSON.parse(captured.options.body).stream, false);
  const fallback = await writeMatchArticle(match, config, async () => { throw new Error('offline'); });
  assert.equal(fallback.source, 'summary'); assert.ok(fallback.warning); assert.match(fallback.body, /1-0/);
  const malformed = await writeMatchArticle(match, config, async () => ({ ok: true, json: async () => ({ message: { content: '{}' } }) }));
  assert.equal(malformed.source, 'summary');
});

test('cross-origin writes, oversized inputs, malformed JSON and invalid values are rejected', async () => {
  const path = `/rooms/${room.id}/posts`;
  assert.equal((await request(path, { method: 'POST', cookie: alice.cookie, origin: 'https://evil.example', body: { body: 'csrf' } })).status, 403);
  assert.equal((await request(path, { method: 'POST', cookie: alice.cookie, origin: base, body: { body: 'same origin' } })).status, 201);
  assert.equal((await request(path, { method: 'POST', cookie: alice.cookie, body: { body: 'x'.repeat(2001) } })).status, 400);
  assert.equal((await request(path, { method: 'POST', cookie: alice.cookie, body: { body: 'x'.repeat(17000) } })).status, 413);
  assert.equal((await request(path, { method: 'POST', cookie: alice.cookie, body: null })).status, 400);
  const malformed = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: alice.cookie }, body: '{bad' });
  assert.equal(malformed.status, 400);
  const form = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: alice.cookie }, body: 'body=csrf' });
  assert.equal(form.status, 415);
});

test('database remains readable across connections and logout revokes the current session', async () => {
  const second = openDatabase(database);
  assert.equal(second.prepare('SELECT COUNT(*) AS n FROM users').get().n, 4);
  assert.ok(second.prepare('SELECT COUNT(*) AS n FROM messages').get().n >= 1);
  second.close();
  assert.equal((await request('/auth/logout', { method: 'POST', cookie: carol.cookie, body: {} })).status, 200);
  assert.equal((await request('/me', { cookie: carol.cookie })).status, 401);
});

test('collector keys are host-only, uploads deduplicate, images are room-private, and revocation works', async () => {
  const path = `/rooms/${room.id}/collectors`;
  assert.equal((await request(path, { method: 'POST', cookie: bob.cookie, body: {} })).status, 403);
  const paired = await request(path, { method: 'POST', cookie: alice.cookie, body: { name: 'Test PC' } });
  assert.equal(paired.status, 201);
  const upload = body => request('/collector/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${paired.data.token}` }, body });
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=';
  const body = { eventKey: 'news:42', title: '새 소식', text: '새 경기 일정이 도착했습니다.', source: 'bridge', image };
  const sent = await upload(body);
  assert.equal(sent.status, 201);
  const duplicate = await upload(body);
  assert.equal(duplicate.status, 200); assert.equal(duplicate.data.id, sent.data.id);
  const memberState = (await request(`/rooms/${room.id}/state`, { cookie: bob.cookie })).data;
  assert.deepEqual(memberState.collectors, []);
  assert.equal(memberState.posts.find(p => p.id === sent.data.id).capture.hasImage, true);
  const url = `${base}/api/posts/${sent.data.id}/image`;
  const picture = await fetch(url, { headers: { Cookie: bob.cookie } });
  assert.equal(picture.status, 200); assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await picture.arrayBuffer()).toString('base64'), image);
  assert.equal((await fetch(url, { headers: { Cookie: outsider.cookie } })).status, 404);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await upload({ ...body, eventKey: 'invalid', image: 'bm90IGEgcG5n' })).status, 400);
  assert.equal((await request(`${path}/${paired.data.id}`, { method: 'DELETE', cookie: bob.cookie, body: {} })).status, 403);
  assert.equal((await request(`${path}/${paired.data.id}`, { method: 'DELETE', cookie: alice.cookie, body: {} })).status, 200);
  assert.equal((await upload({ ...body, eventKey: 'revoked' })).status, 401);
});

test('static delivery includes CSP and does not expose source, environment or database files', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  for (const path of ['/server/app.js', '/.env', '/data/touchline.db', '/package.json']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});
