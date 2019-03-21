---
layout: post
title:  jeklly
image: ''
date:   2019-03-14 17:22
tags:
  - jeklly
description: ''
categories:
 - 工具
 - 博客
---


# 相关链接

* [jeklly官网](https://www.jekyll.com.cn/)
* [Yaml](https://www.jianshu.com/p/667961cdf9c4)：用在全局配置文件，网页，博客文章头部
* [Liquid](https://liquid.bootcss.com/): 在网页中使用由Yaml定义的数据

# _config.yml默认配置

```yaml
source:      .
destination: ./_site
plugins:     ./_plugins
layouts:     ./_layouts
include:     ['.htaccess']
exclude:     []
keep_files:  ['.git','.svn']
gems:        []
timezone:    nil
encoding:    nil

future:      true
show_drafts: nil
limit_posts: 0
highlighter: pygments

relative_permalinks: true

permalink:     date
paginate_path: 'page:num'
paginate:      nil

markdown:      maruku
markdown_ext:  markdown,mkd,mkdn,md
textile_ext:   textile

excerpt_separator: "\n\n"

safe:        false
watch:       false    # deprecated
server:      false    # deprecated
host:        0.0.0.0
port:        4000
baseurl:     /
url:         http://localhost:4000
lsi:         false

maruku:
  use_tex:    false
  use_divs:   false
  png_engine: blahtex
  png_dir:    images/latex
  png_url:    /images/latex
  fenced_code_blocks: true

rdiscount:
  extensions: []

redcarpet:
  extensions: []

kramdown:
  auto_ids: true
  footnote_nr: 1
  entity_output: as_char
  toc_levels: 1..6
  smart_quotes: lsquo,rsquo,ldquo,rdquo
  use_coderay: false

  coderay:
    coderay_wrap: div
    coderay_line_numbers: inline
    coderay_line_numbers_start: 1
    coderay_tab_width: 4
    coderay_bold_every: 10
    coderay_css: style

redcloth:
  hard_breaks: true
```

# 工程结构

开发

* _includes: 包含==html文档==
* _layouts: 包含==html模板==
* _posts: 包含==文章/博客==
* _assets: 包含==资源==（包括font/img/js/css）
* _config.xml: jekyll配置文件
* index.html: 网站首页html文件
* posts.html: posts页面
* series.html: series页面
* tags.html: tags页面
* about.html: 关于页面

编译后

* about: 包含一个关于页面（index.html）
* series: 包含一个series页面（index.html）
* posts: 包含一个posts页面（index.html）
* tags: 包含一个tags页面（index.html）
* index.html: 网站首页html文件
* 文章名1
* 文章名2
* ...
* 文章名n

总结
开发阶段，==文章==头部可以使用Yaml来定义变量。==html文件==可以通过liquid来使用Yaml定义的变量，也可以通过Yaml来定义变量。所以在开发阶段的使用了liquid或Yaml的html文件是不能正常使用的网页文件，但是这样却可以很方便的实现以下功能

* 通过Yaml来给html定义要使用的layout
* 在文章头部定义类型，时间，标签，我们就可以通过在html文件中使用liquid按照不同的分类方式获取文章。

# 字体使用

使用方式

1. 使用远程在线的字体
2. 使用一些基础的字体（系统自带）
3. 使用本地font目录中的字体文件（网上下载）

使用本地字体文件的问题
通常网上下载下来的字体文件都很大，如果不做处理直接使用这些文件，会导致网页加载时间很长。所以要缩小字体文件。我们可以通过使用[font-spider:字蛛](http://font-spider.org/)。
在使用font-spider时会遇到一些问题。

* 推荐使用==ttf==格式，==eot、otf==格式是不支持的
* 确保网页中使用字体的目录是本地目录不是远程目录。本地目录类似这样D:/test/webpage/src/font/type.ttf，远程目录类似这样<http://domain.com/src/font/type.ttf>、<localHost:80/src/font/type.tff>。要确保使用的是本地目录有这两点：
  * css文件中定义字体的使用的url是相对路径
  * html文件中使用css文件使用的是本地绝对路径或者是相对路径

# 博客目录功能

# 小技巧