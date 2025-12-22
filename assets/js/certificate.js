
// ==================== 证书生成相关功能 ====================

// ==================== 生成证书文件下载列表 ====================
function generateCertificateFilesList(format) {
    const filesListContainer = document.getElementById('cert-files-list');
    if (!filesListContainer) return;

    const domain = AppState.domain || 'example.com';

    // 生成文件列表HTML
    const filesHtml = format.files.map(file => {
        // 根据域名生成新的文件名
        const newFileName = generateDomainBasedFileName(file.name, domain);
        // 生成更真实的证书内容
        const certContent = generateRealisticCertificateContent(file.name, domain);

        return `
            <div class="cert-file-item">
                <div class="cert-file-info">
                    <div class="cert-file-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="cert-file-details">
                        <div class="cert-file-name">${newFileName}</div>
                        <div class="cert-file-desc">${file.description}</div>
                    </div>
                </div>
                <button class="btn btn-secondary btn-download" onclick='downloadCertificateFile("${newFileName}", \`${certContent.replace(/`/g, '\\`')}\`)'>
                    下载
                </button>
            </div>
        `;
    }).join('');

    filesListContainer.innerHTML = filesHtml;
}

// 根据域名生成文件名
function generateDomainBasedFileName(originalFileName, domain) {
    // 移除域名中的通配符
    const cleanDomain = domain.replace('*.', '');

    // 提取文件扩展名
    const ext = originalFileName.split('.').pop();

    // 所有文件统一命名为：域名.扩展名
    return `${cleanDomain}.${ext}`;
}

// ==================== 生成真实的证书内容 ====================
function generateRealisticCertificateContent(fileName, domain) {
    const cleanDomain = domain.replace('*.', '');
    const timestamp = new Date().toISOString();
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + 90); // Let's Encrypt 90天有效期

    // 生成基于域名的确定性序列号
    const serialNumber = generateSerialNumber(domain);

    // 根据文件扩展名判断文件类型
    if (fileName.endsWith('.key')) {
        // 私钥文件 (.key)
        return `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
CwIDAQABAoIBAHg${generateRandomBase64(64)}
${generateRandomBase64(64)}==
-----END PRIVATE KEY-----`;
    } else if (fileName.endsWith('.pem') || fileName.endsWith('.crt') || fileName.endsWith('.cer')) {
        // 证书文件 (.pem, .crt, .cer)
        return `-----BEGIN CERTIFICATE-----
MIIFXTCCBEWgAwIBAgISBN${serialNumber.substring(0, 20)}MAoGCCqGSM49BAMC
MBgxCzAJBgNVBAYTAlVTMRkwFwYDVQQKExBMZXQncyBFbmNyeXB0MSswKQYDVQQD
EyJMZXQncyBFbmNyeXB0IEF1dGhvcml0eSBYMzAeFw0${formatDate(notBefore)}WhcNMj
Q${formatDate(notAfter)}WjAaMRgwFgYDVQQDEw8ke3YyfS5leGFtcGxlLmNvbTBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABK${generateRandomBase64(64)}
${generateRandomBase64(64)}KNjwCAwEAAaOCAmYwggJiMA4GA1UdDwEB/wQEAwIFoDAdBgNVHSUE
FjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADAdBgNVHQ4EFgQU
${generateRandomBase64(32)}MGYGCCsGAQUF
BwEBBFowWDAiBggrBgEFBQcwAYYWaHR0cDovL29jc3AuZGlnaWNlcnQuY29tMDIG
CCsGAQUFBzAChiZodHRwOi8vY2FjZXJ0cy5kaWdpY2VydC5jb20vZGNzYS1yMy5j
cnQwGgYDVR0RBBMwEYIPd3d3LmV4YW1wbGUuY29tMEwGA1UdIARFMEMwNwYJYIZI
AYb9bAEBMCowKAYIKwYBBQUHAgEWHGh0dHBzOi8vd3d3LmRpZ2ljZXJ0LmNvbS9D
UFMwCAYGZ4EMAQIBMIIBBAYKKwYBBAHWeQIEAgSB9QSB8gDwAHYApLkJkLQYWBSH
uxOizGdwCjw1mAT5G9+443fNDsgN3BAAAAGMm8bMZwAABAMARzBFAiEA${generateRandomBase64(44)}
AiA${generateRandomBase64(44)}AHYAVYHUwhaQNgFK
6gubVzxT8MDkOHhwJQgXL6OqHQcT0wwAAAGMm8bMgAAAQDAEcwRQIhAO${generateRandomBase64(43)}
AiBN${generateRandomBase64(44)}MAoGCCqGSM49BAMC
A0gAMEUCIQD${generateRandomBase64(43)}AiAa
${generateRandomBase64(64)}
-----END CERTIFICATE-----`;
    } else if (fileName.endsWith('.pfx') || fileName.endsWith('.p12')) {
        // PKCS#12 格式（二进制，这里用文本说明）
        return `此文件为二进制格式的 PKCS#12 证书文件。

文件信息：
- 格式: PKCS#12
- 域名: ${cleanDomain}
- 包含: 私钥 + 证书链
- 生成时间: ${timestamp}
- 默认密码: (无密码)

⚠️  注意：实际环境中，请为 PFX 文件设置强密码保护！

使用方法：
1. IIS: 导入到"服务器证书"
2. Windows: 双击安装到证书存储
3. Java Keystore: 使用 keytool 导入
4. Tomcat: 配置在 server.xml 中

导入示例：
- Windows IIS: 双击 ${fileName} 文件，按提示导入
- Tomcat: 在 server.xml 的 Connector 中配置 certificateKeystoreFile

[二进制数据占位符 - 实际文件应为二进制格式]
`;
    } else if (fileName.endsWith('.jks')) {
        // Java KeyStore 格式（二进制）
        return `此文件为二进制格式的 Java KeyStore 文件。

文件信息：
- 格式: JKS (Java KeyStore)
- 域名: ${cleanDomain}
- 包含: 私钥 + 证书链
- 生成时间: ${timestamp}
- 默认密码: changeit

⚠️  注意：实际环境中，请设置强密码保护 JKS 文件！

使用方法：
1. Spring Boot: 配置在 application.properties 中
2. Tomcat: 配置在 server.xml 中
3. 其他 Java 应用: 使用 KeyStore API 加载

Spring Boot 配置示例：
server.port=8443
server.ssl.enabled=true
server.ssl.key-store=classpath:${fileName}
server.ssl.key-store-password=changeit
server.ssl.key-store-type=JKS
server.ssl.key-alias=tomcat

[二进制数据占位符 - 实际文件应为二进制格式]
`;
    } else if (fileName.endsWith('.csr')) {
        // 证书签名请求
        return `-----BEGIN CERTIFICATE REQUEST-----
MIICvDCCAaQCAQAwdzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWEx
FjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xFTATBgNVBAoMDEV4YW1wbGUgSW5jLjEk
MCIGA1UEAwwbJHtjbGVhbkRvbWFpbn0wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw
ggEKAoIBAQC${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
${generateRandomBase64(64)}
CwIDAQABoAAwDQYJKoZIhvcNAQELBQADggEBAF${generateRandomBase64(64)}
${generateRandomBase64(64)}==
-----END CERTIFICATE REQUEST-----`;
    } else {
        // 默认通用说明
        return `SSL 证书文件
==================

文件名: ${fileName}
域名: ${cleanDomain}
生成时间: ${timestamp}

⚠️  提示：这是一个演示文件。
实际环境中，请使用 certbot 或 acme.sh 等工具向 Let's Encrypt 申请真实证书。

示例命令：
certbot certonly --webserver -d ${cleanDomain}
或
acme.sh --issue -d ${cleanDomain} --webroot /var/www/html
`;
    }
}

// 生成序列号
function generateSerialNumber(domain) {
    const hash = simpleHash(domain);
    return hash.toString(16).toUpperCase().padStart(32, '0').substring(0, 32);
}

// 生成随机Base64字符串（用于模拟证书内容）
function generateRandomBase64(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 格式化日期为证书格式
function formatDate(date) {
    const year = date.getFullYear().toString().substring(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

// ==================== 下载单个证书文件 ====================
function downloadCertificateFile(fileName, content) {
    // 创建Blob对象
    const blob = new Blob([content], { type: 'text/plain' });

    // 创建下载链接
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    // 清理
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ==================== 下载所有证书文件（ZIP）====================
async function downloadAllCertificates() {
    // 检查JSZip是否加载
    if (typeof JSZip === 'undefined') {
        alert('ZIP库未加载，请刷新页面重试');
        return;
    }

    const certFormatsData = JSON.parse(document.getElementById('cert-formats-data').textContent);
    const selectedFormat = certFormatsData.formats.find(f => f.id === AppState.certFormat);

    if (!selectedFormat) {
        alert('未找到证书格式信息');
        return;
    }

    const domain = AppState.domain || 'example.com';
    const cleanDomain = domain.replace('*.', '');

    try {
        // 显示加载提示
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="rotating" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/><path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> 打包中...';

        // 创建ZIP对象
        const zip = new JSZip();
        const folder = zip.folder(cleanDomain);

        // 添加所有证书文件到ZIP
        selectedFormat.files.forEach(file => {
            const newFileName = generateDomainBasedFileName(file.name, domain);
            const content = generateRealisticCertificateContent(file.name, domain);
            folder.file(newFileName, content);
        });

        // 添加README文件
        const readmeContent = `SSL 证书文件包
==================

域名: ${cleanDomain}
格式: ${selectedFormat.name}
生成时间: ${new Date().toLocaleString('zh-CN')}

文件说明:
${selectedFormat.files.map(f => `- ${generateDomainBasedFileName(f.name, domain)}: ${f.description}`).join('\n')}

⚠️  重要提示:
这是一个演示性质的SSL证书申请助手。
实际生产环境中，请使用以下工具向 Let's Encrypt 申请真实证书：

1. Certbot (推荐)
   certbot certonly --webserver -d ${cleanDomain}

2. acme.sh
   acme.sh --issue -d ${cleanDomain} --webroot /var/www/html

3. 其他 ACME 客户端
   https://letsencrypt.org/docs/client-options/

安装指南:
${selectedFormat.installation_guide}
`;
        folder.file('README.txt', readmeContent);

        // 生成ZIP文件
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9
            }
        });

        // 生成文件名：时间+域名.zip
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const zipFileName = `${timestamp}_${cleanDomain}_certificates.zip`;

        // 下载ZIP文件
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // 恢复按钮
        btn.disabled = false;
        btn.innerHTML = originalText;
    } catch (error) {
        console.error('打包失败:', error);
        alert('证书打包失败：' + error.message);

        // 恢复按钮
        const btn = event.currentTarget;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
