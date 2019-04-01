---
layout: post
title: 录像回放中osd时间显示设计
date: '2019-03-26 11:14'
categories: 
 - 工作记录
tags:
 - 录像回放
 - osd
---
# 介绍

录像回放中的osd时间：是录像画面当时的时间。（eg. 当前的时间是**3/26 11:17:22**，正在播放的录像的时间是**3/14 08:23:34**，那么osd时间应该显示为 **2018/03/14 08:23:34**）

# 实现步骤

## 1. 开始播放录像时的处理

记录开始播放的时间值`record_start_time`和`current_start_time`，设置状态`play_state`为播放

## 2. 暂停播放录像时的处理

设置为状态`play_state`为暂停，记录暂停播放的时间值`record_stop_time`

## 3. 录像播放时的osd时间计算与显示

获取当前时间值`current_time`、播放/暂停状态`play_state`、播放速度`speed`、开始播放时的时间记录`record_start_time`。通过这些值计算出当前播放画面的时间。

```cpp
if (play_state == PLAY)
  record_time = record_start_time + (current_time - current_start_time) * speed;
else
  record_time = record_stop_time;
```

