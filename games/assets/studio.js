// Studio page: each game's media viewer (thumbnails swap the big frame; pictures open full screen).
(() => {
  const box = document.getElementById("lightbox");
  const big = box.querySelector("img");
  const cap = box.querySelector(".lightbox__cap");
  let set = [], at = 0, opener = null;

  const show = (i) => {
    at = (i + set.length) % set.length;
    big.src = set[at].dataset.src;
    big.alt = set[at].dataset.cap;
    cap.textContent = set[at].dataset.cap;
  };
  const open = (pictures, i, from) => {
    set = pictures; opener = from;
    show(i);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    box.querySelector(".lightbox__close").focus();
  };
  const close = () => { box.hidden = true; document.body.style.overflow = ""; opener && opener.focus(); };
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

  document.querySelectorAll("[data-viewer]").forEach((viewer) => {
    const frame = viewer.querySelector(".viewer");
    const caption = viewer.querySelector(".viewer__cap");
    const thumbs = [...viewer.querySelectorAll(".thumb")];
    const pictures = thumbs.filter((t) => t.dataset.type === "img");
    let current = thumbs[0];

    const select = (t) => {
      current = t;
      thumbs.forEach((o) => o.setAttribute("aria-pressed", String(o === t)));
      const playing = frame.querySelector("video");
      if (playing) playing.pause();
      if (t.dataset.type === "vid") {
        frame.innerHTML = "";
        const v = document.createElement("video");
        v.controls = true; v.playsInline = true; v.preload = "none"; v.poster = t.dataset.poster;
        const s = document.createElement("source"); s.src = t.dataset.src; s.type = "video/mp4";
        v.append(s); frame.append(v);
      } else {
        frame.innerHTML = "";
        const i = document.createElement("img"); i.src = t.dataset.src; i.alt = t.dataset.cap;
        frame.append(i);
      }
      caption.textContent = t.dataset.cap;
    };
    thumbs.forEach((t) => t.addEventListener("click", () => select(t)));
    frame.addEventListener("click", () => {
      if (current.dataset.type !== "img") return;
      open(pictures, pictures.indexOf(current), current);
    });
  });

  // one film at a time across the page
  document.addEventListener("play", (e) => {
    document.querySelectorAll("video").forEach((v) => { if (v !== e.target) v.pause(); });
  }, true);
})();
