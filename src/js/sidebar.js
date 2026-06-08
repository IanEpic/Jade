// sidebar.js — home sidebar panel navigation
(function () {
    var panels    = document.querySelectorAll('.sidebar-panel');
    var validKeys = Array.from(panels).map(function (p) { return p.dataset.panel; });

    function showPanel(key) {
        if (validKeys.indexOf(key) === -1) key = 'main';
        panels.forEach(function (p) {
            p.style.display = p.dataset.panel === key ? '' : 'none';
        });
        try { sessionStorage.setItem('sidebarPanel', key); } catch (e) {}
    }

    function activatePanel(key) {
        if (validKeys.indexOf(key) === -1) key = 'main';
        try { sessionStorage.setItem('sidebarPanel', key); } catch (e) {}
        var targetPanel = document.querySelector('[data-panel="' + key + '"]');
        var firstLink   = targetPanel && targetPanel.querySelector('a:not([data-goto])[href]:not([href="#"])');
        if (firstLink) {
            window.location.href = firstLink.getAttribute('href');
        } else {
            showPanel(key);
        }
    }

    var stored = null;
    try { stored = sessionStorage.getItem('sidebarPanel'); } catch (e) {}
    showPanel(stored || 'main');

    document.querySelectorAll('[data-goto]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            activatePanel(el.dataset.goto);
        });
    });
})();
