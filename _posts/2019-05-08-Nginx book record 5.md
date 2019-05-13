---
layout: post
title: 深入理解nginx模块开发与架构解析[6]
date: '2019-05-08 09:29'
categories: 
 - 笔记
tags:
 - nginx
---

# 如何编写HTTP模块

## 第六章：开发一个简单的HTTP过滤模块

### 6.1 过滤模块的意义

回顾HTTP框架的11个阶段

```c
typedef enum {
  NGX_HTTP_POST_READ_PHASE = 0,
  NGX_HTTP_SERVER_REWRITE_PHASE,
  NGX_HTTP_FIND_CONFIG_PHASE,
  NGX_HTTP_REWRITE_PHASE,
  NGX_HTTP_POST_REWRITE_PHASE,
  NGX_HTTP_PREACCESS_PHASE,
  NGX_HTTP_ACCESS_PHASE,
  NGX_HTTP_POST_ACCESS_PHASE,
  NGX_HTTP_TRY_FILES_PHASE,
  NGX_HTTP_CONTENT_PHASE,
  NGX_HTTP_LOG_PHASE
} ngx_http_phases;
```

HTTP框架允许普通的HTTP模块介入其中的7个阶段处理请求，当时通常大部分HTTP模块都只在`NGX_HTTP_CONTENT_PHASE`阶段处理请求。
对于一个请求来说，一个请求可以被任意HTTP过滤模块处理。HTTP过滤模块是可以叠加的，即一个请求可以被多个过滤模块处理。
HTTP过滤模块是在普通HTTP模块处理请求完毕，并调用`ngx_http_send_header`或`ngx_http_output_filter`时，才会由这两个方法依次调用所有的HTTP过滤模块来处理。所以过滤模块处理的都是HTTP reponse而不是HTTP request。

### 6.2 过滤模块的调用顺序

#### 6.2.1 过滤链表是如何构成的

编译源码时，就已经定义了一个由所有HTTP过滤模块组成的单链表，