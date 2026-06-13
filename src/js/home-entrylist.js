// home-entrylist.js
// Admin entry flags inline edit form for /home?action=entrylist.

(function () {
    var wrap            = document.getElementById('flags-form-wrap');
    var title           = document.getElementById('flags-entry-title');
    var idFld           = document.getElementById('flags-entryid');
    var chkAcc          = document.getElementById('flags-entryaccepted');
    var chkOpn          = document.getElementById('flags-entryopen');
    var chkFin          = document.getElementById('flags-finalised');
    var selCat          = document.getElementById('flags-overridecatid');
    var origNote        = document.getElementById('flags-original-note');
    var catFieldset     = document.getElementById('flags-catoverride-fieldset');
    var transferFset    = document.getElementById('flags-transfer-fieldset');
    var transferSrcFld  = document.getElementById('transfer-sourceentryid');
    var transferSearch  = document.getElementById('transfer-search');
    var transferHidden  = document.getElementById('transfer-targetentryid');
    var transferSuggest = document.getElementById('transfer-suggestions');
    var transferNote    = document.getElementById('transfer-note');
    var btnCnl          = document.getElementById('flags-cancel');
    var flagsForm       = wrap ? wrap.querySelector('form[action="/formEntryFlags"]') : null;
    var transferForm    = wrap ? wrap.querySelector('form[action="/formEntryFlags/transfer"]') : null;
    var saveBtn         = flagsForm   ? flagsForm.querySelector('button[type="submit"]')   : null;
    var transferBtn     = transferForm ? transferForm.querySelector('button[type="submit"]') : null;

    if (!wrap) return; // not admin

    // ── Table re-sort ─────────────────────────────────────────────────────────
    // Groups: Entered (badge-entered=0) → Invoiced (badge-invoiced=1) → Unpaid (badge-unpaid=2)
    // Within each group: sort by categoryname

    function resortTable() {
        var tbody = document.querySelector('.el-table tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr'));

        function groupOf(row) {
            var badge = row.querySelector('.badge');
            if (!badge) return 2;
            if (badge.classList.contains('badge-entered'))  return 0;
            if (badge.classList.contains('badge-invoiced')) return 1;
            return 2;
        }

        rows.sort(function (a, b) {
            var ga = groupOf(a), gb = groupOf(b);
            if (ga !== gb) return ga - gb;
            var ca = a.getAttribute('data-categoryname') || '';
            var cb = b.getAttribute('data-categoryname') || '';
            return ca.localeCompare(cb);
        });

        rows.forEach(function (row) { tbody.appendChild(row); });
    }

    // ── Category name lookup from the override select ─────────────────────────
    function catNameById(catid) {
        if (!selCat || !catid) return '';
        var opt = selCat.querySelector('option[value="' + catid + '"]');
        return opt ? opt.textContent : '';
    }

    // ── Flash a button with a temporary label ────────────────────────────────
    function flashBtn(btn, label, ms) {
        if (!btn) return;
        var orig = btn.textContent;
        btn.textContent = label;
        btn.disabled = false;
        setTimeout(function () { btn.textContent = orig; }, ms || 1500);
    }

    // ── Update a table row after a successful flags AJAX save ────────────────
    function updateRowFromFlags(row, data) {
        row.setAttribute('data-entryaccepted', data.entryaccepted ? '1' : '0');
        row.setAttribute('data-entryopen',     data.entryopen     ? '1' : '0');
        row.setAttribute('data-finalised',     data.finalised     ? '1' : '0');
        row.setAttribute('data-categoryid',    String(data.categoryid   || ''));
        row.setAttribute('data-originalcatid', String(data.originalcatid != null ? data.originalcatid : ''));

        // Update badge if accepted state changed
        var badge = row.querySelector('.badge');
        if (badge && data.entryaccepted) {
            badge.textContent = 'Entered';
            badge.className   = 'badge badge-entered';
        } else if (badge && !data.entryaccepted) {
            // If it was Entered before and is now un-accepted, drop to Unpaid
            // (we don't know invoice state from flags data, so use Unpaid as safe default)
            if (badge.classList.contains('badge-entered')) {
                badge.textContent = 'Unpaid';
                badge.className   = 'badge badge-unpaid';
            }
        }

        // Update category cell if category was overridden
        var newCatName = catNameById(String(data.categoryid || ''));
        if (newCatName) {
            row.setAttribute('data-categoryname', newCatName);
            var origcatid  = String(data.originalcatid != null ? data.originalcatid : '');
            var origCatName = catNameById(origcatid);
            row.setAttribute('data-originalcatname', origCatName);
            var catCell = row.cells[2];
            if (catCell) {
                catCell.textContent = newCatName;
                if (origcatid) {
                    var span = document.createElement('span');
                    span.className   = 'cat-overridden';
                    span.textContent = ' (overridden)';
                    catCell.appendChild(span);
                }
            }
        }
    }

    // ── AJAX save for flags form ──────────────────────────────────────────────
    if (flagsForm) {
        flagsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var entryid = idFld.value;
            var row = entryid ? document.querySelector('tr[data-entryid="' + entryid + '"]') : null;

            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

            fetch(flagsForm.action, {
                method:  'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body:    new FormData(flagsForm),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.ok) { flashBtn(saveBtn, 'Error'); return; }
                if (row) { updateRowFromFlags(row, data); updateEntryOpenBadge(row); }
                resortTable();
                flashBtn(saveBtn, '✓ Saved');
            })
            .catch(function () { flashBtn(saveBtn, 'Error'); });
        });
    }

    // ── AJAX save for transfer form ───────────────────────────────────────────
    if (transferForm) {
        transferForm.addEventListener('submit', function (e) {
            e.preventDefault();

            if (!transferHidden.value) {
                // No target selected — don't submit
                transferSearch.focus();
                return;
            }

            if (transferBtn) { transferBtn.disabled = true; transferBtn.textContent = 'Transferring…'; }

            var sourceId = transferSrcFld ? transferSrcFld.value : '';
            var targetId = transferHidden.value;

            fetch(transferForm.action, {
                method:  'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body:    new FormData(transferForm),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.ok) { flashBtn(transferBtn, 'Error'); return; }

                // Update source row → now unpaid
                var srcRow = document.querySelector('tr[data-entryid="' + sourceId + '"]');
                if (srcRow) {
                    srcRow.setAttribute('data-entryaccepted', '0');
                    var srcBadge = srcRow.querySelector('.badge');
                    if (srcBadge) { srcBadge.textContent = 'Unpaid'; srcBadge.className = 'badge badge-unpaid'; }
                }

                // Update target row → now entered
                var tgtRow = document.querySelector('tr[data-entryid="' + targetId + '"]');
                if (tgtRow) {
                    tgtRow.setAttribute('data-entryaccepted', '1');
                    var tgtBadge = tgtRow.querySelector('.badge');
                    if (tgtBadge) { tgtBadge.textContent = 'Entered'; tgtBadge.className = 'badge badge-entered'; }
                }

                resortTable();

                // Close the panel — payment has moved, the context no longer applies
                wrap.style.display = 'none';
                idFld.value = '';
            })
            .catch(function () { flashBtn(transferBtn, 'Error'); });
        });
    }

    // ── Transfer autocomplete ─────────────────────────────────────────────────
    var allEntries = [];

    function buildTransferDatalist(excludeEntryId) {
        allEntries = [];
        var rows = document.querySelectorAll('.el-table tbody tr');
        rows.forEach(function (row) {
            var eid = row.getAttribute('data-entryid') || '';
            if (eid === excludeEntryId) return;
            var entryname = row.getAttribute('data-entryname') || ('Entry #' + eid);
            var catname   = row.getAttribute('data-categoryname') || '';
            allEntries.push({
                id:     eid,
                label:  '#' + eid + ' — ' + entryname + ' (' + catname + ')',
                search: (eid + ' ' + entryname + ' ' + catname).toLowerCase(),
            });
        });
        transferSearch.value = '';
        transferHidden.value = '';
        hideSuggestions();
    }

    function hideSuggestions() {
        transferSuggest.style.display = 'none';
        transferSuggest.innerHTML = '';
    }

    function showSuggestions(matches) {
        transferSuggest.innerHTML = '';
        if (!matches.length) { hideSuggestions(); return; }
        matches.forEach(function (entry) {
            var div = document.createElement('div');
            div.textContent = entry.label;
            div.addEventListener('mousedown', function (e) {
                e.preventDefault();
                transferSearch.value = entry.label;
                transferHidden.value = entry.id;
                hideSuggestions();
            });
            transferSuggest.appendChild(div);
        });
        transferSuggest.style.display = 'block';
    }

    if (transferSearch) {
        transferSearch.addEventListener('input', function () {
            var q = transferSearch.value.trim().toLowerCase();
            transferHidden.value = '';
            if (q.length < 3) { hideSuggestions(); return; }
            var matches = allEntries.filter(function (e) { return e.search.indexOf(q) !== -1; });
            showSuggestions(matches);
        });
        transferSearch.addEventListener('blur', function () {
            setTimeout(hideSuggestions, 150);
        });
        transferSearch.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { hideSuggestions(); transferSearch.blur(); }
        });
    }

    // ── Open edit panel ───────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="edit-flags"]');
        if (!btn) return;
        e.preventDefault();

        var row = btn.closest('tr');
        if (!row) return;

        var entryid     = row.getAttribute('data-entryid')        || '';
        var categoryid  = row.getAttribute('data-categoryid')      || '';
        var accepted    = row.getAttribute('data-entryaccepted')   === '1';
        var open        = row.getAttribute('data-entryopen')        === '1';
        var final       = row.getAttribute('data-finalised')        === '1';
        var origcatid   = row.getAttribute('data-originalcatid')   || '';
        var origcatname = row.getAttribute('data-originalcatname') || '';
        var catname     = row.getAttribute('data-categoryname')    || '';
        var catOpen     = row.getAttribute('data-catopen')         === '1';
        var name        = row.getAttribute('data-entryname')       || ('Entry #' + entryid);

        idFld.value    = entryid;
        chkAcc.checked = accepted;
        chkOpn.checked = open;
        chkFin.checked = final;

        // Category Override: only when entries are CLOSED
        if (catFieldset) catFieldset.style.display = catOpen ? 'none' : '';
        selCat.value = categoryid;

        origNote.innerHTML = '';
        if (origcatid) {
            origNote.innerHTML =
                'Original category (questions &amp; responses): ' + (origcatname || 'ID ' + origcatid) + '<br>' +
                'Current category: ' + catname + '<br>' +
                'Select the original category to revert.';
        } else {
            origNote.innerHTML =
                'Current category: ' + catname + '<br>' +
                'Select a different category to override (original will be remembered).';
        }

        // Transfer Payment: only when entry is paid (accepted)
        if (transferFset) transferFset.style.display = accepted ? '' : 'none';
        if (transferSrcFld) transferSrcFld.value = entryid;
        buildTransferDatalist(entryid);

        if (transferNote) {
            transferNote.innerHTML = 'Entry #' + entryid + ' is paid (accepted). Transferring will move the invoice to the target and mark this entry as unpaid.';
        }

        // Reset buttons
        if (saveBtn)     { saveBtn.disabled     = false; saveBtn.textContent     = 'Save'; }
        if (transferBtn) { transferBtn.disabled  = false; transferBtn.textContent = 'Transfer Payment'; }

        title.textContent  = 'Edit Flags — ' + name;
        wrap.style.display = 'block';
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // ── Cancel ────────────────────────────────────────────────────────────────
    if (btnCnl) {
        btnCnl.addEventListener('click', function () {
            wrap.style.display = 'none';
            idFld.value = '';
        });
    }

    // ── Entry-open override badge ─────────────────────────────────────────────
    function updateEntryOpenBadge(row) {
        var entryOpen = row.getAttribute('data-entryopen') === '1';
        var catOpen   = row.getAttribute('data-catopen')   === '1';
        var statusBadge = row.querySelector('.badge:not(.entry-open-flag)');
        var cell = statusBadge ? statusBadge.parentElement : null;
        if (!cell) return;
        var existing = cell.querySelector('.entry-open-flag');
        if (entryOpen && !catOpen) {
            if (!existing) {
                existing = document.createElement('span');
                existing.className = 'entry-open-flag badge badge-open-override';
                existing.textContent = 'open';
                cell.appendChild(existing);
            }
        } else {
            if (existing) existing.remove();
        }
    }

    // ── Batch selection ───────────────────────────────────────────────────────
    var batchBar     = document.getElementById('batch-bar');
    var batchCount   = document.getElementById('batch-count');
    var batchOpen    = document.getElementById('batch-open');
    var batchClose   = document.getElementById('batch-close');
    var batchClear   = document.getElementById('batch-clear');
    var selectAllChk = document.getElementById('select-all');

    function getChecked() {
        return Array.from(document.querySelectorAll('.entry-checkbox:checked'));
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
        if (selectAllChk) {
            var visible = Array.from(document.querySelectorAll('.entry-checkbox')).filter(function (cb) {
                return cb.closest('tr') && cb.closest('tr').style.display !== 'none';
            });
            selectAllChk.checked = visible.length > 0 && visible.every(function (cb) { return cb.checked; });
            selectAllChk.indeterminate = checked.length > 0 && !selectAllChk.checked;
        }
    }

    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('entry-checkbox') || e.target.id === 'select-all') {
            if (e.target.id === 'select-all') {
                var visible = Array.from(document.querySelectorAll('.entry-checkbox')).filter(function (cb) {
                    return cb.closest('tr') && cb.closest('tr').style.display !== 'none';
                });
                visible.forEach(function (cb) { cb.checked = e.target.checked; });
            }
            updateBatchBar();
        }
    });

    function doBatch(entryopen) {
        var ids = getChecked().map(function (cb) { return cb.value; });
        if (!ids.length) return;
        var btn = entryopen ? batchOpen : batchClose;
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        var fd = new FormData();
        ids.forEach(function (id) { fd.append('entryids', id); });
        fd.append('entryopen', entryopen ? '1' : '0');

        fetch(window.JADE_BASE + '/formEntryFlags/batch', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok) { if (btn) { btn.disabled = false; btn.textContent = entryopen ? 'Set Open' : 'Set Closed'; } return; }
            // Update row data attributes
            ids.forEach(function (id) {
                var row = document.querySelector('tr[data-entryid="' + id + '"]');
                if (row) {
                    row.setAttribute('data-entryopen', entryopen ? '1' : '0');
                    updateEntryOpenBadge(row);
                }
            });
            // Clear selection
            document.querySelectorAll('.entry-checkbox:checked').forEach(function (cb) { cb.checked = false; });
            if (selectAllChk) selectAllChk.checked = false;
            batchBar.classList.remove('active');
            if (btn) { btn.disabled = false; btn.textContent = entryopen ? 'Set Open' : 'Set Closed'; }
        })
        .catch(function () { if (btn) { btn.disabled = false; btn.textContent = entryopen ? 'Set Open' : 'Set Closed'; } });
    }

    if (batchOpen)  batchOpen.addEventListener('click',  function () { doBatch(true); });
    if (batchClose) batchClose.addEventListener('click', function () { doBatch(false); });
    if (batchClear) batchClear.addEventListener('click', function () {
        document.querySelectorAll('.entry-checkbox:checked').forEach(function (cb) { cb.checked = false; });
        if (selectAllChk) { selectAllChk.checked = false; selectAllChk.indeterminate = false; }
        batchBar.classList.remove('active');
    });
}());
