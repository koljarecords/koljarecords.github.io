// Salt Meridian page: the title theme, the film tabs, the gallery lightbox, a solid bar on scroll.
(() => {
  const bar = document.querySelector(".bar");
  const onScroll = () => bar.classList.toggle("is-solid", window.scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- title theme: one <audio>, two buttons (bar + card) ----
  const audio = document.getElementById("theme");
  const toggles = document.querySelectorAll("[data-theme-toggle]");
  const progress = document.querySelector("[data-progress]");
  const seek = document.querySelector("[data-seek]");
  const time = document.querySelector("[data-time]");
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let fade;

  const setPressed = (on) => toggles.forEach((b) => {
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector(".theme-btn__text");
    if (label) label.textContent = on ? "Pause the theme" : "Play the theme";
  });
  // the game fades its theme in softly; so does the page
  const fadeTo = (target, ms, done) => {
    clearInterval(fade);
    const start = audio.volume, t0 = performance.now();
    fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = start + (target - start) * k;
      if (k >= 1) { clearInterval(fade); done && done(); }
    }, 30);
  };
  toggles.forEach((b) => b.addEventListener("click", () => {
    if (audio.paused) {
      audio.volume = 0;
      audio.play().then(() => fadeTo(0.8, 1800)).catch(() => {});
    } else {
      fadeTo(0, 500, () => audio.pause());
    }
  }));
  audio.addEventListener("play", () => setPressed(true));
  audio.addEventListener("pause", () => setPressed(false));
  audio.addEventListener("ended", () => setPressed(false));
  audio.addEventListener("timeupdate", () => {
    const d = audio.duration || 151.6;
    const pct = (audio.currentTime / d) * 100;
    progress.style.width = pct + "%";
    seek.setAttribute("aria-valuenow", Math.round(pct));
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(d)}`;
  });
  const seekTo = (frac) => {
    const d = audio.duration || 151.6;
    audio.currentTime = Math.max(0, Math.min(1, frac)) * d;
  };
  seek.addEventListener("click", (e) => {
    const r = seek.getBoundingClientRect();
    seekTo((e.clientX - r.left) / r.width);
  });
  seek.addEventListener("keydown", (e) => {
    const d = audio.duration || 151.6;
    if (e.key === "ArrowRight") { seekTo((audio.currentTime + 5) / d); e.preventDefault(); }
    if (e.key === "ArrowLeft") { seekTo((audio.currentTime - 5) / d); e.preventDefault(); }
  });

  // ---- film tabs ----
  const video = document.getElementById("film-video");
  const caption = document.getElementById("film-caption");
  const tabs = document.querySelectorAll(".tabs [role=tab]");
  tabs.forEach((t) => t.addEventListener("click", () => {
    if (t.getAttribute("aria-selected") === "true") return;
    tabs.forEach((o) => o.setAttribute("aria-selected", String(o === t)));
    video.pause();
    video.poster = t.dataset.poster;
    video.querySelector("source").src = t.dataset.src;
    video.load();
    caption.textContent = t.dataset.caption;
  }));
  // the film has its own sound: hush the theme while it plays
  video.addEventListener("play", () => { if (!audio.paused) fadeTo(0, 400, () => audio.pause()); });

  // ---- gallery lightbox ----
  const links = [...document.querySelectorAll("[data-gallery] a")];
  const box = document.getElementById("lightbox");
  const big = box.querySelector("img");
  let at = 0, opener = null;
  const show = (i) => {
    at = (i + links.length) % links.length;
    big.src = links[at].href;
    big.alt = links[at].querySelector("img").alt;
  };
  const close = () => { box.hidden = true; document.body.style.overflow = ""; opener && opener.focus(); };
  links.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    opener = a;
    show(i);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    box.querySelector(".lightbox__close").focus();
  }));
  box.querySelector(".lightbox__close").addEventListener("click", close);
  box.querySelector(".lightbox__prev").addEventListener("click", () => show(at - 1));
  box.querySelector(".lightbox__next").addEventListener("click", () => show(at + 1));
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(at - 1);
    if (e.key === "ArrowRight") show(at + 1);
  });

  // ---- gentle reveal on scroll ----
  const targets = document.querySelectorAll(".intro__text, .intro__fig, .pillar, .fleet__head, .fleet__list li, .fleet__pics figure, .film__frame, .deep__text, .deep__fig, .g, .horizon__copy, .theme__card");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }
})();
