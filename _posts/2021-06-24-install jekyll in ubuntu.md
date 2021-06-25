---
layout: post
title: 在Ubuntu16.04中安装jekylle
date: '2021-06-24 23:22'
categories: 
 - 安装教程
tags:
 - ruby
 - ubuntu
 - jekyll

---

# 1. 安装ruby

```shell
 apt install ruby ruby-dev
```

# 2. 设置国内ruby的源

## 2.1. gem方式

```shell
# 添加国内源，删除原生源
gem sources --add https://gems.ruby-china.com/ --remove https://rubygems.com/
# 查看安装的源
gem sources -l
```

## 2.2. bundle方式

```shell
# 安装bundle
gem install bundle
# bundle设置ruby源
bundle config mirror.https://rubygems.org https://gems.ruby-china.com
# 安装
bundle install
```

# 3. 安装依赖

```shell
# 安装nodejs
apt-get install nodejs
```

# 4. 安装jekyll

```shell
gem install jekyll
gem install kramdown  
gem install rdoc  
gem install rdiscount
gem install jekyll-sitemap  
```

# 5. 运行博客

在博客目录下执行

```shell
bundle exec jekyll server
```

# 6. 通过nginx显示博客

```shell
#jekyll _config.yml调整
base_url:
url: /blog/
permalink: /blog/:year/:month/:day/:title/
```

```shell
# 生产静态网页
bundle exec jekyll build
# 将网页拷贝到nginx目录下
mkdir /usr/share/nginx/html/blog
cp -r _site/* /usr/share/nginx/html/blog/*
```

```shell
# nginx添加配置
 location /blog/ {
     index index.html;
 }
```

