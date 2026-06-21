// jade.js — shared JADE platform utilities

/**
 * Show or hide an element.
 * @param {HTMLElement} el
 * @param {boolean} show
 */
function showHide(el, show) {
    el.style.display = show ? '' : 'none';
}

/**
 * Generic table row filter wired to a search input.
 * Use the data-filter attribute instead of an inline oninput handler:
 *   <input data-filter=".my-table tbody tr">
 *
 * @param {HTMLInputElement} input   — the search input element
 * @param {string}           rowSel — CSS selector for the rows to filter
 */
function jadeTableFilter(input, rowSel) {
    var q = input.value.toLowerCase();
    document.querySelectorAll(rowSel).forEach(function(row) {
        row.classList.toggle('hidden', q.length > 0 && row.textContent.toLowerCase().indexOf(q) === -1);
    });
}

// ── Delegated handlers (replaces all inline event attributes) ─────────────────

// data-filter="<row-selector>"  →  live table search on input
document.addEventListener('input', function (e) {
    var rows = e.target.dataset && e.target.dataset.filter;
    // Queries starting with ':' are handled by page-specific JS (e.g. :open).
    if (rows && e.target.value.charAt(0) !== ':') jadeTableFilter(e.target, rows);
});

// data-confirm="<message>"  →  confirm dialog before following a link / submitting
document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-confirm]');
    if (!el) return;
    if (!confirm(el.dataset.confirm)) e.preventDefault();
});

// data-nosubmit  →  suppress form submission (client-side-only search forms)
document.addEventListener('submit', function (e) {
    if (e.target.dataset && 'nosubmit' in e.target.dataset) e.preventDefault();
});

// data-action="print"  →  window.print()
document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action="print"]');
    if (!el) return;
    e.preventDefault();
    window.print();
});

// ── Session keep-alive ────────────────────────────────────────────────────────
// Pings /:slug/ping every 10 minutes while the tab is open.
// Also pings immediately when the tab becomes visible again (wake from sleep).
// On 401, shows a non-destructive warning banner so the user can log in on
// another tab and return to finish their work without losing unsaved data.
(function () {
    var PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
    var warned = false;
    var pingTimer = null;

    function pingUrl() {
        // JADE_BASE is set by the shell template: window.JADE_BASE = '/:slug'
        return (window.JADE_BASE || '') + '/ping';
    }

    function showExpiredBanner() {
        if (warned) return;
        warned = true;
        var banner = document.createElement('div');
        banner.id = 'session-expired-banner';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
            'background:#7a2a00', 'color:#fff', 'padding:12px 20px',
            'font-size:14px', 'text-align:center', 'box-shadow:0 2px 8px rgba(0,0,0,0.5)',
        ].join(';');
        banner.innerHTML =
            '<strong>Your session has expired.</strong> ' +
            'Open a <a href="' + (window.JADE_BASE || '') + '/login" target="_blank" ' +
            'style="color:#ffd;text-decoration:underline;">new tab to log in</a>, ' +
            'then return here to continue. Your unsaved work is still on this page.';
        document.body.insertBefore(banner, document.body.firstChild);
    }

    function ping() {
        fetch(pingUrl(), { credentials: 'same-origin' })
            .then(function (r) { if (r.status === 401) showExpiredBanner(); })
            .catch(function () {}); // network error — silently ignore
    }

    function startPing() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(ping, PING_INTERVAL);
    }

    // Ping on visibility change (tab focus / wake from sleep)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') ping();
    });

    startPing();
}());
