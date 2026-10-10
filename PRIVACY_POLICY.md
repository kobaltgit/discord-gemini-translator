# Privacy Policy / Политика конфиденциальности

**Effective Date:** October 10, 2026  
**Extension:** Discord Gemini Translator  
**Developer:** Kobalt  

---

<p align="center">
  <a href="#english">English</a> | <a href="#русский">Русский</a>
</p>

---

<a name="english"></a>
## Privacy Policy (English)

This Privacy Policy explains how **Discord Gemini Translator** ("the Extension", "we", "us") handles user data. We are committed to protecting your privacy and ensuring transparency regarding any data processed by this browser extension.

### 1. Single Purpose & Core Functionality
The sole purpose of Discord Gemini Translator is to provide real-time two-way text translation of chat messages and synchronous speech-to-text subtitles in voice channels on Discord Web (`https://discord.com/*`) using the user's personal Google Gemini API key.

### 2. Information We Handle and Process
The Extension operates strictly on a **client-to-service** architecture. We do not operate any intermediate servers, databases, or tracking backends.

1. **Google Gemini API Key:**
   - **How it is used:** The API key provided by the user is used exclusively to authenticate requests sent directly to the official Google Generative Language API (`https://generativelanguage.googleapis.com/` and `wss://generativelanguage.googleapis.com/`).
   - **Storage:** Stored locally on your device within your browser's sandboxed `chrome.storage.local`. It is never transmitted to us or any third party other than Google.

2. **Chat Messages (Text Content):**
   - **How it is used:** When you click the translation button or enable Auto-Translate, the text of the selected Discord message is sent directly to the Google Gemini API to produce a translation.
   - **Storage:** Translated pairs may be kept temporarily in an in-memory or local LRU cache in `chrome.storage.local` to speed up repeated queries and conserve API quotas. You can clear this cache at any time by clearing the extension data or reinstalling the extension.

3. **Voice Audio Data (Live Subtitles / Captions):**
   - **How it is used:** When voice subtitles are enabled by the user in a Discord voice channel, incoming WebRTC audio from other voice channel participants is processed locally by a Voice Activity Detection (VAD) algorithm to remove silence. Chunks of active speech are streamed directly via secure WebSocket to the Google Gemini Live API for speech transcription and translation.
   - **Storage:** Audio streams are processed in real time and are **never saved to disk or persistent storage**.

4. **User Preferences and Settings:**
   - Languages (source/target), UI options, translation tone, and model selections are stored exclusively in `chrome.storage.local` on your local computer.

### 3. Data Sharing & Third-Party Services
- **Google Generative AI (Gemini API):** Text and audio chunks sent for translation are transmitted directly and securely (HTTPS/WSS) to Google's API endpoints (`generativelanguage.googleapis.com`). Handling of this data is subject to [Google's Privacy Policy](https://policies.google.com/privacy) and [Google Generative AI Terms of Service](https://ai.google.dev/terms).
- **No Third-Party Transmission:** No data is sold, rented, monetized, or shared with advertisers, data brokers, or any third parties.

### 4. Tracking, Telemetry, and Analytics
- **Zero Tracking:** The Extension does **not** collect telemetry, usage metrics, browser fingerprinting, or browsing history.
- **Zero Advertising:** The Extension contains no advertisements and no third-party tracking scripts.

### 5. Explanation of Browser Permissions
The Extension requests only the minimum permissions required for its functionality:
- **`storage`**: Used to save your API key, preferred languages, settings, and the local LRU translation cache locally in your browser.
- **`host_permissions: https://discord.com/*`**: Required to inject translation buttons into the Discord chat interface and capture incoming WebRTC audio tracks for voice subtitles.
- **`host_permissions: https://generativelanguage.googleapis.com/*`**: Required to make direct, authenticated HTTPS and WebSocket requests to Google Gemini for translation and live transcription.

### 6. User Control and Data Deletion
You retain complete control over your data:
- You can delete your API key, reset your preferences, or clear the translation cache at any time via the Extension Popup settings or by uninstalling the extension.
- Uninstalling the Extension completely removes all stored settings and local cached data from your browser.

### 7. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Any changes will be reflected in this file within the repository and dated accordingly.

### 8. Contact & Inquiries
If you have questions, feedback, or concerns regarding this Privacy Policy, please open an issue in the official project repository:  
[https://github.com/Kobalt/discord-gemini-translator/issues](https://github.com/Kobalt/discord-gemini-translator/issues)

---

<a name="русский"></a>
## Политика конфиденциальности (Русский)

Настоящая Политика конфиденциальности описывает, как расширение **Discord Gemini Translator** («Расширение», «мы») обрабатывает данные пользователя. Мы ценим вашу конфиденциальность и гарантируем прозрачность обработки любых данных.

### 1. Назначение расширения (Single Purpose)
Единственной целью расширения является обеспечение мгновенного двустороннего перевода текстовых сообщений и синхронных субтитров в голосовых каналах веб-версии Discord (`https://discord.com/*`) с использованием личного API-ключа Google Gemini пользователя.

### 2. Обрабатываемые данные и их хранение
Расширение работает исключительно по схеме **«клиент ➔ сервис»**. Мы не используем собственные серверы, базы данных или сторонние бэкенды.

1. **API-ключ Google Gemini:**
   - **Использование:** Введённый пользователем API-ключ используется исключительно для авторизации прямых запросов к официальному Google Generative Language API (`https://generativelanguage.googleapis.com/` и `wss://generativelanguage.googleapis.com/`).
   - **Хранение:** Хранится исключительно локально в изолированном хранилище вашего браузера (`chrome.storage.local`). Ключ никогда не передаётся разработчику или третьим лицам (кроме Google).

2. **Текст сообщений чата:**
   - **Использование:** При нажатии кнопки перевода или в режиме автоперевода текст выбранного сообщения отправляется напрямую в Google Gemini API для генерации перевода.
   - **Хранение:** Недавние переводы могут сохраняться во внутреннем локальном LRU-кэше в `chrome.storage.local` для экономии квот API и мгновенного отображения повторных фраз. Кэш можно очистить в любой момент через настройки или удаление расширения.

3. **Аудиопоток голосовых каналов (Субтитры / Live Captions):**
   - **Использование:** При включении пользователем субтитров входящий звук WebRTC от участников голосового канала Discord обрабатывается встроенным локальным алгоритмом VAD (детектор активности голоса) для отсечения тишины. Фрагменты активной речи в потоковом режиме отправляются по защищенному WebSocket в Gemini Live API для распознавания и перевода.
   - **Хранение:** Звук обрабатывается «на лету» в оперативной памяти и **никогда не сохраняется на диск или в постоянное хранилище**.

4. **Настройки пользователя:**
   - Выбранные языки, тон перевода, флаги интерфейса и модель сохраняются исключительно в `chrome.storage.local` на вашем компьютере.

### 3. Передача данных третьим сторонам
- **Google Generative AI (Gemini API):** Данные текста и аудио передаются напрямую по зашифрованным протоколам HTTPS/WSS на серверы Google (`generativelanguage.googleapis.com`). Обработка этих данных регулируется [Политикой конфиденциальности Google](https://policies.google.com/privacy) и [Условиями использования Google Generative AI](https://ai.google.dev/terms).
- **Отсутствие передачи третьим лицам:** Данные никогда не продаются, не передаются рекламным сетям, аналитическим компаниям или брокерам данных.

### 4. Трекинг, телеметрия и аналитика
- **Полное отсутствие трекинга:** Расширение **не собирает** статистику использования, телеметрию, историю посещений и не выполняет фингерпринтинг браузера.
- **Отсутствие рекламы:** В расширении нет рекламных баннеров и сторонних скриптов.

### 5. Обоснование разрешений браузера
Расширение запрашивает минимально необходимый набор прав:
- **`storage`**: Локальное сохранение настроек, API-ключа и кэша переводов в браузере.
- **`host_permissions: https://discord.com/*`**: Внедрение кнопок перевода в интерфейс чата Discord и перехват аудиопотока WebRTC для субтитров.
- **`host_permissions: https://generativelanguage.googleapis.com/*`**: Отправка прямых запросов перевода и транскрибации в Google Gemini API.

### 6. Управление данными и удаление
- Пользователь в любой момент может удалить свой API-ключ или сбросить настройки через окно настроек (Popup).
- Удаление расширения из браузера полностью и безвозвратно удаляет все сохранённые настройки и локальный кэш с компьютера.

### 7. Контакты и обратная связь
По любым вопросам, связанным с данной Политикой конфиденциальности, создавайте обращения в официальном репозитории проекта:  
[https://github.com/Kobalt/discord-gemini-translator/issues](https://github.com/Kobalt/discord-gemini-translator/issues)
