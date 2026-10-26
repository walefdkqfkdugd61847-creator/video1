import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import './style.css';

const $ = (s) => document.querySelector(s);
const input = $('#file'), preview = $('#preview'), result = $('#result');
const info = $('#info'), processButton = $('#process'), status = $('#status');
const download = $('#download'), progress = $('#progress'), bar = $('#bar');
const orientation = $('#orientation');
let chosen = null, sourceUrl = null, outputUrl = null, targetH = 720;
let ffmpeg = null, loaded = false, busy = false;

document.querySelectorAll('.opt').forEach((button) => button.addEventListener('click', () => {
  if (busy) return;
  document.querySelectorAll('.opt').forEach((b) => b.classList.remove('active'));
  button.classList.add('active'); targetH = Number(button.dataset.h);
}));
input.addEventListener('change', () => {
  chosen = input.files?.[0] || null; if (!chosen) return;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  sourceUrl = URL.createObjectURL(chosen); preview.src = sourceUrl;
  preview.style.display = 'block'; result.style.display = 'none'; download.style.display = 'none';
  info.textContent = `${chosen.name} · ${(chosen.size / 1048576).toFixed(2)} MB`;
  processButton.disabled = false; status.textContent = 'تم اختيار الفيديو. ابدأ بدقة HD.';
});

async function loadEngine() {
  if (loaded) return;
  status.textContent = 'جارٍ تنزيل محرك FFmpeg من CDN…';
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => { if (message) status.textContent = `المعالجة: ${message.slice(-130)}`; });
  ffmpeg.on('progress', ({ progress: p }) => { bar.style.width = `${Math.max(0, Math.min(99, p * 100))}%`; });

  // The FFmpeg core files are fetched explicitly first, then exposed as Blob URLs.
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
  const [jsResponse, wasmResponse] = await Promise.all([
    fetch(`${base}/ffmpeg-core.js`), fetch(`${base}/ffmpeg-core.wasm`)
  ]);
  if (!jsResponse.ok || !wasmResponse.ok) {
    throw new Error(`فشل تنزيل المحرك من CDN (HTTP ${jsResponse.status} / ${wasmResponse.status}). جرّب شبكة أخرى.`);
  }
  const [jsBuffer, wasmBuffer] = await Promise.all([jsResponse.arrayBuffer(), wasmResponse.arrayBuffer()]);
  const coreURL = URL.createObjectURL(new Blob([jsBuffer], { type: 'text/javascript' }));
  const wasmURL = URL.createObjectURL(new Blob([wasmBuffer], { type: 'application/wasm' }));
  try { await ffmpeg.load({ coreURL, wasmURL }); }
  finally { URL.revokeObjectURL(coreURL); URL.revokeObjectURL(wasmURL); }
  loaded = true;
}
function filter() {
  if (orientation.value === 'portrait') return `scale=trunc(${targetH}*9/16/2)*2:${targetH}`;
  if (orientation.value === 'landscape') return `scale=${Math.round(targetH * 16 / 9 / 2) * 2}:${targetH}`;
  return `scale=-2:${targetH}`;
}
processButton.addEventListener('click', async () => {
  if (!chosen || busy) return;
  if (targetH === 2160 && !confirm('معالجة 4K ثقيلة على الهاتف وقد تفشل بسبب الذاكرة. هل تريد المتابعة؟')) return;
  busy = true; processButton.disabled = true; download.style.display = 'none'; result.style.display = 'none';
  progress.style.display = 'block'; bar.style.width = '0%';
  try {
    await loadEngine();
    const ext = chosen.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'mp4';
    await ffmpeg.writeFile(`input.${ext}`, new Uint8Array(await chosen.arrayBuffer()));
    status.textContent = 'جارٍ تغيير الأبعاد وتصدير MP4… لا تغلق الصفحة.';
    await ffmpeg.exec(['-i', `input.${ext}`, '-vf', filter(), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'output.mp4']);
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob); download.href = outputUrl;
    download.download = `upscaled-${targetH}p.mp4`;
    download.textContent = `تنزيل MP4 · ${(blob.size / 1048576).toFixed(1)} MB`;
    download.style.display = 'block'; result.src = outputUrl; result.style.display = 'block';
    bar.style.width = '100%'; status.textContent = 'اكتمل التصدير. شغّل المعاينة وتأكد من الصورة والصوت.';
  } catch (error) {
    console.error(error);
    status.textContent = `فشلت المعالجة: ${(error?.message || String(error)).slice(0, 220)}. تأكد من اتصال الإنترنت وجرب Chrome وفيديو أقصر بدقة HD.`;
  } finally { busy = false; processButton.disabled = false; }
});