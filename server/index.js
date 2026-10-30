import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';
app.server.listen(port, host, () => console.log(`TOUCHLINE ready at http://${host}:${port}`));
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  await app.close();
  clearTimeout(timer);
  process.exit(0);
});
