// home-eligibility.js — inline create + search focus
(function () {
    var search = document.getElementById('el-search');
    if (search) search.focus();

    var btn    = document.getElementById('btn-new-el');
    var form   = document.getElementById('new-el-form');
    var text   = document.getElementById('new-el-text');
    var allcat = document.getElementById('new-el-allcats');
    var save   = document.getElementById('new-el-save');
    var cancel = document.getElementById('new-el-cancel');
    var err    = document.getElementById('new-el-error');

    if (!btn) return;

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        form.style.display = 'block';
        text.focus();
    });

    cancel.addEventListener('click', function (e) {
        e.preventDefault();
        form.style.display = 'none';
        text.value = ''; allcat.value = '0';
        err.style.display = 'none';
    });

    save.addEventListener('click', function () {
        var val = text.value.trim();
        if (!val) { err.textContent = 'Rule text required.'; err.style.display = ''; return; }
        save.disabled = true; save.textContent = 'Saving…'; err.style.display = 'none';
        fetch((window.JADE_BASE || '') + '/formEligibility/create', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    'eligibilityrule=' + encodeURIComponent(val) + '&allcats=' + encodeURIComponent(allcat.value),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.error) { err.textContent = data.error; err.style.display = ''; save.disabled = false; save.textContent = 'Add Rule'; return; }
            window.location.href = data.editUrl || (window.JADE_BASE || '') + '/home?action=eligibility&eligibilityid=' + data.eligibilityid;
        })
        .catch(function () { err.textContent = 'Failed to create rule.'; err.style.display = ''; save.disabled = false; save.textContent = 'Add Rule'; });
    });
})();
