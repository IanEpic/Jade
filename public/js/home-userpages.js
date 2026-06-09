(function() {
  var btn = document.getElementById("btn-new-up");
  var wrap = document.getElementById("up-form-wrap");
  var name = document.getElementById("up-name");
  var save = document.getElementById("up-save");
  var cancel = document.getElementById("up-cancel");
  var err = document.getElementById("up-error");
  if (btn && wrap) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      wrap.style.display = "block";
      name.focus();
    });
  }
  if (cancel && wrap) {
    cancel.addEventListener("click", function(e) {
      e.preventDefault();
      wrap.style.display = "none";
      name.value = "";
      err.style.display = "none";
    });
  }
  if (save) {
    save.addEventListener("click", function() {
      var val = name.value.trim();
      if (!val) {
        err.textContent = "Page name required.";
        err.style.display = "";
        return;
      }
      save.disabled = true;
      save.textContent = "Creating\u2026";
      err.style.display = "none";
      fetch((window.JADE_BASE || "") + "/formPage/create", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=" + encodeURIComponent(val)
      }).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (data.error) {
          err.textContent = data.error;
          err.style.display = "";
          save.disabled = false;
          save.textContent = "Create Page";
          return;
        }
        window.location.href = data.editUrl;
      }).catch(function() {
        err.textContent = "Failed to create page.";
        err.style.display = "";
        save.disabled = false;
        save.textContent = "Create Page";
      });
    });
  }
})();
