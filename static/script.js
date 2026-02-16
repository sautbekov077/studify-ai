document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Studify System v3.0 Loaded");

    // --- HELPERS ---
    function get(id) { return document.getElementById(id); }
    function hide(el) { if(el) el.classList.add('hidden'); }
    function show(el) { if(el) el.classList.remove('hidden'); }

    // --- ELEMENTS ---
    const els = {
        authOverlay: get('auth-overlay'),
        authForm: get('auth-form'),
        authEmail: get('auth-email'),
        authPass: get('auth-password'),
        authBtn: get('auth-btn'),
        authSwitch: get('switch-action'),
        authTitle: get('auth-title'),
        authError: get('auth-error'),
        
        forgotLink: get('forgot-pass-link'),
        resetForm: get('reset-form'),
        resetEmail: get('reset-email'),
        sendCodeBtn: get('send-code-btn'),
        codeSection: get('code-section'),
        resetCode: get('reset-code'),
        newPass: get('new-password'),
        confirmResetBtn: get('confirm-reset-btn'),
        backToLogin: get('back-to-login'),
        
        openProfileBtn: get('open-profile-btn'),
        profileModal: get('profile-modal'),
        closeModal: document.querySelector('.close-modal'),
        logoutBtn: get('logout-btn-modal'),
        pEmail: get('profile-email'),
        pId: get('profile-id'),
        pStatus: get('profile-status'),
        
        chatBox: get('chat-box'),
        welcome: get('welcome-screen'),
        typing: get('typing-indicator'),
        input: get('user-input'),
        sendBtn: get('send-btn'),
        attachBtn: get('attach-btn'),
        fileInput: get('file-input'),
        previewCont: get('image-preview-container'),
        previewImg: get('image-preview'),
        removeImg: get('remove-image'),
        modelBtns: document.querySelectorAll('.model-btn')
    };

    let isLoginMode = true;
    let currentModel = 'chat';
    let currentImageBase64 = null;

    // --- 1. INIT & SESSION CHECK ---
    const token = localStorage.getItem('access_token');
    
    // Проверка на "битый" токен при старте
    if (token && token !== "undefined" && token !== "null") {
        initializeSession();
    } else {
        // Если токен мусорный — чистим его
        localStorage.removeItem('access_token');
        show(els.authOverlay);
    }

    function initializeSession() {
        hide(els.authOverlay);
        show(els.openProfileBtn);
        loadProfile(); // Загружаем данные
    }

    // --- 2. AUTHENTICATION ---
    
    // Переключатель Вход / Регистрация
    if (document.getElementById('auth-switch-text')) {
        document.getElementById('auth-switch-text').addEventListener('click', (e) => {
            if (e.target.id === 'switch-action') {
                isLoginMode = !isLoginMode;
                els.authError.classList.add('hidden');
                
                if (isLoginMode) {
                    els.authTitle.textContent = "Вход";
                    els.authBtn.textContent = "Войти";
                    document.getElementById('auth-switch-text').innerHTML = 'Нет аккаунта? <span id="switch-action" style="color:#1ABC9C;cursor:pointer;font-weight:bold">Зарегистрироваться</span>';
                    show(els.forgotLink);
                } else {
                    els.authTitle.textContent = "Регистрация";
                    els.authBtn.textContent = "Создать аккаунт";
                    document.getElementById('auth-switch-text').innerHTML = 'Есть аккаунт? <span id="switch-action" style="color:#1ABC9C;cursor:pointer;font-weight:bold">Войти</span>';
                    hide(els.forgotLink);
                }
            }
        });
    }

    // Логика кнопки "Войти"
    if (els.authBtn) {
        els.authBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = els.authEmail.value.trim();
            const password = els.authPass.value.trim();

            if (!email || !password) return showError("Заполните все поля");

            els.authBtn.disabled = true;
            els.authBtn.textContent = "Загрузка...";

            try {
                const endpoint = isLoginMode ? '/token' : '/register';
                let response;

                if (isLoginMode) {
                    const formData = new FormData();
                    formData.append('username', email);
                    formData.append('password', password);
                    response = await fetch(endpoint, { method: 'POST', body: formData });
                } else {
                    response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                }

                const data = await response.json();
                
                if (!response.ok) throw new Error(data.detail || "Ошибка сервера");

                if (isLoginMode) {
                    // ЗАЩИТА: Проверяем, что токен реально пришел
                    if (data.access_token) {
                        console.log("Токен получен, сохраняем...");
                        localStorage.setItem('access_token', data.access_token);
                        initializeSession();
                    } else {
                        throw new Error("Сервер не прислал токен!");
                    }
                } else {
                    alert("Аккаунт создан! Теперь войдите.");
                    location.reload();
                }

            } catch (err) {
                console.error(err);
                showError(err.message === "Unauthorized" ? "Неверный логин или пароль" : err.message);
            } finally {
                els.authBtn.disabled = false;
                els.authBtn.textContent = isLoginMode ? "Войти" : "Создать аккаунт";
            }
        });
    }

    function showError(msg) {
        if(els.authError) {
            els.authError.textContent = msg;
            show(els.authError);
        } else alert(msg);
    }

    // --- 3. PASSWORD RESET ---
    if(els.forgotLink) els.forgotLink.addEventListener('click', () => { hide(els.authForm); show(els.resetForm); els.authTitle.textContent = "Сброс"; });
    if(els.backToLogin) els.backToLogin.addEventListener('click', () => { hide(els.resetForm); show(els.authForm); els.authTitle.textContent = "Вход"; });
    
    if(els.sendCodeBtn) els.sendCodeBtn.addEventListener('click', async () => {
        const email = els.resetEmail.value;
        if(!email) return alert("Введите email");
        await fetch('/forgot-password', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email}) });
        alert("Код отправлен на почту (если она существует)");
        hide(els.sendCodeBtn); show(els.codeSection);
    });

    if(els.confirmResetBtn) els.confirmResetBtn.addEventListener('click', async () => {
        const email = els.resetEmail.value;
        const code = els.resetCode.value;
        const new_password = els.newPass.value;
        const res = await fetch('/reset-password', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, code, new_password}) });
        if(res.ok) { alert("Пароль изменен! Войдите."); location.reload(); }
        else { alert("Ошибка. Проверьте код."); }
    });

    // --- 4. PROFILE & LOGOUT ---
    async function loadProfile() {
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/users/me', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });

            if (res.status === 401) {
                console.warn("Сессия истекла или токен сломан. Выход.");
                logout(false); // false = не перезагружать, просто показать логин
                return;
            }

            const user = await res.json();
            if(els.pEmail) els.pEmail.textContent = user.email;
            if(els.pId) els.pId.textContent = user.user_id || "---";
            if(els.pStatus) {
                els.pStatus.textContent = user.is_pro ? "PRO" : "FREE";
                if(user.is_pro) els.pStatus.classList.add('pro');
            }
        } catch(e) { 
            console.error("Ошибка профиля:", e); 
        }
    }

    function logout(doReload = true) {
        localStorage.removeItem('access_token');
        if (doReload) {
            location.reload();
        } else {
            // Мягкий выход без перезагрузки (чтобы не было цикла)
            hide(els.profileModal);
            hide(els.openProfileBtn);
            show(els.authOverlay);
        }
    }

    if(els.openProfileBtn) els.openProfileBtn.addEventListener('click', () => show(els.profileModal));
    if(els.closeModal) els.closeModal.addEventListener('click', () => hide(els.profileModal));
    if(els.logoutBtn) els.logoutBtn.addEventListener('click', () => logout(true));

    // --- 5. CHAT ---
    els.modelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            els.modelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentModel = btn.dataset.model;
        });
    });

    if(els.attachBtn) els.attachBtn.addEventListener('click', () => els.fileInput.click());
    if(els.fileInput) els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentImageBase64 = ev.target.result;
                els.previewImg.src = currentImageBase64;
                show(els.previewCont);
                if(currentModel !== 'eye') document.querySelector('[data-model="eye"]')?.click();
            };
            reader.readAsDataURL(file);
        }
    });
    if(els.removeImg) els.removeImg.addEventListener('click', () => { currentImageBase64=null; els.fileInput.value=''; hide(els.previewCont); });

    if(els.sendBtn) els.sendBtn.addEventListener('click', sendMessage);
    if(els.input) els.input.addEventListener('keypress', (e) => { if(e.key==='Enter') sendMessage(); });

    async function sendMessage() {
        const text = els.input.value.trim();
        if(!text && !currentImageBase64) return;
        
        if(els.welcome) els.welcome.classList.add('minimized');
        show(els.chatBox);

        appendMsg(text, 'user-msg', currentImageBase64);
        
        const payload = { message: text, model_type: currentModel, image: currentImageBase64 };
        els.input.value = ''; currentImageBase64 = null; hide(els.previewCont); show(els.typing);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}` 
                },
                body: JSON.stringify(payload)
            });

            if (res.status === 401) { logout(false); return; }

            const data = await res.json();
            hide(els.typing);
            
            if(data.reply) appendAiMessage(data.reply);
            else appendMsg("Ошибка: Пустой ответ от ИИ", 'ai-msg error');

        } catch(e) { 
            hide(els.typing); 
            console.error(e);
            appendMsg("Ошибка соединения", 'ai-msg error'); 
        }
    }

    // --- RENDER FUNCTIONS ---
    function appendMsg(text, cls, img64) {
        const div = document.createElement('div');
        div.classList.add('message', cls.includes(' ') ? cls.split(' ')[0] : cls);
        if(cls.includes('error')) div.classList.add('error');
        if(img64) { const img = document.createElement('img'); img.src = img64; img.classList.add('user-image'); div.appendChild(img); }
        if(text) { const p = document.createElement('div'); p.textContent = text; div.appendChild(p); }
        els.chatBox.appendChild(div); els.chatBox.scrollTop = els.chatBox.scrollHeight;
    }

    function appendAiMessage(text) {
        const div = document.createElement('div');
        div.classList.add('message', 'ai-msg');

        // 1. Markdown
        if (typeof marked !== 'undefined') div.innerHTML = marked.parse(text);
        else div.textContent = text;

        // 2. Math (KaTeX)
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(div, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }

        // 3. Code (Highlight.js)
        if (typeof hljs !== 'undefined') {
            div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }

        els.chatBox.appendChild(div);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
    }
});