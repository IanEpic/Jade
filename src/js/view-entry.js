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

// File download links — HEAD check, replace link with [Upload Error] on 404
document.querySelectorAll('a.ve-doc-link').forEach(function (a) {
    fetch(a.href, { method: 'HEAD' })
        .then(function (r) { if (r.status === 404) uploadError(a); })
        .catch(function () {});
});
