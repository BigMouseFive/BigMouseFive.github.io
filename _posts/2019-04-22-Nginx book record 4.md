---
layout: post
title: 深入理解nginx模块开发与架构解析[5]
date: '2019-04-20 15:19'
categories: 
 - 笔记
tags:
 - nginx
---

# 如何编写HTTP模块

## 第五章：访问第三方服务

有两种方式：upstream和subrequest。upstream将透传客户端的请求给上游服务器，然后再将上游服务器的响应透传给客户端。subrequest则在收到客户端的请求之后，向上游服务器发送子请求，获取上游服务器响应后在决定如何处理来自客户端的请求。

### 5.1 Upstream的使用方式

Nginx的核心功能之一——反向代理是基于upstream模块。
可以根据自己的需求重写Nginx的方向代理。
upstream模块提供了8个回调方法，用户只需要按自己的需求实现这八个回调函数即可。
在`ngx_http_request_t`结构体中有一个成员`ngx_http_upstream_t *upstream;`。

#### 5.1.1 ngx_http_upstream_t 结构体

```cpp
typedef struct ngx_http_upstream_s ngx_http_upstram_t;
struct ngx_http_upstream_s {
  ...
  ngx_chain_t *request_bufs;
  ngx_http_upstream_conf_t *conf;
  ngx_http_upstream_resolved_t *resolved;
  ngx_buf_t buffer;
  
  //必须实现的三个回调
  ngx_int_t (*create_request)(ngx_http_request_t *r)
  ngx_int_t (*process_header)(ngx_http_request_t *r);
  void (*finalize_request)(ngx_http_request_t *r, ngx_int_t rc);
  //可选的五个回调
  ngx_int_t (*input_filter_init)(void *data);
  ngx_int_t (*input_filter)(void *data, ssize_t bytes);
  ngx_int_t (*reinit_request)(ngx_http_request_t *r);
  void (*abort_request)(ngx_http_request_t *r, ngx_table_elt_t *h, size_t prefix);

  unsigned ssl:1
  unsigned buffering:1;
};
```

upstream有3种处理上游响应包体的方式。当`ngx_http_request_t`中`subrequest_in_memory`标志位为1，采用第一种方式：upstream不转发响应包体，而是将交由HTTP模块的`input_filter`处理；标志位为0时，upstream将会转发响应的包体。当`ngx_http_upstream_conf_t`配置结构体中`buffering`标志位位1时，将开启更多的内存和磁盘文件用于缓存上游的响应包体。、

#### 5.1.2 设置upstream的限制参数

上文结构中的`conf`成员。它用于设置upstream模块处理请求的参数，包括连接、发送、结构的超时事件等。
```cpp
typedef struct {
  ...
  ngx_msec_t connect_timeout;
  ngx_msec_t send_timeout;
  ngx_msec_t read_timeout;
  ...
} ngx_http_upstream_conf_t;
```

上面的三个参数是必须要设置的，如果不设置，默认值是0，那么将永远无法和上游服务器建立TCP连接。
使用第四章的内容可以很容易的设置`ngx_http_upstream_conf_t`结构体。可以将`ngx_http_upstream_conf_t`类型的变量放到`ngx_http_mytest_conf_t`结构体中。这样就可以通过预设或者自定义的方法从配置项中读取这个值了。

#### 5.1.3 设置需要访问的第三方服务器地址

上文结构中的`resolved`成员。

```cpp
typedef struct {
  ...
  ngx_uint_t naddrs;//地址个数
  struct sockaddr *sockaddr;
  socklen_t socklen;
  ...
} ngx_http_upstream_resolved_t;
```

这三个参数是必须设置的。

#### 5.1.4 设置回调方法

#### 5.1.5 如何启动upstream机制

```cpp
static ngx_int_t ngx_http_mytest_handler(ngx_http_request_t *r){
  ...
  r->main->count++;
  ngx_http_upstream_init(r);
  returan NGX_DONE;
}
```

直接执行`ngx_http_upstream_init`方法即可。要注意的是，调用了这个函数后要返回`NGX_DONE`来告诉HTTP框架暂停执行请求的下一阶段。这里还需要执行r->main->count++，这是告诉HTTP框架当前的引用计数加1，即告诉`ngx_http_mytest_handler`方法暂时不要销毁请求，因为HTTP框架值有在引用计数为0时才真正的销毁请求。

### 5.2 回调方法的执行场景

#### 5.2.1 create_request 回调方法

只可能被调用一次（如果不启动upstream的失败重试机制）。在`ngx_http_upstream_init`中回调`create_request`。去了回调这个函数，还实现了检查文件缓存（在回调`create_request`之前），获取上游服务器地址并建立无阻塞的TCP连接（在回调`create_request`之后）

#### 5.2.2 reinit_request回调方法

`reinit_request`可能会被多次回调。它被调用的原因只有一个，就是在第一次试图向上游服务器建立连接是，如果连接由于各种异常原因失败，那么会更具upstream中conf参数的策略要求再次重连上游服务器，而这时就会调用`reinit_request`。这个函数的目的就是为了让用户能够自定义在TCP建立失败的的处理方法。

#### 5.2.3 finalize_request 回调方法

`ngx_http_upstream_init`启动upstream机制后，在各种原因（无论是成功还是失败）导致该请求被销毁前都会调用`finalize_request`方法。在`finalize_request`中可以不进行任何操作，但是必须要实现，否则会出现空指针调用的严重错误。

#### 5.2.4 porcess_header 回调方法

用于解析上游服务器返回的基于TCP的响应头部的，因此，process_header可能会被多次调用，调用次数与`process_header`的返回值有关。如图5-5所示，如果`process_header`返回`NGX_AGAIN`，这意味着还没有接收到完整的响应头部。如果返回值为`NGX_OK`那么在这次连接的后续处理中将不会再次调用`process_header`。
每次读取到的响应都会存放在r->upstream->buffer指向的内存中。如果buffer满了都还没有解析到完整的响应头部，那么请求就会出错。
`process_header`实际上就是解析r->upstream->buffer缓冲区，试图从中取到完整的响应头部。

#### 5.2.5 rewrite_redirect 回调方法

主要应用在HTTP反向代理模块。

#### 5.2.6 input_filter_init 与 input_filter 回调方法

用于处理上游的响应包体。因为处理包体前HTTP模块可能需要做一些初始化工作。例如，分配一些内存用于存放解析的中间状态等，这时upstream就提供`input_filter_init`方法。而`input_fiter`方法就是实际处理包体的方法。这个两个方法都可以实现（不实现时，upstream模块会自动设置它们为预置方法）。

#### 5.3 使用upstream的示例


