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
