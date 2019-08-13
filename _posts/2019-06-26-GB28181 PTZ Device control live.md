---
layout: post
title: GB28181设备的云台控制占有设计
date: '2019-06-26 14:41'
categories: 
 - 工作记录
tags:
 - 云台控制
 - GB28181
---

# 流程分析

 目前用户会有以下几种控制方式：
 1. 云台方向控制 【云台控制】
 2. 变倍 【云台控制】
 3. 聚焦 【云台控制】
 4. 光圈 【云台控制】
 5. 预置位 【云台控制】
 6. 预置位巡航 【预置位巡航】

其中，“1-4”的控制流程会有一个开始和一个结束；“5”只有一个开始；“6”有开始和结束。

## 抢占情况分析

### 情况一：当前设备没有被占有

1. 收到“1-4”的开始，将控制权交给这个用户，设置设备已被占用。
2. 收到“5”的开始，将控制权交给这个用户，开启倒计时。
3. 收到“6”的开始，将控制权交给这个用户，设置设备已被占用。

> 说明：倒计时，默认设置为8秒，过了8秒，时间变为0之后，这个设备就恢复未被占有状态。

### 情况二：当前设备占有

~~低级别或同等级的其他用户~~--------不会被抢占
当前用户发来消息
1. 收到“1-4”的开始，设置设备已被占用。
2. 收到“5”的开始，开启倒计时。
3. 收到“6”的开始，设置设备已被占用。

级别高的其他用户发来消息
1. 收到“1-4”的开始，将控制权交给这个用户，设置设备已被占用。
2. 收到“5”的开始，将控制权交给这个用户，设置设备已被占用，并开启倒计时。
3. 收到“6”的开始，将控制权交给这个用户，设置设备已被占用。

## 脱离控制权情况分析

### 情况一：设备被“1-4”占有

当收到当前用户发来的“1-4”的结束，并开启倒计时。倒计时结束后，判断设备是否还有预置位巡航，如果有则转换到巡航。如果没有则设备脱离控制，设置设备未被控制。

### 情况二：设备被“5”占有

当被“5”占有后，倒计时结束了。判断设备是否还有预置位巡航，如果有则转换到巡航。如果没有则设备脱离控制，设置设备未被控制。

### 情况三：设备被“6”占有

当收到当前用户发来的“6”的结束，并开启倒计时。当倒计时结束了，则设备脱离控制，设置设备未被控制。

# 代码设计

## 数据结构设计

```cpp
    typedef struct{
		std::string usergiud;
		std::string username;
		int userlevel;
	} CruiseController;
    typedef struct   
	{
		bool exist;            //设备是否被占用：当exist为0时，就根据倒计时时间来判断是否被占用
		std::string userguid;  //控制者guid
		std::string username;  //控制者名字
		int userlevel;         //控制者等级
		int event_type;        //事件类型
		int live_time;         //倒计时时间 
		CruiseController cruise_bak; //巡航信息备份
	} DeviceController;
```


## 函数设计

### 判断是否具备抢占权限

1. 设备未被占有`exist==false && live_time==0`
2. 同一个用户
3. 级别更高的其他用户
```cpp
bool CanIControl(Poco::JSON::Object::Ptr obj){
	std::string device_guid;
	if (obj->has("device_guid")) device_guid = obj->getValue<std::string>("device_guid");
	if (device_guid.empty()) return false;

	Poco::Mutex::ScopedLock lock(dev_ctrl_mutex);
	auto iter = dev_ctrl_live.find(device_guid);
	if (iter == dev_ctrl_live.end()) return true;
	if (!iter->second.exist && iter->second.live_time == 0) return false;
	
	std::string userguid;
	int userlevel;

	if (obj->has("user_guid")) userguid = obj->getValue<std::string>("user_guid");
	if (iter->second.userguid == userguid) return true;
	if (obj->has("user_level")) userlevel = obj->getValue<int>("user_level");
	if (iter->second.userlevel < userlevel) return true;
	return false;
}
```

### 设置设备控制者

参数：DeviceController
流程：
1. 判断是否有人占用，如果没有，则直接添加新内容；
2. 如果有人在用，判断是否是“6”，如果不是，则直接替换新内容；
3. 如果是“6”，判断新内容中是否是“6”，如果是，则直接替换新内容；
4. 如果不是“6”，则将旧的控制者信息放入`cruise_bak`中。
5. 发送设备占用消息到消息队列。

### 设备控制结束通知

参数：用户guid，设备guid
流程：
1. 获取到设备对应的DeviceController结构体；
2. 判断DeviceController结构体是否存在，如果不存在直接退出。
3. 如果存在，判断用户guid是否和结构体中的用户guid相同，如果不同直接退出。
4. 如果相同，设置`exist = false;`，同时设置`live_time = 8;`

### 设备倒计时结束

开启一个定时器，每一秒执行一次。执行内容：将DeviceController[exist=false, live_time>0]，的计数值减1。当计数值变成0时，发送一个设备脱离占用的消息到消息队列。