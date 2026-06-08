// root-login.js — two-step login flow for the root (non-slug) login page
(function () {
    var cfg       = document.getElementById('login-config');
    var CHECK_URL = cfg.dataset.checkUrl;
    var RESET_URL = cfg.dataset.resetUrl;

    var steps = ['email', 'password', 'notfound'];

    function show(name) {
        steps.forEach(function (s) {
            var el = document.getElementById('step-' + s);
            if (el) el.style.display = (s === name) ? '' : 'none';
        });
    }

    function setError(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent   = msg;
        el.style.display = msg ? '' : 'none';
    }

    var formEmail = document.getElementById('form-email');
    formEmail.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('login-email').value.trim();
        if (!email) { setError('email-error', 'Please enter your email address.'); return; }
        setError('email-error', '');

        var btn = document.getElementById('btn-continue');
        btn.disabled    = true;
        btn.textContent = 'Checking…';

        fetch(CHECK_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
            body:    'email=' + encodeURIComponent(email),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            btn.disabled    = false;
            btn.textContent = 'Continue →';
            if (data.status === 'password') {
                document.getElementById('pw-email').value = email;
                document.getElementById('password-greeting').textContent =
                    'Welcome back' + (data.name ? ', ' + data.name : '') + '! Please enter your password.';
                document.getElementById('reset-link').href = RESET_URL + '?email=' + encodeURIComponent(email);
                show('password');
                document.getElementById('login-password').focus();
            } else if (data.status === 'notfound') {
                show('notfound');
            } else {
                setError('email-error', data.message || 'Something went wrong. Please try again.');
            }
        })
        .catch(function () {
            btn.disabled    = false;
            btn.textContent = 'Continue →';
            setError('email-error', 'Could not connect. Please try again.');
        });
    });

    ['btn-back-from-pw', 'btn-back-from-notfound'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) {
            e.preventDefault();
            show('email');
            document.getElementById('login-email').focus();
        });
    });

    // If returning after a failed password POST, skip straight to step 2
    var pwEmail = document.getElementById('pw-email').value;
    if (pwEmail) {
        document.getElementById('password-greeting').textContent =
            'Please enter your password for ' + pwEmail + '.';
        show('password');
    }
})();
