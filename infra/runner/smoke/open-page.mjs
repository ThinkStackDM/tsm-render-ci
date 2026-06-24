// Launch a full-framebuffer Chromium page on the Xvfb display so the capture step has
// something live to record. Stays open until killed (SIGTERM). Playwright + Puppeteer
// are both installed on the runner; this smoke exercises the Playwright path (the M1
// default capture engine for @thiaaaa/capture-bakeoff).
import { chromium } from "playwright";

const title = process.env.CAPTURE_TITLE || "THIAAAAA render runner smoke";
const subtitle = process.env.CAPTURE_SUBTITLE || "Hosted Linux capture path";
const page = `data:text/html,<!doctype html><html><body style="margin:0;background:#0b1020;overflow:hidden">
<div id="c" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
 flex-direction:column;padding:96px;box-sizing:border-box;text-align:center;gap:24px">
  <div style="font:700 96px system-ui;color:#5cf;line-height:1.05">${title}</div>
  <div style="max-width:1400px;font:500 40px system-ui;color:#d7e8ff;line-height:1.25">${subtitle}</div>
 </div>
<script>let t=0;const c=document.getElementById('c');
setInterval(()=>{t+=6;c.style.transform='translateX('+(Math.sin(t/30)*80)+'px)';
document.body.style.background='hsl('+(t%360)+',60%,12%)';},33);</script>
</body></html>`;

const browser = await chromium.launch({
  headless: false, // under Xvfb this paints to the virtual display so x11grab can capture it
  args: ["--window-position=0,0", "--window-size=1920,1080", "--start-fullscreen", "--kiosk", "--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
await p.goto(page);

const shutdown = async () => { try { await browser.close(); } finally { process.exit(0); } };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// keep alive
setInterval(() => {}, 1 << 30);
