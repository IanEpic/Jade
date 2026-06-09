function toggleCodeField(type) {
  var row = document.getElementById("code-row");
  if (row) row.style.display = type === "code" ? "table-row" : "none";
}
(function() {
  var typeSel = document.querySelector("select[name=type]");
  if (typeSel) toggleCodeField(typeSel.value);
  var btnNew = document.getElementById("btn-new-disc");
  var wrap = document.getElementById("disc-form-wrap");
  var cancel = document.getElementById("disc-cancel");
  if (btnNew && wrap) {
    btnNew.addEventListener("click", function(e) {
      e.preventDefault();
      wrap.style.display = "block";
      wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  if (cancel && wrap) {
    cancel.addEventListener("click", function(e) {
      e.preventDefault();
      wrap.style.display = "none";
    });
  }
})();
