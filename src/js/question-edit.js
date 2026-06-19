// question-edit.js — input type show/hide + allcats checkAll
(function () {
    var optionTypes  = ['drop down list', 'checkbox', 'radio'];
    var captionTypes = ['image', 'video'];
    var typeSelect   = document.querySelector('select[name="inputtype"]');
    if (!typeSelect) return;
    var optFieldset  = typeSelect.closest('form').querySelectorAll('fieldset')[2];
    var captionRow   = document.getElementById('caption-row');

    function syncOptions() {
        var val = typeSelect.value;
        if (optFieldset) optFieldset.style.display = optionTypes.indexOf(val) !== -1 ? '' : 'none';
        if (captionRow)  captionRow.style.display  = captionTypes.indexOf(val) !== -1 ? '' : 'none';
    }

    typeSelect.addEventListener('change', syncOptions);
    syncOptions();
})();

(function () {
    var sel = document.getElementById('allcats-sel');
    if (!sel) return;
    sel.addEventListener('change', function () {
        var checked = this.value === '1';
        document.querySelectorAll('input[type=checkbox][name^="cat~"]').forEach(function (cb) { cb.checked = checked; });
    });
})();
