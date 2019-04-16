---
layout: post
title: c++知识点集合
date: '2019-04-09 10:44
categories: 
 - 知识点
tags:
 - c++
---

# volatile关键字

**本质**：由volatile声明的对象是与固定内存对应，不会使用寄存器来对应该对象。对应的取值和赋值的操作都是对内存的操作。
**作用**

- 允许访问内存映射设备
- 允许在[`setjmp`和`longjmp`](https://zh.wikipedia.org/wiki/Setjmp.h "Setjmp.h")之间使用变量
- 允许在信号处理函数中使用sig_atomic_t变量

**优点**：能在一些特殊情况下保护对象一致。
**缺点**：会多消耗机器的性能。读取内存的操作比读取寄存器更加耗时。
**用户定义的非基本类型被volatile修饰后的行为**

- 只能调用volatile成员函数；即只能访问它的接口的子集。
- 只能通过const_cast运算符转为没有volatile修饰的普通对象。即由此可以获得对类型接口的完全访问。
- volatile性质会传递给它的数据成员。

**volatile多线程语义**：[临界区](https://zh.wikipedia.org/wiki/%E4%B8%B4%E7%95%8C%E5%8C%BA "临界区")内部，通过[互斥锁](https://zh.wikipedia.org/wiki/%E4%BA%92%E6%96%A5%E9%94%81 "互斥锁")（mutex）保证只有一个线程可以访问，因此临界区内的变量不需要是volatile的；而在临界区外部，被多个线程访问的变量应为volatile，这也符合了volatile的原意：防止编译器[缓存](https://zh.wikipedia.org/wiki/%E7%BC%93%E5%AD%98 "缓存")（cache）了被多个线程并发用到的变量。volatile对象只能调用volatile成员函数，这意味着应仅对多线程并发安全的成员函数加volatile修饰，这种volatile成员函数可自由用于多线程并发或者[重入](https://zh.wikipedia.org/wiki/%E5%8F%AF%E9%87%8D%E5%85%A5 "可重入")而不必使用临界区；非volatile的成员函数意味着单线程环境，只应在临界区内调用。在多线程编程中可以令该数据对象的所有成员函数均为普通的非volatile修饰，从而保证了仅在进入临界区（即获得了互斥锁）后把该对象显式转为普通对象之后才能调用该数据对象的成员函数。这种用法避免了编程者的失误——在临界区以外访问共享对象的内容：

```cpp
template <typename T> class LockingPtr{
  public:
    LockingPtr(volatile T& obj, Mutex& mtx)
        :pObj_(const_cast<T*>(&obj) ),  pMtx_(&mtx)
        {  mtx.Lock();  }
    ~LockingPtr()
        { pMtx->Unlock();  }
    T& operator*()
        {  return *pObj_;  }
    T* operator->()
        {  return pObj_;   }
  private:
    T* pObj_;
    Mutex* pMtx_;
    LockingPtr(const LockingPtr&);
    LockingPtr& operator=(const LockingPtr&);
}
```

对于内建类型，不应直接用volatile，而应把它包装为结构的成员，就可以保护了volatile的结构对象不被不受控制地访问。

# GDB调试

常用命令

```cpp
r，run 运行程序
b，breakpoint 设置断点
d，delete 删除断点
n，next 执行下一步
c，continue 继续执行
p，print 查看变量的值
l，list 查看断点的所在的前后几行代码
bt 查看断点的调用堆栈
```

设置断点

```cpp
方式一：通过方法名
  b methodName
方式二：通过cpp文件和行数
  b cppFile.cpp:num
```

删除断点

```cpp
d num
*注：num表示断点的序号，第一个断点的序号为1，第二个断点序号为2，以此类推
```

调试基础
1. 在编译可执行程序、动态库和静态库时，要使用`-g`选项
2. 要调试动态库时，要在运行程序之前预先加载动态库

预先加载动态库
```cpp
(gdb)set environment path/name.so
```
