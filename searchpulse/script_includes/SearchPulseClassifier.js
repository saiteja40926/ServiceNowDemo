/**
 * SearchPulseClassifier
 * Scope: x_sp_searchpulse
 *
 * Classifies a completed search session into one of six outcome types
 * and persists the result to u_sp_search_outcome.
 *
 * Called by:
 *   - POST /session/end REST endpoint
 *   - SearchPulseReputationJob (for any unclassified sessions)
 */
var SearchPulseClassifier = Class.create();

SearchPulseClassifier.prototype = {

    type: 'SearchPulseClassifier',

    /**
     * Classifies the given session GlideRecord and writes an outcome record.
     *
     * @param  {GlideRecord} sessionRecord  - A record from u_sp_search_session
     * @returns {string} outcome_type value
     */
    classifySession: function(sessionRecord) {
        if (!sessionRecord || !sessionRecord.isValidRecord()) {
            gs.logWarning('SearchPulseClassifier: invalid sessionRecord supplied', 'SearchPulse');
            return 'ambiguous';
        }

        var outcome = this._determineOutcome(sessionRecord);

        this._writeOutcomeRecord(sessionRecord, outcome);
        this._markSessionClassified(sessionRecord);

        gs.log(
            'SearchPulseClassifier: session ' + sessionRecord.getValue('session_id') +
            ' classified as ' + outcome,
            'SearchPulse'
        );

        return outcome;
    },

    /**
     * Core classification logic — evaluated in priority order.
     *
     * @param  {GlideRecord} s - session record
     * @returns {string} outcome_type
     */
    _determineOutcome: function(s) {
        var summaryFeedback    = s.getValue('summary_feedback');
        var scrolled           = s.getValue('scrolled_to_results') === '1' || s.scrolled_to_results == true;
        var clickedArticle     = s.getValue('clicked_article');
        var cameBack           = s.getValue('came_back_to_search') === '1' || s.came_back_to_search == true;
        var reformulated       = s.getValue('reformulated_query') === '1' || s.reformulated_query == true;

        var hasClick = clickedArticle && clickedArticle !== '';

        // Rule 1: User explicitly approved the AI summary — no further exploration needed
        if (summaryFeedback === 'up' && !scrolled && !hasClick) {
            return 'summary_satisfied';
        }

        // Rule 2: User scrolled through results, clicked an article, and did NOT return
        if (scrolled && hasClick && !cameBack) {
            return 'drilled_down';
        }

        // Rule 3: User clicked an article but returned to search — article did not satisfy
        if (hasClick && cameBack) {
            return 'result_failed';
        }

        // Rule 4: User had to rephrase — initial query and results were inadequate
        if (reformulated) {
            return 'full_failure';
        }

        // Rule 5: User explicitly down-voted the AI summary
        if (summaryFeedback === 'down') {
            return 'summary_rejected';
        }

        // Default: not enough signal to classify definitively
        return 'ambiguous';
    },

    /**
     * Persists an outcome record linked to the session.
     *
     * @param {GlideRecord} sessionRecord
     * @param {string} outcome
     */
    _writeOutcomeRecord: function(sessionRecord, outcome) {
        var outcomeGR = new GlideRecord('u_sp_search_outcome');
        outcomeGR.initialize();

        outcomeGR.setValue('session',         sessionRecord.getUniqueValue());
        outcomeGR.setValue('outcome_type',    outcome);
        outcomeGR.setValue('created',         new GlideDateTime().getDisplayValue());
        outcomeGR.setValue('reputation_applied', false);

        var clickedArticle = sessionRecord.getValue('clicked_article');
        if (clickedArticle && clickedArticle !== '') {
            outcomeGR.setValue('impacted_article', clickedArticle);
        }

        outcomeGR.insert();
    },

    /**
     * Marks the session so it is not re-classified in future runs.
     *
     * @param {GlideRecord} sessionRecord
     */
    _markSessionClassified: function(sessionRecord) {
        sessionRecord.setValue('outcome_classified', true);
        sessionRecord.update();
    },

    /**
     * Utility: classify all unclassified sessions in bulk.
     * Used by the nightly ReputationJob to catch any sessions
     * that were not finalized via the REST API.
     *
     * @returns {number} count of sessions classified
     */
    classifyPendingSessions: function() {
        var count = 0;
        var gr = new GlideRecord('u_sp_search_session');
        gr.addQuery('outcome_classified', false);

        // Only classify sessions older than 30 minutes to allow signals to arrive
        var cutoff = new GlideDateTime();
        cutoff.addSeconds(-1800);
        gr.addQuery('created', '<=', cutoff.getValue());

        gr.query();

        while (gr.next()) {
            this.classifySession(gr);
            count++;
        }

        gs.log('SearchPulseClassifier: bulk classified ' + count + ' pending sessions', 'SearchPulse');
        return count;
    }
};
