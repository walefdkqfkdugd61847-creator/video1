import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import './style.css';

const $ = (selector) => document.querySelector(selector);

const input = $('#file');
const preview = $('#preview');
const result = $('#result');
const info = $('#info');
const processButton = $('#process');
const status = $('#status');
const download = $('#download');
const progress = $('#progress');
const bar = $('#bar');
const orientation = $('#orientation');

let chosen = null;
let sourceUrl = null;
let outputUrl = null;
let targetH = 720;
let ffmpeg = null;
let loaded = false;
let busy = false;

document.querySelectorAll('.opt').forEach((button) => {
  button.addEventListener('click', () => {
    if (busy) return;

    document.querySelectorAll('.opt').forEach((item) => {
      item.classList.remove('active');
    });

    button.classList.add('active');
    targetH = Number(button.dataset.h);
  });
});

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
  status.textContent = 'تم اختيار الفيديو. ابدأ بدقة HD.';
});

async function loadEngine() {
  if (loaded) return;

  status.textContent = 'جارٍ تحميل محرك FFmpeg من الإنترنت...';
  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    if (message) {
      status.textContent = `المعالجة: ${message.slice(-130)}`;
    }
  });

  ffmpeg.on('progress', ({ progress: value }) => {
    const percent = Math.max(0, Math.min(99, value * 100));
    bar.style.width = `${percent}%`;
  });

  const base =
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

  let coreURL;
  let wasmURL;

  try {
    status.textContent = 'جارٍ تنزيل ملفات محرك المعالجة...';

    coreURL = await toBlobURL(
      `${base}/ffmpeg-core.js`,
      'text/javascript'
    );

    wasmURL = await toBlobURL(
      `${base}/ffmpeg-core.wasm`,
      'application/wasm'
    );

    await ffmpeg.load({
      coreURL,
      wasmURL
    });

    loaded = true;
    status.textContent = 'تم تحميل محرك المعالجة بنجاح.';
  } catch (error) {
    console.error('FFmpeg loading error:', error);

    throw new Error(
      `تعذر تحميل المحرك: ${error?.message || String(error)}`
    );
  } finally {
    if (coreURL) URL.revokeObjectURL(coreURL);
    if (wasmURL) URL.revokeObjectURL(wasmURL);
  }
}

function getScaleFilter() {
  if (orientation.value === 'portrait') {
    const width = Math.floor((targetH * 9 / 16) / 2) * 2;
    return `scale=${width}:${targetH}`;
  }

  if (orientation.value === 'landscape') {
    const width = Math.round((targetH * 16 / 9) / 2) * 2;
    return `scale=${width}:${targetH}`;
  }

  // Keep the source aspect ratio and set the output height.
  return `scale=-2:${targetH}`;
}

processButton.addEventListener('click', async () => {
  if (!chosen || busy) return;

  if (
    targetH === 2160 &&
    !confirm(
      'معالجة 4K ثقيلة على الهاتف وقد تفشل بسبب الذاكرة. هل تريد المتابعة؟'
    )
  ) {
    return;
  }

  busy = true;
  processButton.disabled = true;
  download.style.display = 'none';
  result.style.display = 'none';
  progress.style.display = 'block';
  bar.style.width = '0%';

  let inputName = null;

  try {
    await loadEngine();

    const extension =
      chosen.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'mp4';

    inputName = `input.${extension}`;
    const inputBytes = new Uint8Array(await chosen.arrayBuffer());

    status.textContent = 'جارٍ تجهيز الفيديو...';
    await ffmpeg.writeFile(inputName, inputBytes);

    status.textContent =
      'جارٍ تغيير أبعاد الفيديو وتصدير MP4. لا تغلق الصفحة.';

    await ffmpeg.exec([
      '-i', inputName,
      '-vf', getScaleFilter(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      'output.mp4'
    ]);

    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    if (outputUrl) URL.revokeObjectURL(outputUrl);

    outputUrl = URL.createObjectURL(blob);
    download.href = outputUrl;
    download.download = `upscaled-${targetH}p.mp4`;
    download.textContent =
      `تنزيل الفيديو الناتج · ${(blob.size / 1048576).toFixed(1)} MB`;
    download.style.display = 'block';

    result.src = outputUrl;
    result.style.display = 'block';
    bar.style.width = '100%';
    status.textContent =
      'اكتمل التصدير. شغّل المعاينة وتأكد من الصورة والصوت قبل التنزيل.';

    // Best-effort cleanup of temporary files in FFmpeg's virtual filesystem.
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.mp4');
    } catch {
      // Cleanup failure does not invalidate the exported Blob.
    }
  } catch (error) {
    console.error(error);
    const message = error?.message || String(error);
    status.textContent =
      `فشلت المعالجة: ${message.slice(0, 240)}. ` +
      'تأكد من الإنترنت، وجرب Chrome وفيديو أقصر بدقة HD.';
  } finally {
    busy = false;
    processButton.disabled = !chosen;
  }
});
