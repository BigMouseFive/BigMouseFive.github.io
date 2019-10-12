---
layout: post
title: 为录像提供rtsp流获取方式
date: '2019-07-20 10:58'c
categories: 
 - 工作记录
tags:
 - 分析
 - RTSP
---

# 设计

* [x] 创建一个新类：一直去获取录像block，并将block传递给`MaiMemDemuxer`
* [x] 使用`MaiMemDemuxer`去对录像解封装，并按avpacket传递给`MaiMemMuxerRaw`
* [x] 使用`MaiMemMuxerRaw`添加一些描述信息，并传递给`Mai28181StreamSenderRTPAVP`
* [x] 在`MaiAVRetransmissionSrcInfo`中，添加一种新的数据源，用来保存录像源信息
* [x] 在`MaiMediaServer`中，添加一个新的方法，用来根据录像源信息来获取响应的`MaiAVRetransmissionSrcInfo`实例
* [x] 当录像文件结束了或者录像获取中断了，要做好对应的释放资源的操作
* [x] 修改录像rtsp流地址的参数，要和`MaiAVRetransmissionSrcInfo`中的一致

# RTSP流程

SETUP: 根据录像源信息建立`MaiAVRetransmissionSrcInfo`
PLAY: 启动数据流通
TEARDOWN: 释放`MaiAVRetransmissionSrcInfo`资源

