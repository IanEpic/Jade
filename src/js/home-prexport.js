// home-prexport.js
// Admin Export PR Info: request a background build, poll status, and download when ready.
// The build runs server-side regardless of the page, and the admin is emailed a link too.

(function () {
    var btn = document.getElementById('pe-build');
    if (!btn) return;
    var statusEl = document.getElementById('pe-status');
    var buildUrl = btn.getAttribute('data-build');
    var statusUrl = btn.getAttribute('data-status');
    var downloadUrl = btn.getAttribute('data-download');
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];
    var timer = null;

    function spinner(msg) { statusEl.className = 'pe-status'; statusEl.innerHTML = '<span class="pe-spinner"></span>' + msg; }
    function info(msg, cls) { statusEl.className = 'pe-status ' + (cls || ''); statusEl.innerHTML = msg; }

    function poll(id) {
        fetch(statusUrl + '?id=' + id, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.ok) return;
                if (d.status === 'pending' || d.status === 'running') {
                    spinner('Building your export… you can leave this page; we’ll email you when it’s ready.');
                } else if (d.status === 'done') {
                    clearInterval(timer); timer = null; btn.disabled = false;
                    if (d.deleted) info('That export has been removed. Build a new one to download again.', 'pe-err');
                    else info('Export ready (' + (d.filecount || 0) + ' files). <a href="' + downloadUrl + '?id=' + id + '">Download the zip</a>.', 'pe-ok');
                } else if (d.status === 'error') {
                    clearInterval(timer); timer = null; btn.disabled = false;
                    info('Export failed: ' + (d.error || 'unknown error'), 'pe-err');
                }
            })
            .catch(function () {});
    }

    function track(id) {
        if (timer) clearInterval(timer);
        poll(id);
        timer = setInterval(function () { poll(id); }, 5000);
    }

    btn.addEventListener('click', function () {
        btn.disabled = true;
        spinner('Queuing your export…');
        fetch(buildUrl, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }, body: '{}' })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.ok) track(d.id); else { btn.disabled = false; info('Could not start the export.', 'pe-err'); } })
            .catch(function () { btn.disabled = false; info('Could not start the export.', 'pe-err'); });
    });

    // Resume tracking if a build was already in flight when the page loaded.
    var existingId = statusEl.getAttribute('data-id');
    if (existingId && statusEl.getAttribute('data-inflight')) { btn.disabled = true; track(existingId); }
    else if (existingId && statusEl.getAttribute('data-ready')) {
        info('A previous export is ready. <a href="' + downloadUrl + '?id=' + existingId + '">Download the zip</a>.', 'pe-ok');
    }
}());
