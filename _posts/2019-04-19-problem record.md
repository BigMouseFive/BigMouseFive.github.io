---
layout: post
title: 问题记录
date: '2019-04-19 09:40'
categories: 
 - 未完成
tags:
 - 未完成
---

# nginx发送磁盘文件

按照nginx3.8节编写了一个第三方模块，用来发送`/test.txt`文件。但是用浏览器访问时大多数情况下无法访问，偶尔几次能访问成功。通过调试，发现会卡在`return ngx_http_output_filter(r, &out)`处。代码如下：

```cpp
static ngx_int_t ngx_http_testfile_handler(ngx_http_request_t *r){
	//只接受GET和HEAD方法
	if (!(r->method & (NGX_HTTP_GET|NGX_HTTP_HEAD))){
		return NGX_HTTP_NOT_ALLOWED;
	}

	//不处理包体
	ngx_int_t rc = ngx_http_discard_request_body(r);
	if (rc != NGX_OK){
		return rc;
	}

	//配置文件
	ngx_buf_t *b;
	b = ngx_palloc(r->pool, sizeof(ngx_buf_t));
	u_char *filename = (u_char*)"/test.txt";
	b->in_file = 1;
	b->file = ngx_pcalloc(r->pool, sizeof(ngx_file_t));
	b->file->fd = ngx_open_file(filename, NGX_FILE_RDONLY|NGX_FILE_NONBLOCK, NGX_FILE_OPEN, 0);
	b->file->log = r->connection->log;
	b->file->name.data = filename;
	b->file->name.len = sizeof(filename) - 1;
	if (b->file->fd <= 0){
		return NGX_HTTP_NOT_FOUND;
	}
	r->allow_ranges = 1;    //支持断点续传
	if (ngx_file_info(filename, &b->file->info) == NGX_FILE_ERROR){
		return NGX_HTTP_INTERNAL_SERVER_ERROR;
	}
	//填写响应内容到header_out中
	b->file_pos = 0;
	b->file_last = b->file->info.st_size;

	//清理文件的句柄
	ngx_pool_cleanup_t* cln = ngx_pool_cleanup_add(r->pool, sizeof(ngx_pool_cleanup_file_t));
	if (cln == NULL) {
		return NGX_ERROR;
	}

	cln->handler = ngx_pool_cleanup_file;
	ngx_pool_cleanup_file_t *clnf = cln->data;
	clnf->fd = b->file->fd;
	clnf->name = b->file->name.data;
	clnf->log = r->pool->log;

	//发送响应头部
	ngx_str_t type = ngx_string("text/plain");
	r->headers_out.status = NGX_HTTP_OK;
	r->headers_out.content_length_n = b->file->info.st_size;
	r->headers_out.content_type = type;
	rc = ngx_http_send_header(r);
	if (rc == NGX_ERROR || rc > NGX_OK || r->header_only){
		return rc;
	}
	printf("%d,%d", r->headers_out.content_length_n);

	ngx_chain_t out;
	out.buf = b;
	out.next = NULL;

	return ngx_http_output_filter(r, &out);
}    
```


