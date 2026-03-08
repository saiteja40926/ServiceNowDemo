/**
 * Dashboard Report Script: AI Summary Satisfaction Rate
 * Scope: x_sp_searchpulse
 *
 * Returns percentage of sessions in the last 30 days where the user
 * gave a thumbs-up to the AI-generated search summary.
 */
(function() {
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-2592000); // 30 days

    var totalGR = new GlideAggregate('u_sp_search_session');
    totalGR.addQuery('created', '>=', cutoff.getValue());
    totalGR.addQuery('summary_feedback', '!=', 'none');
    totalGR.addAggregate('COUNT');
    totalGR.query();
    var totalFeedback = totalGR.next() ? parseInt(totalGR.getAggregate('COUNT'), 10) : 0;

    if (totalFeedback === 0) {
        data.rate           = 0;
        data.total_feedback = 0;
        data.thumbs_up      = 0;
        data.thumbs_down    = 0;
        return;
    }

    var upGR = new GlideAggregate('u_sp_search_session');
    upGR.addQuery('created', '>=', cutoff.getValue());
    upGR.addQuery('summary_feedback', 'up');
    upGR.addAggregate('COUNT');
    upGR.query();
    var thumbsUp = upGR.next() ? parseInt(upGR.getAggregate('COUNT'), 10) : 0;

    var downGR = new GlideAggregate('u_sp_search_session');
    downGR.addQuery('created', '>=', cutoff.getValue());
    downGR.addQuery('summary_feedback', 'down');
    downGR.addAggregate('COUNT');
    downGR.query();
    var thumbsDown = downGR.next() ? parseInt(downGR.getAggregate('COUNT'), 10) : 0;

    data.rate           = parseFloat(((thumbsUp / totalFeedback) * 100).toFixed(1));
    data.total_feedback = totalFeedback;
    data.thumbs_up      = thumbsUp;
    data.thumbs_down    = thumbsDown;
})();
