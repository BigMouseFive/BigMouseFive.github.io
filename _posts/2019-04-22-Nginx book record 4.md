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

当请求url为“/file”时，转发请求“10.168.11.21/login.html”
```cpp
#include <ngx_config.h>
#include <ngx_core.h>
#include <ngx_http.h>

static void* ngx_http_mytest_create_loc_conf(ngx_conf_t *cf);
static char *ngx_http_mytest_merge_loc_conf(ngx_conf_t *cf, void *parent, void *child);
static char* ngx_http_mytest(ngx_conf_t *cf, ngx_command_t *cmd, void *conf);
static ngx_int_t mytest_upstream_process_header(ngx_http_request_t *r);

static ngx_str_t ngx_http_proxy_hide_headers[] =
{
ngx_string("Date"),
ngx_string("Server"),
ngx_string("X-Pad"),
ngx_string("X-Accel-Expires"),
ngx_string("X-Accel-Redirect"),
ngx_string("X-Accel-Limit-Rate"),
ngx_string("X-Accel-Buffering"),
ngx_string("X-Accel-Charset"),
ngx_null_string
};

//配置项结构体
typedef struct {
	ngx_http_upstream_conf_t upstream;
}ngx_http_mytest_conf_t;

//process_header返回的结构体
typedef struct {
	ngx_http_status_t status;
	ngx_str_t	backendServer;
}ngx_http_mytest_ctx_t;



static ngx_command_t ngx_http_mytest_commands[] = {
#if 0
	{
		ngx_string("mytest"),
		NGX_HTTP_MAIN_CONF|NGX_HTTP_SRV_CONF|NGX_HTTP_LOC_CONF|NGX_HTTP_LMT_CONF|NGX_CONF_NOARGS,
		ngx_http_mytest,
		NGX_HTTP_LOC_CONF_OFFSET,
		0,
		NULL
	},
	{
		ngx_string("testfile"),
		NGX_HTTP_MAIN_CONF|NGX_HTTP_SRV_CONF|NGX_HTTP_LOC_CONF|NGX_HTTP_LMT_CONF|NGX_CONF_NOARGS,
		ngx_http_testfile,
		NGX_HTTP_LOC_CONF_OFFSET,
		0,
		NULL
	},
#endif
	{
		ngx_string("mytest"),
		NGX_HTTP_LOC_CONF|NGX_CONF_NOARGS,
		ngx_http_mytest,
		NGX_HTTP_LOC_CONF_OFFSET,
		0,
		NULL
	},
	ngx_null_command
};

static ngx_http_module_t ngx_http_mytest_module_ctx = {
	NULL,
	NULL,

	NULL,
	NULL,

	NULL,
	NULL,
	
	ngx_http_mytest_create_loc_conf,
	ngx_http_mytest_merge_loc_conf
};

ngx_module_t ngx_http_mytest_module = {
	NGX_MODULE_V1,
	&ngx_http_mytest_module_ctx,
	ngx_http_mytest_commands,
	NGX_HTTP_MODULE,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NGX_MODULE_V1_PADDING
};

//初始化配置项结构体
static void* ngx_http_mytest_create_loc_conf(ngx_conf_t *cf){
	ngx_http_mytest_conf_t *mycf;
	mycf = (ngx_http_mytest_conf_t*)ngx_pcalloc(cf->pool, sizeof(ngx_http_mytest_conf_t));
	if (mycf == NULL){
		return NULL;
	}
	mycf->upstream.connect_timeout = 6000;
	mycf->upstream.send_timeout = 6000;
	mycf->upstream.read_timeout = 6000;
	mycf->upstream.store_access = 0600;
	mycf->upstream.buffering = 0;
	mycf->upstream.bufs.num = 8;
	mycf->upstream.bufs.size = ngx_pagesize;
	mycf->upstream.buffer_size = ngx_pagesize;
	mycf->upstream.busy_buffers_size = ngx_pagesize * 2;
	mycf->upstream.temp_file_write_size = ngx_pagesize * 2;
	mycf->upstream.max_temp_file_size = 1024 * 1024 * 1024;

	/*upstream模块要求hide_headers成员必须要初始化，这里赋值为NGX_CONF_UNSET_PTR，
	是为了在merge合并配置项方法中使用upstream模块提供的ngx_http_upstream_hide_headers_hash方法初始化hide_headers成员*/
	mycf->upstream.hide_headers = NGX_CONF_UNSET_PTR;
	mycf->upstream.pass_headers = NGX_CONF_UNSET_PTR;
	return mycf;
}

//这一段目前主要是为了初始化upsteam中hide_headers
static char *ngx_http_mytest_merge_loc_conf(ngx_conf_t *cf, void *parent, void *child){
	ngx_http_mytest_conf_t* prev = (ngx_http_mytest_conf_t*)parent;
	ngx_http_mytest_conf_t* conf = (ngx_http_mytest_conf_t*)child;

	ngx_hash_init_t hash;
	hash.max_size = 100;
	hash.bucket_size = 1024;
	hash.name = "proxy_headers_hash";
	if (ngx_http_upstream_hide_headers_hash(cf, &conf->upstream, 
		&prev->upstream, ngx_http_proxy_hide_headers, &hash) != NGX_OK){
		return NGX_CONF_ERROR;
	}
	return NGX_CONF_OK;

}

//create_request方法
static ngx_int_t mytest_upstream_create_request(ngx_http_request_t *r){
	static ngx_str_t backendQueryLine = ngx_string("GET /login.html HTTP/1.1\r\nHost: 10.168.11.21\r\nConnection: close\r\n\r\n");
	ngx_int_t queryLineLen = backendQueryLine.len + r->args.len;
	//必须由内存池中申请内存，这有两点好处：在网络情况不佳的情况下，向上游
	//服务器发送请求时，可能需要epoll多次调度send发送才能完成，
	//这时必须保证这段内存不会被释放；请求结束时，这段内存会被自动释放，
	//降低内存泄漏的可能
	ngx_buf_t* b = ngx_create_temp_buf(r->pool, queryLineLen);
	if (b == NULL)
		return NGX_ERROR;
	//last要指向请求的末尾
	b->last = b->pos + queryLineLen;

	//作用相当于snprintf，只是它支持4.4节中的表4-7列出的所有转换格式
	ngx_snprintf(b->pos, queryLineLen, (char*)backendQueryLine.data, &r->args);

	r->upstream->request_bufs = ngx_alloc_chain_link(r->pool);
	if (r->upstream->request_bufs == NULL)
		return NGX_ERROR;

	r->upstream->request_bufs->buf = b;
	r->upstream->request_bufs->next = NULL;
	r->upstream->request_sent = 0;
	r->upstream->header_sent = 0;
	r->header_hash = 1; //不可以为0
	char* tmp = (char *)malloc(backendQueryLine.len + 1);
	memcpy(tmp, b->pos, backendQueryLine.len);
	tmp[backendQueryLine.len] = '\0';
	return NGX_OK;
}

//process_header方法  mytest_process_status_line解析响应行  mytest_upstream_process_header解析响应头
//当mytest_upstream_process_header返回NGX_OK后，upstream模块开始把上游的包体直接转发到下游客户端
static ngx_int_t mytest_process_status_line(ngx_http_request_t *r){
	printf("mytest_process_status_line\n");
	size_t len;
	ngx_int_t rc;
	ngx_http_upstream_t *u;

	ngx_http_mytest_ctx_t *ctx = ngx_http_get_module_ctx(r, ngx_http_mytest_module);
	if (ctx == NULL){
		return NGX_ERROR;
	}

	u = r->upstream;

	rc = ngx_http_parse_status_line(r, &u->buffer, &ctx->status);

	if (rc == NGX_AGAIN){
		return rc;
	}

	if (rc == NGX_ERROR) {
		ngx_log_error(NGX_LOG_ERR, r->connection->log, 0, "upstream sent no valid HTTP/1.0 header");
		r->http_version = NGX_HTTP_VERSION_9;
		u->state->status = NGX_HTTP_OK;
		return NGX_OK;
	}

	if (u->state){
		u->state->status = ctx->status.code;
	}
	u->headers_in.status_n = ctx->status.code;
	len = ctx->status.end - ctx->status.start;
	u->headers_in.status_line.len = len;
	u->headers_in.status_line.data = ngx_pnalloc(r->pool, len);
	if (u->headers_in.status_line.data == NULL){
		return NGX_ERROR;
	}
	ngx_memcpy(u->headers_in.status_line.data, ctx->status.start, len);
	u->process_header = mytest_upstream_process_header;
	return mytest_upstream_process_header(r);
}
static ngx_int_t mytest_upstream_process_header(ngx_http_request_t *r){
	printf("mytest_upstream_process_header\n");
	ngx_int_t rc;
	ngx_table_elt_t *h;
	ngx_http_upstream_header_t *hh;
	ngx_http_upstream_main_conf_t *umcf;

	umcf = ngx_http_get_module_main_conf(r, ngx_http_upstream_module);

	//循环解析所有的HTTP头部
	for(;;){
		rc = ngx_http_parse_header_line(r, &r->upstream->buffer, 1);
		if (rc == NGX_OK){
			h = ngx_list_push(&r->upstream->headers_in.headers);
			if (h == NULL){
				return NGX_ERROR;
			}
			h->hash = r->header_hash;
			h->key.len = r->header_name_end - r->header_name_start;
			h->value.len = r->header_end - r->header_start;
			h->key.data = ngx_pnalloc(r->pool, h->key.len +1 + h->value.len + 1 + h->key.len);
			if (h->key.data == NULL){
				return NGX_ERROR;
			}
			h->value.data = h->key.data + h->key.len + 1;
			h->lowcase_key = h->value.data + h->value.len + 1;
			ngx_memcpy(h->key.data, r->header_name_start, h->key.len);
			h->key.data[h->key.len] = '\0';
			ngx_memcpy(h->value.data, r->header_start, h->value.len);
			h->value.data[h->value.len] = '\0';
			if (h->key.len == r->lowcase_index){
				ngx_memcpy(h->lowcase_key, r->lowcase_header, h->key.len);
			}else{
				ngx_strlow(h->lowcase_key, h->key.data, h->key.len);
			}

			hh = ngx_hash_find(&umcf->headers_in_hash, h->hash, h->lowcase_key, h->key.len);
			if (hh && hh->handler(r, h, hh->offset) != NGX_OK) {
				return NGX_ERROR;
			}
			continue;
		}
		if (rc == NGX_HTTP_PARSE_HEADER_DONE){
			//如果之前解析HTTP头部时没有发现server和date头部，那么下面会根据HTTP协议规范添加这个两个头部
			if (r->upstream->headers_in.server == NULL){
				h = ngx_list_push(&r->upstream->headers_in.headers);
				if (h == NULL){
					return NGX_ERROR;
				}
				h->hash = ngx_hash(ngx_hash(ngx_hash(ngx_hash(
					ngx_hash('s','e'),'r'),'v'),'e'),'r');
				ngx_str_set(&h->key, "Server");
				ngx_str_null(&h->value);
				h->lowcase_key = (u_char *)"server";
			}
			if (r->upstream->headers_in.date == NULL){
				h = ngx_list_push(&r->upstream->headers_in.headers);
				if (h == NULL){
					return NGX_ERROR;
				}
				h->hash = ngx_hash(ngx_hash(ngx_hash('d','a'),'t'),'e');
				ngx_str_set(&h->key, "Date");
				ngx_str_null(&h->value);
				h->lowcase_key = (u_char *)"date";
			}
			return NGX_OK;
		}
		if (rc == NGX_AGAIN){
			return NGX_AGAIN;
		}
		ngx_log_error(NGX_LOG_ERR, r->connection->log, 0, "upstream sent invalid header");
		return NGX_HTTP_UPSTREAM_INVALID_HEADER;
	}
}

//finalize_request方法
static void mytest_upstream_finalize_request(ngx_http_request_t *r, ngx_int_t rc){
	ngx_log_error(NGX_LOG_DEBUG, r->connection->log, 0, "mytest_upstream_finalize_request");
}
static ngx_int_t ngx_http_mytest_handler(ngx_http_request_t *r){
	ngx_http_mytest_ctx_t* myctx = ngx_http_get_module_ctx(r, ngx_http_mytest_module);
	if (myctx == NULL){
		myctx = ngx_palloc(r->pool, sizeof(ngx_http_mytest_ctx_t));
		if (myctx == NULL){
			return NGX_ERROR;
		}
		ngx_http_set_ctx(r, myctx, ngx_http_mytest_module);
	}

	if (ngx_http_upstream_create(r) != NGX_OK){
		ngx_log_error(NGX_LOG_ERR, r->connection->log, 0, "ngx_http_upstream_create() failed");
		return NGX_LOG_ERR;
	}

	ngx_http_mytest_conf_t* mycf = (ngx_http_mytest_conf_t*)ngx_http_get_module_loc_conf(r, ngx_http_mytest_module);
	ngx_http_upstream_t *u = r->upstream;
	u->conf = &mycf->upstream;
	u->buffering = mycf->upstream.buffering;

	u->resolved = (ngx_http_upstream_resolved_t*)ngx_pcalloc(r->pool, sizeof(ngx_http_upstream_resolved_t));
	if (u->resolved == NULL){
		ngx_log_error(NGX_LOG_ERR, r->connection->log, 0, "ngx_pcalloc resolved error. %s.", strerror(errno));
		return NGX_ERROR;
	}
	
	static struct sockaddr_in backendSockAddr;
	struct hostent* pHost = gethostbyname((char *)"www.baidu.com");
	if (pHost == NULL){
		ngx_log_error(NGX_LOG_ERR, r->connection->log, 0, "gethostbyname error.");
		return NGX_ERROR;
	}
	backendSockAddr.sin_family = AF_INET;
	backendSockAddr.sin_port = htons((in_port_t)80);
	char* pDmsIP = "10.168.11.21"; //inet_ntoa(*(struct in_addr*)(pHost->h_addr_list[0]));
	backendSockAddr.sin_addr.s_addr = inet_addr(pDmsIP);
	myctx->backendServer.data= (u_char*)pDmsIP;
	myctx->backendServer.len = strlen(pDmsIP);

	u->resolved->sockaddr = (struct sockaddr *)&backendSockAddr;
	u->resolved->socklen = sizeof(struct sockaddr_in);
	u->resolved->naddrs = 1;
	u->resolved->port = htons((in_port_t)80);
	u->create_request = mytest_upstream_create_request;
	u->process_header = mytest_process_status_line;
	u->finalize_request = mytest_upstream_finalize_request;
	r->main->count++;
	ngx_http_upstream_init(r);
	return NGX_DONE;
}	

static char* ngx_http_mytest(ngx_conf_t *cf, ngx_command_t *cmd, void *conf){
	ngx_http_core_loc_conf_t *clcf;
	clcf = ngx_http_conf_get_module_loc_conf(cf, ngx_http_core_module);
	clcf->handler = ngx_http_mytest_handler;
	return NGX_CONF_OK;
}
```

### 5.4 subrequest的使用方式

subrequest设计的基础是生成一个（子）请求的代价要非常小，消耗的内存也要很少，并且不会一直占用进程资源。因此，每个请求都应该做简单、独立的工作，而有多个子请求合成为一个父请求向客户端提供完整的服务。在Nginx中，大量功能复杂的模块都是基于subrequest实现的。
使用步骤：

1. 在nginx.conf文件中配置好子请求的处理方式。
2. 启动subrequest子请求。
3. 实现子请求执行结束时的回调方法。
4. 实现父请求被激活时的回调方法。

#### 5.4.1 配置子请求的处理方式

子请求与普通请求的不同之处在于，子请求是由父请求生成的，不是接收客户端发来的网络包再由HTTP框架解析出的。#

#### 5.4.2 实现子请求处理完毕时的回调方法

Nginx在子请求正常或者异常结束时，都会调用`ngx_http_post_subrequest_pt`回调方法，如下所示：
`typedef ngx_int_t (*ngx_http_post_subrequest_pt)(ngx_http_request_t *r, void *data, ngx_int_t rc);`
可以通过建立`ngx_http_post_subrequest_t`结构体将回调方法传递给subrequest子请求。

```cpp
typedef struct{
  ngx_http_post_subrequest_pt handler;
  void *data;//作为handler的参数
} ngx_http_post_subrequest_t;
```

回调方法中的`rc`表示子请求结束时的状态。取值是执行`ngx_http_finalize_request`销毁请求是传递的rc参数。源代码如下

```cpp
void ngx_http_finalize_request(ngx_http_request_t *r, ngx_int_t rc){
  ...
  if (r != r->main && r->post_subrequest){
    rc = r->post_subrequest->handler(r, r->post_subrequest->data, rc);
  }
  ...
}
```

#### 5.4.3 处理父请求被重新激活后的回调方法

```cpp
typedef void (*ngx_http_event_handler_pt)(ngx_http_request_t *r);
struct ngx_http_request_s{
  ...
  ngx_http_event_handler_pt write_event_handler;
  ...
}
```


#### 5.4.4 启动subrequest子请求

在`ngx_http_mytest_handler`处理方法中，可以启动subrequest子请求。首先调用`ngx_http_subrequest`方法建立subrequest子请求，在`ngx_http_mytest_handler`返回后，HTTP框架会自动执行子请求。
`ngx_int_t ngx_http_subrequest(ngx_http_request_t *r, ngx_str_t *uri, ngx_str_t *args, ngx_http_request_t **psr, ngx_http_post_subrequest_t *ps, ngx_uint_t flags);`

下面一次介绍参数和返回值

1. `ngx_http_request_t *r` 当前的请求（父请求）
2. `ngx_str_t *uri` 子请求的uri（用来决定被配置项中的哪个模块处理）
3. `ngx_str_t *args` 子请求的uri参数
4. `ngx_http_request_t **psr` 这个输出参数，是由这个函数生成的子请求
5. `ngx_http_post_subrequest_t *ps` 用来指定请求结束时的回调处理方法
6. `ngx_uint_t flags` flag的取值范围包括：①0，没有特殊需求的情况下都应该填写它。②`NGX_HTTP_SUBREQUEST_IN_MEMORY`，这个宏会将子请求的`subrequest_in_memory`标志位置1。这意味着如果子请求使用upstream访问上游服务器，那么上游服务器的响应会在内存中处理。③`NGX_HTTP_SUBREQUEST_WAITED`，这个宏会将子请求的waited标志位置1，当子请求提前结束时，有个done标志位会置1。flag是按比特位操作的，所以可以同时设置上述三个值。
7. 返回值 `NGX_OK`成功   `NGX_ERROR`失败

### 5.5 subrequest执行过程的主要场景

有以下三个场景

1. 启动subrequest后子请求是如何运行的
2. 子请求如何存放接收到的响应
3. 子请求结束时如何回调处理方法，以及机获父请求的处理方法

#### 5.5.1 如何启动subrequest

在处理当前请求（父请求）时，在handler函数中创建新的子请求，HTTP框架会把这个子请求加入到posted_requests链表中，handler函数返回`NGX_DONE`后，HTTP框架会开始处理子请求。

#### 5.5.2 如何转发多个子请求的响应包体

`ngx_http_postpone_filter_module`这个过滤模块实际上就是为了subrequest功能而建立的。
这个模块会维护一个链表结构，链表中的每一项都是指向子请求要转发的响应（有很多子请求是不转发给客户端的，只在nginx上做处理）。这个模块会按顺序的将这些响应依次转发给客户端。

#### 5.5.3 子请求如何激活父请求

回调子请求的处理方法是设置了父请求的回调方法。子请求处理方法返回后，调用父请求的回调方法。

### 5.6 subrequest例子

请求获取新浪的上证指数信息，由模块接手处理，创建新的请求，去获取上证指数交易量等信息。然后重新构造响应返回给客户端。
```cpp
#include <ngx_config.h>//包含必要的头文件
#include <ngx_core.h>
#include <ngx_http.h>
//请求上下文，用于保存子请求回调方法中解析出来的股票数据
typedef struct
{
    ngx_str_t stock[6];
} ngx_http_lcwsubrequest_ctx_t;
//先声明函数
static char *ngx_http_lcwsubrequest(ngx_conf_t *cf, ngx_command_t *cmd, void *conf);
static ngx_int_t ngx_http_lcwsubrequest_handler(ngx_http_request_t *r);
static ngx_int_t lcwsubrequest_subrequest_post_handler(ngx_http_request_t *r,void *data, ngx_int_t rc);
static void lcwsubrequest_post_handler(ngx_http_request_t * r);
//ngx_command_t定义模块的配置文件参数
static ngx_command_t ngx_http_lcwsubrequest_commands[] =
{
    {
        //配置项名称
        ngx_string("mytest"),
        //配置项类型，将指定配置项可以出现的位置
        //例如出现在server{}或location{}中，以及他可以携带的参数个数
         NGX_HTTP_MAIN_CONF | NGX_HTTP_SRV_CONF | NGX_HTTP_LOC_CONF | NGX_HTTP_LMT_CONF | NGX_CONF_NOARGS,
         //ngx_command_t结构体中的set成员，
         //当在某个配置块中出现lcwsubrequest配置项时，Nginx将会调用ngx_http_lcwsubrequest方法
         //ngx_http_lcwsubrequest方法将在下面实现
         ngx_http_lcwsubrequest,
         //在配置文件中的偏移量conf
         NGX_HTTP_LOC_CONF_OFFSET,
         //offset通常用于使用预设的解析方法解析配置项，需要与conf配合使用
         0,
         //配置项读取后的处理方法，必须是ngx_conf_post_t结构的指针
         NULL
    },
    //ngx_null_command是一个空的ngx_command_t结构，用来表示数组的结尾
    ngx_null_command
};
//ngx_http_module_t的8个回调方法，因为目前没有什么工作是必须在HTTP框架初始化
//时完成的，所以暂时不必实现ngx_http_module_t的8个回调方法
static ngx_http_module_t  ngx_http_lcwsubrequest_module_ctx =
{
    NULL,       // preconfiguration解析配置文件前调用
    NULL,       // postconfiguration 完成配置文件解析后调用

    NULL,       // create main configuration当需要创建数据结构用于存储main级别的
                //(直属于http{}块的配置项)的全局配置项时
    NULL,       // init main configuration常用于初始化main级别的配置项

    NULL,       // create server configuration当需要创建数据结构用于存储srv级别的
                //(直属于server{}块的配置项)的配置项时 
    NULL,       // merge server configuration用于合并main级别和srv级别下的同名配置项

    NULL,       // create location configuration 当需要创建数据结构用于存储loc级别的
                //(直属于location{}块的配置项)的配置项时
    NULL        // merge location configuration 用于合并srv和loc级别下的同名配置项
};
//定义lcwsubrequest模块
//lcwsubrequest模块在编译时会被加入到ngx_modules全局数组中
//Nginx在启动时，会调用所有模块的初始化回调方法
//HTTP框架初始化时会调用ngx_http_module_t中的8个方法
//HTTP模块数据结构
ngx_module_t  ngx_http_mytest_module =
{
    NGX_MODULE_V1,//该宏为下面的ctx_index,index，spare0，spare1，spare2，spare3，version变量
                  //提供了初始化的值：0,0,0,0,0,0,1
    //ctx_index表示当前模块在这类模块中的序号
    //index表示当前模块在所有模块中的序号，Nginx启动时会根据ngx_modules数组设置各模块的index值
    //spare0   spare系列的保留变量，暂未使用
    //spare1
    //spare2
    //spare3
    //version模块的版本，便于将来的扩展，目前只有一种，默认为1
    &ngx_http_lcwsubrequest_module_ctx, //ctx用于指向一类模块的上下文结构
    ngx_http_lcwsubrequest_commands,   //commands将处理nginx.conf中的配置项
    NGX_HTTP_MODULE,        //模块的类型，与ctx指针紧密相关，取值范围是以下5种：
                            //NGX_HTTP_MODULE,NGX_CORE_MODULE,NGX_CONF_MODULE,NGX_EVENT_MODULE,NGX_MAIL_MODULE
    //以下7个函数指针表示有7个执行点会分别调用这7种方法，对于任一个方法而言，如果不需要nginx在某个是可执行它
    //那么简单地将他设为空指针即可
    NULL,                           //master进程启动时回调init_master
    NULL,                           //init_module回调方法在初始化所有模块时被调用，在master/worker模式下，
                                    //这个阶段将在启动worker子进程前完成
    NULL,                           //init_process回调方法在正常服务前被调用，在master/worker模式下，
                                    //多个worker子进程已经产生，在每个worker子进程的初始化过程会调用所有模块的init_process函数
    NULL,                           //由于nginx暂不支持多线程模式，所以init thread在框架代码中没有被调用过
    NULL,                           // exit thread,也不支持
    NULL,                           //exit process回调方法将在服务停止前调用，在master/worker模式下，worker进程会在退出前调用它
    NULL,                           //exit master回调方法将在master进程退出前被调用
    NGX_MODULE_V1_PADDING           //这里是8个spare_hook变量，是保留字段，目前没有使用，Nginx提供了NGX_MODULE_V1_PADDING宏来填充
};
/******************************************************
函数名：lcwsubrequest_subrequest_post_handler(ngx_http_request_t *r,void *data, ngx_int_t rc)
参数：
功能：子请求结束时的处理方法
*******************************************************/
static ngx_int_t lcwsubrequest_subrequest_post_handler(ngx_http_request_t *r,void *data, ngx_int_t rc)
{
    //当前请求r是子请求，它的parent成员就指向父请求
    ngx_http_request_t *pr = r->parent;
    //注意，上下文是保存在父请求中的，所以要由pr中取上下文。
    //其实有更简单的方法，即参数data就是上下文，初始化subrequest时
    //我们就对其进行设置了的，这里仅为了说明如何获取到父请求的上下文
    //上下文是全局数据结构，应该也可以直接取吧？
    ngx_http_lcwsubrequest_ctx_t* myctx = ngx_http_get_module_ctx(pr, ngx_http_mytest_module);
    pr->headers_out.status = r->headers_out.status;
    //如果返回NGX_HTTP_OK（也就是200）意味着访问新浪服务器成功，接着将
    //开始解析http包体
    if (r->headers_out.status == NGX_HTTP_OK)
    {
        int flag = 0;
        //在不转发响应时，buffer中会保存着上游服务器的响应。特别是在使用
        //反向代理模块访问上游服务器时，如果它使用upstream机制时没有重定义
        //input_filter方法，upstream机制默认的input_filter方法会试图
        //把所有的上游响应全部保存到buffer缓冲区中
        ngx_buf_t* pRecvBuf = &r->upstream->buffer;
        printf("buffer:%sEOF", pRecvBuf->pos);
        //以下开始解析上游服务器的响应，并将解析出的值赋到上下文结构体
        //myctx->stock数组中
        //新浪服务器返回的大致如下
        //var hq_str_s_sh000001="上证指数,3954.556,68.236,1.76,4300733,57868551";
        for (; pRecvBuf->pos != pRecvBuf->last; pRecvBuf->pos++)
        {
            if (*pRecvBuf->pos == ',' || *pRecvBuf->pos == '\"')
            {
                if (flag > 0)
                {
                    myctx->stock[flag - 1].len = pRecvBuf->pos - myctx->stock[flag - 1].data;
                }
                flag++;
                myctx->stock[flag - 1].data = pRecvBuf->pos + 1;
            }
            if (flag > 6)
                break;
        }
    }
    //这一步很重要，设置接下来父请求的回调方法
    pr->write_event_handler = lcwsubrequest_post_handler;
    return NGX_OK;
}
/******************************************************
函数名：lcwsubrequest_post_handler(ngx_http_request_t * r)
参数：
功能：父请求的回调方法
*******************************************************/
static void lcwsubrequest_post_handler(ngx_http_request_t * r)
{
    //如果没有返回200则直接把错误码发回用户
    if (r->headers_out.status != NGX_HTTP_OK)
    {
        ngx_http_finalize_request(r, r->headers_out.status);
        return;
    }
    //当前请求是父请求，直接取其上下文
    ngx_http_lcwsubrequest_ctx_t* myctx = ngx_http_get_module_ctx(r, ngx_http_mytest_module);
    //定义发给用户的http包体内容，格式为：
    //stock[…],Today current price: …, volumn: …
    ngx_str_t output_format = ngx_string("Hello,are you OK?stock[%V],Today current price: %V, volumn: %V");
    //计算待发送包体的长度
    //减去6是因为格式控制符"%V"是会被替换成要输出的变量的，在len成员里计算了它的长度，需要减去   
    int bodylen = output_format.len + myctx->stock[0].len+ myctx->stock[1].len + myctx->stock[4].len - 6;
    r->headers_out.content_length_n = bodylen;
    //在内存池上分配内存保存将要发送的包体
    ngx_buf_t* b = ngx_create_temp_buf(r->pool, bodylen);
    //将取到的三个参数写到输出的数组里面
    ngx_snprintf(b->pos, bodylen, (char*)output_format.data,&myctx->stock[0], &myctx->stock[1], &myctx->stock[4]);
    //设置last指针
    b->last = b->pos + bodylen;
    b->last_buf = 1;
    ngx_chain_t out;
    out.buf = b;
    out.next = NULL;
    //设置Content-Type，注意汉字编码新浪服务器使用了GBK
    static ngx_str_t type = ngx_string("text/plain; charset=GBK");
    r->headers_out.content_type = type;
    r->headers_out.status = NGX_HTTP_OK;
    r->connection->buffered |= NGX_HTTP_WRITE_BUFFERED;
    ngx_int_t ret = ngx_http_send_header(r);
    ret = ngx_http_output_filter(r, &out);
    //注意，这里发送完响应后必须手动调用ngx_http_finalize_request
    //结束请求，因为这时http框架不会再帮忙调用它
    ngx_http_finalize_request(r, ret);
}
/******************************************************
函数名：ngx_http_lcwsubrequest(ngx_conf_t *cf, ngx_command_t *cmd, void *conf)
参数：
功能：lcwtest方法的实现
*******************************************************/
static char* ngx_http_lcwsubrequest(ngx_conf_t *cf, ngx_command_t *cmd, void *conf)
{
    ngx_http_core_loc_conf_t  *clcf;
    //首先找到lcwsubrequest配置项所属的配置块，clcf貌似是location块内的数据
    //结构，其实不然，它可以是main、srv或者loc级别配置项，也就是说在每个
    //http{}和server{}内也都有一个ngx_http_core_loc_conf_t结构体
    clcf = ngx_http_conf_get_module_loc_conf(cf, ngx_http_core_module);
    //http框架在处理用户请求进行到NGX_HTTP_CONTENT_PHASE阶段时，如果
    //请求的主机域名、URI与lcwsubrequest配置项所在的配置块相匹配，就将调用我们
    //实现的ngx_http_lcwsubrequest_handler方法处理这个请求
    //ngx_http_lcwsubrequest_handler将在下面实现
    clcf->handler = ngx_http_lcwsubrequest_handler;
    return NGX_CONF_OK;
}
/******************************************************
函数名：ngx_http_lcwsubrequest_handler(ngx_http_request_t *r)
参数：ngx_http_request_t结构体
功能：创建subrequest子请求
*******************************************************/
static ngx_int_t ngx_http_lcwsubrequest_handler(ngx_http_request_t *r)
{
    //创建http上下文
    ngx_http_lcwsubrequest_ctx_t* myctx = ngx_http_get_module_ctx(r, ngx_http_mytest_module);
    if (myctx == NULL)
    {
        myctx = ngx_palloc(r->pool, sizeof(ngx_http_lcwsubrequest_ctx_t));
        if (myctx == NULL)
        {
            return NGX_ERROR;
        }
        //将上下文设置到原始请求r中
        ngx_http_set_ctx(r, myctx, ngx_http_mytest_module);
    }
    // ngx_http_post_subrequest_t结构体会决定子请求的回调方法
    //typedef struct{
    //  ngx_http_post_subrequest_pt handler;//回调方法
    //  void *data;//ngx_http_post_subrequest_pt回调方法执行时的参数
    //}
    ngx_http_post_subrequest_t *psr = ngx_palloc(r->pool, sizeof(ngx_http_post_subrequest_t));
    if (psr == NULL)
    {
        return NGX_HTTP_INTERNAL_SERVER_ERROR;
    }
    //设置子请求回调方法为lcwsubrequest_subrequest_post_handler
    psr->handler = lcwsubrequest_subrequest_post_handler;
    //data设为myctx上下文，这样回调lcwsubrequest_subrequest_post_handler
    //时传入的data参数就是myctx
    psr->data = myctx;
    //子请求的URI前缀是/list，这是因为访问新浪服务器的请求必须是类似/list=s_sh000001这样的URI，
    //这与在nginx.conf中配置的子请求location中的URI是一致的
    ngx_str_t sub_prefix = ngx_string("/list=");
    ngx_str_t sub_location;
    sub_location.len = sub_prefix.len + r->args.len;
    sub_location.data = ngx_palloc(r->pool, sub_location.len);
    ngx_snprintf(sub_location.data, sub_location.len,"%V%V", &sub_prefix, &r->args);
    //sr就是子请求
    ngx_http_request_t *sr;
    //调用ngx_http_subrequest创建子请求，它只会返回NGX_OK
    //或者NGX_ERROR。返回NGX_OK时，sr就已经是合法的子请求。注意，这里
    //的NGX_HTTP_SUBREQUEST_IN_MEMORY参数将告诉upstream模块把上
    //游服务器的响应全部保存在子请求的sr->upstream->buffer内存缓冲区中
    //ngx_http_subrequest函数的参数：
    //当前的请求（父请求），子请求的url，子请求的url的参数，sr为输出参数（指向以及建立好的子请求），psr指出子请求结束时必须回调的处理方法
    ngx_int_t rc = ngx_http_subrequest(r, &sub_location, NULL, &sr, psr, NGX_HTTP_SUBREQUEST_IN_MEMORY);
    if (rc != NGX_OK)
    {
        return NGX_ERROR;
    }
    //必须返回NGX_DONE，理由同upstream
    r->count++;
    return NGX_DONE;
}
```



