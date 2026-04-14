document.addEventListener('DOMContentLoaded', () => {
    const els = {
        // Авторизация
        overlay: document.getElementById('auth-overlay'),
        email: document.getElementById('auth-email'),
        pass: document.getElementById('auth-password'),
        confPass: document.getElementById('auth-confirm-password'),
        accessCode: document.getElementById('auth-access-code'),
        regFields: document.getElementById('reg-fields'),
        authBtn: document.getElementById('auth-btn'),
        switchText: document.getElementById('switch-auth-mode'),
        switchPrefix: document.getElementById('switch-text-prefix'),
        error: document.getElementById('auth-error'),
        title: document.getElementById('auth-title'),
        toast: document.getElementById('toast-notification'),
        
        // Дашборд
        dashboard: document.getElementById('user-dashboard'),
        planBadge: document.getElementById('plan-badge'),
        levelDisplay: document.getElementById('level-display'),
        xpDisplay: document.getElementById('xp-display'),
        xpNext: document.getElementById('xp-next'),
        xpProgress: document.getElementById('xp-progress'),
        
        // Чат
        chatBox: document.getElementById('chat-box'),
        input: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        welcomeScreen: document.getElementById('welcome-screen'),
        actionButtons: document.getElementById('action-buttons'),
        chatHistoryList: document.getElementById('chat-history-list'),
        sidebar: document.getElementById('sidebar'),
        sidebarBackdrop: document.getElementById('sidebar-backdrop'),
        mobileMenuBtn: document.getElementById('mobile-menu-btn'),
        sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
        newChatBtn: document.getElementById('new-chat-btn'),
        profileBtn: document.getElementById('profile-btn'),
        modeOkoBtn: document.getElementById('mode-oko-btn'),
        
        // Медиа
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn'),
        imageContainer: document.getElementById('image-preview-container'),
        imagePreview: document.getElementById('image-preview'),
        removeImageBtn: document.getElementById('remove-image'),

        // Кнопки фичей
        openQuizBtn: document.getElementById('open-quiz-btn'),
        openFlashcardsBtn: document.getElementById('open-flashcards-btn'),
        
        // Модалки
        quizModal: document.getElementById('quiz-modal'),
        closeQuiz: document.getElementById('close-quiz'),
        quizContainer: document.getElementById('quiz-container'),
        quizFooter: document.getElementById('quiz-footer'),
        nextQuestionBtn: document.getElementById('next-question-btn'),
        moreQuestionsBtn: document.getElementById('more-questions-btn'),

        flashcardModal: document.getElementById('flashcard-modal'),
        closeFlashcards: document.getElementById('close-flashcards'),
        flashcardElement: document.getElementById('flashcard-element'),
        fcQuestion: document.getElementById('fc-question'),
        fcAnswer: document.getElementById('fc-answer'),
        fcKnowBtn: document.getElementById('fc-know-btn'),
        fcDontKnowBtn: document.getElementById('fc-dont-know-btn'),
        fcCounter: document.getElementById('fc-counter'),
        appendFlashcardsBtn: document.getElementById('append-flashcards-btn'),

        // Профиль
        profileModal: document.getElementById('profile-modal'),
        closeProfile: document.getElementById('close-profile'),
        profileEmail: document.getElementById('profile-email'),
        logoutBtn: document.getElementById('logout-btn'),
        promoCodeInput: document.getElementById('promo-code-input'),
        applyPromoBtn: document.getElementById('apply-promo-btn'),
        promoCodeStatus: document.getElementById('promo-code-status'),
        planSwitch: document.querySelector('.plan-switch'),

        // Язык
        langButtons: document.querySelectorAll('.lang-btn'),

        // Настройки ИИ
        aiSettingsItem: document.getElementById('ai-settings-item'),
        aiSettingsModal: document.getElementById('ai-settings-modal'),
        closeAiSettings: document.getElementById('close-ai-settings'),
        speechStyleSelect: document.getElementById('speech-style-select'),
        responseSizeSelect: document.getElementById('response-size-select'),
        creativityRange: document.getElementById('creativity-range'),
        creativityValue: document.getElementById('creativity-value'),
        saveAiSettingsBtn: document.getElementById('save-ai-settings')
    };

    // Глобальные переменные
    let currentLang = localStorage.getItem('app_lang') || 'ru';
    let isLogin = true;
    let currentImageBase64 = null;
    let currentChatId = null;

    // Данные для фичей
    let currentQuiz = [];
    let currentQuizIndex = 0;
    let currentFlashcards = [];
    let currentFcIndex = 0;

    let aiSettings = {
        speechStyle: localStorage.getItem('ai_speech_style') || 'friendly',
        responseSize: localStorage.getItem('ai_response_size') || 'medium',
        creativity: Number(localStorage.getItem('ai_creativity') || 35)
    };

    const translations = window.appTranslations || {};

    function tr(key, fallback, vars = {}) {
        const dict = translations[currentLang] || {};
        let value = dict[key] || fallback;
        Object.entries(vars).forEach(([k, v]) => {
            value = value.replace(`{${k}}`, String(v));
        });
        return value;
    }

    function closeSidebar() {
        els.sidebar?.classList.remove('open');
        els.sidebarBackdrop?.classList.add('hidden');
    }

    function openSidebar() {
        els.sidebar?.classList.add('open');
        els.sidebarBackdrop?.classList.remove('hidden');
    }

    // --- 2. Утилиты ---
    function setLanguage(lang) {
        currentLang = lang; localStorage.setItem('app_lang', lang);
        if(!translations[lang]) return;
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => { 
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) el.innerHTML = translations[lang][key]; 
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => { 
            const key = el.getAttribute('data-i18n-ph');
            if (translations[lang][key]) el.placeholder = translations[lang][key]; 
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            if (translations[lang][key]) el.setAttribute('aria-label', translations[lang][key]);
        });

        if (els.langButtons) {
            els.langButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.lang === lang);
            });
        }

        const t = translations[lang] || {};
        if (els.moreQuestionsBtn && t.more_questions_btn) els.moreQuestionsBtn.textContent = t.more_questions_btn;
        if (els.appendFlashcardsBtn && t.more_questions_btn) els.appendFlashcardsBtn.textContent = t.more_questions_btn;
        if (currentFlashcards.length === 0) {
            if (els.fcQuestion && currentChatId) els.fcQuestion.textContent = tr('no_cards_for_chat', 'Нет карточек для этого чата.');
            if (els.fcQuestion && !currentChatId) els.fcQuestion.textContent = tr('choose_chat', 'Выберите чат');
        }
    }

    function loadAiSettingsToUI() {
        if (els.speechStyleSelect) els.speechStyleSelect.value = aiSettings.speechStyle;
        if (els.responseSizeSelect) els.responseSizeSelect.value = aiSettings.responseSize;
        if (els.creativityRange) els.creativityRange.value = String(aiSettings.creativity);
        if (els.creativityValue) els.creativityValue.textContent = `${aiSettings.creativity}%`;
    }

    function showError(msg) { 
        els.error.textContent = msg; 
        els.error.classList.remove('hidden'); 
    }
    
    function scrollToBottom() { 
        setTimeout(() => { els.chatBox.scrollTop = els.chatBox.scrollHeight; }, 10); 
    }

    function setActiveChatItem(chatId) {
        document.querySelectorAll('.chat-history-item').forEach(item => {
            item.classList.toggle('active', Number(item.dataset.chatId) === Number(chatId));
        });
    }

    function renderHistory(chats) {
        if (!els.chatHistoryList) return;
        els.chatHistoryList.innerHTML = '';

        chats.forEach(chat => {
            const item = document.createElement('button');
            item.className = 'chat-history-item';
            item.type = 'button';
            item.dataset.chatId = String(chat.id);
            item.innerHTML = `
                <div class="chat-title">${escapeHtml(chat.title || tr('new_chat_default', 'Новый чат'))}</div>
                <div class="chat-preview">${escapeHtml(chat.last_message || tr('no_messages_yet', 'Пока без сообщений'))}</div>
            `;
            item.addEventListener('click', () => openChat(chat.id));
            els.chatHistoryList.appendChild(item);
        });

        if (currentChatId) setActiveChatItem(currentChatId);
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role === 'ai' ? 'msg-ai' : 'msg-user'}`;
        if (role === 'ai') {
            formatAIResponse(text, msgDiv);
        } else {
            msgDiv.textContent = text;
        }
        els.chatBox.appendChild(msgDiv);
        return msgDiv;
    }

    async function loadChatHistory() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const res = await fetch('/chats', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) return;
            const chats = await res.json();
            renderHistory(chats);
            if (!currentChatId && chats.length > 0) {
                openChat(chats[0].id);
            }
        } catch(e) {}
    }

    async function openChat(chatId) {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        try {
            const res = await fetch(`/chats/${chatId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) return;
            const messages = await res.json();

            currentChatId = chatId;
            setActiveChatItem(chatId);
            els.chatBox.innerHTML = '';

            if (!messages.length) {
                els.welcomeScreen.classList.remove('hidden');
            } else {
                els.welcomeScreen.classList.add('hidden');
                messages.forEach(m => appendMessage(m.role, m.content));
                scrollToBottom();
            }
            closeSidebar();
        } catch(e) {}
    }

    async function createNewChat() {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const res = await fetch('/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title: tr('new_chat_default', 'Новый чат') })
            });
            if (!res.ok) return;
            const chat = await res.json();
            currentChatId = chat.id;
            els.chatBox.innerHTML = '';
            els.welcomeScreen.classList.remove('hidden');
            await loadChatHistory();
            setActiveChatItem(currentChatId);
            closeSidebar();
        } catch(e) {}
    }

    // --- 3. Авторизация ---
    // --- 3. Авторизация ---
    function initApp() {
        setLanguage(currentLang); 
        const token = localStorage.getItem('access_token');
        if (token) { 
            els.overlay.classList.add('hidden'); 
            loadProfile(); 
            loadChatHistory();
        } else { 
            els.overlay.classList.remove('hidden'); 
        }
    }
    initApp();
    loadAiSettingsToUI();

    if (els.mobileMenuBtn) {
        els.mobileMenuBtn.addEventListener('click', openSidebar);
    }
    if (els.sidebarCloseBtn) {
        els.sidebarCloseBtn.addEventListener('click', closeSidebar);
    }
    if (els.sidebarBackdrop) {
        els.sidebarBackdrop.addEventListener('click', closeSidebar);
    }
    if (els.chatBox) {
        els.chatBox.addEventListener('click', closeSidebar);
    }
    if (els.newChatBtn) {
        els.newChatBtn.addEventListener('click', createNewChat);
    }
    if (els.langButtons) {
        els.langButtons.forEach(btn => {
            btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
        });
    }

    // Функция показа уведомлений
    function showToast(msg) {
        els.toast.textContent = msg;
        els.toast.classList.remove('hidden');
        setTimeout(() => els.toast.classList.add('hidden'), 3500); // Скроется через 3.5 сек
    }

    function setPromoStatus(msg, isError = false) {
        if (!els.promoCodeStatus) return;
        els.promoCodeStatus.textContent = msg;
        els.promoCodeStatus.classList.remove('hidden');
        els.promoCodeStatus.style.color = isError ? '#b44545' : '#2e6f61';
    }

    // Логика глазика (скрыть/показать пароль)
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input.type === "password") {
                input.type = "text";
                this.textContent = "🙈"; 
            } else {
                input.type = "password";
                this.textContent = "👁️";
            }
        });
    });

    // Переключение между Входом и Регистрацией
    els.switchText.addEventListener('click', () => {
        isLogin = !isLogin; 
        els.error.classList.add('hidden');
        const t = translations[currentLang] || {};
        
        if (isLogin) {
            els.title.textContent = t["login_title"] || "Вход"; 
            els.regFields.classList.add('hidden'); 
            els.authBtn.textContent = t["login_btn"] || "Войти";
            els.switchPrefix.textContent = t["no_account"] || "Нет аккаунта?";
            els.switchText.textContent = t["action_reg"] || "Регистрация";
        } else {
            els.title.textContent = t["register_title"] || "Регистрация"; 
            els.regFields.classList.remove('hidden'); 
            els.authBtn.textContent = t["register_btn"] || "Зарегистрироваться"; 
            els.switchPrefix.textContent = t["has_account"] || "Есть аккаунт?";
            els.switchText.textContent = t["action_login"] || "Войти";
        }
    });

    // Главная кнопка формы
    els.authBtn.addEventListener('click', async () => {
        const email = els.email.value.trim(); 
        const pass = els.pass.value;
        if (!email || !pass) return showError(tr('fill_required', 'Заполните обязательные поля'));

        if (isLogin) {
            // ЛОГИКА ВХОДА
            try {
                const res = await fetch('/auth/login', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({email: email, password: pass}) 
                });
                if (res.ok) {
                    const data = await res.json(); 
                    localStorage.setItem('access_token', data.access_token);
                    els.overlay.classList.add('hidden'); 
                    loadProfile();
                    loadChatHistory();
                } else { showError(tr('invalid_login', 'Неверный логин или пароль')); }
            } catch(e) { showError(tr('server_error', 'Ошибка сервера')); }
        } else {
            // ЛОГИКА РЕГИСТРАЦИИ
            const confPass = els.confPass.value;
            if (pass !== confPass) return showError(tr('passwords_mismatch', 'Пароли не совпадают!'));
            
            const payload = {
                email: email,
                password: pass,
                access_code: els.accessCode.value.trim() || null
            };
            try {
                const res = await fetch('/auth/register', { 
                    method: 'POST', headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(payload) 
                });
                if (res.ok) {
                    // УСПЕХ! Показываем уведомление
                    showToast(tr('toast_registration_success', 'Успешная регистрация! Теперь выполните вход.'));
                    
                    // Переключаем UI обратно на окно входа
                    isLogin = true;
                    const t = translations[currentLang] || {};
                    els.title.textContent = t["login_title"] || "Вход"; 
                    els.regFields.classList.add('hidden'); 
                    els.authBtn.textContent = t["login_btn"] || "Войти";
                    els.switchPrefix.textContent = t["no_account"] || "Нет аккаунта?";
                    els.switchText.textContent = t["action_reg"] || "Регистрация";
                    
                    // Очищаем пароли (а email оставляем, чтобы юзеру не вводить заново!)
                    els.pass.value = '';
                    els.confPass.value = '';
                    els.accessCode.value = '';
                    els.error.classList.add('hidden');
                    
                    // Сбрасываем иконки глазика в дефолт
                    document.querySelectorAll('.toggle-password').forEach(i => i.textContent = "👁️");
                    els.pass.type = "password";
                    els.confPass.type = "password";

                } else { 
                    const err = await res.json(); 
                    showError(err.detail || tr('registration_error', 'Ошибка регистрации')); 
                }
            } catch(e) { showError(tr('server_error', 'Ошибка сервера')); }
        }
    });

    // --- 4. Дашборд и Геймификация ---
    async function loadProfile() {
        const token = localStorage.getItem('access_token'); if(!token) return;
        try {
            const res = await fetch('/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                updateDashboardUI(data.plan, data.xp, data.level);
                els.actionButtons.classList.remove('hidden'); // Показываем кнопки
                els.profileBtn?.classList.remove('hidden');
                els.newChatBtn?.classList.remove('hidden');
                if (els.profileEmail) {
                    els.profileEmail.textContent = data.email || '';
                }
                if (els.planSwitch) {
                    const nodes = els.planSwitch.querySelectorAll('div');
                    if (nodes.length >= 3) {
                        nodes[0].classList.toggle('plan-active', data.plan !== 'pro');
                        nodes[2].classList.toggle('plan-active', data.plan === 'pro');
                    }
                }
            } else { 
                localStorage.removeItem('access_token'); 
                els.overlay.classList.remove('hidden'); 
            }
        } catch(e) {}
    }

    function updateDashboardUI(plan, xp, level) {
        els.dashboard.classList.remove('hidden');
        els.planBadge.textContent = plan === 'pro' ? 'PRO' : tr('plan_free_badge', 'Бесплатно');
        els.levelDisplay.textContent = level;
        els.xpDisplay.textContent = xp;
        
        const xpForNextLevel = level * 100;
        els.xpNext.textContent = xpForNextLevel;
        
        const currentLevelXp = xp % 100;
        const progressPercentage = (currentLevelXp / 100) * 100;
        els.xpProgress.style.width = `${progressPercentage}%`;
    }

    // --- 5. Логика Чата ---
    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = (event) => { 
            currentImageBase64 = event.target.result; 
            els.imagePreview.src = currentImageBase64; 
            els.imageContainer.classList.remove('hidden'); 
        };
        reader.readAsDataURL(file);
    });
    els.removeImageBtn.addEventListener('click', () => { 
        currentImageBase64 = null; els.imagePreview.src = ""; 
        els.fileInput.value = ""; els.imageContainer.classList.add('hidden'); 
    });

    function formatAIResponse(text, container) {
        if (typeof marked !== 'undefined') {
            container.innerHTML = marked.parse(text);
        } else {
            container.textContent = text;
        }
    }

    async function sendMessage() {
        const text = els.input.value.trim(); if (!text && !currentImageBase64) return;
        els.welcomeScreen.classList.add('hidden');
        if (currentChatId) setActiveChatItem(currentChatId);

        if (currentImageBase64) {
            const imgWrap = document.createElement('div'); imgWrap.className = 'message msg-user';
            const img = document.createElement('img'); img.src = currentImageBase64; img.className = 'msg-image';
            imgWrap.appendChild(img);
            if(text) { const txt = document.createElement('div'); txt.textContent = text; txt.style.marginTop = '10px'; imgWrap.appendChild(txt); }
            els.chatBox.appendChild(imgWrap);
        } else {
            appendMessage('user', text);
        }

        const payloadImage = currentImageBase64; 
        els.input.value = ''; currentImageBase64 = null; els.imagePreview.src = ""; els.imageContainer.classList.add('hidden');
        scrollToBottom();

        const aiDiv = document.createElement('div'); aiDiv.className = 'message msg-ai';
        aiDiv.innerHTML = `<span class="loading-dots"><span class="typing-label">${tr('typing_label', 'Печатает')}</span><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
        els.chatBox.appendChild(aiDiv);
        scrollToBottom();

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    message: text,
                    image: payloadImage,
                    session_id: String(currentChatId || 'default'),
                    speech_style: aiSettings.speechStyle,
                    response_size: aiSettings.responseSize,
                    creativity: aiSettings.creativity
                })
            });

            if (!res.ok) { 
                if(res.status === 401) { localStorage.removeItem('access_token'); location.reload(); return; } 
                if(res.status === 403) { aiDiv.textContent = tr('today_limit', 'Лимит на сегодня исчерпан!'); return; }
                aiDiv.textContent = tr('server_error_dot', 'Ошибка сервера.'); return; 
            }

            aiDiv.textContent = "";
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullAiText = "";
            let pendingChunk = "";
            let renderPending = false;

            const scheduleRender = () => {
                if (renderPending) return;
                renderPending = true;
                requestAnimationFrame(() => {
                    formatAIResponse(fullAiText, aiDiv);
                    scrollToBottom();
                    renderPending = false;
                });
            };

            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                pendingChunk += decoder.decode(value, { stream: true });
                const events = pendingChunk.split('\n\n');
                pendingChunk = events.pop() || "";

                for (let evt of events) {
                    const line = evt.split('\n').find(l => l.startsWith('data:'));
                    if (!line || line.includes('[DONE]')) continue;
                    try {
                        const payload = JSON.parse(line.slice(5).trim());
                        if (payload.chat_id) {
                            currentChatId = payload.chat_id;
                            setActiveChatItem(currentChatId);
                        }
                        if (payload.text) {
                            fullAiText += payload.text;
                            scheduleRender();
                        }
                    } catch(e) {
                        // ignore malformed chunks and continue stream
                    }
                }
            }
            formatAIResponse(fullAiText, aiDiv);
            loadProfile(); // Обновляем XP после сообщения
            loadChatHistory();
        } catch(e) { aiDiv.textContent = tr('connection_error', 'Ошибка соединения.'); }
    }

    els.sendBtn.addEventListener('click', sendMessage);
    els.input.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });

    if (els.modeOkoBtn) {
        els.modeOkoBtn.addEventListener('click', () => {
            els.modeOkoBtn.classList.toggle('feature-btn');
        });
    }

    if (els.profileBtn) {
        els.profileBtn.addEventListener('click', () => {
            els.profileModal.classList.remove('hidden');
            if (els.promoCodeInput) els.promoCodeInput.value = '';
            if (els.promoCodeStatus) els.promoCodeStatus.classList.add('hidden');
            closeSidebar();
        });
    }

    if (els.closeProfile) {
        els.closeProfile.addEventListener('click', () => {
            els.profileModal.classList.add('hidden');
        });
    }

    if (els.aiSettingsItem) {
        els.aiSettingsItem.addEventListener('click', () => {
            els.aiSettingsModal.classList.remove('hidden');
        });
    }

    if (els.closeAiSettings) {
        els.closeAiSettings.addEventListener('click', () => {
            els.aiSettingsModal.classList.add('hidden');
        });
    }

    if (els.creativityRange) {
        els.creativityRange.addEventListener('input', () => {
            if (els.creativityValue) {
                els.creativityValue.textContent = `${els.creativityRange.value}%`;
            }
        });
    }

    if (els.saveAiSettingsBtn) {
        els.saveAiSettingsBtn.addEventListener('click', () => {
            aiSettings = {
                speechStyle: els.speechStyleSelect?.value || 'friendly',
                responseSize: els.responseSizeSelect?.value || 'medium',
                creativity: Number(els.creativityRange?.value || 35)
            };

            localStorage.setItem('ai_speech_style', aiSettings.speechStyle);
            localStorage.setItem('ai_response_size', aiSettings.responseSize);
            localStorage.setItem('ai_creativity', String(aiSettings.creativity));

            showToast(tr('ai_settings_saved', 'Настройки ИИ сохранены'));
            els.aiSettingsModal.classList.add('hidden');
        });
    }

    if (els.logoutBtn) {
        els.logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            location.reload();
        });
    }

    if (els.applyPromoBtn) {
        els.applyPromoBtn.addEventListener('click', async () => {
            const token = localStorage.getItem('access_token');
            const code = (els.promoCodeInput?.value || '').trim();
            if (!code) {
                setPromoStatus(tr('promo_enter', 'Введите промокод'), true);
                return;
            }

            try {
                const res = await fetch('/auth/apply-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ code })
                });

                const payload = await res.json();
                if (!res.ok) {
                    setPromoStatus(payload.detail || tr('promo_activate_failed', 'Не удалось активировать код'), true);
                    return;
                }

                setPromoStatus(payload.message || tr('promo_activated', 'PRO активирован'));
                showToast(payload.message || tr('promo_activated', 'PRO активирован'));
                loadProfile();
            } catch(e) {
                setPromoStatus(tr('network_error', 'Ошибка сети'), true);
            }
        });
    }


    // --- 6. Логика Квизов ---
    els.openQuizBtn.addEventListener('click', () => {
        els.quizModal.classList.remove('hidden');
        fetchLatestQuizForChat();
    });
    els.closeQuiz.addEventListener('click', () => els.quizModal.classList.add('hidden'));

    async function fetchLatestQuizForChat() {
        if (!currentChatId) {
            const t = translations[currentLang] || {};
            els.quizContainer.innerHTML = `<p class="text-muted">${t.choose_chat || 'Выберите чат'}</p>`;
            return;
        }

        const token = localStorage.getItem('access_token');
        const res = await fetch(`/quiz/chat/${currentChatId}`, { headers: { 'Authorization': `Bearer ${token}` }});

        if (res.ok) {
            const data = await res.json();
            if (data.quiz_id && Array.isArray(data.questions) && data.questions.length > 0) {
                currentQuiz = data.questions;
                currentQuizIndex = 0;
                renderQuizQuestion();
                els.quizFooter.classList.remove('hidden');
            } else {
                generateQuiz(false);
            }
        } else {
            generateQuiz(false);
        }
    }

    async function generateQuiz(append = false) {
        els.quizContainer.innerHTML = `<p class="text-muted">${tr('quiz_generating', 'Генерация квиза нейросетью...')}</p>`;
        els.quizFooter.classList.add('hidden');
        els.moreQuestionsBtn.classList.add('hidden');
        els.nextQuestionBtn.classList.remove('hidden');
        
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/quiz/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ chat_id: currentChatId, append })
            });
            
            if (res.ok) {
                const data = await res.json();
                fetchQuizData(data.quiz_id);
                loadProfile(); // Обновляем XP
            } else {
                const err = await res.json();
                els.quizContainer.innerHTML = `<p style="color:red">${err.detail || tr('generic_error', 'Ошибка')}</p>`;
            }
        } catch(e) { els.quizContainer.innerHTML = tr('connection_error', 'Ошибка соединения.'); }
    }

    async function fetchQuizData(quizId) {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`/quiz/${quizId}`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) {
            const data = await res.json();
            currentQuiz = data.questions;
            currentQuizIndex = 0;
            renderQuizQuestion();
            els.quizFooter.classList.remove('hidden');
        }
    }

    function renderQuizQuestion() {
        if(currentQuizIndex >= currentQuiz.length) {
            els.quizContainer.innerHTML = `<h3>${tr('quiz_done_title', 'Квиз завершен! 🎉')}</h3><p>${tr('quiz_done_desc', 'Вы ответили на все вопросы.')}</p>`;
            els.nextQuestionBtn.classList.add('hidden');
            els.moreQuestionsBtn.classList.remove('hidden');
            return;
        }

        const q = currentQuiz[currentQuizIndex];
        let optionsHtml = q.options.map(opt => `<button class="quiz-option" data-answer="${opt}">${opt}</button>`).join('');
        
        els.quizContainer.innerHTML = `
            <div style="margin-bottom: 10px; font-weight:bold; color:#7f8c8d;">${tr('quiz_question_of', 'Вопрос {current} из {total}', { current: currentQuizIndex + 1, total: currentQuiz.length })}</div>
            <h3 style="margin-bottom: 20px;">${q.question}</h3>
            ${optionsHtml}
        `;

        els.nextQuestionBtn.classList.add('hidden');

        document.querySelectorAll('.quiz-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(els.quizContainer.querySelector('.correct')) return; // Уже ответили
                
                const selected = e.target.getAttribute('data-answer');
                if(selected === q.correct_answer) {
                    e.target.classList.add('correct');
                } else {
                    e.target.classList.add('wrong');
                    // Подсвечиваем правильный
                    Array.from(document.querySelectorAll('.quiz-option')).find(el => el.getAttribute('data-answer') === q.correct_answer).classList.add('correct');
                }
                els.nextQuestionBtn.classList.remove('hidden');
            });
        });
    }

    els.nextQuestionBtn.addEventListener('click', () => {
        currentQuizIndex++;
        renderQuizQuestion();
    });
    els.moreQuestionsBtn.addEventListener('click', () => generateQuiz(true));


    // --- 7. Логика Флешкарт (Flip Animation) ---
    els.openFlashcardsBtn.addEventListener('click', () => {
        els.flashcardModal.classList.remove('hidden');
        fetchFlashcardsData();
    });
    els.closeFlashcards.addEventListener('click', () => els.flashcardModal.classList.add('hidden'));
    if (els.appendFlashcardsBtn) {
        els.appendFlashcardsBtn.addEventListener('click', () => generateFlashcards(true));
    }

    window.addEventListener('click', (e) => {
        if (e.target === els.profileModal) els.profileModal.classList.add('hidden');
        if (e.target === els.quizModal) els.quizModal.classList.add('hidden');
        if (e.target === els.flashcardModal) els.flashcardModal.classList.add('hidden');
        if (e.target === els.aiSettingsModal) els.aiSettingsModal.classList.add('hidden');
    });

    // Переворот карточки по клику
    els.flashcardElement.addEventListener('click', () => {
        if(currentFlashcards.length > 0) {
            els.flashcardElement.classList.toggle('is-flipped');
        }
    });

    async function generateFlashcards(append = false) {
        els.fcQuestion.textContent = tr('flashcards_creating_q', 'Создаем карточки...');
        els.fcAnswer.textContent = tr('flashcards_creating_a', 'Подождите пару секунд');
        els.flashcardElement.classList.remove('is-flipped');
        
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/flashcards/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ chat_id: currentChatId, append })
            });
            
            if (res.ok) {
                fetchFlashcardsData();
                loadProfile(); // Обновляем XP
            } else {
                els.fcQuestion.textContent = tr('limit_or_server_error', 'Ошибка лимита или сервера');
            }
        } catch(e) { els.fcQuestion.textContent = tr('connection_error', 'Ошибка соединения.'); }
    }

    async function fetchFlashcardsData() {
        if (!currentChatId) {
            const t = translations[currentLang] || {};
            els.fcQuestion.textContent = t.choose_chat || "Выберите чат";
            els.fcAnswer.textContent = "";
            return;
        }
        const token = localStorage.getItem('access_token');
        const res = await fetch(`/flashcards/${currentChatId}`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) {
            currentFlashcards = await res.json();
            if (currentFlashcards.length === 0) {
                generateFlashcards(false);
            } else {
                currentFcIndex = 0;
                renderFlashcard();
            }
        }
    }

    function renderFlashcard() {
        els.flashcardElement.classList.remove('is-flipped');
        if(currentFlashcards.length === 0) {
            els.fcQuestion.textContent = tr('no_cards_for_chat', 'Нет карточек для этого чата.');
            els.fcCounter.textContent = "0 / 0";
            return;
        }
        setTimeout(() => {
            els.fcQuestion.textContent = currentFlashcards[currentFcIndex].question;
            els.fcAnswer.textContent = currentFlashcards[currentFcIndex].answer;
            els.fcCounter.textContent = `${currentFcIndex + 1} / ${currentFlashcards.length}`;
        }, 150); // Ждем пока закончится анимация переворота обратно
    }

    function nextCard() {
        if(currentFlashcards.length === 0) return;
        currentFcIndex++;
        if(currentFcIndex >= currentFlashcards.length) currentFcIndex = 0; // Начинаем заново
        renderFlashcard();
    }

    els.fcKnowBtn.addEventListener('click', nextCard);
    els.fcDontKnowBtn.addEventListener('click', nextCard);

});
