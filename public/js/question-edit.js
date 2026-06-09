(function() {
  var optionTypes = ["drop down list", "checkbox", "radio"];
  var captionTypes = ["image", "video"];
  var typeSelect = document.querySelector('select[name="inputtype"]');
  if (!typeSelect) return;
  var optFieldset = typeSelect.closest("form").querySelectorAll("fieldset")[2];
  var captionRow = document.getElementById("caption-row");
  function syncOptions() {
    var val = typeSelect.value;
    if (optFieldset) optFieldset.style.display = optionTypes.indexOf(val) !== -1 ? "" : "none";
    if (captionRow) captionRow.style.display = captionTypes.indexOf(val) !== -1 ? "" : "none";
  }
  typeSelect.addEventListener("change", syncOptions);
  syncOptions();
})();
