/**
 * SearchPulseReputationJob
 * Scope: x_sp_searchpulse
 * Type:  Scheduled Script Execution
 * Schedule: Daily at 02:00 (system time)
 *
 * Recalculates reputation scores for all KB articles that have had
 * search session activity since the last run.
 *
 * Scoring model (Wilson-inspired with signal weights):
 *   Positive signals (+points each):
 *     summary_satisfied   +3
 *     drilled_down        +2
 *     click without return (implicit in drilled_down) included above
 *
 *   Negative signals (-points each):
 *     summary_rejected    -3
 *     result_failed       -2
 *     full_failure        -1
 *     ambiguous           -0 (no change)
 *
 *   Final score = clamp(50 + net_signal_delta, 0, 100)
 *   If article has no outcomes → score stays at 50 (baseline)
 */

// ─── Job entry point ──────────────────────────────────────────────────────────

gs.log('SearchPulseReputationJob: starting nightly run', 'SearchPulse');

var jobStartTime = new GlideDateTime();
var totalProcessed = 0;
var totalUpdated   = 0;

try {
    // Step 1: Classify any sessions that were not finalized via the REST API
    _classifyPendingSessions();

    // Step 2: Recalculate reputation scores for all articles with new outcomes
    var articleSysIds = _getArticlesWithNewOutcomes();

    gs.log(
        'SearchPulseReputationJob: ' + articleSysIds.length + ' articles to score',
        'SearchPulse'
    );

    for (var i = 0; i < articleSysIds.length; i++) {
        var articleId = articleSysIds[i];
        try {
            var updated = _recalculateReputation(articleId);
            totalProcessed++;
            if (updated) { totalUpdated++; }
        } catch(articleErr) {
            gs.logError(
                'SearchPulseReputationJob: error processing article=' + articleId +
                ' err=' + articleErr.message,
                'SearchPulse'
            );
        }
    }

    // Step 3: Mark all processed outcomes as applied
    _markOutcomesApplied(articleSysIds);

    var jobEndTime = new GlideDateTime();
    var elapsed    = GlideDateTime.subtract(jobStartTime, jobEndTime).getNumericValue() / 1000;

    gs.log(
        'SearchPulseReputationJob: completed. processed=' + totalProcessed +
        ' updated=' + totalUpdated +
        ' elapsed=' + elapsed + 's',
        'SearchPulse'
    );

} catch (e) {
    gs.logError('SearchPulseReputationJob: fatal error - ' + e.message, 'SearchPulse');
}


// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Delegates to SearchPulseClassifier to handle sessions not
 * finalized via the REST endpoint (e.g., browser closed without /end).
 */
function _classifyPendingSessions() {
    var classifier = new SearchPulseClassifier();
    var count = classifier.classifyPendingSessions();
    gs.log('SearchPulseReputationJob: pre-classified ' + count + ' orphaned sessions', 'SearchPulse');
}

/**
 * Returns array of distinct article sys_ids that have un-applied outcomes.
 * @returns {Array<string>}
 */
function _getArticlesWithNewOutcomes() {
    var sysIds = [];
    var seen   = {};

    var gr = new GlideRecord('u_sp_search_outcome');
    gr.addQuery('reputation_applied', false);
    gr.addNotNullQuery('impacted_article');
    gr.query();

    while (gr.next()) {
        var artId = gr.getValue('impacted_article');
        if (artId && !seen[artId]) {
            seen[artId] = true;
            sysIds.push(artId);
        }
    }

    return sysIds;
}

/**
 * Recalculates the reputation score for a single article.
 *
 * @param {string} articleSysId
 * @returns {boolean} true if record was updated
 */
function _recalculateReputation(articleSysId) {
    // Fetch all un-applied outcomes for this article
    var outcomes = _getOutcomesForArticle(articleSysId);

    if (outcomes.length === 0) { return false; }

    var positiveDelta = 0;
    var negativeDelta = 0;
    var posCount      = 0;
    var negCount      = 0;

    var POSITIVE_WEIGHT = { 'summary_satisfied': 3, 'drilled_down': 2 };
    var NEGATIVE_WEIGHT = { 'summary_rejected': 3, 'result_failed': 2, 'full_failure': 1 };

    for (var i = 0; i < outcomes.length; i++) {
        var ot = outcomes[i];
        if (POSITIVE_WEIGHT[ot]) {
            positiveDelta += POSITIVE_WEIGHT[ot];
            posCount++;
        } else if (NEGATIVE_WEIGHT[ot]) {
            negativeDelta += NEGATIVE_WEIGHT[ot];
            negCount++;
        }
    }

    var netDelta = positiveDelta - negativeDelta;

    // Fetch or create reputation record
    var repGR    = new GlideRecord('u_sp_article_reputation');
    var isNew    = false;

    repGR.addQuery('article', articleSysId);
    repGR.setLimit(1);
    repGR.query();

    if (!repGR.next()) {
        repGR = new GlideRecord('u_sp_article_reputation');
        repGR.initialize();
        repGR.setValue('article',           articleSysId);
        repGR.setValue('reputation_score',  50);
        repGR.setValue('positive_sessions', 0);
        repGR.setValue('negative_sessions', 0);
        repGR.setValue('total_sessions',    0);
        isNew = true;
    }

    var currentScore      = parseInt(repGR.getValue('reputation_score'), 10) || 50;
    var prevPositive      = parseInt(repGR.getValue('positive_sessions'), 10) || 0;
    var prevNegative      = parseInt(repGR.getValue('negative_sessions'), 10) || 0;
    var prevTotal         = parseInt(repGR.getValue('total_sessions'), 10)    || 0;
    var previousScore     = currentScore;

    var newScore          = Math.min(100, Math.max(0, currentScore + netDelta));
    var newPositive       = prevPositive + posCount;
    var newNegative       = prevNegative + negCount;
    var newTotal          = prevTotal    + outcomes.length;

    // First-click success rate = successful clicks / total click-sessions
    var successRate = (newTotal > 0)
        ? parseFloat(((newPositive / newTotal) * 100).toFixed(2))
        : 0.0;

    // Score trend
    var trend = 'stable';
    if (newScore > previousScore + 2)       { trend = 'rising'; }
    else if (newScore < previousScore - 2)  { trend = 'falling'; }

    repGR.setValue('previous_score',           previousScore);
    repGR.setValue('reputation_score',         newScore);
    repGR.setValue('positive_sessions',        newPositive);
    repGR.setValue('negative_sessions',        newNegative);
    repGR.setValue('total_sessions',           newTotal);
    repGR.setValue('last_calculated',          new GlideDateTime().getValue());
    repGR.setValue('score_trend',              trend);
    repGR.setValue('first_click_success_rate', successRate);

    if (isNew) { repGR.insert(); } else { repGR.update(); }

    gs.debug(
        'SearchPulseReputationJob: article=' + articleSysId +
        ' score ' + previousScore + ' -> ' + newScore +
        ' trend=' + trend,
        'SearchPulse'
    );

    return true;
}

/**
 * Fetches outcome_type values for an article from un-applied outcome records.
 * @param {string} articleSysId
 * @returns {Array<string>}
 */
function _getOutcomesForArticle(articleSysId) {
    var types = [];
    var gr    = new GlideRecord('u_sp_search_outcome');
    gr.addQuery('impacted_article', articleSysId);
    gr.addQuery('reputation_applied', false);
    gr.query();

    while (gr.next()) {
        types.push(gr.getValue('outcome_type'));
    }

    return types;
}

/**
 * Marks all outcomes for the processed articles as applied so they
 * are not double-counted on the next nightly run.
 *
 * @param {Array<string>} articleSysIds
 */
function _markOutcomesApplied(articleSysIds) {
    if (!articleSysIds || articleSysIds.length === 0) { return; }

    var gr = new GlideRecord('u_sp_search_outcome');
    gr.addQuery('impacted_article', 'IN', articleSysIds.join(','));
    gr.addQuery('reputation_applied', false);
    gr.query();

    var count = 0;
    while (gr.next()) {
        gr.setValue('reputation_applied', true);
        gr.update();
        count++;
    }

    gs.log('SearchPulseReputationJob: marked ' + count + ' outcomes as applied', 'SearchPulse');
}
