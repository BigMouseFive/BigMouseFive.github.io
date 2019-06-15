---
layout: post
title: 系统级联修改建议
date: '2019-05-30 10:56'
categories: 
 - 工作记录
tags:
 - 级联
---

# 起因

在设计而客户端通讯的时候，要求设计成所有用户之间都能进行通讯，而不是在同级用户，或者上下级用户之间。所以针对之前设计的上下级方式的级联产生了改进的想法。

# 原级联设计

## 生成domain

每个域中的中心服务使用`Poco::UUIDGenerator`来生成domain，用来标记这个域。

## 下级注册到上级

在下级的中心服务配置文件中填写其上级的ip地址。中心服务将会启动一个线程一直向上级的ip发送注册信息，直到注册成功。成功之后，将会定时发送心跳包。
上级中心服务会开启一个线程来等待接收下级发来的注册信息。注册成功后，会在内存和数据库都保存下级的相关信息（ip、port、domain）。

## 客户端通过上级访问下级

客户端发送请求到上级，上级根据domain中的填写的信息，转发给下级。通过使用`TramsmitService`来完成http转发。

# 级联修改建议

通过上面的设计可以看出，如果客户端要访问下级的下级，那么http消息将从客户端到本级，再到下级，最后到下下级。这样的操作会显得浪费网络资源。
所以考虑是否能够为所有级联起来的域建立一张路由表。

## 需要考虑的问题

如何生成“路由表”？

- 如果是去向上级注册，那么注册上之后就把本域维护的“路由表”发给上级，上级将整合到它所维护的“路由表”中，然后上级将新“路由表”发给下级。同时会发给原“路由表”中的所有域。
- 如果是下级注册上来，那么就是接收下级的“路由表”，整合到本级的“路由表”，然后发给下级。同时会发给原“路由表”中的所有域。

“路由表”应该存放在哪里？

- 考虑到实际情况下很少会出现“路由表”的更新，所以在每一个域都维护这样一张路由表。

“路由表”的数据结构表示？

- 使用链表结构来实现多叉树，实现如下：

```cpp
typedef struct _RouteNode{
  std::string host;
  std::string port;
  std::string guid;
  int state;
  std::vector<_RouteNode*> childs;
  _RouteNode* parent;
}RouteNode;
```

- 每个域根据维护的多叉树，来构造一个`std::hash_map<std::string, RouteNode*>`

# 操作步骤

1. 创建一个类`RouteMap`

```cpp
class RouteMap{
public:
  RouteMap();
  ~RouteMap();

  Initialize();
  AddUpRouteMap(RouteNode* upRoot);
  Add
private:
  //锁
  RouteNode* root;
  std::hash_map<std::string, RouteNode*> hashMap;
};
```

