---
layout: post
title: 深入理解nginx模块开发与架构解析[7]
date: '2019-05-17 09:56'
categories: 
 - 笔记
tags:
 - nginx
---

# 如何编写HTTP模块

## 第七章：nginx提供的高级数据结构

### 7.1 概述

`ngx_queue_t`是nginx的轻量级双向链表。它与Nginx的内存池无关，所以不负责去分配内存来存放链表元素。它只负责将分配好内存的元素互相连接起来。

`ngx_array_t`是nginx的动态数组，类似于C++STL库的vector容器。它使用连续的内存存放着大小相同的元素，这使得它按照下标检索数据的效率非常高。

`ngx_list_t`是nginx单向链表。它是负责元素内存分配的，而且不是用完全连续的内存来存储元素的。

`ngx_rbtree_t`红黑树是一种非常有效的高级数据结构。它在检索、插入、删除元素方面非常高效。同时，它还支持范围查询，也支持高效的遍历所有元素。

`ngx_radix_tree_t`基数树与红黑树一样都是二叉查找树。它比红黑树的应用场景要少很多，因为它要求元素必须以整型数据作为关键字。然而他在插入、删除元素时不需要做旋转操作，所以效率一般要比红黑树高。

支持通配符的散列表是Nginx独创的。

### 7.2 ngx_queue_t 双向链表

它可以高效的执行插入、删除、合并等操作，在移动链表中的元素时只需要修改指针的指向就好，所以在频繁修改容器的场合非常合适。

ngx_queue_t有两点比较特殊

1. 它只有两个指向指针，没有数据指针。这样做的目的是为了让用户能够更加自由的设计数据的形式。所以ngx_queue_t都是作为一个成员出现在用户定义的数据结构中的。
2. 头节点是一个特殊的节点，它的目的就是用来代表一个双向链表。它存储数据，所以它也不会作为一个成员出现在用户定义的数据结构中。好处是，使用它时都是把它当作`ngx_queue_t`，这样就可以屏蔽用户数据结构。

ngx_queue.h
```c
typedef struct ngx_queue_s  ngx_queue_t;

struct ngx_queue_s {
    ngx_queue_t  *prev;
    ngx_queue_t  *next;
};

#define ngx_queue_init(q) \
    (q)->prev = q;        \
    (q)->next = q

#define ngx_queue_empty(h)\
    (h == (h)->prev)

#define ngx_queue_insert_head(h, x)\
    (x)->next = (h)->next;         \
    (x)->next->prev = x;           \
    (x)->prev = h;                 \
    (h)->next = x

#define ngx_queue_insert_after   ngx_queue_insert_head

#define ngx_queue_insert_tail(h, x)\
    (x)->prev = (h)->prev;         \
    (x)->prev->next = x;           \
    (x)->next = h;                 \
    (h)->prev = x

#define ngx_queue_head(h)\
    (h)->next

#define ngx_queue_last(h) \
    (h)->prev

#define ngx_queue_sentinel(h)\
    (h)

#define ngx_queue_next(q)\
    (q)->next

#define ngx_queue_prev(q) \
    (q)->prev

#if (NGX_DEBUG)
#define ngx_queue_remove(x)      \
    (x)->next->prev = (x)->prev; \
    (x)->prev->next = (x)->next; \
    (x)->prev = NULL;            \
    (x)->next = NULL
#else
#define ngx_queue_remove(x)      \
    (x)->next->prev = (x)->prev; \
    (x)->prev->next = (x)->next
#endif

#define ngx_queue_split(h, q, n) \
    (n)->prev = (h)->prev;       \
    (n)->prev->next = n;         \
    (n)->next = q;               \
    (h)->prev = (q)->prev;       \
    (h)->prev->next = h;         \
    (q)->prev = n;

#define ngx_queue_add(h, n)      \
    (h)->prev->next = (n)->next; \
    (n)->next->prev = (h)->prev; \
    (h)->prev = (n)->prev;       \
    (h)->prev->next = h;

#define ngx_queue_data(q, type, link) \
    (type *) ((u_char *) q - offsetof(type, link))

ngx_queue_t *ngx_queue_middle(ngx_queue_t *queue);
void ngx_queue_sort(ngx_queue_t *queue,
    ngx_int_t (*cmp)(const ngx_queue_t *, const ngx_queue_t *));
```

ngx_queue.c
```c
ngx_queue_t *
ngx_queue_middle(ngx_queue_t *queue)
{
    ngx_queue_t  *middle, *next;
    middle = ngx_queue_head(queue);
    if (middle == ngx_queue_last(queue)) {
        return middle;
    }
    next = ngx_queue_head(queue);
    for ( ;; ) {
        middle = ngx_queue_next(middle);
        next = ngx_queue_next(next);
        if (next == ngx_queue_last(queue)) {
            return middle;
        }
        next = ngx_queue_next(next);
        if (next == ngx_queue_last(queue)) {
            return middle;
        }
    }
}


/* the stable insertion sort */

void
ngx_queue_sort(ngx_queue_t *queue,
    ngx_int_t (*cmp)(const ngx_queue_t *, const ngx_queue_t *))
{
    ngx_queue_t  *q, *prev, *next;
    q = ngx_queue_head(queue);
    if (q == ngx_queue_last(queue)) {
        return;
    }
    for (q = ngx_queue_next(q); q != ngx_queue_sentinel(queue); q = next) {
        prev = ngx_queue_prev(q);
        next = ngx_queue_next(q);
        ngx_queue_remove(q);
        do {
            if (cmp(prev, q) <= 0) {
                break;
            }
            prev = ngx_queue_prev(prev);
        } while (prev != ngx_queue_sentinel(queue));
        ngx_queue_insert_after(prev, q);
    }
}
```

### 7.3 ngx_array_t 动态数组

有以下三个优点

1. 访问速度块
2. 允许元素个数具有不确定性
3. 负责元素占用内存的分配，这些内存由内存池统一管理

主要还是和vector类似。

### 7.4 ngx_list_t 单向链表

是一个顺序容器，扩容比动态数组简单得多。

### 7.5 ngx_rbtree_t 红黑树

#### 7.5.1 为什么设计ngx_rbtree_t红黑树

顺序容器的检索效率通常情况下都比较差，一般只能遍历检索指定元素。当需要容器的检索速度很快，或者支持范围查询时，红黑树容器就是一个非常好的选择。
在不断的向二叉查找树中添加、删除节点时，二叉查找树自身通过形态变换，始终保持着一定程度上的平衡，即为自平衡二叉查找树。自平衡二叉查找树是一个概念，实现方式有AVL树和红黑树。

#### 7.5.2 红黑树的特性

1. 节点是红色或黑色
2. 根节点是黑色
3. 所有叶子节点都是黑色（叶子是NIL节点，也叫“哨兵”）
4. 每个红色节点的两个子节点都是黑色（每个叶子节点到根节点的所有路径上不能有两个连续的红色节点）
5. 从任一节点到其每个叶子节点的所有简单路径都包含相同数目的黑色节点。

加入新元素之后，如果满足规则则不需要变化，否则可能的操作有变色，左旋，右旋。

[红黑树原理详细](https://www.cnblogs.com/skywang12345/p/3245399.html)

 