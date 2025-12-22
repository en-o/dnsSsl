source "https://rubygems.org"

# Jekyll 版本
gem "jekyll", "~> 4.3.3"

# 主题
gem "minima", "~> 2.5"

# 插件
group :jekyll_plugins do
  gem "jekyll-feed", "~> 0.12"
  gem "jekyll-seo-tag", "~> 2.8"
end

# Windows 和 JRuby 平台支持
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# 性能优化
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]

# HTTP 服务器
gem "webrick", "~> 1.8"
