---
layout: post
title: 记一次内存泄漏调试
date: '2019-03-12 20:53'
categories: 
 - 工作记录
tags: 
 - 内存泄漏
---

# 起因

对公司平台(windows application)进行测试时，发现了程序操作一段时间之后就会崩溃。通过vs对程序的断点分析，发现错误在下面这个函数中：

```cpp
m_hdc = GetDC(hwnd);//获取设备环境句柄
```

因为==m_hdc = NULL;== 所以导致后面对空指针进行了操作，程序崩溃。
百度了“为什么会导致GetDC函数返回为空？”，得知当一个进程使用的==GDI对象超过10000==时，该进程就无法再获取GDI对象，所以GetDC函数会返回为空。
通过观察**“任务管理器>详细信息>GDI**”，发现确实当GDI数值为10000的时候，程序就崩溃了。
考虑到GDI泄漏不好找，所以打算从内存泄漏开始查起。

# 工具
* visual studio 2013
* visual leak detector


