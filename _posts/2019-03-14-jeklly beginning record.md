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

