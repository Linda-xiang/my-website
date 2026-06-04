/**
 * DocMind 文档知识管理平台 - 前端主逻辑
 */

// ==================== 全局状态 ====================
const State = {
    currentPage: 'dashboard',
    // 笔记
    currentNoteId: null,
    quill: null,
    noteTags: [],
    // 文件
    currentPreviewFile: null,
    selectedFiles: new Set(),
    // AI
    currentChatId: null,
    aiMode: 'chat',
    // 翻译
};

// ==================== 工具函数 ====================
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return ctx.querySelectorAll(sel); }

async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `请求失败 (${res.status})`);
        }
        return await res.json();
    } catch (e) {
        throw e;
    }
}

function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// 检测文本是否为代码并格式化显示
function formatOCRText(text) {
    if (!text) return '<p class="empty-state">无内容</p>';
    const isCode = /^\s*(def |class |import |from |for |while |if |elif |else|try:|except|return |lambda |with |print\()/.test(text) ||
                   /^\s{2,}/m.test(text) ||
                   (text.split('\n').length > 2 && /[(){}\[\]=<>+\-*/%&|^~]/.test(text));
    const safe = escapeHtml(text);
    if (isCode) {
        return `<pre style="max-height:500px;overflow:auto;background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;font-family:'Consolas','Courier New',monospace;font-size:13px;line-height:1.6;"><code>${safe}</code></pre>`;
    }
    return `<div class="ocr-result-text" style="max-height:500px;overflow-y:auto;white-space:pre-wrap;font-size:14px;line-height:1.8;">${safe}</div>`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    // SQLite CURRENT_TIMESTAMP 返回的是 UTC 时间，需要正确解析
    // 如果日期字符串没有时区信息，添加 'Z' 表示UTC，然后转为本地时间
    let dateToParse = dateStr;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
        // 格式如 "2026-05-28 03:25:00"，转为ISO格式
        dateToParse = dateStr.replace(' ', 'T') + 'Z';
    } else if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateToParse = dateStr + 'Z';
    }
    const d = new Date(dateToParse);
    if (isNaN(d.getTime())) {
        // 回退：直接解析
        const d2 = new Date(dateStr);
        if (isNaN(d2.getTime())) return dateStr;
        return formatDateDiff(d2);
    }
    return formatDateDiff(d);
}

function formatDateDiff(d) {
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(1) + ' ' + units[i];
}

// ==================== 用户登录/注册 ====================

function showLoginForm() {
    const form = $('#user-auth-form');
    const btn = $('#user-login-btn');
    if (form) { form.style.display = form.style.display === 'none' ? 'block' : 'none'; }
    if (btn) btn.style.display = 'none';
    $('#auth-error').textContent = '';
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('#auth-submit-btn').textContent = tab === 'register' ? '注册' : '登录';
    $('#auth-error').textContent = '';
}

async function submitAuth() {
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;
    const isRegister = document.querySelector('.auth-tab.active')?.dataset.tab === 'register';

    if (!username) return showAuthError('请输入用户名');
    if (!password || password.length < 6) return showAuthError('密码至少6位');

    const btn = $('#auth-submit-btn');
    btn.disabled = true;
    btn.textContent = '处理中...';
    try {
        const body = isRegister
            ? { username, password }
            : { username, password };
        const res = await api(`/api/auth/${isRegister ? 'register' : 'login'}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (res.user) {
            showAuthError('成功', 'success');
            $('#user-auth-form').style.display = 'none';
            $('#user-login-btn').style.display = 'none';
            updateUserUI(res.user);
            // 登录/注册成功后刷新当前页面数据
            refreshCurrentPage();
        }
    } catch(e) {
        showAuthError(e.message);
    }
    btn.disabled = false;
    btn.textContent = isRegister ? '注册' : '登录';
}

async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST' });
        updateUserUI(null);
        refreshCurrentPage();
    } catch(e) { showAuthError(e.message); }
}

function showAuthError(msg, type) {
    const el = $('#auth-error');
    if (el) {
        el.textContent = msg;
        el.style.color = type === 'success' ? '#4ade80' : type === 'info' ? '#fbbf24' : '#f87171';
    }
}

function updateUserUI(user) {
    const info = $('#user-info');
    const loginBtn = $('#user-login-btn');
    const form = $('#user-auth-form');
    const emailEl = $('#user-email');
    if (user) {
        if (info) info.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';
        if (form) form.style.display = 'none';
        if (emailEl) emailEl.textContent = user.username || '用户';
    } else {
        if (info) info.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'block';
        if (form) form.style.display = 'none';
    }
}

async function checkAuth() {
    try {
        const res = await api('/api/auth/me');
        if (res.user) updateUserUI(res.user);
    } catch(e) { /* 未登录，保持原样 */ }
}

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', checkAuth);

// ==================== 导航 ====================
function navigateTo(page) {
    State.currentPage = page;
    // 更新侧边栏
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');
    // 切换页面
    $$('.page').forEach(p => p.classList.remove('active'));
    const pageEl = $(`#page-${page}`);
    if (pageEl) pageEl.classList.add('active');
    // 初始化对应模块
    initPage(page);
}

function initPage(page) {
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'notes': initNotesPage(); break;
        case 'files': loadFiles(); loadFilesFolders(); break;
        case 'translate': loadTranslations(); break;
        case 'ocr': break;
        case 'ai': loadAIChats(); break;
        case 'batch': loadBatchFiles(); break;
    }
}

// 登录/登出后刷新当前页面数据，无需手动刷新
function refreshCurrentPage() {
    const page = State.currentPage || 'dashboard';
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'notes': initNotesPage(); break;
        case 'files': loadFiles(); loadFilesFolders(); break;
        case 'translate': loadTranslations(); break;
        case 'ai': loadAIChats(); break;
        case 'batch': initBatchPage(); break;
    }
}

// 侧边栏点击
$$('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// ==================== 设置 ====================
function openSettings() {
    const modal = $('#settings-modal');
    modal.classList.add('show');
    api('/api/config').then(config => {
        $('#setting-api-key').value = config.deepseek_api_key || '';
        $('#setting-base-url').value = config.deepseek_base_url || 'https://api.deepseek.com';
        $('#setting-source-lang').value = config.default_source_lang || 'zh';
        $('#setting-target-lang').value = config.default_target_lang || 'en';
        $('#api-key-status').textContent = config.deepseek_api_key_masked
            ? `当前 Key: ${config.deepseek_api_key_masked}` : '未配置';
    }).catch(() => {});
}

function closeSettings() { $('#settings-modal').classList.remove('show'); }

async function saveSettings() {
    const data = {
        deepseek_api_key: $('#setting-api-key').value.trim(),
        deepseek_base_url: $('#setting-base-url').value.trim(),
        default_source_lang: $('#setting-source-lang').value,
        default_target_lang: $('#setting-target-lang').value,
    };
    try {
        await api('/api/config', { method: 'POST', body: JSON.stringify(data) });
        showToast('设置已保存', 'success');
        closeSettings();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ==================== 仪表盘 ====================
async function loadDashboard() {
    try {
        const stats = await api('/api/stats');
        $('#stat-notes').textContent = stats.notes;
        $('#stat-files').textContent = stats.files;
        $('#stat-translations').textContent = stats.translations;
        $('#stat-chats').textContent = stats.chats;

        const notes = await api('/api/notes?folder=');
        const recentNotes = notes.slice(0, 5);
        const htmlN = recentNotes.map(n => `
            <div class="recent-item" onclick="openNote('${n.id}')">
                <span class="recent-item-name">📝 ${escapeHtml(n.title)}</span>
                <span class="recent-item-time">${formatDate(n.updated_at)}</span>
            </div>`).join('');
        $('#recent-notes-list').innerHTML = htmlN || '<p class="empty-state">暂无笔记</p>';

        const files = await api('/api/files?folder=files_default');
        const recentFiles = files.slice(0, 5);
        const htmlF = recentFiles.map(f => `
            <div class="recent-item" onclick="navigateTo('files');setTimeout(()=>previewFile('${f.id}'),300)">
                <span class="recent-item-name">${getFileIcon(f.file_type)} ${escapeHtml(f.original_name)}</span>
                <span class="recent-item-time">${formatDate(f.created_at)}</span>
            </div>`).join('');
        $('#recent-files-list').innerHTML = htmlF || '<p class="empty-state">暂无文件</p>';

        const trans = await api('/api/translations');
        const recentTrans = trans.slice(0, 5);
        const htmlT = recentTrans.map(t => `
            <div class="recent-item">
                <span class="recent-item-name">🌐 ${escapeHtml(t.source_text.substring(0, 40))}...</span>
                <span class="recent-item-time">${formatDate(t.created_at)}</span>
            </div>`).join('');
        $('#recent-translations-list').innerHTML = htmlT || '<p class="empty-state">暂无翻译记录</p>';
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFileIcon(type) {
    const icons = { pdf: '📄', word: '📝', text: '📃', image: '🖼', audio: '🎵', video: '🎬', ebook: '📚', spreadsheet: '📊', presentation: '📽' };
    return icons[type] || '📁';
}

// ==================== 全局搜索 ====================
let searchTimer = null;
function globalSearch() {
    const q = $('#global-search').value.trim();
    if (!q || q.length < 2) return;
    api(`/api/search?q=${encodeURIComponent(q)}`).then(result => {
        const total = (result.notes?.length || 0) + (result.files?.length || 0) + (result.translations?.length || 0);
        if (total === 0) {
            showToast('未找到相关结果', 'info');
            return;
        }
        showToast(`找到 ${total} 条相关结果`, 'success');
        // 优先显示笔记结果
        if (result.notes?.length > 0) {
            navigateTo('notes');
            const firstNote = result.notes[0];
            openNote(firstNote.id);
        } else if (result.files?.length > 0) {
            navigateTo('files');
            previewFile(result.files[0].id);
        }
    }).catch(e => showToast(e.message, 'error'));
}

// ==================== 笔记模块 ====================
function initNotesPage() {
    if (!State.quill) {
        // 等待 Quill 库加载（CDN async 可能还没完成）
        if (typeof Quill === 'undefined') {
            setTimeout(initNotesPage, 200);
            return;
        }
        const editorEl = document.getElementById('quill-editor');
        if (!editorEl || !editorEl.getBoundingClientRect().height) {
            // 元素不可见或不存有尺寸，延迟初始化
            setTimeout(initNotesPage, 100);
            return;
        }
        State.quill = new Quill('#quill-editor', {
            theme: 'snow',
            placeholder: '开始写笔记...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['blockquote', 'code-block'],
                    [{ 'align': [] }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
        // 不再自动保存，只有用户点击保存按钮时才保存
        // State.quill.on('text-change', () => {
        //     if (State.currentNoteId && State._saveTimeout) clearTimeout(State._saveTimeout);
        //     if (State.currentNoteId) {
        //         State._saveTimeout = setTimeout(saveCurrentNote, 2000);
        //     }
        // });
    }
    loadNotes();
    loadNotesFolders();
}

async function loadNotes() {
    try {
        const search = $('#notes-search')?.value || '';
        const activeFolder = document.querySelector('#notes-folder-tree .folder-item.active');
        const folder = activeFolder ? activeFolder.dataset.folder : 'notes_default';
        const params = new URLSearchParams();
        if (folder) params.set('folder', folder);
        if (search) params.set('search', search);

        const notes = await api(`/api/notes?${params}`);
        const list = $('#notes-list');
        list.innerHTML = notes.length === 0
            ? '<p class="empty-state">没有笔记，点击"新建笔记"开始</p>'
            : notes.map(n => `
                <div class="note-list-item ${n.id === State.currentNoteId ? 'active' : ''}" onclick="openNote('${n.id}')">
                    <span class="note-list-title">📝 ${escapeHtml(n.title)}</span>
                    <span class="note-list-date">${formatDate(n.updated_at)}</span>
                    <span class="note-list-delete" onclick="event.stopPropagation();deleteNote('${n.id}')">🗑</span>
                </div>`).join('');
    } catch (e) {
        console.error(e);
    }
}

async function loadNotesFolders() {
    try {
        const systemFolders = await api('/api/folders?parent=root&type=system');
        const normalFolders = await api('/api/folders?parent=notes_default&type=normal');
        const allFolders = [
            { id: 'notes_default', name: '📁 全部笔记', type: 'system' },
            ...systemFolders.map(f => ({ ...f, name: `📁 ${f.name}` })),
            ...normalFolders.map(f => ({ ...f, name: `📁 ${f.name}` })),
        ];
        $('#notes-folder-tree').innerHTML = allFolders.map(f =>
            `<div class="folder-item ${f.id === 'notes_default' ? 'active' : ''}" data-folder="${f.id}" onclick="selectNotesFolder('${f.id}', this)">${f.name}</div>`
        ).join('');
    } catch (e) { console.error(e); }
}

function selectNotesFolder(folderId, el) {
    $$('#notes-folder-tree .folder-item').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
    State.currentNotesFolder = folderId;
    loadNotes();
}

async function createNote() {
    try {
        const result = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title: '无标题笔记', content: '', tags: [], folder_id: 'notes_default' })
        });
        State.currentNoteId = result.id;
        State.noteTags = [];
        $('#note-title').value = '无标题笔记';
        State.quill.setContents([]);
        $('#tags-display').innerHTML = '';
        loadNotes();
        showToast('笔记已创建', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function openNote(noteId) {
    try {
        const note = await api(`/api/notes/${noteId}`);
        State.currentNoteId = noteId;
        State.noteTags = note.tags || [];
        $('#note-title').value = note.title;

        const quillEl = $('#quill-editor');
        const previewEl = $('#note-preview');
        const toggleEl = $('#note-mode-toggle');

        // 检测是否为AI生成的笔记（标题含[AI分析报告]或[多文件对比分析]标记）
        // 如果是，用marked.js实时渲染原始Markdown，绕过Quill截断
        const isAiNote = note.title && (
            note.title.startsWith('[AI分析报告]') || note.title.startsWith('[多文件对比分析]')
        );

        if (isAiNote && previewEl) {
            State.noteMode = 'preview';
            if (quillEl) quillEl.style.display = 'none';
            previewEl.style.display = 'block';
            // 内容可能是原始Markdown（含$..$公式），需要用marked.js实时渲染
            const content = note.content || '';
            // 检测是否为原始Markdown（含未渲染的$公式标记 或 典型Markdown语法）
            const looksLikeRawMd = /\$[^$]+\$/.test(content) || /^#{1,6}\s/m.test(content) || /^\*\*.*\*\*/m.test(content);
            if (typeof marked !== 'undefined' && content && looksLikeRawMd) {
                try {
                    previewEl.innerHTML = marked.parse(content);
                } catch(e) {
                    previewEl.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
                }
            } else {
                previewEl.innerHTML = content;
            }
            // 存储原始 Markdown 到 dataset，供 toggleNoteMode 切换时用 marked.parse 转 HTML
            previewEl.dataset.rawContent = content;
            // 清除上次渲染标记，确保 renderLatexInElement 能正确执行
            previewEl.removeAttribute('data-latex-rendered');
            // 【修复】marked 的 math 扩展可能异步加载不完整，用 renderLatexInElement 兜底渲染
            renderLatexInElement(previewEl);
            console.log('[openNote] AI笔记渲染, 内容长度:', content.length);
            if (toggleEl) {
                toggleEl.style.display = 'block';
                toggleEl.querySelector('button').textContent = '📝 切换到编辑模式';
            }
        } else {
            // 检测内容是否包含 LaTeX 公式（$...$或$$...$$）
            const noteContent = note.content || '';
            const hasLatex = /\$[^$]+\$/.test(noteContent);

            if (hasLatex && previewEl) {
                // 含公式的笔记默认使用预览模式，用 KaTeX 实时渲染
                State.noteMode = 'preview';
                if (quillEl) quillEl.style.display = 'none';
                previewEl.style.display = 'block';
                // 重新设置内容并渲染 KaTeX
                previewEl.innerHTML = noteContent;
                previewEl.removeAttribute('data-latex-rendered');
                renderLatexInElement(previewEl);
                if (toggleEl) {
                    toggleEl.style.display = 'block';
                    toggleEl.querySelector('button').textContent = '📝 切换到编辑模式';
                }
                // 同时将原始内容存入 Quill（供后续编辑使用）
                if (State.quill && State.quill.root) {
                    State.quill.root.innerHTML = noteContent;
                }
            } else {
                State.noteMode = 'edit';
                if (quillEl) quillEl.style.display = 'block';
                if (previewEl) previewEl.style.display = 'none';
                if (toggleEl) toggleEl.style.display = 'none';
                if (State.quill && State.quill.root) {
                    State.quill.root.innerHTML = noteContent;
                }
            }
        }

        renderNoteTags();
        loadNotes();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function toggleNoteMode() {
    const quillEl = $('#quill-editor');
    const previewEl = $('#note-preview');
    const toggleBtn = document.querySelector('#note-mode-toggle button');
    if (!quillEl || !previewEl || !toggleBtn) return;

    if (State.noteMode === 'preview') {
        // 预览→编辑：
        // - AI 笔记：原始内容是 Markdown（存储在 dataset.rawContent），用 marked.parse 转 HTML
        // - 普通笔记：直接取 previewEl.innerHTML（已经是 HTML）
        let htmlContent;
        const rawMd = previewEl.dataset.rawContent;
        if (rawMd && typeof marked !== 'undefined') {
            // AI 笔记：原始 Markdown → HTML 后再给 Quill
            try {
                htmlContent = marked.parse(rawMd);
            } catch(e) {
                htmlContent = rawMd;
            }
        } else {
            // 普通笔记：直接从 preview 取 HTML 内容
            htmlContent = previewEl.innerHTML;
        }
        State.noteMode = 'edit';
        quillEl.style.display = 'block';
        previewEl.style.display = 'none';
        if (State.quill && htmlContent) {
            State.quill.setContents([{ insert: '\n' }], 'user');
            State.quill.clipboard.dangerouslyPasteHTML(htmlContent);
        }
        toggleBtn.textContent = '👁 切换到预览模式';
        showToast('已切换到编辑模式', 'success');
    } else {
        // 编辑→预览：取 Quill 中的原始内容，设置到预览区，然后渲染 LaTeX
        const quillHtml = State.quill ? State.quill.root.innerHTML : '';
        State.noteMode = 'preview';
        quillEl.style.display = 'none';
        previewEl.style.display = 'block';
        previewEl.innerHTML = quillHtml;
        previewEl.removeAttribute('data-latex-rendered');
        renderLatexInElement(previewEl);
        toggleBtn.textContent = '📝 切换到编辑模式';
    }
}

// ==================== LaTeX 公式渲染 ====================
// 将 DOM 元素中的 $...$ 和 $$...$$ 用 KaTeX 渲染
function renderLatexInElement(element) {
    if (!element || typeof katex === 'undefined') return;
    // 防止重复渲染
    if (element.getAttribute('data-latex-rendered') === 'true') return;

    // 快速检测是否有 $ 符号
    if (!/\$[^$]+?\$/.test(element.innerHTML)) return;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const modifications = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent;

        // 先处理 $$...$$ 块级公式
        let processed = '';
        let lastIdx = 0;
        let hasMath = false;

        const blockRegex = /\$\$([\s\S]+?)\$\$/g;
        let bm;
        while ((bm = blockRegex.exec(text)) !== null) {
            hasMath = true;
            processed += text.slice(lastIdx, bm.index);
            try {
                processed += katex.renderToString(bm[1].trim(), { displayMode: true, throwOnError: false, strict: false, trust: true });
            } catch(e) {
                processed += '<pre><code>$$' + bm[1].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '$$</code></pre>';
            }
            lastIdx = bm.index + bm[0].length;
        }
        // 剩余文本（可能含 $...$）
        const remaining = text.slice(lastIdx);

        // 处理 $...$ 行内公式
        let inlineProcessed = '';
        let inlineLastIdx = 0;
        const inlineRegex = /\$([^$\n]+?)\$/g;
        let im;
        while ((im = inlineRegex.exec(remaining)) !== null) {
            hasMath = true;
            inlineProcessed += remaining.slice(inlineLastIdx, im.index);
            try {
                inlineProcessed += katex.renderToString(im[1].trim(), { throwOnError: false, strict: false, trust: true });
            } catch(e) {
                inlineProcessed += '<code>$' + im[1].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '$</code>';
            }
            inlineLastIdx = im.index + im[0].length;
        }
        inlineProcessed += remaining.slice(inlineLastIdx);

        // 如果前面有 block 处理结果，合起来
        const finalText = processed + inlineProcessed;

        if (hasMath) {
            const span = document.createElement('span');
            span.innerHTML = finalText;
            modifications.push({ oldNode: node, newNode: span });
        }
    }

    for (const mod of modifications) {
        mod.oldNode.parentNode.replaceChild(mod.newNode, mod.oldNode);
    }

    element.setAttribute('data-latex-rendered', 'true');
}

async function saveCurrentNote() {
    if (!State.currentNoteId) {
        showToast('请先选择或创建一条笔记', 'warning');
        return;
    }
    try {
        // 根据当前模式获取内容
        let content;
        const previewEl = $('#note-preview');
        if (State.noteMode === 'preview' && previewEl) {
            // 预览模式下：优先从 Quill 取原始内容（避免保存到已渲染的 KaTeX HTML，丢失 $...$ 源）
            content = State.quill ? State.quill.root.innerHTML : previewEl.innerHTML;
        } else {
            content = State.quill ? State.quill.root.innerHTML : '';
        }
        const title = $('#note-title')?.value || '无标题笔记';
        const activeFolder = document.querySelector('#notes-folder-tree .folder-item.active');
        const folderId = activeFolder ? activeFolder.dataset.folder : 'notes_default';
        await api(`/api/notes/${State.currentNoteId}`, {
            method: 'PUT',
            body: JSON.stringify({
                title, content, tags: State.noteTags, folder_id: folderId
            })
        });
        showToast('已保存', 'success');
        loadNotes();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteNote(noteId) {
    if (!confirm('确定删除这条笔记？')) return;
    try {
        await api(`/api/notes/${noteId}`, { method: 'DELETE' });
        if (State.currentNoteId === noteId) {
            State.currentNoteId = null;
            if (State.quill && State.quill.root) State.quill.root.innerHTML = '';
            const p = $('#note-preview');
            if (p) { p.innerHTML = ''; p.style.display = 'none'; }
            const qe = $('#quill-editor');
            if (qe) qe.style.display = 'block';
            const t = $('#note-mode-toggle');
            if (t) t.style.display = 'none';
            $('#note-title').value = '';
            State.noteMode = 'edit';
        }
        showToast('已删除', 'success');
        loadNotes();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// 标签管理
function addTag(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const tag = input.value.trim();
        if (tag && !State.noteTags.includes(tag)) {
            State.noteTags.push(tag);
            renderNoteTags();
            input.value = '';
        }
    }
}

function removeTag(index) {
    State.noteTags.splice(index, 1);
    renderNoteTags();
}

function renderNoteTags() {
    $('#tags-display').innerHTML = State.noteTags.map((t, i) =>
        `<span class="tag">${escapeHtml(t)}<span class="tag-remove" onclick="removeTag(${i})">×</span></span>`
    ).join('');
}

// 历史版本
let historyNoteId = null;
async function showNoteHistory() {
    if (!State.currentNoteId) { showToast('请先打开一条笔记', 'info'); return; }
    historyNoteId = State.currentNoteId;
    try {
        const versions = await api(`/api/notes/${State.currentNoteId}/history`);
        $('#history-list').innerHTML = versions.map(v => `
            <div class="history-item" onclick="restoreHistoryVersion(${v.id})">
                <span class="history-version">版本 v${v.version} - ${escapeHtml(v.title)}</span>
                <span class="history-time">${formatDate(v.created_at)}</span>
            </div>`).join('') || '<p class="empty-state">暂无历史版本</p>';
        $('#history-modal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

function closeHistory() { $('#history-modal').classList.remove('show'); }

async function restoreHistoryVersion(versionId) {
    try {
        const version = await api(`/api/notes/${historyNoteId}/history/${versionId}`);
        if (version && version.content) {
            State.quill.root.innerHTML = version.content;
            $('#note-title').value = version.title;
            saveCurrentNote();
            closeHistory();
            showToast('已恢复到版本 v' + version.version, 'success');
        }
    } catch (e) { showToast(e.message, 'error'); }
}

// 笔记模板
async function showTemplates() {
    try {
        const templates = await api('/api/templates');
        $('#template-grid').innerHTML = templates.map(t => `
            <div class="template-card" onclick="useTemplate('${t.id}')">
                <h4>${escapeHtml(t.name)}</h4>
                <span class="template-cat">${escapeHtml(t.category)}</span>
                <p class="template-desc">${escapeHtml(t.description)}</p>
            </div>`).join('');
        $('#template-modal').classList.add('show');
    } catch (e) { showToast(e.message, 'error'); }
}

function closeTemplates() { $('#template-modal').classList.remove('show'); }

async function useTemplate(tplId) {
    try {
        const tpl = await api(`/api/templates/${tplId}`);
        const result = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title: tpl.name + ' - ' + new Date().toLocaleDateString(), content: tpl.content, tags: [tpl.category], folder_id: 'notes_default' })
        });
        State.currentNoteId = result.id;
        State.noteTags = [tpl.category];
        $('#note-title').value = tpl.name + ' - ' + new Date().toLocaleDateString();
        State.quill.root.innerHTML = tpl.content;
        renderNoteTags();
        closeTemplates();
        navigateTo('notes');
        loadNotes();
        showToast('模板已应用', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

// ==================== 文件模块 ====================
async function loadFiles() {
    try {
        const search = $('#files-search')?.value || '';
        const type = $('#files-type-filter')?.value || '';
        const activeFolder = document.querySelector('#files-folder-tree .folder-item.active');
        const folder = activeFolder ? activeFolder.dataset.folder : 'files_default';
        const params = new URLSearchParams({ folder });
        if (search) params.set('search', search);
        if (type) params.set('type', type);

        const files = await api(`/api/files?${params}`);
        let grid = $('#files-grid');
        if (files.length === 0) {
            grid.innerHTML = '<p class="empty-state">暂无文件，请上传文件或选择其他文件夹</p>';
            return;
        }
        grid.innerHTML = files.map(f => `
            <div class="file-card ${State.selectedFiles.has(f.id) ? 'selected' : ''}" onclick="previewFile('${f.id}')">
                <div class="file-card-icon">${getFileIcon(f.file_type)}</div>
                <div class="file-card-name" title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</div>
                <div class="file-card-meta">
                    <span>${formatSize(f.file_size)}</span>
                    <span>${formatDate(f.created_at)}</span>
                </div>
                <div class="file-card-actions">
                    <button class="btn btn-xs" onclick="event.stopPropagation();toggleFileSelect('${f.id}')">${State.selectedFiles.has(f.id) ? '✓ 已选' : '选择'}</button>
                    <button class="btn btn-xs btn-outline" onclick="event.stopPropagation();downloadFile('${f.id}')">⬇</button>
                    <button class="btn btn-xs btn-outline" onclick="event.stopPropagation();deleteFile('${f.id}')">🗑</button>
                </div>
            </div>`).join('');
    } catch (e) { console.error(e); }
}

async function loadFilesFolders() {
    try {
        const folders = await api('/api/folders?parent=files_default');
        let html = '<div class="folder-item active" data-folder="files_default" onclick="selectFilesFolder(\'files_default\', this)">📁 全部文件</div>';
        html += folders.map(f => `<div class="folder-item" data-folder="${f.id}" onclick="selectFilesFolder('${f.id}', this)">📁 ${escapeHtml(f.name)}</div>`).join('');
        $('#files-folder-tree').innerHTML = html;
    } catch (e) { console.error(e); }
}

function selectFilesFolder(folderId, el) {
    $$('#files-folder-tree .folder-item').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
    loadFiles();
}

async function uploadFiles() {
    const input = $('#file-upload-input');
    const files = input.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_id', document.querySelector('#files-folder-tree .folder-item.active')?.dataset.folder || 'files_default');
        try {
            const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.error) { showToast(`${file.name}: ${data.error}`, 'error'); }
            else { showToast(`${file.name} 上传成功`, 'success'); }
        } catch (e) {
            showToast(`${file.name} 上传失败: ${e.message}`, 'error');
        }
    }
    input.value = '';
    loadFiles();
}

function toggleFileSelect(fileId) {
    if (State.selectedFiles.has(fileId)) {
        State.selectedFiles.delete(fileId);
    } else {
        State.selectedFiles.add(fileId);
    }
    loadFiles();
}

function downloadFile(fileId) {
    window.open(`/api/files/${fileId}/download`, '_blank');
}

async function deleteFile(fileId) {
    if (!confirm('确定删除该文件？')) return;
    try {
        await api(`/api/files/${fileId}`, { method: 'DELETE' });
        State.selectedFiles.delete(fileId);
        showToast('文件已删除', 'success');
        loadFiles();
    } catch (e) { showToast(e.message, 'error'); }
}

// 文件预览
async function previewFile(fileId) {
    State.currentPreviewFile = fileId;
    try {
        const files = await api('/api/files?folder=files_default');
        const file = files.find(f => f.id === fileId);
        if (!file) {
            // 跨文件夹查找
            const allFiles = await api(`/api/files?folder=${document.querySelector('#files-folder-tree .folder-item.active')?.dataset.folder || 'files_default'}`);
            const found = allFiles.find(f => f.id === fileId);
            if (!found) { showToast('文件不存在', 'error'); return; }
            State.currentPreviewFile = found;
            showFilePreview(found);
            return;
        }
        State.currentPreviewFile = file;
        showFilePreview(file);
    } catch (e) { showToast(e.message, 'error'); }
}

function showFilePreview(file) {
    $('#preview-file-name').textContent = file.original_name;
    const body = $('#preview-file-body');
    State.currentPreviewFile = file;

    if (file.file_type === 'image') {
        body.innerHTML = `<div style="text-align:center"><img src="/api/files/${file.id}/download" style="max-width:100%;max-height:500px;border-radius:8px;"></div>`;
    } else if (file.ocr_text && file.ocr_text.trim()) {
        body.innerHTML = formatOCRText(file.ocr_text);
    } else if (file.file_type === 'text' || file.file_type === 'spreadsheet' || file.file_type === 'presentation' || file.file_type === 'word' || file.file_type === 'ebook') {
        // 文本类文件但没有 ocr_text：尝试从下载接口获取
        fetch(`/api/files/${file.id}/download`)
            .then(r => r.text())
            .then(t => {
                if (t && t.length > 0) {
                    body.innerHTML = `<div class="ocr-result-text" style="max-height:500px;overflow-y:auto;white-space:pre-wrap;font-size:14px;line-height:1.8;">${escapeHtml(t.substring(0, 50000))}</div>`;
                } else {
                    showFilePlaceholder(file);
                }
            })
            .catch(() => { showFilePlaceholder(file); });
        return; // 异步返回，先不设置默认内容
    } else {
        showFilePlaceholder(file);
    }

    $('#file-preview-modal').classList.add('show');
}

// 显示文件占位符（用于无法预览的文件）
function showFilePlaceholder(file) {
    const body = $('#preview-file-body');
    const typeLabels = {
        'pdf': 'PDF 文档', 'word': 'Word 文档', 'text': '文本文件',
        'spreadsheet': 'Excel 表格', 'presentation': 'PPT 演示文稿',
        'ebook': '电子书', 'audio': '音频', 'video': '视频',
        'image': '图片'
    };
    const label = typeLabels[file.file_type] || file.file_type || '文件';
    body.innerHTML = `
        <div style="text-align:center;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;">${getFileIcon(file.file_type)}</div>
            <p><strong>${escapeHtml(file.original_name)}</strong></p>
            <p style="color:var(--text-secondary)">大小: ${formatSize(file.file_size)} | 类型: ${label}</p>
            <p style="color:var(--text-muted);margin-top:10px;">可使用下方按钮提取文字或AI总结</p>
        </div>`;
    $('#file-preview-modal').classList.add('show');
}

function closeFilePreview() {
    $('#file-preview-modal').classList.remove('show');
}

async function extractTextFromFile() {
    if (!State.currentPreviewFile) return;
    showToast('正在提取/识别文字...', 'info');
    try {
        const result = await api(`/api/files/${State.currentPreviewFile.id}/ocr`, { method: 'POST' });
        if (result.text) {
            showFilePreview({ ...State.currentPreviewFile, ocr_text: result.text });
            showToast('文字提取成功', 'success');
            loadFiles();
        }
    } catch (e) { showToast(e.message, 'error'); }
}

async function aiSummarizeFile() {
    if (!State.currentPreviewFile) return;
    showToast('AI 正在分析文档...', 'info');
    try {
        const result = await api(`/api/files/${State.currentPreviewFile.id}/summarize`, { method: 'POST' });
        if (result.summary) {
            // 将 Markdown 转为 HTML 保存到笔记
            let htmlContent;
            if (typeof marked !== 'undefined') {
                try {
                    htmlContent = marked.parse(result.summary);
                } catch (e) {
                    htmlContent = result.summary.replace(/\n/g, '<br>');
                }
            } else {
                htmlContent = result.summary.replace(/\n/g, '<br>');
            }
            // 创建一条新笔记来保存总结
            const noteResult = await api('/api/notes', {
                method: 'POST',
                body: JSON.stringify({
                    title: `[AI总结] ${State.currentPreviewFile.original_name}`,
                    content: htmlContent,
                    tags: ['AI总结'],
                    folder_id: State.currentNotesFolder || 'notes_default'
                })
            });
            showToast('AI总结已生成并保存为笔记', 'success');
            closeFilePreview();
            navigateTo('notes');
            setTimeout(() => openNote(noteResult.id), 200);
        }
    } catch (e) { showToast(e.message, 'error'); }
}

function downloadCurrentFile() {
    if (State.currentPreviewFile) {
        window.open(`/api/files/${State.currentPreviewFile.id}/download`, '_blank');
    }
}

// ==================== 文件夹管理 ====================
async function createFolder(context) {
    const name = prompt('请输入文件夹名称：');
    if (!name) return;
    try {
        let parentId = 'root';
        if (!context) {
            parentId = 'notes_default';
        }
        await api('/api/folders', {
            method: 'POST',
            body: JSON.stringify({ name, parent_id: parentId, folder_type: 'normal' })
        });
        showToast('文件夹已创建', 'success');
        if (context === 'knowledge') loadKnowledge();
    } catch (e) { showToast(e.message, 'error'); }
}

// ==================== 翻译模块 ====================
let transTab = 'text';
function switchTransTab(tab, el) {
    transTab = tab;
    $$('.trans-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    $$('.trans-tab-content').forEach(c => c.classList.remove('active'));
    $(`#trans-tab-${tab}`).classList.add('active');
    if (tab === 'history') loadTranslations();
}

let translateDebounce = null;
function autoTranslate() {
    if (translateDebounce) clearTimeout(translateDebounce);
    translateDebounce = setTimeout(translateText, 1000);
    $('#trans-char-count').textContent = $('#trans-input').value.length + ' 字符';
}

async function translateText() {
    const text = $('#trans-input').value.trim();
    if (!text) return;
    const sourceLang = $('#trans-source-lang').value;
    const targetLang = $('#trans-target-lang').value;
    const context = $('#trans-context').value;
    $('#trans-output').innerHTML = '<div class="loading"></div>';
    try {
        const result = await api('/api/translate', {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang, context })
        });
        if (result.translation) {
            $('#trans-output').innerHTML = result.translation;
        } else {
            $('#trans-output').innerHTML = `<p class="empty-state">${result.error || '翻译失败'}</p>`;
        }
    } catch (e) {
        $('#trans-output').innerHTML = `<p class="empty-state">错误: ${escapeHtml(e.message)}</p>`;
    }
}

function swapLang() {
    const src = $('#trans-source-lang');
    const tgt = $('#trans-target-lang');
    if (src.value === 'auto') return;
    const tmp = src.value;
    src.value = tgt.value;
    tgt.value = tmp;
}

function copyTranslation() {
    const text = $('#trans-output').innerText || $('#trans-output').textContent;
    if (!text || text.includes('翻译结果')) return;
    navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success'));
}

async function addTranslationToNote() {
    const text = $('#trans-output').innerText || $('#trans-output').textContent;
    if (!text || text.includes('翻译结果')) return;
    try {
        const result = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
                title: '翻译记录 - ' + new Date().toLocaleString(),
                content: `<p><strong>原文:</strong></p><p>${$('#trans-input').value}</p><hr><p><strong>译文:</strong></p><p>${text}</p>`,
                tags: ['翻译'],
                folder_id: 'notes_default'  // 翻译记录统一存到笔记根目录，不跟随当前选中的子文件夹
            })
        });
        showToast('已存入笔记', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

async function loadTranslations() {
    try {
        const translations = await api('/api/translations');
        if (translations.length === 0) {
            $('#trans-history-list').innerHTML = '<p class="empty-state">暂无翻译记录</p>';
            return;
        }
        $('#trans-history-list').innerHTML = translations.map(t => `
            <div class="trans-history-item" onclick="loadTranslationToInput('${t.id}')">
                <div class="trans-history-source">原文: ${escapeHtml(t.source_text.substring(0, 100))}${t.source_text.length > 100 ? '...' : ''}</div>
                <div class="trans-history-target">译文: ${escapeHtml(t.translated_text.substring(0, 100))}${t.translated_text.length > 100 ? '...' : ''}</div>
                <div class="trans-history-meta">
                    <span>${t.source_lang} → ${t.target_lang}</span>
                    <span>${t.context_type}</span>
                    <span>${formatDate(t.created_at)}</span>
                </div>
            </div>`).join('');
    } catch (e) { console.error(e); }
}

async function loadTranslationToInput(tid) {
    try {
        const translations = await api('/api/translations');
        const t = translations.find(tr => tr.id === tid);
        if (t) {
            $('#trans-input').value = t.source_text;
            $('#trans-output').innerHTML = t.translated_text;
            switchTransTab('text', document.querySelector('.trans-tab'));
        }
    } catch (e) { showToast(e.message, 'error'); }
}

async function clearTranslations() {
    if (!confirm('确定清空所有翻译记录？')) return;
    try {
        const translations = await api('/api/translations');
        for (const t of translations) {
            await api(`/api/translations/${t.id}`, { method: 'DELETE' });
        }
        showToast('翻译记录已清空', 'success');
        loadTranslations();
    } catch (e) { showToast(e.message, 'error'); }
}

async function exportTranslations(format) {
    try {
        const translations = await api('/api/translations');
        if (translations.length === 0) { showToast('没有可导出的记录', 'info'); return; }
        const ids = translations.map(t => t.id);
        const res = await fetch('/api/translations/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, format })
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `翻译导出.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('导出成功', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

// 截图翻译已移除（功能合并到OCR页面）

// ==================== AI 智能体模块 ====================
async function loadAIChats() {
    try {
        const chats = await api('/api/ai/chats');
        if (chats.length === 0) {
            $('#ai-chats-list').innerHTML = '<p class="empty-state">暂无对话记录</p>';
            return;
        }
        $('#ai-chats-list').innerHTML = chats.map(c => `
            <div class="ai-chat-item ${c.id === State.currentChatId ? 'active' : ''}" onclick="openAIChat('${c.id}')">
                <span class="ai-chat-title">💬 ${escapeHtml(c.title)}</span>
                <span class="ai-chat-delete" onclick="event.stopPropagation();deleteAIChat('${c.id}')">🗑</span>
            </div>`).join('');
    } catch (e) { console.error(e); }
}

async function createNewChat() {
    State.currentChatId = null;
    $('#ai-messages').innerHTML = `
        <div class="ai-welcome">
            <h2>🤖 DocMind AI 智能体</h2>
            <p>选择一种模式开始交互：</p>
            <div class="quick-actions">
                <button class="quick-action-btn" onclick="setAiMode('summarize')">📋 文档总结分析</button>
                <button class="quick-action-btn" onclick="setAiMode('translate')">🌐 专业翻译</button>
                <button class="quick-action-btn" onclick="setAiMode('quiz')">📝 生成练习题</button>
                <button class="quick-action-btn" onclick="setAiMode('analyze')">🔍 深度内容分析</button>
            </div>
            <p class="hint-text">可处理长文档、PDF内容、翻译、出题等多种任务</p>
        </div>`;
    loadAIChats();
}

async function openAIChat(chatId) {
    try {
        const chat = await api(`/api/ai/chats/${chatId}`);
        State.currentChatId = chatId;
        const messages = chat.messages || [];
        let html = '';
        messages.forEach((msg, i) => {
            html += renderAiMessage(msg.role, msg.content);
        });
        $('#ai-messages').innerHTML = html || '<div class="ai-welcome"><p>开始新的对话...</p></div>';
        $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight;
        loadAIChats();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAIChat(chatId) {
    if (!confirm('确定删除这个对话？')) return;
    try {
        await api(`/api/ai/chats/${chatId}`, { method: 'DELETE' });
        if (State.currentChatId === chatId) {
            State.currentChatId = null;
            $('#ai-messages').innerHTML = '';
        }
        showToast('对话已删除', 'success');
        loadAIChats();
    } catch (e) { showToast(e.message, 'error'); }
}

function setAiMode(mode) {
    State.aiMode = mode;
    $('#ai-mode').value = mode;
    showToast(`已切换到${$('#ai-mode').selectedOptions[0].text}模式`, 'info');
}

function renderAiMessage(role, content) {
    const avatar = role === 'user' ? '👤' : '🤖';
    let renderedContent;
    if (role === 'assistant' && typeof marked !== 'undefined') {
        // AI 回复使用 Markdown 渲染（含 KaTeX 数学公式）
        try {
            renderedContent = marked.parse(content);
        } catch (e) {
            renderedContent = escapeHtml(content).replace(/\n/g, '<br>');
        }
    } else {
        renderedContent = escapeHtml(content).replace(/\n/g, '<br>');
    }
    return `<div class="ai-message ${role}">
        <div class="ai-avatar">${avatar}</div>
        <div class="ai-bubble">${renderedContent}</div>
    </div>`;
}

async function sendAiMessage() {
    const input = $('#ai-input');
    const message = input.value.trim();
    if (!message) return;

    // 添加用户消息
    let messagesHtml = $('#ai-messages').innerHTML;
    if (messagesHtml.includes('ai-welcome')) messagesHtml = '';
    messagesHtml += renderAiMessage('user', message);
    messagesHtml += renderAiMessage('assistant', '<div class="loading"></div>');
    $('#ai-messages').innerHTML = messagesHtml;
    $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight;
    input.value = '';

    $('#ai-send-text').style.display = 'none';
    $('#ai-send-loading').style.display = 'inline';

    try {
        const mode = State.aiMode || $('#ai-mode').value;
        const result = await api('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({
                chat_id: State.currentChatId,
                message,
                mode
            })
        });
        State.currentChatId = result.chat_id;

        // 替换loading，使用 Markdown 渲染
        const bubbles = $$('.ai-bubble', $('#ai-messages'));
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble) {
            const reply = result.reply || '无回复';
            if (typeof marked !== 'undefined') {
                try {
                    lastBubble.innerHTML = marked.parse(reply);
                } catch (e) {
                    lastBubble.innerHTML = escapeHtml(reply).replace(/\n/g, '<br>');
                }
            } else {
                lastBubble.innerHTML = escapeHtml(reply).replace(/\n/g, '<br>');
            }
        }
        $('#ai-messages').scrollTop = $('#ai-messages').scrollHeight;
        loadAIChats();
    } catch (e) {
        const bubbles = $$('.ai-bubble', $('#ai-messages'));
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble) {
            lastBubble.innerHTML = `<span style="color:var(--danger)">错误: ${escapeHtml(e.message)}</span>`;
        }
    } finally {
        $('#ai-send-text').style.display = 'inline';
        $('#ai-send-loading').style.display = 'none';
    }
}

async function attachFileToAI() {
    const input = $('#ai-file-input');
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder_id', 'files_default');
    try {
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('文件已上传，正在提取内容...', 'info');

        const ocrResult = await api(`/api/files/${data.id}/ocr`, { method: 'POST' });
        if (ocrResult.text) {
            $('#ai-input').value = `请分析以下文档内容：\n\n${ocrResult.text.substring(0, 5000)}`;
            showToast('文档内容已加载到输入框', 'success');
        }
    } catch (e) { showToast(e.message, 'error'); }
    input.value = '';
}

// ==================== OCR 模块 ====================
const ocrDropZone = document.getElementById('ocr-drop-zone');
if (ocrDropZone) {
    ocrDropZone.addEventListener('dragover', (e) => { e.preventDefault(); ocrDropZone.style.borderColor = 'var(--primary)'; });
    ocrDropZone.addEventListener('dragleave', () => { ocrDropZone.style.borderColor = 'var(--border)'; });
    ocrDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        ocrDropZone.style.borderColor = 'var(--border)';
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) processOCRImages(files);
    });
    ocrDropZone.addEventListener('click', () => $('#ocr-upload-input').click());

    // 粘贴图片支持：在 OCR 页面区域粘贴剪贴板中的图片
    window.addEventListener('paste', (e) => {
        // 仅当 OCR 页面可见时才处理
        const ocrPage = document.getElementById('page-ocr');
        if (!ocrPage || ocrPage.style.display === 'none') return;
        // 如果焦点在输入框内，不拦截粘贴
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable)) return;

        const items = e.clipboardData.items;
        const imageFiles = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                // 生成文件名
                const ext = item.type.split('/')[1] || 'png';
                const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: item.type });
                imageFiles.push(file);
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault();
            processOCRImages(imageFiles);
            showToast(`已粘贴 ${imageFiles.length} 张图片`, 'success');
        }
    });
}

function uploadOCRImages() {
    const files = Array.from($('#ocr-upload-input').files);
    processOCRImages(files);
    $('#ocr-upload-input').value = '';
}

async function processOCRImages(files) {
    $('#ocr-result-list').innerHTML = '';
    for (const file of files) {
        const resultItem = document.createElement('div');
        resultItem.className = 'ocr-result-item';
        $('#ocr-result-list').appendChild(resultItem);

        // 先创建图片预览区域和文字区域的容器结构
        const imgPreviewId = 'ocr-img-' + Math.random().toString(36).slice(2);
        resultItem.innerHTML = `
            <div class="ocr-result-header">
                <strong>📷 ${escapeHtml(file.name)}</strong>
                <span class="loading"></span>
            </div>
            <div class="ocr-result-body">
                <div class="ocr-result-img-wrap" id="${imgPreviewId}">
                    <div class="ocr-img-placeholder">加载预览...</div>
                </div>
                <div class="ocr-result-content">
                    <div class="ocr-result-status">正在识别...</div>
                </div>
            </div>
        `;

        const imgWrap = resultItem.querySelector('#' + imgPreviewId);
        const contentArea = resultItem.querySelector('.ocr-result-content');

        // 读取并显示图片预览
        const reader = new FileReader();
        reader.onload = async (e) => {
            imgWrap.innerHTML = `<img class="ocr-result-img" src="${e.target.result}" alt="${escapeHtml(file.name)}">`;
        };
        reader.readAsDataURL(file);

        // 上传并OCR
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_id', 'files_default');
        try {
            const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
            const upload = await res.json();
            if (upload.error) {
                contentArea.innerHTML = `<p style="color:var(--danger)">上传失败: ${upload.error}</p>`;
                return;
            }
            const ocrResult = await api(`/api/files/${upload.id}/ocr`, { method: 'POST' });
            if (ocrResult.text) {
                contentArea.innerHTML = `
                    ${formatOCRText(ocrResult.text)}
                    <div class="ocr-result-actions" style="margin-top:8px">
                        <button class="btn btn-xs btn-primary" onclick="copyOCRText(this)">复制</button>
                        <button class="btn btn-xs btn-outline" onclick="saveOCRToNote(this)">存入笔记</button>
                        <button class="btn btn-xs btn-outline" onclick="translateOCRText(this)">翻译</button>
                    </div>`;
            } else {
                contentArea.innerHTML = `<p style="color:var(--danger)">识别失败: ${ocrResult.error || '未知错误'}</p>`;
            }
        } catch (e) {
            contentArea.innerHTML = `<p style="color:var(--danger)">错误: ${escapeHtml(e.message)}</p>`;
        }
        // 移除loading
        const loading = resultItem.querySelector('.loading');
        if (loading) loading.remove();
    }
}

function getOCRTextContent(btn) {
    const item = btn.closest('.ocr-result-item');
    // 优先取代码块 pre code，其次裸 pre，最后 ocr-result-text
    const codeEl = item.querySelector('pre code');
    if (codeEl) return codeEl.textContent;
    const preEl = item.querySelector('pre');
    if (preEl) return preEl.textContent;
    const textEl = item.querySelector('.ocr-result-text');
    if (textEl) return textEl.textContent;
    return '';
}

function copyOCRText(btn) {
    const text = getOCRTextContent(btn);
    if (!text) return showToast('无内容可复制', 'warning');
    navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success'));
}

async function saveOCRToNote(btn) {
    const text = getOCRTextContent(btn);
    if (!text) return showToast('无内容', 'warning');
    const htmlContent = text.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('');
    const folderId = State.currentNotesFolder || 'notes_default';
    try {
        const result = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title: 'OCR识别结果', content: htmlContent, tags: ['OCR'], folder_id: folderId })
        });
        showToast('已存入笔记', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

async function translateOCRText(btn) {
    const resultItem = btn.closest('.ocr-result-item');
    const text = getOCRTextContent(btn);
    if (!text) return showToast('无内容可翻译', 'warning');
    
    // 检查是否已经存在翻译结果区域
    let transArea = resultItem.querySelector('.ocr-translation-result');
    if (transArea) {
        transArea.remove();
    }
    
    // 显示翻译loading
    btn.disabled = true;
    btn.textContent = '翻译中...';
    transArea = document.createElement('div');
    transArea.className = 'ocr-translation-result';
    transArea.style.cssText = 'margin-top:10px;padding:10px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid var(--primary);font-size:14px;line-height:1.7;';
    transArea.innerHTML = '<span style="color:var(--text-muted)">正在翻译...</span>';
    resultItem.appendChild(transArea);
    
    try {
        // 自动判断语言方向
        const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
        let sourceLang, targetLang;
        if (chineseCount > englishCount) { sourceLang = 'zh'; targetLang = 'en'; }
        else { sourceLang = 'auto'; targetLang = 'zh'; }

        const result = await api('/api/translate', {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang, context: 'screen_ocr' })
        });
        
        if (result.translation) {
            transArea.innerHTML = `<div style="font-weight:600;margin-bottom:6px;color:var(--primary);">📖 翻译结果</div><div style="white-space:pre-wrap;">${escapeHtml(result.translation)}</div>`;
        } else {
            transArea.innerHTML = `<span style="color:var(--danger)">翻译失败: ${result.error || '未知错误'}</span>`;
        }
    } catch (e) {
        transArea.innerHTML = `<span style="color:var(--danger)">翻译出错: ${e.message}</span>`;
    }
    
    btn.disabled = false;
    btn.textContent = '翻译';
}

async function batchOCR() {
    const files = await api('/api/files?type=image');
    if (files.length === 0) { showToast('没有可识别的图片文件', 'info'); return; }
    showToast(`开始批量识别 ${files.length} 个文件...`, 'info');
    for (const file of files) {
        try {
            await api(`/api/files/${file.id}/ocr`, { method: 'POST' });
        } catch (e) { console.error(e); }
    }
    showToast('批量识别完成', 'success');
}

// ==================== 多文件对比分析模块 ====================
let batchFiles = [];  // {id, name, type}
let batchAction = 'compare';
let _lastComparisonResult = null;  // 存储最近一次对比分析的完整结果，避免通过onclick传参截断内容
let _lastBatchSummaries = [];      // 存储批量总结结果

function initBatchPage() {
    // 拖拽上传
    const dropZone = document.getElementById('batch-drop-zone');
    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            handleBatchUpload(e.dataTransfer.files);
        });
    }
}

async function loadBatchFiles() {
    initBatchPage();
}

function switchBatchTab(action, el) {
    batchAction = action;
    $$('.batch-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    
    const btnLabels = {
        'compare': '🚀 开始对比分析',
        'summarize': '📋 开始批量总结',
        'extract': '📝 开始批量提取文字'
    };
    $('#batch-execute-btn').textContent = btnLabels[action] || '开始分析';
}

async function handleBatchUpload(files) {
    if (!files || files.length === 0) return;
    
    const inputEl = document.getElementById('batch-upload-input');
    for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_id', document.querySelector('#files-folder-tree .folder-item.active')?.dataset.folder || 'files_default');
        
        try {
            showToast(`正在上传: ${file.name}...`, 'info');
            const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.error) {
                showToast(`${file.name}: ${data.error}`, 'error');
            } else {
                // 避免重复添加
                if (!batchFiles.find(f => f.id === data.id)) {
                    batchFiles.push({ id: data.id, name: file.original_name || file.name, type: data.file_type || 'unknown' });
                    showToast(`${file.name} 上传成功`, 'success');
                }
            }
        } catch (e) {
            showToast(`${file.name}: ${e.message}`, 'error');
        }
    }
    renderBatchFileList();
    if (inputEl) inputEl.value = '';
}

async function addFilesFromFileManager() {
    try {
        const files = await api('/api/files?folder=files_default');
        if (files.length === 0) { showToast('没有可用文件', 'info'); return; }
        
        let html = '<div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto;">';
        files.forEach(f => {
            const checked = batchFiles.some(bf => bf.id === f.id) ? 'checked' : '';
            html += `<label style="display:flex;align-items:center;gap:6px;padding:6px;border-radius:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" value="${f.id}" class="batch-add-check" ${checked}>
                <span>${getFileIcon(f.file_type)}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.original_name)}</span>
            </label>`;
        });
        html += '</div><div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-sm btn-primary" onclick="confirmAddFromManager()">确定</button><button class="btn btn-sm btn-outline" onclick="closePopup()">取消</button></div>';
        
        showPopup('选择文件', html, true);
    } catch (e) { showToast(e.message, 'error'); }
}

function confirmAddFromManager() {
    $$('.batch-add-check:checked').forEach(cb => {
        const fid = cb.value;
        const label = cb.closest('label');
        const nameSpan = label.querySelector('span:nth-child(3)');
        const name = nameSpan ? nameSpan.textContent.trim().substring(2).trim() : fid;
        if (!batchFiles.find(f => f.id === fid)) {
            batchFiles.push({ id: fid, name, type: 'unknown' });
        }
    });
    closePopup();
    renderBatchFileList();
    showToast(`已添加 ${batchFiles.length} 个文件`, 'success');
}

// 简易弹窗
let _popupModal = null;
function showPopup(title, content, large) {
    let modal = document.getElementById('custom-popup');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-popup';
        modal.className = 'modal show';
        modal.innerHTML = `<div class="modal-overlay" onclick="closePopup()"></div><div class="modal-content ${large?'large':''}" style="max-width:${large?'700px':'500px'}"><div class="modal-header"><h3 id="popup-title"></h3><button class="modal-close" onclick="closePopup()">✕</button></div><div class="modal-body" id="popup-body"></div></div>`;
        document.body.appendChild(modal);
    }
    modal.classList.add('show');
    modal.querySelector('#popup-title').textContent = title;
    modal.querySelector('#popup-body').innerHTML = content;
}
function closePopup() {
    const m = document.getElementById('custom-popup');
    if (m) m.classList.remove('show');
}

function clearBatchFiles() {
    batchFiles = [];
    renderBatchFileList();
}

function removeBatchFile(id) {
    batchFiles = batchFiles.filter(f => f.id !== id);
    renderBatchFileList();
}

function renderBatchFileList() {
    const list = document.getElementById('batch-file-list');
    const count = document.getElementById('batch-file-count');
    count.textContent = batchFiles.length;
    
    if (batchFiles.length === 0) {
        list.innerHTML = '<p class="empty-state">请上传文件或从下方选择已有文件</p>';
        return;
    }
    
    list.innerHTML = batchFiles.map(f => `
        <div class="batch-file-item">
            <span class="file-icon">${getFileIcon(f.type)}</span>
            <span class="file-name">${escapeHtml(f.name)}</span>
            <span class="file-remove" onclick="removeBatchFile('${f.id}')">✕</span>
        </div>`).join('');
}

async function executeBatchAnalysis() {
    if (batchFiles.length < 2 && batchAction === 'compare') {
        showToast('对比分析需要至少2个文件', 'warning'); return;
    }
    if (batchFiles.length < 1) {
        showToast('请先添加文件', 'warning'); return;
    }

    const actionNames = { compare: '对比分析', summarize: '批量总结', extract: '提取文字' };
    showToast(`正在${actionNames[batchAction]} ${batchFiles.length} 个文件...`, 'info');
    
    const resultsArea = document.getElementById('batch-results');
    resultsArea.innerHTML = '<div class="loading"></div>';

    try {
        if (batchAction === 'extract') {
            // 批量提取文字
            const result = await api('/api/batch/process', {
                method: 'POST',
                body: JSON.stringify({ action: 'extract_text', file_ids: batchFiles.map(f => f.id) })
            });
            let html = '';
            result.results.forEach(r => {
                const content = r.text_preview ? escapeHtml(r.text_preview.substring(0, 2000)) : (r.error || '');
                html += `<div class="batch-result-item">
                    <div class="batch-result-name">📄 ${escapeHtml(r.name)}</div>
                    <div class="batch-result-content">${content}</div>
                    ${r.text_preview ? `<button class="btn btn-xs btn-primary" style="margin-top:6px" onclick="copyText(this)">复制全文</button>` : ''}
                </div>`;
            });
            resultsArea.innerHTML = html || '<p class="empty-state">提取完成</p>';
            showToast('文字提取完成', 'success');

        } else if (batchAction === 'summarize') {
            // 批量总结（每个文件单独总结）
            const result = await api('/api/batch/process', {
                method: 'POST',
                body: JSON.stringify({ action: 'summarize', file_ids: batchFiles.map(f => f.id) })
            });
            _lastBatchSummaries = result.results;
            let html = '';
            result.results.forEach((r, idx) => {
                if (r.summary) {
                    const summaryHtml = typeof marked !== 'undefined' 
                        ? marked.parse(r.summary) 
                        : escapeHtml(r.summary).replace(/\n/g, '<br>');
                    html += `<div class="batch-result-item">
                        <div class="batch-result-name">📝 ${escapeHtml(r.name)}</div>
                        <div class="batch-result-content" data-summary-idx="${idx}">${summaryHtml}</div>
                        <button class="btn btn-xs btn-primary" style="margin-top:6px" onclick="saveBatchResultToNote(${idx})">存入笔记</button>
                    </div>`;
                } else if (r.error) {
                    html += `<div class="batch-result-item">
                        <div class="batch-result-name">${escapeHtml(r.name)}</div>
                        <div class="batch-result-error">${r.error}</div>
                    </div>`;
                }
            });
            resultsArea.innerHTML = html || '<p class="empty-state">总结完成</p>';
            showToast('批量总结完成', 'success');

        } else if (batchAction === 'compare') {
            // 跨文件对比分析 - 这是新功能
            const result = await api('/api/batch/compare', {
                method: 'POST',
                body: JSON.stringify({ file_ids: batchFiles.map(f => f.id) })
            });

            if (result.error) {
                resultsArea.innerHTML = `<p class="batch-result-error">${result.error}</p>`;
                return;
            }

            // 保存完整结果到全局变量
            _lastComparisonResult = result.comparison;

            const comparisonHtml = typeof marked !== 'undefined' 
                ? marked.parse(result.comparison) 
                : escapeHtml(result.comparison).replace(/\n/g, '<br>');

            resultsArea.innerHTML = `
                <div class="batch-result-item" style="border-left:4px solid var(--primary);">
                    <div class="batch-result-name">📊 跨文件对比分析报告</div>
                    <div class="batch-result-content" id="batch-comparison-result" style="max-height:none;">${comparisonHtml}</div>
                    <button class="btn btn-xs btn-primary" style="margin-top:10px" onclick="saveComparisonToNote()">存入笔记</button>
                </div>`;
            showToast('对比分析完成', 'success');
        }
    } catch (e) {
        resultsArea.innerHTML = `<p style="color:var(--danger)">处理失败: ${escapeHtml(e.message)}</p>`;
        showToast(e.message, 'error');
    }
}

function copyText(btn) {
    const text = btn.closest('.batch-result-item').querySelector('.batch-result-content').innerText;
    navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success'));
}

async function saveComparisonToNote(content) {
    try {
        // 优先使用传入的原始Markdown，其次使用全局变量
        let mdContent = content || _lastComparisonResult;

        // 如果都没有，从DOM提取纯文本
        if (!mdContent || mdContent.trim().length < 20) {
            const resultEl = document.getElementById('batch-comparison-result');
            if (resultEl && resultEl.innerText.trim().length > 20) {
                mdContent = resultEl.innerText;
            } else {
                showToast('没有可保存的内容', 'warning');
                return;
            }
        }

        console.log('[saveComparisonToNote] 原始Markdown长度:', mdContent.length);

        // 存入笔记时保存原始Markdown，不转HTML
        // 打开笔记时用marked.js实时渲染，彻底绕过Quill截断
        const result = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
                title: `[AI分析报告] ${new Date().toLocaleDateString()}`,
                content: mdContent,
                tags: ['对比分析', 'AI'],
                folder_id: 'notes_default'
            })
        });

        if (result.id) {
            showToast('已存入笔记', 'success');
        } else {
            showToast('存入笔记返回异常', 'warning');
        }
    } catch (e) { 
        showToast('存入失败: ' + e.message, 'error'); 
    }
}

async function saveBatchResultToNote(idx) {
    try {
        const item = _lastBatchSummaries[idx];
        if (!item || !item.summary) {
            showToast('没有可保存的内容', 'warning');
            return;
        }

        let htmlContent;
        if (typeof marked !== 'undefined') {
            htmlContent = marked.parse(item.summary);
        } else {
            htmlContent = item.summary.split('\n').map(l => `<p>${escapeHtml(l)||'&nbsp;'}</p>`).join('');
        }

        await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
                title: `[总结] ${item.name}`,
                content: htmlContent,
                tags: ['批量总结'],
                folder_id: 'notes_default'
            })
        });
        showToast('已存入笔记（完整内容）', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

// ==================== 划词翻译 ====================
let popupTimer = null;
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || text.length < 2 || text.length > 500) {
        return;
    }
    // 检查选中文字是否包含中文，自动判断是否需要翻译
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    if (!hasChinese) return; // 只对中文做划词翻译

    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => {
        const popup = $('#popup-trans');
        popup.style.top = (e.clientY + 10) + 'px';
        popup.style.left = Math.min(e.clientX, window.innerWidth - 420) + 'px';
        popup.classList.add('show');
        $('#popup-trans-body').innerHTML = '<div class="loading"></div>';

        api('/api/translate', {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: 'zh', target_lang: 'en' })
        }).then(result => {
            let html = `<p><strong>原文:</strong> ${escapeHtml(text)}</p>`;
            html += `<p style="margin-top:8px"><strong>翻译:</strong> ${result.translation || '翻译失败'}</p>`;
            $('#popup-trans-body').innerHTML = html;
        }).catch(e => {
            $('#popup-trans-body').innerHTML = `<p style="color:var(--danger)">${escapeHtml(e.message)}</p>`;
        });
    }, 500);
});

function closePopupTrans() {
    $('#popup-trans').classList.remove('show');
}

// 点击其他地方关闭划词翻译
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#popup-trans')) {
        closePopupTrans();
    }
});

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (State.currentPage === 'notes') saveCurrentNote();
        else showToast('当前页面不支持快捷键保存', 'info');
    }
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        $('#global-search').focus();
    }
});

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    navigateTo('dashboard');
});
