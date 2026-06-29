// home-theme.js — Admin → Theme (Look & Feel): brand-asset uploads (favicon, doc header image)
// with click-to-browse, drag-and-drop, and delete. Endpoints live under /admin (shared with the
// program form). The colour/background/font editor (3b) will be added here.

function mediaDelete(btnId, url, confirmMsg) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (!confirm(confirmMsg)) return;
        btn.disabled = true;
        fetch(window.JADE_BASE + url, { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (r) { if (r.status === 'OK') location.reload(); else { btn.disabled = false; alert('Delete failed (' + r.status + ')'); } })
            .catch(function () { btn.disabled = false; alert('Network error'); });
    });
}

function mediaUpload(btnId, inputId, statusId, url, field) {
    var btn = document.getElementById(btnId), input = document.getElementById(inputId), status = document.getElementById(statusId);
    if (!btn || !input) return;
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        if (status) { status.style.color = ''; status.textContent = 'Uploading…'; }
        var fd = new FormData(); fd.append(field, file);
        fetch(window.JADE_BASE + url, { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (r) { if (r.status === 'OK') location.reload(); else if (status) { status.style.color = '#c44'; status.textContent = '✗ Upload failed (' + r.status + ')'; } })
            .catch(function () { if (status) { status.style.color = '#c44'; status.textContent = '✗ Network error'; } });
    });
}

function wireDrop(boxId, inputId, statusId, url, field, accept) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var input = document.getElementById(inputId), status = document.getElementById(statusId);
    box.addEventListener('click', function (e) { if (e.target.closest('button, a, input')) return; if (input) input.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); box.classList.add('drag-over'); }); });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); box.classList.remove('drag-over'); }); });
    box.addEventListener('drop', function (e) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (accept && !accept.test(file.name)) { if (status) { status.style.color = '#c44'; status.textContent = '✗ Unsupported file type'; } return; }
        if (status) { status.style.color = ''; status.textContent = 'Uploading…'; }
        var fd = new FormData(); fd.append(field, file);
        fetch(window.JADE_BASE + url, { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (r) { if (r.status === 'OK') location.reload(); else if (status) { status.style.color = '#c44'; status.textContent = '✗ Upload failed (' + r.status + ')'; } })
            .catch(function () { if (status) { status.style.color = '#c44'; status.textContent = '✗ Network error'; } });
    });
}

mediaDelete('favicon-delete-btn', '/admin/delete-favicon', 'Remove the custom favicon and revert to the JADE default?');
mediaUpload('favicon-btn', 'favicon-input', 'favicon-status', '/admin/upload-favicon', 'favicon');
wireDrop('favicon-box', 'favicon-input', 'favicon-status', '/admin/upload-favicon', 'favicon', /\.(svg|png|ico)$/i);

mediaDelete('docheader-delete-btn', '/admin/delete-docheader', 'Remove the document header image and use the program name as text?');
mediaUpload('docheader-btn', 'docheader-input', 'docheader-status', '/admin/upload-docheader', 'docheader');
wireDrop('docheader-box', 'docheader-input', 'docheader-status', '/admin/upload-docheader', 'docheader', /\.(png|jpe?g)$/i);

// Themed-program assets: portal logo + background image
mediaDelete('logo-delete-btn', '/admin/delete-logo', 'Remove the portal logo and use the program name as text?');
mediaUpload('logo-btn', 'logo-input', 'logo-status', '/admin/upload-logo', 'logo');
wireDrop('logo-box', 'logo-input', 'logo-status', '/admin/upload-logo', 'logo', /\.(svg|png|jpe?g|webp)$/i);
mediaDelete('themebg-delete-btn', '/admin/delete-themebg', 'Remove the background image?');
mediaUpload('themebg-btn', 'themebg-input', 'themebg-status', '/admin/upload-themebg', 'themebg');
wireDrop('themebg-box', 'themebg-input', 'themebg-status', '/admin/upload-themebg', 'themebg', /\.(png|jpe?g|webp)$/i);

// Enable theming on a non-themed program (creates a default dark theme; server guards on entries).
(function () {
    var btn = document.getElementById('tp-enable'), status = document.getElementById('tp-enable-status');
    if (!btn) return;
    btn.addEventListener('click', function () {
        btn.disabled = true;
        if (status) { status.style.color = ''; status.textContent = 'Enabling…'; }
        fetch(window.JADE_BASE + '/admin/enable-theme', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (r.status === 'OK') { location.reload(); }
                else { btn.disabled = false; if (status) { status.style.color = '#c44'; status.textContent = r.status === 'E_HASENTRIES' ? '✗ Program has entries — cannot theme' : '✗ ' + r.status; } }
            })
            .catch(function () { btn.disabled = false; if (status) { status.style.color = '#c44'; status.textContent = '✗ Network error'; } });
    });
}());

// ── Theme token editor: 5 core colours derive the full palette (+ overrides) ─────
(function () {
    var dataEl = document.getElementById('tp-data');
    var preview = document.getElementById('tp-preview');
    if (!dataEl || !preview) return;
    var data = JSON.parse(dataEl.textContent);

    // ── colour maths ──
    function toRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
    function toHex(c) { function p(n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2); } return '#' + p(c.r) + p(c.g) + p(c.b); }
    function mix(a, b, t) { var x = toRgb(a), y = toRgb(b); return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t }); }
    function lum(h) { var c = toRgb(h); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
    function on(h) { return lum(h) > 0.55 ? '#000000' : '#ffffff'; }

    // Derive the full token map from the five core colours.
    function derive(c) {
        var bg = c.bg, su = c.surface, tx = c.text, ac = c.accent, bd = c.border;
        return {
            'color-bg': bg, 'color-text': tx, 'color-muted': mix(tx, bg, 0.4),
            'color-accent': ac, 'color-accent-strong': mix(ac, '#000000', 0.18), 'color-accent-nav': mix(ac, '#ffffff', 0.18),
            'color-link': ac, 'on-accent': on(ac),
            'border': bd, 'border-mid': mix(bd, tx, 0.2), 'border-2': mix(bd, bg, 0.35), 'border-subtle': mix(bd, bg, 0.5),
            'border-faint': mix(bd, bg, 0.65), 'border-dashed': bd, 'border-row': mix(bd, bg, 0.55), 'border-strong': mix(bd, tx, 0.45),
            'surface': su, 'surface-1': mix(su, bg, 0.4), 'surface-2': mix(su, bg, 0.25), 'surface-deep': mix(su, bg, 0.6),
            'surface-sunken': mix(su, bg, 0.5), 'surface-raised': mix(su, tx, 0.06), 'header-bg': bg, 'footer-bg': bg,
            'text-strong': mix(tx, bg, 0.08), 'text-label': mix(tx, bg, 0.3), 'text-dim': mix(tx, bg, 0.45),
            'text-faint': mix(tx, bg, 0.52), 'text-fainter': mix(tx, bg, 0.4), 'text-arrow': mix(tx, bg, 0.45),
            'input-bg': su, 'input-border': bd, 'btn-bg': ac, 'btn-text': on(ac), 'btn-active-text': on(ac),
            'btn-secondary-text': tx, 'btn-secondary-border': mix(bd, tx, 0.2), 'color-danger': '#cc4444',
        };
    }

    var state = { core: Object.assign({}, data.core), overrides: Object.assign({}, data.overrides), background: Object.assign({}, data.background), font: Object.assign({}, data.font) };

    function tokens() { return Object.assign(derive(state.core), state.overrides); }

    function applyPreview() {
        var t = tokens();
        var css = Object.keys(t).map(function (k) { return '--' + k + ':' + t[k]; }).join(';');
        // Paint the page-background colour on the preview directly so it updates live.
        preview.setAttribute('style', css + ';background:' + t['color-bg']);
    }
    function refreshAdvanced() {
        var t = tokens();
        Array.prototype.forEach.call(document.querySelectorAll('input[data-token]'), function (inp) {
            inp.value = t[inp.getAttribute('data-token')];
        });
    }

    // Core swatches → re-derive everything
    Array.prototype.forEach.call(document.querySelectorAll('input[data-core]'), function (inp) {
        inp.addEventListener('input', function () { state.core[inp.getAttribute('data-core')] = inp.value; refreshAdvanced(); applyPreview(); });
    });
    // Advanced per-token override
    Array.prototype.forEach.call(document.querySelectorAll('input[data-token]'), function (inp) {
        inp.addEventListener('input', function () { state.overrides[inp.getAttribute('data-token')] = inp.value; applyPreview(); });
    });
    // Background (scrim/image — wired in 3c)
    Array.prototype.forEach.call(document.querySelectorAll('input[data-bg]'), function (inp) {
        inp.addEventListener('input', function () { state.background[inp.getAttribute('data-bg')] = inp.value; applyPreview(); });
    });
    // Fonts (dropdowns). Combine the chosen Google families into one stylesheet URL, load it for the
    // preview, and apply the font-family to the preview so the change is visible.
    function applyFonts() {
        var fams = [];
        ['body', 'heading'].forEach(function (k) {
            var sel = document.querySelector('select[data-font="' + k + '"]');
            if (!sel) return;
            var g = sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].getAttribute('data-google');
            if (g && fams.indexOf(g) === -1) fams.push(g);
        });
        state.font.googleUrl = fams.length ? 'https://fonts.googleapis.com/css2?' + fams.map(function (f) { return 'family=' + f; }).join('&') + '&display=swap' : '';
        var link = document.getElementById('tp-fontlink');
        if (state.font.googleUrl) {
            if (!link) { link = document.createElement('link'); link.id = 'tp-fontlink'; link.rel = 'stylesheet'; document.head.appendChild(link); }
            link.href = state.font.googleUrl;
        }
        preview.style.fontFamily = state.font.body || '';
        var h = preview.querySelector('h2'); if (h) h.style.fontFamily = state.font.heading || state.font.body || '';
    }
    Array.prototype.forEach.call(document.querySelectorAll('select[data-font]'), function (sel) {
        sel.addEventListener('change', function () { state.font[sel.getAttribute('data-font')] = sel.value; applyFonts(); });
    });

    // Presets fill the core colours (and clear overrides for a clean start)
    Array.prototype.forEach.call(document.querySelectorAll('button[data-preset]'), function (btn) {
        btn.addEventListener('click', function () {
            var preset = btn.getAttribute('data-preset') === 'light' ? data.lightCore : data.darkCore;
            state.core = Object.assign({}, preset);
            state.overrides = {};
            Array.prototype.forEach.call(document.querySelectorAll('input[data-core]'), function (inp) { inp.value = state.core[inp.getAttribute('data-core')]; });
            refreshAdvanced(); applyPreview();
        });
    });

    // Save
    var saveBtn = document.getElementById('tp-save'), saveStatus = document.getElementById('tp-save-status');
    if (saveBtn) saveBtn.addEventListener('click', function () {
        saveBtn.disabled = true;
        if (saveStatus) { saveStatus.style.color = ''; saveStatus.textContent = 'Saving…'; }
        var mode = lum(state.core.bg) > 0.55 ? 'light' : 'dark';
        var payload = { mode: mode, core: state.core, overrides: state.overrides, tokens: tokens(), background: state.background, font: state.font };
        fetch(window.JADE_BASE + '/admin/theme', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'theme=' + encodeURIComponent(JSON.stringify(payload)) })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                saveBtn.disabled = false;
                if (r.status === 'OK') { if (saveStatus) { saveStatus.style.color = '#4caf50'; saveStatus.textContent = '✓ Saved — reload to see it applied'; } }
                else if (saveStatus) { saveStatus.style.color = '#c44'; saveStatus.textContent = '✗ ' + r.status; }
            })
            .catch(function () { saveBtn.disabled = false; if (saveStatus) { saveStatus.style.color = '#c44'; saveStatus.textContent = '✗ Network error'; } });
    });

    refreshAdvanced();
    applyPreview();
    applyFonts();
}());
