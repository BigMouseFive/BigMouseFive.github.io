---
layout: post
title: REST架构风格
date: '2019-04-10 17:00
categories: 
 - 架构
tags:
 - REST
---

# 名称

表现层状态转换（Representational State Transfer）。

# 风格定义

* 资源是由URI来指定。
* 对资源的操作包括获取、创建、修改和删除资源，这些操作正好对应HTTP协议提供的GET、POST、PUT和DELETE方法。
* 通过操作资源的表现形式来操作资源。
* 资源的表现形式则是XML或者HTML，取决于读者是机器还是人，是消费web服务的客户软件还是web浏览器。当然也可以是任何其他的格式，例如JSON。

# REST架构约束

* 客户-服务器（Client-Server）
  * 通信只能由客户端单方面发起，表现为请求-响应的形式。
* 无状态（Stateless）
  * 通信的会话状态（Session State）应该全部由客户端负责维护。
* 缓存（Cache）
  * 响应内容可以在通信链的某处被缓存，以改善网络效率。
* 统一接口（Uniform Interface）
  * 通信链的组件之间通过统一的接口相互通信，以提高交互的可见性。
* 分层系统（Layered System）
  * 通过限制组件的行为（即每个组件只能“看到”与其交互的紧邻层），将架构分解为若干等级的层。
* 按需代码（Code-On-Demand，可选）
  * 支持通过下载并执行一些代码（例如Java Applet、Flash或JavaScript），对客户端的功能进行扩展。

# REST的优点

* 可更高效利用缓存来提高响应速度
* 通讯本身的无状态性可以让不同的服务器的处理一系列请求中的不同请求，提高服务器的扩展性
* 浏览器即可作为客户端，简化软件需求
* 相对于其他叠加在[HTTP协议](https://zh.wikipedia.org/wiki/%E8%B6%85%E6%96%87%E6%9C%AC%E4%BC%A0%E8%BE%93%E5%8D%8F%E8%AE%AE "超文本传输协议")之上的机制，REST的软件依赖性更小
* 不需要额外的资源发现机制
* 在软件技术演进中的长期的兼容性更好
