// Coursera Enhancement Suite
// Copyright (C) 2013  Michael Reinhardt

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see http://www.gnu.org/licenses/.

var CES = function(options) {
    if (arguments.callee._inst) return arguments.callee._inst;
    arguments.callee._inst = this;

    var self = this,
        $els = {
            'body': $('body'),
            'main': $('#course-page-content'),
            'user_menu': $('#course-topbar-my')
        },
        _tpls = {
            'badge': chrome.extension.getURL("html/badge.html"),
            'settings_link': chrome.extension.getURL("html/settings_link.html"),
            'settings': chrome.extension.getURL("html/settings.html"),
            'tagger': chrome.extension.getURL("html/tag.html"),
            'user_menu': chrome.extension.getURL("html/user_menu.html")
        },
        _rx = {
            'user_link': /profile\?user_id=(\d+)$/
        };

    this.tpls = {
        'get': function() {
            _.forIn(_tpls, function(_tpl, key) {
                $.get(_tpl, function(tpl) {
                    self.tpls[key] = tpl;
                });
            });
        }
    };

    this.insert = function() {
        $.get(_tpls['settings_link'], function(tpl) {
            $els['user_menu'].find(':contains("Settings")').after(tpl);
        });
    };

    this.listen = function() {
        $els['user_menu'].on('click', '.ces-settings-link', self.handle['open_ces_settings']);
        $els['main'].on('mouseenter', 'a', self.handle['show_user_menu']);
        $els['main'].on('mouseleave', 'a', self.handle['hide_user_menu']);
        $els['main'].on('DOMNodeInserted', self.handle['process_new_content']);
    };

    this.handle = {

        'open_ces_settings': function(ev) {
            ev.preventDefault();

            var $settings;

            $els['body'].prepend(_.template(self.tpls['settings'], {
                'tagged_users': self.db.get('ces-settings-tagged-users', []),
                'ignored_users': self.db.get('ces-settings-ignored-users', []),
                'hide_section': self.db.get('ces-settings-user-hide-section', 'fullthread'),
                'hide_style': self.db.get('ces-settings-user-hide-style', 'removed'),
                'hide_show': self.db.get('ces-settings-user-hide-show', 'click')
            }));
            $settings = $('.ces-settings');

            $els['body'].on('click', '.ces-overlay', self.handle['click_overlay_close']);
            $settings.on('click', '.close', self.handle['click_modal_close']);
            $settings.on('click', '.tabs a', self.handle['click_settings_tab']);
            $settings.on('click', '.panes a', self.handle['click_settings_users_action']);
            $settings.on('change', '.ces-options input', self.handle['change_settings_options']);

            $settings.find('.tabs a:first').click();
        },

        'click_settings_tab': function(ev) {
            ev.preventDefault();

            var $this = $(this),
                paneSel = '.' + $this.attr('href').slice(1);

            $this.closest('.tabs').find('a').removeClass('on');
            $this.addClass('on');
            $this.closest('.ces-settings').find('.panes > div').removeClass('on')
                                          .filter(paneSel).addClass('on');
        },

        'close_modal': function(ev) {
            var $modal = $('.ces-modal');

            $modal.off();
            $els['body'].off('click', '.ces-overlay');
            $('.ces-overlay').remove();
        },

        'click_overlay_close': function(ev) {
            if (!$(ev.target).closest('.ces-modal').length) {
                ev.preventDefault();
                self.handle['close_modal']();
            }
        },

        'click_modal_close': function(ev) {
            ev.preventDefault();
            self.handle['close_modal']();
        },

        'click_settings_users_action': function(ev) {
            var $this = $(this),
                action = $this.attr('href').slice(1),
                table = $this.closest('.ces-table').data('ces-table'),
                $user, user_id, users;

            switch (action) {
                case 'del':
                    ev.preventDefault();

                    $user = $this.closest('.user');
                    user_id = parseInt($user.find('.id').text(), 10);
                    users = self.db.get('ces-settings-' + table + '-users', []);
                    users = _.reject(users, {'id': user_id});
                    self.db.save('ces-settings-' + table + '-users', users);
                    $user.remove();
                break;

                default:
                break;
            }
        },

        'change_settings_options': function(ev) {
            var $this = $(this),
                name = $this.attr('name'),
                val = $this.val();

            self.db.save(name, val);

            if (name === 'ces-settings-user-hide-style') {
                $('.hide-show').toggleClass('hide', val == 'removed');
            }
        },

        'show_user_menu': function(ev) {
            var $this = $(this),
                href = $this.attr('href'),
                isUser = _rx['user_link'].test(href),
                isClean = !$this.find('span[class^="icon"]').length,
                isIgnored = $this.closest('.ces-ignored').length,
                hasOGBadge = $this.next('.course-forum-profile-badge').length &&
                             !$this.next('.course-forum-profile-badge').hasClass('ces-profile-badge'),
                user_id, user_name, $menu;

            if (isUser && isClean && !isIgnored && !hasOGBadge) {
                user_id = href.match(_rx['user_link'])[1];
                user_name = $.trim($this.text());

                $this.css({'position': 'relative', 'z-index': 50}).append(
                    _.template(self.tpls['user_menu'], {
                        'user_id': user_id,
                        'user_name': user_name
                    })
                );

                $menu = $('.ces-user-menu');
                $menu.on('click', 'a', self.handle['click_user_action']);
            }
        },

        'click_user_action': function(ev) {
            ev.preventDefault();

            var $this = $(this),
                action = $this.attr('href').slice(1),
                $menu = $this.closest('.ces-user-menu'),
                user_id = $menu.data('ces-user-id'),
                user_name = $menu.data('ces-user-name'),
                user, ignored_users;

            switch (action) {
                case 'tag':
                    self.handle['open_tag_prompt'](user_id, user_name);
                break;

                case 'ignore':
                    ignored_users = self.db.get('ces-settings-ignored-users', []);
                    ignored_users = _.reject(ignored_users, {'id': user_id});
                    ignored_users.push({
                        'id': user_id,
                        'name': user_name
                    });
                    self.db.save('ces-settings-ignored-users', ignored_users);
                    self.process['ignore_users']();
                break;
            }
        },

        'open_tag_prompt': function(user_id, user_name) {
            var tagged_users, user, $tag_prompt;

            tagged_users = self.db.get('ces-settings-tagged-users', []);
            user = _.find(tagged_users, {'id': user_id});

            $els['body'].prepend(_.template(self.tpls['tagger'], {
                'color': user.color || '',
                'tag': user.tag || '',
                'user_id': user_id,
                'user_name': user_name
            }));
            $tag_prompt = $('.ces-tagger');

            $els['body'].on('click', '.ces-overlay', self.handle['click_overlay_close']);
            $tag_prompt.on('click', '.close', self.handle['click_modal_close']);
            $tag_prompt.on('submit', 'form', self.handle['save_tag']);
        },

        'save_tag': function(ev) {
            ev.preventDefault();

            var $this = $(this),
                user_id = parseInt($this.find('input[name="user_id"]').val(), 10),
                user_name = $this.find('input[name="user_name"]').val(),
                tag = $this.find('input[name="tag"]').val(),
                color = $this.find('input[name="color"]:checked').val(),
                tagged_users;

            self.handle['close_modal']();

            if (tag) {
                tagged_users = self.db.get('ces-settings-tagged-users', []);
                tagged_users = _.reject(tagged_users, {'id': user_id});
                tagged_users.push({
                    'id': user_id,
                    'name': user_name,
                    'tag': tag,
                    'color': color
                });
                self.db.save('ces-settings-tagged-users', tagged_users);
                self.process['tag_users']();
            }
        },

        'hide_user_menu': function(ev) {
            var $this = $(this),
                href = $this.attr('href'),
                $menu = $('.ces-user-menu'),
                isUser = _rx['user_link'].test(href);

            if (isUser) {
                $menu.off('click', 'a');
                $menu.remove();
            }
        },

        'process_new_content': function(ev) {
            self.process['tag_users']();
            self.process['ignore_users']();
        }

    };

    this.process = {

        'ignore_users': _.throttle(function() {
            var ignoredUsers = self.db.get('ces-settings-ignored-users', []),
                $comments = $('.course-forum-comments-container'),
                $threads = $('.course-forum-threads-listing'),
                hide = {
                    'section': self.db.get('ces-settings-user-hide-section', 'fullthread'),
                    'style': self.db.get('ces-settings-user-hide-style', 'removed'),
                    'show': self.db.get('ces-settings-user-hide-show', 'click')
                },
                threadMain, commentsMain,
                hideCSS, showCSS,
                showAction, rehideAction;

            switch(hide['section']) {
                case 'fullthread':
                    // 'add', '' is just a noop so that all threadMain/commentsMain have 4 items
                    threadMain = ['closest', '.course-forum-post-container', 'add', ''];
                    commentsMain = ['closest', '.course-forum-post-view-container', 'add', ''];
                break;

                case 'headerpost':
                    threadMain = ['closest', '.course-forum-post-top-container', 'add', ''];
                    commentsMain = ['closest', '.course-forum-post-view-container', 'add', ''];
                break;

                case 'postonly':
                    threadMain = ['closest', '.course-forum-post-view-container', 'children', '*:not(.course-forum-post-header)'];
                    commentsMain = ['closest', '.course-forum-post-view-container', 'children', '*:not(.course-forum-post-header)'];
                break;
            }

            switch(hide['style']) {
                case 'faded':
                    hideCSS = {'opacity': 0.1};
                    showCSS = {'opacity': 1.0};
                break;

                case 'removed':
                    hideCSS = {'display': 'none'};
                break;
            }

            switch(hide['show']) {
                case 'hover':
                    showAction = 'mouseenter';
                    rehideAction = 'mouseleave';
                break;

                case 'click':
                    showAction = 'click';
                    rehideAction = null;
                break;
            }

            _.each(ignoredUsers, function(user) {
                var $thread, $comment, $forum, $all;

                $thread = $('.course-forum-post-top-container a[href$="=' + user.id + '"]')
                    [threadMain[0]](threadMain[1])[threadMain[2]](threadMain[3])
                    .filter(':not(.ces-force-show)').addClass('ces-ignored').css(hideCSS);
                $comment = $comments.find('.course-forum-post-view-container a[href$="=' + user.id + '"]')
                    [commentsMain[0]](commentsMain[1])[commentsMain[2]](commentsMain[3])
                    .filter(':not(.ces-force-show)').addClass('ces-ignored').css(hideCSS);
                $forum = $threads.find('a[href$="=' + user.id + '"]').parent(':contains("Started by")')
                    .closest('.course-forum-threads-listing-row')
                    .filter(':not(.ces-force-show)').addClass('ces-ignored').css(hideCSS);

                if (hide['style'] !== 'removed') {
                    $all = $thread.add($comment).add($forum);
                    $all.on(showAction, function(ev) {
                        $(this).removeClass('ces-ignored').addClass('ces-force-show')
                            .stop(true, false).animate(showCSS);
                    });
                    if (rehideAction) {
                        $all.on(rehideAction, function(ev) {
                            $(this).removeClass('ces-force-show')
                                .stop(true, false).animate(hideCSS);
                        });
                    }
                }
            });
        }, 500, {'leading': false, 'trailing': true}),

        'tag_users': _.throttle(function() {
            var taggedUsers = self.db.get('ces-settings-tagged-users', []);

            _.each(taggedUsers, function(user) {
                $els['main'].find('a[href$="=' + user.id + '"]').each(function(i, el) {
                    var $this = $(this),
                        isClean = !$this.find('span[class^="icon"]').length;

                    if (isClean && !$(this).next('.course-forum-profile-badge').length) {
                        $this.after(_.template(self.tpls['badge'], {
                            'tag': user.tag,
                            'color': user.color || 'cyan'
                        }));
                    }
                });
            });
        }, 500, {'leading': false, 'trailing': true})

    };

    this.db = {
        'get': function(key, dfault, suppressErrors) {
            var result;
            if (typeof(dfault) === "undefined") dfault = null;
            if (typeof(suppressErrors) === "undefined") suppressErrors = true;
            try {
                result = JSON.parse(localStorage.getItem(key));
                if (typeof(result) === "undefined" || result === null) {
                    return dfault;
                }
                return result;
            } catch(e) {
                if (suppressErrors) return dfault;
                throw(e);
            }
        },
        'save': function(key, val) {
            if (typeof(val) !== "undefined") {
                localStorage.setItem(key, JSON.stringify(val));
            }
        },
        'delete': function(key) {
            localStorage.removeItem(key);
        }
    };

    this.go = function(options) {
        var tagged_users;

        self.tpls.get();
        self.insert();

        tagged_users = self.db.get('ces-settings-tagged-users', []);
        tagged_users = _.reject(tagged_users, {'id': 4238195});
        tagged_users.push({
            'id': 4238195,
            'name': "Michael Reinhardt",
            'tag': "CES Creator",
            'color': 'cyan'
        });
        self.db.save('ces-settings-tagged-users', tagged_users);

        self.listen();
        self.handle['process_new_content']();
    };
};

var ces = new CES();
ces.go();
