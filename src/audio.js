// ===== audio.js : WebAudio music and sfx, no assets. Volume and mute are remembered. =====
const AUDIO = (() => {
  let ac = null, master = null, musicBus = null, sfxBus = null, timer = null, nextBar = 0, mood = 'calm', bar = 0;
  const S = { muted: false, music: 0.5, sfx: 0.7, started: false };
  try { const j = JSON.parse(localStorage.getItem('ts_audio') || 'null'); if (j) Object.assign(S, j, { started: false }); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem('ts_audio', JSON.stringify({ muted: S.muted, music: S.music, sfx: S.sfx })); } catch (e) { /* ignore */ } };
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function apply() { if (!ac) return; master.gain.setTargetAtTime(S.muted ? 0 : 1, ac.currentTime, 0.03); musicBus.gain.setTargetAtTime(S.music * 0.35, ac.currentTime, 0.05); sfxBus.gain.setTargetAtTime(S.sfx * 0.6, ac.currentTime, 0.05); }
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain(); musicBus = ac.createGain(); sfxBus = ac.createGain();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    musicBus.connect(lp); sfxBus.connect(lp); lp.connect(master); master.connect(ac.destination); apply();
    S.started = true; nextBar = ac.currentTime + 0.1; timer = setInterval(schedule, 250);
  }
  function tone(t, f, dur, type, vol, bus, attack, rel, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (rel || 0.05));
    o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + dur + (rel || 0.05) + 0.05);
  }
  function noise(t, dur, vol, fq, q, bus) {
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq || 1200; f.Q.value = q || 0.8; const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t);
  }
  // music: slow minor progression. night is lower and sparser, alert adds a pulse.
  const PROG = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]];
  const SCALE = [57, 60, 62, 64, 67, 69, 72];
  function schedule() {
    if (!ac || S.muted && S.music <= 0) return;
    while (nextBar < ac.currentTime + 1.2) {
      const spb = mood === 'alert' ? 2.4 : mood === 'night' ? 4.4 : 3.6, t = nextBar, ch = PROG[bar % 4].map(n => n + (mood === 'night' ? -5 : 0));
      ch.forEach((n, i) => tone(t + i * 0.04, hz(n), spb * 1.05, i === 0 ? 'triangle' : 'sine', i === 0 ? 0.5 : 0.22, musicBus, spb * 0.35, spb * 0.5));
      const notes = mood === 'night' ? 2 : mood === 'alert' ? 6 : 4;
      for (let i = 0; i < notes; i++) if (Math.random() < (mood === 'night' ? 0.6 : 0.75)) { const n = SCALE[Math.floor(Math.random() * SCALE.length)] + (mood === 'night' ? -12 : 0); tone(t + (i + Math.random() * 0.4) * spb / notes, hz(n), 0.9, 'triangle', 0.16, musicBus, 0.01, 0.6); }
      if (mood === 'alert') for (let i = 0; i < 8; i++) tone(t + i * spb / 8, hz(ch[0] - 12), 0.18, 'square', i % 2 ? 0.12 : 0.22, musicBus, 0.005, 0.08);
      nextBar += spb; bar++;
    }
  }
  const SFX = {
    step: t => noise(t, 0.07, 0.35, 700, 1.2), sneak: t => noise(t, 0.05, 0.12, 500, 1.2), run: t => { noise(t, 0.06, 0.4, 900, 1); noise(t + 0.09, 0.06, 0.4, 900, 1); noise(t + 0.18, 0.06, 0.4, 900, 1); },
    loot: t => { noise(t, 0.18, 0.3, 2500, 0.6); noise(t + 0.12, 0.1, 0.2, 3500, 0.6); }, coin: t => { tone(t, hz(88), 0.12, 'square', 0.18); tone(t + 0.08, hz(95), 0.25, 'square', 0.18); },
    click: t => { tone(t, hz(96), 0.03, 'square', 0.2); tone(t + 0.07, hz(84), 0.03, 'square', 0.2); }, lock: t => { for (let i = 0; i < 3; i++) tone(t + i * 0.09, hz(90 + i), 0.03, 'square', 0.18); tone(t + 0.35, hz(70), 0.1, 'square', 0.2); },
    hit: t => { noise(t, 0.12, 0.7, 300, 0.7); tone(t, 110, 0.14, 'sine', 0.5, sfxBus, 0.005, 0.05, 50); }, shot: t => { noise(t, 0.35, 1, 1400, 0.4); tone(t, 160, 0.3, 'sine', 0.7, sfxBus, 0.002, 0.1, 40); },
    alarm: t => { for (let i = 0; i < 6; i++) tone(t + i * 0.28, hz(i % 2 ? 76 : 83), 0.26, 'sawtooth', 0.22); }, siren: t => { tone(t, 500, 0.9, 'sawtooth', 0.2, sfxBus, 0.05, 0.1, 900); tone(t + 0.9, 900, 0.9, 'sawtooth', 0.2, sfxBus, 0.05, 0.1, 500); },
    bad: t => { tone(t, hz(57), 0.25, 'sawtooth', 0.25); tone(t + 0.2, hz(53), 0.4, 'sawtooth', 0.25); }, warn: t => { tone(t, hz(76), 0.15, 'triangle', 0.3); tone(t + 0.15, hz(76), 0.2, 'triangle', 0.3); },
    good: t => { tone(t, hz(72), 0.12, 'triangle', 0.3); tone(t + 0.1, hz(79), 0.25, 'triangle', 0.3); }, ui: t => tone(t, hz(84), 0.05, 'triangle', 0.18), hide: t => noise(t, 0.3, 0.2, 400, 0.5),
    strike: t => { tone(t, 90, 0.5, 'sawtooth', 0.4, sfxBus, 0.01, 0.2, 45); noise(t, 0.2, 0.6, 250, 0.6); }, wake: t => { tone(t, hz(64), 0.3, 'sine', 0.3); tone(t + 0.25, hz(71), 0.5, 'sine', 0.3); },
    win: t => [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.14, hz(n), 0.4, 'triangle', 0.3)), lose: t => [64, 60, 57, 52].forEach((n, i) => tone(t + i * 0.25, hz(n), 0.6, 'sawtooth', 0.22)),
  };
  return {
    state: S, init,
    sfx(name) { if (!ac || !SFX[name]) return; try { SFX[name](ac.currentTime + 0.01); } catch (e) { /* ignore */ } },
    setMood(m) { mood = m; },
    setMuted(v) { S.muted = !!v; apply(); save(); }, setMusic(v) { S.music = v; apply(); save(); }, setSfx(v) { S.sfx = v; apply(); save(); },
  };
})();
