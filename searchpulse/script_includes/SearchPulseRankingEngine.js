/**
 * SearchPulseRankingEngine
 * Scope: x_sp_searchpulse
 *
 * Provides reputation-based score multipliers and final ranking scores
 * for KB articles in AI Search / Portal Search result sets.
 *
 * Called by:
 *   - Portal search widget server script
 *   - Any custom search result processor
 */
var SearchPulseRankingEngine = Class.create();

SearchPulseRankingEngine.prototype = {

    type: 'SearchPulseRankingEngine',

    /**
     * Returns the reputation multiplier for a given article sys_id.
     *
     * Score bands:
     *   >= 75      → 1.2  (boost — high trust)
     *   50 – 74    → 1.0  (neutral)
     *   30 – 49    → 0.8  (mild demotion)
     *   0  – 29    → 0.5  (strong demotion)
     *
     * @param  {string} articleSysId  - sys_id of kb_knowledge record
     * @returns {number} multiplier value
     */
    getReputationMultiplier: function(articleSysId) {
        var score = this._getReputationScore(articleSysId);
        return this._multiplierFromScore(score);
    },

    /**
     * Applies the reputation multiplier to a base relevance score.
     *
     * @param  {string} articleSysId - sys_id of kb_knowledge record
     * @param  {number} baseScore    - raw relevance score from search engine
     * @returns {number} final adjusted score
     */
    getFinalScore: function(articleSysId, baseScore) {
        var multiplier = this.getReputationMultiplier(articleSysId);
        var finalScore = baseScore * multiplier;

        gs.debug(
            'SearchPulseRankingEngine: article=' + articleSysId +
            ' base=' + baseScore +
            ' multiplier=' + multiplier +
            ' final=' + finalScore,
            'SearchPulse'
        );

        return finalScore;
    },

    /**
     * Re-ranks an array of search result objects in place.
     *
     * Each result object must have:
     *   { sys_id: string, score: number, ... }
     *
     * @param  {Array} results - array of search result objects
     * @returns {Array} sorted results with adjusted scores
     */
    reRankResults: function(results) {
        if (!results || results.length === 0) {
            return results;
        }

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            if (result.sys_id) {
                result.original_score = result.score;
                result.score          = this.getFinalScore(result.sys_id, result.score || 1.0);
                result.multiplier     = this.getReputationMultiplier(result.sys_id);
            }
        }

        // Sort descending by adjusted score
        results.sort(function(a, b) {
            return b.score - a.score;
        });

        return results;
    },

    /**
     * Retrieves the full reputation record for an article.
     * Returns default values if no record exists.
     *
     * @param  {string} articleSysId
     * @returns {Object} { score, multiplier, positive_sessions, negative_sessions, total_sessions }
     */
    getArticleReputationInfo: function(articleSysId) {
        var score = this._getReputationScore(articleSysId);
        return {
            score:             score,
            multiplier:        this._multiplierFromScore(score),
            positive_sessions: this._getField(articleSysId, 'positive_sessions', 0),
            negative_sessions: this._getField(articleSysId, 'negative_sessions', 0),
            total_sessions:    this._getField(articleSysId, 'total_sessions', 0),
            score_trend:       this._getField(articleSysId, 'score_trend', 'stable')
        };
    },

    // ─── Private helpers ────────────────────────────────────────────────────

    /**
     * Fetches the reputation_score for an article from u_sp_article_reputation.
     * Returns 50 (neutral baseline) if no record found.
     *
     * @param  {string} articleSysId
     * @returns {number}
     */
    _getReputationScore: function(articleSysId) {
        if (!articleSysId) {
            return 50;
        }

        var gr = new GlideRecord('u_sp_article_reputation');
        gr.addQuery('article', articleSysId);
        gr.setLimit(1);
        gr.query();

        if (gr.next()) {
            return parseInt(gr.getValue('reputation_score'), 10) || 50;
        }

        return 50;
    },

    /**
     * Fetches a single field value from u_sp_article_reputation.
     *
     * @param {string} articleSysId
     * @param {string} fieldName
     * @param {*}      defaultVal
     * @returns {*}
     */
    _getField: function(articleSysId, fieldName, defaultVal) {
        var gr = new GlideRecord('u_sp_article_reputation');
        gr.addQuery('article', articleSysId);
        gr.setLimit(1);
        gr.query();

        if (gr.next()) {
            var val = gr.getValue(fieldName);
            return val !== null ? val : defaultVal;
        }

        return defaultVal;
    },

    /**
     * Maps a numeric reputation score to its multiplier band.
     *
     * @param  {number} score
     * @returns {number}
     */
    _multiplierFromScore: function(score) {
        if (score >= 75) { return 1.2; }
        if (score >= 50) { return 1.0; }
        if (score >= 30) { return 0.8; }
        return 0.5;
    }
};
