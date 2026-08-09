// Minimal dependency-free canvas line chart: muted raw-weight scatter plus
// an emphasized EWMA trend line. No charting library so the app stays
// offline-capable with zero external requests.

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function drawWeightChart(canvas, series) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.parentElement.clientWidth || 320;
  const height = 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!series.length) return;

  const padding = { top: 16, right: 12, bottom: 24, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const weights = series.flatMap((p) => [p.weight, p.ewma]);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (min === max) { min -= 2; max += 2; }
  const spread = max - min;
  min -= spread * 0.1;
  max += spread * 0.1;

  const xFor = (i) => padding.left + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const yFor = (v) => padding.top + plotH - ((v - min) / (max - min)) * plotH;

  const textMuted = cssVar('--text-muted', '#888');
  const border = cssVar('--border', '#ddd');
  const gold = cssVar('--gold', '#cfb991');

  // Gridlines + y-axis labels (min, mid, max)
  ctx.strokeStyle = border;
  ctx.fillStyle = textMuted;
  ctx.font = '11px -apple-system, sans-serif';
  ctx.lineWidth = 1;
  [min, (min + max) / 2, max].forEach((v) => {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(0), 4, y + 3);
  });

  // Raw weight scatter (muted)
  ctx.fillStyle = textMuted;
  series.forEach((p, i) => {
    ctx.beginPath();
    ctx.globalAlpha = 0.5;
    ctx.arc(xFor(i), yFor(p.weight), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // EWMA trend line (emphasized)
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  series.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(p.ewma);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // X-axis labels: first + last date
  ctx.fillStyle = textMuted;
  ctx.textAlign = 'left';
  ctx.fillText(series[0].date.slice(5), padding.left, height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(series[series.length - 1].date.slice(5), width - padding.right, height - 6);
  ctx.textAlign = 'left';
}
