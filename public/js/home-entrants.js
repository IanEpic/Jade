var wrap = document.getElementById("entrant-form-wrap");
var form = document.getElementById("entrant-form");
var titleEl = document.getElementById("entrant-form-title");
var idField = document.getElementById("entrant-id-field");
var submitBtn = document.getElementById("entrant-submit-btn");
var btnNew = document.getElementById("btn-new-entrant");
var btnCancel = document.getElementById("entrant-cancel");
var streetSel = document.getElementById("ef-street-sel");
var postalSel = document.getElementById("ef-postal-sel");
var streetFields = document.getElementById("ef-street-fields");
var postalFields = document.getElementById("ef-postal-fields");
function showForm() {
  if (wrap) wrap.style.display = "block";
  if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}
function hideForm() {
  if (wrap) wrap.style.display = "none";
  if (form) form.reset();
  if (idField) idField.value = "";
  checkAddressFields();
}
function checkAddressFields() {
  if (streetSel && streetFields)
    streetFields.style.display = streetSel.value === "b" ? "" : "none";
  if (postalSel && postalFields)
    postalFields.style.display = postalSel.value === "b" ? "" : "none";
}
function setVal(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val || "";
}
function setSelectVal(el, val) {
  if (!el) return;
  var found = false;
  for (var i = 0; i < el.options.length; i++) {
    if (el.options[i].value === String(val)) {
      el.selectedIndex = i;
      found = true;
      break;
    }
  }
  if (!found) el.value = "a";
}
if (btnNew) {
  btnNew.addEventListener("click", function(e) {
    e.preventDefault();
    if (titleEl) titleEl.textContent = btnNew.dataset.createLabel || "New Entrant";
    if (submitBtn) submitBtn.textContent = btnNew.dataset.createLabel || "Create Entrant";
    if (idField) idField.value = "";
    if (form) form.reset();
    checkAddressFields();
    showForm();
  });
}
if (btnCancel) {
  btnCancel.addEventListener("click", function(e) {
    e.preventDefault();
    hideForm();
  });
}
if (streetSel) streetSel.addEventListener("change", checkAddressFields);
if (postalSel) postalSel.addEventListener("change", checkAddressFields);
document.addEventListener("click", function(e) {
  var btn = e.target.closest('[data-action="edit-entrant"]');
  if (!btn) return;
  e.preventDefault();
  var row = btn.closest("tr");
  if (!row) return;
  var d = row.dataset;
  if (titleEl) titleEl.textContent = btn.dataset.editLabel || "Edit Entrant";
  if (submitBtn) submitBtn.textContent = btn.dataset.editLabel || "Save Entrant";
  if (idField) idField.value = d.id || "";
  setVal("ef-name", d.name);
  setSelectVal(document.getElementById("ef-type"), d.type);
  setVal("ef-legalentity", d.legalentity);
  setVal("ef-abn", d.abn);
  setSelectVal(streetSel, d.street);
  setSelectVal(postalSel, d.postal);
  setVal("ef-telephone", d.telephone);
  setVal("ef-mobile", d.mobile);
  setVal("ef-email", d.email);
  checkAddressFields();
  showForm();
});
checkAddressFields();
