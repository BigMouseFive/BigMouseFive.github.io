---
layout: post
title: Linux服务：SFTP
date: '2019-11-027 14:46'
categories: 
 - Linux服务
tags:
 - SFTP
---

# 一、起源

SFTP，SSH文件传输协议（SSH File Transfer Protocol），是一数据流连接，提供文件访问、传输和管理功能的网络传输协议。
SFTP是规定在SSH-2协议中的。是透过SSH-2的扩充提供安全档案传输能力。
OpenSSH继续得到维护并支持SSH-2协议。

# 二、作用

为传输文件提供一种安全加密方法。因为SFTP是基于SSH协议下的，所以无需去做安全保密工作，只要负责在SSH提供的安全信道中完成数据传输即可。

# 三、使用

## 3.1 连接远程SFTP

1. Linux连接Linux
     `sftp user@host`
     例子`[root@localhost ~]# sftp root@10.168.11.57`
     
2. Windows连接Linux
     使用XShell或者SecureCRT的传输文件功能去连接对应的LinuxSFTP服务。

## 3.2 使用SFTP
  
1. 类似Shell（加`l`的表示本地操作）：cd\lcd\ls\lls\pwd\lpwd\mkdir\lmkdir
2. 获取文件：get/reget
3. 发送文件：put/reput

