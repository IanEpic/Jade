// home-receivepayment.js
// Admin Receive Payment: toggle EFT/card fields and keep a running "total allocated".
// Early-bird is applied at PAYMENT time, so the owing shown per invoice depends on the
// payment date: if it's on/before the early-bird cutoff, the discounted amount is owing.
// Changing the payment date recomputes each invoice's owing and refills the allocations.

(function () {
    // Confirm before deleting a recorded payment (separate little forms on the page).
    Array.prototype.forEach.call(document.querySelectorAll('.rp-delform'), function (f) {
        f.addEventListener('submit', function (e) {
            if (!confirm('Delete this payment? The invoice will revert to unpaid and its entries will be un-accepted.')) e.preventDefault();
        });
    });

    var form = document.querySelector('form[action$="/receivePayment"]');
    if (!form) return;

    var totalEl    = document.getElementById('rp-total');
    var receivedEl = document.getElementById('rp-received');
    var dateEl     = document.getElementById('rp-date');
    var ebDate     = (document.getElementById('rp-ebdate') || {}).value || '';
    var defaultDate = dateEl ? dateEl.value : '';   // today (server-rendered)
    var receivedTouched = false;

    // ── EFT / card field toggle ───────────────────────────────────────────────
    function methodToggle() {
        var sel = form.querySelector('input[name="method"]:checked');
        var isCard = sel && sel.value === 'card';
        document.getElementById('card-fields').style.display = isCard ? 'block' : 'none';
        document.getElementById('eft-fields').style.display  = isCard ? 'none' : 'flex';
        // A card (MOTO) charge happens now — it can't be back/forward-dated, so force
        // today and lock the date. EFT/manual can be backdated, so re-enable + reset.
        if (dateEl) {
            dateEl.value = defaultDate;
            dateEl.disabled = isCard;
        }
        applyDate();
    }
    form.querySelectorAll('input[name="method"]').forEach(function (r) {
        r.addEventListener('change', methodToggle);
    });
    methodToggle();

    // ── Owing for an invoice given the entered payment date ────────────────────
    // Early-bird discount applies only when the payment date is on/before the cutoff.
    function owingFor(input) {
        var balance = parseFloat(input.getAttribute('data-balance')) || 0;   // full, less prior payments
        var ebDisc  = parseFloat(input.getAttribute('data-ebdiscount')) || 0;
        var payDate = dateEl ? dateEl.value : '';
        var qualifies = ebDate && payDate && payDate <= ebDate;              // ISO yyyy-mm-dd compares lexically
        var owing = qualifies ? balance - ebDisc : balance;
        return owing < 0 ? 0 : Math.round(owing * 100) / 100;
    }

    // Recompute owing per invoice and refresh the displayed Owing cell when the payment
    // date changes. Allocate boxes are left for the admin to fill — we only update the
    // owing figure (and the data-effbalance the mismatch check compares against).
    function applyDate() {
        form.querySelectorAll('.rp-amt').forEach(function (input) {
            var owing = owingFor(input);
            input.setAttribute('data-effbalance', owing);
            var cell = form.querySelector('.rp-owe[data-invid="' + input.getAttribute('data-invid') + '"]');
            if (cell) cell.textContent = '$' + owing.toFixed(2);
        });
        recalc();
    }

    // ── Allocated total (sum of allocate boxes) ───────────────────────────────
    function recalc() {
        var t = 0;
        form.querySelectorAll('.rp-amt').forEach(function (a) {
            var v = parseFloat(a.value);
            if (!isNaN(v)) t += v;
        });
        if (totalEl) totalEl.textContent = '$' + t.toFixed(2);
        if (receivedEl && !receivedTouched) receivedEl.value = t ? t.toFixed(2) : '';
    }

    if (dateEl) dateEl.addEventListener('change', applyDate);
    if (receivedEl) receivedEl.addEventListener('input', function () { receivedTouched = true; });
    form.addEventListener('input', function (e) {
        if (e.target.classList.contains('rp-amt')) recalc();
    });

    // ── Submit guards ─────────────────────────────────────────────────────────
    form.addEventListener('submit', function (e) {
        var allocated = 0;
        var mismatches = [];
        form.querySelectorAll('.rp-amt').forEach(function (a) {
            var v = parseFloat(a.value);
            if (isNaN(v) || v <= 0) return;
            allocated += v;
            // Compare against the date-adjusted owing (so paying the discounted amount
            // on a pre-cutoff date is NOT flagged as a mismatch).
            var owing = parseFloat(a.getAttribute('data-effbalance'));
            if (isNaN(owing)) owing = owingFor(a);
            if (Math.abs(v - owing) > 0.005) {
                var row = a.closest('tr');
                var invno = row ? row.children[0].textContent.trim() : '';
                mismatches.push('  • ' + invno + ': allocating $' + v.toFixed(2) + ' vs $' + owing.toFixed(2) + ' owing');
            }
        });

        if (allocated <= 0) {
            e.preventDefault();
            alert('Enter an amount to allocate against at least one invoice.');
            return;
        }
        var rec = parseFloat(receivedEl ? receivedEl.value : '');
        if (!isNaN(rec) && Math.abs(rec - allocated) > 0.005) {
            e.preventDefault();
            alert('Total allocated ($' + allocated.toFixed(2) + ') must equal the amount received ($' + rec.toFixed(2) + ').');
            return;
        }
        if (mismatches.length) {
            var msg = 'These allocations don’t match the amount owing:\n\n' + mismatches.join('\n') +
                      '\n\nRecord the payment and accept these entries anyway?';
            if (!confirm(msg)) e.preventDefault();
        }
    });

    applyDate();   // initialise owing + allocations for the default (today) date
}());
