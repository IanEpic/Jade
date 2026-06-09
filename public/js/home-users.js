(function() {
  document.querySelectorAll(".activate-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var uid = btn.dataset.userid;
      fetch((window.JADE_BASE || "") + "/formUser?action=activate&edituserid=" + uid, {
        headers: { "X-Requested-With": "XMLHttpRequest" }
      }).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (data.ok) {
          var row = btn.closest("tr");
          btn.remove();
          if (row) {
            row.querySelectorAll(".badge-unactivated").forEach(function(b) {
              b.remove();
            });
          }
        }
      }).catch(function() {
        alert("Activation failed. Please try again.");
      });
    });
  });
  var search = document.getElementById("user-search");
  if (search) search.focus();
})();
