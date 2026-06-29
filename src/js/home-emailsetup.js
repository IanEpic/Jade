// home-emailsetup.js — Admin → Theme → Email Setup: optional email banner upload (click/drag/drop
// + delete). Mirrors the brand-asset helpers in home-theme.js; reloads to refresh the live preview.

function esUpload(btnId, inputId, statusId, url, field) {
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

function esDelete(btnId, url, confirmMsg) {
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

function esDrop(boxId, inputId, statusId, url, field, accept) {
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

// Masthead colour save — POST the hex, reload to refresh the live preview.
(function () {
    var btn = document.getElementById('es-mhbg-save'), input = document.getElementById('es-mhbg'), status = document.getElementById('es-mhbg-status');
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
        btn.disabled = true;
        if (status) { status.style.color = ''; status.textContent = 'Saving…'; }
        fetch(window.JADE_BASE + '/admin/email-settings', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'emailHeaderBg=' + encodeURIComponent(input.value),
        })
            .then(function (r) { return r.json(); })
            .then(function (r) { if (r.status === 'OK') location.reload(); else { btn.disabled = false; if (status) { status.style.color = '#c44'; status.textContent = '✗ Save failed'; } } })
            .catch(function () { btn.disabled = false; if (status) { status.style.color = '#c44'; status.textContent = '✗ Network error'; } });
    });
})();

esUpload('emailheader-btn', 'emailheader-input', 'emailheader-status', '/admin/upload-emailheader', 'emailheader');
esDelete('emailheader-delete-btn', '/admin/delete-emailheader', 'Remove the email banner and use the portal logo on the masthead instead?');
esDrop('emailheader-box', 'emailheader-input', 'emailheader-status', '/admin/upload-emailheader', 'emailheader', /\.(png|jpe?g)$/i);
