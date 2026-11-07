import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9459;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      `--user-data-dir=C:\\Users\\Admin\\.gemini\\antigravity\\brain\\fb527dd2-7fee-4067-9e78-48cd1663c811\\scratch\\chrome-inspect-profile`,
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

    console.log('Waiting 5s for maps to stabilize...');
    await sleep(5000);

    console.log('Inspecting window.__caviteMaps...');
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const maps = window.__caviteMaps || [];
        return maps.map((m, idx) => {
          const caches = m.style?.sourceCaches || {};
          const sourceInfo = Object.entries(caches).map(([id, cache]) => ({
            id,
            loaded: cache.loaded(),
            inViewTiles: cache._inViewTiles?.getAllIds()?.length || 0
          }));
          return {
            mapIndex: idx,
            loaded: m.loaded(),
            isMoving: m.isMoving(),
            repaint: m.repaint,
            hasFrameRequest: !!m._frameRequest,
            renderTasks: m._renderTaskQueue?.tasks?.length || 0,
            zoom: m.getZoom(),
            pitch: m.getPitch(),
            bearing: m.getBearing(),
            sources: sourceInfo
          };
        });
      })()`,
      returnByValue: true
    });

    console.log('Map Inspection Report:');
    console.log(JSON.stringify(result.result.value, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
