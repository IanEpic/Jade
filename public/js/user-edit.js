function toggleNewAddress(val) {
  var row = document.getElementById("new-address-row");
  if (row) row.style.display = val === "b" ? "" : "none";
}
(function() {
  var judgecb = document.getElementById("isjudge-cb");
  var judgeFs = document.getElementById("judge-cats-fieldset");
  if (judgecb && judgeFs) {
    judgeFs.style.display = judgecb.checked ? "" : "none";
    judgecb.addEventListener("change", function() {
      judgeFs.style.display = this.checked ? "" : "none";
    });
  }
})();
