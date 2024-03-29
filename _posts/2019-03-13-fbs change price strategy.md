---
layout: post
title: fbs改价策略
date: '2019-03-13 20:53'
categories: 
 - 工作记录
tags:
 - 自动改价程序
---

# 改价策略

## 情况分析

- 当**购物车价格**小于**当前定价**，**降价比**不超过**设定值**，设置价格为【**购物车价格**-**降价值**】
- 当**购物车价格**小于**当前定价**，**降价比**超过**设定值**，不改价
- 当**购物车价格**等于**当前定价**，不改价
- 当**购物车价格**大于**当前定价**，不改价

# 改价程序流程

## 启动chrome浏览器

```python
chrome=webdriver.Chrome(executable_path=chromePath, chrome_options=option)
```

## 打开卖家登录界面[seller-login](https://uae.souq.com/ae-en/account.php)

```python
# 获取email 和 password 控件
    print("登录账户")
    chrome.get(loginUri)
    try:
        elemNewAccount = chrome.find_element_by_id("email")
        elemNewLoginBtn = chrome.find_element_by_id("siteLogin")
        elemNewAccount.send_keys(account)
        print("输入账户:" + account)
        elemNewLoginBtn.click()
        print("点击siteLogin")
        try:
            cssSelectText = "#continue"
            WebDriverWait(chrome, 10, 0.5).until(EC.presence_of_element_located((By.CSS_SELECTOR, cssSelectText)))
            print("获取到continue按钮")
            elemContinue = chrome.find_element_by_id("continue")
            elemContinue.click()
            print("点击continue")
            cssSelectText = "#ap_password"
            WebDriverWait(chrome, 20, 0.5).until(EC.presence_of_element_located((By.CSS_SELECTOR, cssSelectText)))
            print("获取到password输入框")
            elemPassword = chrome.find_element_by_id("ap_password")
            elemLoginBtn = chrome.find_element_by_id("signInSubmit")
            elemPassword.send_keys(Keys.CONTROL + "a")
            elemPassword.send_keys(password)
            print("输入密码：********")
            elemLoginBtn.click()
            print("点击continue")
        except:
            print("方式一登录失败，尝试方式二登录")
            cssSelectText = "#password"
            WebDriverWait(chrome, 20, 0.5).until(EC.presence_of_element_located((By.CSS_SELECTOR, cssSelectText)))
            print("获取到password输入框")
            elemPassword = chrome.find_element_by_id("password")
            elemLoginBtn = chrome.find_element_by_id("siteLogin")
            elemPassword.clear()
            elemPassword.send_keys(password)
            print("输入密码：********")
            elemLoginBtn.click()
            print("点击登录")

        cssSelectText = "#search_box"
        WebDriverWait(chrome, 20, 0.5).until(EC.presence_of_element_located((By.CSS_SELECTOR, cssSelectText)))
    except:
        if str(chrome.current_url).find("uae.souq.com/ae-en/account.php") < 0:
            raise
```

## 登入成功后打开[fbs-inventory](https://sell.souq.com/fbs-inventory)

```python
loginHandler = chrome.current_window_handle
    handlers = chrome.window_handles
    unknownHandler = ""
    for handler in handlers:
        if handler != loginHandler:
            unknownHandler = handler
            break
    readyUri = "https://sell.souq.com/fbs-inventory"
    js = 'window.open("' + readyUri + '")'
    chrome.execute_script(js)
    handlers = chrome.window_handles
    for handler in handlers:
        if handler != loginHandler and handler != unknownHandler:
            inventoryHandler = handler
            break
    print("跳转到改价界面")
    while 1:
        try:
            chrome.switch_to_window(inventoryHandler)
            print("开始循环处理")
            OperateProduct(chrome, record, attention, percent, lowwer)
        except:
            print("循环改价发生错误，马上重新开始")
        print("刷新改价界面")
        chrome.refresh()
```

## 开始循环改价

- 获取商品列表的第一行 **first_row**

```python
 first_row = chrome.find_elements_by_css_selector('//*[@id="table-inventory"]/tbody/tr[1]')
```

- 点击第一行

```python
chrome.execute_script("arguments[0].click()", first_row)
```

- 循环改价操作
   ![chagePriceOperate]\({{site.url | append: site.baseurl}}/assets/img/chagePriceOperate.png)

```python
    i = 0
    while 1:
        WebDriverWait(chrome, 60, 0.5).until(checkPage)
        gold_price = 0

        # 获取EAN
        ean_elem = chrome.find_element_by_xpath('//*[@id="offerListitng"]/div[2]/div/div[1]/div[1]/span')
        ean = ean_elem.text.split(";")[-1]
        timestr = time.strftime("%Y-%m-%d %H:%M:%S")

        # 获取当前价格输入框，并获取当前价格
        self_price_elem = chrome.find_element_by_xpath(
            '//*[@id="offerListitng"]/div[4]/div[2]/div/div/div/div[1]/sc-offer-listing/div/div[1]/label[2]/input')
        self_price = float(self_price_elem.get_attribute("value"))

        # 获取购物车价格
        try:
            gold_price_elem = chrome.find_element_by_xpath('//*[@id="offerListitng"]/div[4]/div[2]/div/div/div/div[1]/sc-offer-listing/div/div[1]/label[2]/small[1]/span[2]')
            gold_price = float(re.findall(r"\d+\.?\d*", gold_price_elem.text)[0])
        except NoSuchElementException:
            i += 1
            out = str(i) + "-->" + timestr + " " + ean + "\t只有本店铺一家卖此产品"
            print(out)
        out = timestr + " " + ean + "\t购物车：" + str(gold_price) + "\t本店铺：" + str(self_price) + "\t降价比:" + str(
            round((self_price - gold_price) / self_price, 2) * 100) + "%"

        # 判断
        # if 购物车价格 小于 当前定价 and 降价比 不超过 设定值:
        if gold_price < self_price and ((self_price-gold_price)/self_price) <= percent:
            # 修改当前价格输入框的中价格为【购物车价格-降价值】
            to_price = round(gold_price - lowwer, 2)
            self_price_elem.send_keys(Keys.CONTROL + "a")
            self_price_elem.send_keys(str(to_price))
            # 获取按钮【更新】，并点击
            update_elem = chrome.find_element_by_xpath('//*[@id="offerListitng"]/div[3]/div/div/input')
            chrome.execute_script("arguments[0].click()", update_elem)
            out += "\t修改价格：" + str(to_price) + "\n"
            record.write(out)
            record.flush()
        else:
            out += "\t不处理\n"
            attention.write(out)
            attention.flush()
        out = out[0:-1]
        i += 1
        out = str(i) + "-->" + out
        print(out)
        # 获取按钮【下一个】，并点击
        path = '//*[@id="offerListitng"]/div[3]/div/div/div/div/div/a[2]'
        WebDriverWait(chrome, 20, 0.5).until(EC.presence_of_element_located((By.XPATH, path)))
        next_elem = chrome.find_element_by_xpath(path)
        if next_elem.get_attribute("class") == "button-disabled":
            print("完成一次循环")
            raise IndexError
        chrome.execute_script("arguments[0].click()", next_elem)
        time.sleep(0.5)
```

# 总结

## xpath的使用

## 判断网页已全部加载完成

```python
def checkPage(driver):
    checkPageFinishScript = "try {if (document.readyState !== 'complete') {return false;} if (window.jQuery) { if (" \
                            "window.jQuery.active) { return false; } else if (window.jQuery.ajax && " \
                            "window.jQuery.ajax.active) { return false; } } if (window.angular) { if (!window.qa) { " \
                            "window.qa = {doneRendering: false }; } var injector = window.angular.element(" \
                            "'body').injector(); var $rootScope = injector.get('$rootScope'); var $http = " \
                            "injector.get('$http'); var $timeout = injector.get('$timeout'); if ($rootScope.$$phase " \
                            "=== '$apply' || $rootScope.$$phase === '$digest' || $http.pendingRequests.length !== 0) " \
                            "{ window.qa.doneRendering = false; return false; } if (!window.qa.doneRendering) { " \
                            "$timeout(function() { window.qa.doneRendering = true;}, 0); return false;}} return " \
                            "true;} catch (ex) {return false;} "
    return driver.execute_script(checkPageFinishScript)

WebDriverWait(chrome, 60, 0.5).until(checkPage)
```

## 请空**INPUT框**的内容

```python
# 方法一：使用clear清空
input_elem.clear()
input_elem.send_keys("content")
# 方法二:
input_elem.send_keys(Keys.CONTROL + "a")
input_elem.send_keys("content")
```

## python+selenium开发基本过程

1. 用chrome打开你要访问的网页，通过**检查元素**来查找你要控制的元素（eg. 输入框，按钮，文本等）
2. 获取该元素的**css path**或者**xpath**
3. 使用selenium通过步骤2的**path**来获取元素
4. 使用selenium对元素操作
   - 输入框：清空，输入
   - 按钮：点击
   - 通用：获取html内容，获取标签各类属性值
5. 使用selenium对浏览器的操作
   - 打开网址
   - 打开新的标签页
   - 切换标签页
6. 使用selenium对浏览器属性设置（通过在创建浏览器的时候通过配置文件实现）
   - 禁止加载图片
   - 是否显示浏览器
   - 指定`user-data-dir`[保存的浏览器历史记录，密码表单和cookies等]
   - 指定错误输出等级
7. 使用要注意的问题
   - 当你不需要使用机器上的chrome的cookies等个人记录时，不需要去指定`user-data-dir`，这样selenium创建的将是一个没有任何个人记录的浏览器。
   - 当你需要使用机器上的chrome的个人记录是，则必须指定`user-data-dir`。这时候建议是不要再使用这个chrome浏览器了，因为可能会产生干扰。可以使用其他的浏览器访问网页。
   - 通过设置错误输出等级可以避免在命令行窗口输出很多调试信息
   - 