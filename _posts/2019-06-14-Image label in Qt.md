---
layout: post
title: 继承于QLable的可缩放和移动的图片展示控件
date: '2019-06-14 10:56'
categories: 
 - 工作记录
tags:
 - 控件设计
---

# 功能

1. 通过传递QPixmap指针来指定数据，QPixmap指针指向的数据不由控件申请和释放。
2. 通过鼠标的滑轮来进行图片的放大和缩小。
3. 通过鼠标拖拽来实现图片的移动。

# 思路

1. 创建一个`ImageLabel`继承`QLabel`。
2. 重写`wheelEvent`事件来处理鼠标的滑轮事件。用来调整图片缩放比例。
3. 重写`mousePressEvent`和`mouseMoveEvent`事件来处理鼠标的拖拽事件。用来调整图片的偏移参数。
4. 开启一个定时器。在`timeout()`事件中，根据缩放比例和偏移参数来截取图片和渲染图片。

# 实现

## 相关概念

### 几个`大小`

1. 控件的大小 (control_w, control_h)
2. 图片显示的大小 (display_w, display_h)
3. 图片的大小 (origin_w, origin_h)

比如一张图片的大小是`1080*720`，在一个`400*300`的控件中显示，缩放比例是1（保持宽高比）。
易知：origin_w=1080, origin_h=720。control_w=400, control_h=300。因为保持宽高比，所以在这个例子中将以宽为基准，所以，display_w=400, display_h=400*720/1080≈266.66 。

### ratio

ratio = 图片的大小/图片显示的大小
在上面的例子中，ratio = max(origin_w/display_w, origin_h/display_h) = origin_w/display_w= 1080 / 400 = 2.7 。

### 拖拽事件的触发

如果关闭`mouse tracking`，则仅当按下鼠标按钮时鼠标移动才会发生鼠标移动事件。如果打开`mouse tracking`，即使未按下鼠标按钮，也会发生鼠标移动事件。

## 源代码

### 头文件

```cpp
#ifndef  IMAGELABEL_H
#define  IMAGELABEL_H
#include  <QLabel>
#include  <QTimer>
class  ImageLabel  :  public  QLabel
{
  Q_OBJECT
  //定义一个结构体，用来储存调用geControlInfo()的返回结果
  typedef  struct{
    double  ratio;  //ratio  =  图片的大小/实际显示的大小
    double  rw;  //实际显示的图片宽
    double  rh;  //实际显示的图片高
  }ConInfo;

public:
  ImageLabel(QWidget*  parent  =  Q_NULLPTR);
  ~ImageLabel();
  
  //外部传递QPixmap数据的接口
  void  setScaling(QPixmap*  image);

protected:
  void  keyPressEvent(QKeyEvent  *ev);//暂未使用
  void  mousePressEvent(QMouseEvent  *ev);
  void  mouseMoveEvent(QMouseEvent  *ev);
  void  mouseReleaseEvent(QMouseEvent  *ev);//暂未使用
  void  contextMenuEvent(QContextMenuEvent  *ev);//暂未使用
  void  wheelEvent(QWheelEvent  *event);
  
private  slots:
  //定时器触发事件，用来渲染图片
  void  slot_timer_out();

private:
  //修改缩放比例（_scaling）的两个函数
  void  zoomIn();
  void  zoomOut();
  
  //这个函数获取到的值会随这个缩放比例（_scaling）发生变化
  ConInfo  geControlInfo();
 
  QTimer*  _timer;  //定时器
  double  _scaling,  _dx,  _dy;  //缩放比例，偏移x，偏移y
  double  _scaling_bak,  _dx_bak,  _dy_bak;  //备份，通过判断是否改变来决定是否要重新渲染，从而减少不必要的资源浪费。
  QPixmap*  _image;  //QPixmap图片数据指针
  QPoint  _mouse_pos;  //用来记录鼠标移动时的起始pos
};

#endif  //  IMAGELABEL_H
```

### 源文件

```cpp
#include "ImageLabel.h"
#include <QWheelEvent>
ImageLabel::ImageLabel(QWidget* parent)
    : QLabel(parent)
    , _scaling(1) //初始缩放比例为1
    , _dx(0)
    , _dy(0)
    , _new_image(false)
{
    _timer = new QTimer(this);
    connect(_timer, SIGNAL(timeout()), this, SLOT(slot_timer_out()));
}
ImageLabel::~ImageLabel(){

}

ImageLabel::ConInfo ImageLabel::geControlInfo(){
    double left = _image->width() / (width() * _scaling);
    double right = _image->height() / (height() * _scaling);
    ConInfo con;
    con.ratio = std::max(left, right);
    con.rw = _image->width() / con.ratio;
    con.rh = _image->height() / con.ratio;
    return con;
}

void ImageLabel::setScaling(QPixmap* image){
    //如果图片数据是不为空的那么开启渲染
    if (image) {
        _timer->start(5);
        _image = image;
        _scaling = 1; _dx = 0; _dy = 0;
        _new_image = true;
        slot_timer_out();
    }
    else
        _timer->stop();
}

void ImageLabel::keyPressEvent(QKeyEvent *ev){

}

void ImageLabel::mousePressEvent(QMouseEvent *ev){
    _mouse_pos = ev->pos();//记录鼠标位置
}

void ImageLabel::mouseMoveEvent(QMouseEvent *ev){
    //获取鼠标位置偏移
    QPoint current_pos = ev->pos();
    QPoint diff_pos = _mouse_pos - current_pos;

    //如果图片数据是不为空的那么开启渲染
    _mouse_pos = current_pos;

    //根据鼠标的偏移来修改偏移参数
    //同时要限制住偏移地址的最大最小值
    //最大值就是 （实际显示大小-控件大小）/ 2
    //最小值就是  -（实际显示大小-控件大小）/ 2
    //注意 _dx, _dy 表示的是“偏移大小/实际显示大小”的比例值
    ConInfo con = geControlInfo();
    double scal_dx_2 = (1 - width()/con.rw) / 2;
    double scal_dy_2 = (1 - height()/con.rh) / 2;
    _dx += diff_pos.x() / con.rw;
    _dy += diff_pos.y() / con.rh;
    if (_dx < -scal_dx_2) _dx = -scal_dx_2;
    if (_dx > scal_dx_2) _dx = scal_dx_2;
    if (_dy < -scal_dy_2) _dy = -scal_dy_2;
    if (_dy > scal_dy_2) _dy = scal_dy_2;
}

void ImageLabel::mouseReleaseEvent(QMouseEvent *ev){

}

void ImageLabel::contextMenuEvent(QContextMenuEvent *ev){

}

void ImageLabel::wheelEvent(QWheelEvent *event){
    QPoint pos;
    QPoint pos1;
    QPoint pos2;
    pos1 = mapToGlobal(QPoint(0,0));
    pos2 = event->globalPos();
    pos = pos2 - pos1;

    //判断鼠标位置是否在图像显示区域
    if (pos.x() > 0 &&
        pos.x() < width() &&
        pos.y() > 0 &&
        pos.y() < height()){
        // 当滚轮远离使用者时进行放大，当滚轮向使用者方向旋转时进行缩小
        _timer->stop();
        if(event->delta() > 0){
            zoomIn();
        }
        else{
            zoomOut();
        }
        _timer->start();
    }
}

void ImageLabel::zoomOut(){
    _scaling = _scaling / 1.1;
    if(_scaling < 0.5)
        _scaling = 0.5;
}

void ImageLabel::zoomIn(){
    _scaling = _scaling * 1.1;
    if(_scaling > 20)
        _scaling = 20;
}

void ImageLabel::slot_timer_out(){
    //用来记录由偏移参数(_dx,_dy)和缩放比例(scaling)共同作用下的实际偏移距离
    double curr_dx = 0;
    double curr_dy = 0;

    //根据scaling来获取缩放所带来的位移
    ConInfo con = geControlInfo();
    double scal_dx = 1 - width()/con.rw;
    double scal_dy = 1 - height()/con.rh;

    //合并偏移参数(_dx,_dy)和缩放比例(scaling)的共同作用
    if (scal_dx < 0) {
        _dx = 0;
    }else{
        curr_dx = _dx + scal_dx / 2;
        if (curr_dx < 0) curr_dx = 0;
        if (curr_dx > scal_dx) curr_dx = scal_dx;
    }
    if (scal_dy < 0) {
        _dy = 0;
    }else{
        curr_dy = _dy + scal_dy / 2;
        if (curr_dy < 0) curr_dy = 0;
        if (curr_dy > scal_dy) curr_dy = scal_dy;
    }

    if (_new_image || _scaling != _scaling_bak || curr_dx != _dx_bak || curr_dy != _dy_bak){
        _scaling_bak = _scaling;
        _dx_bak = curr_dx;
        _dy_bak = curr_dy;
        _timer->stop();

        //根据不同情况做不同的渲染处理
            Qt::Alignment bits;
            if (scal_dx <= 0) bits |= Qt::AlignHCenter;
            else bits |= Qt::AlignLeft;
            if (scal_dy <= 0) bits |= Qt::AlignVCenter;
            else bits |= Qt::AlignTop;
            setAlignment(bits);
            if (bits == Qt::AlignCenter){
                setPixmap(_image->scaled(width()*_scaling, height()*_scaling, Qt::KeepAspectRatio));
            }else{
                auto temp = _image->copy(curr_dx * _image->width(), curr_dy * _image->height(),
                                     width() * _image->width() / con.rw , height() * _image->height() / con.rh);
                temp = temp.scaled(width(), height() , Qt::KeepAspectRatio);
                setPixmap(temp);
            }
        _timer->start();
    }
}
```

### 调用demo

```cpp
ImageViewer::ImageViewer(QWidget  *parent)  :
  QWidget(parent),
  ui(new  Ui::ImageViewer)
{
  ui->setupUi(this);
  QPixmap*  pixmap  =  new  QPixmap();
  pixmap->load("in.jpg");
  imagelabel  =  new  ImageLabel(this);
  imagelabel->setSizePolicy(QSizePolicy::Expanding,  QSizePolicy::Expanding);
  imagelabel->setFixedSize(750,  300);
  imagelabel->setScaling(pixmap);
}
```
