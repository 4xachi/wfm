import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9446;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Starting Chrome with CDP...');
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      `--user-data-dir=C:\\Users\\Admin\\.gemini\\antigravity\\brain\\fb527dd2-7fee-4067-9e78-48cd1663c811\\scratch\\chrome-repro-profile`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    let versionJson = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          versionJson = await res.json();
          break;
        }
      } catch {}
      await sleep(200);
    }
    if (!versionJson) throw new Error('Could not connect to Chrome CDP');

    const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pages = await listRes.json();
    const ws = new WebSocket(pages[0]?.webSocketDebuggerUrl);
    await new Promise((resolve) => (ws.onopen = resolve));

    let nextId = 1;
    const pending = new Map();
    const consoleLogs = [];

    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        consoleLogs.push({ type: msg.params.type, text });
        console.log(`[CONSOLE ${msg.params.type}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[EXCEPTION]', msg.params.exceptionDetails);
      }
    };

    const send = (method, params = {}) => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Performance.enable');

    console.log('Navigating to http://127.0.0.1:3000/demo...');
    await send('Page.navigate', { url: 'http://127.0.0.1:3000/demo' });
    await sleep(2500);

    console.log('Auto signing into both panes...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = [...document.querySelectorAll('header button')].find(b => b.innerText.includes('Quick Rehearsal') || b.innerText.includes('Sign In Both'));
        btn?.click();
      })()`
    });
    await sleep(4000);

    console.log('Switching Right Pane to 3D Nav...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const navBtns = [...document.querySelectorAll('nav button')].filter(b => b.innerText.includes('3D Nav'));
        navBtns.forEach(b => b.click());
      })()`
    });
    await sleep(2000);

    console.log('Observing memory and thread metrics for 35 seconds...');
    for (let s = 1; s <= 18; s++) {
      await sleep(2000);
      const metricsRes = await send('Performance.getMetrics');
      const metrics = Object.fromEntries(metricsRes.metrics.map(m => [m.name, m.value]));
      console.log(`t=${s*2}s | JSHeapUsed=${Math.round(metrics.JSHeapUsedSize / 1024 / 1024)}MB | LayoutCount=${metrics.LayoutCount} | RecalcStyleCount=${metrics.RecalcStyleCount} | TaskDuration=${(metrics.TaskDuration || 0).toFixed(2)}s | ScriptDuration=${(metrics.ScriptDuration || 0).toFixed(2)}s`);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
