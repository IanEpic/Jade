// form-admin.js — program admin form: accordion toggle + lazy TinyMCE init

var TINYMCE_CONFIG = {
    plugins:  'anchor autolink lists link image table code fullscreen',
    toolbar:  'undo redo | blocks | bold italic underline | forecolor backcolor | alignleft aligncenter alignright | bullist numlist | link image table | code fullscreen',
    menubar:  false,
    height:   250,
    skin:     'oxide-dark',
    content_css: 'dark',
    promotion: false,
};

function initEditorsIn(container) {
    container.querySelectorAll('textarea.mceEditor').forEach(function(ta) {
        if (ta.id && !tinymce.get(ta.id)) {
            tinymce.init(Object.assign({ target: ta }, TINYMCE_CONFIG));
        }
    });
}

document.addEventListener('click', function(e) {
    var legend = e.target.closest('[data-action="toggle-accordion"]');
    if (!legend) return;
    var body      = legend.nextElementSibling;
    var collapsed = body.style.display === 'none' || body.style.display === '';
    body.style.display = collapsed ? 'block' : 'none';
    legend.classList.toggle('collapsed', !collapsed);
    if (collapsed) initEditorsIn(body);
});

// ── Favicon upload ────────────────────────────────────────────────────────────
var faviconDeleteBtn = document.getElementById('favicon-delete-btn');
if (faviconDeleteBtn) {
    faviconDeleteBtn.addEventListener('click', function () {
        if (!confirm('Remove the custom favicon and revert to the JADE default?')) return;
        faviconDeleteBtn.disabled = true;
        fetch(window.JADE_BASE + '/admin/delete-favicon', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (r.status === 'OK') { location.reload(); }
                else {
                    faviconDeleteBtn.disabled = false;
                    alert('Delete failed (' + r.status + ')');
                }
            })
            .catch(function () {
                faviconDeleteBtn.disabled = false;
                alert('Network error');
            });
    });
}

var faviconBtn    = document.getElementById('favicon-btn');
var faviconInput  = document.getElementById('favicon-input');
var faviconStatus = document.getElementById('favicon-status');

if (faviconBtn && faviconInput) {
    faviconBtn.addEventListener('click', function () { faviconInput.click(); });
    faviconInput.addEventListener('change', function () {
        var file = faviconInput.files[0];
        if (!file) return;
        faviconStatus.textContent = 'Uploading…';
        var fd = new FormData();
        fd.append('favicon', file);
        fetch(window.JADE_BASE + '/admin/upload-favicon', { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (r.status === 'OK') {
                    faviconStatus.style.color = '#4caf50';
                    faviconStatus.textContent = '✓ Saved — reload to see updated icon';
                } else {
                    faviconStatus.style.color = '#c44';
                    faviconStatus.textContent = '✗ Upload failed (' + r.status + ')';
                }
            })
            .catch(function () {
                faviconStatus.style.color = '#c44';
                faviconStatus.textContent = '✗ Network error';
            });
    });
}

// ── Document header image upload ────────────────────────────────────────────────
var docHeaderDeleteBtn = document.getElementById('docheader-delete-btn');
if (docHeaderDeleteBtn) {
    docHeaderDeleteBtn.addEventListener('click', function () {
        if (!confirm('Remove the document header image and use the program name as text?')) return;
        docHeaderDeleteBtn.disabled = true;
        fetch(window.JADE_BASE + '/admin/delete-docheader', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (r.status === 'OK') { location.reload(); }
                else { docHeaderDeleteBtn.disabled = false; alert('Delete failed (' + r.status + ')'); }
            })
            .catch(function () { docHeaderDeleteBtn.disabled = false; alert('Network error'); });
    });
}

var docHeaderBtn    = document.getElementById('docheader-btn');
var docHeaderInput  = document.getElementById('docheader-input');
var docHeaderStatus = document.getElementById('docheader-status');

if (docHeaderBtn && docHeaderInput) {
    docHeaderBtn.addEventListener('click', function () { docHeaderInput.click(); });
    docHeaderInput.addEventListener('change', function () {
        var file = docHeaderInput.files[0];
        if (!file) return;
        docHeaderStatus.textContent = 'Uploading…';
        var fd = new FormData();
        fd.append('docheader', file);
        fetch(window.JADE_BASE + '/admin/upload-docheader', { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (r.status === 'OK') { location.reload(); }
                else {
                    docHeaderStatus.style.color = '#c44';
                    docHeaderStatus.textContent = '✗ Upload failed (' + r.status + ')';
                }
            })
            .catch(function () {
                docHeaderStatus.style.color = '#c44';
                docHeaderStatus.textContent = '✗ Network error';
            });
    });
}
