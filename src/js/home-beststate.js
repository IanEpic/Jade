// home-beststate.js
// Calc Best State: "Regenerate from ABS (AI)" runs a slow web-search lookup, so it's done
// via AJAX with a progress placeholder and a Cancel button rather than a blocking form post.

(function () {
    // Strip the one-shot refresh flags from the URL so a manual reload (F5) doesn't re-show
    // the "checked / refreshed / error" banner. The server-rendered banner stays for this view.
    if (window.history && /[?&](popsame|poprefreshed|poperror)=/.test(location.search)) {
        var clean = location.search
            .replace(/([?&])(popsame|poprefreshed|poperror)=[^&]*/g, '$1')
            .replace(/[?&]+$/, '').replace(/&&+/g, '&').replace(/\?&/, '?');
        history.replaceState(null, '', location.pathname + clean + location.hash);
    }

    // Render the stored UTC "computed" timestamp in the viewer's local time.
    var ts = document.getElementById('bs-computedat');
    if (ts && ts.getAttribute('data-utc')) {
        var d = new Date(ts.getAttribute('data-utc'));
        if (!isNaN(d)) ts.textContent = d.toLocaleString();
    }

    function clearBanners() {
        Array.prototype.forEach.call(document.querySelectorAll('.bs-refresh-banner'), function (b) {
            b.style.display = 'none';
        });
    }

    var btn = document.getElementById('bs-regen');
    if (!btn) return;

    var box     = document.getElementById('bs-regen-box');
    var cancel  = document.getElementById('bs-regen-cancel');
    var base    = btn.getAttribute('data-base') || '';      // /<slug>/home?action=beststate
    var refresh = btn.getAttribute('data-refresh') || '';   // /<slug>/beststate/refresh
    var controller = null;

    function show(on) {
        if (box) box.style.display = on ? 'flex' : 'none';
        btn.disabled = on;
    }

    btn.addEventListener('click', function () {
        clearBanners();           // hide any stale "checked / refreshed" banner during the run
        controller = new AbortController();
        show(true);
        fetch(refresh, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: '{}',
            signal: controller.signal,
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d.ok) {
                show(false);
                window.location = base + '&poperror=' + encodeURIComponent(d.error || 'lookup failed');
                return;
            }
            window.location = base + (d.changed ? '&poprefreshed=' + d.changed : '&popsame=1');
        })
        .catch(function (err) {
            show(false);
            if (err && err.name === 'AbortError') return;       // user cancelled — stay put
            window.location = base + '&poperror=' + encodeURIComponent('network error');
        });
    });

    if (cancel) cancel.addEventListener('click', function () {
        if (controller) controller.abort();
        show(false);
    });
}());
