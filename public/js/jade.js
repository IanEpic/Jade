function showHide(el, show) {
  el.style.display = show ? "" : "none";
}
function jadeTableFilter(input, rowSel) {
  var q = input.value.toLowerCase();
  document.querySelectorAll(rowSel).forEach(function(row) {
    row.classList.toggle("hidden", q.length > 0 && row.textContent.toLowerCase().indexOf(q) === -1);
  });
}
document.addEventListener("input", function(e) {
  var rows = e.target.dataset && e.target.dataset.filter;
  if (rows) jadeTableFilter(e.target, rows);
});
document.addEventListener("click", function(e) {
  var el = e.target.closest("[data-confirm]");
  if (!el) return;
  if (!confirm(el.dataset.confirm)) e.preventDefault();
});
document.addEventListener("submit", function(e) {
  if (e.target.dataset && "nosubmit" in e.target.dataset) e.preventDefault();
});
document.addEventListener("click", function(e) {
  var el = e.target.closest('[data-action="print"]');
  if (!el) return;
  e.preventDefault();
  window.print();
});
