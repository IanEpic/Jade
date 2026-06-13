// login.js — two-step login flow
(function () {
    var cfg        = document.getElementById('login-config');
    var CHECK_URL  = cfg.dataset.checkUrl;
    var SIGNUP_URL = cfg.dataset.signupUrl;
    var RESET_URL  = cfg.dataset.resetUrl;

    var steps = ['email', 'password', 'signup', 'done', 'disabled'];

    function show(name) {
        steps.forEach(function (s) {
            var el = document.getElementById('step-' + s);
            if (el) el.style.display = (s === name) ? '' : 'none';
        });
    }

    function setError(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent    = msg;
        el.style.display  = msg ? '' : 'none';
    }

    // ── Step 1: email check ──────────────────────────────────────────────────
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
            btn.textContent = 'Continue';

            if (data.status === 'password' || data.status === 'added') {
                document.getElementById('pw-email').value = email;
                var greeting = document.getElementById('password-greeting');
                if (data.status === 'added') {
                    greeting.textContent = 'Welcome, ' + (data.name || email) + '! We\'ve added you to this program. Please enter your password to continue.';
                } else {
                    greeting.textContent = 'Welcome back' + (data.name ? ', ' + data.name : '') + '! Please enter your password.';
                }
                document.getElementById('reset-link').href = RESET_URL + '?email=' + encodeURIComponent(email);
                show('password');
                document.getElementById('login-password').focus();

            } else if (data.status === 'signup') {
                document.getElementById('signup-email').value = email;
                document.getElementById('signup-intro').textContent = 'No account found for ' + email + '. Fill in the details below to create one.';
                show('signup');
                document.getElementById('signup-firstname').focus();

            } else if (data.status === 'disabled') {
                show('disabled');

            } else {
                setError('email-error', data.message || 'Something went wrong. Please try again.');
            }
        })
        .catch(function () {
            btn.disabled    = false;
            btn.textContent = 'Continue';
            setError('email-error', 'Could not connect. Please try again.');
        });
    });

    // ── Step 2b: signup ──────────────────────────────────────────────────────
    var formSignup = document.getElementById('form-signup');
    formSignup.addEventListener('submit', function (e) {
        e.preventDefault();
        var tc = document.getElementById('signup-tc');
        if (!tc.checked) {
            setError('signup-error', 'Please accept the terms and conditions.');
            return;
        }
        setError('signup-error', '');

        var btn = document.getElementById('btn-signup');
        btn.disabled    = true;
        btn.textContent = 'Creating account…';

        var data = new URLSearchParams(new FormData(formSignup)).toString();
        fetch(SIGNUP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
            body:    data,
        })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            btn.disabled    = false;
            btn.textContent = 'Create Account';
            if (result.ok && result.redirect) {
                window.location.href = result.redirect;
            } else if (result.ok) {
                document.getElementById('done-message').textContent = 'Account created! Check your email for your login details.';
                show('done');
            } else {
                setError('signup-error', result.error || 'Something went wrong. Please try again.');
            }
        })
        .catch(function () {
            btn.disabled    = false;
            btn.textContent = 'Create Account';
            setError('signup-error', 'Could not connect. Please try again.');
        });
    });

    // ── Back links ───────────────────────────────────────────────────────────
    function resetEmailStep() {
        var btn = document.getElementById('btn-continue');
        if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
        setError('email-error', '');
        document.querySelectorAll('#step-password p[style*="color:#c0392b"]').forEach(function (p) { p.remove(); });
        setError('password-error', '');
        document.getElementById('login-password').value = '';
        show('email');
        document.getElementById('login-email').focus();
    }

    ['btn-back-from-pw', 'btn-back-from-signup', 'btn-back-from-done', 'btn-back-from-disabled'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); resetEmailStep(); });
    });

    // ── Restore from bfcache (browser back/forward) ──────────────────────────
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) { resetEmailStep(); }
    });

    // ── If returning after a failed password POST, go straight to step 2 ────
    var pwEmail = document.getElementById('pw-email').value;
    if (pwEmail) {
        var greeting = document.getElementById('password-greeting');
        greeting.textContent = 'Please enter your password for ' + pwEmail + '.';
        show('password');
    }
})();
