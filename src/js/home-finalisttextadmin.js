// home-finalisttextadmin.js
// Admin Finalist Text page: per-row save + sequential "Generate Missing".

(function () {
    var genBtn   = document.getElementById('ft-generate');
    var progress = document.getElementById('ft-progress');
    var blankEl  = document.getElementById('ft-blank-count');
    if (!genBtn) return;

    // Slug base for AJAX URLs — JADE_BASE if present, else the first path segment.
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];

    // Auto-grow textareas to fit their content (no scrollbars).
    function autosize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px';
    }
    Array.prototype.forEach.call(document.querySelectorAll('.ft-input'), autosize);
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('ft-input')) autosize(e.target);
    });

    function post(path, data) {
        var body = new URLSearchParams(data);
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body,
        }).then(function (r) { return r.json(); });
    }

    function setStatus(entryid, mark, colour) {
        var el = document.querySelector('.ft-status[data-entryid="' + entryid + '"]');
        if (!el) return;
        el.textContent = mark;
        el.style.color = colour || '#4caf50';
        if (mark === '✓') setTimeout(function () { if (el.textContent === '✓') el.textContent = ''; }, 2000);
    }

    // ── Per-row save ──────────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.ft-save');
        if (!btn) return;
        var entryid = btn.getAttribute('data-entryid');
        var input = document.querySelector('.ft-input[data-entryid="' + entryid + '"]');
        if (!input) return;
        btn.disabled = true;
        post('/finalistText/save', { entryid: entryid, text: input.value })
            .then(function (d) {
                btn.disabled = false;
                if (d.ok) { input.classList.toggle('blank', !input.value.trim()); setStatus(entryid, '✓'); }
                else setStatus(entryid, '✕', '#f88');
            })
            .catch(function () { btn.disabled = false; setStatus(entryid, '✕', '#f88'); });
    });

    // ── Generate Missing (sequential, one request per blank entry) ────────────
    genBtn.addEventListener('click', function () {
        var blanks = Array.prototype.slice
            .call(document.querySelectorAll('.ft-input'))
            .filter(function (i) { return !i.value.trim(); });
        if (!blanks.length) return;

        genBtn.disabled = true;
        var i = 0, remaining = blanks.length;

        function next() {
            if (i >= blanks.length) {
                progress.textContent = 'Done.';
                genBtn.disabled = false;
                return;
            }
            var input = blanks[i++];
            var entryid = input.getAttribute('data-entryid');
            progress.textContent = 'Generating ' + i + ' of ' + blanks.length + '…';
            setStatus(entryid, '…', '#c48f06');
            post('/finalistText/generate', { entryid: entryid })
                .then(function (d) {
                    if (d.ok) {
                        input.value = d.text;
                        autosize(input);
                        input.classList.toggle('blank', !d.text);
                        setStatus(entryid, '✓');
                        if (d.text) { remaining--; if (blankEl) blankEl.textContent = remaining; }
                    } else {
                        setStatus(entryid, '✕', '#f88');
                    }
                    next();
                })
                .catch(function () { setStatus(entryid, '✕', '#f88'); next(); });
        }
        next();
    });
}());
