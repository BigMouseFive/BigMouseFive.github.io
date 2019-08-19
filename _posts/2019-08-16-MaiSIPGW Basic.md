---
layout: post
title: MaiSIPGW基础：相关类介绍
date: '2019-08-16 17:07'
categories: 
 - 工作记录
tags:
 - MaiSIPGW
---

# 1. 本文目的

了解MaiSIPGW中存储和流媒体相关的类。明白每个类的用处。

# 2. 存储相关

首先，我们得明白存储服务实现的流程：
1. 用户在客户端设置录像计划；
2. 客户端将录像计划用HTTP的方式发送给MaiSIPGW服务；
3. MaiSIPGW服务解析HTTP，获取录像计划；
4. 将录像计划保存到数据库中。
5. MaiSIPGW另一个线程不断的从数据库中读取录像计划；
6. 如果是新的录像计划，将根据录像计划创建一个新的Recorder；
7. 获取设备流，处理流；
8. 将处理后的流存入存储块中。

所以存储流程可以分成三个层次：信息交互层、流操作层、数据存储层。

## 2.1 信息交互层

这一层主要实现的的就是录像计划的增、删、改、查。
```cpp
class MaiTfpfServerItf : public MaiHTTPServerResponser{
// http服务，用来接收http请求，包括的功能有:
// 1. 添加/删除/获取录像
// 2. 设置获取录像流的速度/状态
// 3. 获取录像列表
// 4. 获取录像流地址（支持http流地址和rtsp流地址）
// 5. 获取录像关键帧
// 6. 获取存储节点/存储节点配置和状态
// 7. 获取存储服务的version信息
// 8. 获取流媒体服务的version信息

class MaiGWDB
// 数据库服务(mysql)
```

## 2.2 流操作层

```cpp
class MaiMainStorageServer : public MaiSvrObj
// 主存储节点服务。当在网页配置上选择此节点作为主节点，这个类才会被创建实例。
//这个类继承自MaiSvrObj,将会开启一个线程跑SvrProc()函数。
//这个类是用来管理存储服务节点，分配录像计划等，主要功能有：
// 1. 获取所有存储节点上的recorder信息（一个录像计划由一个recorder负责）
// 2. 判断录像计划是否已经在运行
// 3. 判断录像计划是否符合规范（当前时间是否在录像计划时间范围之内）
// 4. recorder管理 
// 5. 录像计划管理（目的是为了将被删除设备的录像计划移除，内容暂时为空， 因为考虑写在这个类中并不合适）
// 6. records管理（在内存中维护了一份录像计划在不同节点的分配信息）
// 7. 获取录像列表
```

`MaiMainStorageServer`中`SvrProc()`实现的功能主要有：
1. 创建主节点http流获取接口实例；
2. 创建主节点rtsp流接口实例；
3. 定时去执行recorders管理，records管理和录像计划管理；

`MaiMainStorageServer`中recorder管理主要功能有：
1. 获取所有存储节点上的recorder信息；
2. 获取数据库上的所有录像计划；
3. 对比上诉两者，如果是新的录像计划就找到合适的存储节点，并在上面添加一个recorder;
4. 如果recorder对应的录像计划不需要录像了，则把该recorder停止掉。

```cpp
class MaiStorageServerHttpClient : public MaiHttpCmdGeneralClient
// 存储节点http请求client。用来和存储节点进行通信的。
// 主要是在MaiMainStorageServer中使用，是主节点和它管理的从节点的通信方式。
// 功能包括：获取recorder信息，开启/停止录像，获取录像列表
```

```cpp
class MaiStorageServerRecorder : public MaiThread, public MaiAVMuxerReceiveObject, public MaiComInterface
// recorder类(录像者)。用来根据指定的录像计划进行录像存储。
// 功能实现过程：根据录像计划信息去MaiMediaServer中获取媒体流，在媒体流中创建MaiMemMuxerTSMai（用来封装视频帧），创建MaiGeneralDemuxer（用来解封装获取到的媒体流）。
// 类中创建了一个缓存队列，让解封装和封装可以自动控制执行状态。
//注：在流媒体相关中将提到上述三个类：MaiMediaServer、MaiMemMuxerTSMai、MaiGeneralDemuxer。
```

## 2.3 数据存储层

```cpp
class MaiStorageServerMediaBlockStorageIO
// 存储块读写类。实现录像内容的读写
// 主要的功能就是一个读方法和一个写方法
```

```cpp
class MaiStorageServerMediaBlock
// 流媒体块。用来保存存储块的描述信息和数据信息
```

### 2.3.1 在`MaiStorageServerMediaBlockStorageIO`的`read_info`和`write_info`
```cpp
struct
{
	MaiString path_file_base_now;
	MaiString path_blk_dev_now;

	MaiAVRetransmissionSrcInfo src_info_now;

	Mai_I64 first_block_start_etime_sec;
	Mai_I64 first_block_start_etime_nsec;
	Mai_I64 last_block_end_etime_sec;
	Mai_I64 last_block_end_etime_nsec;

	Mai_I32 io_mode;// MaiStorageIoMode
} read_info;

struct
{
	MaiString path_file_base_now;
	MaiString path_blk_dev_now;

	MaiAVRetransmissionSrcInfo src_info_now;

	Mai_I64 first_block_start_etime_sec;
	Mai_I64 first_block_start_etime_nsec;

	Mai_I64 write_block_cnt;

	Mai_I32 io_mode;// MaiStorageIoMode
} write_info;

// 首先介绍下 io_mode，这个是用来控制存储模式，目前有以下两种存储模式
#define MaiStorageIoModeFile 0  //文件模式
#define MaiStorageIoModeBlock 1 //块模式

// 当文件模式时，path_file_base_now不为空并指向对应的文件路径
// 当块模式时，path_blk_dev_now不为空并指向对应块设备路径
// src_info_now表示的是存储的设备流信息（我理解为是媒体流的guid值） 
```

### 2.3.2 `MaiStorageServerMediaBlockStorageIO`的`WriteBlock`流程:
1. 根据传入的`MaiStorageServerMediaBlock`去维护一个有效的`write_info`；
2. 将传入的`MaiStorageServerMediaBlock`中的数据写入文件系统中（不同的模式用不同的方式）；
3. 将描述信息写入`***.index_v2`文件中，这个文件中会有多个块的描述信息，所以每次写入的时候都是在末尾添加；
4. 将相关的信息都存入数据库中。

### 2.3.3 `MaiStorageServerMediaBlockStorageIO`的`ReadBlock`流程:
1. 根据传入的`p_src_info`去维护一个有效的`read_info`；
2. 获取对应`***.index_v2`中对应的块描述信息；
3. 使用`MaiFile`去无差别（两种模式都可以使用）的获取对应的数据信息；
4. 根据获取的描述信息和数据信息去构造`MaiStorageServerMediaBlock`并返回。

# 3 流媒体相关

流媒体的处理主要分成几个步骤：
1. 获取流媒体信息；
2. 根据流媒体信息去获取媒体流；
3. 解封装媒体流；
4. 封装媒体流，并保存到文件 / 发送视频帧

```cpp
class MaiMainMediaServer : public MaiSvrObj
// 主节点流媒体服务。主要负责流媒体节点管理的相关操作。
// 相关操作有：添加/更新/删除流媒体节点；获取所有在线的流媒体节点；获取所有流媒体转发信息。
```

```cpp
class MaiMediaServer : public MaiThread
// 流媒体管理节点。主要负责MaiMediaServerRetransmission （流媒体任务）的创建/添加/删除/获取。
// 其中，创建时，会根据MaiAVRetransmissionSrcInfo的类型进行不同的初始化。
// 目前有五种不同的初始化【GB28181，Onvif，CustomUrl，Tftdpf，Record】，因为不同的类型获取媒体流的方式不同。
// 删除的实现：定时的去检测MaiAVRetransmissionSrcInfo的状态，如果IsWidow()或者IsSrcDead()，那么就删除。
```

```cpp
class MaiMediaServerRetransmission : public MaiComInterface
// 流媒体回传任务。一个媒体流入口，多个媒体流出口。支持多种媒体流入口格式和出口格式。
// 实现对一个媒体流的转发实现。
// 一个媒体流入口对应的就是一个demuxer(解封装器)，多个媒体流出口对应的就是多个muxer(封装器)
```

所以当我们要创建一条流媒体转发链路的时候，我们创建一个`MaiMediaServerRetransmission`，然后根据对应的媒体流类型创建对应的`demuxer`去获取并解封装，然后根据需求添加对应的`muxer`去封装。

注：muxer类型和demuxer类型分别写在MaiMemMuxer.h和MaiMemDemuxer.h中。一个类即为一种类型。







