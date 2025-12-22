
// ==================== ACME 客户端库 ====================
// 实现 ACME v2 协议，支持 Let's Encrypt 和 ZeroSSL
// 使用 forge.js 处理加密操作

/**
 * 生成浏览器指纹（用于隔离不同用户的ACME账户）
 * 避免所有用户共用一个账户导致速率限制
 */
function generateBrowserFingerprint() {
    // 尝试从localStorage获取已保存的指纹
    let fingerprint = localStorage.getItem('browser_fingerprint');

    if (fingerprint) {
        return fingerprint;
    }

    // 生成新的指纹：基于浏览器特征
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        !!window.sessionStorage,
        !!window.localStorage,
        navigator.hardwareConcurrency || 'unknown',
        // 添加随机成分，确保每个浏览器会话有唯一ID
        Math.random().toString(36).substring(2, 15)
    ];

    // 生成哈希
    const hash = simpleHashForFingerprint(components.join('|||'));
    fingerprint = hash.toString(36).substring(0, 12);

    // 保存到localStorage
    localStorage.setItem('browser_fingerprint', fingerprint);

    console.log('[Fingerprint] 浏览器指纹已生成:', fingerprint);
    return fingerprint;
}

/**
 * 简单哈希函数（用于指纹生成）
 */
function simpleHashForFingerprint(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * ACME 客户端
 * 用于向 Let's Encrypt 或 ZeroSSL 申请 SSL 证书
 */
class AcmeClient {
    constructor(caProvider = 'letsencrypt') {
        // ACME 服务器目录
        this.directoryUrls = {
            'letsencrypt': 'https://acme-v02.api.letsencrypt.org/directory',
            'letsencrypt-staging': 'https://acme-staging-v02.api.letsencrypt.org/directory',
            'zerossl': 'https://acme.zerossl.com/v2/DV90/directory'
        };

        this.caProvider = caProvider;
        this.directoryUrl = this.directoryUrls[caProvider];
        this.directory = null;
        this.accountKeyPair = null; // forge keypair
        this.accountUrl = null;
        this.nonce = null;

        // 生成浏览器指纹，用于账户隔离
        this.browserFingerprint = generateBrowserFingerprint();
        console.log('[ACME] 使用浏览器指纹:', this.browserFingerprint);
    }

    /**
     * 初始化 ACME 客户端
     */
    async initialize() {
        console.log('[ACME] 正在初始化 ACME 客户端...');
        console.log('[ACME] CA Provider:', this.caProvider);
        console.log('[ACME] Directory URL:', this.directoryUrl);

        // 检查 forge.js 是否加载
        if (typeof forge === 'undefined') {
            throw new Error('forge.js 库未加载，无法进行加密操作');
        }

        // 获取 ACME 目录
        try {
            const response = await fetch(this.directoryUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this.directory = await response.json();
            console.log('[ACME] 目录获取成功:', this.directory);
        } catch (error) {
            console.error('[ACME] 获取 ACME 目录失败:', error);
            throw new Error(`无法连接到 ACME 服务器: ${error.message}`);
        }

        // 获取初始 nonce
        await this.getNonce();

        // 生成或加载账户密钥对
        await this.loadOrCreateAccountKey();
    }

    /**
     * 获取 Nonce（防重放攻击）
     */
    async getNonce() {
        if (!this.directory.newNonce) {
            throw new Error('ACME 目录中没有 newNonce URL');
        }

        try {
            const response = await fetch(this.directory.newNonce, {
                method: 'HEAD'
            });

            this.nonce = response.headers.get('Replay-Nonce');
            console.log('[ACME] Nonce 获取成功');
        } catch (error) {
            console.error('[ACME] 获取 Nonce 失败:', error);
            throw new Error('无法获取 Nonce，请检查网络连接');
        }
    }

    /**
     * 生成或加载账户密钥对
     */
    async loadOrCreateAccountKey() {
        // 使用浏览器指纹作为key的一部分，隔离不同用户的账户
        const storageKey = `acme_account_key_${this.caProvider}_${this.browserFingerprint}`;
        const savedKey = localStorage.getItem(storageKey);

        if (savedKey) {
            console.log('[ACME] 从 localStorage 加载账户密钥（指纹:', this.browserFingerprint, ')');
            try {
                const privateKeyPem = savedKey;
                this.accountKeyPair = {
                    privateKey: forge.pki.privateKeyFromPem(privateKeyPem),
                    publicKey: forge.pki.setRsaPublicKey(
                        forge.pki.privateKeyFromPem(privateKeyPem).n,
                        forge.pki.privateKeyFromPem(privateKeyPem).e
                    )
                };
            } catch (error) {
                console.warn('[ACME] 加载账户密钥失败，将生成新密钥:', error);
                localStorage.removeItem(storageKey);
                await this.loadOrCreateAccountKey();
                return;
            }
        } else {
            console.log('[ACME] 生成新的账户密钥对（2048位RSA）...');
            this.accountKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 });

            // 保存到 localStorage（使用指纹隔离）
            const privateKeyPem = forge.pki.privateKeyToPem(this.accountKeyPair.privateKey);
            localStorage.setItem(storageKey, privateKeyPem);
            console.log('[ACME] 账户密钥已保存到 localStorage（指纹:', this.browserFingerprint, ')');
        }
    }

    /**
     * 将公钥转换为 JWK 格式
     */
    publicKeyToJWK(publicKey) {
        // 将 BigInteger 转换为字节数组
        let nBytes = publicKey.n.toByteArray();
        let eBytes = publicKey.e.toByteArray();

        // 移除前导零（如果有符号位）
        // RSA 的 BigInteger 可能在正数前添加 0x00 作为符号位
        if (nBytes[0] === 0 && nBytes.length > 1) {
            nBytes = nBytes.slice(1);
        }
        if (eBytes[0] === 0 && eBytes.length > 1) {
            eBytes = eBytes.slice(1);
        }

        // 转换为字节字符串（用于 base64 编码）
        let nByteString = '';
        for (let i = 0; i < nBytes.length; i++) {
            nByteString += String.fromCharCode(nBytes[i] & 0xff);
        }

        let eByteString = '';
        for (let i = 0; i < eBytes.length; i++) {
            eByteString += String.fromCharCode(eBytes[i] & 0xff);
        }

        // Base64 编码并转换为 Base64url
        const n = forge.util.encode64(nByteString);
        const e = forge.util.encode64(eByteString);

        return {
            kty: 'RSA',
            n: n.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            e: e.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        };
    }

    /**
     * Base64url 编码
     */
    base64url(data) {
        // 注意：data 可能是：
        // 1. 普通字符串（如 JSON）-> 需要先转换为 UTF-8 字节
        // 2. 二进制字节字符串（如 digest.bytes(), 签名）-> 直接编码
        // forge.util.encode64 接受字节字符串作为参数

        // 如果 data 看起来像普通文本（而非二进制数据），转换为 UTF-8
        // 简单判断：如果是 JSON 字符串开头，则视为文本
        if (typeof data === 'string' && (data.startsWith('{') || data.startsWith('['))) {
            data = forge.util.encodeUtf8(data);
        }
        // 否则假设是二进制字节字符串，直接编码

        return forge.util.encode64(data)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * 创建 JWS（JSON Web Signature）
     */
    async createJWS(url, payload) {
        if (!this.nonce) {
            await this.getNonce();
        }

        // JWS Protected Header
        const protected_header = {
            alg: 'RS256',
            nonce: this.nonce,
            url: url
        };

        // 如果有账户 URL，使用 kid；否则使用 jwk
        if (this.accountUrl) {
            protected_header.kid = this.accountUrl;
        } else {
            protected_header.jwk = this.publicKeyToJWK(this.accountKeyPair.publicKey);
        }

        // ACME 规范要求 JSON 对象的键按字母顺序排列
        // 为了确保 JWK 格式正确，我们需要重新排序
        const orderedHeader = this.orderObject(protected_header);

        console.log('[ACME] JWS Protected Header:', orderedHeader);

        // Base64url 编码（使用排序后的对象）
        const protectedB64 = this.base64url(JSON.stringify(orderedHeader));

        // Payload 也需要排序
        let payloadB64;
        if (payload) {
            const orderedPayload = this.orderObject(payload);
            payloadB64 = this.base64url(JSON.stringify(orderedPayload));
        } else {
            payloadB64 = '';
        }

        console.log('[ACME] Protected (base64url):', protectedB64.substring(0, 50) + '...');
        console.log('[ACME] Payload (base64url):', payloadB64.substring(0, 50) + '...');

        // 签名
        const signatureInput = `${protectedB64}.${payloadB64}`;
        const md = forge.md.sha256.create();
        md.update(signatureInput, 'utf8');

        // 使用私钥签名（返回的是字节字符串）
        const signatureBytes = this.accountKeyPair.privateKey.sign(md);

        // 直接对字节字符串进行 base64url 编码（不要再用 encodeUtf8）
        const signatureB64 = forge.util.encode64(signatureBytes)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        console.log('[ACME] Signature (base64url):', signatureB64.substring(0, 50) + '...');

        const jws = {
            protected: protectedB64,
            payload: payloadB64,
            signature: signatureB64
        };

        console.log('[ACME] JWS 签名完成');
        return jws;
    }

    /**
     * 递归地对对象的键进行排序（ACME 规范要求）
     */
    orderObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.orderObject(item));
        }

        const ordered = {};
        Object.keys(obj).sort().forEach(key => {
            ordered[key] = this.orderObject(obj[key]);
        });

        return ordered;
    }

    /**
     * 发送 JWS 请求
     */
    async sendJWS(url, payload) {
        const jws = await this.createJWS(url, payload);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/jose+json'
                },
                body: JSON.stringify(jws)
            });

            // 更新 nonce
            const newNonce = response.headers.get('Replay-Nonce');
            if (newNonce) {
                this.nonce = newNonce;
            }

            let responseData;
            const contentType = response.headers.get('Content-Type');

            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else if (contentType && contentType.includes('application/pem-certificate-chain')) {
                // 证书链是 PEM 格式的文本
                responseData = await response.text();
            } else {
                responseData = await response.text();
            }

            if (!response.ok) {
                console.error('[ACME] 请求失败:', responseData);
                const errorDetail = responseData.detail || responseData.message || response.statusText;
                throw new Error(`ACME 请求失败: ${errorDetail}`);
            }

            return {
                data: responseData,
                headers: response.headers,
                location: response.headers.get('Location')
            };
        } catch (error) {
            console.error('[ACME] 网络请求失败:', error);
            throw error;
        }
    }

    /**
     * 创建或获取账户
     */
    async createAccount(email) {
        console.log('[ACME] 正在创建/获取账户（指纹:', this.browserFingerprint, ')...');

        // 检查是否已有账户（使用指纹隔离）
        const storageKey = `acme_account_url_${this.caProvider}_${this.browserFingerprint}`;
        const savedAccountUrl = localStorage.getItem(storageKey);

        if (savedAccountUrl) {
            this.accountUrl = savedAccountUrl;
            console.log('[ACME] 使用已存在的账户:', this.accountUrl);
            return;
        }

        const payload = {
            termsOfServiceAgreed: true
        };

        if (email) {
            payload.contact = [`mailto:${email}`];
        }

        const response = await this.sendJWS(this.directory.newAccount, payload);
        this.accountUrl = response.location;

        // 保存账户 URL（使用指纹隔离）
        localStorage.setItem(storageKey, this.accountUrl);

        console.log('[ACME] 账户创建成功:', this.accountUrl);
        console.log('[ACME] 此账户仅供当前浏览器使用，不会与其他用户冲突');
    }

    /**
     * 创建订单
     */
    async createOrder(domain) {
        console.log('[ACME] 正在创建订单:', domain);

        const payload = {
            identifiers: [
                {
                    type: 'dns',
                    value: domain
                }
            ]
        };

        const response = await this.sendJWS(this.directory.newOrder, payload);
        console.log('[ACME] 订单创建成功:', response.data);

        return {
            order: response.data,
            orderUrl: response.location
        };
    }

    /**
     * 获取授权挑战
     */
    async getAuthorization(authUrl) {
        console.log('[ACME] 正在获取授权:', authUrl);

        const response = await this.sendJWS(authUrl, '');
        console.log('[ACME] 授权信息:', response.data);

        return response.data;
    }

    /**
     * 获取 HTTP-01 挑战的 token 和验证内容
     */
    getHttp01ChallengeData(challenge) {
        const token = challenge.token;

        // 计算 keyAuthorization = token + '.' + base64url(SHA256(JWK))
        const jwk = this.publicKeyToJWK(this.accountKeyPair.publicKey);
        // JWK 必须按字母顺序排列后再计算 thumbprint
        const orderedJwk = this.orderObject(jwk);
        const jwkJson = JSON.stringify(orderedJwk);
        const md = forge.md.sha256.create();
        md.update(jwkJson, 'utf8');
        const thumbprint = this.base64url(md.digest().bytes());

        const keyAuthorization = `${token}.${thumbprint}`;

        return {
            token: token,
            keyAuthorization: keyAuthorization,
            filename: token,
            content: keyAuthorization
        };
    }

    /**
     * 获取 DNS-01 挑战的 TXT 记录值
     */
    getDns01ChallengeData(challenge) {
        const token = challenge.token;

        // 计算 keyAuthorization
        const jwk = this.publicKeyToJWK(this.accountKeyPair.publicKey);
        // JWK 必须按字母顺序排列后再计算 thumbprint
        const orderedJwk = this.orderObject(jwk);
        const jwkJson = JSON.stringify(orderedJwk);
        const md1 = forge.md.sha256.create();
        md1.update(jwkJson, 'utf8');
        const thumbprint = this.base64url(md1.digest().bytes());

        const keyAuthorization = `${token}.${thumbprint}`;

        // 对 keyAuthorization 做 SHA256 哈希，然后 base64url 编码
        const md2 = forge.md.sha256.create();
        md2.update(keyAuthorization, 'utf8');
        const dnsValue = this.base64url(md2.digest().bytes());

        return {
            host: '_acme-challenge',
            value: dnsValue
        };
    }

    /**
     * 触发挑战验证
     */
    async triggerChallenge(challengeUrl) {
        console.log('[ACME] 正在触发挑战验证:', challengeUrl);

        const response = await this.sendJWS(challengeUrl, {});
        console.log('[ACME] 挑战已触发:', response.data);

        return response.data;
    }

    /**
     * 轮询挑战状态
     */
    async pollChallengeStatus(challengeUrl, maxAttempts = 30, interval = 3000) {
        console.log('[ACME] 开始轮询挑战状态...');

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));

            const response = await this.sendJWS(challengeUrl, '');
            const status = response.data.status;

            console.log(`[ACME] 挑战状态 [${i + 1}/${maxAttempts}]:`, status);

            if (status === 'valid') {
                console.log('[ACME] 挑战验证成功！');
                return true;
            } else if (status === 'invalid') {
                console.error('[ACME] 挑战验证失败:', response.data.error);
                throw new Error(`挑战验证失败: ${response.data.error?.detail || '未知错误'}`);
            }
        }

        throw new Error('挑战验证超时');
    }

    /**
     * 生成域名密钥对（用于 CSR）
     */
    generateDomainKeyPair() {
        console.log('[ACME] 正在生成域名密钥对（4096位RSA）...');
        const keyPair = forge.pki.rsa.generateKeyPair({ bits: 4096, workers: -1 });
        console.log('[ACME] 域名密钥对生成成功');
        return keyPair;
    }

    /**
     * 生成 CSR（证书签名请求）
     */
    generateCSR(domain, domainKeyPair) {
        console.log('[ACME] 正在生成 CSR...');

        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = domainKeyPair.publicKey;
        csr.setSubject([
            {
                name: 'commonName',
                value: domain
            }
        ]);

        // 签名 CSR
        csr.sign(domainKeyPair.privateKey, forge.md.sha256.create());

        // 验证 CSR
        if (!csr.verify()) {
            throw new Error('CSR 验证失败');
        }

        // 转换为 DER 格式并 base64url 编码
        const csrDer = forge.asn1.toDer(forge.pki.certificationRequestToAsn1(csr)).getBytes();
        const csrB64 = this.base64url(csrDer);

        console.log('[ACME] CSR 生成成功');
        return csrB64;
    }

    /**
     * 完成订单（提交 CSR）
     */
    async finalizeOrder(finalizeUrl, csr) {
        console.log('[ACME] 正在完成订单...');

        const payload = {
            csr: csr
        };

        const response = await this.sendJWS(finalizeUrl, payload);
        console.log('[ACME] 订单已提交:', response.data);

        return response.data;
    }

    /**
     * 轮询订单状态
     */
    async pollOrderStatus(orderUrl, maxAttempts = 30, interval = 3000) {
        console.log('[ACME] 开始轮询订单状态...');

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));

            const response = await this.sendJWS(orderUrl, '');
            const status = response.data.status;

            console.log(`[ACME] 订单状态 [${i + 1}/${maxAttempts}]:`, status);

            if (status === 'valid') {
                console.log('[ACME] 订单已完成！');
                return response.data;
            } else if (status === 'invalid') {
                console.error('[ACME] 订单失败:', response.data.error);
                throw new Error(`订单失败: ${response.data.error?.detail || '未知错误'}`);
            }
        }

        throw new Error('订单处理超时');
    }

    /**
     * 下载证书
     */
    async downloadCertificate(certificateUrl) {
        console.log('[ACME] 正在下载证书...');

        const response = await this.sendJWS(certificateUrl, '');

        // 证书内容是 PEM 格式的文本
        console.log('[ACME] 证书下载成功');
        return response.data;
    }

    /**
     * 导出域名私钥为 PEM 格式
     */
    exportPrivateKeyPem(keyPair) {
        return forge.pki.privateKeyToPem(keyPair.privateKey);
    }
}

// 导出到全局
window.AcmeClient = AcmeClient;
