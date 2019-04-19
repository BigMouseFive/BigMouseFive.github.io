---
layout: post
title: 深入理解nginx模块开发与架构解析[4]
date: '2019-04-19 11:06'
categories: 
 - 笔记
tags:
 - nginx
---

# 如何编写HTTP模块

## 第四章： 配置、error日志和请求上

### http配置项的使用场景

配置项实例如下，有一个配置项`test_str`，它在多个块内都出现了。
```
http {
  test_str main;

  server {
    listen 80;
    test_str server80;

    location /url1 {
      mytest;
      test_str loc1;
    }

    location /url2 {
      mytest;
      test_str loc2;
    }
  }

  server {
    listen 8080;
    test_str server8080;
    location /url3 {
      mytest;
      test_str loc2;
    }
  }
}
```

当请求`/url1`时，`test_str`的值是location下的loc1，还是这个location所诉和的server块下的server80， 又或者是http块下的main呢？这个值完全可以由mytest自己决定，因为每一个配置块下都会生成独立的数据结构来存放配置项。

### 4.2 怎样使用HTTP配置项

处理HTTP配置i项可以分为下面4个步骤

1. 创建数据结构用于存储配置项对应的参数。
2. 设定配置项在nginx.conf中出现时的限制条件和回调方法。
3. 实现2中的回调方法，或者使用Nginx框架预设的14个回调方法。
4. 合并不同级别的配置快中出现的同名配置项。

通过使用`ngx_http_moudule_t`和`ngx_command_t`两个结构来配合Nginx实现上面的四个步骤。

#### 分配用于保存配置参数的数据结构

创建一个结构体，保存所有我们感兴趣的参数。为了说明14种预设配置项的解析方法，例子里的结构体将定义14个成员。

```cpp
typedef struct {
  ngx_str_t my_str;
  ngx_int_t my_num;
  ngx_flag_t my_flag;
  size_t my_size;
  ngx_array_t* my_str_array;
  ngx_array_t* my_keyval;
  off_t my_off;
  ngx_msec_t my_msec;
  time_t my_sec;
  ngx_bufs_t my_bufs;
  ngx_uint_t my_enum_seq;
  ngx_uint_t my_bitmask;
  ngx_uint_t my_access;
  ngx_uint_t my_path;
} ngx_http_mytest_conf_t;
```

把配置项定义成结构体而不是定义几个全局变量的原因是多个location块、http块、server块是允许同时生效的，也就是说上面定义的结构体必须Nginx的存中保存许多份。
`ngx_http_module_t`中的`create_main_conf`\`create_svr_conf`\`create_loc_conf`三个回调方法负责把问哦们分配的用于保存配置项的结构体传递给HTTP框架。
HTTP框架在解析http模块配置项的时，会调用所有HTTP模块可能实现的`create_main_conf`、`create_svr_conf`、`create_loc_conf`；解析server配置项时，会调用所有HTTP模块可能实现的`create_svr_conf`、`create_loc_conf`；而解析location配置项时，会调用所有HTTP模块可能实现的`create_loc_conf`。
普通的HTTP模块往往只实现`create_loc_conf`，因为他们只关注匹配某种URL的请求。我们的例子也是，下面就是`create_loc_conf`回调的实例

```cpp
static void *ngx_http_mytest_create_loc_conf(ngx_conf_t *cf){
  ngx_http_mytest_conf_t *mycf;
  mycf = (ngx_http_mytest_conf_t *)ngx_pcalloc(cf->pool, sizeof(ngx_http_mytest_conf_t));
  if (mycf == NULL){
    return NULL;
  }
  mycf->test_flag = NGX_CONF_UNSET;
  mycf->test_num = NGX_CONF_UNSET;
  mycf->test_str_array = NGX_CONF_UNSET_PTR;
  mycf->test_keyval = NULL;
  mycf->test_off = NGX_CONF_UNSET;
  mycf->test_msec = NGX_CONF_UNSET_MSEC;
  mycf->test_sec = NGX_CONF_UNSET;
  mycf->test_size = NGX_CONF_UNSET_SIZE;
  return mycf;
}
```

#### 4.2.2 设定配置项的解析方式

详细介绍`ngx_command_t`结构

1. `ngx_str_t name`。name是配置项的名称如本例中的`test_str`
2. `ngx_uint_t type`。type决定这个配置项可以在哪些配置块（http，server，location，if，upstream等），以及可以携带的参数类型和个数。
3. 回调函数set。指向解析配置项的方法。解析配置方法可以自定义，也可以使用Nginx预设的14个方法。
4. `ngx_uint_t conf`。用于指示配置项所处内存的相对偏移位置，仅在type中没有设置`NGX_DIRECT_CONF`和`NGX_MAIN_CONF`时才会生效。对于HTTP模块，conf是必须要设置的。
5. `ngx_uint_t offset`。表示当前配置项在整个存储配置项的结构体中的偏移位置（以Byte为单位）。如果是使用预设的解析方法就必须要使用offset，同时可以是用`offsetof(type, member)`来给offset赋值。
6. `void* post`。如果是自定义的解析回调方法，post的用途完全可以由用户自己定义。如果使用的是预设的解析方法，就需要根据这些预设方法来决定post的使用方式。

#### 4.2.3 使用14中预设的解析方法解析配置项

```cpp
static ngx_command_t ngx_http_mytest_commands[] = {
  ...
  // 1. ngx_conf_set_flag_slot  test_flag on|off
  {
    ngx_string("test_flag"),
    NGX_HTTP_LOC_CONF|NGX_CONF_FLAG,
    ngx_conf_set_flag_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_flag),
    NULL
  }

  // 2. ngx_conf_set_str_slot   test_str str;
  {
    ngx_string("test_str"),
    NGX_HTTP_MAIN_CONF|NGX_HTTP_SRV_CONF|NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_str_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_str),
    NULL      
  }
  
  // 3. ngx_conf_set_str_array_slot   
  //  test_str_array first_str;
  //  tset_str_array second_str;
  {
    ngx_string("test_str_array"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_str_array_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_array),
    NULL
  }

  // 4. ngx_conf_set_keyval_slot
  // test_keyval key1 value1;
  // test_keyval key2 value2;
  {
    ngx_string("test_keyval"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE2,
    ngx_conf_set_keyval_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_keyval),
    NULL
  }

  // 5. ngx_conf_set_num_slot  test_num 34;
  {
    ngx_string("test_num"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_num_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_num),
    NULL
  }

  // 6. ngx_conf_set_size_slot test_size 10m;
  //只允许后面的单位是k/K/m/M 不允许g/G
  {
    ngx_string("test_size"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_size_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_size),
    NULL
  }

  // 7. ngx_conf_set_off_slot test_off 1g;
  //支持k/K/m/M/g/G
  {
    ngx_string("test_off"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_off_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_off),
    NULL
  }

  // 8. ngx_conf_set_msec_slot test_msec 1d;
  // 会将1d转化毫秒数并保存
  {
    ngx_string("test_msec"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_msec_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_msec),
    NULL
  }

  // 9. ngx_conf_set_sec_slot test_msec 1d;
  // 会将1d转化秒数并保存
  {
    ngx_string("test_sec"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_sec_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_sec),
    NULL
  }

  // 10. ngx_conf_set_bufs_slot test_bufs 4 1k;
  // my_bufs会被设置为{4， 1024}
  {
    ngx_string("test_bufs"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE2,
    ngx_conf_set_bufs_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_bufs),
    NULL
  }

  // 11. ngx_conf_set_enum_slot test_enum banana;
  /*
    static ngx_conf_enum_t test_enums[] = {
      {ngx_string("apple"), 1},
      {ngx_string("banana"), 2},
      {ngx_string("orange"), 3},
      {ngx_null_string, 0}
    };
  */
  {
    ngx_string("test_enum"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_enum_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_enum),
    test_enums
  }

  // 12. ngx_conf_set_bitmask_slot test_bitmask best;
  // 与11很类似，不同在于效率上。这里用的是整型。
  /*
    static ngx_conf_bitmask_t test_bitmasks[] = {
      {ngx_string("best"), 0x2},
      {ngx_string("better"), 0x4},
      {ngx_string("great"), 0x8},
      {ngx_null_string, 0}
    };
  */
  {
    ngx_string("test_bitmasks"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE1,
    ngx_conf_set_bitmask_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_bitmask),
    test_bitmasks
  }

  // 13. ngx_conf_set_access_slot
  // test_access user:rw group:rw all:r;
  // 这样的配置下 my_access=436; (664)OCT = (436)DEC
  // 用于设置读/写权限
  {
    ngx_string("test_access"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE123,
    ngx_conf_set_access_slot ,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_access),
    test_bitmasks
  }

  // 14. ngx_conf_set_path_slot
  // test_path /usr/local/nginx/ 1 2 3;
  // 第一个必须是路径，后三个必须是整数(未写的时候默认为0)
  {
    ngx_string("_"),
    NGX_HTTP_LOC_CONF|NGX_CONF_TAKE123,
    ngx_conf_set_path_slot,
    NGX_HTTP_LOC_CONF_OFFSET,
    offsetof(ngx_http_mytest_conf_t, my_path),
    test_bitmasks
  }
  ngx_null_command
};
```

#### 4.2.4 自定义配置项处理方法

#### 4.2.3 合并配置项

自定义`ngx_http_module_t`中的`merge_loc_conf`回调函数。实例如下：
```cpp
static char* ngx_http_mytest_loc_conf(ngx_conf_t *cf, void *parent, void *child){
  ngx_http_mytest_conf_t *prev = (ngx_http_mytest_conf_t *)parent;
  ngx_http_mytest_conf_t *conf = (ngx_http_mytest_conf_t *)child;
  ngx_conf_merge_str_value(conf->my_str, prev->my_str, "defaultstr");
  return NGX_CONF_OK;
}
```

Nginx有10个预设的合并方法。