// home-headlinewinners.js
// Admin Headline Winners (Judging): selecting a radio saves that entry as the headline
// award's winner immediately.

(function () {
    var wrap = document.querySelector('.hw-wrap');
    if (!wrap) return;
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];

    function flash(el, ok) {
        if (!el) return;
        el.textContent = ok ? '✓ Saved' : 'Error';
        el.style.color = ok ? '#4caf50' : '#f88';
        if (ok) setTimeout(function () { if (el.textContent === '✓ Saved') el.textContent = ''; }, 2000);
    }

    document.addEventListener('change', function (e) {
        var r = e.target.closest('input[type="radio"][data-headlineid]');
        if (!r) return;
        var hid = r.getAttribute('data-headlineid');
        fetch(base + '/citation/headlinewinner', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ headlinecategoryid: hid, entryid: r.value }),
        })
            .then(function (resp) { return resp.json(); })
            .then(function (d) { flash(document.querySelector('.hw-status[data-headlineid="' + hid + '"]'), d.ok); })
            .catch(function () { flash(document.querySelector('.hw-status[data-headlineid="' + hid + '"]'), false); });
    });
}());
