/* Баннер о файлах cookie (152-ФЗ / уведомление). Показывается один раз,
   до нажатия «Принять». Согласие хранится в localStorage. Самодостаточный —
   подключается на всех страницах: <script src="/consent.js" defer></script> */
(function () {
  "use strict";
  var KEY = 'gp-cookie-consent';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* приватный режим */ }

  var css = ''
    + '.cookie-bar{position:fixed;left:16px;right:16px;bottom:16px;z-index:60;'
    + 'max-width:640px;margin:0 auto;background:#123329;color:#ECE4D3;'
    + 'border-radius:16px;box-shadow:0 20px 50px -20px rgba(12,29,22,.6);'
    + 'padding:16px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;'
    + 'font-family:Manrope,system-ui,sans-serif;font-size:.86rem;line-height:1.45;'
    + 'transform:translateY(140%);transition:transform .5s cubic-bezier(.16,.8,.3,1)}'
    + '.cookie-bar.show{transform:none}'
    + '.cookie-bar p{margin:0;flex:1 1 260px;min-width:0}'
    + '.cookie-bar a{color:#E7A64C;text-decoration:underline}'
    + '.cookie-bar button{flex:none;background:#E7A64C;color:#0C1D16;border:none;cursor:pointer;'
    + 'font-family:inherit;font-weight:700;font-size:.86rem;padding:11px 22px;border-radius:100px;transition:.3s}'
    + '.cookie-bar button:hover{background:#ECE4D3}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'cookie-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Уведомление об использовании cookie');
  bar.innerHTML =
    '<p>Мы используем файлы cookie для корректной работы сайта и статистики. '
    + 'Продолжая пользоваться сайтом, вы соглашаетесь с этим. '
    + '<a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p>'
    + '<button type="button">Принять</button>';

  function mount() {
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('show'); });
    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
      bar.classList.remove('show');
      setTimeout(function () { bar.remove(); }, 500);
    });
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
