"use strict";
const RANGES = { Easy: [1, 30], Medium: [31, 60], Hard: [61, 90], Expert: [91, 120], Insane: [121, 150] };
const STAGES = [1, 3, 5, 8, 12, 15];          // seconds unlocked per attempt
const POINTS = [300, 250, 200, 150, 100, 50]; // points by attempt
const GIVE_UP_PENALTY = 50;
const $ = id => document.getElementById(id);
const S = {
  levels: [], names: [], manifest: {}, tier: "Easy", level: null, stage: 0, tries: [], start: 0,
  score: 0, streak: 0, guessed: 0, round: 0, playing: false, over: true, raf: 0,
  broken: new Set(), used: {}, matches: [], sel: -1
};
Object.keys(RANGES).forEach(t => (S.used[t] = new Set()));
const audio = $("audio"), input = $("guess");

const norm = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const asset = l => S.manifest[String(l.id)] || S.manifest[String(l.level_id)] || S.manifest[norm(l.name)] || {};
const audioUrl = l => asset(l).audioUrl || asset(l).audio || l.audioUrl || l.song?.url || "";
const imageUrl = l => asset(l).imageUrl || asset(l).image || l.imageUrl || l.thumbnail || "";
const startAt = l => Number(asset(l).startAt ?? asset(l).start ?? 0) || 0;
const pad = (n, w = 5) => String(n).padStart(w, "0");

function msg(t, c = "") { $("feedback").textContent = t; $("feedback").className = c; }

/* ---------- UI state ---------- */
function stats() {
  $("score").textContent = pad(S.score); $("streak").textContent = S.streak;
  $("guessed").textContent = S.guessed; $("round").textContent = `ROUND ${pad(S.round, 2)}`;
}
function renderTries() {
  const box = $("tries"); box.innerHTML = "";
  STAGES.forEach((_, i) => {
    const b = document.createElement("b"), t = S.tries[i];
    if (t) { b.textContent = t.skipped ? "SKIPPED" : t.text; b.className = t.skipped ? "skip" : "miss"; }
    else if (i === S.stage && !S.over) b.className = "cur";
    box.appendChild(b);
  });
}
function draw(el = 0) {
  const lim = STAGES[S.stage];
  $("seconds").textContent = pad(Math.floor(Math.max(0, Math.min(el, lim))), 2);
  $("limit").textContent = lim;
  $("progress").style.width = Math.min(el, lim) / STAGES[STAGES.length - 1] * 100 + "%";
  $("unlocked").style.width = lim / STAGES[STAGES.length - 1] * 100 + "%";
  $("audio-status").textContent = S.playing ? "NOW PLAYING" : "LISTEN & IDENTIFY";
}
function setControls() {
  const live = !!S.level && !S.over, last = S.stage >= STAGES.length - 1;
  $("play").textContent = S.playing ? "Ⅱ  PAUSE" : "▶  PLAY";
  $("play").disabled = !live;
  $("skiphint").disabled = !live || last;
  $("skiphint").textContent = last ? "NO MORE HINTS" : `SKIP +${STAGES[S.stage + 1] - STAGES[S.stage]}s`;
  input.disabled = !live; $("submit").disabled = !live; $("skip").disabled = !live;
  $("vinyl").classList.toggle("spinning", S.playing);
  if (!live) hideSuggest();
}

/* ---------- audio (clip is limited to the unlocked stage) ---------- */
function tick() {
  if (!S.playing) return;
  const el = audio.currentTime - S.start;
  if (el >= STAGES[S.stage]) { pause(true); return; }
  draw(el); S.raf = requestAnimationFrame(tick);
}
function pause(reset) {
  cancelAnimationFrame(S.raf); audio.pause(); S.playing = false;
  if (reset && S.level) audio.currentTime = S.start;
  draw(reset ? 0 : audio.currentTime - S.start); setControls();
}
async function play() {
  if (!S.level || S.over) return;
  if (S.playing) { pause(false); return; }
  if (audio.currentTime < S.start || audio.currentTime - S.start >= STAGES[S.stage] - 0.05) audio.currentTime = S.start;
  try { await audio.play(); }
  catch (e) {
    S.playing = false; setControls();
    if (e.name === "NotAllowedError") msg("Press PLAY to start the audio.");
    else if (e.name !== "AbortError") msg("This audio cannot be played. Check its URL in manifest.json.", "bad");
    return;
  }
  S.playing = true; setControls(); cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick);
}
audio.addEventListener("ended", () => pause(true));
audio.addEventListener("error", () => {
  if (!S.level || !audio.getAttribute("src") || S.over) return;
  S.broken.add(String(S.level.id));
  msg("Audio for this level failed to load. Loading another level…", "bad");
  setTimeout(() => nextRound(false), 900);
});

/* ---------- rounds ---------- */
function pool(tier) { const [a, b] = RANGES[tier]; return S.levels.filter(x => x.position >= a && x.position <= b && audioUrl(x)); }
function updateTierBadges() {
  document.querySelectorAll(".tier").forEach(btn => {
    const [a, b] = RANGES[btn.dataset.tier], n = pool(btn.dataset.tier).filter(x => !S.broken.has(String(x.id))).length;
    btn.querySelector("small").textContent = `#${a}–${b} · ${n}/${b - a + 1}`;
    btn.classList.toggle("empty", n === 0);
  });
}
function endState(text, cls) {
  pause(true); S.level = null; S.over = true; S.tries = [];
  audio.removeAttribute("src"); audio.load(); draw(0); renderTries(); setControls(); msg(text, cls);
}
function nextRound(autoplay) {
  pause(false); S.matches = [];
  const [a, b] = RANGES[S.tier], all = pool(S.tier).filter(x => !S.broken.has(String(x.id)));
  $("rank").textContent = `${S.tier.toUpperCase()} · #${a}–${b}`;
  if (!all.length) return endState(`No playable ${S.tier} levels yet. Add audio URLs in data/manifest.json.`, "bad");
  let free = all.filter(x => !S.used[S.tier].has(String(x.id)));
  if (!free.length) {
    S.used[S.tier].clear();
    return endState(`${S.tier} complete — all ${all.length} playable levels done. Click the tier to play again.`, "good");
  }
  S.level = free[Math.floor(Math.random() * free.length)];
  S.over = false; S.stage = 0; S.tries = []; S.start = startAt(S.level); S.round++;
  audio.src = audioUrl(S.level); audio.load();
  input.value = ""; draw(0); renderTries(); setControls(); stats();
  msg(`${free.length} unplayed level(s) left in ${S.tier}. Press PLAY to hear the first second.`);
  const g = $("game"); g.classList.remove("round-enter"); void g.offsetWidth; g.classList.add("round-enter");
  if (autoplay) play(); // called inside a click handler, so browsers allow it; falls back to the PLAY button
}
function chooseTier(t, autoplay = true) {
  S.tier = t;
  document.querySelectorAll(".tier").forEach(x => x.classList.toggle("active", x.dataset.tier === t));
  nextRound(autoplay);
}

/* ---------- guessing ---------- */
function nextStage() { S.stage = Math.min(S.stage + 1, STAGES.length - 1); draw(S.playing ? audio.currentTime - S.start : 0); renderTries(); setControls(); }
function submitGuess() {
  if (!S.level || S.over) return;
  const raw = input.value.trim();
  if (!raw) { msg("Type a level name first.", "bad"); input.focus(); return; }
  const hit = S.names.find(n => norm(n) === norm(raw));
  if (!hit) { msg("Pick a level from the list. Unknown names don't cost an attempt.", "bad"); suggest(); return; }
  hideSuggest();
  if (norm(hit) === norm(S.level.name)) { // compare by name: Pointercrate has two levels called "Thinking Space II"
    const pts = POINTS[S.stage];
    S.score += pts; S.streak++; S.guessed++; S.used[S.tier].add(String(S.level.id));
    return reveal("win", pts);
  }
  S.tries[S.stage] = { text: hit };
  input.value = "";
  const shake = () => { input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake"); };
  if (S.stage >= STAGES.length - 1) { S.streak = 0; S.used[S.tier].add(String(S.level.id)); return reveal("lose", 0); }
  nextStage(); shake();
  msg(`Not "${hit}". Clip extended to ${STAGES[S.stage]} sec. Hit PLAY.`, "bad"); input.focus();
}
function skipHint() {
  if (!S.level || S.over || S.stage >= STAGES.length - 1) return;
  S.tries[S.stage] = { skipped: true }; nextStage();
  msg(`Clip extended to ${STAGES[S.stage]} sec. Max reward is now ${POINTS[S.stage]} PTS.`);
}
function giveUp() {
  if (!S.level || S.over) return;
  S.used[S.tier].add(String(S.level.id)); S.score = Math.max(0, S.score - GIVE_UP_PENALTY); S.streak = 0;
  reveal("skip", -GIVE_UP_PENALTY);
}

/* ---------- autocomplete dropdown ---------- */
function hideSuggest() { $("suggestions").classList.remove("show"); S.sel = -1; input.setAttribute("aria-expanded", "false"); }
function renderSuggest() {
  const box = $("suggestions"); box.innerHTML = "";
  if (!S.matches.length) {
    const d = document.createElement("div"); d.className = "suggestion none"; d.textContent = "No level matches";
    box.appendChild(d);
  }
  S.matches.forEach((n, i) => {
    const d = document.createElement("div"), l = S.levels.find(x => x.name === n);
    d.className = "suggestion" + (i === S.sel ? " active" : ""); d.setAttribute("role", "option");
    d.textContent = n;
    d.addEventListener("pointerdown", e => { e.preventDefault(); pick(n); });
    box.appendChild(d);
  });
  box.classList.add("show"); input.setAttribute("aria-expanded", "true");
}
function suggest() {
  const q = norm(input.value);
  if (!q || input.disabled) return hideSuggest();
  const starts = [], has = [];
  S.names.forEach(n => { const k = norm(n); if (k.startsWith(q)) starts.push(n); else if (k.includes(q)) has.push(n); });
  S.matches = starts.concat(has).slice(0, 8); S.sel = -1; renderSuggest();
}
function pick(n) { input.value = n; hideSuggest(); input.focus(); msg("Level selected. Press GUESS to lock it in."); }
input.addEventListener("input", suggest);
input.addEventListener("focus", suggest);
input.addEventListener("keydown", e => {
  const open = $("suggestions").classList.contains("show") && S.matches.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!open) return; e.preventDefault();
    S.sel = (S.sel + (e.key === "ArrowDown" ? 1 : -1) + S.matches.length) % S.matches.length; renderSuggest();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (open && S.sel >= 0) pick(S.matches[S.sel]); else submitGuess();
  } else if (e.key === "Escape") hideSuggest();
});
document.addEventListener("pointerdown", e => { if (!e.target.closest(".search")) hideSuggest(); });

/* ---------- reveal modal ---------- */
function burst() {
  const host = $("celebration"); host.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--x", `${Math.random() * 100}%`); p.style.setProperty("--delay", `${Math.random() * 260}ms`);
    p.style.setProperty("--spin", `${Math.random() * 540 - 270}deg`); host.appendChild(p);
  }
  host.classList.remove("fire"); void host.offsetWidth; host.classList.add("fire");
}
function reveal(kind, pts) {
  pause(true); S.over = true; setControls(); renderTries(); stats();
  const l = S.level, img = imageUrl(l), art = $("art");
  art.classList.remove("visible"); $("fallback").style.display = "grid";
  art.onload = () => { art.classList.add("visible"); $("fallback").style.display = "none"; };
  art.onerror = () => { art.classList.remove("visible"); $("fallback").style.display = "grid"; };
  if (img) art.src = img; else art.removeAttribute("src");
  $("result").classList.toggle("correct", kind === "win");
  $("result-kicker").textContent = { win: "★ LEVEL IDENTIFIED", lose: "OUT OF ATTEMPTS", skip: "ROUND SKIPPED" }[kind];
  $("result-rank").textContent = `POINTERCRATE #${l.position}`;
  $("result-name").textContent = l.name;
  $("result-meta").textContent = [l.verifier && `Verified by ${l.verifier}`, l.publisher && `Published by ${l.publisher}`,
    l.creators?.length && `Creators: ${l.creators.join(", ")}`].filter(Boolean).join(" · ") || "Top 150 Extreme Demon";
  $("result-time").textContent = kind === "win" ? `${STAGES[S.stage]} SEC · TRY ${S.stage + 1}/${STAGES.length}` : "—";
  $("result-points").textContent = `${pts >= 0 ? "+" : "−"}${Math.abs(pts)} PTS`;
  $("result-total").textContent = pad(S.score);
  $("modal").classList.add("open"); $("modal").setAttribute("aria-hidden", "false");
  $("next").focus(); if (kind === "win") burst();
}
function closeModal() {
  if (!$("modal").classList.contains("open")) return;
  $("modal").classList.remove("open"); $("modal").setAttribute("aria-hidden", "true");
  nextRound(true);
}

/* ---------- wiring + boot ---------- */
document.querySelectorAll(".tier").forEach(b => (b.onclick = () => chooseTier(b.dataset.tier)));
$("play").onclick = play; $("skiphint").onclick = skipHint; $("submit").onclick = submitGuess; $("skip").onclick = giveUp;
$("close").onclick = closeModal; $("next").onclick = closeModal;
$("modal").onclick = e => { if (e.target === $("modal")) closeModal(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

(async () => {
  try {
    const [a, b] = await Promise.all([fetch("data/levels.json", { cache: "no-store" }), fetch("data/manifest.json", { cache: "no-store" })]);
    if (!a.ok) throw Error("Missing levels.json");
    const data = await a.json();
    S.manifest = b.ok ? await b.json() : {};
    S.levels = (Array.isArray(data) ? data : data.levels || []).filter(x => x.position >= 1 && x.position <= 150)
      .sort((x, y) => x.position - y.position);
    const seen = new Set(); // dropdown lists every level name once (all 150, not just the ones with audio)
    S.names = S.levels.map(x => x.name).filter(n => !seen.has(norm(n)) && seen.add(norm(n)));
    const ready = S.levels.filter(audioUrl).length;
    $("db-status").textContent = `${S.levels.length} / 150 LEVELS · ${ready} WITH AUDIO`;
    $("sync-label").textContent = "DATABASE READY";
    if (!S.levels.length) { msg("No Pointercrate data yet. Run the GitHub Actions sync workflow.", "bad"); return; }
    updateTierBadges(); chooseTier("Easy", false);
  } catch (e) {
    $("db-status").textContent = "DATABASE LOAD ERROR";
    msg("Could not load the database. Open the site through a local web server (npx serve .), not file://.", "bad");
    console.error(e);
  }
})();
