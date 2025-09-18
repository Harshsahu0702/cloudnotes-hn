// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Get all navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    
    // Add smooth scrolling only for in-page hash links; let real routes navigate normally
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href') || '';
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(href);
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
    
    // Add scroll effect to navbar
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.15)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        }
    });
    
    // Add entrance animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe sections for animation
    const sections = document.querySelectorAll('.about, .contact');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });

    // Auth Modal basic wiring
    const authModal = document.getElementById('authModal');
    const btnSignIn = document.getElementById('btnSignIn');
    const btnSignUp = document.getElementById('btnSignUp');
    const authClose = document.getElementById('authClose');
    const tabLogin = document.getElementById('authTabLogin');
    const tabSignup = document.getElementById('authTabSignup');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const authError = document.getElementById('authError');
    const btnForgot = document.getElementById('btnForgot');
    const resetModal = document.getElementById('resetModal');
    const resetClose = document.getElementById('resetClose');
    const resetFormEmail = document.getElementById('resetFormEmail');
    const resetFormVerify = document.getElementById('resetFormVerify');
    const resetFormPassword = document.getElementById('resetFormPassword');
    const resetEmailInput = document.getElementById('reset-email');
    const resetSendBtn = document.getElementById('resetSendBtn');
    const resetVerifyBtn = document.getElementById('resetVerifyBtn');
    const resetResendBtn = document.getElementById('resetResendBtn');
    const resetTimer = document.getElementById('resetTimer');
    const resetNewPass = document.getElementById('reset-newpass');
    const resetConfirmPass = document.getElementById('reset-confirmpass');
    const resetOtpInputs = resetFormVerify ? resetFormVerify.querySelectorAll('.otp-input') : [];
    let resetTimerInterval; let resetTimeLeft = 120; let resetEmail = '';

    function switchAuthTab(which) {
        if (!tabLogin || !tabSignup || !loginForm || !signupForm) return;
        
        // Remove active class from both tabs
        tabLogin.classList.remove('active');
        tabSignup.classList.remove('active');
        
        // Hide both forms
        loginForm.style.display = 'none';
        signupForm.style.display = 'none';
        
        // Show the selected tab and form
        if (which === 'signup') {
            tabSignup.classList.add('active');
            signupForm.style.display = 'block';
        } else {
            tabLogin.classList.add('active');
            loginForm.style.display = 'block';
        }
        
        // Clear any error messages when switching tabs
        if (authError) {
            authError.style.display = 'none';
            authError.textContent = '';
        }
    }

    function openAuth(which) {
        if (!authModal) return;
        authModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scrolling when modal is open
        requestAnimationFrame(() => {
            authModal.classList.add('show');
            switchAuthTab(which || 'login');
        });
    }

    function closeAuth() {
        if (!authModal) return;
        authModal.classList.remove('show');
        document.body.style.overflow = ''; // Re-enable scrolling
        setTimeout(() => { authModal.style.display = 'none'; }, 200);
    }

    // Event listeners
    if (btnSignIn) btnSignIn.addEventListener('click', () => openAuth('login'));
    if (btnSignUp) btnSignUp.addEventListener('click', () => openAuth('signup'));
    if (authClose) authClose.addEventListener('click', closeAuth);
    if (btnForgot) btnForgot.addEventListener('click', () => {
        if (!resetModal) return;
        document.getElementById('authClose')?.click();
        resetModal.style.display = 'flex';
        requestAnimationFrame(() => resetModal.classList.add('show'));
        resetFormEmail.style.display = '';
        resetFormVerify.style.display = 'none';
        resetFormPassword.style.display = 'none';
        resetEmailInput.value = document.getElementById('login-username')?.value || '';
        resetEmailInput.focus();
    });
    if (resetClose) resetClose.addEventListener('click', () => {
        resetModal.classList.remove('show');
        setTimeout(() => { resetModal.style.display = 'none'; }, 200);
        clearInterval(resetTimerInterval);
    });
    
    // Add click handlers for tab switching
    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
    if (tabSignup) tabSignup.addEventListener('click', () => switchAuthTab('signup'));
    
    // Close modal when clicking outside the content
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                closeAuth();
            }
        });
    }

    // Handle signup form submission
    // Skip attaching here if OTP-enabled signup flow is present on the page
    // The index page manages OTP + registration end-to-end
    if (signupForm && !document.getElementById('otpSection')) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-username').value.trim();
            const password = document.getElementById('signup-password').value;
            
            // Basic validation
            if (!name || !email || !password) {
                showNotification('All fields are required', 'error');
                return;
            }

            // Check if OTP is verified using sessionStorage
            const isOtpVerified = sessionStorage.getItem(`otp_verified_${email}`) === 'true';
            if (!isOtpVerified) {
                showNotification('Please verify your email with OTP first', 'error');
                return;
            }

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: name,
                        username: email,
                        password: password
                    }),
                    credentials: 'include'
                });

                if (response.ok) {
                    // Clear OTP verification status after successful registration
                    sessionStorage.removeItem(`otp_verified_${email}`);
                    
                    showNotification('Registration successful!', 'success');
                    closeAuth();
                    
                    // Update the UI to show logged-in state
                    const navAuth = document.querySelector('.nav-auth');
                    if (navAuth) {
                        navAuth.innerHTML = `
                            <div class="nav-profile">
                                <a href="/profile" class="profile-link" title="Profile">
                                    <span class="avatar">${name.charAt(0).toUpperCase()}</span>
                                    <span class="profile-name">${name}</span>
                                </a>
                                <form action="/logout" method="POST" style="display:inline">
                                    <button type="submit" class="btn-auth btn-signin">Logout</button>
                                </form>
                            </div>
                        `;
                    }
                    
                    // Redirect to home page after a short delay
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                } else {
                    const errorText = await response.text();
                    showNotification(errorText || 'Registration failed', 'error');
                }
            } catch (error) {
                console.error('Registration error:', error);
                showNotification('An error occurred during registration', 'error');
            }
        });
    }

    // Handle login form submission
    if (loginForm) loginForm.addEventListener('submit', function(e){
        e.preventDefault();
        if (authError) { authError.style.display = 'none'; authError.textContent = ''; }
        const fd = new FormData(loginForm);
        const body = new URLSearchParams();
        for (const [k, v] of fd.entries()) body.append(k, v);
        fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, credentials: 'include' })
          .then(async (res) => {
            const txt = await res.text();
            if (!res.ok) throw new Error(txt || 'Login failed');
            return txt;
          })
          .then(() => {
            // Use server session state; reload to get server-rendered UI
            window.location.reload();
          })
          .catch(err => {
            if (authError) { authError.textContent = err.message || 'Login failed'; authError.style.display = 'block'; }
          });
    });

    // Reset: send code
    if (resetFormEmail) resetFormEmail.addEventListener('submit', async function(e){
        e.preventDefault();
        const email = resetEmailInput.value.trim();
        if (!email) return showNotification('Enter your email', 'warning');
        resetSendBtn.disabled = true; resetSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        try {
            const r = await fetch('/api/password-reset/send-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }), credentials: 'include' });
            const d = await r.json(); if (!r.ok) throw new Error(d.message||'Failed');
            resetEmail = email; resetFormEmail.style.display = 'none'; resetFormVerify.style.display = '';
            resetResendBtn.disabled = true; resetTimeLeft = 120; updateResetTimer(); resetTimerInterval = setInterval(updateResetTimer, 1000);
            showNotification('Code sent to your email', 'success');
        } catch (err) {
            showNotification(err.message||'Failed to send code', 'error');
        } finally { resetSendBtn.disabled = false; resetSendBtn.innerHTML = 'Send Code'; }
    });

    // Reset: OTP input UX and enabling Verify button
    if (resetOtpInputs && resetOtpInputs.length) {
        const updateVerifyEnabled = () => {
            const digits = Array.from(resetOtpInputs).map(i=>i.value).join('');
            if (resetVerifyBtn) resetVerifyBtn.disabled = digits.length !== 6;
        };
        resetOtpInputs.forEach((input, idx) => {
            input.addEventListener('input', function(){
                this.value = this.value.replace(/\D/g, '').slice(0,1);
                if (this.value && idx < resetOtpInputs.length - 1) resetOtpInputs[idx+1].focus();
                updateVerifyEnabled();
            });
            input.addEventListener('keydown', function(e){
                if (e.key === 'Backspace' && !this.value && idx > 0) resetOtpInputs[idx-1].focus();
            });
            input.addEventListener('paste', function(e){
                e.preventDefault();
                const data = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                if (!data) return;
                data.split('').slice(0, resetOtpInputs.length).forEach((d, i) => { resetOtpInputs[i].value = d; });
                resetOtpInputs[Math.min(data.length, resetOtpInputs.length)-1].focus();
                updateVerifyEnabled();
            });
        });
        updateVerifyEnabled();
    }

    function updateResetTimer(){
        const m = Math.floor(resetTimeLeft/60); const s = resetTimeLeft%60;
        if (resetTimer) resetTimer.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        if (resetTimeLeft <= 0){ clearInterval(resetTimerInterval); resetResendBtn.disabled = false; }
        else resetTimeLeft--;
    }

    if (resetResendBtn) resetResendBtn.addEventListener('click', async function(){
        if (!resetEmail) return;
        resetResendBtn.disabled = true;
        try {
            const r = await fetch('/api/password-reset/send-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: resetEmail }), credentials: 'include' });
            const d = await r.json(); if (!r.ok) throw new Error(d.message||'Failed');
            resetTimeLeft = 120; updateResetTimer(); clearInterval(resetTimerInterval); resetTimerInterval = setInterval(updateResetTimer, 1000);
            showNotification('Code resent', 'success');
        } catch (err) { showNotification(err.message||'Failed to resend', 'error'); resetResendBtn.disabled = false; }
    });

    // Reset: verify code
    if (resetFormVerify) resetFormVerify.addEventListener('submit', async function(e){
        e.preventDefault();
        const digits = Array.from(resetFormVerify.querySelectorAll('.otp-input')).map(i=>i.value).join('');
        if (digits.length !== 6) return showNotification('Enter 6-digit code', 'warning');
        resetVerifyBtn.disabled = true; resetVerifyBtn.textContent = 'Verifying...';
        try {
            const r = await fetch('/api/password-reset/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: resetEmail, otp: digits }), credentials: 'include' });
            const d = await r.json(); if (!r.ok) throw new Error(d.message||'Failed');
            resetFormVerify.style.display = 'none'; resetFormPassword.style.display = '';
            showNotification('Code verified. Set a new password.', 'success');
        } catch (err) { showNotification(err.message||'Verification failed', 'error'); resetVerifyBtn.disabled = false; resetVerifyBtn.textContent = 'Verify Code'; }
    });

    // Reset: confirm new password
    if (resetFormPassword) resetFormPassword.addEventListener('submit', async function(e){
        e.preventDefault();
        const pass = resetNewPass.value; const confirm = resetConfirmPass.value;
        if (pass.length < 6) return showNotification('Password must be at least 6 chars', 'warning');
        if (pass !== confirm) return showNotification('Passwords do not match', 'warning');
        const otpDigits = Array.from(document.querySelectorAll('#resetFormVerify .otp-input')).map(i=>i.value).join('');
        const btn = document.getElementById('resetConfirmBtn'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        try {
            const r = await fetch('/api/password-reset/confirm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: resetEmail, otp: otpDigits, newPassword: pass }), credentials: 'include' });
            const d = await r.json(); if (!r.ok) throw new Error(d.message||'Failed');
            showNotification('Password updated. Please sign in.', 'success');
            resetModal.classList.remove('show'); setTimeout(()=>{ resetModal.style.display='none'; },200);
            openAuth('login');
            document.getElementById('login-username').value = resetEmail;
        } catch (err) { showNotification(err.message||'Update failed', 'error'); btn.disabled=false; btn.innerHTML='Update Password'; }
    });

    // Navbar auth state now server-rendered; no client swapping
    function updateNavbarAuth() {}

    function escapeHtml(str){ return String(str).replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

    // Do not override server auth state
    updateNavbarAuth();
    
    // Username clicks now navigate to the dedicated profile page
    document.body.addEventListener('click', function(e){
        const link = e.target.closest('a.chip-user');
        if (!link) return;
        // Allow default navigation to /user/:username
    });
});

// Upload Notes function
function uploadNotes() {
    // Redirect to the upload page
    window.location.href = '/';
}

// Browse Notes function
function browseNotes() {
    // Redirect to the read page
    window.location.href = '/read';
}

// Add some interactive effects
document.addEventListener('DOMContentLoaded', function() {
    // Add click ripple effect to buttons
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Add floating animation to hero elements
    const floatingNotes = document.querySelectorAll('.floating-note');
    
    floatingNotes.forEach((note, index) => {
        note.style.animationDelay = `${index * 1.5}s`;
    });
    
    // Enhanced scroll effects for navbar
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.99)';
            navbar.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.12)';
            navbar.style.borderBottom = '1px solid rgba(59, 130, 246, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08)';
            navbar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        }
    });
    
    // Form validation and enhancement
    const uploadForm = document.querySelector('#upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            // Server will enforce auth; optionally prompt client-side if known
            if (typeof window !== 'undefined' && window.isLoggedIn === false) {
                e.preventDefault();
                showNotification('Please sign in to upload notes', 'warning');
                openAuth('login');
                return;
            }
            const titleInput = document.querySelector('input[name="title"]');
            const fileInput = document.querySelector('input[name="file"]');
            
            if (!titleInput.value.trim()) {
                e.preventDefault();
                showNotification('Please enter a title for your PDF', 'warning');
                titleInput.focus();
                return;
            }
            
            if (!fileInput.files.length) {
                e.preventDefault();
                showNotification('Please select a PDF file to upload', 'warning');
                fileInput.focus();
                return;
            }
            
            const file = fileInput.files[0];
            if (file.type !== 'application/pdf') {
                e.preventDefault();
                showNotification('Please select a valid PDF file', 'warning');
                fileInput.focus();
                return;
            }
            
            // Enforce Cloudinary free tier limit ~10MB for raw upload
            const MAX_MB = 10;
            if (file.size > MAX_MB * 1024 * 1024) {
                e.preventDefault();
                showNotification(`File is larger than ${MAX_MB} MB. Please upload a smaller PDF.`, 'error');
                return;
            }
            
            // Direct client upload flow to bypass server body size limits (~5MB)
            e.preventDefault();
            const submitBtn = document.getElementById('uploadSubmitBtn') || uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            submitBtn.disabled = true;
            submitBtn.classList.add('btn-loading');
            submitBtn.setAttribute('aria-busy', 'true');

            try {
                // 1) Get a signed payload for direct client upload
                const sigRes = await fetch('/api/cloudinary/signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ filename: file.name })
                });
                const sig = await sigRes.json().catch(() => ({}));
                if (!sigRes.ok || sig.success === false) throw new Error(sig.message || 'Failed to get upload signature');

                const { cloudName, apiKey, timestamp, signature, folder, public_id } = sig;
                if (!cloudName || !apiKey || !timestamp || !signature) throw new Error('Invalid Cloudinary signature response');

                // 2) Upload directly to Cloudinary raw/upload
                const cldForm = new FormData();
                cldForm.append('file', file);
                cldForm.append('api_key', apiKey);
                cldForm.append('timestamp', timestamp);
                cldForm.append('signature', signature);
                cldForm.append('folder', folder);
                cldForm.append('public_id', public_id);
                // resource_type must be raw for PDFs; endpoint path also uses raw
                const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/upload`;

                const cldRes = await fetch(endpoint, { method: 'POST', body: cldForm });
                const cldJson = await cldRes.json().catch(() => ({}));
                if (!cldRes.ok || !cldJson.secure_url) throw new Error(cldJson.error?.message || 'Cloudinary upload failed');

                // 3) Save note metadata to our server (small JSON only; no file body hits server)
                const metaRes = await fetch('/api/notes/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ title: titleInput.value.trim(), fileUrl: cldJson.secure_url, fileType: file.type || 'application/pdf' })
                });
                const metaJson = await metaRes.json().catch(() => ({}));
                if (!metaRes.ok || metaJson.success === false) throw new Error(metaJson.message || 'Failed to save note');

                const title = (metaJson && metaJson.data && metaJson.data.title) ? metaJson.data.title : '';
                showNotification(`${title ? '"' + title + '" ' : ''}uploaded successfully`, 'success');
                setTimeout(() => { window.location.href = '/profile'; }, 1000);
            } catch (err) {
                showNotification(err.message || 'Upload failed', 'error');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                submitBtn.classList.remove('btn-loading');
                submitBtn.removeAttribute('aria-busy');
            }
        });
    }
    
    // File input enhancement
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const fileName = file.name;
                const fileSize = (file.size / 1024 / 1024).toFixed(2);
                
                // Update file input label
                const label = document.querySelector('.file-input-label');
                if (label) {
                    label.innerHTML = `
                        <i class="fas fa-file-pdf"></i>
                        <span>${fileName} (${fileSize} MB)</span>
                    `;
                    label.style.borderColor = '#10b981';
                    label.style.background = '#ecfdf5';
                    label.style.color = '#059669';
                }
                
                showNotification(`File selected: ${fileName}`, 'success');
            }
        });
    }
});

// Check for feedback parameter in URL
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const feedback = params.get('feedback');

    if (feedback) {
        if (feedback === 'success') {
            showNotification('Feedback sent successfully!', 'success');
        } else if (feedback === 'error') {
            showNotification('Failed to send feedback. Please try again later.', 'error');
        }

        // Remove feedback param from URL without reloading
        params.delete('feedback');
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
    }
});

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 10000;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        transform: translateX(400px);
        transition: transform 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-times-circle';
        default: return 'fa-info-circle';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'success': return 'linear-gradient(135deg, #10b981, #34d399)';
        case 'warning': return 'linear-gradient(135deg, #f59e0b, #fbbf24)';
        case 'error': return 'linear-gradient(135deg, #ef4444, #f87171)';
        default: return 'linear-gradient(135deg, #3b82f6, #60a5fa)';
    }
}

// Add CSS for ripple effect and notifications
const style = document.createElement('style');
style.textContent = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: background 0.2s ease;
    }
    
    .notification-close:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .file-input-wrapper {
        position: relative;
        display: inline-block;
        width: 100%;
    }
    
    .file-input-wrapper input[type="file"] {
        position: absolute;
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
    }
    
    .file-input-label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1rem;
        border: 2px dashed #d1d5db;
        border-radius: 12px;
        background: #f9fafb;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: 500;
        color: #6b7280;
        min-height: 60px;
    }
    
    .file-input-label:hover {
        border-color: #3b82f6;
        background: #eff6ff;
        color: #1e40af;
    }
    
    .file-input-label i {
        font-size: 1.5rem;
    }
    
    .loading {
        opacity: 0.7;
        pointer-events: none;
    }
    
    .btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none !important; }
    .btn-loading { position: relative; }
    .btn-loading i.fa-spinner { margin-right: 8px; }
`;
document.head.appendChild(style);

// Lightweight modal utility used for success popup and PDF viewer
function showModal(title, message, actions = []) {
    // Remove any open modal
    const existing = document.getElementById('app-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'app-modal';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        width: 95vw; max-width: 95vw; height: 90vh; background: #fff; border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 16px 20px; font-weight: 700; font-size: 18px; border-bottom: 1px solid #eee;';
    header.textContent = title || 'Message';

    const body = document.createElement('div');
    body.style.cssText = 'padding: 16px 20px; color: #374151; flex: 1; overflow: auto;';
    if (typeof message === 'string') {
        body.innerHTML = `<p>${message}</p>`;
    } else if (message instanceof HTMLElement) {
        body.appendChild(message);
    }

    const footer = document.createElement('div');
    footer.style.cssText = 'padding: 12px 16px; display: flex; gap: 8px; justify-content: flex-end; background: #fafafa;';

    const close = () => overlay.remove();
    if (!actions || actions.length === 0) {
        actions = [{ label: 'Close', variant: 'primary' }];
    }
    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.textContent = a.label;
        btn.className = 'btn ' + (a.variant === 'secondary' ? 'btn-secondary' : 'btn-primary');
        btn.addEventListener('click', () => {
            if (typeof a.onClick === 'function') a.onClick();
            close();
        });
        footer.appendChild(btn);
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
}
