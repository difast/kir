/* Общая форма бронирования для всех страниц.
   Подключение: houses-data.js + modal.css + этот файл.
   Открытие: Booking.open(houseId) или window.openModal(houseId) — форма открывается
   прямо на текущей странице, без перехода на главную. */
(function () {
  "use strict";
  const fmt = (n) => n.toLocaleString('ru-RU');
  const houses = (window.__HOUSES__ || []).filter((h) => h.status !== 'renovation');
  const iso = (d) => d.toISOString().split('T')[0];
  const today = new Date(), tomorrow = new Date(Date.now() + 864e5), dayAfter = new Date(Date.now() + 2 * 864e5);

  // ---------- разметка модалки ----------
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="modal" id="modal" aria-hidden="true">
    <div class="modal-bg" data-close></div>
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="Бронирование дома">
      <div id="formView">
        <div class="modal-top">
          <button class="close" data-close aria-label="Закрыть">✕</button>
          <span class="eyebrow">Бронирование</span>
          <h3>Забронировать дом</h3>
          <div class="m-house" id="mHouse">Выберите дом ниже</div>
        </div>
        <div class="modal-form">
          <div class="row">
            <div class="grp" id="g-house">
              <label>Дом</label>
              <select id="f-house"></select>
              <span class="err">Выберите дом</span>
            </div>
          </div>
          <div class="row">
            <div class="grp" id="g-in">
              <label>Заезд</label>
              <input type="date" id="f-in">
              <span class="err">Укажите дату заезда</span>
            </div>
            <div class="grp" id="g-out">
              <label>Выезд</label>
              <input type="date" id="f-out">
              <span class="err">Выезд должен быть позже заезда</span>
            </div>
          </div>
          <div class="row">
            <div class="grp" id="g-guests">
              <label>Гостей</label>
              <select id="f-guests">
                <option value="1">1 гость</option><option value="2" selected>2 гостя</option>
                <option value="3">3 гостя</option><option value="4">4 гостя</option>
                <option value="5">5 гостей</option><option value="6">6 гостей</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div class="grp" id="g-name">
              <label>Ваше имя <span class="req">*</span></label>
              <input type="text" id="f-name" placeholder="Как к вам обращаться" required>
              <span class="err">Введите имя</span>
            </div>
            <div class="grp" id="g-phone">
              <label>Телефон <span class="req">*</span></label>
              <input type="tel" id="f-phone" placeholder="+7 (___) ___-__-__" inputmode="tel" required>
              <span class="err">Введите корректный телефон</span>
            </div>
          </div>

          <div class="hp" aria-hidden="true">
            <label for="f-company">Не заполняйте это поле</label>
            <input type="text" id="f-company" name="company" tabindex="-1" autocomplete="off">
          </div>

          <div class="summary" id="summary">
            <div class="line"><span>Выберите даты, чтобы рассчитать стоимость</span></div>
          </div>

          <div class="submit-err" id="submitErr"></div>
          <button class="submit" id="submitBtn">Отправить заявку</button>
        </div>
      </div>

      <div class="success" id="successView" style="display:none">
        <div class="ok"><svg viewBox="0 0 40 40" fill="none"><path d="M10 21 L17 28 L31 12" stroke="#E7A64C" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3>Заявка принята!</h3>
        <p id="successMsg">Мы свяжемся с вами в течение 15 минут для подтверждения.</p>
        <div class="ref" id="refNum">№ ZG-000000</div><br>
        <button class="again" id="againBtn">Забронировать ещё</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);

  // ---------- ссылки на элементы ----------
  const modal = document.getElementById('modal');
  const mHouse = document.getElementById('mHouse');
  const fHouse = document.getElementById('f-house');
  const elIn = document.getElementById('f-in'), elOut = document.getElementById('f-out');
  const summary = document.getElementById('summary');
  const submitBtn = document.getElementById('submitBtn');

  // выпадающий список домов (только доступные)
  houses.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h.id; opt.textContent = `${h.name} — ${fmt(h.price)} ₽/сутки`;
    fHouse.appendChild(opt);
  });

  elIn.min = iso(today); elOut.min = iso(tomorrow);

  // ---------- маска телефона +7 (___) ___-__-__ ----------
  const phoneEl = document.getElementById('f-phone');
  function maskPhone(v) {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);   // 8… → 7…
    if (!d.startsWith('7')) d = '7' + d;            // 9…, любой ввод → префикс 7
    d = d.slice(0, 11);                             // 7 + 10 цифр
    const r = d.slice(1);
    let out = '+7';
    if (r.length) out += ' (' + r.slice(0, 3);
    if (r.length >= 3) out += ')';
    if (r.length > 3) out += ' ' + r.slice(3, 6);
    if (r.length >= 6) out += '-' + r.slice(6, 8);
    if (r.length >= 8) out += '-' + r.slice(8, 10);
    return out;
  }
  phoneEl.addEventListener('input', () => { phoneEl.value = maskPhone(phoneEl.value); });
  phoneEl.addEventListener('focus', () => { if (!phoneEl.value) phoneEl.value = '+7 ('; });
  phoneEl.addEventListener('blur', () => { if (phoneEl.value === '+7 (' || phoneEl.value === '+7') phoneEl.value = ''; });

  // ---------- расчёты ----------
  function nights() {
    const a = new Date(elIn.value), b = new Date(elOut.value);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 864e5));
  }
  function nWord(n) { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return 'сутки'; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'суток'; return 'суток'; }
  function updateHouseLabel() {
    const h = houses.find((x) => x.id === fHouse.value);
    mHouse.textContent = h ? `${h.name} · ${fmt(h.price)} ₽ за сутки · до ${h.cap} гостей` : 'Выберите дом ниже';
  }
  function calcSummary() {
    const h = houses.find((x) => x.id === fHouse.value), n = nights();
    if (!h || n < 1) { summary.innerHTML = '<div class="line"><span>Выберите даты, чтобы рассчитать стоимость</span></div>'; return; }
    const total = h.price * n;
    summary.innerHTML =
      `<div class="line"><span>${fmt(h.price)} ₽ × ${n} ${nWord(n)}</span><span>${fmt(total)} ₽</span></div>
       <div class="line"><span>Уборка и бельё</span><span>включено</span></div>
       <div class="total"><span>Итого</span><span>${fmt(total)} ₽</span></div>`;
  }

  fHouse.addEventListener('change', () => { updateHouseLabel(); calcSummary(); });
  elIn.addEventListener('change', () => {
    const d = new Date(elIn.value); d.setDate(d.getDate() + 1); elOut.min = iso(d);
    if (new Date(elOut.value) <= new Date(elIn.value)) elOut.value = iso(d);
    calcSummary();
  });
  elOut.addEventListener('change', calcSummary);

  // ---------- открыть / закрыть ----------
  function open(id) {
    document.getElementById('formView').style.display = '';
    document.getElementById('successView').style.display = 'none';
    document.getElementById('submitErr').style.display = 'none';
    // перенос значений из hero-поиска, если они есть на странице
    const gEl = (x) => document.getElementById(x);
    const si = gEl('s-in') && gEl('s-in').value, so = gEl('s-out') && gEl('s-out').value, sg = gEl('s-guests') && gEl('s-guests').value;
    if (!elIn.value) elIn.value = si || iso(tomorrow);
    if (!elOut.value) elOut.value = so || iso(dayAfter);
    if (sg) fHouse.value && (gEl('f-guests').value = sg);
    if (id) fHouse.value = id;
    updateHouseLabel(); calcSummary();
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function close() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  function reset() {
    document.getElementById('f-name').value = '';
    document.getElementById('f-phone').value = '';
    document.getElementById('f-company').value = '';
    document.getElementById('submitErr').style.display = 'none';
    open(fHouse.value);
  }

  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  document.getElementById('againBtn').addEventListener('click', reset);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function showSuccess(h, n, total, name, ref) {
    document.getElementById('refNum').textContent = '№ ' + ref;
    document.getElementById('successMsg').innerHTML =
      `«${h.name}», ${n} ${nWord(n)}, итого <b>${fmt(total)} ₽</b>.<br>${name}, мы свяжемся с вами в течение 15 минут для подтверждения.`;
    document.getElementById('formView').style.display = 'none';
    document.getElementById('successView').style.display = '';
    document.querySelector('.modal-box').scrollTop = 0;
  }

  // ---------- отправка ----------
  async function submitBooking() {
    let ok = true;
    const setErr = (gid, bad) => { document.getElementById(gid).classList.toggle('invalid', bad); if (bad) ok = false; };
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    setErr('g-house', !fHouse.value);
    setErr('g-in', !elIn.value);
    setErr('g-out', !elOut.value || nights() < 1);
    setErr('g-name', name.length < 2);
    setErr('g-phone', phone.replace(/\D/g, '').length < 10);
    if (!ok) return;

    const h = houses.find((x) => x.id === fHouse.value), n = nights(), total = h.price * n;
    const guests = +document.getElementById('f-guests').value;
    const hp = document.getElementById('f-company').value.trim();
    const errBox = document.getElementById('submitErr');
    errBox.style.display = 'none';

    if (hp) { showSuccess(h, n, total, name, 'ZG-000000'); return; } // honeypot: бот

    const payload = { house: h.id, houseName: h.name, checkIn: elIn.value, checkOut: elOut.value, nights: n, guests, name, phone, total, company: hp };
    const oldText = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Отправляем…';
    try {
      const res = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Не удалось отправить заявку. Попробуйте ещё раз.');
      showSuccess(h, n, total, name, data.ref);
    } catch (e) {
      errBox.textContent = (e && e.message) ? e.message : 'Ошибка сети. Проверьте соединение и попробуйте снова.';
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = oldText;
    }
  }
  submitBtn.addEventListener('click', submitBooking);

  // ---------- экспорт + автозапуск по ?book= ----------
  window.Booking = { open, close };
  window.openModal = open; window.closeModal = close; window.resetModal = reset;
  window.fromSearch = function () { open(); const b = document.querySelector('.modal-box'); if (b) b.scrollTop = 0; };

  const bookId = new URLSearchParams(location.search).get('book');
  if (bookId) { const h = houses.find((x) => x.id === bookId); if (h) open(h.id); }
})();
