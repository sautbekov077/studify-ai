document.addEventListener('DOMContentLoaded', () => {
    const els = {
        overlay: document.getElementById('auth-overlay'),
        email: document.getElementById('auth-email'),
        pass: document.getElementById('auth-password'),
        confPass: document.getElementById('auth-confirm-password'),
        step1: document.getElementById('auth-step-1'),
        step2: document.getElementById('auth-step-2'),
        authBtn: document.getElementById('auth-btn'),
        finishBtn: document.getElementById('auth-finish-btn'),
        switchText: document.getElementById('auth-switch-text'),
        backToStep1: document.getElementById('back-to-step-1'),
        error: document.getElementById('auth-error'),
        title: document.getElementById('auth-title'),
        footer: document.getElementById('auth-footer-container'),
        
        chatBox: document.getElementById('chat-box'),
        input: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        modelsBtns: document.querySelectorAll('.model-btn'),
        welcomeScreen: document.getElementById('welcome-screen'),
        
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn'),
        imageContainer: document.getElementById('image-preview-container'),
        imagePreview: document.getElementById('image-preview'),
        removeImageBtn: document.getElementById('remove-image'),

        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        burgerBtn: document.getElementById('burger-btn'),
        closeSidebar: document.getElementById('close-sidebar'),
        newChatBtn: document.getElementById('new-chat-btn'),
        streakDays: document.getElementById('streak-days'),
        sidebarStatus: document.getElementById('sidebar-status'),
        
        langToggleBtn: document.getElementById('lang-toggle-btn'),
        langDropdown: document.getElementById('lang-dropdown'),
        langOptions: document.querySelectorAll('.lang-option'),
        
        openProfileBtn: document.getElementById('open-profile-btn'),
        profileModal: document.getElementById('profile-modal'),
        closeModal: document.getElementById('close-modal'),
        logout: document.getElementById('logout-btn-modal'),
        profileEmail: document.getElementById('profile-email'),
        profileId: document.getElementById('profile-id')
    };

    const translations = {  
        ru: { "login_title": "Вход", "email_ph": "Email", "pass_ph": "Пароль", "conf_pass_ph": "Подтвердите пароль", "forgot_pass": "Забыли пароль?", "login_btn": "Войти", "reg_btn": "Далее", "no_account": "Нет аккаунта?", "has_account": "Есть аккаунт?", "action_reg": "Зарегистрироваться", "action_login": "Войти", "new_chat": "Новый чат", "streak": "дней подряд", "account_label": "Аккаунт:", "profile_btn": "Личный кабинет", "welcome_desc": "Интеллектуальный инструмент для учебы с интегрированным ИИ. Все для студентов.", "input_ph": "Введите сообщение...", "model_chat": "Чат", "model_plan": "План", "model_code": "Код", "model_notes": "Конспект", "model_search": "Поиск", "model_eye": "Око", "logout_btn": "Выйти из аккаунта" },
        kk: { "login_title": "Кіру", "email_ph": "Эл. пошта", "pass_ph": "Құпия сөз", "conf_pass_ph": "Құпия сөзді растаңыз", "forgot_pass": "Құпия сөзді ұмыттыңыз ба?", "login_btn": "Кіру", "reg_btn": "Келесі", "no_account": "Аккаунт жоқ па?", "has_account": "Аккаунтыңыз бар ма?", "action_reg": "Тіркелу", "action_login": "Кіру", "new_chat": "Жаңа чат", "streak": "күн қатарынан", "account_label": "Аккаунт:", "profile_btn": "Жеке кабинет", "welcome_desc": "Жасанды интеллектпен біріктірілген оқуға арналған зияткерлік құрал.", "input_ph": "Хабарлама енгізіңіз...", "model_chat": "Чат", "model_plan": "Жоспар", "model_code": "Код", "model_notes": "Конспект", "model_search": "Іздеу", "model_eye": "Көз", "logout_btn": "Аккаунттан шығу" }
    };

    let currentLang = localStorage.getItem('app_lang') || 'ru';
    let isLogin = true;
    let currentModel = 'chat';
    let sessionId = Date.now().toString();
    let currentImageBase64 = null;

    function setLanguage(lang) {
        currentLang = lang; localStorage.setItem('app_lang', lang);
        document.querySelectorAll('[data-i18n]').forEach(el => { if (translations[lang][el.getAttribute('data-i18n')]) el.innerHTML = translations[lang][el.getAttribute('data-i18n')]; });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => { if (translations[lang][el.getAttribute('data-i18n-ph')]) el.placeholder = translations[lang][el.getAttribute('data-i18n-ph')]; });
        document.getElementById('lang-toggle-btn').innerHTML = `<span>🌐</span> ${lang === 'ru' ? 'Язык (RU)' : 'Тіл (KK)'}`;
    }

    function initApp() {
        setLanguage(currentLang); 
        const token = localStorage.getItem('access_token');
        if (token) { els.overlay.classList.add('hidden'); loadProfile(); } 
        else { els.overlay.classList.remove('hidden'); }
    }
    initApp();

    function showError(msg) { els.error.textContent = msg; els.error.classList.remove('hidden'); }
    function scrollToBottom() { setTimeout(() => { els.chatBox.scrollTop = els.chatBox.scrollHeight; }, 10); }

   
    document.querySelectorAll('.pref-group').forEach(group => {
        const buttons = group.querySelectorAll('.pref-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    function getActivePref(groupId) {
        const activeBtn = document.querySelector(`#${groupId} .pref-btn.active`);
        return activeBtn ? activeBtn.getAttribute('data-val') : '';
    }

    els.switchText.addEventListener('click', () => {
        isLogin = !isLogin; els.error.classList.add('hidden');
        if (isLogin) {
            els.title.textContent = translations[currentLang]["login_title"]; els.confPass.classList.add('hidden'); els.authBtn.textContent = translations[currentLang]["login_btn"];
            document.getElementById('switch-text-prefix').textContent = translations[currentLang]["no_account"]; document.getElementById('switch-action').textContent = translations[currentLang]["action_reg"];
        } else {
            els.title.textContent = "Регистрация (Шаг 1)"; els.confPass.classList.remove('hidden'); els.authBtn.textContent = translations[currentLang]["reg_btn"];
            document.getElementById('switch-text-prefix').textContent = translations[currentLang]["has_account"]; document.getElementById('switch-action').textContent = translations[currentLang]["action_login"];
        }
    });

    els.authBtn.addEventListener('click', async () => {
        const email = els.email.value.trim(); const pass = els.pass.value;
        if (!email || !pass) return showError("Заполните поля");

        if (isLogin) {
            const fd = new FormData(); fd.append('username', email); fd.append('password', pass);
            try {
                const res = await fetch('/token', { method: 'POST', body: fd });
                if (res.ok) {
                    const data = await res.json(); localStorage.setItem('access_token', data.access_token);
                    els.overlay.classList.add('hidden'); loadProfile();
                } else { showError("Неверный логин или пароль"); }
            } catch(e) { showError("Ошибка сервера"); }
        } else {
            if (pass !== els.confPass.value) return showError("Пароли не совпадают!");
            if (pass.length < 6) return showError("Пароль должен быть длиннее 5 символов!");
            els.error.classList.add('hidden'); els.step1.classList.add('hidden'); els.step2.classList.remove('hidden');
            els.title.textContent = "Настройка ИИ"; if (els.footer) els.footer.classList.add('hidden');
        }
    });

    els.finishBtn.addEventListener('click', async () => {
        const payload = {
            email: els.email.value.trim(),
            password: els.pass.value,
            preferences: { 
                role: getActivePref('pref-role'), 
                goal: getActivePref('pref-goal'), 
                style: getActivePref('pref-style') 
            }
        };

        try {
            const res = await fetch('/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            if (res.ok) {
                const fd = new FormData(); fd.append('username', payload.email); fd.append('password', payload.password);
                const loginRes = await fetch('/token', { method: 'POST', body: fd });
                if (loginRes.ok) {
                    const data = await loginRes.json(); localStorage.setItem('access_token', data.access_token);
                    els.step2.classList.add('hidden'); els.overlay.classList.add('hidden'); loadProfile();
                }
            } else { const err = await res.json(); showError(err.detail || "Ошибка регистрации"); }
        } catch(e) { showError("Ошибка сервера"); }
    });

    els.backToStep1.addEventListener('click', () => { els.step2.classList.add('hidden'); els.step1.classList.remove('hidden'); els.title.textContent = "Регистрация (Шаг 1)"; if (els.footer) els.footer.classList.remove('hidden'); });

   
    const forgotPassLink = document.getElementById('forgot-pass-link');
    if (forgotPassLink) { /* твой код сброса пароля */ }

    async function loadProfile() {
        const token = localStorage.getItem('access_token'); if(!token) return;
        try {
            const res = await fetch('/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json(); els.profileEmail.textContent = data.email; els.profileId.textContent = data.user_id;
                els.streakDays.textContent = data.streak_days; els.sidebarStatus.textContent = data.is_pro ? "PRO" : "Basic";
            } else { localStorage.removeItem('access_token'); els.overlay.classList.remove('hidden'); }
        } catch(e) {}
    }

    els.logout.addEventListener('click', () => { localStorage.removeItem('access_token'); location.reload(); });
    
    
    function toggleSidebar() { els.sidebar.classList.toggle('open'); els.sidebarOverlay.classList.toggle('hidden'); }
    els.burgerBtn.addEventListener('click', toggleSidebar); els.closeSidebar.addEventListener('click', toggleSidebar); els.sidebarOverlay.addEventListener('click', toggleSidebar);
    els.langToggleBtn.addEventListener('click', () => { els.langDropdown.classList.toggle('hidden'); });
    els.langOptions.forEach(opt => { opt.addEventListener('click', (e) => { setLanguage(e.target.dataset.lang); els.langDropdown.classList.add('hidden'); }); });
    els.newChatBtn.addEventListener('click', () => { els.chatBox.innerHTML = ''; els.welcomeScreen.classList.remove('minimized'); els.chatBox.classList.add('hidden'); sessionId = Date.now().toString(); if(window.innerWidth <= 768) toggleSidebar(); });
    els.modelsBtns.forEach(btn => btn.addEventListener('click', (e) => { els.modelsBtns.forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active'); currentModel = e.currentTarget.dataset.model; }));
    
    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = (event) => { currentImageBase64 = event.target.result; els.imagePreview.src = currentImageBase64; els.imageContainer.classList.remove('hidden'); };
        reader.readAsDataURL(file);
    });
    els.removeImageBtn.addEventListener('click', () => { currentImageBase64 = null; els.imagePreview.src = ""; els.fileInput.value = ""; els.imageContainer.classList.add('hidden'); });
    els.openProfileBtn.addEventListener('click', () => els.profileModal.classList.remove('hidden'));
    els.closeModal.addEventListener('click', () => els.profileModal.classList.add('hidden'));

    function formatAIResponse(text, container) {
        let mathBlocks = [];
        let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, p1) => { mathBlocks.push(`$$${p1}$$`); return `%%%MB_${mathBlocks.length - 1}%%%`; })
                                .replace(/\$([\s\S]+?)\$/g, (m, p1) => { mathBlocks.push(`$${p1}$`); return `%%%MB_${mathBlocks.length - 1}%%%`; });
        if (typeof marked !== 'undefined') container.innerHTML = marked.parse(processedText);
        else container.textContent = processedText;
        container.innerHTML = container.innerHTML.replace(/%%%MB_(\d+)%%%/g, (m, p1) => mathBlocks[p1]);
        if (typeof renderMathInElement !== 'undefined') renderMathInElement(container, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false });
        if (typeof hljs !== 'undefined') container.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    function addMessageActions(container, fullText) {
        const actionPanel = document.createElement('div'); actionPanel.className = 'msg-actions';
        const copyBtn = document.createElement('button'); copyBtn.className = 'action-btn'; copyBtn.innerHTML = '📋 Копировать';
        copyBtn.onclick = () => { navigator.clipboard.writeText(fullText); copyBtn.innerHTML = '✅ Успешно'; setTimeout(() => copyBtn.innerHTML = '📋 Копировать', 2000); };
        actionPanel.appendChild(copyBtn); container.appendChild(actionPanel); scrollToBottom();
    }

    async function sendMessage() {
        const text = els.input.value.trim(); if (!text && !currentImageBase64) return;
        els.welcomeScreen.classList.add('minimized'); els.chatBox.classList.remove('hidden');

        if (currentImageBase64) {
            const imgWrap = document.createElement('div'); imgWrap.className = 'msg user-msg';
            const img = document.createElement('img'); img.src = currentImageBase64; img.style.maxWidth = '200px'; img.style.borderRadius = '10px';
            imgWrap.appendChild(img);
            if(text) { const txt = document.createElement('div'); txt.textContent = text; txt.style.marginTop = '10px'; imgWrap.appendChild(txt); }
            els.chatBox.appendChild(imgWrap);
        } else {
            const userDiv = document.createElement('div'); userDiv.className = 'msg user-msg'; userDiv.textContent = text; els.chatBox.appendChild(userDiv);
        }

        const payloadImage = currentImageBase64; els.input.value = ''; currentImageBase64 = null; els.imagePreview.src = ""; els.imageContainer.classList.add('hidden');
        scrollToBottom();

        const aiDiv = document.createElement('div'); aiDiv.className = 'msg ai-msg'; aiDiv.innerHTML = '<span class="loading-dots">Генерация ответа...</span>'; els.chatBox.appendChild(aiDiv);
        scrollToBottom();

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: text, model_type: currentModel, session_id: sessionId, image: payloadImage })
            });

            if (!res.ok) { if(res.status === 401) { localStorage.removeItem('access_token'); location.reload(); return; } aiDiv.textContent = "Ошибка сервера."; return; }

            aiDiv.textContent = ""; 
            const reader = res.body.getReader(); const decoder = new TextDecoder('utf-8'); let fullAiText = "";

            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                const chunk = decoder.decode(value, { stream: true }); const lines = chunk.split('\n');
                
                for (let line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.replace('data: ', ''));
                            if (data.text) fullAiText += data.text; 
                            formatAIResponse(fullAiText, aiDiv);
                            scrollToBottom(); 
                        } catch(e) {}
                    }
                }
            }
            if(fullAiText) addMessageActions(aiDiv, fullAiText);
        } catch(e) { aiDiv.textContent = "Ошибка соединения."; }
    }

    els.sendBtn.addEventListener('click', sendMessage);
    els.input.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
});
