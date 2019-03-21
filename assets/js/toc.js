// https://github.com/ghiculescu/jekyll-table-of-contents

//模块扩展：完善scroll事件 scollStart 和 scrollStop
!function(factory){"function"==typeof define&&define.amd?define(["jquery"],factory):"object"==typeof exports?module.exports=factory(require("jquery")):factory(jQuery)}(function($){var dispatch=$.event.dispatch||$.event.handle,special=$.event.special,uid1="D"+ +new Date,uid2="D"+(+new Date+1);special.scrollstart={setup:function(data){var timer,_data=$.extend({latency:special.scrollstop.latency},data),handler=function(evt){var _self=this,_args=arguments;timer?clearTimeout(timer):(evt.type="scrollstart",dispatch.apply(_self,_args)),timer=setTimeout(function(){timer=null},_data.latency)};$(this).bind("scroll",handler).data(uid1,handler)},teardown:function(){$(this).unbind("scroll",$(this).data(uid1))}},special.scrollstop={latency:250,setup:function(data){var timer,_data=$.extend({latency:special.scrollstop.latency},data),handler=function(evt){var _self=this,_args=arguments;timer&&clearTimeout(timer),timer=setTimeout(function(){timer=null,evt.type="scrollstop",dispatch.apply(_self,_args)},_data.latency)};$(this).bind("scroll",handler).data(uid2,handler)},teardown:function(){$(this).unbind("scroll",$(this).data(uid2))}}});
(function($) {
    $.fn.toc = function(options) {
        var defaults = {
            noBackToTopLinks: false,
            title: '',
            minimumHeaders: 0,
            headers: 'h1, h2, h3, h4, h5, h6',
            // values: [ol|ul]
            listType: 'ul',
            // values: [show|slideDown|fadeIn|none]
            showEffect: 'none',
            // set to 0 to deactivate effect
            showSpeed: 'slow',
            classes: {
                list: '',
                item: ''
            }
        },
        settings = $.extend(defaults, options);
        var headers = $(settings.headers).filter(function() {
            // get all headers with an ID
            var previousSiblingName = $(this).prev().attr("name");
            if (!this.id && previousSiblingName) {
                this.id = $(this).attr("id", previousSiblingName.replace(/\./g, "-"));
            }
            return this.id;
        });
        output = $(this);
        if (!headers.length || headers.length < settings.minimumHeaders || !output.length) {
            $(this).hide();
            return;
        }

        if (0 === settings.showSpeed) {
            settings.showEffect = 'none';
        }
        function fixedEncodeURIComponent(str) {
            return encodeURIComponent(str).replace(/[!'()*]/g,
            function(c) {
                return '%' + c.charCodeAt(0).toString(16);
            });
        }

        var distance_map = new Object();
        distance_map.list = new Object();
        distance_map.current = "";
        function createLink(header) {
            var innerText = (header.textContent === undefined) ? header.innerText: header.textContent;
            var level = get_level(header);
            for (var i = level - 1; i >= 0; i--) {
              innerText = "&nbsp;&nbsp;&nbsp;&nbsp;" + innerText;
            }
            distance_map.list[header.id] = $("#"+header.id).offset().top;
            return "<p name=" + header.id +  " >" +  innerText + "</p>";
        }
        var dis_top_p = 0;
        function changeActiveItem(distance){
          distance_map.current != "" && $("#toc p[name=" + distance_map.current +"]").removeClass("active");
          var item = "";
          for (id in distance_map.list){
            if (distance_map.list[id] > distance){
              if (item == "")
                item = id;
              break;
            }
            item = id;
          }
          $("#toc p[name=" + item +"]").addClass("active");
          distance_map.current = item;
          p_dis = $("#toc p[name=" + item +"]").offset().top - dis_top_p - $(window).height() / 2 + 80;
          if (p_dis > 0)
            $('#toc').scrollTop(p_dis);
          else
            $('#toc').scrollTop(0);
        }

        var render = {
            show: function() {
                output.hide().html(html).show(settings.showSpeed);
            },
            slideDown: function() {
                output.hide().html(html).slideDown(settings.showSpeed);
            },
            fadeIn: function() {
                output.hide().html(html).fadeIn(settings.showSpeed);
            },
            none: function() {
                output.html(html);
            }
        };

        var get_level = function(ele) {
            return parseInt(ele.nodeName.replace("H", ""), 10);
        };
        var highest_level = headers.map(function(_, ele) {
            return get_level(ele);
        }).get().sort()[0];
        var return_to_top = '<i class="icon-arrow-up back-to-top"> </i>';

        var level = get_level(headers[0]),
        this_level,
        // html = settings.title + " <" +settings.listType + " class=\"" + settings.classes.list +"\">";
        html = settings.title + " <" + settings.listType + ">";
        headers.on('click',
        function() {
            if (!settings.noBackToTopLinks) {
              $('html,body').animate({scrollTop: $(this).offset().top}, 600);
            }
        }).addClass('clickable-header').each(function(_, header) {
            this_level = get_level(header);
            if (!settings.noBackToTopLinks && this_level === highest_level) {
                $(header).addClass('top-level-header').after(return_to_top);
            }
            if (this_level === level) // same level as before; same indenting
            html += "<li class=\"" + settings.classes.item + "\">" + createLink(header);
            else if (this_level <= level) { // higher level than before; end parent ol
                for (var i = this_level; i < level; i++) {
                    html += "</li></" + settings.listType + ">"
                }
                html += "<li class=\"" + settings.classes.item + "\">" + createLink(header);
            } else if (this_level > level) { // lower level than before; expand the previous to contain a ol
                for (i = this_level; i > level; i--) {
                    html += "<" + settings.listType + ">" + "<li class=\"" + settings.classes.item + "\">"
                }
                html += createLink(header);
            }
            level = this_level; // update for the next one
        });
        html += "</" + settings.listType + ">";
        if (!settings.noBackToTopLinks) {
            $(document).on('click', '.back-to-top',
            function() {
              $('html,body').animate({scrollTop: '0px'}, 600);
              window.location.hash = '';
            });
        }
        render[settings.showEffect]();
        $('#toc p').on('click', function(){
          var id = "#" + $(this).attr("name");
          $('html,body').animate({scrollTop: $(id).offset().top}, 600);
        });
        //changeActiveItem(0);
        dis_top_p = $("#toc p").offset().top ;
        $(window).scroll(function(){
          var distance = $(window).scrollTop();
          changeActiveItem(distance);
        });
    };
})(jQuery);