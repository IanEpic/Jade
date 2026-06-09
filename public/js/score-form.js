(function() {
  var form = document.querySelector('form[action$="/recordScores"]');
  var btn = document.getElementById("score-submit");
  var box = document.getElementById("comment-feedback");
  var msg = document.getElementById("comment-feedback-text");
  if (!form || !btn) return;
  if (box && box.style.display !== "none") {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = "Saving\u2026";
    if (box) box.style.display = "none";
    var data = new URLSearchParams(new FormData(form)).toString();
    fetch(form.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: data
    }).then(function(r) {
      return r.json();
    }).then(function(result) {
      if (result.ok) {
        window.location = (window.JADE_BASE || "") + result.redirect;
      } else {
        if (msg) msg.textContent = result.feedback || "Your comments could not be saved. Please review and try again.";
        if (box) {
          box.style.display = "block";
          box.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        btn.disabled = false;
        btn.textContent = label;
      }
    }).catch(function() {
      btn.disabled = false;
      btn.textContent = label;
      form.submit();
    });
  });
})();
