/**
 * SearchPulse Search Widget — Client Controller
 * Scope: x_sp_searchpulse
 *
 * Responsibilities:
 *  1. Manage search UX state (input, loading, results, errors)
 *  2. Create/manage a SearchPulse session via navigator.sendBeacon
 *  3. Emit signals: scroll, click, thumbs feedback, reformulation, return
 *  4. Apply re-ranked results and badge metadata from server
 */
function SearchPulseWidgetCtrl($scope, $rootScope, $timeout, $sce, spUtil) {
    'use strict';

    var c = this;

    // ── State ────────────────────────────────────────────────────────────────
    c.searchQuery    = '';
    c.lastQuery      = '';
    c.results        = [];
    c.aiSummary      = null;
    c.loading        = false;
    c.searched       = false;
    c.error          = false;
    c.summaryFeedback = null;   // null | 'up' | 'down'
    c.debugMode      = false;   // set to true in dev to show score debug

    var sessionId       = null;
    var sessionStarted  = false;
    var scrollTracked   = false;
    var sessionStartMs  = null;
    var API_BASE        = '/api/x_sp_searchpulse';

    // ── Init ─────────────────────────────────────────────────────────────────
    c.$onInit = function() {
        // Detect if user has returned to this page from an article
        var returnFlag = sessionStorage.getItem('sp_searchpulse_return');
        if (returnFlag) {
            var prevSessionId = sessionStorage.getItem('sp_searchpulse_session_id');
            if (prevSessionId) {
                sessionId = prevSessionId;
                _sendSignal('return_to_search', null);
            }
            sessionStorage.removeItem('sp_searchpulse_return');
        }

        _attachScrollListener();
    };

    // ── Search submission ────────────────────────────────────────────────────
    c.submitSearch = function() {
        var query = (c.searchQuery || '').trim();
        if (!query || query.length < 2) { return; }

        var isReformulation = sessionStarted && query !== c.lastQuery;

        if (isReformulation) {
            _sendSignal('query_reformulation', null);
        }

        c.lastQuery      = query;
        c.loading        = true;
        c.error          = false;
        c.searched       = true;
        c.results        = [];
        c.aiSummary      = null;
        c.summaryFeedback = null;
        scrollTracked    = false;

        // Start or refresh session
        _startSession(query, isReformulation);

        // Delegate actual search to server script via $scope.server.update()
        $scope.server.update().then(function(resp) {
            c.loading = false;
            if (resp.data.results) {
                c.results   = resp.data.results;
                c.aiSummary = resp.data.aiSummary
                    ? $sce.trustAsHtml(resp.data.aiSummary)
                    : null;
            }
        }, function() {
            c.loading = false;
            c.error   = true;
        });
    };

    // ── Keyup handler — submit on Enter ─────────────────────────────────────
    c.onQueryKeyUp = function($event) {
        if ($event.keyCode === 13) {
            c.submitSearch();
        }
    };

    // ── Result click ─────────────────────────────────────────────────────────
    c.onResultClick = function(result) {
        if (!result || !result.sys_id) { return; }

        _sendSignal('result_click', result.sys_id);

        // Set return-detection flag before navigation
        sessionStorage.setItem('sp_searchpulse_return',     '1');
        sessionStorage.setItem('sp_searchpulse_session_id', sessionId || '');
    };

    // ── Summary feedback ─────────────────────────────────────────────────────
    c.sendSummaryFeedback = function(vote) {
        if (c.summaryFeedback !== null) { return; }
        c.summaryFeedback = vote;
        _sendSignal(vote === 'up' ? 'summary_thumbs_up' : 'summary_thumbs_down', null);
    };

    // ── Badge icon CSS class helper ──────────────────────────────────────────
    c.getBadgeIconClass = function(iconName) {
        var iconMap = {
            'check-circle':    'fa-check-circle',
            'refresh':         'fa-refresh',
            'alert-triangle':  'fa-exclamation-triangle'
        };
        return iconMap[iconName] || 'fa-tag';
    };

    // ── Session lifecycle ────────────────────────────────────────────────────

    function _startSession(query, isReformulation) {
        if (!isReformulation) {
            // New session
            sessionId      = _generateSessionId();
            sessionStarted = true;
            sessionStartMs = Date.now();

            var payload = JSON.stringify({
                session_id:  sessionId,
                query:       query,
                user_sys_id: window.NOW && NOW.user ? NOW.user.sys_id : null
            });

            _beacon(API_BASE + '/session/start', payload);

            // End previous session cleanly on page unload
            window.addEventListener('beforeunload', _endSession);
        }
    }

    function _endSession() {
        if (!sessionId) { return; }

        var durationSeconds = sessionStartMs
            ? Math.floor((Date.now() - sessionStartMs) / 1000)
            : 0;

        var payload = JSON.stringify({
            session_id:       sessionId,
            duration_seconds: durationSeconds
        });

        _beacon(API_BASE + '/session/end', payload);
        sessionId      = null;
        sessionStarted = false;
    }

    // ── Signal dispatch ──────────────────────────────────────────────────────

    function _sendSignal(signalType, articleSysId) {
        if (!sessionId) { return; }

        var payload = { session_id: sessionId, signal_type: signalType };
        if (articleSysId) { payload.article = articleSysId; }

        _beacon(API_BASE + '/session/signal', JSON.stringify(payload));
    }

    // ── Scroll detection ─────────────────────────────────────────────────────

    function _attachScrollListener() {
        var resultsSection = null;

        function _onScroll() {
            if (scrollTracked || !sessionId) { return; }

            if (!resultsSection) {
                resultsSection = document.getElementById('sp-results-section');
            }

            if (!resultsSection) { return; }

            var rect = resultsSection.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                scrollTracked = true;
                _sendSignal('scroll_to_results', null);
                window.removeEventListener('scroll', _onScroll);
            }
        }

        window.addEventListener('scroll', _onScroll, { passive: true });
    }

    // ── Beacon utility ───────────────────────────────────────────────────────

    function _beacon(url, jsonPayload) {
        try {
            var blob = new Blob([jsonPayload], { type: 'application/json' });
            var sent = navigator.sendBeacon(url, blob);
            if (!sent) {
                // sendBeacon queue full — fall back to synchronous XHR
                _xhrFallback(url, jsonPayload);
            }
        } catch (e) {
            _xhrFallback(url, jsonPayload);
        }
    }

    function _xhrFallback(url, jsonPayload) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('X-UserToken', window.g_ck || '');
            xhr.send(jsonPayload);
        } catch (e) {
            // Silent — signal loss is acceptable
        }
    }

    // ── Session ID generation ─────────────────────────────────────────────────

    function _generateSessionId() {
        var arr = new Uint8Array(16);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(arr);
        } else {
            for (var i = 0; i < 16; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
        }
        return Array.from(arr).map(function(b) {
            return ('00' + b.toString(16)).slice(-2);
        }).join('');
    }
}
