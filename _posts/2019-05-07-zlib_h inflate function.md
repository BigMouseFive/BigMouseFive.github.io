---
layout: post
title: Zlib_H中的inflate函数
date: '2019-05-07 21:14'
categories: 
 - 压缩与解压缩
tags:
 - zlib 
 - inflate
 - 未完成
---

# 函数声明

`ZEXTERN int ZEXPORT inflate OF((z_streamp strm, int flush));`

# z_streamp 数据结构

```c
  typedef struct z_stream_s {
    z_const Bytef *next_in;     /* next input byte */
    uInt     avail_in;  /* number of bytes available at next_in */
    uLong    total_in;  /* total number of input bytes read so far */

    Bytef    *next_out; /* next output byte should be put there */
    uInt     avail_out; /* remaining free space at next_out */
    uLong    total_out; /* total number of bytes output so far */

    z_const char *msg;  /* last error message, NULL if no error */
    struct internal_state FAR *state; /* not visible by applications */

    alloc_func zalloc;  /* used to allocate the internal state */
    free_func  zfree;   /* used to free the internal state */
    voidpf     opaque;  /* private data object passed to zalloc and zfree */

    int     data_type;  /* best guess about the data type: binary or text */
    uLong   adler;      /* adler32 value of the uncompressed data */
    uLong   reserved;   /* reserved for future use */
} z_stream;
```

# 函数说明

函数功能

1. 从`strm.next_in`位置开始解压缩数据，并且同时更新`next_in`和`avail_in`这两个值。如果还有数据没有解压缩（因为没有足够的输出空间），`next_in`将被更新，并且在下一次调用`inflate()`时，从这个位置重新开始解压缩数据。
2. 解压缩数据到`strm.next.out`位置，并且同时更新`next_out`和`avail_out`。`inflate()`函数将一直执行直到没有数据需要解压缩或者没有输出的空间可以存放解压缩出来的数据。



