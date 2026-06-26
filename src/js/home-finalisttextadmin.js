// home-finalisttextadmin.js
// Admin Finalist Text page: per-row save + bulk select (regenerate / save all / delete)
// with a progress bar for the AI runs.

(function () {
    var genBtn    = document.getElementById('ft-generate');
    if (!genBtn) return;
    var regenBtn  = document.getElementById('ft-regen');
    var saveAllBtn= document.getElementById('ft-saveall');
    var deleteBtn = document.getElementById('ft-delete');
    var cancelBtn = document.getElementById('ft-cancel');
    var selallEl  = document.getElementById('ft-selall');
    var blankEl   = document.getElementById('ft-blank-count');
    var progBox   = document.getElementById('ft-progress-box');
    var progText  = document.getElementById('ft-progress-text');
    var progBar   = document.getElementById('ft-bar');

    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];
    var slice = function (n) { return Array.prototype.slice.call(n); };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function autosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }
    slice(document.querySelectorAll('.ft-input')).forEach(autosize);
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('ft-input')) autosize(e.target);
    });

    function post(path, data) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        }).then(function (r) { return r.json(); });
    }
    function setStatus(entryid, mark, colour) {
        var el = document.querySelector('.ft-status[data-entryid="' + entryid + '"]');
        if (!el) return;
        el.textContent = mark; el.style.color = colour || '#4caf50';
        if (mark === '✓') setTimeout(function () { if (el.textContent === '✓') el.textContent = ''; }, 2500);
    }
    function inputs()       { return slice(document.querySelectorAll('.ft-input')); }
    function checks()       { return slice(document.querySelectorAll('.ft-sel')); }
    function inputFor(id)   { return document.querySelector('.ft-input[data-entryid="' + id + '"]'); }
    function selectedInputs() { return checks().filter(function (c) { return c.checked; }).map(function (c) { return inputFor(c.getAttribute('data-entryid')); }); }
    function updateBlankCount() {
        var n = inputs().filter(function (i) { return !i.value.trim(); }).length;
        if (blankEl) blankEl.textContent = n;
        genBtn.disabled = n === 0;
    }

    // ── Progress box ──────────────────────────────────────────────────────────
    function showProgress(text) { progBox.style.display = ''; progText.textContent = text || ''; }
    function setBar(pct) { progBar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
    function setBusy(on) {
        [genBtn, regenBtn, saveAllBtn, deleteBtn, selallEl].forEach(function (b) { if (b) b.disabled = on; });
        cancelBtn.style.display = on ? '' : 'none';
        if (!on) updateSelection();   // restore enabled/disabled from selection
    }

    // ── Selection ─────────────────────────────────────────────────────────────
    function updateSelection() {
        var all = checks(), sel = all.filter(function (c) { return c.checked; });
        regenBtn.disabled = sel.length === 0;
        deleteBtn.disabled = sel.length === 0;
        selallEl.checked = sel.length > 0 && sel.length === all.length;
        selallEl.indeterminate = sel.length > 0 && sel.length < all.length;
        all.forEach(function (c) { var row = c.closest('.ft-row'); if (row) row.classList.toggle('sel', c.checked); });
        slice(document.querySelectorAll('.ft-card')).forEach(function (card) {
            var cs = slice(card.querySelectorAll('.ft-sel'));
            var on = cs.filter(function (c) { return c.checked; }).length;
            var cat = card.querySelector('.ft-cat-sel');
            if (cat) { cat.checked = cs.length > 0 && on === cs.length; cat.indeterminate = on > 0 && on < cs.length; }
        });
    }
    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('ft-sel')) updateSelection();
        else if (e.target.id === 'ft-selall') { checks().forEach(function (c) { c.checked = selallEl.checked; }); updateSelection(); }
        else if (e.target.classList.contains('ft-cat-sel')) {
            slice(e.target.closest('.ft-card').querySelectorAll('.ft-sel')).forEach(function (c) { c.checked = e.target.checked; });
            updateSelection();
        }
    });

    // ── Per-row save ──────────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.ft-save');
        if (!btn) return;
        var entryid = btn.getAttribute('data-entryid'), input = inputFor(entryid);
        if (!input) return;
        btn.disabled = true;
        post('/finalistText/save', { entryid: entryid, text: input.value }).then(function (d) {
            btn.disabled = false;
            if (d.ok) { input.classList.toggle('blank', !input.value.trim()); setStatus(entryid, '✓'); updateBlankCount(); }
            else setStatus(entryid, '✕', '#f88');
        }).catch(function () { btn.disabled = false; setStatus(entryid, '✕', '#f88'); });
    });

    // ── Sequential AI run (shared by Generate Missing + Regenerate Selected) ───
    var cancelled = false;
    cancelBtn.addEventListener('click', function () { cancelled = true; progText.textContent = 'Cancelling…'; });

    function runGenerate(list, verb) {
        if (!list.length) return;
        cancelled = false; setBusy(true); showProgress(); setBar(0);
        var i = 0, ok = 0, fail = 0;
        (function next() {
            if (cancelled || i >= list.length) {
                setBar(100);
                progText.textContent = 'Done — ' + ok + ' updated' + (fail ? ', ' + fail + ' failed' : '') + (cancelled ? ' (cancelled)' : '') + '.';
                setBusy(false);
                return;
            }
            var input = list[i++], entryid = input.getAttribute('data-entryid');
            progText.textContent = verb + ' ' + i + ' of ' + list.length + '…';
            setBar(Math.round((i - 1) / list.length * 100));
            setStatus(entryid, '…', '#c48f06');
            post('/finalistText/generate', { entryid: entryid }).then(function (d) {
                if (d.ok) { input.value = d.text; autosize(input); input.classList.toggle('blank', !d.text); setStatus(entryid, '✓'); ok++; }
                else { setStatus(entryid, '✕', '#f88'); fail++; }
                updateBlankCount(); next();
            }).catch(function () { setStatus(entryid, '✕', '#f88'); fail++; next(); });
        })();
    }

    genBtn.addEventListener('click', function () {
        runGenerate(inputs().filter(function (i) { return !i.value.trim(); }), 'Generating');
    });
    regenBtn.addEventListener('click', function () {
        var sel = selectedInputs();
        if (!sel.length) return;
        if (!confirm('Regenerate finalist text for ' + sel.length + ' selected entr' + (sel.length === 1 ? 'y' : 'ies') + '? This overwrites the current text.')) return;
        runGenerate(sel, 'Regenerating');
    });

    // ── Save All ──────────────────────────────────────────────────────────────
    saveAllBtn.addEventListener('click', function () {
        var all = inputs();
        var items = all.map(function (i) { return { entryid: i.getAttribute('data-entryid'), text: i.value }; });
        setBusy(true); showProgress('Saving ' + items.length + ' entries…'); setBar(40);
        post('/finalistText/saveAll', { items: JSON.stringify(items) }).then(function (d) {
            setBar(100);
            progText.textContent = d.ok ? ('Saved ' + d.saved + ' entr' + (d.saved === 1 ? 'y' : 'ies') + '.') : 'Save failed.';
            all.forEach(function (i) { i.classList.toggle('blank', !i.value.trim()); });
            updateBlankCount(); setBusy(false);
        }).catch(function () { progText.textContent = 'Save failed.'; setBusy(false); });
    });

    // ── Delete Selected ───────────────────────────────────────────────────────
    deleteBtn.addEventListener('click', function () {
        var sel = selectedInputs();
        if (!sel.length) return;
        if (!confirm('Clear finalist text for ' + sel.length + ' selected entr' + (sel.length === 1 ? 'y' : 'ies') + '?')) return;
        var ids = sel.map(function (i) { return i.getAttribute('data-entryid'); });
        setBusy(true); showProgress('Clearing ' + ids.length + ' entries…'); setBar(40);
        post('/finalistText/clear', { entryids: JSON.stringify(ids) }).then(function (d) {
            setBar(100);
            if (d.ok) { sel.forEach(function (i) { i.value = ''; autosize(i); i.classList.add('blank'); }); }
            progText.textContent = d.ok ? ('Cleared ' + d.cleared + ' entr' + (d.cleared === 1 ? 'y' : 'ies') + '.') : 'Clear failed.';
            updateBlankCount(); setBusy(false);
        }).catch(function () { progText.textContent = 'Clear failed.'; setBusy(false); });
    });

    updateSelection();
}());
