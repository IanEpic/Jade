// form-admin.js — program admin form: accordion toggle + TinyMCE init
// Note: TinyMCE CDN must be loaded before this file.

document.addEventListener('click', function(e) {
    var legend = e.target.closest('[data-action="toggle-accordion"]');
    if (!legend) return;
    var body      = legend.nextElementSibling;
    var collapsed = body.style.display === 'none' || body.style.display === '';
    body.style.display = collapsed ? 'block' : 'none';
    legend.classList.toggle('collapsed', !collapsed);
});

tinymce.init({
    selector:    'textarea.mceEditor',
    plugins:     'anchor autolink lists link image table code fullscreen',
    toolbar:     'undo redo | blocks | bold italic underline | forecolor backcolor | alignleft aligncenter alignright | bullist numlist | link image table | code fullscreen',
    menubar:     false,
    height:      250,
    skin:        'oxide-dark',
    content_css: 'dark',
    promotion:   false,
});
