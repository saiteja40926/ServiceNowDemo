/**
 * SearchPulse Search Widget — Server Script
 * Scope: x_sp_searchpulse
 *
 * Executes KB search, applies reputation-based re-ranking,
 * and enriches results with badge metadata.
 */
(function() {
    'use strict';

    var query      = input && input.searchQuery ? input.searchQuery.trim() : '';
    var maxResults = (options && options.max_results) ? parseInt(options.max_results, 10) : 10;
    var kbCategory = (options && options.kb_category) ? options.kb_category : null;

    data.results  = [];
    data.aiSummary = null;

    if (!query || query.length < 2) {
        return;
    }

    try {
        // ── 1. Query KB articles ──────────────────────────────────────────
        var rawResults = _searchKnowledge(query, maxResults, kbCategory);

        if (!rawResults || rawResults.length === 0) {
            data.results = [];
            return;
        }

        // ── 2. Re-rank using SearchPulseRankingEngine ─────────────────────
        var rankingEngine = new x_sp_searchpulse.SearchPulseRankingEngine();
        var reRanked      = rankingEngine.reRankResults(rawResults);

        // ── 3. Enrich with badge metadata ─────────────────────────────────
        var sysIds       = reRanked.map(function(r) { return r.sys_id; });
        var badgeService = new x_sp_searchpulse.SearchPulseBadgeService();
        var badgeMap     = badgeService.getBadgesForArticles(sysIds);

        for (var i = 0; i < reRanked.length; i++) {
            reRanked[i].badge = badgeMap[reRanked[i].sys_id] || { show: false };
        }

        data.results   = reRanked;
        data.aiSummary = _generateAISummaryStub(query, reRanked);

    } catch (e) {
        gs.logError('SearchPulse widget server error: ' + e.message, 'SearchPulse');
        data.results  = [];
        data.error    = true;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Queries kb_knowledge with text search.
     * Falls back to CONTAINS query for instances without AI Search.
     *
     * @param {string} q          - search query
     * @param {number} limit      - max results
     * @param {string} categoryId - optional KB category sys_id filter
     * @returns {Array<Object>}
     */
    function _searchKnowledge(q, limit, categoryId) {
        var results = [];
        var gr      = new GlideRecord('kb_knowledge');

        gr.addActiveQuery();
        gr.addQuery('workflow_state', 'published');

        if (categoryId) {
            gr.addQuery('kb_category', categoryId);
        }

        // Text search across title and text fields
        var qc = gr.addQuery('short_description', 'CONTAINS', q);
        qc.addOrCondition('text', 'CONTAINS', q);

        gr.setLimit(limit * 2); // fetch extra before re-ranking trims
        gr.orderByDesc('sys_updated_on');
        gr.query();

        var baseScore = limit * 2; // decreasing base relevance for positional scoring

        while (gr.next()) {
            var sysId = gr.getUniqueValue();

            // Title match scores higher than body match
            var titleMatch = (gr.getValue('short_description') || '').toLowerCase().indexOf(q.toLowerCase()) !== -1;
            var score      = titleMatch ? baseScore * 1.5 : baseScore;
            baseScore--;

            results.push({
                sys_id:          sysId,
                title:           gr.getDisplayValue('short_description'),
                snippet:         _buildSnippet(gr.getValue('text'), q),
                url:             '/kb_view.do?sysparm_article=' + gr.getValue('number'),
                category:        gr.getDisplayValue('kb_category'),
                updated:         _relativeDate(gr.getValue('sys_updated_on')),
                score:           score,
                original_score:  score,
                multiplier:      1.0
            });
        }

        return results;
    }

    /**
     * Extracts a short text snippet with the query term in context.
     *
     * @param {string} fullText
     * @param {string} q
     * @returns {string}
     */
    function _buildSnippet(fullText, q) {
        if (!fullText) { return ''; }

        // Strip HTML tags
        var plain = fullText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        var idx = plain.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) {
            return plain.substring(0, 160) + (plain.length > 160 ? '...' : '');
        }

        var start   = Math.max(0, idx - 60);
        var end     = Math.min(plain.length, idx + q.length + 100);
        var snippet = (start > 0 ? '...' : '') + plain.substring(start, end) + (end < plain.length ? '...' : '');

        // Bold the matched term
        var regex = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        snippet = snippet.replace(regex, '<strong>$1</strong>');

        return snippet;
    }

    /**
     * Converts a GlideDateTime string to a human-friendly relative label.
     *
     * @param {string} gdtValue
     * @returns {string}
     */
    function _relativeDate(gdtValue) {
        if (!gdtValue) { return ''; }

        var then = new GlideDateTime(gdtValue);
        var now  = new GlideDateTime();
        var diff = GlideDateTime.subtract(then, now);
        var days = Math.abs(Math.floor(diff.getDayPart()));

        if (days === 0)  { return 'today'; }
        if (days === 1)  { return 'yesterday'; }
        if (days <= 7)   { return days + ' days ago'; }
        if (days <= 30)  { return Math.floor(days / 7) + ' weeks ago'; }
        if (days <= 365) { return Math.floor(days / 30) + ' months ago'; }
        return Math.floor(days / 365) + ' years ago';
    }

    /**
     * Builds a simple AI summary stub from the top results.
     * In production, replace this with an AISummarizationAPI call.
     *
     * @param {string}  q
     * @param {Array}   results
     * @returns {string|null}
     */
    function _generateAISummaryStub(q, results) {
        if (!results || results.length === 0) { return null; }

        var topTitles = results.slice(0, 3).map(function(r) {
            return '<em>' + r.title + '</em>';
        }).join(', ');

        return 'Based on your search for <strong>' + q + '</strong>, ' +
               'the most relevant articles are: ' + topTitles + '. ' +
               'Click an article below to learn more.';
    }

})();
