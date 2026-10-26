// ==UserScript==
// @name         Блокнот для сообщений [CatWar]
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Раскрывающийся блокнот с полезными функциями
// @author       Горицвет [1705753]
// @supportURL   https://catwar.su/cat1705753
// @match        http*://*.catwar.net/*
// @match        http*://*.catwar.su/*
// @updateURL    https://raw.githubusercontent.com/SpringChaos-boop/message-pad/refs/heads/main/pad.js
// @downloadURL  https://raw.githubusercontent.com/SpringChaos-boop/message-pad/refs/heads/main/pad.js
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    if (window.top !== window.self) return;

    const STORAGE_KEY = 'expandable_notebook_v1';

    const DEFAULT_STATE = {
        blocks: [
            {
                id: 'b_' + Date.now(),
                title: 'Пример записи',
                content: 'Это шаблон сообщения. Кликните по тексту, чтобы отредактировать.\nЗаголовок тоже редактируется.',
                collapsed: false
            },
            {
                id: 'b_' + (Date.now() + 1),
                title: 'Вторая запись',
                content: 'Нажмите «＋» в шапке блокнота, чтобы добавить новую запись.',
                collapsed: false
            }
        ],
        darkMode: false,
        width: 380,
        height: null
    };

    // ================= Хранилище =================
    function storageGet(key) {
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(key, null);
                if (v && typeof v.then === 'function') { /* асинхронный GM4 — используем localStorage */ }
                else return v;
            }
        } catch (e) {}
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                const r = GM_setValue(key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
                return;
            }
        } catch (e) {}
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

    function loadState() {
        const raw = storageGet(STORAGE_KEY);
        if (!raw) return clone(DEFAULT_STATE);
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.blocks)) return clone(DEFAULT_STATE);
            parsed.blocks = parsed.blocks
                .filter(b => b && typeof b === 'object')
                .map(b => ({
                    id: String(b.id || ('b_' + Math.random().toString(36).slice(2))),
                    title: typeof b.title === 'string' ? b.title : '',
                    content: typeof b.content === 'string' ? b.content : '',
                    collapsed: !!b.collapsed
                }));
            parsed.darkMode = !!parsed.darkMode;
            parsed.width = typeof parsed.width === 'number' ? parsed.width : 380;
            parsed.height = typeof parsed.height === 'number' ? parsed.height : null;
            return parsed;
        } catch (e) {
            return clone(DEFAULT_STATE);
        }
    }

    const state = loadState();
    let saveTimer = null;
    function saveState() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { storageSet(STORAGE_KEY, JSON.stringify(state)); }
            catch (e) { console.warn('Блокнот: не удалось сохранить:', e); }
        }, 200);
    }

    // ================= Блокировка клавиш для страницы =================
    const panelRef = { el: null };

    function onKeyCapture(e) {
        const p = panelRef.el;
        if (!p) return;
        const t = e.target;
        if (t && (t === p || p.contains(t))) {
            e.stopImmediatePropagation();
        }
    }
    ['keydown', 'keyup', 'keypress'].forEach(evt => {
        window.addEventListener(evt, onKeyCapture, true);
    });

    // ================= Стили =================
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #nb-widget, #nb-widget * { box-sizing: border-box; }

        #nb-widget #nb-toggle {
            position: fixed; right: 20px; bottom: 20px;
            width: 56px; height: 56px; padding: 0;
            border: none; border-radius: 50%;
            background: #6b705c; color: #f1ede2;
            font-size: 24px; line-height: 56px; text-align: center;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,.25);
            z-index: 2147483646;
            transition: transform .15s ease, box-shadow .15s ease, background .15s;
            font-family: "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif;
        }
        #nb-widget #nb-toggle:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.3); background: #5a5f4d; }
        #nb-widget #nb-toggle.nb-active { background: #5a5f4d; }

        #nb-widget #nb-panel {
            position: fixed; right: 20px; bottom: 90px;
            width: 380px; max-width: calc(100vw - 40px);
            max-height: 70vh;
            display: flex; flex-direction: column;
            background: #dad7cd; color: #344e41;
            border: 1px solid #b9b6ab; border-radius: 10px;
            box-shadow: 0 12px 40px rgba(0,0,0,.28);
            z-index: 2147483647;
            font-family: Georgia,"Times New Roman",serif;
            font-size: 14px; line-height: 1.4; text-align: left;
            overflow: hidden;
            transform-origin: bottom right;
            transition: opacity .18s ease, transform .18s ease;
        }
        #nb-widget #nb-panel.nb-hidden {
            opacity: 0;
            transform: scale(.96) translateY(6px);
            pointer-events: none;
        }
        #nb-widget #nb-panel.nb-dark {
            background: #2a2d26;
            color: #dad7cd;
            border-color: #4a4d42;
        }

        #nb-widget .nb-resize {
            position: absolute; top: 0; left: 0;
            width: 14px; height: 14px;
            cursor: nwse-resize; z-index: 3;
            border-radius: 10px 0 0 0;
            opacity: .55;
            background: linear-gradient(135deg,
                transparent 0%, transparent 40%,
                #6b705c 40%, #6b705c 45%,
                transparent 45%, transparent 55%,
                #6b705c 55%, #6b705c 60%,
                transparent 60%, transparent 70%,
                #6b705c 70%, #6b705c 75%,
                transparent 75%);
        }
        #nb-widget .nb-resize:hover { opacity: 1; }
        #nb-widget #nb-panel.nb-dark .nb-resize {
            background: linear-gradient(135deg,
                transparent 0%, transparent 40%,
                #a3b18a 40%, #a3b18a 45%,
                transparent 45%, transparent 55%,
                #a3b18a 55%, #a3b18a 60%,
                transparent 60%, transparent 70%,
                #a3b18a 70%, #a3b18a 75%,
                transparent 75%);
        }

        #nb-widget .nb-header {
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px; padding: 8px 12px; flex: 0 0 auto;
            background: #6b705c; color: #f1ede2;
            border-bottom: 1px solid #5a5f4d;
        }
        #nb-widget #nb-panel.nb-dark .nb-header {
            background: #3f4238; color: #dad7cd;
            border-bottom-color: #2a2d26;
        }
        #nb-widget .nb-header-title {
            font-weight: bold; font-size: 15px;
            user-select: none; padding-left: 14px;
        }
        #nb-widget .nb-header-btns { display: flex; gap: 4px; }
        #nb-widget .nb-hbtn {
            width: 26px; height: 26px; padding: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid rgba(255,255,255,.15); border-radius: 5px;
            background: rgba(255,255,255,.12); color: #f1ede2;
            font-size: 15px; line-height: 1; cursor: pointer;
            font-family: inherit;
        }
        #nb-widget .nb-hbtn:hover { background: rgba(255,255,255,.25); }
        #nb-widget #nb-panel.nb-dark .nb-hbtn {
            border-color: rgba(255,255,255,.1);
            background: rgba(255,255,255,.06);
            color: #dad7cd;
        }
        #nb-widget #nb-panel.nb-dark .nb-hbtn:hover { background: rgba(255,255,255,.15); }

        #nb-widget .nb-body {
            padding: 10px 12px 14px;
            overflow-y: auto; flex: 1 1 auto;
            min-height: 0;
        }
        #nb-widget .nb-empty-hint {
            color: #8a8878; font-style: italic; text-align: center;
            padding: 12px 4px; font-size: 13px;
        }

        #nb-widget .nb-block {
            margin-bottom: 10px;
            background: #e8e6dd;
            border: 1px solid #b9b6ab; border-radius: 6px;
            overflow: hidden;
            transition: box-shadow .12s ease, opacity .15s ease;
        }
        #nb-widget #nb-panel.nb-dark .nb-block {
            background: #35382f;
            border-color: #4a4d42;
        }
        #nb-widget .nb-block.nb-dragging { opacity: .35; }

        #nb-widget .nb-block-head {
            display: flex; align-items: center; gap: 2px;
            padding: 4px 6px;
            background: #c9c6bc;
            border-bottom: 1px solid #b9b6ab;
        }
        #nb-widget #nb-panel.nb-dark .nb-block-head {
            background: #3f4238;
            border-bottom-color: #4a4d42;
        }
        #nb-widget .nb-block.nb-collapsed .nb-block-head { border-bottom: none; }

        #nb-widget .nb-grip {
            flex: 0 0 auto; width: 16px; height: 22px;
            display: inline-flex; align-items: center; justify-content: center;
            color: #8a8878; font-size: 14px; line-height: 1;
            cursor: grab; user-select: none;
            letter-spacing: -2px;
            -webkit-user-drag: element;
        }
        #nb-widget .nb-grip:active { cursor: grabbing; }

        #nb-widget .nb-arrow {
            flex: 0 0 auto; width: 20px; height: 22px; padding: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border: none; background: transparent;
            color: #6b705c; font-size: 12px; line-height: 1;
            cursor: pointer; transition: transform .15s ease;
            font-family: inherit;
        }
        #nb-widget #nb-panel.nb-dark .nb-arrow { color: #a3b18a; }
        #nb-widget .nb-block.nb-collapsed .nb-arrow { transform: rotate(-90deg); }

        #nb-widget .nb-block-title {
            flex: 1 1 auto; min-width: 0;
            padding: 3px 6px; border-radius: 4px;
            font-weight: bold; font-size: 14px; color: #344e41;
            outline: none; min-height: 22px; cursor: text;
            white-space: pre-wrap; word-break: break-word;
        }
        #nb-widget #nb-panel.nb-dark .nb-block-title { color: #dad7cd; }
        #nb-widget .nb-block-title:focus { background: #f5f2e8; }
        #nb-widget #nb-panel.nb-dark .nb-block-title:focus { background: #2a2d26; }
        #nb-widget .nb-block-title.nb-empty::before {
            content: attr(data-placeholder);
            color: #8a8878; font-weight: normal; pointer-events: none;
        }

        #nb-widget .nb-copy,
        #nb-widget .nb-delete {
            flex: 0 0 auto; width: 22px; height: 22px; padding: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border: none; background: transparent;
            font-size: 13px; line-height: 1;
            cursor: pointer; border-radius: 4px;
            font-family: inherit;
        }
        #nb-widget .nb-copy { color: #6b705c; }
        #nb-widget #nb-panel.nb-dark .nb-copy { color: #a3b18a; }
        #nb-widget .nb-copy:hover { background: #d4d1c6; }
        #nb-widget #nb-panel.nb-dark .nb-copy:hover { background: #4a4d42; }
        #nb-widget .nb-copy.nb-copied { color: #588157; }

        #nb-widget .nb-delete { color: #a0522d; }
        #nb-widget #nb-panel.nb-dark .nb-delete { color: #c98b7a; }
        #nb-widget .nb-delete:hover { background: #e5c9be; }
        #nb-widget #nb-panel.nb-dark .nb-delete:hover { background: #5a3a30; }

        #nb-widget .nb-block-content {
            padding: 8px 10px;
            font-size: 13px; line-height: 1.5; color: #344e41;
            outline: none; min-height: 48px; cursor: text;
            white-space: pre-wrap; word-break: break-word;
        }
        #nb-widget #nb-panel.nb-dark .nb-block-content { color: #dad7cd; }
        #nb-widget .nb-block.nb-collapsed .nb-block-content { display: none; }
        #nb-widget .nb-block-content:focus { background: #f5f2e8; }
        #nb-widget #nb-panel.nb-dark .nb-block-content:focus { background: #2a2d26; }
        #nb-widget .nb-block-content.nb-empty::before {
            content: attr(data-placeholder);
            color: #8a8878; pointer-events: none;
        }
    `;
    document.head.appendChild(styleEl);

    // ================= UI =================
    function initUI() {
        const widget = document.createElement('div');
        widget.id = 'nb-widget';

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'nb-toggle';
        toggleBtn.type = 'button';
        toggleBtn.title = 'Открыть/закрыть блокнот';
        toggleBtn.textContent = '📓';

        const panel = document.createElement('div');
        panel.id = 'nb-panel';
        panel.classList.add('nb-hidden');
        if (state.darkMode) panel.classList.add('nb-dark');

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'nb-resize';
        resizeHandle.title = 'Потяните для изменения размера';

        const header = document.createElement('div');
        header.className = 'nb-header';

        const headerTitle = document.createElement('div');
        headerTitle.className = 'nb-header-title';
        headerTitle.textContent = 'Блокнот';

        const headerBtns = document.createElement('div');
        headerBtns.className = 'nb-header-btns';

        const themeBtn = document.createElement('button');
        themeBtn.type = 'button';
        themeBtn.className = 'nb-hbtn';
        themeBtn.title = 'Переключить тему';
        themeBtn.textContent = state.darkMode ? '☀' : '☾';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'nb-hbtn';
        addBtn.title = 'Добавить запись';
        addBtn.textContent = '＋';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'nb-hbtn';
        closeBtn.title = 'Закрыть блокнот';
        closeBtn.textContent = '✕';

        headerBtns.append(themeBtn, addBtn, closeBtn);
        header.append(headerTitle, headerBtns);

        const body = document.createElement('div');
        body.className = 'nb-body';

        panel.append(resizeHandle, header, body);
        widget.append(toggleBtn, panel);
        document.body.appendChild(widget);

        if (state.width) panel.style.width = state.width + 'px';
        if (state.height) {
            panel.style.height = state.height + 'px';
            panel.style.maxHeight = 'none';
        }

        panelRef.el = panel;

        // ===== Общий для всей панели идентификатор перетаскиваемого блока =====
        let draggedId = null;

        // ================= Логика блоков =================
        function makeId() {
            return 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        }

        function isEmptyEditable(el) {
            if (el.textContent.trim() !== '') return false;
            return !el.querySelector('img, video, iframe, audio, hr, table, svg');
        }

        function updateEmptyClass(el) {
            if (isEmptyEditable(el)) el.classList.add('nb-empty');
            else el.classList.remove('nb-empty');
        }

        function placeCaretAtStart(el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(true);
            const sel = window.getSelection();
            if (!sel) return;
            sel.removeAllRanges();
            sel.addRange(range);
        }

        function getDragAfterElement(container, y) {
            const els = [...container.querySelectorAll('.nb-block')]
                .filter(el => el.dataset.id !== draggedId);
            return els.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset, element: child };
                }
                return closest;
            }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
        }

        function syncOrderFromDOM() {
            const els = [...body.querySelectorAll('.nb-block')];
            const byId = new Map(state.blocks.map(b => [b.id, b]));
            state.blocks = els.map(el => byId.get(el.dataset.id)).filter(Boolean);
            saveState();
        }

        function fallbackCopy(text) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                return true;
            } catch (e) {
                return false;
            }
        }

        function renderBlock(block) {
            const el = document.createElement('div');
            el.className = 'nb-block' + (block.collapsed ? ' nb-collapsed' : '');
            el.dataset.id = block.id;

            const head = document.createElement('div');
            head.className = 'nb-block-head';

            // Ручка перетаскивания — настоящий draggable-элемент
            const grip = document.createElement('span');
            grip.className = 'nb-grip';
            grip.title = 'Перетащить';
            grip.textContent = '⋮⋮';
            grip.setAttribute('draggable', 'true');

            const arrow = document.createElement('button');
            arrow.type = 'button';
            arrow.className = 'nb-arrow';
            arrow.title = 'Свернуть / развернуть';
            arrow.textContent = '▾';

            const title = document.createElement('div');
            title.className = 'nb-block-title';
            title.contentEditable = 'true';
            title.spellcheck = false;
            title.dataset.placeholder = 'Заголовок записи';
            title.textContent = block.title;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'nb-copy';
            copyBtn.title = 'Скопировать текст';
            copyBtn.textContent = '⧉';

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'nb-delete';
            del.title = 'Удалить запись';
            del.textContent = '✕';

            head.append(grip, arrow, title, copyBtn, del);

            const content = document.createElement('div');
            content.className = 'nb-block-content';
            content.contentEditable = 'true';
            content.spellcheck = false;
            content.dataset.placeholder = 'Текст записи...';
            content.innerHTML = block.content;

            updateEmptyClass(title);
            updateEmptyClass(content);

            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                block.collapsed = !block.collapsed;
                el.classList.toggle('nb-collapsed', block.collapsed);
                saveState();
            });

            title.addEventListener('focus', () => {
                if (title.innerHTML === '' || title.innerHTML === '<br>') {
                    title.innerHTML = '';
                    placeCaretAtStart(title);
                }
            });
            title.addEventListener('input', () => {
                block.title = title.innerText.replace(/\u00a0/g, ' ');
                updateEmptyClass(title);
                saveState();
            });
            title.addEventListener('blur', () => {
                updateEmptyClass(title);
                block.title = title.innerText.replace(/\u00a0/g, ' ');
                saveState();
            });
            title.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    content.focus();
                    placeCaretAtStart(content);
                }
            });

            content.addEventListener('input', () => {
                block.content = content.innerHTML;
                updateEmptyClass(content);
                saveState();
            });
            content.addEventListener('blur', () => {
                if (isEmptyEditable(content)) content.innerHTML = '';
                block.content = content.innerHTML;
                updateEmptyClass(content);
                saveState();
            });

            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const text = content.innerText.replace(/\u00a0/g, ' ');
                let ok = false;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text);
                        ok = true;
                    }
                } catch (err) {}
                if (!ok) ok = fallbackCopy(text);
                if (ok) {
                    copyBtn.classList.add('nb-copied');
                    copyBtn.textContent = '✓';
                    setTimeout(() => {
                        copyBtn.classList.remove('nb-copied');
                        copyBtn.textContent = '⧉';
                    }, 1200);
                }
            });

            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm('Удалить эту запись?')) return;
                const idx = state.blocks.findIndex(b => b.id === block.id);
                if (idx >= 0) state.blocks.splice(idx, 1);
                el.remove();
                saveState();
                if (state.blocks.length === 0) renderAll();
            });

            // preventDefault ТОЛЬКО для кнопок (чтобы не терять фокус с contenteditable).
            // Для grip его НЕ вызываем — иначе нативный dragstart не запустится.
            head.addEventListener('mousedown', (e) => {
                if (e.target === arrow || e.target === del || e.target === copyBtn) {
                    e.preventDefault();
                }
            });

            // ===== Drag & Drop =====
            grip.addEventListener('dragstart', (e) => {
                draggedId = block.id;
                try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', block.id);
                } catch (err) {}
                try {
                    const r = el.getBoundingClientRect();
                    e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top);
                } catch (err) {}
                setTimeout(() => el.classList.add('nb-dragging'), 0);
            });
            grip.addEventListener('dragend', () => {
                el.classList.remove('nb-dragging');
                draggedId = null;
                syncOrderFromDOM();
            });

            el.append(head, content);
            return el;
        }

        function renderAll() {
            body.innerHTML = '';
            if (state.blocks.length === 0) {
                const hint = document.createElement('div');
                hint.className = 'nb-empty-hint';
                hint.textContent = 'Пока нет ни одной записи. Нажмите «＋», чтобы добавить.';
                body.appendChild(hint);
                return;
            }
            for (const block of state.blocks) {
                body.appendChild(renderBlock(block));
            }
        }

        // ===== Один общий обработчик dragover/drop на весь список =====
        body.addEventListener('dragover', (e) => {
            if (!draggedId) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
            const draggedEl = body.querySelector(`.nb-block[data-id="${draggedId}"]`);
            if (!draggedEl) return;
            const after = getDragAfterElement(body, e.clientY);
            if (after == null) {
                if (body.lastElementChild !== draggedEl) body.appendChild(draggedEl);
            } else if (after !== draggedEl) {
                body.insertBefore(draggedEl, after);
            }
        });
        body.addEventListener('drop', (e) => {
            if (!draggedId) return;
            e.preventDefault();
        });

        // ================= Открытие/закрытие панели =================
        function openPanel() {
            panel.classList.remove('nb-hidden');
            toggleBtn.classList.add('nb-active');
        }
        function closePanel() {
            panel.classList.add('nb-hidden');
            toggleBtn.classList.remove('nb-active');
        }
        function togglePanel() {
            panel.classList.contains('nb-hidden') ? openPanel() : closePanel();
        }

        toggleBtn.addEventListener('click', togglePanel);
        closeBtn.addEventListener('click', closePanel);

        addBtn.addEventListener('click', () => {
            const block = { id: makeId(), title: '', content: '', collapsed: false };
            state.blocks.push(block);
            saveState();

            if (body.querySelector('.nb-empty-hint')) {
                renderAll();
            } else {
                body.appendChild(renderBlock(block));
            }

            requestAnimationFrame(() => {
                const el = body.querySelector(`.nb-block[data-id="${block.id}"] .nb-block-title`);
                if (el) {
                    el.focus();
                    placeCaretAtStart(el);
                }
            });
        });

        themeBtn.addEventListener('click', () => {
            state.darkMode = !state.darkMode;
            panel.classList.toggle('nb-dark', state.darkMode);
            themeBtn.textContent = state.darkMode ? '☀' : '☾';
            saveState();
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            const startW = rect.width;
            const startH = rect.height;

            function onMove(ev) {
                const newW = Math.max(260, startW - (ev.clientX - startX));
                const newH = Math.max(200, startH - (ev.clientY - startY));
                panel.style.width = newW + 'px';
                panel.style.height = newH + 'px';
                panel.style.maxHeight = 'none';
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                state.width = parseInt(panel.style.width, 10) || state.width;
                state.height = parseInt(panel.style.height, 10) || state.height;
                saveState();
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (panel.classList.contains('nb-hidden')) return;
            const active = document.activeElement;
            if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                active.blur();
                return;
            }
            closePanel();
        });

        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
