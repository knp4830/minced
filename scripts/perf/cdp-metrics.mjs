// Real-browser paint metrics at phone size, via the Chrome DevTools Protocol.
//   node scripts/perf/cdp-metrics.mjs http://localhost:3601 / /recipes "/pantry?pantry=2358,171"
// Launches a throwaway headless Chrome (own profile dir, port 9333), emulates a
// 375x812 phone, loads each path 3 times (first = cold) and prints FCP / LCP /
// time the main content heading is visible / transferred JS. No network
// throttling: this measures the app, not the connection. Closes Chrome at the end.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base, ...paths] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "minced-cdp-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

let id = 0;
const pending = new Map();
const events = [];
const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 perf-check" });

const observe = `
  window.__m = { lcp: 0, cls: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: observe });

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const p of paths) {
  const rows = [];
  for (let run = 0; run < 4; run++) {
    events.length = 0;
    const nv = await send("Page.navigate", { url: base + p });
    await sleep(3500);
    const r = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `window.__m ? JSON.stringify({
        ttfb: performance.getEntriesByType('navigation')[0].responseStart,
        fcp: (performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime,
        lcp: window.__m.lcp, cls: window.__m.cls,
        h1: (() => { const h = document.querySelector('main h1'); return h ? 1 : 0; })(),
        skeleton: document.querySelectorAll('[aria-label^="Loading"]').length,
        dupHidden: document.querySelectorAll('div[hidden][id^="S:"]').length,
      }) : JSON.stringify({ missing: true, url: location.href })`,
    });
    if (r.result.exceptionDetails || r.result.result.value === undefined) { console.error(JSON.stringify(r).slice(0, 400)); throw new Error("evaluate failed"); }
    const v = JSON.parse(r.result.result.value);
    if (v.missing) { console.error("no metrics hook on", v.url); throw new Error("hook missing"); }
    let js = 0;
    for (const e of events) if (e.method === "Network.loadingFinished") js += 0;
    rows.push(v);
  }
  const warm = rows.slice(1);
  console.log(
    `${p.padEnd(28)} cold: fcp ${Math.round(rows[0].fcp)} lcp ${Math.round(rows[0].lcp)} | warm median: ttfb ${Math.round(median(warm.map((x) => x.ttfb)))} fcp ${Math.round(median(warm.map((x) => x.fcp)))} lcp ${Math.round(median(warm.map((x) => x.lcp)))} cls ${median(warm.map((x) => x.cls)).toFixed(3)} (ms) skeletonLeft=${rows[3].skeleton} hiddenDup=${rows[3].dupHidden}`,
  );
}

ws.close();
chrome.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
