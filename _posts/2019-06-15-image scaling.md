---
layout: post
title: 图片质量压缩和尺寸压缩 
date: '2019-06-15 09:33'
categories: 
 - 工作记录
tags:
 - 图片压缩
 - libjpeg
---

# 起因

在设计图片服务器的时候，发现摄像机抓拍到的图片大小会超过1M。如果只保存原图，那么每次客户端去获取图片服务中获取图片数据的时候会花费较多时间，这样在不仅会花费很多网络资源，也会对客户端的使用体验产生不好影响。

# 考虑

在网上查询了相关资料，找到了一个能在linux中使用的c语言图片处理库`libjpeg`。

# 实现

在`libjpeg`的源码中有一个`example.c`例子文件，里面有个两个函数，一个写入图片文件，一个是读取图片文件。
所以将这个两个做个结合，就能实现将原图压缩后存入另外一个图片文件中。
为了便于理解，将先说明例子文件中的两个函数流程。

## 例子文件中的读取图片函数

流程如下：

1. 使用c中的文件操作打开文件`fopen(filename, "rb");`
2. 初始化`jpeg_decompress_struct`结构体，这个是读取图片时的重要结构体。
3. 建立`jpeg_decompress_struct`与图片文件的连接。
4. 读取文件中的图片信息（不是图片数据，只是header）。
5. 开始解压缩（decompress）图片数据。
6. 按行读取解压缩好的图片数据。
7. 完成解压缩并销毁解压缩结构体。
8. 关闭图片文件。

## 例子文件中的写图片函数

流程如下：

1. 使用c中的文件操作打开文件`fopen(filename, "wb");`
2. 初始化`jpeg_compress_struct`结构体，这个是写图片时的重要结构体。
3. 建立`jpeg_compress_struct`与图片文件的链接。
4. 设置图片编码的参数。（只需要填写与默认值不同的即可）
5. 设置图片编码质量。
6. 开始编码图片数据。
7. 按行写入图片文件。
8. 完成编码并销毁编码结构体。
9. 关闭图片文件。

## 文件到文件的质量压缩

流程如下：

1. 分别打开`in.jpg`和`out.jpg`
2. 初始化`jpeg_decompress_struct`并与`in.jpg`建立连接。
3. 读取图片头部信息。
4. 开始解压缩图片数据。
5. 初始化`jpeg_compress_struct`并与`out.jpg`建立连接。
6. 设置图片编码的参数和图片编码质量。
7. 开始编码图片数据。
8. 在按行处理的`while`循环中：读取一行数据，然后将这行数据写入。
9. 完成编码并销毁编码结构体。
10. 完成解压缩并销毁解压缩结构体。
11. 关闭两个图片文件。

### 源码

```cpp
#include <stdio.h>
#include <setjmp.h>
#include "jpeglib.h"

struct my_error_mgr {
  struct jpeg_error_mgr pub;  /* "public" fields */
  jmp_buf setjmp_buffer;  /* for return to caller */
};
typedef struct my_error_mgr * my_error_ptr;
METHODDEF(void) my_error_exit (j_common_ptr cinfo)
{
  my_error_ptr myerr = (my_error_ptr) cinfo->err;
  (*cinfo->err->output_message) (cinfo);
  longjmp(myerr->setjmp_buffer, 1);
}

int main(){
  char* filename = "in.jpg";
  struct jpeg_decompress_struct cinfo_in;
  struct my_error_mgr jerr;
  JSAMPARRAY buffer;    /* Output row buffer */
  FILE * infile;    /* source file */
  
  struct jpeg_compress_struct cinfo_out;
  char* outname = "out.jpg";
  JSAMPROW row_pointer[1];
  FILE * outfile;
  int row_stride;
  int image_width, image_height;

  //读取文件的相关结构初始化
  {
    if ((infile = fopen(filename, "rb")) == NULL) {
    fprintf(stderr, "can't open %s\n", filename);
    return 0;
    }
    cinfo_in.err = jpeg_std_error(&jerr.pub);
    jerr.pub.error_exit = my_error_exit;
    if (setjmp(jerr.setjmp_buffer)) {
      jpeg_destroy_decompress(&cinfo_in);
      fclose(infile);
      return 0;
    }
    jpeg_create_decompress(&cinfo_in);
    jpeg_stdio_src(&cinfo_in, infile);
    (void) jpeg_read_header(&cinfo_in, TRUE);
    cinfo_in.scale_num = 1;
    image_width = cinfo_in.image_width / 8; 
    image_height = cinfo_in.image_height / 8;
    (void) jpeg_start_decompress(&cinfo_in);
    row_stride = cinfo_in.output_width * cinfo_in.output_components;
    buffer = (*cinfo_in.mem->alloc_sarray)((j_common_ptr) &cinfo_in, JPOOL_IMAGE, row_stride, 1);
  }

  //写入文件的相关结构初始化
  {
    if ((outfile = fopen(outname, "wb")) == NULL) {
      fprintf(stderr, "can't open %s\n", outfile);
      return 1;
    }
    jpeg_create_compress(&cinfo_out);
    cinfo_out.err = jpeg_std_error(&jerr.pub);
    jerr.pub.error_exit = my_error_exit;
    if (setjmp(jerr.setjmp_buffer)) {
      jpeg_destroy_compress(&cinfo_out);
      fclose(outfile);
      return 0;
    }
    jpeg_stdio_dest(&cinfo_out, outfile);
    cinfo_out.image_width = image_width;  /* image width and height, in pixels */
    cinfo_out.image_height = image_height;
    cinfo_out.input_components = 3;   /* # of color components per pixel */
    cinfo_out.in_color_space = JCS_RGB;   /* colorspace of input image */
    jpeg_set_defaults(&cinfo_out);
    jpeg_set_quality(&cinfo_out, 80, TRUE /* limit to baseline-JPEG values */);
    jpeg_start_compress(&cinfo_out, TRUE);
    row_stride = image_width * 3; /* JSAMPLEs per row in image_buffer */
  }

  //循环读取和写入
  while (cinfo_in.output_scanline < cinfo_in.output_height && 
    cinfo_out.next_scanline < cinfo_out.image_height) {
    (void) jpeg_read_scanlines(&cinfo_in, buffer, 1);
    (void) jpeg_write_scanlines(&cinfo_out, buffer, 1);
  }

  (void) jpeg_finish_decompress(&cinfo_in);
  jpeg_destroy_decompress(&cinfo_in);
  fclose(infile);

  (void) jpeg_finish_compress(&cinfo_out);
  jpeg_destroy_compress(&cinfo_out);
  fclose(outfile);
}
```

### 说明

上面的代码用到了图片压缩和尺寸压缩。

图片压缩：

- `jpeg_set_quality(&cinfo_out, 80, TRUE)`
- **quality**为80。

尺寸压缩：

- `cinfo_in.scale_num = 1;`
- `image_width = cinfo_in.image_width / 8;`
- `image_height = cinfo_in.image_height / 8;`
- 压缩比例为 scale_num/8 = 1/8 = 0.125。

