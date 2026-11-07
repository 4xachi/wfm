import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9462;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      `--user-data-dir=C:\\Users\\Admin\\.gemini\\antigravity\\brain\\fb527dd2-7fee-4067-9e78-48cd1663c811\\scratch\\chrome-drive-profile`,
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

    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
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

    console.log('Signing in both panes...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = [...document.querySelectorAll('header button')].find(b => b.innerText.includes('Quick Rehearsal') || b.innerText.includes('Sign In Both'));
        btn?.click();
      })()`
    });
    await sleep(3500);

    console.log('Switching Right Pane to 3D Nav...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const navBtns = [...document.querySelectorAll('nav button')].filter(b => b.innerText.includes('3D Nav'));
        navBtns.forEach(b => b.click());
      })()`
    });
    await sleep(2000);

    console.log('Clicking 3D Drive button...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const driveBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('3D Drive'));
        driveBtn?.click();
      })()`
    });

    console.log('Driving active simulation for 10 seconds...');
    for (let s = 1; s <= 5; s++) {
      await sleep(2000);
      const metricsRes = await send('Performance.getMetrics');
      const metrics = Object.fromEntries(metricsRes.metrics.map(m => [m.name, m.value]));
      console.log(`Driving t=${s*2}s | JSHeapUsed=${Math.round(metrics.JSHeapUsedSize / 1024 / 1024)}MB | LayoutCount=${metrics.LayoutCount} | RecalcStyleCount=${metrics.RecalcStyleCount} | TaskDuration=${(metrics.TaskDuration || 0).toFixed(2)}s`);
    }

    console.log('Pausing driving simulation...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const pauseBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Pause'));
        pauseBtn?.click();
      })()`
    });
    await sleep(2000);

    const afterPauseRes = await send('Performance.getMetrics');
    const afterMetrics = Object.fromEntries(afterPauseRes.metrics.map(m => [m.name, m.value]));
    console.log(`Paused: TaskDuration=${(afterMetrics.TaskDuration || 0).toFixed(2)}s | LayoutCount=${afterMetrics.LayoutCount}`);

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
