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

- visual studio 2013
- visual leak detector

# 操作

在`main()`函数中添加`#include "vld.h"`，通过visual studio的==本地windows调试器==打开程序。然后操作你程序的功能，操作完之后关闭程序，内存泄漏的检测结果就会打印在visual studio的输出窗口。输出窗口中，一处泄漏就对应着一段调用堆栈，你可以通过点击调用堆栈中的函数信息跳转到对应代码中的位置。

# 泄漏的一些情况

- Qt中的父子机制之释放内存：如果一个Qt对象A指定了他的父元素B，A是在堆上申请的内存，这时候A将不用去考虑释放自己，因为他的父元素被析构的时候会完成释放A内存的任务。但是，我们在写代码的时候经常会为在堆上申请的对象指定父元素，所以就会出现内存泄漏。

```cpp
Class B: public QWidget{
public:
  B(QObject parent = nullptr)
  : QWidget(parent){
    A = new QLabel(this);// 没有内存泄漏
    // A = new QLabel(); // 如果B的析构函数中没有释放A，那么将会出现内存泄漏
  }
private:
  QLabel* A;
}
```

- 全局的指针变量申请了堆并且生命周期是整个程序，那么也会被检测出来。但是这种情况不需要做处理。
- 使用`memset(obj, 0, sizeof(type));`对一个对象进行初始化的时候，如果这个对象的子孙成员（这个对象的成员，或者这个对象的成员的成员，以此类推）存在这种情况“在构造的时候，会向堆申请空间”，那么就会出现内存泄漏了。这次调试发现这种情况大部分出现在`std::string` `std::vector`上。
- 其他的都是一些普通的情况（eg. 在函数中为一个局部变量申请了一个堆内存，在函数结束前没有释放）