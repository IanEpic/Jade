// home-users.js — activate button AJAX + search focus + batch payments
(function () {
    document.querySelectorAll('.activate-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var uid = btn.dataset.userid;
            fetch((window.JADE_BASE || '') + '/formUser?action=activate&edituserid=' + uid, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.ok) {
                    var row = btn.closest('tr');
                    btn.remove();
                    if (row) {
                        row.querySelectorAll('.badge-unactivated').forEach(function (b) { b.remove(); });
                    }
                }
            })
            .catch(function () { alert('Activation failed. Please try again.'); });
        });
    });

    var search = document.getElementById('user-search');
    if (search) search.focus();

    // ── Pay-override badge update ─────────────────────────────────────────────
    function updatePayBadge(row) {
        var payOpen    = row.getAttribute('data-paymentsopen') === '1';
        var payDefault = row.getAttribute('data-paydefault')   === '1';
        var nameCell = row.cells[1];
        if (!nameCell) return;
        var existing = nameCell.querySelector('.pay-override-flag');
        if (payOpen === payDefault) {
            if (existing) existing.remove();
        } else {
            if (!existing) {
                existing = document.createElement('span');
                existing.className = 'pay-override-flag badge-pay-override';
                nameCell.appendChild(existing);
            }
            existing.textContent = payOpen ? 'pay: open' : 'pay: closed';
        }
    }

    // ── Batch selection ───────────────────────────────────────────────────────
    var batchBar    = document.getElementById('u-batch-bar');
    var batchCount  = document.getElementById('u-batch-count');
    var btnPayOpen  = document.getElementById('u-batch-pay-open');
    var btnPayClose = document.getElementById('u-batch-pay-close');
    var btnClear    = document.getElementById('u-batch-clear');
    var selectAll   = document.getElementById('u-select-all');

    function getChecked() {
        return Array.from(document.querySelectorAll('.u-checkbox:checked'));
    }

    function updateBatchBar() {
        var checked = getChecked();
        if (!batchBar) return;
        if (checked.length > 0) {
            batchBar.classList.add('active');
            batchCount.textContent = checked.length + ' selected';
        } else {
            batchBar.classList.remove('active');
        }
        if (selectAll) {
            var visible = Array.from(document.querySelectorAll('.u-checkbox')).filter(function (cb) {
                return !cb.closest('tr').classList.contains('hidden');
            });
            selectAll.checked = visible.length > 0 && visible.every(function (cb) { return cb.checked; });
            selectAll.indeterminate = checked.length > 0 && !selectAll.checked;
        }
    }

    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('u-checkbox') || e.target.id === 'u-select-all') {
            if (e.target.id === 'u-select-all') {
                var visible = Array.from(document.querySelectorAll('.u-checkbox')).filter(function (cb) {
                    return !cb.closest('tr').classList.contains('hidden');
                });
                visible.forEach(function (cb) { cb.checked = e.target.checked; });
            }
            updateBatchBar();
        }
    });

    function doBatch(paymentsopen) {
        var ids = getChecked().map(function (cb) { return cb.value; });
        if (!ids.length) return;
        var btn = paymentsopen ? btnPayOpen : btnPayClose;
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        var fd = new URLSearchParams();
        ids.forEach(function (id) { fd.append('userids', id); });
        fd.append('paymentsopen', paymentsopen ? '1' : '0');

        fetch(window.JADE_BASE + '/formUser/batch-payments', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok) {
                if (btn) { btn.disabled = false; btn.textContent = paymentsopen ? 'Payments Open' : 'Payments Closed'; }
                return;
            }
            ids.forEach(function (id) {
                var row = document.querySelector('tr[data-userid="' + id + '"]');
                if (row) {
                    row.setAttribute('data-paymentsopen', paymentsopen ? '1' : '0');
                    updatePayBadge(row);
                }
            });
            document.querySelectorAll('.u-checkbox:checked').forEach(function (cb) { cb.checked = false; });
            if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
            if (batchBar) batchBar.classList.remove('active');
            if (btn) { btn.disabled = false; btn.textContent = paymentsopen ? 'Payments Open' : 'Payments Closed'; }
        })
        .catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = paymentsopen ? 'Payments Open' : 'Payments Closed'; }
        });
    }

    if (btnPayOpen)  btnPayOpen.addEventListener('click',  function () { doBatch(true); });
    if (btnPayClose) btnPayClose.addEventListener('click', function () { doBatch(false); });
    if (btnClear) btnClear.addEventListener('click', function () {
        document.querySelectorAll('.u-checkbox:checked').forEach(function (cb) { cb.checked = false; });
        if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
        if (batchBar) batchBar.classList.remove('active');
    });

    // ── :pay search keyword ───────────────────────────────────────────────────
    if (search) {
        search.addEventListener('input', function () {
            var q = this.value.trim();
            var rows = document.querySelectorAll('.users-table tbody tr');
            if (q === ':pay') {
                rows.forEach(function (row) {
                    var payOpen    = row.getAttribute('data-paymentsopen') === '1';
                    var payDefault = row.getAttribute('data-paydefault')   === '1';
                    row.classList.toggle('hidden', payOpen === payDefault);
                });
            } else if (q === ':admin') {
                rows.forEach(function (row) {
                    row.classList.toggle('hidden', !row.querySelector('.badge-admin'));
                });
            } else if (q === ':judge') {
                rows.forEach(function (row) {
                    row.classList.toggle('hidden', !row.querySelector('.badge-judge'));
                });
            } else if (q === ':online') {
                rows.forEach(function (row) {
                    row.classList.toggle('hidden', !row.querySelector('.online-dot'));
                });
            } else if (q.charAt(0) === ':') {
                rows.forEach(function (row) { row.classList.remove('hidden'); });
            }
            // else: jade.js handles normal text queries
        });
    }
}());
