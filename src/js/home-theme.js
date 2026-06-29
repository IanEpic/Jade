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
