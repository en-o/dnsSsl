// ==================== 全局状态管理 ====================
const AppState = {
    currentStep: 1,
    totalSteps: 5,
    domain: '',
    verificationMethod: 'webserver',
    certFormat: 'nginx',
    acmeProvider: 'letsencrypt',
    // 验证数据（在整个流程中保持不变）
    challengeFilename: '',
    challengeContent: '',
    dnsValue: '',
    // SSL证书信息
    sslCertInfo: null,
    certDaysRemaining: null
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // 初始化步骤指示器
    updateStepIndicator();

    // 绑定验证方式切换事件
    bindVerificationMethodChange();

    // 绑定证书格式切换事件
    bindCertFormatChange();

    // 初始化验证清单
    bindVerificationChecklist();

    // 显示默认验证方式
    showVerificationMethod('webserver');

    // 初始化域名历史记录功能
    initializeDomainHistory();

    // 绑定域名输入框实时检测
    bindDomainInputChange();
}

// ==================== 步骤导航 ====================
function nextStep(currentStep) {
    // 验证当前步骤
    if (!validateStep(currentStep)) {
        return;
    }

    // 步骤1特殊处理：检查证书有效期
    if (currentStep === 1 && AppState.certDaysRemaining !== null && AppState.certDaysRemaining > 10) {
        if (!confirm(`当前证书还有 ${AppState.certDaysRemaining} 天到期，距离过期还早。\n\n是否确定要重新申请证书？`)) {
            return;
        }
    }

    // 隐藏当前步骤
    document.getElementById(`step-${currentStep}`).style.display = 'none';

    // 显示下一步
    const nextStepNum = currentStep + 1;
    document.getElementById(`step-${nextStepNum}`).style.display = 'block';

    // 更新状态
    AppState.currentStep = nextStepNum;
    updateStepIndicator();

    // 执行步骤特定的操作
    onStepEnter(nextStepNum);

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep(currentStep) {
    // 隐藏当前步骤
    document.getElementById(`step-${currentStep}`).style.display = 'none';

    // 显示上一步
    const prevStepNum = currentStep - 1;
    document.getElementById(`step-${prevStepNum}`).style.display = 'block';

    // 更新状态
    AppState.currentStep = prevStepNum;
    updateStepIndicator();

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restartWizard() {
    // 重置状态
    AppState.currentStep = 1;
    AppState.domain = '';
    AppState.verificationMethod = 'webserver';
    AppState.certFormat = 'nginx';
    AppState.challengeFilename = '';
    AppState.challengeContent = '';
    AppState.dnsValue = '';
    AppState.sslCertInfo = null;
    AppState.certDaysRemaining = null;

    // 重置表单
    document.getElementById('domain-input').value = '';
    document.getElementById('acme-provider').selectedIndex = 0;
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

    // 隐藏SSL证书信息
    const certInfoBox = document.getElementById('ssl-cert-info');
    if (certInfoBox) {
        certInfoBox.style.display = 'none';
    }

    // 隐藏所有步骤
    for (let i = 1; i <= AppState.totalSteps; i++) {
        document.getElementById(`step-${i}`).style.display = 'none';
    }

    // 显示第一步
    document.getElementById('step-1').style.display = 'block';
    updateStepIndicator();

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== 步骤验证 ====================
function validateStep(step) {
    switch(step) {
        case 1:
            return validateDomain();
        case 2:
            return validateVerificationMethod();
        case 3:
            return validateChecklist();
        case 4:
            return validateCertFormat();
        default:
            return true;
    }
}

function validateDomain() {
    const domainInput = document.getElementById('domain-input');
    const domain = domainInput.value.trim();
    const errorElement = document.getElementById('domain-error');

    // 域名正则表达式（支持通配符）
    const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

    if (!domain) {
        showError(errorElement, '请输入域名');
        return false;
    }

    if (!domainRegex.test(domain)) {
        showError(errorElement, '域名格式不正确，请输入有效的域名（如 example.com 或 *.example.com）');
        return false;
    }

    // 保存域名
    AppState.domain = domain;
    AppState.acmeProvider = document.getElementById('acme-provider').value;
    hideError(errorElement);

    // 保存到历史记录
    saveDomainToHistory(domain);

    return true;
}

function validateVerificationMethod() {
    const selectedMethod = document.querySelector('input[name="verification-method"]:checked');
    if (!selectedMethod) {
        alert('请选择验证方式');
        return false;
    }
    AppState.verificationMethod = selectedMethod.value;
    return true;
}

function validateChecklist() {
    // 步骤3已改为自动验证，总是返回true
    return true;
}

function validateCertFormat() {
    const selectedFormat = document.querySelector('input[name="cert-format"]:checked');
    if (!selectedFormat) {
        alert('请选择证书格式');
        return false;
    }
    AppState.certFormat = selectedFormat.value;
    return true;
}

// ==================== 步骤指示器更新 ====================
function updateStepIndicator() {
    const steps = document.querySelectorAll('.step');

    steps.forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');

        if (stepNum < AppState.currentStep) {
            step.classList.add('completed');
        } else if (stepNum === AppState.currentStep) {
            step.classList.add('active');
        }
    });
}

// ==================== 步骤进入时的操作 ====================
function onStepEnter(step) {
    switch(step) {
        case 1:
            // 回到步骤1时，恢复SSL证书信息显示
            restoreSSLCertInfo();
            break;
        case 2:
            updateDomainDisplay();
            showVerificationMethod(AppState.verificationMethod);
            break;
        case 3:
            // 进入步骤3时，准备验证界面
            prepareVerificationUI();
            break;
        case 4:
            // 可以在这里添加默认格式选择逻辑
            break;
        case 5:
            displayInstallationGuide();
            break;
    }
}

// 恢复SSL证书信息显示
function restoreSSLCertInfo() {
    const certInfoBox = document.getElementById('ssl-cert-info');
    const domainInput = document.getElementById('domain-input');

    // 如果有证书信息且域名输入框不为空，恢复显示
    if (AppState.sslCertInfo && domainInput && domainInput.value.trim()) {
        const certIssuerEl = document.getElementById('cert-issuer');
        const certExpiryEl = document.getElementById('cert-expiry');
        const certDaysEl = document.getElementById('cert-days');

        certIssuerEl.textContent = AppState.sslCertInfo.issuer;
        certExpiryEl.textContent = AppState.sslCertInfo.expiryDate;
        certDaysEl.textContent = `${AppState.sslCertInfo.daysRemaining} 天`;

        // 根据剩余天数设置颜色
        if (AppState.sslCertInfo.daysRemaining < 7) {
            certDaysEl.className = 'cert-value cert-days cert-danger';
        } else if (AppState.sslCertInfo.daysRemaining < 30) {
            certDaysEl.className = 'cert-value cert-days cert-warning';
        } else {
            certDaysEl.className = 'cert-value cert-days cert-success';
        }

        certInfoBox.style.display = 'block';
    }
}

// ==================== 验证方式切换 ====================
function bindVerificationMethodChange() {
    const radioButtons = document.querySelectorAll('input[name="verification-method"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            showVerificationMethod(this.value);
        });
    });
}

function showVerificationMethod(method) {
    const detailsContainer = document.getElementById('verification-details');

    if (method === 'webserver') {
        const template = document.getElementById('webserver-template');
        detailsContainer.innerHTML = template.innerHTML;
    } else if (method === 'dns') {
        const template = document.getElementById('dns-template');
        detailsContainer.innerHTML = template.innerHTML;
    }

    // 同步单选按钮的选中状态
    const radioButtons = document.querySelectorAll('input[name="verification-method"]');
    radioButtons.forEach(radio => {
        radio.checked = (radio.value === method);
    });

    // 更新域名占位符
    updateDomainDisplay();

    // 生成模拟验证数据
    generateMockVerificationData(method);
}

function generateMockVerificationData(method) {
    const domain = AppState.domain || 'example.com';

    if (method === 'webserver') {
        // 基于域名生成确定性的验证数据
        AppState.challengeFilename = generateDeterministicString(domain + '-filename', 40);
        AppState.challengeContent = generateDeterministicString(domain + '-content', 87);

        const filenameEl = document.getElementById('challenge-filename');
        const contentEl = document.getElementById('challenge-content');
        const quickCommandEl = document.getElementById('quick-command');

        if (filenameEl) filenameEl.textContent = AppState.challengeFilename;
        if (contentEl) contentEl.textContent = AppState.challengeContent;

        // 更新快捷命令
        if (quickCommandEl) {
            quickCommandEl.textContent = `echo "${AppState.challengeContent}" > /var/www/html/.well-known/acme-challenge/${AppState.challengeFilename}`;
        }
    } else if (method === 'dns') {
        // 基于域名生成确定性的 DNS 验证值
        AppState.dnsValue = generateDeterministicString(domain + '-dns', 43);

        const dnsHostEl = document.getElementById('dns-host');
        const dnsValueEl = document.getElementById('dns-value');

        if (dnsHostEl) dnsHostEl.textContent = '_acme-challenge';
        if (dnsValueEl) dnsValueEl.textContent = AppState.dnsValue;
    }
}

// ==================== 证书格式切换 ====================
function bindCertFormatChange() {
    const radioButtons = document.querySelectorAll('input[name="cert-format"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            AppState.certFormat = this.value;
        });
    });
}

// ==================== 显示安装指南 ====================
function displayInstallationGuide() {
    const guideContainer = document.getElementById('installation-guide');
    const formatNameEl = document.getElementById('selected-format-name');
    const formatDisplayEl = document.getElementById('selected-format-display');
    const methodNameEl = document.getElementById('selected-method-name');

    // 获取证书格式数据
    const certFormatsData = JSON.parse(document.getElementById('cert-formats-data').textContent);
    const selectedFormat = certFormatsData.formats.find(f => f.id === AppState.certFormat);

    if (selectedFormat) {
        formatNameEl.textContent = selectedFormat.name;
        formatDisplayEl.textContent = selectedFormat.name;

        // 转换 Markdown 为 HTML（简单实现）
        const guideHtml = markdownToHtml(selectedFormat.installation_guide);
        guideContainer.innerHTML = guideHtml;

        // 替换域名占位符
        updateDomainDisplay();

        // 生成证书文件下载列表
        generateCertificateFilesList(selectedFormat);
    }

    // 更新验证方式名称
    const methodNames = {
        'webserver': 'Web 服务器验证（HTTP-01）',
        'dns': 'DNS 解析验证（DNS-01）'
    };
    methodNameEl.textContent = methodNames[AppState.verificationMethod] || AppState.verificationMethod;
}

// ==================== Markdown 转 HTML（简单实现）====================
function markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // 处理代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // 处理标题
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 处理行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 处理加粗
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 处理列表
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // 处理有序列表
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

    // 处理段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // 清理
    html = html.replace(/<p><h/g, '<h');
    html = html.replace(/<\/h(\d)><\/p>/g, '</h$1>');
    html = html.replace(/<p><pre>/g, '<pre>');
    html = html.replace(/<\/pre><\/p>/g, '</pre>');
    html = html.replace(/<p><ul>/g, '<ul>');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
    html = html.replace(/<p><\/p>/g, '');

    return html;
}

// ==================== 验证清单 ====================
function bindVerificationChecklist() {
    const verifyButton = document.getElementById('verify-button');
    if (verifyButton) {
        // 初始时禁用按钮
        updateVerifyButton();

        // 监听复选框变化
        document.addEventListener('change', function(e) {
            if (e.target.matches('.checklist-item input[type="checkbox"]')) {
                updateVerifyButton();
            }
        });
    }
}

function updateVerifyButton() {
    const verifyButton = document.getElementById('verify-button');
    const checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"]');

    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    verifyButton.disabled = !allChecked;
}

// ==================== 域名显示更新 ====================
function updateDomainDisplay() {
    const domainElements = document.querySelectorAll('.domain-display, .domain-placeholder');
    domainElements.forEach(el => {
        el.textContent = AppState.domain || 'example.com';
    });
}

// ==================== 工具函数 ====================
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

function hideError(element) {
    element.textContent = '';
    element.style.display = 'none';
}

// 简单的字符串哈希函数（用于生成确定性的数字）
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
}

// 基于输入字符串生成确定性的随机字符串（改进版）
function generateDeterministicString(seed, length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';

    // 使用种子的多个哈希值创建更好的随机性
    let hash1 = simpleHash(seed);
    let hash2 = simpleHash(seed + 'salt1');
    let hash3 = simpleHash(seed + 'salt2');

    for (let i = 0; i < length; i++) {
        // 使用三个不同的 LCG 组合，增加随机性
        hash1 = (hash1 * 1103515245 + 12345) & 0x7fffffff;
        hash2 = (hash2 * 48271 + 0) & 0x7fffffff;
        hash3 = (hash3 * 69621 + 0) & 0x7fffffff;

        // 混合三个哈希值
        const combined = (hash1 ^ hash2 ^ hash3) + i * 2654435761;
        const index = Math.abs(combined) % chars.length;
        result += chars.charAt(index);
    }

    return result;
}

// 保留原有的随机字符串生成函数（以备不时之需）
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==================== 平滑滚动 Polyfill ====================
if (!('scrollBehavior' in document.documentElement.style)) {
    const scrollToPolyfill = function() {
        const element = document.documentElement;
        const to = 0;
        const duration = 300;
        const start = element.scrollTop;
        const change = to - start;
        const startDate = +new Date();

        const easeInOutQuad = function(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        };

        const animateScroll = function() {
            const currentDate = +new Date();
            const currentTime = currentDate - startDate;
            element.scrollTop = parseInt(easeInOutQuad(currentTime, start, change, duration));
            if (currentTime < duration) {
                requestAnimationFrame(animateScroll);
            } else {
                element.scrollTop = to;
            }
        };

        animateScroll();
    };

    // 重写 window.scrollTo
    const originalScrollTo = window.scrollTo;
    window.scrollTo = function(x, y) {
        if (typeof x === 'object' && x.behavior === 'smooth') {
            scrollToPolyfill();
        } else {
            originalScrollTo.call(window, x, y);
        }
    };
}

// ==================== 调试辅助 ====================
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.AppState = AppState;
    console.log('Debug mode enabled. Access AppState via window.AppState');
}

// ==================== 域名历史记录管理 ====================
const DOMAIN_HISTORY_KEY = 'dnsSsl_domainHistory';
const MAX_HISTORY_ITEMS = 10;

// 初始化域名历史记录功能
function initializeDomainHistory() {
    const historyToggle = document.getElementById('history-toggle');
    const domainInput = document.getElementById('domain-input');

    if (historyToggle) {
        historyToggle.addEventListener('click', toggleDomainHistory);
    }

    // 点击页面其他地方时关闭历史记录
    document.addEventListener('click', function(e) {
        const historyPanel = document.getElementById('domain-history');
        const historyToggle = document.getElementById('history-toggle');
        const domainInput = document.getElementById('domain-input');

        if (historyPanel &&
            !historyPanel.contains(e.target) &&
            !historyToggle.contains(e.target) &&
            !domainInput.contains(e.target)) {
            historyPanel.style.display = 'none';
        }
    });

    // 加载历史记录显示
    renderDomainHistory();
}

// 切换历史记录显示/隐藏
function toggleDomainHistory() {
    const historyPanel = document.getElementById('domain-history');
    if (historyPanel.style.display === 'none') {
        renderDomainHistory();
        historyPanel.style.display = 'block';
    } else {
        historyPanel.style.display = 'none';
    }
}

// 获取域名历史记录
function getDomainHistory() {
    try {
        const history = localStorage.getItem(DOMAIN_HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        console.error('Failed to load domain history:', e);
        return [];
    }
}

// 保存域名到历史记录
function saveDomainToHistory(domain) {
    if (!domain) return;

    let history = getDomainHistory();

    // 移除已存在的相同域名
    history = history.filter(item => item.domain !== domain);

    // 添加到开头
    history.unshift({
        domain: domain,
        timestamp: Date.now()
    });

    // 限制历史记录数量
    if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    try {
        localStorage.setItem(DOMAIN_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save domain history:', e);
    }
}

// 渲染域名历史记录列表
function renderDomainHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const history = getDomainHistory();

    if (history.length === 0) {
        historyList.innerHTML = '<li class="history-empty">暂无历史记录</li>';
        return;
    }

    historyList.innerHTML = history.map(item => {
        const timeStr = formatHistoryTime(item.timestamp);
        return `
            <li onclick="selectDomainFromHistory('${escapeHtml(item.domain)}')">
                <span class="history-item-domain">${escapeHtml(item.domain)}</span>
                <span class="history-item-time">${timeStr}</span>
                <button class="history-item-delete" onclick="event.stopPropagation(); deleteDomainFromHistory('${escapeHtml(item.domain)}')" title="删除">×</button>
            </li>
        `;
    }).join('');
}

// 从历史记录中选择域名
function selectDomainFromHistory(domain) {
    const domainInput = document.getElementById('domain-input');
    if (domainInput) {
        domainInput.value = domain;
        domainInput.focus();

        // 触发SSL证书检测
        checkSSLCertificate(domain);
    }

    // 隐藏历史记录面板
    const historyPanel = document.getElementById('domain-history');
    if (historyPanel) {
        historyPanel.style.display = 'none';
    }
}

// 从历史记录中删除单个域名
function deleteDomainFromHistory(domain) {
    let history = getDomainHistory();
    history = history.filter(item => item.domain !== domain);

    try {
        localStorage.setItem(DOMAIN_HISTORY_KEY, JSON.stringify(history));
        renderDomainHistory();
    } catch (e) {
        console.error('Failed to delete domain from history:', e);
    }
}

// 清空所有历史记录
function clearDomainHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        try {
            localStorage.removeItem(DOMAIN_HISTORY_KEY);
            renderDomainHistory();
        } catch (e) {
            console.error('Failed to clear domain history:', e);
        }
    }
}

// 格式化历史记录时间
function formatHistoryTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
        return '刚刚';
    } else if (diff < hour) {
        const minutes = Math.floor(diff / minute);
        return `${minutes}分钟前`;
    } else if (diff < day) {
        const hours = Math.floor(diff / hour);
        return `${hours}小时前`;
    } else if (diff < 7 * day) {
        const days = Math.floor(diff / day);
        return `${days}天前`;
    } else {
        const date = new Date(timestamp);
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
}

// HTML 转义（防止 XSS）
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== Nginx 完整示例展开/收起 ====================
function toggleNginxExamples() {
    const examplesContainer = document.getElementById('nginx-examples');
    const toggleBtn = event.currentTarget;

    if (examplesContainer.style.display === 'none') {
        examplesContainer.style.display = 'block';
        toggleBtn.classList.add('active');
        toggleBtn.title = '收起完整配置示例';
    } else {
        examplesContainer.style.display = 'none';
        toggleBtn.classList.remove('active');
        toggleBtn.title = '查看完整配置示例';
    }
}

// ==================== 域名输入实时检测 ====================
function bindDomainInputChange() {
    const domainInput = document.getElementById('domain-input');
    let debounceTimer = null;

    domainInput.addEventListener('input', function() {
        const domain = this.value.trim();

        // 清除之前的定时器
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // 如果域名为空，隐藏证书信息
        if (!domain) {
            const certInfoBox = document.getElementById('ssl-cert-info');
            if (certInfoBox) {
                certInfoBox.style.display = 'none';
            }
            AppState.sslCertInfo = null;
            AppState.certDaysRemaining = null;
            return;
        }

        // 简单的域名格式验证
        const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain)) {
            return;
        }

        // 如果域名和当前检测的域名相同，不重复检测
        if (AppState.domain === domain && AppState.sslCertInfo) {
            return;
        }

        // 防抖：500ms后执行检测
        debounceTimer = setTimeout(() => {
            checkSSLCertificate(domain);
        }, 500);
    });
}

// ==================== SSL证书检测 ====================
async function checkSSLCertificate(domain) {
    // 通配符域名不检测
    if (domain.startsWith('*.')) {
        return;
    }

    const certInfoBox = document.getElementById('ssl-cert-info');
    const certIssuerEl = document.getElementById('cert-issuer');
    const certExpiryEl = document.getElementById('cert-expiry');
    const certDaysEl = document.getElementById('cert-days');

    try {
        // 显示加载状态
        certInfoBox.style.display = 'block';
        certIssuerEl.textContent = '检测中...';
        certExpiryEl.textContent = '检测中...';
        certDaysEl.textContent = '检测中...';
        certDaysEl.className = 'cert-value cert-days';

        console.log('正在检测域名:', domain);

        // 使用竞速策略：同时请求多个API，谁快用谁
        const certInfo = await checkSSLWithRace(domain);

        if (certInfo) {
            AppState.sslCertInfo = certInfo;
            AppState.certDaysRemaining = certInfo.daysRemaining;

            certIssuerEl.textContent = certInfo.issuer;
            certExpiryEl.textContent = certInfo.expiryDate;
            certDaysEl.textContent = `${certInfo.daysRemaining} 天`;

            // 根据剩余天数设置颜色
            if (certInfo.daysRemaining < 7) {
                certDaysEl.className = 'cert-value cert-days cert-danger';
            } else if (certInfo.daysRemaining < 30) {
                certDaysEl.className = 'cert-value cert-days cert-warning';
            } else {
                certDaysEl.className = 'cert-value cert-days cert-success';
            }

            certInfoBox.style.display = 'block';
        } else {
            // 未检测到证书
            certInfoBox.style.display = 'none';
            AppState.sslCertInfo = null;
            AppState.certDaysRemaining = null;
        }
    } catch (error) {
        console.log('SSL证书检测失败:', error.message);
        certInfoBox.style.display = 'none';
        AppState.sslCertInfo = null;
        AppState.certDaysRemaining = null;
    }
}

// 竞速策略：同时请求多个API，使用最快的响应
async function checkSSLWithRace(domain) {
    const timeout = 8000; // 8秒超时

    // 创建超时Promise
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), timeout);
    });

    // 同时发起多个请求，谁先成功就用谁
    const promises = [
        checkSSLViaMySSL(domain),           // 国内服务，速度快
        checkSSLViaChinazSSL(domain),       // 站长工具SSL检测
        checkSSLViaTransparencyLog(domain), // crt.sh（国外，可能慢）
    ];

    try {
        // Promise.race：返回第一个成功的结果
        const result = await Promise.race([
            Promise.race(promises.map(p => p.catch(e => {
                console.log('某个API失败:', e.message);
                return null;
            }))),
            timeoutPromise
        ]);

        // 如果第一个结果为null，尝试等待其他结果
        if (result) {
            return result;
        }

        // 等待所有结果
        const results = await Promise.allSettled(promises);
        const successResult = results.find(r => r.status === 'fulfilled' && r.value);
        return successResult ? successResult.value : null;
    } catch (error) {
        console.log('所有API都失败了:', error.message);
        return null;
    }
}

// 方案1：使用 MySSL API（国内，速度快）
async function checkSSLViaMySSL(domain) {
    try {
        // MySSL 提供免费的SSL检测API（国内访问快）
        const response = await fetch(`https://myssl.com/api/v1/tools/cert_decode?domain=${encodeURIComponent(domain)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('MySSL API 请求失败');
        }

        const data = await response.json();

        if (data.code === 0 && data.data) {
            const cert = data.data;
            const expiryDate = new Date(cert.not_after * 1000);
            const today = new Date();
            const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

            return {
                issuer: cert.issuer_cn || cert.issuer_o || 'Unknown CA',
                expiryDate: expiryDate.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }),
                daysRemaining: daysRemaining
            };
        }

        throw new Error('MySSL API 返回数据格式错误');
    } catch (error) {
        console.log('MySSL 查询失败:', error.message);
        throw error;
    }
}

// 方案2：使用站长工具SSL检测（国内，速度较快）
async function checkSSLViaChinazSSL(domain) {
    try {
        // 使用站长工具的SSL查询接口
        const response = await fetch(`https://sslapi.chinaz.com/ChinazAPI/SSLInfo?domain=${encodeURIComponent(domain)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('站长工具 API 请求失败');
        }

        const data = await response.json();

        if (data.StateCode === 1 && data.Result) {
            const cert = data.Result;
            const expiryDate = new Date(cert.EndTime);
            const today = new Date();
            const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

            return {
                issuer: cert.IssuerName || 'Unknown CA',
                expiryDate: expiryDate.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }),
                daysRemaining: daysRemaining
            };
        }

        throw new Error('站长工具 API 返回数据格式错误');
    } catch (error) {
        console.log('站长工具查询失败:', error.message);
        throw error;
    }
}

// 方案3：通过证书透明度日志检测SSL证书（原方案，保留作为后备）
async function checkSSLViaTransparencyLog(domain) {
    try {
        // 使用 crt.sh API 查询证书透明度日志
        const response = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('证书查询失败');
        }

        const certificates = await response.json();

        if (!certificates || certificates.length === 0) {
            throw new Error('未找到证书');
        }

        // 找到最新的有效证书
        const validCerts = certificates
            .filter(cert => {
                const notAfter = new Date(cert.not_after);
                return notAfter > new Date();
            })
            .sort((a, b) => new Date(b.not_after) - new Date(a.not_after));

        if (validCerts.length === 0) {
            throw new Error('没有有效证书');
        }

        const latestCert = validCerts[0];
        const expiryDate = new Date(latestCert.not_after);
        const today = new Date();
        const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

        // 提取颁发者名称
        let issuer = latestCert.issuer_name || 'Unknown';
        if (issuer.includes('Let\'s Encrypt')) {
            issuer = "Let's Encrypt";
        } else if (issuer.includes('ZeroSSL')) {
            issuer = 'ZeroSSL';
        } else if (issuer.includes('DigiCert')) {
            issuer = 'DigiCert';
        } else if (issuer.includes('Cloudflare')) {
            issuer = 'Cloudflare';
        } else {
            // 提取 CN 或 O 字段
            const cnMatch = issuer.match(/CN=([^,]+)/);
            const oMatch = issuer.match(/O=([^,]+)/);
            issuer = cnMatch ? cnMatch[1] : (oMatch ? oMatch[1] : 'Unknown CA');
        }

        return {
            issuer: issuer,
            expiryDate: expiryDate.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }),
            daysRemaining: daysRemaining
        };
    } catch (error) {
        console.log('crt.sh 查询失败:', error.message);
        throw error;
    }
}

// 移除SSL Labs方案（太慢）

