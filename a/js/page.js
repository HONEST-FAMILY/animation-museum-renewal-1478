(() => {
  document.documentElement.classList.add('js');

  const seoulNow = () => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const o = {};
    p.forEach((x) => { o[x.type] = x.value; });
    return { month: +o.month, day: +o.day, wd: o.weekday, h: +o.hour % 24, m: +o.minute };
  };

  const status = () => {
    const n = seoulNow();
    const closed = n.wd === 'Mon' || (n.month === 1 && n.day === 1);
    const mins = n.h * 60 + n.m;
    if (closed) return { label: '오늘은 쉬는 날이에요', now: '내일 오전 10시에 열어요' };
    if (mins < 600) return { label: '오늘 10:00 – 18:00 운영', now: '오전 10시에 열어요' };
    if (mins < 1020) return { label: '오늘 10:00 – 18:00 운영', now: '지금 관람할 수 있어요 · 입장 마감 17:00' };
    if (mins < 1080) return { label: '오늘 10:00 – 18:00 운영', now: '오늘 입장은 마감됐어요 · 18:00까지 운영' };
    const tomorrowMon = n.wd === 'Sun';
    return { label: '오늘 운영을 마쳤어요', now: tomorrowMon ? '월요일은 쉬어요 · 화요일 오전 10시에 열어요' : '내일 오전 10시에 열어요' };
  };

  const st = status();
  const txt = document.querySelector('.today-txt');
  const nowEl = document.querySelector('.today-now');
  if (txt) txt.textContent = st.label;
  if (nowEl) nowEl.textContent = st.now;

  const btn = document.querySelector('.today-btn');
  const pop = document.querySelector('.today-pop');
  const togglePop = (force) => {
    const open = force !== undefined ? force : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    pop.hidden = !open;
  };
  if (btn && pop) btn.addEventListener('click', () => togglePop());
  const clock = document.querySelector('.ic-clock');
  if (clock) clock.addEventListener('click', () => {
    togglePop(true);
    document.querySelector('.visit-bar').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const menuBtn = document.querySelector('.ic-menu');
  const menu = document.querySelector('.menu');
  if (menuBtn && menu) {
    const setMenu = (open) => {
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-on', open);
    };
    menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  }

  const track = document.querySelector('.track');
  const prev = document.querySelector('.arr.prev');
  const next = document.querySelector('.arr.next');
  if (track) {
    const cards = [...track.querySelectorAll('.card')];
    const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth * 0.8);
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      const right = track.getBoundingClientRect().right;
      cards.forEach((c) => {
        const r = c.getBoundingClientRect();
        c.classList.toggle('dim', r.right > right - 30 || r.left < track.getBoundingClientRect().left - 30);
      });
    };
    if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  const heads = document.querySelectorAll('.h2');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    heads.forEach((h) => io.observe(h));
    setTimeout(() => heads.forEach((h) => { if (h.getBoundingClientRect().top < innerHeight) h.classList.add('in'); }), 900);
  } else {
    heads.forEach((h) => h.classList.add('in'));
  }
})();
