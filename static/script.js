document.addEventListener('DOMContentLoaded', () => {
    // --- 1. ЭЛЕМЕНТЫ ДОМ ---
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
        
        // Элементы загрузки фото
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
        sidebarStatus: document.getElementById('sidebar-status'), // Статус в сайдбаре
        
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

    let isLogin = true;
    let currentModel = 'chat';
    let sessionId = Date.now().toString();
    let currentImageBase64 = null; // Переменная для хранения фото

    // --- 2. ИНИЦИАЛИЗАЦИЯ ---
    function initApp() {
        const token = localStorage.getItem('access_token');
        if (token) {
            els.overlay.classList.add('hidden');
            loadProfile(); 
        } else {
            els.overlay.classList.remove('hidden'); 
        }
    }
    initApp();

    // --- 3. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ---
    els.switchText.addEventListener('click', (e) => {
        if (e.target.id === 'switch-action') {
            isLogin = !isLogin;
            els.error.classList.add('hidden');
            els.step1.classList.remove('hidden'); 
            els.step2.classList.add('hidden');
            
            if (isLogin) {
                els.title.textContent = "Вход";
                els.confPass.classList.add('hidden');
                els.authBtn.textContent = "Войти";
                els.switchText.innerHTML = 'Нет аккаунта? <span id="switch-action">Зарегистрироваться</span>';
            } else {
                els.title.textContent = "Регистрация (Шаг 1)";
                els.confPass.classList.remove('hidden');
                els.authBtn.textContent = "Далее";
                els.switchText.innerHTML = 'Есть аккаунт? <span id="switch-action">Войти</span>';
            }
        }
    });

    els.authBtn.addEventListener('click', async () => {
        const email = els.email.value.trim();
        const pass = els.pass.value;
        if (!email || !pass) return showError("Заполните поля");

        if (isLogin) {
            const fd = new FormData(); fd.append('username', email); fd.append('password', pass);
            try {
                const res = await fetch('/token', { method: 'POST', body: fd });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('access_token', data.access_token);
                    els.overlay.classList.add('hidden');
                    loadProfile();
                } else {
                    showError("Неверный логин или пароль");
                }
            } catch(e) { showError("Ошибка сервера"); }
        } else {
            if (pass !== els.confPass.value) return showError("Пароли не совпадают!");
            if (pass.length < 6) return showError("Пароль должен быть длиннее 5 символов!");
            
            els.error.classList.add('hidden');
            els.step1.classList.add('hidden');
            els.step2.classList.remove('hidden');
            els.title.textContent = "Настройки ИИ (Шаг 2)";
            els.footer.classList.add('hidden'); 
        }
    });

    els.backToStep1.addEventListener('click', () => {
        els.step2.classList.add('hidden');
        els.step1.classList.remove('hidden');
        els.title.textContent = "Регистрация (Шаг 1)";
        els.footer.classList.remove('hidden');
    });

    els.finishBtn.addEventListener('click', async () => {
        const lang = document.getElementById('pref-lang').value;
        const edu = document.getElementById('pref-edu').value;
        const style = document.getElementById('pref-style').value;
        
        if (!lang || !edu || !style) return showError("Заполните все настройки!");

        const payload = {
            email: els.email.value.trim(),
            password: els.pass.value,
            preferences: { ui_lang: lang, edu_level: edu, explain_style: style }
        };

        try {
            const res = await fetch('/register', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (res.ok) { 
                alert("Аккаунт создан! Теперь войдите."); location.reload(); 
            } else {
                const data = await res.json(); showError(data.detail || "Ошибка регистрации");
            }
        } catch(e) { showError("Ошибка соединения"); }
    });

    function showError(m) { els.error.textContent = m; els.error.classList.remove('hidden'); }

    // --- 4. ПРОФИЛЬ И СТАТУС ---
    async function loadProfile() {
        try {
            const res = await fetch('/users/me', { 
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
            });
            if (res.ok) {
                const data = await res.json();
                els.profileEmail.textContent = data.email;
                els.profileId.textContent = data.user_id;
                if(data.streak_days !== undefined) els.streakDays.textContent = data.streak_days;
                
                // Установка бейджа FREE / PRO в сайдбар
                if(data.is_pro) {
                    els.sidebarStatus.textContent = "PRO";
                    els.sidebarStatus.classList.add('pro');
                } else {
                    els.sidebarStatus.textContent = "FREE";
                    els.sidebarStatus.classList.remove('pro');
                }
            } else if (res.status === 401) {
                localStorage.removeItem('access_token');
                els.overlay.classList.remove('hidden');
            }
        } catch(e) { console.error("Ошибка загрузки профиля", e); }
    }

    els.openProfileBtn.addEventListener('click', () => {
        els.profileModal.classList.remove('hidden');
        if(window.innerWidth <= 768) toggleSidebar();
    });
    els.closeModal.addEventListener('click', () => els.profileModal.classList.add('hidden'));
    els.logout.addEventListener('click', () => { localStorage.removeItem('access_token'); location.reload(); });

    // --- 5. UI: САЙДБАР, ФОТО И МЕНЮ ---
    function toggleSidebar() {
        els.sidebar.classList.toggle('open');
        if (window.innerWidth <= 768) els.sidebarOverlay.classList.toggle('hidden');
    }
    els.burgerBtn.addEventListener('click', toggleSidebar);
    els.closeSidebar.addEventListener('click', toggleSidebar);
    els.sidebarOverlay.addEventListener('click', toggleSidebar);

    els.langToggleBtn.addEventListener('click', () => els.langDropdown.classList.toggle('hidden'));
    els.langOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            els.langToggleBtn.innerHTML = `<span>🌐</span> Язык (${e.target.dataset.lang.toUpperCase()})`;
            els.langDropdown.classList.add('hidden');
        });
    });

    els.newChatBtn.addEventListener('click', () => {
        els.chatBox.innerHTML = ''; 
        els.welcomeScreen.classList.remove('minimized');
        els.chatBox.classList.add('hidden');
        sessionId = Date.now().toString(); 
        if(window.innerWidth <= 768) toggleSidebar(); 
    });

    els.modelsBtns.forEach(btn => btn.addEventListener('click', (e) => {
        els.modelsBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentModel = e.currentTarget.dataset.model;
    }));

    // Логика добавления картинки (конвертация в Base64)
    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageBase64 = event.target.result;
            els.imagePreview.src = currentImageBase64;
            els.imageContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });

    els.removeImageBtn.addEventListener('click', () => {
        currentImageBase64 = null;
        els.imagePreview.src = "";
        els.fileInput.value = "";
        els.imageContainer.classList.add('hidden');
    });

    // --- 6. ЧАТ И СТРИМИНГ ---
    function appendMsg(role, content) {
        const div = document.createElement('div');
        div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
        div.textContent = content;
        els.chatBox.appendChild(div);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
        return div;
    }

    function formatAIResponse(text, element) {
        let mathBlocks = [];
        let processedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g, (match) => {
            mathBlocks.push(match); return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`;
        });

        if (typeof marked !== 'undefined') {
            element.innerHTML = marked.parse(processedText);
        } else {
            element.textContent = processedText;
        }

        element.innerHTML = element.innerHTML.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (match, p1) => mathBlocks[p1]);

        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(element, {
                delimiters: [ {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false} ],
                throwOnError: false
            });
        }
        if (typeof hljs !== 'undefined') {
            element.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
    }

    async function sendMessage() {
        const text = els.input.value.trim();
        // Разрешаем отправку, если есть текст ИЛИ картинка
        if (!text && !currentImageBase64) return;
        
        els.welcomeScreen.classList.add('minimized');
        els.chatBox.classList.remove('hidden');

        // Показываем сообщение пользователя в чате (если есть картинка - пишем об этом)
        let displayMsg = text;
        if (currentImageBase64) {
            displayMsg = text ? `📎 [Фото] ${text}` : `📎 [Фото отправлено]`;
        }
        appendMsg('user', displayMsg);
        
        els.input.value = '';

        // Формируем полезную нагрузку для сервера
        const payload = { 
            message: text, 
            model_type: currentModel, 
            session_id: sessionId 
        };
        if (currentImageBase64) {
            payload.image = currentImageBase64; // Отправляем картинку
        }

        // Очищаем форму фото после отправки
        els.removeImageBtn.click();

        const aiDiv = appendMsg('assistant', 'Думаю...');
        let fullAiText = "";

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('access_token')
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                if(res.status === 401) { localStorage.removeItem('access_token'); location.reload(); return; }
                aiDiv.textContent = "Ошибка сервера."; return;
            }

            aiDiv.textContent = ""; 
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (let line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.replace('data: ', ''));
                            if (data.text) fullAiText += data.text; 
                            formatAIResponse(fullAiText, aiDiv);
                            els.chatBox.scrollTop = els.chatBox.scrollHeight;
                        } catch(e) {}
                    }
                }
            }
        } catch(e) { aiDiv.textContent = "Ошибка соединения."; }
    }

    els.sendBtn.addEventListener('click', sendMessage);
    els.input.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
});
