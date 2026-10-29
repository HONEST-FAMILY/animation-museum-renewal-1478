(() => {
  const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  function openState(now) {
    const day = now.getDay();
    const closedToday = day === 1 || (now.getMonth() === 0 && now.getDate() === 1);
    const m = now.getHours() * 60 + now.getMinutes();
    const nextDay = DAYS[(day + 1) % 7] === '월요일' ? '화요일' : '내일';
    if (closedToday) return { short: '오늘 휴관 · ' + nextDay + ' 10:00', long: '오늘은 쉬는 날이에요' };
    if (m < 600) return { short: '오늘 10:00–18:00 운영', long: '오늘 10시에 열어요' };
    if (m < 1020) return { short: '오늘 10:00–18:00 · 지금 관람 가능', long: '지금 관람할 수 있어요' };
    if (m < 1080) return { short: '오늘 입장 마감 · 18:00까지', long: '오늘 입장은 마감됐어요' };
    return { short: '오늘 운영 종료 · ' + nextDay + ' 10:00', long: '오늘 운영이 끝났어요 · ' + nextDay + ' 10시에 열어요' };
  }

  function paintOpen() {
    const s = openState(new Date());
    document.querySelectorAll('[data-open-text]').forEach((el) => { el.textContent = s.short; });
    document.querySelectorAll('[data-open-long]').forEach((el) => { el.textContent = s.long; });
  }
  paintOpen();
  setInterval(paintOpen, 60000);

  const bar = document.querySelector('.bar');
  const nav = document.querySelector('.nav');
  const mob = document.querySelector('.head-mob');
  const panel = document.querySelector('[data-menu-panel]');
  const toggles = document.querySelectorAll('[data-menu-toggle]');
  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    panel.hidden = !open;
    toggles.forEach((b) => b.setAttribute('aria-expanded', String(open)));
    if (open) bar.classList.add('on');
    else onScroll();
  }
  toggles.forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', (e) => { e.stopPropagation(); setMenu(!menuOpen); });
  });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  function onScroll() {
    const ref = getComputedStyle(nav).display === 'none' ? mob : nav;
    const limit = ref.offsetTop + ref.offsetHeight;
    const on = window.scrollY > limit || menuOpen;
    bar.classList.toggle('on', on);
    bar.setAttribute('aria-hidden', String(!on));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
