document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const authOverlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPass = document.getElementById('auth-password');
    const authBtn = document.getElementById('auth-btn');
    const authSwitch = document.getElementById('auth-switch');
    const switchAction = document.getElementById('switch-action');
    const authError = document.getElementById('auth-error');
    const authTitle = document.getElementById('auth-title');
    const logoutBtn = document.getElementById('logout-btn');

    const chatBox = document.getElementById('chat-box');
    const welcomeScreen = document.getElementById('welcome-screen');
    const typingIndicator = document.getElementById('typing-indicator');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const modelBtns = document.querySelectorAll('.model-btn');

    // Image Elements
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image');

    // State
    let isLoginMode = true;
    let currentModel = 'notes';
    let currentImageBase64 = null;

    // --- 1. АВТОРИЗАЦИЯ ---

    // Проверка токена при старте
    const token = localStorage.getItem('access_token');
    if (token) {
        showApp();
    } else {
        authOverlay.classList.remove('hidden');
    }

    // Переключение Вход / Регистрация
    switchAction.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            authTitle.textContent = "Вход в Studify";
            authBtn.textContent = "Войти";
            authSwitch.childNodes[0].textContent = "Нет аккаунта? ";
            switchAction.textContent = "Зарегистрироваться";
        } else {
            authTitle.textContent = "Регистрация";
            authBtn.textContent = "Создать аккаунт";
            authSwitch.childNodes[0].textContent = "Есть аккаунт? ";
            switchAction.textContent = "Войти";
        }
        authError.classList.add('hidden');
    });

    // Обработка формы
    authBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPass.value;

        if (!email || !password) {
            showError("Пожалуйста, заполните все поля");
            return;
        }

        authBtn.disabled = true;
        authBtn.textContent = "Загрузка...";

        try {
            const endpoint = isLoginMode ? '/token' : '/register';
            let response;

            if (isLoginMode) {
                // Вход требует FormData для OAuth2
                const formData = new FormData();
                formData.append('username', email); // FastAPI OAuth2 ожидает username
                formData.append('password', password);
                
                response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });
            } else {
                // Регистрация требует JSON
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Ошибка сервера");
            }

            if (isLoginMode) {
                // Успешный вход
                localStorage.setItem('access_token', data.access_token);
                showApp();
            } else {
                // Успешная регистрация
                alert("Аккаунт создан! Теперь войдите.");
                // Переключаем на вход автоматически
                switchAction.click(); 
            }

        } catch (err) {
            showError(err.message === "Unauthorized" ? "Неверный логин или пароль" : err.message);
        } finally {
            authBtn.disabled = false;
            authBtn.textContent = isLoginMode ? "Войти" : "Создать аккаунт";
        }
    });

    function showError(msg) {
        authError.textContent = msg;
        authError.classList.remove('hidden');
    }

    function showApp() {
        authOverlay.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    }

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('access_token');
        location.reload();
    });


    // --- 2. ЧАТ И ЛОГИКА ---

    // Выбор модели
    modelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentModel = btn.dataset.model;
        });
    });

    // Обработка фото
    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                currentImageBase64 = event.target.result;
                imagePreview.src = currentImageBase64;
                imagePreviewContainer.classList.remove('hidden');
                
                // Авто-переключение на режим "Око"
                if (currentModel !== 'eye') {
                    document.querySelector('[data-model="eye"]').click();
                }
                userInput.placeholder = "Добавь подпись к фото...";
                userInput.focus();
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', () => {
        currentImageBase64 = null;
        fileInput.value = '';
        imagePreviewContainer.classList.add('hidden');
        userInput.placeholder = "Задай вопрос...";
    });

    // Отправка сообщения
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    async function sendMessage() {
        const text = userInput.value.trim();
        
        if (!text && !currentImageBase64) return;

        // UI Updates
        if (!welcomeScreen.classList.contains('minimized')) {
            welcomeScreen.classList.add('minimized');
            chatBox.classList.remove('hidden');
        }

        appendUserMessage(text, currentImageBase64);
        
        // Prepare Payload
        const payload = {
            message: text,
            model_type: currentModel,
            image: currentImageBase64
        };

        // Reset Input UI
        userInput.value = '';
        currentImageBase64 = null;
        fileInput.value = '';
        imagePreviewContainer.classList.add('hidden');
        userInput.placeholder = "Задай вопрос...";

        showTypingIndicator();

        // Network Request
        const token = localStorage.getItem('access_token');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                hideTypingIndicator();
                localStorage.removeItem('access_token');
                alert("Сессия истекла. Пожалуйста, войдите снова.");
                location.reload();
                return;
            }

            const data = await response.json();
            hideTypingIndicator();

            if (data.reply) {
                appendAiMessage(data.reply);
            } else {
                appendMessage("Не удалось получить ответ от ИИ.", 'ai-msg error');
            }

        } catch (error) {
            console.error(error);
            hideTypingIndicator();
            appendMessage("Ошибка соединения с сервером.", 'ai-msg error');
        }
    }

    // --- HELPERS ---

    function appendUserMessage(text, imageBase64) {
        const div = document.createElement('div');
        div.classList.add('message', 'user-msg');
        
        if (imageBase64) {
            const img = document.createElement('img');
            img.src = imageBase64;
            img.classList.add('user-image');
            div.appendChild(img);
        }
        
        if (text) {
            const p = document.createElement('div');
            p.textContent = text;
            div.appendChild(p);
        }
        
        chatBox.appendChild(div);
        scrollToBottom();
    }

    function appendAiMessage(markdownText) {
        const div = document.createElement('div');
        div.classList.add('message', 'ai-msg');
        // Используем marked для парсинга
        div.innerHTML = marked.parse(markdownText);
        chatBox.appendChild(div);
        scrollToBottom();
    }

    function appendMessage(text, className) {
        const div = document.createElement('div');
        div.classList.add('message', className);
        div.textContent = text;
        chatBox.appendChild(div);
        scrollToBottom();
    }

    function showTypingIndicator() {
        typingIndicator.classList.remove('hidden');
        chatBox.appendChild(typingIndicator);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        typingIndicator.classList.add('hidden');
    }

    function scrollToBottom() {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});