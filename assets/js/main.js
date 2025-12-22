// ==================== 全局状态管理 ====================
const AppState = {
    currentStep: 1,
    totalSteps: 5,
    domain: '',
    verificationMethod: 'webserver',
    certFormat: 'nginx',
    acmeProvider: 'letsencrypt'
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
}

// ==================== 步骤导航 ====================
function nextStep(currentStep) {
    // 验证当前步骤
    if (!validateStep(currentStep)) {
        return;
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

    // 重置表单
    document.getElementById('domain-input').value = '';
    document.getElementById('acme-provider').selectedIndex = 0;
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

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

    // 更新域名占位符
    updateDomainDisplay();

    // 生成模拟验证数据
    generateMockVerificationData(method);
}

function generateMockVerificationData(method) {
    const domain = AppState.domain || 'example.com';

    if (method === 'webserver') {
        // 生成模拟的验证文件名和内容
        const challengeFilename = generateRandomString(40);
        const challengeContent = generateRandomString(87);

        const filenameEl = document.getElementById('challenge-filename');
        const contentEl = document.getElementById('challenge-content');

        if (filenameEl) filenameEl.textContent = challengeFilename;
        if (contentEl) contentEl.textContent = challengeContent;
    } else if (method === 'dns') {
        // 生成模拟的 DNS 验证值
        const dnsValue = generateRandomString(43);

        const dnsHostEl = document.getElementById('dns-host');
        const dnsValueEl = document.getElementById('dns-value');

        if (dnsHostEl) dnsHostEl.textContent = '_acme-challenge';
        if (dnsValueEl) dnsValueEl.textContent = dnsValue;
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
