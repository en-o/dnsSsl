
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

    // 显示或隐藏 DNS 记录添加说明
    const dnsInstructionBox = document.getElementById('dns-instruction-box');
    if (dnsInstructionBox) {
        if (AppState.verificationMethod === 'dns') {
            dnsInstructionBox.style.display = 'block';
            // 更新说明框中的信息
            const domain = AppState.domain || 'example.com';
            const fullRecord = '_acme-challenge.' + getDnsChallengeBaseDomain(domain);
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
        const fullDnsRecord = dnsHost + '.' + getDnsChallengeBaseDomain(domain);
        labelEl.textContent = 'DNS 记录：';
        valueEl.innerHTML = '<strong>' + fullDnsRecord + '</strong> (TXT)';
    }
}

// 重置验证状态
function resetVerificationStatus() {
    const statusContainer = document.getElementById('verification-status');
    statusContainer.innerHTML = '<div class="status-pending"><svg class="status-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><h3>正在准备 CA 验证...</h3><p>请稍候</p></div>';

    // 隐藏详情和继续按钮
    document.getElementById('verification-details-box').style.display = 'none';
    document.getElementById('verify-start-button').style.display = 'inline-block';
    document.getElementById('verify-continue-button').style.display = 'none';
}

function classifyAcmeValidationError(error, method) {
    const message = String(error?.message || error || '验证过程中发生错误');
    const normalized = message.toLowerCase();

    if (normalized.includes('caa') && (normalized.includes('servfail') || normalized.includes('dns problem') || normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('refused'))) {
        return {
            title: 'CAA DNS 查询失败',
            summary: '验证文件可能已经正确，但 CA 无法稳定查询域名的权威 DNS。',
            logs: [
                ['warning', '这是 DNS/CAA 故障，不是验证文件内容错误；不要因此反复 reload Nginx。'],
                ['info', '请稍后返回上一步创建新订单重试；如果持续出现，请检查权威 NS 可用性或联系 DNS 服务商。'],
                ['info', '可使用公共递归 DNS 查询域名的 CAA、NS 和 SOA，确认不同地区结果一致。']
            ]
        };
    }

    if (method === 'webserver' && (normalized.includes('404') || normalized.includes('unauthorized') || normalized.includes('incorrect validation') || normalized.includes('invalid response'))) {
        return {
            title: 'CA 读取到的验证文件不正确',
            summary: '请检查公网 HTTP 返回状态、文件路径和文件内容。',
            logs: [
                ['warning', '如果刚新增或修改过 Nginx location，必须先执行 nginx -t && nginx -s reload。'],
                ['info', '如果只是更新 token 文件，不需要 reload；确认 root 路径与实际写入目录一致。'],
                ['info', '验证 URL 必须返回 HTTP 200 和完全一致的纯文本内容，不能返回 301/302、404 或 HTML 页面。']
            ]
        };
    }

    if (method === 'webserver' && (normalized.includes('connection') || normalized.includes('timeout') || normalized.includes('refused'))) {
        return {
            title: 'CA 无法连接 Web 服务器',
            summary: '请检查公网 DNS、80 端口、防火墙和 Nginx 监听状态。',
            logs: [
                ['warning', '本机代理返回的 Fake-IP 不能代表公网解析结果，请使用公共 DNS 或外部网络确认。'],
                ['info', '确认域名公网 A/AAAA 记录正确，并允许 CA 从不同地区访问 TCP 80。']
            ]
        };
    }

    if (method === 'webserver' && (normalized.includes('dns problem') || normalized.includes('nxdomain') || normalized.includes('servfail') || normalized.includes('looking up a'))) {
        return {
            title: '公网 DNS 解析失败',
            summary: 'CA 无法从公共 DNS 稳定解析域名，这与本机 curl 能否打开并不是同一项检查。',
            logs: [
                ['warning', '请检查公网 A/AAAA、权威 NS 和 SOA；本机代理或 hosts 的结果不能代表 CA 所见结果。'],
                ['info', '不要反复 reload Nginx；先让公共递归 DNS 能稳定解析，再返回上一步创建新订单。']
            ]
        };
    }

    if (normalized.includes('secondary validation')) {
        return {
            title: 'CA 多地区二次验证失败',
            summary: '主验证节点可能成功，但其他地区的 CA 节点无法得到一致结果。',
            logs: [
                ['warning', '请检查权威 DNS、地域防火墙以及 80 端口是否允许全球访问。'],
                ['info', '当前挑战已经进入终态，需要返回上一步获取新的验证数据后再试。']
            ]
        };
    }

    if (method === 'dns' && (normalized.includes('txt') || normalized.includes('nxdomain') || normalized.includes('servfail'))) {
        return {
            title: 'DNS TXT 验证失败',
            summary: 'CA 没有查询到匹配的 TXT 记录，或权威 DNS 返回了异常状态。',
            logs: [
                ['warning', '确认记录名为 _acme-challenge 加基础域名，通配符记录名中不能包含 *.。'],
                ['info', '等待 DNS 生效后必须返回上一步创建新订单，因为失败挑战不能使用原 token 重试。']
            ]
        };
    }

    return {
        title: 'CA 验证失败',
        summary: message,
        logs: [['info', '请根据 CA 返回的原始错误检查验证配置；失败挑战需要返回上一步获取新 token。']]
    };
}

function addValidationGuidanceLogs(diagnosis) {
    diagnosis.logs.forEach(([type, message]) => addLog(type, message));
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
        // 使用步骤2中当前 ACME 订单的真实挑战数据，由 CA 直接验证。
        if (AppState.verificationMethod === 'webserver') {
            await verifyWebServer();
        } else if (AppState.verificationMethod === 'dns') {
            await verifyDNS();
        }
    } catch (error) {
        const diagnosis = classifyAcmeValidationError(error, AppState.verificationMethod);
        addLog('error', '验证未通过：' + (error.message || '未知错误'));
        addValidationGuidanceLogs(diagnosis);
        showVerificationStatus('error', diagnosis.title, diagnosis.summary);
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

    const acmeClient = AppState.acmeClient;
    const challengeUrl = AppState.http01ChallengeUrl;
    if (!acmeClient || !challengeUrl) {
        throw new Error('ACME 订单或 HTTP-01 挑战已失效，请返回上一步重新获取');
    }

    try {
        addLog('info', '正在通知 CA 服务器执行 HTTP-01 验证...');
        await acmeClient.triggerChallenge(challengeUrl);
        addLog('success', '✓ 验证请求已发送到 CA');
        addLog('info', '正在等待 CA 访问验证 URL（最多 90 秒）...');
        await acmeClient.pollChallengeStatus(challengeUrl);

        AppState.acmeValidatedChallengeUrl = challengeUrl;
        addLog('success', '✓ CA 已确认验证文件内容匹配');
        addLog('success', '✓ Web 服务器验证通过！');
        showVerificationStatus('success', '验证成功！', 'CA 已完成 HTTP-01 验证，可以继续下一步');
        showContinueButton();
    } catch (error) {
        AppState.acmeValidatedChallengeUrl = null;
        addLog('error', '✗ CA 验证失败: ' + error.message);
        addLog('info', '验证 URL: ' + verifyUrl);
        if (error.message.includes('挑战验证失败') || error.message.includes('挑战状态异常')) {
            if (typeof invalidateActiveAcmeOrder === 'function') {
                invalidateActiveAcmeOrder();
            }
            addLog('warning', '当前挑战已进入不可重试状态，请返回上一步获取新的验证文件。');
        }
        throw error;
    }
}

// DNS 验证
async function verifyDNS() {
    const domain = AppState.domain;
    const dnsValue = AppState.dnsValue;
    const challengeUrl = AppState.dns01ChallengeUrl;
    const acmeClient = AppState.acmeClient;

    if (!dnsValue) {
        throw new Error('DNS 验证值缺失');
    }
    if (!acmeClient || !challengeUrl) {
        throw new Error('ACME 订单或 DNS-01 挑战已失效，请返回上一步重新获取');
    }

    const fullDomain = '_acme-challenge.' + getDnsChallengeBaseDomain(domain);
    addLog('info', '开始 DNS-01 验证...');
    addLog('info', 'TXT 记录: ' + fullDomain);
    addLog('info', '正在通知 CA 查询 DNS 记录...');

    try {
        await acmeClient.triggerChallenge(challengeUrl);
        addLog('success', '✓ 验证请求已发送到 CA');
        addLog('info', '正在等待 DNS 验证结果（最多 90 秒）...');
        await acmeClient.pollChallengeStatus(challengeUrl);

        AppState.acmeValidatedChallengeUrl = challengeUrl;
        addLog('success', '✓ CA 已确认 DNS TXT 记录匹配');
        showVerificationStatus('success', '验证成功！', 'CA 已完成 DNS-01 验证，可以继续');
        showContinueButton();
    } catch (error) {
        AppState.acmeValidatedChallengeUrl = null;
        addLog('error', '✗ CA DNS 验证失败: ' + error.message);
        if (error.message.includes('挑战验证失败') || error.message.includes('挑战状态异常')) {
            if (typeof invalidateActiveAcmeOrder === 'function') {
                invalidateActiveAcmeOrder();
            }
            addLog('warning', '当前挑战已失效，请返回上一步获取新的 TXT 记录值。');
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

    statusContainer.innerHTML = '<div class="' + colorClass + '">' + icon + '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(message) + '</p></div>';
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

    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = '[' + timestamp + ']';
    const iconEl = document.createElement('span');
    iconEl.className = 'log-icon';
    iconEl.textContent = icon;
    const messageEl = document.createElement('span');
    messageEl.className = 'log-message';
    messageEl.textContent = message;
    logEntry.append(timeEl, iconEl, messageEl);

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
            addLog('info', '完整域名: ' + challengeData.host + '.' + getDnsChallengeBaseDomain(domain));

            // 更新 UI 中的 DNS 记录值
            const dnsInstructionBox = document.getElementById('dns-instruction-box');
            if (dnsInstructionBox) {
                dnsInstructionBox.style.display = 'block';
                const fullRecordEl = document.getElementById('dns-full-record');
                const recordValueEl = document.getElementById('dns-record-value');
                if (fullRecordEl) fullRecordEl.textContent = challengeData.host + '.' + getDnsChallengeBaseDomain(domain);
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
            const entry = document.createElement('div');
            entry.textContent = `[${timestamp}] ${message}`;
            logEl.appendChild(entry);
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

        // 步骤 5-6: 当前挑战若尚未由 CA 验证，再触发并轮询
        if (AppState.acmeValidatedChallengeUrl === challengeUrl) {
            log('✓ 复用上一步已通过的 CA 验证');
        } else {
            log('正在触发挑战验证...');
            await acmeClient.triggerChallenge(challengeUrl);
            log('✓ 验证请求已发送到 CA 服务器');
            log('正在等待 CA 服务器验证（最多等待90秒）...');
            await acmeClient.pollChallengeStatus(challengeUrl);
            AppState.acmeValidatedChallengeUrl = challengeUrl;
            log('✓ 域名验证成功！');
        }

        // 步骤 7: 生成域名密钥对
        log('正在生成域名密钥对（2048位 RSA）...');
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
        if (typeof clearSSLCertCache === 'function') {
            clearSSLCertCache(domain);
        }
        if (typeof clearActiveAcmeOrder === 'function') {
            clearActiveAcmeOrder();
        }

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


