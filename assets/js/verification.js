
// ==================== 自动验证功能 ====================

// 准备验证 UI
function prepareVerificationUI() {
    updateDomainDisplay();

    // 更新验证方式显示
    const methodNames = {
        'webserver': 'Web 服务器验证（HTTP-01）',
        'dns': 'DNS 解析验证（DNS-01）'
    };
    const methodDisplayEl = document.getElementById('verification-method-display');
    if (methodDisplayEl) {
        methodDisplayEl.textContent = methodNames[AppState.verificationMethod] || AppState.verificationMethod;
    }

    // 更新验证目标显示
    updateVerificationTarget();

    // 显示或隐藏 DNS 服务商选择
    const dnsProviderSelection = document.getElementById('dns-provider-selection');
    if (dnsProviderSelection) {
        if (AppState.verificationMethod === 'dns') {
            dnsProviderSelection.style.display = 'block';
        } else {
            dnsProviderSelection.style.display = 'none';
        }
    }

    // 显示或隐藏 DNS 记录添加说明
    const dnsInstructionBox = document.getElementById('dns-instruction-box');
    if (dnsInstructionBox) {
        if (AppState.verificationMethod === 'dns') {
            dnsInstructionBox.style.display = 'block';
            // 更新说明框中的信息
            const domain = AppState.domain || 'example.com';
            const fullRecord = '_acme-challenge.' + domain;
            const dnsValue = AppState.dnsValue || 'xxxxx';

            const fullRecordEl = document.getElementById('dns-full-record');
            const recordValueEl = document.getElementById('dns-record-value');

            if (fullRecordEl) fullRecordEl.textContent = fullRecord;
            if (recordValueEl) recordValueEl.textContent = dnsValue;
        } else {
            dnsInstructionBox.style.display = 'none';
        }
    }

    // 重置验证状态
    resetVerificationStatus();
}

// 更新验证目标显示
function updateVerificationTarget() {
    const domain = AppState.domain || 'example.com';
    const labelEl = document.getElementById('verification-target-label');
    const valueEl = document.getElementById('verification-target-value');

    if (AppState.verificationMethod === 'webserver') {
        // 使用 AppState 中保存的验证文件名
        const challengeFilename = AppState.challengeFilename || 'xxxxxx';
        labelEl.textContent = '验证 URL：';
        valueEl.textContent = 'http://' + domain + '/.well-known/acme-challenge/' + challengeFilename;
    } else if (AppState.verificationMethod === 'dns') {
        const dnsHost = '_acme-challenge';
        const fullDnsRecord = dnsHost + '.' + domain;
        labelEl.textContent = 'DNS 记录：';
        valueEl.innerHTML = '<strong>' + fullDnsRecord + '</strong> (TXT)';
    }
}

// 重置验证状态
function resetVerificationStatus() {
    const statusContainer = document.getElementById('verification-status');
    statusContainer.innerHTML = '<div class="status-pending"><svg class="status-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><h3>等待开始验证...</h3><p>请点击"开始验证"按钮</p></div>';

    // 隐藏详情和继续按钮
    document.getElementById('verification-details-box').style.display = 'none';
    document.getElementById('verify-start-button').style.display = 'inline-block';
    document.getElementById('verify-continue-button').style.display = 'none';
}

// 开始验证配置（不申请证书）
async function startVerification() {
    const startButton = document.getElementById('verify-start-button');
    startButton.disabled = true;
    startButton.textContent = '验证中...';

    // 显示验证中状态
    showVerificationStatus('loading', '正在验证...', '请稍候，系统正在检查您的配置');

    // 显示详情区域
    const detailsBox = document.getElementById('verification-details-box');
    detailsBox.style.display = 'block';

    // 清空日志
    const logContainer = document.getElementById('verification-log');
    logContainer.innerHTML = '';

    try {
        // 直接验证配置（使用步骤2中生成的模拟数据）
        if (AppState.verificationMethod === 'webserver') {
            await verifyWebServer();
        } else if (AppState.verificationMethod === 'dns') {
            await verifyDNS();
        }
    } catch (error) {
        addLog('error', '验证过程出错：' + error.message);
        showVerificationStatus('error', '验证失败', error.message || '验证过程中发生错误');
    }

    startButton.disabled = false;
    startButton.textContent = '重新验证';
}

// Web 服务器验证
async function verifyWebServer() {
    const domain = AppState.domain;
    const challengeFilename = AppState.challengeFilename;
    const challengeContent = AppState.challengeContent;

    if (!challengeFilename || !challengeContent) {
        throw new Error('验证参数缺失');
    }

    const verifyUrl = 'http://' + domain + '/.well-known/acme-challenge/' + challengeFilename;

    addLog('info', '开始 Web 服务器验证...');
    addLog('info', '验证 URL: ' + verifyUrl);
    const shortContent = challengeContent.length > 20 ? challengeContent.substring(0, 20) + '...' : challengeContent;
    addLog('info', '预期内容: ' + shortContent);

    addLog('info', '正在尝试访问验证文件...');

    try {
        // 尝试直接访问（可能会因为 CORS 失败）
        let response;
        let content;
        let usedProxy = false;

        try {
            addLog('info', '尝试直接访问...');
            response = await fetch(verifyUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }

            content = await response.text();
            addLog('success', '✓ 直接访问成功');
        } catch (directError) {
            // 直接访问失败，尝试使用 CORS 代理
            if (directError.message.includes('Failed to fetch') || directError.message.includes('CORS') || directError.name === 'TypeError') {
                addLog('warning', '⚠️ 直接访问受 CORS 限制，尝试使用代理...');

                // 尝试多个 CORS 代理服务
                const corsProxies = [
                    'https://api.allorigins.win/raw?url=',
                    'https://corsproxy.io/?',
                    'https://api.codetabs.com/v1/proxy?quest='
                ];

                let proxySuccess = false;
                for (let i = 0; i < corsProxies.length; i++) {
                    try {
                        const proxyUrl = corsProxies[i] + encodeURIComponent(verifyUrl);
                        addLog('info', '尝试代理 ' + (i + 1) + '/' + corsProxies.length + '...');

                        const proxyResponse = await fetch(proxyUrl, {
                            method: 'GET',
                            cache: 'no-cache',
                            timeout: 5000
                        });

                        if (proxyResponse.ok) {
                            content = await proxyResponse.text();
                            addLog('success', '✓ 通过代理访问成功');
                            usedProxy = true;
                            proxySuccess = true;
                            break;
                        }
                    } catch (proxyError) {
                        addLog('info', '代理 ' + (i + 1) + ' 失败，继续尝试...');
                    }
                }

                if (!proxySuccess) {
                    throw new Error('CORS_PROXY_FAILED');
                }
            } else {
                throw directError;
            }
        }

        const trimmedContent = content.trim();

        addLog('success', '✓ 成功获取验证文件内容');
        addLog('info', '获取到的内容: ' + (trimmedContent.length > 30 ? trimmedContent.substring(0, 30) + '...' : trimmedContent));

        // 验证内容是否匹配
        if (trimmedContent === challengeContent.trim()) {
            addLog('success', '✓ 验证内容匹配');
            addLog('success', '✓ Web 服务器验证通过！');
            if (usedProxy) {
                addLog('info', '');
                addLog('info', '💡 提示：验证通过代理完成，实际 Let\'s Encrypt 访问时不会有 CORS 限制');
            }
            showVerificationStatus('success', '验证成功！', 'Web 服务器配置正确，可以继续下一步');
            showContinueButton();
        } else {
            addLog('error', '✗ 验证内容不匹配');
            addLog('info', '预期内容: ' + challengeContent);
            addLog('info', '实际内容: ' + trimmedContent);
            throw new Error('验证内容不匹配');
        }
    } catch (error) {
        // 处理所有代理都失败的情况
        if (error.message === 'CORS_PROXY_FAILED') {
            addLog('error', '✗ 所有代理服务都无法访问');
            addLog('info', '');
            addLog('warning', '⚠️ 可能的原因：');
            addLog('info', '1. 验证 URL 无法访问（域名解析、服务器配置问题）');
            addLog('info', '2. 代理服务暂时不可用');
            addLog('info', '3. 网络连接问题');
            addLog('info', '');
            addLog('info', '🔍 请手动验证以下 URL：');
            addLog('info', verifyUrl);
            addLog('info', '');
            addLog('info', '验证方法：');
            addLog('info', '1. 浏览器新标签页打开上述 URL');
            addLog('info', '   • 如果下载文件或显示内容 → 配置正确 ✅');
            addLog('info', '   • 如果跳转到 404/HTTPS → 配置有误 ❌');
            addLog('info', '');
            addLog('info', '2. 或使用命令行：curl -v ' + verifyUrl);
            addLog('info', '');
            addLog('error', '常见配置问题：');
            addLog('info', '• root 路径不对（应该和主站 root 一致）');
            addLog('info', '• HTTP 被重定向到 HTTPS（需要用 ^~ 优先匹配）');
            addLog('info', '• 验证文件不存在或权限不足');
            addLog('info', '');
            addLog('info', '💡 排查命令：');
            addLog('info', '1. nginx -t && nginx -s reload');
            addLog('info', '2. ls -la /path/to/.well-known/acme-challenge/');
            addLog('info', '3. curl -v ' + verifyUrl);

            showVerificationStatus('error', '验证失败', '无法访问验证 URL，请检查服务器配置和网络连接');
            throw new Error('无法访问验证 URL');
        } else if (error.message.includes('验证内容不匹配')) {
            showVerificationStatus('error', '验证失败', '验证文件内容不匹配，请检查文件内容是否正确');
            throw error;
        } else {
            addLog('error', '✗ 验证失败: ' + error.message);
            addLog('info', '');
            addLog('warning', '请确认：');
            addLog('info', '1. 域名解析正确（ping ' + domain + '）');
            addLog('info', '2. Web 服务器正在运行');
            addLog('info', '3. 验证文件已正确放置');
            addLog('info', '4. 防火墙允许 HTTP (80端口) 访问');
            addLog('info', '5. Nginx 配置已生效（nginx -s reload）');
            showVerificationStatus('error', '验证失败', error.message);
            throw error;
        }
    }
}

// DNS 验证
async function verifyDNS() {
    const domain = AppState.domain;
    const dnsHost = '_acme-challenge';
    const dnsValue = AppState.dnsValue;

    if (!dnsValue) {
        throw new Error('DNS 验证值缺失');
    }

    const fullDomain = dnsHost + '.' + domain;

    // 获取选择的 DNS 服务商
    const selectedProvider = document.querySelector('input[name="dns-provider"]:checked');
    const provider = selectedProvider ? selectedProvider.value : 'alidns';

    const providerNames = {
        'alidns': '阿里云 DNS',
        'dnspod': '腾讯云 DNSPod',
        'cloudflare': 'Cloudflare DNS',
        'google': 'Google DNS'
    };

    addLog('info', '开始 DNS 验证...');
    addLog('info', '查询域名: ' + fullDomain);
    const shortValue = dnsValue.length > 20 ? dnsValue.substring(0, 20) + '...' : dnsValue;
    addLog('info', '预期TXT值: ' + shortValue);
    addLog('info', '使用 ' + (providerNames[provider] || provider) + ' DoH 服务');

    try {
        addLog('info', '正在查询 DNS 记录...');

        // 根据不同服务商构建 DoH URL
        let dohUrl;
        switch(provider) {
            case 'alidns':
                dohUrl = 'https://dns.alidns.com/resolve?name=' + encodeURIComponent(fullDomain) + '&type=TXT';
                break;
            case 'dnspod':
                dohUrl = 'https://doh.pub/dns-query?name=' + encodeURIComponent(fullDomain) + '&type=TXT';
                break;
            case 'cloudflare':
                dohUrl = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(fullDomain) + '&type=TXT';
                break;
            case 'google':
            default:
                dohUrl = 'https://dns.google/resolve?name=' + encodeURIComponent(fullDomain) + '&type=TXT';
                break;
        }

        const response = await fetch(dohUrl, {
            headers: provider === 'cloudflare' ? { 'Accept': 'application/dns-json' } : {}
        });

        const data = await response.json();

        addLog('info', 'DNS 查询完成，状态: ' + data.Status);

        if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
            // 解析 TXT 记录
            const txtRecords = data.Answer
                .filter(answer => answer.type === 16) // TXT type
                .map(answer => {
                    // 移除引号和转义字符
                    let txt = answer.data || answer.Data || '';
                    return txt.replace(/^"|"$/g, '').replace(/\\"/g, '"');
                });

            addLog('info', '找到 ' + txtRecords.length + ' 条 TXT 记录');

            txtRecords.forEach((record, index) => {
                const shortRecord = record.length > 30 ? record.substring(0, 30) + '...' : record;
                addLog('info', '记录 ' + (index + 1) + ': ' + shortRecord);
            });

            // 检查是否包含预期值
            const found = txtRecords.some(record => record === dnsValue);

            if (found) {
                addLog('success', '✓ 找到匹配的 TXT 记录');
                addLog('success', '✓ DNS 验证通过！');
                addLog('info', '');
                addLog('warning', '⚠️ ACME 协议重要提示：');
                addLog('info', '每次申请/续期证书时，验证记录值都会改变！');
                addLog('info', '原因：CA 服务器每次生成不同的随机 token');
                addLog('info', '这是 ACME 协议的安全设计，无法绕过');
                addLog('info', '');
                addLog('info', '💡 续期建议：');
                addLog('info', '1. 使用 Certbot 或 acme.sh 等工具自动续期');
                addLog('info', '2. 或在每次续期时重新配置验证记录');
                addLog('info', '3. 可以保留 TXT 记录名称，每次只需修改记录值');
                showVerificationStatus('success', '验证成功！', 'DNS 配置正确，可以继续申请证书');
                showContinueButton();
            } else {
                const recordList = txtRecords.map((r, i) => (i + 1) + '. ' + r).join('\n');
                addLog('error', '✗ 未找到匹配的 TXT 记录');
                addLog('info', '已查询到的记录：');
                txtRecords.forEach((r, i) => addLog('info', '  ' + (i + 1) + '. ' + r));
                addLog('info', '预期值: ' + dnsValue);
                throw new Error('未找到匹配的 TXT 记录');
            }
        } else {
            addLog('error', '✗ DNS 查询失败，未找到 TXT 记录');
            addLog('info', '');
            addLog('warning', '请确认：');
            addLog('info', '1. DNS 记录已添加');
            addLog('info', '2. 等待 DNS 解析生效（可能需要几分钟）');
            addLog('info', '3. 记录类型为 TXT');
            addLog('info', '4. 主机记录为 ' + dnsHost);
            addLog('info', '');
            addLog('info', '建议手动验证命令：');
            addLog('info', 'dig ' + fullDomain + ' TXT');
            addLog('info', '或访问: https://toolbox.googleapps.com/apps/dig/#TXT/' + fullDomain);
            throw new Error('DNS 查询失败，未找到 TXT 记录');
        }
    } catch (error) {
        if (error.message.includes('fetch')) {
            addLog('error', '✗ DNS 查询失败: 网络错误');
            addLog('warning', '建议：');
            addLog('info', '1. 检查网络连接');
            addLog('info', '2. 尝试切换其他 DNS 服务商');
            addLog('info', '3. 使用命令行工具手动验证');
        } else if (!error.message.includes('未找到匹配') && !error.message.includes('DNS 查询失败')) {
            addLog('error', '✗ DNS 查询出错: ' + error.message);
        }
        throw error;
    }
}

// 显示验证状态
function showVerificationStatus(type, title, message) {
    const statusContainer = document.getElementById('verification-status');

    let icon, colorClass;
    switch(type) {
        case 'loading':
            icon = '<svg class="status-icon rotating" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/><path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            colorClass = 'status-loading';
            break;
        case 'success':
            icon = '<svg class="status-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#10b981" stroke-width="2"/><path d="M8 12L11 15L16 9" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            colorClass = 'status-success';
            break;
        case 'error':
            icon = '<svg class="status-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><path d="M15 9L9 15M9 9L15 15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>';
            colorClass = 'status-error';
            break;
        default:
            icon = '';
            colorClass = '';
    }

    statusContainer.innerHTML = '<div class="' + colorClass + '">' + icon + '<h3>' + title + '</h3><p>' + message + '</p></div>';
}

// 添加日志
function addLog(type, message) {
    const logContainer = document.getElementById('verification-log');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry log-' + type;

    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    let icon;
    switch(type) {
        case 'success':
            icon = '✓';
            break;
        case 'error':
            icon = '✗';
            break;
        case 'warning':
            icon = '⚠';
            break;
        case 'info':
        default:
            icon = 'ℹ';
    }

    logEntry.innerHTML = '<span class="log-time">[' + timestamp + ']</span><span class="log-icon">' + icon + '</span><span class="log-message">' + message + '</span>';

    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 显示继续按钮
function showContinueButton() {
    document.getElementById('verify-start-button').style.display = 'none';
    document.getElementById('verify-continue-button').style.display = 'inline-block';
}

// 辅助函数：休眠
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 获取 ACME 挑战数据（仅用于验证配置）====================
/**
 * 仅获取 ACME 挑战数据，不申请证书
 * 用于步骤3：让用户验证配置是否正确
 */
async function fetchAcmeChallenge() {
    const domain = AppState.domain;
    const caProvider = AppState.acmeProvider;
    const verificationMethod = AppState.verificationMethod;

    try {
        // 初始化 ACME 客户端
        const acmeClient = new AcmeClient(caProvider);
        await acmeClient.initialize();

        // 创建或获取账户
        await acmeClient.createAccount('');

        // 创建订单
        const { order } = await acmeClient.createOrder(domain);

        // 获取授权挑战
        const authUrl = order.authorizations[0];
        const authorization = await acmeClient.getAuthorization(authUrl);

        // 根据验证方式选择挑战
        let challenge;
        let challengeData;

        if (verificationMethod === 'webserver') {
            // HTTP-01 挑战
            challenge = authorization.challenges.find(c => c.type === 'http-01');
            if (!challenge) {
                throw new Error('服务器不支持 HTTP-01 验证');
            }

            challengeData = acmeClient.getHttp01ChallengeData(challenge);

            // 更新 AppState
            AppState.challengeFilename = challengeData.filename;
            AppState.challengeContent = challengeData.content;
            AppState.acmeClient = acmeClient; // 保存客户端，用于后续申请

            addLog('info', '验证文件名: ' + challengeData.filename);
            addLog('info', '验证URL: http://' + domain + '/.well-known/acme-challenge/' + challengeData.filename);

        } else if (verificationMethod === 'dns') {
            // DNS-01 挑战
            challenge = authorization.challenges.find(c => c.type === 'dns-01');
            if (!challenge) {
                throw new Error('服务器不支持 DNS-01 验证');
            }

            challengeData = acmeClient.getDns01ChallengeData(challenge);

            // 更新 AppState
            AppState.dnsValue = challengeData.value;
            AppState.acmeClient = acmeClient; // 保存客户端，用于后续申请

            addLog('info', 'DNS 主机记录: ' + challengeData.host);
            addLog('info', 'TXT 记录值: ' + challengeData.value);
            addLog('info', '完整域名: ' + challengeData.host + '.' + domain);

            // 更新 UI 中的 DNS 记录值
            const dnsInstructionBox = document.getElementById('dns-instruction-box');
            if (dnsInstructionBox) {
                dnsInstructionBox.style.display = 'block';
                const fullRecordEl = document.getElementById('dns-full-record');
                const recordValueEl = document.getElementById('dns-record-value');
                if (fullRecordEl) fullRecordEl.textContent = challengeData.host + '.' + domain;
                if (recordValueEl) recordValueEl.textContent = challengeData.value;
            }
        }

    } catch (error) {
        console.error('[ACME] 获取挑战数据失败:', error);
        throw new Error('获取验证数据失败: ' + error.message);
    }
}

// ==================== ACME 证书申请（在步骤5执行）====================
/**
 * 在步骤5申请真实证书
 * 此时配置已经验证通过，用户已选择证书格式
 * 复用步骤2创建的 ACME 订单和挑战数据
 */
async function requestRealCertificateInStep5() {
    const domain = AppState.domain;
    const caProvider = AppState.acmeProvider;
    const verificationMethod = AppState.verificationMethod;

    // 简单的日志函数（输出到步骤5的日志区域）
    function log(message) {
        const logEl = document.getElementById('cert-request-log');
        if (logEl) {
            const timestamp = new Date().toLocaleTimeString();
            logEl.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            logEl.scrollTop = logEl.scrollHeight;
        }
        console.log('[ACME]', message);
    }

    try {
        log('开始申请 SSL 证书...');
        log(`域名: ${domain}`);
        log(`CA提供商: ${caProvider}`);
        log(`验证方式: ${verificationMethod === 'webserver' ? 'HTTP-01' : 'DNS-01'}`);
        log('');

        let acmeClient, orderUrl, challengeUrl;

        // 检查是否有步骤2保存的 ACME 订单
        if (AppState.acmeClient && AppState.acmeOrderUrl) {
            log('✓ 使用步骤2已创建的 ACME 订单');
            acmeClient = AppState.acmeClient;
            orderUrl = AppState.acmeOrderUrl;

            // 根据验证方式选择对应的 challengeUrl
            if (verificationMethod === 'webserver' && AppState.http01ChallengeUrl) {
                challengeUrl = AppState.http01ChallengeUrl;
            } else if (verificationMethod === 'dns' && AppState.dns01ChallengeUrl) {
                challengeUrl = AppState.dns01ChallengeUrl;
            } else {
                throw new Error('未找到对应验证方式的挑战 URL');
            }
        } else {
            // 如果没有，重新创建（这种情况不应该发生，但作为容错处理）
            log('⚠️ 未找到步骤2的订单，重新创建...');

            // 步骤 1: 初始化 ACME 客户端
            log('正在初始化 ACME 客户端...');
            acmeClient = new AcmeClient(caProvider);
            await acmeClient.initialize();
            log('✓ ACME 客户端初始化成功');

            // 步骤 2: 创建或获取账户
            log('正在创建/获取 ACME 账户...');
            await acmeClient.createAccount('');
            log('✓ ACME 账户准备完成');

            // 步骤 3: 创建订单
            log(`正在为域名 ${domain} 创建订单...`);
            const { order, orderUrl: newOrderUrl } = await acmeClient.createOrder(domain);
            orderUrl = newOrderUrl;
            log('✓ 订单创建成功');

            // 步骤 4: 获取授权挑战
            log('正在获取授权挑战...');
            const authUrl = order.authorizations[0];
            const authorization = await acmeClient.getAuthorization(authUrl);

            // 根据验证方式选择挑战
            let challenge;

            if (verificationMethod === 'webserver') {
                challenge = authorization.challenges.find(c => c.type === 'http-01');
                if (!challenge) {
                    throw new Error('服务器不支持 HTTP-01 验证');
                }
                log('✓ HTTP-01 挑战数据获取成功');

            } else if (verificationMethod === 'dns') {
                challenge = authorization.challenges.find(c => c.type === 'dns-01');
                if (!challenge) {
                    throw new Error('服务器不支持 DNS-01 验证');
                }
                log('✓ DNS-01 挑战数据获取成功');
            }

            challengeUrl = challenge.url;
        }

        // 步骤 5: 触发挑战验证
        log('正在触发挑战验证...');
        await acmeClient.triggerChallenge(challengeUrl);
        log('✓ 验证请求已发送到 CA 服务器');

        // 步骤 6: 轮询挑战状态
        log('正在等待 CA 服务器验证（最多等待90秒）...');
        await acmeClient.pollChallengeStatus(challengeUrl);
        log('✓ 域名验证成功！');

        // 步骤 7: 生成域名密钥对
        log('正在生成域名密钥对（4096位RSA）...');
        const domainKeyPair = acmeClient.generateDomainKeyPair();
        log('✓ 域名密钥对生成完成');

        // 步骤 8: 生成 CSR
        log('正在生成证书签名请求（CSR）...');
        const csr = acmeClient.generateCSR(domain, domainKeyPair);
        log('✓ CSR 生成完成');

        // 步骤 9: 获取订单状态以获取 finalize URL
        log('正在获取订单状态...');
        const orderResponse = await acmeClient.sendJWS(orderUrl, '');
        const orderData = orderResponse.data;
        log('✓ 订单状态获取成功');

        // 步骤 10: 提交订单
        log('正在提交订单到 CA 服务器...');
        await acmeClient.finalizeOrder(orderData.finalize, csr);
        log('✓ 订单已提交');

        // 步骤 11: 等待证书签发
        log('正在等待 CA 服务器签发证书（最多等待90秒）...');
        const completedOrder = await acmeClient.pollOrderStatus(orderUrl);
        log('✓ 证书已签发！');

        // 步骤 12: 下载证书
        log('正在下载证书...');
        const certificatePem = await acmeClient.downloadCertificate(completedOrder.certificate);
        const privateKeyPem = acmeClient.exportPrivateKeyPem(domainKeyPair);
        log('✓ 证书下载完成！');
        log('');

        // 保存证书到 AppState
        AppState.realCertificate = {
            certificate: certificatePem,
            privateKey: privateKeyPem,
            domain: domain,
            provider: caProvider,
            issuedAt: new Date().toISOString()
        };

        log('========================================');
        log('🎉 证书申请成功！');
        log('========================================');
        log(`域名: ${domain}`);
        log(`CA 提供商: ${caProvider}`);
        log(`签发时间: ${new Date().toLocaleString('zh-CN')}`);
        log('证书有效期: 90天');
        log('');
        log('正在生成证书下载文件...');

    } catch (error) {
        console.error('[ACME] 证书申请失败:', error);
        log('');
        log('✗ 证书申请失败: ' + error.message);
        throw error;
    }
}


