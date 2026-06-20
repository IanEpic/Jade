// user-edit.js — address dropdown show/hide + judge category fieldset toggle + confirm dialogs

document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-confirm]');
    if (!el) return;
    if (!confirm(el.dataset.confirm)) e.preventDefault();
});
// Shared by: home/user-edit.pug, formUser-content.pug

(function () {
    var addrSel = document.getElementById('postaladdressid-select');
    var addrRow = document.getElementById('new-address-row');
    if (addrSel && addrRow) {
        addrRow.style.display = addrSel.value === 'b' ? '' : 'none';
        addrSel.addEventListener('change', function () {
            addrRow.style.display = this.value === 'b' ? '' : 'none';
        });
    }

    var streetSel = document.getElementById('streetaddressid-select');
    var streetRow = document.getElementById('new-street-address-row');
    if (streetSel && streetRow) {
        streetRow.style.display = streetSel.value === 'b' ? '' : 'none';
        streetSel.addEventListener('change', function () {
            streetRow.style.display = this.value === 'b' ? '' : 'none';
        });
    }

    var judgecb = document.getElementById('isjudge-cb');
    var judgeFs = document.getElementById('judge-cats-fieldset');
    if (judgecb && judgeFs) {
        judgeFs.style.display = judgecb.checked ? '' : 'none';
        judgecb.addEventListener('change', function () {
            judgeFs.style.display = this.checked ? '' : 'none';
        });
    }
})();
