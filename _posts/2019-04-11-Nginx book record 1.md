---
layout: post
title: 深入理解nginx模块开发与架构解析[1][2]
date: '2019-04-11 17:00'
categories: 
 - 笔记
tags:
 - nginx
---

# Nginx能帮我们做什么

## 第一章：准备工作

### 1.1 Nginx是什么

传统的web服务器tomact，jetty，apache，IIS等，都不是高性能的web服务器，在处理高并发是会捉襟见肘。而nginx和lighttpd都是轻量级、高性能的web服务器。欧美业界比较钟爱lighttpd，国内则更青睐nginx。
nginx是一个跨平台的。Linux、FreeBSD、Solaris、AIX、MacOS、Windows。
nginx支持高效处理高并发的解决方案：Linux的epoll，Solaris的event ports，FreeBSD的kqueue
nginx可以使用Linux sendfile调用可以直接把硬盘数据发送到网络，而不必使用内存作为传输中间媒介。

### 1.2 为什么选择Nginx

#### 1.2.1 nginx有以下7个特点：

  1. 快。单条连接处理快，高峰情况下处理快。
  2. 高扩展性。低耦合的代码设计。
  3. 高可靠性。woker进程相互独立。master进程在worker进程失败后能迅速拉起一个新的worker进程。
  4. 低内存消耗。优秀的设计让nginx处理10000个不活跃的http连接时只消耗2.5MB内存。
  5. 支持高并发量。
  6. 热部署。可以在不停止服务时就升级执行文件，更新配置项，更新日志文件等功能。
  7. 最自由的BSD许可协议。

Nginx先天的事件驱动型设计、全异步的网络I/O处理机制、极少的进程间切换以及许多优化设计，都使得Nginx天生善于处理高并发压力下的互联网请求，同时Nginx降低了资源消耗，可以把服务器硬件资源“压榨”到极致。

### 1.3 准备工作

Linux 2.6内核以上。
需要使用到的第三方库，比如zlib(压缩)，openssl(加密)，pcre(正则表达式)等。
磁盘目录：源代码目录，中间文件目录，部署目录，日志文件目录。
Linux内核参数调优。修改`/etc/sysctl.conf`文件来更改内核参数，然后执行`sysctl-p`来生效。
获取nginx源码：[nginx官网](http://nginx.org/en/download.html)

### 1.4 configure参数

#### 1.4.1 configure参数类型可以分为四大类

1. 路径相关参数
2. 编译相关参数
3. 依赖第三方模块参数
4. nginx模块相关参数

#### 1.4.2 nginx模块又可以分成五大类

1. 事件模块
2. 默认编译进入Nginx的HTTP模块
3. 默认不会编译进Nginx的HTTP模块
4. 邮件代理服务器相关的mail模块
5. 其他模块

configure执行之后会产生一个很重要的文件`ngx_modules.c`。这个文件里面定义了一个数组`ngx_modules`，它指明了每个模块在nginx中的优先级，当一个请求同时符合多个模块的处理规则时，将按照它们在数组中的顺序选择最靠前的模块优先处理。不过对于HTTP过滤模块而言则是相反的，因为在HTTP框架初始化的时候，会在数组中将过滤模块按先后顺序太你家到过滤链表的表头，所以在数组中越靠后的HTTP过滤模块反而会首先处理。
`ngx_ modules`数组中的先后顺序非常重要，不正确的话将会导致nginx无法工作。

### 1.4.3 Nginx命令行控制

- 默认启动
`/usr/local/nginx/sbin/nginx`
- 指定配置文件的启动
`/usr/local/nginx/sbin/nginx -c /path/nginx.conf`
- 指定安装目录启动
`/usr/local/nginx/sbin/nginx -p /usr/local/nginx`
- 指定全局配置项的启动方式
添加`-g`选项。后面指定全局配置项。`-g`指定的全局配置项不能与`nginx.conf`中的配置项冲突。
`/usr/local/nginx/sbin/nginx -g "pid /var/nginx/test.pid"`
- 测试配置信息是否有误
`/usr/local/nginx/sbin/nginx -t`
- 在测试阶段不输出信息
不输出error级别以下的信息输出到屏幕
`/usr/local/nginx/sbin/nginx -t -q`
- 显示版本信息
`/usr/local/nginx/sbin/nginx -v`
- 显示编译阶段的参数
`/usr/local/nginx/sbin/nginx -V`
- 快速停止服务
`/usr/local/nginx/sbin/nginx -s stop`
- 优雅停止服务
`/usr/local/nginx/sbin/nginx -s quit`
- 使运行中的nginx重读配置项并生效
`/usr/local/nginx/sbin/nginx -s reload`
- 日志文件回滚
`/usr/local/nginx/sbin/nginx -s reopen`
- 平滑升级
1. 通知正在运行的旧版本Nginx准备升级。通过向master进程发送
`kill -s -SIGUSR2 <master pid>`
2. 启动新版本的Nginx，可以使用以上的任意一种启动方法。这时新旧两个版本的nginx都在同时运行。
3. 通过kill命令像旧版本master进程发送`SIGQUIT`信号，以优雅的方式关闭旧版本的Nginx。

## 第二章：nginx的配置

### 2.1 nginx进程间的关系

一个master进程管理多个worker进程，一般情况下，worker进程数量与机器上CPU核心数量相等。
Apache上每个进程在一个时刻只处理一个请求。因此，如果希望web服务器拥有并发处理的请求数更多，就要把Apache的进程或线程数设置更多。这样就会有大量的进程间切换带来的系统资源消耗。而Nginx不同，一个worker进程可以同时处理的请求数只受限于内存大小。不同worker进程之间处理并发请求时几乎没有同步锁的限制。worker进程通常不会进入睡眠状态。因此，当Nginx进程数与CPU核心数相等时（最好是一个worker进程都绑定特定的CPU核心），进程间切换的代价是最小的。

### 2.2 Niginx配置的通用语法

#### 2.2.1 块配置项
由一个块配置项名和一对大括号组成。内层块直接继承外层快，如下例中，server块里的任意配置都是基于http块里已有的配置。

```text
events {
}
http {
  upstream backend {
    server 127.0.0.1:8080;
  }

  gzip on;
  server {
    location /webstatic {
      gzip off;
    }
  }
}
```

#### 2.2.2 配置项语法格式
`配置项名 配置项值1 配置项值2 ...`
配置项名后面是空格，配置项值可以是数字、字符串或正则表达式，配置项值之间用空格来分隔。每行配置结尾要加上分号。配置项值中有空格，那么需要使用单引号或双引号括住配置项值。

#### 2.2.3 配置项的注释
`#pid logs/nginx.pid`

#### 2.2.4 配置项的单位
k 千字节
m 兆字节
ms 毫秒
s 秒
m 分钟
h 小时
d 天
w 周（7天）
M 月（30天）
y 年（365天）

#### 2.2.5 在配置中使用变量
变量名之前使用`$`符号，在单引号和双引号中都可以使用。

#### 2.2.6 Nginx服务的基本配置
Nginx运行至少加载几个核心模块和一个事件类模块。有些配置项即使没有显示配置他们也有默认的值。
按用户使用时的预期功能分成四类配置项

- 用于调试、定位问题的配置项
- 正常运行的必备配置项
- 优化性能的配置项
- 事件类配置项

#### 2.2.7 用于调试进程和定位问题的配置项

1. 是否以守护进程方式运行Nginx `daemon on|off`
2. 是否以master/worker方式工作 `master_process on|off`
3. error日志的设置 `error_log /path/file level`。`level`的取值范围{debug/info/notice/warn/error/crit/alert/emerg}，从左至右依次增大。大于等于设定级别的日志都会被输出。`/path/file=/dev/null`时就不会输出任何日志。
4. 是否处理几个特殊的调试点 `debug_points [stop|abort]`。通常不使用这个选项
5. 仅对指定的客户端输出debug级别的日志 `debug_connection [IP|CIDR]`。 这个配置项实际上属于事件类，所以必须放在`events{}`中才有效。
6. 限制coredump核心转储文件的大小 `worker_rlimit_core size`。nginx进程出现非法操作的时候会生成核心转储文件（coredump），可以通过coredump文件获取当时的堆栈和寄存器登等信息，用于调试。但这个文件的很多信息不一定是用户需要的，如果不加限制，那么一个coredump文件会变得很大。所以要有这个选项来限制coredump文件的大小。
7. 指定coredump文件的生成目录 `working_directory path`

#### 2.2.8 正常运行的配置项

1. 定义环境变量 `env VAR|VAR=VALUE`。这个配置项可以然用户直接设置操作系统上的环境变量。
2. 嵌入其他配置文件`include /path/file`
3. pid文件路径`pid /path/file`
4. Nginx worker 进程运行的用户及用户组`user username [groupname]`
5. 指定nginx worker进程可以打开的最大句柄描述符个数`worker_rlimit_sigpending limit`
6. 限制信号队列`worker_rlimit_sigpending limit`。定义每个用户（调用进程的用户ID）能够被排入队列的信号（signals）数量。如果队列（queue）满了，但由于这个限制，信号（signals）会被忽略。

#### 2.2.9 优化新能的配置项

1. Nginx worker 进程个数`worker_processes number`
2. 绑定Nginx worker进程到指定的CPU内核`worker_cpu_affinty cpumask[cpumask...]`。这个配置项仅对Linux操作系统有效。eg. `worker_cpu_affinity 1000 0100 0010 0001;`
3. SSL硬件加速`ssl_engine device`
4. 系统调用gettimeofday的执行频率`timer_resolutin t`
5. Nginx worker进程优先级设置`worker_priority nice`

#### 2.2.10 事件类配置项

1. 是否打开accept锁`accept_mutex [on|off]`。这是Nginx负载均衡锁。如果关闭，那么建立TCP连接的耗时会更短，但worker进程之间的负载会非常不均衡，因此不建议关闭它。
2. lock文件的路径`lock_file path/file`。配合accept锁使用。当支持原子锁的时候`lock_file`将会无效。
3. 使用accept锁后到真正建立连接之间的延迟时间`accept_mutex_delay Nms`。
4. 批量建立新连接`multi_accept [on|off]`
5. 选择事件模型`use [kqueue|rtsing|epoll|/dev/oll|select|poll|eventport]`
6. 每个worker的最大连接数`worker_connections number`

### 2.3 用http核心模块配置一个静态Web服务器

#### 2.3.1 虚拟主机与请求的分发

1. 监听端口`listen`：配置块[server]
   默认server，如果没有设置默认主机那个将以配置文件中的第一个server块作为默认server块。默认server的意义：当请求无法匹配配置文件中的所有主机域名时，就会使用默认的虚拟主机。
    TCP的backlog队列，如果backlog队列已满，有新的客户端试图通过三次握手建立TCP连接，这时客户端会          建立连接失败。
    deferred参数。只有当用户真的发送请求数据时（内核已经在网卡中收到请求数据包），内核才会唤醒worker进程处理这个连接。这个参数适合在大并发的情况下使用，这样可以减轻worker进程的负担。
2. 主机名称`server_ name`：配置块[server]
3. `server_names_hash_bucket_size size`
    Nginx使用散列表来存储server_name。这个参数就是这是每个散列桶占用的内存大小。
4. `server_names_hash_max_size size`
    这个参数会影响散列表的冲突率。值越大，消耗的内存越多，但散列key的冲突率就会低，检索速度也就更快。反之对应相反。
5. 重定向主机名称的处理`server_name_in_redirect on|off`
6. `location [=|~|~*|^~|@] /uri {...}`

请求匹配虚拟主机的顺序：1、首先选择完全匹配的host；2、选择通配符在前的host（eg. *.testweb.com）3、选择通配符在后的host；4、选择正则表达式匹配的host；5、选择默认server项；6、第一个匹配listen端口的server块。注意：`server_name ""`表示匹配没有Host这个Http头部的请求。

#### 2.3.2 文件路径的定义

1. 以root方式设置资源路径 `root path`
2. 以alias方式设hi资源路径`alias path`
3. 访问首页 `index file ...`
4. 根据HTTP返回码重定向页面`error_page code [code...] [=|=answer-code\ uri | @named_location`
5. 是否允许递归使用error_page `recursive_error_pages [on|off]`
6. `try_files path1 [path2] uri`

#### 2.3.3 root与alias的区别

1. uri为`/conf/nginx.conf`，alias的表达为`location /conf { alias /usr/local/nginx/conf/; }`，而root为`location /conf { root /usr/local/nginx/; }`。
2. alias只能在location下，而root可以在http/server/location/if中。因为如果alias在server下，那么所有匹配这个server的请求返回的都是同一个文件了。而root则可以根据具体的url中路径来获取对应文件。

#### 2.3.4 内存及磁盘资源的分配

1. HTTP包只存储到磁盘文件中`client_body_in_file_only on|clean|off`
2. HTTP包体尽量写入到一个内存buffer中 `client_body_in_single_buffer on|off`。如果HTTP包体大小超过了`client_body_buffer_size`设置的值，包体还是会写入到磁盘文件中。
3. 存储HTTP头部的内存buffer大小 `client_header_buffer_size size`
4. 存储超大HTTP头部的内存buffer大小`large_client_header_buffers number size`。如果HTTP请求行超过size，返回`Request URI too large(414)`。如果HTTP请求头部中任意一行有超过size的，返回`Bad Request(400)`。请求行和请求头部的总和不能超过`number*size`
5. 存储HTTP包体的内存buffer大小 `client_body_buffer_size size`
6. HTTP包体的临时存放目录`client_body_temp_path dir-path [level1[level2[level3]]]`
7. `connection_pool_size size`
8. `request_pool_size size`

#### 2.3.5 网络连接设置

1. 读取HTTP头部的超时时间 `client_header_timeout time`
2. 读取HTTP包体的超时时间 `client_body_timeout time`
3. 发送响应的超时时间 `send_timeout time`
4. `reset_timeout_connection on|off`。 使用RST重置包关闭连接会带来一些问题，默认情况下不开启。
5. 关闭用户连接的方式`lingering_close off|on|always`
6. `lingering_time time`
7. `lingering_timeout time`
8. 对某些浏览器警用keepalive功能`keep_alive_disable [msie6|safari|none] ...`
9. `keepalive_timeout time`
10. 一个keepalive长连接上允许承载的请求最大数`keepalive_requests n`
11. 对keepalive连接是否使用TCP_NODELAY选项`tcp_nodelay on|off`
12. `tcp_nopush on|off`

#### 2.3.6 MIME类型的设置

1. MIME type 与文件扩展的映射`type {...};`
2. 默认MIME type `default_type MIME-type`
3. `type_hash_bucket_size size`
4. `types_hash_max_size size`

#### 2.3.7 对客户端请求的限制

1. 按HTTP方法名来限制用户请求 `limit_except method .. {...}`
2. HTTP请求包体的最大值 `client_max_body_size size`
3. 对请求的限速 `limit_rate speed`
4. `limit_rate_after size` 发送的响应（response）长度超过size之后才开始限速。

#### 2.3.8 文件操作的优化

1. sendfile系统调用 `sendfile on|off`。可以减少内核态到用户态的转换
2. AIO系统调用 `aio on|off`。注意，此参数与sendfile互斥。
3. `directio size | off`。注意，此参数与sendfile互斥。
4. `directio_alignment size`
5. 打开文件缓存 `open_file_cache max=N [inactive=time] | off`。淘汰算法使用的是LRU（Least Recently Used）
6. 是否缓存打开文件错误的信息`open_file_cache_errors on|off`
7. 不被淘汰的最小访问次数 `open_file_cache_min_uses number`。与5中的inactive配合使用
8. 检验缓存中元素有效性的频率`open_file_cache_valid time`

#### 2.3.9 对客户端请求的特殊处理

1. 忽略不合法的HTTP头部`ignore_invalid_headers on|off`
2. HTTP头部是否允许下划线`underscores_in_headers on|off`
3. 对If-Modified-Since头部的处理策略 `if_modified_since [off|exact|before]`。
4. 文件未找到时是否记录到error日志 `log_not_found on|off`
5. `merge_slashes on|off`。是否合并相邻的“/”
6. DNS解析地址 `resolver address ...`
7. DNS解析超时时间 `resolver_timeout time`
8. 返回错误页面时是否在server中著名Nginx版本 `server_tokens on|off`

`ngx_http_core_modeule`模块提供的变量

### 2.4 用HTTP proxy module配置一个反向代理服务器

一般Nginx可以作为前端服务器直接向客户端提供静态文件服务。但也有一些复杂、多变的业务不适合放在Nginx上，这时会用其他服务器来处理。Nginx就可以配置为反向代理服务器来转发这些请求到其他服务器，并返回其他服务器的响应给客户端。

Nginx与Squid反向代理服务器的区别。Nginx是完成的缓存了客户端的请求之后才去寻找上游服务器并发出请求。而Squid则是一边接收客户端请求，一边转发到上游服务器上。Nginx这样做的缺点：延长了一个请求的处理时间，并增加了用于缓存请求内容的内存和磁盘空间。优点：降低了上游服务器的负载，尽量把压力放在了Nginx服务器上（这个优点是在客户端与代理服务器之间是公网通信，代理服务器与上游服务器是内网通信的场景下）。

#### 2.4.1 负载均衡的基本配置

1. `upstream name {...}`。定义一个上游服务器集群。
2. `server name [parameters]`
3. `ip_hash`。不可与server中weight(权重)同时使用。因为这是两种不同的分配策略。ip_hash将把通过对ip哈希来分配给不同额上游服务器。
4. 记录日志时支持的变量

#### 2.4.2 反向代理的基本配置

1. `proxy_pass URL`。默认情况下是不会转发请求中的Host头部的。如果需要就要加上`proxy_set_header Host $host`
2. 指定转发时的方法名 `proxy_method method`
3. `proxy_hide_header the_header`。控制不转发某些HTTP头部字段
4. `proxy_pass_header the_header`
5. `proxy_pass_request_body on|off`
6. `proxy_pass_request_headers on|off`
7. `proxy_redirect [default|off|redirect replacement]`
8. `proxy_next_upstream [error|timeout|invalid_header|http_500|http_502|http_503|http_504|http_404|off]`

