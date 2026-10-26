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
  button.classList.add('active');
  targetH = Number(button.dataset.h);
}));

input.addEventListener('change', () => {
  chosen = input.files?.[0] || null;
  if (!chosen) return;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  sourceUrl = URL.createObjectURL(chosen);
  preview.src = sourceUrl;
  preview.style.display = 'block';
  result.style.display = 'none';
  download.style.display = 'none';
  info.textContent = `${chosen.name} · ${(chosen.size / 1048576).toFixed(2)} MB`;
  processButton.disabled = false;
  status.textContent = 'تم اختيار الملف. ابدأ بدقة HD للاختبار.';
});

async function loadEngine() {
  if (loaded) return;
  status.textContent = 'جارٍ تنزيل محرك FFmpeg… لا تغلق الصفحة.';
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    if (message) status.textContent = `المعالجة: ${message.slice(-150)}`;
  });
  ffmpeg.on('progress', ({ progress: p }) => {
    bar.style.width = `${Math.max(0, Math.min(99, p * 100))}%`;
  });
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
  await ffmpeg.load({ coreURL, wasmURL });
  loaded = true;
}

function makeFilter() {
  const portrait = orientation.value === 'portrait';
  const landscape = orientation.value === 'landscape';
  if (portrait) return `scale=trunc(${targetH}*9/16/2)*2:${targetH}`;
  if (landscape) return `scale=${Math.round(targetH * 16 / 9 / 2) * 2}:${targetH}`;
  return `scale=-2:${targetH}`;
}

processButton.addEventListener('click', async () => {
  if (!chosen || busy) return;
  if (targetH === 2160 && !confirm('4K ثقيل جدًا على الهاتف وقد يتوقف بسبب الذاكرة. هل تريد المتابعة؟')) return;
  busy = true;
  processButton.disabled = true;
  download.style.display = 'none';
  result.style.display = 'none';
  progress.style.display = 'block';
  bar.style.width = '0%';
  try {
    await loadEngine();
    status.textContent = 'جارٍ تجهيز الملف…';
    const ext = chosen.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'mp4';
    const inputName = `input.${ext}`;
    const outputName = 'output.mp4';
    await ffmpeg.writeFile(inputName, new Uint8Array(await chosen.arrayBuffer()));
    const args = [
      '-i', inputName, '-vf', makeFilter(),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', outputName
    ];
    status.textContent = 'جارٍ تحويل الفيديو وتصديره إلى MP4…';
    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: 'video/mp4' });
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    download.href = outputUrl;
    download.download = `upscaled-${targetH}p.mp4`;
    download.textContent = `تنزيل MP4 · ${(blob.size / 1048576).toFixed(1)} MB`;
    download.style.display = 'block';
    result.src = outputUrl;
    result.style.display = 'block';
    bar.style.width = '100%';
    status.textContent = 'اكتمل التصدير. شغّل المعاينة وتأكد من الصورة والصوت.';
  } catch (error) {
    console.error(error);
    status.textContent = `فشلت المعالجة. افتح الموقع عبر HTTPS وجرب فيديو أقصر بدقة HD. التفاصيل: ${(error?.message || String(error)).slice(0, 180)}`;
  } finally {
    busy = false;
    processButton.disabled = false;
  }
});