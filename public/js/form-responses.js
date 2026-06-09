var _activeUploads = {};
var _nextUploadId = 0;
function uploadStarted(totalBytes) {
  var id = ++_nextUploadId;
  _activeUploads[id] = { loaded: 0, total: totalBytes || 0 };
  _redrawGlobalProgress();
  return id;
}
function uploadProgress(id, loadedBytes) {
  if (_activeUploads[id]) {
    _activeUploads[id].loaded = loadedBytes;
    _redrawGlobalProgress();
  }
}
function uploadFinished(id) {
  delete _activeUploads[id];
  _redrawGlobalProgress();
}
function _redrawGlobalProgress() {
  var ids = Object.keys(_activeUploads);
  var busy = ids.length > 0;
  var btn = document.getElementById("btn-save");
  var links = document.querySelectorAll(".form-actions a");
  var status = document.getElementById("save-status");
  var progress = document.getElementById("upload-progress");
  var fill = document.getElementById("upload-progress-fill");
  var label = document.getElementById("upload-progress-label");
  if (busy) {
    if (btn) {
      btn.disabled = true;
      btn.title = "Waiting for uploads to complete\u2026";
    }
    links.forEach(function(a) {
      if (!a.dataset.href) {
        a.dataset.href = a.href;
        a.removeAttribute("href");
      }
      a.style.opacity = "0.5";
      a.style.cursor = "not-allowed";
    });
    if (status) status.innerHTML = "";
    var totalBytes = 0;
    var loadedBytes = 0;
    for (var i = 0; i < ids.length; i++) {
      totalBytes += _activeUploads[ids[i]].total;
      loadedBytes += _activeUploads[ids[i]].loaded;
    }
    var pct = totalBytes > 0 ? Math.min(100, Math.round(loadedBytes / totalBytes * 100)) : 0;
    if (progress) progress.style.display = "";
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = pct + "%  \u2013  " + ids.length + (ids.length === 1 ? " file uploading" : " files uploading");
  } else {
    if (btn) {
      btn.disabled = false;
      btn.title = "";
    }
    links.forEach(function(a) {
      if (a.dataset.href) {
        a.href = a.dataset.href;
        delete a.dataset.href;
      }
      a.style.opacity = "";
      a.style.cursor = "";
    });
    if (progress) progress.style.display = "none";
    if (fill) fill.style.width = "0";
  }
}
window.addEventListener("beforeunload", function(e) {
  if (Object.keys(_activeUploads).length > 0) {
    e.preventDefault();
    e.returnValue = "Uploads are still in progress. If you leave now your files may not be saved.";
  }
});
function countWords(ta, limit) {
  var words = ta.value.trim().split(/\s+/).filter(Boolean);
  var cnt = words.length;
  var cntField = document.querySelector('[name="' + ta.name + 'c"]');
  if (cntField) cntField.value = cnt;
  if (limit && cnt > limit) ta.style.borderColor = "#c44";
  else ta.style.borderColor = "";
}
var _iconColors = { pdf: "#e74c3c", doc: "#2980b9", docx: "#2980b9", xls: "#27ae60", xlsx: "#27ae60", ppt: "#e67e22", pptx: "#e67e22", zip: "#8e44ad", rar: "#8e44ad", "7z": "#8e44ad", csv: "#16a085", txt: "#7f8c8d" };
function fileIconHtml(filename) {
  var ext = (filename || "").split(".").pop().toLowerCase();
  var color = _iconColors[ext] || "#555";
  var label = ext ? ext.toUpperCase() : "FILE";
  return '<span class="dz-file-icon" style="background:' + color + '">' + label + "</span>" + filename;
}
document.querySelectorAll(".dropzone").forEach(function(dz) {
  var input = dz.querySelector(".dz-input");
  var preview = dz.querySelector(".dz-preview");
  var bar = dz.querySelector(".dz-bar");
  var barFill = dz.querySelector(".dz-bar-fill");
  var errEl = dz.querySelector(".dz-err");
  var stopBtn = dz.querySelector(".dz-stop-btn");
  var dzText = dz.querySelector(".dz-text");
  var type = dz.dataset.type;
  var hiddenName = dz.dataset.field;
  var hiddenInput = document.querySelector('input[name="' + hiddenName + '"]');
  dz.addEventListener("dragover", function(e) {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  dz.addEventListener("dragleave", function(e) {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove("drag-over");
  });
  dz.addEventListener("drop", function(e) {
    e.preventDefault();
    dz.classList.remove("drag-over");
    var files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
  });
  dz.addEventListener("click", function(e) {
    if (!e.target.closest(".dz-video-player") && !e.target.closest(".btn-dz-remove") && !e.target.closest(".dz-stop-btn")) input.click();
  });
  input.addEventListener("change", function() {
    if (input.files.length) handleFile(input.files[0]);
  });
  var MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
  var CHUNK_SIZE = 50 * 1024 * 1024;
  function handleFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showErr("File is too large (maximum 2 GB). Please choose a smaller file.");
      return;
    }
    var prevResponseId = dz.dataset.responseid || "";
    var prevHiddenVal = hiddenInput ? hiddenInput.value || "" : "";
    var prevUploaded = dz.classList.contains("uploaded");
    var prevDzText = dzText ? dzText.textContent : "";
    var prevPreview = preview.style.display;
    if (dz.dataset.pendingFile) {
      fetch(window.JADE_BASE + "/formResponses/delete-pending", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "filename=" + encodeURIComponent(dz.dataset.pendingFile) + "&type=" + encodeURIComponent(type)
      }).catch(function(e) {
        console.warn("delete-pending (replace) failed:", e);
      });
      dz.dataset.pendingFile = "";
    }
    errEl.style.display = "none";
    errEl.textContent = "";
    bar.style.display = "block";
    barFill.style.width = "0";
    if (stopBtn) stopBtn.style.display = "inline-block";
    var uploadingEl = preview.querySelector(".dz-uploading");
    var thumb = preview.querySelector(".dz-thumb");
    if (uploadingEl && type === "image") {
      if (thumb) thumb.style.display = "none";
      uploadingEl.classList.add("active");
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
    var uploadId = uploadStarted(file.size);
    function finishUploadUI() {
      bar.style.display = "none";
      if (stopBtn) stopBtn.style.display = "none";
      if (uploadingEl) uploadingEl.classList.remove("active");
      if (thumb) thumb.style.display = "";
      dz._abortUpload = null;
    }
    function doAbortReset() {
      bar.style.display = "none";
      barFill.style.width = "0";
      if (stopBtn) stopBtn.style.display = "none";
      if (uploadingEl) uploadingEl.classList.remove("active");
      if (thumb) thumb.style.display = "";
      errEl.style.display = "none";
      errEl.textContent = "";
      dz.dataset.pendingFile = "";
      if (prevResponseId) {
        hiddenInput.value = prevHiddenVal;
        dz.dataset.responseid = prevResponseId;
        preview.style.display = prevPreview;
        if (prevUploaded) dz.classList.add("uploaded");
        else dz.classList.remove("uploaded");
        if (dzText) dzText.textContent = prevDzText;
      } else {
        hiddenInput.value = "";
        dz.dataset.responseid = "";
        preview.style.display = "none";
        dz.classList.remove("uploaded");
        if (dzText) dzText.textContent = type === "image" ? "Drop an image here or click to browse" : type === "video" ? "Drop a video here or click to browse" : "Drop a file here or click to browse";
      }
      uploadFinished(uploadId);
      dz._abortUpload = null;
    }
    if (type === "image") {
      var fd = new FormData();
      fd.append("file", file);
      var xhr = new XMLHttpRequest();
      dz._abortUpload = function() {
        xhr.abort();
        doAbortReset();
      };
      xhr.upload.addEventListener("progress", function(e) {
        if (e.lengthComputable) {
          barFill.style.width = Math.round(e.loaded / e.total * 100) + "%";
          uploadProgress(uploadId, e.loaded);
        }
      });
      xhr.addEventListener("load", function() {
        finishUploadUI();
        try {
          var r = JSON.parse(xhr.responseText);
          if (r.status === "OK") {
            uploadProgress(uploadId, file.size);
            onUploadDone(uploadId, r.filename, r.originalname || file.name, file);
          } else {
            uploadFinished(uploadId);
            showErr(r.msg || r.status);
          }
        } catch (ex) {
          uploadFinished(uploadId);
          showErr("Unexpected server error");
        }
      });
      xhr.addEventListener("error", function() {
        finishUploadUI();
        uploadFinished(uploadId);
        showErr("Upload failed \u2014 check your connection and try again");
      });
      xhr.open("POST", window.JADE_BASE + "/formResponses/upload?type=image");
      xhr.send(fd);
      return;
    }
    var base = window.JADE_BASE + "/formResponses/upload";
    var aborted = false;
    var activeXhr = null;
    var serverUploadId = null;
    dz._abortUpload = function() {
      aborted = true;
      if (activeXhr) {
        activeXhr.abort();
        activeXhr = null;
      }
      if (serverUploadId) {
        fetch(base + "/chunk-abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: serverUploadId })
        }).catch(function() {
        });
      }
      doAbortReset();
    };
    fetch(base + "/chunk-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, filename: file.name, size: file.size })
    }).then(function(r) {
      return r.json();
    }).then(function(init) {
      if (aborted) {
        if (init.status === "OK") {
          fetch(base + "/chunk-abort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId: init.uploadId })
          }).catch(function() {
          });
        }
        return;
      }
      if (init.status !== "OK") {
        finishUploadUI();
        uploadFinished(uploadId);
        showErr(init.msg || init.status);
        return;
      }
      serverUploadId = init.uploadId;
      sendChunks(serverUploadId, 0);
    }).catch(function() {
      if (aborted) return;
      finishUploadUI();
      uploadFinished(uploadId);
      showErr("Could not start upload \u2014 check your connection");
    });
    function sendChunks(svrUploadId, offset) {
      if (aborted) return;
      if (offset >= file.size) {
        fetch(base + "/chunk-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: svrUploadId })
        }).then(function(r) {
          return r.json();
        }).then(function(done) {
          finishUploadUI();
          if (done.status === "OK") {
            uploadProgress(uploadId, file.size);
            onUploadDone(uploadId, done.filename, done.originalname || file.name, file);
          } else {
            uploadFinished(uploadId);
            showErr(done.msg || done.status);
          }
        }).catch(function() {
          if (aborted) return;
          finishUploadUI();
          uploadFinished(uploadId);
          showErr("Upload finalisation failed \u2014 please try again");
        });
        return;
      }
      var chunk = file.slice(offset, offset + CHUNK_SIZE);
      var xhr2 = new XMLHttpRequest();
      activeXhr = xhr2;
      xhr2.upload.addEventListener("progress", function(e) {
        if (aborted || !e.lengthComputable || !file.size) return;
        var overall = offset + e.loaded;
        barFill.style.width = Math.round(overall / file.size * 100) + "%";
        uploadProgress(uploadId, overall);
      });
      xhr2.addEventListener("load", function() {
        if (aborted) return;
        activeXhr = null;
        try {
          var r = JSON.parse(xhr2.responseText);
          if (r.status === "OK") {
            uploadProgress(uploadId, offset + chunk.size);
            sendChunks(svrUploadId, offset + chunk.size);
          } else {
            finishUploadUI();
            uploadFinished(uploadId);
            showErr(r.msg || r.status);
          }
        } catch (ex) {
          finishUploadUI();
          uploadFinished(uploadId);
          showErr("Unexpected server error during upload");
        }
      });
      xhr2.addEventListener("error", function() {
        if (aborted) return;
        activeXhr = null;
        finishUploadUI();
        uploadFinished(uploadId);
        showErr("Upload failed \u2014 check your connection and try again");
      });
      xhr2.open("POST", base + "/chunk?uploadId=" + encodeURIComponent(svrUploadId));
      xhr2.setRequestHeader("Content-Type", "application/octet-stream");
      xhr2.send(chunk);
    }
  }
  function onUploadDone(uploadId, filename, originalname, file) {
    hiddenInput.value = filename;
    dz.dataset.pendingFile = filename;
    dz.classList.add("uploaded");
    showPreview({ filename, originalname }, file);
    fetch(window.JADE_BASE + "/formResponses/save-file", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "entryid=" + encodeURIComponent(dz.dataset.entryid) + "&questionid=" + encodeURIComponent(dz.dataset.qid) + "&filename=" + encodeURIComponent(filename)
    }).then(function(r) {
      return r.json();
    }).then(function(saved) {
      if (saved.status === "OK") {
        dz.dataset.responseid = saved.responseid;
        dz.dataset.pendingFile = "";
      } else {
        console.warn("save-file error:", saved.status);
      }
    }).catch(function(e) {
      console.warn("save-file failed:", e);
    }).finally(function() {
      uploadFinished(uploadId);
    });
  }
  function showPreview(r, file) {
    preview.style.display = "block";
    if (type === "image") {
      var img = preview.querySelector(".dz-thumb");
      if (img) img.src = URL.createObjectURL(file);
    } else if (type === "video") {
      var vid = preview.querySelector(".dz-video-player");
      if (vid) {
        vid.src = URL.createObjectURL(file);
        vid.style.display = "block";
      }
    } else {
      var fnEl = preview.querySelector(".dz-filename");
      if (fnEl) fnEl.innerHTML = fileIconHtml(r.originalname || r.filename);
    }
    if (dzText) dzText.textContent = "Click or drop to replace";
  }
  function showErr(msg) {
    errEl.textContent = "\u2717 " + msg;
    errEl.style.display = "block";
    dz.classList.remove("uploaded");
  }
});
document.addEventListener("click", function(e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var action = btn.dataset.action;
  if (action === "save") {
    saveResponses();
  } else if (action === "undo") {
    undoField(btn);
  } else if (action === "remove-file") {
    removeFile(e, btn);
  } else if (action === "stop-upload") {
    e.stopPropagation();
    var dz = btn.closest(".dropzone");
    if (dz && dz._abortUpload) dz._abortUpload();
  }
});
function removeFile(e, btn) {
  e.stopPropagation();
  e.preventDefault();
  var dz = btn.closest(".dropzone");
  var responseid = dz.dataset.responseid;
  var hiddenName = dz.dataset.field;
  var hiddenInput = document.querySelector('input[name="' + hiddenName + '"]');
  function resetDropzone() {
    var preview = dz.querySelector(".dz-preview");
    var dzText = dz.querySelector(".dz-text");
    var img = preview.querySelector(".dz-thumb");
    var fn = preview.querySelector(".dz-filename");
    if (img) {
      img.src = "";
      img.style.display = "";
    }
    var vid = preview.querySelector(".dz-video-player");
    if (vid) {
      vid.src = "";
      vid.style.display = "none";
    }
    var uploadingEl = preview.querySelector(".dz-uploading");
    if (uploadingEl) uploadingEl.classList.remove("active");
    if (fn) {
      fn.textContent = "";
      if (fn.tagName === "A") {
        fn.removeAttribute("href");
        fn.textContent = "";
      }
    }
    var removeBtn = preview.querySelector(".btn-dz-remove");
    if (removeBtn) {
      removeBtn.disabled = false;
      removeBtn.textContent = "\u2715 Remove";
    }
    preview.style.display = "none";
    dz.classList.remove("uploaded");
    dz.dataset.responseid = "";
    dz.dataset.pendingFile = "";
    if (hiddenInput) hiddenInput.value = "";
    if (dzText) dzText.textContent = dz.dataset.type === "image" ? "Drop an image here or click to browse" : dz.dataset.type === "video" ? "Drop a video here or click to browse" : "Drop a file here or click to browse";
  }
  if (responseid) {
    btn.disabled = true;
    btn.textContent = "\u2026";
    fetch(window.JADE_BASE + "/formResponses/delete-file", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "responseid=" + encodeURIComponent(responseid)
    }).then(function(r) {
      return r.json();
    }).then(function(r) {
      if (r.status === "OK") {
        resetDropzone();
      } else {
        btn.disabled = false;
        btn.textContent = "\u2715 Remove";
        alert("Could not delete file: " + (r.msg || r.status));
      }
    }).catch(function() {
      btn.disabled = false;
      btn.textContent = "\u2715 Remove";
      alert("Network error \u2014 please try again");
    });
  } else if (dz.dataset.pendingFile) {
    var pendingFile = dz.dataset.pendingFile;
    var type = dz.dataset.type;
    resetDropzone();
    fetch(window.JADE_BASE + "/formResponses/delete-pending", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "filename=" + encodeURIComponent(pendingFile) + "&type=" + encodeURIComponent(type)
    }).catch(function(e2) {
      console.warn("delete-pending failed:", e2);
    });
  } else {
    resetDropzone();
  }
}
function _postField(fd) {
  var status = document.getElementById("save-status");
  var xhr = new XMLHttpRequest();
  xhr.addEventListener("load", function() {
    try {
      var r = JSON.parse(xhr.responseText);
      if (r.status === "OK" && status) {
        status.innerHTML = '<span style="color:#4caf50">\u2713 Autosaved</span>';
        setTimeout(function() {
          if (status.textContent.indexOf("Autosaved") !== -1) status.innerHTML = "";
        }, 2e3);
      }
    } catch (e) {
    }
  });
  xhr.open("POST", window.JADE_BASE + "/formResponses");
  xhr.send(fd);
}
function initBlurSave() {
  var form = document.getElementById("response-form");
  if (!form) return;
  var entryId = (form.querySelector('input[name="entryid"]') || {}).value || "";
  function singleFd(name, value) {
    var fd = new FormData();
    fd.append("entryid", entryId);
    fd.append(name, value);
    return fd;
  }
  form.querySelectorAll('input[type="text"]:not([readonly]), textarea').forEach(function(el) {
    if (!el.name || !el.name.startsWith("HHH")) return;
    el.addEventListener("blur", function() {
      if (_savedValues[el.name] !== void 0 && el.value === _savedValues[el.name]) return;
      _postField(singleFd(el.name, el.value));
      _savedValues[el.name] = el.value;
      var btn = undoBtnFor(el);
      if (btn) btn.style.display = "none";
    });
  });
  form.querySelectorAll("select").forEach(function(el) {
    if (!el.name || !el.name.startsWith("HHH")) return;
    el.addEventListener("change", function() {
      _postField(singleFd(el.name, el.value));
    });
  });
  form.querySelectorAll('input[type="radio"]').forEach(function(el) {
    if (!el.name || !el.name.startsWith("HHH")) return;
    el.addEventListener("change", function() {
      _postField(singleFd(el.name, el.value));
    });
  });
  var cbWired = {};
  form.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
    if (!el.name || !el.name.startsWith("HHH") || cbWired[el.name]) return;
    cbWired[el.name] = true;
    form.querySelectorAll('input[type="checkbox"][name="' + el.name + '"]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        var fd = new FormData();
        fd.append("entryid", entryId);
        var sentinel = form.querySelector('input[type="hidden"][name="' + el.name + '"]');
        if (sentinel) fd.append(sentinel.name, sentinel.value);
        form.querySelectorAll('input[type="checkbox"][name="' + el.name + '"]:checked').forEach(function(c) {
          fd.append(c.name, c.value);
        });
        _postField(fd);
      });
    });
  });
}
function saveResponses() {
  var form = document.getElementById("response-form");
  var status = document.getElementById("save-status");
  var btn = document.getElementById("btn-save");
  status.textContent = "Saving\u2026";
  btn.disabled = true;
  var xhr = new XMLHttpRequest();
  var data = new FormData(form);
  xhr.addEventListener("load", function() {
    btn.disabled = false;
    try {
      var resp = JSON.parse(xhr.responseText);
      if (resp.status === "OK") {
        status.innerHTML = '<span style="color:#4caf50">\u2713 Saved successfully</span>';
        updateUndoBaselines();
      } else if (resp.status === "E_CLOSED") {
        status.innerHTML = '<span style="color:#c44">\u2717 ' + (resp.msg || "Entries are closed") + "</span>";
      } else {
        status.innerHTML = '<span style="color:#c44">\u2717 Error: ' + (resp.msg || resp.status) + "</span>";
      }
    } catch (e) {
      status.innerHTML = '<span style="color:#c44">\u2717 Unexpected error</span>';
    }
  });
  xhr.addEventListener("error", function() {
    btn.disabled = false;
    status.innerHTML = '<span style="color:#c44">\u2717 Network error \u2014 please try again</span>';
  });
  xhr.open("POST", window.JADE_BASE + "/formResponses");
  xhr.send(data);
}
var _savedValues = {};
function initUndoBaselines() {
  var form = document.getElementById("response-form");
  form.querySelectorAll('input[type="text"]:not([readonly]), textarea').forEach(function(el) {
    if (el.name) _savedValues[el.name] = el.value;
    el.addEventListener("input", function() {
      trackChange(el);
    });
    el.addEventListener("change", function() {
      trackChange(el);
    });
  });
  form.querySelectorAll("textarea[data-wordlimit]").forEach(function(ta) {
    var limit = parseInt(ta.dataset.wordlimit) || 0;
    ta.addEventListener("keyup", function() {
      countWords(ta, limit || null);
      trackChange(ta);
    });
  });
}
function trackChange(el) {
  var btn = undoBtnFor(el);
  if (!btn) return;
  btn.style.display = _savedValues[el.name] !== void 0 && el.value !== _savedValues[el.name] ? "" : "none";
}
function undoBtnFor(el) {
  var next = el.nextElementSibling;
  if (next && next.classList.contains("btn-undo")) return next;
  var wc = el.parentElement && el.parentElement.querySelector(".word-count .btn-undo");
  return wc || null;
}
function undoField(btn) {
  var el;
  var wc = btn.closest(".word-count");
  if (wc) {
    el = wc.previousElementSibling;
    while (el && el.tagName !== "TEXTAREA") el = el.previousElementSibling;
  } else {
    el = btn.previousElementSibling;
  }
  if (!el || _savedValues[el.name] === void 0) return;
  el.value = _savedValues[el.name];
  btn.style.display = "none";
  if (el.tagName === "TEXTAREA") countWords(el, null);
}
function updateUndoBaselines() {
  var form = document.getElementById("response-form");
  form.querySelectorAll('input[type="text"]:not([readonly]), textarea').forEach(function(el) {
    if (el.name) _savedValues[el.name] = el.value;
    var btn = undoBtnFor(el);
    if (btn) btn.style.display = "none";
  });
}
initUndoBaselines();
initBlurSave();
window.addEventListener("beforeunload", function() {
  if (_uploadsInFlight > 0) return;
  var form = document.getElementById("response-form");
  var data = new FormData(form);
  navigator.sendBeacon(window.JADE_BASE + "/formResponses", data);
});
