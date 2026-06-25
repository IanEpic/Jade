// home-airules.js
// Shared by the AI Rules pages: Finalist Text Rules (general + per-type) and
// Judging Guidelines. Each save is AJAX; only the elements present on the page fire.

(function () {
    if (!document.querySelector('.ar-wrap')) return;
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];

    // Auto-grow rule textareas to fit their content (no scrollbars).
    function autosize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px';
    }
    Array.prototype.forEach.call(document.querySelectorAll('textarea.ar-rules'), autosize);
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('ar-rules')) autosize(e.target);
    });
    window.addEventListener('load', function () {
        Array.prototype.forEach.call(document.querySelectorAll('textarea.ar-rules'), autosize);
    });

    function post(path, data) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        }).then(function (r) { return r.json(); });
    }
    function flash(el, ok) {
        if (!el) return;
        el.textContent = ok ? '✓ Saved' : 'Error';
        el.style.color = ok ? '#4caf50' : '#f88';
        if (ok) setTimeout(function () { if (el.textContent === '✓ Saved') el.textContent = ''; }, 2000);
    }

    // Finalist Text Rules: general rules
    var gSave = document.getElementById('ar-global-save');
    if (gSave) gSave.addEventListener('click', function () {
        post('/categoryTypes/global', { rules: document.getElementById('ar-global').value })
            .then(function (d) { flash(document.getElementById('ar-global-status'), d.ok); })
            .catch(function () { flash(document.getElementById('ar-global-status'), false); });
    });

    // Judging Guidelines + good/bad examples (saved together)
    var guSave = document.getElementById('ar-guidelines-save');
    if (guSave) guSave.addEventListener('click', function () {
        var val = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
        post('/categoryTypes/guidelines', {
            rules:        val('ar-guidelines'),
            examplesgood: val('ar-examplesgood'),
            examplesbad:  val('ar-examplesbad'),
        })
            .then(function (d) { flash(document.getElementById('ar-guidelines-status'), d.ok); })
            .catch(function () { flash(document.getElementById('ar-guidelines-status'), false); });
    });

    // Per-type rules (Finalist Text Rules)
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.ar-type-save');
        if (!btn) return;
        var id = btn.getAttribute('data-typeid');
        var ta = document.querySelector('textarea.ar-rules[data-typeid="' + id + '"]');
        var status = document.querySelector('.ar-status[data-typeid="' + id + '"]');
        post('/categoryTypes/rules', { categorytypeid: id, rules: ta ? ta.value : '' })
            .then(function (d) { flash(status, d.ok); })
            .catch(function () { flash(status, false); });
    });
}());
