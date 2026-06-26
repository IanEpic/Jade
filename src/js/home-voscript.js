// home-voscript.js
// Admin Finalist VO Script (Tools): edit headings/lines, Save, Regenerate from finalist text,
// Export to Word. Line boxes auto-grow to fit.

(function () {
    var wrap = document.querySelector('.vo-wrap');
    if (!wrap) return;
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];

    function post(path, data) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        }).then(function (r) { return r.json(); });
    }
    function flash(msg, colour) {
        var el = document.getElementById('vo-status');
        if (!el) return;
        el.textContent = msg; el.style.color = colour || '#4caf50';
        if (colour !== '#f88') setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2500);
    }
    function autosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = (el.scrollHeight + 4) + 'px'; }
    function autosizeAll() { Array.prototype.forEach.call(document.querySelectorAll('textarea.vo-text'), autosize); }
    autosizeAll();
    window.addEventListener('load', autosizeAll);
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('vo-text')) autosize(e.target);
    });

    function collect() {
        return Array.prototype.map.call(document.querySelectorAll('.vo-card'), function (card) {
            return {
                categoryid: parseInt(card.getAttribute('data-categoryid')),
                heading: (card.querySelector('input.vo-head') || {}).value || '',
                body: (card.querySelector('textarea.vo-text') || {}).value || '',
            };
        });
    }

    document.getElementById('vo-save').addEventListener('click', function () {
        flash('Saving…', '#9ab');
        post('/voScript/save', { items: JSON.stringify(collect()) })
            .then(function (d) { flash(d.ok ? '✓ Saved' : (d.error || 'Error'), d.ok ? null : '#f88'); })
            .catch(function () { flash('Error', '#f88'); });
    });

    // Regenerate — confirm handled by the global data-confirm handler; we re-run on click.
    document.getElementById('vo-regen').addEventListener('click', function () {
        if (!window.confirm('Rebuild the script from finalist text? Any edits will be lost.')) return;
        flash('Regenerating…', '#9ab');
        post('/voScript/generate', {})
            .then(function (d) { if (d.ok) location.reload(); else flash(d.error || 'Error', '#f88'); })
            .catch(function () { flash('Error', '#f88'); });
    });
}());
