---
layout: post
title: 优化获取日志流程
date: '2019-07-12 14:41'
categories: 
 - 工作记录
tags:
 - 优化
---

# 起因

1. 当在日志查询测试的时候发现：当获取到的日志数量特别大（>2000）就会开始变得卡顿。当数量上万的时候将会等待很久。
2. 在测试播放录像的时候发现：如果这个录像时间段的事件特别多，那么在绘制时间条时，将花费很长时间，造成界面卡顿，影响操作。

# 检查

一次日志查询分为以下几个过程：

1. 数据库查询（快）
2. 查询到的数据保存到LogSearchInfo结构中（快）
3. 将LogSearchInfo结构的数据转换成json（慢）
4. 将json通过http返回给客户端（快）
5. 客户端解析json数据到LogSearchInfo结构中（慢）

# 解决

通过检查发现速度是被限制在json转换上了。所以决定不使用json。通过自己定义一种方式来实现数据的传递。
定义格式如下：
```
 d11 d12 d13 ... d1n d21 d22 ... dnn
```
如果dxy为空（eg. 字符串为空）那么改为`[]`这个字符传递。

http之间使用流传递，部分代码如下：
```cpp
// 服务端返回数据
std::ostream&  ostr = response.send();
for (std::vector<LogSearchInfo>::iterator it = infos.begin(); it != infos.end(); ++it)
{
	ostr << ' ';
	if (it->dev_guid.empty()) it->dev_guid = "[]";
	ostr << it->dev_guid << ' ';
	ostr << it->chan_id << ' ';
	ostr << it->main_event_type << ' ';
	ostr << it->sub_event_type << ' ';
    ostr << it->third_event_type << ' ';
	if (it->user_account.empty()) it->user_account = "[]";
    ostr << it->user_account << ' ';
	if (it->service_source.empty()) it->service_source = "[]";
	ostr << it->service_source << ' ';
	if (it->ip.empty()) it->ip = "[]";
	ostr << it->ip << ' ';
	if (it->systemlog_detail.empty()) it->systemlog_detail = "[]";
	ostr << it->systemlog_detail << ' ';

	if (it->manual_text.empty()) it->manual_text = "[]";
	ostr << it->manual_text << ' ';
	ostr << it->start_time << ' ';
	ostr << it->end_time;
}

//客户端接收数据
while (!rs.eof()){
	if (rs.bad()){
		printf("error: rs.bad()\n");
		return TF_PLATFORM_RET_FAILED;
	}
	if (rs.fail()){
		printf("error: rs.fail()\n");
		return TF_PLATFORM_RET_FAILED;
	}
	LogSearchInfo info;
	std::string tmp;
	rs >> info.dev_guid; if (info.dev_guid == "[]")       info.dev_guid.clear();
	rs >> info.chan_id;
	rs >> info.main_event_type;
	rs >> info.sub_event_type;
	rs >> info.third_event_type;
	rs >> info.user_account; if (info.user_account == "[]") info.user_account.clear();
	rs >> info.service_source; if (info.service_source == "[]") info.service_source.clear();
	rs >> info.ip; if (info.ip == "[]") info.ip.clear();
	rs >> info.systemlog_detail; if (info.systemlog_detail == "[]") info.systemlog_detail.clear();
	rs >> info.manual_text; if (info.manual_text == "[]") info.manual_text.clear();
	rs >> info.start_time;
	rs >> info.end_time;
	infos.push_back(info);
}
```


