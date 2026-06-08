// form-invoice.js — address dropdown show/hide + email send modal

function toggleNewAddr(val) {
    var row = document.getElementById('new-addr-row');
    if (row) row.style.display = val === 'b' ? '' : 'none';
}

function showEmailModal() {
    var m = document.getElementById('email-modal');
    if (m) { m.style.display = 'flex'; document.getElementById('email-input').focus(); }
}

function hideEmailModal() {
    var m = document.getElementById('email-modal');
    if (m) m.style.display = 'none';
}

(function () {
    // Close modal on backdrop click
    var modal = document.getElementById('email-modal');
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) hideEmailModal();
        });
    }

    // Wire address select — replaces onchange="toggleNewAddr(this.value)"
    var addrSel = document.querySelector('[name="postaladdressid"]');
    if (addrSel) addrSel.addEventListener('change', function () { toggleNewAddr(addrSel.value); });

    // Delegated actions for this page
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        if (action === 'show-email-modal') { showEmailModal(); }
        else if (action === 'hide-email-modal') { hideEmailModal(); }
        else if (action === 'print') { window.print(); }
    });
})();
