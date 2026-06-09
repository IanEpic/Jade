// user-edit.js — address dropdown show/hide + judge category fieldset toggle
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

    var judgecb = document.getElementById('isjudge-cb');
    var judgeFs = document.getElementById('judge-cats-fieldset');
    if (judgecb && judgeFs) {
        judgeFs.style.display = judgecb.checked ? '' : 'none';
        judgecb.addEventListener('change', function () {
            judgeFs.style.display = this.checked ? '' : 'none';
        });
    }
})();
