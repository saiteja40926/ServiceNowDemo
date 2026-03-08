/**
 * SearchPulseBadgeService
 * Scope: x_sp_searchpulse
 *
 * Computes trust badge metadata for KB articles based on their
 * reputation score, age, and recent update status.
 *
 * Called by:
 *   - Portal search result widget server script
 *   - Any UI component that needs badge data for a list of articles
 */
var SearchPulseBadgeService = Class.create();

SearchPulseBadgeService.prototype = {

    type: 'SearchPulseBadgeService',

    // Badge type constants
    BADGE_FREQUENTLY_HELPFUL: 'frequently_helpful',
    BADGE_UPDATED_RECENTLY:   'updated_recently',
    BADGE_MAY_BE_OUTDATED:    'may_be_outdated',
    BADGE_NONE:               'none',

    /**
     * Returns badge metadata for a single article.
     *
     * @param  {string} articleSysId - sys_id of kb_knowledge record
     * @returns {Object} badge descriptor:
     *   {
     *     type:    string,   // badge constant or 'none'
     *     label:   string,   // human-readable label
     *     color:   string,   // 'green' | 'blue' | 'amber' | null
     *     icon:    string,   // icon identifier for UI rendering
     *     show:    boolean   // convenience flag
     *   }
     */
    getBadge: function(articleSysId) {
        if (!articleSysId) {
            return this._noBadge();
        }

        var repScore     = this._getReputationScore(articleSysId);
        var articleAge   = this._getArticleAgeInDays(articleSysId);
        var daysSinceUpdate = this._getDaysSinceUpdate(articleSysId);

        // Rule 1: High reputation — most trusted signal
        if (repScore >= 75) {
            return this._badge(
                this.BADGE_FREQUENTLY_HELPFUL,
                'Frequently Helpful',
                'green',
                'check-circle'
            );
        }

        // Rule 2: Recently updated with acceptable reputation — freshness badge
        if (daysSinceUpdate !== null && daysSinceUpdate <= 30 && repScore >= 50) {
            return this._badge(
                this.BADGE_UPDATED_RECENTLY,
                'Updated Recently',
                'blue',
                'refresh'
            );
        }

        // Rule 3: Mid-low reputation AND stale article — warn users
        if (repScore >= 30 && repScore <= 49 && articleAge !== null && articleAge > 180) {
            return this._badge(
                this.BADGE_MAY_BE_OUTDATED,
                'May Be Outdated',
                'amber',
                'alert-triangle'
            );
        }

        return this._noBadge();
    },

    /**
     * Returns badge metadata for a batch of article sys_ids.
     * More efficient than calling getBadge() in a loop for large result sets
     * because it pre-fetches all reputation records in a single query.
     *
     * @param  {Array<string>} articleSysIds - array of kb_knowledge sys_ids
     * @returns {Object} map of { [sys_id]: badge descriptor }
     */
    getBadgesForArticles: function(articleSysIds) {
        if (!articleSysIds || articleSysIds.length === 0) {
            return {};
        }

        // Pre-fetch all reputation records in one query
        var repMap = this._bulkFetchReputation(articleSysIds);

        // Pre-fetch article metadata in one query
        var articleMeta = this._bulkFetchArticleMeta(articleSysIds);

        var result = {};
        for (var i = 0; i < articleSysIds.length; i++) {
            var sysId = articleSysIds[i];
            var repScore        = repMap[sysId]      ? repMap[sysId].score         : 50;
            var articleAge      = articleMeta[sysId] ? articleMeta[sysId].age      : null;
            var daysSinceUpdate = articleMeta[sysId] ? articleMeta[sysId].updated  : null;

            if (repScore >= 75) {
                result[sysId] = this._badge(this.BADGE_FREQUENTLY_HELPFUL, 'Frequently Helpful', 'green', 'check-circle');
            } else if (daysSinceUpdate !== null && daysSinceUpdate <= 30 && repScore >= 50) {
                result[sysId] = this._badge(this.BADGE_UPDATED_RECENTLY, 'Updated Recently', 'blue', 'refresh');
            } else if (repScore >= 30 && repScore <= 49 && articleAge !== null && articleAge > 180) {
                result[sysId] = this._badge(this.BADGE_MAY_BE_OUTDATED, 'May Be Outdated', 'amber', 'alert-triangle');
            } else {
                result[sysId] = this._noBadge();
            }
        }

        return result;
    },

    // ─── Private helpers ────────────────────────────────────────────────────

    _getReputationScore: function(articleSysId) {
        var gr = new GlideRecord('u_sp_article_reputation');
        gr.addQuery('article', articleSysId);
        gr.setLimit(1);
        gr.query();
        return gr.next() ? (parseInt(gr.getValue('reputation_score'), 10) || 50) : 50;
    },

    /**
     * Returns the number of days since the article was published (sys_created_on).
     * @param {string} articleSysId
     * @returns {number|null}
     */
    _getArticleAgeInDays: function(articleSysId) {
        var gr = new GlideRecord('kb_knowledge');
        if (!gr.get(articleSysId)) { return null; }

        var created  = gr.getValue('sys_created_on');
        if (!created) { return null; }

        var createdGDT = new GlideDateTime(created);
        var now        = new GlideDateTime();
        var diff       = GlideDateTime.subtract(createdGDT, now);
        return Math.abs(Math.floor(diff.getDayPart()));
    },

    /**
     * Returns the number of days since the article was last updated (sys_updated_on).
     * @param {string} articleSysId
     * @returns {number|null}
     */
    _getDaysSinceUpdate: function(articleSysId) {
        var gr = new GlideRecord('kb_knowledge');
        if (!gr.get(articleSysId)) { return null; }

        var updated = gr.getValue('sys_updated_on');
        if (!updated) { return null; }

        var updatedGDT = new GlideDateTime(updated);
        var now        = new GlideDateTime();
        var diff       = GlideDateTime.subtract(updatedGDT, now);
        return Math.abs(Math.floor(diff.getDayPart()));
    },

    /**
     * Bulk-fetches reputation scores for a list of article sys_ids.
     * @param {Array<string>} sysIds
     * @returns {Object} { [sys_id]: { score: number } }
     */
    _bulkFetchReputation: function(sysIds) {
        var map = {};
        var gr  = new GlideRecord('u_sp_article_reputation');
        gr.addQuery('article', 'IN', sysIds.join(','));
        gr.query();

        while (gr.next()) {
            var articleId = gr.getValue('article');
            map[articleId] = {
                score: parseInt(gr.getValue('reputation_score'), 10) || 50
            };
        }

        return map;
    },

    /**
     * Bulk-fetches article age and days-since-update for a list of sys_ids.
     * @param {Array<string>} sysIds
     * @returns {Object} { [sys_id]: { age: number, updated: number } }
     */
    _bulkFetchArticleMeta: function(sysIds) {
        var map = {};
        var now = new GlideDateTime();

        var gr = new GlideRecord('kb_knowledge');
        gr.addQuery('sys_id', 'IN', sysIds.join(','));
        gr.query();

        while (gr.next()) {
            var sid     = gr.getUniqueValue();
            var created = gr.getValue('sys_created_on');
            var updated = gr.getValue('sys_updated_on');

            var ageInDays      = null;
            var daysSinceUpdate = null;

            if (created) {
                var createdGDT = new GlideDateTime(created);
                var diffC      = GlideDateTime.subtract(createdGDT, now);
                ageInDays      = Math.abs(Math.floor(diffC.getDayPart()));
            }

            if (updated) {
                var updatedGDT = new GlideDateTime(updated);
                var diffU      = GlideDateTime.subtract(updatedGDT, now);
                daysSinceUpdate = Math.abs(Math.floor(diffU.getDayPart()));
            }

            map[sid] = { age: ageInDays, updated: daysSinceUpdate };
        }

        return map;
    },

    /**
     * Constructs a badge descriptor object.
     */
    _badge: function(type, label, color, icon) {
        return { type: type, label: label, color: color, icon: icon, show: true };
    },

    /**
     * Returns a no-badge descriptor.
     */
    _noBadge: function() {
        return { type: this.BADGE_NONE, label: '', color: null, icon: null, show: false };
    }
};
