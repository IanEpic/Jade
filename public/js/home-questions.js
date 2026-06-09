function toggleQOptions(type) {
  var row = document.getElementById("new-q-options-row");
  if (row) row.style.display = type === "select" || type === "radio" || type === "checkbox" ? "" : "none";
}
(function() {
  var search = document.getElementById("q-list-search");
  if (search) search.focus();
  var btn = document.getElementById("btn-new-q");
  var form = document.getElementById("new-q-form");
  var text = document.getElementById("new-q-text");
  var desc = document.getElementById("new-q-desc");
  var type = document.getElementById("new-q-type");
  var options = document.getElementById("new-q-options");
  var save = document.getElementById("new-q-save");
  var cancel = document.getElementById("new-q-cancel");
  var err = document.getElementById("new-q-error");
  if (!btn) return;
  if (type) type.addEventListener("change", function() {
    toggleQOptions(type.value);
  });
  btn.addEventListener("click", function(e) {
    e.preventDefault();
    form.style.display = "block";
    text.focus();
  });
  cancel.addEventListener("click", function(e) {
    e.preventDefault();
    form.style.display = "none";
    text.value = "";
    desc.value = "";
    options.value = "";
    toggleQOptions("text");
    err.style.display = "none";
  });
  save.addEventListener("click", function() {
    var val = text.value.trim();
    if (!val) {
      err.textContent = "Question text required.";
      err.style.display = "";
      return;
    }
    save.disabled = true;
    save.textContent = "Saving\u2026";
    err.style.display = "none";
    var body = "questiontext=" + encodeURIComponent(val) + "&questiontype=" + encodeURIComponent(type.value) + "&description=" + encodeURIComponent(desc.value.trim()) + "&options=" + encodeURIComponent(options.value);
    fetch((window.JADE_BASE || "") + "/formCategory/create-question", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      if (data.error) {
        err.textContent = data.error;
        err.style.display = "";
        save.disabled = false;
        save.textContent = "Add Question";
        return;
      }
      window.location.href = (window.JADE_BASE || "") + "/home?action=questions&type=entry&questionid=" + data.questionid;
    }).catch(function() {
      err.textContent = "Failed to create question.";
      err.style.display = "";
      save.disabled = false;
      save.textContent = "Add Question";
    });
  });
})();
