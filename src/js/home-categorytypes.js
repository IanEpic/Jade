// home-categorytypes.js
// Admin Category Types (Setup): rename / add / delete types + assign categories.
// AI rules are edited on the Finalist Text Rules page.

(function () {
    var wrap = document.querySelector('.ct-wrap');
    if (!wrap) return;
    var base = window.JADE_BASE || (location.pathname.match(/^\/[^/]+(?=\/)/) || [''])[0];

    function post(path, data) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        }).then(function (r) { return r.json(); });
    }
    function flash(el, msg, colour) {
        if (!el) return;
        el.textContent = msg;
        el.style.color = colour || '#4caf50';
        if (colour !== '#f88') setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
    }
    function statusBy(attr, val) { return document.querySelector('.ct-status[data-' + attr + '="' + val + '"]'); }

    document.addEventListener('click', function (e) {
        var saveBtn = e.target.closest('.ct-type-save');
        if (saveBtn) {
            var id = saveBtn.getAttribute('data-typeid');
            var name = document.querySelector('input.ct-name[data-typeid="' + id + '"]').value;
            post('/categoryTypes/type', { categorytypeid: id, name: name })
                .then(function (d) { flash(statusBy('typeid', id), d.ok ? '✓' : 'Error', d.ok ? null : '#f88'); })
                .catch(function () { flash(statusBy('typeid', id), 'Error', '#f88'); });
            return;
        }
        var delBtn = e.target.closest('.ct-type-delete');
        if (delBtn) {
            var did = delBtn.getAttribute('data-typeid');
            post('/categoryTypes/delete', { categorytypeid: did }).then(function (d) {
                if (d.ok) {
                    var card = document.querySelector('.ct-type[data-typeid="' + did + '"]');
                    if (card) card.remove();
                    document.querySelectorAll('.ct-assign option[value="' + did + '"]').forEach(function (o) { o.remove(); });
                }
            });
            return;
        }
        if (e.target.closest('#ct-add')) {
            var nm = document.getElementById('ct-new-name').value.trim();
            if (!nm) return;
            post('/categoryTypes/type', { name: nm })
                .then(function (d) { flash(document.getElementById('ct-add-status'), d.ok ? '✓ Added — reload to assign' : 'Error', d.ok ? null : '#f88'); });
            return;
        }
    });

    document.addEventListener('change', function (e) {
        var sel = e.target.closest('.ct-assign');
        if (sel) {
            var cid = sel.getAttribute('data-categoryid');
            post('/categoryTypes/assign', { categoryid: cid, categorytypeid: sel.value })
                .then(function (d) { flash(statusBy('categoryid', cid), d.ok ? '✓' : '✕', d.ok ? null : '#f88'); })
                .catch(function () { flash(statusBy('categoryid', cid), '✕', '#f88'); });
            return;
        }
        var feed = e.target.closest('.ct-feedsto');
        if (feed) {
            var tid = feed.getAttribute('data-typeid');
            post('/categoryTypes/feedsto', { categorytypeid: tid, feedsto: feed.value })
                .then(function (d) { flash(statusBy('typeid', tid), d.ok ? '✓' : '✕', d.ok ? null : '#f88'); })
                .catch(function () { flash(statusBy('typeid', tid), '✕', '#f88'); });
        }
    });
}());
