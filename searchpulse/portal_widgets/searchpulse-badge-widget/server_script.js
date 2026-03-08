/**
 * SearchPulse Badge Widget — Server Script
 * Scope: x_sp_searchpulse
 *
 * Resolves badge metadata and reputation score for a single KB article.
 */
(function() {
    'use strict';

    var articleSysId = (options && options.article_sys_id) ? options.article_sys_id : null;

    // If no explicit sys_id option, try to derive from page record
    if (!articleSysId && $sp) {
        var pageRecord = $sp.getRecord();
        if (pageRecord && pageRecord.getTableName() === 'kb_knowledge') {
            articleSysId = pageRecord.getUniqueValue();
        }
    }

    data.badge           = { show: false };
    data.reputationScore = 50;
    data.trend           = 'stable';

    if (!articleSysId) {
        return;
    }

    try {
        var badgeService = new x_sp_searchpulse.SearchPulseBadgeService();
        data.badge       = badgeService.getBadge(articleSysId);

        var rankingEngine    = new x_sp_searchpulse.SearchPulseRankingEngine();
        var repInfo          = rankingEngine.getArticleReputationInfo(articleSysId);
        data.reputationScore = repInfo.score;
        data.trend           = repInfo.score_trend || 'stable';

    } catch (e) {
        gs.logError('SearchPulse badge widget server error: ' + e.message, 'SearchPulse');
    }

})();
