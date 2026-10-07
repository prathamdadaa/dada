(() => {
  const $ = id => document.getElementById(id);
  const log = $('log'), input = $('input'), statusEl = $('status');
  const history = [];
  let state = 'idle', busy = false, recog = null, listening = false, wakeMode = false, awaitingCommand = false;

  /* ---------- Orb visualizer (state-driven, no mic analyser needed) ---------- */
  const cv = $('orb'), cx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hue = { idle: '34,230,255', listening: '255,179,71', thinking: '150,140,255', speaking: '34,230,255' };
  let t = 0;
  function draw() {
    t += state === 'idle' ? 0.012 : 0.04;
    const w = cv.width, c = w / 2, amp = { idle: 6, listening: 22, thinking: 12, speaking: 30 }[state];
    cx.clearRect(0, 0, w, w);
    const col = hue[state];
    const g = cx.createRadialGradient(c, c, 20, c, c, c);
    g.addColorStop(0, `rgba(${col},.35)`); g.addColorStop(1, `rgba(${col},0)`);
    cx.fillStyle = g; cx.fillRect(0, 0, w, w);
    for (let ring = 0; ring < 3; ring++) {
      cx.beginPath();
      for (let a = 0; a <= 360; a += 3) {
        const r = a * Math.PI / 180;
        const wob = reduce ? 0 : Math.sin(r * (3 + ring) + t * (1 + ring * .4)) * amp * (1 - ring * .25);
        const rad = 130 + ring * 34 + wob;
        const x = c + Math.cos(r) * rad, y = c + Math.sin(r) * rad;
        a ? cx.lineTo(x, y) : cx.moveTo(x, y);
      }
      cx.closePath();
      cx.strokeStyle = `rgba(${col},${.9 - ring * .28})`; cx.lineWidth = 3 - ring * .7;
      cx.shadowColor = `rgba(${col},.9)`; cx.shadowBlur = 16; cx.stroke();
    }
    requestAnimationFrame(draw);
  }
  draw();
  function setState(s, text) { state = s; if (text !== undefined) statusEl.textContent = text; }

  /* ---------- Rendering (escape first, then format; never inject raw HTML) ---------- */
  const esc = s => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let lastHtml = '';
  function render(text) {
    const parts = text.split(/```/);
    return parts.map((p, i) => {
      if (i % 2 === 0) return esc(p).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      const nl = p.indexOf('\n');
      const lang = (nl > -1 ? p.slice(0, nl) : '').trim().toLowerCase().slice(0, 12) || 'code';
      const code = nl > -1 ? p.slice(nl + 1) : p;
      const isHtml = lang === 'html';
      return `<div class="codeblock"><div class="bar"><span>${esc(lang)}</span><span>` +
        (isHtml ? '<button class="btn small" data-act="preview">Preview</button>' : '') +
        '<button class="btn small" data-act="copy">Copy</button></span></div>' +
        `<pre>${esc(code)}</pre></div>`;
    }).join('');
  }
  function addMsg(role, text, cls = '') {
    const m = document.createElement('div'); m.className = `msg ${role} ${cls}`;
    const b = document.createElement('div'); b.className = 'bubble';
    if (role === 'bot' && !cls) b.innerHTML = render(text); else b.textContent = text;
    m.appendChild(b); log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  log.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const code = btn.closest('.codeblock').querySelector('pre').textContent;
    if (btn.dataset.act === 'copy') { navigator.clipboard.writeText(code).then(() => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1200); }); }
    else showPreview(code);
  });
  function showPreview(html) {
    lastHtml = html; $('preview').hidden = false;
    $('frame').srcdoc = html; // sandbox="allow-scripts" without same-origin keeps it isolated
  }
  $('closePrev').onclick = () => { $('preview').hidden = true; $('frame').srcdoc = ''; };
  $('openTab').onclick = () => { const u = URL.createObjectURL(new Blob([lastHtml], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); };

  /* ---------- Text to speech ---------- */
  const synth = window.speechSynthesis;
  function speak(text) {
    if (!synth || !$('speakToggle').checked) return Promise.resolve();
    const plain = text.replace(/```[\s\S]*?```/g, ' I have put the code on screen. ').replace(/[*`#_>]/g, '').slice(0, 900);
    return new Promise(res => {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(plain); u.lang = $('langSel').value; u.rate = 1.03;
      const v = synth.getVoices().find(v => v.lang === u.lang) || synth.getVoices().find(v => v.lang.startsWith(u.lang.slice(0, 2)));
      if (v) u.voice = v;
      u.onstart = () => setState('speaking', 'Speaking');
      u.onend = u.onerror = () => res();
      synth.speak(u);
    });
  }

  /* ---------- Chat ---------- */
  async function send(text) {
    text = text.trim(); if (!text || busy) return;
    busy = true; $('sendBtn').disabled = true; input.value = ''; autosize();
    addMsg('user', text); history.push({ role: 'user', content: text });
    const typing = addMsg('bot', 'Thinking...', 'typing'); setState('thinking', 'Thinking');
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-20) }) });
      const data = await r.json().catch(() => ({}));
      typing.remove();
      if (!r.ok) throw new Error(data.error || 'Something went wrong.');
      history.push({ role: 'assistant', content: data.reply });
      const m = addMsg('bot', data.reply);
      const html = data.reply.match(/```html\n([\s\S]*?)```/i); if (html) showPreview(html[1]);
      setState('speaking'); await speak(data.reply);
    } catch (err) {
      typing.remove(); history.pop(); addMsg('bot', err.message, 'err');
    } finally {
      busy = false; $('sendBtn').disabled = false; setState('idle', wakeMode ? 'Listening for "Hey Dada"' : 'Ready');
      if (wakeMode) startRecog();
    }
  }
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  $('composer').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  $('chips').addEventListener('click', e => { if (e.target.classList.contains('chip')) send(e.target.textContent); });

  /* ---------- Speech recognition (Web Speech API) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { statusEl.textContent = 'Voice input needs Chrome, Edge or Safari. Typing works everywhere.'; $('micBtn').disabled = true; $('wakeToggle').disabled = true; }
  const WAKE = /(hey|hi|hello|ok|okay)[\s,]*(dada|daada|dadaa)|हे\s*दादा|हेय\s*दादा|ओके\s*दादा/i;

  function startRecog() {
    if (!SR || listening || busy) return;
    recog = new SR(); recog.lang = $('langSel').value; recog.interimResults = false; recog.continuous = wakeMode; recog.maxAlternatives = 1;
    recog.onstart = () => { listening = true; setState('listening', wakeMode && !awaitingCommand ? 'Listening for "Hey Dada"' : 'Listening'); };
    recog.onresult = e => {
      const said = e.results[e.results.length - 1][0].transcript.trim(); if (!said) return;
      if (!wakeMode) { stopRecog(); send(said); return; }
      if (awaitingCommand) { awaitingCommand = false; stopRecog(); send(said); return; }
      const m = said.match(WAKE);
      if (m) {
        const rest = said.slice(m.index + m[0].length).replace(/^[\s,.:-]+/, '');
        stopRecog();
        if (rest) send(rest); else { awaitingCommand = true; speak('Yes?').then(() => { if (wakeMode) startRecog(); }); }
      }
    };
    recog.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wakeMode = false; $('wakeToggle').checked = false; setState('idle', 'Microphone blocked. Allow mic access in your browser.'); }
    };
    recog.onend = () => { listening = false; if (wakeMode && !busy) setTimeout(startRecog, 300); else if (!busy) { $('micBtn').setAttribute('aria-pressed', 'false'); if (state === 'listening') setState('idle', 'Ready'); } };
    try { recog.start(); } catch {}
  }
  function stopRecog() { if (recog) { recog.onend = null; try { recog.stop(); } catch {} } listening = false; }

  $('micBtn').onclick = () => {
    if (listening) { stopRecog(); $('micBtn').setAttribute('aria-pressed', 'false'); setState('idle', 'Ready'); return; }
    synth && synth.cancel(); wakeMode = false; $('wakeToggle').checked = false;
    $('micBtn').setAttribute('aria-pressed', 'true'); startRecog();
  };
  $('wakeToggle').onchange = e => {
    wakeMode = e.target.checked; stopRecog(); awaitingCommand = false;
    if (wakeMode) startRecog(); else setState('idle', 'Ready');
  };
  $('langSel').onchange = () => { if (listening) { stopRecog(); startRecog(); } };
  if (synth) synth.onvoiceschanged = () => {};
})();
