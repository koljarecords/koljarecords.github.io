// kolja.com.br: the record plays Kölja Records releases (YouTube player, shown while playing);
// the games list shows a picture of the game under the cursor.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover)").matches;
  const svgNS = "http://www.w3.org/2000/svg";

  // ---- geometry (deck viewBox 0..1000; record centre 500,500, radius 500) ----
  const C = { x: 500, y: 500 }, PIVOT = { x: 960, y: 60 }, ARM = 600;
  const GROOVE_OUT = 472, GROOVE_IN = 214, LABEL_R = 165, REST_R = 560;
  function angleFor(r) {
    const px = PIVOT.x - C.x, py = PIVOT.y - C.y, d = Math.hypot(px, py), aP = Math.atan2(py, px);
    const k = (r * r - d * d - ARM * ARM) / (2 * ARM);
    return (aP + Math.acos(Math.max(-1, Math.min(1, k / d)))) * 180 / Math.PI;
  }

  const music = document.querySelector(".music");
  const list = document.querySelector(".tracks");
  const bandsSvg = document.querySelector(".bands");
  const label = document.querySelector(".label");
  const labelArt = label.querySelector(".label__art");
  const ringPath = label.querySelector("textPath");
  const DEFAULT_RING = ringPath.textContent;
  const playerEl = document.querySelector(".player");
  const titleEl = playerEl.querySelector(".player__title");
  const artistEl = playerEl.querySelector(".player__artist");
  const timeEl = playerEl.querySelector(".player__time");
  const hintEl = playerEl.querySelector(".player__hint");
  const toggleBtn = playerEl.querySelector('[data-act="toggle"]');

  let tracks = [];
  let current = -1, playing = false, cued = -1, player = null, api = null, startTimer = 0, uncueTimer = 0;

  // ---- grooves: one band per track ----
  function ring(r, cls, width) {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", 500); c.setAttribute("cy", 500); c.setAttribute("r", r); c.setAttribute("class", cls);
    if (width) c.setAttribute("stroke-width", width);
    bandsSvg.appendChild(c);
    return c;
  }
  function buildBands() {
    bandsSvg.textContent = "";
    ring((500 + GROOVE_OUT + 4) / 2, "smooth", 500 - GROOVE_OUT - 4);
    ring((GROOVE_IN + LABEL_R) / 2, "smooth", GROOVE_IN - LABEL_R);
    const w = tracks.map((_, i) => .85 + ((i * 7) % 4) * .1), total = w.reduce((s, x) => s + x, 0);
    const GAP = tracks.length > 8 ? 5 : 7, usable = GROOVE_OUT - GROOVE_IN - GAP * (w.length - 1);
    let outer = GROOVE_OUT;
    tracks.forEach((t, i) => {
      const width = usable * w[i] / total, inner = outer - width;
      t.band = { outer, inner, hi: ring((outer + inner) / 2, "band-hi", width) };
      if (i < tracks.length - 1) { ring(inner - GAP / 2, "gap", GAP); ring(inner - GAP + .5, "gap-edge"); }
      outer = inner - GAP;
    });
    ring(GROOVE_OUT + 2, "gap-edge"); ring(GROOVE_IN - 1, "gap-edge");
  }

  // ---- tonearm ----
  const armBody = document.querySelector(".arm__body"), armShadow = document.querySelector(".arm__shadow");
  const REST = angleFor(REST_R), restRad = REST * Math.PI / 180;
  document.querySelector(".arm__rest").setAttribute("transform", `translate(${PIVOT.x + Math.cos(restRad) * 360} ${PIVOT.y + Math.sin(restRad) * 360})`);
  const arm = { angle: reduce ? REST : REST - 26, target: REST, lift: 1, liftTarget: 1 };
  let raf = 0, last = 0;
  function drawArm() {
    armBody.setAttribute("transform", `translate(${PIVOT.x} ${PIVOT.y}) rotate(${arm.angle})`);
    const off = 8 + 16 * arm.lift;
    armShadow.setAttribute("transform", `translate(${PIVOT.x + off * .7} ${PIVOT.y + off}) rotate(${arm.angle})`);
    armShadow.style.opacity = .55 - .25 * arm.lift;
  }
  function tick(t) {
    const dt = Math.min(.05, (t - (last || t)) / 1000); last = t;
    arm.angle += (arm.target - arm.angle) * (1 - Math.exp(-dt * 7));
    arm.lift += (arm.liftTarget - arm.lift) * (1 - Math.exp(-dt * 9));
    drawArm();
    if (Math.abs(arm.target - arm.angle) > .01 || Math.abs(arm.liftTarget - arm.lift) > .005) raf = requestAnimationFrame(tick);
    else { raf = 0; last = 0; }
  }
  function moveArm(angle, lifted) {
    arm.target = angle; arm.liftTarget = lifted ? 1 : 0;
    if (reduce) { arm.angle = angle; arm.lift = arm.liftTarget; drawArm(); return; }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  drawArm();
  setTimeout(() => moveArm(REST, true), reduce ? 0 : 500);

  // ---- spin: slow drift, 33⅓ while playing ----
  let spins = [];
  function spinRate(to) {
    if (reduce) return;
    if (!spins.length) spins = document.querySelector(".spin").getAnimations();
    const from = spins[0] ? spins[0].playbackRate : 1, t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3);
      spins.forEach(a => { a.playbackRate = from + (to - from) * e; });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- label ----
  const thumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  function showLabel(t) {
    if (!t) { label.classList.remove("has-art"); ringPath.textContent = DEFAULT_RING; return; }
    if (labelArt.dataset.id !== t.id) { labelArt.src = thumb(t.id); labelArt.dataset.id = t.id; }
    label.classList.add("has-art");
    const base = `${t.title} · ${t.artist} ·`.toUpperCase();
    let text = base;
    while (text.length < 40) text += " " + base;
    ringPath.textContent = text;
  }

  // ---- where the needle should be ----
  function progress() {
    if (!player || !player.getDuration) return 0;
    const d = player.getDuration() || 0, t = player.getCurrentTime() || 0;
    return d ? Math.min(1, t / d) : 0;
  }
  function settle() {
    if (cued >= 0) return;
    if (current >= 0) {
      const b = tracks[current].band;
      const r = b.outer - 4 - (b.outer - 4 - (b.inner + 3)) * progress();
      moveArm(angleFor(r), !playing);
      showLabel(tracks[current]);
    } else { moveArm(REST, true); showLabel(null); }
    tracks.forEach((t, i) => t.band.hi.classList.toggle("is-on", i === current));
  }

  // ---- hovering a row cues the arm over its groove ----
  function cue(i) {
    clearTimeout(uncueTimer);
    cued = i;
    tracks.forEach((t, j) => { t.band.hi.classList.toggle("is-on", j === i || j === current); t.row.classList.toggle("is-cued", j === i); });
    showLabel(tracks[i]);
    if (!playing) moveArm(angleFor(tracks[i].band.outer - 7), true);
  }
  function uncue(delay = 200) {
    clearTimeout(uncueTimer);
    uncueTimer = setTimeout(() => { cued = -1; tracks.forEach(t => t.row.classList.remove("is-cued")); settle(); }, delay);
  }

  // ---- YouTube ----
  function loadApi() {
    if (api) return api;
    api = new Promise(resolve => {
      if (window.YT && window.YT.Player) return resolve(true);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(true); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    return api;
  }
  music.addEventListener("pointerenter", loadApi, { once: true });
  list.addEventListener("focusin", loadApi, { once: true });

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function hint(html) { if (html) { hintEl.innerHTML = html; hintEl.hidden = false; } else hintEl.hidden = true; }
  function watchLink(t) { return `<a href="https://www.youtube.com/watch?v=${t.id}" target="_blank" rel="noopener">Watch on YouTube ↗</a>`; }

  function setPlaying(on) {
    playing = on;
    playerEl.classList.toggle("is-playing", on);
    toggleBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    tracks.forEach((t, i) => {
      t.row.classList.toggle("is-current", i === current);
      t.row.classList.toggle("is-playing", i === current && on);
      t.row.setAttribute("aria-label", `${i === current && on ? "Pause" : "Play"} ${t.title} by ${t.artist}`);
      if (i === current) t.row.setAttribute("aria-current", "true"); else t.row.removeAttribute("aria-current");
    });
    if (on) { hint(null); clearTimeout(startTimer); }
    spinRate(on ? 30 / 1.8 : 1);
    settle();
  }

  // The frame is created inside the click itself (so the browser counts the gesture), then the
  // YouTube API attaches to it once both the API and the frame have loaded.
  let frame = null, frameLoaded = false;
  const embedUrl = id => `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}`;
  function attach() {
    if (player || !frameLoaded || !window.YT || !window.YT.Player) return;
    player = new YT.Player(frame, {
      events: {
        onReady: e => { if (!playing) { try { e.target.playVideo(); } catch (_) {} } },
        onStateChange: e => {
          if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
          else if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
          else if (e.data === YT.PlayerState.ENDED) next(true);
        },
        onError: () => { setPlaying(false); hint(`This one only plays on YouTube. ${watchLink(tracks[current])}`); },
      },
    });
    setInterval(() => {
      if (!player || !player.getCurrentTime) return;
      const d = player.getDuration() || 0, s = player.getCurrentTime() || 0;
      timeEl.textContent = d ? `${fmt(s)} / ${fmt(d)}` : fmt(s);
      if (playing) settle();
    }, 250);
  }
  function pick(i) {
    if (i === current && frame) return toggle();
    current = i;
    const t = tracks[i];
    playerEl.hidden = false; music.classList.add("has-player");
    titleEl.textContent = t.title; artistEl.textContent = t.artist; timeEl.textContent = "0:00";
    hint(null);
    setPlaying(false);
    moveArm(angleFor(t.band.outer - 4), false);   // the needle drops at the start of the track
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = "YouTube video player";
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.src = embedUrl(t.id);
      frame.addEventListener("load", () => { frameLoaded = true; attach(); }, { once: true });
      document.getElementById("yt-player").replaceWith(frame);
      loadApi().then(ok => { if (ok) attach(); else hint(`The player could not load. ${watchLink(t)}`); });
    } else if (player && player.loadVideoById) {
      player.loadVideoById(t.id);
    } else {
      frame.src = embedUrl(t.id);
    }
    clearTimeout(startTimer);
    startTimer = setTimeout(() => { if (!playing && current === i) hint("Press play on the video to start."); }, 3500);
  }
  function toggle() {
    if (!frame) return pick(current < 0 ? 0 : current);
    if (!player) return;
    if (playing) player.pauseVideo(); else player.playVideo();
  }
  function next(auto) {
    if (current < tracks.length - 1) return pick(current + 1);
    if (auto) { setPlaying(false); }
  }
  function prev() {
    if (player && player.getCurrentTime && player.getCurrentTime() > 3) { player.seekTo(0, true); return; }
    if (current > 0) pick(current - 1);
  }
  playerEl.querySelector('[data-act="toggle"]').addEventListener("click", toggle);
  playerEl.querySelector('[data-act="next"]').addEventListener("click", () => next(false));
  playerEl.querySelector('[data-act="prev"]').addEventListener("click", prev);

  // ---- rows ----
  function wire() {
    tracks = [...list.querySelectorAll(".track")].map((row, i) => ({
      i, row, id: row.dataset.id, title: row.dataset.title, artist: row.dataset.artist,
    }));
    buildBands();
    tracks.forEach((t, i) => {
      t.row.setAttribute("aria-label", `Play ${t.title} by ${t.artist}`);
      t.row.addEventListener("mouseenter", () => cue(i));
      t.row.addEventListener("focus", () => cue(i));
      t.row.addEventListener("mouseleave", () => uncue());
      t.row.addEventListener("blur", () => uncue(60));
      t.row.addEventListener("click", () => pick(i));
    });
  }
  wire();

  // ---- the record itself: click to play or pause ----
  const disc = document.querySelector(".disc"), deck = document.querySelector(".deck"), tag = document.querySelector(".deck__tag");
  const onRecord = e => { const r = disc.getBoundingClientRect(); return Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) <= r.width / 2; };
  disc.addEventListener("click", e => { if (onRecord(e)) toggle(); });
  if (canHover) {
    disc.addEventListener("mousemove", e => {
      const r = deck.getBoundingClientRect(), on = onRecord(e);
      tag.textContent = playing ? "Pause" : "Play";
      tag.classList.toggle("is-on", on);
      tag.style.setProperty("--tx", `${e.clientX - r.left + 16}px`); tag.style.setProperty("--ty", `${e.clientY - r.top + 18}px`);
    });
    disc.addEventListener("mouseleave", () => tag.classList.remove("is-on"));
  }

  // ---- keep the tracklist in step with the label's own data (featured, newest first) ----
  const ytId = url => { const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(url || ""); return m ? m[1] : null; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("records/", { cache: "no-cache" }).then(r => r.ok ? r.text() : Promise.reject(r.status)).then(html => {
    const node = new DOMParser().parseFromString(html, "text/html").getElementById("kolja-public-data");
    const data = JSON.parse(node.textContent);
    const rel = (data.releases || []).filter(r => r.published !== false && ytId(r.mediaUrl))
      .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || String(b.number).localeCompare(String(a.number)));
    let pickList = rel.filter(r => r.featured);
    if (pickList.length < 4) pickList = pickList.concat(rel.filter(r => !r.featured)).slice(0, 8);
    pickList = pickList.slice(0, 8);
    if (!pickList.length || current >= 0) return;
    const ids = pickList.map(r => ytId(r.mediaUrl)).join(), now = tracks.map(t => t.id).join();
    if (ids === now) return;
    list.innerHTML = pickList.map((r, i) => `<li><button class="track" type="button" data-id="${ytId(r.mediaUrl)}" data-title="${esc(r.title)}" data-artist="${esc(r.artist)}"><span class="track__no">${i + 1}</span><span class="track__main"><span class="track__title">${esc(r.title)}${r.advisory ? ' <abbr class="track__adv" title="Explicit">E</abbr>' : ""}</span><span class="track__by">${esc(r.artist)}</span></span><span class="track__state" aria-hidden="true"></span><span class="track__meta">${esc(r.catalog || "")}</span></button></li>`).join("");
    wire();
    settle();
  }).catch(() => { /* the static list stays */ });

  // ---- games: a picture of the game follows the cursor ----
  const preview = document.querySelector(".games__preview");
  if (canHover && preview) {
    const place = e => {
      const w = preview.offsetWidth || 320, h = preview.offsetHeight || 213;
      let x = e.clientX + 32; if (x + w > innerWidth - 16) x = e.clientX - w - 32;
      const y = Math.max(16, Math.min(innerHeight - h - 16, e.clientY - h / 2));
      preview.style.setProperty("--px", `${x}px`); preview.style.setProperty("--py", `${y}px`);
    };
    document.querySelectorAll(".game").forEach(g => {
      g.addEventListener("mouseenter", e => { preview.src = g.dataset.preview; place(e); preview.classList.add("is-on"); });
      g.addEventListener("mousemove", place);
      g.addEventListener("mouseleave", () => preview.classList.remove("is-on"));
    });
    addEventListener("scroll", () => preview.classList.remove("is-on"), { passive: true });
  }
})();
