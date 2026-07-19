/* ============================================================
   SPACE VERSE · LAUNCHER — renderer
   ============================================================ */

let config = null;
let fiveMPath = null;
let isOnline = false;
let currentServerIndex = 0;
let autoRefreshInterval = null;
const AUTO_REFRESH_INTERVAL = 30000;

const playersHistory = [];
const pingHistory = [];
const HISTORY_MAX = 40;

const $ = (id) => document.getElementById(id);
let prefersReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   SETTINGS (localStorage)
   ============================================================ */
const store = {
    get: (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const settings = {
    show3d: store.get('sv_3d', true),
    sound: store.get('sv_sound', false),
    reduce: store.get('sv_reduce', false),
    planet: store.get('sv_planet', null),
    volume: store.get('sv_volume', 0.7)
};

// Apply saved planet theme as early as possible so the 3D scene inits with it.
if (settings.planet) window.__spaceTheme = settings.planet;

/* ============================================================
   SOUND (WebAudio, no assets)
   ============================================================ */
let audioCtx = null;
let masterGain = null;
function ensureAudio() {
    if (!settings.sound) return null;
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch { return null; }
        masterGain = audioCtx.createGain();
        masterGain.gain.value = settings.volume;
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function setVolume(v) {
    settings.volume = Math.max(0, Math.min(1, v));
    if (masterGain && audioCtx) {
        masterGain.gain.setTargetAtTime(settings.volume, audioCtx.currentTime, 0.02);
    }
}
function blip(freq = 620, dur = 0.08, type = 'sine', gain = 0.05) {
    const ctx = ensureAudio(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(masterGain);
    o.start(); o.stop(ctx.currentTime + dur);
}
function whoosh() {
    const ctx = ensureAudio(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 1.4);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
    o.connect(g); g.connect(masterGain);
    o.start(); o.stop(ctx.currentTime + 1.6);
}

/* ambient space drone (subtle evolving pad) */
let ambient = null;
function startAmbient() {
    const ctx = ensureAudio();
    if (!ctx || ambient) return;
    const master = ctx.createGain(); master.gain.value = 0; master.connect(masterGain);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 5; filter.connect(master);
    const oscs = [];
    [55, 82.41, 110, 164.81].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'sine';
        o.frequency.value = f; o.detune.value = (i - 1.5) * 6;
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.2 - i * 0.03;
        o.connect(g); g.connect(filter); o.start(); oscs.push(o);
    });
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 200;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
    ambient = { master, oscs, lfo };
}
function stopAmbient() {
    if (!ambient || !audioCtx) { ambient = null; return; }
    const ctx = audioCtx; const a = ambient; ambient = null;
    try {
        a.master.gain.cancelScheduledValues(ctx.currentTime);
        a.master.gain.setValueAtTime(a.master.gain.value, ctx.currentTime);
        a.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
        setTimeout(() => { try { a.oscs.forEach((o) => o.stop()); a.lfo.stop(); } catch {} }, 1300);
    } catch {}
}

/* ============================================================
   VIEW ROUTING
   ============================================================ */
function switchView(name) {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'players') loadPlayers();
    blip(560, 0.06, 'triangle');
}

/* ============================================================
   HELPERS
   ============================================================ */
function setLauncherMessage(msg = '') { const el = $('launcherMessage'); if (el) el.textContent = msg; }
function setLaunchState({ small, strong, rocket = true } = {}) {
    if (small && $('launch-small')) $('launch-small').textContent = small;
    if (strong && $('launch-strong')) $('launch-strong').textContent = strong;
    const icon = $('launch-icon'); if (!icon) return;
    icon.innerHTML = rocket
        ? '<svg viewBox="0 0 24 24" class="ico-rocket"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>'
        : '<svg viewBox="0 0 24 24" class="ico-spinner"><path d="M21 12a9 9 0 1 1-2.64-6.36"/></svg>';
}
function setStat(el, color, glow, pulse) {
    if (!el) return;
    el.style.backgroundColor = color;
    el.style.boxShadow = `0 0 14px ${glow}`;
    el.classList.toggle('pulsing', !!pulse);
}

/* ============================================================
   INIT
   ============================================================ */
async function initializeLauncher() {
    try {
        config = await window.electronAPI.getConfig();
        fiveMPath = await window.electronAPI.getFiveMPath();
        await displayAppVersion();
        renderNews();
        renderEvent();
        populateSettings();
        setupCacheButtons();
        await loadServerStatus();
        startAutoRefresh();
    } catch (error) {
        console.error('Erreur initialisation launcher :', error);
        setLauncherMessage('Impossible d’initialiser le launcher.');
    }
}

async function displayAppVersion() {
    try {
        const version = await window.electronAPI.getAppVersion();
        if (version) {
            if ($('app-version')) $('app-version').textContent = `v${version}`;
            if ($('set-version')) $('set-version').textContent = `v${version}`;
        }
    } catch (error) { console.error(error); }
}

/* ============================================================
   SERVER STATUS
   ============================================================ */
async function loadServerStatus() {
    if (!config?.servers?.length) { setOfflineState('Aucun serveur configuré'); return; }
    const server = config.servers[currentServerIndex];
    setLoadingState();
    try {
        const status = await window.electronAPI.getServerStatus(server.ip);
        if ($('sv-name')) $('sv-name').textContent = server.svname || 'Space Verse';

        if (status?.online) {
            isOnline = true;
            setOnlineState(status);
            pushHistory(playersHistory, status.players ?? 0);
            pushHistory(pingHistory, status.ping ?? 0);
            drawSpark('spark-players', playersHistory, '#6fd6ff');
            drawSpark('spark-ping', pingHistory, '#8a7bff');
            updatePlayerCount(status);
        } else {
            isOnline = false;
            setOfflineState('Serveur hors-ligne');
        }
        updatePlayButton();
    } catch (error) {
        console.error('Erreur statut serveur :', error);
        isOnline = false;
        setOfflineState('Connexion impossible');
    }
}

function setSideStatus(label, color, glow, pulse) {
    setStat($('side-stat'), color, glow, pulse);
    if ($('side-status-label')) $('side-status-label').textContent = label;
}

function setLoadingState() {
    setStat($('sv-stat'), '#7d8aa5', 'rgba(125,138,165,.6)', true);
    setSideStatus('Scan', '#7d8aa5', 'rgba(125,138,165,.6)', true);
    if ($('status-label')) $('status-label').textContent = 'Scan';
    if ($('server-state')) $('server-state').textContent = 'Analyse...';
    if ($('totalPlayers')) $('totalPlayers').textContent = '—';
    if ($('serverPing')) $('serverPing').textContent = '—';
    if ($('sv-join')) $('sv-join').disabled = true;
    setLaunchState({ small: 'Connexion', strong: 'Sondage du serveur...', rocket: false });
    setLauncherMessage('Interrogation de la station Space Verse...');
}

function setOnlineState(status) {
    setStat($('sv-stat'), 'var(--green)', 'rgba(63,224,143,.9)', false);
    setSideStatus('En ligne', 'var(--green)', 'rgba(63,224,143,.9)', false);
    if ($('status-label')) $('status-label').textContent = 'En ligne';
    if ($('server-state')) $('server-state').textContent = 'Station opérationnelle';
    if ($('serverPing') && typeof status?.ping === 'number') $('serverPing').textContent = `${status.ping} ms`;
    setLaunchState({ small: 'Prêt au décollage', strong: 'Rejoindre Space Verse', rocket: true });
    setLauncherMessage('La station est accessible. Décollage autorisé.');
}

function setOfflineState(message = 'Serveur hors-ligne') {
    setStat($('sv-stat'), 'var(--red)', 'rgba(255,93,108,.85)', false);
    setSideStatus('Hors-ligne', 'var(--red)', 'rgba(255,93,108,.85)', false);
    if ($('status-label')) $('status-label').textContent = 'Hors-ligne';
    if ($('server-state')) $('server-state').textContent = message;
    if ($('totalPlayers')) $('totalPlayers').textContent = 'Indisponible';
    if ($('serverPing')) $('serverPing').textContent = '—';
    if ($('sv-join')) $('sv-join').disabled = true;
    setLaunchState({ small: 'Hors-ligne', strong: 'Station indisponible', rocket: true });
    setLauncherMessage('La station est actuellement hors-ligne.');
    const badge = $('nav-players-count'); if (badge) badge.classList.remove('show');
}

function updatePlayButton() {
    const join = $('sv-join'); if (!join) return;
    if (!fiveMPath) {
        join.disabled = true; join.title = 'FiveM n’est pas installé';
        setLaunchState({ small: 'FiveM requis', strong: 'FiveM introuvable', rocket: true });
        setLauncherMessage('FiveM doit être installé pour rejoindre Space Verse.');
        return;
    }
    if (isOnline) {
        join.disabled = false; join.title = 'Rejoindre Space Verse';
        setLaunchState({ small: 'Prêt au décollage', strong: 'Rejoindre Space Verse', rocket: true });
    }
}

function updatePlayerCount(status) {
    const count = typeof status?.players === 'number' ? status.players : 0;
    const max = status?.maxPlayers ? ` / ${status.maxPlayers}` : '';
    if ($('totalPlayers')) $('totalPlayers').textContent = `${count}${max}`;
    const badge = $('nav-players-count');
    if (badge) { badge.textContent = count > 99 ? '99+' : String(count); badge.classList.toggle('show', count > 0); }
}

/* ============================================================
   SPARKLINES
   ============================================================ */
function pushHistory(arr, v) { arr.push(v); if (arr.length > HISTORY_MAX) arr.shift(); }
function drawSpark(id, data, color) {
    const cv = $(id); if (!cv || data.length < 2) return;
    const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...data, 1), min = Math.min(...data, 0);
    const range = Math.max(1, max - min);
    const step = w / (HISTORY_MAX - 1);
    ctx.beginPath();
    data.forEach((v, i) => {
        const x = i * step;
        const y = h - 3 - ((v - min) / range) * (h - 6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    ctx.shadowBlur = 6; ctx.shadowColor = color; ctx.stroke();
    ctx.lineTo((data.length - 1) * step, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
    ctx.shadowBlur = 0; ctx.fillStyle = grad; ctx.fill();
}

/* ============================================================
   PLAYERS VIEW
   ============================================================ */
async function loadPlayers() {
    const grid = $('players-grid'), empty = $('players-empty'), title = $('players-title');
    if (!grid) return;
    if (!isOnline || !config?.servers?.length) {
        grid.innerHTML = ''; empty?.classList.add('show');
        if (empty) empty.textContent = 'Le serveur est hors-ligne.';
        if (title) title.textContent = 'Joueurs connectés';
        return;
    }
    grid.innerHTML = '<div class="players-empty show">Chargement de l’équipage...</div>';
    try {
        const players = await window.electronAPI.getConnectedPlayers(config.servers[currentServerIndex].ip);
        const list = Array.isArray(players) ? players : [];
        if (title) title.textContent = `${list.length} joueur${list.length > 1 ? 's' : ''} connecté${list.length > 1 ? 's' : ''}`;
        if (!list.length) { grid.innerHTML = ''; if (empty) { empty.textContent = 'Aucun joueur connecté pour le moment.'; empty.classList.add('show'); } return; }
        empty?.classList.remove('show');
        list.sort((a, b) => (a.ping ?? 999) - (b.ping ?? 999));
        grid.innerHTML = list.map((p, i) => {
            const name = String(p.name ?? 'Inconnu');
            const initial = (name.trim()[0] || '?').toUpperCase();
            const ping = typeof p.ping === 'number' ? p.ping : null;
            const pclass = ping === null ? '' : ping < 60 ? '' : ping < 120 ? 'mid' : 'high';
            const pingHtml = ping === null ? '' : `<span class="player-ping ${pclass}">${ping} ms</span>`;
            return `<div class="player-card" style="animation-delay:${Math.min(i * 20, 400)}ms">
                <div class="player-av">${escapeHtml(initial)}</div>
                <div class="player-meta"><div class="player-name">${escapeHtml(name)}</div><div class="player-sub">ID ${p.id ?? '—'}</div></div>
                ${pingHtml}
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Erreur joueurs :', error);
        grid.innerHTML = ''; if (empty) { empty.textContent = 'Impossible de récupérer la liste.'; empty.classList.add('show'); }
    }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ============================================================
   NEWS VIEW
   ============================================================ */
function renderNews() {
    const list = $('news-list'); if (!list) return;
    const news = config?.news || [];
    if (!news.length) { list.innerHTML = '<div class="players-empty show">Aucune actualité.</div>'; return; }
    list.innerHTML = news.map((n, i) => `
        <div class="news-card" style="animation-delay:${i * 60}ms">
            <div class="news-top">
                <span class="news-tag">${escapeHtml(n.tag || 'INFO')}</span>
                <span class="news-date">${escapeHtml(formatDate(n.date))}</span>
            </div>
            <h3>${escapeHtml(n.title || '')}</h3>
            <p>${escapeHtml(n.body || '')}</p>
        </div>`).join('');
}
function formatDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return d; }
}

/* ============================================================
   EVENT CARD (live countdown)
   ============================================================ */
let eventInterval = null;
function renderEvent() {
    const card = $('event-card');
    if (!card) return;
    const ev = config?.event;
    const target = ev?.date ? new Date(ev.date).getTime() : NaN;
    if (!ev || !ev.title || isNaN(target)) { card.classList.add('hidden'); return; }

    if ($('event-tag')) $('event-tag').textContent = ev.tag || 'ÉVÉNEMENT';
    if ($('event-title')) $('event-title').textContent = ev.title;
    card.onclick = () => window.electronAPI.openExternal(ev.link || config.discord || '');

    const countEl = $('event-count');
    const pad = (n) => String(n).padStart(2, '0');
    const LIVE_WINDOW = 3 * 3600 * 1000;

    const tick = () => {
        let diff = target - Date.now();
        if (diff <= 0 && diff > -LIVE_WINDOW) {
            countEl.textContent = 'EN DIRECT';
            countEl.classList.add('live');
            card.classList.remove('hidden');
            return;
        }
        if (diff <= -LIVE_WINDOW) {
            card.classList.add('hidden');
            if (eventInterval) { clearInterval(eventInterval); eventInterval = null; }
            return;
        }
        countEl.classList.remove('live');
        const d = Math.floor(diff / 86400000); diff -= d * 86400000;
        const h = Math.floor(diff / 3600000); diff -= h * 3600000;
        const m = Math.floor(diff / 60000); diff -= m * 60000;
        const s = Math.floor(diff / 1000);
        countEl.textContent = d > 0 ? `J-${d} · ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
        card.classList.remove('hidden');
    };
    tick();
    if (eventInterval) clearInterval(eventInterval);
    eventInterval = setInterval(tick, 1000);
}

/* ============================================================
   SETTINGS VIEW
   ============================================================ */
function populateSettings() {
    const server = config?.servers?.[currentServerIndex];
    if ($('set-svname')) $('set-svname').textContent = server?.svname || 'Space Verse';
    if ($('set-ip')) $('set-ip').textContent = server?.ip || '—';
    if ($('set-fivem')) $('set-fivem').textContent = fiveMPath || 'Non détecté';

    const t3d = $('toggle-3d'), ts = $('toggle-sound'), tr = $('toggle-reduce');
    if (t3d) { t3d.checked = settings.show3d; t3d.addEventListener('change', () => { settings.show3d = t3d.checked; store.set('sv_3d', t3d.checked); apply3d(); blip(); }); }
    if (ts) { ts.checked = settings.sound; ts.addEventListener('change', () => { settings.sound = ts.checked; store.set('sv_sound', ts.checked); if (ts.checked) { ensureAudio(); blip(720); startAmbient(); } else { stopAmbient(); } }); }

    const vol = $('volume-slider'), volVal = $('volume-val');
    if (vol) {
        const paint = (pct) => {
            vol.style.setProperty('--fill', `${pct}%`);
            if (volVal) volVal.textContent = `${Math.round(pct)}%`;
        };
        vol.value = Math.round(settings.volume * 100);
        paint(vol.value);
        vol.addEventListener('input', () => { setVolume(vol.value / 100); paint(vol.value); });
        vol.addEventListener('change', () => { store.set('sv_volume', settings.volume); if (settings.sound) blip(660, 0.07, 'triangle'); });
    }
    if (tr) { tr.checked = settings.reduce; tr.addEventListener('change', () => { settings.reduce = tr.checked; store.set('sv_reduce', tr.checked); applyReduce(); blip(); }); }

    $('btn-copy-ip')?.addEventListener('click', () => {
        const ip = server?.ip || ''; navigator.clipboard?.writeText(ip);
        const b = $('btn-copy-ip'); const o = b.textContent; b.textContent = 'Copié ✓'; blip(760); setTimeout(() => b.textContent = o, 1500);
    });
    $('btn-discord2')?.addEventListener('click', () => window.electronAPI.openDiscord());
    $('btn-website')?.addEventListener('click', () => { if (config?.website) window.electronAPI.openExternal(config.website); });
    if (!config?.website && $('btn-website')) $('btn-website').style.display = 'none';

    setupPlanetTheme();
    apply3d(); applyReduce();
}

function setupPlanetTheme() {
    const select = $('planet-select');
    if (!select) return;
    const desired = settings.planet || config?.planet || 'terra';

    const fill = () => {
        if (!window.SpaceScene) return false;
        const themes = window.SpaceScene.themes();
        select.innerHTML = themes.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('');
        select.value = desired;
        window.SpaceScene.setTheme(desired);
        return true;
    };

    if (!fill()) {
        document.addEventListener('space-scene-ready', fill, { once: true });
    }

    select.addEventListener('change', () => {
        const val = select.value;
        settings.planet = val;
        store.set('sv_planet', val);
        window.__spaceTheme = val;
        window.SpaceScene?.setTheme(val);
        blip(600, 0.06, 'triangle');
    });
}
function apply3d() {
    document.body.classList.toggle('hide-3d', !settings.show3d);
    const cv = $('space3d'); if (cv) cv.style.display = settings.show3d ? 'block' : 'none';
    if (!settings.show3d) document.body.classList.remove('has-webgl');
    else if (document.body.dataset.webgl === '1') document.body.classList.add('has-webgl');
}
function applyReduce() { document.body.classList.toggle('reduce-anim', settings.reduce); }

/* ============================================================
   AUTO REFRESH + CACHE
   ============================================================ */
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(loadServerStatus, config?.autoRefreshInterval || AUTO_REFRESH_INTERVAL);
}

function setupCacheButtons() {
    const run = async (btn, msgEl) => {
        const label = btn.querySelector('*') ? null : null;
        const original = btn.textContent;
        btn.disabled = true; btn.textContent = 'Nettoyage...';
        if (msgEl) msgEl.textContent = '';
        try {
            const result = await window.electronAPI.clearFiveMCache();
            if (msgEl) { msgEl.textContent = result.message; msgEl.style.color = result.success ? 'var(--green)' : 'var(--red)'; }
            blip(result.success ? 680 : 240);
        } catch (e) {
            if (msgEl) { msgEl.textContent = 'Erreur lors du nettoyage.'; msgEl.style.color = 'var(--red)'; }
        } finally {
            btn.disabled = false; btn.textContent = original;
            setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 5000);
        }
    };
    // play-view button has icon+text; rebuild simpler handler preserving markup
    const b1 = $('clearCacheBtn');
    if (b1) b1.addEventListener('click', async () => {
        const msg = $('cacheMessage'); const inner = b1.innerHTML;
        b1.disabled = true; b1.textContent = 'Nettoyage...';
        try { const r = await window.electronAPI.clearFiveMCache(); if (msg) { msg.textContent = r.message; msg.style.color = r.success ? 'var(--green)' : 'var(--red)'; } blip(r.success ? 680 : 240); }
        catch { if (msg) { msg.textContent = 'Erreur lors du nettoyage.'; msg.style.color = 'var(--red)'; } }
        finally { b1.disabled = false; b1.innerHTML = inner; setTimeout(() => { if (msg) msg.textContent = ''; }, 5000); }
    });
    const b2 = $('clearCacheBtn2');
    if (b2) b2.addEventListener('click', () => run(b2, $('cacheMessage2')));
}

/* ============================================================
   JOIN + CINEMATIC
   ============================================================ */
async function joinServer() {
    const join = $('sv-join');
    if (!isOnline || !join || !config?.servers?.length) return;
    join.disabled = true;
    openCinematic();
    whoosh();

    try {
        const server = config.servers[currentServerIndex];
        const launchPromise = window.electronAPI.startFiveM(server.ip);
        await runCountdown();          // 3..2..1..DÉCOLLAGE
        setCine('CONNEXION', 'Ouverture du sas vers Space Verse...', 100);
        const result = await launchPromise;
        if (!result?.success) throw new Error(result?.error || 'Impossible de lancer FiveM.');

        setCine('EN ROUTE', 'Connexion transmise à FiveM. Fermeture...', 100);
        let countdown = 8;
        const interval = setInterval(() => {
            countdown -= 1;
            setCine('EN ROUTE', `Fermeture du launcher dans ${countdown}s`, 100);
            if (countdown <= 0) { clearInterval(interval); window.electronAPI.closeApp(); }
        }, 1000);
    } catch (error) {
        console.error('Erreur lancement FiveM :', error);
        closeCinematic();
        join.disabled = false;
        setLaunchState({ small: 'Prêt au décollage', strong: 'Rejoindre Space Verse', rocket: true });
        setLauncherMessage(error.message || 'Erreur lors du lancement de FiveM.');
    }
}

function setCine(title, sub, pct) {
    if ($('cine-title')) $('cine-title').textContent = title;
    if ($('cine-sub')) $('cine-sub').textContent = sub;
    if ($('cine-bar-fill') && pct != null) $('cine-bar-fill').style.width = `${pct}%`;
}
function openCinematic() {
    const c = $('launch-cinematic'); if (!c) return;
    c.classList.remove('hidden');
    $('cine-count').style.display = '';
    startWarp();
}
function closeCinematic() { const c = $('launch-cinematic'); if (c) c.classList.add('hidden'); stopWarp(); }

function runCountdown() {
    return new Promise((resolve) => {
        const el = $('cine-count'); let n = 3;
        setCine('SÉQUENCE DE DÉCOLLAGE', 'Allumage des propulseurs...', 25);
        const tick = () => {
            if (n > 0) {
                el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
                blip(300 + (3 - n) * 120, 0.12, 'square', 0.06);
                setCine('SÉQUENCE DE DÉCOLLAGE', 'Allumage des propulseurs...', 25 + (3 - n) * 22);
                n--; setTimeout(tick, 900);
            } else {
                el.textContent = '✦'; el.style.display = 'none';
                setCine('DÉCOLLAGE', 'Poussée maximale...', 92);
                resolve();
            }
        };
        tick();
    });
}

/* ---- warp streaks ---- */
let warpRAF = null;
function startWarp() {
    const cv = $('warp-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const cx = cv.width / 2, cy = cv.height / 2;
    let stars = Array.from({ length: 320 }, () => spawnWarp(cv));
    let speed = 1;
    const draw = () => {
        ctx.fillStyle = 'rgba(4,6,14,0.28)'; ctx.fillRect(0, 0, cv.width, cv.height);
        speed = Math.min(speed + 0.06, 14);
        for (const s of stars) {
            const px = s.x, py = s.y;
            s.x += (s.x - cx) * 0.015 * speed;
            s.y += (s.y - cy) * 0.015 * speed;
            const a = Math.min(1, s.z);
            ctx.strokeStyle = `rgba(${s.c},${a})`; ctx.lineWidth = s.w;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(s.x, s.y); ctx.stroke();
            if (s.x < -50 || s.x > cv.width + 50 || s.y < -50 || s.y > cv.height + 50) Object.assign(s, spawnWarp(cv));
        }
        warpRAF = requestAnimationFrame(draw);
    };
    draw();
}
function spawnWarp(cv) {
    const cx = cv.width / 2, cy = cv.height / 2;
    const cols = ['180,225,255', '140,190,255', '120,255,235', '200,180,255'];
    return { x: cx + (Math.random() - 0.5) * 120, y: cy + (Math.random() - 0.5) * 120, z: Math.random(), w: 0.6 + Math.random() * 1.8, c: cols[Math.floor(Math.random() * cols.length)] };
}
function stopWarp() { if (warpRAF) cancelAnimationFrame(warpRAF); warpRAF = null; }

/* ============================================================
   BOOT
   ============================================================ */
function runBootSequence() {
    const boot = $('boot'), logEl = $('boot-log'), fill = $('boot-bar-fill');
    if (!boot) return;
    if (prefersReduce) { boot.classList.add('done'); return; }
    const steps = ['Initialisation des systèmes...', 'Connexion au réseau orbital...', 'Calibrage des propulseurs...', 'Synchronisation Space Verse...', '<b>Prêt au décollage</b>'];
    let i = 0; const total = steps.length;
    const tick = () => {
        if (logEl) logEl.innerHTML = steps[i];
        if (fill) fill.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
        blip(480 + i * 60, 0.05, 'sine', 0.03);
        i++;
        if (i < total) setTimeout(tick, 420 + Math.random() * 200);
        else setTimeout(() => boot.classList.add('done'), 650);
    };
    setTimeout(tick, 350);
}

/* ============================================================
   AUTO-UPDATE UI
   ============================================================ */
function setupAutomaticUpdates() {
    if (!window.electronAPI?.onUpdateStatus) return;
    window.electronAPI.onUpdateStatus((update) => {
        const panel = $('update-progress'), fill = $('update-progress-fill'), percent = $('update-percent'), message = $('update-message');
        const updateStatus = $('update-status'), setUpd = $('set-update'), joinButton = $('sv-join');
        const setStatus = (text, cls) => {
            if (updateStatus) { updateStatus.textContent = text; updateStatus.className = `update-status ${cls || ''}`.trim(); }
            if (setUpd) { setUpd.textContent = text; setUpd.className = `set-update ${cls || ''}`.trim(); }
        };
        switch (update.state) {
            case 'checking': panel?.classList.add('hidden'); setStatus('Vérification...', ''); break;
            case 'available':
                panel?.classList.remove('hidden');
                if (message) message.textContent = `Réception de la version ${update.version || ''}...`;
                if (fill) fill.style.width = '0%'; if (percent) percent.textContent = '0%';
                setStatus(`Mise à jour ${update.version || ''}`, 'warn'); if (joinButton) joinButton.disabled = true; break;
            case 'downloading': {
                const p = Math.max(0, Math.min(100, Math.round(update.percent || 0)));
                panel?.classList.remove('hidden');
                if (fill) fill.style.width = `${p}%`; if (percent) percent.textContent = `${p}%`;
                if (message) message.textContent = 'Téléchargement de la mise à jour...';
                setStatus(`Mise à jour : ${p}%`, 'warn'); if (joinButton) joinButton.disabled = true; break;
            }
            case 'downloaded':
                panel?.classList.remove('hidden');
                if (fill) fill.style.width = '100%'; if (percent) percent.textContent = '100%';
                if (message) message.textContent = 'Installation et redémarrage...';
                setStatus('Installation...', 'warn'); if (joinButton) joinButton.disabled = true; break;
            case 'current': panel?.classList.add('hidden'); setStatus('✓ Launcher à jour', 'ok'); break;
            case 'error': panel?.classList.add('hidden'); setStatus('Version non vérifiée', 'err'); break;
            default: break;
        }
    });
}

/* ============================================================
   CURSOR HOVER SOUND
   ============================================================ */
function setupHoverSound() {
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.nav-item, .launch-button, .quick-btn, .mini-btn, .ghost-btn, .side-discord, .window-btn')) blip(640, 0.03, 'sine', 0.02);
    });
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    runBootSequence();
    setupAutomaticUpdates();
    initializeLauncher();
    setupHoverSound();

    // Ambient soundscape needs a user gesture to start; if the user already
    // enabled sound in a previous session, kick it off on their first click.
    if (settings.sound) {
        const kick = () => { ensureAudio(); startAmbient(); document.removeEventListener('pointerdown', kick); };
        document.addEventListener('pointerdown', kick, { once: true });
    }

    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

    $('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimizeApp());
    $('btn-refresh')?.addEventListener('click', () => { loadServerStatus(); if (document.querySelector('#view-players.active')) loadPlayers(); });
    $('btn-close')?.addEventListener('click', () => window.electronAPI.closeApp());
    $('btn-discord')?.addEventListener('click', () => window.electronAPI.openDiscord());
    $('btn-players-refresh')?.addEventListener('click', loadPlayers);
    $('sv-join')?.addEventListener('click', joinServer);

    // reflect webgl availability for the 3D toggle
    const obs = new MutationObserver(() => {
        if (document.body.classList.contains('has-webgl')) document.body.dataset.webgl = '1';
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

window.addEventListener('beforeunload', () => { if (autoRefreshInterval) clearInterval(autoRefreshInterval); });
