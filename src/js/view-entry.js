// view-entry.js — handles broken media in viewEntry

function uploadError(el) {
    var placeholder = document.createElement('span');
    placeholder.className = 've-q-noresp';
    placeholder.textContent = '[Upload Error]';
    el.parentNode.replaceChild(placeholder, el);
}

// Images — replace broken img with [Upload Error]
document.querySelectorAll('.ve-media img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) {
        uploadError(img);
    } else {
        img.addEventListener('error', function () { uploadError(img); });
    }
});

// Videos — replace broken video with [Upload Error]
document.querySelectorAll('.ve-media video').forEach(function (vid) {
    vid.addEventListener('error', function () { uploadError(vid); });
});

// Finalise form — submit via AJAX so the user stays on the entry page
var finaliseCheckbox = document.getElementById('finalise-checkbox');
var finaliseRecord   = document.getElementById('finalise-record');
var editEntryBtn     = document.getElementById('edit-entry-btn');
if (finaliseCheckbox && finaliseRecord && editEntryBtn) {
    finaliseRecord.addEventListener('click', function (e) {
        e.preventDefault();
        var form = finaliseRecord.closest('form');
        fetch(form.action, {
            method:  'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                entryid:  form.querySelector('[name=entryid]').value,
                finalise: finaliseCheckbox.checked ? 'on' : '',
            }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.ok) {
                editEntryBtn.style.display = data.finalised ? 'none' : '';
            }
        })
        .catch(function () {});
    });
}

// Print buttons — onclick blocked by CSP script-src-attr 'none', wire up here
document.querySelectorAll('button.btn-print').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
});

// File download links — HEAD check, replace link with [Upload Error] on 404
document.querySelectorAll('a.ve-doc-link').forEach(function (a) {
    fetch(a.href, { method: 'HEAD' })
        .then(function (r) { if (r.status === 404) uploadError(a); })
        .catch(function () {});
});
