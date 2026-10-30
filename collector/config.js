import { win32 } from 'node:path';
import { fingerprint } from './events.js';

export function collectorConfig(env = process.env) {
  const version = env.FM_VERSION || '27';
  if (!['26', '27'].includes(version)) throw new Error('FM_VERSION must be 26 or 27.');
  const gameExe = env.FM_EXECUTABLE || `C:\\Program Files (x86)\\Steam\\steamapps\\common\\Football Manager ${version}\\fm.exe`;
  if (!win32.isAbsolute(gameExe) || win32.basename(gameExe).toLowerCase() !== 'fm.exe') throw new Error('FM_EXECUTABLE must be an absolute path to fm.exe.');
  const mode = env.CAPTURE_MODE || (version === '27' ? 'screen' : 'bridge');
  if (!['bridge', 'screen', 'auto'].includes(mode)) throw new Error('CAPTURE_MODE must be bridge, screen or auto.');
  if (version === '27' && mode !== 'screen') throw new Error('FM27 native bridge compatibility is not verified. Use CAPTURE_MODE=screen.');
  const server = (env.TOUCHLINE_URL || 'http://127.0.0.1:3210').replace(/\/$/, '');
  const token = env.COLLECTOR_TOKEN || '';
  // Never replay another league's queued screenshots after changing accounts or versions.
  const stateKey = fingerprint([server, token, win32.normalize(gameExe).toLowerCase(), mode]);
  return { version, gameExe, mode, server, token, stateKey };
}
