# 快速启动指南

## Windows 环境

### 安装 Ruby 和 Jekyll

1. **下载安装 Ruby+Devkit**
   - 访问：https://rubyinstaller.org/downloads/
   - 下载并安装 Ruby+Devkit 3.1.x 或更高版本
   - 安装过程中选择"Add Ruby to PATH"

2. **安装 Jekyll 和 Bundler**
   打开命令提示符或 PowerShell，运行：
   ```bash
   # 换 gem 源
   # gem sources --remove https://rubygems.org/
   # gem sources --add https://mirrors.tuna.tsinghua.edu.cn/rubygems/
   # gem sources -l          # 确认只剩一个国内源
   gem install jekyll bundler
   ```

3. **进入项目目录**
   ```bash
   cd C:\work\tan\code\dnsSsl
   ```

4. **安装项目依赖**
   ```bash
   # 让 Bundler 也走 gem 同一镜像
   # bundle config mirror.https://rubygems.org https://mirrors.tuna.tsinghua.edu.cn/rubygems
   # 加 --full-index 一次性拉取索引，减少小请求
   bundle install
   ```

5. **启动开发服务器**
   ```bash
   bundle exec jekyll serve
   ```

6. **访问网站**
   打开浏览器访问：http://localhost:4000

## Linux / macOS 环境

### 安装 Ruby 和 Jekyll

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ruby-full build-essential zlib1g-dev

# 配置 gem 安装路径
echo '# Install Ruby Gems to ~/gems' >> ~/.bashrc
echo 'export GEM_HOME="$HOME/gems"' >> ~/.bashrc
echo 'export PATH="$HOME/gems/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

gem install jekyll bundler
```

**macOS:**
```bash
# 使用 Homebrew 安装
brew install ruby
echo 'export PATH="/usr/local/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

gem install jekyll bundler
```

### 运行项目

```bash
cd dnsSsl
bundle install
bundle exec jekyll serve
```

访问：http://localhost:4000

## 常见问题

### 问题 1：bundle install 很慢
**解决方案：** 使用国内镜像源
```bash
# 临时使用
bundle install --source https://gems.ruby-china.com/

# 永久配置
bundle config mirror.https://rubygems.org https://gems.ruby-china.com
```

### 问题 2：端口被占用
**解决方案：** 指定其他端口
```bash
bundle exec jekyll serve --port 4001
```

### 问题 3：webrick 错误
**解决方案：** 手动安装 webrick
```bash
bundle add webrick
```

### 问题 4：文件权限错误（Linux/macOS）
**解决方案：** 不要使用 sudo
```bash
# 错误方式
sudo bundle install  # 不推荐

# 正确方式
bundle install       # 推荐
```

## 生产部署

### 构建静态文件
```bash
bundle exec jekyll build
```

生成的文件在 `_site` 目录中。

### 部署到 GitHub Pages

1. 创建 GitHub 仓库
2. 推送代码：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/dnsSsl.git
   git push -u origin master
   ```
3. 在仓库设置中启用 GitHub Pages（选择 master 分支）

### 部署到其他服务器

将 `_site` 目录的内容上传到 Web 服务器即可。

## 开发建议

- 修改 `_config.yml` 后需要重启 Jekyll 服务器
- 修改 CSS/JS/HTML 文件会自动重新加载
- 使用浏览器开发者工具调试

## 项目文件说明

- `_config.yml` - Jekyll 配置
- `_data/` - 数据文件（证书格式配置）
- `_includes/` - 可复用组件
- `_layouts/` - 页面布局模板
- `assets/` - 静态资源（CSS、JS、图片）
- `index.html` - 主页
- `Gemfile` - Ruby 依赖配置

## 更多信息

详见 README.md
