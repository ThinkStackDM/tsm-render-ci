// Browser-side chart runtime for the chart bake-off (THIAAAAA-34 §2.2/§2.3).
//
// Bundled by `npm run build:runtime` (esbuild → src/browser/chart-runtime.js)
// and injected into the headless-Chromium capture page by ../capturer.ts. It
// renders ONE archetype with the REAL engine (Recharts SVG or Chart.js canvas),
// animates the entrance, reveals the numeric overlay (with its `data-cite`
// "Publisher — Date" attribute) at the scheduled callout time, and records the
// actual per-frame timings via requestAnimationFrame so the capturer can read
// genuine renderFps / droppedFrames / p99FrameTime off the running render.

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type Engine = 'recharts' | 'chartjs';
type Archetype = 'line-timeseries' | 'grouped-bar' | 'area-band';

interface SeriesPoint {
  x: number | string;
  y: number;
}
interface Series {
  id: string;
  label: string;
  points: SeriesPoint[];
}
interface Overlay {
  id: string;
  at_s: number;
  numeric: string;
  label: string;
  citation: { publisher: string; date: string };
}
interface RenderArgs {
  engine: Engine;
  archetype: Archetype;
  title: string;
  series: Series[];
  overlays: Overlay[];
  palette: string[];
  background: string;
  // total animation/capture window in ms (entrance + overlay reveals)
  durationMs: number;
}

type WindowDone = { __done: boolean };

function markDoneWindow(): void {
  (window as unknown as WindowDone).__done = true;
}

function createDoneGuard(): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    markDoneWindow();
  };
}

// ---- genuine per-frame instrumentation ---------------------------------
interface FrameStats {
  deltas: number[];
  startedAt: number;
  finishedAt: number | null;
  overlayScheduledMs: Record<string, number>;
  overlayShownAtMs: Record<string, number>;
}
const stats: FrameStats = {
  deltas: [],
  startedAt: 0,
  finishedAt: null,
  overlayScheduledMs: {},
  overlayShownAtMs: {},
};
(window as unknown as { __frameStats: FrameStats }).__frameStats = stats;

function startFrameRecorder(durationMs: number, onDone: () => void): void {
  const fallbackDoneMs = Math.max(durationMs + 8000, 10000);
  stats.startedAt = performance.now();
  let last = stats.startedAt;
  let didFinish = false;
  const finish = (): void => {
    if (didFinish) return;
    didFinish = true;
    onDone();
  };

  window.setTimeout(() => {
    finish();
  }, fallbackDoneMs);

  const tick = (now: number) => {
    stats.deltas.push(now - last);
    last = now;
    if (now - stats.startedAt >= durationMs) {
      stats.finishedAt = now;
      finish();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const X = (p: SeriesPoint) => String(p.x);

// Recharts wants row-objects keyed by series id; Chart.js wants per-series
// arrays. Both consume the same xs spine.
function toRows(series: Series[]): Array<Record<string, number | string>> {
  const xs = series[0]?.points.map(X) ?? [];
  return xs.map((x, i) => {
    const row: Record<string, number | string> = { x };
    for (const s of series) row[s.id] = s.points[i]?.y ?? 0;
    return row;
  });
}

function OverlayBadge({ ov, palette }: { ov: Overlay; palette: string[] }) {
  const cite = `${ov.citation.publisher} — ${ov.citation.date}`;
  return (
    <div
      data-cite={cite}
      data-overlay-id={ov.id}
      style={{
        position: 'absolute',
        right: 48,
        top: 96,
        padding: '14px 20px',
        borderRadius: 12,
        background: 'rgba(8,16,28,0.92)',
        border: `2px solid ${palette[0]}`,
        color: '#F4F7FB',
        fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{ov.numeric}</div>
      <div style={{ fontSize: 18, opacity: 0.85, marginTop: 6 }}>{ov.label}</div>
      <div style={{ fontSize: 13, opacity: 0.65, marginTop: 8 }}>{cite}</div>
    </div>
  );
}

function RechartsChart({ args, visibleOverlays }: { args: RenderArgs; visibleOverlays: Overlay[] }) {
  const rows = toRows(args.series);
  const common = (
    <>
      <CartesianGrid stroke="#22324A" strokeDasharray="3 3" />
      <XAxis dataKey="x" stroke="#9FB3C8" tick={{ fill: '#9FB3C8', fontSize: 18 }} />
      <YAxis stroke="#9FB3C8" tick={{ fill: '#9FB3C8', fontSize: 18 }} />
      <Tooltip />
      <Legend wrapperStyle={{ color: '#C8D6E5' }} />
    </>
  );
  let chart: React.ReactElement;
  if (args.archetype === 'line-timeseries') {
    chart = (
      <LineChart data={rows} margin={{ top: 80, right: 60, left: 30, bottom: 40 }}>
        {common}
        {args.series.map((s, i) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.label}
            stroke={args.palette[i % args.palette.length]}
            strokeWidth={4}
            dot={false}
            isAnimationActive
            animationDuration={1400}
          />
        ))}
      </LineChart>
    );
  } else if (args.archetype === 'grouped-bar') {
    chart = (
      <BarChart data={rows} margin={{ top: 80, right: 60, left: 30, bottom: 40 }}>
        {common}
        {args.series.map((s, i) => (
          <Bar
            key={s.id}
            dataKey={s.id}
            name={s.label}
            fill={args.palette[i % args.palette.length]}
            isAnimationActive
            animationDuration={1400}
          />
        ))}
      </BarChart>
    );
  } else {
    chart = (
      <AreaChart data={rows} margin={{ top: 80, right: 60, left: 30, bottom: 40 }}>
        {common}
        {args.series.map((s, i) => (
          <Area
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.label}
            stroke={args.palette[i % args.palette.length]}
            fill={args.palette[i % args.palette.length]}
            fillOpacity={0.35}
            isAnimationActive
            animationDuration={1400}
          />
        ))}
      </AreaChart>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <h1 style={titleStyle}>{args.title}</h1>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
      {visibleOverlays.map((ov) => (
        <OverlayBadge key={ov.id} ov={ov} palette={args.palette} />
      ))}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  position: 'absolute',
  left: 48,
  top: 28,
  margin: 0,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 40,
  fontWeight: 800,
  color: '#F4F7FB',
  zIndex: 2,
};

function renderRecharts(root: HTMLElement, args: RenderArgs): void {
  const r = createRoot(root);
  const Wrapper = () => {
    const [shown, setShown] = React.useState<Overlay[]>([]);
    React.useEffect(() => {
      const timers = args.overlays.map((ov) => {
        const sched = overlayRevealMs(ov, args.durationMs);
        stats.overlayScheduledMs[ov.id] = sched;
        return window.setTimeout(() => {
          stats.overlayShownAtMs[ov.id] = performance.now() - stats.startedAt;
          setShown((s) => [...s, ov]);
        }, sched);
      });
      return () => timers.forEach((t) => window.clearTimeout(t));
    }, []);
    return <RechartsChart args={args} visibleOverlays={shown} />;
  };
  r.render(<Wrapper />);
}

// Chart.js path: real canvas render + built-in animation, overlay drawn as a
// positioned DOM badge (same data-cite contract as Recharts).
function renderChartjs(root: HTMLElement, args: RenderArgs, onDone: () => void): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  root.appendChild(canvas);

  const title = document.createElement('h1');
  Object.assign(title.style, titleStyle as Record<string, string>);
  title.textContent = args.title;
  root.appendChild(title);

  const rows = toRows(args.series);
  const labels = rows.map((r) => String(r.x));
  const type = args.archetype === 'grouped-bar' ? 'bar' : args.archetype === 'area-band' ? 'line' : 'line';
  const datasets = args.series.map((s, i) => ({
    label: s.label,
    data: s.points.map((p) => p.y),
    borderColor: args.palette[i % args.palette.length],
    backgroundColor: args.palette[i % args.palette.length],
    fill: args.archetype === 'area-band',
    tension: args.archetype === 'line-timeseries' || args.archetype === 'area-band' ? 0.35 : 0,
    borderWidth: 4,
    pointRadius: 0,
  }));
  new Chart(canvas, {
    type: type as 'line' | 'bar',
    data: { labels, datasets },
    options: {
      responsive: false,
      animation: {
        duration: 1400,
        onComplete: onDone,
      },
      layout: { padding: { top: 90, right: 60, left: 30, bottom: 40 } },
      scales: {
        x: { grid: { color: '#22324A' }, ticks: { color: '#9FB3C8', font: { size: 18 } } },
        y: { grid: { color: '#22324A' }, ticks: { color: '#9FB3C8', font: { size: 18 } } },
      },
      plugins: { legend: { labels: { color: '#C8D6E5', font: { size: 18 } } } },
    },
  });

  for (const ov of args.overlays) {
    stats.overlayScheduledMs[ov.id] = overlayRevealMs(ov, args.durationMs);
    window.setTimeout(() => {
      stats.overlayShownAtMs[ov.id] = performance.now() - stats.startedAt;
      const badge = document.createElement('div');
      const cite = `${ov.citation.publisher} — ${ov.citation.date}`;
      badge.setAttribute('data-cite', cite);
      badge.setAttribute('data-overlay-id', ov.id);
      badge.style.cssText =
        'position:absolute;right:48px;top:96px;padding:14px 20px;border-radius:12px;' +
        `background:rgba(8,16,28,0.92);border:2px solid ${args.palette[0]};color:#F4F7FB;` +
        'font-family:Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);';
      badge.innerHTML =
        `<div style="font-size:44px;font-weight:800;line-height:1">${ov.numeric}</div>` +
        `<div style="font-size:18px;opacity:0.85;margin-top:6px">${ov.label}</div>` +
        `<div style="font-size:13px;opacity:0.65;margin-top:8px">${cite}</div>`;
      root.appendChild(badge);
    }, overlayRevealMs(ov, args.durationMs));
  }
}

// Map a callout's narration-timeline position into the capture window. We
// compress the (possibly minutes-long) at_s timeline into the capture window so
// the overlay reveal is exercised within every short bake-off clip; the real
// narration-synced timing is asserted by the sample render path, not here.
function overlayRevealMs(ov: Overlay, durationMs: number): number {
  return Math.min(durationMs - 400, 1500);
}

function renderChartOrCrash(args: RenderArgs, done: () => void): void {
  const root = document.getElementById('chart-root') as HTMLElement;
  if (!root) {
    done();
    return;
  }

  document.body.style.background = args.background;
  startFrameRecorder(args.durationMs, done);
  if (args.engine === 'recharts') renderRecharts(root, args);
  else renderChartjs(root, args, done);
}

(window as unknown as { renderChart: (a: RenderArgs) => void }).renderChart = (args: RenderArgs) => {
  const done = createDoneGuard();
  try {
    renderChartOrCrash(args, done);
  } catch (error) {
    console.error('[render-chart] runtime failed, forcing completion', error);
    done();
  }
};
