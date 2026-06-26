// home-citations.js
// Admin Citations (Tools): per-winner AI generate/regenerate + edit/save, plus a sequential
// "Generate All Missing" with a spinner holding pattern and a Stop button. Each generation is
// saved server-side immediately, so stopping (or a later regenerate) never loses work.

(function () {
    var wrap = document.querySelector('.ci-wrap');
    if (!wrap) return;
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];
    var SPIN = '<span class="ci-spin"></span>';

    function post(path, data, signal) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
            signal: signal,
        }).then(function (r) { return r.json(); });
    }
    function pick(cls, id, hl) { return document.querySelector(cls + '[data-entryid="' + id + '"][data-headline="' + hl + '"]'); }

    // Grow a citation box to fit its content (no inner scrollbar).
    function autosize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 4) + 'px';
    }
    function autosizeAll() { Array.prototype.forEach.call(document.querySelectorAll('textarea.ci-text'), autosize); }
    autosizeAll();
    window.addEventListener('load', autosizeAll);
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('ci-text')) autosize(e.target);
    });
    function flash(el, msg, colour, html) {
        if (!el) return;
        if (html) el.innerHTML = msg; else el.textContent = msg;
        el.style.color = colour || '#4caf50';
        if (colour !== '#f88' && !html) setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2500);
    }

    // Generate (or regenerate) one citation. Resolves to true on success.
    function generate(id, hl, signal) {
        var ta = pick('textarea.ci-text', id, hl);
        var st = pick('.ci-status', id, hl);
        var btn = pick('.ci-gen', id, hl);
        if (btn) btn.disabled = true;
        flash(st, SPIN + 'Generating…', '#9ab', true);
        return post('/citation/generate', { entryid: id, headline: hl }, signal)
            .then(function (d) {
                if (d.ok) { if (ta) { ta.value = d.text; autosize(ta); } flash(st, '✓ Generated'); return true; }
                flash(st, d.error || 'Error', '#f88'); return false;
            })
            .catch(function (err) {
                if (err && err.name === 'AbortError') { flash(st, 'Stopped', '#9ab'); return false; }
                flash(st, 'Error', '#f88'); return false;
            })
            .then(function (ok) { if (btn) btn.disabled = false; return ok; });
    }

    var controller = null;       // for the in-flight bulk request
    var stopRequested = false;

    function setBulkUI(running) {
        document.getElementById('ci-genall').style.display = running ? 'none' : '';
        document.getElementById('ci-stop').style.display   = running ? '' : 'none';
    }

    document.addEventListener('click', function (e) {
        var gen = e.target.closest('.ci-gen');
        if (gen) { generate(gen.getAttribute('data-entryid'), gen.getAttribute('data-headline')); return; }

        var sv = e.target.closest('.ci-save');
        if (sv) {
            var id = sv.getAttribute('data-entryid'), hl = sv.getAttribute('data-headline');
            var ta = pick('textarea.ci-text', id, hl), st = pick('.ci-status', id, hl);
            post('/citation/save', { entryid: id, headline: hl, text: ta ? ta.value : '' })
                .then(function (d) { flash(st, d.ok ? '✓ Saved' : 'Error', d.ok ? null : '#f88'); })
                .catch(function () { flash(st, 'Error', '#f88'); });
            return;
        }

        if (e.target.id === 'ci-state-gen') {
            var sta = document.getElementById('ci-state-text'), sst = document.getElementById('ci-state-status');
            e.target.disabled = true;
            flash(sst, SPIN + 'Generating…', '#9ab', true);
            post('/citation/state/generate', {})
                .then(function (d) { if (d.ok) { sta.value = d.text; autosize(sta); flash(sst, '✓ Generated'); } else flash(sst, d.error || 'Error', '#f88'); })
                .catch(function () { flash(sst, 'Error', '#f88'); })
                .then(function () { e.target.disabled = false; });
            return;
        }
        if (e.target.id === 'ci-state-save') {
            var sta2 = document.getElementById('ci-state-text'), sst2 = document.getElementById('ci-state-status');
            post('/citation/state/save', { text: sta2 ? sta2.value : '' })
                .then(function (d) { flash(sst2, d.ok ? '✓ Saved' : 'Error', d.ok ? null : '#f88'); })
                .catch(function () { flash(sst2, 'Error', '#f88'); });
            return;
        }

        if (e.target.id === 'ci-stop') { stopRequested = true; if (controller) controller.abort(); return; }

        if (e.target.id === 'ci-genall') {
            var prog = document.getElementById('ci-progress');
            var empties = Array.prototype.filter.call(document.querySelectorAll('textarea.ci-text'), function (ta) {
                return ta.getAttribute('data-entryid') && !ta.value.trim();   // skip the State Award box (no entryid)
            });
            if (!empties.length) { flash(prog, 'Nothing missing to generate.', '#9ab'); return; }
            stopRequested = false;
            setBulkUI(true);
            var i = 0, done = 0;
            (function next() {
                if (stopRequested || i >= empties.length) {
                    prog.innerHTML = (stopRequested ? 'Stopped — ' : 'Done — ') + done + ' of ' + empties.length + ' generated.';
                    setBulkUI(false); controller = null; return;
                }
                var ta = empties[i];
                prog.innerHTML = SPIN + 'Generating ' + (i + 1) + ' of ' + empties.length + '… (this can take a while)';
                controller = new AbortController();
                generate(ta.getAttribute('data-entryid'), ta.getAttribute('data-headline'), controller.signal)
                    .then(function (ok) { if (ok) done++; i++; next(); });
            }());
        }
    });
}());
