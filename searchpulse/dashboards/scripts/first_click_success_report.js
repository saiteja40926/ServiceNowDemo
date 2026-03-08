/**
 * Dashboard Report Script: First-Click Success Rate
 * Scope: x_sp_searchpulse
 *
 * Returns percentage of sessions where the user clicked an article
 * and did NOT return to search (indicating the article was satisfactory).
 */
(function() {
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-2592000); // 30 days

    // Sessions where user clicked at least one article
    var clickedGR = new GlideAggregate('u_sp_search_session');
    clickedGR.addQuery('created', '>=', cutoff.getValue());
    clickedGR.addNotNullQuery('clicked_article');
    clickedGR.addAggregate('COUNT');
    clickedGR.query();
    var totalClicked = clickedGR.next() ? parseInt(clickedGR.getAggregate('COUNT'), 10) : 0;

    if (totalClicked === 0) {
        data.rate         = 0;
        data.total_clicks = 0;
        data.successes    = 0;
        return;
    }

    // Sessions where user clicked but did NOT come back
    var successGR = new GlideAggregate('u_sp_search_session');
    successGR.addQuery('created', '>=', cutoff.getValue());
    successGR.addNotNullQuery('clicked_article');
    successGR.addQuery('came_back_to_search', false);
    successGR.addAggregate('COUNT');
    successGR.query();
    var successes = successGR.next() ? parseInt(successGR.getAggregate('COUNT'), 10) : 0;

    data.rate         = parseFloat(((successes / totalClicked) * 100).toFixed(1));
    data.total_clicks = totalClicked;
    data.successes    = successes;
})();
