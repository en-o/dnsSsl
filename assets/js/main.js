// ==================== 全局状态管理 ====================
const AppState = {
    currentStep: 1,
    totalSteps: 5,
    domain: '',
    verificationMethod: 'webserver',
    certFormat: 'nginx',
    acmeProvider: 'letsencrypt',
    // ⚠️ 重要：验证数据仅在当前申请流程中有效！
    // ACME 协议特性：每次申请证书时，CA 服务器会生成新的随机 token
    // - HTTP-01：文件名和内容每次都不同
    // - DNS-01：TXT 记录值每次都不同
    // 这是 ACME 协议的安全设计，无法绕过，不可跨流程复用
    challengeFilename: '',
    challengeContent: '',
    dnsValue: '',
    // ACME 订单信息（步骤2创建，步骤5复用，仅在当前流程有效）
    acmeClient: null,
    acmeOrderUrl: null,
    http01ChallengeUrl: null,  // HTTP-01 挑战 URL
    dns01ChallengeUrl: null,   // DNS-01 挑战 URL
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
    AppState.acmeClient = null;
    AppState.acmeOrderUrl = null;
    AppState.http01ChallengeUrl = null;
    AppState.dns01ChallengeUrl = null;
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

    // 检查是否已获取验证数据
    if (selectedMethod.value === 'webserver') {
        if (!AppState.challengeFilename || !AppState.challengeContent) {
            alert('验证数据尚未获取完成，请稍候...');
            return false;
        }
    } else if (selectedMethod.value === 'dns') {
        if (!AppState.dnsValue) {
            alert('DNS验证数据尚未获取完成，请稍候...');
            return false;
        }
    }

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
            // 进入步骤2时获取 ACME 挑战数据（每次申请都会生成新的 token）
            // 注意：同一个 ACME 订单会同时提供 HTTP-01 和 DNS-01 两种挑战
            // 在当前申请流程中切换验证方式时，使用同一订单的不同挑战类型

            // 禁用下一步按钮，等待获取验证数据
            disableStep2NextButton();

            if (!AppState.acmeClient || !AppState.acmeOrderUrl) {
                // 首次进入，创建新订单并获取挑战数据
                showVerificationMethod(AppState.verificationMethod, true);
            } else {
                // 已有订单，切换显示不同验证方式（使用同一订单的不同挑战类型）
                showVerificationMethod(AppState.verificationMethod, false);
                // 已有数据，直接启用按钮
                enableStep2NextButton();
            }
            break;
        case 3:
            // 进入步骤3时，准备验证界面
            prepareVerificationUI();
            break;
        case 4:
            // 清除所有证书格式的选中状态，强制用户重新选择
            document.querySelectorAll('input[name="cert-format"]').forEach(radio => {
                radio.checked = false;
            });
            break;
        case 5:
            // 进入步骤5时，申请证书并显示安装指南
            startCertificateRequest();
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
            // 切换验证方式时使用同一个订单的不同挑战类型（fetchChallenge = false）
            // 注意：这不是复用旧数据，而是在同一个 ACME 订单中选择不同的验证方式
            showVerificationMethod(this.value, false);
        });
    });
}

function showVerificationMethod(method, fetchChallenge = true) {
    const detailsContainer = document.getElementById('verification-details');

    console.log('[验证方式] 切换到:', method, ', 是否获取挑战数据:', fetchChallenge);

    if (method === 'webserver') {
        const template = document.getElementById('webserver-template');
        detailsContainer.innerHTML = template.innerHTML;
    } else if (method === 'dns') {
        const template = document.getElementById('dns-template');
        detailsContainer.innerHTML = template.innerHTML;
        console.log('[验证方式] DNS模板已加载到页面');
    }

    // 同步单选按钮的选中状态
    const radioButtons = document.querySelectorAll('input[name="verification-method"]');
    radioButtons.forEach(radio => {
        radio.checked = (radio.value === method);
    });

    // 更新域名占位符
    updateDomainDisplay();

    // 只在需要时获取挑战数据（首次进入步骤2）
    if (fetchChallenge) {
        // 获取真实的 ACME 挑战数据
        if (AppState.domain) {
            getRealAcmeChallengeForStep2(method);
        } else {
            // 如果还没有域名，使用示例数据
            generateExampleVerificationData(method);
        }
    } else {
        // 切换验证方式时，使用已有的挑战数据更新 UI
        // 使用 setTimeout 确保模板已完全渲染
        setTimeout(() => {
            console.log('[验证方式] 准备更新UI（延迟执行）');
            updateVerificationDataUI(method);

            // 检查当前验证方式的数据是否已获取，启用/禁用按钮
            if (method === 'webserver') {
                if (AppState.challengeFilename && AppState.challengeContent) {
                    enableStep2NextButton();
                    console.log('[切换] HTTP-01数据已存在，启用按钮');
                } else {
                    disableStep2NextButton('⏳ 正在获取验证数据，请稍候...');
                    console.log('[切换] HTTP-01数据不存在，可能正在获取中');
                }
            } else if (method === 'dns') {
                if (AppState.dnsValue) {
                    enableStep2NextButton();
                    console.log('[切换] DNS-01数据已存在，启用按钮');
                } else {
                    disableStep2NextButton('⏳ 正在获取验证数据，请稍候...');
                    console.log('[切换] DNS-01数据不存在，可能正在获取中');
                }
            }
        }, 100); // 延迟100ms，确保DOM已更新
    }
}

// ==================== 获取真实的 ACME 挑战数据（步骤2使用）====================
/**
 * ⚠️ ACME 协议重要特性说明：
 *
 * 每次申请证书时，Let's Encrypt 都会生成全新的随机 token：
 * - HTTP-01：文件名（token）由 CA 服务器随机生成，每次都不同
 * - DNS-01：记录值基于随机 token 计算，每次都不同
 *
 * 这意味着：
 * 1. 验证数据无法提前准备或长期保留使用
 * 2. 每次申请/续期证书都需要重新配置验证
 * 3. 这是 ACME 协议的安全设计，无法绕过
 *
 * 本函数在步骤2创建 ACME 订单并获取挑战数据
 * 用户在步骤2配置的验证数据将在步骤5实际申请时使用（同一订单）
 */
async function getRealAcmeChallengeForStep2(method) {
    const domain = AppState.domain;
    const caProvider = AppState.acmeProvider;

    console.log('[Step2] 开始获取真实 ACME 挑战数据...');
    console.log('[Step2] 域名:', domain);
    console.log('[Step2] CA提供商:', caProvider);
    console.log('[Step2] 验证方式:', method);

    try {
        // 初始化 ACME 客户端
        const acmeClient = new AcmeClient(caProvider);
        await acmeClient.initialize();

        // 创建或获取账户
        await acmeClient.createAccount('');

        // 创建订单（一次性为两种验证方式创建挑战数据）
        const { order, orderUrl } = await acmeClient.createOrder(domain);

        // 获取授权挑战
        const authUrl = order.authorizations[0];
        const authorization = await acmeClient.getAuthorization(authUrl);

        // 调试：显示授权信息
        console.log('[Step2] 授权信息完整内容:', authorization);
        console.log('[Step2] 可用的挑战类型:', authorization.challenges.map(c => c.type));

        // 保存 ACME 客户端和订单信息
        AppState.acmeClient = acmeClient;
        AppState.acmeOrderUrl = orderUrl;

        // 同时获取两种验证方式的挑战数据
        const http01Challenge = authorization.challenges.find(c => c.type === 'http-01');
        const dns01Challenge = authorization.challenges.find(c => c.type === 'dns-01');

        console.log('[Step2] 找到 HTTP-01 挑战?', !!http01Challenge);
        console.log('[Step2] 找到 DNS-01 挑战?', !!dns01Challenge);

        if (http01Challenge) {
            const challengeData = acmeClient.getHttp01ChallengeData(http01Challenge);
            AppState.challengeFilename = challengeData.filename;
            AppState.challengeContent = challengeData.content;
            AppState.http01ChallengeUrl = http01Challenge.url;
            console.log('[Step2] HTTP-01 挑战数据获取成功');
            console.log('[Step2] HTTP-01 文件名:', challengeData.filename);
        } else {
            console.warn('[Step2] ⚠️ 未找到 HTTP-01 挑战类型');
        }

        if (dns01Challenge) {
            const challengeData = acmeClient.getDns01ChallengeData(dns01Challenge);
            AppState.dnsValue = challengeData.value;
            AppState.dns01ChallengeUrl = dns01Challenge.url;
            console.log('[Step2] DNS-01 挑战数据获取成功');
            console.log('[Step2] DNS-01 记录值:', challengeData.value);
        } else {
            console.warn('[Step2] ⚠️ 未找到 DNS-01 挑战类型');
        }

        console.log('[Step2] ✓ 真实 ACME 挑战数据已保存到 AppState');

        // 更新当前验证方式的 UI
        updateVerificationDataUI(method);

        // 启用步骤2的下一步按钮
        enableStep2NextButton();

        // 重要：如果用户在异步获取过程中切换了验证方式，需要更新另一种验证方式的按钮状态
        // 获取当前选中的验证方式
        const currentMethod = document.querySelector('input[name="verification-method"]:checked')?.value;

        // 如果当前选中的不是触发获取的方法，说明用户切换了验证方式
        if (currentMethod && currentMethod !== method) {
            console.log('[Step2] 检测到用户切换了验证方式，更新按钮状态');
            // 检查切换后的验证方式数据是否已获取
            if (currentMethod === 'dns' && AppState.dnsValue) {
                enableStep2NextButton();
                console.log('[Step2] DNS数据已就绪，启用按钮');
            } else if (currentMethod === 'webserver' && AppState.challengeFilename && AppState.challengeContent) {
                enableStep2NextButton();
                console.log('[Step2] HTTP-01数据已就绪，启用按钮');
            }
        }

    } catch (error) {
        console.error('[Step2] 获取 ACME 挑战数据失败:', error);

        // 检查是否是速率限制错误
        if (error.name === 'RateLimitError' || (error.message && error.message.includes('rateLimited')) || (error.type && error.type.includes('rateLimited'))) {
            // 速率限制错误 - 提供详细说明和解决方案
            const errorMsg = `⚠️ Let's Encrypt 速率限制

您的域名 "${domain}" 在过去7天内已申请了5次证书，达到速率限制。

解决方案：
1. 【推荐】切换到 "Let's Encrypt Staging" 测试环境
   - 返回步骤1，选择 "Let's Encrypt Staging（测试环境）"
   - Staging 环境速率限制更宽松，适合测试学习

2. 等待限制解除
   - 需要等到 7 天后才能再次申请
   - 查看详情：https://letsencrypt.org/docs/rate-limits/

3. 使用不同的域名进行测试

💡 提示：Staging 环境颁发的证书不被浏览器信任，但流程完全相同，适合学习和测试。`;

            alert(errorMsg);

            // 禁用步骤2的下一步按钮
            disableStep2NextButton('❌ 速率限制，请切换到 Staging 环境或使用其他域名');
            return; // 不要 throw，避免未捕获的异常
        }

        // 其他错误
        let errorMsg = '获取验证数据失败：' + error.message;

        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            errorMsg += '\n\n可能的原因：\n1. 网络连接问题\n2. 防火墙/代理拦截\n3. ACME 服务器暂时不可用\n\n请检查网络连接后重试。';
        }

        alert(errorMsg);
        disableStep2NextButton('❌ 获取验证数据失败');
    }
}

/**
 * 更新验证方式的 UI（使用已有的挑战数据）
 */
function updateVerificationDataUI(method) {
    if (method === 'webserver') {
        const filenameEl = document.getElementById('challenge-filename');
        const contentEl = document.getElementById('challenge-content');
        const quickCommandEl = document.getElementById('quick-command');

        if (filenameEl && AppState.challengeFilename) {
            filenameEl.textContent = AppState.challengeFilename;
        }
        if (contentEl && AppState.challengeContent) {
            contentEl.textContent = AppState.challengeContent;
        }

        // 更新快捷命令
        if (quickCommandEl && AppState.challengeFilename && AppState.challengeContent) {
            quickCommandEl.textContent = `echo "${AppState.challengeContent}" > /var/www/html/.well-known/acme-challenge/${AppState.challengeFilename}`;
        }

    } else if (method === 'dns') {
        const dnsHostEl = document.getElementById('dns-host');
        const dnsValueEl = document.getElementById('dns-value');

        // 生成完整的DNS主机记录：_acme-challenge.域名
        const dnsHost = `_acme-challenge.${AppState.domain}`;

        console.log('[DNS UI] 正在更新DNS UI');
        console.log('[DNS UI] DNS主机记录:', dnsHost);
        console.log('[DNS UI] AppState.dnsValue:', AppState.dnsValue);
        console.log('[DNS UI] dnsHostEl 存在?', !!dnsHostEl);
        console.log('[DNS UI] dnsValueEl 存在?', !!dnsValueEl);

        if (dnsHostEl) {
            dnsHostEl.textContent = dnsHost;
            console.log('[DNS UI] ✓ DNS主机记录已设置');
        } else {
            console.error('[DNS UI] ✗ 找不到 dns-host 元素');
        }

        if (dnsValueEl) {
            if (AppState.dnsValue) {
                dnsValueEl.textContent = AppState.dnsValue;
                console.log('[DNS UI] ✓ DNS记录值已更新:', AppState.dnsValue);
            } else {
                dnsValueEl.textContent = '等待获取...';
                console.warn('[DNS UI] ⚠️ AppState.dnsValue 为空，显示"等待获取..."');
            }
        } else {
            console.error('[DNS UI] ✗ 找不到 dns-value 元素');
        }
    }
}


// 生成示例验证数据（仅在没有域名时使用）
function generateExampleVerificationData(method) {
    const domain = 'example.com';

    console.log('[示例] 生成示例验证数据（当前未输入域名）');

    if (method === 'webserver') {
        // 生成随机token（模拟真实ACME行为）
        AppState.challengeFilename = generateRandomString(40);
        AppState.challengeContent = generateRandomString(87);

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
        // 生成随机DNS值
        AppState.dnsValue = generateRandomString(43);

        const dnsHostEl = document.getElementById('dns-host');
        const dnsValueEl = document.getElementById('dns-value');

        // 生成完整的DNS主机记录：_acme-challenge.域名
        const dnsHost = `_acme-challenge.${domain}`;

        if (dnsHostEl) {
            dnsHostEl.textContent = dnsHost;
        }
        if (dnsValueEl) {
            dnsValueEl.textContent = AppState.dnsValue;
        }
    }

    // 示例数据也启用下一步按钮
    enableStep2NextButton();
}

// ==================== 证书格式切换 ====================
function bindCertFormatChange() {
    const radioButtons = document.querySelectorAll('input[name="cert-format"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            AppState.certFormat = this.value;

            // 选择格式后自动跳转到下一步
            setTimeout(() => {
                nextStep(4);
            }, 300); // 延迟300ms，让用户看到选中效果
        });
    });
}

// ==================== 显示安装指南 ====================
async function startCertificateRequest() {
    // 先显示基本界面，让用户立即看到内容
    displayInstallationGuideBasicInfo();

    // 禁用下载所有按钮，等待证书申请完成
    if (typeof disableDownloadAllButton === 'function') {
        disableDownloadAllButton();
    }

    // 检查是否已经有证书
    if (AppState.realCertificate) {
        console.log('[Main] 已有真实证书，直接生成证书文件列表');
        generateCertificateFilesListNow();
        return;
    }

    // 在证书文件列表区域显示加载状态
    const filesListContainer = document.getElementById('cert-files-list');
    filesListContainer.innerHTML = `
        <div class="loading-certificate" style="padding: 2rem; text-align: center;">
            <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
            <h4>正在申请证书...</h4>
            <p style="color: #64748b; margin-bottom: 1rem;">请稍候，系统正在向 ${AppState.acmeProvider} 申请真实的 SSL 证书</p>
            <div id="cert-request-log" class="cert-request-log" style="max-height: 300px; overflow-y: auto; text-align: left; background: #f8fafc; padding: 1rem; border-radius: 8px; margin-top: 1rem;"></div>
        </div>
    `;

    try {
        // 调用 ACME 申请流程
        await requestRealCertificateInStep5();

        // 申请成功，生成证书文件列表
        generateCertificateFilesListNow();

    } catch (error) {
        console.error('[Main] 证书申请失败:', error);
        filesListContainer.innerHTML = `
            <div class="error-box" style="margin: 0;">
                <h4>❌ 证书申请失败</h4>
                <p class="error-message">${error.message}</p>
                <p style="margin-top: 1rem;">请返回步骤3重新验证配置，或检查以下内容：</p>
                <ul style="margin-left: 1.5rem; margin-top: 0.5rem;">
                    <li>HTTP-01: 验证文件是否可以通过 HTTP 访问</li>
                    <li>DNS-01: TXT 记录是否已生效</li>
                    <li>域名解析是否正确</li>
                    <li>防火墙是否阻止了访问</li>
                </ul>
            </div>
        `;

        // 更新下载提示为错误状态
        const downloadHint = document.getElementById('download-hint');
        if (downloadHint) {
            downloadHint.style.display = 'block';
            downloadHint.textContent = '❌ 证书申请失败，无法下载';
            downloadHint.style.color = '#ef4444';
        }
    }
}

// 显示安装指南的基本信息（不包括证书文件列表）
function displayInstallationGuideBasicInfo() {
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

    // 如果是 Staging 环境，显示特别提示
    if (AppState.acmeProvider === 'letsencrypt-staging') {
        const successBox = document.querySelector('.success-box');
        if (successBox) {
            const stagingNotice = document.createElement('div');
            stagingNotice.className = 'staging-notice';
            stagingNotice.style.cssText = 'margin-top: 1rem; padding: 1rem; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px;';
            stagingNotice.innerHTML = `
                <h4 style="color: #92400e; margin-bottom: 0.5rem;">⚠️ 这是 Staging 环境证书</h4>
                <p style="color: #78350f; margin: 0; font-size: 0.9rem;">
                    此证书由 Let's Encrypt Staging 环境颁发，<strong>不受浏览器信任</strong>（会显示"不安全"）。<br>
                    这是正常的，因为这是测试环境。<br><br>
                    <strong>如需获取真实证书：</strong>返回步骤1，选择 "Let's Encrypt（生产环境）" 重新申请。
                </p>
            `;
            successBox.appendChild(stagingNotice);
        }
    }
}

// 生成证书文件列表（立即执行）
function generateCertificateFilesListNow() {
    const certFormatsData = JSON.parse(document.getElementById('cert-formats-data').textContent);
    const selectedFormat = certFormatsData.formats.find(f => f.id === AppState.certFormat);

    if (selectedFormat) {
        generateCertificateFilesList(selectedFormat);
    }
}

// 保留原displayInstallationGuide函数以兼容
function displayInstallationGuide() {
    displayInstallationGuideBasicInfo();
    generateCertificateFilesListNow();
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
// 用于证书序列号生成等场景
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
}

// 生成随机字符串（用于模拟 ACME token）
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==================== 步骤2按钮控制 ====================
function enableStep2NextButton() {
    const nextBtn = document.getElementById('btn-next-step-2');
    const hint = document.getElementById('step2-hint');

    if (nextBtn) {
        nextBtn.disabled = false;
        console.log('[Step2] 下一步按钮已启用');
    }

    if (hint) {
        hint.style.display = 'none';
    }
}

function disableStep2NextButton(message = '⏳ 正在获取验证数据...') {
    const nextBtn = document.getElementById('btn-next-step-2');
    const hint = document.getElementById('step2-hint');

    if (nextBtn) {
        nextBtn.disabled = true;
    }

    if (hint) {
        hint.style.display = 'block';
        hint.textContent = message;
        hint.style.color = '#64748b';
    }
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

// ==================== 复制快捷命令 ====================
function copyQuickCommand() {
    const commandEl = document.getElementById('quick-command');
    if (!commandEl) {
        alert('未找到命令内容');
        return;
    }

    const command = commandEl.textContent;

    // 使用现代剪贴板API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(command).then(() => {
            showCopySuccess(event.currentTarget);
        }).catch(err => {
            console.error('复制失败:', err);
            fallbackCopyTextToClipboard(command, event.currentTarget);
        });
    } else {
        // 降级方案
        fallbackCopyTextToClipboard(command, event.currentTarget);
    }
}

// 降级复制方案
function fallbackCopyTextToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(button);
        } else {
            alert('复制失败，请手动复制');
        }
    } catch (err) {
        console.error('降级复制也失败了:', err);
        alert('复制失败，请手动复制');
    }

    document.body.removeChild(textArea);
}

// 显示复制成功提示
function showCopySuccess(button) {
    const originalHTML = button.innerHTML;

    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>已复制</span>
    `;
    button.style.background = '#10b981';
    button.style.color = 'white';

    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.background = '';
        button.style.color = '';
    }, 2000);
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

