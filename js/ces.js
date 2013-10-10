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
                'tagged_users': self.db.get('ces-settings-tagged-users') || [],
                'ignored_users': self.db.get('ces-settings-ignored-users') || []
            }));
            $settings = $('.ces-settings');

            $els['body'].on('click', '.ces-overlay', self.handle['click_overlay_close']);
            $settings.on('click', '.close', self.handle['click_settings_close']);
            $settings.on('click', '.tabs a', self.handle['click_settings_tab']);
            $settings.on('click', '.users a', self.handle['click_settings_users_action']);

            $settings.find('.users textarea[name="ignore"]').val(self.db.get('ces-settings-ignored-users'));
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

        'close_ces_settings': function(ev) {
            var $settings = $('.ces-settings');

            $settings.off('keyup', '.users textarea[name="ignore"]');
            $settings.off('click', '.tabs a');
            $settings.off('click', '.close');
            $els['body'].off('click', '.ces-overlay');

            $('.ces-overlay').remove();
        },

        'click_overlay_close': function(ev) {
            ev.preventDefault();
            if (!$(ev.target).closest('.ces-modal').length) self.handle['close_ces_settings']();
        },

        'click_settings_close': function(ev) {
            ev.preventDefault();
            self.handle['close_ces_settings']();
        },

        'click_settings_users_action': function(ev) {
            ev.preventDefault();

            var $this = $(this),
                action = $this.attr('href').slice(1),
                $user, table, user_id, users;

            switch (action) {
                case 'del':
                    if ($this.closest('.ignore').length) {
                        table = 'ignored';
                    } else if ($this.closest('.tag').length) {
                        table = 'tagged';
                    }
                    $user = $this.closest('.user');
                    user_id = parseInt($user.find('.id').text(), 10);
                    users = self.db.get('ces-settings-' + table + '-users') || [];
                    users = _.reject(users, {'id': user_id});
                    self.db.save('ces-settings-' + table + '-users', users);
                    $user.remove();
                break;
            }
        },

        'show_user_menu': function(ev) {
            var $this = $(this),
                href = $this.attr('href'),
                isUser = _rx['user_link'].test(href),
                isClean = !$this.find('span').length,
                hasOGBadge = $this.next('.course-forum-profile-badge').length &&
                             !$this.next('.course-forum-profile-badge').hasClass('ces-profile-badge'),
                user_id, user_name, $menu;

            if (isUser && isClean && !hasOGBadge) {
                user_id = href.match(_rx['user_link'])[1];
                user_name = $.trim($this.text());

                $this.css({'position': 'relative'}).append(
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
                tag, user, tagged_users, ignored_users;

            switch (action) {
                case 'tag':
                    tag = $.trim(prompt('How would you like to tag ' + user_name + '?'));
                    tagged_users = self.db.get('ces-settings-tagged-users') || [];
                    tagged_users = _.reject(tagged_users, {'id': user_id});
                    tagged_users.push({
                        'id': user_id,
                        'name': user_name,
                        'tag': tag
                    });
                    self.db.save('ces-settings-tagged-users', tagged_users);
                    self.process['tag_users']();
                break;

                case 'ignore':
                    ignored_users = self.db.get('ces-settings-ignored-users') || [];
                    ignored_users.push({
                        'id': user_id,
                        'name': user_name
                    });
                    self.db.save('ces-settings-ignored-users', ignored_users);
                    self.process['ignore_users']();
                break;
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
            var ignoredUsers = self.db.get('ces-settings-ignored-users') || [],
                $comments = $('.course-forum-comments-container'),
                $threads = $('.course-forum-threads-listing');

            _.each(ignoredUsers, function(user) {
                $('.course-forum-post-top-container a[href$="=' + user.id + '"]').closest('.course-forum-post-container').hide();
                $comments.find('.course-forum-post-view-container a[href$="=' + user.id + '"]').closest('.course-forum-post-view-container').hide();
                $threads.find('a[href$="=' + user.id + '"]').parent(':contains("Started by")')
                        .closest('.course-forum-threads-listing-row').hide();
            });
        }, 500, {'leading': false, 'trailing': true}),

        'tag_users': _.throttle(function() {
            var taggedUsers = self.db.get('ces-settings-tagged-users') || [];

            _.each(taggedUsers, function(user) {
                $els['main'].find('a[href$="=' + user.id + '"]').each(function(i, el) {
                    var $this = $(this),
                        isClean = !$this.find('span').length;

                    if (isClean && !$(this).next('.course-forum-profile-badge').length) {
                        $this.after(_.template(self.tpls['badge'], {
                            'tag': user.tag
                        }));
                    }
                });
            });
        }, 500, {'leading': false, 'trailing': true})

    };

    this.db = {
        'get': function(key) {
            return JSON.parse(localStorage.getItem(key));
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

        tagged_users = self.db.get('ces-settings-tagged-users') || [];
        tagged_users = _.reject(tagged_users, {'id': 4238195});
        tagged_users.push({
            'id': 4238195,
            'name': "Michael Reinhardt",
            'tag': "CES Creator"
        });
        self.db.save('ces-settings-tagged-users', tagged_users);

        self.listen();
        self.handle['process_new_content']();
    };
};

var ces = new CES();
ces.go();
