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
        ru: {
            "login_title": "Вход",
            "email_ph": "Email",
            "pass_ph": "Пароль",
            "conf_pass_ph": "Подтвердите пароль",
            "forgot_pass": "Забыли пароль?",
            "login_btn": "Войти",
            "reg_btn": "Далее",
            "no_account": "Нет аккаунта?",
            "has_account": "Есть аккаунт?",
            "action_reg": "Зарегистрироваться",
            "action_login": "Войти",
            "new_chat": "Новый чат",
            "streak": "дней подряд",
            "account_label": "Аккаунт:",
            "profile_btn": "Личный кабинет",
            "lang_btn": "Язык",
            "welcome_desc": "Интеллектуальный инструмент для учебы с интегрированным ИИ. Все для студентов. С любовью @sautbekov077❤️",
            "input_ph": "Введите сообщение...",
            "model_chat": "Чат",
            "model_plan": "План",
            "model_code": "Код",
            "model_notes": "Конспект",
            "model_search": "Поиск",
            "model_eye": "Око",
            "logout_btn": "Выйти из аккаунта"
        },
        kk: {
            "login_title": "Кіру",
            "email_ph": "Эл. пошта",
            "pass_ph": "Құпия сөз",
            "conf_pass_ph": "Құпия сөзді растаңыз",
            "forgot_pass": "Құпия сөзді ұмыттыңыз ба?",
            "login_btn": "Кіру",
            "reg_btn": "Келесі",
            "no_account": "Аккаунт жоқ па?",
            "has_account": "Аккаунтыңыз бар ма?",
            "action_reg": "Тіркелу",
            "action_login": "Кіру",
            "new_chat": "Жаңа чат",
            "streak": "күн қатарынан",
            "account_label": "Аккаунт:",
            "profile_btn": "Жеке кабинет",
            "lang_btn": "Тіл",
            "welcome_desc": "Жасанды интеллектпен біріктірілген оқуға арналған зияткерлік құрал. Студенттерге арналған. @sautbekov077❤️ махаббатымен",
            "input_ph": "Хабарлама енгізіңіз...",
            "model_chat": "Чат",
            "model_plan": "Жоспар",
            "model_code": "Код",
            "model_notes": "Конспект",
            "model_search": "Іздеу",
            "model_eye": "Көз",
            "logout_btn": "Аккаунттан шығу"
        }
    };

    let currentLang = localStorage.getItem('app_lang') || 'ru';

    
    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('app_lang', lang);
        
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.innerHTML = translations[lang][key];
            }
        });

        
        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            const key = el.getAttribute('data-i18n-ph');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        
        const langName = lang === 'ru' ? 'Язык (RU)' : 'Тіл (KK)';
        document.getElementById('lang-toggle-btn').innerHTML = `<span>🌐</span> ${langName}`;
    }

    let isLogin = true;
    let currentModel = 'chat';
    let sessionId = Date.now().toString();
    let currentImageBase64 = null;

    
    function initApp() {
        setLanguage(currentLang); 
        const token = localStorage.getItem('access_token');
        if (token) {
            els.overlay.classList.add('hidden');
            loadProfile(); 
        } else {
            els.overlay.classList.remove('hidden'); 
        }
    }
    initApp();

    
    els.switchText.addEventListener('click', (e) => {
        if (isLogin) {
                els.title.textContent = translations[currentLang]["login_title"]; 
                els.confPass.classList.add('hidden');
                els.authBtn.textContent = translations[currentLang]["login_btn"];
                document.getElementById('switch-text-prefix').textContent = translations[currentLang]["no_account"];
                document.getElementById('switch-action').textContent = translations[currentLang]["action_reg"];
            } else {
                els.title.textContent = "Регистрация (Шаг 1)"; 
                els.confPass.classList.remove('hidden');
                els.authBtn.textContent = translations[currentLang]["reg_btn"];
                document.getElementById('switch-text-prefix').textContent = translations[currentLang]["has_account"];
                document.getElementById('switch-action').textContent = translations[currentLang]["action_login"];
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
            const selectedLang = e.target.dataset.lang;
            setLanguage(selectedLang);
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

    
    function appendMsg(role, content) {
        const div = document.createElement('div');
        div.className = `message ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
        div.innerHTML = content; 
        
        
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper';
        wrapper.appendChild(div);
        
        els.chatBox.appendChild(wrapper);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
        return div;
    }

    
    function addMessageActions(messageContainer, fullText) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.title = 'Копировать ответ';
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(fullText);
            copyBtn.style.color = '#1ABC9C';
            setTimeout(() => copyBtn.style.color = '#888', 2000);
        };

        const simplifyBtn = document.createElement('button');
        simplifyBtn.className = 'action-btn';
        simplifyBtn.title = 'Объясни проще';
        simplifyBtn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
        simplifyBtn.onclick = () => {
            els.input.value = "Пожалуйста, объясни свой предыдущий ответ проще и короче.";
            els.sendBtn.click();
        };

        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'action-btn';
        pdfBtn.title = 'Скачать чат в PDF';
        pdfBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
        pdfBtn.onclick = () => {
            const chatBox = document.getElementById('chat-box');
            const opt = {
                margin: 10,
                filename: 'Studify_Dialog.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(chatBox).save();
        };

        actionsDiv.appendChild(copyBtn);
        actionsDiv.appendChild(simplifyBtn);
        actionsDiv.appendChild(pdfBtn);
        
        
        messageContainer.after(actionsDiv);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
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
        if (!text && !currentImageBase64) return;
        
        els.welcomeScreen.classList.add('minimized');
        els.chatBox.classList.remove('hidden');

        let displayMsg = text;
        if (currentImageBase64) {
            displayMsg = text ? `📎 [Фото] ${text}` : `📎 [Фото отправлено]`;
        }
        appendMsg('user', displayMsg);
        
        els.input.value = '';

        const payload = { 
            message: text, 
            model_type: currentModel, 
            session_id: sessionId 
        };
        if (currentImageBase64) {
            payload.image = currentImageBase64;
        }

        els.removeImageBtn.click();

        
        const aiDiv = appendMsg('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>');
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
            
            
            if(fullAiText) {
                addMessageActions(aiDiv, fullAiText);
            }

        } catch(e) { aiDiv.textContent = "Ошибка соединения."; }
    }

    els.sendBtn.addEventListener('click', sendMessage);
    els.input.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
});
