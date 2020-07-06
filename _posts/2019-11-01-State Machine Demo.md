---
layout: post
title: 状态机例子：绝地求生人物状态机设计
date: '2019-11-01 17:46'
categories: 
 - 设计模式
tags:
 - 状态机
 - 例子
---

# 一、需求分析

## 1. 杂乱的需求

1. 人物基础状态【站立、蹲、趴】
2. 人物高级状态【奔跑、走、慢走、静止】
3. 人物有【跳跃、蹲、趴、站、中弹、奔跑、走、慢走、停】动作
4. 装备有【主枪、副枪、手枪、投掷物、背包】
5. 人物和装备的状态【拿着装备、收着装备、使用装备】
6. 人物和装备的动作【拿起装备、收起装备、使用装备】

## 2. 需求分析

1. 三个状态机：人物基础状态机、人物高级状态机、人物和装备状态机。
2. 一个人物完整的状态就是由上述三个状态组合成的。

# 设计

## 1. 抽象出类结构

1. Equipment（抽象装备类）+ 派生的装备类
2. Player(人物类)
3. BaseState (基础状态类)
4. SeniorState (高级状态类)
5. PlayerEquipState (人物和装备状态类)
6. Action (动作类)
7. OperationAdapter (操作适配类)
8. ActionHandler (动作处理类)

## 2. 类之间的关系

适配器模式：
1. Target：OperationAdapter抽象类
2. Adapter: OperationAdapter具体类
3. Adapteree: ActionHandler

状态机模式：
1. Context: Player
2. Event: Action
3. State: BaseState/SeniorState/PlayerEquipState

中介者模式：
1. Mediator:  ActionHandler
2. Colleague: OperationAdapter、BaseState/SeniorState/PlayerEquipState

## 一次操作的举例

1. 用户按下“Z”，触发OperationAdapter中[按下“Z”]的事件
2. OperationAdapter将这个事件转换成对应的动作
3. 通过ActionHandler处理动作
4. 找到对应动作的状态类，由状态类执行对应动作

# 三、实现

参见[https://github.com/BigMouseFive/DesignMode](https://github.com/BigMouseFive/DesignMode)