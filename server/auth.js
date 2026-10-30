import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
export const hashToken = value => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [salt, expected] = encoded.split(':');
  const actual = await scrypt(password, salt, 64);
  const reference = Buffer.from(expected, 'hex');
  return actual.length === reference.length && timingSafeEqual(actual, reference);
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)')
    .run(hashToken(token), userId, Date.now() + SESSION_MS);
  return token;
}

export function sessionToken(req) {
  return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('touchline_session='))?.slice(18) || '';
}

export function sessionUser(db, req) {
  const token = sessionToken(req);
  if (!token) return null;
  return db.prepare(`SELECT u.id,u.alias,u.avatar FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).get(hashToken(token), Date.now()) || null;
}

export function sessionCookie(token, secure, clear = false) {
  return `touchline_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
}
