
// ==================== ACME 集成模块 ====================
// 将 ACME 客户端与验证流程集成

/**
 * 使用 ACME 协议申请真实的 SSL 证书
 */
async function requestRealCertificate() {
    const domain = AppState.domain;
    const caProvider = AppState.acmeProvider;
    const verificationMethod = AppState.verificationMethod;

    if (!domain) {
        alert('请先输入域名');
        return;
    }

    // 创建进度提示
    const progressContainer = document.getElementById('acme-progress');
    if (!progressContainer) {
        console.error('未找到进度容器元素');
        return;
    }

    progressContainer.innerHTML = `
        <div class="acme-progress-box">
            <h4>正在申请证书...</h4>
            <div id="acme-log" class="acme-log"></div>
            <div class="progress-bar">
                <div id="acme-progress-bar" class="progress-fill" style="width: 0%"></div>
            </div>
            <div id="acme-status" class="acme-status">初始化中...</div>
        </div>
    `;

    const logEl = document.getElementById('acme-log');
    const progressBar = document.getElementById('acme-progress-bar');
    const statusEl = document.getElementById('acme-status');

    function addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logClass = type === 'error' ? 'log-error' : type === 'success' ? 'log-success' : 'log-info';
        logEl.innerHTML += `<div class="${logClass}">[${timestamp}] ${message}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
    }

    function updateProgress(percent, status) {
        progressBar.style.width = `${percent}%`;
        statusEl.textContent = status;
    }

    try {
        // 步骤 1: 初始化 ACME 客户端
        addLog('正在初始化 ACME 客户端...');
        updateProgress(5, '初始化 ACME 客户端');

        const acmeClient = new AcmeClient(caProvider);
        await acmeClient.initialize();

        addLog(`✓ ACME 客户端初始化成功 (CA: ${caProvider})`, 'success');
        updateProgress(15, 'ACME 客户端初始化完成');

        // 步骤 2: 创建或获取账户
        addLog('正在创建/获取 ACME 账户...');
        updateProgress(20, '创建/获取账户');

        await acmeClient.createAccount(''); // 可以提供邮箱
        addLog('✓ ACME 账户准备完成', 'success');
        updateProgress(25, '账户创建完成');

        // 步骤 3: 创建订单
        addLog(`正在为域名 ${domain} 创建订单...`);
        updateProgress(30, '创建订单');

        const { order, orderUrl } = await acmeClient.createOrder(domain);
        addLog('✓ 订单创建成功', 'success');
        updateProgress(35, '订单创建完成');

        // 步骤 4: 获取授权挑战
        addLog('正在获取授权挑战...');
        updateProgress(40, '获取授权挑战');

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
            addLog('✓ HTTP-01 挑战数据获取成功', 'success');
            addLog(`验证文件名: ${challengeData.filename}`);
            addLog(`验证内容: ${challengeData.content}`);

            // 更新 AppState，以便在步骤2中显示验证信息
            AppState.challengeFilename = challengeData.filename;
            AppState.challengeContent = challengeData.content;

        } else if (verificationMethod === 'dns') {
            // DNS-01 挑战
            challenge = authorization.challenges.find(c => c.type === 'dns-01');
            if (!challenge) {
                throw new Error('服务器不支持 DNS-01 验证');
            }

            challengeData = acmeClient.getDns01ChallengeData(challenge);
            addLog('✓ DNS-01 挑战数据获取成功', 'success');
            addLog(`DNS 主机记录: ${challengeData.host}`);
            addLog(`TXT 记录值: ${challengeData.value}`);

            // 更新 AppState
            AppState.dnsValue = challengeData.value;
        }

        updateProgress(45, '挑战数据获取完成');

        // 步骤 5: 等待用户完成验证
        addLog('⚠ 请确保已经完成验证配置（HTTP-01 验证文件 或 DNS TXT 记录）', 'info');
        addLog('点击"开始验证"按钮继续...', 'info');
        updateProgress(50, '等待用户完成验证配置');

        // 在这里暂停，等待用户点击验证按钮
        // 将挑战信息保存到 AppState，以便后续使用
        AppState.acmeClient = acmeClient;
        AppState.challenge = challenge;
        AppState.orderUrl = orderUrl;
        AppState.order = order;

        // 显示"开始验证"按钮
        const continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = '开始验证并申请证书';
        continueBtn.onclick = continueAcmeCertificateRequest;
        progressContainer.appendChild(continueBtn);

    } catch (error) {
        addLog(`✗ 错误: ${error.message}`, 'error');
        updateProgress(0, '申请失败');
        console.error('[ACME] 申请证书失败:', error);

        // 显示错误提示
        alert(`证书申请失败: ${error.message}`);
    }
}

/**
 * 继续 ACME 证书申请流程（在用户完成验证后）
 */
async function continueAcmeCertificateRequest() {
    const logEl = document.getElementById('acme-log');
    const progressBar = document.getElementById('acme-progress-bar');
    const statusEl = document.getElementById('acme-status');

    function addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logClass = type === 'error' ? 'log-error' : type === 'success' ? 'log-success' : 'log-info';
        logEl.innerHTML += `<div class="${logClass}">[${timestamp}] ${message}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
    }

    function updateProgress(percent, status) {
        progressBar.style.width = `${percent}%`;
        statusEl.textContent = status;
    }

    try {
        const acmeClient = AppState.acmeClient;
        const challenge = AppState.challenge;
        const orderUrl = AppState.orderUrl;
        const order = AppState.order;
        const domain = AppState.domain;

        // 步骤 6: 触发挑战验证
        addLog('正在触发挑战验证...');
        updateProgress(55, '触发验证');

        await acmeClient.triggerChallenge(challenge.url);
        addLog('✓ 验证请求已发送', 'success');
        updateProgress(60, '验证请求已发送');

        // 步骤 7: 轮询挑战状态
        addLog('正在等待 CA 服务器验证...');
        updateProgress(65, '等待验证结果');

        await acmeClient.pollChallengeStatus(challenge.url);
        addLog('✓ 域名验证成功！', 'success');
        updateProgress(70, '域名验证成功');

        // 步骤 8: 生成域名密钥对
        addLog('正在生成域名密钥对（4096位RSA）...');
        updateProgress(75, '生成域名密钥对');

        const domainKeyPair = acmeClient.generateDomainKeyPair();
        addLog('✓ 域名密钥对生成完成', 'success');
        updateProgress(80, '密钥对生成完成');

        // 步骤 9: 生成 CSR
        addLog('正在生成证书签名请求（CSR）...');
        updateProgress(85, '生成 CSR');

        const csr = acmeClient.generateCSR(domain, domainKeyPair);
        addLog('✓ CSR 生成完成', 'success');
        updateProgress(90, 'CSR 生成完成');

        // 步骤 10: 提交订单
        addLog('正在提交订单到 CA 服务器...');
        updateProgress(92, '提交订单');

        await acmeClient.finalizeOrder(order.finalize, csr);
        addLog('✓ 订单已提交', 'success');

        // 步骤 11: 等待证书签发
        addLog('正在等待 CA 服务器签发证书...');
        updateProgress(94, '等待证书签发');

        const completedOrder = await acmeClient.pollOrderStatus(orderUrl);
        addLog('✓ 证书已签发！', 'success');
        updateProgress(96, '证书签发完成');

        // 步骤 12: 下载证书
        addLog('正在下载证书...');
        updateProgress(98, '下载证书');

        const certificatePem = await acmeClient.downloadCertificate(completedOrder.certificate);
        const privateKeyPem = acmeClient.exportPrivateKeyPem(domainKeyPair);

        addLog('✓ 证书下载完成！', 'success');
        updateProgress(100, '证书申请成功！');

        // 保存证书到 AppState
        AppState.realCertificate = {
            certificate: certificatePem,
            privateKey: privateKeyPem,
            domain: domain,
            provider: AppState.acmeProvider,
            issuedAt: new Date().toISOString()
        };

        addLog('========================================', 'success');
        addLog('🎉 证书申请成功！', 'success');
        addLog('========================================', 'success');
        addLog('现在可以前往"选择证书格式"步骤下载证书文件', 'info');

        // 显示"下一步"按钮
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = '下一步：选择证书格式';
        nextBtn.onclick = () => nextStep(3);
        document.getElementById('acme-progress').appendChild(nextBtn);

    } catch (error) {
        addLog(`✗ 错误: ${error.message}`, 'error');
        updateProgress(0, '申请失败');
        console.error('[ACME] 证书申请失败:', error);

        alert(`证书申请失败: ${error.message}\n\n请检查验证配置是否正确，然后重试。`);
    }
}

// 导出到全局
window.requestRealCertificate = requestRealCertificate;
window.continueAcmeCertificateRequest = continueAcmeCertificateRequest;
