(() => {
  'use strict';
  const CHUNK_BYTES = 800;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const state = {
    file: null, frames: [], frameIndex: 0, playing: false, playTimer: null,
    stream: null, scanner: null, scanActive: false, scanBusy: false,
    chunks: new Map(), meta: null, receivedUrl: null, detector: null, scanCanvas: null,
    lastScan: 0, toastTimer: null, starting: false
  };

  const setText = (id, value) => { $(id).textContent = value; };
  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  function base64FromBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  function bytesFromBase64(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function encodeName(value) { return base64FromBytes(new TextEncoder().encode(value)); }
  function decodeName(value) { return new TextDecoder().decode(bytesFromBase64(value)); }
  function hex(buffer) { return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  async function sha256(data) {
    if (!crypto?.subtle) throw new Error('Secure browser context required for file verification. Open the HTTPS site.');
    return hex(await crypto.subtle.digest('SHA-256', data));
  }
  function fileIcon(file) {
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/')) return '▧';
    if (type.startsWith('video/')) return '▷';
    if (type.startsWith('audio/')) return '♫';
    if (file.name.toLowerCase().endsWith('.zip')) return '▣';
    if (type.includes('pdf')) return '▤';
    return '◇';
  }
  function showSelectedFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast(`This demo is limited to 10 MB. Your file is ${formatBytes(file.size)}.`);
      return;
    }
    state.file = file;
    $('drop-zone').classList.add('hidden');
    $('selected-file').classList.remove('hidden');
    $('file-glyph').textContent = fileIcon(file);
    setText('file-name', file.name);
    setText('file-meta', `${formatBytes(file.size)} · ${file.type || 'Unknown file type'}`);
    $('prepare-button').disabled = false;
    $('sender-stage').classList.add('hidden');
  }
  function clearSelectedFile() {
    state.file = null; $('file-input').value = '';
    $('drop-zone').classList.remove('hidden'); $('selected-file').classList.add('hidden');
    $('prepare-button').disabled = true; stopStream(); $('sender-stage').classList.add('hidden');
  }
  function makeQr(payload) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.M);
    qr.addData(payload); qr.make();
    const canvas = $('qr-canvas'); const ctx = canvas.getContext('2d');
    const n = qr.getModuleCount(); const quiet = 4;
    const unit = canvas.width / (n + quiet * 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#101722';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          const x = Math.floor((c + quiet) * unit);
          const y = Math.floor((r + quiet) * unit);
          const w = Math.ceil((c + quiet + 1) * unit) - x;
          const h = Math.ceil((r + quiet + 1) * unit) - y;
          ctx.fillRect(x, y, w, h);
        }
      }
    }
  }
  function stopStream() {
    state.playing = false;
    clearTimeout(state.playTimer); state.playTimer = null;
    $('play-icon').textContent = '▶'; setText('play-label', 'Resume stream');
  }
  function drawCurrentFrame() {
    if (!state.frames.length) return;
    makeQr(state.frames[state.frameIndex]);
    setText('frame-counter', `FRAME ${state.frameIndex + 1} / ${state.frames.length}`);
  }
  function scheduleNextFrame() {
    if (!state.playing || !state.frames.length) return;
    state.playTimer = setTimeout(() => {
      state.frameIndex = (state.frameIndex + 1) % state.frames.length;
      drawCurrentFrame();
      scheduleNextFrame();
    }, Number($('speed-select').value));
  }
  function startStream() {
    if (!state.frames.length) return;
    state.playing = true; $('play-icon').textContent = 'Ⅱ'; setText('play-label', 'Pause stream');
    clearTimeout(state.playTimer); scheduleNextFrame();
  }
  function toggleStream() {
    if (state.playing) stopStream(); else startStream();
  }
  async function prepareTransfer() {
    if (!state.file) return;
    const button = $('prepare-button'); button.disabled = true; button.textContent = 'Preparing file…';
    try {
      const file = state.file;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = await sha256(bytes);
      const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
      const transferId = crypto.getRandomValues(new Uint8Array(5)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
      const name64 = encodeName(file.name);
      const mime64 = encodeName(file.type || 'application/octet-stream');
      const frames = new Array(total);
      for (let index = 0; index < total; index++) {
        const chunk = bytes.subarray(index * CHUNK_BYTES, Math.min((index + 1) * CHUNK_BYTES, bytes.length));
        frames[index] = ['OB1', transferId, index, total, bytes.length, name64, mime64, digest, base64FromBytes(chunk)].join('|');
      }
      state.frames = frames; state.frameIndex = 0;
      setText('stream-file-name', file.name);
      const approxMinutes = Math.max(1, (frames.length * Number($('speed-select').value) / 1000 / 60));
      setText('stream-estimate', `${formatBytes(file.size)} · ${frames.length.toLocaleString()} QR frames · about ${approxMinutes.toFixed(1)} min per loop at this speed`);
      $('sender-stage').classList.remove('hidden');
      drawCurrentFrame(); startStream();
      $('sender-stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      toast('QR stream is live. Keep it looping until the receiver finishes.');
    } catch (error) {
      console.error(error); toast(error.message || 'Could not prepare this file.');
    } finally {
      button.disabled = !state.file; button.innerHTML = 'Prepare QR stream <span>→</span>';
    }
  }

  function parseFrame(raw) {
    if (typeof raw !== 'string' || !raw.startsWith('OB1|')) return null;
    const parts = raw.split('|');
    if (parts.length !== 9) return null;
    const [, id, indexText, totalText, sizeText, name64, mime64, digest, data64] = parts;
    const index = Number(indexText), total = Number(totalText), size = Number(sizeText);
    if (!/^[a-f0-9]{10}$/i.test(id) || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 20000 || index < 0 || index >= total || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/i.test(digest)) return null;
    try {
      return { id, index, total, size, name: decodeName(name64), mime: decodeName(mime64), digest, data: bytesFromBase64(data64) };
    } catch (_) { return null; }
  }
  function sameMeta(a, b) {
    return a.id === b.id && a.total === b.total && a.size === b.size && a.name === b.name && a.mime === b.mime && a.digest === b.digest;
  }
  function showReceiveProgress() {
    const meta = state.meta; if (!meta) return;
    const count = state.chunks.size;
    const percent = Math.floor(count / meta.total * 100);
    $('receive-progress').classList.remove('hidden');
    setText('receive-file-name', meta.name);
    setText('receive-percent', `${percent}%`);
    $('receive-progress-fill').style.width = `${percent}%`;
    setText('receive-count', `${count.toLocaleString()} of ${meta.total.toLocaleString()} frames captured`);
    setText('receive-size', `${formatBytes(Math.min(count * CHUNK_BYTES, meta.size))} / ${formatBytes(meta.size)}`);
  }
  async function acceptFrame(raw) {
    const frame = parseFrame(raw);
    if (!frame) return;
    if (!state.meta) {
      state.meta = { ...frame }; delete state.meta.data; delete state.meta.index;
      $('receive-progress').classList.remove('hidden');
      $('reset-receive').classList.remove('hidden');
      setText('reset-receive', 'Reset transfer');
      setText('scan-message', `Receiving ${frame.name}. Keep the sender's QR stream running.`);
    }
    if (!sameMeta(state.meta, frame)) return;
    if (!state.chunks.has(frame.index)) {
      state.chunks.set(frame.index, frame.data);
      showReceiveProgress();
      if (state.chunks.size === frame.total) await finishReceive();
    }
  }
  async function finishReceive() {
    stopCamera(); setText('scan-message', 'All frames captured. Verifying file integrity…');
    const meta = state.meta;
    const parts = []; let length = 0;
    for (let i = 0; i < meta.total; i++) {
      const chunk = state.chunks.get(i);
      if (!chunk) { setText('scan-message', 'A frame is missing. Start scanning again to collect the rest.'); return; }
      parts.push(chunk); length += chunk.length;
    }
    const joined = new Uint8Array(length); let offset = 0;
    for (const p of parts) { joined.set(p, offset); offset += p.length; }
    if (length !== meta.size || await sha256(joined) !== meta.digest) {
      setText('scan-message', 'The file check failed. Keep the sender looping and scan again.');
      toast('File verification failed.'); return;
    }
    if (state.receivedUrl) URL.revokeObjectURL(state.receivedUrl);
    const blob = new Blob([joined], { type: meta.mime || 'application/octet-stream' });
    state.receivedUrl = URL.createObjectURL(blob);
    const link = $('download-link'); link.href = state.receivedUrl; link.download = meta.name || 'received-file';
    setText('complete-meta', `${meta.name} · ${formatBytes(meta.size)} · SHA-256 verified`);
    $('complete-card').classList.remove('hidden'); $('reset-receive').classList.remove('hidden');
    setText('reset-receive', 'Receive another file');
    $('scan-button').classList.add('hidden'); $('stop-scan').classList.add('hidden');
    setText('scan-message', 'Transfer complete. Your file was rebuilt and checked entirely on this device.');
    toast('File received and verified.');
  }

  async function setupScanner() {
    if (window.BarcodeDetector) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) return { type: 'native', detector: new BarcodeDetector({ formats: ['qr_code'] }) };
      } catch (_) {}
    }
    if (typeof window.jsQR === 'function') return { type: 'jsqr' };
    return null;
  }
  async function startCamera() {
    if (state.starting || state.scanActive) return;
    state.starting = true;
    const button = $('scan-button'); button.disabled = true; button.textContent = 'Starting camera…';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available. Open this site over HTTPS in a modern browser.');
      const scanner = await setupScanner();
      if (!scanner) throw new Error('QR scanning is not supported in this browser. Reopen the app while online to load its scanner, then try again.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      state.stream = stream; state.scanner = scanner; state.scanActive = true;
      const video = $('camera-video'); video.srcObject = stream; await video.play();
      $('camera-box').classList.add('scanning'); $('camera-placeholder').classList.add('hidden'); $('camera-overlay').classList.remove('hidden');
      $('scan-button').classList.add('hidden'); $('stop-scan').classList.remove('hidden');
      if (!state.meta) setText('scan-message', 'Camera is live. Hold the QR stream inside the frame and wait for the pieces to collect.');
      scanLoop();
    } catch (error) {
      console.error(error); toast(error.message || 'Could not start the camera.');
      setText('scan-message', error.message || 'Could not start the camera.');
    } finally {
      state.starting = false; button.disabled = false; button.innerHTML = 'Start camera <span>⌕</span>';
    }
  }
  async function scanLoop() {
    if (!state.scanActive) return;
    if (!state.scanBusy && $('camera-video').readyState >= 2 && performance.now() - state.lastScan > 80) {
      state.scanBusy = true; state.lastScan = performance.now();
      try {
        const video = $('camera-video');
        if (state.scanner.type === 'native') {
          const codes = await state.scanner.detector.detect(video);
          if (codes.length) await acceptFrame(codes[0].rawValue);
        } else {
          const canvas = state.scanCanvas || (state.scanCanvas = document.createElement('canvas'));
          const scale = Math.min(1, 800 / video.videoWidth);
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) await acceptFrame(code.data);
        }
      } catch (error) {
        // Camera frames can occasionally be undecodable while the sender changes frames.
        if (error?.name === 'NotAllowedError') {
          setText('scan-message', 'Camera permission was blocked. Allow camera access in your browser settings.');
          stopCamera();
        }
      } finally { state.scanBusy = false; }
    }
    if (state.scanActive) requestAnimationFrame(scanLoop);
  }
  function stopCamera() {
    state.scanActive = false;
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null; $('camera-video').srcObject = null;
    $('camera-box').classList.remove('scanning'); $('camera-placeholder').classList.remove('hidden'); $('camera-overlay').classList.add('hidden');
    $('stop-scan').classList.add('hidden');
    if (!$('complete-card').classList.contains('hidden')) $('scan-button').classList.add('hidden');
    else $('scan-button').classList.remove('hidden');
  }
  function resetReceive() {
    stopCamera(); state.chunks.clear(); state.meta = null;
    $('receive-progress').classList.add('hidden'); $('complete-card').classList.add('hidden'); $('reset-receive').classList.add('hidden');
    setText('reset-receive', 'Receive another file');
    $('scan-button').classList.remove('hidden'); $('scan-message').textContent = 'When all frames are captured, your file will be ready to save.';
    $('receive-progress-fill').style.width = '0%';
    if (state.receivedUrl) { URL.revokeObjectURL(state.receivedUrl); state.receivedUrl = null; }
  }
  function switchMode(mode) {
    const send = mode === 'send';
    $('send-tab').classList.toggle('active', send); $('receive-tab').classList.toggle('active', !send);
    $('send-tab').setAttribute('aria-selected', String(send)); $('receive-tab').setAttribute('aria-selected', String(!send));
    $('send-panel').hidden = !send; $('receive-panel').hidden = send;
    if (!send) stopStream(); else stopCamera();
  }
  function bind() {
    $('send-tab').addEventListener('click', () => switchMode('send'));
    $('receive-tab').addEventListener('click', () => switchMode('receive'));
    $('file-input').addEventListener('change', e => showSelectedFile(e.target.files?.[0]));
    $('remove-file').addEventListener('click', clearSelectedFile);
    $('prepare-button').addEventListener('click', prepareTransfer);
    $('play-button').addEventListener('click', toggleStream);
    $('speed-select').addEventListener('change', () => { if (state.playing) { clearTimeout(state.playTimer); scheduleNextFrame(); } });
    $('new-transfer').addEventListener('click', clearSelectedFile);
    $('scan-button').addEventListener('click', startCamera);
    $('stop-scan').addEventListener('click', stopCamera);
    $('reset-receive').addEventListener('click', resetReceive);
    const zone = $('drop-zone');
    ['dragenter','dragover'].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(type => zone.addEventListener(type, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
    zone.addEventListener('drop', e => showSelectedFile(e.dataTransfer?.files?.[0]));
    window.addEventListener('beforeunload', () => { stopCamera(); stopStream(); if (state.receivedUrl) URL.revokeObjectURL(state.receivedUrl); });
  }
  function setupOfflineStatus() {
    const status = $('offline-status');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then(() => {
        status.textContent = navigator.serviceWorker.controller ? 'OFFLINE APP READY' : 'RELOAD ONCE WHILE ONLINE';
        navigator.serviceWorker.addEventListener('controllerchange', () => { status.textContent = 'RELOAD ONCE WHILE ONLINE'; });
      }).catch(() => { status.textContent = 'APP OPEN · OFFLINE CACHE UNAVAILABLE'; });
    } else status.textContent = 'OPEN OVER HTTPS FOR CAMERA + OFFLINE';
  }
  bind(); setupOfflineStatus();
})();