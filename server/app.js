import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDatabase, transaction, id, now } from './db.js';
import { hashPassword, verifyPassword, createSession, sessionUser, sessionToken, sessionCookie, hashToken } from './auth.js';
import { writeMatchArticle, writeNewsArticle } from './match.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const avatars = ['mint', 'violet', 'amber', 'rose', 'sky', 'slate'];
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
function field(value, name, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    fail(400, `${name}: ${min}~${max}자로 입력해 주세요.`);
  return value.trim();
}
function safeUser(row) { return { id: row.id, alias: row.alias, avatar: row.avatar }; }
async function readBody(req, maximum = 16000) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maximum) fail(413, '입력 내용이 너무 깁니다.');
    chunks.push(chunk);
  }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { fail(400, '요청 형식이 올바르지 않습니다.'); }
}

export function createApp(options = {}) {
  const config = {
    database: options.database || join(process.env.DATA_DIR || './data', 'touchline.db'),
    publicOrigin: options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? '',
    secure: options.secure ?? (process.env.COOKIE_SECURE === 'true'),
    joinKey: options.joinKey ?? process.env.SERVER_JOIN_KEY ?? '',
    ollamaUrl: options.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
    ollamaModel: options.ollamaModel ?? process.env.OLLAMA_MODEL ?? '',
  };
  const db = openDatabase(config.database);
  const limits = new Map();
  const matchBusy = new Set();
  const ingestBusy = new Set();
  const dummyPassword = '00000000000000000000000000000000:' + '00'.repeat(64);
  function rate(key, max, ms) {
    const time = Date.now();
    let item = limits.get(key);
    if (!item || item.until <= time) limits.set(key, item = { count: 0, until: time + ms });
    if (++item.count > max) fail(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (limits.size > 5000) for (const [k, v] of limits) if (v.until < time) limits.delete(k);
  }
  const roomFor = (roomId, userId) => {
    const room = db.prepare(`SELECT r.*,m.club FROM rooms r JOIN members m ON m.room_id=r.id WHERE r.id=? AND m.user_id=?`).get(roomId, userId);
    if (!room) fail(404, '리그를 찾을 수 없습니다.');
    return room;
  };
  const roomPublic = (room, userId) => ({
    id: room.id, name: room.name, season: room.season, ownerId: room.owner_id,
    club: room.club, ...(room.owner_id === userId ? { invite: room.invite } : {})
  });
  const membersFor = roomId => db.prepare(`SELECT u.id,u.alias,u.avatar,m.club,m.joined_at FROM members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at`).all(roomId);
  const roomList = userId => db.prepare(`SELECT r.*,m.club,(SELECT COUNT(*) FROM members WHERE room_id=r.id) AS count
    FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.created_at`).all(userId).map(r => ({ ...roomPublic(r, userId), count: r.count }));
  const postFor = (postId, userId) => {
    const post = db.prepare(`SELECT p.*,r.owner_id FROM posts p JOIN rooms r ON r.id=p.room_id JOIN members m ON m.room_id=r.id
      WHERE p.id=? AND m.user_id=?`).get(postId, userId);
    if (!post) fail(404, '게시글을 찾을 수 없습니다.');
    return post;
  };
  const peerFor = (roomId, userId, peerId) => {
    roomFor(roomId, userId);
    const peer = membersFor(roomId).find(m => m.id === peerId);
    if (!peer || peerId === userId) fail(404, '대화 상대를 찾을 수 없습니다.');
    return peer;
  };
  function serializePost(post, userId) {
    const reactions = db.prepare('SELECT kind,COUNT(*) AS count FROM reactions WHERE post_id=? GROUP BY kind').all(post.id);
    return {
      id: post.id, body: post.body, kind: post.kind, createdAt: post.created_at,
      author: { id: post.author_id, alias: post.bot_name || post.alias, avatar: post.avatar || 'mint', bot: !!post.bot_name },
      match: post.match_json ? JSON.parse(post.match_json) : null,
      capture: (() => { const c = db.prepare('SELECT source,captured_at,image IS NOT NULL AS has_image FROM captures WHERE post_id=?').get(post.id); return c ? { source: c.source, capturedAt: c.captured_at, hasImage: !!c.has_image } : null; })(),
      commentCount: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id=?').get(post.id).n,
      reactions: Object.fromEntries(reactions.map(r => [r.kind, r.count])),
      myReaction: db.prepare('SELECT kind FROM reactions WHERE post_id=? AND user_id=?').get(post.id, userId)?.kind || null,
      canDelete: post.author_id === userId || db.prepare('SELECT owner_id FROM rooms WHERE id=?').get(post.room_id)?.owner_id === userId,
    };
  }
  function inbox(roomId, userId) {
    return membersFor(roomId).filter(m => m.id !== userId).map(member => {
      const last = db.prepare(`SELECT body,created_at,sender_id FROM messages WHERE room_id=? AND
        ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY rowid DESC LIMIT 1`).get(roomId, userId, member.id, member.id, userId);
      const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE room_id=? AND recipient_id=? AND sender_id=? AND read_at IS NULL').get(roomId, userId, member.id).n;
      return { ...member, last: last ? { body: last.body, createdAt: last.created_at, mine: last.sender_id === userId } : null, unread };
    }).sort((a, b) => (b.last?.createdAt || '').localeCompare(a.last?.createdAt || ''));
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      const method = req.method;
      if (route === '/healthz') return send(200, { ok: true, version: '0.1.0' });
      if (!route.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') fail(405, '허용되지 않은 요청입니다.');
        const files = {
          '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
          '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'],
          '/icon.svg': ['icon.svg', 'image/svg+xml'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
        };
        const file = files[route];
        if (!file) fail(404, '페이지를 찾을 수 없습니다.');
        const data = await readFile(join(publicDir, file[0]));
        res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        return res.end(method === 'HEAD' ? undefined : data);
      }
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) fail(405, '허용되지 않은 요청입니다.');
      const mutation = method !== 'GET';
      if (mutation) {
        const expected = config.publicOrigin || `http://${req.headers.host}`;
        if ((req.headers.origin && req.headers.origin !== expected) || req.headers['sec-fetch-site'] === 'cross-site') fail(403, '다른 사이트에서 보낸 요청은 허용되지 않습니다.');
      }
      const ip = req.socket.remoteAddress || 'unknown';
      if (route === '/api/collector/events' && method === 'POST') {
        const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
        const collector = token ? db.prepare('SELECT * FROM collectors WHERE token_hash=? AND revoked=0').get(hashToken(token)) : null;
        if (!collector) fail(401, '수집기 연결 키가 올바르지 않거나 해제되었습니다.');
        rate(`collector:${collector.id}`, 40, 3600000);
        const body = await readBody(req, 8500000);
        const eventKey = field(body.eventKey, '이벤트 ID', 1, 180);
        const previous = db.prepare('SELECT post_id FROM captures WHERE collector_id=? AND event_key=?').get(collector.id, eventKey);
        if (previous) return send(200, { id: previous.post_id, duplicate: true });
        if (ingestBusy.has(collector.id)) fail(409, '이 수집기의 이전 이벤트를 처리 중입니다.');
        const event = {
          title: field(body.title || 'FM 새 소식', '소식 제목', 1, 140),
          text: field(body.text || '', '게임 자료', 0, 14000),
          eventType: field(body.eventType || 'screen_change', '이벤트 종류', 1, 40),
          source: ['bridge', 'screen'].includes(body.source) ? body.source : 'screen', image: null,
        };
        let image = null;
        if (body.image) {
          if (typeof body.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) fail(400, 'PNG 이미지 형식이 올바르지 않습니다.');
          image = Buffer.from(body.image, 'base64');
          if (image.length > 6000000) fail(413, '화면 이미지는 6MB 이하여야 합니다.');
          if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail(400, 'PNG 화면 캡처만 받을 수 있습니다.');
          const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
          if (!width || !height || width > 4096 || height > 4096 || width * height > 9000000) fail(400, '이미지 크기가 허용 범위를 벗어났습니다.');
          event.image = body.image;
        }
        if (!event.text && !image) fail(400, '수집된 텍스트 또는 화면이 필요합니다.');
        ingestBusy.add(collector.id);
        try {
          const article = await writeNewsArticle(event, config);
          // A host may revoke a collector while its AI request is in flight.
          if (!db.prepare('SELECT id FROM collectors WHERE id=? AND revoked=0').get(collector.id)) fail(401, '수집기 연결이 해제되었습니다.');
          const postId = id();
          transaction(db, () => {
            db.prepare('INSERT INTO posts(id,room_id,kind,bot_name,body,created_at) VALUES(?,?,?,?,?,?)')
              .run(postId, collector.room_id, 'news', article.source === 'ai' ? '터치라인 AI' : 'FM 소식봇', article.body, now());
            db.prepare('INSERT INTO captures VALUES(?,?,?,?,?,?,?,?)').run(id(), collector.id, eventKey, postId, image, image ? 'image/png' : null, event.source, now());
            db.prepare('UPDATE collectors SET last_seen=? WHERE id=?').run(now(), collector.id);
            article.comments.forEach((text, i) => db.prepare('INSERT INTO comments(id,post_id,bot_name,body,created_at) VALUES(?,?,?,?,?)')
              .run(id(), postId, ['터치라인 관중', '라커룸 소식통', '원정석 평론가'][i] + ' · AI', text, now()));
          });
          return send(201, { id: postId, warning: article.warning || null, source: article.source });
        } finally { ingestBusy.delete(collector.id); }
      }
      if (route === '/api/config' && method === 'GET') return send(200, { aiEnabled: !!config.ollamaModel, joinKeyRequired: !!config.joinKey });
      if (route === '/api/auth/register' && method === 'POST') {
        rate(`register:${ip}`, 12, 3600000);
        const body = await readBody(req);
        const login = field(body.login, '로그인 ID', 3, 32).toLowerCase();
        if (!/^[a-z0-9_-]+$/.test(login)) fail(400, '로그인 ID는 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.');
        const password = field(body.password, '비밀번호', 10, 128);
        const alias = field(body.alias, '익명 닉네임', 2, 20);
        if (db.prepare('SELECT id FROM users WHERE login=?').get(login)) fail(409, '이미 사용 중인 로그인 ID입니다.');
        const user = { id: id(), alias, avatar: avatars.includes(body.avatar) ? body.avatar : avatars[Math.floor(Math.random() * avatars.length)] };
        const passwordHash = await hashPassword(password);
        try { db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id, login, passwordHash, alias, user.avatar, now()); }
        catch (e) { if (String(e.message).includes('UNIQUE')) fail(409, '이미 사용 중인 로그인 ID입니다.'); throw e; }
        res.setHeader('Set-Cookie', sessionCookie(createSession(db, user.id), config.secure));
        return send(201, { user, rooms: [] });
      }
      if (route === '/api/auth/login' && method === 'POST') {
        rate(`login:${ip}`, 30, 900000);
        const body = await readBody(req);
        const login = field(body.login, '로그인 ID', 3, 32).toLowerCase();
        const password = field(body.password, '비밀번호', 1, 128);
        const found = db.prepare('SELECT * FROM users WHERE login=?').get(login);
        const valid = await verifyPassword(password, found?.password || dummyPassword);
        if (!found || !valid) fail(401, '로그인 ID 또는 비밀번호를 확인해 주세요.');
        res.setHeader('Set-Cookie', sessionCookie(createSession(db, found.id), config.secure));
        return send(200, { user: safeUser(found), rooms: roomList(found.id) });
      }
      const user = sessionUser(db, req);
      if (!user) fail(401, '로그인이 필요합니다.');
      if (mutation) rate(`write:${user.id}`, 100, 60000);
      if (route === '/api/me' && method === 'GET') return send(200, { user, rooms: roomList(user.id) });
      if (route === '/api/me' && method === 'PATCH') {
        const body = await readBody(req);
        const alias = field(body.alias, '익명 닉네임', 2, 20);
        const avatar = avatars.includes(body.avatar) ? body.avatar : user.avatar;
        db.prepare('UPDATE users SET alias=?,avatar=? WHERE id=?').run(alias, avatar, user.id);
        return send(200, { user: { ...user, alias, avatar } });
      }
      if (route === '/api/auth/logout' && method === 'POST') {
        await readBody(req);
        db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(sessionToken(req)));
        res.setHeader('Set-Cookie', sessionCookie('', config.secure, true));
        return send(200, { ok: true });
      }
      if (route === '/api/rooms' && method === 'GET') return send(200, { rooms: roomList(user.id) });
      if (route === '/api/rooms' && method === 'POST') {
        rate(`room-create:${user.id}`, 10, 3600000);
        const body = await readBody(req);
        if (config.joinKey && body.joinKey !== config.joinKey) fail(403, '서버 운영자에게 받은 방 생성 키를 확인해 주세요.');
        const roomId = id();
        const name = field(body.name, '리그 이름', 2, 40);
        const season = field(body.season || '2026/27', '시즌', 2, 20);
        const club = field(body.club || '', '담당 구단', 0, 30);
        const invite = randomBytes(9).toString('base64url');
        transaction(db, () => {
          db.prepare('INSERT INTO rooms VALUES(?,?,?,?,?,?)').run(roomId, name, invite, user.id, season, now());
          db.prepare('INSERT INTO members VALUES(?,?,?,?)').run(roomId, user.id, club, now());
        });
        return send(201, { room: roomPublic(roomFor(roomId, user.id), user.id), rooms: roomList(user.id) });
      }
      if (route === '/api/rooms/join' && method === 'POST') {
        rate(`room-join:${user.id}`, 20, 3600000);
        const body = await readBody(req);
        const invite = field(body.invite, '초대 코드', 6, 32);
        const club = field(body.club || '', '담당 구단', 0, 30);
        const room = db.prepare('SELECT * FROM rooms WHERE invite=?').get(invite);
        if (!room) fail(404, '초대 코드가 올바르지 않습니다.');
        db.prepare('INSERT OR IGNORE INTO members VALUES(?,?,?,?)').run(room.id, user.id, club, now());
        return send(200, { room: roomPublic(roomFor(room.id, user.id), user.id), rooms: roomList(user.id) });
      }
      const match = route.match(/^\/api\/rooms\/([^/]+)(?:\/(.*))?$/);
      if (match) {
        const [, roomId, action = ''] = match;
        const room = roomFor(roomId, user.id);
        if (action === 'state' && method === 'GET') {
          const rows = db.prepare(`SELECT p.*,u.alias,u.avatar FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.room_id=? ORDER BY p.rowid DESC LIMIT 100`).all(roomId);
          const recentMatches = db.prepare(`SELECT id,match_json,created_at FROM posts WHERE room_id=? AND kind='match' ORDER BY rowid DESC LIMIT 12`).all(roomId)
            .map(p => ({ id: p.id, ...JSON.parse(p.match_json), createdAt: p.created_at }));
          const collectors = room.owner_id === user.id ? db.prepare('SELECT id,name,created_at,last_seen FROM collectors WHERE room_id=? AND revoked=0 ORDER BY created_at').all(roomId) : [];
          return send(200, { room: roomPublic(room, user.id), members: membersFor(roomId), posts: rows.map(p => serializePost(p, user.id)), inbox: inbox(roomId, user.id), matches: recentMatches, collectors, aiEnabled: !!config.ollamaModel });
        }
        if (action === 'collectors' && method === 'POST') {
          if (room.owner_id !== user.id) fail(403, '리그 운영자만 수집기를 연결할 수 있습니다.');
          const body = await readBody(req);
          const name = field(body.name || '내 PC의 FM', '수집기 이름', 1, 40);
          if (db.prepare('SELECT COUNT(*) AS n FROM collectors WHERE room_id=? AND revoked=0').get(roomId).n >= 12) fail(400, '리그당 최대 12개의 수집기를 연결할 수 있습니다.');
          const collectorId = id(); const token = randomBytes(32).toString('base64url');
          db.prepare('INSERT INTO collectors(id,room_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').run(collectorId, roomId, name, hashToken(token), now());
          return send(201, { id: collectorId, name, token });
        }
        if (action.startsWith('collectors/') && method === 'DELETE') {
          if (room.owner_id !== user.id) fail(403, '리그 운영자만 연결을 해제할 수 있습니다.');
          await readBody(req);
          db.prepare('UPDATE collectors SET revoked=1 WHERE id=? AND room_id=?').run(action.slice('collectors/'.length), roomId);
          return send(200, { ok: true });
        }
        if (action === 'membership' && method === 'PATCH') {
          const body = await readBody(req);
          db.prepare('UPDATE members SET club=? WHERE room_id=? AND user_id=?').run(field(body.club || '', '담당 구단', 0, 30), roomId, user.id);
          return send(200, { ok: true });
        }
        if (action === 'invite' && method === 'POST') {
          await readBody(req);
          if (room.owner_id !== user.id) fail(403, '리그 운영자만 초대 코드를 바꿀 수 있습니다.');
          const invite = randomBytes(9).toString('base64url');
          db.prepare('UPDATE rooms SET invite=? WHERE id=?').run(invite, roomId);
          return send(200, { invite });
        }
        if (action === 'posts' && method === 'POST') {
          const body = await readBody(req);
          const text = field(body.body, '게시글', 1, 2000);
          const kind = ['talk', 'banter', 'rumor'].includes(body.kind) ? body.kind : 'talk';
          const postId = id();
          db.prepare('INSERT INTO posts(id,room_id,author_id,kind,body,created_at) VALUES(?,?,?,?,?,?)').run(postId, roomId, user.id, kind, text, now());
          return send(201, { id: postId });
        }
        if (action === 'matches' && method === 'POST') {
          if (room.owner_id !== user.id) fail(403, '경기 기록은 리그 운영자가 게시할 수 있습니다.');
          rate(`match:${user.id}`, 10, 3600000);
          const body = await readBody(req);
          const record = {
            home: field(body.home, '홈 팀', 1, 40), away: field(body.away, '원정 팀', 1, 40),
            homeScore: Number(body.homeScore), awayScore: Number(body.awayScore),
            gameDate: field(body.gameDate || '', '게임 날짜', 0, 30), note: field(body.note || '', '경기 메모', 0, 2000)
          };
          if (record.home === record.away) fail(400, '홈 팀과 원정 팀을 다르게 입력해 주세요.');
          if (![record.homeScore, record.awayScore].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) fail(400, '스코어는 0~99의 정수로 입력해 주세요.');
          if (matchBusy.has(roomId)) fail(409, '이 리그의 경기 기사를 작성 중입니다. 잠시 기다려 주세요.');
          matchBusy.add(roomId);
          try {
            const article = await writeMatchArticle(record, config);
            const postId = id();
            transaction(db, () => {
              db.prepare('INSERT INTO posts(id,room_id,kind,bot_name,body,match_json,created_at) VALUES(?,?,?,?,?,?,?)')
                .run(postId, roomId, 'match', article.source === 'ai' ? '터치라인 AI' : '매치데스크', article.body, JSON.stringify({ ...record, source: article.source }), now());
              article.comments.forEach((body, i) => db.prepare('INSERT INTO comments(id,post_id,bot_name,body,created_at) VALUES(?,?,?,?,?)')
                .run(id(), postId, ['전술판 옆자리', '후반전 전문가', '원정석 목격자'][i] + ' · AI', body, now()));
            });
            return send(201, { id: postId, warning: article.warning || null, source: article.source });
          } finally { matchBusy.delete(roomId); }
        }
        const messageMatch = action.match(/^messages\/([^/]+)(?:\/(read))?$/);
        if (messageMatch) {
          const [, peerId, read] = messageMatch;
          const peer = peerFor(roomId, user.id, peerId);
          if (!read && method === 'GET') {
            const rows = db.prepare(`SELECT id,sender_id,recipient_id,body,created_at,read_at FROM messages WHERE room_id=? AND
              ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY rowid DESC LIMIT 200`).all(roomId, user.id, peerId, peerId, user.id).reverse();
            return send(200, { peer, messages: rows.map(m => ({ id: m.id, body: m.body, mine: m.sender_id === user.id, createdAt: m.created_at, read: !!m.read_at })) });
          }
          if (!read && method === 'POST') {
            const body = await readBody(req);
            const messageId = id();
            db.prepare('INSERT INTO messages(id,room_id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?,?)')
              .run(messageId, roomId, user.id, peerId, field(body.body, '메시지', 1, 2000), now());
            return send(201, { id: messageId });
          }
          if (read && method === 'POST') {
            await readBody(req);
            db.prepare('UPDATE messages SET read_at=? WHERE room_id=? AND recipient_id=? AND sender_id=? AND read_at IS NULL').run(now(), roomId, user.id, peerId);
            return send(200, { ok: true });
          }
        }
      }
      const postMatch = route.match(/^\/api\/posts\/([^/]+)(?:\/(comments|reaction|image))?$/);
      if (postMatch) {
        const [, postId, action] = postMatch;
        const post = postFor(postId, user.id);
        if (action === 'image' && method === 'GET') {
          const capture = db.prepare('SELECT image,mime FROM captures WHERE post_id=?').get(postId);
          if (!capture?.image) fail(404, '화면 이미지가 없습니다.');
          res.writeHead(200, { 'Content-Type': capture.mime, 'Cache-Control': 'private, no-store' });
          return res.end(Buffer.from(capture.image));
        }
        if (!action && method === 'DELETE') {
          await readBody(req);
          if (post.author_id !== user.id && post.owner_id !== user.id) fail(403, '본인 또는 리그 운영자만 삭제할 수 있습니다.');
          db.prepare('DELETE FROM posts WHERE id=?').run(postId);
          return send(200, { ok: true });
        }
        if (action === 'comments' && method === 'GET') {
          const comments = db.prepare(`SELECT c.*,u.alias,u.avatar FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.rowid DESC LIMIT 200`).all(postId).reverse();
          return send(200, { comments: comments.map(c => ({ id: c.id, body: c.body, createdAt: c.created_at, author: { id: c.author_id, alias: c.bot_name || c.alias, avatar: c.avatar || 'violet', bot: !!c.bot_name } })) });
        }
        if (action === 'comments' && method === 'POST') {
          const body = await readBody(req);
          const commentId = id();
          db.prepare('INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)').run(commentId, postId, user.id, field(body.body, '댓글', 1, 1000), now());
          return send(201, { id: commentId });
        }
        if (action === 'reaction' && method === 'POST') {
          const body = await readBody(req);
          if (!['fire', 'laugh', 'salt'].includes(body.kind)) fail(400, '알 수 없는 반응입니다.');
          const current = db.prepare('SELECT kind FROM reactions WHERE post_id=? AND user_id=?').get(postId, user.id);
          if (current?.kind === body.kind) db.prepare('DELETE FROM reactions WHERE post_id=? AND user_id=?').run(postId, user.id);
          else db.prepare('INSERT INTO reactions VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET kind=excluded.kind').run(postId, user.id, body.kind);
          return send(200, { ok: true });
        }
      }
      fail(404, '요청한 기능을 찾을 수 없습니다.');
    } catch (error) {
      if (res.headersSent) return res.end();
      if (!error.status) console.error('[request]', error.message);
      send(error.status || 500, { error: error.status ? error.message : '서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  return { server, db, config, close: () => new Promise(resolve => server.close(() => { db.close(); resolve(); })) };
}
