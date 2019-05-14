---
layout: post
title: Nginx教学视频记录
date: '2019-05-14 15:58'
categories: 
 - 笔记
tags:
 - nginx
---

## 1. 选择哪个版本的nginx？[07]

比较流行的有五个版本

1. nginx开源版（nginx.org）
2. nginx商业版（nginx.com）
3. Tengine (淘宝基于nginx基础上开发的)
4. OpenResty开源版（openresty.org）(以lua语言，以同步开发的方式)
5. OpenResty商业版（openresty.com）

如果没有特殊的要求，推荐使用nginx开源版开发。如果希望实现api服务器或者web防火墙功能，推荐使用OpenResty开源版。

## 2. 搭建一个静态资源服务器 [11]

1. 使用`alias path`来指定对应路径的文件夹作为静态资源
2. 使用`gzip on`来开启压缩功能减小传输的大小
3. 使用`autoindex on`在访问时可以显示目录结构信息
4. 使用`set $limit_rate 1k`来限制大文件的获取速度，这样做可以保证其他获取小文件的体验
5. 使用`log_format name format`来定制access_log的格式
6. 使用`access_log path/filename format_name`来制定log文件和log格式

## 3. 搭建一个具有缓存功能的反向代理服务器 [12]

## 4. GoAccess来显示access_log [13]

以Dashbord的方式来展示access_log的流量情况

## 5. 把http站点改成https站点 [18]

使用certbot工具来为服务器创建证书和私钥并且修改nginx.conf来支持https。




