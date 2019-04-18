---
layout: post
title: 深入理解nginx模块开发与架构解析第二部分
date: '2019-04-17 09:40'
categories: 
 - 笔记
tags:
 - nginx
---

# 如何编写HTTP模块

## 第三章：开发一个简单的HTTP模块

### 3.1 如何调用HTTP模块

worker中有一个事件循环，不断的调用事件模块检测网络事件。
当检测到tcp请求时，将会建立tcp连接，并根据配置文件类交由http框架，再继续交由具体的http模块。
http模块处理请求结束后大多数对向客户端发送响应，此时会自动一次调用http过滤模块处理响应。
http模块把控制权返回给http框架前，如果设置了subrequest，那么http框架还会继续异步的调用合适的http模块处理子请求。

### 3.2 开发的准备工作

#### 3.2.1 定义了一些基本的数据结构

```cpp
//整型
typdef intptr_t ngx_int_t;
typdef uintptr_t ngx_uint_t;
//字符串
typdef struct {
  size_t len;
  u_char *data;
} ngx_str_t;
#define ngx_strncmp(s1, s2, n) strncmp((constr char *)s1, (const char *)s2, n)
/*
对内存吝啬的使用：字符串在内存中尽量只保存一份，使用字符串一部分的时候不会去另外拷贝一份而是使用`ngx_str_t`指定长度和对应的字符串的地址
*/

//链表
typedef struct ngx_list_part_s ngx_list_part_t;
struct ngx_list_part_s{
  void *elts;
  ngx_uint_t nelts;
  ngx_list_part_t *next;
};
type struct {
  ngx_list_part_t *last;//指向链表最后一个元素
  ngx_list_part_t part; //链表首个元素
  size_t size;//ngx_list_part_t中elts指向的数据类型占用的空间大小
  ngx_uint_t nalloc;//ngx_list_part_t可以储存多少个数据
  ngx_pool_t *pool;//管理内存分配的内存池对象
} ngx_list_t;
//链表内存结构 ngx_list_t|ngx_list_part_t(1)|[size*nalloc](1)|ngx_list_part_t(2)|[size*malloc](2)|...(n)|...(n)
ngx_list_t *ngx_list_create(ngx_pool_t *pool, ngx_uint_t n, size_t size);  是由pool分配的一块连续内存。
static ngx_inline ngx_int_t ngx_list_init(ngx_list_t *list, ngx_pool_t *pool, ngx_uint_t n, size_t size);
void *ngx_list_push(ngx_list_t *list);

//键值对结构
typedef struct {
  ngx_uint_t hash;
  ngx_str_t key;
  ngx_str_t value;
  u_char *lowcase_key;
} ngx_table_elt_t;

//缓冲区结构
typedef struct ngx_buf_s ngx_buf_t;
typedef void* ngx_buf_tag_t;
struct ngx_buf_s {
  u_char *pos;
  u_char *last;
  
  off_t file_pos;
  off_t file_last;
  
  u_char *start;
  u_char *end;
  
  ngx_buf_tag_t tag;
  ngx_file_t *file;
  ngx_buf_t *shadow;
  unsigned temporary:1
  unsigned memory:1;
  unsigned mmap:1;
  unsigned recycled:1;
  unsigned in_file:1;
  unsigned flush:1;
  unsigned sync:1;
  unsigned last_buf:1;
  unsigned last_in_chain:1;
  unsigned last_shadow:1;
  unsigned temp_file:1;
};

typedef struct ngx_chain_s ngx_chain_t;
struct ngx_chain_s {
  ngx_buf_t *buf;
  ngx_chain_t *next;
};
```

### 3.3 如何将自己的HTTP模块编译进Nginx

方式1：在自己的HTTP模块源码目录处编写一个config文件，然后执行configure时添加参数`--add-module=PATH`。
方式2：通过修改`objs/Makefile`和`objs/ngx_modules.c`。

#### 3.3.1 config文件的写法

```
ngx_addon_name=ngx_http_mytest_module
HTTP_MODULES="$HTTP_MODULES ngx_http_mytest_module"
NGX_ADDON_SRCS="$NGX_ADDON_SRCS $ngx_addon_dir/ngx_http_mytest_module.c"

#还有其他参数
$CORE_MODULES
$EVENT_MODULES
$HTTP_FILTER_MODULES
$HTTP_HEADERS_FILTER_MODULES
$NGX_ADDON_DEPS
```

#### 3.3.2 直接修改MakeFile文件

1. 使用configure完成一次配置
2. 修改`objs/ngx_modules.c` 添加新增的第三方模块的声明
3. 修改`objs/ngx_modules.c` 在`ngx_modules`数组的合适位置加入模块
4. 修改`objs/Makefile` 添加第三模块的编译源代码部分
5. 修改`objs/Makefile` 在链接部分添加第三方模块的obj对象

### 3.4 HTTP模块的数据结构

`ngx_module_t ngx_http_mytest_moudule;`
`ngx_module_t` 就是一个Nginx模块的数据结构。
```cpp
typedef struct ngx_module_s ngx_module_t;
struct ngx_module_s {
  ngx_uint_t ctx_index;//某一类模块中的顺序值
  ngx_uint_t index;//所有模块中的顺序值
  ngx_uint_t spare0;
  ngx_uint_t spare1;
  ngx_uint_t spare2;
  ngx_uint_t spare3;
  ngx_uint_t version;
  void *ctx;//特定类型模块公共接口
  ngx_command_t *commands;
  ngx_uint_t type;
  ngx_int_t (*init_master)(ngx_log_t *log);
  ngx_int_t (*init_module)(ngx_cycle_t *cycle);
  ngx_int_t (*init_process)(ngx_cycle_t *cycle);
  ngx_int_t (*init_thread)(ngx_cycle_t *cycle);//NGINX1.7.11引入了线程池
  ngx_int_t (*exit_thread)(ngx_cycle_t *cycle);
  ngx_int_t (*exite_process)(ngx_cycle_t *cycle);
  ngx_int_t (*exit_master)(ngx_cycle_t *cycle);
  uintptr_t spare_hook0;
  uintptr_t spare_hook1;
  uintptr_t spare_hook2;
  uintptr_t spare_hook3;
  uintptr_t spare_hook4;
  uintptr_t spare_hook5;
  uintptr_t spare_hook6;
  uintptr_t spare_hook7;
};
```

定义一个HTTP模块时。`type`要赋值为`NGX_HTTP_MODULE`。`init_module`/`init_process`/`exit_process`/`exit_module` 这四个回调方法和HTTP框架无关，通常都会设置NULL。成员`ctx`要指向`ngx_http_module_t`这个接口。

HTTP框架在读取、重载配置文件时定义了由`ngx_http_module_t`接口描述的8个阶段。

```cpp
typedef struc {
  ngx_int_t (*preconfiguration)(ngx_conf_t *cf);//解析配置文件前调用
  ngx_int_t (*postconfiguration)(ngx_conf_t *cf);//完成配置文件解析后调用
  void *(*create_main_conf)(ngx_conf_t *cf);
  char *(*init_main_conf)(ngx_conf_t *cf, void *conf);
  void *(*create_srv_conf)(ngx_conf_t *cf);
  char *(*merge_srv_conf)(ngx_conf_t *cf, void *prev, void *conf);
  void *(*create_loc_conf)(ngx_conf_t *cf);
  char* (*merge_loc_conf)(ngx_conf_t *cf, void *prev, void *conf);
} ngx_http_module_t;
```

HTTP框架调用这些回调方法的实际顺序可能是这样的：

1. create_main_conf
2. create_srv_conf
3. create_loc_conf
4. preconfiguration
5. init_main_conf
6. merge_srv_conf
7. merge_loc_conf
8. postconfiguration

`commands`数组用于定义模块的配置文件参数，以`ngx_null_command`结束。

```cpp
typeef struct ngx_command_s ngx_command_t;
struct ngx_command_s {
  ngx_str_t name;
  ngx_uint_t type;
  char *(*set)(ngx_conf_t *cf, ngx_command_t *cmd, void *conf);
  ngx_uint_t conf;
  ngx_uint_t offset;
  void *post;
};
#define ngx_null_command {ngx_null_string, 0, NULL, 0, 0, NULL}
```

### 3.5 定义自己的HTTP模块

1. 定义mytest配置项的处理。定义一个`ngx_command_t`数组，并设置mytest配置后的解析方法（成员`set`）由`ngx_http_mytest`“担当”。
2. 实现`ngx_http_mytest`方法，定义一个请求处理方法`ngx_http_mytest_handler`。
3. 定义一个`ngx_http_module_t`结构。
4. 定义一个`ngx_module_t`结构。

HTTP框架一共定义了11个阶段，第三方HTTP模块只能接入其中的7个阶段。
```cpp
typedef enum{
  NGX_HTTP_POST_READ_PHASE = 0,
  NGX_HTTP_SERVER_REWRITE_PHASE,
  NGX_HTTP_FIND_CONFIG_PHASE,
  NGX_HTTP_REWRITE_PHASE,
  NGX_HTTP_POST_REWRITE_PHASE,
  NGX_HTTP_PREACESS_PHASE,
  NGX_HTTP_ACCESS_PHASE,
  NGX_HTTP_POST_ACCESS_PHASE,
  NGX_HTTP_TRY_FILES_PHASE,
  NGX_HTTP_CONTENT_PHASE,
  NGX_HTTP_LOG_PHASE
}ngx_http_phases;
```

### 3.6 处理用户请求

上面定义的handler函数`ngx_http_mytest_handler`的原型如下。
`typedef ngx_int_t (*ngx_http_handler_pt)(ngx)http_request_t *r);`

#### 3.6.1 处理方法的返回值

```cpp
#define NGX_HTTP_CONTINUE                  100
#define NGX_HTTP_SWITCHING_PROTOCOLS       101
#define NGX_HTTP_PROCESSING                102

#define NGX_HTTP_OK                        200
#define NGX_HTTP_CREATED                   201
#define NGX_HTTP_ACCEPTED                  202
#define NGX_HTTP_NO_CONTENT                204
#define NGX_HTTP_PARTIAL_CONTENT           206

#define NGX_HTTP_SPECIAL_RESPONSE          300
#define NGX_HTTP_MOVED_PERMANENTLY         301
#define NGX_HTTP_MOVED_TEMPORARILY         302
#define NGX_HTTP_SEE_OTHER                 303
#define NGX_HTTP_NOT_MODIFIED              304
#define NGX_HTTP_TEMPORARY_REDIRECT        307
#define NGX_HTTP_PERMANENT_REDIRECT        308

#define NGX_HTTP_BAD_REQUEST               400
#define NGX_HTTP_UNAUTHORIZED              401
#define NGX_HTTP_FORBIDDEN                 403
#define NGX_HTTP_NOT_FOUND                 404
#define NGX_HTTP_NOT_ALLOWED               405
#define NGX_HTTP_REQUEST_TIME_OUT          408
#define NGX_HTTP_CONFLICT                  409
#define NGX_HTTP_LENGTH_REQUIRED           411
#define NGX_HTTP_PRECONDITION_FAILED       412
#define NGX_HTTP_REQUEST_ENTITY_TOO_LARGE  413
#define NGX_HTTP_REQUEST_URI_TOO_LARGE     414
#define NGX_HTTP_UNSUPPORTED_MEDIA_TYPE    415
#define NGX_HTTP_RANGE_NOT_SATISFIABLE     416
#define NGX_HTTP_MISDIRECTED_REQUEST       421
#define NGX_HTTP_TOO_MANY_REQUESTS         429


/* Our own HTTP codes */

/* The special code to close connection without any response */
#define NGX_HTTP_CLOSE                     444

#define NGX_HTTP_NGINX_CODES               494

#define NGX_HTTP_REQUEST_HEADER_TOO_LARGE  494

#define NGX_HTTPS_CERT_ERROR               495
#define NGX_HTTPS_NO_CERT                  496

/*
 * We use the special code for the plain HTTP requests that are sent to
 * HTTPS port to distinguish it from 4XX in an error page redirection
 */
#define NGX_HTTP_TO_HTTPS                  497

/* 498 is the canceled code for the requests with invalid host name */

/*
 * HTTP does not define the code for the case when a client closed
 * the connection while we are processing its request so we introduce
 * own code to log such situation when a client has closed the connection
 * before we even try to send the HTTP header to it
 */
#define NGX_HTTP_CLIENT_CLOSED_REQUEST     499


#define NGX_HTTP_INTERNAL_SERVER_ERROR     500
#define NGX_HTTP_NOT_IMPLEMENTED           501
#define NGX_HTTP_BAD_GATEWAY               502
#define NGX_HTTP_SERVICE_UNAVAILABLE       503
#define NGX_HTTP_GATEWAY_TIME_OUT          504
#define NGX_HTTP_VERSION_NOT_SUPPORTED     505
#define NGX_HTTP_INSUFFICIENT_STORAGE      507
```

注意：除了RFC2616中定义的返回码外，还有nginx自身定义的HTTP返回码。
在handler函数中除了HTTP响应码，还可以放会Ngxin全局定义的几个错误码

```cpp
#define NGX_OK        0
#define NGX_ERROR    -1
#define NGX_AGAIN    -2
#define NGX_BUSY     -3
#define NGX_DONE     -4
#define NGX_DECLINED -5
#define NGX_ABORT    -6
```

NGX_DONE：检查连接的类型，如果是keepalive类型的用户请求，就会保持住HTTP连接，然后把控制权交给Nginx。这个参数就可以在耗时操作时避免了长时间的阻塞。

#### 3.6.2 获取URI和参数

```cpp
ngx_http_request_t* r;

//method
r->method;

//URI
r->uri;

//用户请求的文件扩展名
r->extern;

//URL参数
r->arg;
```

#### 3.6.3 获取HTTP头部

```cpp
struct ngx_http_requset_s {
  ...
  ngx_buf_t *header_in;
  ngx_http_headers_in_t headers_in;
  ...
};
```

`header_in`指向为解析的HTTP头部（实际上就是HTTP头部的缓冲区）。`headers_in`中是已经解析过的HTTP头部。
```cpp
typedef struct {
    ngx_list_t                        headers;

    ngx_table_elt_t                  *host;
    ngx_table_elt_t                  *connection;
    ngx_table_elt_t                  *if_modified_since;
    ngx_table_elt_t                  *if_unmodified_since;
    ngx_table_elt_t                  *if_match;
    ngx_table_elt_t                  *if_none_match;
    ngx_table_elt_t                  *user_agent;
    ngx_table_elt_t                  *referer;
    ngx_table_elt_t                  *content_length;
    ngx_table_elt_t                  *content_range;
    ngx_table_elt_t                  *content_type;

    ngx_table_elt_t                  *range;
    ngx_table_elt_t                  *if_range;

    ngx_table_elt_t                  *transfer_encoding;
    ngx_table_elt_t                  *te;
    ngx_table_elt_t                  *expect;
    ngx_table_elt_t                  *upgrade;

#if (NGX_HTTP_GZIP || NGX_HTTP_HEADERS)
    ngx_table_elt_t                  *accept_encoding;
    ngx_table_elt_t                  *via;
#endif

    ngx_table_elt_t                  *authorization;

    ngx_table_elt_t                  *keep_alive;

#if (NGX_HTTP_X_FORWARDED_FOR)
    ngx_array_t                       x_forwarded_for;
#endif

#if (NGX_HTTP_REALIP)
    ngx_table_elt_t                  *x_real_ip;
#endif

#if (NGX_HTTP_HEADERS)
    ngx_table_elt_t                  *accept;
    ngx_table_elt_t                  *accept_language;
#endif

#if (NGX_HTTP_DAV)
    ngx_table_elt_t                  *depth;
    ngx_table_elt_t                  *destination;
    ngx_table_elt_t                  *overwrite;
    ngx_table_elt_t                  *date;
#endif

    ngx_str_t                         user;
    ngx_str_t                         passwd;

    ngx_array_t                       cookies;

    ngx_str_t                         server;
    off_t                             content_length_n;
    time_t                            keep_alive_n;

    unsigned                          connection_type:2;
    unsigned                          chunked:1;
    unsigned                          msie:1;
    unsigned                          msie6:1;
    unsigned                          opera:1;
    unsigned                          gecko:1;
    unsigned                          chrome:1;
    unsigned                          safari:1;
    unsigned                          konqueror:1;
} ngx_http_headers_in_t;
```

#### 3.6.4 获取HTTP包体

HTTP包体的长度有可能非常大，所以HTTP框架提供了一种方法来异步地接收包体。
```cpp
ngx_int_t ngx_http_read_client_request_body(ngx_http_request_t *r, ngx_http_client_body_handler_pt post_handler);

typedef void (*ngx_http_client_body_handler_pt)(*ngx_http_request_t *r)
```

注意:`ngx_http_client_body_handler_pt`函数的返回值是void，Nginx不会根据返回值来做一些首位工作，因此我们在该方法里处理完请求时必须主动调用`ngx_http_finalize_request`方法结束请求。
如果不想处理请求中的包体，可以调用`ngx_http_discard_request_body`方法替换`ngx_http_read_client_request_body`。不处理包体为什么还要执行一个函数来处理呢？因为如果不处理客户端发来的TCP流，有可能造成客户端发送超时。
接收完包体后，可以在`r->request_body->temp_file->file`中获取临时文件。

### 3.7 发送响应

#### 3.7.1 发送响应头部

`ngx_Int_t ngx_http_send_header(ngx_http_request_t *r);`

#### 3.7.2 将内存中的字符串作为包体发送

`ngx_Int_t ngx_http_output_filter(ngx_http_request_t *r, ngx_chain_t *in);`

#### 3.7.3 Nginx内存池如何分配

在`ngx_http_request_t`对象中就有这个请求的内存管理对象，我们对内存池的操作都可以基于这个来进行。

```cpp
struct ngx_http_request_s {
  ...
  ngx_pool_t *pool;
  ...  
};
```

有了内存池对象就可以从内存池分配内存。例如，下面这个基本的申请分配内存的方法：
`void *ngx_palloc(ngx_pool_t *pool, size_t size);`
还有一个封装了`ngx_palloc`的函数`ngx_pcalloc`，它多做了一件事，就是把申请到的内存块置为0。

#### 3.7.4 经典的“hello world”示例

```cpp
static ngx_int_t ngx_http_mytest_handler(ngx_http_request_t *r){
	//只接受GET和HEAD方法
	if (!(r->method & (NGX_HTTP_GET|NGX_HTTP_HEAD))){
		return NGX_HTTP_NOT_ALLOWED;
	}

	//不处理包体
	ngx_int_t rc = ngx_http_discard_request_body(r);
	if (rc != NGX_OK){
		return rc;
	}

	//准备响应内容
	ngx_str_t type = ngx_string("text/plain");
	ngx_str_t response = ngx_string("hello world!");

	//填写响应内容到header_out中
	r->headers_out.status = NGX_HTTP_OK;
	r->headers_out.content_length_n = response.len;
	r->headers_out.content_type = type;

	//发送响应头部
	rc = ngx_http_send_header(r);
	if (rc == NGX_ERROR || rc > NGX_OK || r->header_only){
		return rc;
	}

	//创建响应包体
	ngx_buf_t *b;
	b = ngx_create_temp_buf(r->pool, response.len);
	if (b == NULL){
		return NGX_HTTP_INTERNAL_SERVER_ERROR;
	}

	//拷贝响应内容到b中
	ngx_memcpy(b->pos, response.data, response.len);
	b->last = b->pos + response.len;
	b->last_buf = 1;//声明这是最后一个缓冲区

	ngx_chain_t out;
	out.buf = b;
	out.next = NULL;

	return ngx_http_output_filter(r, &out);
}
```

### 3.8 将磁盘文件作为包体发送

#### 3.8.1 如何发送磁盘中的文件

使用3.7节中使用的接口：

```cpp
ngx_chain_t out;
out.buf = b;
out.next = NULL;
return ngx_http_output_filter(r, &out);
```

与发送内存包体的不同在于如何设置`ngx_buf_t`缓冲区。将`ngx_buf_t`中的标志位`in_file`设置为1，表示`ngx_buf_t`发送的是文件而不是内存。
`ngx_http_output_filter`调用后发现`in_file`的值为1，将会从`ngx_buf_t`中`file`获取实际的文件，`file`的结构是`ngx_file_t`。

```cpp
typedef struct ngx_file_s ngx_file_t;
struct ngx_file_s {
  ngx_fd_t fd;
  ngx_str_t name;
  ngx_file_info_t info;
  off_t offset;
  off_t sys_offset;
  ngx_log_t *log;
  unsigned valid_info:1;
  unsigned directio:1;
};
```
  
