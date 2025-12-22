# DNS SSL 证书申请助手

> 免费 SSL 证书申请引导工具 - 支持 Let's Encrypt 和 ZeroSSL

这是一个基于 Jekyll 构建的静态网站，用于指导用户申请和安装免费 SSL 证书。项目提供清晰的步骤引导，支持多种验证方式和证书格式，可直接部署到 GitHub Pages。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Jekyll](https://img.shields.io/badge/Jekyll-4.3.3-red.svg)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-ready-brightgreen.svg)

## ✨ 功能特性

- 📝 **5 步引导流程**：从域名输入到证书安装的完整引导
- 🔐 **双重验证方式**：支持 Web 服务器验证（HTTP-01）和 DNS 解析验证（DNS-01）
- 📦 **多种证书格式**：支持 Nginx、Apache、Tomcat、IIS、JKS 等格式
- 🌐 **ACME CA 支持**：支持 Let's Encrypt、ZeroSSL、Buypass、Google Trust Services
- 📱 **响应式设计**：完美适配桌面端和移动端
- 🎨 **现代化 UI**：美观的界面设计和流畅的交互动画
- 🚀 **零后端**：纯静态站点，无需服务器，可直接部署到 GitHub Pages
- 📖 **详细指引**：每个步骤都有详细的操作说明和示例

## 🎯 核心流程

### 步骤 1：输入域名
- 用户输入需要申请证书的域名
- 支持单域名、子域名和通配符域名（如 *.example.com）
- 选择 ACME CA 提供商

### 步骤 2：选择验证方式
提供两种验证方式：
- **Web 服务器验证（HTTP-01）**：在服务器上放置验证文件
- **DNS 解析验证（DNS-01）**：添加 DNS TXT 记录

每种方式都有详细的配置指引和示例代码。

### 步骤 3：完成验证
- 用户按照指引完成验证配置
- 提供验证清单确保配置正确
- 推荐 ACME 客户端工具（Certbot、acme.sh、Caddy）

### 步骤 4：选择证书格式
根据服务器类型选择合适的证书格式：
- **Nginx**：fullchain.pem + privkey.pem
- **Apache**：cert.crt + chain.crt + privkey.key
- **Tomcat**：keystore.pfx（PKCS#12）
- **IIS**：certificate.pfx（PKCS#12）
- **JKS**：keystore.jks（Java KeyStore）
- **其他**：通用 PEM 格式

### 步骤 5：证书安装
- 显示所选格式的详细安装指南
- 包含配置示例和命令
- 提供格式转换方法

## 🚀 快速开始

### 前置要求

- Ruby 2.7 或更高版本
- Jekyll 4.3.3
- Bundler

### 本地运行

1. **克隆项目**
```bash
git clone <your-repo-url>
cd dnsSsl
```

2. **安装依赖**
```bash
bundle install
```

3. **启动开发服务器**
```bash
bundle exec jekyll serve
```

4. **访问网站**
打开浏览器访问：http://localhost:4000

### 生产构建

```bash
bundle exec jekyll build
```

构建后的静态文件将输出到 `_site` 目录。

## 📦 部署到 GitHub Pages

### 方法 1：直接推送（推荐）

1. 在 GitHub 创建新仓库
2. 推送代码到仓库
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/dnsSsl.git
git push -u origin master
```

3. 在仓库设置中启用 GitHub Pages
   - 进入仓库 Settings → Pages
   - Source 选择 `master` 分支
   - 点击 Save

4. 等待几分钟后访问：`https://yourusername.github.io/dnsSsl/`

### 方法 2：使用 GitHub Actions

项目已配置好 GitHub Actions，推送后会自动构建和部署。

## 🎨 自定义配置

### 修改网站信息

编辑 `_config.yml` 文件：

```yaml
title: DNS SSL 证书申请助手
description: 免费 SSL 证书申请引导工具
url: "https://yourusername.github.io"
baseurl: "/dnsSsl"  # 如果部署在子目录
author: Your Name
```

### 添加新的证书格式

编辑 `_data/cert_formats.yml`，按照现有格式添加新的证书类型：

```yaml
- id: new_server
  name: 新服务器类型
  description: 描述信息
  files:
    - name: cert.pem
      description: 证书文件
  installation_guide: |
    ## 安装指南
    详细的安装步骤...
```

### 修改样式

编辑 `assets/css/main.css` 文件，修改 CSS 变量：

```css
:root {
    --primary-color: #2563eb;  /* 主题色 */
    --border-radius: 8px;      /* 圆角大小 */
    /* 更多配置... */
}
```

### 修改交互逻辑

编辑 `assets/js/main.js` 文件，修改步骤验证或添加新功能。

## 📂 项目结构

```
dnsSsl/
├── _config.yml              # Jekyll 配置文件
├── _data/                   # 数据文件
│   └── cert_formats.yml     # 证书格式配置
├── _includes/               # 可复用组件
│   ├── step-indicator.html  # 步骤指示器
│   ├── verification-webserver.html  # Web 服务器验证说明
│   └── verification-dns.html        # DNS 验证说明
├── _layouts/                # 页面布局
│   └── default.html         # 默认布局
├── assets/                  # 静态资源
│   ├── css/
│   │   └── main.css         # 主样式文件
│   └── js/
│       └── main.js          # 主脚本文件
├── index.html               # 首页
├── Gemfile                  # Ruby 依赖配置
├── .gitignore               # Git 忽略文件
└── README.md                # 项目说明
```

## 🛠️ 技术栈

- **Jekyll 4.3.3**：静态站点生成器
- **HTML5 + CSS3**：现代化网页技术
- **Vanilla JavaScript**：无框架依赖的纯 JS
- **Markdown**：内容编写
- **YAML**：数据配置

## 🔒 关于安全

本项目是纯前端静态站点，**不存储**任何用户数据，所有操作都在浏览器本地完成：

- ✅ 无后端服务器
- ✅ 无数据库
- ✅ 无用户数据收集
- ✅ 不执行任何自动化操作

项目仅提供操作指引，实际的证书申请需要用户在自己的服务器上使用 ACME 客户端完成。

## ⚠️ ACME 协议重要特性

**请注意：每次申请/续期证书时，验证数据都会改变！**

这是 ACME（自动证书管理环境）协议的核心安全设计：

### 工作原理
- **HTTP-01 验证**：Let's Encrypt 每次生成不同的随机 token 作为验证文件名
  - 文件名和内容每次都不同
  - 客户端无法控制 token 的生成

- **DNS-01 验证**：TXT 记录值基于随机 token 计算
  - 每次申请都需要生成新的 TXT 记录值
  - 记录值无法提前准备或长期保留

### 这意味着
1. ❌ 无法提前准备验证数据
2. ❌ 旧的验证文件/DNS 记录无法复用
3. ✅ 每次续期都需要重新配置验证
4. ✅ 这是安全设计，无法绕过

### 最佳实践
本工具适合：
- ✅ 首次申请证书
- ✅ 学习 ACME 流程
- ✅ 临时测试环境

**生产环境强烈建议使用自动化工具**（如 Certbot、acme.sh），它们会：
- 自动生成验证数据
- 自动完成验证流程
- 自动续期证书
- 避免手动操作带来的错误和遗忘

## 📚 推荐的 ACME 客户端

- **[Certbot](https://certbot.eff.org/)**：EFF 官方推荐，功能全面
- **[acme.sh](https://acme.sh/)**：纯 Shell 实现，轻量级
- **[Caddy](https://caddyserver.com/)**：自动 HTTPS 的 Web 服务器
- **[win-acme](https://www.win-acme.com/)**：Windows 平台客户端
- **[lego](https://go-acme.github.io/lego/)**：Go 语言实现，支持多种 DNS 提供商

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [Let's Encrypt](https://letsencrypt.org/) - 免费的 SSL 证书服务
- [ZeroSSL](https://zerossl.com/) - 另一个优秀的免费证书提供商
- [Jekyll](https://jekyllrb.com/) - 强大的静态站点生成器
- [GitHub Pages](https://pages.github.com/) - 免费的静态站点托管

## 📮 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 提交 [GitHub Issue](https://github.com/en-o/dnsSsl/issues)
- 发送邮件至：your.email@example.com


⭐ 如果这个项目对你有帮助，请给个 Star！
