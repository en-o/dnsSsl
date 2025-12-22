
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

// 开始验证
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
        // 真实的HTTP请求验证
        const response = await fetch(verifyUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const content = await response.text();
        const trimmedContent = content.trim();

        addLog('success', '✓ 成功访问验证文件');
        addLog('info', '获取到的内容: ' + (trimmedContent.length > 30 ? trimmedContent.substring(0, 30) + '...' : trimmedContent));

        // 验证内容是否匹配
        if (trimmedContent === challengeContent.trim()) {
            addLog('success', '✓ 验证内容匹配');
            addLog('success', '✓ Web 服务器验证通过！');
            showVerificationStatus('success', '验证成功！', 'Web 服务器配置正确，可以继续下一步');
            showContinueButton();
        } else {
            addLog('error', '✗ 验证内容不匹配');
            addLog('info', '预期内容: ' + challengeContent);
            addLog('info', '实际内容: ' + trimmedContent);
            throw new Error('验证内容不匹配');
        }
    } catch (error) {
        // 捕获CORS或网络错误
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.name === 'TypeError') {
            addLog('error', '✗ 浏览器 CORS 限制：无法直接访问验证文件');
            addLog('info', '');
            addLog('info', '请手动验证以下URL是否可访问：');
            addLog('info', verifyUrl);
            addLog('info', '');
            addLog('info', '验证方法：');
            addLog('info', '1. 在浏览器新标签页打开上述URL');
            addLog('info', '2. 或使用命令行: curl ' + verifyUrl);
            addLog('info', '3. 确认返回内容为: ' + challengeContent);
            addLog('info', '');
            addLog('error', '验证失败：由于浏览器安全限制，无法完成自动验证');
            addLog('info', '');
            addLog('warning', '解决方案：');
            addLog('info', '1. 使用命令行工具（如 certbot、acme.sh）进行实际申请');
            addLog('info', '2. 或者配置服务器允许 CORS（不推荐用于生产环境）');

            showVerificationStatus('error', '验证失败', '由于浏览器 CORS 限制，无法完成验证。请使用命令行工具进行实际证书申请。');
            throw new Error('浏览器 CORS 限制导致验证失败');
        } else {
            addLog('error', '✗ HTTP 请求失败: ' + error.message);
            addLog('info', '');
            addLog('warning', '请确认：');
            addLog('info', '1. 域名解析正确');
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
                addLog('info', '💡 重要提示：');
                addLog('warning', '建议保留此 TXT 记录，不要删除！');
                addLog('info', '原因：');
                addLog('info', '1. 证书续期时记录值基本不变，可以直接使用');
                addLog('info', '2. 即使记录值改变，也只需修改记录值即可');
                addLog('info', '3. 保留记录可大大简化后续续期操作');
                addLog('info', '4. TXT 记录不影响域名的正常使用');
                showVerificationStatus('success', '验证成功！', 'DNS 配置正确，建议保留 TXT 记录以便后续续期');
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
