function checkEntrant(form) {
  var sel = form.entrantid;
  if (!sel) return;
  var isNew = sel.value === "b";
  var block = document.getElementById("new-entrant-fields") || document.getElementById("entrant-new-fields");
  if (block) showHide(block, isNew);
  if (!isNew) {
    showHide(document.getElementById("street-address-fields"), false);
    showHide(document.getElementById("postal-address-fields"), false);
    var streetSel = form.streetaddressid;
    var postalSel = form.postaladdressid;
    if (streetSel) streetSel.value = "a";
    if (postalSel) postalSel.value = "a";
  }
}
function checkAddress(form) {
  var streetSel = form.streetaddressid;
  var postalSel = form.postaladdressid;
  if (streetSel) showHide(document.getElementById("street-address-fields"), streetSel.value === "b");
  if (postalSel) showHide(document.getElementById("postal-address-fields"), postalSel.value === "b");
}
document.addEventListener("DOMContentLoaded", function() {
  var form = document.entrantform || document.entryform;
  if (form) checkAddress(form);
  ["streetaddressid", "postaladdressid"].forEach(function(name) {
    var sel = document.querySelector("[name=" + name + "]");
    if (sel) sel.addEventListener("change", function() {
      checkAddress(this.form || form);
    });
  });
  var entrantSel = document.querySelector("[name=entrantid]");
  if (entrantSel && !entrantSel.dataset.wired) {
    entrantSel.dataset.wired = "1";
    entrantSel.addEventListener("change", function() {
      checkEntrant(this.form || form);
    });
  }
});
