// home-cqdocs.js
// Admin Category Documents: queue a background build, poll status, and reload to show the results.
// The build runs server-side on the leader node regardless of the page, so navigating away is safe.

(function () {
    var btn = document.getElementById('cq-build');
    if (!btn) return;
    var statusEl  = document.getElementById('cq-status');
    var genUrl    = btn.getAttribute('data-generate');
    var statusUrl = btn.getAttribute('data-status');
    var timer = null;

    function spinner(msg) { statusEl.className = 'cq-status'; statusEl.innerHTML = '<span class="cq-spinner"></span>' + msg; }
    function info(msg, cls) { statusEl.className = 'cq-status'; statusEl.innerHTML = '<span class="' + (cls || '') + '">' + msg + '</span>'; }

    function poll(id) {
        fetch(statusUrl + '?id=' + id, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.ok) return;
                if (d.status === 'pending' || d.status === 'running') {
                    spinner('Building documents… this can take a few minutes. You can leave this page — it keeps running.');
                } else if (d.status === 'done') {
                    clearInterval(timer); timer = null;
                    info('✓ Done — ' + (d.filecount || 0) + ' documents generated. Reloading…', 'cq-ok');
                    setTimeout(function () { location.reload(); }, 900);
                } else if (d.status === 'error') {
                    clearInterval(timer); timer = null; btn.disabled = false;
                    info('✗ Generation failed: ' + (d.error || 'unknown error'), 'cq-err');
                }
            })
            .catch(function () {});
    }

    function track(id) {
        if (timer) clearInterval(timer);
        poll(id);
        timer = setInterval(function () { poll(id); }, 3000);
    }

    btn.addEventListener('click', function () {
        btn.disabled = true;
        spinner('Queuing…');
        fetch(genUrl, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.ok) track(d.id); else { btn.disabled = false; info('✗ Could not start generation.', 'cq-err'); } })
            .catch(function () { btn.disabled = false; info('✗ Could not start generation.', 'cq-err'); });
    });

    // Resume tracking if a build was already in flight when the page loaded.
    var existingId = statusEl.getAttribute('data-jobid');
    if (existingId && statusEl.getAttribute('data-inflight')) { btn.disabled = true; track(existingId); }
}());
