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

### 3.4 直接修改MakeFile文件

1. 使用configure完成一次配置
2. 修改`objs/ngx_modules.c` 添加新增的第三方模块的声明
3. 修改`objs/ngx_modules.c` 在`ngx_modules`数组的合适位置加入模块
4. 修改`objs/Makefile` 添加第三模块的编译源代码部分
5. 修改`objs/Makefile` 在链接部分添加第三方模块的obj对象

### 3.5 HTTP模块的数据结构

`ngx_module_t ngx_hhtp_mytest_moudule;`
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

### 3.6 定义自己的HTTP模块



